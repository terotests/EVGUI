/**
 * Hot reload, end to end: a server with HOT=1, the demo page in Chromium, a
 * saved .rgr, and the page reloading on the same demo. Then a save that does
 * not compile, and the compiler's message in the page's error card. The file
 * is put back as it was at the end, whatever happened.
 *
 *   npm run evg:hot:check     (after ui:demo:build and demo/build.mjs)
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { demosUsing } from "./hot.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const PORT = Number(process.env.PORT || 8231);
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? "  " + detail : ""}`);
}

// The import graph: a controller under src/ reaches the demo that uses it.
const ctl = path.join(ROOT, "gallery/evgui/src/RatingCtl.rgr");
check("hot:graph:src-to-demo", demosUsing(ROOT, ctl).includes("RatingDemo"), demosUsing(ROOT, ctl).join(","));
const demoFile = path.join(ROOT, "gallery/evgui/demo/RatingDemo.rgr");
check("hot:graph:demo-itself", JSON.stringify(demosUsing(ROOT, demoFile)) === '["RatingDemo"]');

const original = fs.readFileSync(demoFile, "utf8");
const server = spawn(process.execPath, [path.join(HERE, "serve.mjs")], {
  cwd: ROOT,
  env: { ...process.env, HOT: "1", PORT: String(PORT) },
  stdio: ["ignore", "pipe", "inherit"],
});
let log = "";
server.stdout.on("data", (d) => (log += d));
const until = async (fn, ms) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

const browser = await chromium.launch();
try {
  await until(() => log.includes("Ctrl+C"), 10000);
  const page = await browser.newPage();
  const consoleLines = [];
  page.on("console", (m) => consoleLines.push(m.text()));
  await page.goto(`http://127.0.0.1:${PORT}/gallery/evgui/demo/index.html?demo=rating`);
  await page.waitForFunction(() => document.readyState === "complete");
  await page.evaluate(() => (window.__hotMark = 1));

  // A save that compiles: the page reloads, and is still on the rating demo.
  fs.writeFileSync(demoFile, original + "\n; hot-check\n");
  const reloaded = await until(async () => {
    try { return (await page.evaluate(() => window.__hotMark)) === undefined; } catch { return false; }
  }, 120000);
  check("hot:reload:after-save", reloaded, reloaded ? "" : log.slice(-800));
  if (reloaded) {
    await page.waitForFunction(() => document.readyState === "complete");
    check("hot:reload:same-demo", new URL(page.url()).searchParams.get("demo") === "rating", page.url());
    check("hot:reload:logged", consoleLines.some((l) => /^hot: RatingDemo rebuilt in \d+ ms/.test(l)));
  }

  // A save that does not compile: no reload, and the card names the line.
  await page.evaluate(() => (window.__hotMark = 2));
  fs.writeFileSync(demoFile, original + "\nclass HotCheckBroken {\n  sfn f:void () {\n    def a:int \"x\"\n  }\n}\n");
  const shown = await until(async () => {
    const t = await page.evaluate(() => {
      const e = document.getElementById("err");
      return e && !e.hidden ? document.getElementById("errstack").textContent : "";
    });
    return t.includes("RatingDemo.rgr:");
  }, 120000);
  check("hot:error:shown", shown, shown ? "" : log.slice(-800));
  check("hot:error:no-reload", (await page.evaluate(() => window.__hotMark)) === 2);
  const msg = await page.evaluate(() => document.getElementById("errmsg").textContent);
  check("hot:error:names-demo", msg.includes("RatingDemo did not compile"), msg);
} finally {
  fs.writeFileSync(demoFile, original);
  await browser.close();
  server.kill();
}

// The source map reaches the .rgr. Only when the page was built with them.
const mapFile = path.join(ROOT, "gallery/evgui/demo/bundle.js.map");
if (fs.existsSync(mapFile)) {
  const map = JSON.parse(fs.readFileSync(mapFile, "utf8"));
  check("hot:sourcemap:rgr-sources", map.sources.some((s) => s.endsWith("RatingCtl.rgr")));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

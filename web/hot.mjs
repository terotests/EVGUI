/**
 * Hot reload for the demo page: a saved .rgr recompiles the demos that use it
 * and the open pages reload on the same demo.
 *
 * `serve.mjs` loads this when HOT=1 (`npm run evg:dev` sets it). It watches
 * gallery/evgui/demo and gallery/evgui/src. A change to a .rgr file finds the
 * demos that import it, directly or through other files, recompiles only
 * those with Ranger's -sourcemap, rebundles the page (demo/build.mjs) and
 * sends one event on /evg/code/events:
 *
 *   { ok: true,  demos: ["RatingDemo"], ms: 2900 }   -> the page reloads
 *   { ok: false, file: "RatingCtl.rgr", error: "..." } -> the page shows the
 *                                                      compiler's message
 *
 * The page keeps the selected demo (it is in the URL) and the theme. What a
 * controller held in its fields is not carried over: the compiled class can
 * change shape between two saves, so the page starts from the demo's initial
 * state.
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const IMPORT = /^\s*Import\s+"([^"]+)"/gm;

// The demos the page bundles, read out of demo/build.mjs so there is one list.
export function demoNames(root) {
  const text = fs.readFileSync(path.join(root, "gallery/evgui/demo/build.mjs"), "utf8");
  const names = [];
  for (const m of text.matchAll(/^(?:const DEMOS = \[|DEMOS\.push\()(.*)$/gm)) {
    for (const q of m[1].matchAll(/"([A-Za-z0-9_]+)"/g)) names.push(q[1]);
  }
  return names;
}

// Every .rgr a file imports, transitively, as absolute paths. pkg: imports
// (the EVG library) are outside what this watches, so they are not followed.
function importsOf(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  let text;
  try { text = fs.readFileSync(file, "utf8"); } catch { return seen; }
  for (const m of text.matchAll(IMPORT)) {
    if (m[1].startsWith("pkg:")) continue;
    importsOf(path.resolve(path.dirname(file), m[1]), seen);
  }
  return seen;
}

export function demosUsing(root, changed) {
  const demoDir = path.join(root, "gallery/evgui/demo");
  return demoNames(root).filter((n) => importsOf(path.join(demoDir, n + ".rgr")).has(changed));
}

function run(cmd, args, opts) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => resolve({ code, out }));
  });
}

export function compileDemo(root, name) {
  return run(process.execPath, [
    "dist/rgrc.js", "-es6", "-nodemodule", "-sourcemap",
    `./gallery/evgui/demo/${name}.rgr`, "-d=./gallery/evgui/bin", `-o=${name}.cjs`,
  ], { cwd: root });
}

export function bundlePage(root) {
  return run(process.execPath, ["gallery/evgui/demo/build.mjs"], {
    cwd: root,
    env: { ...process.env, EVGUI_SOURCEMAP: "1" },
  });
}

// The part of a compiler log a reader wants: from the first "file:line:col".
export function compilerMessage(out) {
  const clean = out.replace(/\x1b\[[0-9;]*m/g, "");
  const at = clean.search(/\S+\.rgr:\d+:\d+/);
  const text = at >= 0 ? clean.slice(at) : clean;
  return text.length > 6000 ? text.slice(0, 6000) + "\n…" : text;
}

export function startHot({ root, send, log = console.log }) {
  const dirs = ["gallery/evgui/demo", "gallery/evgui/src"].map((d) => path.join(root, d));
  const pending = new Set();
  let timer = null;
  let busy = false;

  async function rebuild() {
    if (busy) return;
    busy = true;
    const files = [...pending];
    pending.clear();
    const t0 = Date.now();
    const demos = [...new Set(files.flatMap((f) => demosUsing(root, f)))];
    const names = files.map((f) => path.basename(f)).join(", ");
    if (!demos.length) {
      log(`  hot: ${names} is not used by a demo on the page`);
    } else {
      log(`  hot: ${names} → ${demos.join(", ")}`);
      let failed = null;
      for (const d of demos) {
        const r = await compileDemo(root, d);
        if (r.code !== 0) { failed = { demo: d, out: r.out }; break; }
      }
      if (failed) {
        const error = compilerMessage(failed.out);
        log(`  hot: ${failed.demo} did not compile\n${error.split("\n").slice(0, 12).join("\n")}`);
        send({ ok: false, file: names, demo: failed.demo, error });
      } else {
        const b = await bundlePage(root);
        if (b.code !== 0) {
          log(`  hot: bundling failed\n${b.out}`);
          send({ ok: false, file: names, error: b.out.slice(-6000) });
        } else {
          const ms = Date.now() - t0;
          log(`  hot: reloaded in ${ms} ms`);
          send({ ok: true, demos, ms });
        }
      }
    }
    busy = false;
    if (pending.size) rebuild();
  }

  for (const dir of dirs) {
    try {
      fs.watch(dir, (_kind, name) => {
        if (!name || !name.endsWith(".rgr")) return;
        pending.add(path.join(dir, name));
        // One save fires two or three events; wait for the last.
        clearTimeout(timer);
        timer = setTimeout(rebuild, 80);
      });
    } catch (e) {
      log(`  (no hot watch on ${dir}: ${e.message})`);
    }
  }
}

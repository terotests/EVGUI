#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Styles panel, on the real page.
//
//   npm run ui:styles:check        (node scripts/run.mjs ui:styles:check)
//
// What it claims, and so what this checks:
//
//   * THE GUIDE LISTS WHAT THE DEMO USES. For Combobox, Accordion, Rating and
//     Drawer: every class in the demo's stylesheet and every class on its live
//     tree is in the guide, and no class of another demo is.
//   * AN EDIT REACHES THE PIXELS. A colour typed into the editor changes what
//     the WebGL canvas holds — read back with `gl.readPixels`, not off the
//     display list or the element.
//   * A BAD PROPERTY IS FLAGGED, by the engine, on its line.
//   * RESET puts the original pixels back, exactly.
//   * AN EDIT SURVIVES A RELOAD (localStorage), with the "modified" badge.
//   * THE KEYBOARD opens it, Escape closes it, the focus goes back.
//   * THE LAYOUT HOLDS: opening the panel moves no canvas pixel and no mirror
//     node, and the page grows no horizontal scrollbar, on a desktop and on a
//     phone.
//
// STYLES_SHOTS=<dir> also saves the screenshots the feature was reviewed with.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { requireHostTool, findChromium } from "../../ui/conformance/dom-adapter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const SHOTS = process.env.STYLES_SHOTS || "";

if (!fs.existsSync(path.join(HERE, "bundle.js"))) {
  console.error("bundle.js missing — run `node gallery/evgui/demo/build.mjs` first");
  process.exit(3);
}

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".woff2": "font/woff2",
};
const server = createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.join(ROOT, rel.slice(1));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" })
    .end(fs.readFileSync(file));
});
// Port 0: the system picks a free one, so this never collides with a server
// somebody else left running.
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const URL0 = `http://127.0.0.1:${port}/gallery/evgui/demo/index.html`;

const { chromium } = requireHostTool("playwright-core");
const browser = await chromium.launch({ executablePath: findChromium() });

let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) console.log("  PASS " + name);
  else { failed++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
};

async function openPage(context, demo) {
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message.split("\n")[0]}`));
  page.on("console", (m) => { if (m.type() === "error") problems.push(`console.error: ${m.text().split("\n")[0]}`); });
  await page.goto(`${URL0}?demo=${demo}`, { waitUntil: "networkidle" });
  await page.waitForFunction("window.__styles && document.querySelector('#stage canvas') && document.querySelector('#stage canvas').width > 100", null, { timeout: 20000 });
  await page.waitForTimeout(300);
  return { page, problems };
}

// Every pixel of the demo's canvas, straight out of the WebGL context (made
// with preserveDrawingBuffer, see main.js `paint`): a hash, and how many
// pixels are close to `rgb`.
const readCanvas = (page, rgb) => page.evaluate((want) => {
  const c = document.querySelector("#stage canvas");
  const gl = c.getContext("webgl2");
  const buf = new Uint8Array(c.width * c.height * 4);
  gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let hash = 2166136261 >>> 0;
  let near = 0;
  for (let i = 0; i < buf.length; i += 4) {
    hash = Math.imul(hash ^ buf[i] ^ (buf[i + 1] << 8) ^ (buf[i + 2] << 16), 16777619) >>> 0;
    if (want && Math.abs(buf[i] - want[0]) < 24 && Math.abs(buf[i + 1] - want[1]) < 24 && Math.abs(buf[i + 2] - want[2]) < 24) near++;
  }
  return { hash, near, w: c.width, h: c.height };
}, rgb || null);

// Settled: no pending debounce, a frame or two for the transition clock.
const settle = (page, ms = 700) => page.waitForTimeout(ms);

// The classes a stylesheet names, read from the FILE here in Node — a second
// reading, independent of the panel's.
const cssClasses = (file) => {
  const text = fs.readFileSync(path.join(HERE, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Set();
  for (const m of text.matchAll(/([^{}]+)\{/g)) {
    const head = m[1].trim();
    if (head.startsWith("@")) continue;
    for (const sel of head.split(",")) {
      const last = sel.trim().split(/\s+/).pop();
      const c = last.match(/^\.([A-Za-z0-9_-]+)/);
      if (c) out.add(c[1]);
    }
  }
  return out;
};

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"]);

// --- 1. the inventory ----------------------------------------------------------------------
console.log("--- the guide lists what each demo uses, and nothing else ---");
const INV = {
  combobox: {
    file: "combobox.css",
    must: ["ui-combobox-group", "ui-combobox-chip", "ui-combobox-chip-remove", "ui-combobox-trigger", "ui-combobox-content",
      "ui-combobox-item", "ui-combobox-item-active", "ui-combobox-item-disabled", "ui-combobox-chip-focused", "ui-input"],
    states: ["ui-combobox-item-active", "ui-combobox-chip-focused", "ui-combobox-item-disabled"],
    foreign: /^(cal-|ui-calendar|acc-|ui-accordion|rt-|ui-rating|drw-|ui-drawer)/,
  },
  accordion: { file: "accordion.css", must: [], states: [], foreign: /^(ui-combobox|cb-|cal-|ui-calendar|ui-rating|drw-)/ },
  rating: { file: "rating.css", must: [], states: [], foreign: /^(ui-combobox|cb-|cal-|ui-accordion|drw-)/ },
  drawer: { file: "drawer.css", must: [], states: [], foreign: /^(ui-combobox|cb-|cal-|ui-accordion|ui-rating)/ },
};
{
  const { page, problems } = await openPage(context, "combobox");
  for (const [demo, spec] of Object.entries(INV)) {
    await page.click(`#demos input[value="${demo}"]`);
    await settle(page, 300);
    const inv = await page.evaluate((d) => window.__styles.inventory(d), demo);
    const names = new Set(inv.map((e) => e.cls));
    // The live tree, walked here independently of the panel.
    const live = await page.evaluate(() => {
      const out = new Set();
      const walk = (el) => {
        if (!el) return;
        for (const t of String(el.className || "").split(/\s+/)) if (t) out.add(t);
        for (const k of el.children || []) walk(k);
      };
      walk(window.__styles.root());
      return [...out];
    });
    const fromCss = cssClasses(spec.file);
    const missCss = [...fromCss].filter((c) => !names.has(c));
    const missLive = live.filter((c) => !names.has(c));
    const missMust = spec.must.filter((c) => !names.has(c));
    const foreign = [...names].filter((c) => spec.foreign.test(c));
    const extra = [...names].filter((c) => !fromCss.has(c) && !live.includes(c));
    ok(`${demo}: every class in ${spec.file} is listed (${fromCss.size})`, missCss.length === 0, missCss.join(" "));
    ok(`${demo}: every class on the live tree is listed (${live.length})`, live.length > 0 && missLive.length === 0, missLive.join(" ") || "empty tree");
    ok(`${demo}: nothing listed that the demo does not use`, extra.length === 0 && foreign.length === 0, [...extra, ...foreign].join(" "));
    if (missMust.length || spec.must.length) ok(`${demo}: the component parts are there`, missMust.length === 0, missMust.join(" "));
    for (const s of spec.states) {
      const e = inv.find((x) => x.cls === s);
      ok(`${demo}: .${s} is marked a state, with when it applies`, e && e.state && e.when && e.base, JSON.stringify(e && { state: e.state, base: e.base }));
    }
  }
  // The guide on screen, for the combobox.
  await page.click(`#demos input[value="combobox"]`);
  await settle(page, 300);
  await page.click("#stylesbtn");
  await page.waitForSelector("#stylespanel:not([hidden])");
  const sels = await page.evaluate(() => window.__styles.guideSelectors());
  ok("the guide shows .ui-combobox-chip and .ui-combobox-item-active", sels.includes(".ui-combobox-chip") && sels.includes(".ui-combobox-item-active"), sels.slice(0, 12).join(" "));
  ok("the guide shows no calendar class", !sels.some((s) => /cal|calendar/.test(s)), sels.filter((s) => /cal/.test(s)).join(" "));
  const chipCard = await page.evaluate(() => {
    const c = document.querySelector('#sgbody [data-selector=".ui-combobox-chip"]');
    return c ? { text: c.textContent, dts: [...c.querySelectorAll(".sg-props dt")].map((d) => d.textContent), more: c.querySelector(".sg-more") ? c.querySelector(".sg-more").textContent : "" } : null;
  });
  ok("a selector shows the properties it sets now, with values", chipCard && chipCard.dts.includes("background-color") && /#[0-9a-f]{6}/i.test(chipCard.text), JSON.stringify(chipCard && chipCard.dts));
  ok("…and what else takes effect on that kind of element", chipCard && /Also takes effect here/.test(chipCard.more) && /shadow-color/.test(chipCard.more), chipCard && chipCard.more.slice(0, 120));
  const stateCard = await page.evaluate(() => {
    const c = document.querySelector('#sgbody [data-selector=".ui-combobox-item-active"]');
    return c ? c.textContent : "";
  });
  ok("a state class says it is one, and when it applies", /state/.test(stateCard) && /while it is the active/.test(stateCard), stateCard.slice(0, 160));
  const ref = await page.evaluate(() => {
    const d = document.getElementById("sgref");
    d.open = true;
    return d.textContent;
  });
  ok("the EVG CSS reference covers properties, units, gradients, shadows, transitions, pseudo-classes, @media and the limits",
    ["Properties (", "Units", "linear-gradient", "shadow-radius", "transition", ":hover", "@media", "all four sides", "not reset"].every((w) => ref.includes(w)),
    ["Properties (", "Units", "linear-gradient", "shadow-radius", "transition", ":hover", "@media", "all four sides", "not reset"].filter((w) => !ref.includes(w)).join(","));
  await page.evaluate(() => { document.getElementById("sgref").open = false; });
  if (SHOTS) {
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.evaluate(() => document.querySelector('#sgbody [data-selector=".ui-combobox-item"]')?.scrollIntoView({ block: "start" }));
    await page.screenshot({ path: path.join(SHOTS, "guide-combobox-1440.png") });
  }
  // Clicking a selector lands on its rule in the editor.
  await page.click('#sgbody [data-selector=".ui-combobox-chip"] .sg-jump');
  const at = await page.evaluate(() => {
    const t = document.getElementById("sedtext");
    return { visible: !document.getElementById("spane-edit").hidden, focus: document.activeElement === t, sel: t.value.slice(t.selectionStart, t.selectionStart + 30) };
  });
  ok("a selector in the guide jumps to its rule", at.visible && at.focus && at.sel.startsWith(".ui-combobox-chip"), JSON.stringify(at));
  // …and one with no rule gets an empty one.
  await page.evaluate(() => window.__styles.showTab(0));
  const bare = await page.evaluate(() => {
    const inv = window.__styles.inventory();
    const e = inv.find((x) => x.inTree && x.rules.length === 0);
    return e ? e.cls : "";
  });
  if (bare) {
    await page.click(`#sgbody [data-selector=".${bare}"] .sg-jump`);
    const tail = await page.evaluate(() => document.getElementById("sedtext").value.trimEnd().split("\n").slice(-3).join("\n"));
    ok(`a selector with no rule inserts an empty one (.${bare})`, tail.startsWith(`.${bare} {`), tail);
    await page.click("#sedreset");
  } else ok("a class with no rule to insert", false, "every class in the tree had a rule");
  ok("no page error while browsing the guide", problems.length === 0, problems.join("; "));
  await page.close();
}

// --- 2. edit, flag, persist, reset ------------------------------------------------------------
console.log("--- an edit reaches the pixels; a bad property is flagged; reset; reload ---");
{
  const { page, problems } = await openPage(context, "combobox");
  const MAGENTA = [255, 0, 255];
  const before = await readCanvas(page, MAGENTA);
  const a11yBefore = await page.evaluate(() => document.querySelectorAll("#stage [data-a11y-id]").length);
  const rectBefore = await page.evaluate(() => (() => { const r = document.querySelector("#stage canvas").getBoundingClientRect(); return JSON.stringify([r.left + scrollX, r.top + scrollY, r.width, r.height]); })());
  ok("the canvas has no magenta to begin with", before.near === 0, "near=" + before.near);

  // Open with the keyboard, then to the editor.
  await page.focus("#stylesbtn");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#stylespanel:not([hidden])");
  const rectOpen = await page.evaluate(() => (() => { const r = document.querySelector("#stage canvas").getBoundingClientRect(); return JSON.stringify([r.left + scrollX, r.top + scrollY, r.width, r.height]); })());
  ok("opening the panel moves no canvas pixel", rectOpen === rectBefore, rectOpen + " vs " + rectBefore);
  await page.click("#stab-edit");
  const css0 = await page.inputValue("#sedtext");
  const chipRule = css0.match(/\.ui-combobox-chip\s*\{[^}]*\}/);
  ok("the editor holds the demo's stylesheet", chipRule && css0.length > 1000, css0.slice(0, 80));
  const edited = css0.replace(chipRule[0], chipRule[0].replace(/background-color:\s*[^;]+;/, "background-color: #ff00ff;"));
  await page.fill("#sedtext", edited);
  await settle(page, 900);
  const after = await readCanvas(page, MAGENTA);
  const how = await page.evaluate(() => window.__styles.lastApply().how);
  ok("a chip colour typed in the editor is in the canvas pixels", after.near > 200 && after.hash !== before.hash, `near=${after.near}`);
  ok("…applied by reloading the demo's sheet in place (state kept)", how === "reloaded", how);
  const a11yAfter = await page.evaluate(() => document.querySelectorAll("#stage [data-a11y-id]").length);
  ok("the accessibility mirror is untouched by the edit", a11yAfter === a11yBefore && a11yAfter > 0, `${a11yBefore} -> ${a11yAfter}`);
  const badge = await page.evaluate(() => !document.getElementById("stylesmod").hidden && document.querySelector('#demos input[value="combobox"]').closest("label").hasAttribute("data-modified"));
  ok("the demo shows a modified badge", badge);
  if (SHOTS) {
    await page.evaluate(() => document.querySelector('#sgbody')?.scrollTo?.(0, 0));
    await page.evaluate(() => {
      const t = document.getElementById("sedtext");
      const at = t.value.indexOf("#ff00ff");
      t.focus();
      t.setSelectionRange(at, at + 7);
      const line = t.value.slice(0, at).split("\n").length;
      t.scrollTop = Math.max(0, (line - 6) * 20);
      t.dispatchEvent(new Event("scroll"));
    });
    await page.screenshot({ path: path.join(SHOTS, "editor-chip-colour-1440.png") });
  }

  // A property EVG does not have.
  const bad = edited.replace(chipRule[0].replace(/background-color:\s*[^;]+;/, "background-color: #ff00ff;"),
    (m) => m.replace("{", "{\n  box-shadow: 0 1px 2px #000;\n  colr: red;"));
  await page.fill("#sedtext", bad);
  await settle(page, 900);
  const flagged = await page.evaluate(() => ({
    items: [...document.querySelectorAll("#sedproblems li")].map((li) => li.textContent),
    gutter: [...document.querySelectorAll("#sedlines .sed-ln.error")].map((s) => +s.textContent),
    status: document.getElementById("sedstatus").textContent,
  }));
  const colrLine = bad.split("\n").findIndex((l) => l.includes("colr: red")) + 1;
  ok("an invalid property is flagged by the engine", flagged.items.some((t) => t.includes("colr") && /not an EVG property/.test(t)), flagged.items.slice(0, 4).join(" | "));
  ok("…on its line in the gutter", flagged.gutter.includes(colrLine), `line ${colrLine}, gutter ${flagged.gutter.join(",")}`);
  ok("…with advice for box-shadow", flagged.items.some((t) => t.includes("box-shadow") && t.includes("shadow-radius")), "");
  ok("…and the status counts it", /ignored/.test(flagged.status), flagged.status);
  const stillMagenta = await readCanvas(page, MAGENTA);
  ok("the rest of the sheet still applies", stillMagenta.near > 200, "near=" + stillMagenta.near);
  if (SHOTS) {
    await page.evaluate((line) => {
      const t = document.getElementById("sedtext");
      t.scrollTop = Math.max(0, (line - 6) * 20);
      t.dispatchEvent(new Event("scroll"));
    }, colrLine);
    await page.screenshot({ path: path.join(SHOTS, "editor-bad-property-1440.png") });
  }
  // Back to the good edit, and reload the page.
  await page.fill("#sedtext", edited);
  await settle(page, 900);
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction("window.__styles && document.querySelector('#stage canvas').width > 100");
  await settle(page, 500);
  const reloaded = await readCanvas(page, MAGENTA);
  const kept = await page.evaluate(() => ({
    badge: !document.getElementById("stylesmod").hidden,
    stored: (() => { try { return localStorage.getItem("evgui-styles:combobox") || ""; } catch (e) { return "ERR"; } })(),
  }));
  ok("the edit survives a reload (localStorage)", reloaded.near > 200 && kept.stored.includes("#ff00ff"), `near=${reloaded.near}`);
  ok("…and so does the modified badge", kept.badge);
  await page.click("#stylesbtn");
  await page.click("#stab-edit");
  ok("the editor reopens with the saved text", (await page.inputValue("#sedtext")).includes("#ff00ff"));
  await page.click("#sedreset");
  await settle(page, 900);
  const reset = await readCanvas(page, MAGENTA);
  const after2 = await page.evaluate(() => ({
    badge: !document.getElementById("stylesmod").hidden,
    stored: (() => { try { return localStorage.getItem("evgui-styles:combobox"); } catch (e) { return "ERR"; } })(),
  }));
  ok("Reset restores the original pixels exactly", reset.hash === before.hash && reset.near === 0, `hash ${reset.hash} vs ${before.hash}, near=${reset.near}`);
  ok("…and forgets the saved sheet and the badge", after2.stored === null && !after2.badge, JSON.stringify(after2));
  ok("no page error while editing", problems.length === 0, problems.join("; "));
  await page.close();
}

// --- 3. the keyboard -------------------------------------------------------------------------------
console.log("--- keyboard ---");
{
  const { page, problems } = await openPage(context, "rating");
  await page.focus("#stylesbtn");
  await page.keyboard.press("Enter");
  await page.waitForSelector("#stylespanel:not([hidden])");
  const inside = await page.evaluate(() => document.getElementById("stylespanel").contains(document.activeElement));
  const expanded = await page.getAttribute("#stylesbtn", "aria-expanded");
  ok("Enter on Styles opens the panel and moves the focus into it", inside && expanded === "true", `inside=${inside} expanded=${expanded}`);
  // Tab reaches the tabs; the arrows switch them.
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  const onTab = await page.evaluate(() => document.activeElement.id);
  await page.keyboard.press("ArrowRight");
  const tabState = await page.evaluate(() => ({ id: document.activeElement.id, edit: !document.getElementById("spane-edit").hidden }));
  ok("Tab reaches the tabs and the arrows switch them", onTab === "stab-guide" && tabState.id === "stab-edit" && tabState.edit, `${onTab} -> ${JSON.stringify(tabState)}`);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  const closed = await page.evaluate(() => ({
    hidden: document.getElementById("stylespanel").hidden,
    focus: document.activeElement && document.activeElement.id,
    expanded: document.getElementById("stylesbtn").getAttribute("aria-expanded"),
  }));
  ok("Escape closes it and gives the focus back to the button", closed.hidden && closed.focus === "stylesbtn" && closed.expanded === "false", JSON.stringify(closed));
  // Escape from inside the editor too.
  await page.keyboard.press("Enter");
  await page.click("#stab-edit");
  await page.focus("#sedtext");
  await page.keyboard.press("Escape");
  const closed2 = await page.evaluate(() => ({ hidden: document.getElementById("stylespanel").hidden, focus: document.activeElement.id }));
  ok("Escape from the editor closes it too", closed2.hidden && closed2.focus === "stylesbtn", JSON.stringify(closed2));
  ok("no page error with the keyboard", problems.length === 0, problems.join("; "));
  await page.close();
}

// --- 4. layout, desktop and phone ---------------------------------------------------------------
console.log("--- layout ---");
for (const [label, vp] of [["desktop 1440", { width: 1440, height: 900 }], ["phone 390", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: vp.width < 500, hasTouch: vp.width < 500, deviceScaleFactor: vp.width < 500 ? 2 : 1 });
  const { page, problems } = await openPage(ctx, "combobox");
  const measure = () => page.evaluate(() => ({
    canvas: (() => { const r = document.querySelector("#stage canvas").getBoundingClientRect(); return JSON.stringify([r.left + scrollX, r.top + scrollY, r.width, r.height]); })(),
    a11y: document.querySelectorAll("#stage [data-a11y-id]").length,
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  const shut = await measure();
  await page.click("#stylesbtn");
  await page.waitForSelector("#stylespanel:not([hidden])");
  await settle(page, 200);
  const openM = await measure();
  const box = await page.evaluate(() => JSON.parse(JSON.stringify(document.getElementById("stylespanel").getBoundingClientRect())));
  ok(`${label}: no horizontal scroll with the panel open`, openM.sw <= openM.iw && shut.sw <= shut.iw, `${openM.sw} > ${openM.iw}`);
  ok(`${label}: the canvas and the mirror do not move`, openM.canvas === shut.canvas && openM.a11y === shut.a11y, `${shut.canvas} -> ${openM.canvas}`);
  if (vp.width < 500) ok(`${label}: the panel is a full-width sheet`, Math.abs(box.width - vp.width) < 1 && box.left === 0 && box.bottom <= vp.height + 1, JSON.stringify(box));
  else ok(`${label}: the panel is a drawer on the right, under the top bar`, box.right === vp.width && box.top >= 64 && box.width < vp.width / 2, JSON.stringify(box));
  if (SHOTS) {
    if (vp.width < 500) {
      await page.evaluate(() => document.querySelector('#sgbody [data-selector=".ui-combobox-item"]')?.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: path.join(SHOTS, "guide-combobox-390.png") });
    }
    if (vp.width < 500) {
      // The editor with a chip colour, and a bad property, on the phone too.
      await page.click("#stab-edit");
      const css = await page.inputValue("#sedtext");
      const rule = css.match(/\.ui-combobox-chip\s*\{[^}]*\}/)[0];
      const changed = css.replace(rule, rule.replace(/background-color:\s*[^;]+;/, "background-color: #ff00ff;"));
      await page.fill("#sedtext", changed);
      await settle(page, 900);
      await page.evaluate(() => {
        const t = document.getElementById("sedtext");
        const at = t.value.indexOf("#ff00ff");
        t.setSelectionRange(at, at + 7);
        t.scrollTop = Math.max(0, (t.value.slice(0, at).split("\n").length - 4) * 20);
        t.dispatchEvent(new Event("scroll"));
      });
      // The page scrolled so the magenta chips sit just above the sheet.
      await page.evaluate(() => {
        const c = document.querySelector("#stage canvas");
        const gl = c.getContext("webgl2");
        const buf = new Uint8Array(c.width * c.height * 4);
        gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        let row = -1;
        for (let y = c.height - 1; y >= 0 && row < 0; y--) {
          for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4;
            if (buf[i] > 230 && buf[i + 1] < 40 && buf[i + 2] > 230) { row = c.height - 1 - y; break; }
          }
        }
        const r = c.getBoundingClientRect();
        const yCss = r.top + scrollY + row * (r.height / c.height);
        const sheetTop = document.getElementById("stylespanel").getBoundingClientRect().top;
        window.scrollTo(0, Math.max(0, yCss - sheetTop + 60));
      });
      await settle(page, 200);
      await page.screenshot({ path: path.join(SHOTS, "editor-chip-colour-390.png") });
      // The effect itself, with the sheet shut: the chips are under it.
      await page.keyboard.press("Escape");
      await page.evaluate(() => {
        const inv = document.querySelector("#stage canvas").getBoundingClientRect();
        window.scrollTo(0, window.scrollY + inv.top - 70);
      });
      await settle(page, 300);
      await page.screenshot({ path: path.join(SHOTS, "effect-chip-colour-390.png") });
      await page.click("#stylesbtn");
      await page.click("#stab-edit");
      await page.fill("#sedtext", changed.replace(rule.replace(/background-color:\s*[^;]+;/, "background-color: #ff00ff;"), (m) => m.replace("{", "{\n  colr: red;")));
      await settle(page, 900);
      await page.evaluate(() => {
        const t = document.getElementById("sedtext");
        const at = t.value.indexOf("colr");
        t.scrollTop = Math.max(0, (t.value.slice(0, at).split("\n").length - 4) * 20);
        t.dispatchEvent(new Event("scroll"));
      });
      await page.screenshot({ path: path.join(SHOTS, "editor-bad-property-390.png") });
      await page.click("#sedreset");
    }
  }
  ok(`${label}: no page error`, problems.length === 0, problems.join("; "));
  await ctx.close();
}

// --- 5. every demo has a guide and applies an edit without an error ------------------------------
console.log("--- every demo ---");
{
  const { page, problems } = await openPage(context, "menubar");
  const names = await page.evaluate(() => [...document.querySelectorAll("#demos input[type=radio]")].map((r) => r.value));
  await page.click("#stylesbtn");
  const bad = [];
  for (const n of names) {
    problems.length = 0;
    await page.click(`#demos input[value="${n}"]`, { force: true });
    await settle(page, 150);
    const r = await page.evaluate(() => {
      window.__styles.showTab(0);
      const sels = window.__styles.guideSelectors().length;
      window.__styles.showTab(1);
      const t = document.getElementById("sedtext");
      const orig = t.value;
      t.value = orig + "\n.styles-check-probe { color: #123456; }\n";
      window.__styles.applyNow();
      const how = window.__styles.lastApply().how;
      document.getElementById("sedreset").click();
      return { sels, how, len: orig.length };
    });
    if (!(r.sels > 0 && r.how && r.len > 0) || problems.length) bad.push(`${n}: ${JSON.stringify(r)} ${problems.join("; ")}`);
  }
  ok(`all ${names.length} demos list selectors and take an edit`, bad.length === 0, bad.join(" | "));
  const leftovers = await page.evaluate(() => {
    try { return Object.keys(localStorage).filter((k) => k.startsWith("evgui-styles:")); } catch (e) { return []; }
  });
  ok("…and Reset leaves nothing saved", leftovers.length === 0, leftovers.join(","));
  await page.close();
}

await browser.close();
server.close();
console.log("");
if (failed > 0) {
  console.log(`RESULT FAIL — failed=${failed}`);
  process.exit(1);
}
console.log("RESULT OK — the Styles panel, failed=0");

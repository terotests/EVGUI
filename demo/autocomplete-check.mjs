#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Autocomplete demo: ComboboxCtl in its autocomplete mode, checked in Node
// against the compiled demo and then on the real page.
//
//   node gallery/evgui/demo/autocomplete-check.mjs            (needs bundle.js)
//
// Node: the tree (combobox / listbox / group / option, expanded, selected,
// haspopup), filtering, the keys (arrows, Enter, Escape twice, Tab), the
// pointer (hover highlights, click accepts, clear), groups, the empty state,
// inline completion, the async card's loading state, the limit, and the look
// (36px box, 1px #e4e4e7 border, a popup as wide as the box, 32px rows, a
// #f4f4f5 highlight).
//
// The page: what only the mirror carries — aria-autocomplete,
// aria-activedescendant and aria-controls on the real DOM node — and typing
// through the platform text session, as a person does.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { requireHostTool, findChromium } from "../../ui/conformance/dom-adapter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/AutocompleteDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "autocomplete.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

const fresh = () => { const d = new M.AutocompleteDemo(); d.init(CSS); d.displayListJson(); return d; };
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const cmds = (d) => JSON.parse(d.displayListJson()).cmds;
const options = (d, tid) => tree(d).nodes.filter((n) => n.role === "option" && n.id.startsWith(tid + "-item-")).map((n) => n.name);
const value = (d, tid) => JSON.parse(d.fieldStateJson(tid + "-input")).value;
const centre = (n) => [n.b[0] + n.b[2] / 2, n.b[1] + n.b[3] / 2];
// Press what is under a node's centre, the way the page does: hit test first.
const click = (d, id) => {
  const n = tree(d).byId.get(id);
  const [x, y] = centre(n);
  const hit = d.hitId(x, y);
  d.beginSelection(hit, x, false);
  d.endSelection();
  d.displayListJson();
  return hit;
};
const typeIn = (d, tid, text) => {
  const s = JSON.parse(d.fieldStateJson(tid + "-input"));
  const v = s.value.slice(0, s.selStart) + text + s.value.slice(s.selEnd);
  const at = s.selStart + text.length;
  d.applyEdit(tid + "-input", v, at, at);
  d.displayListJson();
};
const key = (d, k, shift = false) => { d.keyWith(k, shift, false); d.displayListJson(); };
const fillAt = (d, b) => cmds(d).find((c) => c.k === 0 && c.c[3] > 0 && Math.abs(c.x - b[0]) < 0.5 &&
  Math.abs(c.y - b[1]) < 0.5 && Math.abs(c.w - b[2]) < 0.5 && Math.abs(c.h - b[3]) < 0.5);

console.log("--- at rest ---");
{
  const d = fresh();
  ok("no style errors", d.styleErrorCount() === 0, d.styleErrorCount());
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
  const t = tree(d);
  const boxes = t.nodes.filter((n) => n.role === "combobox");
  ok("six comboboxes, named by their labels", boxes.length === 6 &&
    boxes.map((n) => n.name).join() === "Fruit,Framework,Country,Language,Movie,Destination", boxes.map((n) => n.name));
  ok("each is collapsed, has a listbox popup, and is a tab stop",
    boxes.every((n) => n.expanded === 1 && n.haspopup === "listbox" && n.focusable), boxes.map((n) => [n.expanded, n.haspopup]));
  ok("no listbox while closed", !t.nodes.some((n) => n.role === "listbox"));
  ok("no trigger button (an autocomplete has none)", !t.nodes.some((n) => n.role === "button" && n.name === "Open"));
  ok("the clear card is prefilled and shows its clear button", value(d, "au-clear") === "Canada" &&
    t.byId.get("au-clear-clear") && t.byId.get("au-clear-clear").role === "button");
  ok("the empty boxes have no clear button", !t.byId.has("au-basic-clear"));
  ok("six card headings", t.nodes.filter((n) => n.role === "heading").length === 6);
  const b = t.byId.get("au-basic-input").b;
  // The bordered group is the box's parent in the drawing: a 36px stroke
  // around the 34px input.
  const g = cmds(d).find((c) => c.k === 1 && c.h === 36 && Math.abs(c.y - (b[1] - 1)) < 1.5 && c.x < b[0]);
  ok("a 36px, 320px box", !!g && g.w === 320, g);
  ok("with a 1px #e4e4e7 border and an 8px radius", g && g.t === 1 && g.c.slice(0, 3).join() === "228,228,231" && g.r === 8, g);
  ok("placeholders drawn", cmds(d).some((c) => c.text === "Search fruits…"));
}

console.log("--- typing filters (case-insensitive contains) ---");
{
  const d = fresh();
  click(d, "au-basic-input");
  ok("a click in the box focuses it and does not open the list", d.focused === "au-basic-input" &&
    tree(d).byId.get("au-basic-input").expanded === 1);
  typeIn(d, "au-basic", "AN");
  let t = tree(d);
  ok("typing opens it", t.byId.get("au-basic-input").expanded === 2);
  ok("the box controls the listbox (aria-controls)", t.byId.get("au-basic-input").controls === "au-basic-content" &&
    t.byId.get("au-basic-content").role === "listbox", t.byId.get("au-basic-input"));
  ok("which is named after the box", t.byId.get("au-basic-content").name === "Fruit suggestions", t.byId.get("au-basic-content").name);
  ok("and filters it", JSON.stringify(options(d, "au-basic")) === JSON.stringify(["Banana", "Mango", "Orange"]), options(d, "au-basic"));
  ok("no highlight until an arrow", !d.activeDescendant("au-basic-input"));
  ok("the text is kept as typed", value(d, "au-basic") === "AN");
  const texts = cmds(d).filter((c) => c.k === 3).map((c) => c.text);
  ok("the matching part is its own run", texts.includes("an") && texts.includes("B") && texts.includes("ana"), texts.filter((c) => c.length < 5));
  const bold = cmds(d).find((c) => c.k === 3 && c.text === "an");
  const plain = cmds(d).find((c) => c.k === 3 && c.text === "ana");
  ok("drawn heavier than the rest", bold && plain && Number(bold.weight || 400) > Number(plain.weight || 400), [bold, plain]);
  // Emptying it closes it.
  d.applyEdit("au-basic-input", "", 0, 0);
  ok("emptying the box closes the list", tree(d).byId.get("au-basic-input").expanded === 1);
}

console.log("--- the popup's look ---");
{
  const d = fresh();
  click(d, "au-basic-input");
  typeIn(d, "au-basic", "an");
  key(d, "ArrowDown");
  const t = tree(d);
  const group = t.byId.get("au-basic-input").b;
  const list = t.byId.get("au-basic-content").b;
  const rows = t.nodes.filter((n) => n.role === "option");
  ok("the popup hangs under the box", list[1] >= group[1] + group[3] && list[1] <= group[1] + group[3] + 10, { group, list });
  const outer = cmds(d).find((c) => c.k === 0 && Math.abs(c.y - list[1]) < 1 && Math.abs(c.x - list[0]) < 1);
  const edge = cmds(d).find((c) => c.k === 1 && Math.abs(c.y - list[1]) < 1 && Math.abs(c.x - list[0]) < 1);
  ok("as wide as the box's border", outer && Math.abs(outer.w - 320) < 1, outer);
  ok("white, with a shadow", outer && outer.c.slice(0, 3).join() === "255,255,255" && outer.sh && outer.sh.blur > 0, outer);
  ok("and a 1px #e4e4e7 border, 8px radius", edge && edge.t === 1 && edge.c.slice(0, 3).join() === "228,228,231" && edge.r === 8, edge);
  ok("rows are 32px", rows.every((n) => n.b[3] === 32), rows.map((n) => n.b[3]));
  const hi = fillAt(d, rows[0].b);
  ok("the highlight is a rounded #f4f4f5", hi && hi.c.slice(0, 3).join() === "244,244,245" && hi.r === 6, hi);
  ok("the other rows are not filled", !fillAt(d, rows[1].b));
}

console.log("--- the keyboard ---");
{
  const d = fresh();
  click(d, "au-basic-input");
  typeIn(d, "au-basic", "an");
  key(d, "ArrowDown");
  ok("ArrowDown highlights the first row", d.activeDescendant("au-basic-input") === "au-basic-item-banana");
  let t = tree(d);
  ok("the highlighted option is aria-selected", t.byId.get("au-basic-item-banana").selected === true &&
    !t.byId.get("au-basic-item-mango").selected);
  ok("the input's text is unchanged by an arrow", value(d, "au-basic") === "an");
  key(d, "ArrowDown"); key(d, "ArrowDown"); key(d, "ArrowDown");
  ok("the arrows stop at the last row (no wrap)", d.activeDescendant("au-basic-input") === "au-basic-item-orange");
  key(d, "ArrowUp");
  ok("ArrowUp walks back", d.activeDescendant("au-basic-input") === "au-basic-item-mango");
  key(d, "Enter");
  ok("Enter completes the text with the row", value(d, "au-basic") === "Mango", value(d, "au-basic"));
  ok("and closes the list", tree(d).byId.get("au-basic-input").expanded === 1);
  ok("and focus stays in the box", d.focused === "au-basic-input");
  const s = JSON.parse(d.fieldStateJson("au-basic-input"));
  ok("with the caret at the end", s.selStart === 5 && s.selEnd === 5, s);

  // Enter with nothing highlighted keeps the text: it is the value.
  typeIn(d, "au-basic", "x");
  key(d, "Enter");
  ok("Enter with nothing highlighted keeps what was typed", value(d, "au-basic") === "Mangox" &&
    tree(d).byId.get("au-basic-input").expanded === 1, value(d, "au-basic"));

  // A closed box: ArrowDown opens it on the first row.
  d.applyEdit("au-basic-input", "", 0, 0);
  key(d, "ArrowDown");
  ok("ArrowDown on a closed, empty box opens every suggestion", options(d, "au-basic").length === 8 &&
    d.activeDescendant("au-basic-input") === "au-basic-item-apple", options(d, "au-basic"));
  key(d, "Escape");
  ok("Escape closes the list", tree(d).byId.get("au-basic-input").expanded === 1);
  typeIn(d, "au-basic", "ch");
  key(d, "Escape");
  ok("Escape keeps the text", value(d, "au-basic") === "ch");
  key(d, "Escape");
  ok("a second Escape empties the box", value(d, "au-basic") === "");

  // Tab accepts nothing and leaves.
  typeIn(d, "au-basic", "gr");
  key(d, "ArrowDown");
  ok("Tab is not taken by the demo", d.keyWith("Tab", false, false) === false);
  d.setFocus("au-groups-input");
  d.rebuild();
  d.displayListJson();
  ok("leaving closes the list", tree(d).byId.get("au-basic-input").expanded === 1);
  ok("and takes nothing: the text stays as typed", value(d, "au-basic") === "gr", value(d, "au-basic"));
  ok("the arrows are claimed back from the text session", d.ownsKey("ArrowDown") && d.ownsKey("ArrowUp") && !d.ownsKey("ArrowLeft"));
}

console.log("--- the pointer ---");
{
  const d = fresh();
  click(d, "au-basic-input");
  typeIn(d, "au-basic", "b");
  const n = tree(d).byId.get("au-basic-item-blueberry");
  const [x, y] = centre(n);
  const hit = d.hitId(x, y);
  ok("the hit test names the row", hit === "au-basic-item-blueberry", hit);
  d.setHover(hit);
  ok("hovering highlights it", d.activeDescendant("au-basic-input") === "au-basic-item-blueberry");
  ok("and leaves the text alone", value(d, "au-basic") === "b");
  // The matching run inside the row has no id; a click on it is the row's.
  const run = cmds(d).find((c) => c.k === 3 && c.text === "B" && Math.abs(c.y + c.h / 2 - y) < 16);
  const hit2 = run ? d.hitId(run.x + 2, y) : "";
  ok("a click on the bold run lands on the row", hit2 === "au-basic-item-blueberry", hit2);
  click(d, "au-basic-item-blueberry");
  ok("a click accepts the row", value(d, "au-basic") === "Blueberry" && tree(d).byId.get("au-basic-input").expanded === 1);
  ok("and focus is back in the box", d.focused === "au-basic-input");
}

console.log("--- clear button ---");
{
  const d = fresh();
  const hit = click(d, "au-clear-clear");
  ok("the clear button is hit", hit === "au-clear-clear", hit);
  ok("it empties the box", value(d, "au-clear") === "");
  ok("and refocuses it", d.focused === "au-clear-input");
  ok("and goes away with the text", !tree(d).byId.has("au-clear-clear"));
  typeIn(d, "au-clear", "Ja");
  ok("typing brings it back", tree(d).byId.has("au-clear-clear"));
}

console.log("--- groups ---");
{
  const d = fresh();
  click(d, "au-groups-input");
  typeIn(d, "au-groups", "r");
  const t = tree(d);
  const groups = t.nodes.filter((n) => n.role === "group" && n.p === "au-groups-content");
  ok("two groups inside the listbox, named by their headings", groups.map((n) => n.name).join() === "Frontend,Backend", groups.map((n) => n.name));
  const kids = (g) => t.nodes.filter((n) => n.p === g.id && n.role === "option").map((n) => n.name);
  ok("the options sit in their group", kids(groups[0]).join() === "React,Angular" && kids(groups[1]).join() === "Express,Rails,Laravel",
    [kids(groups[0]), kids(groups[1])]);
  const heading = cmds(d).find((c) => c.k === 3 && c.text === "Frontend");
  ok("the heading is drawn muted and small", heading && heading.c.slice(0, 3).join() === "113,113,122" && heading.size === 12, heading);
  key(d, "ArrowDown"); key(d, "ArrowDown"); key(d, "ArrowDown");
  ok("the arrows cross from one group to the next", d.activeDescendant("au-groups-input") === "au-groups-item-express");
  d.applyEdit("au-groups-input", "vue", 3, 3);
  const t2 = tree(d);
  ok("a group with nothing left is not drawn", t2.nodes.filter((n) => n.role === "group" && n.p === "au-groups-content").map((n) => n.name).join() === "Frontend");
}

console.log("--- empty state ---");
{
  const d = fresh();
  click(d, "au-basic-input");
  typeIn(d, "au-basic", "zz");
  const t = tree(d);
  ok("no options", options(d, "au-basic").length === 0);
  ok("the list says so, drawn and announced", cmds(d).some((c) => c.text === "No results found.") &&
    t.byId.get("au-basic-content").name === "No results found.", t.byId.get("au-basic-content"));
  key(d, "Enter");
  ok("Enter there closes and keeps the text", value(d, "au-basic") === "zz" && t.byId.get("au-basic-input"));
}

console.log("--- inline completion ---");
{
  const d = fresh();
  click(d, "au-inline-input");
  typeIn(d, "au-inline", "Ty");
  let s = JSON.parse(d.fieldStateJson("au-inline-input"));
  ok("the rest of the first match is written in", s.value === "TypeScript", s.value);
  ok("selected, after what was typed", s.selStart === 2 && s.selEnd === 10, s);
  ok("and that row is highlighted", d.activeDescendant("au-inline-input") === "au-inline-item-typescript");
  ok("aria-autocomplete is both here and list elsewhere", d.ariaAutocomplete("au-inline-input") === "both" &&
    d.ariaAutocomplete("au-basic-input") === "list");
  // Typing over the selection keeps going.
  typeIn(d, "au-inline", "p");
  s = JSON.parse(d.fieldStateJson("au-inline-input"));
  ok("the next letter types over the completion and completes again", s.value === "TypeScript" && s.selStart === 3, s);
  // Backspace removes the completion and does not complete again.
  d.applyEdit("au-inline-input", "Typ", 3, 3);
  s = JSON.parse(d.fieldStateJson("au-inline-input"));
  ok("deleting the completion leaves what was typed", s.value === "Typ" && s.selStart === 3 && s.selEnd === 3, s);
  ok("and drops the highlight", !d.activeDescendant("au-inline-input"));
  // Lower case is completed and accepted as the suggestion spells it.
  d.applyEdit("au-inline-input", "", 0, 0);
  typeIn(d, "au-inline", "r");
  s = JSON.parse(d.fieldStateJson("au-inline-input"));
  ok("'r' completes Rust (the first that STARTS with it)", s.value === "rust" && s.selStart === 1, s);
  key(d, "Enter");
  ok("Enter accepts it as spelt", value(d, "au-inline") === "Rust", value(d, "au-inline"));
  // Escape puts back what was typed.
  d.applyEdit("au-inline-input", "", 0, 0);
  typeIn(d, "au-inline", "k");
  key(d, "Escape");
  s = JSON.parse(d.fieldStateJson("au-inline-input"));
  ok("Escape removes the completion", s.value === "k", s);
  // The arrows show the whole label of the row they are on.
  d.applyEdit("au-inline-input", "", 0, 0);
  typeIn(d, "au-inline", "j");
  ok("'j' completes and highlights JavaScript", d.activeDescendant("au-inline-input") === "au-inline-item-javascript");
  key(d, "ArrowDown");
  ok("an arrow shows the next highlighted row, whole, in the box", value(d, "au-inline") === "Java" &&
    d.activeDescendant("au-inline-input") === "au-inline-item-java", value(d, "au-inline"));
  d.setFocus("au-basic-input");
  ok("leaving (Tab) takes nothing: back to what was typed", value(d, "au-inline") === "j", value(d, "au-inline"));
}

console.log("--- async ---");
{
  const d = fresh();
  click(d, "au-async-input");
  typeIn(d, "au-async", "the");
  let t = tree(d);
  ok("a keystroke opens the list in its loading state", t.byId.get("au-async-input").expanded === 2 &&
    cmds(d).some((c) => c.text === "Searching…"));
  ok("no stale options while loading", options(d, "au-async").length === 0);
  ok("the status region says so", t.byId.get("au-async-status").role === "status" && t.byId.get("au-async-status").name === "Searching…",
    t.byId.get("au-async-status"));
  ok("the clock is running", d.busyNow() === true);
  d.tick(200);
  ok("not yet at 200ms", options(d, "au-async").length === 0);
  d.tick(300);
  d.displayListJson();
  ok("the results arrive after 450ms", options(d, "au-async").length === 6, options(d, "au-async"));
  ok("and the status counts them", tree(d).byId.get("au-async-status").name === "7 movies found.", tree(d).byId.get("au-async-status").name);
  ok("the clock stops", d.busyNow() === false);
  typeIn(d, "au-async", "zz");
  d.settle();
  d.displayListJson();
  ok("nothing matching says No results found.", cmds(d).some((c) => c.text === "No results found."));
  d.applyEdit("au-async-input", "", 0, 0);
  ok("emptying cancels and closes", d.busyNow() === false && tree(d).byId.get("au-async-input").expanded === 1);
}

console.log("--- limit ---");
{
  const d = fresh();
  click(d, "au-limit-input");
  typeIn(d, "au-limit", "a");
  const t = tree(d);
  ok("five options shown", options(d, "au-limit").length === 5, options(d, "au-limit"));
  ok("and a line saying how many more", cmds(d).some((c) => c.text === "18 more — keep typing to narrow"));
  ok("told to a reader on the listbox, not as its name", t.byId.get("au-limit-content").desc === "18 more matches not shown" &&
    t.byId.get("au-limit-content").name === "Destination suggestions", t.byId.get("au-limit-content"));
  key(d, "ArrowUp");
  ok("the keyboard walks only the shown rows", d.activeDescendant("au-limit-input") === "au-limit-item-canada");
  typeIn(d, "au-limit", "ustr");
  ok("narrowing drops the line", options(d, "au-limit").join() === "Australia,Austria" &&
    !cmds(d).some((c) => (c.text || "").includes("more —")), options(d, "au-limit"));
}

console.log("--- the page grows under an open list ---");
{
  const d = fresh();
  const h0 = d.heightPx();
  click(d, "au-limit-input");
  typeIn(d, "au-limit", "a");
  const t = tree(d);
  const box = t.byId.get("au-limit-input").b;
  const list = t.byId.get("au-limit-content").b;
  ok("the bottom card's list opens downwards", list[1] > box[1], { box, list });
  ok("and the page is tall enough for it", d.heightPx() >= list[1] + list[3] && d.heightPx() > h0, [h0, d.heightPx()]);
}

console.log("--- a phone ---");
{
  const d = fresh();
  d.pageW = 358;
  d.layout = undefined;
  d.rebuild();
  d.displayListJson();
  const t = tree(d);
  const worst = t.nodes.filter((n) => n.b).reduce((m, n) => Math.max(m, n.b[0] + n.b[2]), 0);
  ok("everything fits in 358px", worst <= 358.5, worst);
  click(d, "au-basic-input");
  typeIn(d, "au-basic", "an");
  const list = tree(d).byId.get("au-basic-content").b;
  const box = tree(d).byId.get("au-basic-input").b;
  ok("the open list fits too, under the box", list[0] + list[2] <= 358.5 && list[1] > box[1], list);
}

// --- the real page ------------------------------------------------------------

console.log("--- on the page: the mirror's aria attributes and the text session ---");
if (!fs.existsSync(path.join(HERE, "bundle.js"))) {
  ok("bundle.js exists (run demo/build.mjs)", false);
} else {
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
  const server = createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname).slice(1));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, r));
  const { chromium } = requireHostTool("playwright-core");
  const browser = await chromium.launch({ executablePath: findChromium() });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/gallery/evgui/demo/index.html?demo=autocomplete`);
    await page.waitForFunction("document.querySelector('#stage canvas') !== null");
    await page.waitForTimeout(300);
    const attrs = (tid) => page.evaluate((t) => {
      const el = document.querySelector(`[data-a11y-id="${t}"]`);
      if (!el) return null;
      const a = (n) => el.getAttribute(n);
      const ref = (n) => (a(n) ? (document.getElementById(a(n)) || { dataset: {} }).dataset.a11yId || "?" : null);
      return { role: a("role"), expanded: a("aria-expanded"), autocomplete: a("aria-autocomplete"),
        controls: ref("aria-controls"), active: ref("aria-activedescendant") };
    }, tid);
    const clickOn = async (tid) => {
      await page.evaluate((t) => document.querySelector(`[data-a11y-id="${t}"]`).scrollIntoView({ block: "center" }), tid);
      await page.waitForTimeout(100);
      const r = await page.evaluate((t) => { const b = document.querySelector(`[data-a11y-id="${t}"]`).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }, tid);
      await page.mouse.click(r.x + 30, r.y + r.h / 2);
      await page.waitForTimeout(120);
    };
    let a = await attrs("au-basic-input");
    ok("page: the box is role=combobox, collapsed, aria-autocomplete=list", a && a.role === "combobox" &&
      a.expanded === "false" && a.autocomplete === "list", a);
    await clickOn("au-basic-input");
    await page.keyboard.type("an", { delay: 30 });
    await page.waitForTimeout(150);
    a = await attrs("au-basic-input");
    ok("page: typing through the text session opens it", a.expanded === "true" && a.controls === "au-basic-content", a);
    ok("page: the session holds the text", (await page.evaluate(() => window.__fieldState("au-basic-input").value)) === "an");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(150);
    a = await attrs("au-basic-input");
    ok("page: aria-activedescendant follows the arrows", a.active === "au-basic-item-mango", a);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    a = await attrs("au-basic-input");
    ok("page: Enter completes and closes", a.expanded === "false" && !a.active &&
      (await page.evaluate(() => window.__fieldState("au-basic-input").value)) === "Mango", a);
    await clickOn("au-inline-input");
    await page.keyboard.type("ty", { delay: 30 });
    await page.waitForTimeout(150);
    const st = await page.evaluate(() => window.__fieldState("au-inline-input"));
    ok("page: inline completion reaches the real input", st.value === "typeScript" && st.selStart === 2 && st.selEnd === 10, st);
    ok("page: aria-autocomplete=both on the inline box", (await attrs("au-inline-input")).autocomplete === "both");
    await page.keyboard.type("p");
    await page.waitForTimeout(150);
    const st2 = await page.evaluate(() => window.__fieldState("au-inline-input"));
    ok("page: the next letter types over the completion", st2.value === "typeScript" && st2.selStart === 3, st2);
    await clickOn("au-async-input");
    await page.keyboard.type("jaws", { delay: 20 });
    await page.waitForTimeout(900);
    const rows = await page.evaluate(() => JSON.parse(window.__lastA11y).nodes.filter((n) => n.role === "option" && n.id.startsWith("au-async")).map((n) => n.name));
    ok("page: the async results arrive on the page's clock", rows.join() === "Jaws", rows);
    ok("page: no errors", errors.length === 0, errors);
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(`\npassed=${passed} failed=${failed}`);
console.log(failed ? "FAILED" : "ALL PASS");
process.exit(failed ? 1 : 0);

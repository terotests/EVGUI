#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Combobox demo: six ComboboxCtls in their default (combobox) mode,
// checked in Node against the compiled demo and then on the real page.
//
//   node gallery/evgui/demo/combobox-demo-check.mjs            (needs bundle.js)
//
// Node, per card: the tree (combobox / listbox / option / group / toolbar,
// expanded, selected, controls), opening (click, trigger, ArrowDown), the
// arrows (with Base UI's loopFocus: past the end to the input, then round),
// Enter choosing, Escape closing and putting the chosen label back, leaving
// the box reverting a query, the empty text; groups with separators; chips
// (a pick keeps the list open, Backspace in the empty box, ArrowLeft onto the
// chips, the remove buttons); avatars and a second line; the clear button and
// a disabled row; the Create row. The look: a 36px box with a 1px #e4e4e7
// border and an 8px radius, a popup as wide as the box, 32px rows, a #f4f4f5
// highlight, a ✓ at the right of the chosen row. A phone.
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

const M = require(path.join(ROOT, "gallery/evgui/bin/ComboboxDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "combobox.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

const fresh = () => { const d = new M.ComboboxDemo(); d.init(CSS); d.displayListJson(); return d; };
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const cmds = (d) => JSON.parse(d.displayListJson()).cmds;
const options = (d, tid) => tree(d).nodes.filter((n) => n.role === "option" && n.id.startsWith(tid + "-item-")).map((n) => n.name);
const selected = (d, tid) => tree(d).nodes.filter((n) => n.role === "option" && n.id.startsWith(tid + "-item-") && n.selected).map((n) => n.name);
const text = (d, tid) => JSON.parse(d.fieldStateJson(tid + "-input")).value;
const expanded = (d, tid) => tree(d).byId.get(tid + "-input").expanded === 2;
const active = (d, tid) => d.activeDescendant(tid + "-input");
const centre = (n) => [n.b[0] + n.b[2] / 2, n.b[1] + n.b[3] / 2];
// Press what is under a node's centre, the way the page does: hit test first.
const click = (d, id) => {
  const n = tree(d).byId.get(id);
  if (!n) return null;
  const [x, y] = centre(n);
  const hit = d.hitId(x, y);
  d.beginSelection(hit, x, false);
  d.endSelection();
  d.displayListJson();
  return hit;
};
const hover = (d, id) => {
  const n = tree(d).byId.get(id);
  const [x, y] = centre(n);
  d.setHover(d.hitId(x, y));
  d.displayListJson();
};
const typeIn = (d, tid, t) => {
  const s = JSON.parse(d.fieldStateJson(tid + "-input"));
  const v = s.value.slice(0, s.selStart) + t + s.value.slice(s.selEnd);
  const at = s.selStart + t.length;
  d.applyEdit(tid + "-input", v, at, at);
  d.displayListJson();
};
const clearText = (d, tid) => { d.applyEdit(tid + "-input", "", 0, 0); d.displayListJson(); };
const key = (d, k, shift = false) => { d.keyWith(k, shift, false); d.displayListJson(); };
const fillAt = (d, b) => cmds(d).find((c) => c.k === 0 && c.c[3] > 0 && Math.abs(c.x - b[0]) < 0.5 &&
  Math.abs(c.y - b[1]) < 0.5 && Math.abs(c.w - b[2]) < 0.5 && Math.abs(c.h - b[3]) < 0.5);
// A stroked icon (k 7) drawn inside a box, right of `minX`.
const strokeIn = (d, b, minX = 0) => cmds(d).filter((c) => c.k === 7 && c.x >= b[0] + minX && c.x + c.w <= b[0] + b[2] + 0.5 &&
  c.y >= b[1] && c.y + c.h <= b[1] + b[3] + 0.5);
const value = (d, i) => d.summary().split("|")[i];

console.log("--- at rest ---");
{
  const d = fresh();
  ok("no style errors", d.styleErrorCount() === 0, d.styleErrorCount());
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
  const t = tree(d);
  const boxes = t.nodes.filter((n) => n.role === "combobox");
  ok("six comboboxes, named by their labels", boxes.map((n) => n.name).join() === "Framework,Produce,Frameworks,Assignee,Status,Label",
    boxes.map((n) => n.name));
  ok("each collapsed, with a listbox popup, a tab stop", boxes.every((n) => n.expanded === 1 && n.haspopup === "listbox" && n.focusable),
    boxes.map((n) => [n.expanded, n.haspopup]));
  ok("no listbox while closed, and no aria-controls", !t.nodes.some((n) => n.role === "listbox") && boxes.every((n) => !n.controls));
  ok("every box has a chevron trigger (button \"Open\")", t.nodes.filter((n) => n.role === "button" && n.name === "Open").length === 6);
  ok("six card headings", t.nodes.filter((n) => n.role === "heading").length === 6);
  ok("only the Status box has a clear button", t.nodes.filter((n) => n.role === "button" && n.name === "Clear").map((n) => n.id).join() === "cb-clear-clear");
  ok("the values: Status in-progress, Frameworks two chips", d.summary() === "||next-js,sveltekit||in-progress||", d.summary());
  const b = t.byId.get("cb-basic-input").b;
  const g = cmds(d).find((c) => c.k === 1 && c.h === 36 && Math.abs(c.y - (b[1] - 1)) < 1.5 && c.x < b[0]);
  ok("a 36px, 320px box", !!g && g.w === 320, g);
  ok("with a 1px #e4e4e7 border and an 8px radius", g && g.t === 1 && g.c.slice(0, 3).join() === "228,228,231" && g.r === 8, g);
  ok("placeholder drawn", cmds(d).some((c) => c.text === "Select framework…"));
  const trig = t.byId.get("cb-basic-trigger").b;
  ok("the trigger is a drawn chevron at the right of the box", strokeIn(d, trig).length === 1 && trig[0] + trig[2] > g.x + g.w - 12,
    { trig, g });
}

console.log("--- basic: opening and the arrows ---");
{
  const d = fresh();
  click(d, "cb-basic-input");
  let t = tree(d);
  ok("a click in the box focuses it and opens the list", d.focused === "cb-basic-input" && expanded(d, "cb-basic"));
  ok("the box controls the listbox (aria-controls)", t.byId.get("cb-basic-input").controls === "cb-basic-content" &&
    t.byId.get("cb-basic-content").role === "listbox");
  ok("the five frameworks", options(d, "cb-basic").join() === "Next.js,SvelteKit,Nuxt.js,Remix,Astro", options(d, "cb-basic"));
  ok("nothing chosen, nothing highlighted", selected(d, "cb-basic").length === 0 && !active(d, "cb-basic"));
  key(d, "ArrowDown");
  ok("ArrowDown highlights the first", active(d, "cb-basic") === "cb-basic-item-next-js");
  key(d, "ArrowUp");
  ok("ArrowUp from the first goes back to the input (loopFocus)", active(d, "cb-basic") === "" && expanded(d, "cb-basic"));
  key(d, "ArrowUp");
  ok("and the next ArrowUp wraps to the last", active(d, "cb-basic") === "cb-basic-item-astro");
  key(d, "ArrowDown");
  key(d, "ArrowDown");
  ok("ArrowDown past the last, then round to the first", active(d, "cb-basic") === "cb-basic-item-next-js");
  key(d, "ArrowDown");
  key(d, "Enter");
  t = tree(d);
  ok("Enter chooses: the value is the item, its label in the box", value(d, 0) === "sveltekit" && text(d, "cb-basic") === "SvelteKit");
  ok("and closes the list, focus stays in the box", !expanded(d, "cb-basic") && d.focused === "cb-basic-input");
  ok("the value line under the box says so", cmds(d).some((c) => c.text === "value: \"sveltekit\""));
  click(d, "cb-basic-trigger");
  ok("the trigger opens it again, focus in the box", expanded(d, "cb-basic") && d.focused === "cb-basic-input");
  ok("with the highlight on the chosen row", active(d, "cb-basic") === "cb-basic-item-sveltekit");
  ok("which is the one aria-selected option", selected(d, "cb-basic").join() === "SvelteKit", selected(d, "cb-basic"));
  t = tree(d);
  const row = t.byId.get("cb-basic-item-sveltekit").b;
  const check = strokeIn(d, row, row[2] / 2);
  ok("and carries a ✓ at its right", check.length === 1 && check[0].c.slice(0, 3).join() === "9,9,11", check);
  ok("no ✓ on the others", strokeIn(d, t.byId.get("cb-basic-item-remix").b).length === 0);
  click(d, "cb-basic-trigger");
  ok("the trigger closes it", !expanded(d, "cb-basic"));
}

console.log("--- basic: typing filters, Escape and blur restore ---");
{
  const d = fresh();
  click(d, "cb-basic-input");
  key(d, "ArrowDown");
  key(d, "Enter");
  ok("Next.js chosen", value(d, 0) === "next-js" && text(d, "cb-basic") === "Next.js");
  clearText(d, "cb-basic");
  typeIn(d, "cb-basic", "u");
  ok("typing opens and filters (case-insensitive contains)", expanded(d, "cb-basic") &&
    options(d, "cb-basic").join() === "Nuxt.js", options(d, "cb-basic"));
  ok("and drops the highlight", !active(d, "cb-basic"));
  ok("the value is still the chosen item", value(d, 0) === "next-js");
  typeIn(d, "cb-basic", "zz");
  ok("nothing matching says No framework found.", options(d, "cb-basic").length === 0 &&
    cmds(d).some((c) => c.text === "No framework found."));
  key(d, "Escape");
  ok("Escape closes and puts the chosen label back", !expanded(d, "cb-basic") && text(d, "cb-basic") === "Next.js" &&
    value(d, 0) === "next-js", [text(d, "cb-basic"), value(d, 0)]);
  typeIn(d, "cb-basic", "re");
  key(d, "Enter");
  ok("Enter with nothing highlighted chooses nothing and reverts", text(d, "cb-basic") === "Next.js" && value(d, 0) === "next-js" &&
    !expanded(d, "cb-basic"));
  typeIn(d, "cb-basic", "x");
  d.setFocus("cb-groups-input");
  d.displayListJson();
  ok("leaving the box with a query reverts it (Tab)", text(d, "cb-basic") === "Next.js" && !expanded(d, "cb-basic"));
  click(d, "cb-basic-input");
  const t = tree(d);
  hover(d, "cb-basic-item-remix");
  ok("the pointer highlights a row", active(d, "cb-basic") === "cb-basic-item-remix");
  const hi = fillAt(d, t.byId.get("cb-basic-item-remix").b);
  ok("drawn as a rounded #f4f4f5 band", hi && hi.c.slice(0, 3).join() === "244,244,245" && hi.r === 6, hi);
  click(d, "cb-basic-item-remix");
  ok("a click on a row chooses it", value(d, 0) === "remix" && text(d, "cb-basic") === "Remix" && !expanded(d, "cb-basic"));
  ok("and focus stays in the box", d.focused === "cb-basic-input");
}

console.log("--- the popup's look ---");
{
  const d = fresh();
  click(d, "cb-basic-input");
  key(d, "ArrowDown");
  const t = tree(d);
  const group = t.byId.get("cb-basic-input").b;
  const list = t.byId.get("cb-basic-content").b;
  const rows = t.nodes.filter((n) => n.role === "option");
  ok("the popup hangs under the box", list[1] >= group[1] + group[3] && list[1] <= group[1] + group[3] + 10, { group, list });
  const outer = cmds(d).find((c) => c.k === 0 && Math.abs(c.y - list[1]) < 1 && Math.abs(c.x - list[0]) < 1);
  const edge = cmds(d).find((c) => c.k === 1 && Math.abs(c.y - list[1]) < 1 && Math.abs(c.x - list[0]) < 1);
  ok("as wide as the box's border", outer && Math.abs(outer.w - 320) < 1, outer);
  ok("white, with a shadow", outer && outer.c.slice(0, 3).join() === "255,255,255" && outer.sh && outer.sh.blur > 0, outer);
  ok("a 1px #e4e4e7 border, 8px radius", edge && edge.t === 1 && edge.c.slice(0, 3).join() === "228,228,231" && edge.r === 8, edge);
  ok("rows are 32px", rows.every((n) => n.b[3] === 32), rows.map((n) => n.b[3]));
  ok("the tree lints clean with the list open", d.a11yProblems().length === 0, d.a11yProblems());
}

console.log("--- groups and separators ---");
{
  const d = fresh();
  click(d, "cb-groups-input");
  let t = tree(d);
  const groups = t.nodes.filter((n) => n.role === "group" && n.p === "cb-groups-content");
  ok("two role=group sections named by their headings", groups.map((n) => n.name).join() === "Fruits,Vegetables", groups.map((n) => n.name));
  ok("rows inside their section", t.byId.get("cb-groups-item-apple").p === groups[0].id &&
    t.byId.get("cb-groups-item-leek").p === groups[1].id);
  ok("the headings drawn, muted", ["Fruits", "Vegetables"].every((s) => cmds(d).some((c) => c.text === s && c.c.slice(0, 3).join() === "113,113,122")));
  const list = t.byId.get("cb-groups-content").b;
  const sep = cmds(d).filter((c) => c.k === 0 && c.h === 1 && c.x >= list[0] && c.x + c.w <= list[0] + list[2] && c.y > list[1] && c.y < list[1] + list[3]);
  const pine = t.byId.get("cb-groups-item-pineapple").b;
  const aub = t.byId.get("cb-groups-item-aubergine").b;
  ok("one hairline separator between the sections", sep.length === 1 && sep[0].y > pine[1] + pine[3] - 0.5 && sep[0].y < aub[1], sep);
  key(d, "ArrowDown");
  key(d, "ArrowUp");
  key(d, "ArrowUp");
  ok("the arrows cross sections (ArrowUp wraps to Leek)", active(d, "cb-groups") === "cb-groups-item-leek");
  key(d, "Enter");
  ok("Enter chooses Leek", value(d, 1) === "leek" && text(d, "cb-groups") === "Leek");
  clearText(d, "cb-groups");
  typeIn(d, "cb-groups", "ban");
  t = tree(d);
  ok("a filter that leaves one section drops the other and the separator",
    t.nodes.filter((n) => n.role === "group" && n.p === "cb-groups-content").map((n) => n.name).join() === "Fruits" &&
    options(d, "cb-groups").join() === "Banana");
}

console.log("--- multiple: chips ---");
{
  const d = fresh();
  let t = tree(d);
  const bar = t.byId.get("cb-multi-chips");
  ok("the chips are a toolbar", bar && bar.role === "toolbar");
  ok("each with a remove button named after it", t.nodes.filter((n) => n.role === "button" && n.name.startsWith("Remove ")).map((n) => n.name).join() ===
    "Remove Next.js,Remove SvelteKit");
  ok("chips drawn inside the box", ["Next.js", "SvelteKit"].every((s) => cmds(d).some((c) => c.text === s)));
  ok("no placeholder while it holds chips", !cmds(d).some((c) => c.text === "Select frameworks…"));
  click(d, "cb-multi-input");
  ok("click opens; both chosen rows aria-selected", expanded(d, "cb-multi") && selected(d, "cb-multi").join() === "Next.js,SvelteKit");
  typeIn(d, "cb-multi", "rem");
  key(d, "ArrowDown");
  key(d, "Enter");
  ok("a pick adds a chip at the end", value(d, 2) === "next-js,sveltekit,remix", value(d, 2));
  ok("the list stays open and the query is spent", expanded(d, "cb-multi") && text(d, "cb-multi") === "" &&
    options(d, "cb-multi").length === 7);
  ok("the highlight stays on the picked row", active(d, "cb-multi") === "cb-multi-item-remix");
  key(d, "Enter");
  ok("Enter again toggles it off", value(d, 2) === "next-js,sveltekit" && expanded(d, "cb-multi"));
  click(d, "cb-multi-item-astro");
  ok("a click picks too, and stays open", value(d, 2) === "next-js,sveltekit,astro" && expanded(d, "cb-multi"));
  ok("the page claims Backspace in the empty chip box", d.ownsKey("Backspace") === true);
  key(d, "Backspace");
  ok("Backspace in the empty box removes the last chip", value(d, 2) === "next-js,sveltekit", value(d, 2));
  ok("the page claims ArrowLeft at the start", d.ownsKey("ArrowLeft") === true);
  key(d, "ArrowLeft");
  ok("ArrowLeft steps onto the last chip and closes the list", d.focused === "cb-multi-chip-sveltekit" && !expanded(d, "cb-multi"));
  const ring = cmds(d).find((c) => c.k === 0 && c.c.slice(0, 3).join() === "228,228,231" && c.h === 26);
  ok("the focused chip is drawn darker", !!ring, ring);
  key(d, "ArrowLeft");
  ok("ArrowLeft walks back along the chips", d.focused === "cb-multi-chip-next-js");
  key(d, "Delete");
  ok("Delete removes the focused chip; focus to the one in its place", value(d, 2) === "sveltekit" && d.focused === "cb-multi-chip-sveltekit");
  key(d, "Enter");
  ok("Enter on a chip goes back to the box", d.focused === "cb-multi-input");
  click(d, "cb-multi-chip-sveltekit-remove");
  ok("the × removes its chip and focuses the box", value(d, 2) === "" && d.focused === "cb-multi-input");
  ok("the placeholder is back", cmds(d).some((c) => c.text === "Select frameworks…"));
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
}

console.log("--- multiple: the box grows as the chips wrap ---");
{
  const d = fresh();
  click(d, "cb-multi-input");
  for (const v of ["nuxt-js", "remix", "astro", "gatsby"]) click(d, "cb-multi-item-" + v);
  const t = tree(d);
  const chips = t.byId.get("cb-multi-chips").b;
  const inp = t.byId.get("cb-multi-input").b;
  const trig = t.byId.get("cb-multi-trigger").b;
  const g = cmds(d).find((c) => c.k === 1 && c.r === 8 && c.x < chips[0] && c.x > chips[0] - 8 && c.y < chips[1] && c.y > chips[1] - 8);
  ok("six chips", value(d, 2).split(",").length === 6);
  ok("the chips wrap and the box holds them all", g && g.h > 60 && inp[1] + inp[3] <= g.y + g.h && trig[0] + trig[2] <= g.x + g.w, { g, inp, trig });
  ok("the trigger stays at the top right", trig[1] < chips[1] + 8, { trig, chips });
  const list = t.byId.get("cb-multi-content").b;
  ok("the list hangs under the grown box", list[1] >= g.y + g.h, { list, g });
}

console.log("--- avatars and a second line ---");
{
  const d = fresh();
  click(d, "cb-users-input");
  const t = tree(d);
  const rows = t.nodes.filter((n) => n.role === "option" && n.id.startsWith("cb-users-item-"));
  ok("five people, named by their names only", rows.map((n) => n.name).join() === "Olivia Martin,Jackson Lee,Isabella Nguyen,William Kim,Sofia Davis",
    rows.map((n) => n.name));
  ok("rows are 44px for two lines", rows.every((n) => n.b[3] === 44), rows.map((n) => n.b[3]));
  ok("initials avatars drawn", ["OM", "JL", "IN", "WK", "SD"].every((s) => cmds(d).some((c) => c.text === s)));
  const mail = cmds(d).find((c) => c.text === "olivia.martin@email.com");
  const name = cmds(d).find((c) => c.text === "Olivia Martin");
  ok("the e-mail under the name, smaller and muted", mail && name && mail.y > name.y && mail.c.slice(0, 3).join() === "113,113,122", [mail, name]);
  typeIn(d, "cb-users", "lee");
  ok("typing filters by name", options(d, "cb-users").join() === "Jackson Lee");
  key(d, "ArrowDown");
  key(d, "Enter");
  ok("the value is the person; the box shows the name", value(d, 3) === "jackson-lee" && text(d, "cb-users") === "Jackson Lee");
}

console.log("--- clear button and a disabled row ---");
{
  const d = fresh();
  ok("prefilled: In Progress", text(d, "cb-clear") === "In Progress" && value(d, 4) === "in-progress");
  click(d, "cb-clear-input");
  let t = tree(d);
  ok("Canceled is a disabled option", t.byId.get("cb-clear-item-canceled").disabled === true);
  ok("drawn faded", cmds(d).some((c) => c.text === "Canceled" && c.c[3] < 0.75) ||
    cmds(d).some((c) => c.text === "Canceled" && c.c.slice(0, 3).join() !== "9,9,11"));
  ok("opens with the highlight on the chosen row", active(d, "cb-clear") === "cb-clear-item-in-progress");
  key(d, "ArrowDown");
  key(d, "ArrowDown");
  ok("the arrows skip the disabled row (Done, then back to the input)", active(d, "cb-clear") === "");
  click(d, "cb-clear-item-canceled");
  ok("a click on it chooses nothing", value(d, 4) === "in-progress");
  key(d, "Escape");
  click(d, "cb-clear-clear");
  t = tree(d);
  ok("the × clears the value and the text", value(d, 4) === "" && text(d, "cb-clear") === "");
  ok("and is gone with the text, focus in the box", !t.byId.has("cb-clear-clear") && d.focused === "cb-clear-input");
  ok("the placeholder is back", cmds(d).some((c) => c.text === "Select status…"));
}

console.log("--- creatable ---");
{
  const d = fresh();
  click(d, "cb-create-input");
  ok("four labels to start", options(d, "cb-create").join() === "Bug,Documentation,Enhancement,Question");
  typeIn(d, "cb-create", "Perf");
  ok("a new word offers Create \"Perf\"", options(d, "cb-create").join() === "Create \"Perf\"", options(d, "cb-create"));
  const t = tree(d);
  const row = t.byId.get("cb-create-item-cb-create-new").b;
  ok("with a plus at its left", strokeIn(d, row).some((c) => c.x < row[0] + 30));
  key(d, "ArrowDown");
  key(d, "Enter");
  ok("choosing it makes the label and chooses it", value(d, 5) === "perf" && text(d, "cb-create") === "Perf" && !expanded(d, "cb-create"),
    [value(d, 5), text(d, "cb-create")]);
  click(d, "cb-create-input");
  ok("the new label is in the list, chosen", options(d, "cb-create").join() === "Bug,Documentation,Enhancement,Question,Perf" &&
    selected(d, "cb-create").join() === "Perf", options(d, "cb-create"));
  clearText(d, "cb-create");
  typeIn(d, "cb-create", "bug");
  ok("an existing label (any case) offers no Create row", options(d, "cb-create").join() === "Bug", options(d, "cb-create"));
  typeIn(d, "cb-create", "s");
  ok("a longer word offers it again", options(d, "cb-create").join() === "Create \"bugs\"");
  key(d, "Escape");
  ok("Escape: no Create row, the chosen label back", text(d, "cb-create") === "Perf" && value(d, 5) === "perf");
  click(d, "cb-create-input");
  ok("reopened, the list is the labels again", options(d, "cb-create").length === 5);
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
}

console.log("--- the page grows under an open list ---");
{
  const d = fresh();
  const h0 = d.heightPx();
  click(d, "cb-clear-input");
  const t = tree(d);
  const box = t.byId.get("cb-clear-input").b;
  const list = t.byId.get("cb-clear-content").b;
  ok("the bottom-row list opens downwards", list[1] > box[1], { box, list });
  ok("and the page is tall enough for it", d.heightPx() >= list[1] + list[3] && d.heightPx() >= h0, [h0, d.heightPx()]);
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
  click(d, "cb-users-input");
  const list = tree(d).byId.get("cb-users-content").b;
  const box = tree(d).byId.get("cb-users-input").b;
  ok("the open list fits too, under the box", list[0] + list[2] <= 358.5 && list[1] > box[1], list);
  const mails = cmds(d).filter((c) => c.text && c.text.endsWith("@email.com"));
  ok("the e-mails fit in their rows", mails.every((c) => c.x + (c.w || 0) <= list[0] + list[2]), mails.map((c) => [c.x, c.w]));
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
    await page.goto(`http://127.0.0.1:${server.address().port}/gallery/evgui/demo/index.html?demo=combobox`);
    await page.waitForFunction("document.querySelector('#stage canvas') !== null");
    await page.waitForTimeout(300);
    const attrs = (tid) => page.evaluate((t) => {
      const el = document.querySelector(`[data-a11y-id="${t}"]`);
      if (!el) return null;
      const a = (n) => el.getAttribute(n);
      const ref = (n) => (a(n) ? (document.getElementById(a(n)) || { dataset: {} }).dataset.a11yId || "?" : null);
      return { role: a("role"), expanded: a("aria-expanded"), autocomplete: a("aria-autocomplete"),
        controls: ref("aria-controls"), active: ref("aria-activedescendant"), selected: a("aria-selected") };
    }, tid);
    const clickOn = async (tid) => {
      await page.evaluate((t) => document.querySelector(`[data-a11y-id="${t}"]`).scrollIntoView({ block: "center" }), tid);
      await page.waitForTimeout(100);
      const r = await page.evaluate((t) => { const b = document.querySelector(`[data-a11y-id="${t}"]`).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; }, tid);
      await page.mouse.click(r.x + 20, r.y + r.h / 2);
      await page.waitForTimeout(150);
    };
    let a = await attrs("cb-basic-input");
    ok("page: the box is role=combobox, collapsed, aria-autocomplete=list", a && a.role === "combobox" &&
      a.expanded === "false" && a.autocomplete === "list", a);
    await clickOn("cb-basic-input");
    a = await attrs("cb-basic-input");
    ok("page: a click opens it and names the listbox (aria-controls)", a.expanded === "true" && a.controls === "cb-basic-content", a);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(150);
    a = await attrs("cb-basic-input");
    ok("page: aria-activedescendant follows the arrows", a.active === "cb-basic-item-sveltekit", a);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    a = await attrs("cb-basic-input");
    ok("page: Enter chooses and closes", a.expanded === "false" && !a.active &&
      (await page.evaluate(() => window.__fieldState("cb-basic-input").value)) === "SvelteKit", a);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(150);
    ok("page: the chosen option is aria-selected", (await attrs("cb-basic-item-sveltekit")).selected === "true");
    await page.keyboard.press("Escape");
    await page.keyboard.press("End");
    await page.keyboard.type("zz", { delay: 30 });
    await page.waitForTimeout(150);
    a = await attrs("cb-basic-input");
    ok("page: typing through the text session filters", a.expanded === "true" &&
      (await page.evaluate(() => window.__fieldState("cb-basic-input").value)) === "SvelteKitzz", a);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    ok("page: Escape closes and the real input holds the chosen label again",
      (await attrs("cb-basic-input")).expanded === "false" &&
      (await page.evaluate(() => window.__fieldState("cb-basic-input").value)) === "SvelteKit");
    await clickOn("cb-multi-input");
    await page.keyboard.press("Backspace");
    await page.waitForTimeout(150);
    const chips = await page.evaluate(() => [...document.querySelectorAll('[data-a11y-id^="cb-multi-chip-"][data-a11y-id$="-remove"]')].map((e) => e.getAttribute("data-a11y-id")));
    ok("page: Backspace in the empty chip box takes the last chip", chips.join() === "cb-multi-chip-next-js-remove", chips);
    await clickOn("cb-create-input");
    await page.keyboard.type("Perf", { delay: 30 });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    ok("page: the Create row makes and chooses a label",
      (await page.evaluate(() => window.__fieldState("cb-create-input").value)) === "Perf");
    ok("page: no errors", errors.length === 0, errors);
  } finally {
    await browser.close();
    server.close();
  }
}

console.log(`\npassed=${passed} failed=${failed}`);
console.log(failed ? "FAILED" : "ALL PASS");
process.exit(failed ? 1 : 0);

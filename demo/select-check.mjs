#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Select demo, checked against the compiled demo in Node and then on the
// real page in Chromium.
//
// SelectCtl's Base UI mode first (opening with each key and where the
// highlight starts, the arrows, Home / End, disabled rows skipped, typeahead
// open and closed, Enter / Space / Escape / Tab, multiple toggling), the old
// Radix-measured mode left as it was, then the demo: every card by pointer
// and keyboard, the hover highlight, click outside, the invalid card's
// submit / blur / clear, the status count and dots, the groups and
// separators, the list flipping above its trigger and staying on the page,
// the avatar list scrolling to keep the highlight in view, the roles and
// states a reader gets, the stylesheet parsing clean, and nothing overlapping
// at 900 and 390. Then Chromium: the page draws the demo, the pointer and the
// keyboard work through the page's own handlers, the accessibility mirror
// carries combobox / listbox / option / group with their aria attributes, and
// a phone width of 390 flips the last list and grows no horizontal scroll.
//
//   node gallery/evgui/demo/select-check.mjs            (inside Ranger, after
//   `node gallery/evgui/demo/build.mjs`)
//   SELECT_NO_BROWSER=1 skips the browser pass.

import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/SelectDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "select.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

const fresh = (w) => {
  const d = new M.SelectDemo();
  d.init(CSS);
  if (w) { d.pageW = w; d.layout = undefined; }
  d.displayListJson();
  return d;
};
const KEYS = ["fruit", "form", "users", "status", "zones", "off", "small"];
const st = (d) => {
  const p = d.summary().split("|");
  const o = {};
  KEYS.forEach((k, i) => { o[k] = p[i]; });
  o.open = p[7];
  o.active = p[8];
  o.focus = p[9];
  o.invalid = p[10] === "invalid";
  return o;
};
const byId = (d, id) => {
  let found = null;
  const walk = (e) => { if (found) return; if (e.id === id) { found = e; return; } for (const k of e.children || []) walk(k); };
  walk(d.root);
  return found;
};
const box = (d, id) => {
  const s = d.boxJson(id);
  if (!s) return null;
  const [x, y, w, h] = s.split(",").map(Number);
  return { x, y, w, h };
};
// Press what is under an element's centre, the way the page does.
const click = (d, id) => {
  const b = box(d, id);
  if (!b) return "(no element " + id + ")";
  const hit = d.hitId(b.x + b.w / 2, b.y + b.h / 2);
  d.press(hit);
  d.displayListJson();
  return hit;
};
const hover = (d, id) => {
  const b = box(d, id);
  if (!b) return "(no element " + id + ")";
  const hit = d.hitId(b.x + b.w / 2, b.y + b.h / 2);
  d.setHover(hit);
  d.displayListJson();
  return hit;
};
const key = (d, k) => { const took = d.key(k); d.displayListJson(); return took; };
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const texts = (el) => {
  const out = [];
  const walk = (e) => { if (e.textContent) out.push(e.textContent); for (const k of e.children || []) walk(k); };
  walk(el);
  return out;
};

// --- 1. SelectCtl, Base UI mode ---------------------------------------------------
console.log("--- SelectCtl: Base UI mode ---");
{
  const mk = () => {
    const c = new M.SelectCtl();
    c.tid = "t";
    c.name = "T";
    c.baseUi = true;
    c.addItem("a", "Apple", false);
    c.addItem("b", "Banana", false);
    c.addItem("x", "Broken", true);
    c.addItem("c", "Blueberry", false);
    c.addItem("d", "Date", false);
    return c;
  };
  let c = mk();
  ok("ArrowDown on the closed trigger opens on the first row when nothing is chosen",
    c.keyDown("t-trigger", "ArrowDown") === "t-item-a" && c.open && c.activeValue === "a", c.activeValue);
  c = mk();
  ok("ArrowUp opens on the last row", c.keyDown("t-trigger", "ArrowUp") === "t-item-d" && c.activeValue === "d", c.activeValue);
  c = mk();
  c.value = "c";
  ok("Enter opens on the chosen row", c.keyDown("t-trigger", "Enter") === "t-item-c" && c.activeValue === "c");
  c = mk();
  c.value = "b";
  ok("Space opens on the chosen row", c.keyDown("t-trigger", " ") === "t-item-b");
  c = mk();
  ok("a click with nothing chosen opens with nothing highlighted", c.activate("t-trigger") === "t-content" && c.open && c.activeValue === "");
  c = mk();
  c.keyDown("t-trigger", "ArrowDown");
  c.keyDown("t-item-a", "ArrowDown");
  ok("ArrowDown steps", c.activeValue === "b");
  c.keyDown("t-item-b", "ArrowDown");
  ok("ArrowDown skips a disabled row", c.activeValue === "c", c.activeValue);
  c.keyDown("t-item-c", "ArrowUp");
  ok("ArrowUp skips it back", c.activeValue === "b", c.activeValue);
  c.keyDown("t-item-b", "End");
  ok("End goes to the last row", c.activeValue === "d");
  c.keyDown("t-item-d", "ArrowDown");
  ok("ArrowDown on the last row stays (no wrap)", c.activeValue === "d");
  c.keyDown("t-item-d", "Home");
  ok("Home goes to the first row", c.activeValue === "a");
  c.keyDown("t-item-a", "ArrowUp");
  ok("ArrowUp on the first row stays", c.activeValue === "a");
  c.keyDown("t-item-a", "ArrowDown");
  ok("Enter chooses, closes and lands on the trigger",
    c.keyDown("t-item-b", "Enter") === "t-trigger" && c.value === "b" && !c.open);
  c.keyDown("t-trigger", "Enter");
  c.keyDown("t-item-b", "ArrowDown");
  ok("Escape closes, keeps the value and lands on the trigger",
    c.keyDown("t-item-c", "Escape") === "t-trigger" && !c.open && c.value === "b");
  c.keyDown("t-trigger", "Enter");
  ok("Tab closes too", c.keyDown("t-item-b", "Tab") === "t-trigger" && !c.open);
  ok("a click on a disabled row does nothing", (c.activate("t-trigger"), c.activate("t-item-x")) === "" && c.open && c.value === "b");
  ok("a click on a row chooses it", c.activate("t-item-d") === "t-trigger" && c.value === "d" && !c.open);
  // Typeahead.
  c = mk();
  c.keyDown("t-trigger", "Enter");
  c.typeAhead("b");
  ok("typeahead: b highlights Banana", c.activeValue === "b");
  c.typeAhead("b");
  ok("typeahead: b again cycles to the next B (skipping the disabled Broken)", c.activeValue === "c", c.activeValue);
  c.typeAhead("b");
  ok("…and round to Banana", c.activeValue === "b", c.activeValue);
  c.tickCtl(800);
  ok("the buffer empties after 750 ms", c.typed === "" && !c.typing());
  c.typeAhead("b");
  c.typeAhead("l");
  ok("typeahead: 'bl' finds Blueberry", c.activeValue === "c", c.activeValue);
  c.tickCtl(800);
  c.typeAhead("z");
  ok("a letter nothing starts with moves nothing", c.activeValue === "c");
  c.tickCtl(800);
  c.typeAhead("D");
  ok("typeahead ignores case", c.activeValue === "d");
  c = mk();
  c.value = "a";
  ok("typeahead on the closed trigger chooses", c.typeAhead("d") === "t-trigger" && c.value === "d" && !c.open);
  // Hover.
  c = mk();
  c.activate("t-trigger");
  ok("hover highlights a row", c.hover("t-item-c") === "t-item-c" && c.activeValue === "c");
  ok("hover on a disabled row does not", c.hover("t-item-x") === "" && c.activeValue === "c");
  // Multiple.
  c = mk();
  c.multiple = true;
  c.values = ["a", "c"];
  c.keyDown("t-trigger", "Enter");
  ok("multiple opens on the first chosen row", c.activeValue === "a");
  c.keyDown("t-item-a", "ArrowDown");
  ok("multiple: Enter toggles on and stays open", c.keyDown("t-item-b", "Enter") === "t-item-b" && c.open && c.values.join() === "a,b,c", c.values.join());
  ok("multiple: Space toggles off", (c.keyDown("t-item-b", " "), c.values.join()) === "a,c" && c.open);
  ok("multiple: a click toggles and stays open", c.activate("t-item-d") === "t-item-d" && c.values.join() === "a,c,d" && c.open);
  ok("multiple: the values stay in the items' order", (c.activate("t-item-b"), c.values.join()) === "a,b,c,d");
  const rows = c.rows();
  const list = rows.find((r) => r.tid === "t-content");
  ok("multiple: the list row is multiselectable", list && list.multiSelectable === "true");
  ok("aria-selected follows the choice, not the highlight",
    rows.find((r) => r.tid === "t-item-c").selected === 2 && rows.find((r) => r.tid === "t-item-x").selected === 1);
  // Disabled.
  c = mk();
  c.disabled = true;
  ok("a disabled select does not open", c.keyDown("t-trigger", "Enter") === "" && c.activate("t-trigger") === "" && !c.open);
  // Groups.
  c = new M.SelectCtl();
  c.addGroupedItem("e", "EST", "Americas");
  ok("addGroupedItem records the group", c.items[0].group === "Americas");
}

// --- 2. the old mode is unchanged ---------------------------------------------------
console.log("--- SelectCtl: the Radix-measured mode is unchanged ---");
{
  const c = new M.SelectCtl();
  c.tid = "r";
  c.addItem("1", "One", false);
  c.addItem("2", "Two", false);
  c.value = "1";
  ok("ArrowDown on a closed Radix trigger does nothing", c.keyDown("r-trigger", "ArrowDown") === "" && !c.open);
  ok("Enter opens on the chosen row", c.keyDown("r-trigger", "Enter") === "r-item-1");
  ok("Home is not one of its keys", c.keyDown("r-item-1", "Home") === "");
  ok("typeahead is off", c.typeChar("r-item-1", "t") === false && c.activeValue === "1");
  ok("hover highlights nothing", c.hover("r-item-2") === "");
  const rows = c.rows();
  ok("aria-selected still follows chosen AND focused", rows.find((r) => r.tid === "r-item-1").selected === 2);
  c.keyDown("r-item-1", "ArrowDown");
  ok("…and moving off the chosen row selects nothing", c.rows().filter((r) => r.selected === 2).length === 0);
}

// --- 3. the demo at rest ---------------------------------------------------------------
console.log("--- the demo at rest ---");
{
  const d = fresh();
  ok("the stylesheet parses with no errors", d.styleErrorCount() === 0, d.styleErrorCount() ? d.styleErrorAt(0) : "");
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
  const s = st(d);
  ok("defaults: fruit null, Michael Rodriguez, five statuses, disabled Banana",
    s.fruit === "none" && s.users === "michael-rodriguez" && s.status === "ready,error,building,queued,initializing" && s.off === "banana", s);
  const t = tree(d);
  const trig = t.byId.get("sl-fruit-trigger");
  ok("the trigger is a combobox named by its label, collapsed, with a popup", trig && trig.role === "combobox" && trig.name === "Favorite Fruit" && trig.expanded === 1 && trig.haspopup === "listbox", trig);
  ok("the placeholder is its value, the description its description", trig && trig.value === "Select a fruit" && /Choose your favorite fruit/.test(trig.desc || ""), trig);
  ok("six cards, each with a heading", t.nodes.filter((n) => n.role === "heading").length === 6);
  ok("the placeholder is drawn in the trigger", texts(byId(d, "sl-fruit-trigger")).includes("Select a fruit"));
  ok("the description is drawn under it", texts(byId(d, "sl-fruit-field")).includes("Choose your favorite fruit from the list."));
  const ut = byId(d, "sl-users-trigger");
  const av = ut.children.find((k) => /sl-avatar-sm/.test(k.className));
  ok("the avatars trigger shows a 20px avatar and the name", av && Math.round(av.calculatedWidth) === 20 && texts(ut).includes("Michael Rodriguez"), av && av.calculatedWidth);
  const stt = byId(d, "sl-status-trigger");
  ok("the status trigger: five stacked dots, Status and 5/6", texts(stt).includes("Status") && texts(stt).includes("5/6") && byId(d, "sl-status-trigger").children[0].children.length === 5);
  const dots = byId(d, "sl-status-trigger").children[0].children;
  ok("the dots overlap", dots.length > 1 && dots[1].calculatedX - dots[0].calculatedX < dots[0].calculatedWidth);
  const off = t.byId.get("sl-disabled-trigger");
  ok("the disabled select is disabled and not focusable", off && off.disabled === true && !off.focusable, off);
  const sm = box(d, "sl-small-trigger");
  const md = box(d, "sl-fruit-trigger");
  ok("the small trigger is shorter than the default one", sm.h < md.h, [sm.h, md.h]);
}

// --- 4. basic: pointer and keyboard ----------------------------------------------------
console.log("--- basic: pointer and keyboard ---");
{
  const d = fresh();
  click(d, "sl-fruit-trigger");
  let s = st(d);
  ok("a click opens the list", s.open === "sl-fruit");
  ok("the highlight starts on the chosen (null) row", s.active === "none" && s.focus === "sl-fruit-item-none", s);
  const t = tree(d);
  const lb = t.byId.get("sl-fruit-content");
  ok("the list is a listbox", lb && lb.role === "listbox");
  ok("six options, in order", t.nodes.filter((n) => n.role === "option" && n.id.startsWith("sl-fruit-item-")).map((n) => n.name).join() === "Select a fruit,Apple,Banana,Blueberry,Grapes,Pineapple");
  ok("the trigger is expanded and controls the list", t.byId.get("sl-fruit-trigger").expanded === 2 && byId(d, "sl-fruit-trigger").a11yControls === "sl-fruit-content");
  ok("the chosen option is aria-selected", t.byId.get("sl-fruit-item-none").selected === true && !t.byId.get("sl-fruit-item-apple").selected);
  const tb = box(d, "sl-fruit-trigger");
  const pb = box(d, "sl-fruit-content");
  ok("the list opens BELOW the trigger (not item-aligned), as wide as it", pb.y >= tb.y + tb.h && pb.y - (tb.y + tb.h) <= 8 && Math.abs(pb.w - tb.w) < 1 && Math.abs(pb.x - tb.x) < 1, [tb, pb]);
  ok("a check marks the chosen row, at its right", byId(d, "sl-fruit-item-none").children.at(-1).children.length === 1);
  hover(d, "sl-fruit-item-grapes");
  s = st(d);
  ok("hover highlights (and focuses) a row", s.active === "grapes" && s.focus === "sl-fruit-item-grapes", s);
  ok("the highlighted row is drawn highlighted", /sl-item-active/.test(byId(d, "sl-fruit-item-grapes").className));
  click(d, "sl-fruit-item-banana");
  s = st(d);
  ok("a click chooses, closes and returns the focus to the trigger", s.fruit === "banana" && s.open === "" && s.focus === "sl-fruit-trigger", s);
  ok("the trigger shows the choice", texts(byId(d, "sl-fruit-trigger")).includes("Banana"));
  ok("…and a reader hears it", tree(d).byId.get("sl-fruit-trigger").value === "Banana");
  // Keyboard.
  key(d, "ArrowDown");
  s = st(d);
  ok("ArrowDown opens with the highlight on the chosen row", s.open === "sl-fruit" && s.active === "banana", s);
  key(d, "ArrowDown");
  key(d, "ArrowDown");
  ok("the arrows move the highlight", st(d).active === "grapes");
  key(d, "Home");
  ok("Home", st(d).active === "none");
  key(d, "End");
  ok("End", st(d).active === "pineapple");
  key(d, "Enter");
  s = st(d);
  ok("Enter chooses and closes", s.fruit === "pineapple" && s.open === "" && s.focus === "sl-fruit-trigger", s);
  key(d, " ");
  ok("Space opens", st(d).open === "sl-fruit");
  key(d, "ArrowUp");
  key(d, " ");
  ok("Space chooses", st(d).fruit === "grapes" && st(d).open === "");
  key(d, "Enter");
  key(d, "ArrowUp");
  key(d, "Escape");
  s = st(d);
  ok("Escape closes without choosing, focus on the trigger", s.open === "" && s.fruit === "grapes" && s.focus === "sl-fruit-trigger", s);
  key(d, "ArrowUp");
  ok("ArrowUp opens", st(d).open === "sl-fruit" && st(d).active === "grapes");
  const tookTab = d.key("Tab");
  d.displayListJson();
  s = st(d);
  ok("Tab closes the list and hands the Tab on to the page", !tookTab && s.open === "" && s.focus === "sl-fruit-trigger", s);
  // Typeahead through the demo.
  key(d, "Enter");
  key(d, "b");
  ok("typing b highlights Banana", st(d).active === "banana");
  key(d, "b");
  ok("b again cycles to Blueberry", st(d).active === "blueberry");
  d.tick(800);
  key(d, "a");
  ok("after the pause, a starts again: Apple", st(d).active === "apple");
  ok("the demo is busy while the typeahead buffer is live", d.busyNow() === true);
  d.tick(800);
  ok("…and not after", d.busyNow() === false);
  key(d, "Escape");
  key(d, "p");
  ok("typing on the closed trigger chooses (Pineapple)", st(d).fruit === "pineapple" && st(d).open === "");
  // Click outside.
  click(d, "sl-fruit-trigger");
  click(d, "sl-invalid-caption");
  s = st(d);
  ok("a click outside closes, the focus back on the trigger", s.open === "" && s.focus === "sl-fruit-trigger", s);
  click(d, "sl-fruit-trigger");
  click(d, "sl-users-trigger");
  ok("a click on another trigger only closes the open list (modal)", st(d).open === "");
  click(d, "sl-fruit-trigger");
  click(d, "sl-fruit-trigger");
  ok("a click on the trigger again closes it", st(d).open === "");
}

// --- 5. the invalid state --------------------------------------------------------------
console.log("--- invalid state ---");
{
  const d = fresh();
  ok("no error before anything happens", !st(d).invalid && !byId(d, "sl-form-error"));
  click(d, "sl-submit");
  ok("submit with no fruit shows the error", st(d).invalid && !!byId(d, "sl-form-error"));
  ok("the error replaces the description", !byId(d, "sl-form-desc") && texts(byId(d, "sl-form-field")).includes("Please select a valid fruit."));
  ok("the label goes red", /sl-label-invalid/.test(byId(d, "sl-form-label").className));
  ok("the trigger gets the red border and ring", /sl-trigger-invalid/.test(byId(d, "sl-form-trigger").className));
  const tr = tree(d).byId.get("sl-form-trigger");
  ok("a reader hears it: aria-invalid and the error as its description", byId(d, "sl-form-trigger").a11yInvalid === "true" && tr.desc === "Please select a valid fruit.", tr);
  click(d, "sl-form-trigger");
  click(d, "sl-form-item-apple");
  ok("a valid choice clears it", !st(d).invalid && !!byId(d, "sl-form-desc") && !/sl-trigger-invalid/.test(byId(d, "sl-form-trigger").className));
  click(d, "sl-form-trigger");
  click(d, "sl-form-item-none");
  ok("choosing the placeholder again (after a submit) brings it back", st(d).invalid);
  // Blur.
  const b = fresh();
  click(b, "sl-form-trigger");
  key(b, "Escape");
  ok("still valid while the select has the focus", !st(b).invalid);
  click(b, "sl-avatars-caption");
  ok("blur with no value shows the error", st(b).invalid, st(b));
  const b2 = fresh();
  b2.setFocus("sl-form-trigger");
  b2.setFocus("sl-submit");
  ok("a Tab away with no value shows it too", st(b2).invalid);
  const b3 = fresh();
  b3.setFocus("sl-form-trigger");
  key(b3, "a");
  b3.setFocus("sl-submit");
  ok("a blur with a value does not", !st(b3).invalid && st(b3).form === "apple", st(b3));
  // The page's keyboard on the submit button.
  const k = fresh();
  k.setFocus("sl-submit");
  key(k, "Enter");
  ok("Enter on Submit submits", st(k).invalid);
}

// --- 6. avatars: groups, scrolling -------------------------------------------------------
console.log("--- with avatars ---");
{
  const d = fresh();
  click(d, "sl-users-trigger");
  const t = tree(d);
  const g = t.byId.get("sl-users-group-0");
  ok("the rows are in a group named 'Select a user'", g && g.role === "group" && g.name === "Select a user" && !!byId(d, "sl-users-group-0-label"), g);
  ok("ten people", t.nodes.filter((n) => n.role === "option" && n.id.startsWith("sl-users-item-")).length === 10);
  ok("the highlight starts on Michael Rodriguez", st(d).active === "michael-rodriguez");
  const row = byId(d, "sl-users-item-alex-johnson");
  const av = row.children.find((k) => /sl-avatar-md/.test(k.className));
  ok("each row has a 24px initials avatar", av && Math.round(av.calculatedWidth) === 24 && av.textContent === "AJ", av && av.textContent);
  ok("the avatars are coloured, not all the same", byId(d, "sl-users-item-sarah-chen").children[0].backgroundColor !== undefined);
  ok("a check on the chosen row only", byId(d, "sl-users-item-michael-rodriguez").children.at(-1).children.length === 1 && byId(d, "sl-users-item-alex-johnson").children.at(-1).children.length === 0);
  // A short page: the list is taller than the room either side and scrolls.
  const s = fresh();
  s.pageW = 900;
  click(s, "sl-users-trigger");
  const pop = byId(s, "sl-users-content");
  const clips = pop.scrollHeight > pop.calculatedHeight + 1;
  const pb = box(s, "sl-users-content");
  ok("the list stays inside the page", pb.y >= 0 && pb.y + pb.h <= s.pageH + 0.5, [pb, s.pageH]);
  if (clips) {
    key(s, "End");
    const last = box(s, "sl-users-item-liam-thompson");
    const p2 = box(s, "sl-users-content");
    ok("End scrolls the last row into view", last.y >= p2.y && last.y + last.h <= p2.y + p2.h + 0.5 && s.popScroll > 0, [last, p2, s.popScroll]);
    key(s, "Home");
    const first = box(s, "sl-users-item-alex-johnson");
    ok("Home scrolls back to the top", s.popScroll === 0 && first.y >= box(s, "sl-users-content").y, s.popScroll);
    ok("the wheel scrolls it", s.scrollBy(20) && s.popScroll === 20);
    ok("…and hands the gesture back at the end", (s.scrollBy(-400), s.popScroll === 0) && s.scrollBy(-10) === false);
  } else {
    ok("the list is clipped and scrolls on this page", false, [pop.scrollHeight, pop.calculatedHeight]);
  }
  ok("the wheel is the page's when no list is open", (key(s, "Escape"), s.scrollBy(40) === false));
  // Choose with the keyboard.
  const k = fresh();
  k.setFocus("sl-users-trigger");
  key(k, "Enter");
  key(k, "ArrowDown");
  key(k, "Enter");
  ok("ArrowDown + Enter picks Emma Wilson", st(k).users === "emma-wilson" && texts(byId(k, "sl-users-trigger")).includes("Emma Wilson"));
  ok("the trigger's avatar follows", texts(byId(k, "sl-users-trigger")).includes("EW"));
}

// --- 7. multiple -------------------------------------------------------------------------
console.log("--- multiple with status dots ---");
{
  const d = fresh();
  click(d, "sl-status-trigger");
  let t = tree(d);
  ok("the list is multiselectable (via the page's attribute hook)", JSON.parse(d.attrsJson()).some(([id, a, v]) => id === "sl-status-content" && a === "aria-multiselectable" && v === "true"));
  ok("five options aria-selected, Canceled not", ["ready", "error", "building", "queued", "initializing"].every((v) => t.byId.get("sl-status-item-" + v).selected === true) && !t.byId.get("sl-status-item-canceled").selected);
  ok("each row has its coloured dot", ["ready", "canceled"].every((v) => byId(d, "sl-status-item-" + v).children.some((k) => /sl-dot-item/.test(k.className))));
  click(d, "sl-status-item-canceled");
  let s = st(d);
  ok("a click toggles Canceled on and the list stays open", s.status.split(",").length === 6 && s.open === "sl-status", s);
  ok("the count reads 6/6 and six dots", texts(byId(d, "sl-status-trigger")).includes("6/6") && byId(d, "sl-status-trigger").children[0].children.length === 6);
  click(d, "sl-status-item-error");
  ok("a click toggles Error off", st(d).status === "ready,building,queued,initializing,canceled" && texts(byId(d, "sl-status-trigger")).includes("5/6"));
  key(d, "Home");
  key(d, "Enter");
  ok("Enter toggles Ready off and stays open", st(d).status === "building,queued,initializing,canceled" && st(d).open === "sl-status");
  key(d, " ");
  ok("Space toggles it back", st(d).status.startsWith("ready,") && st(d).open === "sl-status");
  ok("the check follows", byId(d, "sl-status-item-ready").children.at(-1).children.length === 1 && byId(d, "sl-status-item-error").children.at(-1).children.length === 0);
  key(d, "Escape");
  ok("Escape closes", st(d).open === "" && st(d).focus === "sl-status-trigger");
  ok("a reader hears the chosen statuses", tree(d).byId.get("sl-status-trigger").value === "Ready, Building, Queued, Initializing, Canceled");
  ok("no multiselectable hook when closed", d.attrsJson() === "[]");
  for (const v of ["ready", "building", "queued", "initializing", "canceled"]) { click(d, "sl-status-trigger"); click(d, "sl-status-item-" + v); key(d, "Escape"); }
  ok("with none chosen: 0/6 and no dots", st(d).status === "" && texts(byId(d, "sl-status-trigger")).includes("0/6") && !/sl-dots/.test(byId(d, "sl-status-trigger").children[0].className));
}

// --- 8. groups ---------------------------------------------------------------------------
console.log("--- groups with separators ---");
{
  const d = fresh(900);
  click(d, "sl-tz-trigger");
  const t = tree(d);
  const groups = t.nodes.filter((n) => n.role === "group" && n.id.startsWith("sl-tz-group-"));
  ok("three groups, each named by its heading", groups.length === 3 && groups.every((g) => byId(d, g.id + "-label").textContent === g.name), groups.map((g) => g.name));
  ok("the headings: Americas, Europe, Asia", groups.map((g) => g.name).join() === "Americas,Europe,Asia");
  const pop = byId(d, "sl-tz-content");
  ok("two separators between the three groups", pop.children.filter((k) => /sl-sep/.test(k.className)).length === 2 && /sl-sep/.test(pop.children[1].className));
  ok("the options: EST … JST, each with its offset", t.byId.get("sl-tz-item-ist").name === "IST UTC+5:30" && texts(byId(d, "sl-tz-item-est")).includes("UTC-5"));
  ok("the offsets are muted", /sl-offset/.test(byId(d, "sl-tz-item-est").children[1].className));
  ok("the placeholder: Select a timezone", texts(byId(d, "sl-tz-trigger")).includes("Select a timezone"));
  ok("a click with nothing chosen highlights nothing", st(d).active === "" && st(d).focus === "sl-tz-content");
  key(d, "ArrowDown");
  ok("ArrowDown from nothing highlights the first row", st(d).active === "est");
  key(d, "g");
  ok("typeahead crosses groups (g: GMT)", st(d).active === "gmt");
  key(d, "Enter");
  ok("GMT chosen, shown with its offset", st(d).zones === "gmt" && texts(byId(d, "sl-tz-trigger")).includes("UTC+0"));
}

// --- 9. flip and edges -------------------------------------------------------------------
console.log("--- flip ---");
for (const w of [900, 390]) {
  const d = fresh(w);
  d.displayListJson();
  const H = d.pageH;
  for (const tid of ["sl-fruit", "sl-users", "sl-status", "sl-tz", "sl-small"]) {
    click(d, tid + "-trigger");
    const tb = box(d, tid + "-trigger");
    const pb = box(d, tid + "-content");
    const below = pb.y >= tb.y + tb.h - 0.5;
    const above = pb.y + pb.h <= tb.y + 0.5;
    ok(`${w}: ${tid}'s list is on the page, beside its trigger`, pb.y >= -0.5 && pb.y + pb.h <= H + 0.5 && pb.x >= -0.5 && pb.x + pb.w <= w + 0.5 && (below || above), [tb, pb, H]);
    if (tid === "sl-small") ok(`${w}: the last card's list flips ABOVE its trigger (no room below)`, above, [tb, pb, H]);
    if (tid === "sl-fruit") ok(`${w}: the first card's list opens below`, below);
    key(d, "Escape");
  }
}

// --- 10. disabled ------------------------------------------------------------------------
console.log("--- disabled ---");
{
  const d = fresh();
  click(d, "sl-disabled-trigger");
  ok("a click on the disabled select does not open it or focus it", st(d).open === "" && st(d).focus === "");
  d.setFocus("sl-disabled-trigger");
  ok("keys on it do nothing", d.key("Enter") === false && st(d).open === "");
  ok("its row is grey (opacity)", /sl-trigger-disabled/.test(byId(d, "sl-disabled-trigger").className));
  click(d, "sl-small-trigger");
  key(d, "End");
  key(d, "Enter");
  ok("the small select works like the others", st(d).small === "pineapple");
}

// --- 11. layout: nothing overlaps, nothing off the page ---------------------------------
console.log("--- layout ---");
for (const w of [900, 390]) {
  const d = fresh(w);
  d.displayListJson();
  const cards = ["basic", "invalid", "avatars", "multiple", "groups", "more"].map((k) => box(d, `sl-${k}-card`));
  let overlap = 0;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i], b = cards[j];
    if (a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5) overlap++;
  }
  ok(`${w}: no two cards overlap`, overlap === 0);
  ok(`${w}: every card fits the width`, cards.every((c) => c.x >= 0 && c.x + c.w <= w + 0.5), cards);
  ok(`${w}: every trigger sits inside its card`, ["fruit", "form", "users", "status", "tz", "disabled", "small"].every((k) => {
    const t = box(d, `sl-${k}-trigger`);
    return cards.some((c) => t.x >= c.x && t.x + t.w <= c.x + c.w + 0.5 && t.y >= c.y && t.y + t.h <= c.y + c.h + 0.5);
  }));
  const sub = box(d, "sl-submit");
  const inv = box(d, "sl-invalid-card");
  ok(`${w}: the submit button sits inside its card`, sub.y + sub.h <= inv.y + inv.h + 0.5);
  if (w === 390) ok("390: the cards stack in one column", cards.every((c, i) => i === 0 || c.y > cards[i - 1].y));
}

console.log(`\n${passed} passed, ${failed} failed (node)`);

// --- 12. the real page -------------------------------------------------------------------
if (process.env.SELECT_NO_BROWSER) {
  console.log(failed ? "RESULT FAIL" : "RESULT PASS");
  process.exit(failed ? 1 : 0);
}
if (!fs.existsSync(path.join(HERE, "bundle.js"))) {
  console.error("bundle.js missing — run `node gallery/evgui/demo/build.mjs` first");
  process.exit(3);
}
const { requireHostTool, findChromium } = await import("../../ui/conformance/dom-adapter.mjs");
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
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(fs.readFileSync(file));
});
// Port 0: a free port of our own.
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL0 = `http://127.0.0.1:${server.address().port}/gallery/evgui/demo/index.html?demo=select`;
const { chromium } = requireHostTool("playwright-core");
const browser = await chromium.launch({ executablePath: findChromium() || undefined });

const openPage = async (vp) => {
  const mobile = vp.width < 500;
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  const page = await ctx.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("uncaught: " + e.message.split("\n")[0]));
  page.on("console", (m) => { if (m.type() === "error") problems.push("console.error: " + m.text().split("\n")[0]); });
  await page.goto(URL0, { waitUntil: "networkidle" });
  await page.waitForFunction("document.querySelector('#stage canvas') && document.querySelector('#stage canvas').width > 100 && window.__slState", null, { timeout: 30000 });
  await page.waitForTimeout(300);
  return { ctx, page, problems };
};
const pstate = async (page) => {
  const p = (await page.evaluate(() => window.__slState())).split("|");
  const o = {};
  KEYS.forEach((k, i) => { o[k] = p[i]; });
  o.open = p[7]; o.active = p[8]; o.focus = p[9]; o.invalid = p[10] === "invalid";
  return o;
};
// The centre of a demo element in the window, scrolled into view first.
const centre = async (page, id) => {
  return page.evaluate((i) => {
    const b = String(window.__slBox(i) || "").split(",").map(Number);
    if (b.length !== 4) return null;
    const c = document.querySelector("#stage canvas");
    const s = window.__stageScale || 1;
    let r = c.getBoundingClientRect();
    const y = r.y + (b[1] + b[3] / 2) * s;
    if (y < 90 || y > innerHeight - 90) { window.scrollBy(0, y - innerHeight / 2); r = c.getBoundingClientRect(); }
    return [r.x + (b[0] + b[2] / 2) * s, r.y + (b[1] + b[3] / 2) * s];
  }, id);
};
const pclick = async (page, id) => {
  const p = await centre(page, id);
  if (!p) return false;
  if (page.context()._options && page.context()._options.hasTouch) await page.touchscreen.tap(p[0], p[1]);
  else await page.mouse.click(p[0], p[1]);
  await page.waitForTimeout(120);
  return true;
};
const mirror = (page, id) => page.evaluate((i) => {
  const el = document.querySelector(`[data-a11y-id="${i}"]`);
  if (!el) return null;
  const a = {};
  for (const n of el.getAttributeNames()) a[n] = el.getAttribute(n);
  return a;
}, id);

console.log("--- the real page, 1440 ---");
{
  const { ctx, page, problems } = await openPage({ width: 1440, height: 900 });
  const drawn = await page.evaluate(() => (window.__lastList || "").length);
  ok("page: the demo draws", drawn > 1000);
  const sheetProblems = await page.evaluate((css) => window.__styles.validate(css), CSS);
  ok("page: the Styles panel finds no problem in select.css", Array.isArray(sheetProblems) && sheetProblems.length === 0, sheetProblems);
  const trig = await mirror(page, "sl-fruit-trigger");
  ok("page: the trigger is a combobox in the mirror with aria-haspopup=listbox, aria-expanded=false, named by its label",
    trig && trig.role === "combobox" && trig["aria-haspopup"] === "listbox" && trig["aria-expanded"] === "false" && trig["aria-label"] === "Favorite Fruit", trig);
  await pclick(page, "sl-fruit-trigger");
  let s = await pstate(page);
  ok("page: a click opens it", s.open === "sl-fruit", s);
  await page.waitForTimeout(100);
  const lb = await mirror(page, "sl-fruit-content");
  const opt = await mirror(page, "sl-fruit-item-none");
  const trig2 = await mirror(page, "sl-fruit-trigger");
  ok("page: listbox and options with aria-selected", lb && lb.role === "listbox" && opt && opt.role === "option" && opt["aria-selected"] === "true", { lb, opt });
  ok("page: the trigger says expanded and controls the list", trig2 && trig2["aria-expanded"] === "true" && !!trig2["aria-controls"], trig2);
  ok("page: the DOM focus is on the highlighted option", await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-a11y-id")) === "sl-fruit-item-none");
  // Hover through the page's pointer handler.
  const hp = await centre(page, "sl-fruit-item-grapes");
  await page.mouse.move(hp[0], hp[1]);
  await page.waitForTimeout(120);
  ok("page: hover highlights", (await pstate(page)).active === "grapes");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
  s = await pstate(page);
  ok("page: ArrowDown + Enter from the keyboard chooses Pineapple and closes", s.fruit === "pineapple" && s.open === "" && s.focus === "sl-fruit-trigger", s);
  ok("page: the DOM focus is back on the trigger", await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-a11y-id")) === "sl-fruit-trigger");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("b");
  await page.waitForTimeout(80);
  ok("page: typeahead from the keyboard", (await pstate(page)).active === "banana");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(150);
  s = await pstate(page);
  ok("page: Tab closes the list and moves to the next stop", s.open === "" && s.focus !== "" && s.focus !== "sl-fruit-trigger" && s.fruit === "pineapple", s);
  ok("page: …the form's select", s.focus === "sl-form-trigger", s.focus);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(150);
  s = await pstate(page);
  ok("page: tabbing past the empty form select shows its error", s.invalid && s.focus === "sl-submit", s);
  const ftr = await mirror(page, "sl-form-trigger");
  ok("page: aria-invalid on the trigger in the mirror", ftr && ftr["aria-invalid"] === "true", ftr);
  // Multiple in the mirror.
  await pclick(page, "sl-status-trigger");
  await page.waitForTimeout(100);
  const ms = await mirror(page, "sl-status-content");
  ok("page: the status list is aria-multiselectable", ms && ms["aria-multiselectable"] === "true", ms);
  await pclick(page, "sl-status-item-canceled");
  s = await pstate(page);
  ok("page: a click toggles and the list stays open", s.open === "sl-status" && s.status.split(",").length === 6, s);
  await page.keyboard.press("Escape");
  // Groups in the mirror.
  await pclick(page, "sl-tz-trigger");
  await page.waitForTimeout(100);
  const grp = await mirror(page, "sl-tz-group-1");
  ok("page: a group is role=group, named by its heading", grp && grp.role === "group" && grp["aria-label"] === "Europe", grp);
  // Outside click through the page.
  await pclick(page, "sl-basic-caption");
  ok("page: a click outside closes it", (await pstate(page)).open === "");
  ok("page: no errors", problems.length === 0, problems);
  await ctx.close();
}

console.log("--- the real page, 390 ---");
{
  const { ctx, page, problems } = await openPage({ width: 390, height: 844 });
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
  ok("390: no horizontal scroll", scrollW <= 390, scrollW);
  const size = await page.evaluate(() => { const c = document.querySelector("#stage canvas"); return { w: c.getBoundingClientRect().width, s: window.__stageScale || 1 }; });
  ok("390: the demo is laid out for the phone (not scaled down)", size.s === 1 && size.w <= 390, size);
  await pclick(page, "sl-small-trigger");
  let s = await pstate(page);
  ok("390: a tap opens the last list", s.open === "sl-small", s);
  const tb = (await page.evaluate(() => window.__slBox("sl-small-trigger"))).split(",").map(Number);
  const pb = (await page.evaluate(() => window.__slBox("sl-small-content"))).split(",").map(Number);
  ok("390: …and it flips above its trigger", pb[1] + pb[3] <= tb[1] + 0.5, { tb, pb });
  await pclick(page, "sl-small-item-apple");
  s = await pstate(page);
  ok("390: a tap on a row chooses", s.small === "apple" && s.open === "", s);
  await pclick(page, "sl-users-trigger");
  const ub = (await page.evaluate(() => window.__slBox("sl-users-content"))).split(",").map(Number);
  ok("390: the avatar list fits the width", ub[0] >= 0 && ub[0] + ub[2] <= 390, ub);
  ok("390: no errors", problems.length === 0, problems);
  await ctx.close();
}

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
console.log(failed ? "RESULT FAIL" : "RESULT PASS");
process.exit(failed ? 1 : 0);

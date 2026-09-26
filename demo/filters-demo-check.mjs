#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The filter demo: that it lays out, that a pointer can reach every part of a
// chip, and that clicking one CHANGES THE ANSWER on the screen.
//
//   node gallery/evgui/demo/filters-demo-check.mjs
//
// `ui:filters:check` gates the controller against @tanstack/table-core — 121
// assertions — and draws nothing. This is the other half, and it exists
// because of a specific failure this project has already had once: the text
// field's click-to-caret worked in the controller AND in the demo's own API
// while `main.js` dropped the coordinate, so every gate was green and nobody
// could click into a field. A controller nobody can reach is indistinguishable
// from a broken one.
//
// So every interaction below goes through `hitId(x, y)` at a real coordinate
// read off the laid-out tree. Calling `press("seed-1-value")` directly would
// re-test the controller and prove nothing about the surface.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/FilterDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "filters.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
};
// `ok` takes a CONDITION. Calling it as `ok(name, got, want)` passes for any
// non-empty string, and seven assertions here were written that way and were
// green against nothing — found because the one line that used `===` disagreed
// with the line above it that did not. `eq` is the two-value form, and the
// two are now different names so they cannot be confused again.
const eq = (name, got, want) => {
  const good = String(got) === String(want);
  if (good) { passed++; console.log("  PASS " + name + ": " + got); }
  else { failed++; console.log("  FAIL " + name + ": " + got + "   want " + want); }
};

const fresh = () => {
  const d = new M.FilterDemo();
  d.init(CSS);
  d.displayListJson();
  return d;
};
const flat = (d) => {
  const out = [];
  const walk = (el) => { out.push(el); for (const k of el.children) walk(k); };
  walk(d.root);
  return out;
};
const byId = (d, id) => flat(d).find((e) => e.id === id);
// The display list is `{cmds:[...]}`; a text command carries `text` and its
// colour as `c` = [r,g,b,a].
const cmds = (d) => JSON.parse(d.displayListJson()).cmds;
const texts = (d) => cmds(d).filter((c) => c.text !== undefined).map((c) => c.text);
const rgba = (c) => (c ? c.join(",") : "(none)");
const countText = (d) => texts(d).find((t) => / of \d+ tasks$/.test(t));
// A whole-token test: "fd-row-text" contains "fd-row" as a substring, so
// `includes` counted every row twice — once for the box and once for its label.
const hasClass = (el, c) => new RegExp("(^|\\s)" + c + "(\\s|$)").test(el.className || "");
const rows = (d) => flat(d).filter((e) => hasClass(e, "fd-row")).map((e) => e.id);

// Click where a thing IS, not where it is registered.
const clickOn = (d, id) => {
  const el = byId(d, id);
  if (!el) return { hit: "(no such element)", handled: false };
  const cx = el.calculatedX + el.calculatedWidth / 2;
  const cy = el.calculatedY + el.calculatedHeight / 2;
  const hit = d.hitId(cx, cy);
  const handled = d.press(hit);
  d.displayListJson();
  return { hit, handled };
};

console.log("the stylesheet and the tree");
{
  const d = fresh();
  const errs = [];
  for (let i = 0; i < d.styleErrorCount(); i++) errs.push(d.styleErrorAt(i));
  ok("parses with no errors", errs.length === 0, errs.join("; "));
  ok("the accessible tree lints clean", Array.from(d.a11yProblems()).length === 0,
    Array.from(d.a11yProblems()).join(" | "));
}

console.log("the bar is drawn, and the overflow is on the screen");
{
  const d = fresh();
  const t = texts(d);
  // The "+1" is the whole reason the assignee chip holds four values: a demo
  // that never overflows never shows the rule that collapses it.
  ok("the four-value chip collapses to three and a +1", t.includes("Ada, Grace, Alan +1"), t.join(" / "));
  ok("the priority chip reads its label, not its stored id", t.includes("Urgent"), t.join(" / "));
  eq("the count is on the page", countText(d), "2 of 6 tasks");
  eq("and the rows under it are the ones that match", rows(d).join(","), "row-r1,row-r4");
}

console.log("every part of a chip is reachable by the pointer");
{
  const d = fresh();
  for (const part of ["seed-1-field", "seed-1-op", "seed-1-value", "seed-1-menu-trigger", "seed-2-value", "add"]) {
    const el = byId(d, part);
    const cx = el.calculatedX + el.calculatedWidth / 2;
    const cy = el.calculatedY + el.calculatedHeight / 2;
    ok(`${part} answers at its centre`, d.hitId(cx, cy) === part, `got [${d.hitId(cx, cy)}]`);
  }
  // The chip parts must not overlap: a hit at the left edge of the operator
  // must not land on the field name beside it.
  const op = byId(d, "seed-1-op");
  ok("and the parts do not overlap each other",
    d.hitId(op.calculatedX + 1, op.calculatedY + op.calculatedHeight / 2) === "seed-1-op",
    `got [${d.hitId(op.calculatedX + 1, op.calculatedY + op.calculatedHeight / 2)}]`);
}

console.log("clicking changes the answer");
{
  const d = fresh();
  eq("starts at two matches", countText(d), "2 of 6 tasks");

  // Open the priority list by clicking where the value is.
  const open = clickOn(d, "seed-2-value");
  ok("clicking the value opens its list", open.handled && byId(d, "seed-2-list") !== undefined,
    `hit [${open.hit}]`);
  ok("and the list holds the field's options", byId(d, "seed-2-opt-low") !== undefined);

  // Pick a different priority. `is` is a one-value operator, so this REPLACES.
  const pick = clickOn(d, "seed-2-opt-low");
  ok("clicking an option is handled", pick.handled, `hit [${pick.hit}]`);
  ok("the chip now reads the new value", texts(d).includes("Low"), texts(d).join(" / "));
  // r3 has no assignee so it fails the other chip; r6 is Ada's and low.
  eq("and the result list changed with it", rows(d).join(","), "row-r6");
  eq("as does the count", countText(d), "1 of 6 tasks");
}

console.log("a chosen option is legible, not black on black");
{
  const d = fresh();
  clickOn(d, "seed-2-value");
  d.displayListJson();
  const chosen = byId(d, "seed-2-opt-urgent");
  const label = chosen.children[0];
  // EVGStyleSheet has no descendant selectors, so the label needs its own
  // token. This is the assertion that catches the version where it does not.
  ok("the chosen option's label carries its own class",
    (label.className || "").includes("fd-opt-text-chosen"), label.className);
  // The drawn colours, not the class names: a token that exists but resolves
  // to the same colour is the bug this is looking for. The rectangle under the
  // chosen row and the glyphs on top of it must differ.
  const all = cmds(d);
  const inRow = (c) =>
    c.y >= chosen.calculatedY - 1 && c.y <= chosen.calculatedY + chosen.calculatedHeight + 1;
  const box = all.find((c) => c.text === undefined && inRow(c) && c.w >= chosen.calculatedWidth - 2);
  const glyphs = all.find((c) => c.text === "Urgent" && inRow(c));
  ok("the option's fill and its label are drawn in different colours",
    box !== undefined && glyphs !== undefined && rgba(box.c) !== rgba(glyphs.c),
    `${box && rgba(box.c)} vs ${glyphs && rgba(glyphs.c)}`);
}

console.log("the chip's three dots open a menu, and removing is IN it");
{
  // Reported: the ⋮ button deleted the chip outright. Three dots promise a
  // menu, as in the reference, so clicking one must open the chip's actions
  // and leave the chip exactly where it was.
  const d = fresh();
  const open = clickOn(d, "seed-2-menu-trigger");
  ok("clicking ⋮ is handled", open.handled, `hit [${open.hit}]`);
  ok("and the chip is still on the page", byId(d, "seed-2") !== undefined);
  eq("with the answer unchanged", countText(d), "2 of 6 tasks");
  ok("a menu surface opened", byId(d, "seed-2-menu-content") !== undefined);
  const t = texts(d);
  for (const label of ["Change operator", "Edit value", "Clear value", "Remove filter"]) {
    ok(`the menu offers "${label}"`, t.includes(label), t.join(" / "));
  }
  eq("focus is on the menu surface, as Radix puts it", d.focused, "seed-2-menu-content");
  const trig = byId(d, "seed-2-menu-trigger");
  const surf = byId(d, "seed-2-menu-content");
  ok("the menu hangs under its button",
    surf.calculatedY >= trig.calculatedY + trig.calculatedHeight - 1,
    `button bottom ${trig.calculatedY + trig.calculatedHeight}, menu top ${surf.calculatedY}`);

  // Removing, through the menu item.
  const gone = clickOn(d, "seed-2-menu-item-remove");
  ok("clicking Remove filter is handled", gone.handled, `hit [${gone.hit}]`);
  ok("the chip is off the page", byId(d, "seed-2") === undefined);
  ok("and the menu with it", byId(d, "seed-2-menu-content") === undefined);
  // Only the assignee chip is left: everyone but r3 has an assignee in it.
  eq("and the answer widens", countText(d), "5 of 6 tasks");
}

console.log("a press outside the open menu only closes it");
{
  const d = fresh();
  clickOn(d, "seed-2-menu-trigger");
  const out = clickOn(d, "seed-1-value");
  ok("the press is taken", out.handled);
  ok("the menu closed", byId(d, "seed-2-menu-content") === undefined);
  ok("and the press did not also open the value list underneath", byId(d, "seed-1-list") === undefined);
}

console.log("the menu by keyboard");
{
  const d = fresh();
  d.setFocus("seed-2-menu-trigger");
  ok("Enter on ⋮ opens it", d.key("Enter") && byId(d.displayListJson() && d, "seed-2-menu-content") !== undefined);
  d.key("ArrowDown");
  eq("ArrowDown enters at the first row", d.focused, "seed-2-menu-item-operator");
  // The highlight is `:focus`, and it has to be DRAWN: the row the arrows are
  // on gets a fill no other row has.
  d.displayListJson();
  const row = byId(d, "seed-2-menu-item-operator");
  const fills = cmds(d).filter((c) => c.text === undefined &&
    Math.abs(c.y - row.calculatedY) < 1 && Math.abs(c.h - row.calculatedHeight) < 1);
  ok("and the focused row is painted with a highlight", fills.length > 0, JSON.stringify(row && [row.calculatedY, row.calculatedHeight]));
  d.key("ArrowRight");
  eq("ArrowRight opens the operator submenu at its first row", d.focused, "seed-2-menu-item-operator-item-is");
  d.key("ArrowDown");
  d.key("Enter");
  ok("Enter on 'is not' closes the menu", byId(d.displayListJson() && d, "seed-2-menu-content") === undefined);
  eq("and focus is back on ⋮", d.focused, "seed-2-menu-trigger");
  ok("the chip now reads 'is not'", texts(d).includes("is not"), texts(d).join(" / "));
  eq("and the answer flipped", countText(d), "3 of 6 tasks");

  d.key(" ");
  d.displayListJson();
  ok("Space opens it again", byId(d, "seed-2-menu-content") !== undefined);
  d.key("Escape");
  d.displayListJson();
  ok("Escape closes it", byId(d, "seed-2-menu-content") === undefined);
  eq("and returns focus to ⋮", d.focused, "seed-2-menu-trigger");

  // Clear value: the rule stays, with nothing chosen, and stops filtering.
  d.key("Enter");
  d.key("ArrowDown"); d.key("ArrowDown"); d.key("ArrowDown");
  eq("the third row is Clear value", d.focused, "seed-2-menu-item-clear");
  d.key("Enter");
  d.displayListJson();
  ok("the chip survives a clear", byId(d, "seed-2") !== undefined);
  eq("and no longer narrows anything", countText(d), "5 of 6 tasks");
}

console.log("the keyboard reaches the bar");
{
  const d = fresh();
  ok("ArrowRight is taken", d.key("ArrowRight"));
  d.displayListJson();
  // Nothing was focused, so the tab stop was already on the first chip and the
  // first ArrowRight has to MOVE — the defect the controller gate caught.
  eq("and moves off the first chip", d.model.activeId, "seed-2");
  ok("End reaches the add button", d.key("End") && d.model.activeId === "add", d.model.activeId);
  ok("Backspace on the add button does nothing", d.key("Backspace") === false);
  d.key("Home");
  d.displayListJson();
  ok("Backspace on a chip removes it", d.key("Backspace"));
  d.displayListJson();
  ok("the chip is gone from the page", byId(d, "seed-1") === undefined);
  eq("and the answer follows", countText(d), "2 of 6 tasks");
}

console.log(`\npassed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
console.log("ALL PASS");

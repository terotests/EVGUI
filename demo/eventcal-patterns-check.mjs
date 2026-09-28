#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// ReUI's two event-calendar patterns on the eventcal page: that every setting
// changes the calendar, and that the three drag gestures do what they say.
//
//   node gallery/evgui/demo/eventcal-patterns-check.mjs
//
// Pattern A ("ea-") is the full calendar with its Settings popover; Pattern B
// ("eb-") the hotel's resource day. Everything is driven the way the page
// drives it — a hit test, then `pointerDown` / `pointerMove` / `pointerUp` at
// pixel positions, or `keyWith` — and read back off the laid-out tree and
// `EventCalCtl`'s events, so a setting that only changes a switch's picture
// fails here.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);
const M = require(path.join(ROOT, "gallery/evgui/bin/EventCalDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "eventcal.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + detail : "")); }
};
const eq = (name, got, want) => {
  const good = String(got) === String(want);
  if (good) { passed++; console.log("  PASS " + name + ": " + got); }
  else { failed++; console.log("  FAIL " + name + ": " + got + "   want " + want); }
};

const fresh = (w) => {
  const d = new M.EventCalDemo();
  d.init(CSS);
  if (w) { d.pageW = w; d.layout = undefined; }
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
const cls = (e) => (e.className || "").split(/\s+/);
const withClass = (d, c, under) => {
  const out = [];
  const walk = (el) => { if (cls(el).includes(c)) out.push(el); for (const k of el.children) walk(k); };
  walk(under || d.root);
  return out;
};
const text = (el) => {
  let s = el.textContent || "";
  for (const k of el.children) s += text(k);
  return s;
};
const hex = (c) => c ? "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("") : "";
const centre = (e) => [e.calculatedX + e.calculatedWidth / 2, e.calculatedY + e.calculatedHeight / 2];
// A click where the page would click: the hit test decides what is pressed.
const click = (d, id) => {
  d.displayListJson();
  const e = byId(d, id);
  if (!e) throw new Error("not drawn: " + id);
  const [x, y] = centre(e);
  const hit = d.hitId(x, y);
  d.pointerDown(hit, x, y);
  d.pointerUp();
  d.displayListJson();
  return hit;
};
// A drag from a point inside `id` (fractions of its box) by dx, dy pixels.
const drag = (d, id, dx, dy, fx = 0.5, fy = 0.25, finish = true) => {
  d.displayListJson();
  const e = byId(d, id);
  if (!e) throw new Error("not drawn: " + id);
  const x = e.calculatedX + e.calculatedWidth * fx;
  const y = e.calculatedY + e.calculatedHeight * fy;
  const hit = d.hitId(x, y);
  d.pointerDown(hit, x, y);
  for (let i = 1; i <= 10; i++) { d.pointerMove(x + (dx * i) / 10, y + (dy * i) / 10); d.displayListJson(); }
  if (finish) { d.pointerUp(); d.displayListJson(); }
  return hit;
};
const A = (d) => d.boardA;
const B = (d) => d.boardB;
const ev = (b, id) => b.model.event(id);
const pickView = (d, v) => { click(d, "ea-view-trigger"); click(d, "ea-view-item-" + v); };
const openSettings = (d, tab) => {
  if (!A(d).settings.open) click(d, "ea-set-trigger");
  if (tab) click(d, "ea-set-tabs-tab-" + tab);
};
const choose = (d, key, value) => { click(d, "ea-set-" + key + "-trigger"); click(d, "ea-set-" + key + "-item-" + value); };
const toggle = (d, tab, key) => { openSettings(d, tab); click(d, "ea-set-sw-" + key); };
const nodes = (d) => JSON.parse(d.a11yJson(1, d.focused || "")).nodes;
const statusA = (d) => A(d).status;
const cols = (d) => flat(d).filter((e) => /^ea-col-\d+$/.test(e.id));

// Monday 28 September 2026, the demo's today; its week's Sunday is the 27th.
const MON = 20724;

console.log("the page");
{
  const d = fresh();
  const errs = [];
  for (let i = 0; i < d.styleErrorCount(); i++) errs.push(d.styleErrorAt(i));
  ok("the stylesheet parses clean", errs.length === 0, errs.join("; "));
  ok("the accessible tree lints clean", Array.from(d.a11yProblems()).length === 0, Array.from(d.a11yProblems()).join(" | "));
  eq("today is Monday 28 September 2026", A(d).today, MON);
  ok("the two patterns come first, then the measured week",
    byId(d, "ea-card").calculatedY < byId(d, "eb-card").calculatedY && byId(d, "eb-card").calculatedY < byId(d, "ec-caption").calculatedY);
}

console.log("Pattern A: the month, as the image draws it");
{
  const d = fresh();
  eq("the default view is the month", A(d).view, "month");
  eq("the title", text(byId(d, "ea-title")), "September 2026");
  eq("six weeks of seven cells", flat(d).filter((e) => /^ea-cell-\d+$/.test(e.id)).length, 42);
  ok("today's number is a filled circle", cls(byId(d, "ea-num-" + MON)).includes("eb-daynum-today"));
  const sync = byId(d, "ea-chip-e1");
  eq("month chips are tinted with their colour", hex(byId(d, "ea-chip-e3").backgroundColor), "#e2f7f0");
  ok("Team sync is a neutral chip: grey tint, dot, title and a grey time",
    withClass(d, "eb-dot", sync).length === 1 && withClass(d, "eb-chiptime", sync).length === 1
      && text(withClass(d, "eb-chiptime", sync)[0]) === "9:00 AM", text(sync));
  const dr = byId(d, "ea-chip-e2");
  ok("Design review: two avatars (MJ, AL) and a bold title, no time",
    withClass(d, "eb-avatar", dr).length === 2 && text(dr).startsWith("MJAL") && withClass(d, "eb-chiptx-bold", dr).length === 1
      && withClass(d, "eb-chiptime", dr).length === 0, text(dr));
  const cc = byId(d, "ea-chip-e5");
  ok("Client call: a dot, the title and the 30m pill", withClass(d, "eb-pill", cc).length === 1 && text(cc).endsWith("30m"), text(cc));
  const cell = byId(d, "ea-cell-" + MON);
  const off = byId(d, "ea-chip-e6");
  ok("Team offsite runs Thursday and Friday as one bar", Math.abs(off.calculatedWidth - (2 * cell.calculatedWidth - 8)) < 2,
    `${off.calculatedWidth} vs cell ${cell.calculatedWidth}`);
  ok("a title too long for its chip ends in an ellipsis", /…$/.test(text(withClass(d, "eb-chiptx", byId(d, "ea-chip-e4"))[0])),
    text(byId(d, "ea-chip-e4")));
  const n = byId(d, "ea-num-" + MON);
  ok("the day number sits bottom right of its cell",
    n.calculatedX + n.calculatedWidth > cell.calculatedX + cell.calculatedWidth - 12 && n.calculatedY + n.calculatedHeight > cell.calculatedY + cell.calculatedHeight - 12);
  // Five more events on Tuesday overflow its lanes into "+N more".
  for (let i = 0; i < 4; i++) A(d).model.addEvent("x" + i, "Extra " + i, MON + 1, 600 + i * 30, 630 + i * 30, "alex", "blue");
  d.rebuild(); d.displayListJson();
  const more = byId(d, "ea-more-" + (MON + 1));
  ok("a crowded day says how many more", !!more && /^\+\d+ more$/.test(text(more)), more && text(more));
  click(d, "ea-more-" + (MON + 1));
  ok("and opens that day", A(d).view === "day" && A(d).cursor === MON + 1, `${A(d).view} ${A(d).cursor}`);
  eq("the arrows step a month in the month", (() => { const e = fresh(); click(e, "ea-next"); return text(byId(e, "ea-title")); })(), "October 2026");
}

console.log("Pattern A: the view switcher draws six calendars");
{
  const d = fresh();
  click(d, "ea-view-trigger");
  eq("the switcher lists six views", flat(d).filter((e) => e.role === "option" && e.id.startsWith("ea-view-item-")).length, 6);
  click(d, "ea-view-item-week");
  eq("week: seven columns", cols(d).length, 7);
  eq("week: its title", text(byId(d, "ea-title")), "Sep 27 – Oct 3, 2026");
  pickView(d, "day");
  eq("day: one column", cols(d).length, 1);
  eq("day: its title", text(byId(d, "ea-title")), "Monday, September 28, 2026");
  pickView(d, "ndays");
  eq("N days: three columns", cols(d).length, 3);
  click(d, "ea-next");
  eq("and the arrows step three days", A(d).cursor, MON + 3);
  click(d, "ea-today");
  pickView(d, "agenda");
  const rows = flat(d).filter((e) => e.id.startsWith("ea-ag-"));
  ok("agenda: a row per event over the next 30 days", rows.length >= 6, rows.map((r) => r.id).join(","));
  ok("agenda rows carry the time", rows.some((r) => text(r).includes("9:00 AM - 9:30 AM")), rows.map(text).join(" | "));
  pickView(d, "resource");
  eq("resource: a column per person", cols(d).length, 3);
  ok("named Alex, Mia and Sam", ["Alex", "Mia", "Sam"].every((n) => flat(d).some((e) => e.textContent === n)));
  ok("Team sync sits in Alex's column", byId(d, "ea-ev-e1") && byId(d, "ea-col-0").children.includes(byId(d, "ea-ev-e1")));
}

console.log("Pattern A: Settings — the popover and its tabs");
{
  const d = fresh();
  click(d, "ea-set-trigger");
  const pop = byId(d, "ea-set-content");
  ok("Settings opens a dialog", pop && pop.role === "dialog" && A(d).settings.open);
  eq("focus lands on the selected tab", d.focused, "ea-set-tabs-tab-view");
  eq("it is 320 wide", Math.round(pop.calculatedWidth), 320);
  const trig = byId(d, "ea-set-trigger");
  ok("aligned to the trigger's end, 8px under it",
    Math.abs(pop.calculatedX + pop.calculatedWidth - (trig.calculatedX + trig.calculatedWidth)) < 1.5
      && Math.abs(pop.calculatedY - (trig.calculatedY + trig.calculatedHeight + 8)) < 1.5,
    `${pop.calculatedX},${pop.calculatedY} vs ${trig.calculatedX},${trig.calculatedY}`);
  eq("in the month: View, Behavior and Region", flat(d).filter((e) => e.role === "tab").map((e) => e.a11yLabel).join(","), "View,Behavior,Region");
  eq("five switches and Week starts on View", flat(d).filter((e) => e.role === "switch").length, 5);
  ok("and Reset to defaults", !!byId(d, "ea-set-reset"));
  d.keyWith("ArrowRight", false, false); d.displayListJson();
  eq("arrow keys move along the tabs", d.focused, "ea-set-tabs-tab-behavior");
  eq("and select", A(d).tabs.value, "behavior");
  d.keyWith("Escape", false, false); d.displayListJson();
  ok("Escape closes it and gives the focus back to Settings", !A(d).settings.open && d.focused === "ea-set-trigger", d.focused);
  pickView(d, "week");
  click(d, "ea-set-trigger");
  eq("in a time grid, Time grid joins them", flat(d).filter((e) => e.role === "tab").map((e) => e.a11yLabel).join(","), "View,Time grid,Behavior,Region");
  click(d, "ea-today");
  ok("a press outside closes it (and still presses)", !A(d).settings.open);
}

console.log("Pattern A: View settings take effect");
{
  let d = fresh();
  toggle(d, "view", "weekends");
  ok("the switch reads off", byId(d, "ea-set-sw-weekends").a11yChecked === 1);
  eq("weekends off: a month of five columns", withClass(d, "eb-mheadcell").length, 5);
  ok("with no Saturday or Sunday in it", !byId(d, "ea-cell-" + (MON - 1)) && !byId(d, "ea-cell-" + (MON + 5)));
  pickView(d, "week");
  eq("and a week of five", cols(d).length, 5);

  d = fresh();
  toggle(d, "view", "weeknum");
  ok("week numbers: every month row is numbered", withClass(d, "eb-wn").length === 6 && text(withClass(d, "eb-wn")[4]) === "W40",
    withClass(d, "eb-wn").map(text).join(","));
  pickView(d, "week");
  ok("and the week names its number", flat(d).some((e) => e.textContent === "W40"));

  d = fresh();
  pickView(d, "week");
  ok("now indicator: a line in today's column", !!byId(d, "ea-now-1"));
  toggle(d, "view", "now");
  ok("off: gone", !byId(d, "ea-now-1"));

  d = fresh();
  toggle(d, "view", "off");
  ok("mark off days: the month shades its weekends", withClass(d, "eb-shade").length === 12, String(withClass(d, "eb-shade").length));
  pickView(d, "week");
  ok("and the week its Saturday and Sunday columns",
    cls(byId(d, "ea-col-0")).includes("eb-col-off") && cls(byId(d, "ea-col-6")).includes("eb-col-off") && !cls(byId(d, "ea-col-1")).includes("eb-col-off"));

  d = fresh();
  toggle(d, "view", "add");
  ok("day add button: one in every cell", flat(d).filter((e) => /^ea-add-\d+$/.test(e.id)).length === 42);
  const before = A(d).model.events.length;
  click(d, "ea-add-" + (MON + 2));
  const made = A(d).model.events[A(d).model.events.length - 1];
  ok("pressing it adds an hour at noon on that day",
    A(d).model.events.length === before + 1 && made.startDay === MON + 2 && made.startMin === 720 && made.endMin === 780, JSON.stringify([made.startDay, made.startMin]));
  eq("and the month stays", A(d).view, "month");

  d = fresh();
  openSettings(d, "view");
  choose(d, "ws", "1");
  eq("week starts Monday: the month's first column", text(withClass(d, "eb-mheadcell")[0]), "Mon");
  pickView(d, "week");
  eq("and the week's first day", A(d).gridDays()[0], MON);
  eq("with its title", text(byId(d, "ea-title")), "Sep 28 – Oct 4, 2026");
}

console.log("Pattern A: Time grid settings take effect");
{
  const d = fresh();
  pickView(d, "week");
  eq("a whole day is 24 hours of 48px", Math.round(byId(d, "ea-col-0").calculatedHeight), 24 * 48);
  openSettings(d, "grid");
  choose(d, "ds", "8");
  eq("day starts at 08:00: 16 hours", Math.round(byId(d, "ea-col-0").calculatedHeight), 16 * 48);
  ok("and the first hour label is 9 AM", text(withClass(d, "eb-hour", byId(d, "ea-scroll"))[0]) === "9 AM");
  choose(d, "de", "18");
  eq("day ends at 18:00: 10 hours", Math.round(byId(d, "ea-col-0").calculatedHeight), 10 * 48);
  const e1 = byId(d, "ea-ev-e1");
  ok("Team sync (9:00) now sits an hour below the top", Math.abs(e1.calculatedY - byId(d, "ea-col-1").calculatedY - 49) < 2,
    `${e1.calculatedY} vs ${byId(d, "ea-col-1").calculatedY}`);
  const halfBefore = withClass(d, "eb-line-half").length;
  choose(d, "gi", "30");
  ok("grid interval 30: half-hour lines appear", halfBefore === 0 && withClass(d, "eb-line-half").length === 7 * 10, String(withClass(d, "eb-line-half").length));
  eq("and an hour grows to 64px", Math.round(byId(d, "ea-col-0").calculatedHeight), 10 * 64);
  choose(d, "sn", "5");
  eq("drag snap 5 min reaches the model", A(d).model.snapMinutes, 5);
}

console.log("Pattern A: drag to move, resize and create in a week");
{
  const d = fresh();
  pickView(d, "week");
  const e2 = ev(A(d), "e2");
  eq("Design review starts Tuesday 11:00", `${e2.startDay}/${e2.startMin}/${e2.endMin}`, `${MON + 1}/660/720`);
  drag(d, "ea-ev-e2", 0, 60);
  // 60px at 48px an hour is 75 minutes: 12:15 on a 15-minute snap.
  eq("dragged down 60px it moves 75 minutes, snapped", `${e2.startMin}/${e2.endMin}`, "735/795");
  ok("the move is announced", /^Moved Design review, Tuesday, September 29, 2026, 12:15 PM - 1:15 PM/.test(statusA(d)), statusA(d));
  eq("and the event keeps the focus", d.focused, "ea-ev-e2");
  const colW = byId(d, "ea-col-3").calculatedWidth;
  drag(d, "ea-ev-e2", colW, 0);
  eq("dragged one column right, it moves a day", e2.startDay, MON + 2);
  eq("at the same time", e2.startMin, 735);
  drag(d, "ea-rz-e2", 0, 48, 0.5, 0.5);
  eq("the bottom edge dragged 48px adds an hour", `${e2.startMin}/${e2.endMin}`, "735/855");
  drag(d, "ea-rz-e2", 0, -200, 0.5, 0.5);
  eq("and never shrinks below one snap", e2.endMin - e2.startMin, 15);
  const before = A(d).model.events.length;
  const col4 = byId(d, "ea-col-4");
  const y13 = col4.calculatedY + 13 * 48 + 2;
  const x = col4.calculatedX + col4.calculatedWidth / 2;
  const hit = d.hitId(x, y13);
  eq("an empty slot is the column itself", hit, "ea-col-4");
  d.pointerDown(hit, x, y13);
  for (let i = 1; i <= 10; i++) d.pointerMove(x, y13 + 9.6 * i);
  d.pointerUp(); d.displayListJson();
  const made = A(d).model.events[A(d).model.events.length - 1];
  ok("drag to create: a new event where the drag ran", A(d).model.events.length === before + 1 && made.startDay === MON + 3,
    JSON.stringify([made && made.startDay, made && made.startMin, made && made.endMin]));
  eq("from 13:00 to two hours later, snapped", `${made.startMin}/${made.endMin}`, "780/900");
  ok("announced as created", /^Created New event/.test(statusA(d)), statusA(d));
  // Escape mid-drag puts it back.
  const e3 = ev(A(d), "e3");
  const was = `${e3.startDay}/${e3.startMin}`;
  drag(d, "ea-ev-e3", 0, 100, 0.5, 0.25, false);
  ok("mid-drag the event follows", `${e3.startDay}/${e3.startMin}` !== was);
  d.keyWith("Escape", false, false); d.pointerUp(); d.displayListJson();
  eq("Escape puts it back", `${e3.startDay}/${e3.startMin}`, was);
  ok("a click without travel does not move it, it focuses it", (() => { click(d, "ea-ev-e3"); return d.focused === "ea-ev-e3" && `${e3.startDay}/${e3.startMin}` === was; })());
}

console.log("Pattern A: the drag snap is the one set");
{
  for (const [snap, want] of [["5", 735], ["30", 750]]) {
    const d = fresh();
    pickView(d, "week");
    openSettings(d, "grid");
    choose(d, "sn", snap);
    click(d, "ea-today");
    drag(d, "ea-ev-e2", 0, 60);
    eq(`snap ${snap}: 60px lands on`, ev(A(d), "e2").startMin, want);
  }
}

console.log("Pattern A: the Behavior toggles switch the gestures off");
{
  let d = fresh();
  pickView(d, "week");
  toggle(d, "behavior", "move");
  click(d, "ea-today");
  const e2 = ev(A(d), "e2");
  drag(d, "ea-ev-e2", 0, 60);
  eq("drag to move off: the event stays", e2.startMin, 660);
  d.keyWith("ArrowDown", false, false); d.displayListJson();
  eq("and the keyboard does not move it either", e2.startMin, 660);
  ok("which is said", statusA(d) === "Moving is off", statusA(d));

  d = fresh();
  pickView(d, "week");
  toggle(d, "behavior", "resize");
  click(d, "ea-today");
  ok("drag to resize off: no bottom edge to take hold of", !byId(d, "ea-rz-e2"));

  d = fresh();
  pickView(d, "week");
  toggle(d, "behavior", "create");
  click(d, "ea-today");
  const n = A(d).model.events.length;
  const col = byId(d, "ea-col-4");
  const x = col.calculatedX + 20, y = col.calculatedY + 13 * 48;
  d.pointerDown(d.hitId(x, y), x, y);
  for (let i = 1; i <= 5; i++) d.pointerMove(x, y + 20 * i);
  d.pointerUp(); d.displayListJson();
  eq("drag to create off: nothing is created", A(d).model.events.length, n);

  d = fresh();
  pickView(d, "week");
  d.setHover("ea-ev-e2"); d.displayListJson();
  ok("tooltips off: hovering shows none", !byId(d, "ea-tip"));
  toggle(d, "behavior", "tips");
  click(d, "ea-today");
  d.setHover("ea-ev-e2"); d.displayListJson();
  const tip = byId(d, "ea-tip");
  ok("tooltips on: hovering an event shows its title, day and time", tip && tip.role === "tooltip" && text(tip).startsWith("Design review")
    && text(tip).includes("11:00 AM - 12:00 PM"), tip && text(tip));
  d.setHover(""); d.displayListJson();
  ok("and it goes with the pointer", !byId(d, "ea-tip"));
}

console.log("Pattern A: the keyboard moves and resizes the focused event");
{
  const d = fresh();
  pickView(d, "week");
  click(d, "ea-ev-e2");
  const e2 = ev(A(d), "e2");
  d.keyWith("ArrowDown", false, false);
  eq("ArrowDown moves it one snap later", e2.startMin, 675);
  d.keyWith("ArrowUp", false, false);
  d.keyWith("ArrowUp", false, false);
  eq("ArrowUp one snap earlier", e2.startMin, 645);
  d.keyWith("ArrowDown", true, false);
  eq("Shift+ArrowDown makes it one snap longer", e2.endMin, 720);
  d.keyWith("ArrowRight", false, false);
  eq("ArrowRight moves it a day", e2.startDay, MON + 2);
  ok("each announced", /^Moved Design review, Wednesday/.test(statusA(d)), statusA(d));
  const st = nodes(d).find((n) => n.id === "ea-status");
  ok("in the status region the reader hears", st && st.role === "status" && /Moved Design review/.test(st.name || ""), JSON.stringify(st));
}

console.log("Pattern A: the resource view moves between people");
{
  const d = fresh();
  pickView(d, "resource");
  const e1 = ev(A(d), "e1");
  const w = byId(d, "ea-col-1").calculatedWidth;
  drag(d, "ea-ev-e1", w, 0);
  eq("Team sync dragged one column right is Mia's", e1.resource, "mia");
  ok("and drawn in her column", byId(d, "ea-col-1").children.includes(byId(d, "ea-ev-e1")));
  d.keyWith("ArrowRight", false, false); d.displayListJson();
  eq("ArrowRight hands it on to Sam", e1.resource, "sam");
}

console.log("Pattern A: New event and Reset");
{
  const d = fresh();
  click(d, "ea-next");
  click(d, "ea-new");
  const made = A(d).model.events[A(d).model.events.length - 1];
  ok("New event: an hour at noon today, Alex's, blue", made.title === "New event" && made.startDay === MON && made.startMin === 720
    && made.endMin === 780 && made.resource === "alex" && made.color === "blue");
  eq("and the calendar goes to it", text(byId(d, "ea-title")), "September 2026");
  eq("its chip has the focus", d.focused, "ea-chip-" + made.id);
  toggle(d, "view", "weekends");
  toggle(d, "view", "weeknum");
  toggle(d, "behavior", "move");
  openSettings(d, "region");
  choose(d, "lang", "de");
  choose(d, "tz", "tokyo");
  click(d, "ea-set-reset");
  const b = A(d);
  ok("Reset to defaults puts every setting back",
    b.weekends && !b.weekNumbers && b.model.canMove && b.lang === "en" && b.tz === "browser" && ev(b, "e1").startMin === 540,
    JSON.stringify([b.weekends, b.weekNumbers, b.model.canMove, b.lang, b.tz, ev(b, "e1").startMin]));
}

console.log("Pattern A: languages");
{
  const expect = {
    de: ["Heute", "Monat", "September 2026", "Mo", "weitere", "Keine Termine", "Ganztägig"],
    fr: ["Aujourd'hui", "Mois", "septembre 2026", "lun.", "autres", "Aucun événement", "Journée entière"],
    es: ["Hoy", "Mes", "septiembre de 2026", "lun", "más", "Sin eventos", "Todo el día"],
    ja: ["今日", "月", "2026年9月", "月", "他", "予定なし", "終日"],
    ar: ["اليوم", "شهر", "سبتمبر 2026", "الاثنين", "المزيد", "لا توجد أحداث", "طوال اليوم"],
  };
  for (const [lang, [today, month, title, mon, more, none, allDay]] of Object.entries(expect)) {
    const d = fresh();
    openSettings(d, "region");
    choose(d, "lang", lang);
    click(d, "ea-title");
    const name = (id) => byId(d, id).a11yLabel || text(byId(d, id));
    eq(`${lang}: Today`, byId(d, "ea-today").a11yLabel, today);
    eq(`${lang}: the view switcher`, byId(d, "ea-view-trigger").a11yValue, month);
    eq(`${lang}: the title`, name("ea-title"), title);
    ok(`${lang}: weekday names`, withClass(d, "eb-mheadcell").some((e) => (e.a11yLabel || "").length > 0 && (e.a11yLabel === mon || text(e) === mon || e.a11yLabel.startsWith(mon))),
      withClass(d, "eb-mheadcell").map((e) => e.a11yLabel).join(","));
    for (let i = 0; i < 4; i++) A(d).model.addEvent("x" + i, "Extra " + i, MON + 1, 600 + i * 30, 630 + i * 30, "alex", "blue");
    d.rebuild(); d.displayListJson();
    const mb = byId(d, "ea-more-" + (MON + 1));
    ok(`${lang}: "+N more"`, mb && mb.a11yLabel.includes(more), mb && mb.a11yLabel);
    pickView(d, "agenda");
    for (let i = 0; i < 4; i++) click(d, "ea-next");
    const empty = byId(d, "ea-empty");
    eq(`${lang}: no events`, empty && (empty.a11yLabel || text(empty)), none);
    click(d, "ea-today");
    pickView(d, "week");
    ok(`${lang}: all day`, byId(d, "ea-allday") === undefined && flat(d).some((e) => e.role === "list" && e.a11yLabel === allDay));
    pickView(d, "month");
    ok(`${lang}: the view names`, A(d).viewSel.items.map((i) => i.name).length === 6);
  }
  const d = fresh();
  openSettings(d, "region");
  choose(d, "lang", "ar");
  click(d, "ea-title");
  const heads = withClass(d, "eb-mheadcell");
  ok("the week starts at the right edge", heads[0].calculatedX > heads[6].calculatedX, `${heads[0].calculatedX} vs ${heads[6].calculatedX}`);
  const today = byId(d, "ea-today"), newB = byId(d, "ea-new");
  ok("Today is on the right of the toolbar and New event on the left", today.calculatedX > newB.calculatedX);
  ok("the text on screen is shaped and in visual order, the name is the words",
    byId(d, "ea-title").a11yLabel === "سبتمبر 2026" && text(byId(d, "ea-title")).startsWith("2026 ") && /[ﹰ-﻿]/.test(text(byId(d, "ea-title"))),
    text(byId(d, "ea-title")));
  pickView(d, "week");
  const c0 = byId(d, "ea-col-0"), c6 = byId(d, "ea-col-6");
  ok("the week's columns run right to left", c0.calculatedX > c6.calculatedX);
  const e2 = byId(d, "ea-ev-e2"), col2 = byId(d, "ea-col-2");
  ok("and events sit inside their mirrored column", e2.calculatedX >= col2.calculatedX && e2.calculatedX + e2.calculatedWidth <= col2.calculatedX + col2.calculatedWidth + 0.5);
  const scroll = byId(d, "ea-scroll");
  const gut = withClass(d, "eb-gutter")[0];
  ok("the hour gutter is on the right", gut.calculatedX > c0.calculatedX, `${gut.calculatedX}`);
  const w = byId(d, "ea-col-3").calculatedWidth;
  drag(d, "ea-ev-e2", -w, 0);
  eq("a drag to the LEFT is a day later", ev(A(d), "e2").startDay, MON + 2);
  d.keyWith("ArrowLeft", false, false);
  eq("and so is ArrowLeft", ev(A(d), "e2").startDay, MON + 3);
  ok("the tree still lints clean in Arabic", Array.from(d.a11yProblems()).length === 0, Array.from(d.a11yProblems()).join(" | "));
}

console.log("Pattern A: time zones move every clock time");
{
  const d = fresh();
  const e1 = () => ev(A(d), "e1");
  openSettings(d, "region");
  choose(d, "tz", "tokyo");
  eq("Tokyo (UTC+9 from a UTC browser): Team sync at 18:00", `${e1().startDay}/${e1().startMin}`, `${MON}/1080`);
  choose(d, "tz", "ny");
  eq("New York (UTC-4): 5:00", e1().startMin, 300);
  choose(d, "tz", "kolkata");
  eq("Kolkata (UTC+5:30): 14:30", e1().startMin, 870);
  choose(d, "tz", "london");
  eq("London (UTC+1): 10:00", e1().startMin, 600);
  ok("the chip shows the shifted time", text(byId(d, "ea-chip-e1")).includes("10:00 AM"), text(byId(d, "ea-chip-e1")));
  choose(d, "tz", "browser");
  eq("and back: 9:00", e1().startMin, 540);
  // A shift that crosses midnight moves the event to the next day.
  choose(d, "tz", "tokyo");
  const e3 = ev(A(d), "e3");
  eq("Product demo, Wednesday 15:00, is Thursday 00:00 in Tokyo", `${e3.startDay}/${e3.startMin}`, `${MON + 3}/0`);
  const e8 = ev(A(d), "e8");
  eq("Quarterly review keeps its length", e8.endMin - e8.startMin, 90);
  // The browser's own zone is where Browser starts from.
  const h = new M.EventCalDemo();
  h.init(CSS);
  h.useClock(2026, 9, 28, 630, 180);
  h.displayListJson();
  h.boardA.setZone("tokyo");
  eq("from a UTC+3 browser, Tokyo is six hours on", h.boardA.model.event("e1").startMin, 900);
}

console.log("Pattern B: the hotel's booking board");
{
  const d = fresh();
  const b = B(d);
  eq("the title", text(byId(d, "eb-title")), "Monday, September 28, 2026");
  ok("no view switcher and no Settings", !byId(d, "eb-view-trigger") && !byId(d, "eb-set-trigger"));
  eq("a column per room", flat(d).filter((e) => /^eb-col-\d+$/.test(e.id)).length, 4);
  ok("named 101 · King to Suite 301", ["101 · King", "102 · Queen", "204 · Twin", "Suite 301"].every((n) => flat(d).some((e) => e.textContent === n)));
  eq("fourteen bookings", b.model.events.length, 14);
  eq("the card is 600px tall", Math.round(byId(d, "eb-card").calculatedHeight), 600);
  eq("the day runs 8 to 20", Math.round(byId(d, "eb-col-0").calculatedHeight), 12 * 56);
  ok("the grid scrolls inside the card", byId(d, "eb-scroll").calculatedHeight < byId(d, "eb-col-0").calculatedHeight);
  const occ = byId(d, "eb-ev-b1");
  eq("statuses are coloured: Occupied is emerald", hex(occ.backgroundColor), "#e2f7f0");
  eq("Check-out rose", hex(byId(d, "eb-ev-b2").backgroundColor), "#fee8ec");
  eq("Housekeeping cyan", hex(byId(d, "eb-ev-b3").backgroundColor), "#e1f6fa");
  eq("Check-in blue", hex(byId(d, "eb-ev-b4").backgroundColor), "#e7f0fe");
  ok("a long booking is two lines: title and time", text(occ) === "Occupied · Reed8:00 AM - 10:00 AM", text(occ));
  const co = byId(d, "eb-ev-b2");
  ok("a short one is one line, truncated", withClass(d, "eb-evtop", co).length === 1 && withClass(d, "eb-evtime-inline", co).length === 1 && /…/.test(text(co)), text(co));
  eq("the legend", withClass(d, "eb-legitem").map((e) => e.a11yLabel).join(","), "Occupied,Check-out,Housekeeping,Check-in");
  // The wheel over the grid scrolls it.
  const sc = byId(d, "eb-scroll");
  d.cursorAt(sc.calculatedX + 100, sc.calculatedY + 100);
  ok("the wheel scrolls the grid", d.scrollBy(120) && b.scroll === 120, String(b.scroll));
  d.displayListJson();
  ok("and the events move up with it", Math.abs(byId(d, "eb-ev-b1").calculatedY - (sc.calculatedY + 1 - 120)) < 2, `${byId(d, "eb-ev-b1").calculatedY}`);
  d.scrollBy(-500);
  eq("to the top and no further", b.scroll, 0);
  d.displayListJson();
  // Drag Check-in · Alvarez (101, 14:00-15:00) across to 102 and half an hour down.
  const b4 = ev(b, "b4");
  const w = byId(d, "eb-col-1").calculatedWidth;
  const s0 = byId(d, "eb-scroll");
  d.cursorAt(s0.calculatedX + 50, s0.calculatedY + 50);
  d.scrollBy(300);
  d.displayListJson();
  drag(d, "eb-ev-b4", w, 28);
  eq("a booking dragged across moves room", b4.resource, "r102");
  eq("and half an hour, snapped to 15", `${b4.startMin}/${b4.endMin}`, "870/930");
  drag(d, "eb-rz-b4", 0, 28, 0.5, 0.5);
  eq("its bottom edge resizes it", b4.endMin, 960);
  ok("the move is announced", /^Resized Check-in · Alvarez/.test(b.status), b.status);
  const n = b.model.events.length;
  const col = byId(d, "eb-col-2");
  const x = col.calculatedX + 30, y = col.calculatedY + 30;
  d.pointerDown(d.hitId(x, y), x, y);
  for (let i = 1; i <= 5; i++) d.pointerMove(x, y + 20 * i);
  d.pointerUp(); d.displayListJson();
  eq("no drag to create on the board", b.model.events.length, n);
  click(d, "eb-new");
  const nb = b.model.events[b.model.events.length - 1];
  ok("New booking: 12:00-13:00 in 101, check-in blue", nb.title === "New booking" && nb.resource === "r101" && nb.startMin === 720 && nb.endMin === 780 && nb.color === "blue");
  eq("and it has the focus", d.focused, "eb-ev-" + nb.id);
  const bev = byId(d, "eb-ev-" + nb.id), bsc = byId(d, "eb-scroll");
  ok("scrolled into view", bev.calculatedY >= bsc.calculatedY && bev.calculatedY + bev.calculatedHeight <= bsc.calculatedY + bsc.calculatedHeight);
  click(d, "eb-next");
  eq("the arrows step a day", text(byId(d, "eb-title")), "Tuesday, September 29, 2026");
}

console.log("the keyboard reaches the patterns");
{
  const d = fresh();
  const seen = [];
  for (let i = 0; i < 60; i++) { if (!d.keyWith("Tab", false, false)) break; d.displayListJson(); seen.push(d.focused); }
  ok("Tab starts in A's toolbar", seen.slice(0, 6).join(",") === "ea-today,ea-view-trigger,ea-prev,ea-next,ea-set-trigger,ea-new", seen.slice(0, 6).join(","));
  ok("then A's events", seen.includes("ea-chip-e1"));
  const d2 = fresh();
  while (d2.focused !== "ea-view-trigger") d2.keyWith("Tab", false, false);
  d2.keyWith("Enter", false, false);
  d2.keyWith("ArrowDown", false, false);
  d2.keyWith("Enter", false, false);
  d2.displayListJson();
  eq("the view switcher works from the keyboard", A(d2).view, "week");
  d2.keyWith("Tab", false, false); d2.keyWith("Tab", false, false); d2.keyWith("Tab", false, false);
  d2.keyWith("Enter", false, false); d2.displayListJson();
  ok("Enter on Settings opens it", A(d2).settings.open && d2.focused === "ea-set-tabs-tab-view", d2.focused);
  d2.keyWith("Tab", false, false);
  eq("Tab goes into the panel", d2.focused, "ea-set-sw-weekends");
  d2.keyWith(" ", false, false); d2.displayListJson();
  ok("Space flips a switch", A(d2).weekends === false);
  const nodes2 = nodes(d2);
  ok("every button in the mirror is focusable", nodes2.filter((n) => n.role === "button").every((n) => n.focusable));
  ok("every switch says whether it is on", nodes2.filter((n) => n.role === "switch").every((n) => n.checked !== undefined), JSON.stringify(nodes2.find((n) => n.role === "switch")));
}

console.log("a phone");
{
  for (const view of ["month", "week", "agenda", "resource"]) {
    const d = fresh(390);
    if (view !== "month") pickView(d, view);
    click(d, "ea-set-trigger");
    const wide = flat(d).filter((e) => e.calculatedWidth > 0 && (e.calculatedX < -0.5 || e.calculatedX + e.calculatedWidth > 390.5) && !(e.className || "").includes("eb-status"));
    ok(`${view} at 390: nothing runs off the page, Settings open`, wide.length === 0, wide.slice(0, 5).map((e) => `${e.id || e.className} ${Math.round(e.calculatedX)}+${Math.round(e.calculatedWidth)}`).join(", "));
  }
  const d = fresh(390);
  ok("the title has a row of its own", byId(d, "ea-title").calculatedY > byId(d, "ea-today").calculatedY + 20);
  ok("the tree lints clean at 390", Array.from(d.a11yProblems()).length === 0, Array.from(d.a11yProblems()).join(" | "));
}

console.log(`\npassed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
console.log("ALL PASS");

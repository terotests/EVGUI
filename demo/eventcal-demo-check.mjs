#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The event calendar demo: that the measured layout survives becoming pixels.
//
//   node gallery/evgui/demo/eventcal-demo-check.mjs
//
// `ui:eventcal:check` gates `EventCalCtl` against a rendered
// @schedule-x/calendar — 84 assertions — in FRACTIONS, and draws nothing. The
// overlap rule is the one part of a calendar that is invisible until it is
// drawn: "column 1 of 3, left 33.33%, width 66.67%" is a row in a gate, and
// three boxes fanning out to the right is the thing a person can look at.
//
// This gate is the arithmetic between those two: the fractions become pixels
// exactly once, in EventCalDemo.rgr, and a mistake there is a mistake nothing
// else can see.

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
  else { failed++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
};
const eq = (name, got, want) => {
  const good = String(got) === String(want);
  if (good) { passed++; console.log("  PASS " + name + ": " + got); }
  else { failed++; console.log("  FAIL " + name + ": " + got + "   want " + want); }
};

const fresh = () => {
  const d = new M.EventCalDemo();
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
const box = (d, id) => {
  const e = byId(d, id);
  return e ? {
    x: Math.round(e.calculatedX), y: Math.round(e.calculatedY),
    w: Math.round(e.calculatedWidth), h: Math.round(e.calculatedHeight),
  } : null;
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

console.log("three overlapping events fan out — the thing a gate in fractions cannot show");
{
  const d = fresh();
  const g = box(d, "ec-g"), h = box(d, "ec-h"), i = box(d, "ec-i");
  ok("all three are drawn", g && h && i, `${JSON.stringify(g)} ${JSON.stringify(h)} ${JSON.stringify(i)}`);
  // The property that separates the overlay from an even split: every box
  // reaches the SAME right edge, and each later one starts further in.
  eq("they all end at the same right edge", `${g.x + g.w},${h.x + h.w},${i.x + i.w}`,
    `${g.x + g.w},${g.x + g.w},${g.x + g.w}`);
  ok("and each starts further right than the last", g.x < h.x && h.x < i.x, `${g.x} ${h.x} ${i.x}`);
  ok("so each is narrower than the last", g.w > h.w && h.w > i.w, `${g.w} ${h.w} ${i.w}`);
  // If the rule were "n equal columns" all three would be the same width and
  // laid side by side. This is the assertion that tells the two apart.
  ok("which an even split would not do", !(g.w === h.w && h.w === i.w), `${g.w} ${h.w} ${i.w}`);
  // Thirds, in pixels: the widths step down by exactly a third of the column.
  eq("the widths are thirds of the column", `${g.w},${h.w},${i.w}`, `${g.w},${Math.round(g.w * 2 / 3)},${Math.round(g.w / 3)}`);
}

console.log("a released column is reused, not a fourth one opened");
{
  const d = fresh();
  const a = box(d, "ec-a"), b = box(d, "ec-b"), c = box(d, "ec-c"), dd = box(d, "ec-d");
  eq("A takes the whole column", a.w, box(d, "ec-g").w);
  eq("D, starting where A ends, takes it back", `${dd.x},${dd.w}`, `${a.x},${a.w}`);
  ok("B and C share the other half", b.x === c.x && b.w === c.w, `${b.x}/${b.w} vs ${c.x}/${c.w}`);
  ok("and that half is half", b.w * 2 === a.w || Math.abs(b.w * 2 - a.w) <= 1, `${b.w} vs ${a.w}`);
  // If touching counted as overlapping, D would be a fourth column and the
  // morning would be a quarter of its width.
  ok("touching did not open a fourth column", dd.w > a.w / 2, `${dd.w} of ${a.w}`);
}

console.log("the all-day band packs into lanes");
{
  const d = fresh();
  const j = box(d, "ec-j"), f = box(d, "ec-f"), k = box(d, "ec-k");
  ok("the midnight-crossing event is in the band at all", j !== null);
  ok("it spans two days", j.w > 0 && Math.abs(j.w - (f.w * 2) / 3) < 3, `${j.w} vs ${f.w}`);
  // J (Mon–Tue) and K (Wed–Fri) share no day, so they share a lane; F
  // (Tue–Thu) touches both and is pushed down.
  eq("J and K sit on the same lane", j.y, k.y);
  ok("and F is pushed to the one below", f.y > j.y, `${f.y} vs ${j.y}`);
  ok("F starts a day after J starts", f.x > j.x, `${f.x} vs ${j.x}`);
}

console.log("the events are reachable and legible");
{
  const d = fresh();
  // The narrowest box is on top, which is what makes the fan readable — so a
  // click in the overlap must land on the topmost one, not the widest.
  const i = byId(d, "ec-i");
  const cx = i.calculatedX + i.calculatedWidth / 2;
  const cy = i.calculatedY + i.calculatedHeight / 2;
  eq("a click in the overlap lands on the topmost event", d.hitId(cx, cy), "ec-i");
  // And the widest one is still reachable where nothing covers it.
  const g = byId(d, "ec-g");
  eq("the widest is reachable at its left edge", d.hitId(g.calculatedX + 3, g.calculatedY + 3), "ec-g");
}

console.log("navigation moves the week");
{
  const d = fresh();
  const first = JSON.parse(d.a11yJson(1, "")).nodes.find((n) => n.role === "status");
  ok("the caption names the week", /May 11th/.test(first.name), first.name);
  const nav = byId(d, "ec-next");
  d.press(d.hitId(nav.calculatedX + nav.calculatedWidth / 2, nav.calculatedY + nav.calculatedHeight / 2));
  d.displayListJson();
  const next = JSON.parse(d.a11yJson(2, "")).nodes.find((n) => n.role === "status");
  ok("clicking next moves it a week", /May 18th/.test(next.name), next.name);
  // The events belong to the week that was left, so the new one is empty —
  // which is worth asserting because an empty column is where a layout bug
  // hides.
  ok("and the events do not follow it", byId(d, "ec-a") === undefined);
  const prev = byId(d, "ec-prev");
  d.press(d.hitId(prev.calculatedX + 2, prev.calculatedY + 2));
  d.displayListJson();
  ok("and they come back", byId(d, "ec-a") !== undefined);
}

console.log("the view switcher says which view it is in");
{
  const d = fresh();
  const wk = byId(d, "ec-view-week");
  ok("the current view's button is marked", (wk.className || "").includes("ec-viewbtn-on"), wk.className);
  // Its own token, because there are no descendant selectors: without it the
  // label is dark text on a dark fill.
  ok("and its label carries its own token", (wk.children[0].className || "").includes("ec-viewtxt-on"),
    wk.children[0].className);
  const dayBtn = byId(d, "ec-view-day");
  d.press(d.hitId(dayBtn.calculatedX + dayBtn.calculatedWidth / 2, dayBtn.calculatedY + dayBtn.calculatedHeight / 2));
  d.displayListJson();
  ok("clicking another view marks that one", (byId(d, "ec-view-day").className || "").includes("ec-viewbtn-on"));
  ok("and unmarks the last", !(byId(d, "ec-view-week").className || "").includes("ec-viewbtn-on"));
  const cap = JSON.parse(d.a11yJson(3, "")).nodes.find((n) => n.role === "status");
  ok("and the caption narrows to one day", !/–/.test(cap.name), cap.name);
}

console.log("the view buttons draw three different calendars");
{
  // The buttons used to change a HIGHLIGHT and nothing else. `model.view` was
  // read in exactly two places in this file, both of them the button's own
  // class, and nothing branched on it while drawing — so Day, Week and Month
  // lit up in turn over one unchanging week grid. `pickView` also skipped
  // `model.layout()`, so even the arithmetic was the old view's.
  //
  // What each view IS was measured, not chosen: `eventcal.json`'s `views`
  // block was captured from the same @schedule-x calendar in all three. A day
  // has one time column, a week seven, and a month none at all — 35 day cells
  // instead, with every event a chip carrying a grid row and a day span and
  // not one carrying a top or a height.
  const d = fresh();
  const cls = (n) => (n.className || "").split(/\s+/);
  const count = (c) => {
    let n = 0;
    const walk = (e) => { if (cls(e).includes(c)) n += 1; for (const k of e.children) walk(k); };
    walk(d.root);
    return n;
  };
  const pressView = (v) => {
    const b = byId(d, "ec-view-" + v);
    d.press(d.hitId(b.calculatedX + b.calculatedWidth / 2, b.calculatedY + b.calculatedHeight / 2));
    d.displayListJson();
  };

  pressView("week");
  eq("a week shows seven day columns", count("ec-col"), 7);
  eq("and seven day headings", count("ec-dayhead"), 7);
  eq("with no month cells", count("ec-monthcell"), 0);
  const weekTimed = count("ec-ev");
  ok("and timed events in the grid", weekTimed > 0, String(weekTimed));

  pressView("day");
  eq("a day shows ONE column", count("ec-col"), 1);
  eq("and one day heading", count("ec-dayhead"), 1);
  ok("with fewer timed events than the week", count("ec-ev") < weekTimed,
    `${count("ec-ev")} vs ${weekTimed}`);

  pressView("month");
  eq("a month shows 35 day cells", count("ec-monthcell"), 35);
  eq("and no time columns at all", count("ec-col"), 0);
  eq("nor a single timed box", count("ec-ev"), 0);
  ok("every event is a chip instead", count("ec-chip") > 0, String(count("ec-chip")));

  // The rule that makes the month a month: a chip has no time position. If one
  // ever gains a `top`, the month has quietly become a time grid again.
  const chips = [];
  const walk = (e) => { if (cls(e).includes("ec-chip")) chips.push(e); for (const k of e.children) walk(k); };
  walk(d.root);
  ok("and no chip carries a vertical position",
    chips.every((c) => !c.top || !c.top.isSet),
    JSON.stringify(chips.filter((c) => c.top && c.top.isSet).map((c) => c.id)));

  // A reader gets the times the cell cannot show.
  const ns = JSON.parse(d.a11yJson(9, "")).nodes;
  const named = ns.filter((n) => (n.name || "").includes(","));
  ok("a chip's name carries when it is", named.length > 0,
    JSON.stringify(ns.slice(0, 4).map((n) => n.name)));
}

console.log("a day view clips what runs past it, and hides what never reaches it");
{
  // Measured: in the reference's day view the two-day band came back with
  // `--overflow-right`, clipped to the day rather than drawn outside the
  // frame. An event on a different day is not clipped — it is simply not
  // there, which is a different answer and was worth a separate assertion
  // after a probe returned `clip 1..0` with an overflow flag pointing at an
  // edge it never reached.
  const d = fresh();
  const b = byId(d, "ec-view-day");
  d.press(d.hitId(b.calculatedX + b.calculatedWidth / 2, b.calculatedY + b.calculatedHeight / 2));
  d.displayListJson();
  const shown = d.model.firstDay();
  let clipped = 0;
  let hidden = 0;
  for (const e of d.model.events) {
    if (!d.model.isVisible(e.id)) { hidden += 1; continue; }
    if (e.overflowLeft || e.overflowRight) clipped += 1;
  }
  ok("something is hidden entirely", hidden > 0, String(hidden));
  ok("and a span that crosses the day is clipped and marked", clipped > 0, String(clipped));
  ok("nothing visible has an inverted range",
    d.model.events.every((e) => !d.model.isVisible(e.id) || e.clipEnd >= e.clipStart));
  ok("every visible span is at least one day",
    d.model.events.every((e) => !d.model.isVisible(e.id) || d.model.chipSpan(e.id) >= 1));
  ok("and no visible event starts before the day shown",
    d.model.events.every((e) => !d.model.isVisible(e.id) || e.clipStart >= shown));
}

console.log("every view can be left for every other one");
{
  // Month used to `return body` from page() instead of the page, so it drew
  // without its header — no arrows, no caption, no view buttons — and once in
  // Month there was nothing left to press.
  const d = fresh();
  const pressId = (id) => {
    const b = byId(d, id);
    if (!b) return false;
    d.press(d.hitId(b.calculatedX + b.calculatedWidth / 2, b.calculatedY + b.calculatedHeight / 2));
    d.displayListJson();
    return true;
  };
  const on = (v) => (byId(d, "ec-view-" + v)?.className || "").includes("ec-viewbtn-on");
  const caption = () => JSON.parse(d.a11yJson(5, "")).nodes.find((n) => n.role === "status")?.name || "";
  for (const from of ["day", "week", "month"]) {
    for (const to of ["day", "week", "month"]) {
      if (from === to) continue;
      pressId("ec-view-" + from);
      ok(`${from}: all the view buttons and the arrows are drawn`,
        ["ec-view-day", "ec-view-week", "ec-view-month", "ec-prev", "ec-next", "ec-today"].every((id) => byId(d, id)));
      ok(`${from} -> ${to} by pointer`, pressId("ec-view-" + to) && on(to) && !on(from));
    }
  }
  pressId("ec-view-month");
  eq("month caption", caption(), "May 2026");
  pressId("ec-next");
  eq("next month", caption(), "June 2026");
  pressId("ec-prev");
  pressId("ec-prev");
  eq("previous month", caption(), "April 2026");
  pressId("ec-today");
  eq("today, in the month", caption(), "May 2026");
  ok("the month's arrows are named for months", /month/.test(byId(d, "ec-next").a11yLabel), byId(d, "ec-next").a11yLabel);
  const more = flat(d).find((e) => (e.id || "").startsWith("ec-more-"));
  ok("a crowded day says how many more it holds", !!more, "");
  pressId(more.id);
  ok("and opens that day", on("day") && /May 11th/.test(caption()), caption());
  pressId("ec-next");
  eq("next day", caption(), "Tuesday, May 12th, 2026");
  pressId("ec-view-week");
  ok("a week holds the day you were on, from its Monday", /^Monday, May 11th/.test(caption()), caption());
  pressId("ec-view-day");
  eq("and back to that same day", caption(), "Tuesday, May 12th, 2026");
  d.key("ArrowRight");
  d.displayListJson();
  eq("the arrow keys step in the view's unit", caption(), "Wednesday, May 13th, 2026");
  pressId("ec-today");
  eq("today, in the day", caption(), "Monday, May 11th, 2026");
  // Clipped to the day: the two-day "On call" band must not run off the page.
  const oncall = box(d, "ec-j");
  const col = box(d, "ec-col-0");
  ok("a band that runs past the day stops at its edge", oncall && col && oncall.x + oncall.w <= col.x + col.w + 1,
    `${JSON.stringify(oncall)} vs ${JSON.stringify(col)}`);
}

console.log("the keyboard reaches every control");
{
  // The mirror is one tab stop; the demo walks its own ring. Before it, no
  // node was focusable and prev/next, the views and the events were
  // pointer-only.
  const d = fresh();
  const seen = [];
  for (let i = 0; i < 40; i++) {
    if (!d.keyWith("Tab", false, false)) break;
    d.displayListJson();
    seen.push(d.focused);
  }
  ok("Tab visits the arrows, Today and the three views first",
    seen.slice(0, 6).join(",") === "ec-prev,ec-next,ec-today,ec-view-day,ec-view-week,ec-view-month", seen.slice(0, 6).join(","));
  ok("and then the events", seen.includes("ec-a") && seen.includes("ec-j"), seen.join(","));
  ok("and lets go at the end, so focus can leave", seen.length < 40, String(seen.length));
  ok("Shift+Tab walks back", d.keyWith("Tab", true, false) && d.focused === seen[seen.length - 2], d.focused);
  const nodes = JSON.parse(d.a11yJson(4, d.focused)).nodes;
  ok("every button is focusable in the mirror",
    nodes.filter((n) => n.role === "button").every((n) => n.focusable), "");
  const d2 = fresh();
  while (d2.focused !== "ec-view-month") d2.keyWith("Tab", false, false);
  d2.keyWith("Enter", false, false);
  d2.displayListJson();
  ok("Enter on Month opens the month", d2.model.view === "month");
  ok("and the focus stays on its button, which is still drawn", !!byId(d2, d2.focused) && d2.focused === "ec-view-month");
  d2.keyWith("Tab", true, false);
  d2.keyWith("Tab", true, false);
  d2.keyWith(" ", false, false);
  d2.displayListJson();
  ok("Space on Day, reached backwards from Month, leaves it", d2.model.view === "day");
  const d3 = fresh();
  while (d3.focused !== "ec-f") d3.keyWith("Tab", false, false);
  d3.keyWith("ArrowRight", false, false);
  d3.displayListJson();
  ok("an arrow that steps the focused event off screen hands the focus to the arrow button",
    d3.focused === "ec-next" && !!byId(d3, "ec-next"), d3.focused);
}

console.log("titles too long for their box end in an ellipsis");
{
  const d = fresh();
  const txt = (id) => byId(d, id)?.children[0]?.textContent || "";
  ok("the narrow overlapped box is cut with an ellipsis, not mid-word", /…$/.test(txt("ec-g")), txt("ec-g"));
  ok("a box with room keeps its whole title", txt("ec-a") === "Standup", txt("ec-a"));
}

console.log(`\npassed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
console.log("ALL PASS");

#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Kanban demo, checked in Node against the compiled demo.
//
// The board as it loads (ReUI's data, counts, labels and tones, three equal
// columns), then the gestures: a pointer drag reordering within a column and
// moving across columns (the placeholder's geometry and the overlay's while
// it is in flight, the counts following the drag, a click that never travels
// doing nothing), the keyboard sensor (pick up, the four arrows, drop, Escape
// back to the origin, the index clamped on a move across) with the exact
// announcements, what a reader is told, and that nothing overlaps at 900 and
// at a phone's 358 — where the columns stack and dragging still works.
//
//   node gallery/evgui/demo/kanban-check.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/KanbanDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "kanban.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};
const near = (a, b, eps = 1.01) => Math.abs(a - b) <= eps;

const fresh = (w) => {
  const d = new M.KanbanDemo();
  d.init(CSS);
  if (w) { d.pageW = w; d.pageH = 4000; d.layout = undefined; }
  d.displayListJson();
  return d;
};
const byId = (d, id) => {
  let found = null;
  const walk = (e) => { if (found) return; if (e.id === id) { found = e; return; } for (const k of e.children || []) walk(k); };
  walk(d.root);
  return found;
};
const rect = (d, id) => {
  const e = byId(d, id);
  return e ? { x: e.calculatedX, y: e.calculatedY, w: e.calculatedWidth, h: e.calculatedHeight } : null;
};
const overlayEl = (d) => d.root.children.find((k) => k.key === "overlay") || null;
const st = (d) => JSON.parse(d.stateJson());
const text = (d, id) => (byId(d, id) || {}).textContent;
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const COLS = ["todo", "doing", "done"];
const counts = (d) => COLS.map((c) => text(d, `kb-col-${c}-count`)).join(",");

// A pointer drag the way the page does it: press on the card's middle, travel
// past the activation distance, then the moves; `drop` false leaves it held.
const drag = (d, cardId, points, drop = true) => {
  d.displayListJson();
  const r = rect(d, cardId);
  const x0 = r.x + r.w / 2;
  const y0 = r.y + r.h / 2;
  d.press(d.hitId(x0, y0), x0, y0);
  d.dragTo(x0 + 6, y0 + 6);
  for (const [x, y] of points) { d.dragTo(x, y); d.displayListJson(); }
  if (drop) { d.drop(); d.displayListJson(); }
};

// Every pair of siblings under `id` that overlap, and anything past the page.
const overlaps = (d) => {
  const bad = [];
  const W = d.pageW;
  const walk = (e) => {
    const kids = (e.children || []).filter((k) => k.id && k.key !== "overlay" && !String(k.className).includes("kb-dash"));
    for (let i = 0; i < kids.length; i++) {
      const a = kids[i];
      if (a.calculatedX + a.calculatedWidth > W + 0.5) bad.push(a.id + " past the page");
      for (let j = i + 1; j < kids.length; j++) {
        const b = kids[j];
        const ox = Math.min(a.calculatedX + a.calculatedWidth, b.calculatedX + b.calculatedWidth) - Math.max(a.calculatedX, b.calculatedX);
        const oy = Math.min(a.calculatedY + a.calculatedHeight, b.calculatedY + b.calculatedHeight) - Math.max(a.calculatedY, b.calculatedY);
        if (ox > 0.5 && oy > 0.5) bad.push(a.id + " × " + b.id);
      }
    }
    for (const k of e.children || []) walk(k);
  };
  walk(d.root);
  return bad;
};

console.log("the board as it loads");
{
  const d = fresh();
  ok("no stylesheet errors", d.styleErrorCount() === 0, d.styleErrorCount());
  ok("ReUI's data, in order", st(d).board === "To Do:1,2,3|In Progress:4,5|Done:6", st(d).board);
  ok("column titles", COLS.map((c) => text(d, `kb-col-${c}-title`)).join("|") === "To Do|In Progress|Done");
  ok("count badges 3, 2, 1", counts(d) === "3,2,1", counts(d));
  const titles = ["1", "2", "3", "4", "5", "6"].map((v) => text(d, `kb-card-${v}-title`)).join("|");
  ok("task titles", titles === "Design landing page|Set up CI/CD pipeline|Write unit tests|Implement auth flow|Create component library|Project kickoff", titles);
  const labels = ["1", "2", "3", "4", "5", "6"].map((v) => text(d, `kb-card-${v}-badge`)).join("|");
  ok("labels", labels === "Design|DevOps|Testing|Backend|Frontend|Planning", labels);
  const tones = ["1", "2", "3", "4", "5", "6"].map((v) => byId(d, `kb-card-${v}-badge`).className.split(" ")[1]).join("|");
  ok("badge tones info, warning, success, primary, destructive, info",
    tones === "kb-badge-info|kb-badge-warning|kb-badge-success|kb-badge-primary|kb-badge-destructive|kb-badge-info", tones);
  const cols = COLS.map((c) => rect(d, `kb-col-${c}`));
  ok("three columns side by side at 900", cols[0].x < cols[1].x && cols[1].x < cols[2].x && near(cols[0].y, cols[2].y));
  ok("equal widths", near(cols[0].w, cols[1].w) && near(cols[1].w, cols[2].w), cols.map((c) => c.w));
  ok("equal heights (auto-rows-fr)", near(cols[0].h, cols[1].h) && near(cols[1].h, cols[2].h), cols.map((c) => c.h));
  const icons = COLS.map((c) => byId(d, `kb-col-${c}-icon`));
  ok("status icons are Lucide paths, 16px", icons.every((i) => i.svgPath.startsWith("M22 12") && near(i.calculatedWidth, 16) && near(i.calculatedHeight, 16)));
  ok("circle-dot and circle-check differ from circle", icons[1].svgPath !== icons[0].svgPath && icons[2].svgPath.includes("L11 14"));
  const c1 = rect(d, "kb-card-1");
  const list = rect(d, "kb-col-todo-list");
  ok("a card fills its column's list", near(c1.w, list.w), [c1.w, list.w]);
  const cnt = rect(d, "kb-col-todo-count");
  const head = rect(d, "kb-col-todo-head");
  ok("the count sits at the header's right end", near(cnt.x + cnt.w, head.x + head.w - 4, 2), [cnt, head]);
  ok("no overlaps at 900", overlaps(d).length === 0, overlaps(d));
}

console.log("pointer: a press that never travels");
{
  const d = fresh();
  const r = rect(d, "kb-card-2");
  const took = d.press(d.hitId(r.x + 20, r.y + 20), r.x + 20, r.y + 20);
  d.dragTo(r.x + 21, r.y + 21);
  ok("the press is held and focuses the card", took && d.focused === "kb-card-2");
  ok("but nothing is picked up under the activation distance", st(d).active === "");
  d.drop();
  ok("the release changes nothing", st(d).board === "To Do:1,2,3|In Progress:4,5|Done:6");
}

console.log("pointer: reorder within a column");
{
  const d = fresh();
  const c1 = rect(d, "kb-card-1");
  const c3 = rect(d, "kb-card-3");
  drag(d, "kb-card-1", [[c3.x + c3.w / 2, c3.y + c3.h - 4]], false);
  const s = st(d);
  ok("carried by the pointer", s.active === "1" && s.pointer === true);
  ok("aiming at the end of To Do", s.overCol === 0 && s.overIndex === 2, s);
  ok("nothing committed while in flight", s.board.startsWith("To Do:1,2,3"));
  const ph = byId(d, "kb-card-1");
  ok("the slot is the placeholder", ph.className.includes("kb-task-placeholder"));
  const phr = rect(d, "kb-card-1");
  ok("placeholder is the card's size", near(phr.w, c1.w) && near(phr.h, c1.h), [phr, c1]);
  ok("placeholder where the card will land (below Write unit tests)", phr.y > rect(d, "kb-card-3").y && near(phr.y, c3.y, 1.01), [phr.y, c3.y]);
  const dash = byId(d, "kb-card-1-dash");
  ok("dashed 2px outline over the slot", dash && dash.strokeDashArray && dash.strokeWidth === 2 &&
    near(dash.calculatedX, phr.x) && near(dash.calculatedY, phr.y) && near(dash.calculatedWidth, phr.w) && near(dash.calculatedHeight, phr.h),
    dash && [dash.strokeDashArray, dash.strokeWidth, dash.calculatedX, dash.calculatedY, dash.calculatedWidth, dash.calculatedHeight]);
  ok("rounded placeholder path", dash && / A 9 9 /.test(dash.svgPath));
  const ov = overlayEl(d);
  ok("an overlay follows the pointer", !!ov && !ov.id && ov.a11yHidden === true);
  if (ov) {
    // Grabbed at the card's centre (+6 of travel before the drag started):
    // the overlay stays under the part of the card that was grabbed.
    const px = c3.x + c3.w / 2;
    const py = c3.y + c3.h - 4;
    ok("overlay under the grab point", near(ov.calculatedX, px - c1.w / 2) && near(ov.calculatedY, py - c1.h / 2),
      [ov.calculatedX, ov.calculatedY, px - c1.w / 2, py - c1.h / 2]);
    ok("overlay is the card's width", near(ov.calculatedWidth, c1.w));
    ok("overlay painted last (on top)", d.root.children[d.root.children.length - 1] === ov);
  }
  ok("announced", st(d).said === "Design landing page moved to column To Do, position 3 of 3.", st(d).said);
  d.drop();
  d.displayListJson();
  ok("dropped: To Do is 2, 3, 1", st(d).board === "To Do:2,3,1|In Progress:4,5|Done:6", st(d).board);
  ok("the overlay is gone", !overlayEl(d));
  ok("the card is a card again", !byId(d, "kb-card-1").className.includes("placeholder") && !byId(d, "kb-card-1-dash"));
  ok("drop announced", st(d).said === "Dropped Design landing page in column To Do, position 3 of 3.", st(d).said);
}

console.log("pointer: move across columns");
{
  const d = fresh();
  const done = rect(d, "kb-col-done");
  const k6 = rect(d, "kb-card-6");
  drag(d, "kb-card-4", [[done.x + done.w / 2, k6.y + k6.h + 30]], false);
  const s = st(d);
  ok("aiming at Done, after Project kickoff", s.overCol === 2 && s.overIndex === 1, s);
  ok("counts follow the drag: 3, 1, 2", counts(d) === "3,1,2", counts(d));
  ok("the region names follow too", tree(d).byId.get("kb-col-done").name === "Done, 2 tasks" && tree(d).byId.get("kb-col-doing").name === "In Progress, 1 task");
  const ph = rect(d, "kb-card-4");
  ok("placeholder in Done below Project kickoff", near(ph.x, k6.x) && near(ph.y, k6.y + k6.h + 8), [ph, k6]);
  ok("Create component library moved up into the gap", near(rect(d, "kb-card-5").y, rect(d, "kb-card-6").y));
  ok("columns still equal height mid-drag", (() => { const c = COLS.map((x) => rect(d, `kb-col-${x}`).h); return near(c[0], c[1]) && near(c[1], c[2]); })());
  ok("announced", s.said === "Implement auth flow moved to column Done, position 2 of 2.", s.said);
  // Back over the top of Done: the index follows the pointer.
  d.dragTo(done.x + done.w / 2, k6.y + 4);
  d.displayListJson();
  ok("over the top of Project kickoff → index 0", st(d).overIndex === 0, st(d));
  d.dragTo(done.x + done.w / 2, rect(d, "kb-card-6").y + 70);
  d.displayListJson();
  ok("past its middle → index 1, and it stays there", st(d).overIndex === 1);
  d.drop();
  d.displayListJson();
  ok("dropped: auth flow in Done (ReUI's screenshot)", st(d).board === "To Do:1,2,3|In Progress:5|Done:6,4", st(d).board);
  ok("counts after the drop 3, 1, 2", counts(d) === "3,1,2");
}

console.log("keyboard: pick up, move, drop");
{
  const d = fresh();
  d.setFocus("kb-card-1");
  ok("arrows browse before anything is held", d.key("ArrowDown") && d.focused === "kb-card-2");
  d.key("ArrowRight");
  ok("ArrowRight browses to the next column", d.focused === "kb-card-5", d.focused);
  d.setFocus("kb-card-1");
  ok("Space picks up", d.key(" ") && st(d).active === "1" && st(d).pointer === false);
  ok("pick-up announced", st(d).said === "Picked up Design landing page. Column To Do, position 1 of 3.", st(d).said);
  d.displayListJson();
  ok("aria-pressed on the carried card", tree(d).byId.get("kb-card-1").pressed === 2);
  ok("no overlay for a keyboard drag", !overlayEl(d));
  ok("the card is drawn lifted", byId(d, "kb-card-1").className.includes("kb-task-lifted"));
  ok("ArrowUp at the top stays put", d.key("ArrowUp") === false && st(d).overIndex === 0);
  d.key("ArrowDown");
  ok("ArrowDown → position 2", st(d).said === "Design landing page moved to column To Do, position 2 of 3.", st(d).said);
  d.displayListJson();
  ok("drawn in its prospective slot", rect(d, "kb-card-1").y > rect(d, "kb-card-2").y);
  d.key("ArrowRight");
  ok("ArrowRight → In Progress, same index", st(d).said === "Design landing page moved to column In Progress, position 2 of 3.", st(d).said);
  d.displayListJson();
  ok("counts live: 2, 3, 1", counts(d) === "2,3,1", counts(d));
  ok("focus stays on the carried card", d.focused === "kb-card-1");
  d.key("ArrowRight");
  ok("ArrowRight → Done, index clamped to its end", st(d).overCol === 2 && st(d).overIndex === 1 && st(d).said === "Design landing page moved to column Done, position 2 of 2.", st(d).said);
  ok("no wrap past the last column", d.key("ArrowRight") === false && st(d).overCol === 2);
  d.key("ArrowLeft");
  ok("ArrowLeft back to In Progress", st(d).overCol === 1 && st(d).overIndex === 1);
  d.key("Enter");
  d.displayListJson();
  ok("Enter drops", st(d).active === "" && st(d).board === "To Do:2,3|In Progress:4,1,5|Done:6", st(d).board);
  ok("drop announced", st(d).said === "Dropped Design landing page in column In Progress, position 2 of 3.", st(d).said);
  ok("focus stays on the dropped card", d.focused === "kb-card-1");
  ok("no aria-pressed after the drop", !tree(d).byId.get("kb-card-1").pressed);
}

console.log("keyboard: Escape cancels to the origin");
{
  const d = fresh();
  d.setFocus("kb-card-2");
  d.key(" ");
  d.key("ArrowRight");
  d.key("ArrowRight");
  d.key("ArrowUp");
  d.displayListJson();
  ok("carried to Done (counts 2, 2, 2)", counts(d) === "2,2,2", counts(d));
  d.key("Escape");
  d.displayListJson();
  ok("Escape: nothing moved", st(d).board === "To Do:1,2,3|In Progress:4,5|Done:6" && st(d).active === "");
  ok("counts back to 3, 2, 1", counts(d) === "3,2,1", counts(d));
  ok("cancel announced", st(d).said === "Movement cancelled. Set up CI/CD pipeline returned to column To Do, position 2 of 3.", st(d).said);
  ok("the card is back in its slot", near(rect(d, "kb-card-2").y, rect(d, "kb-card-1").y + rect(d, "kb-card-1").h + 8));
  ok("Escape with nothing held is not ours", d.key("Escape") === false);
}

console.log("what a reader is told");
{
  const d = fresh();
  const t = tree(d);
  ok("no lint problems", d.a11yProblems().length === 0, d.a11yProblems());
  ok("each column a named region with its count",
    ["To Do, 3 tasks", "In Progress, 2 tasks", "Done, 1 task"].every((n, i) => { const x = t.byId.get(`kb-col-${COLS[i]}`); return x.role === "region" && x.name === n; }));
  const c = t.byId.get("kb-card-1");
  ok("a card is a focusable button, 'draggable task'", c.role === "button" && c.focusable && c.roledesc === "draggable task", c);
  ok("named by its title and label", c.name === "Design landing page, Design");
  ok("described by the keyboard instructions", /press space or enter/.test(c.desc || ""));
  ok("cards belong to their column", c.p === "kb-col-todo" && t.byId.get("kb-card-6").p === "kb-col-done");
  const live = t.nodes.find((n) => n.role === "status");
  ok("a status live region", !!live && live.id === "kb-live");
  d.setFocus("kb-card-1");
  d.key(" ");
  const t2 = tree(d);
  ok("the live region carries the announcement", t2.byId.get("kb-live").name === "Picked up Design landing page. Column To Do, position 1 of 3." || text(d, "kb-live") === "Picked up Design landing page. Column To Do, position 1 of 3.", t2.byId.get("kb-live"));
  ok("no lint problems while carrying", d.a11yProblems().length === 0, d.a11yProblems());
}

console.log("a phone (358)");
{
  const d = fresh(358);
  ok("page is 358 wide", d.widthPx() === 358);
  const cols = COLS.map((c) => rect(d, `kb-col-${c}`));
  ok("columns stack vertically", cols[0].y + cols[0].h <= cols[1].y && cols[1].y + cols[1].h <= cols[2].y, cols);
  ok("columns take the width", cols.every((c) => near(c.x, cols[0].x) && near(c.w, cols[0].w) && c.x + c.w <= 358), cols);
  ok("no overlaps at 358", overlaps(d).length === 0, overlaps(d));
  ok("the page is as tall as the board", d.heightPx() >= cols[2].y + cols[2].h);
  const k6 = rect(d, "kb-card-6");
  drag(d, "kb-card-1", [[k6.x + k6.w / 2, k6.y + k6.h + 20]], false);
  ok("dragging works: aiming at Done", st(d).overCol === 2 && st(d).overIndex === 1, st(d));
  const ph = rect(d, "kb-card-1");
  ok("placeholder in Done, full width", near(ph.w, k6.w) && ph.y > rect(d, "kb-col-done").y, [ph, k6]);
  d.drop();
  d.displayListJson();
  ok("dropped into Done", st(d).board === "To Do:2,3|In Progress:4,5|Done:6,1", st(d).board);
  ok("no overlaps after the drop", overlaps(d).length === 0, overlaps(d));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

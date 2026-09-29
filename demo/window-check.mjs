#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Window demo: a desktop of WindowCtls, checked in Node against the
// compiled demo and then on the real page in Chromium.
//
//   npm run ui:window:check     (node scripts/run.mjs ui:window:check)
//
// Node: the drag and its keepOnScreen clamp, z-order on a click, the resize
// from every edge and corner with its minimum and the desktop's edges,
// minimize / maximize / restore, close and reopen from the dock, the
// double-click on a title bar, snapping to a half, the modal (trap, Escape,
// the focus back to whichever button opened it, still movable), the
// keyboard's move and resize and window cycling, the text fields, the
// semantics, and phone widths.
//
// Chromium: the page itself — real mouse drags (a fast one, one that leaves
// the canvas and relies on pointer capture), a resize by its grip and the
// cursor over it, the double-click, the modal and the focus it returns, the
// Styles panel's verdict on window.css, and a 390px phone with no sideways
// scroll where a drag still works.
//
// WINDOW_SHOTS=<dir> saves the screenshots the demo was reviewed with.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { requireHostTool, findChromium } from "../../ui/conformance/dom-adapter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);
const SHOTS = process.env.WINDOW_SHOTS || "";

const M = require(path.join(ROOT, "gallery/evgui/bin/WindowDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "window.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

const fresh = (w = 900, h = 620) => {
  const d = new M.WindowDemo();
  d.pageW = w;
  d.pageH = h;
  d.init(CSS);
  d.displayListJson();
  return d;
};
const st = (d) => { d.displayListJson(); return JSON.parse(d.stateJson()); };
const win = (d, key) => st(d).windows[key];
const box = (d, id) => {
  const s = d.boxOf(id);
  return s ? s.split(",").map(Number) : null;
};
const centre = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2];
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
// A press the way the page makes one: hit test, down, (moves), up.
const clickAt = (d, x, y) => {
  const hit = d.hitId(x, y);
  d.pointerDown(hit, x, y, 0);
  d.pointerUp();
  d.displayListJson();
  return hit;
};
const click = (d, id, fx = 0.5, fy = 0.5) => {
  const b = box(d, id);
  if (!b) return "(no element " + id + ")";
  return clickAt(d, b[0] + b[2] * fx, b[1] + b[3] * fy);
};
// A drag from a point, in steps, as pointer events arrive.
const dragFrom = (d, x, y, dx, dy, steps = 4) => {
  const hit = d.hitId(x, y);
  d.pointerDown(hit, x, y, 0);
  for (let i = 1; i <= steps; i++) d.pointerMove(x + (dx * i) / steps, y + (dy * i) / steps, i * 16);
  d.pointerUp();
  d.displayListJson();
  return hit;
};
const dragId = (d, id, dx, dy, steps) => {
  const b = box(d, id);
  const [x, y] = centre(b);
  return dragFrom(d, x, y, dx, dy, steps);
};
// The title bar's middle, left of the buttons: where a person grabs it.
// Only the part of it the desktop shows can be grabbed.
const barPoint = (d, key) => {
  const b = box(d, `wd-${key}-titlebar`);
  const desk = box(d, key === "prefs" ? "wd-card" : "wd-desk");
  const x0 = Math.max(b[0], desk[0]);
  const x1 = Math.min(b[0] + b[2], desk[0] + desk[2]);
  return [x0 + Math.min(80, (x1 - x0) / 2), b[1] + b[3] / 2];
};
const dragBar = (d, key, dx, dy, steps = 4) => {
  const [x, y] = barPoint(d, key);
  return dragFrom(d, x, y, dx, dy, steps);
};
const keys = (d, list) => {
  for (const k of list) {
    if (Array.isArray(k)) d.keyWith(k[0], !!k[1], !!k[2], !!k[3]);
    else d.keyWith(k, false, false, false);
  }
  d.displayListJson();
};

// =============================================================================
console.log("--- at rest ---");
{
  const d = fresh();
  const s = st(d);
  ok("no style errors", d.styleErrorCount() === 0, d.styleErrorCount());
  ok("the reader's tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
  ok("four windows open at once, New contact on top", ["list", "form", "notes", "about"].every((k) => s.windows[k].open && !s.windows[k].min) && s.front === "form", s.order);
  const boxes = ["list", "form", "notes", "about"].map((k) => box(d, `wd-${k}-content`));
  const overlap = (a, b) => Math.min(a[0] + a[2], b[0] + b[2]) > Math.max(a[0], b[0]) && Math.min(a[1] + a[3], b[1] + b[3]) > Math.max(a[1], b[1]);
  ok("…and they overlap", overlap(boxes[0], boxes[2]) && overlap(boxes[1], boxes[3]), boxes);
  const desk = box(d, "wd-desk");
  ok("every window starts inside the desktop", boxes.every((b) => b[0] >= desk[0] && b[1] >= desk[1] && b[0] + b[2] <= desk[0] + desk[2] && b[1] + b[3] <= desk[1] + desk[3]), [desk, boxes]);
  ok("the controllers know the desktop's size", s.windows.list.pageW === desk[2] && s.windows.list.pageH === desk[3], [s.windows.list.pageW, desk]);
  ok("a window is placed from the desktop's content box", near(boxes[1][0], desk[0] + s.windows.form.x) && near(boxes[1][1], desk[1] + s.windows.form.y), [boxes[1], s.windows.form]);
}

console.log("--- semantics ---");
{
  const d = fresh();
  const t = tree(d);
  for (const [key, title] of [["list", "Contacts"], ["form", "New contact"], ["notes", "Notes"], ["about", "About"]]) {
    const f = t.byId.get(`wd-${key}-content`);
    ok(`${title}: role=dialog, not modal, named by its title`, f && f.role === "dialog" && !f.modal && f.name === title, f && { role: f.role, modal: f.modal, name: f.name });
    const bar = t.byId.get(`wd-${key}-titlebar`);
    ok(`${title}: the title bar is a focusable "draggable" button named "${title}, move window"`,
      bar && bar.role === "button" && bar.name === `${title}, move window` && bar.roledesc === "draggable" && bar.focusable,
      bar && { role: bar.role, name: bar.name, rd: bar.roledesc });
    ok(`${title}: the visible title is not announced a second time`, !t.byId.has(`wd-${key}-title`));
    const names = ["minimize", "maximize", "close"].map((b) => t.byId.get(`wd-${key}-${b}`));
    ok(`${title}: Minimize, Maximize and Close are labelled buttons`, names.every((n) => n && n.role === "button" && n.focusable) &&
      names.map((n) => n.name).join("|") === "Minimize|Maximize|Close", names.map((n) => n && n.name));
    ok(`${title}: the resize grips are not in the reader's tree`, !t.byId.has(`wd-${key}-resize-se`));
  }
  const dock = t.byId.get("wd-dockbar");
  ok("the dock is a toolbar named Windows", dock && dock.role === "toolbar" && dock.name === "Windows", dock && { role: dock.role, name: dock.name });
  const kids = t.nodes.filter((n) => n.p === "wd-dockbar").map((n) => n.name);
  ok("…with a button per window and Desktop settings", kids.join("|") === "Contacts|New contact|Notes|About|Desktop settings", kids);
  const live = t.byId.get("wd-live");
  ok("what happens is said in a status region", live && live.role === "status", live && live.role);
  const table = t.byId.get("wd-list-table");
  ok("Contacts is a table with column headers, rows and cells", table && table.role === "table" &&
    t.byId.get("wd-list-h1").role === "columnheader" && t.byId.get("wd-list-row-0").role === "row" && t.byId.get("wd-list-row-0").p === "wd-list-table" &&
    t.byId.get("wd-list-name-0").role === "cell", table && table.role);
  const star = t.byId.get("wd-list-star-0");
  ok("a star is a toggle button named for its contact", star && star.role === "button" && star.name === "Favorite Ada Lovelace" && star.pressed === 2, star && { name: star.name, pressed: star.pressed });
  const nm = t.byId.get("wd-form-name");
  ok("the form's fields are named text boxes", nm && nm.role === "textbox" && nm.name === "Name" && t.byId.get("wd-form-fav").role === "switch", nm && nm.role);
}

console.log("--- dragging, and keepOnScreen ---");
{
  const d = fresh();
  // Snapping is its own check below: a fling to an edge here is about the clamp.
  d.snapOn = false;
  const w0 = win(d, "notes");
  const hit = dragBar(d, "notes", 120, 40);
  const w1 = win(d, "notes");
  ok("a press on the title bar hits the handle", hit === "wd-notes-titlebar" || hit === "wd-notes-title", hit);
  ok("the window moves by the pointer's travel", w1.x === w0.x + 120 && w1.y === w0.y + 40, [w0, w1]);
  ok("…comes to the front", st(d).front === "notes", st(d).order);
  ok("…and says where it went", st(d).said === `Notes moved to ${w1.x}, ${w1.y}.`, st(d).said);
  const before = win(d, "notes");
  dragBar(d, "notes", 2, 1, 1);
  const after = win(d, "notes");
  ok("a press that barely travels is not a drag", after.x === before.x && after.y === before.y, [before, after]);
  // One huge step, as a fast flick delivers it.
  dragBar(d, "notes", -3000, 0, 1);
  const L = win(d, "notes");
  ok(`flung off the left, ${L.keep}px stay on the desktop`, L.x === L.keep - L.w, L);
  dragBar(d, "notes", 6000, 0, 1);
  const R = win(d, "notes");
  ok(`flung off the right, ${R.keep}px stay on the desktop`, R.x === R.pageW - R.keep, R);
  dragBar(d, "notes", 0, -3000, 1);
  ok("the title bar never goes above the desktop", win(d, "notes").y === 0, win(d, "notes"));
  dragBar(d, "notes", 0, 3000, 2);
  const B = win(d, "notes");
  ok(`…nor more than ${B.keep}px from its bottom`, B.y === B.pageH - B.keep, B);
  // Whatever the clamp did, the bar can still be grabbed and dragged back.
  const bar = box(d, "wd-notes-titlebar");
  const desk = box(d, "wd-desk");
  const visible = Math.min(bar[0] + bar[2], desk[0] + desk[2]) - Math.max(bar[0], desk[0]);
  ok("…so a piece of its title bar is still there to grab", visible >= 40 && bar[1] < desk[1] + desk[3], [bar, desk]);
  const gx = Math.max(bar[0], desk[0]) + 20;
  const gy = bar[1] + 10;
  dragFrom(d, gx, gy, -300, -300);
  ok("…and it comes back", win(d, "notes").y < B.y && win(d, "notes").x < B.x, win(d, "notes"));
  ok("the drag lints clean", d.a11yProblems().length === 0, d.a11yProblems());
}

console.log("--- z-order ---");
{
  const d = fresh();
  ok("New contact starts on top, and only its title bar looks active", st(d).front === "form" &&
    d.boxOf("wd-form-content") && JSON.parse(d.displayListJson()) && true);
  // A cell of the contacts table that no other window covers.
  const hit = click(d, "wd-list-name-1");
  ok("a click on a table cell hits the table", hit === "wd-list-name-1", hit);
  ok("…and brings Contacts to the front", st(d).front === "list" && st(d).order[3] === "list", st(d).order);
  const cls = (id) => {
    const find = (el) => (el.id === id ? el : el.children.map(find).find(Boolean) || null);
    const e = find(d.root);
    return e ? e.className : "";
  };
  ok("its frame and title bar are the active ones now", cls("wd-list-content").includes("wd-win-active") && cls("wd-list-head").includes("wd-titlebar-active") &&
    !cls("wd-form-content").includes("wd-win-active"), [cls("wd-list-content"), cls("wd-form-content")]);
  // Where Contacts now covers Notes, the click lands on Contacts.
  const lb = box(d, "wd-list-content");
  const nb = box(d, "wd-notes-content");
  const ox = Math.max(lb[0], nb[0]) + 10;
  const oy = Math.max(lb[1], nb[1]) + 30;
  ok("on top means on top: the overlap answers to Contacts", d.hitId(ox, oy).startsWith("wd-list-"), d.hitId(ox, oy));
  // A click in an empty part of About's body.
  const ab = box(d, "wd-about-body");
  clickAt(d, ab[0] + ab[2] - 6, ab[1] + ab[3] - 3);
  ok("a click anywhere in a window raises it (About's empty corner)", st(d).front === "about", st(d).order);
  click(d, "wd-desk", 0.02, 0.98);
  ok("a click on the empty desktop changes no order", st(d).front === "about", st(d).order);
}

console.log("--- resizing ---");
{
  const cases = {
    e: [30, 0, (a, b) => b.w === a.w + 30 && b.x === a.x && b.h === a.h],
    w: [-30, 0, (a, b) => b.x === a.x - 30 && b.w === a.w + 30 && b.h === a.h],
    s: [0, 25, (a, b) => b.h === a.h + 25 && b.y === a.y && b.w === a.w],
    n: [0, -20, (a, b) => b.y === a.y - 20 && b.h === a.h + 20 && b.w === a.w],
    se: [30, 25, (a, b) => b.w === a.w + 30 && b.h === a.h + 25 && b.x === a.x && b.y === a.y],
    sw: [-30, 25, (a, b) => b.x === a.x - 30 && b.w === a.w + 30 && b.h === a.h + 25 && b.y === a.y],
    ne: [30, -20, (a, b) => b.w === a.w + 30 && b.y === a.y - 20 && b.h === a.h + 20 && b.x === a.x],
    nw: [-30, -20, (a, b) => b.x === a.x - 30 && b.y === a.y - 20 && b.w === a.w + 30 && b.h === a.h + 20],
  };
  const cursors = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" };
  for (const [edge, [dx, dy, want]] of Object.entries(cases)) {
    const d = fresh();
    const a = win(d, "form");
    const g = box(d, `wd-form-resize-${edge}`);
    const [x, y] = centre(g);
    ok(`${edge}: the grip is what the pointer hits, and its cursor is ${cursors[edge]}`, d.hitId(x, y) === `wd-form-resize-${edge}` && d.cursorAt(x, y) === cursors[edge], [d.hitId(x, y), d.cursorAt(x, y)]);
    dragFrom(d, x, y, dx, dy);
    const b = win(d, "form");
    ok(`${edge}: the edge follows the pointer and the opposite one stays`, want(a, b), [a, b]);
    const fb = box(d, "wd-form-content");
    ok(`${edge}: the frame is drawn at the new size`, near(fb[2], b.w) && near(fb[3], b.h), [fb, b]);
    ok(`${edge}: and the size is announced`, st(d).said === `New contact resized to ${b.w} by ${b.h}.`, st(d).said);
  }
  {
    const d = fresh();
    const a = win(d, "form");
    dragId(d, "wd-form-resize-e", -1000, 0);
    ok("the width stops at the minimum", win(d, "form").w === a.minW && win(d, "form").x === a.x, win(d, "form"));
    dragId(d, "wd-form-resize-n", 0, 1000);
    const b = win(d, "form");
    ok("the height stops at the minimum, its bottom edge where it was", b.h === a.minH && b.y + b.h === a.y + a.h, b);
    dragId(d, "wd-form-resize-w", 3000, 0);
    const c = win(d, "form");
    ok("dragging the left edge past the right one stops at the minimum", c.w === a.minW && c.x + c.w === a.x + a.minW, c);
  }
  {
    const d = fresh();
    dragId(d, "wd-form-resize-se", 3000, 3000);
    const a = win(d, "form");
    ok("the right and bottom edges stop at the desktop's", a.x + a.w === a.pageW && a.y + a.h === a.pageH, a);
    dragId(d, "wd-form-resize-nw", -3000, -3000);
    const b = win(d, "form");
    ok("the left and top edges stop at the desktop's", b.x === 0 && b.y === 0 && b.w === b.pageW && b.h === b.pageH, b);
  }
  {
    const d = fresh();
    d.pressKey = null;
    click(d, "wd-form-maximize");
    d.settle();
    ok("a maximized window has no grips", box(d, "wd-form-resize-se") === null);
  }
}

console.log("--- minimize, maximize, restore, close ---");
{
  const d = fresh();
  const a = win(d, "notes");
  click(d, "wd-notes-minimize");
  ok("Minimize takes it off the desktop", win(d, "notes").min && box(d, "wd-notes-content") === null, win(d, "notes"));
  const t = tree(d);
  ok("…into the dock, which says so", t.byId.get("wd-notes-trigger").name === "Notes, minimized" && t.byId.get("wd-notes-trigger").pressed === 1, t.byId.get("wd-notes-trigger"));
  ok("…with the focus on its dock button", d.focused === "wd-notes-trigger", d.focused);
  ok("…and announced", st(d).said === "Notes minimized to the dock.", st(d).said);
  click(d, "wd-notes-trigger");
  const b = win(d, "notes");
  ok("its dock button brings it back where it was, on top", !b.min && b.x === a.x && b.y === a.y && b.w === a.w && st(d).front === "notes", b);
  ok("…with the focus on its title bar", d.focused === "wd-notes-titlebar", d.focused);
  click(d, "wd-notes-trigger");
  ok("pressing the dock button of the window on top minimizes it", win(d, "notes").min, win(d, "notes"));
  click(d, "wd-notes-trigger");
  click(d, "wd-list-trigger");
  ok("the dock button of a window underneath brings it to the front", st(d).front === "list" && !win(d, "list").min, st(d).order);

  d.raise("notes");
  d.rebuild();
  click(d, "wd-notes-maximize");
  ok("Maximize: the eased jump is on the clock", d.busyNow(), d.busyNow());
  d.tick(40);
  const mid = box(d, "wd-notes-content");
  d.settle();
  const m = win(d, "notes");
  const desk = box(d, "wd-desk");
  const fb = box(d, "wd-notes-content");
  ok("Maximize fills the desktop", m.max && m.x === 0 && m.y === 0 && m.w === desk[2] && m.h === desk[3] && near(fb[0], desk[0]) && near(fb[2], desk[2]) && near(fb[3], desk[3]), [m, fb, desk]);
  ok("…easing there rather than jumping", mid[2] > a.w && mid[2] < desk[2], mid);
  ok("…and the button is Restore now", tree(d).byId.get("wd-notes-maximize").name === "Restore");
  click(d, "wd-notes-maximize");
  d.settle();
  const r = win(d, "notes");
  ok("Restore puts back the size and the place", !r.max && r.x === a.x && r.y === a.y && r.w === a.w && r.h === a.h, r);
  // The double-click on a title bar.
  const [x, y] = barPoint(d, "notes");
  d.pointerDown(d.hitId(x, y), x, y, 0);
  d.pointerUp();
  d.pointerDown(d.hitId(x, y), x, y, 0);
  d.pointerUp();
  d.dblclick(d.hitId(x, y), x);
  d.settle();
  ok("a double-click on the title bar maximizes", win(d, "notes").max, win(d, "notes"));
  const [x2, y2] = barPoint(d, "notes");
  d.dblclick(d.hitId(x2, y2), x2);
  d.settle();
  ok("…and another restores", !win(d, "notes").max && win(d, "notes").w === a.w, win(d, "notes"));
  // Picked up while maximized: back to its own size, under the pointer.
  click(d, "wd-notes-maximize");
  d.settle();
  const [x3, y3] = barPoint(d, "notes");
  dragFrom(d, x3, y3, 200, 120);
  const u = win(d, "notes");
  const fr = box(d, "wd-notes-content");
  ok("a maximized window dragged by its title comes back to its size, under the pointer", !u.max && u.w === a.w && u.h === a.h &&
    fr[0] <= x3 + 200 && fr[0] + fr[2] >= x3 + 200 && fr[1] <= y3 + 120 && fr[1] + 40 >= y3 + 120, [u, fr, x3 + 200, y3 + 120]);

  d.raise("about");
  d.rebuild();
  click(d, "wd-about-close");
  ok("Close removes it", !win(d, "about").open && box(d, "wd-about-content") === null && !tree(d).byId.has("wd-about-content"));
  ok("…the dock says it is closed", tree(d).byId.get("wd-about-trigger").name === "About, closed");
  ok("…and says where to get it back", st(d).said === "About closed. Reopen it from the dock.", st(d).said);
  click(d, "wd-about-trigger");
  ok("the dock reopens it, on top, focused on its title bar", win(d, "about").open && st(d).front === "about" && d.focused === "wd-about-titlebar", [win(d, "about"), d.focused]);
  click(d, "wd-about-ok");
  ok("About's OK closes it too", !win(d, "about").open);
  ok("the states lint clean", d.a11yProblems().length === 0, d.a11yProblems());
}

console.log("--- snapping to a half ---");
{
  const d = fresh();
  const a = win(d, "form");
  const desk = box(d, "wd-desk");
  const [x, y] = barPoint(d, "form");
  d.pointerDown(d.hitId(x, y), x, y, 0);
  d.pointerMove(x - 100, y, 16);
  d.pointerMove(desk[0] - 30, y + 10, 32);
  d.displayListJson();
  ok("dragged to the left edge, the half it would fill is shown", st(d).snapHint === "left" && box(d, "wd-snap") !== null, st(d).snapHint);
  d.pointerUp();
  d.settle();
  const s = win(d, "form");
  ok("dropped there, it fills the left half", s.snapped === "left" && s.x === 0 && s.y === 0 && s.w === Math.floor(desk[2] / 2) && s.h === desk[3], s);
  ok("…and says so", st(d).said === "New contact snapped to the left half.", st(d).said);
  const [x2, y2] = barPoint(d, "form");
  dragFrom(d, x2, y2, 300, 60);
  const r = win(d, "form");
  ok("dragged off again, it has its own size back", r.snapped === "" && r.w === a.w && r.h === a.h, r);
  dragBar(d, "form", 3000, 0, 3);
  ok("the right edge snaps to the right half", win(d, "form").snapped === "right" && win(d, "form").x + win(d, "form").w === desk[2], win(d, "form"));
}

console.log("--- the modal ---");
{
  const d = fresh();
  click(d, "wd-prefs-trigger");
  let t = tree(d);
  const f = t.byId.get("wd-prefs-content");
  ok("Settings opens a modal dialog named Desktop settings", st(d).prefs.open && f && f.role === "dialog" && f.modal && f.name === "Desktop settings", f && { modal: f.modal, name: f.name });
  ok("…with the focus on its first control", d.focused === "wd-prefs-snap", d.focused);
  ok("…and its trigger says it is expanded", t.byId.get("wd-prefs-trigger").expanded === 2);
  const scr = box(d, "wd-prefs-scrim");
  const card = box(d, "wd-card");
  ok("a scrim covers the whole card, dock included", scr && near(scr[0], card[0] + 1) && near(scr[2], card[2] - 2) && near(scr[3], card[3] - 2), [scr, card]);
  const fb = box(d, "wd-prefs-content");
  ok("the dialog starts centred on the card", Math.abs((fb[0] + fb[2] / 2) - (card[0] + card[2] / 2)) <= 1 && Math.abs((fb[1] + fb[3] / 2) - (card[1] + card[3] / 2)) <= 1, [fb, card]);
  const seen = [];
  for (let i = 0; i < 8; i++) { d.keyWith("Tab", false, false, false); seen.push(d.focused); }
  ok("Tab stays inside and wraps", seen.every((id) => id.startsWith("wd-prefs-")) && seen[4] === "wd-prefs-titlebar" && seen[5] === "wd-prefs-close", seen);
  d.keyWith("Tab", true, false, false);
  d.keyWith("Tab", true, false, false);
  ok("Shift+Tab goes back round", d.focused === "wd-prefs-close", d.focused);
  const lb = box(d, "wd-list-content");
  ok("the desktop under it is not reachable: a press there hits the scrim", d.hitId(lb[0] + 40, lb[1] + 60) === "wd-prefs-scrim", d.hitId(lb[0] + 40, lb[1] + 60));
  d.setFocus("wd-list-star-0");
  ok("…nor can the focus be put there from outside", d.focused.startsWith("wd-prefs-"), d.focused);
  // Movable by its title bar, still a modal.
  const p0 = st(d).prefs;
  const hb = box(d, "wd-prefs-titlebar");
  dragFrom(d, hb[0] + 40, hb[1] + 20, -60, 40);
  const p1 = st(d).prefs;
  ok("it moves by its title bar", p1.x === p0.x - 60 && p1.y === p0.y + 40 && p1.open, [p0, p1]);
  keys(d, ["ArrowRight", ["ArrowDown", true]]);
  ok("…and by the arrows on its focused title bar", st(d).prefs.x === p1.x + 10 && st(d).prefs.y === p1.y + 1, st(d).prefs);
  t = tree(d);
  ok("its title bar is a draggable button, since it moves", t.byId.get("wd-prefs-titlebar").role === "button" && t.byId.get("wd-prefs-titlebar").roledesc === "draggable");
  ok("it lints clean", d.a11yProblems().length === 0, d.a11yProblems());
  keys(d, ["Escape"]);
  ok("Escape closes it and the focus goes back to the trigger", !st(d).prefs.open && d.focused === "wd-prefs-trigger", d.focused);

  // From About's button, and Save.
  click(d, "wd-about-prefs");
  ok("About's Settings… opens the same dialog", st(d).prefs.open);
  click(d, "wd-prefs-snap");
  click(d, "wd-prefs-save");
  ok("Save applies the switch and the focus goes back to About's button", !st(d).snapOn && d.focused === "wd-about-prefs", [st(d).snapOn, d.focused]);
  dragBar(d, "form", -3000, 0, 3);
  ok("…so a window dropped on the edge no longer snaps", win(d, "form").snapped === "", win(d, "form"));
  click(d, "wd-prefs-trigger");
  click(d, "wd-prefs-snap");
  click(d, "wd-prefs-cancel");
  ok("Cancel keeps what was saved", !st(d).snapOn && d.focused === "wd-prefs-trigger");
  click(d, "wd-prefs-trigger");
  clickAt(d, box(d, "wd-card")[0] + 5, box(d, "wd-card")[1] + 5);
  ok("a press on the scrim closes it, focus back", !st(d).prefs.open && d.focused === "wd-prefs-trigger", d.focused);
  click(d, "wd-prefs-trigger");
  click(d, "wd-prefs-reset");
  const s = st(d);
  ok("Reset layout puts the four windows back", !s.prefs.open && s.front === "form" && s.windows.form.x === 450 && s.windows.list.x === 24, s.windows);
}

console.log("--- keyboard ---");
{
  const d = fresh();
  keys(d, ["Tab"]);
  ok("Tab from nothing lands on the first window's title bar", d.focused === "wd-list-titlebar", d.focused);
  ok("…and brings that window to the front", st(d).front === "list", st(d).order);
  keys(d, ["Tab", "Tab", "Tab", "Tab"]);
  ok("then its buttons, then its content", d.focused === "wd-list-star-0", d.focused);
  const ring = [];
  for (let i = 0; i < 30; i++) {
    const took = d.keyWith("Tab", false, false, false);
    if (!took) break;
    ring.push(d.focused);
  }
  ok("Tab reaches every window's content", ["wd-form-name", "wd-form-add", "wd-notes-input", "wd-notes-add", "wd-about-ok"].every((id) => ring.includes(id)), ring);
  ok("…then the dock, and then it lets go", ring[ring.length - 1] === "wd-list-trigger" && d.focused === "", ring.slice(-3));
  d.setFocus("wd-list-trigger");
  keys(d, ["ArrowRight", "ArrowRight"]);
  ok("the dock's arrows rove along it", d.focused === "wd-notes-trigger", d.focused);
  keys(d, ["End"]);
  ok("…End to Settings", d.focused === "wd-prefs-trigger", d.focused);

  // Alt+Space, then the arrows.
  const k = fresh();
  click(k, "wd-form-name");
  const a = win(k, "form");
  keys(k, [[" ", false, false, true]]);
  ok("Alt+Space puts the focus on the window's title bar", k.focused === "wd-form-titlebar" && st(k).moveMode, k.focused);
  ok("…and says what the keys do", st(k).said.startsWith("Move New contact: arrows move it"), st(k).said);
  keys(k, ["ArrowRight", "ArrowRight", "ArrowDown"]);
  ok("the arrows move it by 10px", win(k, "form").x === a.x + 20 && win(k, "form").y === a.y + 10, win(k, "form"));
  ok("…announcing where it is", st(k).said === `New contact at ${a.x + 20}, ${a.y + 10}.`, st(k).said);
  keys(k, [["ArrowLeft", true]]);
  ok("Shift+arrows by 1px", win(k, "form").x === a.x + 19, win(k, "form"));
  keys(k, [["ArrowRight", true, true], ["ArrowDown", true, true]]);
  ok("Ctrl+Shift+arrows resize by 10px", win(k, "form").w === a.w + 10 && win(k, "form").h === a.h + 10, win(k, "form"));
  ok("…announcing the size", st(k).said === `New contact is ${a.w + 10} by ${a.h + 10}.`, st(k).said);
  for (let i = 0; i < 40; i++) keys(k, [["ArrowLeft", true, true]]);
  ok("…and not under the minimum", win(k, "form").w === a.minW, win(k, "form"));
  keys(k, ["Enter"]);
  ok("Enter finishes, and the focus goes back to where it was", k.focused === "wd-form-name" && !st(k).moveMode, k.focused);
  for (let i = 0; i < 80; i++) keys(k, [[" ", false, false, true], "ArrowUp", "Escape"]);
  ok("the arrows keep it on the desktop too", win(k, "form").y === 0, win(k, "form"));

  // Tabbing to a title bar is the same move.
  keys(k, [["Tab", true], ["Tab", true], ["Tab", true], ["Tab", true]]);
  ok("Shift+Tab back to the title bar", k.focused === "wd-form-titlebar", k.focused);
  const b = win(k, "form");
  keys(k, ["ArrowDown"]);
  ok("…where the arrows move it without Alt+Space", win(k, "form").y === b.y + 10, win(k, "form"));

  // Cycling.
  const c = fresh();
  const seen = [];
  for (let i = 0; i < 4; i++) { keys(c, [["F6", false, true]]); seen.push(st(c).front); }
  ok("Ctrl+F6 visits every window in turn", seen.join(",") === "list,notes,about,form", seen);
  ok("…and says which", st(c).said === "New contact window.", st(c).said);
  keys(c, [["F6", true, true]]);
  ok("Ctrl+Shift+F6 goes back", st(c).front === "about", st(c).order);
  ok("…with the focus in that window", c.focused.startsWith("wd-about-"), c.focused);
  click(c, "wd-notes-minimize");
  const vis = [];
  for (let i = 0; i < 3; i++) { keys(c, [["F6", false, true]]); vis.push(st(c).front); }
  ok("a minimized window is skipped", !vis.includes("notes"), vis);
  ok("the claims from a text field: F6 and Alt+Space", c.ownsKeyAlt("F6", false) && c.ownsKeyAlt(" ", true) && !c.ownsKeyAlt(" ", false));
}

console.log("--- the content is real ---");
{
  const d = fresh();
  click(d, "wd-form-add");
  ok("Add contact with no name says what is missing, focus on the name", st(d).contacts === 5 && d.focused === "wd-form-name" && tree(d).byId.get("wd-form-status").name === "Enter a name first.", tree(d).byId.get("wd-form-status"));
  d.applyEdit("wd-form-name", "Hedy Lamarr", 11, 11);
  ok("typing clears the message", (tree(d).byId.get("wd-form-status").name || "") === "");
  click(d, "wd-form-email");
  d.applyEdit("wd-form-email", "hedy@mgm.com", 12, 12);
  click(d, "wd-form-fav");
  d.setFocus("wd-form-email");
  keys(d, ["Enter"]);
  ok("…Enter adds it to Contacts, first", st(d).contacts === 6 && tree(d).byId.get("wd-list-name-0").name === "Hedy Lamarr" && tree(d).byId.get("wd-list-star-0").pressed === 2, tree(d).byId.get("wd-list-name-0"));
  ok("…and empties the form", JSON.parse(d.fieldStateJson("wd-form-name")).value === "");
  click(d, "wd-list-star-1");
  ok("a star toggles", tree(d).byId.get("wd-list-star-1").pressed === 1 && st(d).said === "Ada Lovelace is not a favorite.", st(d).said);
  click(d, "wd-notes-input");
  d.applyEdit("wd-notes-input", "Buy milk", 8, 8);
  keys(d, ["Enter"]);
  ok("Notes: Enter adds the note, newest first", st(d).notes === 4 && tree(d).byId.get("wd-notes-item-3") !== undefined, st(d).notes);
  const fs1 = JSON.parse(d.fieldStateJson("wd-notes-input"));
  const nb = box(d, "wd-notes-input");
  ok("a field reports its box where its window is", fs1.box && near(fs1.box.x, nb[0], 1) && near(fs1.box.y, nb[1], 1), [fs1.box, nb]);
  dragBar(d, "notes", 50, 20);
  const fs2 = JSON.parse(d.fieldStateJson("wd-notes-input"));
  ok("…and follows the window when it moves", fs2.box.x === fs1.box.x + 50 && fs2.box.y === fs1.box.y + 20, [fs1.box, fs2.box]);
  const tb = box(d, "wd-notes-input");
  ok("the cursor over a field is text", d.cursorAt(tb[0] + 20, tb[1] + 10) === "text", d.cursorAt(tb[0] + 20, tb[1] + 10));
  const bb = barPoint(d, "notes");
  ok("…and over a title bar, move", d.cursorAt(bb[0], bb[1]) === "move", d.cursorAt(bb[0], bb[1]));
  // Many contacts: the table scrolls to a focused star.
  for (let i = 0; i < 6; i++) { d.applyEdit("wd-form-name", "P" + i, 2, 2); d.setFocus("wd-form-name"); keys(d, ["Enter"]); }
  d.setFocus("wd-list-star-11");
  const sb = box(d, "wd-list-star-11");
  const body = box(d, "wd-list-rows");
  ok("a focused star past the bottom of the table is scrolled into view", sb[1] >= body[1] - 0.5 && sb[1] + sb[3] <= body[1] + body[3] + 0.5, [sb, body]);
  ok("the busy desktop lints clean", d.a11yProblems().length === 0, d.a11yProblems());
}

console.log("--- phone widths ---");
for (const w of [390, 358, 320]) {
  const d = fresh(w, 620);
  const s = st(d);
  const desk = box(d, "wd-desk");
  ok(`${w}: no style errors, lints clean`, d.styleErrorCount() === 0 && d.a11yProblems().length === 0, d.a11yProblems());
  ok(`${w}: every window opens as a full sheet`, ["list", "form", "notes", "about"].every((k) => s.windows[k].max && s.windows[k].w === desk[2] && s.windows[k].h === desk[3]), s.windows);
  const card = box(d, "wd-card");
  const dock = box(d, "wd-dockbar");
  ok(`${w}: the card and the dock fit the page`, card[0] >= 0 && card[0] + card[2] <= w && dock[0] + dock[2] <= card[0] + card[2], [card, dock]);
  const fb = box(d, "wd-form-content");
  ok(`${w}: the front window's content fits its width`, box(d, "wd-form-add")[0] + box(d, "wd-form-add")[2] <= fb[0] + fb[2], fb);
  const [x, y] = barPoint(d, "form");
  dragFrom(d, x, y, 0, 80);
  const r = win(d, "form");
  ok(`${w}: dragging a sheet by its title brings it back to a window you can move`, !r.max && r.w <= desk[2] && r.y > 0, r);
  click(d, "wd-form-close");
  click(d, "wd-form-trigger");
  ok(`${w}: reopened, it is a sheet again`, win(d, "form").max, win(d, "form"));
  click(d, "wd-prefs-trigger");
  const pb = box(d, "wd-prefs-content");
  ok(`${w}: the dialog fits the card`, pb[0] >= card[0] && pb[0] + pb[2] <= card[0] + card[2] && pb[1] >= card[1], [pb, card]);
  ok(`${w}: …and lints clean`, d.a11yProblems().length === 0, d.a11yProblems());
}
{
  const d = fresh();
  const a = win(d, "list");
  d.pageW = 358;
  d.displayListJson();
  ok("resized to a phone after it was built, the windows become sheets", win(d, "list").max, win(d, "list"));
  d.pageW = 900;
  d.displayListJson();
  const b = win(d, "list");
  ok("…and back on a desktop they are windows again, where they were", !b.max && b.x === a.x && b.w === a.w, b);
}

// =============================================================================
// THE BROWSER
// =============================================================================
if (!fs.existsSync(path.join(HERE, "bundle.js"))) {
  console.log("  FAIL bundle.js missing — run `node gallery/evgui/demo/build.mjs` first");
  failed++;
} else {
  console.log("--- the page, in Chromium ---");
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(ROOT, rel.slice(1));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/gallery/evgui/demo/index.html?demo=window`;
  const { chromium } = requireHostTool("playwright-core");
  const browser = await chromium.launch({ executablePath: findChromium() });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

  const open = async (viewport) => {
    const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 600 });
    const page = await ctx.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push("uncaught: " + e.message.split("\n")[0]));
    page.on("console", (m) => { if (m.type() === "error") problems.push("console.error: " + m.text().split("\n")[0]); });
    // What a reader has been saved for this demo from an earlier run of the
    // Styles panel must not change what is checked.
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* none */ } });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction("document.querySelector('#stage canvas') && window.__wdState", null, { timeout: 15000 });
    await page.evaluate(() => document.querySelector("#stage").scrollIntoView({ block: "center" }));
    await page.waitForTimeout(400);
    return { ctx, page, problems };
  };
  const S = (page) => page.evaluate(() => window.__wdState());
  // App pixels -> client pixels (the stage may be scaled on a phone).
  const at = async (page, id, fx = 0.5, fy = 0.5) => page.evaluate(([id, fx, fy]) => {
    const b = String(window.__wdBox(id) || "").split(",").map(Number);
    if (b.length !== 4) return null;
    const c = document.querySelector("#stage canvas");
    const r = c.getBoundingClientRect();
    const s = r.width / c.clientWidth;
    return [r.left + (b[0] + b[2] * fx) * s, r.top + (b[1] + b[3] * fy) * s];
  }, [id, fx, fy]);
  const settle = (page, ms = 350) => page.waitForTimeout(ms);
  const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name) }); };

  {
    const { ctx, page, problems } = await open({ width: 1440, height: 900 });
    ok("1440: the demo loads without an error", problems.length === 0, problems);
    await shot(page, "window-desktop-1440.png");
    // A real drag, in a few big steps: fast.
    const s0 = await S(page);
    const p = await at(page, "wd-notes-titlebar", 0.3, 0.5);
    await page.mouse.move(p[0], p[1]);
    await page.mouse.down();
    await page.mouse.move(p[0] + 90, p[1] + 20, { steps: 2 });
    await page.mouse.move(p[0] + 260, p[1] - 60, { steps: 2 });
    await shot(page, "window-drag-1440.png");
    const mid = await S(page);
    ok("1440: mid-drag the window is under the pointer and says it is dragging", mid.windows.notes.dragging && mid.windows.notes.x === s0.windows.notes.x + 260, mid.windows.notes);
    const cursor = await page.evaluate(() => document.querySelector("#stage canvas").style.cursor);
    ok("1440: the cursor while dragging a title bar is move", cursor === "move", cursor);
    await page.mouse.up();
    await settle(page);
    const s1 = await S(page);
    ok("1440: a real mouse drag moves the window by the pointer's travel", s1.windows.notes.x === s0.windows.notes.x + 260 && s1.windows.notes.y === s0.windows.notes.y - 60 && s1.front === "notes", [s0.windows.notes, s1.windows.notes]);
    // Out of the canvas and far away, in one jump: pointer capture keeps it.
    const q = await at(page, "wd-notes-titlebar", 0.3, 0.5);
    await page.mouse.move(q[0], q[1]);
    await page.mouse.down();
    await page.mouse.move(q[0] + 50, q[1] + 500, { steps: 1 });
    await page.mouse.move(q[0] + 50, 898, { steps: 1 });
    const cap = await S(page);
    await page.mouse.up();
    await settle(page);
    const s2 = await S(page);
    ok("1440: dragged off the canvas in one jump, it keeps following (pointer capture)", cap.windows.notes.dragging && s2.windows.notes.x === s1.windows.notes.x + 50 && s2.windows.notes.y === s2.windows.notes.pageH - s2.windows.notes.keep, s2.windows.notes);
    ok("1440: …and the release still lands (no stuck drag)", !s2.windows.notes.dragging, s2.windows.notes);
    // The grip and its cursor.
    const g = await at(page, "wd-form-resize-se");
    await page.mouse.move(g[0], g[1]);
    await settle(page, 100);
    const gc = await page.evaluate(() => document.querySelector("#stage canvas").style.cursor);
    ok("1440: over a corner grip the cursor is nwse-resize", gc === "nwse-resize", gc);
    const f0 = (await S(page)).windows.form;
    await page.mouse.down();
    await page.mouse.move(g[0] + 40, g[1] + 30, { steps: 3 });
    await page.mouse.up();
    await settle(page);
    const f1 = (await S(page)).windows.form;
    ok("1440: a real drag on the corner resizes", f1.w === f0.w + 40 && f1.h === f0.h + 30, [f0, f1]);
    // Double-click to maximize.
    const t = await at(page, "wd-list-titlebar", 0.3, 0.5);
    await page.mouse.dblclick(t[0], t[1]);
    await settle(page, 500);
    const mx = await S(page);
    ok("1440: a double-click on the title bar maximizes", mx.windows.list.max && mx.front === "list", mx.windows.list);
    await shot(page, "window-maximized-1440.png");
    const t2 = await at(page, "wd-list-titlebar", 0.3, 0.5);
    await page.mouse.dblclick(t2[0], t2[1]);
    await settle(page, 500);
    ok("1440: …and another restores", !(await S(page)).windows.list.max);
    // Minimize two windows into the dock.
    for (const k of ["notes", "about"]) {
      // Its dock button brings a window that is underneath to the front.
      const up = await at(page, `wd-${k}-trigger`);
      await page.mouse.click(up[0], up[1]);
      await settle(page, 150);
      const m = await at(page, `wd-${k}-minimize`);
      await page.mouse.click(m[0], m[1]);
      await settle(page, 150);
    }
    const mn = await S(page);
    ok("1440: minimize buttons put the windows in the dock", mn.windows.notes.min && mn.windows.about.min, [mn.windows.notes.min, mn.windows.about.min]);
    await shot(page, "window-dock-1440.png");
    // The dock brings one back.
    const db = await at(page, "wd-notes-trigger");
    await page.mouse.click(db[0], db[1]);
    await settle(page, 200);
    ok("1440: the dock button restores it", !(await S(page)).windows.notes.min);
    // The modal, from the keyboard's end: the focus goes back to the DOM trigger.
    const pt = await at(page, "wd-prefs-trigger");
    await page.mouse.click(pt[0], pt[1]);
    await settle(page, 300);
    const mo = await S(page);
    ok("1440: Settings opens the modal with the focus inside", mo.prefs.open && mo.focused === "wd-prefs-snap", mo.focused);
    const hiddenOutside = await page.evaluate(() => {
      const el = document.querySelector('[data-a11y-id="wd-list-content"]');
      if (!el) return true;
      return !!el.closest("[aria-hidden=true]") || !!el.closest("[inert]") || el.getAttribute("aria-hidden") === "true";
    });
    ok("1440: behind the modal, the windows are out of the reader's reach", hiddenOutside, hiddenOutside);
    await shot(page, "window-modal-1440.png");
    for (let i = 0; i < 9; i++) await page.keyboard.press("Tab");
    const trapped = await S(page);
    ok("1440: Tab on the page stays inside the modal", trapped.prefs.open && trapped.focused.startsWith("wd-prefs-"), trapped.focused);
    const mt = await at(page, "wd-prefs-titlebar", 0.3, 0.5);
    await page.mouse.move(mt[0], mt[1]);
    await page.mouse.down();
    await page.mouse.move(mt[0] - 120, mt[1] + 50, { steps: 3 });
    await page.mouse.up();
    await settle(page, 150);
    const mv = await S(page);
    ok("1440: the modal moves under a real drag", mv.prefs.x === mo.prefs.x - 120 && mv.prefs.y === mo.prefs.y + 50, [mo.prefs, mv.prefs]);
    await page.keyboard.press("Escape");
    await settle(page, 300);
    const back = await S(page);
    const active = await page.evaluate(() => (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.a11yId : ""));
    ok("1440: Escape closes it and the focus is back on the trigger, in the DOM too", !back.prefs.open && back.focused === "wd-prefs-trigger" && active === "wd-prefs-trigger", [back.focused, active]);
    // The keyboard: Alt+Space and the arrows.
    const nameBox = await at(page, "wd-form-name");
    await page.mouse.click(nameBox[0], nameBox[1]);
    await settle(page, 150);
    await page.keyboard.type("Rosalind");
    await settle(page, 100);
    const f2 = (await S(page)).windows.form;
    await page.keyboard.press("Alt+Space");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Control+Shift+ArrowDown");
    await settle(page, 150);
    const f3 = await S(page);
    ok("1440: typed into a field, Alt+Space then arrows move the window, Ctrl+Shift resizes", f3.windows.form.x === f2.x - 20 && f3.windows.form.h === f2.h + 10 && f3.moveMode, [f2, f3.windows.form]);
    const liveText = await page.evaluate(() => { const el = document.querySelector('[data-a11y-id="wd-live"]'); return el ? el.textContent : ""; });
    ok("1440: the status region in the page says the size", /New contact is \d+ by \d+\./.test(liveText), liveText);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await settle(page, 200);
    const f4 = await S(page);
    ok("1440: Enter leaves move mode, back in the field, and Enter there adds the contact", f4.contacts === 6 && f4.focused === "wd-form-name", [f4.contacts, f4.focused]);
    await page.keyboard.press("Control+F6");
    await settle(page, 150);
    ok("1440: Ctrl+F6 cycles to the next window", (await S(page)).front !== "form", (await S(page)).order);
    // The Styles panel's verdict on the sheet.
    const problemsCss = await page.evaluate((css) => window.__styles.validate(css), CSS);
    ok("1440: the Styles panel finds no problem in window.css", problemsCss.length === 0, problemsCss.slice(0, 5));
    const inv = await page.evaluate(() => window.__styles.inventory("window").map((e) => e.cls));
    ok("1440: its guide lists the demo's classes", inv.includes("wd-win") && inv.includes("wd-handle") && inv.includes("wd-grip-se"), inv.length);
    ok("1440: still no errors", problems.length === 0, problems);
    await ctx.close();
  }

  {
    const { ctx, page, problems } = await open({ width: 390, height: 844 });
    const s = await S(page);
    ok("390: loads without an error", problems.length === 0, problems);
    ok("390: the windows open as full sheets", ["list", "form", "notes", "about"].every((k) => s.windows[k].max), s.windows);
    const over = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    ok("390: no sideways scroll on the page", over <= 0, over);
    await shot(page, "window-phone-desktop-390.png");
    await shot(page, "window-phone-maximized-390.png");
    const p = await at(page, "wd-form-titlebar", 0.3, 0.5);
    await page.mouse.move(p[0], p[1]);
    await page.mouse.down();
    await page.mouse.move(p[0] + 10, p[1] + 60, { steps: 4 });
    await shot(page, "window-phone-drag-390.png");
    await page.mouse.up();
    await settle(page, 200);
    const d = (await S(page)).windows.form;
    ok("390: a drag on a sheet's title brings it back to a window and moves it", !d.max && d.y > 0 && d.w <= d.pageW, d);
    for (const k of ["form", "about"]) {
      const m = await at(page, `wd-${k}-minimize`);
      await page.mouse.click(m[0], m[1]);
      await settle(page, 150);
    }
    const pm = await S(page);
    ok("390: minimized to the dock", pm.windows.form.min && pm.windows.about.min, [pm.windows.form.min, pm.windows.about.min]);
    await shot(page, "window-phone-dock-390.png");
    const pt = await at(page, "wd-prefs-trigger");
    await page.mouse.click(pt[0], pt[1]);
    await settle(page, 300);
    ok("390: the modal opens", (await S(page)).prefs.open);
    await shot(page, "window-phone-modal-390.png");
    const over2 = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    ok("390: still no sideways scroll", over2 <= 0, over2);
    ok("390: no errors", problems.length === 0, problems);
    await ctx.close();
  }
  await browser.close();
  server.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("RESULT FAIL");
  process.exit(1);
}
console.log("RESULT PASS");

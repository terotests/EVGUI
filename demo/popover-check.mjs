#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Popover demo, checked in Node against the compiled demo.
//
// `PopoverCtl` is measured against @radix-ui/react-popover by the conformance
// specs. This file checks what those cannot see: that the demo's OWN tree says
// the same thing to a reader (a trigger with aria-haspopup="dialog",
// aria-expanded and aria-controls; the content a dialog labelled by its
// title), that every way in and out works the way Radix's non-modal popover
// does — the trigger, Escape, a press outside, the focus leaving — that the
// focus goes in and comes back, where the overlay pass put each popover
// (under / beside its trigger, 4px away, flipped or shifted to stay inside
// the demo), that the Dimensions fields take typing, and that nothing
// overlaps while everything is closed.
//
//   node gallery/evgui/demo/popover-check.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/PopoverDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "popover.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

const fresh = (w = 900, h = 470) => {
  const d = new M.PopoverDemo();
  d.pageW = w;
  d.pageH = h;
  d.init(CSS);
  d.displayListJson();
  return d;
};
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const cmds = (d) => JSON.parse(d.displayListJson()).cmds;
const centre = (n) => [n.b[0] + n.b[2] / 2, n.b[1] + n.b[3] / 2];
const clickAt = (d, x, y) => {
  const hit = d.hitId(x, y);
  d.beginSelection(hit, x, false);
  d.endSelection();
  d.displayListJson();
  return hit;
};
const click = (d, id) => {
  const n = tree(d).byId.get(id);
  if (!n) return "(no node " + id + ")";
  const [x, y] = centre(n);
  return clickAt(d, x, y);
};
const open = (d) => d.openWhich();
const tabs = (d, n, back = false) => {
  const seen = [];
  for (let i = 0; i < n; i++) { d.keyWith("Tab", back, false); seen.push(d.focused); }
  return seen;
};
// [side, align, x, y, w, h] of the open content, from the overlay pass.
const placed = (d) => {
  const p = d.placed().split("|");
  return { side: p[0], align: p[1], x: +p[2], y: +p[3], w: +p[4], h: +p[5] };
};
const inside = (b, w, h) => b.x >= -0.5 && b.y >= -0.5 && b.x + b.w <= w + 0.5 && b.y + b.h <= h + 0.5;
const near = (a, b, e = 1) => Math.abs(a - b) <= e;
const overlap = (a, b) => a[0] < b[0] + b[2] - 0.5 && b[0] < a[0] + a[2] - 0.5 && a[1] < b[1] + b[3] - 0.5 && b[1] < a[1] + a[3] - 0.5;

const TRIGGERS = ["pv-dim-trigger", "pv-info-trigger", "pv-top-trigger", "pv-bottom-trigger",
  "pv-left-trigger", "pv-right-trigger", "pv-notif-trigger"];
const SIDES = { "pv-top-trigger": "top", "pv-right-trigger": "right", "pv-bottom-trigger": "bottom", "pv-left-trigger": "left" };

console.log("--- the page, closed ---");
{
  const d = fresh();
  ok("no style errors", d.styleErrorCount() === 0, d.styleErrorCount());
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
  const t = tree(d);
  ok("seven triggers, each a button with aria-haspopup=dialog, collapsed",
    TRIGGERS.every((id) => { const n = t.byId.get(id); return n && n.role === "button" && n.haspopup === "dialog" && n.expanded === 1; }),
    TRIGGERS.map((id) => t.byId.get(id)));
  ok("icon-only triggers are named", t.byId.get("pv-info-trigger").name === "About popovers" &&
    /^Notifications, 2 unread$/.test(t.byId.get("pv-notif-trigger").name), [t.byId.get("pv-info-trigger").name, t.byId.get("pv-notif-trigger").name]);
  ok("no dialog in the tree while none is open (Radix unmounts the content)",
    !t.nodes.some((n) => n.role === "dialog"));
  ok("Tab walks the seven triggers and then lets go",
    JSON.stringify(tabs(d, 8)) === JSON.stringify([...TRIGGERS, ""]), d.focused);
  // Nothing drawn on top of anything else: every visible node's box against
  // every other that is not its ancestor or descendant.
  const nodes = t.nodes.filter((n) => n.b && n.b[2] > 0 && n.b[3] > 0 && n.role !== "document" && n.id !== "pv-page" && !/^pv-card-/.test(n.id));
  const anc = (a, b) => { for (let x = t.byId.get(a.p); x; x = t.byId.get(x.p)) if (x === b) return true; return false; };
  const clashes = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (anc(a, b) || anc(b, a)) continue;
    if (overlap(a.b, b.b)) clashes.push(a.id + "×" + b.id);
  }
  ok("no two controls or texts overlap while closed", clashes.length === 0, clashes);
  const card = (k) => t.byId.get("pv-card-" + k);
  const boxes = cmds(d).filter((c) => c.k === 0 && c.w > 200 && c.h > 380 && c.r >= 12);
  ok("three cards side by side, none overlapping", boxes.length === 3 && !overlap([boxes[0].x, boxes[0].y, boxes[0].w, boxes[0].h], [boxes[1].x, boxes[1].y, boxes[1].w, boxes[1].h]) &&
    !overlap([boxes[1].x, boxes[1].y, boxes[1].w, boxes[1].h], [boxes[2].x, boxes[2].y, boxes[2].w, boxes[2].h]), boxes.map((c) => [c.x, c.y, c.w, c.h]));
  void card;
}

console.log("--- Dimensions: roles, labelling, focus in ---");
{
  const d = fresh();
  ok("the trigger opens it", click(d, "pv-dim-trigger") === "pv-dim-trigger" && open(d) === "pv-dim", open(d));
  const t = tree(d);
  const c = t.byId.get("pv-dim-content");
  ok("the content is role dialog, NOT modal", c && c.role === "dialog" && !c.modal, c);
  ok("named and labelled by its title", c.name === "Dimensions" && c.labelledby === "pv-dim-title" &&
    t.byId.get("pv-dim-title").role === "heading" && t.byId.get("pv-dim-title").name === "Dimensions", c);
  ok("described by 'Set the dimensions for the layer.'", c.describedby === "pv-dim-description" &&
    t.byId.get("pv-dim-description").name === "Set the dimensions for the layer.", c);
  const trig = t.byId.get("pv-dim-trigger");
  ok("the trigger says it is expanded and controls the content", trig.expanded === 2 && trig.controls === "pv-dim-content", trig);
  ok("focus moves into the content, on Width (Radix: first tabbable)", d.focused === "pv-width" && d.focusedField() === "pv-width", d.focused);
  const want = { "pv-width": "100%", "pv-maxwidth": "300px", "pv-height": "25px", "pv-maxheight": "none" };
  ok("four labelled textboxes with shadcn's values", Object.entries(want).every(([id, v]) => {
    const n = t.byId.get(id); return n && n.role === "textbox" && n.value === v;
  }), Object.keys(want).map((id) => t.byId.get(id)));
  ok("labels Width, Max. width, Height, Max. height", ["Width", "Max. width", "Height", "Max. height"].join() ===
    Object.keys(want).map((id) => t.byId.get(id).name).join());
  ok("nothing behind it is hidden (non-modal)", t.nodes.filter((n) => n.hidden).length === 0 && !!t.byId.get("pv-notif-trigger"));
  ok("the tree lints clean with it open", d.a11yProblems().length === 0, d.a11yProblems());

  const p = placed(d);
  const tb = trig.b;
  ok("placed on the bottom, centred on its trigger", p.side === "bottom" && p.align === "center", p);
  ok("4px under the trigger (sideOffset)", near(p.y, tb[1] + tb[3] + 4), [p.y, tb]);
  ok("320 wide (w-80) and centred on the trigger", p.w === 320 && near(p.x + p.w / 2, tb[0] + tb[2] / 2), [p, tb]);
  ok("inside the demo", inside(p, 900, 470), p);
  const list = cmds(d);
  const surf = list.find((k) => k.k === 0 && near(k.x, p.x) && near(k.y, p.y) && near(k.w, p.w));
  ok("white surface, 8px radius, a shadow", surf && surf.r === 8 && surf.c[0] === 255 && surf.sh && surf.sh.blur > 0, surf);
  const edge = list.find((k) => k.k === 1 && near(k.x, p.x) && near(k.y, p.y) && near(k.w, p.w));
  ok("a 1px #e4e4e7 border", edge && edge.t === 1 && edge.c[0] === 228 && edge.c[1] === 228 && edge.c[2] === 231, edge);
  const rows = ["pv-width", "pv-maxwidth", "pv-height", "pv-maxheight"].map((id) => t.byId.get(id).b);
  ok("the fields are inside the popover, in a column, not overlapping",
    rows.every((b) => b[0] >= p.x && b[0] + b[2] <= p.x + p.w && b[1] >= p.y && b[1] + b[3] <= p.y + p.h) &&
    rows.every((b, i) => i === 0 || b[1] >= rows[i - 1][1] + rows[i - 1][3]), rows);
  const dimTexts = list.filter((k) => k.k === 3 && k.x >= p.x && k.x <= p.x + p.w && k.y >= p.y && k.y <= p.y + p.h).map((k) => k.text);
  ok("draws the title, the description, the labels and the values",
    ["Dimensions", "Set the dimensions for the layer.", "Width", "Max. width", "Height", "Max. height", "100%", "300px", "25px", "none"].every((s) => dimTexts.includes(s)), dimTexts);
}

console.log("--- ways out, and the focus back ---");
{
  const d = fresh();
  click(d, "pv-dim-trigger");
  d.keyWith("Escape", false, false);
  ok("Escape closes it, focus back on the trigger", open(d) === "" && d.focused === "pv-dim-trigger", [open(d), d.focused]);
  ok("and the content is gone from the tree", !tree(d).byId.get("pv-dim-content") && tree(d).byId.get("pv-dim-trigger").expanded === 1);
  d.keyWith("Enter", false, false);
  ok("Enter on the focused trigger opens it again", open(d) === "pv-dim" && d.focused === "pv-width", [open(d), d.focused]);
  click(d, "pv-dim-trigger");
  ok("the trigger again closes it (a toggle), focus on it", open(d) === "" && d.focused === "pv-dim-trigger", [open(d), d.focused]);
  d.keyWith(" ", false, false);
  ok("Space opens it", open(d) === "pv-dim");
  const title = tree(d).byId.get("pv-dim-title");
  clickAt(d, ...centre(title));
  ok("a press inside the content (on its text) leaves it open", open(d) === "pv-dim", open(d));
  ok("a press on empty page outside closes it", clickAt(d, 450, 455) !== "" && open(d) === "" , open(d));
  ok("and the focus goes back to the trigger", d.focused === "pv-dim-trigger", d.focused);
  click(d, "pv-dim-trigger");
  click(d, "pv-notif-trigger");
  ok("a press on another trigger closes this one and opens that", open(d) === "pv-notif" && d.focused === "pv-notif-markall", [open(d), d.focused]);
  click(d, "pv-notif-trigger");
  ok("only one open at a time, and none now", open(d) === "");
}

console.log("--- Tab: in, through, and out closes it (non-modal) ---");
{
  const d = fresh();
  click(d, "pv-dim-trigger");
  ok("Tab walks the four fields", JSON.stringify(tabs(d, 3)) === JSON.stringify(["pv-maxwidth", "pv-height", "pv-maxheight"]), d.focused);
  ok("…still open", open(d) === "pv-dim");
  const st = JSON.parse(d.fieldStateJson("pv-maxheight"));
  ok("a field reached by Tab has its text selected, as an <input> does", st.selStart === 0 && st.selEnd === 4, st);
  d.keyWith("Tab", false, false);
  ok("Tab past the last field leaves the popover and closes it", open(d) === "" && d.focused === "pv-info-trigger", [open(d), d.focused]);
  click(d, "pv-dim-trigger");
  d.keyWith("Tab", true, false);
  ok("Shift+Tab from the first field goes to its trigger and keeps it open (Radix ignores focus on the trigger)",
    open(d) === "pv-dim" && d.focused === "pv-dim-trigger", [open(d), d.focused]);
  d.keyWith("Tab", false, false);
  ok("Tab from the trigger goes back into the content", d.focused === "pv-width");
  d.setFocus("pv-bottom-trigger");
  ok("focus moved elsewhere (a reader, a click) closes it", open(d) === "" && d.focused === "pv-bottom-trigger", [open(d), d.focused]);
  click(d, "pv-dim-trigger");
  d.setFocus("");
  ok("focus leaving the demo closes it", open(d) === "" && d.focused === "", [open(d), d.focused]);
  click(d, "pv-dim-trigger");
  ok("a press on the page outside the canvas closes it, focus left alone",
    d.dismissOutside() === true && open(d) === "" && d.focused === "", [open(d), d.focused]);
  ok("…and is nothing with none open", d.dismissOutside() === false);
}

console.log("--- typing in the Dimensions fields ---");
{
  const d = fresh();
  click(d, "pv-dim-trigger");
  ok("the session state is published", JSON.parse(d.fieldStateJson("pv-width")).value === "100%");
  ok("Width opens with its text selected (type to replace)", JSON.parse(d.fieldStateJson("pv-width")).selStart === 0 &&
    JSON.parse(d.fieldStateJson("pv-width")).selEnd === 4);
  d.type("5"); d.type("0"); d.type("%");
  ok("typing replaces the selection", tree(d).byId.get("pv-width").value === "50%", tree(d).byId.get("pv-width").value);
  d.applyEdit("pv-width", "75%", 3, 3);
  ok("an edit through the page's text session lands", tree(d).byId.get("pv-width").value === "75%");
  click(d, "pv-maxheight");
  ok("a click in Max. height moves the focus there", d.focused === "pv-maxheight" && d.focusedField() === "pv-maxheight");
  d.keyWith("End", false, false);
  for (let i = 0; i < 4; i++) d.keyWith("Backspace", false, false);
  for (const ch of "400px") d.type(ch);
  ok("Backspace and typed keys edit it", tree(d).byId.get("pv-maxheight").value === "400px", tree(d).byId.get("pv-maxheight").value);
  const drawn = cmds(d).filter((k) => k.k === 3).map((k) => k.text);
  ok("and the value is drawn", drawn.includes("400px") && drawn.includes("75%"));
  ok("the line under the trigger follows", tree(d).byId.get("pv-status-dim").name === "Layer: 75% × 25px (max 300px × 400px)",
    tree(d).byId.get("pv-status-dim").name);
  d.keyWith("Escape", false, false);
  click(d, "pv-dim-trigger");
  ok("the values survive closing and reopening", tree(d).byId.get("pv-width").value === "75%" && tree(d).byId.get("pv-maxheight").value === "400px");
  ok("Enter in a field does not close it", (d.keyWith("Enter", false, false), open(d)) === "pv-dim");
}

console.log("--- Notifications ---");
{
  const d = fresh();
  click(d, "pv-notif-trigger");
  const t = tree(d);
  const c = t.byId.get("pv-notif-content");
  ok("a dialog labelled Notifications", c && c.role === "dialog" && c.name === "Notifications" && c.labelledby === "pv-notif-title", c);
  ok("focus on Mark all as read (first tabbable)", d.focused === "pv-notif-markall");
  ok("three notifications, two unread", [0, 1, 2].every((i) => t.byId.get("pv-notif-item-" + i).role === "button") &&
    /unread$/.test(t.byId.get("pv-notif-item-0").name) && !/unread$/.test(t.byId.get("pv-notif-item-2").name));
  const p = placed(d);
  const tb = t.byId.get("pv-notif-trigger").b;
  ok("under the bell, right edges aligned (align end), 4px away", p.side === "bottom" && near(p.x + p.w, tb[0] + tb[2]) && near(p.y, tb[1] + tb[3] + 4), [p, tb]);
  ok("inside the demo", inside(p, 900, 470), p);
  ok("Tab walks Mark all and the three items", JSON.stringify(tabs(d, 3)) === JSON.stringify(["pv-notif-item-0", "pv-notif-item-1", "pv-notif-item-2"]));
  click(d, "pv-notif-item-0");
  ok("pressing one marks it read, and the popover stays open", open(d) === "pv-notif" && d.unread() === 1 &&
    !/unread$/.test(tree(d).byId.get("pv-notif-item-0").name), d.unread());
  ok("the bell says one unread", tree(d).byId.get("pv-notif-trigger").name === "Notifications, 1 unread");
  d.setFocus("pv-notif-markall");
  d.keyWith("Enter", false, false);
  ok("Mark all as read clears them", d.unread() === 0 && tree(d).byId.get("pv-notif-trigger").name === "Notifications" &&
    tree(d).byId.get("pv-status-notif").name === "All caught up.");
  d.keyWith("Tab", false, false);
  d.keyWith("Tab", false, false);
  d.keyWith("Tab", false, false);
  d.keyWith("Tab", false, false);
  ok("Tab past the last item leaves the demo and closes it", open(d) === "" && d.focused === "", [open(d), d.focused]);
}

console.log("--- the text popovers and their sides ---");
{
  const d = fresh();
  click(d, "pv-info-trigger");
  let t = tree(d);
  const c = t.byId.get("pv-info-content");
  ok("the (i) popover is a dialog named About popovers, described by its text", c && c.role === "dialog" &&
    c.name === "About popovers" && c.describedby === "pv-info-text", c);
  ok("with nothing to tab to, the content itself takes the focus", d.focused === "pv-info-content" && c.focusable, [d.focused, c]);
  d.keyWith("Tab", false, false);
  ok("Tab from it goes to the next trigger and closes it", open(d) === "" && d.focused === "pv-top-trigger", [open(d), d.focused]);
  for (const [id, side] of Object.entries(SIDES)) {
    click(d, id);
    t = tree(d);
    const p = placed(d);
    const tb = t.byId.get(id).b;
    const cn = t.byId.get(id.replace("-trigger", "-content"));
    ok(`${side}: opens on the ${side}, 4px from the trigger, centred`, p.side === side && (
      side === "bottom" ? near(p.y, tb[1] + tb[3] + 4) && near(p.x + p.w / 2, tb[0] + tb[2] / 2) :
      side === "top" ? near(p.y + p.h, tb[1] - 4) && near(p.x + p.w / 2, tb[0] + tb[2] / 2) :
      side === "right" ? near(p.x, tb[0] + tb[2] + 4) && near(p.y + p.h / 2, tb[1] + tb[3] / 2) :
      near(p.x + p.w, tb[0] - 4) && near(p.y + p.h / 2, tb[1] + tb[3] / 2)), [p, tb]);
    ok(`${side}: labelled by its title, inside the demo`, cn.labelledby === id.replace("-trigger", "-title") && inside(p, 900, 470), [cn, p]);
    d.keyWith("Escape", false, false);
    ok(`${side}: Escape back to its trigger`, open(d) === "" && d.focused === id);
  }
}

console.log("--- collisions: flip and shift ---");
{
  // A short page: the Bottom button's popover has no room below it, so it
  // flips to the top.
  const d = fresh(900, 300);
  click(d, "pv-bottom-trigger");
  let p = placed(d);
  let tb = tree(d).byId.get("pv-bottom-trigger").b;
  ok("no room below: Bottom flips to the top, 4px above", p.side === "top" && near(p.y + p.h, tb[1] - 4) && inside(p, 900, 300), [p, tb]);
  d.keyWith("Escape", false, false);
  // Narrower, still three columns: Right has no room on the right and flips
  // to the left, where there is.
  const n = fresh(640, 470);
  click(n, "pv-right-trigger");
  p = placed(n);
  tb = tree(n).byId.get("pv-right-trigger").b;
  ok("at 640 wide, Right flips to the left, 4px away", p.side === "left" && near(p.x + p.w, tb[0] - 4) && inside(p, 640, 470), [p, tb]);
  n.keyWith("Escape", false, false);
  // At 390 neither side has room for a 240px popover beside an 88px button:
  // it takes the side that hangs off least and slides back onto the page.
  const q = fresh(390, 716);
  click(q, "pv-left-trigger");
  p = placed(q);
  ok("at 390, Left has room on neither side and is shifted inside", inside(p, 390, 716), p);
  q.keyWith("Escape", false, false);
  // Shift: the Dimensions popover is wider than the room left of its centre.
  const s = fresh(340, 900);
  click(s, "pv-dim-trigger");
  p = placed(s);
  ok("at 340 wide, the 320px Dimensions popover slides back inside", p.side === "bottom" && inside(p, 340, 900), p);
}

console.log("--- phone: 390 wide, every popover inside the canvas ---");
{
  const d = fresh(390, 716);
  ok("no style errors at 390", d.styleErrorCount() === 0);
  const t0 = tree(d);
  const cards = ["dim", "place", "notif"].map((k) => t0.byId.get("pv-card-" + k));
  const boxes = cmds(d).filter((c) => c.k === 0 && c.r >= 12 && c.w > 300);
  ok("the cards stack in one column, full width", boxes.length === 3 && boxes.every((b) => near(b.x, 16) && near(b.w, 358)) &&
    boxes[1].y >= boxes[0].y + boxes[0].h && boxes[2].y >= boxes[1].y + boxes[1].h, boxes.map((b) => [b.x, b.y, b.w, b.h]));
  void cards;
  for (const id of TRIGGERS) {
    click(d, id);
    const p = placed(d);
    ok(`${id}: open, and wholly inside the 390px canvas`, open(d) !== "" && inside(p, 390, 716), p);
    d.keyWith("Escape", false, false);
  }
}

console.log("");
console.log("passed=" + passed + " failed=" + failed);
if (failed > 0) { console.log("FAILURES"); process.exit(1); }
console.log("ALL PASS");

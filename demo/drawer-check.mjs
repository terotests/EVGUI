#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Drawer demo, checked in Node against the compiled demo.
//
// Every drawer is a modal `DrawerCtl`. This file checks what a reader and a
// pointer meet: that each panel is a modal dialog labelled by its title and
// described by its description; every way in and out — the trigger, Escape,
// the overlay, Cancel / × and the drag — and the focus going in, staying in
// and coming back to the trigger; the slide at its start, middle and end; the
// drag that follows the pointer and dismisses past a threshold or on a fling
// and snaps back otherwise; the body that scrolls under a pinned footer; the
// overlay that keeps the page from being pressed; and the phone widths.
//
//   node gallery/evgui/demo/drawer-check.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/DrawerDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "drawer.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};
const near = (a, b, eps = 1) => Math.abs(a - b) <= eps;

const fresh = (w = 900, h = 520) => {
  const d = new M.DrawerDemo();
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
// Where an element is, from the laid-out tree (the panel is not always in
// the accessibility tree: on its way out it has left it).
const box = (d, id) => {
  d.displayListJson();
  const find = (el) => {
    if (el.id === id) return el;
    for (const k of el.children) { const f = find(k); if (f) return f; }
    return null;
  };
  const el = find(d.root);
  return el ? [el.calculatedX, el.calculatedY, el.calculatedWidth, el.calculatedHeight] : null;
};
const centre = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2];
// A press the way the page makes one: hit test, then down and up.
const clickAt = (d, x, y) => {
  const hit = d.hitId(x, y);
  d.pointerDown(hit, x, y, 0);
  d.pointerUp();
  d.displayListJson();
  return hit;
};
const click = (d, id) => {
  const b = box(d, id);
  if (!b) return "(no element " + id + ")";
  const [x, y] = centre(b);
  return clickAt(d, x, y);
};
const openIt = (d, key) => { click(d, `drw-${key}-trigger`); d.settle(); d.displayListJson(); };
const tabs = (d, n, back = false) => {
  const seen = [];
  for (let i = 0; i < n; i++) { d.keyWith("Tab", back, false); seen.push(d.focused); }
  return seen;
};
const panel = (d, key) => box(d, `drw-${key}-panel`);

const TRIGGERS = ["right", "bottom", "left", "top", "resp"].map((k) => `drw-${k}-trigger`);

console.log("--- the page, closed ---");
{
  const d = fresh();
  ok("no style errors", d.styleErrorCount() === 0, d.styleErrorCount());
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
  const t = tree(d);
  ok("five triggers, each a button that opens a dialog, collapsed",
    TRIGGERS.every((id) => { const n = t.byId.get(id); return n && n.role === "button" && n.haspopup === "dialog" && n.expanded === 1; }),
    TRIGGERS.map((id) => t.byId.get(id)));
  ok("no dialog in the tree while none is open", !t.nodes.some((n) => n.role === "dialog" || n.modal));
  ok("Tab walks the five triggers and then lets go",
    JSON.stringify(tabs(d, 6)) === JSON.stringify([...TRIGGERS, ""]), d.focused);
  ok("nothing is animating at rest", d.busyNow() === false);
  ok("the wheel is the page's while nothing is open", d.scrollBy(100) === false);
}

const EXPECT = {
  right: { title: "Move Goal", desc: "Set your daily activity goal.", focus: "drw-right-body" },
  bottom: { title: "Move Goal", desc: "Set your daily activity goal.", focus: "drw-bottom-dec" },
  left: { title: "Acme Inc.", desc: "Jump to a section of the workspace.", focus: "drw-left-nav-dashboard" },
  top: { title: "Notifications", desc: "You have 3 unread messages.", focus: "drw-top-read" },
  resp: { title: "Notification settings", desc: "Choose what we tell you about.", focus: "drw-resp-sw-email" },
};

console.log("--- each drawer: roles, labelling, focus in, overlay ---");
for (const [key, e] of Object.entries(EXPECT)) {
  const d = fresh();
  openIt(d, key);
  const t = tree(d);
  const p = t.byId.get(`drw-${key}-panel`);
  ok(`${key}: role dialog, aria-modal`, p && p.role === "dialog" && p.modal === true, p);
  ok(`${key}: labelled by its title`, p && p.name === e.title && p.labelledby === `drw-${key}-title` &&
    t.byId.get(`drw-${key}-title`).role === "heading" && t.byId.get(`drw-${key}-title`).name === e.title, p);
  ok(`${key}: described by its description`, p && p.describedby === `drw-${key}-description` &&
    t.byId.get(`drw-${key}-description`).name === e.desc, p && p.describedby);
  ok(`${key}: the focus moves in`, d.focused === e.focus, d.focused);
  ok(`${key}: the trigger says it is expanded`, t.byId.get(`drw-${key}-trigger`).expanded === 2);
  ok(`${key}: lints clean open`, d.a11yProblems().length === 0, d.a11yProblems());
  const list = cmds(d);
  const dim = list.find((k) => k.k === 0 && k.x === 0 && k.y === 0 && k.w === 900 && k.h === 520 && k.c[3] > 0 && k.c[3] < 1);
  ok(`${key}: the overlay dims the whole demo`, !!dim, list.slice(0, 3));
  ok(`${key}: and blurs it (backdrop-filter)`, !!dim && dim.bb >= 3, dim);
  // The page behind: a press where another card's trigger is lands on the
  // overlay, and closes this drawer instead of opening that one.
  const other = key === "right" ? "left" : "right";
  const tb = (() => { const f = fresh(); return box(f, `drw-${other}-trigger`); })();
  const [ox, oy] = centre(tb);
  const hit = d.hitId(ox, oy);
  const pb = panel(d, key);
  const underPanel = ox >= pb[0] && ox <= pb[0] + pb[2] && oy >= pb[1] && oy <= pb[1] + pb[3];
  if (!underPanel) {
    ok(`${key}: the page is covered — a press on ${other}'s trigger hits the overlay`, hit === `drw-${key}-overlay`, hit);
    clickAt(d, ox, oy);
    ok(`${key}: …and closes this drawer, focus back to its trigger`, d.focused === `drw-${key}-trigger`, d.summary());
    d.settle();
    ok(`${key}: …without opening ${other}`, d.openWhich() === "", d.openWhich());
  }
}

console.log("--- the Tab ring is trapped ---");
{
  const d = fresh();
  openIt(d, "right");
  ok("right: Tab cycles body → Submit → Cancel → body",
    JSON.stringify(tabs(d, 4)) === JSON.stringify(["drw-right-submit", "drw-right-close", "drw-right-body", "drw-right-submit"]), d.focused);
  ok("right: Shift+Tab goes round the other way",
    JSON.stringify(tabs(d, 2, true)) === JSON.stringify(["drw-right-body", "drw-right-close"]), d.focused);
  const d2 = fresh();
  openIt(d2, "left");
  const ring = tabs(d2, 9);
  ok("left: Tab walks the seven sections and × and comes round", ring[6] === "drw-left-close" && ring[7] === "drw-left-nav-dashboard", ring);
  d2.setFocus("drw-right-trigger");
  ok("the page behind cannot take the focus while open", d2.focused !== "drw-right-trigger", d2.focused);
  d2.setFocus("drw-left-nav-dashboard");
  d2.keyWith("ArrowDown", false, false);
  ok("the arrows walk the navigation", d2.focused === "drw-left-nav-projects", d2.focused);
}

console.log("--- every way out gives the focus back ---");
for (const [how, act] of [
  ["Escape", (d) => d.keyWith("Escape", false, false)],
  ["Cancel", (d) => click(d, "drw-right-close")],
  ["overlay press", (d) => clickAt(d, 40, 480)],
]) {
  const d = fresh();
  openIt(d, "right");
  act(d);
  d.displayListJson();
  ok(`${how}: focus back on the trigger at once`, d.focused === "drw-right-trigger", d.focused);
  ok(`${how}: the panel slides out rather than vanishing`, d.openWhich() === "right" && d.busyNow(), d.summary());
  ok(`${how}: on its way out it has left the accessibility tree`, !tree(d).nodes.some((n) => n.role === "dialog"));
  ok(`${how}: the trigger is collapsed again`, tree(d).byId.get("drw-right-trigger").expanded === 1);
  d.settle();
  ok(`${how}: gone once the slide ends`, d.openWhich() === "" && !box(d, "drw-right-panel"), d.summary());
}
{
  const d = fresh();
  openIt(d, "left");
  click(d, "drw-left-close");
  ok("× closes the left drawer, focus to its trigger", d.focused === "drw-left-trigger", d.focused);
  const d2 = fresh();
  d2.keyWith("Tab", false, false);
  d2.keyWith("Enter", false, false);
  ok("Enter on a focused trigger opens it", d2.openWhich() === "right" && d2.focused === "drw-right-body", d2.summary());
}

console.log("--- the slide: start, middle, end ---");
{
  const cases = [
    ["right", (b) => b[0], 900, 516],
    ["left", (b) => b[0], -300, 0],
    ["bottom", (b) => b[1], 520, null],
    ["top", (b) => b[1], null, 0],
  ];
  for (const [key, axis, from, to] of cases) {
    const d = fresh();
    click(d, `drw-${key}-trigger`);
    const b0 = panel(d, key);
    const size = key === "right" || key === "left" ? b0[2] : b0[3];
    const f = from === null ? -size : from;
    const t = to === null ? 520 - size : to;
    ok(`${key}: starts off its edge (${f})`, near(axis(b0), f), b0);
    d.tick(150);
    const b1 = panel(d, key);
    // ease-out: half the time is well over half the way.
    const frac = (axis(b1) - f) / (t - f);
    ok(`${key}: at 150ms of 300 it is past half way (ease-out)`, frac > 0.6 && frac < 0.99, frac);
    ok(`${key}: the overlay is only partly in mid-slide`, (() => {
      const dim = cmds(d).find((k) => k.k === 0 && k.x === 0 && k.y === 0 && k.w === 900 && k.h === 520 && k.c[3] < 1);
      return dim && dim.c[3] > 0 && dim.c[3] < 0.1;
    })());
    d.tick(160);
    const b2 = panel(d, key);
    ok(`${key}: flush with its edge at the end (${t})`, near(axis(b2), t), b2);
    ok(`${key}: and settled`, d.busyNow() === false);
    if (key === "right" || key === "left") ok(`${key}: full height of the demo`, b2[1] === 0 && b2[3] === 520, b2);
    else ok(`${key}: full width of the demo`, b2[0] === 0 && b2[2] === 900, b2);
  }
  const d = fresh();
  openIt(d, "right");
  d.keyWith("Escape", false, false);
  d.tick(100);
  const mid = panel(d, "right")[0];
  click(d, "drw-right-trigger");
  ok("the trigger is covered while the panel leaves", d.openWhich() === "right" && d.busyNow());
}

console.log("--- the drag ---");
{
  const drag = (d, key, from, moves) => {
    const [x, y] = from;
    const hit = d.hitId(x, y);
    const took = d.pointerDown(hit, x, y, 0);
    let t = 0;
    for (const [dx, dy, dt] of moves) { t += dt; d.pointerMove(x + dx, y + dy, t); }
    d.displayListJson();
    return { hit, took };
  };
  // Right: from the title, towards the right edge.
  {
    const d = fresh();
    openIt(d, "right");
    const title = centre(box(d, "drw-right-title"));
    const r = drag(d, "right", title, [[20, 0, 100], [40, 0, 100]]);
    ok("right: a press on the title is held as a drag", r.took && r.hit === "drw-right-title", r);
    ok("right: the panel follows the pointer (40px)", near(panel(d, "right")[0], 556), panel(d, "right"));
    d.pointerMove(title[0] - 60, title[1], 300);
    ok("right: never past its resting place the other way", near(panel(d, "right")[0], 516), panel(d, "right"));
    // Back to 40px, slowly: a release that is neither far nor fast.
    d.pointerMove(title[0] + 40, title[1], 1400);
    d.pointerUp();
    ok("right: released early it snaps back, still open", d.openWhich() === "right" && d.busyNow() && d.focused === "drw-right-body", d.summary());
    d.settle();
    ok("right: …to flush with the edge", near(panel(d, "right")[0], 516), panel(d, "right"));
    drag(d, "right", title, [[60, 0, 100], [140, 0, 100]]);
    d.pointerUp();
    ok("right: released past a quarter of its width it is dismissed", d.focused === "drw-right-trigger" && d.busyNow(), d.summary());
    const x0 = panel(d, "right")[0];
    d.tick(16);
    ok("right: the slide out carries on from where it was let go", panel(d, "right")[0] >= x0 && panel(d, "right")[0] < 900, [x0, panel(d, "right")]);
    d.settle();
    ok("right: and it is gone", d.openWhich() === "", d.summary());
  }
  {
    const d = fresh();
    openIt(d, "right");
    const title = centre(box(d, "drw-right-title"));
    drag(d, "right", title, [[10, 0, 10], [30, 0, 10]]);
    d.pointerUp();
    ok("right: a short fast flick dismisses too", d.focused === "drw-right-trigger", d.summary());
  }
  {
    const d = fresh();
    openIt(d, "right");
    const sub = centre(box(d, "drw-right-submit"));
    const r = drag(d, "right", sub, [[150, 0, 100]]);
    ok("right: a press on Submit is a press, not a drag", r.hit === "drw-right-submit" && d.openWhich() === "right" && d.focused === "drw-right-trigger", d.summary());
  }
  // Bottom: from the handle, downwards.
  {
    const d = fresh();
    openIt(d, "bottom");
    const b = panel(d, "bottom");
    const h = centre(box(d, "drw-bottom-handle"));
    drag(d, "bottom", h, [[0, 50, 200]]);
    ok("bottom: dragged down by the handle it follows", near(panel(d, "bottom")[1], b[1] + 50), [b, panel(d, "bottom")]);
    d.pointerUp();
    d.settle();
    ok("bottom: 50px of a tall sheet snaps back", d.openWhich() === "bottom" && near(panel(d, "bottom")[1], b[1]), panel(d, "bottom"));
    drag(d, "bottom", h, [[0, 60, 200], [0, 160, 200]]);
    d.pointerUp();
    ok("bottom: past a quarter it is dismissed", d.focused === "drw-bottom-trigger", d.summary());
    d.settle();
    ok("bottom: and gone", d.openWhich() === "");
  }
  // Left and top go the other way.
  {
    const d = fresh();
    openIt(d, "left");
    const t = centre(box(d, "drw-left-title"));
    drag(d, "left", t, [[-30, 0, 100]]);
    ok("left: dragged left it follows", near(panel(d, "left")[0], -30), panel(d, "left"));
    drag(d, "left", t, [[-120, 0, 200]]);
    d.pointerUp();
    ok("left: dismissed past a quarter", d.focused === "drw-left-trigger");
    const d2 = fresh();
    openIt(d2, "top");
    const tt = centre(box(d2, "drw-top-title"));
    drag(d2, "top", tt, [[0, 30, 200]]);
    ok("top: dragged down (away from its edge) it stays put", near(panel(d2, "top")[1], 0), panel(d2, "top"));
    d2.pointerMove(tt[0], tt[1] - 25, 400);
    d2.displayListJson();
    ok("top: dragged up it follows", near(panel(d2, "top")[1], -25), panel(d2, "top"));
    d2.pointerUp();
    d2.settle();
    ok("top: and snaps back", d2.openWhich() === "top" && near(panel(d2, "top")[1], 0));
  }
}

console.log("--- the body scrolls; the footer stays ---");
{
  const d = fresh();
  openIt(d, "right");
  const foot0 = box(d, "drw-right-submit");
  const cancel0 = box(d, "drw-right-close");
  const p0 = box(d, "drw-right-p0");
  ok("the footer is pinned to the bottom edge", near(cancel0[1] + cancel0[3], 504), cancel0);
  ok("Submit is full width of the panel less its padding", near(foot0[2], 352), foot0);
  ok("ten paragraphs, more than fit", [...Array(10).keys()].every((i) => box(d, "drw-right-p" + i)) && d.bodyMax > 1000, d.bodyMax);
  ok("the wheel scrolls the body", d.scrollBy(200) === true && d.bodyScroll === 200);
  const p1 = box(d, "drw-right-p0");
  ok("the text moved up by 200", near(p1[1], p0[1] - 200), [p0, p1]);
  ok("the footer did not move", JSON.stringify(box(d, "drw-right-submit")) === JSON.stringify(foot0));
  ok("the header did not move", near(box(d, "drw-right-title")[1], 16));
  d.keyWith("End", false, false);
  ok("End goes to the bottom", d.bodyScroll === d.bodyMax);
  ok("and the last paragraph shows above the footer", (() => {
    const last = box(d, "drw-right-p9");
    return last[1] + last[3] <= foot0[1] - 16 + 1 + 16;
  })(), [box(d, "drw-right-p9"), foot0]);
  d.keyWith("Home", false, false);
  d.keyWith("ArrowDown", false, false);
  d.keyWith("PageDown", false, false);
  ok("Home, ArrowDown, PageDown", d.bodyScroll === 280, d.bodyScroll);
  ok("the wheel at the end is still taken (the page behind is inert)", (d.scrollBy(1e6), d.scrollBy(10) === true));
  const d2 = fresh();
  openIt(d2, "bottom");
  ok("with a drawer that has nothing to scroll, the wheel is still kept from the page", d2.scrollBy(50) === true);
}

console.log("--- what the drawers do ---");
{
  const d = fresh();
  openIt(d, "bottom");
  click(d, "drw-bottom-inc");
  click(d, "drw-bottom-inc");
  ok("+ steps the goal by 10", tree(d).byId.get("drw-bottom-number").name.startsWith("370"), tree(d).byId.get("drw-bottom-number"));
  for (let i = 0; i < 10; i++) click(d, "drw-bottom-inc");
  const inc = tree(d).byId.get("drw-bottom-inc");
  ok("+ is disabled at 400, and the focus moved off it", inc.disabled === true && d.focused === "drw-bottom-dec", [inc, d.focused]);
  click(d, "drw-bottom-submit");
  d.settle();
  ok("Submit closes and says what was set", d.openWhich() === "" && tree(d).byId.get("drw-status-bottom").name === "Goal set: 400 calories/day.", tree(d).byId.get("drw-status-bottom"));
  ok("the chart has thirteen bars", (() => { openIt(d, "bottom"); return [...Array(13).keys()].every((i) => box(d, "drw-bottom-bar" + i)); })());

  const l = fresh();
  openIt(l, "left");
  click(l, "drw-left-nav-projects");
  ok("picking a section closes the menu and says so", l.focused === "drw-left-trigger" && tree(l).byId.get("drw-status-left").name === "Current section: Projects.");
  l.settle();
  openIt(l, "left");
  const pr = tree(l).byId.get("drw-left-nav-projects");
  ok("…and the section is current (aria-current=page), and gets the focus", pr.current === "page" && l.focused === "drw-left-nav-projects", pr);
  ok("the list is a navigation landmark", tree(l).byId.get("drw-left-nav").role === "navigation");

  const r = fresh();
  openIt(r, "resp");
  ok("responsive at 900: a centred dialog", (() => { const b = panel(r, "resp"); return near(b[0] + b[2] / 2, 450) && near(b[1] + b[3] / 2, 260); })(), panel(r, "resp"));
  const sw = tree(r).byId.get("drw-resp-sw-push");
  ok("the switches are switches", sw.role === "switch" && sw.checked === 1, sw);
  click(r, "drw-resp-sw-push");
  ok("a press checks it", tree(r).byId.get("drw-resp-sw-push").checked === 2);
  click(r, "drw-resp-cancel");
  r.settle();
  openIt(r, "resp");
  ok("Cancel threw the change away", tree(r).byId.get("drw-resp-sw-push").checked === 1);
  click(r, "drw-resp-sw-push");
  click(r, "drw-resp-save");
  r.settle();
  openIt(r, "resp");
  ok("Save kept it", tree(r).byId.get("drw-resp-sw-push").checked === 2);

  const t = fresh();
  openIt(t, "top");
  click(t, "drw-top-read");
  ok("Mark all as read closes and says so", t.focused === "drw-top-trigger" && tree(t).byId.get("drw-status-top").name === "All notifications marked as read.");
}

console.log("--- phone widths ---");
for (const w of [390, 358, 330]) {
  const d = fresh(w, 520);
  ok(`${w}: no style errors, lints clean`, d.styleErrorCount() === 0 && d.a11yProblems().length === 0);
  const cards = ["right", "bottom", "left", "top", "resp"].map((k) => box(d, "drw-card-" + k));
  ok(`${w}: two cards to a row, inside the page`, cards[0][1] === cards[1][1] && cards[1][0] > cards[0][0] &&
    cards.every((b) => b[0] >= 0 && b[0] + b[2] <= w && b[1] + b[3] <= 520), cards);
  openIt(d, "right");
  const r = panel(d, "right");
  ok(`${w}: the right drawer is 85% wide at most, against the right edge, full height`,
    r[2] <= Math.ceil(w * 0.85) && near(r[0] + r[2], w) && r[1] === 0 && r[3] === 520, r);
  const sub = box(d, "drw-right-submit");
  ok(`${w}: its footer is on screen`, sub[1] + sub[3] <= 520 && sub[0] >= r[0], sub);
  d.keyWith("Escape", false, false);
  d.settle();
  openIt(d, "left");
  const l = panel(d, "left");
  ok(`${w}: the left drawer is 85% wide at most, against the left edge`, l[2] <= Math.ceil(w * 0.85) && l[0] === 0, l);
  d.keyWith("Escape", false, false);
  d.settle();
  openIt(d, "bottom");
  const b = panel(d, "bottom");
  ok(`${w}: the bottom drawer is full width and on the page`, b[0] === 0 && b[2] === w && b[1] >= 0 && near(b[1] + b[3], 520), b);
  const ch = box(d, "drw-bottom-chart");
  const bs = box(d, "drw-bottom-submit");
  ok(`${w}: its chart stays above Submit`, ch[1] + ch[3] <= bs[1], [ch, bs]);
  d.keyWith("Escape", false, false);
  d.settle();
  openIt(d, "resp");
  const rp = panel(d, "resp");
  ok(`${w}: the responsive one is a bottom drawer here`, rp[0] === 0 && rp[2] === w && near(rp[1] + rp[3], 520) && box(d, "drw-resp-handle") !== null, rp);
  ok(`${w}: lints clean with it open`, d.a11yProblems().length === 0, d.a11yProblems());
}

{
  // The page sizes the demo from outside, after it was built at 900.
  const d = fresh();
  d.pageW = 358;
  d.pageH = 520;
  const a = box(d, "drw-card-right");
  const b = box(d, "drw-card-bottom");
  ok("resized to a phone after it was built, it lays out for the phone", a[1] === b[1] && b[0] > a[0] && b[0] + b[2] <= 358, [a, b]);
  const t = tree(d).byId.get("drw-top-trigger");
  const tb = box(d, "drw-top-trigger");
  ok("…and the reader's tree agrees with the picture", t && JSON.stringify(t.b.map(Math.round)) === JSON.stringify(tb.map(Math.round)), [t && t.b, tb]);
  // A top drawer's footer on a phone sits under its list.
  openIt(d, "top");
  const list = box(d, "drw-top-list");
  const read = box(d, "drw-top-read");
  ok("phone: the top drawer's buttons are below its list", read[1] >= list[1] + list[3], [list, read]);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

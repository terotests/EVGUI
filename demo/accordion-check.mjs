#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The accordion demo, checked in Node against the compiled AccordionDemo:
//
//   npm run ui:accordion:check
//
//   * semantics — triggers are buttons with aria-expanded and aria-controls,
//     an open panel is a region named by (and aria-labelledby) its trigger, a
//     closed one is not in the tree, the lists themselves are roleless;
//   * type="single" (one open, collapsible), type="multiple" (any number),
//     and a non-collapsible single list straight from AccordionCtl;
//   * the keyboard — ArrowDown/ArrowUp between one list's triggers, wrapping,
//     Home/End, horizontal arrows ignored, Enter/Space toggling;
//   * every trigger is its own tab stop (focusable, inside no composite);
//   * the chevron's class and its rotation, turned by a transition;
//   * the page height follows the open items, both ways, and nothing is drawn
//     past it; nothing overlaps, at 900px and at a phone's 358px.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const M = require(path.join(ROOT, "gallery", "evgui", "bin", "AccordionDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "accordion.css"), "utf8");

let failed = 0;
let passed = 0;
function ok(label, cond, detail = "") {
  if (cond) passed += 1;
  else failed += 1;
  console.log(`  ${cond ? "PASS" : "FAIL"} ${label}${cond || !detail ? "" : " — " + detail}`);
}

const fresh = (w) => {
  const d = new M.AccordionDemo();
  d.init(CSS);
  if (w) {
    d.pageW = w;
    d.layout = undefined;
  }
  d.displayListJson();
  return d;
};
const tree = (d) => JSON.parse(d.a11yJson(1, d.focused || ""));
const node = (t, id) => t.nodes.find((n) => n.id === id);
const rels = (d) => JSON.parse(d.relationsJson());
const LISTS = {
  acb: ["billing", "security", "integrations"],
  acs: ["item-1", "item-2", "item-3"],
  acm: ["product", "shipping", "returns"],
};
const trig = (l, v) => `${l}-${v}-trigger`;
const cont = (l, v) => `${l}-${v}-content`;
const openSet = (d) => {
  const t = tree(d);
  const out = [];
  for (const [l, vs] of Object.entries(LISTS)) for (const v of vs) if (node(t, trig(l, v)).expanded === 2) out.push(`${l}:${v}`);
  return out.sort().join(" ");
};

function findEl(el, id) {
  if (el.id === id) return el;
  for (const k of el.children) {
    const f = findEl(k, id);
    if (f) return f;
  }
  return null;
}

// The layout-check rules: an in-flow child ends inside its parent, and two
// in-flow siblings do not share pixels.
function faults(root) {
  const out = [];
  const rect = (e) => ({ x: e.calculatedX, y: e.calculatedY, w: e.calculatedWidth, h: e.calculatedHeight });
  const name = (e) => e.id || e.className || "?";
  const walk = (el) => {
    const p = rect(el);
    const flow = el.children.filter((k) => k.position !== "absolute");
    for (const k of flow) {
      const r = rect(k);
      if (r.h > 0 && p.h > 0 && r.y + r.h > p.y + p.h + 0.5) out.push(`${name(k)} bottom passes ${name(el)}`);
      if (r.w > 0 && p.w > 0 && r.x + r.w > p.x + p.w + 0.5) out.push(`${name(k)} right passes ${name(el)}`);
    }
    for (let i = 0; i < flow.length; i++) {
      for (let j = i + 1; j < flow.length; j++) {
        const a = rect(flow[i]);
        const b = rect(flow[j]);
        if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) continue;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0.5 && oy > 0.5) out.push(`${name(flow[i])} and ${name(flow[j])} overlap`);
      }
    }
    for (const k of el.children) walk(k);
  };
  walk(root);
  return out;
}

// Everything drawn is on the page.
function drawnPast(d) {
  const h = d.heightPx();
  const list = JSON.parse(d.displayListJson());
  let bottom = 0;
  for (const c of list.cmds) if (c.h > 0) bottom = Math.max(bottom, c.y + c.h);
  return { h, bottom };
}

console.log("gallery/evgui/demo — accordion\n");
console.log("--- at rest ---");
{
  const d = fresh();
  ok("stylesheet parses cleanly", d.styleErrorCount() === 0, String(d.styleErrorAt(0)));
  ok("lint finds nothing", d.a11yProblems().length === 0, d.a11yProblems().join("; "));
  ok("default open: billing, item-1, product", openSet(d) === "acb:billing acm:product acs:item-1", openSet(d));
  const t = tree(d);
  for (const l of Object.keys(LISTS)) ok(`${l}: the list root has no role of its own`, !node(t, l));
  const triggers = t.nodes.filter((n) => n.role === "button");
  ok("nine triggers, all buttons with aria-expanded", triggers.length === 9 && triggers.every((n) => n.expanded === 1 || n.expanded === 2),
    triggers.map((n) => n.id).join(","));
  ok("every trigger has its question as its name",
    node(t, trig("acb", "integrations")).name === "What integrations do you support?" && node(t, trig("acs", "item-1")).name === "Is it accessible?");
  const regions = t.nodes.filter((n) => n.role === "region");
  ok("one region per open item, and none for a closed one",
    regions.map((n) => n.id).sort().join() === [cont("acb", "billing"), cont("acm", "product"), cont("acs", "item-1")].sort().join(),
    regions.map((n) => n.id).join());
  ok("a region is named by its trigger", regions.every((r) => r.name === node(t, r.id.replace(/-content$/, "-trigger")).name));
  const R = rels(d);
  const controls = R.filter((r) => r[1] === "aria-controls");
  ok("every trigger has aria-controls naming its own panel",
    controls.length === 9 && controls.every(([f, , to]) => to === f.replace(/-trigger$/, "-content")));
  const labelled = R.filter((r) => r[1] === "aria-labelledby");
  ok("every open region is aria-labelledby its trigger",
    labelled.length === regions.length && labelled.every(([f, , to]) => node(t, f) && node(t, f).role === "region" && to === f.replace(/-content$/, "-trigger")));
  // Tab stops: the page makes one stop per focusable node outside a
  // composite (toolbar, menu, tablist, radiogroup, …); an accordion must not
  // rove, so no trigger may sit inside one.
  const byId = new Map(t.nodes.map((n) => [n.id, n]));
  const COMPOSITE = new Set(["toolbar", "menubar", "menu", "tablist", "radiogroup", "listbox", "grid", "tree", "treegrid"]);
  const inComposite = (n) => { for (let a = byId.get(n.p); a; a = byId.get(a.p)) if (COMPOSITE.has(a.role)) return true; return false; };
  ok("every trigger is its own Tab stop", triggers.every((n) => n.focusable && !inComposite(n)));
  ok("regions and panels are not focusable", regions.every((n) => !n.focusable));
}

console.log("--- type=\"single\", collapsible ---");
{
  const d = fresh();
  d.press(trig("acs", "item-2"));
  ok("opening item-2 closes item-1", openSet(d).includes("acs:item-2") && !openSet(d).includes("acs:item-1"), openSet(d));
  ok("the other lists are untouched", openSet(d).includes("acb:billing") && openSet(d).includes("acm:product"));
  d.press(trig("acs", "item-2"));
  ok("pressing the open one closes it (collapsible)", !openSet(d).includes("acs:"), openSet(d));
  d.press(trig("acb", "security"));
  ok("bordered list: security replaces billing", openSet(d).includes("acb:security") && !openSet(d).includes("acb:billing"));
}

console.log("--- type=\"single\", not collapsible (AccordionCtl) ---");
{
  const c = new M.AccordionCtl();
  c.tid = "nc";
  c.collapsible = false;
  c.addItem("a", "A", "a", false);
  c.addItem("b", "B", "b", false);
  c.openValue = "a";
  c.build();
  c.activate("nc-a-trigger");
  ok("pressing the open item leaves it open", c.isOpen("a") && !c.isOpen("b"));
  c.activate("nc-b-trigger");
  ok("pressing another moves it", c.isOpen("b") && !c.isOpen("a"));
}

console.log("--- type=\"multiple\" ---");
{
  const d = fresh();
  d.press(trig("acm", "shipping"));
  d.press(trig("acm", "returns"));
  ok("all three open at once", ["product", "shipping", "returns"].every((v) => openSet(d).includes(`acm:${v}`)), openSet(d));
  ok("three regions for the list", tree(d).nodes.filter((n) => n.role === "region" && n.id.startsWith("acm-")).length === 3);
  d.press(trig("acm", "product"));
  ok("pressing one closes only that one", !openSet(d).includes("acm:product") && openSet(d).includes("acm:shipping") && openSet(d).includes("acm:returns"), openSet(d));
  d.press(trig("acm", "shipping"));
  d.press(trig("acm", "returns"));
  ok("and all can be closed", !openSet(d).includes("acm:"), openSet(d));
}

console.log("--- the keyboard ---");
{
  const d = fresh();
  d.setFocus(trig("acs", "item-1"));
  const step = (k) => { d.key(k); return d.focused; };
  ok("ArrowDown steps to the next trigger", step("ArrowDown") === trig("acs", "item-2"), d.focused);
  ok("ArrowDown again", step("ArrowDown") === trig("acs", "item-3"), d.focused);
  ok("ArrowDown from the last wraps to the first", step("ArrowDown") === trig("acs", "item-1"), d.focused);
  ok("ArrowUp from the first wraps to the last", step("ArrowUp") === trig("acs", "item-3"), d.focused);
  ok("ArrowUp steps back", step("ArrowUp") === trig("acs", "item-2"), d.focused);
  ok("Home goes to the first", step("Home") === trig("acs", "item-1"), d.focused);
  ok("End goes to the last", step("End") === trig("acs", "item-3"), d.focused);
  const took = d.key("ArrowRight");
  ok("ArrowRight does nothing in a vertical accordion", !took && d.focused === trig("acs", "item-3"));
  ok("arrows move focus without opening anything", openSet(d).includes("acs:item-1") && !openSet(d).includes("acs:item-3"));
  d.key("Enter");
  ok("Enter toggles the focused item open", openSet(d).includes("acs:item-3") && !openSet(d).includes("acs:item-1"), openSet(d));
  d.key(" ");
  ok("Space toggles it closed", !openSet(d).includes("acs:"), openSet(d));
  ok("focus stays on the trigger", d.focused === trig("acs", "item-3"));
  d.setFocus(trig("acb", "billing"));
  d.key("End");
  ok("End stays within its own list", d.focused === trig("acb", "integrations"), d.focused);
  d.setFocus(trig("acm", "product"));
  d.key("Enter");
  d.key("ArrowDown");
  d.key(" ");
  ok("Enter/Space in the multiple list", !openSet(d).includes("acm:product") && openSet(d).includes("acm:shipping"), openSet(d));
}

console.log("--- the chevron ---");
{
  const d = fresh();
  const chev = (l, v) => findEl(d.root, trig(l, v) + "-chevron");
  ok("an open item's chevron carries ac-chevron-open and is turned 180°",
    chev("acb", "billing").className.includes("ac-chevron-open") && Math.abs(chev("acb", "billing").rotate - 180) < 0.5);
  ok("a closed item's is not", !chev("acb", "security").className.includes("ac-chevron-open") && Math.abs(chev("acb", "security").rotate) < 0.5);
  const before = chev("acb", "security");
  d.press(trig("acb", "security"));
  d.displayListJson();
  ok("a press starts a transition", d.busyNow());
  d.tick(100);
  d.displayListJson();
  const mid = chev("acb", "security").rotate;
  ok("half way through, the chevron is between 0 and 180", mid > 10 && mid < 170, String(mid));
  ok("the same element carried the flight (kept across the rebuild)", chev("acb", "security") === before);
  d.tick(300);
  d.displayListJson();
  ok("and it lands: opened one at 180, closed one at 0",
    Math.abs(chev("acb", "security").rotate - 180) < 0.5 && Math.abs(chev("acb", "billing").rotate) < 0.5,
    `${chev("acb", "security").rotate} ${chev("acb", "billing").rotate}`);
  ok("the clock stops", !d.busyNow());
}

console.log("--- the page follows the open items ---");
for (const w of [900, 358]) {
  const d = fresh(w === 900 ? 0 : w);
  const h0 = d.heightPx();
  let p = drawnPast(d);
  ok(`${w}px: nothing drawn below the page at rest`, p.bottom <= p.h + 0.5, `${p.bottom} > ${p.h}`);
  ok(`${w}px: no overlaps at rest`, faults(d.root).length === 0, faults(d.root).slice(0, 4).join("; "));
  d.press(trig("acm", "shipping"));
  d.press(trig("acm", "returns"));
  d.press(trig("acb", "integrations"));
  const h1 = d.heightPx();
  ok(`${w}px: opening items grows the page`, h1 > h0, `${h0} -> ${h1}`);
  p = drawnPast(d);
  ok(`${w}px: nothing drawn below the grown page`, p.bottom <= p.h + 0.5, `${p.bottom} > ${p.h}`);
  ok(`${w}px: no overlaps with everything open`, faults(d.root).length === 0, faults(d.root).slice(0, 4).join("; "));
  // Long answers wrap inside their item.
  const item = findEl(d.root, "acb-integrations");
  const body = findEl(d.root, cont("acb", "integrations"));
  const paras = body.children;
  ok(`${w}px: the two-paragraph answer is two paragraphs, inside its box`,
    paras.length === 2 && paras.every((q) => q.calculatedX + q.calculatedWidth <= item.calculatedX + item.calculatedWidth + 0.5) &&
    paras[1].calculatedY >= paras[0].calculatedY + paras[0].calculatedHeight + 8,
    paras.map((q) => [q.calculatedX, q.calculatedY, q.calculatedWidth, q.calculatedHeight].map(Math.round).join(",")).join(" | "));
  for (const id of ["acm-shipping-trigger", "acm-returns-trigger", "acm-product-trigger", "acs-item-1-trigger"]) d.press(id);
  const h2 = d.heightPx();
  ok(`${w}px: closing them shrinks it again`, h2 < h1, `${h1} -> ${h2}`);
  p = drawnPast(d);
  ok(`${w}px: the shrunk page still holds everything`, p.bottom <= p.h + 0.5 && p.h - p.bottom < 40, `${p.bottom} / ${p.h}`);
}

console.log("");
console.log(`${passed} passed, ${failed} failed`);
if (failed) {
  console.log("RESULT FAIL");
  process.exit(1);
}
console.log("RESULT OK");

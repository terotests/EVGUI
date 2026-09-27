#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Radio Group demo, checked in Node against the compiled demo.
//
// Ten groups, each a RadioGroupCtl. Per group: role radiogroup with a name
// (the legend through aria-labelledby for "Battery Level", an aria-label for
// the rest), role radio items with aria-checked, exactly one checked. Then
// behaviour: a press anywhere on a row or card checks it; the Tab stop of a
// group is its checked radio (the page's rule, recomputed here from the tree);
// the arrows move AND check, wrapping at both ends; Space checks the focused
// radio. Then the look that carries meaning: the coloured radios' strokes,
// which side the radio sits on per pattern, the 2x2 grid, and that nothing
// overlaps at 900 and at a phone's 358.
//
//   node gallery/evgui/demo/radio-check.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/RadioGroupDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "radio.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

const YES = 2;
const NO = 1;

const fresh = (w) => {
  const d = new M.RadioGroupDemo();
  d.init(CSS);
  if (w) { d.pageW = w; d.dirty = true; }
  d.displayListJson();
  return d;
};
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const radiosOf = (t, gid) => t.nodes.filter((n) => n.role === "radio" && n.p === gid);
const checkedOf = (d, gid) => radiosOf(tree(d), gid).filter((n) => n.checked === YES).map((n) => n.id);
const centre = (n) => [n.b[0] + n.b[2] / 2, n.b[1] + n.b[3] / 2];
// Press what is under a point, the way the page does: hit test first.
const clickAt = (d, x, y) => {
  const hit = d.hitId(x, y);
  d.press(hit);
  d.displayListJson();
  return hit;
};
const byId = (e, id) => {
  if (e.id === id) return e;
  for (const k of e.children) {
    const f = byId(k, id);
    if (f) return f;
  }
  return null;
};
const dotOf = (row) => row.children.find((k) => /\brg-dot\b/.test(k.className));

const GROUPS = [
  // id, name, labelledby, items, default, radio side
  ["rg1", "Contact method", "", ["email", "phone", "chat"], "email", "right"],
  ["rg2", "Language", "", ["english", "spanish", "french", "german"], "english", "left"],
  ["rg3", "Workspace", "", ["payments", "invoices", "billing", "reports"], "payments", "corner"],
  ["rg4", "Account", "", ["emma", "john"], "emma", "right"],
  ["rg5", "Colour", "", ["blue", "green", "yellow"], "blue", "left"],
  ["rg6", "Battery Level", "rg6-legend", ["high", "medium", "low"], "medium", "left"],
  ["rg7", "Plan", "", ["plus", "pro"], "plus", "right"],
  ["rg8", "Shipping method", "", ["standard", "express", "overnight"], "standard", "left"],
  ["rg9", "Payment method", "", ["visa", "mastercard", "new"], "visa", "corner"],
  ["rg10", "Pricing plan", "", ["free", "pro", "enterprise"], "pro", "left"],
];

console.log("--- semantics ---");
{
  const d = fresh();
  const t = tree(d);
  for (const [gid, name, lb, items, def] of GROUPS) {
    const g = t.byId.get(gid);
    ok(`${gid}: a radiogroup`, g && g.role === "radiogroup", g && g.role);
    if (!g) continue;
    if (lb) {
      ok(`${gid}: labelled by its legend`, g.labelledby === lb && t.byId.has(lb) && t.byId.get(lb).name === name,
        [g.labelledby, t.byId.get(lb)]);
    } else {
      ok(`${gid}: named "${name}" by aria-label`, g.name === name, g.name);
    }
    const rs = radiosOf(t, gid);
    ok(`${gid}: ${items.length} radios, in order`, rs.map((n) => n.id).join() === items.map((v) => `${gid}-${v}`).join(),
      rs.map((n) => n.id));
    ok(`${gid}: every radio says aria-checked`, rs.every((n) => n.checked === YES || n.checked === NO),
      rs.map((n) => n.checked));
    ok(`${gid}: "${def}" checked by default, only it`, checkedOf(d, gid).join() === `${gid}-${def}`, checkedOf(d, gid));
    ok(`${gid}: every radio focusable and named`, rs.every((n) => n.focusable && n.name), rs.map((n) => [n.focusable, n.name]));
  }
  const rg6 = t.byId.get("rg6");
  ok("rg6: described by its description", rg6.describedby === "rg6-desc", rg6.describedby);
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
  ok("the stylesheet parses clean", d.styleErrorCount() === 0);
  // Decoration stays out of the names: the drawn logos and avatars.
  ok("rg9 visa name has no logo text", t.byId.get("rg9-visa").name.indexOf("VISA") < 0, t.byId.get("rg9-visa").name);
  ok("rg4 avatar initials not read", t.byId.get("rg4-emma").name.indexOf("EW") < 0, t.byId.get("rg4-emma").name);
}

console.log("--- a press anywhere on the row or card checks it ---");
{
  const d = fresh();
  for (const [gid, , , items] of GROUPS) {
    for (const v of [items[items.length - 1], items[0]]) {
      const id = `${gid}-${v}`;
      const n = tree(d).byId.get(id);
      // Near the row's left edge, over its padding/label, and at its centre.
      const [cx, cy] = centre(n);
      const hitEdge = clickAt(d, n.b[0] + 6, cy);
      const okEdge = hitEdge === id && checkedOf(d, gid).join() === id;
      const hitMid = clickAt(d, cx, cy);
      ok(`${id}: a click at the edge and the centre checks it`, okEdge && hitMid === id && checkedOf(d, gid).join() === id,
        [hitEdge, hitMid, checkedOf(d, gid)]);
    }
  }
  // Groups are independent: checking in one leaves the others alone.
  const d2 = fresh();
  const n = tree(d2).byId.get("rg1-phone");
  clickAt(d2, ...centre(n));
  ok("checking Phone leaves the other groups as they were",
    d2.summary().split("|")[0] === "phone,english,payments,emma,blue,medium,plus,standard,visa,pro", d2.summary());
  ok("and the focus is on Phone", d2.focused === "rg1-phone", d2.focused);
  ok("a click on empty page space checks nothing", (() => {
    const before = d2.summary().split("|")[0];
    clickAt(d2, 3, 3);
    return d2.summary().split("|")[0] === before;
  })());
}

console.log("--- keyboard ---");
{
  // The page's Tab rule (main.js kbStops): a radiogroup is ONE stop, the
  // member with the focus, else its checked radio.
  const stops = (d) => {
    const t = tree(d);
    const out = [];
    const seen = new Set();
    for (const n of t.nodes) {
      if (!n.focusable) continue;
      const g = t.byId.get(n.p);
      if (g && g.role === "radiogroup") {
        if (seen.has(g.id)) continue;
        seen.add(g.id);
        const m = radiosOf(t, g.id);
        out.push((m.find((x) => x.id === d.focused) || m.find((x) => x.checked === YES) || m[0]).id);
      } else out.push(n.id);
    }
    return out;
  };
  const d = fresh();
  const s0 = stops(d);
  ok("one Tab stop per group, each on the checked radio",
    s0.join() === GROUPS.map(([g, , , , def]) => `${g}-${def}`).join(), s0);
  // Tab onto group 6: lands on Medium.
  d.setFocus(s0[5]);
  d.displayListJson();
  ok("Tab into Battery Level lands on Medium", d.focused === "rg6-medium", d.focused);
  d.key("ArrowDown");
  ok("ArrowDown moves AND checks: Low", d.focused === "rg6-low" && checkedOf(d, "rg6").join() === "rg6-low",
    [d.focused, checkedOf(d, "rg6")]);
  d.key("ArrowDown");
  ok("ArrowDown on the last wraps to High, checked", d.focused === "rg6-high" && checkedOf(d, "rg6").join() === "rg6-high",
    [d.focused, checkedOf(d, "rg6")]);
  d.key("ArrowUp");
  ok("ArrowUp on the first wraps to Low, checked", d.focused === "rg6-low" && checkedOf(d, "rg6").join() === "rg6-low",
    [d.focused, checkedOf(d, "rg6")]);
  d.key("ArrowLeft");
  ok("ArrowLeft moves back: Medium", d.focused === "rg6-medium" && checkedOf(d, "rg6").join() === "rg6-medium");
  d.key("ArrowRight");
  ok("ArrowRight moves on: Low", d.focused === "rg6-low" && checkedOf(d, "rg6").join() === "rg6-low");
  ok("the Tab stop follows the checked radio", stops(d)[5] === "rg6-low", stops(d)[5]);
  ok("the arrows stayed in their group", d.summary().split("|")[0].split(",")[0] === "email");
  // Space checks the focused radio (focus put there by a reader, unchecked).
  d.setFocus("rg3-reports");
  ok("focus alone does not check", checkedOf(d, "rg3").join() === "rg3-payments", checkedOf(d, "rg3"));
  ok("Space is taken", d.key(" ") === true);
  ok("Space checks Reports", checkedOf(d, "rg3").join() === "rg3-reports", checkedOf(d, "rg3"));
  // Arrow through every group once each way: one checked per group throughout.
  const d2 = fresh();
  let single = true;
  for (const [gid, , , items] of GROUPS) {
    d2.setFocus(stops(d2).find((s) => s.startsWith(gid + "-")));
    for (let i = 0; i < items.length + 1; i++) {
      d2.key(i % 2 ? "ArrowRight" : "ArrowDown");
      for (const [g2] of GROUPS) if (checkedOf(d2, g2).length !== 1) single = false;
    }
  }
  ok("exactly one radio checked in every group, after every key", single);
  ok("a key with nothing focused is not taken", (() => { const d3 = fresh(); return d3.key("ArrowDown") === false; })());
}

console.log("--- the look ---");
{
  const d = fresh();
  const dl = JSON.parse(d.displayListJson());
  const strokeAt = (el) => dl.cmds.find((c) => c.k === 1 && Math.abs(c.x - el.calculatedX) < 1 &&
    Math.abs(c.y - el.calculatedY) < 1 && Math.abs(c.w - 16) < 1);
  const want = { blue: [59, 130, 246], green: [34, 197, 94], yellow: [234, 179, 8] };
  for (const [v, rgb] of Object.entries(want)) {
    const s = strokeAt(dotOf(byId(d.root, `rg5-${v}`)));
    ok(`rg5-${v}: the ring is ${v}`, s && s.c.slice(0, 3).join() === rgb.join(), s && s.c);
  }
  const blue = strokeAt(dotOf(byId(d.root, "rg5-blue")));
  const green = strokeAt(dotOf(byId(d.root, "rg5-green")));
  ok("checked Blue is the thick ring, unchecked Green the thin one", blue && green && blue.t > 3 && green.t < 2,
    [blue && blue.t, green && green.t]);
  const plain = strokeAt(dotOf(byId(d.root, "rg6-high")));
  const on = strokeAt(dotOf(byId(d.root, "rg6-medium")));
  ok("an uncoloured radio: light ring off, dark thick ring on",
    plain && on && plain.c.slice(0, 3).join() === "228,228,231" && on.c.slice(0, 3).join() === "24,24,27" && on.t >= 4,
    [plain, on]);
  // The selected row / card is grey, the rest white.
  const fillAt = (el) => dl.cmds.find((c) => c.k === 0 && Math.abs(c.x - el.calculatedX) < 1 &&
    Math.abs(c.y - el.calculatedY) < 1 && Math.abs(c.w - el.calculatedWidth) < 1);
  const f1 = fillAt(byId(d.root, "rg1-email"));
  const f2 = fillAt(byId(d.root, "rg1-phone"));
  ok("the checked row is #f4f4f5, the next white", f1 && f2 && f1.c.slice(0, 3).join() === "244,244,245" &&
    f2.c.slice(0, 3).join() === "255,255,255", [f1 && f1.c, f2 && f2.c]);
}

console.log("--- geometry ---");
for (const w of [900, 358]) {
  const d = fresh(w);
  for (const [gid, , , items, , side] of GROUPS) {
    let good = true;
    const bad = [];
    for (const v of items) {
      const row = byId(d.root, `${gid}-${v}`);
      const dot = dotOf(row);
      const rx = row.calculatedX;
      const rw = row.calculatedWidth;
      const dx = dot.calculatedX;
      const dy = dot.calculatedY - row.calculatedY;
      let fine;
      if (side === "left") fine = dx < rx + rw / 3;
      else if (side === "right") fine = dx > rx + rw * 2 / 3;
      // ReUI's `absolute top-3 right-3`: 12px from the top right corner.
      else fine = Math.abs(rx + rw - (dx + 16) - 12) < 1 && Math.abs(dy - 12) < 1;
      if (!fine) { good = false; bad.push([v, rx, rw, dx, dy]); }
    }
    ok(`${w}: ${gid} radio on the ${side}`, good, bad);
  }
  const tiles = ["payments", "invoices", "billing", "reports"].map((v) => byId(d.root, `rg3-${v}`));
  const xs = new Set(tiles.map((t) => Math.round(t.calculatedX)));
  const ys = new Set(tiles.map((t) => Math.round(t.calculatedY)));
  ok(`${w}: the workspace cards are a 2x2 grid`, xs.size === 2 && ys.size === 2 &&
    Math.round(tiles[0].calculatedY) === Math.round(tiles[1].calculatedY), [...xs, ...ys]);
  // Cards: two columns wide, one on a phone.
  const cards = d.root.children;
  const cx = new Set(cards.map((c) => Math.round(c.calculatedX)));
  ok(`${w}: the cards are in ${w < 600 ? "one column" : "two columns"}`, cx.size === (w < 600 ? 1 : 2), [...cx]);
  // Nothing overlaps or spills (layout-check's rule), and nothing leaves its card.
  const rect = (e) => ({ x: e.calculatedX, y: e.calculatedY, w: e.calculatedWidth, h: e.calculatedHeight });
  const faults = [];
  const walk = (el) => {
    const p = rect(el);
    const flow = el.children.filter((k) => k.position !== "absolute");
    for (const k of el.children) {
      const r = rect(k);
      if (r.w > 0 && r.h > 0 && p.w > 0 && p.h > 0 &&
        (r.y + r.h > p.y + p.h + 0.5 || r.x + r.w > p.x + p.w + 0.5 || r.x < p.x - 0.5 || r.y < p.y - 0.5)) {
        faults.push(`${k.id || k.className} leaves ${el.id || el.className}`);
      }
    }
    for (let i = 0; i < flow.length; i++) {
      for (let j = i + 1; j < flow.length; j++) {
        const a = rect(flow[i]);
        const b = rect(flow[j]);
        if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) continue;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0.5 && oy > 0.5) faults.push(`${flow[i].id || flow[i].className} / ${flow[j].id || flow[j].className}`);
      }
    }
    // The corner radio must not sit on the card's text.
    const abs = el.children.filter((k) => k.position === "absolute");
    for (const a0 of abs) {
      for (const f of flow) {
        const a = rect(a0);
        const b = rect(f);
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0.5 && oy > 0.5 && !/rg-ibox|rg-logo|rg-icon/.test(f.className)) faults.push(`corner radio on ${f.className} in ${el.id}`);
      }
    }
    for (const k of el.children) walk(k);
  };
  walk(d.root);
  ok(`${w}: nothing overlaps, nothing spills`, faults.length === 0, faults.slice(0, 6));
  ok(`${w}: the page is as tall as its cards`, Math.abs(d.heightPx() -
    (Math.max(...cards.map((c) => c.calculatedY + c.calculatedHeight)) + d.root.box.paddingBottomPx)) < 1.5, d.heightPx());
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("SOME FAILED");
  process.exit(1);
}
console.log("ALL PASS");

#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Separator demo: does every rule draw where it says, and mean what it
// says?
//
//   npm run ui:separator:check
//
// Four things, at the desktop width and at a phone's:
//
//   GEOMETRY   every rule is one pixel thick and as long as its box: a
//              horizontal one exactly as wide as its container, a vertical one
//              exactly as tall as the row it is in — and at least as tall as
//              everything beside it, which is what "spans the row" means.
//   THE LABEL  "or continue with" is centred on its line, both ways, and the
//              line is drawn FIRST and then covered by the label's own opaque
//              background for the whole width of the label, with some of the
//              line still showing on either side.
//   MEANING    the rules that divide two things are `separator` in the
//              accessible tree with the right `orientation`; the decorative
//              ones are not in it at all; nothing is focusable.
//   OVERLAPS   no in-flow box leaves its parent or lands on a sibling (the
//              same two rules as `layout-check`), and at the phone width
//              nothing is wider than the page.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const { SeparatorDemo } = require(path.join(ROOT, "gallery/evgui/bin/SeparatorDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "separator.css"), "utf8");

let failures = 0;
const check = (ok, what) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"} ${what}`);
};
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
const f1 = (v) => (+v).toFixed(1);

// Which rules say something, and which way. Everything else is decorative.
const SEMANTIC = {
  "sp-sections-sep": "horizontal",
  "sp-menu-sep-0": "vertical",
  "sp-menu-sep-1": "vertical",
  "sp-order-sep-0": "horizontal",
  "sp-order-sep-1": "horizontal",
};
const DECORATIVE = ["sp-inline-sep-0", "sp-inline-sep-1", "sp-list-sep-0", "sp-list-sep-1", "sp-or-line"];

const rect = (e) => ({ x: e.calculatedX, y: e.calculatedY, w: e.calculatedWidth, h: e.calculatedHeight });
const cls = (e) => ` ${e.className || ""} `;

function index(root) {
  const byId = new Map();
  const parent = new Map();
  const walk = (el) => {
    if (el.id) byId.set(el.id, el);
    for (const k of el.children) {
      parent.set(k, el);
      walk(k);
    }
  };
  walk(root);
  return { byId, parent };
}

// layout-check's two invariants, over this tree.
function faults(root) {
  const out = [];
  const name = (e) => e.id || e.className || "?";
  const walk = (el) => {
    const p = rect(el);
    const flow = el.children.filter((k) => k.position !== "absolute");
    for (const k of flow) {
      const r = rect(k);
      if (r.h > 0 && p.h > 0 && r.y + r.h > p.y + p.h + 0.5) out.push(`${name(k)} passes the bottom of ${name(el)}`);
      if (r.w > 0 && p.w > 0 && r.x + r.w > p.x + p.w + 0.5) out.push(`${name(k)} passes the right of ${name(el)}`);
    }
    for (let i = 0; i < flow.length; i++) {
      for (let j = i + 1; j < flow.length; j++) {
        const a = rect(flow[i]);
        const b = rect(flow[j]);
        if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) continue;
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        if (ox > 0.5 && oy > 0.5) out.push(`${name(flow[i])} and ${name(flow[j])} overlap inside ${name(el)}`);
      }
    }
    for (const k of el.children) walk(k);
  };
  walk(root);
  return out;
}

function run(width) {
  console.log(`\n--- at ${width}px ---`);
  const d = new SeparatorDemo();
  d.init(CSS);
  d.pageW = width;
  d.layout = undefined;
  const list = JSON.parse(d.displayListJson());
  const errs = [];
  for (let i = 0; i < d.styleErrorCount(); i++) errs.push(d.styleErrorAt(i));
  check(errs.length === 0, `separator.css parses clean${errs.length ? ": " + errs.join("; ") : ""}`);

  const root = d.root;
  const { byId, parent } = index(root);
  const page = rect(root);
  check(near(page.w, width), `the page is laid out at ${width}px (${f1(page.w)})`);

  // Six cards, each with its caption.
  const cards = root.children.filter((k) => cls(k).includes(" sp-card "));
  check(cards.length === 6, `six example cards (${cards.length})`);

  // --- geometry ---------------------------------------------------------------
  const rules = [...byId.values()].filter((e) => cls(e).includes(" ui-separator "));
  check(rules.length === 10 && d.separatorCount() === 10, `ten rules, every one dressed by SeparatorCtl (${rules.length}, ${d.separatorCount()})`);
  for (const e of rules) {
    const r = rect(e);
    const p = parent.get(e);
    const pr = rect(p);
    const padL = p.box ? p.box.paddingLeftPx || 0 : 0;
    const padR = p.box ? p.box.paddingRightPx || 0 : 0;
    const padT = p.box ? p.box.paddingTopPx || 0 : 0;
    const padB = p.box ? p.box.paddingBottomPx || 0 : 0;
    if (cls(e).includes(" ui-separator-vertical ")) {
      const siblings = p.children.filter((k) => k !== e && k.position !== "absolute");
      const tallest = Math.max(...siblings.map((k) => k.calculatedHeight));
      const ok = near(r.w, 1) && near(r.y, pr.y + padT) && near(r.h, pr.h - padT - padB) && r.h + 0.5 >= tallest;
      check(ok, `${e.id}: vertical, 1px wide, spans its row — ${f1(r.w)}x${f1(r.h)} in a ${f1(pr.h)}px row whose tallest item is ${f1(tallest)}`);
    } else {
      const ok = near(r.h, 1) && near(r.x, pr.x + padL) && near(r.w, pr.w - padL - padR);
      check(ok, `${e.id}: horizontal, 1px tall, full width — ${f1(r.w)}x${f1(r.h)} in a ${f1(pr.w)}px box`);
    }
    // One pixel of #e4e4e7, and it is in the list where the layout put it.
    const drawn = list.cmds.some((c) => c.k === 0 && near(c.x, r.x) && near(c.y, r.y) && near(c.w, r.w) && near(c.h, r.h)
      && c.c && c.c[0] === 228 && c.c[1] === 228 && c.c[2] === 231);
    check(drawn, `${e.id}: drawn as a #e4e4e7 rect at its box`);
  }
  // The inline bars: 20px, the height of the row they sit in.
  for (const id of ["sp-inline-sep-0", "sp-inline-sep-1"]) {
    const r = rect(byId.get(id));
    check(near(r.h, 20), `${id}: 20px tall (${f1(r.h)})`);
  }

  // --- the labelled rule ------------------------------------------------------
  const line = rect(byId.get("sp-or-line"));
  const text = rect(byId.get("sp-or-text"));
  const lineMidX = line.x + line.w / 2;
  const lineMidY = line.y + line.h / 2;
  check(near(text.x + text.w / 2, lineMidX, 1), `the label is centred on the line horizontally (${f1(text.x + text.w / 2)} vs ${f1(lineMidX)})`);
  check(near(text.y + text.h / 2, lineMidY, 1), `the label is centred on the line vertically (${f1(text.y + text.h / 2)} vs ${f1(lineMidY)})`);
  check(line.x < text.x - 8 && line.x + line.w > text.x + text.w + 8,
    `the line shows on both sides of the label (line ${f1(line.x)}..${f1(line.x + line.w)}, label ${f1(text.x)}..${f1(text.x + text.w)})`);
  const lineAt = list.cmds.findIndex((c) => c.k === 0 && near(c.x, line.x) && near(c.y, line.y) && near(c.w, line.w) && near(c.h, 1));
  const bgAt = list.cmds.findIndex((c) => c.k === 0 && near(c.x, text.x) && near(c.y, text.y) && near(c.w, text.w) && near(c.h, text.h));
  const bg = bgAt >= 0 ? list.cmds[bgAt] : null;
  const card = list.cmds[1];
  const sameAsCard = bg && card && bg.c.slice(0, 3).join() === card.c.slice(0, 3).join() && (bg.c[3] == null || bg.c[3] === 1);
  check(lineAt >= 0 && bgAt > lineAt && sameAsCard && bg.y <= line.y && bg.y + bg.h >= line.y + line.h,
    `the line is hidden behind the label: drawn at #${lineAt}, covered at #${bgAt} by an opaque box in the card's colour`);
  const words = list.cmds.findIndex((c) => c.k === 3 && c.text === "or continue with");
  check(words > bgAt, `the words are drawn after their background (#${words})`);

  // --- meaning ----------------------------------------------------------------
  const tree = JSON.parse(d.a11yJson(1, ""));
  const seps = tree.nodes.filter((n) => n.role === "separator");
  const got = Object.fromEntries(seps.map((n) => [n.id, n.orientation || ""]));
  check(JSON.stringify(got) === JSON.stringify(SEMANTIC),
    `the separators in the a11y tree are exactly the semantic ones, with their orientation: ${JSON.stringify(got)}`);
  const ids = new Set(tree.nodes.map((n) => n.id));
  const leaked = DECORATIVE.filter((id) => ids.has(id));
  check(leaked.length === 0, `no decorative rule is in the a11y tree${leaked.length ? ": " + leaked.join(", ") : ""}`);
  const focusable = tree.nodes.filter((n) => n.focusable).map((n) => n.id);
  check(focusable.length === 0, `nothing is focusable${focusable.length ? ": " + focusable.join(", ") : ""}`);
  const problems = d.a11yProblems();
  check(problems.length === 0, `the a11y lint is clean${problems.length ? ": " + problems.join("; ") : ""}`);
  // Each separator's box in the tree is the box it was drawn at.
  for (const n of seps) {
    const r = rect(byId.get(n.id));
    check(n.b && Math.abs(n.b[0] - r.x) <= 1 && Math.abs(n.b[1] - r.y) <= 1 && Math.abs(n.b[2] - r.w) <= 1 && Math.abs(n.b[3] - r.h) <= 1,
      `${n.id}: the tree places it where it is drawn (${JSON.stringify(n.b)})`);
  }

  // --- overlaps ---------------------------------------------------------------
  const bad = faults(root);
  check(bad.length === 0, `nothing leaves its parent or lands on a sibling${bad.length ? ": " + bad.slice(0, 6).join("; ") : ""}`);
  let widest = 0;
  for (const e of byId.values()) widest = Math.max(widest, e.calculatedX + e.calculatedWidth);
  check(widest <= width + 0.5, `nothing is wider than the page (rightmost edge ${f1(widest)})`);
  const bottom = Math.max(...cards.map((c) => c.calculatedY + c.calculatedHeight));
  check(bottom <= d.heightPx() + 0.5, `the page is as tall as its cards (${f1(bottom)} within ${f1(d.heightPx())})`);
}

console.log("gallery/evgui/demo — Separator");
run(900);
// The phone: the page's room at a 390px viewport is under 360px, and the
// NARROW entry lays the demo out at that width. 320 is the least it claims.
run(358);
run(320);

// One instance, resized the way the page resizes it: laid out at the desktop
// width first, then handed the phone's. Every card has to come back to its
// phone height — a flex-grown height left over from the desktop pass kept
// them all 248px tall on a phone.
{
  console.log("\n--- resized from 900px to 332px ---");
  const fresh = new SeparatorDemo();
  fresh.init(CSS);
  fresh.pageW = 332;
  fresh.layout = undefined;
  fresh.displayListJson();
  const want = fresh.root.children.map((c) => c.calculatedHeight);
  const d = new SeparatorDemo();
  d.init(CSS);
  d.displayListJson();
  d.pageW = 332;
  d.pageH = 4000;
  d.layout = undefined;
  d.displayListJson();
  const got = d.root.children.map((c) => c.calculatedHeight);
  check(got.every((h, i) => near(h, want[i])), `every card has its phone height after the resize (${got.map(f1).join(", ")} vs ${want.map(f1).join(", ")})`);
}

console.log("");
console.log(failures === 0 ? "RESULT OK" : `RESULT FAIL — ${failures} finding(s)`);
process.exit(failures === 0 ? 0 : 1);

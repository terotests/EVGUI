#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Rating demo, checked in Node against the compiled demo.
//
// RatingCtl on its own first — the fill of each star, clamping, the step
// grid, the keys, the hit targets, the words a reader hears — then the demo:
// the drawn fill of every star (including the 60% clip of 4.6's fifth), the
// three sizes, the distribution bars against their percentages, hover /
// click / keyboard on the editable rows and the value label following, a
// read-only row ignoring all of it, the role and aria values, and that
// nothing overlaps at 900 and 358.
//
//   node gallery/evgui/demo/rating-check.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/RatingDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "rating.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};
const near = (a, b, eps = 0.51) => Math.abs(a - b) <= eps;

const fresh = (w) => {
  const d = new M.RatingDemo();
  d.init(CSS);
  if (w) { d.pageW = w; d.pageH = 4000; d.layout = undefined; }
  d.displayListJson();
  return d;
};
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const byId = (d, id) => {
  let found = null;
  const walk = (e) => { if (found) return; if (e.id === id) { found = e; return; } for (const k of e.children || []) walk(k); };
  walk(d.root);
  return found;
};
const state = (d) => JSON.parse(d.stateJson());
// What each star of a row DRAWS: the clip's laid-out width over the star's.
const drawnFill = (d, tid, n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const star = byId(d, `${tid}-star-${i}`);
    const clip = byId(d, `${tid}-star-${i}-clip`);
    out.push(clip ? Math.round((clip.calculatedWidth / star.calculatedWidth) * 100) / 100 : 0);
  }
  return out.join(" ");
};
const label = (d, tid) => (byId(d, tid + "-value") || {}).textContent;
// Press what is under a hit target's centre, the way the page does.
const click = (d, id) => {
  d.displayListJson();
  const e = byId(d, id);
  if (!e) return "(no element " + id + ")";
  const x = e.calculatedX + e.calculatedWidth / 2;
  const y = e.calculatedY + e.calculatedHeight / 2;
  const hit = d.hitId(x, y);
  d.press(hit);
  d.displayListJson();
  return hit;
};
const hoverAt = (d, id) => {
  d.displayListJson();
  const e = byId(d, id);
  const hit = d.hitId(e.calculatedX + e.calculatedWidth / 2, e.calculatedY + e.calculatedHeight / 2);
  d.setHover(hit);
  d.displayListJson();
  return hit;
};

console.log("--- RatingCtl ---");
{
  const C = M.RatingCtl;
  const mk = (v, max, ro, p) => { const c = new C(); c.setup("t", "Rating", v, max, ro); if (p) c.precision = p; return c; };
  const c = mk(4.6, 5, true);
  ok("4.6: four whole stars and 0.6 of the fifth", [0, 1, 2, 3, 4].map((i) => Math.round(c.fillAt(i) * 100) / 100).join(" ") === "1 1 1 1 0.6");
  ok("clamped to 0..max", mk(9, 5, true).value === 5 && mk(-2, 5, true).value === 0);
  ok("label has one decimal", mk(4, 5, true).label() === "4.0" && c.label() === "4.6");
  ok("valuetext and image name", mk(4, 5, false).valueText() === "4 out of 5 stars" && c.imageName() === "Rated 4.6 out of 5 stars", c.imageName());
  const e = mk(3, 5, false);
  ok("whole precision: one target per star, star i = i+1", e.valueFor("t-star-1-h1") === 2 && e.valueFor("t-star-1-h0") === 2 && e.valueFor("u-star-1-h1") === -1);
  e.keyDown("t", "ArrowRight");
  ok("ArrowRight adds a star", e.value === 4);
  e.keyDown("t", "ArrowUp"); e.keyDown("t", "ArrowUp");
  ok("and stops at the maximum", e.value === 5);
  e.keyDown("t", "ArrowLeft");
  ok("ArrowLeft takes one away", e.value === 4);
  e.keyDown("t", "Home");
  ok("Home is 0", e.value === 0 && e.valueText() === "0 out of 5 stars");
  e.keyDown("t", "ArrowDown");
  ok("and nothing goes below it", e.value === 0);
  e.keyDown("t", "End");
  ok("End is the maximum", e.value === 5);
  const h = mk(3.5, 5, false, 0.5);
  ok("half precision: the left half of star 3 is 3.5", h.valueFor("t-star-3-h0") === 3.5 && h.valueFor("t-star-3-h1") === 4);
  ok("value in steps: 3.5 of 5 is 7 of 10", h.valueNow() === 7 && h.valueMax() === 10);
  h.keyDown("t", "ArrowRight");
  ok("an arrow is half a star", h.value === 4 && h.valueNow() === 8);
  h.hover("t-star-0-h0");
  ok("hover previews without setting", h.shown() === 0.5 && h.value === 4 && h.fillAt(0) === 0.5 && h.fillAt(1) === 0);
  h.unhover();
  ok("unhover drops the preview", h.shown() === 4);
  ok("a press sets and asks for the focus", h.activate("t-star-1-h1") === "t" && h.value === 2);
  ok("a second press on the same value keeps it (ReUI)", (h.activate("t-star-1-h1"), h.value === 2));
  h.clearable = true;
  ok("clearable: a second press clears", (h.activate("t-star-1-h1"), h.value === 0));
  const r = mk(3, 5, true);
  r.keyDown("t", "ArrowRight"); r.hover("t-star-4-h1");
  ok("read-only takes no key, hover or press", r.value === 3 && r.shown() === 3 && r.activate("t-star-4-h1") === "" && r.value === 3);
  ok("read-only is an image, not a tab stop", r.rows()[0].role === 8 && !r.isFocusable("t"));
  ok("editable is a slider, a tab stop", mk(3, 5, false).rows()[0].role === 32 && mk(3, 5, false).isFocusable("t"));
}

console.log("--- the drawn stars ---");
{
  const d = fresh();
  ok("sizes: every row at 4", ["rt-size-sm", "rt-size-md", "rt-size-lg"].every((t) => drawnFill(d, t, 5) === "1 1 1 1 0"),
    ["rt-size-sm", "rt-size-md", "rt-size-lg"].map((t) => drawnFill(d, t, 5)));
  const sz = (t) => byId(d, t + "-star-0").calculatedWidth;
  ok("sizes: 14, 18 and 22px stars", sz("rt-size-sm") === 14 && sz("rt-size-md") === 18 && sz("rt-size-lg") === 22, [sz("rt-size-sm"), sz("rt-size-md"), sz("rt-size-lg")]);
  const rowW = (t) => byId(d, t).calculatedWidth;
  ok("sizes: 2px apart (78, 98, 118 wide)", rowW("rt-size-sm") === 78 && rowW("rt-size-md") === 98 && rowW("rt-size-lg") === 118);
  const t = tree(d);
  const ys = ["rt-size-sm", "rt-size-md", "rt-size-lg"].map((id) => t.byId.get(id).b);
  ok("sizes: stacked and centred", ys[0][1] < ys[1][1] && ys[1][1] < ys[2][1] &&
    ys.every((b) => near(b[0] + b[2] / 2, ys[0][0] + ys[0][2] / 2)));
  ok("4.6: the fifth star is clipped to 60%", drawnFill(d, "rt-summary-stars", 5) === "1 1 1 1 0.6", drawnFill(d, "rt-summary-stars", 5));
  const clip = byId(d, "rt-summary-stars-star-4-clip");
  ok("4.6: the clip is 8.4px of a 14px star", near(clip.calculatedWidth, 8.4, 0.05), clip.calculatedWidth);
  ok("4.6: the filled star inside it keeps its 14px", byId(d, "rt-summary-stars-star-4-full").calculatedWidth === 14);
  ok("an empty star draws no fill at all", byId(d, "rt-size-md-star-4-clip") === null);
  ok("the score reads 4.6", byId(d, "rt-summary-score").textContent === "4.6");
  const dist = [[5, 62, "124"], [4, 22, "45"], [3, 9, "18"], [2, 4, "8"], [1, 3, "5"]];
  for (const [k, pct, count] of dist) {
    const bar = byId(d, "rt-dist-bar-" + k);
    const fill = byId(d, "rt-dist-fill-" + k);
    const got = (fill.calculatedWidth / bar.calculatedWidth) * 100;
    ok(`distribution ${k}: ${pct}% of the bar, count ${count}`, near(got, pct, 0.6) && byId(d, "rt-dist-count-" + k).textContent === count &&
      t.byId.get("rt-dist-bar-" + k).now === pct, [got, byId(d, "rt-dist-count-" + k).textContent]);
  }
  const bar5 = t.byId.get("rt-dist-bar-5");
  ok("a bar is a named progressbar", bar5.role === "progressbar" && bar5.name === "5 stars, 124 reviews" && bar5.min === 0 && bar5.max === 100);
  ok("the rule is a separator", t.byId.get("rt-summary-rule").role === "separator");
  const sum = byId(d, "rt-summary");
  ok("summary: max-w-xs (320px)", sum.calculatedWidth === 320);
}

console.log("--- interactive ---");
{
  const d = fresh();
  ok("starts at 4.0", label(d, "rt-rate") === "4.0" && drawnFill(d, "rt-rate", 5) === "1 1 1 1 0");
  const hit = hoverAt(d, "rt-rate-star-1-h1");
  ok("hovering the second star previews 2", hit === "rt-rate-star-1-h1" && drawnFill(d, "rt-rate", 5) === "1 1 0 0 0" && state(d)["rt-rate"].hover === 2,
    [hit, drawnFill(d, "rt-rate", 5)]);
  ok("the value is untouched by a hover", state(d)["rt-rate"].value === 4 && label(d, "rt-rate") === "4.0");
  d.setHover("rt-card-interactive-stage");
  d.displayListJson();
  ok("leaving puts the value back", drawnFill(d, "rt-rate", 5) === "1 1 1 1 0");
  ok("a pointer over a star is a hand", d.cursorAt(byId(d, "rt-rate-star-0").calculatedX + 5, byId(d, "rt-rate-star-0").calculatedY + 5) === "pointer");
  click(d, "rt-rate-star-1-h1");
  ok("a click sets 2, the label follows", state(d)["rt-rate"].value === 2 && label(d, "rt-rate") === "2.0" && drawnFill(d, "rt-rate", 5) === "1 1 0 0 0");
  ok("and the focus is on the slider", d.focused === "rt-rate");
  let n = tree(d).byId.get("rt-rate");
  ok("aria: slider 2 of 0..5, '2 out of 5 stars'", n.role === "slider" && n.now === 2 && n.min === 0 && n.max === 5 && n.value === "2 out of 5 stars" && n.focusable, n);
  ok("ArrowRight is the slider's key", d.ownsKey("ArrowRight") && d.key("ArrowRight") && state(d)["rt-rate"].value === 3);
  d.displayListJson();
  ok("label 3.0", label(d, "rt-rate") === "3.0");
  d.key("End");
  d.displayListJson();
  n = tree(d).byId.get("rt-rate");
  ok("End: 5.0, aria 5", label(d, "rt-rate") === "5.0" && n.now === 5 && drawnFill(d, "rt-rate", 5) === "1 1 1 1 1");
  d.key("Home");
  d.displayListJson();
  ok("Home: 0.0, nothing filled", label(d, "rt-rate") === "0.0" && drawnFill(d, "rt-rate", 5) === "0 0 0 0 0");
  ok("Tab is not the slider's", !d.key("Tab"));
  click(d, "rt-rate-star-3-h1");
  ok("clicking the current value keeps it (ReUI sets, does not clear)", (click(d, "rt-rate-star-3-h1"), state(d)["rt-rate"].value === 4));
}

console.log("--- half stars ---");
{
  const d = fresh();
  ok("starts at 3.5: the fourth star half filled", drawnFill(d, "rt-half", 5) === "1 1 1 0.5 0" && label(d, "rt-half") === "3.5");
  const hit = hoverAt(d, "rt-half-star-1-h0");
  ok("the left half of star 2 previews 1.5", hit === "rt-half-star-1-h0" && drawnFill(d, "rt-half", 5) === "1 0.5 0 0 0", [hit, drawnFill(d, "rt-half", 5)]);
  d.setHover("");
  click(d, "rt-half-star-4-h0");
  ok("a click on the left half of star 5 sets 4.5", state(d)["rt-half"].value === 4.5 && label(d, "rt-half") === "4.5");
  let n = tree(d).byId.get("rt-half");
  ok("aria in half steps: 9 of 0..10, '4.5 out of 5 stars'", n.now === 9 && n.max === 10 && n.value === "4.5 out of 5 stars", n);
  d.key("ArrowLeft");
  d.displayListJson();
  ok("ArrowLeft takes half a star", state(d)["rt-half"].value === 4 && label(d, "rt-half") === "4.0");
}

console.log("--- read-only, and ten stars ---");
{
  const d = fresh();
  const t = tree(d);
  const fixed = t.byId.get("rt-fixed");
  ok("read-only is an image with its value in the name", fixed.role === "img" && fixed.name === "Rated 3.5 out of 5 stars" && !fixed.focusable);
  ok("the sizes and the summary are images too", ["rt-size-sm", "rt-size-md", "rt-size-lg", "rt-summary-stars"].every((id) => t.byId.get(id).role === "img"));
  ok("read-only draws no hit targets", byId(d, "rt-fixed-star-0-h1") === null && byId(d, "rt-fixed-star-0-h0") === null);
  const s = byId(d, "rt-fixed-star-4");
  ok("a press on a read-only star does nothing", d.press(d.hitId(s.calculatedX + 7, s.calculatedY + 7)) === false && state(d)["rt-fixed"].value === 3.5);
  d.setHover(d.hitId(s.calculatedX + 7, s.calculatedY + 7));
  d.displayListJson();
  ok("and a hover previews nothing", drawnFill(d, "rt-fixed", 5) === "1 1 1 0.5 0");
  d.setFocus("rt-fixed");
  ok("and a key is not taken", d.key("ArrowRight") === false && state(d)["rt-fixed"].value === 3.5);
  ok("read-only shows no pointer", d.cursorAt(s.calculatedX + 7, s.calculatedY + 7) === "");
  click(d, "rt-edit-star-4-h1");
  ok("the editable one beside it does take a click", state(d)["rt-edit"].value === 5 && label(d, "rt-edit") === "5.0");
  ok("ten stars: 7 of 10", drawnFill(d, "rt-ten", 10) === "1 1 1 1 1 1 1 0 0 0" && label(d, "rt-ten") === "7.0" && t.byId.get("rt-ten").max === 10);
  click(d, "rt-ten-star-9-h1");
  ok("ten stars: the last one is 10", state(d)["rt-ten"].value === 10 && tree(d).byId.get("rt-ten").value === "10 out of 10 stars");
  ok("the style sheet parses clean", d.styleErrorCount() === 0);
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
}

console.log("--- layout: nothing overlaps, nothing leaves its card ---");
function overlaps(d) {
  const bad = [];
  const box = (e) => [e.calculatedX, e.calculatedY, e.calculatedWidth, e.calculatedHeight];
  const inFlow = (e) => e.calculatedWidth > 0 && e.calculatedHeight > 0;
  const walk = (e) => {
    const kids = (e.children || []).filter(inFlow);
    const pb = box(e);
    // A fill clip holds the whole star and shows the part inside it.
    const clips = String(e.className || "").split(/\s+/).includes("rt-star-clip");
    for (const k of clips ? [] : kids) {
      const b = box(k);
      if (b[0] < pb[0] - 0.5 || b[1] < pb[1] - 0.5 || b[0] + b[2] > pb[0] + pb[2] + 0.5 || b[1] + b[3] > pb[1] + pb[3] + 0.5) {
        bad.push(`${k.id || k.className} outside ${e.id || e.className}`);
      }
    }
    // A star's layers (outline, fill, hit targets) are stacked on purpose.
    const layered = String(e.className || "").split(/\s+/).includes("rt-star");
    if (!layered) {
      for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
        const a = box(kids[i]); const b = box(kids[j]);
        const ix = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
        const iy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
        if (ix > 0.5 && iy > 0.5) bad.push(`${kids[i].id || kids[i].className} over ${kids[j].id || kids[j].className}`);
      }
    }
    for (const k of kids) walk(k);
  };
  walk(d.root);
  return bad;
}
for (const w of [900, 358]) {
  const d = fresh(w);
  const bad = overlaps(d);
  ok(`${w}px: no overlaps, every box inside its parent`, bad.length === 0, bad.slice(0, 6));
  const t = tree(d);
  const wide = t.nodes.filter((n) => n.b && n.b[0] + n.b[2] > w + 0.5);
  ok(`${w}px: nothing past the page's right edge`, wide.length === 0, wide.slice(0, 4).map((n) => n.id));
  const kids = d.root.children;
  if (w === 358) ok("358px: one card per row", kids.every((c, i, a) => i === 0 || c.calculatedY > a[i - 1].calculatedY));
  else ok("900px: two cards per row", kids[1].calculatedY === kids[0].calculatedY && kids[3].calculatedY === kids[2].calculatedY);
  ok(`${w}px: the page is as tall as its cards`, near(d.pageH, kids[kids.length - 1].calculatedY + kids[kids.length - 1].calculatedHeight + (w === 358 ? 12 : 24), 1), d.pageH);
}

console.log("");
console.log("passed=" + passed + " failed=" + failed);
if (failed > 0) { console.log("FAILURES"); process.exit(1); }
console.log("ALL PASS");

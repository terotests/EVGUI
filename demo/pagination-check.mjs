#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Pagination demo, checked in Node against the compiled demo.
//
// Two layers. PaginationCtl on its own — which pages are listed and where the
// ellipsis goes, clamping, the ends, rows-per-page ranges, parsing a typed
// page — as unit tests, because that arithmetic is the whole of the
// controller. Then the demo: shadcn's semantics (a navigation landmark named
// "pagination", a list, links, aria-current, aria-disabled, the arrows'
// names), that a click moves the page and the drawn items with it, that the
// go-to-page boxes apply / clamp / refuse, that the two selects change the
// range and the page, the keyboard, and that nothing overlaps at 900 and 358.
//
//   node gallery/evgui/demo/pagination-check.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/PaginationDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "pagination.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

const fresh = (w) => {
  const d = new M.PaginationDemo();
  d.init(CSS);
  if (w) { d.pageW = w; d.layout = undefined; }
  d.displayListJson();
  return d;
};
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const centre = (n) => [n.b[0] + n.b[2] / 2, n.b[1] + n.b[3] / 2];
// Press what is under a node's centre, the way the page does: hit test first.
const click = (d, id) => {
  const n = tree(d).byId.get(id);
  if (!n) return "(no node " + id + ")";
  const [x, y] = centre(n);
  const hit = d.hitId(x, y);
  d.beginSelection(hit, x, false);
  d.endSelection();
  d.displayListJson();
  return hit;
};
// The page numbers drawn in a card's list, in order, with "…" for an ellipsis.
const drawn = (d, tid) => tree(d).nodes
  .filter((n) => n.p && n.p.startsWith(tid + "-") && n.p.endsWith("-li") && (n.role === "link" || n.role === "text"))
  .filter((n) => /-page-\d+$|-ellipsis-/.test(n.id))
  .map((n) => (n.role === "text" ? "…" : n.name)).join(" ");

console.log("--- PaginationCtl: the items ---");
{
  const C = M.PaginationCtl;
  const mk = (pages, page, span, boundaries) => {
    const c = new C(); c.tid = "t"; c.pages = pages; c.page = page; c.span = span; c.boundaries = boundaries; return c;
  };
  const cases = [
    // pages, page, span, boundaries, expected
    [12, 1, 1, 3, "1 2 3 … 10 11 12"],
    [12, 4, 1, 3, "1 2 3 4 … 10 11 12"],
    [12, 5, 1, 3, "1 2 3 4 5 … 10 11 12"],
    [12, 7, 1, 3, "1 2 3 … 7 … 10 11 12"],
    [12, 12, 1, 3, "1 2 3 … 10 11 12"],
    [12, 6, 3, 1, "1 … 5 6 7 … 12"],
    [12, 3, 3, 1, "1 2 3 4 … 12"],
    [10, 1, 3, 0, "1 2 3 …"],
    [10, 5, 3, 0, "… 4 5 6 …"],
    [10, 10, 3, 0, "… 8 9 10"],
    [10, 1, 4, 0, "1 2 3 4 …"],
    [10, 3, 4, 0, "1 2 3 4 …"],
    [10, 6, 4, 0, "… 4 5 6 7 …"],
    [10, 10, 4, 0, "… 7 8 9 10"],
    [3, 2, 3, 0, "1 2 3"],
    [1, 1, 3, 1, "1"],
    [5, 3, 1, 1, "1 2 3 4 5"],
  ];
  for (const [pages, page, span, b, want] of cases) {
    const got = mk(pages, page, span, b).itemsText();
    ok(`${pages} pages, page ${page}, span ${span}, ends ${b}: ${want}`, got === want, got);
  }
  const s = mk(10, 1, 1, 1);
  s.span = 0; s.siblings = 1;
  ok("siblings 1 = a window of three", s.itemsText() === "1 2 3 … 10", s.itemsText());
  const e = mk(12, 7, 1, 3);
  ok("the ellipses have two names, before and after", JSON.stringify(e.items().filter((x) => x.startsWith("ellipsis"))) ===
    JSON.stringify(["ellipsis-start", "ellipsis-end"]), e.items());
}

console.log("--- PaginationCtl: moving, ends, clamping ---");
{
  const c = new M.PaginationCtl(); c.tid = "t"; c.pages = 10; c.page = 1;
  ok("page 1: no previous, a next", !c.canPrevious() && c.canNext());
  ok("previous at page 1 does nothing", c.previous() === false && c.page === 1);
  ok("the previous / first ids are disabled at page 1", c.isDisabled("t-prev") && c.isDisabled("t-first") && !c.isDisabled("t-next"));
  c.last();
  ok("last → 10, next disabled", c.page === 10 && !c.canNext() && c.isDisabled("t-last") && c.isDisabled("t-next"));
  ok("next at the end does nothing", c.next() === false && c.page === 10);
  c.first();
  ok("first → 1", c.page === 1);
  ok("setPage clamps high", (c.setPage(99), c.page === 10));
  ok("setPage clamps low", (c.setPage(-3), c.page === 1));
  ok("press on a page link", c.press("t-page-4") && c.page === 4);
  ok("press on next / prev", (c.press("t-next"), c.press("t-next"), c.press("t-prev"), c.page === 5));
  ok("a foreign id is not ours", !c.press("u-page-2") && !c.owns("t-page-") && !c.owns("t-page-x") && c.page === 5);
  ok("parsePage: whole numbers, clamped", c.parsePage("7") === 7 && c.parsePage(" 3 ") === 3 && c.parsePage("99") === 10 &&
    c.parsePage("0") === 1 && c.parsePage("12345678901") === 10);
  ok("parsePage: not a number is -1", ["", " ", "2.5", "-", "abc", "3x", "-3"].every((t) => c.parsePage(t) === -1),
    ["", " ", "2.5", "-", "abc", "3x", "-3"].map((t) => c.parsePage(t)));
  ok("goTo applies a page, refuses junk", c.goTo("8") && c.page === 8 && !c.goTo("") && c.page === 8);
}

console.log("--- PaginationCtl: rows per page (TableCtl's arithmetic) ---");
{
  const C = M.PaginationCtl;
  ok("pagesFor: 100 / 25 = 4, 101 / 25 = 5, 0 rows = 1 page", C.pagesFor(100, 25) === 4 && C.pagesFor(101, 25) === 5 &&
    C.pagesFor(0, 25) === 1 && C.pagesFor(5, 0) === 1);
  const c = new C(); c.tid = "r"; c.total = 100; c.pageSize = 25;
  ok("range 1-25 of 100", c.rangeText() === "1-25 of 100" && c.pageCount() === 4, c.rangeText());
  c.last();
  ok("last page: 76-100 of 100", c.rangeText() === "76-100 of 100" && c.page === 4, c.rangeText());
  c.setPage(2);
  c.setPageSize(10);
  ok("25 → 10 a page keeps row 26 on screen: page 3, 21-30", c.page === 3 && c.rangeText() === "21-30 of 100", [c.page, c.rangeText()]);
  c.setPageSize(100);
  ok("→ 100 a page: page 1, 1-100 of 100", c.page === 1 && c.rangeText() === "1-100 of 100" && c.pageCount() === 1);
  c.total = 95; c.pageSize = 50; c.page = 2;
  ok("a short last page: 51-95 of 95", c.rangeText() === "51-95 of 95", c.rangeText());
}

console.log("--- the demo: roles, names, states ---");
{
  const d = fresh();
  ok("no style errors", d.styleErrorCount() === 0, d.styleErrorCount());
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
  const t = tree(d);
  const navs = t.nodes.filter((n) => n.role === "navigation");
  ok("ten navigation landmarks, each named pagination, …", navs.length === 10 && navs.every((n) => /^pagination, /.test(n.name)),
    navs.map((n) => n.name));
  ok("…and no two with the same name", new Set(navs.map((n) => n.name)).size === 10);
  ok("each holds a list", navs.every((nav) => t.nodes.some((n) => n.p === nav.id && n.role === "list")));
  const current = t.nodes.filter((n) => n.current === "page");
  ok("one aria-current page per numbered card (1-4, 6, 7, 10)", current.length === 7 &&
    current.every((n) => n.role === "link"), current.map((n) => n.id));
  ok("card 1's current page is 2", t.byId.get("pg1-page-2").current === "page" && !t.byId.get("pg1-page-1").current);
  const ends = { prev: "Go to previous page", next: "Go to next page", first: "Go to first page", last: "Go to last page" };
  for (const [k, name] of Object.entries(ends)) {
    ok(`pg8-${k} is a link named "${name}"`, t.byId.get(`pg8-${k}`).role === "link" && t.byId.get(`pg8-${k}`).name === name);
  }
  ok("at page 1, previous and first are aria-disabled", t.byId.get("pg8-prev").disabled && t.byId.get("pg8-first").disabled &&
    !t.byId.get("pg8-next").disabled && !t.byId.get("pg8-last").disabled);
  ok("every page link is a tab stop", t.nodes.filter((n) => /-page-\d+$/.test(n.id)).every((n) => n.focusable && n.role === "link"));
  const ell = t.byId.get("pg4-ellipsis-end");
  ok("the ellipsis is read as \"More pages\", not a link, not a stop", ell && ell.role === "text" && ell.name === "More pages" &&
    !ell.focusable, ell);
  ok("card 4 draws 1 2 3 … 10 11 12", drawn(d, "pg4") === "1 2 3 … 10 11 12", drawn(d, "pg4"));
  ok("the go-to boxes are text boxes named Go to page, holding 1", ["pg3-goto", "pg10-goto"].every((id) =>
    t.byId.get(id).role === "textbox" && t.byId.get(id).name === "Go to page" && t.byId.get(id).value === "1"));
  ok("the selects are comboboxes with their value", t.byId.get("pg8-rows-trigger").role === "combobox" &&
    t.byId.get("pg8-rows-trigger").name === "Rows per page" && t.byId.get("pg8-rows-trigger").value === "25" &&
    t.byId.get("pg9-select-trigger").value === "Page 1");
  ok("card 5 says Page 1 of 10, card 8 1-25 of 100", t.byId.get("pg5-info").name === "Page 1 of 10" &&
    t.byId.get("pg8-range").name === "1-25 of 100");
}

console.log("--- the demo: clicks move the page ---");
{
  const d = fresh();
  let hit = click(d, "pg1-page-3");
  ok("a click on card 1's 3 hits it", hit === "pg1-page-3", hit);
  let t = tree(d);
  ok("…and makes it current", t.byId.get("pg1-page-3").current === "page" && !t.byId.get("pg1-page-2").current);
  ok("…and Next is now disabled", t.byId.get("pg1-next").disabled === true && !t.byId.get("pg1-prev").disabled);
  click(d, "pg1-next");
  ok("a click on a disabled Next does nothing", d.pageOf(1) === 3);
  click(d, "pg1-prev"); click(d, "pg1-prev");
  t = tree(d);
  ok("Previous twice: page 1, Previous disabled", d.pageOf(1) === 1 && t.byId.get("pg1-prev").disabled);

  click(d, "pg6-page-4");
  ok("card 6: 4 is current, the window of four slides to 2-5", d.pageOf(6) === 4 && drawn(d, "pg6") === "… 2 3 4 5 …", drawn(d, "pg6"));
  click(d, "pg6-next");
  ok("card 6: Next → 5, the ellipsis moves to both sides", d.pageOf(6) === 5 && drawn(d, "pg6") === "… 3 4 5 6 …", drawn(d, "pg6"));

  click(d, "pg4-page-10");
  ok("card 4: page 10", d.pageOf(4) === 10 && drawn(d, "pg4") === "1 2 3 … 10 11 12", drawn(d, "pg4"));
  click(d, "pg4-prev"); click(d, "pg4-prev"); click(d, "pg4-prev");
  ok("card 4: back to 7, an ellipsis each side", d.pageOf(4) === 7 && drawn(d, "pg4") === "1 2 3 … 7 … 10 11 12", drawn(d, "pg4"));

  click(d, "pg5-next");
  ok("card 5: Next → Page 2 of 10", tree(d).byId.get("pg5-info").name === "Page 2 of 10");
  click(d, "pg7-page-4");
  ok("card 7: the segmented 4", d.pageOf(7) === 4 && tree(d).byId.get("pg7-page-4").current === "page");
  click(d, "pg9-last");
  t = tree(d);
  ok("card 9: last → 10, the select says Page 10", d.pageOf(9) === 10 && t.byId.get("pg9-select-trigger").value === "Page 10");
  ok("a click focuses the link", d.focused === "pg9-last", d.focused);
  const other = [2, 3, 8, 10].map((n) => d.pageOf(n)).join();
  ok("the other cards did not move", other === "2,1,1,1", other);
}

console.log("--- the demo: the keyboard ---");
{
  const d = fresh();
  d.setFocus("pg2-page-3");
  ok("Enter on a focused page link follows it", d.key("Enter") && d.pageOf(2) === 3);
  d.setFocus("pg2-prev");
  ok("Space on Previous follows it", d.key(" ") && d.pageOf(2) === 2);
  ok("a letter is not taken", d.key("x") === false);
  ok("Tab is left to the page", d.keyWith("Tab", false, false) === false);
}

console.log("--- the demo: go to page ---");
{
  const d = fresh();
  const hit = click(d, "pg3-goto");
  ok("a click puts the focus in the box", d.focusedField() === "pg3-goto", [hit, d.focused]);
  d.applyEdit("pg3-goto", "7", 1, 1);
  d.keyWith("Enter", false, false);
  let t = tree(d);
  ok("7 + Enter → page 7", d.pageOf(3) === 7 && t.byId.get("pg3-page-7").current === "page", d.pageOf(3));
  ok("…the ellipsis now on both sides", drawn(d, "pg3") === "… 6 7 8 …", drawn(d, "pg3"));
  ok("…and focus stays in the box", d.focused === "pg3-goto");
  d.applyEdit("pg3-goto", "99", 2, 2);
  d.keyWith("Enter", false, false);
  t = tree(d);
  ok("99 clamps to 10, and the box says 10", d.pageOf(3) === 10 && t.byId.get("pg3-goto").value === "10" &&
    JSON.parse(d.fieldStateJson("pg3-goto")).value === "10");
  ok("…and not invalid", !t.byId.get("pg3-goto").invalid);
  d.applyEdit("pg3-goto", "", 0, 0);
  d.keyWith("Enter", false, false);
  t = tree(d);
  const box = t.byId.get("pg3-goto");
  ok("empty + Enter: invalid, the page stays", box.invalid === "true" && d.pageOf(3) === 10, box);
  const err = t.byId.get("pg3-goto-error");
  ok("…described by a message that says what to type", box.describedby === "pg3-goto-error" && err &&
    /1 to 10/.test(err.name || ""), [box.describedby, err]);
  // The stroke (k 1) round the box: #991b1b while focused, #dc2626 otherwise.
  const red = JSON.parse(d.displayListJson()).cmds.find((c) => c.k === 1 && Math.abs(c.x - box.b[0]) < 1 && Math.abs(c.y - box.b[1]) < 1);
  ok("…and drawn with a red edge", red && red.c[0] > 140 && red.c[1] < 60 && red.c[2] < 60, red && red.c);
  d.applyEdit("pg3-goto", "2.5", 3, 3);
  ok("an edit clears the error", !tree(d).byId.get("pg3-goto").invalid);
  d.keyWith("Enter", false, false);
  ok("2.5 + Enter is invalid too", tree(d).byId.get("pg3-goto").invalid === "true" && d.pageOf(3) === 10);
  d.keyWith("Escape", false, false);
  t = tree(d);
  ok("Escape puts the current page back and clears it", t.byId.get("pg3-goto").value === "10" && !t.byId.get("pg3-goto").invalid);
  // Blur applies: type 4, then click a link on another card.
  d.applyEdit("pg3-goto", "4", 1, 1);
  click(d, "pg1-page-1");
  ok("leaving the box applies it (blur)", d.pageOf(3) === 4 && d.pageOf(1) === 1 && d.focused === "pg1-page-1", [d.pageOf(3), d.focused]);
  // Typing through the demo's own keys (a number box refuses letters).
  click(d, "pg10-goto");
  d.keyWith("Backspace", false, false);
  d.type("a");
  d.type("6");
  ok("a number box refuses a letter", JSON.parse(d.fieldStateJson("pg10-goto")).value === "6");
  d.keyWith("Enter", false, false);
  ok("card 10: 6 + Enter → page 6", d.pageOf(10) === 6 && drawn(d, "pg10") === "… 4 5 6 7 …", drawn(d, "pg10"));
  click(d, "pg10-next");
  ok("a page change elsewhere shows in the box", tree(d).byId.get("pg10-goto").value === "7");
  ok("the pointer is an I-beam over the box", (() => { const b = tree(d).byId.get("pg10-goto").b; return d.cursorAt(b[0] + 5, b[1] + 5) === "text"; })());
}

console.log("--- the demo: rows per page ---");
{
  const d = fresh();
  click(d, "pg8-rows-trigger");
  let t = tree(d);
  const lb = t.byId.get("pg8-rows-content");
  ok("the trigger opens a listbox of 10 / 25 / 50 / 100", lb && lb.role === "listbox" &&
    t.nodes.filter((n) => n.p === "pg8-rows-content" && n.role === "option").map((n) => n.name).join() === "10,25,50,100");
  ok("…expanded, and 25 is selected", t.byId.get("pg8-rows-trigger").expanded === 2 && t.byId.get("pg8-rows-item-25").selected);
  const lbBox = lb.b;
  const trig = t.byId.get("pg8-rows-trigger").b;
  ok("…under its trigger", lbBox[1] >= trig[1] + trig[3] - 1 && Math.abs(lbBox[0] - trig[0]) < 2, { lbBox, trig });
  click(d, "pg8-rows-item-10");
  t = tree(d);
  ok("choosing 10: closed, range 1-10 of 100", !t.byId.has("pg8-rows-content") && t.byId.get("pg8-range").name === "1-10 of 100" &&
    t.byId.get("pg8-rows-trigger").value === "10");
  ok("…focus back on the trigger", d.focused === "pg8-rows-trigger");
  click(d, "pg8-last");
  ok("last: 91-100 of 100", tree(d).byId.get("pg8-range").name === "91-100 of 100" && tree(d).byId.get("pg8-next").disabled);
  // The keyboard: open with Enter, walk down, choose.
  d.setFocus("pg8-rows-trigger");
  d.key("Enter");
  ok("Enter opens onto the chosen option", d.focused === "pg8-rows-item-10", d.focused);
  d.key("ArrowDown"); d.key("ArrowDown");
  d.key("Enter");
  t = tree(d);
  ok("ArrowDown ×2 + Enter chooses 50: the last row stays in view", t.byId.get("pg8-rows-trigger").value === "50" &&
    t.byId.get("pg8-range").name === "51-100 of 100", t.byId.get("pg8-range").name);
  d.key("Enter");
  d.key("Escape");
  ok("Escape closes without choosing", !tree(d).byId.has("pg8-rows-content") && tree(d).byId.get("pg8-rows-trigger").value === "50");
  click(d, "pg8-rows-trigger");
  click(d, "pg1-page-1");
  ok("a click outside closes the list", !tree(d).byId.has("pg8-rows-content"));
}

console.log("--- the demo: the Page select ---");
{
  const d = fresh();
  click(d, "pg9-select-trigger");
  let t = tree(d);
  ok("ten options, Page 1 … Page 10", t.nodes.filter((n) => n.p === "pg9-select-content").length === 10);
  const h0 = d.heightPx();
  ok("the page grows to hold the open list", t.byId.get("pg9-select-content").b[1] + t.byId.get("pg9-select-content").b[3] <= h0, h0);
  click(d, "pg9-select-item-5");
  t = tree(d);
  ok("Page 5: the card is on page 5", d.pageOf(9) === 5 && t.byId.get("pg9-select-trigger").value === "Page 5");
  click(d, "pg9-next");
  ok("next → the select says Page 6", tree(d).byId.get("pg9-select-trigger").value === "Page 6");
}

console.log("--- layout: nothing overlaps, nothing leaves its card ---");
function overlaps(d) {
  const bad = [];
  const box = (e) => [e.calculatedX, e.calculatedY, e.calculatedWidth, e.calculatedHeight];
  const inFlow = (e) => !e.isOverlay && String(e.className || "").split(/\s+/).every((c) => !["pg-caret", "pg-band"].includes(c)) &&
    e.calculatedWidth > 0 && e.calculatedHeight > 0 && !(e.isHidden && e.isHidden());
  const walk = (e) => {
    const kids = (e.children || []).filter(inFlow);
    const pb = box(e);
    for (const k of kids) {
      const b = box(k);
      if (b[0] < pb[0] - 0.5 || b[1] < pb[1] - 0.5 || b[0] + b[2] > pb[0] + pb[2] + 0.5 || b[1] + b[3] > pb[1] + pb[3] + 0.5) {
        bad.push(`${k.id || k.className} outside ${e.id || e.className}`);
      }
    }
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = box(kids[i]); const b = box(kids[j]);
      const ix = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
      const iy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
      if (ix > 0.5 && iy > 0.5) bad.push(`${kids[i].id || kids[i].className} over ${kids[j].id || kids[j].className}`);
    }
    for (const k of kids) walk(k);
  };
  walk(d.root);
  return bad;
}
for (const w of [1024, 900, 358]) {
  const d = fresh(w);
  d.displayListJson();
  const bad = overlaps(d);
  ok(`${w}px: no overlaps, every box inside its parent`, bad.length === 0, bad.slice(0, 6));
  const t = tree(d);
  const wide = t.nodes.filter((n) => n.b && n.b[0] + n.b[2] > w + 0.5);
  ok(`${w}px: nothing past the page's right edge`, wide.length === 0, wide.slice(0, 4).map((n) => n.id));
  const cards = t.nodes.filter((n) => n.role === "navigation").map((n) => n.b);
  if (w === 358) {
    ok("358px: one card per row", d.root.children.every((c, i, a) => i === 0 || c.calculatedY > a[i - 1].calculatedY));
    ok("358px: Previous / Next keep only their chevrons", t.byId.get("pg1-prev").b[2] === 36 && t.byId.get("pg1-prev").name === "Go to previous page");
    ok("358px: card 4 keeps one page at each end", drawn(d, "pg4") === "1 … 12", drawn(d, "pg4"));
  } else {
    ok(`${w}px: two cards per row`, d.root.children[1].calculatedY === d.root.children[0].calculatedY);
  }
  ok(`${w}px: each nav fits its card`, cards.length === 10);
}
{
  // The wide rows on one line where there is room for them.
  const d = fresh(1024);
  const t = tree(d);
  const y = (id) => t.byId.get(id).b[1];
  ok("1024px: card 8 on one line", y("pg8-rows-trigger") === y("pg8-first"), [y("pg8-rows-trigger"), y("pg8-first")]);
  ok("1024px: card 10 on one line", y("pg10-goto") === y("pg10-prev"));
  const d2 = fresh(358);
  const t2 = tree(d2);
  ok("358px: card 10's box wraps under its links", t2.byId.get("pg10-goto").b[1] > t2.byId.get("pg10-prev").b[1] + 30);
}

console.log("");
console.log("passed=" + passed + " failed=" + failed);
if (failed > 0) { console.log("FAILURES"); process.exit(1); }
console.log("ALL PASS");

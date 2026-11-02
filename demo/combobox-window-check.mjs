// A long Combobox list (more than ComboboxCtl.win.above rows shown) is a
// fixed-height list that scrolls and builds only the rows near its viewport.
// The same input sequence on two demos: one windowed, one with every row
// built in the same scrolling list (overscan without end); the visible
// display list is compared after each step. Also: a short list, and a query
// that narrows a long list to a short one, are what they always were.
//
//   node gallery/evgui/demo/combobox-window-check.mjs   (from a Ranger
//   checkout, after npm run ui:demo:build)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const M = require(path.join(HERE, "..", "bin", "ComboboxDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "combobox.css"), "utf8");

let pass = 0, fail = 0;
const ok = (name, cond, info = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${info}`); } };

function demo(n, whole, extra = (d) => {}) {
  const d = new M.ComboboxDemo();
  d.init(CSS);
  extra(d);
  if (whole) d.basic.win.overscanPx = 1e9;
  for (let i = 0; i < n; i++) d.basic.addItem("z" + i, "Fruit " + i, false);
  d.rebuild();
  d.displayListJson();
  return d;
}

function visible(d) {
  const cmds = JSON.parse(d.displayListJson()).cmds;
  const c = d.basic;
  if (!c.open) return cmds.map((x) => JSON.stringify(x));
  const pop = c.contentEl;
  const x0 = pop.calculatedX, x1 = x0 + pop.calculatedWidth, y0 = pop.calculatedY, y1 = y0 + pop.calculatedHeight;
  return cmds.filter((x) => {
    const w = x.w || 0, h = x.h || 0;
    const inCol = x.x >= x0 - 0.5 && x.x + w <= x1 + 0.5;
    return !inCol || (x.y < y1 && x.y + h > y0) || w === 0;
  }).map((x) => JSON.stringify(x));
}

function rowsBuilt(d) {
  let n = 0;
  const walk = (el) => { if (/-item-z\d+$/.test(el.id)) n++; for (const k of el.children) walk(k); };
  walk(d.root);
  return n;
}

function same(name, a, b) {
  const va = visible(a), vb = visible(b);
  let first = -1;
  for (let i = 0; i < Math.max(va.length, vb.length); i++) if (va[i] !== vb[i]) { first = i; break; }
  ok(name, first < 0, first < 0 ? "" : `at cmd ${first}: windowed ${va[first]} whole ${vb[first]}`);
}

for (const n of [400, 3000]) {
  const a = demo(n, false), b = demo(n, true);
  const both = (fn) => { fn(a); fn(b); a.displayListJson(); b.displayListJson(); };
  const input = a.basic.inputTid();
  both((d) => d.press(input));
  both((d) => d.key("ArrowDown"));
  ok(`${n}:open`, a.basic.open, "not open");
  same(`${n}:open`, a, b);
  ok(`${n}:open-built`, rowsBuilt(a) < 60, `rows ${rowsBuilt(a)}`);
  ok(`${n}:whole-built`, rowsBuilt(b) >= n, `rows ${rowsBuilt(b)}`);
  ok(`${n}:height`, Math.abs(a.basic.contentEl.calculatedHeight - a.basic.maxListHeight) < 1, String(a.basic.contentEl.calculatedHeight));
  for (const dy of [40, 300, 1000, 37, -500, 5000]) {
    both((d) => d.scrollBy(dy));
    same(`${n}:wheel ${dy}`, a, b);
  }
  ok(`${n}:wheel-built`, rowsBuilt(a) < 60, `rows ${rowsBuilt(a)}`);
  for (const k of ["ArrowDown", "ArrowDown", "ArrowUp", "End", "ArrowUp", "Home", "ArrowDown"]) {
    both((d) => d.key(k));
    same(`${n}:key ${k}`, a, b);
  }
  // the highlight is on screen after the keys
  {
    const c = a.basic, act = c.activeValue;
    const el = c.items.find((it) => it.value === act)?.el;
    const box = c.contentEl;
    ok(`${n}:highlight-in-view`, !act || (el && el.calculatedY >= box.calculatedY - 0.5 && el.calculatedY + el.calculatedHeight <= box.calculatedY + box.calculatedHeight + 0.5), act);
  }
  // hover a row on screen
  {
    const box = a.basic.contentEl;
    const hx = box.calculatedX + 40, hy = box.calculatedY + 60;
    both((d) => d.setHover(d.hitId(hx, hy)));
    same(`${n}:hover`, a, b);
  }
  // a query narrows it to a short list: the list's own height again
  for (const ch of ["1", "2", "3"]) both((d) => d.type(ch));
  same(`${n}:narrowed`, a, b);
  ok(`${n}:narrowed-free`, !a.basic.contentEl.height.isSet, "height still set");
  // and back to the long list
  for (let i = 0; i < 3; i++) both((d) => d.key("Backspace"));
  same(`${n}:widened`, a, b);
  both((d) => d.key("Escape"));
  same(`${n}:closed`, a, b);
}

// a short list is the tree it always was
{
  const a = demo(20, false), b = demo(20, true);
  const input = a.basic.inputTid();
  a.press(input); b.press(input); a.key("ArrowDown"); b.key("ArrowDown");
  ok("short:not-windowed", !a.basic.contentEl.height.isSet);
  ok("short:same", a.displayListJson() === b.displayListJson());
}

console.log(`combobox-window: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

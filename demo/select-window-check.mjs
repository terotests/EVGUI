// A long Select list built windowed (src/UiListWindow.rgr) draws what the
// whole list draws: the same input sequence on two demos, one building every
// row (win.above huge), and the visible display list compared after each step.
// Also: rows built stay near the viewport, and a short list is built whole.
//
//   node gallery/evgui/demo/select-window-check.mjs   (from a Ranger checkout,
//   after npm run ui:demo:build)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const M = require(path.join(HERE, "..", "bin", "SelectDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "select.css"), "utf8");

let pass = 0, fail = 0;
const ok = (name, cond, info = "") => { if (cond) pass++; else { fail++; console.log(`FAIL ${name} ${info}`); } };

function demo(n, whole) {
  const d = new M.SelectDemo();
  d.init(CSS);
  if (whole) d.win.above = 1e9;
  for (let i = 0; i < n; i++) d.users.addGroupedItem("x" + i, "Person " + i + " Example", "Select a user");
  d.displayListJson();
  return d;
}

// what shows: commands outside the open list's column, and those inside it
// that meet its visible box (rows scrolled out of it are drawn but clipped)
function visible(d) {
  const cmds = JSON.parse(d.displayListJson()).cmds;
  const pop = d.popEl();
  if (pop.id !== d.users.contentTid()) return cmds.map((c) => JSON.stringify(c));
  const x0 = pop.calculatedX, x1 = x0 + pop.calculatedWidth, y0 = pop.calculatedY, y1 = y0 + pop.calculatedHeight;
  return cmds.filter((c) => {
    const w = c.w || 0, h = c.h || 0;
    const inCol = c.x >= x0 - 0.5 && c.x + w <= x1 + 0.5;
    const meets = c.y < y1 && c.y + h > y0;
    return !inCol || meets || w === 0;
  }).map((c) => JSON.stringify(c));
}

function rowsBuilt(d) {
  let n = 0;
  const walk = (el) => { if (/-item-x\d+$/.test(el.id)) n++; for (const k of el.children) walk(k); };
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
  const both = (fn) => { fn(a); fn(b); };
  const trig = a.users.triggerTid();
  both((d) => { d.press(trig); });
  same(`${n}:open`, a, b);
  ok(`${n}:open-built`, rowsBuilt(a) < 80, `rows ${rowsBuilt(a)}`);
  ok(`${n}:whole-built`, rowsBuilt(b) === n, `rows ${rowsBuilt(b)}`);
  for (const dy of [40, 300, 1000, 37, -500, 5000]) {
    both((d) => d.scrollBy(dy));
    same(`${n}:wheel ${dy}`, a, b);
  }
  ok(`${n}:wheel-built`, rowsBuilt(a) < 80, `rows ${rowsBuilt(a)}`);
  both((d) => { d.focused = d.users.contentTid(); });
  for (const k of ["Home", "ArrowDown", "ArrowDown", "ArrowDown", "End", "ArrowUp", "PageUp", "Home"]) {
    both((d) => d.key(k));
    same(`${n}:key ${k}`, a, b);
  }
  // hover the third row on screen
  const pop = a.popEl();
  const hy = pop.calculatedY + 4 + 2 * 32 + 10;
  both((d) => d.setHover(d.hitId(pop.calculatedX + 40, hy)));
  same(`${n}:hover`, a, b);
  // choose a far row (End, Enter), close, reopen: it is built and in view
  both((d) => { d.key("End"); d.key("Enter"); });
  same(`${n}:chosen`, a, b);
  both((d) => d.press(trig));
  same(`${n}:reopen`, a, b);
  ok(`${n}:reopen-built`, rowsBuilt(a) < 80, `rows ${rowsBuilt(a)}`);
  // a narrower page
  both((d) => { d.pageW = 700; });
  same(`${n}:resize`, a, b);
}

// a short list is the tree it always was
{
  const a = demo(20, false), b = demo(20, true);
  a.press(a.users.triggerTid()); b.press(b.users.triggerTid());
  ok("short:whole", rowsBuilt(a) === 20, `rows ${rowsBuilt(a)}`);
  ok("short:same", a.displayListJson() === b.displayListJson());
}

console.log(`select-window: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

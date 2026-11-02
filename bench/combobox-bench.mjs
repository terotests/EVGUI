// Combobox demo's basic box with N extra options, open: frame cost per
// interaction (median ms). node gallery/evgui/bench/combobox-bench.mjs 10,300,3000
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);
const M = require(path.join(ROOT, "gallery/evgui/bin/ComboboxDemo.cjs"));
const CSS = fs.readFileSync(path.join(ROOT, "gallery/evgui/demo/combobox.css"), "utf8");
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const t = (fn, n = 7) => { fn(); const r = []; for (let i = 0; i < n; i++) { const a = performance.now(); fn(); r.push(performance.now() - a); } return med(r); };
const rows = (process.argv[2] || "10,300,1000,3000").split(",").map(Number);
console.log("options | open   hover  arrowDn wheel  type");
for (const N of rows) {
  const d = new M.ComboboxDemo(); d.init(CSS);
  const c = d.basic;
  for (let i = 0; i < N; i++) c.addItem("z" + i, "Fruit " + i, false);
  d.rebuild(); d.displayListJson();
  const input = c.inputTid();
  const open = t(() => { d.press(input); d.key("ArrowDown"); d.displayListJson(); d.key("Escape"); d.displayListJson(); }, 3) / 2;
  d.press(input); d.key("ArrowDown"); d.displayListJson();
  let k = 0;
  const hover = t(() => { d.setHover(c.itemTid("z" + (k++ % 4))); d.displayListJson(); });
  const arrow = t(() => { d.key("ArrowDown"); d.displayListJson(); });
  let s = 1; const wheel = t(() => { s = -s; (d.scrollBy ? d.scrollBy(40 * s) : 0); d.displayListJson(); });
  const type = t(() => { d.type("F"); d.displayListJson(); d.key("Backspace"); d.displayListJson(); }, 3) / 2;
  console.log(`${String(N).padStart(7)} | ${[open, hover, arrow, wheel, type].map((x) => x.toFixed(1).padStart(6)).join(" ")}`);
}

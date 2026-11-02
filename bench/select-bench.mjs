// Select demo's "users" list with N options: frame cost per interaction.
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module"; import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);
const M = require(path.join(ROOT, "gallery/evgui/bin/SelectDemo.cjs"));
const CSS = fs.readFileSync(path.join(ROOT, "gallery/evgui/demo/select.css"), "utf8");
const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
const t = (fn, n = 7) => { fn(); const r = []; for (let i = 0; i < n; i++) { const a = performance.now(); fn(); r.push(performance.now() - a); } return med(r); };
const rows = (process.argv[2] || "10,200,1000,3000").split(",").map(Number);
console.log("options | open   hover  arrowDn wheel  | resize(900->700) | closed frame");
for (const N of rows) {
  const d = new M.SelectDemo(); d.init(CSS);
  const u = d.users;
  for (let i = 0; i < N; i++) u.addGroupedItem("x" + i, "Person " + i + " Example", "Select a user");
  d.displayListJson();
  const closed = t(() => { d.rebuild(); d.displayListJson(); });
  const trig = u.triggerTid();
  const open = t(() => { d.press(trig); d.displayListJson(); d.press(trig); d.displayListJson(); }, 3) / 2;
  d.press(trig); d.displayListJson();
  let k = 0;
  const hover = t(() => { d.setHover(u.itemTid("x" + (k++ % Math.min(N, 8)))); d.displayListJson(); });
  d.focused = trig;
  const arrow = t(() => { d.key("ArrowDown"); d.displayListJson(); });
  let s = 1; const wheel = t(() => { s = -s; d.scrollBy(40 * s); d.displayListJson(); });
  let w = 0; const resize = t(() => { d.pageW = (w++ % 2) ? 900 : 700; d.displayListJson(); });
  console.log(`${String(N).padStart(7)} | ${[open, hover, arrow, wheel].map((x) => x.toFixed(1).padStart(6)).join(" ")} | ${resize.toFixed(1).padStart(8)} | ${closed.toFixed(1)}`);
}

/**
 * The demo page for development: every demo compiled with source maps, the
 * page bundled with them, and the server started with hot reload.
 *
 *   npm run evg:dev            (node scripts/run.mjs evg:dev from EVGUI)
 *   PORT=9000 npm run evg:dev
 *
 * Runs from the Ranger checkout like every other task. The first build
 * compiles all demos, several at once; after that a save recompiles only the
 * demos that use the saved file (web/hot.mjs).
 */

import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { demoNames, compileDemo, bundlePage, compilerMessage } from "./hot.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");

const names = demoNames(ROOT);
const width = Math.max(1, Math.min(names.length, os.cpus().length));
const t0 = Date.now();
let next = 0;
let failed = null;
async function worker() {
  while (!failed && next < names.length) {
    const name = names[next++];
    const r = await compileDemo(ROOT, name);
    if (r.code !== 0) failed = { name, out: r.out };
  }
}
console.log(`  compiling ${names.length} demos with source maps (${width} at a time)…`);
await Promise.all(Array.from({ length: width }, worker));
if (failed) {
  console.error(`  ${failed.name} did not compile:\n${compilerMessage(failed.out)}`);
  process.exit(1);
}
const b = await bundlePage(ROOT);
if (b.code !== 0) {
  console.error(b.out);
  process.exit(1);
}
console.log(`  built in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const serve = spawn(process.execPath, [path.join(HERE, "serve.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, HOT: "1" },
});
serve.on("close", (code) => process.exit(code ?? 0));

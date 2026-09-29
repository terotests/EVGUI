#!/usr/bin/env node
/**
 * Run one or more EVGUI tasks inside a Ranger checkout.
 *
 *   node scripts/run.mjs [--ranger <dir>] [--no-overlay] <task> [<task> ...]
 *
 * The demos, the playground and the benches are Ranger source that expects to
 * sit at gallery/evgui/ in a Ranger checkout: the demos import the controllers
 * from this repository's src/ (a copy of Ranger's gallery/ui/src), the EVG
 * library from lib/evg and the conformance harness from gallery/ui/conformance,
 * and are compiled by Ranger's committed compiler (dist/rgrc.js). Every task
 * runs with the Ranger checkout as its working directory.
 *
 * Clone this repository straight into Ranger/gallery/evgui and nothing is
 * copied. From a clone anywhere else, src/, theme/, demo/, web/ and bench/ are
 * copied to Ranger/gallery/evgui first (skip that with --no-overlay when you
 * edit the copies there directly).
 *
 * Tasks are listed in scripts/tasks.json — the npm scripts that left Ranger's
 * package.json with these directories. `npm run <name>` inside a task, and a task
 * name given here, resolve against that file first and against Ranger's own
 * package.json otherwise (ui:conformance:install and the conformance
 * oracles).
 *
 * --ranger defaults to $RANGER_DIR, then the enclosing Ranger checkout when
 * this repository sits at gallery/evgui, then ../Ranger next to it.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const TASKS = JSON.parse(fs.readFileSync(path.join(HERE, "tasks.json"), "utf8"));
const DIRS = ["src", "theme", "demo", "web", "bench", "ios"];

const argv = process.argv.slice(2);
// Inside Ranger/gallery/evgui the checkout is two levels up.
const inside = fs.existsSync(path.join(REPO, "..", "..", "dist", "rgrc.js"));
let ranger = process.env.RANGER_DIR || (inside ? path.resolve(REPO, "..", "..") : path.resolve(REPO, "..", "Ranger"));
let overlay = true;
const names = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--ranger") ranger = path.resolve(argv[++i]);
  else if (argv[i] === "--no-overlay") overlay = false;
  else if (argv[i] === "--list") {
    for (const n of Object.keys(TASKS)) console.log(n);
    process.exit(0);
  } else names.push(argv[i]);
}

if (!names.length) {
  console.error("usage: node scripts/run.mjs [--ranger <dir>] [--no-overlay] <task> ... (--list shows tasks)");
  process.exit(2);
}
if (!fs.existsSync(path.join(ranger, "dist", "rgrc.js")) || !fs.existsSync(path.join(ranger, "gallery", "ui", "conformance"))) {
  console.error(`not a Ranger checkout: ${ranger} (pass --ranger <dir> or set RANGER_DIR)`);
  process.exit(2);
}

// Copy this repository to gallery/evgui/ in the Ranger checkout. Files the
// build generates there (bin/, bundle.js, generated*.js, dist/) are left alone.
function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}
const TARGET = path.join(ranger, "gallery", "evgui");
if (overlay && fs.realpathSync(REPO) !== (fs.existsSync(TARGET) && fs.realpathSync(TARGET))) {
  for (const dir of DIRS) copyTree(path.join(REPO, dir), path.join(TARGET, dir));
  // pkg:evg/... resolves through this, relative to gallery/evgui.
  fs.copyFileSync(path.join(REPO, "ranger.json"), path.join(TARGET, "ranger.json"));
}
fs.mkdirSync(path.join(TARGET, "bin"), { recursive: true });

// lib/evg (and gallery/componentengine) are not in Ranger's git: its
// `npm run deps` fetches them from the commits its ranger.json pins. It
// fetches nothing when they are already in place. An older checkout, which
// still tracks lib/evg, has no scripts/deps.mjs.
if (fs.existsSync(path.join(ranger, "scripts", "deps.mjs"))) {
  const r = spawnSync(process.execPath, [path.join(ranger, "scripts", "deps.mjs")], { cwd: ranger, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// `npm run <task>` inside a command becomes a call back into this runner, so a
// task defined here can call another; anything else stays an npm script of
// Ranger's.
const self = `node ${JSON.stringify(fileURLToPath(import.meta.url))} --ranger ${JSON.stringify(ranger)} --no-overlay`;
// EVGUI_PREBUILT names tasks already run for this checkout (scripts/gate.sh
// builds the demos once and sets it); a task that asks for one of them again
// skips it rather than recompiling all the demos before a one-second check.
const PREBUILT = new Set((process.env.EVGUI_PREBUILT || "").split(",").filter(Boolean));
function expand(cmd) {
  return cmd.replace(/npm run (--silent )?([\w:.-]+)( --silent)?/g, (m, a, name) =>
    PREBUILT.has(name) ? "true" : Object.hasOwn(TASKS, name) ? `${self} ${name}` : m,
  );
}

for (const name of names) {
  // A name that is not ours is one of Ranger's npm scripts.
  const cmd = Object.hasOwn(TASKS, name) ? expand(TASKS[name]) : `npm run --silent ${name}`;
  const r = spawnSync(cmd, { cwd: ranger, shell: true, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

#!/usr/bin/env node
/**
 * Run one or more EVGUI tasks inside a Ranger checkout.
 *
 *   node scripts/run.mjs [--ranger <dir>] [--no-overlay] <task> [<task> ...]
 *
 * The demos, the playground and the benches are Ranger source that expects to
 * sit at gallery/ui/{demo,web,bench} of a Ranger checkout: they import the
 * controllers from gallery/ui/src, the EVG library from lib/evg and are
 * compiled by Ranger's committed compiler (dist/rgrc.js). So every task runs
 * with the Ranger checkout as its working directory, after this repository's
 * demo/, web/ and bench/ have been copied into place there (skip that with
 * --no-overlay when you edit the copies inside Ranger directly).
 *
 * Tasks are listed in scripts/tasks.json — the npm scripts that left Ranger's
 * package.json with these directories. `npm run <name>` inside a task, and a task
 * name given here, resolve against that file first and against Ranger's own
 * package.json otherwise (ui:build, ui:conformance:install and the rest of
 * the controller library).
 *
 * --ranger defaults to $RANGER_DIR, then ../Ranger next to this repository.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const TASKS = JSON.parse(fs.readFileSync(path.join(HERE, "tasks.json"), "utf8"));
const DIRS = ["demo", "web", "bench"];

const argv = process.argv.slice(2);
let ranger = process.env.RANGER_DIR || path.resolve(REPO, "..", "Ranger");
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
if (!fs.existsSync(path.join(ranger, "dist", "rgrc.js")) || !fs.existsSync(path.join(ranger, "gallery", "ui", "src"))) {
  console.error(`not a Ranger checkout: ${ranger} (pass --ranger <dir> or set RANGER_DIR)`);
  process.exit(2);
}

// Copy demo/, web/ and bench/ over gallery/ui/ in the Ranger checkout. Files
// the build generates there (bundle.js, generated*.js, dist/) are left alone.
function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}
if (overlay && path.resolve(ranger, "gallery", "ui") !== REPO) {
  for (const dir of DIRS) copyTree(path.join(REPO, dir), path.join(ranger, "gallery", "ui", dir));
}

// `npm run <task>` inside a command becomes a call back into this runner, so a
// task defined here can call another; anything else stays an npm script of
// Ranger's.
const self = `node ${JSON.stringify(fileURLToPath(import.meta.url))} --ranger ${JSON.stringify(ranger)} --no-overlay`;
function expand(cmd) {
  return cmd.replace(/npm run (--silent )?([\w:.-]+)( --silent)?/g, (m, a, name) =>
    Object.hasOwn(TASKS, name) ? `${self} ${name}` : m,
  );
}

for (const name of names) {
  // A name that is not ours is one of Ranger's npm scripts.
  const cmd = Object.hasOwn(TASKS, name) ? expand(TASKS[name]) : `npm run --silent ${name}`;
  const r = spawnSync(cmd, { cwd: ranger, shell: true, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

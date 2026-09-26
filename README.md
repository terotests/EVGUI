# EVGUI

The EVG controller gallery, written in [Ranger](https://github.com/terotests/Ranger):
tree-literal demos (dashboard, forms, calendar, menus, tables, messages…)
painted by EVG's WebGL painter, and a playground that runs the same behaviour
spec through Ranger's controllers and real Radix components side by side.

Live page: <https://terotests.github.io/EVGUI/>

- `/demo/` — the demos (`demo/*Demo.rgr`, one stylesheet each, `main.js` wires them to the page)
- `/web/` — Radix vs Ranger, with the live behaviour trace
- `bench/` — the table bench and the runner-vs-browser timing

This repository used to be `gallery/ui/{demo,web,bench}` in Ranger. The
controllers themselves (`gallery/ui/src`), the theme, the kit and the
conformance harness stay in Ranger, because RealTrainer, Rave, Firesim, M-Files
and other Ranger apps are built from them.

**License: AGPL-3.0-or-later** (see `LICENSE-AGPL-3.0`).

## Building

The sources expect to sit at `gallery/ui/demo`, `gallery/ui/web` and
`gallery/ui/bench` inside a Ranger checkout: they use Ranger's committed
compiler (`dist/rgrc.js`), `lib/evg` and the controllers in `gallery/ui/src`.
`scripts/run.mjs` copies this repository's three directories into place and
runs a task there, with the Ranger checkout as the working directory.

```sh
git clone https://github.com/terotests/Ranger
git clone https://github.com/terotests/EVGUI
cd EVGUI
node scripts/run.mjs ui:conformance:install   # esbuild, playwright-core, Radix (once)
node scripts/run.mjs ui:pages:build           # -> ../Ranger/gallery/ui/web/dist
node scripts/run.mjs ui:web                   # build and serve locally
bash scripts/gate.sh                          # the demo suites
```

`--ranger <dir>` (or `RANGER_DIR`) points at a Ranger checkout other than
`../Ranger`. `node scripts/run.mjs --list` lists the tasks; they are the npm
scripts that left Ranger's `package.json` with these directories
(`scripts/tasks.json`). A name that is not in that list runs as one of
Ranger's own npm scripts (`ui:build`, `ui:test`, the conformance oracles…).

The copies in `Ranger/gallery/ui/{demo,web,bench}` are git-ignored in Ranger.
Edit here and re-run the task; if you edit the copies inside Ranger instead,
pass `--no-overlay` so they are not overwritten, and copy them back before
committing.

## CI and Pages

`.github/workflows/pages.yml` runs on every push and pull request: a sparse,
shallow checkout of Ranger (`compiler/`, `lib/`, `dist/`, `gallery/ui` and the
few gallery modules the dashboard imports — no `npm ci`), this repository
copied into it, the pages built and checked (`verify-out.mjs`,
`pages-smoke.mjs` in a real Chromium), then the demo suites (`scripts/gate.sh`).
Pushes to the default branch are deployed to GitHub Pages. The Ranger ref is
`RANGER_REF` in the workflow (`master`); a manual run can override it.

Pages must be set to deploy from GitHub Actions (Settings → Pages → Source).

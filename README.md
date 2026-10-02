# EVGUI

The EVG controller gallery, written in [Ranger](https://github.com/terotests/Ranger):
tree-literal demos (dashboard, forms, calendar, menus, tables, messages…)
painted by EVG's WebGL painter, and a playground that runs the same behaviour
spec through Ranger's controllers and real Radix components side by side.

Live page: <https://terotests.github.io/EVGUI/>

- `src/` — the controllers (MenuCtl, InputCtl, CalendarCtl, TableCtl…) the demos are built from
- `theme/` — the base stylesheet the playground and the renders use
- `demo/` — the demos (`demo/*Demo.rgr`, one stylesheet each; `main.js` wires them to the page), served at `/demo/`
- `web/` — Radix vs Ranger, with the live behaviour trace, served at `/web/`
- `bench/` — the table bench and the runner-vs-browser timing

This repository used to be `gallery/ui/{demo,web,bench}` in Ranger. `src/` and
`theme/` are copies of Ranger's `gallery/ui/src` and `gallery/ui/theme`, taken
at the move; the demos import these copies. Ranger keeps its own until the
apps built from them there (RealTrainer, Rave, Firesim, M-Files and others)
move over, so the two copies can drift. The conformance harness
(`gallery/ui/conformance`: the Radix reference host, the specs and the
oracles) stays in Ranger and is used from there.

**License: AGPL-3.0-or-later** (see `LICENSE-AGPL-3.0`).

## Building

The sources expect to sit at `gallery/evgui/` in a Ranger checkout: they use
Ranger's committed compiler (`dist/rgrc.js`), `lib/evg` (through
`ranger.json`) and `gallery/ui/conformance`. Clone this repository there,
like Erazer at `gallery/erazer`:

```sh
git clone https://github.com/terotests/Ranger
git clone https://github.com/terotests/EVGUI Ranger/gallery/evgui
cd Ranger/gallery/evgui
node scripts/run.mjs ui:conformance:install   # esbuild, playwright-core, Radix (once)
node scripts/run.mjs ui:pages:build           # -> web/dist
node scripts/run.mjs ui:web                   # build and serve locally
bash scripts/gate.sh                          # the demo suites
```

`scripts/run.mjs` runs a task with the Ranger checkout as the working
directory. `node scripts/run.mjs --list` lists the tasks; they are the npm
scripts that left Ranger's `package.json` with these directories
(`scripts/tasks.json`). A name that is not in that list runs as one of
Ranger's own npm scripts (`ui:conformance:install`, the conformance oracles…).

A clone somewhere else works too: `--ranger <dir>` (or `RANGER_DIR`, default
`../Ranger`) names the checkout, and `src/`, `theme/`, `demo/`, `web/`,
`bench/` and `ranger.json` are copied to its `gallery/evgui/` before each task
(`--no-overlay` skips the copy). `gallery/evgui/` is git-ignored in Ranger.

EVG is Ranger's `lib/evg`, which Ranger no longer tracks: it is
[terotests/evg](https://github.com/terotests/evg) at the commit Ranger's root
`ranger.json` pins, put in place by Ranger's `npm run deps`.
`scripts/run.mjs` runs that before the first task (it fetches nothing when
`lib/evg` is already right), so `ranger.json` here keeps
`"evg": { "path": "../../lib/evg" }` and gets the same EVG as the rest of
the gallery it imports.

## CI and Pages

`.github/workflows/pages.yml` runs on every push and pull request: a sparse,
shallow checkout of Ranger (`compiler/`, `lib/`, `dist/`,
`gallery/ui/conformance` and the few gallery modules the dashboard imports —
no `npm ci`), this repository checked out at `gallery/evgui` inside it, the pages built and checked (`verify-out.mjs`,
`pages-smoke.mjs` in a real Chromium), then the demo suites (`scripts/gate.sh`).
`ui:input:bench` (about thirteen minutes) runs in a parallel job that the
deploy does not wait for. Pushes to `main` are deployed to GitHub Pages. The Ranger ref is
`RANGER_REF` in the workflow (`master`); a manual run can override it.

Pages must be set to deploy from GitHub Actions (Settings → Pages → Source).

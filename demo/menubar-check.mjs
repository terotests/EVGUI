#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Menubar demo, checked in Node against the compiled demo.
//
// Three bars, each a MenubarCtl whose menus are MenuCtls: ReUI's File/Account
// (icons, shortcuts, a destructive Sign out), ReUI's View/Theme (checkbox and
// radio items) and Radix's File/Edit/View/Profiles (submenus, disabled rows).
// Semantics per the reference (menubar, menuitem triggers with aria-haspopup
// and aria-expanded, menu / menuitem / menuitemcheckbox / menuitemradio /
// separator / group); then behaviour — open and close by click, switching by
// hover, the arrows along the bar and inside a menu, the keyboard open onto
// the first item, Home/End, typeahead, submenus, checkbox toggling, radio
// selection, Escape handing the focus back to the trigger; then the look that
// carries meaning — the destructive red, shortcuts right-aligned, the tick in
// the indicator column — and that nothing overlaps or leaves the page at 900
// and at a phone's 358.
//
//   node gallery/evgui/demo/menubar-check.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/MenubarDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "menubar.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

const YES = 2;
const NO = 1;

const fresh = (w) => {
  const d = new M.MenubarDemo();
  d.init(CSS);
  if (w) { d.pageW = w; d.dirty = true; }
  d.displayListJson();
  return d;
};
const tree = (d) => {
  const t = JSON.parse(d.a11yTreeJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const kids = (t, pid) => t.nodes.filter((n) => n.p === pid);
// A menu's rows in order, groups flattened.
const rowsOf = (t, mid) => kids(t, mid).flatMap((n) => (n.role === "group" ? kids(t, n.id) : [n]));
const centre = (n) => [n.b[0] + n.b[2] / 2, n.b[1] + n.b[3] / 2];
// A click is a pointer that got there first: hover, then press.
const clickAt = (d, x, y) => {
  const hit = d.hitAt(x, y);
  d.setHover(hit);
  d.press(hit);
  d.displayListJson();
  return hit;
};
const click = (d, id) => {
  const n = tree(d).byId.get(id);
  if (!n) return "(no " + id + ")";
  return clickAt(d, ...centre(n));
};
const hover = (d, id) => {
  const n = tree(d).byId.get(id);
  const hit = n ? d.hitAt(...centre(n)) : id;
  d.setHover(hit);
  d.displayListJson();
  return hit;
};
const key = (d, k) => {
  const r = d.key(k);
  d.displayListJson();
  return r;
};
const open = (d) => d.summary().split("|")[0].split(";").slice(0, 3).join(";");
const byId = (e, id) => {
  if (e.id === id) return e;
  for (const k of e.children) {
    const f = byId(k, id);
    if (f) return f;
  }
  return null;
};
const all = (e, pred, out = []) => {
  if (pred(e)) out.push(e);
  for (const k of e.children) all(k, pred, out);
  return out;
};
const rect = (e) => [e.calculatedX, e.calculatedY, e.calculatedWidth, e.calculatedHeight];
const hasClass = (e, c) => (" " + e.className + " ").includes(" " + c + " ");

console.log("--- semantics ---");
{
  const d = fresh();
  const t = tree(d);
  const BARS = [
    ["mb1", "Menubar with icons", ["file", "account"], ["File", "Account"]],
    ["mb2", "Menubar with checkbox and radio items", ["view", "theme"], ["View", "Theme"]],
    ["mb3", "Main", ["file", "edit", "view", "profiles"], ["File", "Edit", "View", "Profiles"]],
  ];
  for (const [bid, name, menus, labels] of BARS) {
    const b = t.byId.get(bid);
    ok(`${bid}: role menubar, named "${name}"`, b && b.role === "menubar" && b.name === name, b);
    const trig = kids(t, bid);
    ok(`${bid}: its triggers, in order`, trig.map((n) => n.id).join() === menus.map((m) => `${bid}-${m}-trigger`).join(),
      trig.map((n) => n.id));
    ok(`${bid}: triggers are menuitems named ${labels.join("/")}`, trig.every((n, i) => n.role === "menuitem" && n.name === labels[i]),
      trig.map((n) => [n.role, n.name]));
    ok(`${bid}: aria-haspopup=menu, aria-expanded=false, focusable`,
      trig.every((n) => n.haspopup === "menu" && n.expanded === NO && n.focusable), trig);
  }
  ok("no menu is open at rest", !t.nodes.some((n) => n.role === "menu"));
  ok("the tree lints clean at rest", d.a11yLint().length === 0, d.a11yLint());
  ok("the stylesheet parses clean", d.styleErrorCount() === 0);

  // Pattern A: File and Account.
  click(d, "mb1-file-trigger");
  let t2 = tree(d);
  const trig = t2.byId.get("mb1-file-trigger");
  ok("File: aria-expanded=true and aria-controls its menu", trig.expanded === YES && trig.controls === "mb1-file-content", trig);
  const fm = t2.byId.get("mb1-file-content");
  ok("File: a role=menu named File, vertical", fm && fm.role === "menu" && fm.name === "File" && fm.orientation === "vertical", fm);
  const fr = rowsOf(t2, "mb1-file-content");
  ok("File: New File, Open Folder, a separator, Save",
    fr.map((n) => n.role + ":" + (n.name || "")).join() === "menuitem:New File ⌘N,menuitem:Open Folder,separator:,menuitem:Save ⌘S",
    fr.map((n) => [n.role, n.name]));
  ok("File: the tree lints clean", d.a11yLint().length === 0, d.a11yLint());
  // Hovering Account switches to it, and a click on the open trigger then
  // closes it (Radix's), so: close File, then open Account.
  click(d, "mb1-file-trigger");
  click(d, "mb1-account-trigger");
  t2 = tree(d);
  const ak = kids(t2, "mb1-account-content");
  ok("Account: a group holding Profile, a separator, Sign out",
    ak.map((n) => n.role).join() === "group,separator,menuitem" && kids(t2, ak[0].id).map((n) => n.name).join() === "Profile" &&
      ak[2].name === "Sign out", ak.map((n) => [n.role, n.name]));

  // Pattern B: View (checkboxes) and Theme (a radio group).
  const d2 = fresh();
  click(d2, "mb2-view-trigger");
  let t3 = tree(d2);
  const vr = rowsOf(t3, "mb2-view-content");
  ok("View: two menuitemcheckbox rows", vr.length === 2 && vr.every((n) => n.role === "menuitemcheckbox"), vr);
  ok("View: Bookmarks unchecked, Full URLs checked",
    vr[0].name === "Always Show Bookmarks Bar" && vr[0].checked === NO && vr[1].name === "Always Show Full URLs" && vr[1].checked === YES,
    vr.map((n) => [n.name, n.checked]));
  click(d2, "mb2-view-trigger");
  click(d2, "mb2-theme-trigger");
  t3 = tree(d2);
  const tg = kids(t3, "mb2-theme-content");
  ok("Theme: one group of three menuitemradio rows", tg.length === 1 && tg[0].role === "group" &&
    kids(t3, tg[0].id).every((n) => n.role === "menuitemradio") && kids(t3, tg[0].id).length === 3, tg);
  const tr = kids(t3, tg[0].id);
  ok("Theme: Light / Dark / System, System checked",
    tr.map((n) => n.name + ":" + n.checked).join() === `Light:${NO},Dark:${NO},System:${YES}`, tr.map((n) => [n.name, n.checked]));
  ok("Theme: the tree lints clean", d2.a11yLint().length === 0, d2.a11yLint());

  // The Radix example: disabled rows and a sub-trigger.
  const d3 = fresh();
  click(d3, "mb3-file-trigger");
  const t4 = tree(d3);
  const inc = t4.byId.get("mb3-file-item-incognito");
  ok("Radix File: New Incognito Window disabled", inc && inc.disabled === true, inc);
  const share = t4.byId.get("mb3-file-item-share");
  ok("Radix File: Share is a sub-trigger (haspopup menu, collapsed)", share && share.haspopup === "menu" && share.expanded === NO, share);
}

console.log("--- the pointer ---");
{
  const d = fresh();
  ok("a hover with nothing open opens nothing", (hover(d, "mb1-account-trigger"), open(d) === "mb1=;mb2=;mb3="), open(d));
  click(d, "mb1-file-trigger");
  ok("a click on File opens it", open(d) === "mb1=file;mb2=;mb3=", open(d));
  ok("and the focus is on the menu, not a row (a pointer open)", d.focused === "mb1-file-content", d.focused);
  hover(d, "mb1-account-trigger");
  ok("hovering Account while File is open switches to Account", open(d) === "mb1=account;mb2=;mb3=", open(d));
  hover(d, "mb1-account-item-profile");
  ok("hovering a row focuses it", d.focused === "mb1-account-item-profile", d.focused);
  hover(d, "mb1-account-content");
  ok("leaving the rows hands the focus back to the menu", d.focused === "mb1-account-content", d.focused);
  click(d, "mb1-account-trigger");
  ok("a click on the open trigger closes it", open(d) === "mb1=;mb2=;mb3=", open(d));
  click(d, "mb1-file-trigger");
  clickAt(d, 3, 3);
  ok("a click outside closes it", open(d) === "mb1=;mb2=;mb3=", open(d));
  click(d, "mb1-file-trigger");
  click(d, "mb2-view-trigger");
  ok("a click on another bar closes this one and opens that", open(d) === "mb1=;mb2=view;mb3=", open(d));
  click(d, "mb2-view-trigger");
  click(d, "mb1-file-trigger");
  click(d, "mb1-file-item-save");
  ok("choosing a row closes the menu, focus back on the trigger", open(d) === "mb1=;mb2=;mb3=" && d.focused === "mb1-file-trigger",
    [open(d), d.focused]);
  // A submenu opens after the pointer rests on its row.
  click(d, "mb3-file-trigger");
  hover(d, "mb3-file-item-share");
  ok("resting on Share: not open at once", !tree(d).byId.has("mb3-file-item-share-content"));
  d.tick(60); d.tick(60); d.displayListJson();
  ok("… and open after the hover delay, beside its row", (() => {
    const t = tree(d);
    const s = t.byId.get("mb3-file-item-share-content");
    const r = t.byId.get("mb3-file-item-share");
    return s && s.b[0] >= r.b[0] + r.b[2] - 1 && t.byId.get("mb3-file-item-share").expanded === YES;
  })());
  click(d, "mb3-file-item-share-item-notes");
  ok("choosing a submenu row closes everything", open(d) === "mb1=;mb2=;mb3=" && d.focused === "mb3-file-trigger", [open(d), d.focused]);
  // Disabled rows do nothing.
  click(d, "mb3-file-trigger");
  click(d, "mb3-file-item-incognito");
  ok("a disabled row does not close the menu", open(d) === "mb1=;mb2=;mb3=file", open(d));
}

console.log("--- the keyboard ---");
{
  const d = fresh();
  d.setFocus("mb3-file-trigger");
  key(d, "ArrowRight");
  ok("ArrowRight on a closed bar moves to Edit, opening nothing", d.focused === "mb3-edit-trigger" && open(d) === "mb1=;mb2=;mb3=",
    [d.focused, open(d)]);
  key(d, "End");
  ok("End goes to the last trigger", d.focused === "mb3-profiles-trigger", d.focused);
  key(d, "ArrowRight");
  ok("ArrowRight wraps to the first (Radix's loop)", d.focused === "mb3-file-trigger", d.focused);
  key(d, "ArrowLeft");
  ok("ArrowLeft wraps to the last", d.focused === "mb3-profiles-trigger", d.focused);
  key(d, "Home");
  ok("Home goes to the first", d.focused === "mb3-file-trigger", d.focused);
  ok("Enter is taken", key(d, "Enter") === true);
  ok("Enter opens File onto its first item", open(d) === "mb1=;mb2=;mb3=file" && d.focused === "mb3-file-item-newtab",
    [open(d), d.focused]);
  key(d, "ArrowDown");
  key(d, "ArrowDown");
  ok("ArrowDown skips the disabled row: New Window, then Share", d.focused === "mb3-file-item-share", d.focused);
  key(d, "ArrowDown");
  ok("… and the separator: Print…", d.focused === "mb3-file-item-print", d.focused);
  key(d, "ArrowDown");
  ok("ArrowDown on the last row stays there (Radix's menus do not loop)", d.focused === "mb3-file-item-print", d.focused);
  key(d, "Home");
  ok("Home: the first row", d.focused === "mb3-file-item-newtab", d.focused);
  key(d, "End");
  ok("End: the last row", d.focused === "mb3-file-item-print", d.focused);
  key(d, "s");
  ok("typeahead 's' finds Share", d.focused === "mb3-file-item-share", d.focused);
  key(d, "ArrowRight");
  ok("ArrowRight on Share opens its submenu onto Email Link",
    d.focused === "mb3-file-item-share-item-email" && tree(d).byId.has("mb3-file-item-share-content"), d.focused);
  key(d, "ArrowDown");
  ok("ArrowDown walks the submenu", d.focused === "mb3-file-item-share-item-messages", d.focused);
  key(d, "ArrowLeft");
  ok("ArrowLeft closes the submenu, back on Share", d.focused === "mb3-file-item-share" && !tree(d).byId.has("mb3-file-item-share-content"),
    d.focused);
  key(d, "ArrowRight");
  key(d, "ArrowRight");
  ok("ArrowRight on a submenu's row moves the bar to Edit", open(d) === "mb1=;mb2=;mb3=edit" && d.focused === "mb3-edit-content",
    [open(d), d.focused]);
  key(d, "ArrowLeft");
  ok("ArrowLeft in a menu moves to the previous menu", open(d) === "mb1=;mb2=;mb3=file", open(d));
  key(d, "ArrowLeft");
  ok("… and wraps from the first to the last", open(d) === "mb1=;mb2=;mb3=profiles", open(d));
  key(d, "ArrowDown");
  ok("ArrowDown from the menu surface: its first row", d.focused === "mb3-profiles-item-andy", d.focused);
  key(d, "Escape");
  ok("Escape closes, and the focus goes back to the trigger", open(d) === "mb1=;mb2=;mb3=" && d.focused === "mb3-profiles-trigger",
    [open(d), d.focused]);
  ok("Escape with nothing open is left to the page", key(d, "Escape") === false);
  key(d, "ArrowDown");
  ok("ArrowDown on a trigger opens onto the first item", open(d) === "mb1=;mb2=;mb3=profiles" && d.focused === "mb3-profiles-item-andy",
    [open(d), d.focused]);
  key(d, "Escape");
  key(d, " ");
  ok("Space opens too", open(d) === "mb1=;mb2=;mb3=profiles", open(d));
  ok("Tab is left to the page", key(d, "Tab") === false);
}

console.log("--- checkbox and radio items ---");
{
  const d = fresh();
  const checks = () => d.summary().split("|")[0].split(";").slice(3).join(";");
  ok("starts: bookmarks off, URLs on, theme system", checks() === "bookmarks=0;urls=1;theme=system", checks());
  click(d, "mb2-view-trigger");
  click(d, "mb2-view-item-bookmarks");
  ok("clicking Bookmarks checks it", checks() === "bookmarks=1;urls=1;theme=system", checks());
  ok("… and closes the menu (Radix's default), focus on View", open(d) === "mb1=;mb2=;mb3=" && d.focused === "mb2-view-trigger",
    [open(d), d.focused]);
  click(d, "mb2-view-trigger");
  ok("reopened, it says so: aria-checked true", tree(d).byId.get("mb2-view-item-bookmarks").checked === YES);
  ok("… and draws the tick in the indicator column", (() => {
    const row = byId(d.root, "mb2-view-item-bookmarks");
    const ind = row.children.find((k) => hasClass(k, "mb-indicator"));
    const lab = row.children.find((k) => hasClass(k, "mb-label"));
    return ind && ind.alt === "✓" && ind.children.length === 1 && ind.calculatedX < lab.calculatedX &&
      Math.abs(lab.calculatedX - row.calculatedX - 32) < 1.5;
  })());
  // By keyboard: Full URLs off.
  key(d, "ArrowDown");
  key(d, "ArrowDown");
  ok("the arrows reach Full URLs", d.focused === "mb2-view-item-urls", d.focused);
  key(d, " ");
  ok("Space toggles it off and closes", checks() === "bookmarks=1;urls=0;theme=system" && open(d) === "mb1=;mb2=;mb3=", checks());
  click(d, "mb2-theme-trigger");
  click(d, "mb2-theme-item-light");
  ok("choosing Light selects it", checks() === "bookmarks=1;urls=0;theme=light", checks());
  click(d, "mb2-theme-trigger");
  const tr = rowsOf(tree(d), "mb2-theme-content");
  ok("exactly one radio checked, Light", tr.filter((n) => n.checked === YES).map((n) => n.name).join() === "Light",
    tr.map((n) => [n.name, n.checked]));
  key(d, "End");
  key(d, "Enter");
  ok("End + Enter selects System again", checks() === "bookmarks=1;urls=0;theme=system", checks());
  // The Radix example's radio mark is a dot, its checkbox a tick.
  click(d, "mb3-profiles-trigger");
  const luis = byId(d.root, "mb3-profiles-item-luis");
  ok("Radix Profiles: Luis carries a dot", luis.children[0].alt === "●", luis.children[0].alt);
}

console.log("--- the look ---");
{
  const d = fresh();
  click(d, "mb1-account-trigger");
  const dl = JSON.parse(d.displayListJson());
  const text = (s) => dl.cmds.find((c) => c.text === s);
  const so = text("Sign out");
  ok("Sign out is drawn red (#e7000b)", so && so.c[0] === 231 && so.c[1] === 0 && so.c[2] === 11, so && so.c);
  ok("Profile is not", text("Profile") && text("Profile").c[0] === 10, text("Profile") && text("Profile").c);
  const signRow = byId(d.root, "mb1-account-item-signout");
  ok("the Sign out row is the destructive variant, its icon too",
    hasClass(signRow, "mb-item-destructive") && signRow.children.some((k) => hasClass(k, "mb-icon-destructive")));
  hover(d, "mb1-account-item-signout");
  const dl2 = JSON.parse(d.displayListJson());
  const r = rect(signRow);
  const bg = dl2.cmds.find((c) => c.k === 0 && Math.abs(c.x - r[0]) < 0.5 && Math.abs(c.y - r[1]) < 0.5 && Math.abs(c.w - r[2]) < 0.5);
  ok("its highlight is red-tinted", !!bg && bg.c[0] > bg.c[1] + 10 && bg.c[0] > 240, bg && bg.c);
  // Every open menu's icons are 16px and the shortcuts share one right edge,
  // 8px in from the row's.
  for (const [trig, name] of [["mb1-file-trigger", "Pattern A File"], ["mb3-file-trigger", "Radix File"], ["mb3-edit-trigger", "Radix Edit"]]) {
    const e = fresh();
    click(e, trig);
    const sc = all(e.root, (x) => hasClass(x, "mb-shortcut"));
    const rights = sc.map((s) => {
      const row = all(e.root, (x) => x.children.includes(s))[0];
      return [s.calculatedX + s.calculatedWidth, row.calculatedX + row.calculatedWidth - 8];
    });
    ok(`${name}: shortcuts right-aligned, one edge`, sc.length >= 2 && rights.every(([a, b]) => Math.abs(a - b) < 0.6) &&
      rights.every(([a]) => Math.abs(a - rights[0][0]) < 0.6), rights);
  }
  const e = fresh();
  click(e, "mb1-file-trigger");
  const icons = all(e.root, (x) => hasClass(x, "mb-icon") && x.svgPath);
  ok("Pattern A File: three 16px Lucide icons", icons.length === 3 && icons.every((i) => i.calculatedWidth === 16 && i.calculatedHeight === 16),
    icons.map(rect));
  const trigR = byId(e.root, "mb1-file-trigger");
  const cont = byId(e.root, "mb1-file-content");
  ok("the menu opens 8px under its trigger and 4px left of it",
    Math.abs(cont.calculatedY - (trigR.calculatedY + trigR.calculatedHeight) - 8) < 0.6 && Math.abs(cont.calculatedX - (trigR.calculatedX - 4)) < 0.6,
    [rect(trigR), rect(cont)]);
  const rows = all(cont, (x) => hasClass(x, "mb-item"));
  ok("rows are 28px tall", rows.every((x) => Math.abs(x.calculatedHeight - 28) < 0.6), rows.map((x) => x.calculatedHeight));
  const bar = byId(e.root, "mb1");
  ok("the bar is 32px tall", Math.abs(bar.calculatedHeight - 32) < 0.6, bar.calculatedHeight);
}

console.log("--- nothing overlaps, nothing leaves the page ---");
{
  const STATES = [
    ["mb1-file-trigger"], ["mb1-account-trigger"], ["mb2-view-trigger"], ["mb2-theme-trigger"],
    ["mb3-file-trigger", "share"], ["mb3-edit-trigger", "find"], ["mb3-view-trigger"], ["mb3-profiles-trigger"],
  ];
  const overlap = (a, b) => {
    const ox = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
    const oy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
    return ox > 0.5 && oy > 0.5;
  };
  for (const w of [900, 358]) {
    const rest = fresh(w);
    // The cards, the bars and each bar's triggers: side by side, never on top.
    const cards = all(rest.root, (x) => hasClass(x, "mb-card")).map(rect);
    ok(`${w}: the cards do not overlap`, cards.every((a, i) => cards.every((b, j) => i === j || !overlap(a, b))), cards);
    ok(`${w}: every card inside the page`, cards.every((c) => c[0] >= 0 && c[0] + c[2] <= w + 0.5), cards);
    for (const bid of ["mb1", "mb2", "mb3"]) {
      const b = byId(rest.root, bid);
      const st = byId(rest.root, "mb-card-" + bid.slice(2) + "-stage");
      const trs = all(b, (x) => hasClass(x, "mb-trigger")).map(rect);
      ok(`${w}: ${bid} fits its card, one row of triggers`,
        b.calculatedX >= st.calculatedX && b.calculatedX + b.calculatedWidth <= st.calculatedX + st.calculatedWidth &&
          trs.every((t) => Math.abs(t[1] - trs[0][1]) < 0.5) && trs.every((a, i) => trs.every((c, j) => i === j || !overlap(a, c))),
        [rect(b), rect(st), trs]);
    }
    for (const [trig, sub] of STATES) {
      const d = fresh(w);
      click(d, trig);
      const bid = trig.split("-")[0];
      const menu = trig.replace("-trigger", "");
      if (sub) {
        d.key("ArrowDown");
        d.displayListJson();
        // Walk to the sub-trigger and open it by name.
        for (let i = 0; i < 8 && d.focused !== `${menu}-item-${sub}`; i++) { d.key("ArrowDown"); d.displayListJson(); }
        d.key("ArrowRight");
        d.displayListJson();
      }
      const surfaces = all(d.root, (x) => hasClass(x, "mb-content"));
      const st = byId(d.root, "mb-card-" + bid.slice(2) + "-stage");
      const inPage = surfaces.every((s) => s.calculatedX >= -0.5 && s.calculatedX + s.calculatedWidth <= w + 0.5);
      const inStage = surfaces.every((s) => s.calculatedY >= st.calculatedY && s.calculatedY + s.calculatedHeight <= st.calculatedY + st.calculatedHeight + 0.5);
      ok(`${w}: ${menu}${sub ? " + " + sub : ""} — ${surfaces.length} surface(s) inside the page and their card`, inPage && inStage &&
        surfaces.length === (sub ? 2 : 1), surfaces.map(rect).concat([rect(st)]));
      // Inside every row: indicator, icon, label and shortcut side by side.
      const rows = all(d.root, (x) => hasClass(x, "mb-item"));
      const bad = [];
      for (const r of rows) {
        const rr = rect(r);
        const parts = r.children.filter((k) => !hasClass(k, "mb-content")).map(rect);
        for (const p of parts) if (p[0] < rr[0] - 0.5 || p[0] + p[2] > rr[0] + rr[2] + 0.5) bad.push([r.id, "outside", p, rr]);
        parts.forEach((a, i) => parts.forEach((b, j) => { if (i < j && overlap(a, b)) bad.push([r.id, a, b]); }));
      }
      // Rows of one surface stack without overlapping.
      for (const s of surfaces) {
        // This surface's own rows: not the ones in a submenu inside it.
        const own = [];
        const walk = (e) => {
          for (const k of e.children) {
            if (hasClass(k, "mb-content")) continue;
            if (hasClass(k, "mb-item")) own.push(rect(k));
            walk(k);
          }
        };
        walk(s);
        own.forEach((a, i) => own.forEach((b, j) => { if (i < j && overlap(a, b)) bad.push(["rows", a, b]); }));
      }
      ok(`${w}: ${menu}${sub ? " + " + sub : ""} — rows and their parts do not overlap`, bad.length === 0, bad.slice(0, 3));
    }
  }
}

console.log("--- the static API (Ranger's tree-literal test, the audit) ---");
{
  const checked = ["Always Show Full URLs"];
  const t = JSON.parse(M.MenubarDemo.a11yJson(CSS, checked, "Luis", "File", true, false, 1, ""));
  const by = new Map(t.nodes.map((n) => [n.id, n]));
  ok("page(): the first version's ids", by.get("menubar").role === "menubar" && by.get("trigger-File").expanded === YES &&
    by.get("row-New Tab").name === "New Tab ⌘ T" && by.get("menu-file-content").role === "menu" && by.has("row-Notes"));
  ok("page(): lints clean", M.MenubarDemo.a11yProblems(CSS, checked, "Luis", "File", true, false).length === 0);
  const top = JSON.parse(M.MenubarDemo.a11yJson(CSS, checked, "Luis", "File", true, true, 1, "")).nodes;
  const b2 = new Map(top.map((n) => [n.id, n]));
  ok("page(): at the bottom edge the menu opens upwards", b2.get("menu-file-content").b[1] < b2.get("trigger-File").b[1]);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) {
  console.log("RESULT FAIL");
  process.exit(1);
}
console.log("RESULT OK");

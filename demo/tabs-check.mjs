#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Tabs demo, checked in Node against the compiled demo.
//
// `TabsCtl`'s keyboard and activation are measured against
// @radix-ui/react-tabs by the conformance specs (tabs_pointer, tabs_arrows,
// tabs_home_end). This file checks what those cannot see: that the demo's own
// tree says the same thing to a reader (tablist / tab / tabpanel, selected,
// controls, labelledby), that the pill is drawn where and how shadcn draws it,
// that each tab shows its own card, and that the fields and Save work.
//
//   node gallery/evgui/demo/tabs-check.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/TabsDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "tabs.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

const fresh = () => { const d = new M.TabsDemo(); d.init(CSS); d.displayListJson(); return d; };
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const cmds = (d) => JSON.parse(d.displayListJson()).cmds;
const centre = (n) => [n.b[0] + n.b[2] / 2, n.b[1] + n.b[3] / 2];
// Press what is under a node's centre, the way the page does: hit test first.
const click = (d, id) => {
  const n = tree(d).byId.get(id);
  const [x, y] = centre(n);
  const hit = d.hitId(x, y);
  d.beginSelection(hit, x, false);
  d.endSelection();
  d.displayListJson();
  return hit;
};
const texts = (d, box) => cmds(d).filter((c) => c.k === 3 && c.x >= box[0] - 1 && c.x <= box[0] + box[2] &&
  c.y >= box[1] - 1 && c.y <= box[1] + box[3]).map((c) => c.text);

console.log("--- roles and relations ---");
{
  const d = fresh();
  ok("no style errors", d.styleErrorCount() === 0, d.styleErrorCount());
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
  const t = tree(d);
  const list = t.byId.get("tb-list");
  ok("tablist, named, horizontal", list && list.role === "tablist" && list.name === "Account settings" && list.orientation === "horizontal", list);
  const tabs = t.nodes.filter((n) => n.p === "tb-list");
  ok("two tabs in it, role tab", tabs.length === 2 && tabs.every((n) => n.role === "tab"), tabs.map((n) => n.role));
  ok("Account is selected, Password is not", tabs[0].selected === true && !tabs[1].selected, tabs.map((n) => n.selected));
  ok("each tab controls its own panel", tabs[0].controls === "tb-panel-account" && tabs[1].controls === "tb-panel-password",
    tabs.map((n) => n.controls));
  const panels = t.nodes.filter((n) => n.role === "tabpanel" && n.id.startsWith("tb-"));
  ok("only the active panel is in the tree", panels.length === 1 && panels[0].id === "tb-panel-account", panels.map((n) => n.id));
  ok("the panel is labelled by its tab", panels[0].labelledby === "tb-tab-account" && panels[0].name === "Account", panels[0]);
  ok("the panel is not itself a tab stop", !panels[0].focusable);
  const vlist = t.byId.get("tv-list");
  ok("the second example is a vertical tablist", vlist && vlist.orientation === "vertical", vlist);
}

console.log("--- the pill ---");
{
  const d = fresh();
  const t = tree(d);
  const track = t.byId.get("tb-list").b;
  const on = t.byId.get("tb-tab-account").b;
  const off = t.byId.get("tb-tab-password").b;
  const fill = (b) => cmds(d).find((c) => c.k === 0 && Math.abs(c.x - b[0]) < 0.5 && Math.abs(c.y - b[1]) < 0.5 &&
    Math.abs(c.w - b[2]) < 0.5 && Math.abs(c.h - b[3]) < 0.5);
  const trackFill = fill(track);
  const onFill = fill(on);
  const offFill = fill(off);
  ok("the track is muted grey", trackFill && trackFill.c.slice(0, 3).join() === "244,244,245", trackFill && trackFill.c);
  ok("the active tab is white", onFill && onFill.c.slice(0, 3).join() === "255,255,255", onFill && onFill.c);
  ok("and raised: it carries a shadow", onFill && onFill.sh && onFill.sh.c[3] > 0 && onFill.sh.blur > 0, onFill && onFill.sh);
  ok("the inactive tab is the track's colour, flat", offFill && offFill.c.slice(0, 3).join() === "244,244,245" && !offFill.sh, offFill);
  const inside = (b) => b[0] >= track[0] + 2 && b[1] >= track[1] + 2 &&
    b[0] + b[2] <= track[0] + track[2] - 2 && b[1] + b[3] <= track[1] + track[3] - 2;
  ok("both pills sit inside the track, inset", inside(on) && inside(off), { track, on, off });
  ok("the two tabs share the track equally", Math.abs(on[2] - off[2]) < 1 && on[1] === off[1], [on, off]);
  const ink = (label) => cmds(d).find((c) => c.k === 3 && c.text === label && c.y < track[1] + track[3]);
  ok("active label dark, inactive muted", ink("Account").c.slice(0, 3).join() === "9,9,11" &&
    ink("Password").c.slice(0, 3).join() === "113,113,122", [ink("Account").c, ink("Password").c]);
  const card = t.byId.get("tb-panel-account").b;
  ok("the card is under the strip, as wide as it", card[1] > track[1] + track[3] && Math.abs(card[2] - track[2]) < 1, { track, card });
}

console.log("--- panel content per tab ---");
{
  const d = fresh();
  let t = tree(d);
  const acc = t.byId.get("tb-panel-account").b;
  const shown = texts(d, acc);
  for (const s of ["Account", "Update your account information.", "Name", "Sarah Johnson", "Username", "@sarahj", "Save changes"]) {
    ok(`Account shows "${s}"`, shown.includes(s), shown);
  }
  ok("Account's fields are textboxes with their values", t.byId.get("tb-name").role === "textbox" &&
    t.byId.get("tb-name").value === "Sarah Johnson" && t.byId.get("tb-username").value === "@sarahj");
  const hit = click(d, "tb-tab-password");
  ok("a click on the Password tab hits it", hit === "tb-tab-password", hit);
  t = tree(d);
  ok("…and selects it", t.byId.get("tb-tab-password").selected === true && !t.byId.get("tb-tab-account").selected);
  ok("…and focuses it", d.focused === "tb-tab-password", d.focused);
  ok("the panel swapped", t.byId.has("tb-panel-password") && !t.byId.has("tb-panel-account"));
  const pw = texts(d, t.byId.get("tb-panel-password").b);
  for (const s of ["Password", "Change your password here. After saving, you'll be logged out.", "Current password", "New password", "Save password"]) {
    // A long line wraps into two runs; what is drawn is the runs in order.
    ok(`Password shows "${s}"`, pw.includes(s) || pw.join(" ").includes(s), pw);
  }
  ok("Password's fields are textboxes", t.byId.get("tb-current").role === "textbox" && t.byId.get("tb-new").role === "textbox");
  ok("and password kind", JSON.parse(d.fieldStateJson("tb-current")).kind === "password");
  click(d, "tb-current");
  d.type("s"); d.type("3"); d.type("c");
  t = tree(d);
  const drawn = texts(d, t.byId.get("tb-current").b);
  ok("a password is drawn as bullets", drawn.includes("•••") && !drawn.includes("s3c"), drawn);
  ok("and the tree does not carry it", !t.byId.get("tb-current").value, t.byId.get("tb-current").value);
  ok("the model holds it", JSON.parse(d.fieldStateJson("tb-current")).value === "s3c");
}

console.log("--- the keyboard on the strip (automatic activation) ---");
{
  const d = fresh();
  d.setFocus("tb-tab-account");
  const sel = () => tree(d).nodes.filter((n) => n.p === "tb-list" && n.selected).map((n) => n.id).join();
  d.key("ArrowRight"); d.displayListJson();
  ok("ArrowRight moves focus AND selection", d.focused === "tb-tab-password" && sel() === "tb-tab-password", [d.focused, sel()]);
  d.key("ArrowRight"); d.displayListJson();
  ok("ArrowRight wraps", d.focused === "tb-tab-account" && sel() === "tb-tab-account", [d.focused, sel()]);
  d.key("ArrowLeft"); d.displayListJson();
  ok("ArrowLeft wraps back", d.focused === "tb-tab-password" && sel() === "tb-tab-password", [d.focused, sel()]);
  d.key("Home"); d.displayListJson();
  ok("Home: the first tab", d.focused === "tb-tab-account" && sel() === "tb-tab-account", [d.focused, sel()]);
  d.key("End"); d.displayListJson();
  ok("End: the last tab", d.focused === "tb-tab-password" && sel() === "tb-tab-password", [d.focused, sel()]);
  const took = d.key("ArrowDown");
  ok("ArrowDown does nothing in a horizontal list (Radix)", !took && d.focused === "tb-tab-password" && sel() === "tb-tab-password",
    [took, d.focused, sel()]);
  ok("the panel followed the keys", tree(d).byId.has("tb-panel-password"));

  // The vertical example: the other arrow pair.
  d.setFocus("tv-tab-overview");
  d.key("ArrowDown");
  ok("vertical: ArrowDown moves", d.focused === "tv-tab-activity" && tree(d).byId.get("tv-tab-activity").selected, d.focused);
  const took2 = d.key("ArrowRight");
  ok("vertical: ArrowRight does nothing", !took2 && d.focused === "tv-tab-activity", [took2, d.focused]);
  d.key("End");
  ok("vertical: End", d.focused === "tv-tab-settings" && tree(d).byId.has("tv-panel-settings"), d.focused);
}

console.log("--- typing into a field ---");
{
  const d = fresh();
  const t = tree(d);
  const box = t.byId.get("tb-name").b;
  // Click just after "Sarah" (index 5), measured by the demo's own geometry.
  const x = d.pageXOf("tb-name", 5);
  const hit = d.hitId(x, box[1] + box[3] / 2);
  d.beginSelection(hit, x, false); d.endSelection();
  let st = JSON.parse(d.fieldStateJson("tb-name"));
  ok("a click puts the caret between the characters", d.focusedField() === "tb-name" && st.selStart === 5 && st.selEnd === 5, [hit, st]);
  d.type("!");
  st = JSON.parse(d.fieldStateJson("tb-name"));
  ok("typing inserts at the caret", st.value === "Sarah! Johnson" && st.selStart === 6, st);
  d.keyWith("Backspace", false, false);
  d.keyWith("End", false, false);
  d.keyWith("ArrowLeft", true, false);
  st = JSON.parse(d.fieldStateJson("tb-name"));
  ok("Backspace, End, Shift+ArrowLeft", st.value === "Sarah Johnson" && st.selStart === 12 && st.selEnd === 13, st);
  ok("a selection draws a band and the focused box a caret", flatIds(d).includes("band") && flatIds(d).includes("caret"));
  // The platform session: the browser edits, the demo takes the result.
  d.applyEdit("tb-name", "Sarah J.", 8, 8);
  ok("an edit from the text session lands in the field", tree(d).byId.get("tb-name").value === "Sarah J.");
  ok("the session reports the box it edits", JSON.parse(d.fieldStateJson("tb-name")).box.w === Math.round(box[2]) ||
    Math.abs(JSON.parse(d.fieldStateJson("tb-name")).box.w - box[2]) <= 1, JSON.parse(d.fieldStateJson("tb-name")).box);
  ok("the pointer is an I-beam over the field", d.cursorAt(box[0] + 20, box[1] + 10) === "text");
}

function flatIds(d) {
  const out = [];
  const walk = (el) => { out.push(...String(el.className || "").split(/\s+/).map((c) => c.replace(/^tb-/, ""))); for (const k of el.children) walk(k); };
  walk(d.root);
  return out;
}

console.log("--- Save announces ---");
{
  const d = fresh();
  let t = tree(d);
  const status = t.nodes.find((n) => n.role === "status" && n.p === "tb-panel-account");
  ok("the panel has a status region before anything is said", !!status && !status.name, status);
  click(d, "tb-save-account");
  t = tree(d);
  const said = t.nodes.find((n) => n.role === "status" && n.p === "tb-panel-account");
  ok("Save → the status says Saved", said && /Saved/.test(said.name || ""), said);
  ok("and it is drawn", texts(d, t.byId.get("tb-panel-account").b).some((s) => /Saved/.test(s)));
  click(d, "tb-username");
  d.type("x");
  t = tree(d);
  ok("an edit after saving clears it", !(t.nodes.find((n) => n.role === "status" && n.p === "tb-panel-account").name));
  d.keyWith("Enter", false, false);
  t = tree(d);
  ok("Enter in a field saves too", /Saved/.test(t.nodes.find((n) => n.role === "status" && n.p === "tb-panel-account").name || ""));
  click(d, "tb-tab-password");
  d.setFocus("tb-save-password");
  d.key(" ");
  t = tree(d);
  const pw = t.nodes.find((n) => n.role === "status" && n.p === "tb-panel-password");
  ok("Space on Save password announces", pw && /saved/i.test(pw.name || ""), pw);
}

console.log("");
console.log("passed=" + passed + " failed=" + failed);
if (failed > 0) { console.log("FAILURES"); process.exit(1); }
console.log("ALL PASS");

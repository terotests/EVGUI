#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Dialog demo, checked in Node against the compiled demo.
//
// `DialogCtl` and `AlertDialogCtl` are measured against @radix-ui/react-dialog
// and @radix-ui/react-alert-dialog by the conformance specs. This file checks
// what those cannot see: that the demo's OWN tree says the same thing to a
// reader (dialog / alertdialog, aria-modal, labelled by the title, described by
// the description), that every way in and out works the way Radix's does — the
// trigger, ×, Cancel, Escape, the overlay (a dialog closes, an alert dialog
// does not) — that the focus goes in, stays in, and comes back, and that the
// fields, Save, Copy and the scrolling body do what they say.
//
//   node gallery/evgui/demo/dialog-check.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/DialogDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "dialog.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

const fresh = (w = 900, h = 540) => {
  const d = new M.DialogDemo();
  d.pageW = w;
  d.pageH = h;
  d.init(CSS);
  d.displayListJson();
  return d;
};
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const cmds = (d) => JSON.parse(d.displayListJson()).cmds;
const centre = (n) => [n.b[0] + n.b[2] / 2, n.b[1] + n.b[3] / 2];
// Press what is under a point, the way the page does: hit test first.
const clickAt = (d, x, y) => {
  const hit = d.hitId(x, y);
  d.beginSelection(hit, x, false);
  d.endSelection();
  d.displayListJson();
  return hit;
};
const click = (d, id) => {
  const n = tree(d).byId.get(id);
  if (!n) return "(no node " + id + ")";
  const [x, y] = centre(n);
  return clickAt(d, x, y);
};
const open = (d) => d.openWhich();
const texts = (d, box) => cmds(d).filter((c) => c.k === 3 && c.x >= box[0] - 1 && c.x <= box[0] + box[2] &&
  c.y >= box[1] - 1 && c.y <= box[1] + box[3]).map((c) => c.text);
const tabs = (d, n, back = false) => {
  const seen = [];
  for (let i = 0; i < n; i++) { d.keyWith("Tab", back, false); seen.push(d.focused); }
  return seen;
};

console.log("--- the page, closed ---");
{
  const d = fresh();
  ok("no style errors", d.styleErrorCount() === 0, d.styleErrorCount());
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems());
  const t = tree(d);
  const trig = ["dlg-profile-trigger", "dlg-share-trigger", "dlg-terms-trigger", "dlg-alert-trigger"];
  ok("four triggers, each a button that opens a dialog",
    trig.every((id) => { const n = t.byId.get(id); return n && n.role === "button" && n.haspopup === "dialog" && n.expanded === 1; }),
    trig.map((id) => t.byId.get(id)));
  ok("no dialog in the tree while none is open (Radix unmounts it)",
    !t.nodes.some((n) => n.role === "dialog" || n.role === "alertdialog" || n.modal));
  ok("Tab walks the four triggers and then lets go",
    JSON.stringify(tabs(d, 5)) === JSON.stringify([...trig, ""]), d.focused);
}

console.log("--- Edit profile: roles, labelling, focus in ---");
{
  const d = fresh();
  ok("the trigger opens it", click(d, "dlg-profile-trigger") && open(d) === "profile", open(d));
  const t = tree(d);
  const c = t.byId.get("dlg-profile-content");
  ok("role dialog, aria-modal", c && c.role === "dialog" && c.modal === true, c);
  ok("named and labelled by its title", c.name === "Edit profile" && c.labelledby === "dlg-profile-title" &&
    t.byId.get("dlg-profile-title").role === "heading" && t.byId.get("dlg-profile-title").name === "Edit profile", c);
  ok("described by its description", c.describedby === "dlg-profile-description" &&
    t.byId.get("dlg-profile-description").name === "Make changes to your profile here. Click save when you're done.", c);
  ok("the trigger says it is expanded", t.byId.get("dlg-profile-trigger").expanded === 2);
  ok("focus moves to the first field (Radix: first focusable)", d.focused === "dlg-name", d.focused);
  ok("with an editing session for it", d.focusedField() === "dlg-name");
  ok("fields hold shadcn's values", t.byId.get("dlg-name").value === "Pedro Duarte" && t.byId.get("dlg-username").value === "@peduarte");
  ok("the tree lints clean with it open", d.a11yProblems().length === 0, d.a11yProblems());
  const b = c.b;
  ok("425 wide and centred on the page", b[2] === 425 && Math.abs(b[0] + b[2] / 2 - 450) < 1 && Math.abs(b[1] + b[3] / 2 - 270) < 1, b);
  const x = t.byId.get("dlg-profile-close");
  ok("× top-right, named Close", x && x.name === "Close" && x.b[0] + x.b[2] > b[0] + b[2] - 24 && x.b[1] < b[1] + 24, x && x.b);
  const list = JSON.parse(d.displayListJson()).cmds;
  const card = list.find((k) => k.k === 0 && Math.abs(k.x - b[0]) < 1 && Math.abs(k.y - b[1]) < 1 && Math.abs(k.w - b[2]) < 1);
  ok("the card is white, rounded 8–12px, with a shadow", card && card.r >= 8 && card.r <= 12 && card.sh && card.sh.blur > 0, card);
  const dim = list.find((k) => k.k === 0 && k.x === 0 && k.y === 0 && k.w === 900 && k.h === 540 && k.c[3] < 1 && k.c[3] > 0);
  ok("a dimmed backdrop over the whole demo", !!dim, list.slice(0, 3));
}

console.log("--- focus is trapped, and comes back ---");
{
  const d = fresh();
  click(d, "dlg-profile-trigger");
  const ring = ["dlg-username", "dlg-profile-cancel", "dlg-profile-save", "dlg-profile-close", "dlg-name", "dlg-username"];
  ok("Tab cycles inside the dialog (× last, then round)", JSON.stringify(tabs(d, 6)) === JSON.stringify(ring), d.focused);
  d.setFocus("dlg-name");
  ok("Shift+Tab from the first wraps to the last", tabs(d, 1, true)[0] === "dlg-profile-close", d.focused);
  d.setFocus("dlg-share-trigger");
  ok("the page behind is inert: a trigger under the dialog cannot take the focus", d.focused === "dlg-profile-close", d.focused);
  const t = tree(d);
  const [sx, sy] = centre(t.byId.get("dlg-share-trigger"));
  ok("and a press on it lands on the overlay", d.hitId(sx, sy) === "dlg-profile-overlay", d.hitId(sx, sy));
  d.keyWith("Escape", false, false);
  ok("Escape closes it", open(d) === "", open(d));
  ok("and the focus returns to the trigger", d.focused === "dlg-profile-trigger", d.focused);
}

console.log("--- every way out ---");
{
  const d = fresh();
  click(d, "dlg-profile-trigger");
  click(d, "dlg-profile-close");
  ok("× closes, focus to the trigger", open(d) === "" && d.focused === "dlg-profile-trigger", [open(d), d.focused]);
  click(d, "dlg-profile-trigger");
  click(d, "dlg-profile-cancel");
  ok("Cancel closes, focus to the trigger", open(d) === "" && d.focused === "dlg-profile-trigger", [open(d), d.focused]);
  click(d, "dlg-profile-trigger");
  ok("a press on the backdrop (outside the card) closes a Dialog",
    clickAt(d, 20, 20) === "dlg-profile-overlay" && open(d) === "" && d.focused === "dlg-profile-trigger", [open(d), d.focused]);
  click(d, "dlg-profile-trigger");
  clickAt(d, centre(tree(d).byId.get("dlg-profile-title"))[0], centre(tree(d).byId.get("dlg-profile-title"))[1]);
  ok("a press inside the card does not", open(d) === "profile", open(d));
  d.setFocus("dlg-profile-cancel");
  d.keyWith("Enter", false, false);
  ok("Enter on Cancel closes it", open(d) === "" && d.focused === "dlg-profile-trigger");
  d.keyWith(" ", false, false);
  ok("Space on the focused trigger opens it again", open(d) === "profile" && d.focused === "dlg-name", [open(d), d.focused]);
}

console.log("--- typing into Name and Username, Save ---");
{
  const d = fresh();
  click(d, "dlg-profile-trigger");
  // The page's text session hands the whole value back; that is the path
  // typing takes in a browser.
  ok("the session state is published", JSON.parse(d.fieldStateJson("dlg-name")).value === "Pedro Duarte");
  d.applyEdit("dlg-name", "Pedro Duarte Jr", 15, 15);
  ok("an edit through the session lands", tree(d).byId.get("dlg-name").value === "Pedro Duarte Jr");
  ok("and is drawn", texts(d, tree(d).byId.get("dlg-name").b).includes("Pedro Duarte Jr"));
  click(d, "dlg-username");
  ok("a click in Username moves the focus there", d.focused === "dlg-username" && d.focusedField() === "dlg-username");
  d.keyWith("End", false, false);
  d.type("x");
  d.keyWith("Backspace", false, false);
  d.type("2");
  ok("typed keys edit it too", tree(d).byId.get("dlg-username").value === "@peduarte2", tree(d).byId.get("dlg-username").value);
  click(d, "dlg-profile-save");
  ok("Save closes the dialog, focus to the trigger", open(d) === "" && d.focused === "dlg-profile-trigger");
  const st = tree(d).byId.get("dg-status-profile");
  ok("and a status says what was saved", st && st.name === "Saved: Pedro Duarte Jr (@peduarte2)", st);
  click(d, "dlg-profile-trigger");
  ok("reopening shows the saved values", tree(d).byId.get("dlg-name").value === "Pedro Duarte Jr");
  d.applyEdit("dlg-name", "Nobody", 6, 6);
  click(d, "dlg-profile-cancel");
  click(d, "dlg-profile-trigger");
  ok("Cancel discards an edit (shadcn's fields are uncontrolled)", tree(d).byId.get("dlg-name").value === "Pedro Duarte Jr");
  d.keyWith("Enter", false, false);
  ok("Enter in a field submits the form", open(d) === "" && d.saves === 2, [open(d), d.saves]);
}

console.log("--- Share link ---");
{
  const d = fresh();
  click(d, "dlg-share-trigger");
  const t = tree(d);
  const c = t.byId.get("dlg-share-content");
  ok("a dialog titled Share link", c && c.role === "dialog" && c.name === "Share link" &&
    t.byId.get("dlg-share-description").name === "Anyone who has this link will be able to view this.", c);
  const link = t.byId.get("dlg-link");
  ok("the link is a read-only textbox", link && link.role === "textbox" && link.readonly === "true" && /^https:/.test(link.value), link);
  ok("focus starts in it", d.focused === "dlg-link");
  d.type("x");
  d.applyEdit("dlg-link", "hacked", 6, 6);
  ok("and it cannot be edited", tree(d).byId.get("dlg-link").value === link.value, tree(d).byId.get("dlg-link").value);
  ok("nothing is owed the clipboard yet", d.takeCopy() === "");
  click(d, "dlg-share-copy");
  ok("Copy asks the page to copy the link", d.takeCopy() === link.value);
  const t2 = tree(d);
  ok("and says Copied, on the button and in a status", t2.byId.get("dlg-share-copy").name === "Copied" &&
    t2.byId.get("dlg-share-note").role === "status" && /copied/i.test(t2.byId.get("dlg-share-note").name || ""),
    [t2.byId.get("dlg-share-copy"), t2.byId.get("dlg-share-note")]);
  ok("once: the clipboard request is taken, not repeated", d.takeCopy() === "");
  ok("Tab ring: link, Copy, Close, ×", JSON.stringify(tabs(d, 4)) ===
    JSON.stringify(["dlg-share-done", "dlg-share-close", "dlg-link", "dlg-share-copy"]), d.focused);
  click(d, "dlg-share-done");
  ok("Close closes it, focus to the trigger", open(d) === "" && d.focused === "dlg-share-trigger");
  click(d, "dlg-share-trigger");
  ok("reopened, Copy says Copy again", tree(d).byId.get("dlg-share-copy").name === "Copy");
}

console.log("--- Scrollable content ---");
{
  const d = fresh();
  click(d, "dlg-terms-trigger");
  let t = tree(d);
  const c = t.byId.get("dlg-terms-content");
  ok("a dialog with a scroll region", c && c.role === "dialog" && t.byId.get("dlg-terms-body").role === "region");
  ok("focus starts on the scroll region, so the keys scroll it", d.focused === "dlg-terms-body");
  ok("the body is taller than its box", d.termsMax > 100, d.termsMax);
  const head = t.byId.get("dlg-terms-title").b;
  const cancel = t.byId.get("dlg-terms-cancel").b;
  const p1 = t.byId.get("dlg-terms-h0").b;
  d.keyWith("ArrowDown", false, false);
  d.keyWith("PageDown", false, false);
  t = tree(d);
  ok("ArrowDown/PageDown scroll the body", d.termsScroll === 240, d.termsScroll);
  ok("the text moved", t.byId.get("dlg-terms-h0").b[1] === p1[1] - 240, [p1, t.byId.get("dlg-terms-h0").b]);
  ok("the header and the footer did not", JSON.stringify(t.byId.get("dlg-terms-title").b) === JSON.stringify(head) &&
    JSON.stringify(t.byId.get("dlg-terms-cancel").b) === JSON.stringify(cancel));
  d.keyWith("End", false, false);
  ok("End goes to the bottom", d.termsScroll === d.termsMax, [d.termsScroll, d.termsMax]);
  ok("the wheel past the end hands the gesture back", d.scrollBy(50) === false);
  ok("the wheel scrolls it back", d.scrollBy(-100) === true && d.termsScroll === d.termsMax - 100);
  d.keyWith("Home", false, false);
  ok("Home to the top", d.termsScroll === 0);
  const box = tree(d).byId.get("dlg-terms-body").b;
  const inside = cmds(d).filter((k) => k.k === 3 && k.y > box[1] + box[3]);
  ok("nothing of the body is drawn under the footer (clipped)", !cmds(d).some((k) => k.k === 3 && /Contact/.test(k.text) && k.y < box[1] + box[3] && k.y > box[1]), inside.length);
  const bar = JSON.parse(d.displayListJson()).cmds.find((k) => Array.isArray(k.rc) && k.rc[0] === 0 && k.rc[1] === 0 && k.rc[2] > 0 && k.rc[3] > 0);
  ok("the footer bar is rounded at the bottom only", !!bar, bar);
  click(d, "dlg-terms-accept");
  ok("I agree closes it and says so", open(d) === "" && /accepted/.test(tree(d).byId.get("dg-status-terms").name || ""));
  d.setFocus("dlg-terms-trigger");
  d.keyWith("Enter", false, false);
  ok("reopened at the top", d.termsScroll === 0 && open(d) === "terms");
  ok("closed with the wheel: not ours", (d.keyWith("Escape", false, false), d.scrollBy(40)) === false);
}

console.log("--- Alert dialog ---");
{
  const d = fresh();
  click(d, "dlg-alert-trigger");
  const t = tree(d);
  const c = t.byId.get("dlg-alert-content");
  ok("role alertdialog, aria-modal", c && c.role === "alertdialog" && c.modal === true, c);
  ok("labelled and described", c.name === "Are you absolutely sure?" && c.labelledby === "dlg-alert-title" &&
    c.describedby === "dlg-alert-description" &&
    t.byId.get("dlg-alert-description").name === "This action cannot be undone. This will permanently delete your account and remove your data from our servers.", c);
  ok("focus starts on Cancel, not on the destructive action", d.focused === "dlg-alert-cancel", d.focused);
  ok("no × in an alert dialog", !t.byId.get("dlg-alert-close"));
  ok("Tab stays between Cancel and Continue", JSON.stringify(tabs(d, 3)) === JSON.stringify(["dlg-alert-action", "dlg-alert-cancel", "dlg-alert-action"]));
  ok("a press on the backdrop does NOT close an alert dialog", clickAt(d, 20, 20) === "dlg-alert-overlay" && open(d) === "alert", open(d));
  d.keyWith("Escape", false, false);
  ok("Escape does (Radix's AlertDialog)", open(d) === "" && d.focused === "dlg-alert-trigger", [open(d), d.focused]);
  click(d, "dlg-alert-trigger");
  click(d, "dlg-alert-cancel");
  ok("Cancel closes, nothing said", open(d) === "" && !tree(d).byId.get("dg-status-alert").name);
  click(d, "dlg-alert-trigger");
  click(d, "dlg-alert-action");
  ok("Continue closes and says (honestly) what happened", open(d) === "" && d.focused === "dlg-alert-trigger" &&
    /Nothing was deleted/.test(tree(d).byId.get("dg-status-alert").name || ""));
  const red = cmds(fresh()).length && (() => {
    const e = fresh(); click(e, "dlg-alert-trigger");
    const b = tree(e).byId.get("dlg-alert-action").b;
    return cmds(e).find((k) => k.k === 0 && Math.abs(k.x - b[0]) < 1 && Math.abs(k.y - b[1]) < 1 && Math.abs(k.w - b[2]) < 1);
  })();
  ok("Continue is drawn destructive (red)", red && red.c && red.c[0] > 200 && red.c[1] < 60, red && red.c);
}

console.log("--- phone ---");
{
  const d = fresh(328, 900);
  ok("no style errors at 328", d.styleErrorCount() === 0);
  for (const k of ["profile", "share", "terms", "alert"]) {
    click(d, `dlg-${k}-trigger`);
    const t = tree(d);
    const b = t.byId.get(`dlg-${k}-content`).b;
    const card = t.byId.get(`dlg-${k}-trigger`).b;
    ok(`${k}: the width is the demo's less 16px each side`, b[0] === 16 && b[2] === 328 - 32, b);
    ok(`${k}: inside the page, over its own card`, b[1] >= 16 && b[1] + b[3] <= 900 - 16 &&
      b[1] <= card[1] + card[3] && b[1] + b[3] >= card[1], [b, card]);
    d.keyWith("Escape", false, false);
  }
}

console.log("");
console.log("passed=" + passed + " failed=" + failed);
if (failed > 0) { console.log("FAILURES"); process.exit(1); }
console.log("ALL PASS");

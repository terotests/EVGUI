#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// ChatCtl, checked in Node against the compiled demo.
//
// The state first (adding, ids taken once, unread while closed and the
// badge, the window that follows the newest, the draft and sending), then the
// drawn panel (messages one under another inside it, one's own on the right,
// the writer's colour, the buttons), then what a reader is told.
//
//   node gallery/evgui/demo/chat-check.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/ChatDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "..", "theme", "base.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

// --- state ---------------------------------------------------------------------
console.log("state");
const fresh = () => { const d = new M.ChatDemo(); d.init(CSS, ""); return d; };
let d = fresh();
let c = d.chat;
ok("starts closed and empty", c.open === false && c.count() === 0 && c.badge() === "");
ok("a message is added", c.add("1", "zebra", "Anonymous Zebra", "#ea580c", "Hello", "09:00", false) && c.count() === 1);
ok("the same id once", c.add("1", "zebra", "Anonymous Zebra", "#ea580c", "Hello", "09:00", false) === false && c.count() === 1);
c.add("2", "otter", "Anonymous Otter", "#0d9488", "Hi", "09:01", false);
c.add("3", "me", "Tero", "#2563eb", "Morning", "09:02", true);
ok("closed: others' messages count, one's own not", c.unread === 2);
ok("badge (2)", c.badge() === "(2)");
ok("button label", c.buttonLabel("Chat") === "Chat (2)");
c.setOpen(true);
ok("opening reads them", c.unread === 0 && c.badge() === "" && c.buttonLabel("Chat") === "Chat");
c.add("4", "zebra", "Anonymous Zebra", "#ea580c", "While open", "09:03", false);
ok("open: nothing unread", c.unread === 0);
c.toggle();
for (let i = 0; i < 120; i++) c.add("x" + i, "zebra", "Anonymous Zebra", "#ea580c", "m" + i, "", false);
ok("(99+) past 99", c.badge() === "(99+)");
c.rename("zebra", "Ada", "#7c3aed");
ok("a new name on what they wrote", c.at(0).name === "Ada" && c.at(0).color === "#7c3aed");
ok("one's own keep their name", c.at(2).name === "Tero");

d = fresh();
c = d.chat;
c.setOpen(true);
for (let i = 0; i < 20; i++) c.add("m" + i, "a", "A", "#000000", "line " + i, "", false);
ok("the newest in view", c.top === 20 - c.shown && c.follow);
d.key("PageUp", false);
ok("PageUp: back a screenful, no longer following", c.top === 20 - 2 * c.shown && !c.follow);
c.add("m20", "a", "A", "#000000", "late", "", false);
ok("a new one while scrolled up: left where it is, counted below", c.top === 20 - 2 * c.shown && c.unseenBelow === 1);
d.rebuild();
ok("a jump button says so", d.rectOf("ch-jump") !== "");
c.scrollBy(-100);
ok("scrollBy clamps", c.top === 0);
c.activate("ch-jump");
ok("jump: the end, following again", c.top === c.maxTop() && c.follow && c.unseenBelow === 0);
c.keep = 10;
c.add("m21", "a", "A", "#000000", "over", "", false);
ok("kept to `keep`", c.count() === 10 && c.at(9).text === "over");

d = fresh();
c = d.chat;
c.setOpen(true);
d.type("H"); d.type("i"); d.type(" "); d.type("😀");
ok("typing writes the draft", c.draft() === "Hi 😀");
d.key("Backspace", false);
ok("Backspace takes an emoji whole", c.draft() === "Hi ");
d.key("Enter", false);
ok("Enter sends, trimmed", c.takeSent() === "Hi" && c.draft() === "");
ok("taken once", c.takeSent() === "");
d.type(" ");
d.key("Enter", false);
ok("a blank draft is not sent", c.takeSent() === "");
d.key("Escape", false);
ok("Escape closes", c.open === false);

// --- drawn ---------------------------------------------------------------------
console.log("drawn");
d = fresh();
c = d.chat;
c.setOpen(true);
c.add("1", "zebra", "Anonymous Zebra", "#ea580c", "Is the Q3 chart final?", "09:00", false);
c.add("2", "me", "Tero", "#2563eb", "Yes, numbers from the sheet", "09:01", true);
c.add("3", "otter", "Anonymous Otter", "#0d9488", "👍", "09:02", false);
d.rebuild();
const rect = (id) => { const r = d.rectOf(id); return r ? r.split(" ").map(Number) : null; };
const panel = rect("ch");
const m = [0, 1, 2].map((i) => rect(c.msgTid(i)));
ok("three messages drawn", m.every(Boolean), m);
ok("one under another", m[0][1] + m[0][3] <= m[1][1] + 0.5 && m[1][1] + m[1][3] <= m[2][1] + 0.5, m);
ok("inside the panel", m.every((r) => r[0] >= panel[0] && r[0] + r[2] <= panel[0] + panel[2] + 0.5), [m, panel]);
ok("one's own on the right", m[1][0] > m[0][0] && Math.abs((m[1][0] + m[1][2]) - (panel[0] + panel[2])) < Math.abs((m[0][0] + m[0][2]) - (panel[0] + panel[2])), m);
const log = rect("ch-log");
const composer = rect("ch-composer");
ok("the composer under the messages", log[1] + log[3] <= composer[1] + 0.5);
ok("the composer at the foot of the panel", Math.abs(composer[1] + composer[3] - (panel[1] + panel[3])) < 2, [composer, panel]);
c.add("4", "zebra", "Anonymous Zebra", "#ea580c", "This is a rather long message that has to wrap onto several lines inside its box", "09:03", false);
d.rebuild();
const long = rect(c.msgTid(3));
const longText = rect(c.msgTid(3) + "-text");
ok("a long message wraps inside its box", longText[2] <= long[2] && longText[3] > 20 && long[0] + long[2] <= panel[0] + panel[2], [long, longText]);
const dl = d.displayListJson();
ok("the writer's colour is drawn", /234[^0-9]+88[^0-9]+12|0\.917|ea580c/i.test(dl));
ok("the empty text is gone once there are messages", rect("ch-empty") === null);
const send = rect("ch-send");
d.type("ok");
d.pressAt(send[0] + 4, send[1] + 4);
ok("a press on Send sends", c.takeSent() === "ok");
c.height = 300;
d.rebuild();
const p2 = rect("ch");
const comp2 = rect("ch-composer");
ok("a height from the host", Math.abs(p2[3] - 300) < 1 && Math.abs(comp2[1] + comp2[3] - (p2[1] + p2[3])) < 2, [p2, comp2]);
const close = rect("ch-close");
d.pressAt(close[0] + 4, close[1] + 4);
ok("a press on × closes", c.open === false);

// --- to a reader ------------------------------------------------------------------
console.log("reader");
const rows = c.rows();
const byTid = new Map(rows.map((r) => [r.tid, r]));
const R = M.EVGA11yRole;
ok("a region named by the title", byTid.get("ch").role === R.region() && byTid.get("ch").name === "Chat");
ok("the messages are a log", byTid.get("ch-log").role === R.log());
ok("a message says who, when and what", byTid.get(c.msgTid(0)).name === "Anonymous Zebra, 09:00: Is the Q3 chart final?");
ok("the draft is a text field", byTid.get("ch-field").role === R.textField() && byTid.get("ch-field").hasText);
ok("Send is off with nothing written", byTid.get("ch-send").disabled === true);
ok("owns its ids", c.owns(c.msgTid(2)) && c.owns("ch-send") && !c.owns("ch-m-99"));

// --- copying ------------------------------------------------------------------
console.log("copy");
d = fresh();
c = d.chat;
c.setOpen(true);
c.add("1", "zebra", "Anonymous Zebra", "#ea580c", "Possua tähän kuva", "09:00", false);
c.add("2", "me", "Tero", "#2563eb", "Second one", "09:01", true);
d.rebuild();
const w0 = rect(c.msgTid(0) + "-text");
ok("a message's words are selectable text", d.displayListJson().length > 0 && c.owns(c.msgTid(0) + "-text-text"), w0);
const cy = w0[1] + w0[3] / 2;
ok("a double click takes a word", d.selectAt(w0[0] + 3, cy, w0[0] + 3, 2) === "Possua");
ok("a triple click takes the message", d.selectAt(w0[0] + 3, cy, w0[0] + 3, 3) === "Possua tähän kuva");
const dragged = d.selectAt(w0[0] + 1, cy, w0[0] + w0[2] - 1, 1);
ok("a drag selects across it", dragged.length >= 15 && "Possua tähän kuva".startsWith(dragged.slice(0, 6)), dragged);
c.add("3", "otter", "Anonymous Otter", "#0d9488", "late", "09:02", false);
d.rebuild();
ok("the selection outlives a rebuild", d.copyText() === dragged);
const w1 = rect(c.msgTid(1) + "-text");
ok("a press on another message takes the selection there", d.selectAt(w1[0] + 2, w1[1] + w1[3] / 2, w1[0] + 2, 3) === "Second one" && c.texts[0].selectedText() === "");
c.dropSelection();
ok("dropped: nothing to copy", d.copyText() === "");

// --- a thread ------------------------------------------------------------------
console.log("thread");
d = fresh();
c = d.chat;
c.setOpen(true);
c.subtitle = "Slide 3";
c.addAction("resolve", "Resolve", "primary");
c.addAction("delete", "Delete", "danger");
c.add("1", "zebra", "Anonymous Zebra", "#ea580c", "Bigger font here", "09:00", false);
c.height = 400;
d.rebuild();
const sub = rect("ch-sub");
const acts = [rect("ch-act-resolve"), rect("ch-act-delete")];
ok("a subtitle under the title", sub && sub[1] >= rect("ch-head")[1] + rect("ch-head")[3] - 0.5, sub);
ok("the buttons in a row under it", acts.every(Boolean) && Math.abs(acts[0][1] - acts[1][1]) < 0.5 && acts[0][1] >= sub[1] + sub[3] - 0.5, acts);
const comp3 = rect("ch-composer");
const p3 = rect("ch");
ok("the composer still at the foot", Math.abs(comp3[1] + comp3[3] - (p3[1] + p3[3])) < 2, [comp3, p3]);
d.pressAt(acts[0][0] + 4, acts[0][1] + 4);
ok("a press leaves its value for the host", c.takeAction() === "resolve" && c.takeAction() === "");
c.readOnly = true;
c.readOnlyText = "Resolved";
d.rebuild();
d.type("x");
ok("read only: nothing is typed", c.draft() === "");
ok("read only: no field, its line instead", rect("ch-field") === null && rect("ch-ro") !== null);
ok("read only: nothing is sent", c.send() === false);
const tr = c.rows().map((r) => r.tid);
ok("a reader hears the subtitle and the buttons", tr.includes("ch-sub") && tr.includes("ch-act-delete") && !tr.includes("ch-field"), tr);
c.clearActions();
c.readOnly = false;

// --- a pin --------------------------------------------------------------------
console.log("pin");
d = fresh();
const pin = d.pinPage(100, 200, "2", false);
const pr = rect("pin1");
ok("the bubble sits above and right of its point", pr && Math.abs(pr[0] - 100) < 1 && Math.abs(pr[1] + pr[3] - 200) < 2, pr);
ok("has: on the bubble", pin.has(110, 190));
ok("has: not far from it", !pin.has(160, 190) && !pin.has(110, 230));
ok("the fill is the host's colour", /253[^0-9]+224[^0-9]+71|fde047|0\.99/i.test(d.displayListJson()));
const closedPin = d.pinPage(100, 200, "1", true);
ok("closed: faint", closedPin.classes().includes("pin-closed"));
ok("a pin is a button to a reader", pin.rows()[0].role === M.EVGA11yRole.button());

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

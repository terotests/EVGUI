#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The message transcript: what it looks like, and what a reader is told.
//
//   node gallery/evgui/demo/message-check.mjs
//
// SPECIFIED, NOT MEASURED. Base UI has no message, bubble or marker
// primitive and ui.shadcn.com is refused by the proxy, so this is the
// Timeline situation: every expectation is read off the component source and
// one screenshot. The assertions are still worth having — they are what stops
// the picture drifting — but the claim behind them is weaker than the one
// behind, say, the calendar, and saying so is the point of this paragraph.
//
// Three of them exist because of bugs found while building it, and those are
// the ones that will fail again:
//
//   the accessible tree was THREE NODES — "Conversation" and the typing
//   marker — with every message missing, because plain text inside a region
//   does not reach this tree at all and role="log" did not exist;
//   a bubble sized exactly to its text is a floating-point TIE, and the last
//   word wrapped out of a one-line box;
//   and an emoji was measured at half an em per surrogate half, so it came
//   out one em wide against a real 1.1685.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/MessageDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "message.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail ? " — " + detail : "")); }
};

const fresh = () => {
  const d = new M.MessageDemo();
  d.init(CSS);
  d.displayListJson();
  return d;
};
const flat = (d) => {
  const out = [];
  const walk = (el) => { out.push(el); for (const k of el.children) walk(k); };
  walk(d.root);
  return out;
};
const byId = (d, id) => flat(d).find((e) => e.id === id);
const nodes = (d) => JSON.parse(d.a11yJson(1, "")).nodes;
const node = (d, id) => nodes(d).find((n) => n.id === id);

console.log("the stylesheet");
{
  const d = fresh();
  const errs = [];
  for (let i = 0; i < d.styleErrorCount(); i++) errs.push(d.styleErrorAt(i));
  ok("parses with no errors", errs.length === 0, errs.join("; "));
}

console.log("which side each message is on");
{
  const d = fresh();
  // Mine are pushed to the far edge, theirs start at the near one. Compared
  // to each other rather than to absolute numbers, so the thread can move.
  const mine = ["ms-b1", "ms-b3"].map((id) => byId(d, id).calculatedX);
  const theirs = ["ms-b2", "ms-b4", "ms-b5"].map((id) => byId(d, id).calculatedX);
  ok("their bubbles all start on the same left edge",
    new Set(theirs.map(Math.round)).size === 1, JSON.stringify(theirs));
  ok("mine are further right than any of theirs",
    Math.min(...mine) > Math.max(...theirs), `${JSON.stringify(mine)} vs ${JSON.stringify(theirs)}`);
  // And they END on one right edge, which is what alignment to the far side
  // means — equal left positions would be the wrong test for a right-aligned
  // column of different widths.
  const rights = mine.map((x, i) => x + byId(d, ["ms-b1", "ms-b3"][i]).calculatedWidth);
  ok("and end on one right edge", Math.abs(rights[0] - rights[1]) < 1.5, JSON.stringify(rights));
}

console.log("a bubble is as wide as its text");
{
  const d = fresh();
  const widths = ["ms-b1", "ms-b2", "ms-b3", "ms-b4", "ms-b5"]
    .map((id) => Math.round(byId(d, id).calculatedWidth));
  ok("no two are the same width", new Set(widths).size === widths.length, JSON.stringify(widths));
  const col = byId(d, "ms-m2-content").calculatedWidth;
  ok("and none is wider than its column", Math.max(...widths) <= col + 0.5, `${Math.max(...widths)} vs ${col}`);
}

console.log("every message is one line");
{
  // The tie. A box sized exactly to its content wrapped its last word out of
  // a one-line bubble, and the emoji is what made it visible.
  const d = fresh();
  const dl = JSON.parse(d.displayListJson());
  const runs = (dl.cmds || []).filter((c) => c.text && c.text.length > 2).map((c) => c.text);
  ok("the crying face stays in its sentence",
    runs.includes("It's always a one-line change \u{1F62D}."),
    JSON.stringify(runs.filter((r) => r.includes("always") || r.includes("\u{1F62D}"))));
  for (const id of ["ms-b1", "ms-b2", "ms-b3", "ms-b4", "ms-b5"]) {
    const h = byId(d, id).calculatedHeight;
    if (Math.round(h) !== 48) ok(`${id} is one line tall`, false, `height ${h}`);
  }
  ok("all five bubbles are one line tall",
    ["ms-b1", "ms-b2", "ms-b3", "ms-b4", "ms-b5"].every(
      (id) => Math.round(byId(d, id).calculatedHeight) === 48), "");
}

console.log("an emoji is measured as one glyph, not as two halves");
{
  const d = fresh();
  // Chromium, 13px and 16px: the crying face is 1.1685 em and the thumb
  // 1.2477. Half an em per surrogate half made both exactly 1.0.
  const em = 16;
  ok("wider than one em", d.textWidthOf("\u{1F62D}") > em, d.textWidthOf("\u{1F62D}").toFixed(2));
  ok("and not wider than the widest measured, plus a little",
    d.textWidthOf("\u{1F62D}") <= em * 1.3, d.textWidthOf("\u{1F62D}").toFixed(2));
  // A zero-width joiner takes no room: a family of four is four glyphs and
  // three joiners, and counting the joiners is how it becomes seven.
  const one = d.textWidthOf("\u{1F468}");
  const zwj = d.textWidthOf("\u{1F468}‍\u{1F469}");
  ok("a zero-width joiner adds nothing", Math.abs(zwj - one * 2) < 0.01,
    `${one.toFixed(2)} + zwj + ${one.toFixed(2)} = ${zwj.toFixed(2)}`);
}

console.log("what a reader is told");
{
  const d = fresh();
  ok("the tree lints clean", d.a11yProblems().length === 0, d.a11yProblems().join("; "));
  const thread = node(d, "ms-thread");
  // role=log did not exist, and EVGA11yFromTree drops an unknown role AND
  // everything under it — so the whole conversation was missing while the
  // picture was perfect.
  ok("the thread is a log", thread && thread.role === "log", JSON.stringify(thread));
  const texts = nodes(d).filter((n) => n.role === "text").map((n) => n.name);
  ok("every message is in it", texts.length === 7, JSON.stringify(texts));
  ok("including the delivery receipt", texts.includes("Delivered"), JSON.stringify(texts));
  ok("and the reaction, by its label rather than its glyph",
    texts.includes("Reactions: thumbs up"), JSON.stringify(texts));
  const marker = node(d, "ms-marker");
  ok("the typing marker is a live status", marker && marker.role === "status", JSON.stringify(marker));
  ok("and reads as one sentence", marker && marker.name === "Oliver is typing",
    marker && marker.name);
  ok("the composer is a named text field",
    nodes(d).some((n) => n.id === "ms-input" && n.role === "textbox" && n.name === "Message"),
    JSON.stringify(node(d, "ms-input")));
  ok("and Send is a named button",
    nodes(d).some((n) => n.id === "ms-send" && n.role === "button" && n.name === "Send"),
    JSON.stringify(node(d, "ms-send")));
}

console.log("the typing line");
{
  // "Oliveris typing": the verb's leading space was trimmed and the bold
  // name's box was measured in the regular face. The gap is the sheet's now.
  const d = fresh();
  const who = byId(d, "ms-marker").children[0];
  const verb = byId(d, "ms-marker").children[1];
  const gap = verb.calculatedX - (who.calculatedX + who.calculatedWidth);
  ok("there is a gap between the name and the verb", gap >= 3 && gap <= 8, gap.toFixed(2));
  const dl = JSON.parse(d.displayListJson());
  const run = (dl.cmds || []).find((c) => c.text === "Oliver");
  ok("and the bold name fits its own box", run && run.w <= who.calculatedWidth + 0.5,
    run && `${run.w} in ${who.calculatedWidth}`);
  ok("the verb has no leading space to be trimmed", verb.textContent === "is typing", JSON.stringify(verb.textContent));
  const dots = byId(d, "ms-mdots");
  ok("followed by three dots", dots && dots.children.length === 3, dots && dots.children.length);
  const before = dots.children.map((k) => k.opacity);
  d.tick(250); d.displayListJson();
  const after = byId(d, "ms-mdots").children.map((k) => k.opacity);
  ok("that pulse on the clock", JSON.stringify(before) !== JSON.stringify(after),
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
}

console.log("writing a message");
{
  const d = fresh();
  d.settle();
  ok("the opening reply lands and the marker goes quiet",
    d.messageCount() === 1 && !byId(d, "ms-marker").children.length, `${d.messageCount()}`);
  ok("nothing to send: Send says it is disabled",
    node(d, "ms-send").disabled === true || JSON.stringify(node(d, "ms-send")).includes("disabled"),
    JSON.stringify(node(d, "ms-send")));
  d.press("ms-input");
  d.applyEdit("ms-input", "Shipping it anyway.", 19, 19);
  ok("Enter sends", d.keyWith("Enter", false, false) === true, "");
  d.displayListJson();
  ok("the field is empty again", JSON.parse(d.fieldStateJson("ms-input")).value === "", d.fieldStateJson("ms-input"));
  const mine = byId(d, "ms-n2-b");
  ok("the message is an outgoing bubble", mine && mine.className.includes("ms-bubble") && !mine.className.includes("muted"),
    mine && mine.className);
  ok("on my side", mine && mine.calculatedX > byId(d, "ms-b2").calculatedX, "");
  ok("in the log, where a reader is told", nodes(d).some((n) => n.role === "text" && n.name === "Shipping it anyway."), "");
  ok("and the transcript is pinned to the bottom",
    Math.abs(d.scrollTopNow() - d.maxScrollNow()) < 1 && d.maxScrollNow() > 0,
    `${d.scrollTopNow()} of ${d.maxScrollNow()}`);
  ok("the other side is not typing yet", !d.isTyping(), "");
  for (let t = 0; t < 800; t += 16) { d.tick(16); d.displayListJson(); }
  ok("after a pause it is", d.isTyping(), "");
  const bubble = byId(d, "ms-typing");
  ok("a bubble of three dots", bubble && bubble.children.length === 3, bubble && bubble.children.length);
  ok("hidden from a reader, because the marker says it",
    !nodes(d).some((n) => n.id === "ms-typing"), "");
  ok("and the marker says so", node(d, "ms-marker").name === "Oliver is typing", node(d, "ms-marker").name);
  ok("still at the bottom with the typing bubble in view",
    Math.abs(d.scrollTopNow() - d.maxScrollNow()) < 1, `${d.scrollTopNow()} of ${d.maxScrollNow()}`);
  d.settle();
  ok("then a reply arrives", d.messageCount() === 3 && !d.isTyping(), `${d.messageCount()}`);
  ok("from the other side", byId(d, "ms-n3-b").className.includes("muted"), byId(d, "ms-n3-b").className);
  ok("and the transcript followed it",
    Math.abs(d.scrollTopNow() - d.maxScrollNow()) < 1, `${d.scrollTopNow()} of ${d.maxScrollNow()}`);
  ok("the tree still lints clean", d.a11yProblems().length === 0, d.a11yProblems().join("; "));
}

console.log("a long message wraps inside its bubble");
{
  const d = fresh();
  d.press("ms-input");
  const long = "This one is long enough that it cannot possibly fit on a single line of a bubble.";
  d.applyEdit("ms-input", long, long.length, long.length);
  d.keyWith("Enter", false, false);
  d.displayListJson();
  const b = byId(d, "ms-n1-b");
  ok("the bubble is taller than one line", b.calculatedHeight > 60, `${b.calculatedHeight}`);
  const dl = JSON.parse(d.displayListJson());
  const lines = (dl.cmds || []).filter((c) => c.text && long.includes(c.text) && c.text.length > 3);
  const bottom = Math.max(...lines.map((c) => c.y + c.h));
  ok("and every line of it is inside", lines.length >= 2 && bottom <= b.calculatedY + b.calculatedHeight,
    `${lines.length} lines, bottom ${bottom} vs ${b.calculatedY + b.calculatedHeight}`);
}

console.log("reading back through the transcript");
{
  const d = fresh();
  d.settle();
  for (const m of ["one", "two", "three"]) {
    d.press("ms-input"); d.applyEdit("ms-input", m, m.length, m.length); d.keyWith("Enter", false, false);
    d.displayListJson();
  }
  d.settle();
  ok("the wheel scrolls it", d.scrollBy(-200) === true, "");
  d.displayListJson();
  const top = d.scrollTopNow();
  d.press("ms-input"); d.applyEdit("ms-input", "four", 4, 4); d.keyWith("Enter", false, false);
  d.displayListJson();
  ok("sending brings them back to the bottom", Math.abs(d.scrollTopNow() - d.maxScrollNow()) < 1, "");
  ok("and back up again", d.scrollBy(-200) === true, "");
  d.displayListJson();
  const up = d.scrollTopNow();
  d.settle();
  ok("a reply does not move a reader who scrolled away", Math.abs(d.scrollTopNow() - up) < 1,
    `${up} -> ${d.scrollTopNow()}`);
  const jump = node(d, "ms-scroller-tobottom");
  ok("but offers to jump to it", jump && jump.role === "button" && jump.name === "Jump to newest message", JSON.stringify(jump));
  d.press("ms-scroller-tobottom");
  d.displayListJson();
  ok("which goes to the bottom", Math.abs(d.scrollTopNow() - d.maxScrollNow()) < 1, `${d.scrollTopNow()} of ${d.maxScrollNow()}`);
  ok("and goes away", !node(d, "ms-scroller-tobottom"), "");
  ok("at the top the wheel hands the gesture back",
    (() => { d.scrollBy(-100000); d.displayListJson(); return d.scrollBy(-10) === false; })(), "");
  void top;
}

console.log("");
console.log(failed ? `RESULT FAIL — passed=${passed} failed=${failed}` : `RESULT OK — passed=${passed} failed=0`);
process.exitCode = failed ? 1 : 0;

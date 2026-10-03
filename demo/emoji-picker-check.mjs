#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// EmojiPickerCtl, checked in Node against the compiled demo.
//
// The catalogue first (what it holds, the words, the search and its order),
// then the control's state (groups, the keys in the grid, the scroll window,
// picking and Recent, the query), then the drawn picker: the cells in a
// 9-wide grid that does not overlap the tabs or the name under it, a press on
// a cell and a tab, hover, and what a reader is told.
//
//   node gallery/evgui/demo/emoji-picker-check.mjs

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/EmojiPickerDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "..", "theme", "base.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

// --- the catalogue ---------------------------------------------------------------
console.log("catalogue");
const cat = new M.UiEmojiCatalog();
cat.load();
ok("holds the face's emojis", cat.count() > 1500, cat.count());
ok("groups in Unicode's order, no components", cat.groups.join(",") === "smileys,people,nature,food,travel,activities,objects,symbols,flags", cat.groups);
ok("first is 😀", cat.at(0).text === "😀" && cat.at(0).name === "grinning face");
ok("Finnish names", cat.at(0).nameFi === "leveä hymy", cat.at(0).nameFi);
ok("no skin-tone variants", !cat.items.some((e) => /[\u{1F3FB}-\u{1F3FF}]/u.test(e.text)));
ok("a ZWJ sequence the face ligates is in (rainbow flag)", cat.find("🏳️‍🌈") >= 0);
ok("a flag is in (Finland)", cat.find("🇫🇮") >= 0);
ok("loading twice adds nothing", (cat.load(), cat.count()) === cat.items.length);
ok("words: lower case, split at ASCII punctuation, ä kept", M.UiEmojiCatalog.words("Face: Sydän-ja Nuoli").join(",") === "face,sydän,ja,nuoli");
const names = (ids) => ids.map((i) => cat.at(i).name);
const heart = cat.search("heart");
ok("search: a name that begins with the query first", names(heart.slice(0, 3)).every((n) => n.startsWith("heart")), names(heart.slice(0, 3)));
ok("search: then the names with the word (red heart)", names(heart).includes("red heart"));
ok("search: every word must match", names(cat.search("red heart"))[0] === "red heart", names(cat.search("red heart")).slice(0, 3));
ok("search: prefixes match (thum up → thumbs up)", names(cat.search("thum up"))[0] === "thumbs up", names(cat.search("thum up")).slice(0, 2));
ok("search: Finnish (peukalo ylös)", names(cat.search("peukalo ylös"))[0] === "thumbs up");
ok("search: case does not matter", cat.search("HEART").length === heart.length);
ok("search: the search words count (happy → grinning face)", names(cat.search("happy")).includes("grinning face"));
ok("search: nothing for nonsense", cat.search("xyzzyq").length === 0);
ok("search: nothing for an empty query", cat.search("   ").length === 0);

// --- the control's state ---------------------------------------------------------
console.log("state");
const fresh = () => { const d = new M.EmojiPickerDemo(); d.init(CSS, ""); return d; };
let d = fresh();
let p = d.picker;
ok("opens on the first group", p.group === "smileys" && p.sel === 0 && p.selected() === "😀");
ok("no Recent tab before a pick", p.tabs()[0] === "smileys");
d.key("ArrowRight", false);
ok("ArrowRight moves one", p.sel === 1);
d.key("ArrowDown", false);
ok("ArrowDown moves a row (9)", p.sel === 10);
d.key("ArrowUp", false);
d.key("ArrowLeft", false);
d.key("ArrowLeft", false);
ok("ArrowLeft stops at the first", p.sel === 0);
d.key("End", false);
ok("End: the last", p.sel === p.count() - 1);
ok("the window follows the focus", p.top === p.rowCount() - p.rowsShown, [p.top, p.rowCount()]);
d.key("Home", false);
ok("Home: the first, scrolled back", p.sel === 0 && p.top === 0);
d.key("PageDown", false);
ok("PageDown: a screenful", p.sel === 54 && p.top > 0, [p.sel, p.top]);
p.scrollBy(-100);
ok("scrollBy clamps", p.top === 0);
p.scrollBy(100000);
ok("scrollBy clamps at the end", p.top === p.rowCount() - p.rowsShown);
d.key("Tab", false);
ok("Tab: the next group", p.group === "people" && p.sel === 0 && p.top === 0);
d.key("Tab", true);
d.key("Tab", true);
ok("Shift+Tab wraps to the last group", p.group === "flags");
// a short last row: ArrowDown from above it lands on its last emoji
d.key("Tab", false); // smileys
const n = p.count();
if (n % 9 !== 0) {
  p.setSel(n - (n % 9) - 1); // the last of the full rows
  d.key("ArrowDown", false);
  ok("ArrowDown onto a short last row: its last emoji", p.sel === n - 1, [p.sel, n]);
}
d.type("t"); d.type("h"); d.type("u"); d.type("m");
ok("typing searches", p.query === "thum" && p.searching() && p.nameAt(0).startsWith("thumbs"));
d.key("Backspace", false);
ok("Backspace takes a character off", p.query === "thu");
d.key("Backspace", false); d.key("Backspace", false); d.key("Backspace", false);
ok("an empty query is the group again", !p.searching() && p.group === "smileys" && p.count() === n);
d.type("😀");
d.key("Backspace", false);
ok("Backspace takes a surrogate pair as one", p.query === "");
d.type("thumbs up");
d.key("Enter", false);
ok("Enter picks", p.takePicked() === "👍️");
ok("taken once", p.takePicked() === "");
ok("the pick is in Recent", p.recent[0] === "👍️" && p.tabs()[0] === "recent");
p.setGroup("smileys");
p.pick(3);
p.pick(0);
ok("Recent: most recent first", p.recentText() === "😀 😁 👍️", p.recentText());
p.pick(3);
ok("Recent: a pick again moves to the front, no twice", p.recentText() === "😁 😀 👍️", p.recentText());
p.setGroup("recent");
ok("the Recent group lists them", p.count() === 3 && p.emojiAt(0) === "😁");
for (let i = 0; i < 30; i++) { p.setGroup("food"); p.pick(i); }
ok("Recent is kept short", p.recent.length === p.recentMax);
const q = new M.EmojiPickerCtl();
q.setRecentText("🍔 nonsense 😀  🍕");
ok("setRecentText keeps the catalogue's emojis", q.recentText() === "🍔 😀 🍕", q.recentText());
q.setup("q", "Emoji");
ok("opens on Recent when there is one", q.group === "recent" && q.selected() === "🍔");
p.lang = "fi";
p.setGroup("smileys");
ok("names in Finnish", p.nameAt(0) === "leveä hymy");
ok("group names in Finnish", M.UiEmojiCatalog.groupName("food", "fi") === "Ruoka ja juoma");

// --- the drawn picker ----------------------------------------------------------------
console.log("drawn");
d = fresh();
p = d.picker;
const rect = (id) => { const r = d.rectOf(id); return r ? r.split(" ").map(Number) : null; };
const cells = [];
for (let k = 0; k < p.cols * p.rowsShown; k++) cells.push(rect(p.cellTid(k)));
ok("six rows of nine cells", cells.every(Boolean), cells.findIndex((c) => !c));
const first = cells[0];
ok("a row is one line", cells.slice(0, 9).every((c) => c[1] === first[1]));
ok("cells do not overlap", cells.slice(0, 8).every((c, i) => c[0] + c[2] <= cells[i + 1][0] + 0.01));
const picker = rect("ep");
ok("the grid fits the picker", cells.every((c) => c[0] + c[2] <= picker[0] + picker[2] + 0.5), [cells[8], picker]);
const tabs = rect("ep-tabs");
const foot = rect("ep-foot");
const last = cells[cells.length - 1];
ok("tabs above the grid", tabs[1] + tabs[3] <= first[1]);
ok("the name under the grid", last[1] + last[3] <= foot[1] + 0.5, [last, foot]);
ok("only the window's rows are built", rect(p.cellTid(p.cols * p.rowsShown)) === null);
const tabRects = p.tabs().map((g) => rect(p.tabTid(g)));
ok("every tab fits", tabRects.every((t) => t && t[0] + t[2] <= picker[0] + picker[2] + 0.5));
const c5 = cells[5];
d.hoverAt(c5[0] + c5[2] / 2, c5[1] + c5[3] / 2);
ok("hover names the emoji under the pointer", p.hot === 5);
const tid = d.pressAt(c5[0] + c5[2] / 2, c5[1] + c5[3] / 2);
ok("a press on a cell picks it", tid === p.cellTid(5) && p.takePicked() === p.emojiAt(5) && p.sel === 5);
const foodTab = rect(p.tabTid("food"));
d.pressAt(foodTab[0] + 4, foodTab[1] + 4);
ok("a press on a tab opens its group", p.group === "food" && p.selected() === p.emojiAt(0));
d.type("zzzzqq");
ok("no results: a line says so", rect("ep-empty") !== null && p.count() === 0);
d.key("Enter", false);
ok("Enter with nothing to pick picks nothing", p.takePicked() === "");
const list = JSON.parse(d.displayListJson());
ok("draws", Array.isArray(list.commands || list) || typeof list === "object");

// --- to a reader ------------------------------------------------------------------------
console.log("reader");
d = fresh();
p = d.picker;
const rows = p.rows();
const byTid = new Map(rows.map((r) => [r.tid, r]));
const R = M.EVGA11yRole;
ok("the search is a text field holding the query", byTid.get("ep-search").role === R.textField() && byTid.get("ep-search").hasText);
ok("the tabs are a tab list, the group selected", byTid.get(p.tabTid("smileys")).role === R.tab() && byTid.get(p.tabTid("smileys")).selected === 2 && byTid.get(p.tabTid("food")).selected === 1);
ok("the cells are options named by the emoji", byTid.get(p.cellTid(0)).role === R.option() && byTid.get(p.cellTid(0)).name === "grinning face");
ok("the focus is the selected option", byTid.get(p.cellTid(0)).selected === 2 && byTid.get(p.cellTid(1)).selected === 1);
ok("owns its ids", p.owns(p.cellTid(3)) && p.owns(p.tabTid("flags")) && !p.owns("ep-e-9999"));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

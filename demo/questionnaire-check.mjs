#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Questionnaire demo, checked in Node against the compiled demo and then
// on the real page in a browser.
//
//   npm run ui:questionnaire:check   (node scripts/run.mjs ui:questionnaire:check)
//
// What it claims, and so what this checks:
//
//   * THE PICTURE'S CONTENT: both cards as they load — the questions, the
//     descriptions, "Question 1 of 3", "0 of 6 selected", every option's
//     label, second line and key badge (A–C, A–F), Next.
//   * NAVIGATION AND VALIDATION: Next on an unanswered required question is
//     refused with an inline error (the group aria-invalid and described by
//     it), an answer clears it, Next and Back move and keep the answers, the
//     optional scale can be left, "Finish" on the last question.
//   * THE KEYBOARD: letters pick (single) and toggle (multiple), only while
//     the focus is in that card and never with Ctrl; digits on a scale; the
//     arrows move AND select in a radio group (wrapping, Home / End) and move
//     only the focus in the checkbox group; Space toggles or picks; Enter is
//     Next and the focus lands on the new question; Enter on Back goes back.
//   * THE COUNT: "n of 6 selected" follows every toggle and is a status.
//   * SUMMARY AND RESTART: the answers in order ("Skipped" for an empty
//     optional one), the progress, Back from it, Start over clearing all.
//   * SEMANTICS: a form per card, each step a radiogroup / group labelled by
//     its question heading and described by its description (or the error),
//     options radio / checkbox with name, description and checked, one
//     roving tab stop per group, the status region's announcements, and no
//     lint problems in any state.
//   * THE TRANSITION: a new step fades / slides in on the demo's clock, and
//     with reduced motion it does not.
//   * A PHONE: at 358 and 390 the frames stack, nothing overlaps or spills.
//   * THE PAGE: in Chromium, the demo loads, a click and the real keyboard
//     drive it, Tab walks one stop per group, the mirror carries the ARIA,
//     the Styles panel finds no problem in the sheet, and at 390 wide there
//     is no horizontal scroll.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { requireHostTool, findChromium } from "../../ui/conformance/dom-adapter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/QuestionnaireDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "questionnaire.css"), "utf8");

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

const fresh = (w, still = false) => {
  const d = new M.QuestionnaireDemo();
  d.setReducedMotion(still);
  d.init(CSS);
  if (w) { d.pageW = w; d.pageH = 4000; d.layout = undefined; }
  d.displayListJson();
  return d;
};
const byId = (d, id) => {
  let found = null;
  const walk = (e) => { if (found) return; if (e.id === id) { found = e; return; } for (const k of e.children || []) walk(k); };
  walk(d.root);
  return found;
};
const rect = (d, id) => {
  d.displayListJson();
  const e = byId(d, id);
  return e ? { x: e.calculatedX, y: e.calculatedY, w: e.calculatedWidth, h: e.calculatedHeight } : null;
};
// The words drawn under an element, in order.
const words = (e) => {
  const out = [];
  const walk = (n) => { if (n.textContent) out.push(n.textContent); for (const k of n.children || []) walk(k); };
  walk(e);
  return out;
};
const st = (d) => JSON.parse(d.stateJson());
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const YES = 2;
const NO = 1;
// Every pair of in-flow siblings that overlap, and every in-flow child that
// passes its parent's bottom or right edge — layout-check's two rules.
const faults = (d) => {
  d.displayListJson();
  const out = [];
  const r = (e) => ({ x: e.calculatedX, y: e.calculatedY, w: e.calculatedWidth, h: e.calculatedHeight });
  const walk = (el) => {
    const p = r(el);
    const flow = el.children.filter((k) => k.position !== "absolute");
    for (const k of flow) {
      const q = r(k);
      if (q.h > 0 && p.h > 0 && q.y + q.h > p.y + p.h + 0.5) out.push(`${k.id || k.className} bottom past ${el.id || el.className}`);
      if (q.w > 0 && p.w > 0 && q.x + q.w > p.x + p.w + 0.5) out.push(`${k.id || k.className} right past ${el.id || el.className}`);
    }
    for (let i = 0; i < flow.length; i++) for (let j = i + 1; j < flow.length; j++) {
      const a = r(flow[i]); const b = r(flow[j]);
      if (a.w <= 0 || a.h <= 0 || b.w <= 0 || b.h <= 0) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0.5 && oy > 0.5) out.push(`${flow[i].id || flow[i].className} and ${flow[j].id || flow[j].className} overlap`);
    }
    for (const k of el.children) walk(k);
  };
  walk(d.root);
  return out;
};

const A_OPTS = [
  ["product", "Shipping product work", "Roadmap, sprint board and release notes", "A"],
  ["clients", "Running client projects", "Separate spaces, budgets and approvals", "B"],
  ["research", "Tracking research", "Interview notes, findings and shared tags", "C"],
];
const B_OPTS = [
  ["digest", "Daily digest", "One summary of yesterday, sent at 08:00", "A"],
  ["release", "Release notes", "Posted to the channel whenever a version ships", "B"],
  ["incident", "Incident alerts", "Raised the moment a service starts degrading", "C"],
  ["weekly", "Weekly roll-up", "Team activity, every Friday afternoon", "D"],
  ["billing", "Billing reminders", "Three working days before an invoice falls due", "E"],
  ["access", "Access reviews", "A quarterly check on who can see what", "F"],
];

// =============================================================================
console.log("--- as it loads ---");
{
  const d = fresh();
  ok("the stylesheet parses with no error", d.styleErrorCount() === 0, d.styleErrorCount());
  ok("laid out 1040 wide", d.widthPx() === 1040);
  ok("card A's question", byId(d, "qa-s0-title").textContent === "What will you use the workspace for?");
  ok("card A's description", byId(d, "qa-s0-desc").textContent === "This picks the default views. Nothing here is permanent.");
  ok("card A says Question 1 of 3", byId(d, "qa-progress").textContent === "Question 1 of 3");
  const pa = rect(d, "qa-progress"); const ta = rect(d, "qa-s0-title");
  ok("…at the top right, beside the question", pa.x > ta.x + ta.w && Math.abs(pa.y - ta.y) < 2, [pa, ta]);
  ok("card A has three options, as in the picture", A_OPTS.every(([v, l, s, k]) => JSON.stringify(words(byId(d, "qa-s0-" + v))) === JSON.stringify([l, s, k])),
    A_OPTS.map(([v]) => words(byId(d, "qa-s0-" + v))));
  ok("card B's question", byId(d, "qb-s0-title").textContent === "Which workflows should we switch on?");
  ok("card B says Question 1 of 3 at the left", byId(d, "qb-progress").textContent === "Question 1 of 3");
  ok("and 0 of 6 selected at the right", byId(d, "qb-count").textContent === "0 of 6 selected");
  const pb = rect(d, "qb-progress"); const cb = rect(d, "qb-count"); const card = rect(d, "qb");
  ok("…on one line, badge flush right", Math.abs(pb.x - card.x) < 1 && Math.abs(cb.x + cb.w - (card.x + card.w)) < 1 && Math.abs((pb.y + pb.h / 2) - (cb.y + cb.h / 2)) < 2, [pb, cb, card]);
  ok("card B has six checkbox options A–F", B_OPTS.every(([v, l, s, k]) => JSON.stringify(words(byId(d, "qb-s0-" + v))) === JSON.stringify([l, s, k])),
    B_OPTS.map(([v]) => words(byId(d, "qb-s0-" + v))));
  ok("both say Next", words(byId(d, "qa-next"))[0] === "Next" && words(byId(d, "qb-next"))[0] === "Next");
  ok("no Back on the first question", !byId(d, "qa-back") && !byId(d, "qb-back"));
  const nA = rect(d, "qa-next"); const qa = rect(d, "qa");
  ok("card A's Next sits in the footer band, right-aligned", nA.x + nA.w > qa.x + qa.w - 30 && nA.y > rect(d, "qa-s0").y + rect(d, "qa-s0").h, [nA, qa]);
  const band = d.root.children[0].children[0].children[0].children.find((k) => /qn-band/.test(k.className));
  ok("the band is light grey", band && JSON.stringify(band.backgroundColor ? [band.backgroundColor.r, band.backgroundColor.g, band.backgroundColor.b].map((v) => Math.round(v <= 1 ? v * 255 : v)) : null) === "[250,250,250]",
    band && band.backgroundColor);
  const nB = rect(d, "qb-next");
  ok("card B's Next is at the bottom right", nB.x + nB.w > card.x + card.w - 1 && nB.y > rect(d, "qb-s0-access").y, nB);
  ok("nothing overlaps at 1040", faults(d).length === 0, faults(d));
  ok("no accessibility lint", d.a11yProblems().length === 0, d.a11yProblems());
}

// =============================================================================
console.log("--- navigation and validation ---");
{
  const d = fresh();
  ok("Next on an unanswered required question is refused", d.press("qa-next") && st(d).qa.step === 0);
  ok("…with the inline error", st(d).qa.error === "Choose an option to continue." && byId(d, "qa-error").textContent === "Choose an option to continue.");
  let t = tree(d);
  ok("…the group is aria-invalid and described by the error", t.byId.get("qa-s0").invalid === "true" && t.byId.get("qa-s0").describedby === "qa-error", t.byId.get("qa-s0"));
  ok("…the status region says it", t.byId.get("qa-live").name === "Choose an option to continue.");
  ok("…and the focus goes into the group", d.focused === "qa-s0-product", d.focused);
  d.press("qa-s0-clients");
  ok("answering clears the error", st(d).qa.error === "" && !byId(d, "qa-error"));
  t = tree(d);
  ok("…and the group is described by its description again", t.byId.get("qa-s0").describedby === "qa-s0-desc" && !t.byId.get("qa-s0").invalid, t.byId.get("qa-s0"));
  d.press("qa-next");
  ok("Next moves on: Question 2 of 3", st(d).qa.step === 1 && byId(d, "qa-progress").textContent === "Question 2 of 3");
  ok("…the new question is drawn", byId(d, "qa-s1-title").textContent === "How many people will join you?" && !byId(d, "qa-s0"));
  ok("…Back appears", !!byId(d, "qa-back"));
  d.press("qa-back");
  ok("Back returns with the answer kept", st(d).qa.step === 0 && st(d).qa.chosen === "clients");
  d.press("qa-next");
  d.press("qa-s1-small");
  d.press("qa-next");
  ok("the third question is the scale", st(d).qa.step === 2 && st(d).qa.kind === "scale" && !!byId(d, "qa-s2-3"));
  ok("…and the last question's button says Finish", words(byId(d, "qa-next"))[0] === "Finish");
  d.press("qa-next");
  ok("an optional question can be left empty", st(d).qa.done === true, st(d).qa);
  // Card B's gate says "at least one".
  d.press("qb-next");
  ok("card B refuses with 'at least one'", st(d).qb.error === "Choose at least one option to continue.");
  ok("card A and card B are independent", st(d).qa.done && st(d).qb.step === 0);
}

// =============================================================================
console.log("--- the keyboard ---");
{
  const d = fresh();
  ok("a letter with the focus outside the questionnaire does nothing", d.key("a") === false && st(d).qa.chosen === "");
  d.setFocus("qa-s0-product");
  ok("B picks the second option", d.key("b") && st(d).qa.chosen === "clients" && d.focused === "qa-s0-clients");
  ok("lower and upper case both", d.key("C") && st(d).qa.chosen === "research");
  ok("Ctrl+A is not a shortcut", d.keyWith("a", false, true) === false && st(d).qa.chosen === "research");
  ok("a letter past the options is not taken", d.key("f") === false);
  ok("ArrowDown wraps to the first AND selects it", d.key("ArrowDown") && d.focused === "qa-s0-product" && st(d).qa.chosen === "product");
  ok("ArrowUp wraps to the last and selects it", d.key("ArrowUp") && d.focused === "qa-s0-research" && st(d).qa.chosen === "research");
  ok("ArrowRight / ArrowLeft step too", d.key("ArrowLeft") && st(d).qa.chosen === "clients" && d.key("ArrowRight") && st(d).qa.chosen === "research");
  ok("Home and End", d.key("Home") && st(d).qa.chosen === "product" && d.key("End") && st(d).qa.chosen === "research");
  ok("Space on a radio keeps it checked", d.key(" ") && st(d).qa.chosen === "research");
  let t = tree(d);
  ok("one roving tab stop in the radio group: the checked one",
    A_OPTS.filter(([v]) => t.byId.get("qa-s0-" + v).focusable).map(([v]) => v).join() === "research");
  ok("Enter is Next", d.key("Enter") && st(d).qa.step === 1);
  ok("…and the focus is on the new question", d.focused === "qa-s1-solo", d.focused);
  t = tree(d);
  ok("…the status region announces it", t.byId.get("qa-live").name === "Question 2 of 3: How many people will join you?", t.byId.get("qa-live").name);
  ok("Enter on an unanswered required question stays, with the error", d.key("Enter") && st(d).qa.step === 1 && st(d).qa.error !== "");
  d.key("a");
  d.setFocus("qa-back");
  ok("Enter on Back goes back", d.key("Enter") && st(d).qa.step === 0 && d.focused === "qa-s0-research", [st(d).qa.step, d.focused]);
  d.key("Enter");
  d.key("Enter");
  ok("digits pick on the scale", d.key("4") && st(d).qa.chosen === "4" && d.focused === "qa-s2-4");
  ok("letters are not a scale's keys", d.key("a") === false && st(d).qa.chosen === "4");
  ok("the arrows walk the scale and select", d.key("ArrowRight") && st(d).qa.chosen === "5");

  // The checkbox group.
  d.setFocus("qb-s0-digest");
  ok("A toggles Daily digest on", d.key("a") && st(d).qb.chosen === "digest");
  ok("…and C toggles Incident alerts on", d.key("c") && st(d).qb.chosen === "digest,incident" && d.focused === "qb-s0-incident");
  ok("A again toggles it off", d.key("A") && st(d).qb.chosen === "incident");
  ok("letters in card B do not touch card A", st(d).qa.chosen === "5");
  const before = st(d).qb.chosen;
  ok("ArrowDown moves the focus only", d.key("ArrowDown") && d.focused === "qb-s0-release" && st(d).qb.chosen === before);
  ok("ArrowUp moves it back, nothing checked", d.key("ArrowUp") && d.focused === "qb-s0-digest" && st(d).qb.chosen === before);
  ok("ArrowUp from the first wraps to the last", d.key("ArrowUp") && d.focused === "qb-s0-access");
  ok("Space toggles the focused checkbox", d.key(" ") && st(d).qb.chosen === "incident,access");
  ok("Space again untoggles it", d.key(" ") && st(d).qb.chosen === "incident");
  t = tree(d);
  ok("one roving tab stop in the checkbox group: the focused one",
    B_OPTS.filter(([v]) => t.byId.get("qb-s0-" + v).focusable).map(([v]) => v).join() === "access");
  ok("ownsKey claims the letters, arrows, Space and Enter in the card",
    ["a", "ArrowDown", " ", "Enter"].every((k) => d.ownsKey(k)) && !d.ownsKey("z"));
  ok("Enter goes Next from the checkbox group", d.key("Enter") && st(d).qb.step === 1 && d.focused === "qb-s1-email");
}

// =============================================================================
console.log("--- the selected count ---");
{
  const d = fresh();
  d.setFocus("qb-s0-digest");
  const counts = [];
  for (const k of ["a", "b", "c", "d", "e", "f"]) { d.key(k); counts.push(byId(d, "qb-count").textContent); }
  ok("the badge counts up to 6 of 6", counts.join("|") === "1 of 6 selected|2 of 6 selected|3 of 6 selected|4 of 6 selected|5 of 6 selected|6 of 6 selected", counts);
  d.key("b");
  ok("…and down", byId(d, "qb-count").textContent === "5 of 6 selected");
  const t = tree(d);
  ok("the badge is a status (announced as it changes)", t.byId.get("qb-count").role === "status" && t.byId.get("qb-count").name === "5 of 6 selected");
  ok("the status region says what changed", t.byId.get("qb-live").name === "Release notes not selected. 5 of 6 selected.", t.byId.get("qb-live").name);
  ok("each checkbox is checked as drawn", B_OPTS.map(([v]) => t.byId.get("qb-s0-" + v).checked).join() === [YES, NO, YES, YES, YES, YES].join());
  const on = byId(d, "qb-s0-digest");
  ok("a selected row carries the selected look (qn-opt-on, a filled check)", /qn-opt-on/.test(on.className) && on.children.some((k) => /qn-check-on/.test(k.className) && k.children.length === 1));
  ok("an unselected row does not", !/qn-opt-on/.test(byId(d, "qb-s0-release").className));
  d.key("Enter");
  ok("no count badge on a single-choice step", !byId(d, "qb-count"));
}

// =============================================================================
console.log("--- summary and restart ---");
{
  const d = fresh();
  d.setFocus("qa-s0-product");
  for (const k of ["a", "Enter", "c", "Enter", "2", "Enter"]) d.key(k);
  ok("Finish shows the summary", st(d).qa.done && !!byId(d, "qa-summary"));
  ok("…the answers in order", st(d).qa.answers === "Shipping product work|A whole department|2 of 5", st(d).qa.answers);
  const sum = words(byId(d, "qa-summary-list"));
  ok("…drawn as question / answer pairs", sum.join("|") === "What will you use the workspace for?|Shipping product work|How many people will join you?|A whole department|How familiar are you with tools like this?|2 of 5", sum);
  ok("…the progress says 3 of 3 answered", byId(d, "qa-progress").textContent === "3 of 3 answered");
  ok("…the focus is on the summary heading", d.focused === "qa-summary-title");
  let t = tree(d);
  ok("…which is a heading, and focusable", t.byId.get("qa-summary-title").role === "heading" && t.byId.get("qa-summary-title").focusable === true);
  ok("…a list of three items", t.byId.get("qa-summary-list").role === "list" && t.nodes.filter((n) => n.p === "qa-summary-list" && n.role === "listitem").length === 3);
  ok("…announced", t.byId.get("qa-live").name === "All done. 3 of 3 answered. Review your answers.");
  ok("…with Back and Start over", !!byId(d, "qa-back") && !!byId(d, "qa-restart") && !byId(d, "qa-next"));
  d.press("qa-back");
  ok("Back from the summary returns to the last question", !st(d).qa.done && st(d).qa.step === 2 && st(d).qa.chosen === "2");
  d.press("qa-next");
  d.press("qa-restart");
  ok("Start over clears every answer and goes to question 1", st(d).qa.step === 0 && !st(d).qa.done && st(d).qa.answers === "Skipped|Skipped|Skipped");
  ok("…the focus is on its first option", d.focused === "qa-s0-product");
  t = tree(d);
  ok("…and it is said", t.byId.get("qa-live").name === "Started over. Question 1 of 3: What will you use the workspace for?", t.byId.get("qa-live").name);
  // An empty optional answer reads "Skipped".
  d.press("qb-s0-weekly");
  d.press("qb-next");
  d.press("qb-s1-slack");
  d.press("qb-next");
  d.press("qb-next");
  ok("card B's summary, the scale skipped", st(d).qb.answers === "Weekly roll-up|Slack|Skipped", st(d).qb.answers);
  const skip = byId(d, "qb-summary-list").children.filter((k) => k.id).pop().children[1];
  ok("…Skipped is drawn muted", /qn-sum-skip/.test(skip.className));
  ok("Enter on the summary heading is not Next", d.key("Enter") === false);
  d.setFocus("qb-restart");
  ok("Enter on Start over starts over", d.key("Enter") && st(d).qb.step === 0 && st(d).qb.answers === "Skipped|Skipped|Skipped");
  ok("no lint along the way", d.a11yProblems().length === 0, d.a11yProblems());
}

// =============================================================================
console.log("--- semantics ---");
{
  const d = fresh();
  let t = tree(d);
  ok("each card is a form named after it", t.byId.get("qa").role === "form" && t.byId.get("qa").name === "Workspace setup" && t.byId.get("qb").role === "form" && t.byId.get("qb").name === "Notifications");
  const g = t.byId.get("qa-s0");
  ok("the single-choice step is a radiogroup labelled by the question", g.role === "radiogroup" && g.labelledby === "qa-s0-title" && g.name === "What will you use the workspace for?", g);
  ok("…described by its description", g.describedby === "qa-s0-desc" && g.desc === "This picks the default views. Nothing here is permanent.");
  ok("…required", g.required === "true");
  ok("the question is a level-2 heading", t.byId.get("qa-s0-title").role === "heading" && t.byId.get("qa-s0-title").level === 2);
  ok("the options are radios with name and description",
    A_OPTS.every(([v, l, s]) => { const n = t.byId.get("qa-s0-" + v); return n.role === "radio" && n.name === l && n.desc === s && n.checked === NO && n.p === "qa-s0"; }));
  const gb = t.byId.get("qb-s0");
  ok("the multiple-choice step is a group labelled by the question", gb.role === "group" && gb.labelledby === "qb-s0-title" && gb.describedby === "qb-s0-desc", gb);
  ok("the options are checkboxes with name and description",
    B_OPTS.every(([v, l, s]) => { const n = t.byId.get("qb-s0-" + v); return n.role === "checkbox" && n.name === l && n.desc === s && n.p === "qb-s0"; }));
  ok("the progress text is visible text in the tree", t.byId.get("qa-progress").role === "text" && t.byId.get("qa-progress").b[2] > 40);
  ok("each card has a status region", t.byId.get("qa-live").role === "status" && t.byId.get("qb-live").role === "status");
  ok("…visually hidden", t.byId.get("qa-live").b[2] <= 1 && t.byId.get("qa-live").b[3] <= 1);
  ok("the key badges and drawn parts are not in the tree", !t.nodes.some((n) => ["A", "B", "C"].includes(n.name) && n.role === "text"));
  ok("Back / Next are buttons", t.byId.get("qa-next").role === "button" && t.byId.get("qa-next").name === "Next");
  d.press("qa-s0-product");
  d.press("qa-next");
  d.press("qa-s1-solo");
  d.press("qa-next");
  t = tree(d);
  const pts = [1, 2, 3, 4, 5].map((i) => t.byId.get("qa-s2-" + i));
  ok("a scale is a radiogroup of five radios, the ends named with their labels",
    t.byId.get("qa-s2").role === "radiogroup" && pts.every((n) => n.role === "radio") && pts[0].name === "1, New to it" && pts[4].name === "5, Expert" && pts[2].name === "3");
  ok("an optional step is not required", t.byId.get("qa-s2").required === undefined);
  ok("no lint", d.a11yProblems().length === 0, d.a11yProblems());
}

// =============================================================================
console.log("--- the transition ---");
{
  const d = fresh();
  ok("still at rest", d.busyNow() === false);
  d.press("qa-s0-product");
  d.press("qa-next");
  d.displayListJson();
  const body = byId(d, "qa-s1-body");
  ok("a new step body starts faded and to the right", d.busyNow() && body.opacity < 0.05 && body.translateX > 10, [body.opacity, body.translateX]);
  d.tick(80);
  ok("half way", body.opacity > 0.2 && body.opacity < 0.95 && body.translateX > 0 && body.translateX < 10, [body.opacity, body.translateX]);
  d.tick(200);
  ok("and settled", !d.busyNow() && body.opacity === 1 && body.translateX === 0, [body.opacity, body.translateX]);
  d.setHover("qa-s1-small");
  d.displayListJson();
  ok("a hover afterwards does not replay it", byId(d, "qa-s1-body").opacity === 1 && !/qn-enter/.test(byId(d, "qa-s1-body").className));
  const s = fresh(0, true);
  s.press("qa-s0-product");
  s.press("qa-next");
  s.displayListJson();
  ok("with reduced motion the step appears at once", !s.busyNow() && byId(s, "qa-s1-body").opacity === 1 && byId(s, "qa-s1-body").translateX === 0);
}

// =============================================================================
console.log("--- a phone ---");
for (const w of [358, 390]) {
  const d = fresh(w);
  ok(`${w}: laid out ${w} wide`, d.widthPx() === w);
  const fa = rect(d, "qn-frame-a"); const fb = rect(d, "qn-frame-b");
  ok(`${w}: the frames stack`, fa.y + fa.h <= fb.y && Math.abs(fa.x - fb.x) < 1, [fa, fb]);
  const ca = rect(d, "qa"); const cb = rect(d, "qb");
  ok(`${w}: the cards fit the width`, ca.x >= 0 && ca.x + ca.w <= w && cb.x + cb.w <= w, [ca, cb]);
  ok(`${w}: nothing overlaps or spills`, faults(d).length === 0, faults(d));
  ok(`${w}: the page is as tall as the cards`, d.heightPx() >= cb.y + cb.h);
  const o = rect(d, "qb-s0-billing");
  ok(`${w}: a long option wraps inside its row`, o.h > 70 && o.x + o.w <= cb.x + cb.w + 0.5, o);
  d.press(d.hitId(o.x + o.w / 2, o.y + o.h / 2));
  ok(`${w}: a tap on it toggles it`, st(d).qb.chosen === "billing");
  d.setFocus("qb-s0-billing");
  d.key("Enter");
  d.displayListJson();
  ok(`${w}: the next step lays out too`, faults(d).length === 0 && st(d).qb.step === 1, faults(d));
  ok(`${w}: no lint`, d.a11yProblems().length === 0, d.a11yProblems());
}

// =============================================================================
// THE BROWSER
// =============================================================================
console.log("--- the page, in Chromium ---");
if (!fs.existsSync(path.join(HERE, "bundle.js"))) {
  console.log("  FAIL bundle.js missing — run `node gallery/evgui/demo/build.mjs` first");
  failed++;
} else {
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(ROOT, rel.slice(1));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(fs.readFileSync(file));
  });
  // Port 0: the system picks a free one.
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/gallery/evgui/demo/index.html?demo=questionnaire`;
  const { chromium } = requireHostTool("playwright-core");
  const browser = await chromium.launch({ executablePath: findChromium() });
  const open = async (viewport, reduced = false) => {
    const ctx = await browser.newContext({ viewport, reducedMotion: reduced ? "reduce" : "no-preference" });
    const page = await ctx.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push("uncaught: " + e.message.split("\n")[0]));
    page.on("console", (m) => { if (m.type() === "error") problems.push("console.error: " + m.text().split("\n")[0]); });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction("document.querySelector('#stage canvas') && window.__qnState && window.__lastA11y", null, { timeout: 20000 });
    await page.waitForTimeout(300);
    return { ctx, page, problems };
  };
  const at = async (page, id) => {
    await page.evaluate((id) => {
      const b = window.__qnBox(id).split(",").map(Number);
      const c = document.querySelector("#stage canvas").getBoundingClientRect();
      const s = window.__stageScale || 1;
      const y = c.top + (b[1] + b[3] / 2) * s;
      if (y < 80 || y > window.innerHeight - 80) window.scrollBy(0, y - window.innerHeight / 2);
    }, id);
    return page.evaluate((id) => {
      const b = window.__qnBox(id).split(",").map(Number);
      const c = document.querySelector("#stage canvas").getBoundingClientRect();
      const s = window.__stageScale || 1;
      return { x: c.left + (b[0] + b[2] / 2) * s, y: c.top + (b[1] + b[3] / 2) * s };
    }, id);
  };
  const click = async (page, id) => {
    const p = await at(page, id);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(60);
  };
  const state = (page) => page.evaluate(() => window.__qnState());
  const press = async (page, key) => { await page.keyboard.press(key); await page.waitForTimeout(40); };
  const mirror = (page, id) => page.evaluate((id) => {
    const el = document.querySelector(`[data-a11y-id="${id}"]`);
    if (!el) return null;
    const ref = (a) => { const v = el.getAttribute(a); const t = v ? document.getElementById(v) : null; return t ? t.textContent || t.getAttribute("aria-label") || "" : null; };
    return {
      role: el.getAttribute("role"), label: el.getAttribute("aria-label"), checked: el.getAttribute("aria-checked"),
      labelledby: ref("aria-labelledby"), describedby: ref("aria-describedby"), desc: el.getAttribute("aria-description"),
      invalid: el.getAttribute("aria-invalid"), text: el.textContent, tabindex: el.tabIndex, live: el.getAttribute("aria-live"),
    };
  }, id);

  {
    const { ctx, page, problems } = await open({ width: 1440, height: 900 });
    ok("the page loads with no error", problems.length === 0, problems);
    ok("motion allowed: the demo slides steps in", (await state(page)).still === false);
    const names = await page.evaluate(() => [...document.querySelectorAll("#demos input[type=radio]")].map((r) => r.value));
    ok("the switcher offers Questionnaire", names.includes("questionnaire"));
    let m = await mirror(page, "qa-s0");
    ok("mirror: the radiogroup is labelled by the question and described by the description",
      m && m.role === "radiogroup" && m.labelledby === "What will you use the workspace for?" && m.describedby === "This picks the default views. Nothing here is permanent.", m);
    m = await mirror(page, "qb-s0-digest");
    ok("mirror: a checkbox with its name, description and state", m && m.role === "checkbox" && (m.label || m.text) === "Daily digest" && m.checked === "false" && (m.desc === "One summary of yesterday, sent at 08:00" || m.describedby), m);
    m = await mirror(page, "qb-count");
    ok("mirror: the count is a status with its text", m && m.role === "status" && m.text === "0 of 6 selected", m);

    await click(page, "qa-next");
    let s = await state(page);
    ok("a click on Next with nothing chosen shows the error", s.qa.step === 0 && s.qa.error === "Choose an option to continue.");
    m = await mirror(page, "qa-s0");
    ok("mirror: the group is invalid and described by the error", m.invalid === "true" && m.describedby === "Choose an option to continue.", m);
    m = await mirror(page, "qa-live");
    ok("mirror: the status region carries it", m && m.text === "Choose an option to continue.", m);

    await click(page, "qa-s0-research");
    ok("a click picks an option", (await state(page)).qa.chosen === "research");
    // The real keyboard. The focus is on the option the click chose.
    await press(page, "b");
    ok("B on the keyboard picks the second option", (await state(page)).qa.chosen === "clients");
    await press(page, "ArrowDown");
    ok("ArrowDown selects the next one", (await state(page)).qa.chosen === "research");
    await press(page, "Enter");
    s = await state(page);
    ok("Enter goes Next", s.qa.step === 1 && s.focused === "qa-s1-solo", s);
    const active = await page.evaluate(() => { const a = document.activeElement; return a && a.dataset ? a.dataset.a11yId : ""; });
    ok("…and the DOM focus is on the new question's option", active === "qa-s1-solo", active);
    m = await mirror(page, "qa-live");
    ok("mirror: the step change is announced", m.text === "Question 2 of 3: How many people will join you?", m);
    await page.waitForTimeout(300);
    await press(page, "a");
    // Tab: the group, then Back, then Next, then card B's group.
    const walk = [];
    for (let i = 0; i < 4; i++) { await press(page, "Tab"); walk.push((await state(page)).focused); }
    ok("Tab walks Back, Next, then card B's options as ONE stop, then its Next", walk.join() === "qa-back,qa-next,qb-s0-digest,qb-next", walk);
    await press(page, "Shift+Tab");
    ok("Shift+Tab back into the checkbox group", (await state(page)).focused === "qb-s0-digest");
    await press(page, "ArrowDown");
    await press(page, "ArrowDown");
    s = await state(page);
    ok("the arrows move the focus in the checkbox group, checking nothing", s.focused === "qb-s0-incident" && s.qb.chosen === "", s);
    await press(page, "Space");
    await press(page, "f");
    s = await state(page);
    ok("Space and F toggle", s.qb.chosen === "incident,access" && s.qb.count === "2 of 6 selected", s.qb);
    m = await mirror(page, "qb-count");
    ok("mirror: the badge says 2 of 6 selected", m.text === "2 of 6 selected");
    await press(page, "Shift+Tab");
    await press(page, "Tab");
    ok("Tab back into the group lands on the option last focused", (await state(page)).focused === "qb-s0-access");
    const kbStops = await page.evaluate(() => window.__kbStops());
    ok("the page's tab stops: one per group, plus the buttons", kbStops.join() === "qa-s1-solo,qa-back,qa-next,qb-s0-access,qb-next,qc-s0-1,qc-next,qc-sim,qc-clear", kbStops);
    await press(page, "Enter");
    await press(page, "c");
    await press(page, "Enter");
    await press(page, "Enter");
    s = await state(page);
    ok("Enter, C, Enter, Enter: card B's summary", s.qb.done && s.qb.answers === "Incident alerts, Access reviews|In the app|Skipped", s.qb);
    ok("…focused on its heading", s.focused === "qb-summary-title");
    await click(page, "qb-restart");
    s = await state(page);
    ok("a click on Start over restarts", s.qb.step === 0 && !s.qb.done && s.qb.answers === "Skipped|Skipped|Skipped");
    // The Styles panel's own validator, on this sheet.
    const found = await page.evaluate((css) => window.__styles.validate(css), CSS);
    ok("the Styles panel reports no problem in questionnaire.css", Array.isArray(found) && found.length === 0, found);
    ok("no errors along the way", problems.length === 0, problems);
    await ctx.close();
  }

  {
    const { ctx, page, problems } = await open({ width: 390, height: 844 });
    const fit = await page.evaluate(() => ({
      scroll: document.scrollingElement.scrollWidth, inner: window.innerWidth,
      scale: window.__stageScale || 1, w: parseFloat(document.querySelector("#stage canvas").style.width),
    }));
    ok("390: no horizontal scroll", fit.scroll <= fit.inner, fit);
    ok("390: laid out at the room's width, at 1:1", fit.scale === 1 && fit.w <= 390 && fit.w >= 320, fit);
    await click(page, "qb-s0-billing");
    ok("390: a tap toggles an option", (await state(page)).qb.chosen === "billing");
    await click(page, "qb-next");
    ok("390: and Next moves on", (await state(page)).qb.step === 1);
    ok("390: no errors", problems.length === 0, problems);
    await ctx.close();
  }

  {
    // Card C: made from forms/feedback.form.md; Finish hands the answer to the
    // store, the results panel counts it, the page keeps it between visits.
    const { ctx, page, problems } = await open({ width: 1440, height: 900 });
    await page.evaluate(() => { try { localStorage.removeItem("evgui.questionnaire.answers"); } catch (e) {} });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction("window.__qnState");
    let s = await state(page);
    ok("card C: the file's three questions, none answered yet", s.qc.step === 0 && s.qc.kind === "scale" && s.total === 0, s);
    await click(page, "qc-s0-4");
    await click(page, "qc-next");
    await click(page, "qc-next");
    s = await state(page);
    ok("card C: the file's `required` gates Next", s.qc.step === 1 && s.qc.error !== "", s.qc);
    await click(page, "qc-s1-workflows");
    await click(page, "qc-next");
    ok("card C: the multi question is optional", (await state(page)).qc.kind === "multiple");
    await click(page, "qc-s2-a-colleague");
    await click(page, "qc-next");
    s = await state(page);
    ok("card C: Finish saves the answer once, with a receipt", s.qc.done && s.total === 1 && s.receipt === "r1", s);
    ok("card C: the summary reads back the answer", s.qc.answers === "4 of 5|Workflows|A colleague", s.qc);
    let m = await mirror(page, "qc-res-topic-1");
    ok("card C: the results count it (Workflows: 1)", m && m.text === "Workflows: 1", m);
    await press(page, "Enter");
    ok("card C: a key on the summary does not count it twice", (await state(page)).total === 1);
    await click(page, "qc-restart");
    s = await state(page);
    ok("card C: Next respondent starts an empty answer", !s.qc.done && s.qc.step === 0 && s.receipt === "", s);
    await click(page, "qc-sim");
    ok("card C: Add 20 answers", (await state(page)).total === 21);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForFunction("window.__qnState");
    ok("card C: the answers are still there after a reload", (await state(page)).total === 21);
    await click(page, "qc-clear");
    m = await mirror(page, "qc-res-topic-1");
    ok("card C: Clear empties the counts", (await state(page)).total === 0 && m && m.text === "Workflows: 0", m);
    ok("card C: no errors", problems.length === 0, problems);
    await ctx.close();
  }

  {
    const { ctx, page, problems } = await open({ width: 1440, height: 900 }, true);
    await click(page, "qa-s0-product");
    await click(page, "qa-next");
    const s = await state(page);
    ok("reduced motion (the browser's setting) reaches the demo", s.still === true && s.qa.step === 1, s);
    const body = await page.evaluate(() => window.__qnBox("qa-s1-body"));
    ok("reduced motion: the new step is there at once", body !== "", body);
    ok("reduced motion: no errors", problems.length === 0, problems);
    await ctx.close();
  }

  await browser.close();
  server.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) console.log(`RESULT FAIL — failed=${failed}`);
else console.log("RESULT OK — the questionnaire, failed=0");
process.exit(failed ? 1 : 0);

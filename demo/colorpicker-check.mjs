#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The Color Picker demo, checked twice: in Node against the compiled demo,
// and in a real Chromium page for what only a browser has — the pixels the
// eyedropper samples, the loupe it draws, and window.EyeDropper.
//
//   node gallery/evgui/demo/colorpicker-check.mjs
//
// Node:
//   conversions   RGB -> HSV -> RGB over the whole gamut (every third level of
//                 each channel, and every grey), hex in and out, integer HSL
//                 -> HSV -> HSL, and known values from CSS
//   parsing       what reads (hex of 3/4/6/8 digits, rgb(), rgba(), hsl(),
//                 hsla(), spaces and "/ alpha") and what does not; a grey
//                 keeps its hue; typed values apply live, clamp or revert on
//                 blur
//   keyboard      every part: the area, the hue and alpha sliders, the
//                 fields, the format button, the swatches, the pipette, the
//                 trigger; Enter commits and Escape restores in a popover
//   pointer       drags on the area, the hue and the alpha, and the thumbs
//                 drawn where the pointer put them
//   semantics     the trigger (haspopup dialog, named with the colour), the
//                 area (a 2D slider with its valuetext), the sliders, the
//                 fields, the swatches; no lint in any state
//   phone         laid out at 320 and 342 wide: nothing past the page edge,
//                 an open dialog inside it
//
// Browser:
//   the page loads with no error; EyeDropper is detected (and a stub stands
//   in for it, and its absence is explained); the pipette enters pick mode,
//   the loupe's cells are the framebuffer's pixels round the pointer, an
//   arrow moves the point one device pixel (also at devicePixelRatio 2), a
//   click or Enter picks exactly the pixel, Escape leaves the colour alone;
//   the popover opens, a drag on the hue moves it, Escape restores; and the
//   page does not scroll sideways at 390px.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { requireHostTool, findChromium } from "../../ui/conformance/dom-adapter.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");
const require = createRequire(import.meta.url);

const M = require(path.join(ROOT, "gallery/evgui/bin/ColorPickerDemo.cjs"));
const CSS = fs.readFileSync(path.join(HERE, "colorpicker.css"), "utf8");
const C = M.ColorPickerCtl;

let passed = 0;
let failed = 0;
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log("  PASS " + name); }
  else { failed++; console.log("  FAIL " + name + (detail !== undefined ? " — " + JSON.stringify(detail) : "")); }
};

const fresh = (w = 900) => {
  const d = new M.ColorPickerDemo();
  d.pageW = w;
  d.init(CSS);
  d.displayListJson();
  return d;
};
const st = (d) => JSON.parse(d.stateJson());
const tree = (d) => {
  const t = JSON.parse(d.a11yJson(1, d.focused || ""));
  t.byId = new Map(t.nodes.map((n) => [n.id, n]));
  return t;
};
const box = (d, id) => {
  const b = d.boxOf(id);
  if (!b) return null;
  const [x, y, w, h] = b.split(",").map(Number);
  return { x, y, w, h };
};
const ctl = (fmtHex, alpha = true) => {
  const c = new C();
  c.setup("t", "Test", fmtHex, alpha);
  return c;
};
const round = Math.round;

// =============================================================================
console.log("--- conversions ---");
{
  // Every third level of each channel (0, 3, … 255): 636,056 colours.
  let bad = 0;
  let first = null;
  const levels = [];
  for (let v = 0; v <= 255; v += 3) levels.push(v);
  for (const r of levels) for (const g of levels) for (const b of levels) {
    const hsv = C.rgbToHsv(r, g, b);
    const back = C.hsvToRgb(hsv[0] < 0 ? 0 : hsv[0], hsv[1] < 0 ? 0 : hsv[1], hsv[2]);
    if (round(back[0]) !== r || round(back[1]) !== g || round(back[2]) !== b) {
      bad++;
      if (!first) first = [r, g, b, hsv, back];
    }
  }
  ok("RGB -> HSV -> RGB is exact over the gamut (86^3 colours)", bad === 0, first);
  let greys = 0;
  for (let v = 0; v <= 255; v++) {
    const hsv = C.rgbToHsv(v, v, v);
    const back = C.hsvToRgb(0, 0, hsv[2]);
    if (round(back[0]) !== v || hsv[0] !== -1) greys++;
  }
  ok("every grey round-trips and reports its hue as undefined", greys === 0, greys);
  // Hex in, hex out, through the controller.
  let hexBad = [];
  for (let i = 0; i < 4096; i++) {
    const r = (i * 37) % 256, g = (i * 101) % 256, b = (i * 211) % 256;
    const hex = "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
    const c = ctl(hex, false);
    if (c.hex() !== hex) hexBad.push([hex, c.hex()]);
  }
  ok("hex -> HSVA -> hex is exact (4096 colours)", hexBad.length === 0, hexBad.slice(0, 3));
  let a8 = [];
  for (let a = 0; a < 256; a++) {
    const hex = "#336699" + a.toString(16).padStart(2, "0");
    const c = ctl(hex, true);
    const want = a === 255 ? "#336699" : hex;
    if (c.hex() !== want) a8.push([hex, c.hex()]);
  }
  ok("every 8-digit alpha round-trips", a8.length === 0, a8.slice(0, 3));
  // Integer HSL survives HSL -> HSV -> HSL.
  let hslBad = [];
  for (let h = 0; h < 360; h += 7) for (let s = 0; s <= 100; s += 5) for (let l = 0; l <= 100; l += 5) {
    const hsv = C.hslToHsv(h, s / 100, l / 100);
    const hsl = C.hsvToHsl(hsv[0], hsv[1], hsv[2]);
    const defined = l > 0 && l < 100;
    const okS = !defined || round(hsl[1] * 100) === s;
    if (round(hsl[2] * 100) !== l || !okS || round(hsl[0]) !== h) hslBad.push([h, s, l, hsl]);
  }
  ok("HSL -> HSV -> HSL is exact on integers", hslBad.length === 0, hslBad.slice(0, 3));
  const known = [
    ["#ff0000", "rgb(255, 0, 0)", "hsl(0, 100%, 50%)", "hsv(0, 100%, 100%)"],
    ["#3b82f6", "rgb(59, 130, 246)", "hsl(217, 91%, 60%)", "hsv(217, 76%, 96%)"],
    ["hsl(120, 100%, 25%)", "rgb(0, 128, 0)", "hsl(120, 100%, 25%)", "hsv(120, 100%, 50%)"],
    ["#808080", "rgb(128, 128, 128)", "hsl(0, 0%, 50%)", "hsv(0, 0%, 50%)"],
    ["rgb(255, 255, 0)", "rgb(255, 255, 0)", "hsl(60, 100%, 50%)", "hsv(60, 100%, 100%)"],
    ["#0ea5e9", "rgb(14, 165, 233)", "hsl(199, 89%, 48%)", "hsv(199, 94%, 91%)"],
    ["#fff", "rgb(255, 255, 255)", "hsl(0, 0%, 100%)", "hsv(0, 0%, 100%)"],
  ];
  for (const [inp, rgb, hsl, hsv] of known) {
    const c = ctl(inp, false);
    ok(`${inp} is ${rgb}, ${hsl}, ${hsv}`, c.rgbCss() === rgb && c.hslCss() === hsl && c.hsvCss() === hsv,
      [c.rgbCss(), c.hslCss(), c.hsvCss()]);
  }
  const a = ctl("rgba(0, 128, 255, 0.5)", true);
  ok("rgba(0, 128, 255, 0.5) is #0080ff80 / hsla(210, 100%, 50%, 0.5)",
    a.hex() === "#0080ff80" && a.hslCss() === "hsla(210, 100%, 50%, 0.5)" && a.rgbCss() === "rgba(0, 128, 255, 0.5)",
    [a.hex(), a.hslCss(), a.rgbCss()]);
  // A grey keeps the hue it had; black keeps the saturation.
  const g = ctl("#3b82f6", false);
  const h0 = g.hue;
  g.setFromString("#808080");
  ok("a grey keeps the hue it had", g.hue === h0 && g.hex() === "#808080", [g.hue, h0]);
  const k = ctl("#3b82f6", false);
  const s0 = k.sat;
  k.setFromString("#000000");
  ok("black keeps hue and saturation", k.sat === s0 && k.hue === h0 && k.hex() === "#000000");
}

// =============================================================================
console.log("--- parsing ---");
{
  const good = {
    "#abc": "#aabbcc", "abc": "#aabbcc", "#ABCDEF": "#abcdef", "#abcd": "#aabbccdd",
    "#11223344": "#11223344", "  #112233  ": "#112233", "rgb(1, 2, 3)": "#010203",
    "rgb(1 2 3)": "#010203", "rgba(255,0,0,0.5)": "#ff000080", "rgb(255 0 0 / 50%)": "#ff000080",
    "rgb(100%, 0%, 0%)": "#ff0000", "hsl(0, 100%, 50%)": "#ff0000", "hsl(240deg 100% 50%)": "#0000ff",
    "HSLA(120, 100%, 50%, 0.25)": "#00ff0040",
  };
  for (const [inp, want] of Object.entries(good)) {
    const c = ctl("#000", true);
    const took = c.setFromString(inp);
    ok(`reads ${JSON.stringify(inp)} as ${want}`, took && c.hex() === want, c.hex());
  }
  const bad = ["", "#", "#12", "#12345", "#1234567", "#ggg", "rgb(1, 2)", "rgb(256, 0, 0)", "rgb(1, 2, 3",
    "rgba(0, 0, 0, 2)", "hsl(10, 120%, 50%)", "hsl(a, 10%, 10%)", "red", "rgb(-1, 0, 0)", "12,34,56"];
  for (const inp of bad) {
    const c = ctl("#3b82f6", true);
    const took = c.setFromString(inp);
    ok(`refuses ${JSON.stringify(inp)} and keeps the colour`, !took && c.hex() === "#3b82f6", c.hex());
  }

  // Typing into the inline picker's hex field.
  const d = fresh();
  d.press("cpi-f0");
  ok("a press on the hex field focuses it", d.focused === "cpi-f0" && d.focusedField() === "cpi-f0", d.focused);
  d.applyEdit("cpi-f0", "#ff8", 4, 4);
  ok("a short form does not apply while it is typed (#ff8 may become #ff8800)", st(d).cpi.hex === "#0ea5e9" && st(d).cpi.fields[0] === "#ff8", st(d).cpi);
  d.keyWith("Enter", false, false);
  ok("Enter applies it: #ff8 is #ffff88", st(d).cpi.hex === "#ffff88" && st(d).cpi.editing === "", st(d).cpi.hex);
  d.applyEdit("cpi-f0", "#ff88", 5, 5);
  d.setFocus("cpi-sv");
  ok("four digits read as #rgba when the field is left", st(d).cpi.hex === "#ffff8888", st(d).cpi.hex);
  d.press("cpi-f0");
  d.applyEdit("cpi-f0", "#ff880", 6, 6);
  ok("an unreadable value leaves the colour, and the text as typed", st(d).cpi.hex === "#ffff8888" && st(d).cpi.fields[0] === "#ff880", st(d).cpi);
  d.applyEdit("cpi-f0", "#ff8800", 7, 7);
  ok("#ff8800 applies as it is typed (six digits leave the alpha alone)", st(d).cpi.hex === "#ff880088", st(d).cpi.hex);
  d.applyEdit("cpi-f0", "#ff880080", 9, 9);
  ok("eight digits set the alpha too", st(d).cpi.hex === "#ff880080", st(d).cpi.hex);
  d.applyEdit("cpi-f0", "zz", 2, 2);
  d.setFocus("cpi-sv");
  ok("invalid text reverts on blur", st(d).cpi.fields[0] === "#ff880080" && st(d).cpi.editing === "", st(d).cpi.fields);
  // Number fields: RGB.
  const e = fresh();
  e.press("cpi-fmt");
  ok("the format button cycles HEX -> RGB", st(e).cpi.format === "RGB" && st(e).cpi.fields.join() === "14,165,233,100", st(e).cpi.fields);
  e.press("cpi-f0");
  e.applyEdit("cpi-f0", "300", 3, 3);
  ok("an out-of-range number waits while typed", st(e).cpi.hex === "#0ea5e9");
  e.keyWith("Enter", false, false);
  ok("Enter clamps it to 255", st(e).cpi.hex === "#ffa5e9" && st(e).cpi.fields[0] === "255", st(e).cpi);
  e.applyEdit("cpi-f1", "", 0, 0);
  e.press("cpi-f1");
  e.applyEdit("cpi-f1", "abc", 3, 3);
  e.setFocus("cpi-f2");
  ok("a number field holding letters reverts on blur", st(e).cpi.fields[1] === "165", st(e).cpi.fields);
  e.applyEdit("cpi-f3", "40", 2, 2);
  ok("the alpha field sets alpha (40%)", st(e).cpi.a === 0.4 && st(e).cpi.rgb === "rgba(255, 165, 233, 0.4)", st(e).cpi.rgb);
  // Node's own typing path (no platform session).
  const t = fresh();
  t.press("cpi-f0");
  t.keyWith("a", false, true);
  for (const ch of "#123") t.type(ch);
  t.keyWith("Enter", false, false);
  ok("typing #123 character by character, then Enter, applies it", st(t).cpi.hex === "#112233", st(t).cpi);
}

// =============================================================================
console.log("--- the keyboard ---");
{
  const d = fresh();
  const s0 = st(d).cpi;
  d.setFocus("cpi-sv");
  d.keyWith("ArrowLeft", false, false);
  let s = st(d).cpi;
  ok("area: ArrowLeft takes 1% saturation", round(s.s * 100) === round(s0.s * 100) - 1, [s0.s, s.s]);
  d.keyWith("ArrowDown", true, false);
  s = st(d).cpi;
  ok("area: Shift+ArrowDown takes 10% brightness", round(s.v * 100) === round(s0.v * 100) - 10, s.v);
  d.keyWith("ArrowUp", false, false);
  d.keyWith("ArrowRight", true, false);
  s = st(d).cpi;
  ok("area: ArrowUp / Shift+ArrowRight step back", round(s.v * 100) === round(s0.v * 100) - 9 && round(s.s * 100) === Math.min(100, round(s0.s * 100) + 9), [s.s, s.v]);
  d.keyWith("Home", false, false);
  ok("area: Home is saturation 0", st(d).cpi.s === 0);
  ok("area: its valuetext follows", tree(d).byId.get("cpi-sv").valueText === `Saturation 0%, Brightness ${round(st(d).cpi.v * 100)}%` ||
    JSON.stringify(tree(d).byId.get("cpi-sv")).includes(`Saturation 0%, Brightness ${round(st(d).cpi.v * 100)}%`), tree(d).byId.get("cpi-sv"));

  d.setFocus("cpi-hue");
  const h0 = round(st(d).cpi.h);
  d.keyWith("ArrowRight", false, false);
  ok("hue: ArrowRight adds 1 degree", round(st(d).cpi.h) === h0 + 1, st(d).cpi.h);
  d.keyWith("ArrowLeft", true, false);
  ok("hue: Shift+ArrowLeft takes 10", round(st(d).cpi.h) === h0 - 9, st(d).cpi.h);
  d.keyWith("PageUp", false, false);
  ok("hue: PageUp adds 10", round(st(d).cpi.h) === h0 + 1, st(d).cpi.h);
  d.keyWith("End", false, false);
  ok("hue: End is 360", st(d).cpi.h === 360);
  d.keyWith("Home", false, false);
  ok("hue: Home is 0", st(d).cpi.h === 0);
  ok("hue: a key it does not use is not taken", d.keyWith("x", false, false) === false);

  d.setFocus("cpi-alpha");
  d.keyWith("ArrowLeft", false, false);
  ok("alpha: ArrowLeft takes 1%", round(st(d).cpi.a * 100) === 99, st(d).cpi.a);
  d.keyWith("PageDown", false, false);
  d.keyWith("ArrowDown", true, false);
  ok("alpha: PageDown and Shift+ArrowDown take 10 each", round(st(d).cpi.a * 100) === 79, st(d).cpi.a);
  d.keyWith("Home", false, false);
  ok("alpha: Home is 0, and the hex says so", st(d).cpi.a === 0 && st(d).cpi.hex.length === 9 && st(d).cpi.hex.endsWith("00"), st(d).cpi.hex);
  d.keyWith("End", false, false);

  d.setFocus("cpi-fmt");
  d.keyWith("Enter", false, false);
  ok("format: Enter cycles to RGB", st(d).cpi.format === "RGB");
  d.keyWith("ArrowDown", false, false);
  ok("format: ArrowDown cycles to HSL", st(d).cpi.format === "HSL");
  d.keyWith("ArrowUp", false, false);
  d.keyWith("ArrowUp", false, false);
  ok("format: ArrowUp cycles back to HEX", st(d).cpi.format === "HEX");
  d.keyWith(" ", false, false);

  // Number fields step with the arrows.
  d.setFocus("cpi-f0");
  ok("a number field claims ArrowUp from the text session", d.ownsKey("ArrowUp") === true && d.ownsKey("ArrowLeft") === false);
  const r0 = +st(d).cpi.fields[0];
  d.keyWith("ArrowUp", false, false);
  ok("field: ArrowUp adds 1", +st(d).cpi.fields[0] === Math.min(255, r0 + 1), st(d).cpi.fields);
  d.keyWith("ArrowDown", true, false);
  ok("field: Shift+ArrowDown takes 10", +st(d).cpi.fields[0] === Math.min(255, r0 + 1) - 10, st(d).cpi.fields);
  ok("field: the colour follows the field", JSON.parse(d.stateJson()).cpi.rgb.startsWith("rgb(" + st(d).cpi.fields[0] + ","), st(d).cpi.rgb);
  d.setFocus("cpi-f3");
  d.keyWith("ArrowUp", false, false);
  ok("field: alpha stops at 100", st(d).cpi.fields[3] === "100", st(d).cpi.fields);

  // Swatches: a radio group whose arrows move and apply.
  d.setFocus("cpi-preset-0");
  d.keyWith(" ", false, false);
  ok("swatch: Space applies the red preset", st(d).cpi.hex === "#ef4444", st(d).cpi.hex);
  d.keyWith("ArrowRight", false, false);
  ok("swatch: ArrowRight moves to orange and applies it", d.focused === "cpi-preset-1" && st(d).cpi.hex === "#f97316", [d.focused, st(d).cpi.hex]);
  d.keyWith("ArrowLeft", false, false);
  d.keyWith("ArrowLeft", false, false);
  ok("swatch: ArrowLeft wraps to the last", d.focused === "cpi-preset-7" && st(d).cpi.hex === "#ec4899", [d.focused, st(d).cpi.hex]);
  ok("swatch: the checked radio is the current colour", tree(d).byId.get("cpi-preset-7").checked === 2 && tree(d).byId.get("cpi-preset-0").checked !== 2);

  // The pipette, from the keyboard.
  d.setFocus("cpi-eye");
  d.keyWith("Enter", false, false);
  ok("pipette: Enter enters pick mode", d.pickingTid() === "cpi" && tree(d).byId.get("cpi-eye").pressed === 2, d.pickingTid());
  ok("pick mode: keys are the host's, not the picker's", d.keyWith("ArrowLeft", false, false) === false);
  d.pickCancel();
  ok("pick mode: cancel leaves it and the colour", d.pickingTid() === "" && st(d).cpi.hex === "#ec4899" && d.focused === "cpi-eye");
  d.keyWith(" ", false, false);
  d.pickResult("#123456");
  ok("pick mode: a result sets the colour (alpha kept), focus on the pipette", st(d).cpi.hex === "#123456" && d.pickingTid() === "" && d.focused === "cpi-eye", st(d).cpi);
}

// =============================================================================
console.log("--- the popover ---");
{
  const d = fresh();
  ok("closed: no dialog in the tree", !tree(d).byId.get("cpn-content"));
  d.setFocus("cpn-trigger");
  d.keyWith("Enter", false, false);
  let t = tree(d);
  ok("Enter on the trigger opens it and focuses the area", st(d).cpn.open === true && d.focused === "cpn-sv", d.focused);
  ok("open: aria-expanded, and the dialog is labelled", t.byId.get("cpn-trigger").expanded === 2 && t.byId.get("cpn-content") && t.byId.get("cpn-content").name === "Accent color");
  const content = box(d, "cpn-content");
  const trig = box(d, "cpn-trigger");
  ok("open: under its trigger, 4px away, left edges aligned", Math.abs(content.y - (trig.y + trig.h + 4)) <= 1 && Math.abs(content.x - trig.x) <= 1, [trig, content]);
  d.keyWith("ArrowLeft", true, false);
  d.keyWith("ArrowLeft", true, false);
  ok("keys change the colour while it is open", st(d).cpn.hex !== "#3b82f6", st(d).cpn.hex);
  d.keyWith("Escape", false, false);
  ok("Escape closes, restores #3b82f6 and focuses the trigger", st(d).cpn.open === false && st(d).cpn.hex === "#3b82f6" && d.focused === "cpn-trigger", [st(d).cpn.hex, d.focused]);
  ok("and the trigger is named with the colour", tree(d).byId.get("cpn-trigger").name === "Accent color, #3b82f6");

  d.press("cpn-trigger");
  d.setFocus("cpn-hue");
  d.keyWith("Home", false, false);
  d.setFocus("cpn-sv");
  d.keyWith("End", false, false);
  d.keyWith("Enter", false, false);
  const committed = st(d).cpn.hex;
  ok("Enter commits and closes", st(d).cpn.open === false && committed !== "#3b82f6" && d.focused === "cpn-trigger", [committed, d.focused]);
  ok("a commit puts the colour at the front of Recent", st(d).cpn.swatches[0] === committed && st(d).cpn.swatches.length <= 8, st(d).cpn.swatches);
  ok("the trigger's name follows", tree(d).byId.get("cpn-trigger").name === "Accent color, " + committed);

  // Outside: a press on the page, and the focus leaving.
  d.press("cpn-trigger");
  d.setFocus("cpn-hue");
  d.keyWith("ArrowRight", true, false);
  const kept = st(d).cpn.hex;
  d.press("cp-scene");
  ok("a press outside closes it and keeps the colour", st(d).cpn.open === false && st(d).cpn.hex === kept, st(d).cpn);
  d.press("cpa-trigger");
  ok("the alpha one opens on RGB with four fields", st(d).cpa.open && st(d).cpa.format === "RGB" && st(d).cpa.fields.length === 4, st(d).cpa);
  d.setFocus("cpi-sv");
  ok("focus moving outside closes it", st(d).cpa.open === false);
  d.press("cpa-trigger");
  d.press("cpn-trigger");
  ok("a press on another trigger closes one and opens the other", !st(d).cpa.open && st(d).cpn.open);
  d.press("cpn-trigger");
  ok("a press on its own trigger closes it", !st(d).cpn.open && d.focused === "cpn-trigger");
  d.press("cpn-trigger");
  ok("dismissOutside (a press off the canvas) closes it", d.dismissOutside() === true && !st(d).cpn.open);
  d.press("cpa-trigger");
  d.setFocus("cpa-f0");
  d.applyEdit("cpa-f0", "10", 2, 2);
  d.keyWith("Escape", false, false);
  ok("Escape from a field restores too", st(d).cpa.rgb === "rgba(236, 72, 153, 0.6)" && !st(d).cpa.open, st(d).cpa.rgb);
}

// =============================================================================
console.log("--- the pointer ---");
{
  const d = fresh();
  const sv = box(d, "cpi-sv");
  d.beginSelection("cpi-sv", sv.x + sv.w * 0.25, sv.y + sv.h * 0.5, false);
  let s = st(d).cpi;
  ok("a press in the area sets saturation 25%, brightness 50%", round(s.s * 100) === 25 && round(s.v * 100) === 50 && d.focused === "cpi-sv", [s.s, s.v]);
  d.extendSelection(sv.x + sv.w * 0.8, sv.y + sv.h * 0.1);
  s = st(d).cpi;
  ok("dragging carries it (80%, 90%)", round(s.s * 100) === 80 && round(s.v * 100) === 90, [s.s, s.v]);
  d.extendSelection(sv.x + sv.w + 50, sv.y - 50);
  s = st(d).cpi;
  ok("past the edge it clamps (100%, 100%)", s.s === 1 && s.v === 1, [s.s, s.v]);
  d.extendSelection(sv.x + sv.w * 0.5, sv.y + sv.h * 0.5);
  d.endSelection();
  d.extendSelection(sv.x, sv.y);
  ok("after the release a move does nothing", round(st(d).cpi.s * 100) === 50);
  const th = box(d, "cpi-sv-thumb");
  ok("the handle is centred where the pointer put it", Math.abs(th.x + th.w / 2 - (sv.x + sv.w / 2)) < 0.6 && Math.abs(th.y + th.h / 2 - (sv.y + sv.h / 2)) < 0.6, th);
  ok("a press on the handle is a press on the area", d.hitId(th.x + th.w / 2, th.y + th.h / 2) === "cpi-sv-thumb" && d.cursorAt(sv.x + 5, sv.y + 5) === "crosshair");

  const hue = box(d, "cpi-hue");
  d.beginSelection("cpi-hue-seg-2", hue.x + 7 + (hue.w - 14) * 0.5, hue.y + 5, false);
  ok("a press on the hue track sets 180 degrees", round(st(d).cpi.h) === 180 && d.focused === "cpi-hue", st(d).cpi.h);
  d.extendSelection(hue.x + 7 + (hue.w - 14) * 0.75, hue.y + 40);
  ok("a drag carries it (270), whatever the height", round(st(d).cpi.h) === 270, st(d).cpi.h);
  d.extendSelection(hue.x - 100, hue.y);
  ok("and clamps at 0", st(d).cpi.h === 0);
  d.endSelection();
  const hth = box(d, "cpi-hue-thumb");
  ok("the hue thumb sits at the start", Math.abs(hth.x + hth.w / 2 - (hue.x + 7)) < 0.6, [hth, hue]);

  const al = box(d, "cpi-alpha");
  d.beginSelection("cpi-alpha-grad", al.x + 7 + (al.w - 14) * 0.3, al.y + 5, false);
  ok("a press on the alpha track sets 30%", round(st(d).cpi.a * 100) === 30 && d.focused === "cpi-alpha", st(d).cpi.a);
  d.extendSelection(al.x + al.w, al.y);
  d.endSelection();
  ok("a drag to the end is 100%", st(d).cpi.a === 1);

  // The popover's parts under the pointer too.
  d.press("cpa-trigger");
  d.displayListJson();
  const psv = box(d, "cpa-sv");
  const hitThere = d.hitId(psv.x + 20, psv.y + 20);
  ok("the open dialog is on top of what it covers", hitThere.startsWith("cpa-sv"), hitThere);
  d.beginSelection(hitThere, psv.x, psv.y + psv.h, false);
  d.endSelection();
  ok("a press in its area sets black and it stays open", st(d).cpa.v === 0 && st(d).cpa.open, st(d).cpa);
  d.press("cpa-trigger-text");
  ok("a press on the trigger's text is a press on the trigger", !st(d).cpa.open);
}

// =============================================================================
console.log("--- what it is, to a reader ---");
{
  const d = fresh();
  let t = tree(d);
  const trig = t.byId.get("cpn-trigger");
  ok("trigger: a button with aria-haspopup=dialog, collapsed", trig && trig.role === "button" && trig.haspopup === "dialog" && trig.expanded === 1, trig);
  const sv = t.byId.get("cpi-sv");
  const js = JSON.stringify(sv);
  ok("area: role slider, roledescription 2D slider", sv.role === "slider" && js.includes("2D slider"), sv);
  ok("area: valuetext \"Saturation 94%, Brightness 91%\"", js.includes("Saturation 94%, Brightness 91%"), sv);
  const hue = t.byId.get("cpi-hue");
  ok("hue: role slider 0..360, value 199", hue.role === "slider" && JSON.stringify(hue).includes("199") && JSON.stringify(hue).includes("360"), hue);
  const al = t.byId.get("cpi-alpha");
  ok("alpha: role slider 0..100 with \"100%\"", al.role === "slider" && JSON.stringify(al).includes("100%"), al);
  ok("no alpha slider where there is no alpha", !t.byId.get("cpn-alpha"));
  const f = t.byId.get("cpi-f0");
  ok("the hex field is a textbox named Hex with the value", f.role === "textbox" && f.name === "Hex" && JSON.stringify(f).includes("#0ea5e9"), f);
  const group = t.byId.get("cpi-presets");
  ok("the swatches are a radiogroup of radios named by hex", group.role === "radiogroup" && t.byId.get("cpi-preset-0").role === "radio" && t.byId.get("cpi-preset-0").name === "#ef4444");
  ok("the picture is an img with a name", t.byId.get("cp-scene").role === "img" && t.byId.get("cp-scene").name.length > 10);
  ok("at rest: no lint", d.a11yProblems().length === 0, d.a11yProblems());
  d.press("cpn-trigger");
  ok("popover open: no lint", d.a11yProblems().length === 0, d.a11yProblems());
  t = tree(d);
  ok("popover open: a dialog holding the parts", t.byId.get("cpn-content").role === "dialog" && t.byId.get("cpn-sv").p === "cpn-content" || JSON.stringify(t.byId.get("cpn-sv")).includes("cpn-content"), t.byId.get("cpn-sv"));
  d.setFocus("cpn-eye");
  d.keyWith("Enter", false, false);
  ok("pick mode: no lint, the pipette pressed", d.a11yProblems().length === 0 && tree(d).byId.get("cpn-eye").pressed === 2);
  const withScreen = fresh();
  ok("no screen button where there is no EyeDropper", !tree(withScreen).byId.get("cpi-screen"));
  withScreen.setScreenPicker(true);
  ok("a screen button where there is", tree(withScreen).byId.get("cpi-screen") && tree(withScreen).byId.get("cpi-screen").name === "Pick a color from the screen");
  withScreen.press("cpi-screen");
  ok("pressing it asks the page for the browser's picker, once", withScreen.takeScreenPick() === "cpi" && withScreen.takeScreenPick() === "");
  withScreen.screenResult("cpi", "#abcdef");
  ok("the browser's answer sets the colour", st(withScreen).cpi.hex === "#abcdef");
  ok("styles: no errors", d.styleErrorCount() === 0);
}

// =============================================================================
console.log("--- a phone ---");
{
  for (const w of [320, 342, 358]) {
    const d = fresh(w);
    const list = JSON.parse(d.displayListJson());
    let widest = 0;
    for (const c of list.cmds) if (c.w > 0 && c.x !== undefined) widest = Math.max(widest, c.x + c.w);
    ok(`${w}px: nothing drawn past the page edge`, widest <= w + 0.5, widest);
    for (const id of ["cpn-trigger", "cpa-trigger", "cpi-panel", "cp-scene", "cp-values"]) {
      const b = box(d, id);
      if (!b || b.x < 0 || b.x + b.w > w + 0.5) ok(`${w}px: ${id} inside`, false, b);
    }
    d.press("cpa-trigger");
    d.displayListJson();
    const c = box(d, "cpa-content");
    ok(`${w}px: the open dialog is inside the page`, c.x >= 0 && c.x + c.w <= w + 0.5, c);
  }
}

// =============================================================================
// THE BROWSER
// =============================================================================
if (!fs.existsSync(path.join(HERE, "bundle.js"))) {
  console.log("  FAIL bundle.js missing — run `node gallery/evgui/demo/build.mjs` first");
  failed++;
} else {
  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };
  const server = createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const file = path.join(ROOT, rel.slice(1));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/gallery/evgui/demo/index.html?demo=colorpicker`;
  const { chromium } = requireHostTool("playwright-core");
  const browser = await chromium.launch({ executablePath: findChromium() });

  const open = async (opts = {}, init = null) => {
    const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, deviceScaleFactor: opts.dpr || 1 });
    const page = await ctx.newPage();
    const problems = [];
    page.on("pageerror", (e) => problems.push("uncaught: " + e.message.split("\n")[0]));
    page.on("console", (m) => { if (m.type() === "error") problems.push("console.error: " + m.text().split("\n")[0]); });
    if (init) await page.addInitScript(init);
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction("document.querySelector('#stage canvas') && window.__cpState", null, { timeout: 15000 });
    await page.waitForTimeout(300);
    return { ctx, page, problems };
  };
  // App coordinates -> client coordinates, after scrolling the element into view.
  const at = async (page, id, fx = 0.5, fy = 0.5) => {
    await page.evaluate((id) => {
      const b = window.__cpBox(id).split(",").map(Number);
      const c = document.querySelector("#stage canvas").getBoundingClientRect();
      const s = window.__stageScale || 1;
      const y = c.top + (b[1] + b[3] / 2) * s;
      if (y < 80 || y > window.innerHeight - 80) window.scrollBy(0, y - window.innerHeight / 2);
    }, id);
    return page.evaluate(([id, fx, fy]) => {
      const b = window.__cpBox(id).split(",").map(Number);
      const c = document.querySelector("#stage canvas").getBoundingClientRect();
      const s = window.__stageScale || 1;
      return { x: c.left + (b[0] + b[2] * fx) * s, y: c.top + (b[1] + b[3] * fy) * s };
    }, [id, fx, fy]);
  };
  const clickOn = async (page, id, fx, fy) => {
    const p = await at(page, id, fx, fy);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(80);
    return p;
  };
  const state = (page) => page.evaluate(() => window.__cpState());
  const pick = (page) => page.evaluate(() => window.__cpPick());
  // The framebuffer, read independently: one pixel at a time, as seen over white.
  const pixel = (page, dx, dy) => page.evaluate(([dx, dy]) => {
    const cv = document.querySelector("#stage canvas");
    const gl = cv.getContext("webgl2");
    if (dx < 0 || dy < 0 || dx >= cv.width || dy >= cv.height) return null;
    const b = new Uint8Array(4);
    gl.readPixels(dx, cv.height - 1 - dy, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
    const a = b[3] / 255;
    return [0, 1, 2].map((i) => Math.round(b[i] * a + 255 * (1 - a)));
  }, [dx, dy]);
  const hexOf = (p) => "#" + p.map((n) => n.toString(16).padStart(2, "0")).join("");
  // The loupe as drawn: the middle of each of its cells, off its own canvas.
  const loupeCells = (page) => page.evaluate(() => {
    const cv = document.querySelector("#cp-loupe canvas");
    const ctx = cv.getContext("2d");
    const n = 15, z = 10;
    const out = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const d = ctx.getImageData(i * z + 3, j * z + 3, 1, 1).data;
      out.push([d[0], d[1], d[2]]);
    }
    return { cells: out, rendering: getComputedStyle(cv).imageRendering, visible: document.getElementById("cp-loupe").style.display !== "none" };
  });

  console.log("--- browser: the page and EyeDropper ---");
  {
    const { ctx, page, problems } = await open();
    ok("the page loads with no error", problems.length === 0, problems);
    const has = await page.evaluate(() => typeof window.EyeDropper === "function");
    const a11y = await page.evaluate(() => JSON.parse(window.__lastA11y).nodes.some((n) => n.id === "cpi-screen"));
    ok(`EyeDropper ${has ? "is" : "is not"} here, and the screen button follows it`, a11y === has, { has, a11y });
    const mirror = await page.evaluate(() => {
      const el = document.querySelector('[data-a11y-id="cpi-sv"]');
      return el ? { role: el.getAttribute("role"), vt: el.getAttribute("aria-valuetext"), rd: el.getAttribute("aria-roledescription") } : null;
    });
    ok("the mirror has the area as a slider with its valuetext", mirror && mirror.role === "slider" && /Saturation \d+%, Brightness \d+%/.test(mirror.vt || ""), mirror);
    const trig = await page.evaluate(() => {
      const el = document.querySelector('[data-a11y-id="cpn-trigger"]');
      return el ? { hp: el.getAttribute("aria-haspopup"), name: el.getAttribute("aria-label") || el.textContent } : null;
    });
    ok("and the trigger as aria-haspopup=dialog named with the colour", trig && trig.hp === "dialog" && /#3b82f6/.test(trig.name), trig);

    console.log("--- browser: the eyedropper ---");
    await clickOn(page, "cpi-eye");
    let p = await pick(page);
    ok("the pipette enters pick mode, the loupe up", p.active && p.tid === "cpi", p);
    ok("the page's pointer is a crosshair", await page.evaluate(() => document.documentElement.classList.contains("cp-picking") && getComputedStyle(document.body).cursor === "crosshair"));
    // Onto the picture: the edge of a hill, where the pixels differ.
    const over = await at(page, "cp-scene", 0.37, 0.66);
    await page.mouse.move(over.x, over.y);
    await page.waitForTimeout(120);
    p = await pick(page);
    const rect = await page.evaluate(() => { const r = document.querySelector("#stage canvas").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
    const wantDx = Math.floor((over.x - rect.x) * p.w / rect.w);
    ok("the pick point is the device pixel under the pointer", p.dx === wantDx, [p.dx, wantDx]);
    // Every cell of the loupe against the framebuffer, read one pixel at a time.
    let mism = [];
    const drawn = await loupeCells(page);
    for (let j = 0; j < 15; j++) for (let i = 0; i < 15; i++) {
      const fb = await pixel(page, p.dx + i - 7, p.dy + j - 7);
      const cell = drawn.cells[j * 15 + i];
      if (fb && (Math.abs(fb[0] - cell[0]) > 1 || Math.abs(fb[1] - cell[1]) > 1 || Math.abs(fb[2] - cell[2]) > 1)) mism.push([i, j, fb, cell]);
    }
    ok("the loupe's 15x15 cells are the framebuffer's pixels round the pointer", mism.length === 0, mism.slice(0, 3));
    const distinct = new Set(drawn.cells.map((c) => c.join())).size;
    ok("over the hill's edge the loupe shows more than one colour", distinct > 1, distinct);
    ok("the loupe is pixelated, 10x", drawn.rendering === "pixelated" && p.zoom === 10 && p.n === 15, drawn.rendering);
    const centre = await pixel(page, p.dx, p.dy);
    ok("the label is the centre pixel's hex", p.hex === hexOf(centre) && p.label === p.hex, [p.hex, hexOf(centre)]);
    const loupeC = { x: p.loupe.x + p.loupe.w / 2, y: p.loupe.y + p.loupe.h / 2 };
    ok("the loupe is centred on the pointer", Math.abs(loupeC.x - over.x) <= 2 && Math.abs(loupeC.y - over.y) <= 2, [loupeC, over]);
    // Nudge.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowUp");
    const p2 = await pick(page);
    ok("ArrowRight x2, ArrowUp: the point moves by device pixels", p2.dx === p.dx + 2 && p2.dy === p.dy - 1, [p.dx, p.dy, p2.dx, p2.dy]);
    const c2 = await pixel(page, p2.dx, p2.dy);
    ok("and the label follows the new centre", p2.hex === hexOf(c2), [p2.hex, hexOf(c2)]);
    ok("the demo saw none of those keys", (await state(page)).cpi.hex === "#0ea5e9");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(80);
    let s = await state(page);
    ok("Enter picks exactly that pixel", s.cpi.hex === hexOf(c2) && s.picking === "", [s.cpi.hex, hexOf(c2)]);
    ok("and the loupe goes", !(await pick(page)).active && !(await loupeCells(page)).visible);

    // Click on a tile: its colour is known exactly.
    await clickOn(page, "cpi-eye");
    const tile = await at(page, "cp-tile-a5");
    await page.mouse.move(tile.x, tile.y);
    await page.mouse.click(tile.x, tile.y);
    await page.waitForTimeout(80);
    s = await state(page);
    const hsv = C.hsvToRgb(5 * 22.5, 0.85, 0.95).map(Math.round);
    ok("a click on a tile picks its colour, " + hexOf(hsv), s.cpi.hex === hexOf(hsv), s.cpi.hex);

    // Escape leaves everything as it was.
    const before = s.cpi.hex;
    await clickOn(page, "cpi-eye");
    const sun = await at(page, "cp-sun");
    await page.mouse.move(sun.x, sun.y);
    await page.waitForTimeout(60);
    ok("over the sun the loupe reads it", (await pick(page)).hex !== before);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(60);
    s = await state(page);
    ok("Escape cancels: the colour is what it was", s.cpi.hex === before && s.picking === "" && !(await pick(page)).active, s.cpi.hex);

    // Off the canvas: said, and a click there cancels.
    await clickOn(page, "cpi-eye");
    await page.mouse.move(5, 5);
    p = await pick(page);
    ok("off the canvas the loupe says so", !p.inside && /outside the canvas/.test(p.label), p.label);
    await page.mouse.click(5, 5);
    s = await state(page);
    ok("and a click there cancels", s.picking === "" && s.cpi.hex === before);

    // The keyboard's pick starts on the picture.
    await clickOn(page, "cpi-eye");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Enter");
    p = await pick(page);
    const sceneMid = await page.evaluate(() => window.__cpBox("cp-scene").split(",").map(Number));
    ok("Enter on the focused pipette picks from the keyboard, starting on the picture",
      p.active && p.dx === Math.floor(sceneMid[0] + sceneMid[2] / 2) && p.dy === Math.floor(sceneMid[1] + sceneMid[3] / 2), [p.dx, p.dy, sceneMid]);
    await page.keyboard.press("Escape");

    console.log("--- browser: the popover and a drag ---");
    await clickOn(page, "cpn-trigger");
    s = await state(page);
    ok("a click on the swatch button opens the dialog", s.cpn.open === true, s.cpn.open);
    const h1 = await at(page, "cpn-hue", 0.2);
    const h2 = await at(page, "cpn-hue", 0.9);
    // The thumb's centre runs 7px in from each end, as the pointer maps back.
    const hw = await page.evaluate(() => +window.__cpBox("cpn-hue").split(",")[2]);
    const hueWant = ((0.9 * hw - 7) / (hw - 14)) * 360;
    await page.mouse.move(h1.x, h1.y);
    await page.mouse.down();
    await page.mouse.move(h2.x, h2.y, { steps: 5 });
    await page.mouse.up();
    s = await state(page);
    ok(`a drag along the hue moves it (to ${Math.round(hueWant)} degrees)`, Math.abs(s.cpn.h - hueWant) < 3 && s.cpn.open, [s.cpn.h, hueWant]);
    const sv1 = await at(page, "cpn-sv", 0.1, 0.1);
    const sv2 = await at(page, "cpn-sv", 0.6, 0.3);
    await page.mouse.move(sv1.x, sv1.y);
    await page.mouse.down();
    await page.mouse.move(sv2.x, sv2.y, { steps: 4 });
    await page.mouse.up();
    s = await state(page);
    ok("a drag in the area moves the handle (about 60%, 70%)", Math.abs(s.cpn.s - 0.6) < 0.03 && Math.abs(s.cpn.v - 0.7) < 0.03, [s.cpn.s, s.cpn.v]);
    await page.keyboard.press("Escape");
    s = await state(page);
    ok("Escape closes it and restores the colour it opened with", !s.cpn.open && s.cpn.hex === "#3b82f6", s.cpn.hex);
    // The page's own chrome is outside the dialog too.
    await clickOn(page, "cpn-trigger");
    await page.mouse.click(1400, 880);
    s = await state(page);
    ok("a press on the page outside the canvas closes it", !s.cpn.open);

    console.log("--- browser: typing and Tab ---");
    await clickOn(page, "cpi-sv", 0.5, 0.5);
    const walk = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      walk.push((await state(page)).focused);
      if (walk[walk.length - 1].startsWith("cpi-preset")) break;
    }
    const want = ["cpi-eye", "cpi-hue", "cpi-alpha", "cpi-f0", "cpi-fmt"];
    const seen = walk.filter((id) => want.includes(id));
    ok("Tab walks the pipette, the sliders, the field and the format button in order", JSON.stringify(seen) === JSON.stringify(want), walk);
    ok("and then the swatches, as one stop", /^cpi-preset-\d$/.test(walk[walk.length - 1]), walk);
    // back over the muted tones (one stop) and the format button
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    ok("Shift+Tab goes back to the hex field", (await state(page)).focused === "cpi-f0", (await state(page)).focused);
    await page.keyboard.press("Control+a");
    await page.keyboard.type("#ff0000");
    s = await state(page);
    ok("typing into it through the page's text session applies #ff0000", s.cpi.hex === "#ff0000" && s.cpi.fields[0] === "#ff0000", s.cpi);
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    s = await state(page);
    ok("Tab to the format button, Enter: RGB 255 0 0", s.focused === "cpi-fmt" && s.cpi.format === "RGB" && s.cpi.fields.slice(0, 3).join() === "255,0,0", s.cpi);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    ok("Shift+Tab x3 lands on Green", (await state(page)).focused === "cpi-f1", (await state(page)).focused);
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Shift+ArrowUp");
    s = await state(page);
    ok("ArrowUp and Shift+ArrowUp in the field step Green to 11", s.cpi.fields[1] === "11" && s.cpi.hex === "#ff0b00", s.cpi);
    await page.keyboard.press("Control+a");
    await page.keyboard.type("x");
    await page.keyboard.press("Tab");
    s = await state(page);
    ok("a letter in a number field reverts when the focus leaves", s.cpi.fields[1] === "11" && s.cpi.hex === "#ff0b00", s.cpi.fields);
    ok("no errors along the way", problems.length === 0, problems);
    await ctx.close();
  }

  console.log("--- browser: devicePixelRatio 2 ---");
  {
    const { ctx, page } = await open({ dpr: 2 });
    await clickOn(page, "cpi-eye");
    const over = await at(page, "cp-scene", 0.2, 0.9);
    await page.mouse.move(over.x, over.y);
    await page.waitForTimeout(80);
    const p = await pick(page);
    ok("the canvas has two device pixels per CSS pixel", p.w === 2 * (await page.evaluate(() => parseFloat(document.querySelector("#stage canvas").style.width))), p.w);
    await page.keyboard.press("ArrowLeft");
    const q = await pick(page);
    ok("an arrow moves one DEVICE pixel (half a CSS pixel)", q.dx === p.dx - 1 && q.dy === p.dy, [p.dx, q.dx]);
    const c = await pixel(page, q.dx, q.dy);
    ok("and reads that device pixel", q.hex === hexOf(c), [q.hex, hexOf(c)]);
    await ctx.close();
  }

  console.log("--- browser: a stand-in EyeDropper, and none ---");
  {
    const { ctx, page, problems } = await open({}, () => {
      window.EyeDropper = class {
        open() { window.__edOpened = (window.__edOpened || 0) + 1; return Promise.resolve({ sRGBHex: "#123456" }); }
      };
    });
    await clickOn(page, "cpi-screen");
    await page.waitForTimeout(100);
    const s = await state(page);
    ok("Pick from screen calls EyeDropper.open() and takes its answer", (await page.evaluate(() => window.__edOpened)) === 1 && s.cpi.hex === "#123456", s.cpi.hex);
    ok("no errors", problems.length === 0, problems);
    await ctx.close();
  }
  {
    const { ctx, page } = await open({}, () => { delete window.EyeDropper; window.EyeDropper = undefined; });
    const a11y = await page.evaluate(() => JSON.parse(window.__lastA11y).nodes);
    ok("without EyeDropper there is no screen button", !a11y.some((n) => n.id === "cpi-screen" || n.id === "cpn-screen"));
    const hint = a11y.find((n) => n.id === "cp-screen-hint");
    ok("and the page says why", hint && /needs the EyeDropper API/.test(hint.name || JSON.stringify(hint)), hint);
    await ctx.close();
  }

  console.log("--- browser: a phone ---");
  {
    const { ctx, page, problems } = await open({ viewport: { width: 390, height: 844 } });
    const over = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok("390px: the page does not scroll sideways", (await over()) <= 0, await over());
    ok("390px: laid out at 1:1, not scaled", (await page.evaluate(() => window.__stageScale)) === 1);
    await clickOn(page, "cpa-trigger");
    const b = await page.evaluate(() => window.__cpBox("cpa-content").split(",").map(Number));
    const cw = await page.evaluate(() => parseFloat(document.querySelector("#stage canvas").style.width));
    ok("390px: the open dialog fits the canvas", b[0] >= 0 && b[0] + b[2] <= cw + 0.5, [b, cw]);
    ok("390px: still no sideways scroll with it open", (await over()) <= 0, await over());
    await page.keyboard.press("Escape");
    await clickOn(page, "cpi-eye");
    const t = await at(page, "cp-tile-b9");
    await page.mouse.click(t.x, t.y);
    const s = await state(page);
    const want = "#" + C.hsvToRgb(9 * 22.5 + 11.25, 0.35, 1).map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");
    ok("390px: the eyedropper picks a tile", s.cpi.hex === want, [s.cpi.hex, want]);
    ok("390px: no errors", problems.length === 0, problems);
    await ctx.close();
  }
  await browser.close();
  server.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("RESULT FAIL");
  process.exit(1);
}
console.log("RESULT PASS");

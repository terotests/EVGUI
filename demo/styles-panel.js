// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Styles panel: for the demo on screen, a GUIDE to the classes it uses and
 * a live EDITOR for its stylesheet.
 *
 * THE GUIDE IS READ, NOT WRITTEN. The classes come from two places, both the
 * demo's own: the live element tree (every `className` token on an element
 * that exists right now) and the rules of its stylesheet as the ENGINE parsed
 * them (`EVGStyleSheet.rules`). Nothing is listed that the demo does not use,
 * so the Combobox guide cannot show a calendar class. What each property does
 * and which ones exist comes from `EVG_CSS_FACTS`, which `build.mjs` scrapes
 * out of lib/evg — `EVGElement.setAttribute`, `EVGPseudo`, `EVGUnit` and the
 * rest — so a property added to the engine is offered here on the next build.
 *
 * THE EDITOR GOES THROUGH THE ENGINE. The text is handed to the demo's own
 * sheet (`host.apply`); the problems shown under it are the engine's: the
 * sheet's parse errors, and what `EVGElement.setAttribute` refused
 * (`EVGReject`) when each declaration is tried on a scratch element. The
 * property list is only the fallback when the engine says nothing.
 *
 * Saved per demo in localStorage, which may be missing or throw (a private
 * window, blocked storage): every access is wrapped and the page works
 * without it.
 */

const KEY = "evgui-styles:";

/** The stylesheet this browser saved for `name`, or null. */
export function storedCss(name) {
  try {
    const v = localStorage.getItem(KEY + name);
    return typeof v === "string" ? v : null;
  } catch (e) {
    return null;
  }
}

function storeCss(name, css) {
  try { localStorage.setItem(KEY + name, css); } catch (e) { /* storage refused: in memory only */ }
}

function forgetCss(name) {
  try { localStorage.removeItem(KEY + name); } catch (e) { /* nothing stored */ }
}

// ---------------------------------------------------------------------------
// Reading CSS the way EVGStyleSheet does, but keeping OFFSETS
// ---------------------------------------------------------------------------
//
// The engine's parser answers "what are the rules"; it does not say where in
// the text they were. The editor needs that — to jump to a rule, and to put a
// problem on its line — so this walks the text with the same rules the engine
// uses (comments out, a selector list up to `{`, a body up to the first `}`,
// declarations split on `;` and the FIRST `:`, `@media` and `@vars` blocks
// by balanced braces) and remembers positions. It decides nothing the engine
// decides: validity is asked of the engine.

function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?(\*\/|$)/g, (m) => m.replace(/[^\n]/g, " "));
}

function matchingBrace(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function scanDecls(src, from, to, out) {
  let start = from;
  for (let i = from; i <= to; i++) {
    if (i === to || src[i] === ";") {
      const raw = src.slice(start, i);
      const lead = raw.length - raw.trimStart().length;
      const part = raw.trim();
      if (part) {
        const colon = part.indexOf(":");
        out.push({
          name: colon < 0 ? part : part.slice(0, colon).trim(),
          value: colon < 0 ? "" : part.slice(colon + 1).trim(),
          start: start + lead,
          end: start + lead + part.length,
          bad: colon < 0,
        });
      }
      start = i + 1;
    }
  }
}

/** Rules with positions: { selectors:[{text,start}], start, open, close, decls, media, vars }. */
export function scanCss(text) {
  const src = blankComments(text);
  const rules = [];
  const walk = (from, to, media) => {
    let i = from;
    while (i < to) {
      const brace = src.indexOf("{", i);
      if (brace < 0 || brace >= to) return;
      const header = src.slice(i, brace);
      const lead = header.length - header.trimStart().length;
      const head = header.trim();
      const start = i + lead;
      if (head.startsWith("@")) {
        const end = matchingBrace(src, brace);
        if (end < 0 || end > to) return;
        if (head.startsWith("@media")) walk(brace + 1, end, head.slice(6).trim());
        else if (head.startsWith("@vars")) {
          const decls = [];
          scanDecls(src, brace + 1, end, decls);
          rules.push({ selectors: [], start, open: brace, close: end, decls, media, vars: head });
        }
        i = end + 1;
        continue;
      }
      let close = src.indexOf("}", brace + 1);
      if (close < 0 || close > to) close = to;
      const selectors = [];
      let at = 0;
      for (const piece of header.split(",")) {
        const t = piece.trim();
        if (t) selectors.push({ text: t.replace(/\s+/g, " "), start: i + at + piece.indexOf(t) });
        at += piece.length + 1;
      }
      const decls = [];
      scanDecls(src, brace + 1, close, decls);
      rules.push({ selectors, start, open: brace, close, decls, media, vars: "" });
      i = close + 1;
    }
  };
  walk(0, src.length, "");
  return rules;
}

function lineStarts(text) {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) out.push(i + 1);
  return out;
}

function lineOf(starts, pos) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** Every (selector, property) pair a sheet declares, for "did an edit remove one". */
function declaredPairs(text) {
  const out = new Set();
  for (const r of scanCss(text)) {
    const sels = r.vars ? [r.vars] : r.selectors.map((s) => s.text);
    for (const s of sels) for (const d of r.decls) out.add(`${r.media}|${s}|${d.name}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// What the classes MEAN
// ---------------------------------------------------------------------------

// A suffix that names a STATE the controller or the demo switches on and off,
// and when. A class ending in one of these, whose stem is itself a class the
// demo uses, is that stem's state.
const STATES = {
  open: "while its popup or panel is open",
  opened: "while it is open",
  closed: "while it is closed",
  focused: "while it has the keyboard focus",
  focus: "while it has the keyboard focus",
  active: "while it is the active (highlighted) one — arrow keys or pointer",
  highlighted: "while it is highlighted",
  selected: "while it is selected",
  checked: "while it is checked",
  on: "while it is switched on",
  off: "while it is switched off",
  disabled: "while it cannot be used",
  hover: "while the pointer is over it",
  hovered: "while the pointer is over it",
  pressed: "while it is pressed",
  expanded: "while it is expanded",
  collapsed: "while it is collapsed",
  current: "while it is the current one",
  invalid: "while its value is invalid",
  error: "while it shows an error",
  dragging: "while it is being dragged",
  dragged: "while it is being dragged",
  over: "while something is dragged over it",
  filled: "while it holds a value",
  empty: "while it holds nothing",
  loading: "while it is loading",
  busy: "while it is busy",
  done: "once it is done",
  complete: "once it is complete",
  completed: "once it is complete",
  today: "on today's date",
  outside: "on days outside the month shown",
  readonly: "while it is read-only",
  visible: "while it is shown",
  hidden: "while it is hidden",
  half: "on a half-filled star",
  full: "on a filled star",
  preview: "while the pointer previews a value",
};
// The words that name a state and nothing else. The rest — `-empty`,
// `-loading`, `-today`… — are as often a PART (`ui-combobox-empty` is the
// "nothing found" row), so they count as a state only when the live tree shows
// the class worn together with its stem, which is how a state class is worn.
const STRONG = new Set(["open", "opened", "closed", "focused", "focus", "active", "highlighted", "selected",
  "checked", "on", "off", "disabled", "hover", "hovered", "pressed", "expanded", "collapsed", "invalid",
  "dragging", "dragged", "filled", "readonly", "current"]);
// A suffix that picks a VARIANT once, when the element is built: not a state.
const VARIANTS = {
  multiple: "on the multi-select variant",
  single: "on the single-select variant",
  sm: "on the small size", lg: "on the large size", md: "on the medium size",
  outline: "on the outline variant", ghost: "on the ghost variant",
  destructive: "on the destructive variant", secondary: "on the secondary variant",
  vertical: "on the vertical orientation", horizontal: "on the horizontal orientation",
  left: "on the left side", right: "on the right side", top: "on the top side", bottom: "on the bottom side",
};
const PSEUDO_NAMES = ["", "hover", "focus", "active", "disabled"];
const PSEUDO_WHEN = {
  hover: "while the pointer is over the element",
  focus: "while the element has the keyboard focus",
  active: "while the element is pressed",
  disabled: "while the element is disabled (aria-disabled)",
};

// The property families, for "what else works here" and for the reference.
// Only names the engine actually has a branch for survive (`facts.props`).
const FAMILIES = [
  { id: "size", title: "Size", kind: "box", names: ["width", "height", "min-width", "min-height", "max-width", "max-height"] },
  { id: "space", title: "Spacing", kind: "box", names: ["padding", "padding-top", "padding-right", "padding-bottom", "padding-left", "margin", "margin-top", "margin-right", "margin-bottom", "margin-left"] },
  { id: "paint", title: "Background & border", kind: "box", names: ["background-color", "background", "background-gradient", "background-image", "gradient-from", "gradient-to", "gradient-dir", "border", "border-width", "border-color", "border-radius", "opacity", "backdrop-filter", "glow"] },
  { id: "shadow", title: "Shadow", kind: "box", names: ["shadow-color", "shadow-radius", "shadow-offset-x", "shadow-offset-y"] },
  { id: "motion", title: "Transform & transition", kind: "box", names: ["transition", "transform", "transform-origin", "rotate", "scale", "translate-x", "translate-y"] },
  { id: "position", title: "Position", kind: "box", names: ["position", "left", "top", "right", "bottom", "x", "y", "position-anchor", "position-area", "position-try-fallbacks", "position-try-order", "anchor-name", "overlay", "overlay-side", "overlay-align", "overlay-gap", "presentation", "fit-viewport", "sheet-below"] },
  { id: "behaviour", title: "Overflow & pointer", kind: "box", names: ["overflow", "overflow-x", "overflow-y", "cursor", "scrollbar-width", "scrollbar-color", "scroll-top", "scroll-left"] },
  { id: "text", title: "Text", kind: "text", names: ["color", "font-size", "font-family", "font-weight", "line-height", "letter-spacing", "text-align", "white-space", "vertical-align", "direction", "emoji-color", "paragraph-spacing"] },
  { id: "container", title: "Flex / grid container", kind: "container", names: ["display", "flex-direction", "flex-wrap", "gap", "row-gap", "column-gap", "justify-content", "align-items", "align-content", "grid-template-columns", "grid-template-rows", "grid-template-areas", "grid-auto-flow"] },
  { id: "item", title: "Flex / grid item", kind: "item", names: ["flex", "flex-grow", "flex-shrink", "flex-basis", "align-self", "grid-area", "grid-column", "grid-row"] },
  { id: "vector", title: "Vector (SVG path)", kind: "vector", names: ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "fill-rule"] },
  { id: "image", title: "Image", kind: "image", names: ["object-fit", "preserve-aspect-ratio", "image-view-box", "image-offset-x", "image-offset-y"] },
  { id: "effects", title: "EVG surface effects", kind: "box", names: ["evg-surface-effect", "evg-effect-on"] },
];
const KIND_WORDS = {
  box: "box", text: "holds text", container: "lays out children", item: "flex/grid child",
  vector: "vector path", image: "image",
};

// What the engine takes and that is NOT styling: content, accessibility,
// connectors, print. Accepted by `setAttribute` and so by a stylesheet, but
// listed apart so nobody reaches for `aria-label` to change a colour.
function isStructural(name) {
  return /^(aria-|a11y|class|theme$|id$|src$|alt$|href$|key$|role$|format$|orientation$|page|image(Quality)?$|maxImageSize|imageQuality|d$|svg|path$|view-?[bB]ox|from|to$|to-|routing|arrow-|inline$|line-break|align$|full-bleed)/.test(name);
}

const HINTS = [
  [/^border-(top|right|bottom|left)/, "EVG draws a border on all four sides only — use border, border-width and border-color."],
  [/^box-shadow$/, "EVG has no box-shadow: use shadow-color, shadow-radius, shadow-offset-x and shadow-offset-y."],
  [/^outline/, "No outline in EVG: use border, or shadow-* for a ring."],
  [/^text-(decoration|transform|overflow|shadow)/, "Not implemented by EVG's text engine."],
  [/^(z-index|order)$/, "EVG paints in tree order; overlays go in the top layer (overlay, position-anchor)."],
  [/^font$/, "Write the longhands: font-size, font-weight, font-family, line-height."],
  [/^inset/, "Write left, top, right and bottom."],
];

function hintFor(name) {
  for (const [re, text] of HINTS) if (re.test(name)) return text;
  return "";
}

// ---------------------------------------------------------------------------

const h = (tag, attrs, ...kids) => {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k);
  return el;
};
const code = (text) => h("code", { text });

/**
 * `host` is what the page tells the panel — see the call in main.js.
 * Returns { sync, api }.
 */
export function createStylesPanel(host) {
  const facts = host.facts;
  const M = host.engine;
  const $ = (id) => document.getElementById(id);
  const button = $("stylesbtn");
  const panel = $("stylespanel");
  if (!button || !panel) return { sync() {}, api: {} };
  const badge = $("stylesmod");
  const badge2 = $("stylesmod2");
  const title = $("stylesdemo");
  const heading = $("styleshead");
  const closeBtn = $("stylesclose");
  const tabs = [$("stab-guide"), $("stab-edit")];
  const panes = [$("spane-guide"), $("spane-edit")];
  const text = $("sedtext");
  const lines = $("sedlines");
  const marks = $("sedmarks");
  const problemsList = $("sedproblems");
  const status = $("sedstatus");
  const sgBody = $("sgbody");
  const sgSummary = $("sgsummary");
  const sgFilter = $("sgfilter");
  const sgRef = $("sgrefbody");

  // --- the engine's vocabulary -------------------------------------------------
  const PROP = new Map();       // every name setAttribute answers to -> branch
  for (const p of facts.props) for (const n of p.names) PROP.set(n, p);
  const has = (n) => PROP.has(n);
  const RESET = new Set(facts.resetOnLeave);
  const COLOR = new Set(facts.props.filter((p) => p.type === "color").flatMap((p) => p.names));
  // The CSS spelling of a branch: kebab-case where it has one.
  const cssName = (p) => p.names.find((n) => n.includes("-")) || p.names.find((n) => n === n.toLowerCase()) || p.names[0];

  let which = "";
  let editing = "";              // the demo the textarea holds
  let pending = 0;
  let lastApply = { name: "", how: "", problems: [] };
  let opener = button;
  let lastInventory = null;

  // --- storage and the badge -------------------------------------------------------
  const isModified = (name) => {
    const s = storedCss(name);
    return s != null && s !== host.defaultCss(name);
  };
  function syncBadges() {
    const mod = isModified(which);
    if (badge) badge.hidden = !mod;
    if (badge2) badge2.hidden = !mod;
    button.setAttribute("aria-label", mod ? `Styles (modified) for the ${host.title(which)} demo` : `Styles for the ${host.title(which)} demo`);
    for (const n of host.names()) {
      const input = document.querySelector(`#demos input[value="${n}"]`);
      const label = input && input.closest("label");
      if (!label) continue;
      if (isModified(n)) label.dataset.modified = "";
      else delete label.dataset.modified;
    }
  }

  // --- validation: the engine's words ------------------------------------------------
  //
  // One scratch element per declaration, `setAttribute` on it, and whatever
  // `EVGReject` collected meanwhile. The reject store is process-wide and
  // shared with the demo's own layouts, so it is put back exactly as it was.
  function probe(name, value) {
    const R = M.EVGReject;
    const s = R.store();
    const saved = [s.kinds, s.names, s.values, s.total];
    R.clearNotes();
    const out = [];
    try {
      new M.EVGElement().setAttribute(name, value);
      for (let i = 0; i < R.noteCount(); i++) out.push(R.noteAt(i));
    } catch (e) {
      out.push("the engine threw: " + (e && e.message ? e.message : e));
    }
    [s.kinds, s.names, s.values, s.total] = saved;
    return out;
  }

  /** Problems in `css`: [{ line, severity, message }], sorted by line. */
  function validate(css) {
    const starts = lineStarts(css);
    const out = [];
    const sheet = new M.EVGStyleSheet();
    try {
      sheet.parse(css);
    } catch (e) {
      out.push({ line: 0, severity: "error", message: "The stylesheet could not be read: " + (e && e.message ? e.message : e) });
      return out;
    }
    const plain = blankComments(css);
    const locate = (msg) => {
      // The engine's messages end in the text they are about.
      const cut = [msg.indexOf(": "), msg.lastIndexOf(": ")].filter((i) => i >= 0);
      for (const c of cut) {
        const snippet = msg.slice(c + 2).trim();
        if (!snippet) continue;
        const at = plain.indexOf(snippet);
        if (at >= 0) return lineOf(starts, at);
        const first = snippet.split(/\s+/)[0];
        const at2 = first.length > 1 ? plain.indexOf(first) : -1;
        if (at2 >= 0) return lineOf(starts, at2);
      }
      return 0;
    };
    const parseErrors = Array.from(sheet.errors);
    for (const e of parseErrors) out.push({ line: locate(e), severity: "error", message: e + " — ignored." });
    // Declarations, one by one, on a scratch element.
    for (const r of scanCss(css)) {
      if (r.vars) continue;
      for (const d of r.decls) {
        if (d.bad || !d.value || d.name.startsWith("--")) continue;
        const line = lineOf(starts, d.start);
        let value = d.value.replace(/^(["'])(.*)\1$/, "$2");
        if (value.includes("var(")) {
          value = sheet.resolveVars(value, "", d.name);
          if (!value) continue;           // reported by the sheet already
        }
        const notes = probe(d.name, value);
        for (const n of notes) {
          const unknown = n.startsWith("unknown property");
          const hint = hintFor(d.name);
          out.push({
            line,
            severity: unknown ? "error" : "warn",
            message: (unknown ? `${d.name}: not an EVG property — ignored.` : `${d.name}: ${n.replace(/^[^:]+: [^:]+: /, "")} is not supported (${n.split(":")[0]}).`) + (hint ? " " + hint : ""),
          });
        }
        if (notes.length === 0 && COLOR.has(d.name) && !/gradient|url\(/.test(value) && !M.EVGReject.isAbsent(value)) {
          const c = M.EVGColor.parse(value);
          if (!c || !c.isSet) {
            out.push({ line, severity: "warn", message: `${d.name}: "${value}" is not a colour EVG reads (#rgb, #rrggbb, #rrggbbaa, rgb(), rgba(), hsl(), transparent, basic names).` });
          }
        }
        // The engine said nothing — which it also does for a name it was
        // never asked about. The list is the second opinion.
        if (notes.length === 0 && !has(d.name) && !(facts.fxPrefix && d.name.startsWith(facts.fxPrefix))) {
          out.push({ line, severity: "warn", message: `${d.name}: not in EVG's property list.` });
        }
      }
    }
    return out.sort((a, b) => a.line - b.line);
  }

  // --- the editor ------------------------------------------------------------------------
  const LH = 20;          // the textarea's line-height, px — see index.html
  let shownProblems = [];

  function renderGutter() {
    const n = text.value.split("\n").length;
    const bad = new Map();
    for (const p of shownProblems) {
      if (!p.line) continue;
      if (bad.get(p.line) !== "error") bad.set(p.line, p.severity);
    }
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= n; i++) {
      const s = h("span", { class: bad.has(i) ? "sed-ln " + bad.get(i) : "sed-ln", text: String(i) });
      frag.append(s);
    }
    lines.replaceChildren(frag);
    const mk = document.createDocumentFragment();
    for (const [line, sev] of bad) {
      mk.append(h("span", { class: "sed-mark " + sev, style: `top:${(line - 1) * LH}px` }));
    }
    marks.replaceChildren(mk);
    syncScroll();
  }

  function syncScroll() {
    const y = text.scrollTop;
    lines.style.transform = `translateY(${-y}px)`;
    marks.style.transform = `translateY(${-y}px)`;
  }

  function renderProblems(list) {
    shownProblems = list;
    const errors = list.filter((p) => p.severity === "error").length;
    const warns = list.length - errors;
    problemsList.replaceChildren(...list.slice(0, 60).map((p) =>
      h("li", { class: p.severity },
        p.line
          ? h("button", { type: "button", class: "sed-goto", onclick: () => gotoLine(p.line), text: "Line " + p.line })
          : h("span", { class: "sed-goto", text: "Sheet" }),
        h("span", { text: p.message }))));
    problemsList.hidden = list.length === 0;
    return { errors, warns };
  }

  function setStatus(msg, kind) {
    status.textContent = msg;
    status.className = "sed-status " + (kind || "");
  }

  function gotoLine(line) {
    const starts = lineStarts(text.value);
    const at = starts[Math.max(0, Math.min(line - 1, starts.length - 1))];
    const end = text.value.indexOf("\n", at);
    selectRange(at, end < 0 ? text.value.length : end);
  }

  function selectRange(a, b) {
    showTab(1, false);
    text.focus({ preventScroll: true });
    text.setSelectionRange(a, b);
    const line = lineOf(lineStarts(text.value), a);
    text.scrollTop = Math.max(0, (line - 4) * LH);
    syncScroll();
  }

  function applyNow() {
    clearTimeout(pending);
    pending = 0;
    const name = editing;
    if (!name) return;
    const css = text.value;
    const before = host.runningCss(name);
    if (css === before) {
      report(name, css, "");
      return;
    }
    // Did the edit take a declaration away? Then only a rebuilt demo shows
    // it: the cascade does not un-write what a rule stopped saying.
    const now = declaredPairs(css);
    let removed = false;
    for (const k of declaredPairs(before)) if (!now.has(k)) { removed = true; break; }
    let how = "";
    try {
      how = host.apply(name, css, removed);
    } catch (e) {
      renderProblems([{ line: 0, severity: "error", message: "Applying the stylesheet failed: " + (e && e.message ? e.message : e) }]);
      renderGutter();
      setStatus("Not applied", "error");
      return;
    }
    if (css === host.defaultCss(name)) forgetCss(name);
    else storeCss(name, css);
    syncBadges();
    report(name, css, how, removed);
    if (panes[0] && !panes[0].hidden) renderGuide();
  }

  function report(name, css, how, removed) {
    const list = validate(css);
    const { errors, warns } = renderProblems(list);
    renderGutter();
    lastApply = { name, how, removed: !!removed, problems: list };
    const parts = [];
    if (how === "reloaded") parts.push(removed ? "Applied — a removed declaration keeps its old value until the page is reloaded" : "Applied");
    else if (how === "rebuilt") parts.push("Applied (demo rebuilt)");
    else parts.push(isModified(name) ? "Modified" : "Default stylesheet");
    if (errors) parts.push(`${errors} ignored`);
    if (warns) parts.push(`${warns} warning${warns === 1 ? "" : "s"}`);
    setStatus(parts.join(" · "), errors ? "error" : warns ? "warn" : "ok");
  }

  function loadEditor(name) {
    editing = name;
    text.value = host.runningCss(name);
    text.setAttribute("aria-label", `Stylesheet of the ${host.title(name)} demo`);
    text.scrollTop = 0;
    report(name, text.value, "");
  }

  text.addEventListener("input", () => {
    renderGutter();
    clearTimeout(pending);
    pending = setTimeout(applyNow, 300);
  });
  text.addEventListener("scroll", syncScroll);
  // Tab is left alone — it moves the focus on, so the editor is no keyboard
  // trap. Escape leaves the panel; Ctrl/Cmd+Enter applies at once.
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      applyNow();
    }
  });

  $("sedreset").addEventListener("click", () => {
    text.value = host.defaultCss(editing);
    clearTimeout(pending);
    // A reset is a rebuild wherever one can be had, so the demo comes back
    // exactly as it shipped rather than as the default laid over an edit.
    const name = editing;
    let how = "";
    try { how = host.apply(name, text.value, true); } catch (e) { /* reported below */ }
    forgetCss(name);
    syncBadges();
    report(name, text.value, how);
    setStatus("Reset to the default stylesheet", "ok");
    if (!panes[0].hidden) renderGuide();
  });
  $("sedcopy").addEventListener("click", async () => {
    const btn = $("sedcopy");
    let done = false;
    try {
      await navigator.clipboard.writeText(text.value);
      done = true;
    } catch (e) {
      text.focus();
      text.select();
      try { done = document.execCommand("copy"); } catch (e2) { done = false; }
    }
    setStatus(done ? "Copied to the clipboard" : "Copy failed — select the text and copy it", done ? "ok" : "warn");
    btn.dataset.done = done ? "1" : "";
  });
  $("seddownload").addEventListener("click", () => {
    const blob = new Blob([text.value], { type: "text/css" });
    const a = h("a", { href: URL.createObjectURL(blob), download: host.fileName(editing) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // --- jumping from the guide to a rule ---------------------------------------------
  function jumpTo(selector) {
    if (editing !== which) loadEditor(which);
    const css = text.value;
    for (const r of scanCss(css)) {
      if (r.vars || r.media) continue;
      const s = r.selectors.find((x) => x.text === selector);
      if (s) {
        selectRange(s.start, r.open + 1);
        setStatus(`Rule ${selector}`, "ok");
        return true;
      }
    }
    // Not there: add an empty one and put the caret in it.
    const tail = css.endsWith("\n") ? "" : "\n";
    const block = `${tail}\n${selector} {\n  \n}\n`;
    text.value = css + block;
    const caret = text.value.length - 3;
    renderGutter();
    selectRange(caret, caret);
    setStatus(`Added an empty ${selector} rule`, "ok");
    clearTimeout(pending);
    pending = setTimeout(applyNow, 300);
    return false;
  }

  // --- the inventory -----------------------------------------------------------------------
  //
  // What this demo uses: every class token on the live tree, with how many
  // elements wear it and what kind of element they are, and every rule of the
  // stylesheet the engine parsed.
  function inventory(name) {
    const css = name === editing ? text.value : host.runningCss(name);
    const sheet = new M.EVGStyleSheet();
    try { sheet.parse(css); } catch (e) { /* the editor says why */ }
    const rules = Array.from(sheet.rules).map((r, i) => ({
      cls: r.className,
      pseudo: PSEUDO_NAMES[r.pseudo] || "",
      theme: r.theme || "",
      media: (sheet.ruleMediaOf(i) || "").trim(),
      decls: Array.from(r.decls).map((d) => [d.name, d.value]),
    }));
    const seen = new Map();
    const note = (cls) => {
      if (!seen.has(cls)) seen.set(cls, { cls, count: 0, kinds: new Set(), rules: [], co: new Set() });
      return seen.get(cls);
    };
    const root = host.root(name);
    const walk = (el, parentDisplay, depth) => {
      if (!el || depth > 200) return;
      const tokens = String(el.className || "").split(/\s+/).filter(Boolean);
      const kids = el.children || [];
      for (const t of tokens) {
        const e = note(t);
        e.count++;
        e.inTree = true;
        e.kinds.add("box");
        for (const o of tokens) if (o !== t) e.co.add(o);
        if (String(el.textContent || "").trim()) e.kinds.add("text");
        if (el.svgPath || el.svgSource) e.kinds.add("vector");
        if (el.src || el.tagName === "img") e.kinds.add("image");
        if (kids.length && (el.display === "flex" || el.display === "grid")) e.kinds.add("container");
        if (parentDisplay === "flex" || parentDisplay === "grid") e.kinds.add("item");
      }
      for (let i = 0; i < kids.length; i++) walk(kids[i], el.display, depth + 1);
    };
    try { walk(root, "", 0); } catch (e) { /* a tree mid-rebuild: the sheet still answers */ }
    for (const r of rules) note(r.cls).rules.push(r);
    const all = new Set(seen.keys());
    const out = [];
    for (const e of seen.values()) {
      // A state or variant: `<stem>-<word>` where the stem is a class too.
      // Worn WITH its stem on the live tree is the evidence; a strong state
      // word is enough when the tree has none of the class right now.
      const m = e.cls.match(/^(.*)-([a-z]+)$/);
      const worn = m && e.co.has(m[1]);
      const fits = m && (worn || (!e.inTree && STRONG.has(m[2])) || (e.inTree && STRONG.has(m[2]) && e.co.size === 0));
      if (m && all.has(m[1]) && fits && (STATES[m[2]] || VARIANTS[m[2]])) {
        e.base = m[1];
        if (STATES[m[2]]) { e.state = m[2]; e.when = STATES[m[2]]; }
        else { e.variant = m[2]; e.when = VARIANTS[m[2]]; }
      } else if (m && STRONG.has(m[2]) && !all.has(m[1])) {
        e.state = m[2];
        e.when = STATES[m[2]];
      }
      // Kinds, when the tree has none of it right now: judged from what the
      // rules set, so a popup's row is still "holds text" while it is shut.
      if (!e.inTree) {
        e.kinds.add("box");
        for (const r of e.rules) for (const [n] of r.decls) {
          if (/^(color|font-|line-height|letter-spacing|text-align|white-space)/.test(n)) e.kinds.add("text");
          if (/^(display|flex-direction|gap|justify-content|align-items|grid-template)/.test(n)) e.kinds.add("container");
          if (/^(fill|stroke)/.test(n)) e.kinds.add("vector");
        }
      }
      out.push({
        cls: e.cls, count: e.count, inTree: !!e.inTree, kinds: [...e.kinds],
        base: e.base || "", state: e.state || "", variant: e.variant || "", when: e.when || "",
        rules: e.rules,
      });
    }
    return out;
  }

  // Which component a class belongs to: `ui-combobox-chip` -> `ui-combobox`,
  // `cb-card` -> `cb`. The controllers' classes are `ui-<name>-…`.
  const componentOf = (cls) => {
    const m = cls.match(/^(ui-[a-z0-9]+)/);
    if (m) return m[1];
    return cls.split("-")[0];
  };
  const componentTitle = (comp) => {
    if (comp.startsWith("ui-")) {
      const w = comp.slice(3);
      return `${w[0].toUpperCase()}${w.slice(1)} controller`;
    }
    return `${host.title(which)} page`;
  };

  function applicable(entry, setNames) {
    const kinds = new Set(entry.kinds);
    const out = [];
    for (const f of FAMILIES) {
      if (!kinds.has(f.kind)) continue;
      const names = f.names.filter((n) => has(n) && !setNames.has(n));
      if (names.length) out.push([f.title, names]);
    }
    return out;
  }

  function selectorKey(cls, pseudo) {
    return "." + cls + (pseudo ? ":" + pseudo : "");
  }

  function renderEntryCard(entry, rule, stateNotes) {
    const sel = selectorKey(entry.cls, rule ? rule.pseudo : "");
    const setNames = new Set((rule ? rule.decls : []).map(([n]) => n));
    const card = h("article", { class: "sg-sel", "data-selector": sel, "data-class": entry.cls });
    const head = h("div", { class: "sg-sel-head" },
      h("button", {
        type: "button", class: "sg-jump", title: "Edit this rule",
        "aria-label": `Edit the ${sel} rule`, onclick: () => jumpTo(sel),
      }, code(sel)));
    const tags = h("span", { class: "sg-tags" });
    if (rule && rule.pseudo) tags.append(h("span", { class: "sg-tag state", text: ":" + rule.pseudo }));
    else if (entry.state) tags.append(h("span", { class: "sg-tag state", text: "state" }));
    else if (entry.variant) tags.append(h("span", { class: "sg-tag variant", text: "variant" }));
    if (rule && rule.theme) tags.append(h("span", { class: "sg-tag", text: "theme " + rule.theme }));
    if (rule && rule.media) tags.append(h("span", { class: "sg-tag", text: "@media " + rule.media }));
    tags.append(h("span", {
      class: "sg-tag dim",
      text: entry.inTree ? `${entry.count}× in tree · ${entry.kinds.filter((k) => k !== "box").map((k) => KIND_WORDS[k]).join(", ") || "box"}` : "not in the tree now",
    }));
    head.append(tags);
    card.append(head);

    // The explanation, from the data.
    const said = [];
    if (rule && rule.pseudo) {
      said.push(`Pseudo-class: applies ${PSEUDO_WHEN[rule.pseudo]}.`);
      const resets = [...setNames].filter((n) => RESET.has(n));
      const sticks = [...setNames].filter((n) => !RESET.has(n) && !stateNotes.base.has(n));
      if (resets.length) said.push(`On leaving, EVG resets ${resets.join(", ")}.`);
      if (sticks.length) said.push(`⚠ ${sticks.join(", ")} ${sticks.length === 1 ? "is" : "are"} not set on .${entry.cls}, so ${sticks.length === 1 ? "it stays" : "they stay"} after the state ends.`);
    } else if (entry.state || entry.variant) {
      said.push(entry.state
        ? `State class: the ${entry.cls.startsWith("ui-") ? "controller" : "demo"} adds it ${entry.when}.`
        : `Variant class: set when the element is built, ${entry.when}.`);
      if (entry.base) {
        said.push(`Write only what changes; .${entry.base} supplies the rest.`);
        const sticks = [...setNames].filter((n) => !stateNotes.baseOf(entry.base).has(n));
        if (sticks.length && entry.state) said.push(`⚠ ${sticks.join(", ")} ${sticks.length === 1 ? "is" : "are"} not set on .${entry.base}: EVG does not reset a property when a class goes away, so ${sticks.length === 1 ? "it stays" : "they stay"} after the state ends.`);
      }
    } else {
      const part = entry.cls === componentOf(entry.cls) ? "root" : entry.cls.slice(componentOf(entry.cls).length + 1);
      said.push(`${componentTitle(componentOf(entry.cls))} — ${part}.`);
      if (!entry.inTree) said.push("Only in the tree in some states (a popup open, a row highlighted…).");
    }
    if (!rule) said.push("No rule in this stylesheet yet: it draws with EVG's defaults. Edit to add one.");
    card.append(h("p", { class: "sg-say", text: said.join(" ") }));

    if (rule && rule.decls.length) {
      const dl = h("dl", { class: "sg-props" });
      for (const [n, v] of rule.decls) {
        const known = has(n) || (facts.fxPrefix && n.startsWith(facts.fxPrefix));
        dl.append(h("dt", { class: known ? "" : "bad", title: known ? "" : "Not an EVG property: ignored" }, code(n)), h("dd", {}, code(v)));
      }
      card.append(h("div", { class: "sg-sub", text: "Set now" }), dl);
    }
    const more = applicable(entry, setNames);
    if (more.length) {
      const det = h("details", { class: "sg-more" },
        h("summary", { text: `Also takes effect here (${more.reduce((a, [, ns]) => a + ns.length, 0)})` }));
      for (const [fam, ns] of more) {
        det.append(h("div", { class: "sg-fam" }, h("span", { class: "sg-fam-t", text: fam }), ...ns.map((n) => code(n))));
      }
      card.append(det);
    }
    return card;
  }

  function renderGuide() {
    if (!which) return;
    const inv = inventory(which);
    lastInventory = { name: which, entries: inv };
    const q = (sgFilter.value || "").trim().toLowerCase();
    const byCls = new Map(inv.map((e) => [e.cls, e]));
    const baseSets = new Map();
    const baseOf = (cls) => {
      if (!baseSets.has(cls)) {
        const e = byCls.get(cls);
        baseSets.set(cls, new Set(e ? e.rules.filter((r) => !r.pseudo).flatMap((r) => r.decls.map(([n]) => n)) : []));
      }
      return baseSets.get(cls);
    };
    // Components, in order of first appearance; the page's own classes last.
    const comps = new Map();
    for (const e of inv) {
      const c = componentOf(e.base || e.cls);
      if (!comps.has(c)) comps.set(c, []);
      comps.get(c).push(e);
    }
    const order = [...comps.keys()].sort((a, b) => (a.startsWith("ui-") ? 0 : 1) - (b.startsWith("ui-") ? 0 : 1));
    const nStates = inv.filter((e) => e.state).length;
    const nRules = inv.reduce((a, e) => a + e.rules.length, 0);
    sgSummary.textContent = `${host.title(which)} uses ${inv.length} classes (${inv.filter((e) => e.inTree).length} on elements now, ${nStates} state classes) and ${nRules} rules. Click a selector to edit it.`;
    const frag = document.createDocumentFragment();
    for (const comp of order) {
      const entries = comps.get(comp);
      // Parts: a base class followed by its states and variants.
      const bases = entries.filter((e) => !e.base);
      const children = (cls) => entries.filter((e) => e.base === cls);
      const sec = h("section", { class: "sg-comp", "data-component": comp },
        h("h3", {}, componentTitle(comp), " ", h("span", { class: "sg-dim", text: `.${comp}${comp.startsWith("ui-") ? "-*" : "-*"}` })));
      let shown = 0;
      const addCard = (e) => {
        const rules = e.rules.length ? e.rules : [null];
        for (const r of rules) {
          const sel = selectorKey(e.cls, r ? r.pseudo : "");
          if (q && !sel.toLowerCase().includes(q)) continue;
          sec.append(renderEntryCard(e, r, { base: baseOf(e.cls), baseOf }));
          shown++;
        }
      };
      for (const b of bases) {
        addCard(b);
        for (const c of children(b.cls)) addCard(c);
      }
      if (shown) frag.append(sec);
    }
    if (!frag.childNodes.length) frag.append(h("p", { class: "sg-dim", text: q ? "No selector matches." : "This demo uses no classes." }));
    sgBody.replaceChildren(frag);
  }
  sgFilter.addEventListener("input", renderGuide);
  $("sgrescan").addEventListener("click", renderGuide);

  // --- the reference, once, from the engine's own lists ---------------------------------
  function renderReference() {
    const seen = new Set();
    const famOf = new Map();
    for (const f of FAMILIES) for (const n of f.names) famOf.set(n, f.title);
    const groups = new Map(FAMILIES.map((f) => [f.title, []]));
    groups.set("Other styling", []);
    groups.set("Accepted, but not styling", []);
    for (const p of facts.props) {
      const n = cssName(p);
      if (seen.has(n)) continue;
      seen.add(n);
      const g = famOf.get(n) || (isStructural(n) ? "Accepted, but not styling" : "Other styling");
      groups.get(g).push(p);
    }
    const frag = document.createDocumentFragment();
    frag.append(h("p", {}, "Generated from the engine at build time: ",
      code("EVGElement.setAttribute"), " (properties), ", code("EVGStyleSheet"), " (selectors, @-rules, pseudo-classes), ",
      code("EVGUnit"), ", ", code("EVGGradient"), ", ", code("EVGTransition"), " and ", code("EVGEasing"), "."));
    frag.append(h("h4", { text: "Selectors" }), h("ul", {},
      h("li", {}, code(".class"), " — one class per selector. Selector lists (", code(".a, .b"), ") are fine."),
      h("li", {}, code(".theme-x .class"), " — the only descendant form: the rule applies under theme ", code("x"), "."),
      h("li", {}, "Pseudo-classes: ", ...facts.pseudo.flatMap((p, i) => [i ? ", " : "", code(":" + p)]), ". Anything else is reported and never matches."),
      h("li", {}, "No ids, element names, attribute selectors, ", code(">"), ", ", code("+"), " or ", code("!important"), ". Precedence: plain rules < theme rules < state rules, then source order; inline attributes win.")));
    const typeWord = { color: "colour", length: "length", number: "number", gradient: "gradient", keyword: "keyword" };
    frag.append(h("h4", { text: `Properties (${seen.size})` }));
    for (const [g, ps] of groups) {
      if (!ps.length) continue;
      frag.append(h("div", { class: "sg-fam" }, h("span", { class: "sg-fam-t", text: g }),
        ...ps.map((p) => h("code", { title: `${typeWord[p.type]}${p.names.length > 1 ? " · also " + p.names.filter((x) => x !== cssName(p)).join(", ") : ""}`, text: cssName(p) }))));
    }
    if (facts.fxPrefix) frag.append(h("p", {}, code(facts.fxPrefix + "<name>"), " — any number, read by the surface effect named in ", code("evg-surface-effect"), "."));
    frag.append(h("h4", { text: "Units" }), h("p", {},
      ...facts.units.flatMap((u, i) => [i ? " " : "", code(u)]), " and ",
      ...facts.unitKeywords.flatMap((u, i) => [i ? ", " : "", code(u)]),
      ". A bare number is pixels. ", code("calc()"), " and other units are reported as unsupported lengths and ignored."));
    frag.append(h("h4", { text: "Colours and gradients" }), h("p", {},
      code("#rgb"), ", ", code("#rrggbb"), ", ", code("#rrggbbaa"), ", ", code("rgb()"), ", ", code("rgba()"), ", ", code("hsl()"), ", ", code("transparent"),
      ". Gradients: ", ...facts.gradients.flatMap((g, i) => [i ? ", " : "", code(g + "(…)")]),
      " in ", code("background"), " or ", code("background-gradient"), ", with an angle (", code("90deg"), ") or ", code("to right"), " and any number of stops."));
    frag.append(h("h4", { text: "Shadows" }), h("p", {},
      "No ", code("box-shadow"), ": EVG draws one soft shadow from ", ...["shadow-color", "shadow-radius", "shadow-offset-x", "shadow-offset-y"].filter(has).flatMap((n, i) => [i ? ", " : "", code(n)]), "."));
    frag.append(h("h4", { text: "Transitions and transform" }), h("p", {},
      code("transition: <property> <duration> <timing>"), ", comma-separated. It animates ",
      ...facts.transitionable.flatMap((n, i) => [i ? ", " : "", code(n)]), ". Timing: ",
      ...facts.timing.flatMap((n, i) => [i ? ", " : "", code(n)]), ". ",
      code("transform"), " takes ", ...facts.transformFns.flatMap((n, i) => [i ? ", " : "", code(n + "()")]),
      " and is applied after layout, so it moves nothing else."));
    frag.append(h("h4", { text: "@-rules" }), h("ul", {},
      h("li", {}, code("@media"), " — features ", ...facts.media.flatMap((n, i) => [i ? ", " : "", code(n)]),
        ", joined with ", code("and"), ". Evaluated against the demo's own page size, not the window. A comma list is refused."),
      h("li", {}, code("@vars { --ink: #09090b; }"), " (and ", code("@vars <theme>"), ") declares the palette; use it anywhere as ", code("var(--ink)"), " or ", code("var(--ink, #000)"), ". ", code("--x"), " on a class is an error."),
      h("li", {}, "Every other @-rule is skipped and reported.")));
    frag.append(h("h4", { text: "Limitations" }), h("ul", {},
      h("li", {}, "Properties are not reset when a rule stops matching. Leaving a ", code(":pseudo"), " state resets only ",
        ...facts.resetOnLeave.filter((n) => n.includes("-") || n === n.toLowerCase()).flatMap((n, i) => [i ? ", " : "", code(n)]),
        "; a state CLASS going away resets nothing. Set every property a state changes on the base rule too."),
      h("li", {}, "Borders draw on all four sides only: no ", code("border-top"), " … ", code("border-left"), ". The style word (",
        ...facts.borderWords.flatMap((n, i) => [i ? ", " : "", code(n)]), ") is read only for ", code("none"), "."),
      h("li", {}, "No inheritance except text colour and size; no ", code("z-index"), " (tree order paints)."),
      h("li", {}, "Paint-only properties (no relayout): ", ...facts.paintOnly.filter(has).flatMap((n, i) => [i ? ", " : "", code(n)]), ".")));
    sgRef.replaceChildren(frag);
  }

  // --- tabs, open and close ---------------------------------------------------------------
  function showTab(i, focus) {
    tabs.forEach((t, j) => {
      t.setAttribute("aria-selected", String(i === j));
      t.tabIndex = i === j ? 0 : -1;
      panes[j].hidden = i !== j;
    });
    if (i === 0) renderGuide();
    if (focus) tabs[i].focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => showTab(i, false));
    t.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        showTab((i + 1) % 2, true);
      } else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        showTab(e.key === "Home" ? 0 : 1, true);
      }
    });
  });

  const isOpen = () => !panel.hidden;
  function open() {
    opener = button;
    if (editing !== which) loadEditor(which);
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    document.body.classList.add("styles-open");
    if (!panes[0].hidden) renderGuide();
    heading.focus({ preventScroll: true });
  }
  function close() {
    if (!isOpen()) return;
    if (pending) applyNow();
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    document.body.classList.remove("styles-open");
    (opener || button).focus({ preventScroll: true });
  }
  button.addEventListener("click", () => (isOpen() ? close() : open()));
  closeBtn.addEventListener("click", close);
  // Escape from anywhere in the panel, the editor included.
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  let referenced = false;
  $("sgref").addEventListener("toggle", () => {
    if (!referenced) { renderReference(); referenced = true; }
  });

  /** The demo on screen changed (or the page just started). */
  function sync() {
    const next = host.current();
    if (next === which) {
      syncBadges();
      return;
    }
    if (pending && editing) applyNow();
    which = next;
    if (title) title.textContent = host.title(which);
    syncBadges();
    if (isOpen()) {
      loadEditor(which);
      if (!panes[0].hidden) renderGuide();
    }
  }

  sync();
  renderReference();
  referenced = true;

  return {
    sync,
    api: {
      open, close, isOpen,
      inventory: (name) => inventory(name || which),
      guideSelectors: () => [...sgBody.querySelectorAll("[data-selector]")].map((e) => e.dataset.selector),
      validate,
      applyNow,
      lastApply: () => lastApply,
      jumpTo,
      showTab: (i) => showTab(i, false),
      root: (name) => host.root(name || which),
    },
  };
}

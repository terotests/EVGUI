#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Writes src/UiEmojiData.rgr: the emojis EVG can draw, in Unicode's order and
 * groups, with their English and Finnish names and search words.
 *
 *   node scripts/emoji-catalog.mjs --font <NotoEmoji-Regular.ttf> --data <emojibase-data dir>
 *
 * "Can draw" means the emoji face EVG ships (Ranger's
 * gallery/pdf_writer/assets/fonts/Noto_Emoji, the face the PDF writer
 * embeds) has ONE glyph for it: a single codepoint in its cmap, or a
 * sequence (ZWJ families, flags, keycaps) its GSUB ligatures collapse into
 * one glyph. That is the same shaping TrueTypeFont.shape does (variation
 * selectors dropped, longest ligature first, ccmp/liga/rlig only), so what
 * the picker offers is what a PDF export draws, not only what a browser does.
 * Skin-tone variants are left out: the picker offers the base emoji.
 *
 * The names and words are emojibase-data's (MIT; CLDR annotations), taken
 * from the npm package: `npm pack emojibase-data` and unpack it.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const fontPath = arg("--font", path.resolve(REPO, "../pdf_writer/assets/fonts/Noto_Emoji/NotoEmoji-Regular.ttf"));
const dataDir = arg("--data", "");
const outPath = arg("--out", path.join(REPO, "src/UiEmojiData.rgr"));
if (!dataDir) {
  console.error("usage: emoji-catalog.mjs --font <ttf> --data <emojibase-data package dir> [--out <file>]");
  process.exit(2);
}

// --- the face: cmap and the composing ligatures ---------------------------------
const buf = fs.readFileSync(fontPath);
const u16 = (o) => buf.readUInt16BE(o);
const u32 = (o) => buf.readUInt32BE(o);
const tables = new Map();
for (let i = 0, n = u16(4); i < n; i += 1) {
  const r = 12 + i * 16;
  tables.set(buf.toString("latin1", r, r + 4), u32(r + 8));
}

const cmap = new Map();
{
  const base = tables.get("cmap");
  let best = -1;
  let bestFormat = 0;
  for (let i = 0, n = u16(base + 2); i < n; i += 1) {
    const sub = base + u32(base + 4 + i * 8 + 4);
    const format = u16(sub);
    if (format === 12 || (format === 4 && bestFormat !== 12)) { best = sub; bestFormat = format; }
  }
  if (bestFormat === 12) {
    for (let g = 0, n = u32(best + 12); g < n; g += 1) {
      const r = best + 16 + g * 12;
      const start = u32(r);
      const end = u32(r + 4);
      const gid = u32(r + 8);
      for (let c = start; c <= end; c += 1) cmap.set(c, gid + (c - start));
    }
  } else if (bestFormat === 4) {
    const segs = u16(best + 6) / 2;
    const ends = best + 14;
    const starts = ends + segs * 2 + 2;
    const deltas = starts + segs * 2;
    const ranges = deltas + segs * 2;
    for (let s = 0; s < segs; s += 1) {
      const end = u16(ends + s * 2);
      const start = u16(starts + s * 2);
      const delta = u16(deltas + s * 2);
      const ro = u16(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c += 1) {
        let g;
        if (ro === 0) g = (c + delta) & 0xffff;
        else {
          g = u16(ranges + s * 2 + ro + (c - start) * 2);
          if (g !== 0) g = (g + delta) & 0xffff;
        }
        if (g !== 0) cmap.set(c, g);
      }
    }
  }
}

function coverageIndex(cov, gid) {
  const format = u16(cov);
  const n = u16(cov + 2);
  if (format === 1) {
    for (let i = 0; i < n; i += 1) if (u16(cov + 4 + i * 2) === gid) return i;
    return -1;
  }
  for (let i = 0; i < n; i += 1) {
    const r = cov + 4 + i * 6;
    const a = u16(r);
    const b = u16(r + 2);
    if (gid >= a && gid <= b) return u16(r + 4) + (gid - a);
  }
  return -1;
}

const ligSubs = [];
if (tables.has("GSUB")) {
  const g = tables.get("GSUB");
  const features = g + u16(g + 6);
  const lookups = g + u16(g + 8);
  const lookupCount = u16(lookups);
  const seen = new Set();
  for (let f = 0, n = u16(features); f < n; f += 1) {
    const rec = features + 2 + f * 6;
    const tag = buf.toString("latin1", rec, rec + 4);
    if (tag !== "ccmp" && tag !== "liga" && tag !== "rlig") continue;
    const feat = features + u16(rec + 4);
    for (let li = 0, m = u16(feat + 2); li < m; li += 1) {
      const idx = u16(feat + 4 + li * 2);
      if (idx >= lookupCount || seen.has(idx)) continue;
      seen.add(idx);
      const lk = lookups + u16(lookups + 2 + idx * 2);
      const type = u16(lk);
      for (let s = 0, k = u16(lk + 4); s < k; s += 1) {
        const sub = lk + u16(lk + 6 + s * 2);
        if (type === 4) ligSubs.push(sub);
        if (type === 7 && u16(sub + 2) === 4) ligSubs.push(sub + u32(sub + 4));
      }
    }
  }
}

function ligatureAt(gids, start) {
  let bestLen = 0;
  let best = 0;
  for (const sub of ligSubs) {
    const ci = coverageIndex(sub + u16(sub + 2), gids[start]);
    if (ci < 0 || ci >= u16(sub + 4)) continue;
    const set = sub + u16(sub + 6 + ci * 2);
    for (let l = 0, n = u16(set); l < n; l += 1) {
      const lig = set + u16(set + 2 + l * 2);
      const count = u16(lig + 2);
      if (count > gids.length - start || count <= bestLen) continue;
      let ok = true;
      for (let c = 1; c < count && ok; c += 1) ok = u16(lig + 2 + c * 2) === gids[start + c];
      if (ok) { bestLen = count; best = u16(lig); }
    }
  }
  return [best, bestLen];
}

// One glyph for the whole emoji?
function oneGlyph(text) {
  const cps = [...text].map((c) => c.codePointAt(0)).filter((c) => c !== 0xfe0e && c !== 0xfe0f);
  const gids = [];
  for (const c of cps) {
    const g = cmap.get(c);
    if (!g) return false;
    gids.push(g);
  }
  let glyphs = 0;
  for (let i = 0; i < gids.length;) {
    const [, len] = ligatureAt(gids, i);
    i += len > 1 ? len : 1;
    glyphs += 1;
  }
  return glyphs === 1;
}

// --- the catalogue -------------------------------------------------------------------
const en = JSON.parse(fs.readFileSync(path.join(dataDir, "en/compact.json"), "utf8"));
const fi = JSON.parse(fs.readFileSync(path.join(dataDir, "fi/compact.json"), "utf8"));
const fiBy = new Map(fi.map((e) => [e.hexcode, e]));
const GROUPS = ["smileys", "people", "component", "nature", "food", "travel", "activities", "objects", "symbols", "flags"];

// Search words not already in the name, once each.
const words = (label, tags) => {
  const have = new Set(label.toLowerCase().split(/[^\p{L}\p{N}]+/u));
  const out = [];
  for (const t of tags || []) {
    const w = t.toLowerCase();
    if (!have.has(w)) { have.add(w); out.push(w); }
  }
  return out.join(" ");
};
const clean = (s) => s.replace(/[\t\n\\"]/g, " ");

const rows = [];
let dropped = 0;
for (const e of en.sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9))) {
  if (e.group === undefined || e.group === 2) continue; // components: skin tones, hair
  if (!oneGlyph(e.unicode)) { dropped += 1; continue; }
  const f = fiBy.get(e.hexcode);
  rows.push([GROUPS[e.group], e.unicode, clean(e.label), clean(f?.label || ""), clean(words(e.label, e.tags) + (f ? " " + words(f.label, f.tags) : "")).trim()].join("\t"));
}

const quote = (s) => JSON.stringify(s).replace(/\\t/g, "\\t");
const lines = [];
for (let i = 0; i < rows.length; i += 64) lines.push("        push out " + quote(rows.slice(i, i + 64).join("\n")));

const src = `; SPDX-License-Identifier: AGPL-3.0-or-later
;
; GENERATED by scripts/emoji-catalog.mjs — do not edit by hand.
;
; The emojis EVG's emoji face (Noto Emoji, as the PDF writer embeds it) draws
; as one glyph, ${rows.length} of them, in Unicode's order. One per line:
;
;   group <TAB> emoji <TAB> English name <TAB> Finnish name <TAB> search words
;
; Names and words: emojibase-data (MIT), from CLDR's annotations.

class UiEmojiData {
    sfn chunks:[string] () {
        def out:[string]
${lines.join("\n")}
        return out
    }
}
`;
fs.writeFileSync(outPath, src);
console.log(`${rows.length} emojis written to ${path.relative(process.cwd(), outPath)} (${dropped} the face has no single glyph for; ${(src.length / 1024).toFixed(0)} KB)`);

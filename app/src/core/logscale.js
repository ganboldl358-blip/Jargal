// Pure helpers for the strip log (graphic log): zoom levels, depth ticks,
// value scales, step-curve paths, track layout, QC-sample placement and text
// fitting. No DOM and no store access, so everything here is unit-tested in node.

import { isNum, natCmp } from './util.js';
import { splitElementKey } from './schema.js';

// ------------------------------------------------------------------ zoom

/** Vertical scale steps (px per metre) used by the zoom buttons. */
export const ZOOMS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60];
export const PPM_MIN = 0.25;
export const PPM_MAX = 60;

export const clampPpm = (v) => (isNum(v) ? Math.min(PPM_MAX, Math.max(PPM_MIN, v)) : 4);

/** Next zoom level up (dir > 0) or down (dir < 0) from the current scale. */
export function stepZoom(cur, dir) {
  const c = clampPpm(cur);
  if (dir > 0) {
    for (const z of ZOOMS) if (z > c * 1.001) return z;
    return PPM_MAX;
  }
  for (let i = ZOOMS.length - 1; i >= 0; i--) if (ZOOMS[i] < c / 1.001) return ZOOMS[i];
  return PPM_MIN;
}

/** Scale that fits `depth` metres into `px` pixels. */
export function fitPpm(depth, px) {
  if (!(depth > 0) || !(px > 0)) return 4;
  return clampPpm(px / depth);
}

/** Approximate print scale (1:N) of a px/m value on a 96 dpi screen. */
export function approxScale(ppm) {
  if (!(ppm > 0)) return null;
  const n = 1000 / ((ppm * 25.4) / 96);
  const e = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / e) * e;
}

// ----------------------------------------------------------- depth ticks

const STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const divides = (big, small) => Math.abs(big / small - Math.round(big / small)) < 1e-9;

function seq(step, max) {
  const out = [];
  const n = Math.floor(max / step + 1e-9);
  for (let i = 0; i <= n; i++) out.push(Math.round(i * step * 1e6) / 1e6);
  return out;
}

/**
 * Depth-ruler ticks for a vertical scale. Labelled (major) ticks are at least
 * `labelPx` apart and always whole metres; minor ticks at least `minorPx` apart
 * and dividing the major step evenly.
 */
export function depthTicks(ppm, maxDepth, { labelPx = 40, minorPx = 5 } = {}) {
  const p = ppm > 0 ? ppm : 1;
  const major = STEPS.find((s) => s >= 1 && s * p >= labelPx) ?? STEPS[STEPS.length - 1];
  const minor = STEPS.find((s) => s <= major && s * p >= minorPx && divides(major, s)) ?? major;
  const half = major / 2;
  const mid = half >= minor && divides(half, minor) && half * p >= 2 * minorPx ? half : null;
  const max = maxDepth > 0 ? maxDepth : 0;
  return { major, minor, mid, majorDepths: seq(major, max), minorDepths: minor < major ? seq(minor, max) : [], midDepths: mid ? seq(mid, max) : [] };
}

/** Label for a ruler tick. */
export const depthLabel = (m, step) => (step >= 1 ? String(Math.round(m)) : trimNum(m, 1));

// ---------------------------------------------------------- value scales

/** Round up to a "nice" axis maximum: 1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8 × 10ⁿ. */
export function niceMax(v) {
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  const e = Math.floor(Math.log10(v));
  const b = 10 ** e;
  const f = v / b;
  const n = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => x >= f - 1e-9) ?? 10;
  return Number((n * b).toPrecision(6));
}

/** Axis domain for a set of values: linear 0..niceMax, or log over whole decades. */
export function valueDomain(values, log = false) {
  let max = -Infinity;
  let minPos = Infinity;
  let n = 0;
  for (const v of values) {
    if (!isNum(v)) continue;
    n++;
    if (v > max) max = v;
    if (v > 0 && v < minPos) minPos = v;
  }
  const dataMax = n ? max : null;
  if (!log) return { min: 0, max: niceMax(n ? max : 0), log: false, dataMax };
  if (!Number.isFinite(minPos)) return { min: 0.001, max: 1, log: true, dataMax };
  let lo = 10 ** Math.floor(Math.log10(minPos) + 1e-9);
  let hi = 10 ** Math.ceil(Math.log10(max) - 1e-9);
  if (hi <= lo) hi = lo * 10;
  if (hi / lo > 1e6) lo = hi / 1e6;
  return { min: Number(lo.toPrecision(3)), max: Number(hi.toPrecision(3)), log: true, dataMax };
}

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Map a value onto [x0, x1] for a domain from valueDomain(); clamps; null for non-numbers. */
export function valueScale(dom, x0, x1) {
  if (dom.log) {
    const a = Math.log10(dom.min);
    const b = Math.log10(dom.max);
    return (v) => (isNum(v) ? x0 + (x1 - x0) * clamp01(v > 0 ? (Math.log10(v) - a) / (b - a || 1) : 0) : null);
  }
  const span = dom.max - dom.min || 1;
  return (v) => (isNum(v) ? x0 + (x1 - x0) * clamp01((v - dom.min) / span) : null);
}

/** Gridline values inside a domain: quarters (linear) or decades (log). */
export function valueTicks(dom) {
  if (dom.log) {
    const out = [];
    for (let e = Math.round(Math.log10(dom.min)); e <= Math.round(Math.log10(dom.max)); e++) out.push(Number((10 ** e).toPrecision(3)));
    return out;
  }
  return [0, 0.25, 0.5, 0.75, 1].map((f) => Number((dom.min + (dom.max - dom.min) * f).toPrecision(6)));
}

/** Fixed decimals without trailing zeros: 0.500 → "0.5". */
export const trimNum = (v, d) => String(Number(v.toFixed(d)));

/** Compact number for labels: ~3 significant figures, no trailing zeros. */
export function fmtVal(v) {
  if (!isNum(v)) return '';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 100) return String(Math.round(v));
  if (a >= 10) return trimNum(v, 1);
  if (a >= 1) return trimNum(v, 2);
  return trimNum(v, Math.min(6, 2 - Math.floor(Math.log10(a))));
}

/** Value to plot for an assay: below-detection ('<' flag or negative) → half LOR / LOR / zero. */
export function plotValue(v, flag, mode = 'half') {
  if (!isNum(v)) return null;
  const below = flag === '<' || v < 0;
  if (!below) return v;
  const a = Math.abs(v);
  if (mode === 'lor') return a;
  if (mode === 'zero') return 0;
  return a / 2;
}

const THRESH = {
  Au: { ppm: 0.5, gpt: 0.5, gt: 0.5, ppb: 500 },
  Ag: { ppm: 10, gpt: 10, gt: 10 },
  Cu: { pct: 0.2, ppm: 2000 },
  Mo: { ppm: 100, pct: 0.01 },
  Zn: { pct: 1, ppm: 10000 },
  Pb: { pct: 1, ppm: 10000 },
};

/** Grade highlight threshold for an element key (settings override, else house defaults). */
export function gradeThreshold(key, elementSettings) {
  const s = elementSettings?.[key];
  for (const k of ['stripThreshold', 'threshold', 'highlight']) if (isNum(s?.[k])) return s[k];
  const { el, unit } = splitElementKey(key);
  return THRESH[el]?.[unit] ?? null;
}

// ------------------------------------------------------------ step paths

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * SVG path strings for a down-hole step curve.
 * segs: sorted [{from, to, v}]; xOf(v) → x; yOf(depth) → y; xBase = axis origin.
 * Runs are broken at gaps (> eps metres) and at missing values.
 * Returns {line, area}: the step outline, and the closed area between it and xBase.
 */
export function stepPaths(segs, xOf, yOf, xBase, eps = 1e-3) {
  let line = '';
  let area = '';
  let run = [];
  const flush = () => {
    if (!run.length) return;
    const xb = r1(xBase);
    run.forEach((s, i) => {
      const x = r1(xOf(s.v));
      const y0 = r1(yOf(s.from));
      const y1 = r1(yOf(s.to));
      line += `${i ? 'L' : 'M'}${x} ${y0}V${y1}`;
      area += `${i ? '' : `M${xb} ${y0}`}L${x} ${y0}V${y1}`;
    });
    area += `H${xb}Z`;
    run = [];
  };
  let prevTo = null;
  for (const s of segs) {
    const ok = isNum(s.v) && isNum(s.from) && isNum(s.to) && s.to > s.from;
    if (!ok) {
      flush();
      prevTo = null;
      continue;
    }
    if (prevTo !== null && Math.abs(s.from - prevTo) > eps) flush();
    run.push(s);
    prevTo = s.to;
  }
  flush();
  return { line, area };
}

/** Rectangle as a path fragment (many rectangles of one colour → one <path>). */
export const rectPath = (x, y, w, h) => (w > 0 && h > 0 ? `M${r1(x)} ${r1(y)}h${r1(w)}v${r1(h)}h${r1(-w)}Z` : '');

// ----------------------------------------------------------- track layout

/**
 * Lay tracks out across `avail` px. Each track: {w (preferred), min, max?, grow}.
 * Wider than preferred → the extra goes to growable tracks (capped at max);
 * narrower → every track shrinks toward its min; below the sum of mins → mins
 * (the log then scrolls sideways). Returns {tracks: [{...t, x, w}], width}.
 */
export function layoutTracks(tracks, avail) {
  const pref = tracks.reduce((s, t) => s + t.w, 0);
  const minSum = tracks.reduce((s, t) => s + (t.min ?? t.w), 0);
  let widths = tracks.map((t) => t.w);
  if (avail > pref) {
    let extra = avail - pref;
    const open = new Set(tracks.map((t, i) => (t.grow > 0 ? i : -1)).filter((i) => i >= 0));
    for (let pass = 0; pass < tracks.length && extra > 0.5 && open.size; pass++) {
      const g = [...open].reduce((s, i) => s + tracks[i].grow, 0);
      let used = 0;
      for (const i of [...open]) {
        const t = tracks[i];
        const add = (extra * t.grow) / g;
        const cap = isNum(t.max) ? t.max : Infinity;
        const nw = Math.min(cap, widths[i] + add);
        used += nw - widths[i];
        widths[i] = nw;
        if (nw >= cap - 1e-6) open.delete(i);
      }
      extra -= used;
      if (used < 0.5) break;
    }
  } else if (avail < pref) {
    const f = pref > minSum ? Math.max(0, (avail - minSum) / (pref - minSum)) : 0;
    widths = tracks.map((t) => (t.min ?? t.w) + (t.w - (t.min ?? t.w)) * f);
  }
  let x = 0;
  const out = tracks.map((t, i) => {
    const w = Math.max(1, Math.floor(widths[i]));
    const o = { ...t, x, w };
    x += w;
    return o;
  });
  return { tracks: out, width: x };
}

// ----------------------------------------------------------- QC placement

const QC_KIND = { CRM: 'crm', BLK: 'blank', FDUP: 'dup', CDUP: 'dup', PDUP: 'dup' };
export const isPrimary = (s) => !s?.sampleType || s.sampleType === 'PRIM';

/**
 * Where to draw QC samples on the log. Own depth when logged; a duplicate
 * without depth sits at its parent; CRMs/blanks without depth go at the base of
 * the previous primary sample in sampleId order (they were inserted after it);
 * anything else is skipped. Returns [{row, kind, depth, how, after?}].
 */
export function placeQC(samples) {
  const list = [...samples].sort((a, b) => natCmp(a.sampleId, b.sampleId));
  const byId = new Map(list.map((s) => [String(s.sampleId), s]));
  const mid = (s) => (isNum(s.to) ? (s.from + s.to) / 2 : s.from);
  const out = [];
  let prev = null;
  for (const s of list) {
    if (isPrimary(s)) {
      if (isNum(s.from)) prev = s;
      continue;
    }
    const kind = QC_KIND[s.sampleType] || 'dup';
    if (isNum(s.from)) {
      out.push({ row: s, kind, depth: mid(s), how: 'own' });
      continue;
    }
    const parent = s.parentId ? byId.get(String(s.parentId)) : null;
    if (parent && isNum(parent.from)) {
      out.push({ row: s, kind, depth: mid(parent), how: 'parent', after: parent.sampleId });
      continue;
    }
    if (prev && (kind === 'crm' || kind === 'blank')) out.push({ row: s, kind, depth: isNum(prev.to) ? prev.to : prev.from, how: 'prev', after: prev.sampleId });
  }
  return out.sort((a, b) => a.depth - b.depth);
}

// ------------------------------------------------------------- aggregation

/** pXRF readings of one element grouped by interval (mean of repeat shots). */
export function aggregateReadings(list, key) {
  const m = new Map();
  for (const r of list) {
    const v = r.values?.[key];
    if (!isNum(v) || !isNum(r.from)) continue;
    const to = isNum(r.to) && r.to > r.from ? r.to : null;
    const k = `${r.from}|${to ?? ''}`;
    const g = m.get(k) || { from: r.from, to, sum: 0, n: 0, rows: [] };
    g.sum += v;
    g.n++;
    g.rows.push(r);
    m.set(k, g);
  }
  return [...m.values()].map((g) => ({ from: g.from, to: g.to, v: g.sum / g.n, n: g.n, rows: g.rows })).sort((a, b) => a.from - b.from || (a.to ?? a.from) - (b.to ?? b.from));
}

// ---------------------------------------------------------- hit testing

/**
 * Interval under y in a list sorted by y0 ([{y0, y1}]). Thin intervals get a
 * `pad`-pixel grace zone so they stay hoverable at small scales.
 */
export function findInterval(list, y, pad = 2) {
  let lo = 0;
  let hi = list.length - 1;
  let i = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (list[m].y0 <= y) {
      i = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  let best = null;
  let bd = Infinity;
  for (let k = Math.max(0, i - 3); k <= Math.min(list.length - 1, i + 1); k++) {
    const it = list[k];
    const d = y < it.y0 ? it.y0 - y : y > it.y1 ? y - it.y1 : 0;
    if (d <= pad && d < bd) {
      best = it;
      bd = d;
    }
  }
  return best;
}

/** Nearest point ({x, y}) within `radius` px; ignores x when the point has none. */
export function findPoint(list, x, y, radius = 7) {
  let best = null;
  let bd = radius;
  for (const p of list) {
    const d = isNum(p.x) ? Math.hypot(p.x - x, p.y - y) : Math.abs(p.y - y);
    if (d <= bd) {
      best = p;
      bd = d;
    }
  }
  return best;
}

// ----------------------------------------------------------- code scales

const INT_FRAC = { W: 0.2, M: 0.4, S: 0.6, H: 0.8, I: 1 };
/** Bar width fraction for an alteration intensity code (W, M, S, H, I). */
export function intFrac(code) {
  if (code === null || code === undefined || code === '') return 0;
  return INT_FRAC[String(code).trim().toUpperCase()] ?? 0.5;
}

/** Bar width fraction for weathering 1 (completely weathered) … 6 (fresh). */
export function weathFrac(code) {
  const n = Number(code);
  if (!Number.isInteger(n) || n < 1 || n > 6) return 0;
  return (7 - n) / 6;
}

// ----------------------------------------------------------------- text

/** Word-wrap into at most `maxLines` lines of `cols` characters (ellipsis when cut). */
export function wrapText(text, cols, maxLines = 1) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!s || cols < 2 || maxLines < 1) return [];
  const lines = [];
  let cur = '';
  for (let w of s.split(' ')) {
    while (w.length > cols) {
      if (cur) {
        lines.push(cur);
        cur = '';
      }
      lines.push(w.slice(0, cols));
      w = w.slice(cols);
    }
    if (!w) continue;
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= cols) cur += ' ' + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  const last = out[maxLines - 1];
  out[maxLines - 1] = (last.length >= cols ? last.slice(0, cols - 1) : last).replace(/[\s,.;:–-]+$/, '') + '…';
  return out;
}

/** Keep the start of a label: "Rhyolite with…" */
export const fitHead = (s, n) => {
  const t = String(s ?? '');
  if (n < 1) return '';
  return t.length <= n ? t : t.slice(0, Math.max(1, n - 1)) + '…';
};

/** Keep the end of an ID: "…012345" (sample tags differ in their last digits). */
export const fitTail = (s, n) => {
  const t = String(s ?? '');
  if (n < 1) return '';
  return t.length <= n ? t : '…' + t.slice(t.length - Math.max(1, n - 1));
};

// ---------------------------------------------------------------- colour

function parseHex(c) {
  const m = String(c ?? '').trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** Readable text colour (near-black or white) on a hex fill. */
export function inkOn(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return '#15201f';
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  return L > 0.2 ? '#15201f' : '#ffffff';
}

/**
 * Replace var(--token[, fallback]) with concrete values (for SVG export).
 * `lookup(name)` returns the token value; double quotes are turned into single
 * quotes so the result is safe inside an XML attribute.
 */
export function resolveCssVars(str, lookup) {
  const re = /var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,\s*([^()]*?))?\s*\)/g;
  let s = String(str);
  for (let pass = 0; pass < 4 && /var\(\s*--/.test(s); pass++) {
    s = s.replace(re, (_, name, fb) => {
      const v = String(lookup(name) ?? '').trim();
      return (v || (fb ?? '').trim()).replace(/"/g, "'");
    });
  }
  return s;
}

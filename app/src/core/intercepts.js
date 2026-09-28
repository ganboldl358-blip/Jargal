// Significant intercepts (ASX / JORC Table 1 "data aggregation" style).
//
// A composite starts on a sample at or above the cut-off and grows downhole,
// accepting internal waste (samples below cut-off, and unsampled gaps when the
// gap policy is 'zero') up to `maxDil` consecutive metres, as long as the
// composite stays at or above the cut-off and ends on a sample at or above it.
// Trailing waste is never included. Composites shorter than `minLen` (or below
// `minGradeThickness` grade×metres when set) are dropped. "Including" intervals
// are the same calculation at the higher `incl` cut-off, inside each composite.
// All grades are length-weighted.
//
// Pure: the store is injected (samplesOf / assay functions) so it runs in tests.

import { isNum, round, fix, natCmp } from './util.js';
import { splitElementKey } from './schema.js';

const EPS = 1e-6;
const PRECIOUS = new Set(['Au', 'Ag', 'Pt', 'Pd', 'Rh', 'Ru', 'Ir', 'Os']);
const SENTINELS = new Set([-99, -999, -9999, -99.9, -99999]);

export const DEFAULT_PARAMS = {
  element: 'Au_ppm',
  cutoff: 0.3,
  minLen: 2,
  maxDil: 3,
  incl: 1,
  secondary: [],
  gapPolicy: 'zero', // 'zero' | 'break'
  minGradeThickness: null,
  inclMinLen: null, // null → same as minLen
  inclMaxDil: null, // null → same as maxDil
  bdl: 'half', // below detection: 'half' | 'lor' | 'zero'
};

const numOr = (v, d = null) => {
  if (v === null || v === undefined || v === '') return d;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

/** Fill defaults and coerce numbers. */
export function normParams(p = {}) {
  const q = { ...DEFAULT_PARAMS, ...Object.fromEntries(Object.entries(p || {}).filter(([, v]) => v !== undefined)) };
  const secondary = (Array.isArray(q.secondary) ? q.secondary : String(q.secondary || '').split(','))
    .map((s) => String(s).trim())
    .filter((s) => s && s !== q.element);
  return {
    element: String(q.element || DEFAULT_PARAMS.element),
    cutoff: numOr(q.cutoff, DEFAULT_PARAMS.cutoff),
    minLen: Math.max(0, numOr(q.minLen, 0)),
    maxDil: Math.max(0, numOr(q.maxDil, 0)),
    incl: numOr(q.incl, null),
    secondary: [...new Set(secondary)],
    gapPolicy: q.gapPolicy === 'break' ? 'break' : 'zero',
    minGradeThickness: numOr(q.minGradeThickness, null),
    inclMinLen: numOr(q.inclMinLen, null),
    inclMaxDil: numOr(q.inclMaxDil, null),
    bdl: ['half', 'lor', 'zero'].includes(q.bdl) ? q.bdl : 'half',
    dp: numOr(q.dp, null),
  };
}

// ------------------------------------------------------------------ units

/** Reporting unit for an element key: Au_ppm → g/t, Cu_pct → %, Mo_ppm → ppm. */
export function gradeUnit(key) {
  const { el, unit } = splitElementKey(key);
  if (unit === 'pct') return '%';
  if (unit === 'gpt' || unit === 'gt') return 'g/t';
  if (unit === 'ppb') return 'ppb';
  if (unit === 'ppm' && PRECIOUS.has(el)) return 'g/t';
  return 'ppm';
}

export const elementSymbol = (key) => splitElementKey(key).el;

function gradeDp(v, unit, dp) {
  if (isNum(dp)) return dp;
  if (unit === 'g/t' || unit === '%') return 2;
  return Math.abs(v) >= 10 ? 0 : 2;
}

/** '1.23 g/t Au', '0.45% Cu', '350 ppm Mo'. */
export function gradeText(v, key, dp) {
  const unit = gradeUnit(key);
  const el = elementSymbol(key);
  const s = isNum(v) ? fix(v, gradeDp(v, unit, dp)) : '–';
  return unit === '%' ? `${s}% ${el}` : `${s} ${unit} ${el}`;
}

/** Grade×thickness unit label ('g/t·m', '%·m'). */
export const gxmUnit = (key) => `${gradeUnit(key)}·m`;

// ------------------------------------------------------------- values

/**
 * Numeric grade of one assay value. Below-detection values ('<0.005', flag '<',
 * or a negative number = −LOR) become half LOR, LOR or zero; -99/-999 style
 * sentinels (not analysed) are null.
 */
export function toGrade(v, flag, bdl = 'half') {
  let n = v;
  let below = false;
  if (typeof v === 'string') {
    const s = v.trim().replace(',', '.');
    if (!s) return null;
    if (s.startsWith('<')) {
      below = true;
      n = Number(s.slice(1));
    } else if (s.startsWith('>')) n = Number(s.slice(1));
    else n = Number(s);
  }
  if (!isNum(n)) return null;
  if (SENTINELS.has(n)) return null;
  // a numeric value flagged '<' was already converted on import (settings().belowDetection):
  // use it as stored instead of halving it a second time
  const f = String(flag ?? '').trim().toLowerCase();
  if (typeof v === 'string' && (f.startsWith('<') || f === 'bdl' || f === 'lod' || f === 'lor' || f === 'nd')) below = true;
  if (n < 0) {
    below = true;
    n = -n;
  }
  if (!below) return n;
  if (bdl === 'zero') return 0;
  if (bdl === 'lor') return n;
  return n / 2;
}

const isPrimary = (s) => !s.sampleType || s.sampleType === 'PRIM';

/**
 * Sample rows + assay lookup → intervals [{sampleId, from, to, g, sec}].
 * Only primary samples with a usable depth interval are kept.
 */
export function interceptInputs(samples, assay, params) {
  const p = normParams(params);
  const out = [];
  for (const s of samples || []) {
    if (!isPrimary(s) || !isNum(s.from) || !isNum(s.to) || !(s.to > s.from)) continue;
    const a = assay ? assay(s.sampleId) : null;
    const vals = a?.values || s.values || {};
    const flags = a?.flags || s.flags || {};
    const sec = {};
    for (const k of p.secondary) sec[k] = toGrade(vals[k], flags[k], p.bdl);
    out.push({ sampleId: s.sampleId, from: s.from, to: s.to, g: toGrade(vals[p.element], flags[p.element], p.bdl), sec });
  }
  return out;
}

/**
 * Contiguous segments: samples (clipped where they overlap) with explicit gap
 * segments between them. Samples without a grade are treated as gaps.
 */
export function segments(intervals) {
  const list = (intervals || []).filter((r) => isNum(r.from) && isNum(r.to) && r.to > r.from).sort((a, b) => a.from - b.from || a.to - b.to);
  const segs = [];
  let cur = null;
  for (const r of list) {
    let a = r.from;
    if (cur !== null && a < cur) a = cur;
    if (r.to <= a + EPS) continue;
    if (cur !== null && a > cur + EPS) segs.push({ from: cur, to: a, len: a - cur, g: 0, sec: {}, gap: true, real: false });
    const real = isNum(r.g);
    segs.push({ from: a, to: r.to, len: r.to - a, g: real ? r.g : 0, sec: r.sec || {}, gap: !real, real, unassayed: !real, sampleId: r.sampleId });
    cur = r.to;
  }
  return segs;
}

/** Composites over segments at `cutoff`. Returns [{i, j}] index ranges (inclusive). */
function build(segs, cutoff, { maxDil, gapPolicy }) {
  const out = [];
  const hit = (s) => s.real && s.g >= cutoff - 1e-12;
  let i = 0;
  while (i < segs.length) {
    if (!hit(segs[i])) {
      i++;
      continue;
    }
    let end = i;
    let len = segs[i].len;
    let gx = segs[i].g * segs[i].len;
    let runLen = 0;
    let runGx = 0;
    for (let j = i + 1; j < segs.length; j++) {
      const t = segs[j];
      if (t.gap && gapPolicy === 'break') break;
      if (hit(t)) {
        const nLen = len + runLen + t.len;
        const nGx = gx + runGx + t.g * t.len;
        if (nGx / nLen < cutoff - 1e-12) break;
        end = j;
        len = nLen;
        gx = nGx;
        runLen = 0;
        runGx = 0;
        continue;
      }
      runLen += t.len;
      runGx += (t.real ? t.g : 0) * t.len;
      if (runLen > maxDil + EPS) break;
    }
    out.push({ i, j: end });
    i = end + 1;
  }
  return out;
}

function describe(segs, { i, j }, p, cutoff) {
  const part = segs.slice(i, j + 1);
  const from = part[0].from;
  const to = part[part.length - 1].to;
  const length = round(to - from, 3);
  let gx = 0;
  let dil = 0;
  let gapLen = 0;
  let n = 0;
  for (const s of part) {
    gx += s.g * s.len;
    if (s.real) n++;
    if (s.gap) gapLen += s.len;
    else if (s.g < cutoff - 1e-12) dil += s.len;
  }
  const grade = length > 0 ? gx / (to - from) : 0;
  const secondary = {};
  for (const k of p.secondary) {
    let w = 0;
    let v = 0;
    for (const s of part) {
      const x = s.gap && !s.unassayed ? 0 : s.sec?.[k];
      if (!isNum(x)) continue;
      w += s.len;
      v += x * s.len;
    }
    secondary[k] = w > 0 ? v / w : null;
  }
  return {
    from: round(from, 3),
    to: round(to, 3),
    length,
    grade,
    gradeXm: grade * (to - from),
    secondary,
    n,
    dilution: round(dil, 3),
    gapLen: round(gapLen, 3),
    cutoff,
  };
}

function secondaryText(r, p) {
  const parts = p.secondary.filter((k) => isNum(r.secondary[k])).map((k) => gradeText(r.secondary[k], k, p.dp));
  return parts.length ? `, ${parts.join(', ')}` : '';
}

/** '12.0 m @ 1.23 g/t Au from 45.0 m'; with `full`, secondaries go before "from". */
const intervalText = (r, p, full = false) => `${fix(r.length, 1)} m @ ${gradeText(r.grade, p.element, p.dp)}${full ? secondaryText(r, p) : ''} from ${fix(r.from, 1)} m`;

/**
 * Intercepts of one hole from prepared intervals (see interceptInputs).
 * Rows: {holeId, element, unit, from, to, length, grade, gradeXm, secondary,
 *        n, dilution, gapLen, incl:[…], text, textFull}
 */
export function computeIntercepts(intervals, params, holeId = '') {
  const p = normParams(params);
  const segs = segments(intervals);
  if (!segs.length) return [];
  const unit = gradeUnit(p.element);
  const rows = [];
  for (const c of build(segs, p.cutoff, p)) {
    const r = describe(segs, c, p, p.cutoff);
    if (r.length < p.minLen - EPS) continue;
    if (isNum(p.minGradeThickness) && r.gradeXm < p.minGradeThickness - EPS) continue;
    const incl = [];
    if (isNum(p.incl) && p.incl > p.cutoff) {
      const sub = segs.slice(c.i, c.j + 1);
      const inclMinLen = p.inclMinLen ?? p.minLen;
      const inclMaxDil = p.inclMaxDil ?? p.maxDil;
      for (const ic of build(sub, p.incl, { maxDil: inclMaxDil, gapPolicy: p.gapPolicy })) {
        const x = describe(sub, ic, p, p.incl);
        if (x.length < inclMinLen - EPS) continue;
        if (Math.abs(x.from - r.from) < EPS && Math.abs(x.to - r.to) < EPS) continue;
        incl.push({ ...x, text: intervalText(x, p), textFull: intervalText(x, p, true) });
      }
    }
    const inclText = incl.length ? ` (incl. ${incl.map((x) => x.text).join(' and ')})` : '';
    const inclFull = incl.length ? ` (incl. ${incl.map((x) => x.textFull).join(' and ')})` : '';
    rows.push({
      holeId,
      element: p.element,
      unit,
      ...r,
      incl,
      text: intervalText(r, p) + inclText,
      textFull: intervalText(r, p, true) + inclFull,
    });
  }
  return rows;
}

/** Intercepts of one hole straight from sample rows and an assay lookup. */
export function holeIntercepts({ holeId, samples, assay }, params) {
  return computeIntercepts(interceptInputs(samples, assay, params), params, holeId);
}

/**
 * Intercepts across holes.
 *   ctx = {holeIds, samplesOf(holeId) → sample rows, assay(sampleId) → {values, flags}}
 * Returns {rows, nsi, unassayed, params}:
 *   nsi        holes with assays for the element but no significant intercept
 *   unassayed  holes with primary samples but no grade for the element
 */
export function projectIntercepts(ctx, params) {
  const p = normParams(params);
  const out = [];
  const nsi = [];
  const unassayed = [];
  const ids = [...(ctx.holeIds || [])].sort(natCmp);
  for (const holeId of ids) {
    const inputs = interceptInputs(ctx.samplesOf(holeId) || [], ctx.assay, p);
    if (!inputs.length) continue;
    if (!inputs.some((x) => isNum(x.g))) {
      unassayed.push(holeId);
      continue;
    }
    const rows = computeIntercepts(inputs, p, holeId);
    if (rows.length) out.push(...rows);
    else nsi.push(holeId);
  }
  return { rows: out, nsi, unassayed, params: p };
}

/** One-line reporting criteria for the JORC Table 1 aggregation section. */
export function criteriaText(params) {
  const p = normParams(params);
  const el = elementSymbol(p.element);
  const unit = gradeUnit(p.element);
  const g = (v) => (unit === '%' ? `${v}% ${el}` : `${v} ${unit} ${el}`);
  let s = `Intercepts reported at a ${g(p.cutoff)} cut-off, minimum ${p.minLen} m downhole length, maximum ${p.maxDil} m consecutive internal dilution`;
  s += p.gapPolicy === 'zero' ? ', unsampled intervals assigned zero grade' : ', unsampled intervals end an intercept';
  if (isNum(p.minGradeThickness)) s += `, minimum ${p.minGradeThickness} ${gxmUnit(p.element)}`;
  if (isNum(p.incl) && p.incl > p.cutoff) s += `; "including" intervals at ${g(p.incl)}`;
  s += '. Length-weighted averages; no top cut applied.';
  return s;
}

// QA/QC analytics: CRM control charts (Shewhart + Westgard 2x2SD), blanks and
// carry-over, duplicate precision (HARD / CV%), insertion rates and lab-batch
// acceptance. Pure functions over the store, memoised per store revision.
//
// Analytical sequence: every sample that has a value for the element, ordered
// by lab batch (batches in order of their first report date, then lab job
// number) and by sample id inside the batch — the order the lab prepared and
// reported them. `seq` (1-based) is the position in that sequence; drift is
// expressed per 100 samples of it.

import { rows, settings, assayValues, sampleById, memo } from './store.js';
import { isNum, natCmp, toNum, quantile } from './util.js';
import { splitElementKey } from './schema.js';

export const QC_TYPES = ['CRM', 'BLK', 'FDUP', 'CDUP', 'PDUP'];
export const DUP_TYPES = ['FDUP', 'CDUP', 'PDUP'];
const DEFAULT_HARD = { FDUP: 30, CDUP: 20, PDUP: 10 };

// Sample-type spellings seen in lab / legacy sheets.
const TYPE_ALIASES = {
  '': 'PRIM', PRIMARY: 'PRIM', ORIG: 'PRIM', ORIGINAL: 'PRIM', SAMPLE: 'PRIM', ROUTINE: 'PRIM',
  STD: 'CRM', STANDARD: 'CRM', SRM: 'CRM', REF: 'CRM',
  BLANK: 'BLK', BLNK: 'BLK', BL: 'BLK', BK: 'BLK',
  DUP: 'FDUP', FD: 'FDUP', FDP: 'FDUP', CD: 'CDUP', CRD: 'CDUP', PD: 'PDUP', PLP: 'PDUP',
};

/** Normalised QC type of a sample row: PRIM | CRM | BLK | FDUP | CDUP | PDUP | other. */
export function qcType(sample) {
  const t = String(sample?.sampleType ?? '').trim().toUpperCase();
  return TYPE_ALIASES[t] ?? t;
}

/** Standard codes compared loosely: "OREAS 504c" == "oreas504C" == "OREAS-504c". */
export const normCode = (c) => String(c ?? '').toUpperCase().replace(/[\s_\-.]+/g, '');
const normEl = (e) => String(e ?? '').trim().toLowerCase();

/** QC settings with defaults filled in. */
export function qcSettings() {
  const q = settings().qc || {};
  return {
    crmEvery: q.crmEvery || 25,
    blankEvery: q.blankEvery || 25,
    dupEvery: q.dupEvery || 20,
    crmWarnSD: q.crmWarnSD || 2,
    crmFailSD: q.crmFailSD || 3,
    blankFactor: q.blankFactor || 10,
    dupHard: { ...DEFAULT_HARD, ...(q.dupHard || {}) },
    dupPassRate: q.dupPassRate ?? 90,
    biasWarn: q.biasWarn ?? 5,
    biasFail: q.biasFail ?? 10,
    highGrade: q.highGrade || {},
  };
}

// ----------------------------------------------------------------- helpers

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

function stdev(a) {
  if (a.length < 2) return null;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
}

/** Least-squares line through (x, y). */
export function linearFit(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (!(sxx > 0)) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

const pct = (a, b) => (b > 0 ? (100 * a) / b : null);
const byBatch = (opts) => (r) => opts?.batch == null || r.batch === opts.batch;

/** Assay rows per sample, oldest report first (same order assayValues merges in). */
function assayIndex() {
  return memo('qc|aidx', () => {
    const m = new Map();
    const list = [...rows('assays')].sort((a, b) => String(a.received ?? '').localeCompare(String(b.received ?? '')) || (a._t ?? 0) - (b._t ?? 0));
    for (const a of list) {
      const k = String(a.sampleId);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    }
    return m;
  });
}

/** The assay row that supplies the reported value of `element` (latest report wins). */
function sourceRow(sampleId, element) {
  const list = assayIndex().get(String(sampleId));
  if (!list) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    const v = list[i].values?.[element];
    if (v !== null && v !== undefined && v !== '') return list[i];
  }
  return null;
}

/**
 * Numeric value of an element for a sample, for statistics.
 * Below-detection values were converted on import (flag '<'); a negative value
 * (the "negative" convention) is taken as half of its absolute value.
 */
export function qcValue(sampleId, element) {
  const av = assayValues(sampleId);
  if (!av) return null;
  let v = toNum(av.values?.[element]);
  if (v === null) return null;
  const flag = av.flags?.[element] || '';
  let bdl = flag === '<';
  if (v < 0) {
    bdl = true;
    v = Math.abs(v) / 2;
  }
  return { v, flag, bdl };
}

/** Batch key of a sample: lab job, else certificate, else field dispatch. */
export function sampleBatch(sampleId) {
  const list = assayIndex().get(String(sampleId));
  const a = list?.[list.length - 1];
  return a?.labJob || a?.certificate || sampleById(sampleId)?.dispatchId || '';
}

/** Analytical sequence for an element (see file header). */
export function sequence(element) {
  return memo(`qc|seq|${element}`, () => {
    const items = [];
    for (const sid of assayIndex().keys()) {
      const src = sourceRow(sid, element);
      if (!src) continue;
      const val = qcValue(sid, element);
      if (!val) continue;
      const s = sampleById(sid) || null;
      items.push({
        sampleId: sid,
        sample: s,
        type: s ? qcType(s) : null,
        holeId: s?.holeId ?? src.holeId ?? '',
        labJob: src.labJob || '',
        certificate: src.certificate || '',
        date: src.received || '',
        dispatchId: s?.dispatchId || '',
        batch: src.labJob || src.certificate || s?.dispatchId || '',
        ...val,
      });
    }
    const first = new Map();
    for (const it of items) {
      const d = it.date || '~';
      if (!first.has(it.batch) || d < first.get(it.batch)) first.set(it.batch, d);
    }
    items.sort((a, b) => first.get(a.batch).localeCompare(first.get(b.batch)) || natCmp(a.batch, b.batch) || natCmp(a.sampleId, b.sampleId));
    items.forEach((it, i) => (it.seq = i + 1));
    return { items, byId: new Map(items.map((it) => [it.sampleId, it])) };
  });
}

// ---------------------------------------------------------- detection limit

const EL_LOR = {
  Au: { ppm: 0.005, gpt: 0.005, gt: 0.005, ppb: 5 },
  Pt: { ppm: 0.005, gpt: 0.005, ppb: 5 },
  Pd: { ppm: 0.005, gpt: 0.005, ppb: 5 },
  Ag: { ppm: 0.5, gpt: 0.5, gt: 0.5, ppb: 500 },
  Hg: { ppm: 0.01 },
};
const UNIT_LOR = { ppb: 1, ppm: 1, gpt: 0.01, gt: 0.01, pct: 0.001 };

/**
 * Lower limit of reporting for an element: settings().elements[el].lor, else
 * inferred from values the lab reported below detection, else a default per
 * element / unit. Returns {lor, source: 'settings' | 'data' | 'default'}.
 */
export function elementLOR(element) {
  return memo(`qc|lor|${element}`, () => {
    const st = settings();
    const cfg = toNum(st.elements?.[element]?.lor);
    if (cfg > 0) return { lor: cfg, source: 'settings' };
    const mode = st.belowDetection || 'half';
    const counts = new Map();
    for (const a of rows('assays')) {
      const raw = toNum(a.values?.[element]);
      if (raw === null) continue;
      let lor = null;
      if (raw < 0) lor = -raw;
      else if (a.flags?.[element] === '<') lor = mode === 'half' ? raw * 2 : mode === 'lor' ? raw : null;
      if (lor > 0) {
        const k = Number(lor.toPrecision(6));
        counts.set(k, (counts.get(k) || 0) + 1);
      }
    }
    if (counts.size) {
      const best = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      return { lor: best, source: 'data' };
    }
    const { el, unit } = splitElementKey(element);
    const d = EL_LOR[el]?.[unit] ?? UNIT_LOR[unit];
    if (d) return { lor: d, source: 'default' };
    let min = null;
    for (const a of rows('assays')) {
      const v = toNum(a.values?.[element]);
      if (v > 0 && (min === null || v < min)) min = v;
    }
    return { lor: min ?? 1, source: 'default' };
  });
}

/**
 * Grade above which a primary sample is "high grade" for carry-over checks:
 * settings().qc.highGrade[element], else the larger of the primaries' 95th
 * percentile and 100 × LOR.
 */
export function highGradeThreshold(element) {
  return memo(`qc|hg|${element}`, () => {
    const cfg = toNum(qcSettings().highGrade?.[element] ?? settings().elements?.[element]?.highGrade);
    if (cfg > 0) return { value: cfg, source: 'settings' };
    const vals = sequence(element).items.filter((it) => it.type === 'PRIM').map((it) => it.v).sort((a, b) => a - b);
    const p95 = quantile(vals, 0.95);
    const floor = 100 * elementLOR(element).lor;
    return { value: Math.max(p95 ?? 0, floor), source: 'data' };
  });
}

// ------------------------------------------------------------------- CRMs

/** Valid CRM definitions for an element, keyed by normalised code (latest edit wins). */
function crmDefs(element) {
  return memo(`qc|defs|${element}`, () => {
    const m = new Map();
    const want = normEl(element);
    const list = rows('crms').filter((d) => normEl(d.element) === want).sort((a, b) => (a._t ?? 0) - (b._t ?? 0));
    for (const d of list) {
      const expected = toNum(d.expected);
      const sd = toNum(d.sd);
      m.set(normCode(d.code), { ...d, expected, sd, valid: d.isBlank ? true : isNum(expected) && sd > 0 });
    }
    return m;
  });
}

/** Elements that have at least one CRM definition. */
export function crmElements() {
  return memo('qc|crmEls', () => [...new Set(rows('crms').map((d) => d.element).filter(Boolean))].sort(natCmp));
}

function computeCrm(element) {
  const q = qcSettings();
  const defs = crmDefs(element);
  const out = [];
  const prevByCrm = new Map();
  const idxByCrm = new Map();
  for (const it of sequence(element).items) {
    if (it.type !== 'CRM') continue;
    const key = normCode(it.sample?.crm);
    const def = defs.get(key);
    if (!def || !def.valid || def.isBlank) continue;
    const z = (it.v - def.expected) / def.sd;
    const az = Math.abs(z);
    let status = 'pass';
    let rule = null;
    if (az > q.crmFailSD) {
      status = 'fail';
      rule = 'limit';
    } else if (az > q.crmWarnSD) {
      status = 'warn';
      // Westgard 2(2s): the previous result of this CRM was also beyond ±warnSD on the same side
      const prev = prevByCrm.get(key);
      if (prev && Math.abs(prev.z) > q.crmWarnSD && Math.sign(prev.z) === Math.sign(z)) {
        status = 'fail';
        rule = '2x2SD';
      }
    }
    const n = (idxByCrm.get(key) || 0) + 1;
    idxByCrm.set(key, n);
    const r = {
      sampleId: it.sampleId,
      holeId: it.holeId,
      crm: def.code,
      element,
      value: it.v,
      flag: it.flag,
      expected: def.expected,
      sd: def.sd,
      z,
      status,
      rule,
      dispatchId: it.dispatchId,
      labJob: it.labJob,
      certificate: it.certificate,
      date: it.date,
      batch: it.batch,
      seq: it.seq,
      n,
    };
    prevByCrm.set(key, r);
    out.push(r);
  }
  return out;
}

/**
 * CRM results for an element, in analytical order.
 * opts: {crmCode, batch}. Rules are evaluated over each CRM's full history
 * before filtering, so filtering never changes a status.
 */
export function crmResults(element, opts = {}) {
  const all = memo(`qc|crm|${element}`, () => computeCrm(element));
  const code = opts.crmCode ? normCode(opts.crmCode) : null;
  return all.filter((r) => byBatch(opts)(r) && (!code || normCode(r.crm) === code));
}

/** Per-CRM summary: n, mean, bias %, pass rate, drift per 100 samples. */
export function crmSummary(element, opts = {}) {
  const q = qcSettings();
  const groups = new Map();
  for (const r of crmResults(element, opts)) {
    if (!groups.has(r.crm)) groups.set(r.crm, []);
    groups.get(r.crm).push(r);
  }
  const defs = crmDefs(element);
  const out = [];
  for (const [crm, list] of groups) {
    const vals = list.map((r) => r.value);
    const m = mean(vals);
    const { expected, sd, supplier } = list[0];
    const def = defs.get(normCode(crm));
    const nPass = list.filter((r) => r.status === 'pass').length;
    const nWarn = list.filter((r) => r.status === 'warn').length;
    const nFail = list.filter((r) => r.status === 'fail').length;
    const bias = expected ? (100 * (m - expected)) / expected : null;
    const fit = list.length >= 3 ? linearFit(list.map((r) => r.seq), vals) : null;
    const drift = fit ? fit.slope * 100 : null;
    const ab = Math.abs(bias ?? 0);
    out.push({
      crm,
      element,
      supplier: def?.supplier || supplier || '',
      expected,
      sd,
      n: list.length,
      mean: m,
      sdObs: stdev(vals),
      meanZ: mean(list.map((r) => r.z)),
      bias,
      biasStatus: ab > q.biasFail ? 'fail' : ab > q.biasWarn ? 'warn' : 'ok',
      nPass,
      nWarn,
      nFail,
      passRate: pct(nPass, list.length),
      okRate: pct(nPass + nWarn, list.length),
      drift,
      driftPct: drift !== null && expected ? (100 * drift) / expected : null,
      fit,
      status: nFail ? 'fail' : nWarn ? 'warn' : 'pass',
      first: list[0].date,
      last: list[list.length - 1].date,
    });
  }
  return out.sort((a, b) => natCmp(a.crm, b.crm));
}

/** CRM samples assayed for the element whose standard has no usable definition. */
export function crmUndefined(element) {
  return memo(`qc|crmUndef|${element}`, () => {
    const defs = crmDefs(element);
    const m = new Map();
    for (const it of sequence(element).items) {
      if (it.type !== 'CRM') continue;
      const code = it.sample?.crm || '';
      const def = defs.get(normCode(code));
      if (def && def.valid) continue;
      const reason = !code ? 'noCode' : def ? 'invalid' : 'missing';
      const k = normCode(code) + '|' + reason;
      const e = m.get(k) || { crm: code, reason, n: 0, samples: [] };
      e.n++;
      if (e.samples.length < 20) e.samples.push(it.sampleId);
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.n - a.n || natCmp(a.crm, b.crm));
  });
}

// ------------------------------------------------------------------ blanks

function computeBlanks(element, hgOverride) {
  const q = qcSettings();
  const { lor, source } = elementLOR(element);
  const threshold = q.blankFactor * lor;
  const hg = hgOverride ?? highGradeThreshold(element).value;
  const defs = crmDefs(element);
  const items = sequence(element).items;
  const out = [];
  items.forEach((it, i) => {
    const isBlank = it.type === 'BLK' || (it.type === 'CRM' && defs.get(normCode(it.sample?.crm))?.isBlank);
    if (!isBlank) return;
    // nearest preceding rock sample prepared in the same batch
    let prev = null;
    for (let j = i - 1; j >= 0; j--) {
      const p = items[j];
      if (p.batch !== it.batch) break;
      if (p.type === 'PRIM' || p.type === 'FDUP' || p.type === 'CDUP') {
        prev = p;
        break;
      }
    }
    const carryOver = !!prev && prev.v >= hg;
    out.push({
      sampleId: it.sampleId,
      holeId: it.holeId,
      crm: it.sample?.crm || '',
      element,
      value: it.v,
      flag: it.flag,
      bdl: it.bdl,
      lor,
      lorSource: source,
      threshold,
      ratio: it.v / lor,
      status: it.v > threshold ? 'fail' : 'pass',
      prevId: prev?.sampleId ?? null,
      prevHole: prev?.holeId ?? null,
      prevValue: prev?.v ?? null,
      highGrade: hg,
      carryOver,
      carryPct: carryOver && prev.v > 0 ? (100 * it.v) / prev.v : null,
      dispatchId: it.dispatchId,
      labJob: it.labJob,
      certificate: it.certificate,
      date: it.date,
      batch: it.batch,
      seq: it.seq,
    });
  });
  return out;
}

/**
 * Blank results: value vs threshold (= blankFactor × LOR) and the rock sample
 * that preceded the blank in the batch (carry-over when that sample is high grade).
 * opts: {batch, highGrade}.
 */
export function blankResults(element, opts = {}) {
  const hg = toNum(opts.highGrade);
  const all = memo(`qc|blk|${element}|${hg ?? ''}`, () => computeBlanks(element, hg ?? undefined));
  return all.filter(byBatch(opts));
}

// -------------------------------------------------------------- duplicates

function computeDups(element) {
  const q = qcSettings();
  const { lor } = elementLOR(element);
  const seq = sequence(element).byId;
  const pairs = [];
  const issues = [];
  for (const s of rows('samples')) {
    const type = qcType(s);
    if (!DUP_TYPES.includes(type)) continue;
    const dv = qcValue(s.sampleId, element);
    if (!dv) continue;
    const it = seq.get(String(s.sampleId));
    const base = { dupId: String(s.sampleId), parentId: s.parentId ? String(s.parentId) : null, type, holeId: s.holeId, batch: it?.batch ?? sampleBatch(s.sampleId), labJob: it?.labJob || '', dispatchId: s.dispatchId || '', date: it?.date || '', seq: it?.seq ?? null };
    const pv = s.parentId ? qcValue(s.parentId, element) : null;
    if (!pv) {
      issues.push({ ...base, b: dv.v, problem: !s.parentId ? 'noParent' : !sampleById(s.parentId) ? 'parentMissing' : 'parentNoAssay' });
      continue;
    }
    const a = pv.v;
    const b = dv.v;
    const tot = a + b;
    const hard = tot > 0 ? (100 * Math.abs(a - b)) / tot : 0;
    const m = tot / 2;
    const limit = q.dupHard[type] ?? DEFAULT_HARD[type];
    pairs.push({
      ...base,
      element,
      a,
      b,
      aFlag: pv.flag,
      bFlag: dv.flag,
      mean: m,
      hard,
      relDiff: m > 0 ? (100 * (b - a)) / m : 0,
      cv: Math.SQRT2 * hard,
      limit,
      lowGrade: a < 10 * lor && b < 10 * lor,
      status: hard <= limit ? 'pass' : 'fail',
    });
  }
  const order = (x) => x.seq ?? Infinity;
  pairs.sort((x, y) => order(x) - order(y) || natCmp(x.dupId, y.dupId));
  return { pairs, issues };
}

/**
 * Duplicate pairs: {dupId, parentId, type, a (original), b (duplicate), mean,
 * hard (= |a-b|/(a+b)·100), relDiff (signed, % of pair mean), cv, limit,
 * status, lowGrade}. Pairs with both values < 10 × LOR are listed with
 * lowGrade = true and left out of pass-rate / precision statistics.
 * opts: {type, batch}.
 */
export function duplicatePairs(element, opts = {}) {
  const all = memo(`qc|dup|${element}`, () => computeDups(element));
  return all.pairs.filter((p) => byBatch(opts)(p) && (!opts.type || p.type === opts.type));
}

/** Duplicate samples that could not be paired (no parent id, unknown parent, parent not assayed). */
export function duplicateIssues(element, opts = {}) {
  const all = memo(`qc|dup|${element}`, () => computeDups(element));
  return all.issues.filter((p) => byBatch(opts)(p) && (!opts.type || p.type === opts.type));
}

/** Per duplicate type: n, pass rate (excluding near-LOR pairs), RMS CV% precision, HARD percentiles. */
export function duplicateSummary(element, opts = {}) {
  const q = qcSettings();
  const pairs = duplicatePairs(element, opts);
  const out = [];
  for (const type of DUP_TYPES) {
    const list = pairs.filter((p) => p.type === type);
    if (!list.length) continue;
    const used = list.filter((p) => !p.lowGrade);
    const nPass = used.filter((p) => p.status === 'pass').length;
    const rate = pct(nPass, used.length);
    const hards = used.map((p) => p.hard).sort((a, b) => a - b);
    const target = q.dupPassRate;
    out.push({
      type,
      element,
      n: list.length,
      nLow: list.length - used.length,
      nUsed: used.length,
      nPass,
      nFail: used.length - nPass,
      passRate: rate,
      limit: q.dupHard[type],
      target,
      status: rate === null ? 'na' : rate >= target ? 'ok' : rate >= target - 10 ? 'warn' : 'fail',
      cv: used.length ? Math.sqrt(mean(used.map((p) => p.cv ** 2))) : null,
      hardMedian: quantile(hards, 0.5),
      hardP90: quantile(hards, target / 100),
    });
  }
  return out;
}

// --------------------------------------------------------- insertion rates

/** Status of an insertion count against a 1-in-`every` target. */
export function rateStatus(count, primaries, every) {
  if (!primaries || !every) return 'na';
  const expected = primaries / every;
  if (count >= Math.floor(expected * 0.9)) return 'ok';
  if (count >= Math.floor(expected * 0.5)) return 'warn';
  return 'fail';
}

const RANK = { na: 0, ok: 1, warn: 2, fail: 3 };
const worst = (...s) => s.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'na');

function newGroup(key) {
  return { key, primaries: 0, meters: 0, crms: 0, blanks: 0, fdup: 0, cdup: 0, pdup: 0, dups: 0, other: 0, total: 0, holes: new Set(), dispatches: new Set() };
}

function finishGroup(g, q) {
  const cat = (count, every) => ({ count, every, oneIn: count ? g.primaries / count : null, pct: pct(count, g.primaries), expected: g.primaries / every, status: rateStatus(count, g.primaries, every) });
  const crm = cat(g.crms, q.crmEvery);
  const blank = cat(g.blanks, q.blankEvery);
  const dup = cat(g.dups, q.dupEvery);
  const qcN = g.crms + g.blanks + g.dups;
  return { ...g, holes: [...g.holes].sort(natCmp), dispatches: [...g.dispatches].sort(natCmp), qc: qcN, qcPct: pct(qcN, g.total), crm, blank, dup, status: worst(crm.status, blank.status, dup.status) };
}

/**
 * Insertion rates per hole and per dispatch: primaries, metres, CRMs, blanks,
 * duplicates and 1-in-N vs the settings targets. opts: {batch}.
 * Returns {holes, dispatches, total, targets}.
 */
export function insertionRates(opts = {}) {
  return memo(`qc|insr|${opts.batch ?? '\u0000'}`, () => computeInsertion(opts));
}

function computeInsertion(opts) {
  const q = qcSettings();
  const all = memo('qc|ins', () => rows('samples').map((s) => ({ s, batch: sampleBatch(s.sampleId) })));
  const holesM = new Map();
  const dispM = new Map();
  const tot = newGroup('');
  const lab = new Map(rows('dispatch').map((d) => [String(d.batchId), d]));
  for (const { s, batch } of all) {
    if (opts.batch != null && batch !== opts.batch) continue;
    const type = qcType(s);
    const hk = s.holeId ?? '';
    const dk = s.dispatchId ?? '';
    if (!holesM.has(hk)) holesM.set(hk, newGroup(hk));
    if (!dispM.has(dk)) dispM.set(dk, newGroup(dk));
    for (const g of [holesM.get(hk), dispM.get(dk), tot]) {
      g.total++;
      g.holes.add(hk);
      if (dk) g.dispatches.add(dk);
      if (type === 'PRIM') {
        g.primaries++;
        if (isNum(s.from) && isNum(s.to) && s.to > s.from) g.meters += s.to - s.from;
      } else if (type === 'CRM') g.crms++;
      else if (type === 'BLK') g.blanks++;
      else if (DUP_TYPES.includes(type)) {
        g.dups++;
        g[type.toLowerCase()]++;
      } else g.other++;
    }
  }
  const holes = [...holesM.values()].sort((a, b) => natCmp(a.key, b.key)).map((g) => finishGroup(g, q));
  const dispatches = [...dispM.values()]
    .sort((a, b) => natCmp(a.key, b.key))
    .map((g) => {
      const d = lab.get(String(g.key));
      return { ...finishGroup(g, q), lab: d?.lab || '', labJob: d?.labJob || '', dispatched: d?.dispatched || '' };
    });
  return { holes, dispatches, total: finishGroup(tot, q), targets: { crm: q.crmEvery, blank: q.blankEvery, dup: q.dupEvery } };
}

// ---------------------------------------------------------- batch decisions

/**
 * Accept / review / reject per lab batch (lab job, else certificate, else dispatch).
 * `element` may be one key, an array, or omitted (= every element with CRM definitions).
 * Each reason: {level: 'reject'|'review'|'info', code, element, ...details}.
 *   crmFail (reject)   a CRM beyond ±failSD, or 2 in a row beyond ±warnSD on one side
 *   crmWarn (review)   CRM results between ±warnSD and ±failSD
 *   crmBias (review)   3+ CRMs in the batch averaging |z| ≥ 1.5 (batch-wide bias)
 *   noCrm   (review)   primaries were assayed but the batch holds no evaluable CRM
 *   blankFail (review) one blank above the threshold; blankFails (reject) two or more
 *   carryOver (info)   a blank followed a high-grade sample
 *   dupRate (review)   duplicate pass rate below target for a type
 *   noBlank (info)     no blank in the batch
 */
export function batchStatus(element, opts = {}) {
  const els = element === undefined || element === null ? crmElements() : [].concat(element);
  const all = memo(`qc|bs|${els.join(',')}`, () => computeBatches(els));
  return opts.batch == null ? all : all.filter((x) => x.key === opts.batch);
}

function computeBatches(els) {
  const q = qcSettings();
  const dispatchRows = rows('dispatch');
  const map = new Map();
  const get = (key) => {
    if (!map.has(key)) {
      map.set(key, {
        key,
        labJob: '',
        certificates: new Set(),
        dispatchIds: new Set(),
        holes: new Set(),
        samples: new Set(),
        date: '',
        nPrim: 0,
        nCrm: 0,
        nBlk: 0,
        nDup: 0,
        crm: { pass: 0, warn: 0, fail: 0 },
        blank: { pass: 0, fail: 0, carry: 0 },
        dup: { pass: 0, fail: 0, low: 0 },
        reasons: [],
      });
    }
    return map.get(key);
  };
  for (const el of els) {
    for (const it of sequence(el).items) {
      const b = get(it.batch);
      if (b.samples.has(it.sampleId)) continue;
      b.samples.add(it.sampleId);
      if (it.labJob) b.labJob = it.labJob;
      if (it.certificate) b.certificates.add(it.certificate);
      if (it.dispatchId) b.dispatchIds.add(it.dispatchId);
      if (it.holeId) b.holes.add(it.holeId);
      if (it.date > b.date) b.date = it.date;
      if (it.type === 'PRIM') b.nPrim++;
      else if (it.type === 'CRM') b.nCrm++;
      else if (it.type === 'BLK') b.nBlk++;
      else if (DUP_TYPES.includes(it.type)) b.nDup++;
    }
  }
  for (const el of els) {
    const crmBy = new Map();
    for (const r of crmResults(el)) {
      const b = get(r.batch);
      b.crm[r.status]++;
      if (!crmBy.has(r.batch)) crmBy.set(r.batch, []);
      crmBy.get(r.batch).push(r);
      if (r.status === 'fail') b.reasons.push({ level: 'reject', code: 'crmFail', element: el, crm: r.crm, sampleId: r.sampleId, value: r.value, z: r.z, rule: r.rule });
    }
    for (const [key, list] of crmBy) {
      const b = map.get(key);
      const warns = list.filter((r) => r.status === 'warn');
      if (warns.length) b.reasons.push({ level: 'review', code: 'crmWarn', element: el, n: warns.length, crms: [...new Set(warns.map((r) => r.crm))], samples: warns.map((r) => r.sampleId) });
      const mz = mean(list.map((r) => r.z));
      if (list.length >= 3 && Math.abs(mz) >= 1.5) b.reasons.push({ level: 'review', code: 'crmBias', element: el, n: list.length, meanZ: mz });
    }
    const blkBy = new Map();
    for (const r of blankResults(el)) {
      const b = get(r.batch);
      b.blank[r.status]++;
      if (r.carryOver) b.blank.carry++;
      if (!blkBy.has(r.batch)) blkBy.set(r.batch, []);
      blkBy.get(r.batch).push(r);
    }
    for (const [key, list] of blkBy) {
      const b = map.get(key);
      const fails = list.filter((r) => r.status === 'fail');
      if (fails.length === 1) {
        const r = fails[0];
        b.reasons.push({ level: 'review', code: 'blankFail', element: el, sampleId: r.sampleId, value: r.value, threshold: r.threshold, prevId: r.prevId, prevValue: r.prevValue, carryOver: r.carryOver });
      } else if (fails.length > 1) {
        b.reasons.push({ level: 'reject', code: 'blankFails', element: el, n: fails.length, threshold: fails[0].threshold, samples: fails.map((r) => r.sampleId) });
      }
      const carry = list.filter((r) => r.carryOver && r.status === 'pass');
      if (carry.length) b.reasons.push({ level: 'info', code: 'carryOver', element: el, n: carry.length, samples: carry.map((r) => r.sampleId) });
    }
    const dupBy = new Map();
    for (const p of duplicatePairs(el)) {
      const b = get(p.batch);
      if (p.lowGrade) b.dup.low++;
      else b.dup[p.status]++;
      if (!dupBy.has(p.batch)) dupBy.set(p.batch, []);
      dupBy.get(p.batch).push(p);
    }
    for (const [key, list] of dupBy) {
      const b = map.get(key);
      for (const type of DUP_TYPES) {
        const used = list.filter((p) => p.type === type && !p.lowGrade);
        if (!used.length) continue;
        const nPass = used.filter((p) => p.status === 'pass').length;
        const rate = pct(nPass, used.length);
        if (rate < q.dupPassRate) b.reasons.push({ level: 'review', code: 'dupRate', element: el, type, rate, target: q.dupPassRate, nFail: used.length - nPass, n: used.length, limit: q.dupHard[type] });
      }
    }
    const primBatches = new Set(sequence(el).items.filter((it) => it.type === 'PRIM').map((it) => it.batch));
    for (const key of primBatches) if (!crmBy.has(key)) map.get(key).reasons.push({ level: 'review', code: 'noCrm', element: el });
  }
  const out = [];
  for (const b of map.values()) {
    if (!b.nBlk && b.nPrim) b.reasons.push({ level: 'info', code: 'noBlank' });
    const d = dispatchRows.find((x) => (b.labJob && x.labJob === b.labJob) || b.dispatchIds.has(String(x.batchId)));
    const status = b.reasons.some((r) => r.level === 'reject') ? 'reject' : b.reasons.some((r) => r.level === 'review') ? 'review' : 'accept';
    const order = { reject: 0, review: 1, info: 2 };
    out.push({
      ...b,
      certificates: [...b.certificates].sort(natCmp),
      dispatchIds: [...b.dispatchIds].sort(natCmp),
      holes: [...b.holes].sort(natCmp),
      samples: undefined,
      nSamples: b.samples.size,
      lab: d?.lab || '',
      status,
      reasons: b.reasons.sort((x, y) => order[x.level] - order[y.level]),
    });
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date)) || natCmp(b.key, a.key));
}

// ------------------------------------------------------------------ summary

/** Headline numbers for the overview tiles. opts: {batch}. */
export function qcSummary(element, opts = {}) {
  const crm = crmResults(element, opts);
  const blk = blankResults(element, opts);
  const dups = duplicatePairs(element, opts);
  const used = dups.filter((p) => !p.lowGrade);
  const cnt = (list, s) => list.filter((r) => r.status === s).length;
  const batches = batchStatus(element, opts);
  return {
    crm: { n: crm.length, pass: cnt(crm, 'pass'), warn: cnt(crm, 'warn'), fail: cnt(crm, 'fail'), passRate: pct(cnt(crm, 'pass'), crm.length) },
    blank: { n: blk.length, pass: cnt(blk, 'pass'), fail: cnt(blk, 'fail'), carry: blk.filter((r) => r.carryOver).length, passRate: pct(cnt(blk, 'pass'), blk.length) },
    dup: { n: dups.length, used: used.length, low: dups.length - used.length, pass: cnt(used, 'pass'), fail: cnt(used, 'fail'), passRate: pct(cnt(used, 'pass'), used.length) },
    insertion: insertionRates(opts).total,
    batches: { n: batches.length, accept: batches.filter((b) => b.status === 'accept').length, review: batches.filter((b) => b.status === 'review').length, reject: batches.filter((b) => b.status === 'reject').length },
    undefinedCrms: crmUndefined(element),
  };
}

// Sampling: cut a hole's depth range into sample intervals that honour
// lithology, number them from a ticket book with QC inserted by ticket
// position, and the small helpers the dispatch workflow needs.
//
// Pure — no store access. Callers pass the lith rows, the project's used IDs
// and the hole's existing samples in.
//
// Ticket-book convention: QC positions are fixed by the ticket *number*, not by
// the count of samples in this run, so a hole can start anywhere in the book
// and the next hole continues the same pattern:
//   CRM   when num % crmEvery === 0              (MU…025, …050, …075, …100)
//   blank when num % blankEvery === blankOffset  (MU…012, …037, …062, …087)
//   dup   when num % dupEvery === 0              (MU…020, …040, …) — the dup
//         takes that ticket and duplicates the primary on the ticket before it.
// On a collision the CRM wins, then the blank; a displaced QC tag takes the next
// ticket (a duplicate always goes straight after a primary).

import { isNum, round, natCmp, fix } from './util.js';

const EPS = 1e-6;
const TOL = 0.006; // cm rounding tolerance when judging lengths
const DUP_TYPES = ['FDUP', 'CDUP', 'PDUP'];

const numOr = (v, d = null) => {
  if (v === null || v === undefined || v === '') return d;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};

// ------------------------------------------------------------- sample IDs

/** 'MU260001' → {prefix:'MU', num:260001, width:6, suffix:''}; null without a trailing number. */
export function parseSampleId(id) {
  const s = String(id ?? '').trim();
  const m = s.match(/^(.*?)(\d+)(\D*)$/);
  if (!m || m[2].length > 15) return null;
  return { prefix: m[1], num: Number(m[2]), width: m[2].length, suffix: m[3] };
}

/** Rebuild an ID from a parsed series and a number (zero padding kept; grows on overflow). */
export function formatSampleId(p, num) {
  return `${p.prefix}${String(num).padStart(p.width, '0')}${p.suffix || ''}`;
}

/** 'MU260009' → 'MU260010', 'OVD-10001' → 'OVD-10002', 'A099' → 'A100'. */
export function nextSampleId(id, step = 1) {
  const p = parseSampleId(id);
  return p ? formatSampleId(p, p.num + step) : null;
}

/** Letter prefix of an ID or hole ('MU260001' → 'MU', 'OVD-10001' → 'OVD'). */
export function idLetters(id) {
  const m = String(id ?? '').match(/^[A-Za-z]+/);
  return m ? m[0].toUpperCase() : '';
}

/** Series (prefix + padding) found in a list of IDs, most used first. */
export function sampleSeries(ids) {
  const m = new Map();
  for (const id of ids || []) {
    const p = parseSampleId(id);
    if (!p) continue;
    const k = `${p.prefix}\u0000${p.suffix}`;
    const s = m.get(k) || { prefix: p.prefix, suffix: p.suffix, width: p.width, count: 0, max: -1, maxId: '' };
    s.count++;
    if (p.num > s.max) {
      s.max = p.num;
      s.maxId = String(id).trim();
      s.width = p.width;
    }
    m.set(k, s);
  }
  return [...m.values()].map((s) => ({ ...s, nextId: formatSampleId(s, s.max + 1) })).sort((a, b) => b.count - a.count || natCmp(a.prefix, b.prefix));
}

/**
 * Next free ID after the highest used ID of the same series. `seed` is an ID
 * ('MU260001') or a bare prefix ('MU'). With nothing used yet, returns the seed
 * itself (or prefix + '0001').
 */
export function nextFreeId(ids, seed) {
  const p = parseSampleId(seed);
  const prefix = p ? p.prefix : String(seed ?? '').trim();
  const suffix = p ? p.suffix : '';
  let best = null;
  for (const id of ids || []) {
    const q = parseSampleId(id);
    if (!q || q.prefix !== prefix || q.suffix !== suffix) continue;
    if (!best || q.num > best.num) best = q;
  }
  if (best) return formatSampleId(best, best.num + 1);
  if (p) return String(seed).trim();
  return prefix ? `${prefix}0001` : '';
}

// ---------------------------------------------------------------- QC slots

const every = (v) => {
  const n = numOr(v, 0);
  return n > 0 ? Math.floor(n) : 0;
};

/** Which QC tags fall due on ticket number `num`. */
export function qcSlots(num, qc = {}) {
  const ce = every(qc.crmEvery);
  const be = every(qc.blankEvery);
  const de = every(qc.dupEvery);
  const mod = (a, b) => ((a % b) + b) % b;
  return {
    crm: ce > 0 && mod(num, ce) === mod(Math.floor(numOr(qc.crmOffset, 0)), ce),
    blank: be > 0 && mod(num, be) === mod(Math.floor(numOr(qc.blankOffset, 0)), be),
    dup: de > 0 && mod(num, de) === mod(Math.floor(numOr(qc.dupOffset, 0)), de),
  };
}

export function crmRotationList(qc = {}) {
  const r = Array.isArray(qc.crmRotation) ? qc.crmRotation : String(qc.crmRotation ?? '').split(',');
  return r.map((s) => String(s ?? '').trim()).filter(Boolean);
}

// ------------------------------------------------------------ depth units

/** Split [from,to] into lithology units; skip-coded units (core loss) are flagged. */
export function lithUnits(from, to, lithRows = [], { breakAt = 'lith', skipCodes = ['CL'] } = {}) {
  const skipSet = new Set((skipCodes || []).map((c) => String(c).trim().toUpperCase()).filter(Boolean));
  const lith = (lithRows || []).filter((r) => isNum(r.from) && isNum(r.to) && r.to > r.from).sort((a, b) => a.from - b.from || a.to - b.to);
  const pieces = [];
  let cur = from;
  for (const r of lith) {
    if (cur >= to - EPS) break;
    const a = Math.max(r.from, cur);
    const b = Math.min(r.to, to);
    if (b <= a + EPS) continue;
    if (a > cur + EPS) pieces.push({ from: cur, to: a, code: null });
    pieces.push({ from: a, to: b, code: r.lith1 ?? null });
    cur = b;
  }
  if (cur < to - EPS) pieces.push({ from: cur, to, code: null });

  const units = [];
  for (const p of pieces) {
    const skip = p.code !== null && p.code !== '' && skipSet.has(String(p.code).toUpperCase());
    const last = units[units.length - 1];
    const joinable = last && last.skip === skip && Math.abs(last.to - p.from) < EPS && (skip || breakAt !== 'lith' || last.code === p.code);
    if (joinable) {
      last.to = p.to;
      if (last.code !== p.code) last.code = last.code === null ? p.code : last.code;
      last.mixed = last.mixed || last.codes.some((c) => c !== p.code);
      last.codes.push(p.code);
    } else units.push({ from: p.from, to: p.to, code: p.code, codes: [p.code], skip, mixed: false });
  }
  return units;
}

/** Cut one unit into pieces of `nominal` length, then fold short remnants into a neighbour. */
export function cutUnit(a, b, { nominal, minLen = 0, maxLen, align = false }) {
  const bounds = [a];
  if (align) {
    let k = Math.floor(a / nominal + EPS) + 1;
    for (let x = round(k * nominal, 2); x < b - EPS; x = round(++k * nominal, 2)) if (x > a + EPS) bounds.push(x);
  } else {
    for (let k = 1; ; k++) {
      const x = round(a + k * nominal, 2);
      if (x >= b - EPS) break;
      if (x > a + EPS) bounds.push(x);
    }
  }
  bounds.push(b);
  const pcs = [];
  for (let i = 0; i < bounds.length - 1; i++) pcs.push({ from: bounds[i], to: bounds[i + 1] });

  const short = (p) => !p.keep && p.to - p.from < minLen - TOL;
  for (let guard = 0; pcs.length > 1 && guard < 500; guard++) {
    const i = pcs.findIndex(short);
    if (i < 0) break;
    let j;
    if (i === 0) j = 1;
    else if (i === pcs.length - 1) j = i - 1;
    else j = pcs[i - 1].to - pcs[i - 1].from <= pcs[i + 1].to - pcs[i + 1].from ? i - 1 : i + 1;
    const lo = Math.min(i, j);
    const x = pcs[lo].from;
    const y = pcs[lo + 1].to;
    const L = y - x;
    if (L <= maxLen + TOL) pcs.splice(lo, 2, { from: x, to: y });
    else if (L / 2 >= minLen - TOL) {
      const m = round(x + L / 2, 2);
      pcs.splice(lo, 2, { from: x, to: m, keep: true }, { from: m, to: y, keep: true });
    } else pcs[i].keep = true;
  }
  return pcs.map((p) => ({ from: round(p.from, 3), to: round(p.to, 3) }));
}

/** Lith1 code with the largest overlap of [from,to]. */
export function dominantLith(from, to, lithRows = []) {
  let best = null;
  let bestLen = 0;
  for (const r of lithRows || []) {
    if (!isNum(r.from) || !isNum(r.to)) continue;
    const len = Math.min(to, r.to) - Math.max(from, r.from);
    if (len > bestLen + EPS) {
      bestLen = len;
      best = r.lith1 ?? null;
    }
  }
  return best;
}

const isDupType = (t) => DUP_TYPES.includes(t);
const isPrimaryRow = (s) => !s.sampleType || s.sampleType === 'PRIM';

// ------------------------------------------------------------------- plan

const MSG = {
  hole: { en: 'Choose a hole.', mn: 'Цооног сонгоно уу.' },
  range: { en: 'Depth range is invalid — From must be less than To.', mn: 'Гүний завсар буруу — Эхлэл нь Төгсгөлөөс бага байх ёстой.' },
  lengths: {
    en: 'Lengths are invalid — max length must be above zero and not less than the min length.',
    mn: 'Уртын тохиргоо буруу — дээд урт тэгээс их, доод уртаас багагүй байх ёстой.',
  },
  startId: { en: 'The start sample ID must end in a number (e.g. MU260001).', mn: 'Эхлэх дээжийн дугаар тоогоор төгсөх ёстой (жишээ нь MU260001).' },
  idExists: { en: 'Sample IDs already used in this project: {ids}', mn: 'Төсөлд аль хэдийн ашиглагдсан дээжийн дугаар: {ids}' },
  nothing: { en: 'Nothing to sample in this range.', mn: 'Энэ завсарт дээжлэх хэсэг алга.' },
  overlap: { en: '{n} new sample(s) overlap existing samples of this hole: {list}', mn: 'Шинэ {n} дээж энэ цооногийн одоо байгаа дээжтэй давхцаж байна: {list}' },
  shortUnit: {
    en: 'Kept as a short sample (unit narrower than min length, cannot cross a contact): {list}',
    mn: 'Доод уртаас богино нэгжийг тусдаа дээж болгосон (контакт давахгүй): {list}',
  },
  noLith: { en: 'No lithology logged in this range — samples are cut by length only.', mn: 'Энэ завсарт литологи логдоогүй — дээжийг зөвхөн уртаар хуваав.' },
  unlogged: { en: 'Unlogged intervals treated as separate units: {list}', mn: 'Логдоогүй завсрыг тусдаа нэгж гэж үзэв: {list}' },
  skipped: { en: 'Skipped {m} m of core loss ({codes}).', mn: '{m} м кернгүй хэсгийг алгасав ({codes}).' },
  noCrm: { en: 'The CRM rotation is empty — CRM tags have no standard code.', mn: 'CRM-ийн ээлж хоосон — стандартын код тодорхойгүй үлдэнэ.' },
};

const rangeText = (list, n = 6) => {
  const s = list.slice(0, n).map((r) => `${fix(r.from, 2)}–${fix(r.to, 2)}`).join(', ');
  return list.length > n ? `${s} …(+${list.length - n})` : s;
};

function toIdSet(existing) {
  const set = new Set();
  const rowsOut = [];
  if (!existing) return { set, rows: rowsOut };
  for (const x of existing) {
    if (x && typeof x === 'object') {
      if (x.sampleId !== null && x.sampleId !== undefined) set.add(String(x.sampleId).trim());
      rowsOut.push(x);
    } else if (x !== null && x !== undefined && x !== '') set.add(String(x).trim());
  }
  return { set, rows: rowsOut };
}

/**
 * Plan the samples for one hole.
 *   {holeId, from, to, startId, maxLen, minLen, nominal?, align?, breakAt:'lith'|'none',
 *    lithRows, qc, skipCodes, existing (IDs or sample rows, whole project), holeSamples}
 * Returns {ok, rows, items, units, errors, warnings, summary}.
 *   rows   sample rows ready for mutate (PRIM, CRM, BLK and dups, in ticket order)
 *   items  [{row, kind:'PRIM'|'CRM'|'BLK'|'DUP', at, lith}] for previews
 * Messages are {code, msg:{en,mn}, params}.
 */
export function planSamples(opts = {}) {
  const { holeId, lithRows = [], qc = {}, breakAt = 'lith', align = false } = opts;
  const skipCodes = opts.skipCodes ?? ['CL'];
  const from = numOr(opts.from);
  const to = numOr(opts.to);
  const maxLen = numOr(opts.maxLen, 2);
  const minLen = Math.max(0, numOr(opts.minLen, 0));
  const start = parseSampleId(opts.startId);
  const errors = [];
  const warnings = [];
  const err = (code, params) => errors.push({ code, msg: MSG[code], params });
  const warn = (code, params, level = 'warn') => warnings.push({ code, level, msg: MSG[code], params });

  if (!holeId) err('hole');
  if (!isNum(from) || !isNum(to) || to <= from + EPS) err('range');
  if (!(maxLen > 0) || minLen > maxLen + EPS) err('lengths');
  if (!start) err('startId');
  const summary = {
    primary: 0,
    crm: 0,
    blank: 0,
    dup: 0,
    total: 0,
    metres: 0,
    skipped: 0,
    from,
    to,
    firstId: null,
    lastId: null,
    nextId: start ? formatSampleId(start, start.num) : null,
  };
  if (errors.length) return { ok: false, rows: [], items: [], units: [], errors, warnings, summary };

  let nominal = numOr(opts.nominal ?? opts.targetLen, maxLen);
  nominal = Math.min(Math.max(nominal, minLen, 0.01), maxLen);

  // 1. lithology units, core loss removed
  const units = lithUnits(from, to, lithRows, { breakAt, skipCodes });
  const logged = (lithRows || []).some((r) => isNum(r.from) && isNum(r.to) && r.to > from && r.from < to);
  if (!logged) warn('noLith', {}, 'info');
  else if (breakAt === 'lith') {
    const unl = units.filter((u) => !u.skip && u.code === null && !u.mixed);
    if (unl.length) warn('unlogged', { list: rangeText(unl) }, 'info');
  }
  const skippedUnits = units.filter((u) => u.skip);
  summary.skipped = round(skippedUnits.reduce((s, u) => s + (u.to - u.from), 0), 3);
  if (skippedUnits.length) warn('skipped', { m: fix(summary.skipped, 2), codes: [...new Set(skippedUnits.map((u) => u.code))].join(', ') }, 'info');

  // 2. primary intervals
  const prims = [];
  const shortUnits = [];
  for (const u of units) {
    if (u.skip) continue;
    const pcs = cutUnit(u.from, u.to, { nominal, minLen, maxLen, align });
    if (pcs.length === 1 && u.to - u.from < minLen - TOL) shortUnits.push(u);
    for (const p of pcs) prims.push({ ...p, lith: dominantLith(p.from, p.to, lithRows) });
  }
  if (shortUnits.length) warn('shortUnit', { list: rangeText(shortUnits) });
  if (!prims.length) {
    err('nothing');
    return { ok: false, rows: [], items: [], units, errors, warnings, summary };
  }

  // 3. ticket sequence with QC
  const rotation = crmRotationList(qc);
  const crmEvery = every(qc.crmEvery);
  const dupType = DUP_TYPES.includes(qc.dupType) ? qc.dupType : 'FDUP';
  const blankCode = String(qc.blankCode ?? '').trim() || null;
  const items = [];
  const pend = { crm: [], blk: 0, dup: 0 };
  let n = start.num;
  let pi = 0;
  let last = null;
  let lastPrim = null;
  const id = () => formatSampleId(start, n);
  const place = (kind, row, extra = {}) => {
    const at = kind === 'PRIM' ? row.from : lastPrim ? lastPrim.row.to : from;
    const item = { kind, row: { holeId, ...row, sampleId: id() }, at, ...extra };
    items.push(item);
    last = item;
    if (kind === 'PRIM') lastPrim = item;
    n++;
  };
  while (pi < prims.length) {
    const due = qcSlots(n, qc);
    if (due.crm) pend.crm.push(n);
    if (due.blank) pend.blk++;
    if (due.dup) pend.dup++;
    if (pend.crm.length) {
      const slot = pend.crm.shift();
      const code = rotation.length ? rotation[Math.floor(slot / (crmEvery || 1)) % rotation.length] : null;
      place('CRM', { sampleType: 'CRM', crm: code, from: null, to: null });
    } else if (pend.blk) {
      pend.blk--;
      place('BLK', { sampleType: 'BLK', crm: blankCode, from: null, to: null });
    } else if (pend.dup && last?.kind === 'PRIM') {
      pend.dup--;
      const p = last.row;
      place('DUP', { sampleType: dupType, parentId: p.sampleId, from: p.from, to: p.to }, { lith: last.lith });
    } else {
      const p = prims[pi++];
      place('PRIM', { sampleType: 'PRIM', from: p.from, to: p.to }, { lith: p.lith });
    }
  }
  if (pend.dup && last?.kind === 'PRIM') {
    const p = last.row;
    place('DUP', { sampleType: dupType, parentId: p.sampleId, from: p.from, to: p.to }, { lith: last.lith });
  }
  if (items.some((i) => i.kind === 'CRM') && !rotation.length) warn('noCrm');

  // 4. conflicts: reused IDs (error) and overlaps with the hole's samples (warning)
  const ex = toIdSet(opts.existing);
  const taken = items.map((i) => i.row.sampleId).filter((s) => ex.set.has(s));
  if (taken.length) err('idExists', { ids: taken.length > 8 ? `${taken.slice(0, 8).join(', ')} …(+${taken.length - 8})` : taken.join(', '), n: taken.length });
  const holeRows = [...(opts.holeSamples || []), ...ex.rows.filter((r) => r.holeId === holeId)];
  const seen = new Set();
  const old = holeRows.filter((r) => {
    const k = r.id || r.sampleId;
    if (seen.has(k)) return false;
    seen.add(k);
    return isPrimaryRow(r) && isNum(r.from) && isNum(r.to) && r.to > r.from;
  });
  const overlaps = [];
  if (old.length) {
    for (const it of items) {
      if (it.kind !== 'PRIM') continue;
      const hit = old.find((o) => o.from < it.row.to - EPS && it.row.from < o.to - EPS);
      if (hit) overlaps.push({ sampleId: it.row.sampleId, from: it.row.from, to: it.row.to, existingId: hit.sampleId });
    }
  }
  if (overlaps.length) warn('overlap', { n: overlaps.length, list: rangeText(overlaps, 4) });

  // 5. summary
  for (const it of items) {
    if (it.kind === 'PRIM') {
      summary.primary++;
      summary.metres += it.row.to - it.row.from;
    } else if (it.kind === 'CRM') summary.crm++;
    else if (it.kind === 'BLK') summary.blank++;
    else summary.dup++;
  }
  summary.metres = round(summary.metres, 3);
  summary.total = items.length;
  summary.firstId = items[0]?.row.sampleId ?? null;
  summary.lastId = items[items.length - 1]?.row.sampleId ?? null;
  summary.nextId = formatSampleId(start, n);
  return { ok: !errors.length, rows: items.map((i) => i.row), items, units, errors, warnings, overlaps, summary };
}

// ------------------------------------------------------------ ticket sheets

/** Rows for a printed ticket list / submission sheet, in ticket order. */
export function sampleTicketRows(samples, { sort = true } = {}) {
  const list = sort ? [...(samples || [])].sort((a, b) => natCmp(a.sampleId, b.sampleId)) : [...(samples || [])];
  return list.map((s, i) => {
    const type = s.sampleType || 'PRIM';
    const hasDepth = isNum(s.from) && isNum(s.to);
    let ref = '';
    let note = '';
    if (type === 'CRM') {
      ref = s.crm || '';
      note = `Standard ${ref}`.trim();
    } else if (type === 'BLK') {
      ref = s.crm || '';
      note = `Blank ${ref}`.trim();
    } else if (isDupType(type)) {
      ref = s.parentId || '';
      note = `${type} of ${ref}`.trim();
    } else if (hasDepth) note = `${fix(s.from, 2)}–${fix(s.to, 2)} m`;
    return {
      seq: i + 1,
      sampleId: s.sampleId ?? '',
      holeId: s.holeId ?? '',
      from: hasDepth ? s.from : null,
      to: hasDepth ? s.to : null,
      length: hasDepth ? round(s.to - s.from, 3) : null,
      type,
      ref,
      weight: isNum(s.weight) ? s.weight : null,
      dispatchId: s.dispatchId ?? '',
      note,
    };
  });
}

/** Count and weight per sample type (PRIM, CRM, BLK, dups) plus a grand total. */
export function ticketTotals(ticketRows) {
  const order = ['PRIM', 'CRM', 'BLK', ...DUP_TYPES];
  const m = new Map();
  let n = 0;
  let w = 0;
  let metres = 0;
  for (const r of ticketRows || []) {
    const cur = m.get(r.type) || { type: r.type, n: 0, weight: 0, weighed: 0, metres: 0 };
    cur.n++;
    n++;
    if (isNum(r.weight)) {
      cur.weight += r.weight;
      cur.weighed++;
      w += r.weight;
    }
    if (r.type === 'PRIM' && isNum(r.length)) {
      cur.metres += r.length;
      metres += r.length;
    }
    m.set(r.type, cur);
  }
  const types = [...m.values()]
    .map((x) => ({ ...x, weight: round(x.weight, 3), metres: round(x.metres, 3) }))
    .sort((a, b) => (order.indexOf(a.type) + 1 || 99) - (order.indexOf(b.type) + 1 || 99) || natCmp(a.type, b.type));
  return { types, n, weight: round(w, 3), metres: round(metres, 3) };
}

// ---------------------------------------------------------------- dispatch

const DSP_RE = /^(.*)-DSP-(\d{4})-(\d+)$/;

/** 'MU-DSP-2026-014' → 'MU'. */
export function dispatchPrefixOf(batchId) {
  const m = String(batchId ?? '').match(DSP_RE);
  return m ? m[1] : null;
}

/** Next batch number for a prefix and year: MU-DSP-2026-014 → MU-DSP-2026-015. */
export function nextDispatchId(batchIds, prefix = 'ORD', year = new Date().getFullYear()) {
  let max = 0;
  let width = 3;
  for (const b of batchIds || []) {
    const m = String(b ?? '').match(DSP_RE);
    if (!m || m[1] !== prefix || Number(m[2]) !== Number(year)) continue;
    const k = Number(m[3]);
    if (k > max) {
      max = k;
      width = Math.max(3, m[3].length);
    }
  }
  return `${prefix}-DSP-${year}-${String(max + 1).padStart(width, '0')}`;
}

/**
 * Dispatch status from its samples:
 *   results (all assayed) | partial | received (lab received) | dispatched | draft
 */
export function dispatchStatus(d, samples, isAssayed) {
  const list = samples || [];
  let assayed = 0;
  for (const s of list) if (isAssayed(s)) assayed++;
  const n = list.length;
  let status;
  if (n && assayed >= n) status = 'results';
  else if (assayed > 0) status = 'partial';
  else if (d?.received) status = 'received';
  else if (d?.dispatched && d?.status !== 'draft') status = 'dispatched';
  else status = 'draft';
  return { status, n, assayed };
}

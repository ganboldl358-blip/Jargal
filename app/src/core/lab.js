// Laboratory certificate import: ALS Global, SGS, Bureau Veritas and local
// Mongolian lab exports (CSV / XLSX) → normalised assay rows → a plan against
// the samples table → one undoable batch.
//
// Handles both certificate layouts:
//   multi-row header  SAMPLE | WEI-21 | Au-AA23 | ME-ICP61 …   (methods)
//                     DESCRIPTION | Recvd Wt. | Au | Cu …     (analytes)
//                     | kg | ppm | % …                         (units)
//                     | 0.02 | 0.005 | 0.0001 …                (LOR)
//   single header     Sample ID | Au_ppm | Cu (%) | Au-AA23 (ppm)
// Re-importing a certificate updates its rows; it never duplicates them.

import { readTabular, parseElementHeader, normUnit, parseLabValue, isMethodCode, canonElement, baseName, detectHeaderRow, coerceDate } from './importer.js';
import { rows as storeRows, settings, mutate } from './store.js';
import { todayISO, toNum, isNum, natCmp } from './util.js';

const M = (en, mn) => ({ message: en, mn });
const nonEmpty = (v) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');
const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
/** Sample IDs compare case- and space-insensitively. */
export const normSampleId = (v) => text(v).toUpperCase().replace(/\s+/g, '');
const normCert = (v) => text(v).toUpperCase().replace(/\s+/g, '').replace(/\.(CSV|XLSX?|TXT)$/, '');

const SAMPLE_LABEL = /^(sample(\s*(id|no\.?|number|name|description|ref|#|code))?|samples?|client\s*(sample\s*)?(id|ref|no\.?|description)|sample_?id|samp\s*id|description|дээж(ийн)?(\s*(№|дугаар|код|id|нэр))?|№)$/iu;
const BLOCK_LABEL = /^(description|units?|methods?|analytes?|elements?|scheme|test|lor|l\.o\.r\.?|dl|d\.l\.|mdl|detection\s*limits?|lower\s*limits?|limit|min\.?\s*limit|элемент|арга|нэгж)$/iu;
const LOR_LABEL = /^(lor|l\.o\.r\.?|dl|d\.l\.|mdl|detection\s*limits?|lower\s*limits?|limit|min\.?\s*limit|илрүүлэх\s*хязгаар)$/iu;
const LAB_QC = /^(std|standard|blank|blk|dup|duplicate|rep|repeat|pulp\s*dup|oreas|gbm|amis|cdn|gs-|mrgeo|ox[a-z]\d|s[egjklnpq]\d)|(\s|-|_)(rep|dup|re|chk|check)$/i;

const WO_RX = /(?<![A-Za-z0-9])([A-Z]{2}\d{8})(?!\d)/; // ALS work order, e.g. UL26123456
const PO_RX = /(?<![A-Za-z0-9])([A-Z]{2,4}-\d{2}-\d{2,4})(?![\d])/; // dispatch / client PO, e.g. ABM-26-07
const JOB_RX = /\b(?:job|work\s*order|certificate|report|batch)\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-_/]{4,})/i;

function detectLab(s) {
  if (/\bALS\b/.test(s)) return 'ALS';
  if (/\bSGS\b/i.test(s)) return 'SGS';
  if (/bureau\s*veritas|\bBV\b/i.test(s)) return 'Bureau Veritas';
  if (/intertek/i.test(s)) return 'Intertek';
  if (/actlabs/i.test(s)) return 'Actlabs';
  if (/central\s*geolog|\bCGL\b|төв\s*лаборатори/i.test(s)) return 'Central Geological Laboratory';
  return null;
}

/** Cell kind inside a header block. */
function classify(v) {
  if (typeof v === 'number') return { kind: 'num', num: v };
  const s = text(v);
  if (!s) return null;
  const u = normUnit(s);
  if (u) return { kind: 'unit', unit: u };
  if (isMethodCode(s)) return { kind: 'method', method: s, el: canonElement(s.split('-')[0]) };
  const el = canonElement(s);
  if (el) return { kind: 'el', el };
  const e = parseElementHeader(s);
  if (e) return { kind: 'el', el: e.el, unit: e.unit && !e.unitAssumed ? e.unit : null, method: e.method };
  const n = toNum(s.replace(/^</, ''));
  if (n !== null) return { kind: 'num', num: n };
  return { kind: 'text' };
}

function headerish(row, sc) {
  const cells = (row || []).map((v, j) => (j === sc ? null : classify(v))).filter(Boolean);
  if (!cells.length) return false;
  const good = cells.filter((c) => c.kind !== 'text').length;
  return good >= Math.max(1, Math.ceil(cells.length * 0.6));
}

function findSampleCell(matrix) {
  const out = [];
  const lim = Math.min(matrix.length, 80);
  for (let r = 0; r < lim; r++) {
    const row = matrix[r] || [];
    for (let c = 0; c < Math.min(row.length, 12); c++) if (typeof row[c] === 'string' && SAMPLE_LABEL.test(row[c].trim())) out.push({ r, c });
  }
  return out;
}

/** Header block around the sample label row → per-column {el, unit, method, lor}. */
function analyse(matrix, r0, sc) {
  let top = r0;
  for (let r = r0 - 1; r >= 0 && r >= r0 - 6; r--) {
    const row = matrix[r] || [];
    const lab = text(row[sc]);
    if (lab && !BLOCK_LABEL.test(lab) && !SAMPLE_LABEL.test(lab)) break;
    if (!row.some(nonEmpty)) break;
    if (!headerish(row, sc)) break;
    top = r;
  }
  let r = r0 + 1;
  while (r < matrix.length && r <= r0 + 8) {
    const row = matrix[r] || [];
    if (!row.some(nonEmpty)) {
      r++;
      continue;
    }
    const lab = text(row[sc]);
    if (lab === '' || BLOCK_LABEL.test(lab) || SAMPLE_LABEL.test(lab)) {
      if (lab === '' && !headerish(row, sc)) break;
      r++;
      continue;
    }
    break;
  }
  const dataStart = r;
  const info = new Map();
  const get = (j) => {
    if (!info.has(j)) info.set(j, { j, el: null, elFromMethod: null, unit: null, methods: [], lor: null, header: [] });
    return info.get(j);
  };
  for (let hr = top; hr < dataStart; hr++) {
    const row = matrix[hr] || [];
    const lab = text(row[sc]);
    const lorRow = LOR_LABEL.test(lab);
    for (let j = 0; j < row.length; j++) {
      if (j === sc || !nonEmpty(row[j])) continue;
      const cell = get(j);
      cell.header.push(text(row[j]));
      if (lorRow) {
        const n = typeof row[j] === 'number' ? row[j] : toNum(text(row[j]).replace(/^</, ''));
        if (n !== null && cell.lor === null) cell.lor = Math.abs(n);
        continue;
      }
      const c = classify(row[j]);
      if (!c) continue;
      if (c.kind === 'unit') cell.unit ??= c.unit;
      else if (c.kind === 'method') {
        cell.methods.push(c.method);
        if (c.el) cell.elFromMethod ??= c.el;
      } else if (c.kind === 'el') {
        cell.el ??= c.el;
        if (c.unit) cell.unit ??= c.unit;
        if (c.method) cell.methods.push(c.method);
      } else if (c.kind === 'num' && hr > r0 - 1) cell.lor ??= Math.abs(c.num);
    }
  }
  const cols = [...info.values()]
    .map((c) => ({ ...c, el: c.el || c.elFromMethod }))
    .filter((c) => c.el);
  return { top, dataStart, cols };
}

/** Pull lab job / PO / lab / report date out of the file name and the preamble. */
function certMeta(matrix, top, fileName) {
  const pre = matrix
    .slice(0, top)
    .map((r) => (r || []).filter(nonEmpty).map(text).join(' '))
    .join('\n');
  const fn = baseName(fileName);
  const all = `${fn}\n${pre}`;
  const wo = fn.match(WO_RX)?.[1] || pre.match(WO_RX)?.[1] || null;
  const po = fn.match(PO_RX)?.[1] || pre.match(PO_RX)?.[1] || null;
  const job = pre.match(JOB_RX)?.[1] || null;
  let reported = null;
  for (let r = 0; r < top && !reported; r++) {
    const row = matrix[r] || [];
    for (let j = 0; j < row.length && !reported; j++) {
      const s = text(row[j]);
      if (!/date|finali[sz]ed|reported|issued|огноо/i.test(s)) continue;
      const inCell = s.split(/[:：]/).slice(1).join(':').trim();
      const cand = [inCell, ...row.slice(j + 1).filter(nonEmpty)];
      for (const c of cand) {
        const d = /\d/.test(String(c)) ? coerceDate(c) : null;
        if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number(d.slice(0, 4)) > 1990) {
          reported = d;
          break;
        }
      }
    }
  }
  return { labJob: wo || job || po || null, po, lab: detectLab(all), reported, certificate: wo || fn || job || po || null };
}

/**
 * Parse one sheet / 2-D array of a lab certificate.
 * → {lab, labJob, po, certificate, reported, elements:[{key, el, unit, method, lor}],
 *    rows:[{sampleId, values, flags, rowNo}], warnings, sampleCol, dataStart}
 */
export function parseLab(matrix, { fileName = '', sheetName = '', belowDetection } = {}) {
  const mode = belowDetection || settings().belowDetection || 'half';
  const warnings = [];
  let best = null;
  for (const { r, c } of findSampleCell(matrix)) {
    const a = analyse(matrix, r, c);
    if (a.cols.length && (!best || a.cols.length > best.a.cols.length)) best = { r, c, a };
    if (best && best.a.cols.length >= 3) break;
  }
  if (!best) {
    // no recognisable label: generic header row, sample column = first 'sample'-ish header or column A
    const hr = detectHeaderRow(matrix);
    const row = matrix[hr] || [];
    let sc = row.findIndex((v) => /sample|дээж|client/i.test(text(v)));
    if (sc < 0) sc = 0;
    const a = analyse(matrix, hr, sc);
    if (a.cols.length) best = { r: hr, c: sc, a };
  }
  const meta = certMeta(matrix, best ? best.a.top : Math.min(matrix.length, 10), fileName);
  if (!best) {
    return { ...meta, fileName, sheetName, elements: [], rows: [], warnings: [{ severity: 'error', code: 'no-elements', ...M('No sample-ID column with element columns was found', 'Дээжийн дугаар, элементийн багана олдсонгүй') }], sampleCol: null, dataStart: null };
  }
  const { c: sc, a } = best;

  // columns → element keys (duplicates = over-limit / re-assay methods of one analyte)
  const byKey = new Map();
  for (const col of a.cols) {
    const unitAssumed = !col.unit;
    const unit = col.unit || 'ppm';
    const key = `${col.el}_${unit}`;
    if (!byKey.has(key)) byKey.set(key, { key, el: col.el, unit, methods: [], lor: null, cols: [], unitAssumed });
    const e = byKey.get(key);
    e.cols.push(col);
    for (const m of col.methods) if (!e.methods.includes(m)) e.methods.push(m);
    if (e.lor === null && col.lor !== null) e.lor = col.lor;
  }
  const elements = [...byKey.values()].map((e) => ({ key: e.key, el: e.el, unit: e.unit, method: e.methods.join(' / ') || null, lor: e.lor, cols: e.cols.map((c) => c.j), unitAssumed: e.unitAssumed }));
  const assumed = elements.filter((e) => e.unitAssumed).map((e) => e.el);
  if (assumed.length) warnings.push({ severity: 'warn', code: 'unit-assumed', ...M(`No unit given for ${assumed.join(', ')} — assumed ppm`, `${assumed.join(', ')}-д нэгж заагаагүй — ppm гэж үзэв`) });

  const out = [];
  const bad = [];
  for (let r = a.dataStart; r < matrix.length; r++) {
    const row = matrix[r] || [];
    const sid = text(row[sc]);
    if (!sid || SAMPLE_LABEL.test(sid) || BLOCK_LABEL.test(sid)) continue;
    const values = {};
    const flags = {};
    let any = false;
    for (const e of byKey.values()) {
      let pick = null;
      for (const col of e.cols) {
        const raw = row[col.j];
        if (!nonEmpty(raw)) continue;
        const pv = parseLabValue(raw, { lor: col.lor ?? e.lor, mode });
        if (pv.flag === '?') {
          bad.push(`${sid} ${e.key} “${text(raw)}”`);
          continue;
        }
        if (!pick) pick = pv;
        else if ((pick.flag === '>' || pick.value === null) && pv.value !== null && pv.flag !== '>') pick = pv; // over-limit re-assay wins
      }
      if (!pick) continue;
      any = true;
      values[e.key] = pick.value;
      if (pick.flag) flags[e.key] = pick.flag;
    }
    if (!any) continue;
    out.push({ sampleId: sid, values, flags, rowNo: r + 1 });
  }
  if (bad.length) warnings.push({ severity: 'warn', code: 'unreadable', ...M(`${bad.length} value(s) could not be read and were left empty: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''}`, `${bad.length} утгыг уншиж чадсангүй, хоосон үлдээв: ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''}`) });
  return { ...meta, fileName, sheetName, elements, rows: out, warnings, sampleCol: sc, dataStart: a.dataStart, mode };
}

/** Parse every sheet and keep the one with the most assay rows. */
export function parseLabSheets(sheets, opts = {}) {
  let best = null;
  for (const sh of sheets) {
    const p = parseLab(sh.matrix, { ...opts, sheetName: sh.name });
    if (!best || p.rows.length > best.rows.length) best = p;
  }
  return best || parseLab([], opts);
}

/** Read a certificate file (File, {name, buffer}, {name, text}) and parse it. */
export async function readLabFile(input, opts = {}) {
  const t = await readTabular(input, opts);
  return parseLabSheets(t.sheets, { ...opts, fileName: t.fileName });
}

/** Cheap check: does a sheet look like a lab certificate rather than a data table? */
export function looksLikeLabCertificate(sheet) {
  const m = sheet?.matrix || [];
  let methods = 0;
  for (let r = 0; r < Math.min(m.length, 15); r++) {
    for (const v of m[r] || []) {
      const s = text(v);
      if (!s) continue;
      if (isMethodCode(s) && /-/.test(s)) methods++;
      if (/^certificate\b/i.test(s) || LOR_LABEL.test(s)) methods += 2;
    }
  }
  return methods >= 2;
}

// ------------------------------------------------------------------ plan

const sameNum = (a, b) => (a === null || a === undefined ? b === null || b === undefined : isNum(a) && isNum(b) ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)) : a === b);

/**
 * Match a parsed certificate to samples. Nothing is written.
 * options: certificate (default: parsed), labJob, received (ISO date),
 *   allowUnmatched (import rows whose sample is unknown, with no hole).
 */
export function planLabImport(parsed, { certificate, labJob, received, allowUnmatched = false } = {}) {
  const cert = text(certificate ?? parsed.certificate);
  const job = text(labJob ?? parsed.labJob) || null;
  const date = received || parsed.reported || todayISO();
  const plan = {
    kind: 'lab',
    table: 'assays',
    certificate: cert,
    labJob: job,
    received: date,
    fileName: parsed.fileName || '',
    elements: parsed.elements || [],
    create: [],
    update: [],
    unchanged: 0,
    matched: 0,
    unmatched: [],
    labQc: [],
    duplicates: [],
    reimport: false,
    existingCount: 0,
    elementUpdates: {},
    errors: [],
    warnings: [...(parsed.warnings || [])],
    options: { allowUnmatched },
    summary: null,
  };
  if (!cert) {
    plan.errors.push({ severity: 'error', code: 'no-certificate', ...M('Give the certificate a name (e.g. the lab job number) — it is how re-imports are recognised', 'Сертификатын нэрийг оруулна уу (жишээ нь лабораторийн ажлын дугаар) — дахин импортлоход үүгээр танина') });
    plan.summary = labSummary(plan);
    return plan;
  }
  const sIdx = new Map();
  for (const s of storeRows('samples')) sIdx.set(normSampleId(s.sampleId), s);
  const all = storeRows('assays');
  const existing = all.filter((a) => normCert(a.certificate) === normCert(cert));
  plan.existingCount = existing.length;
  plan.reimport = existing.length > 0;
  const exIdx = new Map(existing.map((a) => [normSampleId(a.sampleId), a]));
  if (plan.reimport) plan.warnings.push({ severity: 'info', code: 'reimport', ...M(`Certificate ${cert} was imported before (${existing.length} rows) — matching rows are updated, never duplicated`, `${cert} сертификатыг өмнө импортолсон (${existing.length} мөр) — таарсан мөрүүд шинэчлэгдэнэ, давхардахгүй`) });
  if (job) {
    const other = [...new Set(all.filter((a) => a.labJob && normCert(a.labJob) === normCert(job) && normCert(a.certificate) !== normCert(cert)).map((a) => a.certificate))];
    if (other.length) plan.warnings.push({ severity: 'warn', code: 'job-other-cert', ...M(`Lab job ${job} is already in ORD under certificate ${other.join(', ')} — use the same certificate name to update instead of adding`, `${job} лабораторийн ажил ORD-д ${other.join(', ')} сертификатаар орсон байна — нэмэхийн оронд шинэчлэх бол ижил нэр ашиглана уу`) });
  }

  const seen = new Set();
  for (const r of parsed.rows || []) {
    const k = normSampleId(r.sampleId);
    if (seen.has(k)) {
      plan.duplicates.push(r);
      plan.warnings.push({ severity: 'warn', code: 'dup', rowNo: r.rowNo, ...M(`Sample ${r.sampleId} appears again in the certificate — the first row is used`, `${r.sampleId} дээж сертификатад дахин гарсан — эхний мөрийг авав`) });
      continue;
    }
    seen.add(k);
    const s = sIdx.get(k);
    let holeId;
    let sampleId;
    if (s) {
      plan.matched++;
      holeId = s.holeId;
      sampleId = s.sampleId;
    } else {
      (LAB_QC.test(r.sampleId) ? plan.labQc : plan.unmatched).push({ sampleId: r.sampleId, rowNo: r.rowNo });
      if (!allowUnmatched) continue;
      holeId = '';
      sampleId = r.sampleId;
    }
    const ex = exIdx.get(k);
    if (ex) {
      const changes = {};
      const nv = { ...(ex.values || {}) };
      const nf = { ...(ex.flags || {}) };
      for (const [key, v] of Object.entries(r.values)) {
        if (!sameNum(ex.values?.[key], v)) changes[`values.${key}`] = [ex.values?.[key] ?? null, v];
        nv[key] = v;
        const f = r.flags[key] || null;
        if ((ex.flags?.[key] || null) !== f) changes[`flags.${key}`] = [ex.flags?.[key] ?? null, f];
        if (f) nf[key] = f;
        else delete nf[key];
      }
      const patch = { id: ex.id };
      if (Object.keys(changes).length) {
        patch.values = nv;
        patch.flags = nf;
      }
      if (job && ex.labJob !== job) {
        changes.labJob = [ex.labJob ?? null, job];
        patch.labJob = job;
      }
      if (!Object.keys(changes).length) {
        plan.unchanged++;
        continue;
      }
      const entry = { id: ex.id, holeId: ex.holeId, sampleId, rowNo: r.rowNo, label: sampleId, changes, patch };
      if (ex.holeId === '' && holeId) entry.moveTo = holeId; // sample registered since the last import
      plan.update.push(entry);
    } else {
      plan.create.push({ holeId, sampleId, rowNo: r.rowNo, label: sampleId, row: { sampleId, labJob: job, certificate: cert, received: date, values: r.values, flags: r.flags } });
    }
  }
  if (plan.unmatched.length) plan.warnings.push({ severity: allowUnmatched ? 'info' : 'warn', code: 'unmatched', ...M(`${plan.unmatched.length} sample ID(s) are not in the samples table${allowUnmatched ? ' — imported without a hole' : ' — not imported'}: ${plan.unmatched.slice(0, 8).map((u) => u.sampleId).join(', ')}${plan.unmatched.length > 8 ? '…' : ''}`, `${plan.unmatched.length} дээжийн дугаар дээжийн хүснэгтэд алга${allowUnmatched ? ' — цооноггүйгээр орно' : ' — оруулахгүй'}: ${plan.unmatched.slice(0, 8).map((u) => u.sampleId).join(', ')}${plan.unmatched.length > 8 ? '…' : ''}`) });
  if (plan.labQc.length) plan.warnings.push({ severity: 'info', code: 'lab-qc', ...M(`${plan.labQc.length} laboratory QC row(s) (lab standards, blanks, repeats) are not your samples${allowUnmatched ? ' — imported without a hole' : ' — skipped'}`, `${plan.labQc.length} лабораторийн дотоод QC мөр (стандарт, blank, давтан) таны дээж биш${allowUnmatched ? ' — цооноггүйгээр орно' : ' — алгасав'}`) });

  // element metadata (LOR / unit / method) for settings().elements
  const cur = settings().elements || {};
  for (const e of plan.elements) {
    const c = cur[e.key];
    const meta = { unit: e.unit, method: e.method, lor: e.lor };
    if (!c) {
      plan.elementUpdates[e.key] = meta;
      continue;
    }
    const patch = {};
    for (const p of ['unit', 'method', 'lor']) if ((c[p] === null || c[p] === undefined || c[p] === '') && meta[p] !== null && meta[p] !== undefined) patch[p] = meta[p];
    if (Object.keys(patch).length) plan.elementUpdates[e.key] = { ...c, ...patch };
    if (isNum(toNum(c.lor)) && isNum(e.lor) && Math.abs(toNum(c.lor) - e.lor) > 1e-12) plan.warnings.push({ severity: 'info', code: 'lor-differs', ...M(`${e.key}: this certificate's LOR ${e.lor} differs from the project setting ${c.lor} (setting kept)`, `${e.key}: энэ сертификатын илрүүлэх хязгаар ${e.lor} нь тохиргооны ${c.lor}-оос өөр (тохиргоог хэвээр үлдээв)`) });
  }
  plan.summary = labSummary(plan);
  return plan;
}

function labSummary(plan) {
  const holes = new Set();
  for (const c of plan.create) if (c.holeId) holes.add(c.holeId);
  for (const u of plan.update) {
    if (u.holeId) holes.add(u.holeId);
    if (u.moveTo) holes.add(u.moveTo);
  }
  return {
    rows: plan.matched + plan.unmatched.length + plan.labQc.length,
    matched: plan.matched,
    unmatched: plan.unmatched.length,
    labQc: plan.labQc.length,
    create: plan.create.length,
    update: plan.update.length,
    unchanged: plan.unchanged,
    duplicates: plan.duplicates.length,
    elements: plan.elements.length,
    newElements: Object.keys(plan.elementUpdates).length,
    errors: plan.errors.length,
    warnings: plan.warnings.length,
    writes: plan.create.length + plan.update.length,
    holes: [...holes].sort(natCmp),
    reimport: plan.reimport,
  };
}

/** Write the plan's assay rows (and new element metadata) as ONE undoable batch. */
export function commitLabImport(plan, { label } = {}) {
  if (plan.errors.length) throw new Error(plan.errors[0].message);
  const ops = [];
  for (const c of plan.create) ops.push({ type: 'upsert', table: 'assays', holeId: c.holeId, row: { ...c.row } });
  for (const u of plan.update) {
    if (u.moveTo) {
      const cur = storeRows('assays', u.holeId).find((r) => r.id === u.id) || {};
      const { _t, _u, _d, ...rest } = cur;
      ops.push({ type: 'delete', table: 'assays', holeId: u.holeId, id: u.id });
      ops.push({ type: 'upsert', table: 'assays', holeId: u.moveTo, row: { ...rest, ...u.patch, id: u.id, holeId: u.moveTo } });
    } else ops.push({ type: 'upsert', table: 'assays', holeId: u.holeId, row: { ...u.patch } });
  }
  if (Object.keys(plan.elementUpdates).length) {
    ops.push({ type: 'upsert', table: 'settings', row: { id: 'settings', elements: { ...(settings().elements || {}), ...plan.elementUpdates } } });
  }
  const lbl = label || `Lab certificate ${plan.certificate}: ${plan.create.length} new, ${plan.update.length} updated`;
  const res = mutate(ops, { label: lbl });
  return { ...res, label: lbl, holes: plan.summary.holes };
}

// Import engine: read CSV / TSV / XLSX, guess the table, map columns, then a
// dry run (plan) that is shown in full before anything is written, and a commit
// that writes the plan as ONE undoable batch.
//
// Each rule here closes a hole MX Deposit leaves open:
//  - Every row lands in exactly one bucket: new / updated / unchanged / error.
//    Nothing is silently dropped, and a locked hole is an explicit error.
//  - Empty cells keep the existing value unless the user asks to clear them.
//  - Re-imports update rows by natural key (hole+from+to, sample ID...), they
//    never append duplicates; replacing a hole's intervals is an explicit option
//    whose deletes are listed in the preview.
//  - Unknown codes are listed; the user rejects, adds them to the list, or keeps.
//  - Calculated columns are recognised and ignored (ORD calculates them).
//  - Swapped lon/lat is detected and a one-click fix offered; >8 decimals rounded.
//  - Over-long comments, % outside 0–100, from ≥ to, overlaps, depth past EOH
//    and duplicate keys are reported per row before the import.

import { TABLES } from './schema.js';
import { toNum, toISODate, round, natCmp, isNum } from './util.js';
import { parseCSV } from './csv.js';
import { rows as storeRows, holes as storeHoles, codeMap, settings, mutate } from './store.js';

const M = (en, mn) => ({ message: en, mn });

// ============================================================ reading files

const WORKBOOK_EXT = new Set(['xlsx', 'xlsm', 'xls', 'xlsb', 'ods']);
let xlsxPromise = null;

/** SheetJS, loaded only when a workbook is actually opened. */
export function loadXLSX() {
  if (!xlsxPromise) xlsxPromise = import('../../vendor/xlsx.mjs');
  return xlsxPromise;
}

const extOf = (name) => (String(name || '').match(/\.([^./\\]+)$/)?.[1] || '').toLowerCase();
export const baseName = (name) => String(name || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

function toU8(b) {
  if (b instanceof Uint8Array) return b;
  if (ArrayBuffer.isView(b)) return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return new Uint8Array(b);
}

function looksLikeWorkbook(u8) {
  if (!u8 || u8.length < 4) return false;
  const zip = u8[0] === 0x50 && u8[1] === 0x4b && u8[2] === 0x03 && u8[3] === 0x04;
  const cfb = u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0;
  return zip || cfb;
}

/** Bytes → text: UTF-16 (Excel "Unicode text"), UTF-8, else Windows-1251 (Cyrillic). */
export function decodeText(u8) {
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8);
  } catch {
    try {
      return new TextDecoder('windows-1251').decode(u8);
    } catch {
      return new TextDecoder('utf-8').decode(u8);
    }
  }
}

const nonEmpty = (v) => v !== null && v !== undefined && !(typeof v === 'string' && v.trim() === '');
const cellText = (v) => (v === null || v === undefined ? '' : String(v).trim());

function colName(j) {
  let s = '';
  let n = j + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellValue(XLSX, cell) {
  if (!cell) return '';
  switch (cell.t) {
    case 'z':
    case 'e':
      return '';
    case 'b':
      return cell.v;
    case 'd':
      return cell.v instanceof Date && !Number.isNaN(cell.v.getTime()) ? cell.v.toISOString().slice(0, 10) : '';
    case 'n':
      if (cell.z && typeof cell.z === 'string' && XLSX.SSF?.is_date?.(cell.z)) return toISODate(Math.floor(cell.v)) ?? cell.v;
      return cell.v;
    default:
      return cell.v ?? '';
  }
}

/** Worksheet → dense 2-D array (row 0 = spreadsheet row 1), built from the cells present. */
function sheetMatrix(XLSX, ws) {
  const sparse = [];
  for (const k of Object.keys(ws)) {
    if (k[0] === '!') continue;
    const { r, c } = XLSX.utils.decode_cell(k);
    const v = cellValue(XLSX, ws[k]);
    if (!nonEmpty(v)) continue;
    (sparse[r] ||= [])[c] = v;
  }
  const out = [];
  for (let r = 0; r < sparse.length; r++) {
    const row = sparse[r] || [];
    const dense = new Array(row.length);
    for (let c = 0; c < row.length; c++) dense[c] = row[c] ?? '';
    out.push(dense);
  }
  return out;
}

async function readWorkbook(u8) {
  const XLSX = await loadXLSX();
  const wb = XLSX.read(u8, { type: 'array', cellDates: false, cellNF: true, cellText: false });
  return wb.SheetNames.map((n) => sheetFromMatrix(n, sheetMatrix(XLSX, wb.Sheets[n]))).filter((s) => s.matrix.length);
}

const isDateLike = (v) => typeof v === 'string' && /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/.test(v.trim());

/**
 * Header row: MX style (title in row 1, headers in row 2) or generic — the first
 * row with ≥ 2 filled cells that are mostly text (not numbers or dates) and at
 * least half as wide as the widest row near the top (skips lab-report preambles).
 */
export function detectHeaderRow(matrix) {
  const lim = Math.min(matrix.length, 40);
  let max = 0;
  const counts = [];
  for (let i = 0; i < lim; i++) {
    const n = (matrix[i] || []).filter(nonEmpty).length;
    counts.push(n);
    if (n > max) max = n;
  }
  const need = Math.max(2, Math.ceil(max * 0.5));
  for (let i = 0; i < lim; i++) {
    if (counts[i] < need) continue;
    const cells = (matrix[i] || []).filter(nonEmpty);
    const textish = cells.filter((c) => typeof c === 'string' && toNum(c) === null && !isDateLike(c)).length;
    if (textish / cells.length >= 0.6) return i;
  }
  const first = counts.findIndex((n) => n >= 2);
  return first < 0 ? 0 : first;
}

const UNIT_WORDS = new Set(['m', 'cm', 'mm', 'deg', '°', 'kg', 'g', 'si', 'g/cm3', 'g/cm³', 't/m3', 'x10-3si', '×10⁻³si', 'units', 'unit']);
function isUnitCell(v) {
  const s = cellText(v).toLowerCase().replace(/[()[\]\s]/g, '');
  return !!s && (normUnit(s) !== null || UNIT_WORDS.has(s));
}

/** Build {name, headers, rows, rowNos, headerRow, units, title, matrix} from a 2-D array. */
export function sheetFromMatrix(name, matrix) {
  const hr = detectHeaderRow(matrix);
  const hdr = matrix[hr] || [];
  let width = hdr.length;
  for (let i = hr + 1; i < Math.min(matrix.length, hr + 200); i++) width = Math.max(width, (matrix[i] || []).length);
  const headers = [];
  const cols = [];
  const seen = new Map();
  for (let j = 0; j < width; j++) {
    let h = cellText(hdr[j]);
    if (!h) {
      let has = false;
      for (let i = hr + 1; i < matrix.length && !has; i++) has = nonEmpty(matrix[i]?.[j]);
      if (!has) continue;
      h = `Column ${colName(j)}`;
    }
    const n = (seen.get(h) || 0) + 1;
    seen.set(h, n);
    if (n > 1) h = `${h} (${n})`;
    headers.push(h);
    cols.push(j);
  }
  let start = hr + 1;
  const units = {};
  const next = matrix[start];
  if (next && cols.some((j) => nonEmpty(next[j])) && cols.every((j) => !nonEmpty(next[j]) || isUnitCell(next[j]))) {
    cols.forEach((j, k) => {
      if (nonEmpty(next[j])) units[headers[k]] = cellText(next[j]);
    });
    start++;
  }
  const rows = [];
  const rowNos = [];
  for (let i = start; i < matrix.length; i++) {
    const r = matrix[i];
    if (!r || !cols.some((j) => nonEmpty(r[j]))) continue;
    const o = {};
    cols.forEach((j, k) => {
      o[headers[k]] = r[j] ?? '';
    });
    rows.push(o);
    rowNos.push(i + 1);
  }
  const title = matrix
    .slice(0, hr)
    .map((r) => (r || []).filter(nonEmpty).map(cellText).join(' '))
    .filter(Boolean)
    .join(' · ');
  return { name, headers, rows, rowNos, headerRow: hr, units, title, matrix };
}

/** Delimiter from the first non-empty lines (csv.js's detector counts blank lines as 0). */
export function sniffDelimiter(text) {
  const lines = String(text).replace(/^\ufeff/, '').slice(0, 8192).split(/\r?\n/).filter((l) => l.trim()).slice(0, 8);
  let best = ',';
  let bestScore = -1;
  for (const d of [',', '\t', ';', '|']) {
    const counts = lines.map((l) => l.split(d).length - 1);
    if (!counts.length) break;
    const min = Math.min(...counts);
    const score = min > 0 ? min * 10 + counts[0] : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/**
 * Read a file for import. Accepts a File/Blob, {name, text}, {name, buffer},
 * raw bytes, or a pasted string (Excel copy = TSV).
 * → {fileName, kind: 'text' | 'workbook', sheets: [{name, headers, rows, rowNos, headerRow, units, title, matrix}]}
 */
export async function readTabular(input, { fileName } = {}) {
  const name = fileName || input?.name || '';
  let text = null;
  let bytes = null;
  if (typeof input === 'string') text = input;
  else if (input && typeof input.text === 'string') text = input.text;
  else if (input?.buffer && !ArrayBuffer.isView(input)) bytes = toU8(input.buffer);
  else if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) bytes = toU8(input);
  else if (input && typeof input.arrayBuffer === 'function') bytes = new Uint8Array(await input.arrayBuffer());
  else if (input?.file && typeof input.file.arrayBuffer === 'function') bytes = new Uint8Array(await input.file.arrayBuffer());
  else throw new Error('Nothing to read');
  const ext = extOf(name);
  if (bytes && (WORKBOOK_EXT.has(ext) || looksLikeWorkbook(bytes))) {
    return { fileName: name, kind: 'workbook', sheets: await readWorkbook(bytes) };
  }
  if (text === null) text = decodeText(bytes);
  const matrix = parseCSV(text, ext === 'tsv' ? '\t' : sniffDelimiter(text));
  const sheetName = baseName(name) || 'Pasted data';
  return { fileName: name, kind: 'text', sheets: matrix.length ? [sheetFromMatrix(sheetName, matrix)] : [] };
}

// ================================================= headers, fields, elements

/** Lowercase, '%' → 'pct', drop bracketed units and every non-letter/digit. */
export function normHeader(h) {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[([]\s*%\s*[)\]]/g, ' pct ')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/%/g, ' pct ')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

const collarHole = TABLES.collar.fields.find((f) => f.key === 'holeId');
/** Hole ID column of per-hole tables (the key that places a row in a hole). */
export const HOLE_FIELD = { key: 'holeId', type: 'text', label: collarHole.label, mx: collarHole.mx, aliases: collarHole.aliases, req: true, pseudo: true };

/** Headers MX Deposit calculates itself (never imported, never exported to MX). */
const MX_CALC = new Set(['rockname', 'totalslf', 'totalslfpct', 'runlength', 'coreloss', 'corelossm', 'recoveredpct', 'recpct', 'actualdepth', 'rqdpct', 'samplelength']);

export const isHoleTable = (t) => TABLES[t]?.scope === 'hole';

/** Fields a column can be mapped to (hole tables get the Hole ID pseudo-field first). */
export function importFields(table) {
  const def = TABLES[table];
  if (!def) return [];
  const fs = def.fields.filter((f) => !f.noImport);
  return isHoleTable(table) && table !== 'collar' ? [HOLE_FIELD, ...fs] : fs;
}

const idxCache = new Map();
function fieldIndex(table) {
  if (idxCache.has(table)) return idxCache.get(table);
  const m = new Map();
  const add = (tok, f) => {
    const n = normHeader(tok);
    if (n && !m.has(n)) m.set(n, f);
  };
  const fs = importFields(table);
  for (const f of fs) add(f.key, f);
  for (const f of fs) if (f.mx) add(f.mx, f);
  for (const f of fs) {
    add(f.label?.en, f);
    add(f.label?.mn, f);
  }
  for (const f of fs) for (const a of f.aliases || []) add(a, f);
  idxCache.set(table, m);
  return m;
}

export const fieldOf = (table, key) => (key === 'holeId' && table !== 'collar' ? HOLE_FIELD : TABLES[table]?.fields.find((f) => f.key === key));

/** The calculated field a header names (ORD ignores it), or null. */
export function calcHeader(table, header) {
  const n = normHeader(header);
  const f = fieldIndex(table).get(n);
  if (f?.type === 'calc') return { key: f.key, label: f.label };
  if (!f && MX_CALC.has(n)) return { key: null, label: { en: String(header), mn: String(header) } };
  return null;
}

// Element symbols that turn up in assay / pXRF suites.
const SYMBOLS = 'Li Be B C F Na Mg Al Si P S Cl K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Rb Sr Y Zr Nb Mo Ru Rh Pd Ag Cd In Sn Sb Te I Cs Ba La Ce Pr Nd Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Th U'.split(' ');
const SYM = new Map(SYMBOLS.map((s) => [s.toUpperCase(), s]));
const OXIDES = new Map(
  'SiO2 Al2O3 Fe2O3 FeO CaO MgO Na2O K2O TiO2 MnO P2O5 Cr2O3 BaO SO3 SrO ZrO2 V2O5 NiO CuO ZnO PbO Fe2O3T LOI'.split(' ').map((s) => [s.toUpperCase(), s]),
);
// bare symbols that are more likely words than elements when no unit is given
const AMBIGUOUS_BARE = new Set(['No', 'In', 'Ho', 'Be', 'I']);

export const ELEMENT_SYMBOLS = SYMBOLS;

/** Canonical element / oxide from a header token ('AU' → 'Au', 'FE2O3' → 'Fe2O3'), or null. */
export function canonElement(tok) {
  const t = String(tok ?? '').trim();
  if (!t) return null;
  const up = t.toUpperCase();
  if (SYM.has(up) && (t === SYM.get(up) || t === up || t === t.toLowerCase())) return SYM.get(up);
  if (OXIDES.has(up)) return OXIDES.get(up);
  return null;
}

/** 'ppm' | 'ppb' | 'pct' | 'gpt' from a unit string, or null. */
export function normUnit(u) {
  const s = String(u ?? '')
    .trim()
    .toLowerCase()
    .replace(/[()[\]\s]/g, '');
  if (!s) return null;
  if (['ppm', 'mg/kg', 'ug/g', 'µg/g', 'μg/g'].includes(s)) return 'ppm';
  if (['ppb', 'ug/kg', 'µg/kg', 'μg/kg', 'ng/g'].includes(s)) return 'ppb';
  if (['%', 'pct', 'percent', 'wt%', 'wt.%', 'perc'].includes(s)) return 'pct';
  if (['g/t', 'gpt', 'gt', 'g/tonne', 'g/mt', 'г/т'].includes(s)) return 'gpt';
  return null;
}

const METHOD_RX = /^[A-Za-z]{1,4}\d?-[A-Za-z]{2,5}\d{0,3}[A-Za-z]?\d?$/; // ME-ICP61, Au-AA23, PGM-ICP27, S-IR08, Cu-OG62
const METHOD_PART = /^(?:[A-Za-z]{1,6}\d{1,3}[A-Za-z]?\d?|ME|PGM|OG|GRA|ICP|MS|XRF|FA|AAS|OES|GE)$/i;

/** Is a cell a lab method code (ME-ICP61, Au-AA23, FAA505, GE_ICP40Q12…)? */
export function isMethodCode(v) {
  const s = cellText(v);
  if (!s || s.length > 16 || /\s/.test(s)) return false;
  if (METHOD_RX.test(s)) return true;
  return /^[A-Za-z]{2,4}_?[A-Za-z]{0,4}\d{2,3}[A-Za-z]?\d{0,2}$/.test(s) && /\d/.test(s) && !canonElement(s);
}

const ERR_COL = /(^|[\s_\-.(])(err|error|errors|\+\/-|±|sd|stdev|std\.?dev|sigma|σ|1σ|2σ|3σ|unc|uncert)($|[\s_\-.)])/i;

/**
 * Element / analyte column header → {el, unit, method, key} or null.
 * 'Au_ppm', 'Au (ppm)', 'Au ppm', 'Cu_pct__ME_ICP61', 'Cu %', 'Au-AA23 ppm',
 * 'ME-ICP61 Cu ppm', 'Fe2O3 %', 'Au g/t'. Error columns ('Cu Error', 'Cu +/-') → null.
 * `unit` / `defaultUnit` fill in a unit the header does not carry.
 */
export function parseElementHeader(h, { unit: givenUnit, defaultUnit = null } = {}) {
  let s = cellText(h).replace(/\s\(\d\)$/, ''); // ' (2)' added to repeated headers
  if (!s || s.length > 48) return null;
  if (ERR_COL.test(s)) return null;
  s = s
    .replace(/g\s*\/\s*t(onne)?\b/gi, ' gpt ')
    .replace(/(^|[^\p{L}])г\s*\/\s*т(?![\p{L}])/giu, '$1 gpt ')
    .replace(/(mg\s*\/\s*kg|мг\s*\/\s*кг)/gi, ' ppm ')
    .replace(/wt\.?\s*%/gi, ' % ')
    .replace(/%/g, ' % ');
  const toks = s.split(/[\s_()[\]/,;:|]+/).filter(Boolean);
  let el = null;
  let unit = null;
  const method = [];
  for (const t of toks) {
    const u = normUnit(t);
    if (u && !unit) {
      unit = u;
      continue;
    }
    if (METHOD_RX.test(t)) {
      method.push(t);
      const pre = canonElement(t.split('-')[0]);
      if (pre && !el) el = pre;
      continue;
    }
    const e = canonElement(t);
    if (e && !el) {
      el = e;
      continue;
    }
    if (el && METHOD_PART.test(t)) {
      method.push(t);
      continue;
    }
    if (!el && /^(ME|PGM|OG)$/i.test(t)) {
      method.push(t);
      continue;
    }
    return null;
  }
  if (!el) return null;
  let m = method.join('-').toUpperCase();
  const mm = m.match(/^([A-Z]{1,4})-(.+)$/);
  if (mm && canonElement(mm[1])) m = `${canonElement(mm[1])}-${mm[2]}`;
  if (!unit && givenUnit) unit = normUnit(givenUnit);
  if (!unit && !m && AMBIGUOUS_BARE.has(el) && toks.length === 1) return null;
  const assumed = !unit;
  if (!unit) unit = defaultUnit;
  if (!unit) return { el, unit: null, method: m || null, key: null, unitAssumed: true };
  return { el, unit, method: m || null, key: `${el}_${unit}`, unitAssumed: assumed };
}

/** Best column → field mapping. Values: fieldKey | 'holeId' | 'values:<El_unit>' | 'ignore'. */
export function autoMap(table, headers, { units = {} } = {}) {
  const idx = fieldIndex(table);
  const used = new Set();
  const map = {};
  const valuesTable = table === 'assays' || table === 'pxrf';
  for (const h of headers) {
    const n = normHeader(h);
    const f = idx.get(n);
    let target = 'ignore';
    if (f) {
      if (f.type !== 'calc') target = f.key;
    } else if (valuesTable && !MX_CALC.has(n)) {
      const e = parseElementHeader(h, { unit: units[h], defaultUnit: 'ppm' });
      if (e?.key) target = 'values:' + e.key;
    }
    if (target !== 'ignore') {
      if (used.has(target)) target = 'ignore';
      else used.add(target);
    }
    map[h] = target;
  }
  return map;
}

/** Explanation of a header's mapping for the UI ('calc' | 'element' | 'unit-assumed' | null). */
export function mappingNote(table, header, target, { units = {} } = {}) {
  if (calcHeader(table, header)) return 'calc';
  if (String(target).startsWith('values:')) {
    const e = parseElementHeader(header, { unit: units[header] });
    return e && e.unit ? 'element' : 'unit-assumed';
  }
  return null;
}

// ------------------------------------------------------------ table guess

const SHEET_HINTS = [
  [/dispatch|илгээлт/, 'dispatch'],
  [/^(header|headers|collars?|coordinates?|holes?|drill ?holes?|hole ?list|цооног)/, 'collar'],
  [/survey|downhole|гүний хэмжилт/, 'survey'],
  [/^(lith|litho|lithology|geology|geolog|литолог|геолог)/, 'lith'],
  [/recovery|geotech|rqd|авралт/, 'geotech'],
  [/struct|бүтэц/, 'struct'],
  [/assay|certificate|шинжилгээ/, 'assays'],
  [/sampl|дээж/, 'samples'],
  [/xrf/, 'pxrf'],
  [/mag ?sus|magsus|density|phys|нягт|соронз|(^|[^a-z])sg([^a-z]|$)/, 'phys'],
  [/crm|standards?|стандарт/, 'crms'],
  [/code|кодын/, 'codes'],
];

export function sheetHint(sheetName) {
  const s = String(sheetName || '').toLowerCase().trim();
  for (const [rx, t] of SHEET_HINTS) if (rx.test(s)) return t;
  return null;
}

/** [[table, score], ...] best first, from header overlap (IDF-weighted) plus the sheet name. */
export function scoreTables(sheetName, headers) {
  const cands = Object.keys(TABLES);
  const norms = [...new Set(headers.map(normHeader).filter(Boolean))];
  const df = new Map();
  for (const t of cands) {
    const idx = fieldIndex(t);
    for (const n of norms) if (idx.has(n)) df.set(n, (df.get(n) || 0) + 1);
  }
  const anyField = (h) => df.has(normHeader(h));
  const elCount = headers.filter((h) => !anyField(h) && parseElementHeader(h, { defaultUnit: 'ppm' })).length;
  const scores = {};
  for (const t of cands) {
    const idx = fieldIndex(t);
    const used = new Set();
    let s = 0;
    for (const n of norms) {
      const f = idx.get(n);
      if (!f || used.has(f.key)) continue;
      used.add(f.key);
      s += 1 / df.get(n);
      if (f.req && f.type !== 'calc') s += 0.25;
    }
    if (t === 'assays' || t === 'pxrf') s += Math.min(elCount, 20) * 0.3;
    scores[t] = s;
  }
  const hint = sheetHint(sheetName);
  if (hint) scores[hint] = (scores[hint] || 0) + 3;
  return Object.entries(scores).sort((a, b) => b[1] - a[1]);
}

/** Most likely table key for a sheet, or null. */
export function guessTable(sheetName, headers) {
  const [best] = scoreTables(sheetName, headers || []);
  return best && best[1] >= 0.5 ? best[0] : null;
}

// ======================================================= lab-style values

const MISSING = new Set(['NSS', 'IS', 'INS', 'LNR', 'NR', 'NA', 'N/A', 'N.A.', 'NP', 'NS', 'DNR', 'NRS', 'X', '-', '--', '---', '—', '–', '*']);
const BDL_WORDS = new Set(['ND', 'BDL', '<DL', '<LOD', 'LOD', 'BLD', '<LOR', 'L.D.', 'N.D.']);

/**
 * Parse an assay cell. '<0.005' → below detection (flag '<', value by `mode`:
 * half = LOR/2, lor, zero, negative = −LOR); '>10000' → over limit (flag '>',
 * value = the limit); 'NSS', 'IS', 'LNR', 'NA', '-' → null with that flag;
 * negative numbers are the old "−LOR" way of writing below detection.
 * → {value, flag, lor?}; flag '?' = unreadable.
 */
export function parseLabValue(raw, { lor = null, mode = 'half' } = {}) {
  const bdl = (L) => {
    if (!isNum(L)) return { value: null, flag: '<', lor: null };
    const value = mode === 'lor' ? L : mode === 'zero' ? 0 : mode === 'negative' ? -L : L / 2;
    return { value, flag: '<', lor: L };
  };
  if (raw === null || raw === undefined) return { value: null, flag: null };
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { value: null, flag: null };
    return raw < 0 ? bdl(-raw) : { value: raw, flag: null };
  }
  if (typeof raw === 'boolean') return { value: null, flag: '?' };
  const s = String(raw).trim();
  if (!s) return { value: null, flag: null };
  let m = s.match(/^<\s*=?\s*([-+]?\d*[.,]?\d+(?:[eE][-+]?\d+)?)$/);
  if (m) return bdl(Math.abs(toNum(m[1])));
  m = s.match(/^>\s*=?\s*([-+]?\d*[.,]?\d+(?:[eE][-+]?\d+)?)$/);
  if (m) return { value: toNum(m[1]), flag: '>', limit: toNum(m[1]) };
  const up = s.toUpperCase().replace(/\s+/g, '');
  if (BDL_WORDS.has(up)) return bdl(isNum(lor) ? lor : null);
  if (MISSING.has(up)) return { value: null, flag: up };
  const n = toNum(s);
  if (n !== null) return n < 0 ? bdl(-n) : { value: n, flag: null };
  return { value: null, flag: '?' };
}

// ============================================================== the plan

export const IMPORT_ORDER = ['codes', 'crms', 'dispatch', 'collar', 'survey', 'lith', 'geotech', 'struct', 'phys', 'pxrf', 'samples', 'assays'];
/** Tables whose rows can be replaced per hole (delete rows not in the file). */
export const REPLACEABLE = new Set(['survey', 'lith', 'geotech', 'struct', 'phys', 'pxrf']);
const OVERLAP_TABLES = new Set(['lith', 'geotech']);

export const DEFAULT_OPTIONS = {
  emptyCells: 'keep', // 'keep' | 'clear'
  unknownCodes: 'reject', // 'reject' | 'addToList' | 'keep'
  replaceHoleIntervals: false,
  createMissingHoles: false,
  swapLonLat: false,
};

const EPS = 1e-6;
const normId = (v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, '');
const nk = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(round(v, 3)) : normId(v));
const keyOf = (table, rec) => TABLES[table].match.map((k) => nk(rec[k])).join('|');
const isBlank = (v) => v === null || v === undefined || v === '';

function same(a, b) {
  if (a === b) return true;
  if (isBlank(a) && isBlank(b)) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

const decimals = (raw) => {
  const s = typeof raw === 'number' ? String(raw) : String(raw ?? '').trim();
  const m = s.match(/\.(\d+)(?:e|$)/i);
  return m ? m[1].length : 0;
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Text / Excel value → 'YYYY-MM-DD' or null. Adds to util.toISODate: d/m/yyyy when
 * the first number is > 12, month names ('15-SEP-2026', 'Sep 15, 2026') parsed
 * without Date() so a UTC+8 browser does not shift the day, and range checks.
 */
export function coerceDate(raw) {
  if (typeof raw === 'number') return toISODate(raw);
  const s = String(raw).trim();
  const month = (name) => MONTHS[name.toLowerCase().slice(0, 3)] || null;
  let mm = s.match(/^(\d{1,2})[-\s./]([A-Za-z]{3,9})\.?[-\s./,]+(\d{2,4})\b/);
  if (mm && month(mm[2])) {
    const y = mm[3].length === 2 ? 2000 + Number(mm[3]) : Number(mm[3]);
    return `${y}-${pad2(month(mm[2]))}-${pad2(mm[1])}`;
  }
  mm = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (mm && month(mm[1])) return `${mm[3]}-${pad2(month(mm[1]))}-${pad2(mm[2])}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) return toISODate(Math.floor(Number(s))); // Excel serial as text
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m && Number(m[1]) > 12 && Number(m[2]) <= 12) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; // d/m/yyyy
  const iso = toISODate(s);
  if (!iso) return null;
  const [y, mo, d] = iso.split('-').map(Number);
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 1900 && y < 2200)) return null;
  return iso;
}

const TRUE_RX = /^(1|true|yes|y|x|✓|t|тийм|т)$/i;
const FALSE_RX = /^(0|false|no|n|f|үгүй|ү)$/i;

/** Row label for the preview: 'MU2601 12.00–14.50', 'S0001', 'MU2601 @ 50.00'. */
export function rowLabel(table, r) {
  const def = TABLES[table];
  const d = (v) => (isNum(v) ? v.toFixed(2) : '?');
  if (table === 'collar') return r.holeId ?? '';
  if (table === 'samples' || table === 'assays') return [r.sampleId, r.certificate].filter(Boolean).join(' · ');
  if (table === 'codes') return `${r.list}: ${r.code}`;
  if (table === 'crms') return `${r.code} · ${r.element}`;
  if (table === 'dispatch') return r.batchId ?? '';
  if (def.kind === 'interval' || table === 'pxrf') return `${r.holeId ?? ''} ${d(r.from)}–${isNum(r.to) ? d(r.to) : ''}${r.reading ? ` #${r.reading}` : ''}`.trim();
  if (def.kind === 'point') return `${r.holeId ?? ''} @ ${d(r.depth)}${r.type ? ` ${r.type}` : ''}`;
  return JSON.stringify(r).slice(0, 60);
}

/** Shared state across the sheets of one import (holes / samples / codes created earlier in it). */
export function newContext() {
  return { holes: new Map(), samples: new Map(), codes: new Map() };
}

/** Key fields a mapping must cover before a plan can run. */
export function missingKeyFields(table, mapping) {
  const def = TABLES[table];
  const mapped = new Set(Object.values(mapping || {}));
  const out = [];
  for (const k of def.match) {
    if (mapped.has(k)) continue;
    if (k === 'holeId' && (table === 'samples' || table === 'assays')) continue;
    if (table === 'assays' && k === 'certificate') continue; // file name used
    if (table === 'pxrf' && k === 'reading') continue;
    out.push(k);
  }
  if (table === 'samples' && !mapped.has('sampleId')) out.push('sampleId');
  if ((table === 'assays' || table === 'pxrf') && ![...mapped].some((v) => String(v).startsWith('values:'))) out.push('values');
  return [...new Set(out)];
}

/** Required (non-key) fields not mapped: new rows will fail without them. */
export function missingRequired(table, mapping) {
  const mapped = new Set(Object.values(mapping || {}));
  return importFields(table)
    .filter((f) => f.req && f.type !== 'calc' && !mapped.has(f.key))
    .map((f) => f.key)
    .filter((k) => !(k === 'holeId' && (table === 'samples' || table === 'assays')));
}

/**
 * Dry run. Nothing is written.
 * @param {object} a
 *   table, rows (objects keyed by header), mapping {header → target},
 *   options (see DEFAULT_OPTIONS; plus certificate/labJob for assays),
 *   rowNos (spreadsheet row numbers), fileName, sheetName, context (newContext()).
 * @returns plan {create, update, delete, unchanged, errors, warnings, unknownCodes,
 *   codeAdds, newHoles, ignoredCalc, summary, ...}
 */
export function planImport({ table, rows = [], mapping = {}, options = {}, rowNos, fileName = '', sheetName = '', context } = {}) {
  const def = TABLES[table];
  if (!def) throw new Error(`Unknown table ${table}`);
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const st = settings();
  const ctx = context || newContext();
  const hole = isHoleTable(table);
  const plan = {
    table,
    fileName,
    sheetName,
    options: opt,
    create: [],
    update: [],
    delete: [],
    unchanged: 0,
    errors: [],
    warnings: [],
    unknownCodes: {},
    codeAdds: [],
    newHoles: [],
    ignoredCalc: [],
    fatal: [],
    rowCount: rows.length,
    summary: null,
  };
  const errRows = new Set();
  const errHolesRaw = new Set(); // hole IDs (as typed) of rows with errors
  let curHoleRaw = null;
  const err = (rowNo, code, m, extra = {}) => {
    plan.errors.push({ rowNo, severity: 'error', code, ...m, ...extra });
    if (rowNo !== null && rowNo !== undefined) errRows.add(rowNo);
    if (extra.holeId) errHolesRaw.add(extra.holeId);
    else if (curHoleRaw) errHolesRaw.add(curHoleRaw);
  };
  const warn = (rowNo, code, m, extra = {}) => plan.warnings.push({ rowNo, severity: 'warn', code, ...m, ...extra });
  const tableName = def.short?.en || def.label.en;

  // ---- mapping sanity
  const mappedEntries = Object.entries(mapping).filter(([, t]) => t && t !== 'ignore');
  const mappedTargets = new Set(mappedEntries.map(([, t]) => t));
  const holeHeader = mappedEntries.find(([, t]) => t === 'holeId')?.[0] || null;
  for (const h of Object.keys(mapping)) {
    const c = calcHeader(table, h);
    if (c) plan.ignoredCalc.push({ header: h, field: c.key, label: c.label });
  }
  const missing = missingKeyFields(table, mapping);
  if (missing.length) {
    for (const k of missing) {
      const f = k === 'values' ? null : fieldOf(table, k);
      const nm = f ? f.label.en : 'element values';
      const nmMn = f ? f.label.mn : 'элементийн утга';
      plan.fatal.push({ severity: 'error', code: 'key-unmapped', field: k, ...M(`No column is mapped to “${nm}” — it is needed to match rows.`, `«${nmMn}» баганыг сонгоогүй байна — мөрүүдийг тулгахад шаардлагатай.`) });
    }
    plan.errors.push(...plan.fatal);
    plan.summary = summarize(plan, errRows, 0);
    return plan;
  }

  // ---- lookups
  const holeIdx = new Map();
  for (const h of storeHoles()) holeIdx.set(normId(h.holeId), { holeId: h.holeId, eoh: h.eoh, locked: !!h.locked });
  const findHole = (id) => ctx.holes.get(normId(id)) || holeIdx.get(normId(id)) || null;

  const codeCache = new Map();
  const codeLookup = (list) => {
    if (!codeCache.has(list)) {
      const m = new Map();
      for (const c of codeMap(list).values()) m.set(String(c.code).toUpperCase(), c);
      for (const c of ctx.codes.get(list) || []) if (!m.has(String(c).toUpperCase())) m.set(String(c).toUpperCase(), { code: c, pending: true });
      codeCache.set(list, m);
    }
    return codeCache.get(list);
  };

  const existing = storeRows(table);
  const exIdx = new Map();
  for (const r of existing) exIdx.set(keyOf(table, r), r);
  const sampleIdx = new Map();
  if (table === 'samples' || table === 'assays') {
    for (const s of storeRows('samples')) sampleIdx.set(normId(s.sampleId), s);
    for (const [k, s] of ctx.samples) if (!sampleIdx.has(k)) sampleIdx.set(k, s);
  }

  const fileKeys = new Map();
  const newHoleSet = new Map();
  const touched = []; // {entry, kind, final} for depth validations
  const lonlatSwaps = [];
  const unknownKeep = new Map();
  const certDefault = table === 'assays' ? opt.certificate || baseName(fileName) || null : null;

  // ---- rows
  for (let i = 0; i < rows.length; i++) {
    const src = rows[i] || {};
    const rowNo = rowNos?.[i] ?? i + 2;
    curHoleRaw = holeHeader && nonEmpty(src[holeHeader]) ? String(src[holeHeader]).trim() : null;
    const rec = {};
    const empties = new Set();
    const values = {};
    const flags = {};
    const emptyValues = new Set();
    let bad = false;
    const fail = (code, m, extra) => {
      err(rowNo, code, m, extra);
      bad = true;
    };

    for (const [h, target] of mappedEntries) {
      const raw = src[h];
      const empty = !nonEmpty(raw);
      if (target.startsWith('values:')) {
        const k = target.slice(7);
        if (empty) {
          emptyValues.add(k);
          continue;
        }
        const pv = parseLabValue(raw, { lor: toNum(st.elements?.[k]?.lor), mode: st.belowDetection });
        if (pv.flag === '?') {
          fail('number', M(`${h}: “${raw}” is not a number`, `${h}: «${raw}» тоо биш байна`), { field: k, header: h });
          continue;
        }
        values[k] = pv.value;
        if (pv.flag) flags[k] = pv.flag;
        continue;
      }
      const f = fieldOf(table, target);
      if (!f || f.type === 'calc') continue;
      if (empty) {
        empties.add(f.key);
        continue;
      }
      const lbl = f.label.en;
      const lblMn = f.label.mn;
      switch (f.type) {
        case 'num':
        case 'pct':
        case 'int': {
          const n = toNum(raw);
          if (n === null) {
            fail('number', M(`${lbl}: “${raw}” is not a number`, `${lblMn}: «${raw}» тоо биш байна`), { field: f.key, header: h });
            break;
          }
          if (f.type === 'int' && !Number.isInteger(n)) {
            fail('number', M(`${lbl}: “${raw}” must be a whole number`, `${lblMn}: «${raw}» бүхэл тоо байх ёстой`), { field: f.key, header: h });
            break;
          }
          if (f.type === 'pct' && (n < 0 || n > 100)) {
            fail('pct-range', M(`${lbl} = ${n}: a percentage must be between 0 and 100`, `${lblMn} = ${n}: хувь 0–100 хооронд байх ёстой`), { field: f.key, header: h });
            break;
          }
          rec[f.key] = n;
          if ((f.key === 'lon' || f.key === 'lat') && decimals(raw) > 8) rec[`__dec_${f.key}`] = true;
          break;
        }
        case 'date': {
          const d = coerceDate(raw);
          if (!d) fail('date', M(`${lbl}: “${raw}” is not a date`, `${lblMn}: «${raw}» огноо биш байна`), { field: f.key, header: h });
          else rec[f.key] = d;
          break;
        }
        case 'bool': {
          if (typeof raw === 'boolean') rec[f.key] = raw;
          else if (typeof raw === 'number') rec[f.key] = raw !== 0;
          else if (TRUE_RX.test(String(raw).trim())) rec[f.key] = true;
          else if (FALSE_RX.test(String(raw).trim())) rec[f.key] = false;
          else fail('bool', M(`${lbl}: “${raw}” is not yes/no`, `${lblMn}: «${raw}» тийм/үгүй биш`), { field: f.key, header: h });
          break;
        }
        case 'code': {
          const s = String(raw).trim();
          const hit = codeLookup(f.list).get(s.toUpperCase());
          if (hit) {
            rec[f.key] = hit.code;
            if (hit.warn) warn(rowNo, 'code-warn', M(`${lbl} code ${hit.code} is marked “do not use” in the ${f.list} list`, `${lblMn}: ${hit.code} кодыг ${f.list} жагсаалтад «бүү ашигла» гэж тэмдэглэсэн`), { field: f.key, code2: hit.code });
            if (hit.inactive) warn(rowNo, 'code-inactive', M(`${lbl} code ${hit.code} is inactive in the ${f.list} list`, `${lblMn}: ${hit.code} код ${f.list} жагсаалтад идэвхгүй`), { field: f.key });
            break;
          }
          const code = s.toUpperCase();
          const u = (plan.unknownCodes[f.list] ||= {});
          u[code] = (u[code] || 0) + 1;
          if (opt.unknownCodes === 'reject') {
            fail('code-unknown', M(`${lbl}: code “${s}” is not in the ${f.list} list`, `${lblMn}: «${s}» код ${f.list} жагсаалтад байхгүй`), { field: f.key, list: f.list, value: code });
          } else {
            rec[f.key] = code;
            if (opt.unknownCodes === 'keep') unknownKeep.set(`${f.list}|${code}`, (unknownKeep.get(`${f.list}|${code}`) || 0) + 1);
          }
          break;
        }
        case 'note': {
          const s = String(raw).replace(/^\s+|\s+$/g, '');
          const max = toNum(st.commentsMax) ?? 500;
          const soft = toNum(st.commentsSoft);
          if (s.length > max) fail('comment-long', M(`${lbl} is ${s.length} characters — the limit is ${max} (MX Deposit rejects longer text). Shorten it in the file.`, `${lblMn} ${s.length} тэмдэгт — хязгаар ${max} (MX Deposit илүү уртыг хүлээж авахгүй). Файлд богиносгоно уу.`), { field: f.key, length: s.length });
          else {
            if (soft && s.length > soft) warn(rowNo, 'comment-soft', M(`${lbl} is ${s.length} characters (house style ≤ ${soft})`, `${lblMn} ${s.length} тэмдэгт (дотоод журам ≤ ${soft})`), { field: f.key, length: s.length });
            rec[f.key] = s;
          }
          break;
        }
        default: {
          let s = typeof raw === 'number' ? String(raw) : String(raw).trim();
          if (table === 'codes' && f.key === 'list') s = s.toUpperCase();
          if (f === HOLE_FIELD || f.key === 'holeId') rec.holeId = s;
          else rec[f.key] = s;
        }
      }
    }
    if (bad) continue;

    // ---- per-table value rules
    if (table === 'assays' && !mappedTargets.has('certificate')) {
      if (certDefault) rec.certificate = certDefault;
      if (opt.labJob && !rec.labJob) rec.labJob = opt.labJob;
    }
    if (table === 'collar') {
      const hasLon = isNum(rec.lon);
      const hasLat = isNum(rec.lat);
      if (hasLon && hasLat) {
        const { lon, lat } = rec;
        const mnSwap = lat >= 85 && lat <= 125 && lon >= 38 && lon <= 55; // Mongolia: lon 87–120, lat 41–52
        const hardSwap = Math.abs(lat) > 90 && Math.abs(lon) <= 90;
        if (mnSwap || hardSwap) {
          if (opt.swapLonLat) {
            rec.lon = lat;
            rec.lat = lon;
            warn(rowNo, 'lonlat-swapped-fixed', M(`Longitude/latitude were swapped — fixed (lon ${lat}, lat ${lon})`, `Уртраг/өргөрөг солигдсон байсныг зассан (уртраг ${lat}, өргөрөг ${lon})`), { holeId: rec.holeId });
          } else {
            lonlatSwaps.push(rowNo);
            delete rec.lon;
            delete rec.lat;
            delete rec.__dec_lon;
            delete rec.__dec_lat;
            warn(rowNo, 'lonlat-swapped', M(`Longitude ${lon} / latitude ${lat} look swapped (Mongolia: lon ≈ 87–120, lat ≈ 41–52) — not imported unless you apply the swap`, `Уртраг ${lon} / өргөрөг ${lat} солигдсон бололтой (Монгол: уртраг ≈ 87–120, өргөрөг ≈ 41–52) — солихыг зөвшөөрөхгүй бол оруулахгүй`), { holeId: rec.holeId, fix: { option: 'swapLonLat', value: true } });
          }
        }
      }
      if (isNum(rec.lat) && Math.abs(rec.lat) > 90) {
        err(rowNo, 'lonlat-range', M(`Latitude ${rec.lat} is outside −90…90`, `Өргөрөг ${rec.lat} −90…90-ээс гадуур`));
        continue;
      }
      if (isNum(rec.lon) && Math.abs(rec.lon) > 180) {
        err(rowNo, 'lonlat-range', M(`Longitude ${rec.lon} is outside −180…180`, `Уртраг ${rec.lon} −180…180-ээс гадуур`));
        continue;
      }
      for (const k of ['lon', 'lat']) {
        if (rec[`__dec_${k}`]) {
          rec[k] = round(rec[k], 8);
          warn(rowNo, 'lonlat-rounded', M(`${k === 'lon' ? 'Longitude' : 'Latitude'} rounded to 8 decimals (MX Deposit limit)`, `${k === 'lon' ? 'Уртраг' : 'Өргөрөг'}-ийг 8 оронтой болгож бөөрөнхийлсөн (MX Deposit-ийн хязгаар)`));
        }
        delete rec[`__dec_${k}`];
      }
      if (isNum(rec.east) && isNum(rec.north) && Math.abs(rec.east) <= 180 && Math.abs(rec.north) <= 90) {
        warn(rowNo, 'en-degrees', M('Easting/Northing look like longitude/latitude in degrees — check the columns', 'Easting/Northing нь градусаар өгсөн уртраг/өргөрөг шиг харагдаж байна — баганаа шалгана уу'));
      }
    }
    for (const k of Object.keys(rec)) if (k.startsWith('__dec_')) delete rec[k];

    const rangeCheck = (k, lo, hi, en, mn) => {
      if (isNum(rec[k]) && (rec[k] < lo || rec[k] > hi)) {
        err(rowNo, 'range', M(`${en} ${rec[k]} is outside ${lo}…${hi}`, `${mn} ${rec[k]} нь ${lo}…${hi}-ээс гадуур`), { field: k });
        return false;
      }
      return true;
    };
    if (table === 'collar' || table === 'survey') {
      if (!rangeCheck('dip', -90, 90, 'Dip', 'Налуу') || !rangeCheck('azimuth', 0, 360, 'Azimuth', 'Азимут')) continue;
    }
    if (table === 'struct') {
      if (!rangeCheck('alpha', 0, 90, 'Alpha', 'Альфа') || !rangeCheck('beta', 0, 360, 'Beta', 'Бета')) continue;
    }
    for (const k of ['from', 'to', 'depth', 'eoh']) {
      if (isNum(rec[k]) && rec[k] < 0) {
        err(rowNo, 'negative', M(`${k} ${rec[k]} is negative`, `${k} ${rec[k]} сөрөг байна`), { field: k });
        bad = true;
        break;
      }
    }
    if (bad) continue;

    // ---- hole
    let holeInfo = null;
    if (hole) {
      if (table === 'collar') {
        if (!rec.holeId) {
          err(rowNo, 'hole-missing', M('Hole ID is empty', 'Цооногийн дугаар хоосон'));
          continue;
        }
        const ex = findHole(rec.holeId);
        if (ex && ex.holeId !== rec.holeId) {
          warn(rowNo, 'hole-case', M(`Hole “${rec.holeId}” matched existing hole ${ex.holeId}`, `«${rec.holeId}» цоонгийг байгаа ${ex.holeId}-тэй тулгасан`));
          rec.holeId = ex.holeId;
        }
        if (ex?.locked) {
          err(rowNo, 'locked', M(`Hole ${ex.holeId} is locked — unlock it on the hole page to change it`, `${ex.holeId} цооног түгжээтэй — өөрчлөхийн тулд цооногийн хуудсанд түгжээг тайлна уу`), { holeId: ex.holeId });
          continue;
        }
      } else {
        if (!rec.holeId && (table === 'samples' || table === 'assays') && rec.sampleId) {
          const s = sampleIdx.get(normId(rec.sampleId));
          if (s) rec.holeId = s.holeId;
        }
        if (!rec.holeId && table === 'assays' && opt.allowNoHole) rec.holeId = '';
        if (rec.holeId === undefined || rec.holeId === null || (rec.holeId === '' && !(table === 'assays' && opt.allowNoHole))) {
          const why = table === 'assays' ? M(`Sample ${rec.sampleId ?? '?'} is not in the samples table and no hole is given`, `${rec.sampleId ?? '?'} дээж дээжийн хүснэгтэд алга, цооног ч заагаагүй`) : M('Hole ID is empty', 'Цооногийн дугаар хоосон');
          err(rowNo, table === 'assays' ? 'sample-not-found' : 'hole-missing', why);
          continue;
        }
        if (rec.holeId !== '') {
          holeInfo = findHole(rec.holeId);
          if (!holeInfo) {
            if (opt.createMissingHoles) {
              const k = normId(rec.holeId);
              if (!newHoleSet.has(k)) {
                const nh = { holeId: rec.holeId, eoh: null, locked: false, pending: true, isNew: true };
                newHoleSet.set(k, nh);
                ctx.holes.set(k, nh);
                plan.newHoles.push(rec.holeId);
              }
              holeInfo = newHoleSet.get(k);
            } else {
              err(rowNo, 'hole-not-found', M(`Hole ${rec.holeId} is not in the collar table (import collars first, or turn on “Create missing holes”)`, `${rec.holeId} цооног collar хүснэгтэд алга (эхлээд collar импортлох, эсвэл «Байхгүй цоонгийг үүсгэх»-ийг асаах)`), { holeId: rec.holeId });
              continue;
            }
          } else if (holeInfo.holeId !== rec.holeId) {
            warn(rowNo, 'hole-case', M(`Hole “${rec.holeId}” matched existing hole ${holeInfo.holeId}`, `«${rec.holeId}» цоонгийг байгаа ${holeInfo.holeId}-тэй тулгасан`));
            rec.holeId = holeInfo.holeId;
          }
          if (holeInfo.locked) {
            err(rowNo, 'locked', M(`Hole ${holeInfo.holeId} is locked — unlock it on the hole page to import into it`, `${holeInfo.holeId} цооног түгжээтэй — импортлохын тулд цооногийн хуудсанд түгжээг тайлна уу`), { holeId: holeInfo.holeId });
            continue;
          }
        }
      }
    }

    // ---- duplicates in the file
    const key = keyOf(table, rec);
    if (fileKeys.has(key)) {
      err(rowNo, 'dup', M(`Same ${TABLES[table].match.filter((k) => k !== 'holeId').join(' + ') || 'key'} as row ${fileKeys.get(key)} (${rowLabel(table, rec)})`, `${fileKeys.get(key)}-р мөртэй ижил түлхүүр (${rowLabel(table, rec)})`));
      continue;
    }
    fileKeys.set(key, rowNo);

    // ---- match
    const ex = exIdx.get(key);
    if (ex) {
      const changes = {};
      const patch = { id: ex.id };
      const keyFields = new Set(def.match);
      for (const [, target] of mappedEntries) {
        if (target.startsWith('values:') || target === 'holeId' || keyFields.has(target)) continue;
        const f = fieldOf(table, target);
        if (!f || f.type === 'calc') continue;
        if (Object.prototype.hasOwnProperty.call(rec, f.key)) {
          if (!same(ex[f.key], rec[f.key])) {
            changes[f.key] = [ex[f.key] ?? null, rec[f.key]];
            patch[f.key] = rec[f.key];
          }
        } else if (empties.has(f.key) && opt.emptyCells === 'clear' && !isBlank(ex[f.key])) {
          if (f.req) {
            warn(rowNo, 'clear-required', M(`${f.label.en} is empty in the file but required — existing value kept`, `${f.label.mn} файлд хоосон ч заавал бөглөх талбар — байгаа утгыг үлдээв`), { field: f.key });
            continue;
          }
          changes[f.key] = [ex[f.key], null];
          patch[f.key] = null;
        }
      }
      if (table === 'assays' || table === 'pxrf') {
        const oldV = ex.values || {};
        const oldF = ex.flags || {};
        const nv = { ...oldV };
        const nf = { ...oldF };
        let vch = false;
        for (const [k, v] of Object.entries(values)) {
          if (!same(oldV[k], v)) {
            changes[`values.${k}`] = [oldV[k] ?? null, v];
            vch = true;
          }
          nv[k] = v;
          if (flags[k]) {
            if (oldF[k] !== flags[k]) {
              changes[`flags.${k}`] = [oldF[k] ?? null, flags[k]];
              vch = true;
            }
            nf[k] = flags[k];
          } else if (oldF[k]) {
            changes[`flags.${k}`] = [oldF[k], null];
            delete nf[k];
            vch = true;
          }
        }
        if (opt.emptyCells === 'clear') {
          for (const k of emptyValues) {
            if (k in oldV && !isBlank(oldV[k])) {
              changes[`values.${k}`] = [oldV[k], null];
              delete nv[k];
              delete nf[k];
              vch = true;
            }
          }
        }
        if (vch) {
          patch.values = nv;
          patch.flags = nf;
        }
      }
      let move = null;
      if ((table === 'samples' || table === 'assays') && rec.holeId !== undefined && rec.holeId !== ex.holeId && rec.holeId !== '') {
        changes.holeId = [ex.holeId, rec.holeId];
        move = rec.holeId;
      }
      const final = { ...ex, ...patch, holeId: move || ex.holeId };
      if (!Object.keys(changes).length) {
        plan.unchanged++;
        touched.push({ kind: 'same', rowNo, entry: null, final: ex, ex });
        continue;
      }
      const entry = { id: ex.id, holeId: ex.holeId, rowNo, label: rowLabel(table, final), changes, patch };
      if (table === 'samples') entry.sampleId = ex.sampleId;
      if (move) entry.moveTo = move;
      plan.update.push(entry);
      touched.push({ kind: 'update', rowNo, entry, final, ex });
    } else {
      // new row: required fields
      let missingReq = null;
      for (const f of def.fields) {
        if (!f.req || f.type === 'calc' || f.key === 'holeId') continue;
        if (isBlank(rec[f.key])) {
          missingReq = f;
          break;
        }
      }
      if (missingReq) {
        err(rowNo, 'required', M(`${missingReq.label.en} is required for a new row (${rowLabel(table, rec)})`, `Шинэ мөрөнд ${missingReq.label.mn} заавал шаардлагатай (${rowLabel(table, rec)})`), { field: missingReq.key });
        continue;
      }
      const row = { ...rec };
      if (table === 'assays' || table === 'pxrf') {
        row.values = values;
        row.flags = flags;
        if (!Object.keys(values).length) {
          err(rowNo, 'no-values', M(`No values in this row (${rowLabel(table, rec)})`, `Энэ мөрөнд утга алга (${rowLabel(table, rec)})`));
          continue;
        }
      }
      if (hole && table !== 'collar') delete row.holeId;
      const entry = { holeId: hole ? rec.holeId : undefined, rowNo, label: rowLabel(table, rec), row };
      plan.create.push(entry);
      touched.push({ kind: 'create', rowNo, entry, final: { ...rec, holeId: rec.holeId } });
    }
  }

  // ---- depth checks on the final state of each touched row
  const holeEoh = (id) => {
    if (table === 'collar') return null;
    const h = findHole(id);
    return h && isNum(h.eoh) ? h.eoh : null;
  };
  const dropEntry = (t) => {
    if (!t.entry) return;
    const list = t.kind === 'create' ? plan.create : plan.update;
    const i = list.indexOf(t.entry);
    if (i >= 0) list.splice(i, 1);
    t.dropped = true;
  };
  const q = (v) => (isNum(v) ? v.toFixed(2) : '?');
  for (const t of touched) {
    if (t.kind === 'same') continue;
    const r = t.final;
    const hasTo = def.kind === 'interval' || table === 'pxrf';
    if (hasTo && isNum(r.from) && isNum(r.to) && r.from >= r.to - EPS) {
      err(t.rowNo, 'from-to', M(`From ${q(r.from)} must be less than To ${q(r.to)}`, `Эхлэл ${q(r.from)} нь Төгсгөл ${q(r.to)}-оос бага байх ёстой`), { holeId: r.holeId });
      dropEntry(t);
      continue;
    }
    const eoh = holeEoh(r.holeId);
    const deepest = hasTo ? (isNum(r.to) ? r.to : r.from) : r.depth;
    if (isNum(eoh) && isNum(deepest) && deepest > eoh + 0.001) {
      warn(t.rowNo, 'beyond-eoh', M(`${rowLabel(table, r)} goes past the end of hole (EOH ${q(eoh)} m)`, `${rowLabel(table, r)} цооногийн эцсийн гүнээс (EOH ${q(eoh)} м) хэтэрсэн`), { holeId: r.holeId });
    }
    if (table === 'geotech' && isNum(r.from) && isNum(r.to)) {
      const run = r.to - r.from;
      if (isNum(r.recovered) && r.recovered > run + 0.01) warn(t.rowNo, 'recovery', M(`Recovered ${q(r.recovered)} m is more than the run length ${q(run)} m`, `Авсан ${q(r.recovered)} м нь рейсийн урт ${q(run)} м-ээс их`), { holeId: r.holeId });
      if (isNum(r.rqd) && r.rqd > (isNum(r.recovered) ? r.recovered : run) + 0.01) warn(t.rowNo, 'rqd', M(`RQD ${q(r.rqd)} m is more than the recovered length`, `RQD ${q(r.rqd)} м нь авсан уртаас их`), { holeId: r.holeId });
    }
    if (table === 'samples' && isNum(r.from) && isNum(r.to) && (!r.sampleType || r.sampleType === 'PRIM')) {
      const len = r.to - r.from;
      const lo = toNum(st.minSampleLen);
      const hi = toNum(st.maxSampleLen);
      if ((isNum(lo) && len < lo - EPS) || (isNum(hi) && len > hi + EPS)) warn(t.rowNo, 'sample-length', M(`Sample length ${q(len)} m is outside ${lo}–${hi} m`, `Дээжийн урт ${q(len)} м нь ${lo}–${hi} м-ээс гадуур`), { holeId: r.holeId });
    }
  }

  // ---- replace: existing rows of the affected holes that are not in the file
  curHoleRaw = null;
  const holesWithErrors = new Set([...errHolesRaw].map((h) => findHole(h)?.holeId || h));
  const deletedIds = new Set();
  if (opt.replaceHoleIntervals && REPLACEABLE.has(table)) {
    const fileHoles = new Set(touched.map((t) => t.final.holeId));
    const matchedIds = new Set(touched.filter((t) => t.ex).map((t) => t.ex.id));
    for (const h of [...fileHoles].sort(natCmp)) {
      if (holesWithErrors.has(h)) {
        warn(null, 'replace-skipped', M(`Hole ${h}: existing rows kept because some of its rows in the file have errors`, `${h} цооног: файлд алдаатай мөр байгаа тул байгаа мөрүүдийг устгаагүй`), { holeId: h });
        continue;
      }
      if (findHole(h)?.locked) continue;
      for (const r of storeRows(table, h)) {
        if (matchedIds.has(r.id)) continue;
        plan.delete.push({ id: r.id, holeId: h, label: rowLabel(table, r), row: r });
        deletedIds.add(r.id);
      }
    }
  } else if (opt.replaceHoleIntervals && !REPLACEABLE.has(table)) {
    warn(null, 'replace-na', M(`“Replace hole intervals” does not apply to ${tableName}`, `«Цооногийн интервалыг солих» нь ${def.label.mn}-д хамаарахгүй`));
  }

  // ---- overlaps (final state = existing − deleted − updated originals + file rows)
  if (OVERLAP_TABLES.has(table) || table === 'samples') {
    const byHole = new Map();
    const push = (h, item) => {
      if (!byHole.has(h)) byHole.set(h, []);
      byHole.get(h).push(item);
    };
    const fromFile = new Set();
    for (const t of touched) {
      if (t.dropped || t.kind === 'same') continue;
      fromFile.add(t);
    }
    const replacedIds = new Set([...fromFile].filter((t) => t.ex).map((t) => t.ex.id));
    const holesInFile = new Set([...fromFile].map((t) => t.final.holeId));
    for (const h of holesInFile) {
      for (const r of storeRows(table, h)) {
        if (deletedIds.has(r.id) || replacedIds.has(r.id)) continue;
        push(h, { r, file: null });
      }
    }
    for (const t of fromFile) push(t.final.holeId, { r: t.final, file: t });
    const prim = (r) => table !== 'samples' || !r.sampleType || r.sampleType === 'PRIM';
    for (const [h, list] of byHole) {
      const s = list.filter((x) => isNum(x.r.from) && isNum(x.r.to) && prim(x.r)).sort((a, b) => a.r.from - b.r.from || a.r.to - b.r.to);
      const flagged = new Set();
      for (let i = 0; i < s.length; i++) {
        for (let j = i + 1; j < s.length && s[j].r.from < s[i].r.to - EPS; j++) {
          const a = s[i];
          const b = s[j];
          if (!a.file && !b.file) continue;
          const culprit = !a.file ? b : !b.file ? a : a.file.rowNo > b.file.rowNo ? a : b;
          const other = culprit === a ? b : a;
          if (flagged.has(culprit)) continue;
          flagged.add(culprit);
          const where = other.file ? M(`row ${other.file.rowNo}`, `${other.file.rowNo}-р мөр`) : M(`existing ${q(other.r.from)}–${q(other.r.to)}`, `байгаа ${q(other.r.from)}–${q(other.r.to)}`);
          const hint = !other.file && REPLACEABLE.has(table) && !opt.replaceHoleIntervals ? M(' — turn on “Replace hole intervals” if the file is the corrected log', ' — файл нь засварласан лог бол «Цооногийн интервалыг солих»-ийг асаана уу') : M('', '');
          if (table === 'samples') {
            warn(culprit.file.rowNo, 'overlap', M(`${rowLabel(table, culprit.r)} overlaps ${where.message}`, `${rowLabel(table, culprit.r)} нь ${where.mn}-тэй давхацсан`), { holeId: h });
          } else {
            err(culprit.file.rowNo, 'overlap', M(`${rowLabel(table, culprit.r)} overlaps ${where.message}${hint.message}`, `${rowLabel(table, culprit.r)} нь ${where.mn}-тэй давхацсан${hint.mn}`), { holeId: h });
            dropEntry(culprit.file);
          }
        }
      }
    }
  }

  // ---- unknown codes summary
  if (opt.unknownCodes === 'addToList') {
    for (const [list, m] of Object.entries(plan.unknownCodes)) {
      for (const code of Object.keys(m)) {
        plan.codeAdds.push({ list, code, count: m[code] });
        if (!ctx.codes.has(list)) ctx.codes.set(list, new Set());
        ctx.codes.get(list).add(code);
      }
    }
    if (plan.codeAdds.length) warn(null, 'codes-added', M(`${plan.codeAdds.length} new code(s) will be added to the code lists (marked “verify”): ${plan.codeAdds.map((c) => `${c.list}:${c.code}`).join(', ')}`, `${plan.codeAdds.length} шинэ код жагсаалтад нэмэгдэнэ («шалгах» тэмдэгтэй): ${plan.codeAdds.map((c) => `${c.list}:${c.code}`).join(', ')}`));
  }
  for (const [k, n] of unknownKeep) {
    const [list, code] = k.split('|');
    warn(null, 'code-kept', M(`Code ${code} is not in the ${list} list — imported as-is in ${n} row(s); it will show on the Validation page`, `${code} код ${list} жагсаалтад алга — ${n} мөрөнд байгаагаар нь орсон; «Шалгалт» хуудсанд харагдана`), { list, value: code });
  }
  if (plan.ignoredCalc.length) {
    warn(null, 'calc-ignored', M(`Calculated in ORD — ignored: ${plan.ignoredCalc.map((c) => c.header).join(', ')}`, `ORD өөрөө тооцдог тул орхив: ${plan.ignoredCalc.map((c) => c.header).join(', ')}`));
  }

  // ---- context for later sheets of the same import
  if (table === 'collar') {
    for (const c of plan.create) ctx.holes.set(normId(c.row.holeId), { holeId: c.row.holeId, eoh: c.row.eoh ?? null, locked: false, pending: true });
    for (const u of plan.update) {
      const cur = findHole(u.holeId);
      ctx.holes.set(normId(u.holeId), { holeId: u.holeId, eoh: 'eoh' in u.patch ? u.patch.eoh : cur?.eoh ?? null, locked: !!cur?.locked, pending: true });
    }
  }
  if (table === 'samples') {
    for (const c of plan.create) ctx.samples.set(normId(c.row.sampleId), { sampleId: c.row.sampleId, holeId: c.holeId });
    for (const u of plan.update) if (u.moveTo) ctx.samples.set(normId(u.sampleId), { sampleId: u.sampleId, holeId: u.moveTo });
  }
  if (table === 'codes') {
    for (const c of plan.create) {
      if (!ctx.codes.has(c.row.list)) ctx.codes.set(c.row.list, new Set());
      ctx.codes.get(c.row.list).add(c.row.code);
    }
  }

  plan.summary = summarize(plan, errRows, lonlatSwaps.length);
  return plan;
}

function summarize(plan, errRows, lonlatSwaps = 0) {
  const holes = new Set();
  for (const c of plan.create) if (c.holeId) holes.add(c.holeId);
  for (const u of plan.update) {
    if (u.holeId) holes.add(u.holeId);
    if (u.moveTo) holes.add(u.moveTo);
  }
  for (const d of plan.delete) if (d.holeId) holes.add(d.holeId);
  for (const h of plan.newHoles) holes.add(h);
  if (plan.table === 'collar') for (const c of plan.create) holes.add(c.row.holeId);
  const groups = {};
  for (const e of plan.errors) groups[e.code] = (groups[e.code] || 0) + 1;
  const wgroups = {};
  for (const w of plan.warnings) wgroups[w.code] = (wgroups[w.code] || 0) + 1;
  return {
    rows: plan.rowCount,
    create: plan.create.length,
    update: plan.update.length,
    unchanged: plan.unchanged,
    delete: plan.delete.length,
    errors: plan.errors.length,
    errorRows: errRows.size,
    warnings: plan.warnings.length,
    newHoles: plan.newHoles.length,
    codeAdds: plan.codeAdds.length,
    lonlatSwaps,
    writes: plan.create.length + plan.update.length + plan.delete.length + plan.newHoles.length + plan.codeAdds.length,
    holes: [...holes].sort(natCmp),
    errorGroups: groups,
    warningGroups: wgroups,
    fatal: plan.fatal.length > 0,
  };
}

/** Plan several sheets (an MX workbook) in dependency order, sharing holes/samples/codes. */
export function planWorkbook(items, options = {}) {
  const ctx = newContext();
  const order = (t) => {
    const i = IMPORT_ORDER.indexOf(t);
    return i < 0 ? 99 : i;
  };
  return [...items]
    .sort((a, b) => order(a.table) - order(b.table))
    .map((it) => planImport({ ...it, options: { ...options, ...(it.options || {}) }, context: ctx }));
}

// ============================================================== commit

/** mutate() operations for a plan. `seen` de-duplicates code/hole creation across plans. */
export function planOps(plan, seen = { codes: new Set(), holes: new Set() }) {
  const ops = [];
  const table = plan.table;
  const hole = isHoleTable(table);
  for (const c of plan.codeAdds || []) {
    const id = `${c.list}:${c.code}`;
    if (seen.codes.has(id)) continue;
    seen.codes.add(id);
    ops.push({ type: 'upsert', table: 'codes', row: { id, list: c.list, code: c.code, meaning: null, meaningMn: null, group: 'Added on import', verify: true, order: 900 } });
  }
  for (const h of plan.newHoles || []) {
    const k = normId(h);
    if (seen.holes.has(k)) continue;
    seen.holes.add(k);
    ops.push({ type: 'upsert', table: 'collar', holeId: h, row: { holeId: h, status: 'PLN', remarks: `Created by import${plan.fileName ? ` of ${plan.fileName}` : ''} — add coordinates` } });
  }
  for (const d of plan.delete) ops.push({ type: 'delete', table, holeId: d.holeId, id: d.id });
  for (const c of plan.create) ops.push({ type: 'upsert', table, holeId: hole ? c.holeId : undefined, row: { ...c.row } });
  for (const u of plan.update) {
    if (u.moveTo) {
      const cur = storeRows(table, u.holeId).find((r) => r.id === u.id) || {};
      const { _t, _u, _d, ...rest } = cur;
      ops.push({ type: 'delete', table, holeId: u.holeId, id: u.id });
      ops.push({ type: 'upsert', table, holeId: u.moveTo, row: { ...rest, ...u.patch, id: u.id, holeId: u.moveTo } });
    } else {
      ops.push({ type: 'upsert', table, holeId: hole ? u.holeId : undefined, row: { ...u.patch } });
    }
  }
  return ops;
}

const tableShort = (t) => TABLES[t]?.short?.en || TABLES[t]?.label?.en || t;

export function planLabel(plans, fileName) {
  const list = Array.isArray(plans) ? plans : [plans];
  const parts = list
    .filter((p) => p.summary && p.summary.writes)
    .map((p) => {
      const s = p.summary;
      const bits = [`${s.create} new`, `${s.update} updated`];
      if (s.delete) bits.push(`${s.delete} deleted`);
      return `${tableShort(p.table)}: ${bits.join(', ')}`;
    });
  return `Import ${fileName || list[0]?.fileName || 'data'} → ${parts.join('; ') || 'no changes'}`;
}

/** Write one plan as one undoable batch. Returns the mutate() result plus {label, holes}. */
export function commitImport(plan, { label, fileName } = {}) {
  return commitWorkbook([plan], { label, fileName });
}

/** Write several plans (an MX workbook) as ONE undoable batch. */
export function commitWorkbook(plans, { label, fileName } = {}) {
  const seen = { codes: new Set(), holes: new Set() };
  const ops = [];
  for (const p of plans) {
    if (p.fatal?.length) continue;
    ops.push(...planOps(p, seen));
  }
  const lbl = label || planLabel(plans, fileName);
  const res = mutate(ops, { label: lbl });
  const holes = [...new Set(plans.flatMap((p) => p.summary?.holes || []))].sort(natCmp);
  return { ...res, label: lbl, holes, ops: ops.length };
}

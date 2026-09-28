// Exports, each bundled into one ZIP:
//  - Leapfrog Geo: one CSV per table with ORD field keys as headers, depths 3 dp,
//    calculated columns included (true dip / dip direction, recovery %, rock name),
//    samples joined with their merged assay values.
//  - MX Deposit: CSVs with MX column headers that MX will accept first time —
//    no calculated columns, interval gaps filled with 'Not measured' rows,
//    codes not yet in the MX lists mapped to their fallbacks, lon/lat ≤ 8 dp —
//    plus export_report.md listing every change and every row MX would reject.
//  - Backup: the full project as JSON (exportProjectJSON), restorable with merge.

import { TABLES } from './schema.js';
import { S, rows, holes, hole, codeMap, settings, assayValues, exportProjectJSON } from './store.js';
import './structure.js'; // registers S.ctx.orient → true dip / dip direction
import { toCSV } from './csv.js';
import { zipFiles, unzip } from './zip.js';
import { gaps, overlaps } from './intervals.js';
import { isNum, round, todayISO, natCmp, dateTime, toNum } from './util.js';

const DEPTH_KEYS = new Set(['from', 'to', 'depth']);
const NOT_MEASURED = 'Not measured';

function selectHoleIds(holeIds) {
  const all = holes().map((h) => h.holeId);
  if (!holeIds) return all;
  const want = new Set(holeIds);
  return all.filter((h) => want.has(h));
}

function calcValue(f, r) {
  try {
    return f.calc(r, S.ctx);
  } catch {
    return null;
  }
}

const num = (v, dp = 10) => (isNum(v) ? String(round(v, dp)) : '');

// ================================================================ Leapfrog

function leapValue(f, r) {
  const v = f.type === 'calc' ? calcValue(f, r) : r[f.key];
  if (v === null || v === undefined || v === '') return '';
  if (DEPTH_KEYS.has(f.key)) return isNum(v) ? v.toFixed(3) : '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (isNum(v)) return f.type === 'calc' ? num(v, Math.max(3, f.dp ?? 3)) : num(v);
  return v;
}

function leapCols(table) {
  const fs = TABLES[table].fields.filter((f) => !f.noImport && f.key !== 'holeId');
  return [{ key: 'holeId', header: 'holeId' }, ...fs.map((f) => ({ key: f.key, header: f.key, get: (r) => leapValue(f, r) }))];
}

const byHole = (table, ids) => ids.flatMap((h) => rows(table, h));

/**
 * Leapfrog Geo CSV set.
 * → {files: [{name, data}], report: {counts, notes}}
 */
export function leapfrogExport({ holeIds, lang } = {}) {
  const L = (en, mn) => ((lang || S.lang) === 'en' ? en : mn);
  const ids = selectHoleIds(holeIds);
  const idSet = new Set(ids);
  const st = settings();
  const files = [];
  const counts = {};
  const add = (name, list, cols) => {
    counts[name] = list.length;
    files.push({ name, data: toCSV(list, cols, { bom: false }) });
  };

  add('collar.csv', holes().filter((h) => idSet.has(h.holeId)), [{ key: 'holeId', header: 'holeId' }, ...leapCols('collar').slice(1)]);
  const surveys = byHole('survey', ids);
  const excluded = surveys.filter((s) => s.exclude);
  add('survey.csv', surveys.filter((s) => !s.exclude), leapCols('survey'));
  add('lithology.csv', byHole('lith', ids), leapCols('lith'));
  add('recovery.csv', byHole('geotech', ids), leapCols('geotech'));
  add('structure.csv', byHole('struct', ids), leapCols('struct'));

  // samples joined with merged assay values; QC samples in their own file
  const samples = byHole('samples', ids);
  const isPrim = (s) => (!s.sampleType || s.sampleType === 'PRIM') && isNum(s.from) && isNum(s.to);
  const prim = samples.filter(isPrim);
  const qc = samples.filter((s) => !isPrim(s));
  const keysOf = (list) => {
    const set = new Set();
    for (const s of list) for (const k of Object.keys(assayValues(s.sampleId)?.values || {})) set.add(k);
    return [...set].sort(natCmp);
  };
  const sampleCols = (list) => [
    ...leapCols('samples'),
    ...keysOf(list).map((k) => ({ key: k, header: k, get: (s) => num(assayValues(s.sampleId)?.values?.[k]) })),
    { key: 'certificates', header: 'certificates', get: (s) => [...new Set(assayValues(s.sampleId)?.certs || [])].join(' | ') },
  ];
  add('samples_assays.csv', prim, sampleCols(prim));
  add('qc_samples_assays.csv', qc, sampleCols(qc));

  const px = byHole('pxrf', ids);
  const pxKeys = [...new Set(px.flatMap((r) => Object.keys(r.values || {})))].sort(natCmp);
  add('pxrf.csv', px, [...leapCols('pxrf'), ...pxKeys.map((k) => ({ key: k, header: k, get: (r) => num(r.values?.[k]) }))]);
  add('density_magsus.csv', byHole('phys', ids), leapCols('phys'));

  const bd = { half: L('half the detection limit', 'илрүүлэх хязгаарын хагас'), lor: L('the detection limit', 'илрүүлэх хязгаар'), zero: '0', negative: L('minus the detection limit', 'хасах илрүүлэх хязгаар') }[st.belowDetection] || st.belowDetection;
  const md = [
    `# ${L('Leapfrog export', 'Leapfrog экспорт')} — ${S.project?.name || 'ORD'}`,
    '',
    `${L('Created', 'Үүсгэсэн')}: ${dateTime(Date.now())} · ${L('holes', 'цооног')}: ${ids.length} · ${st.crs || ''}${st.epsg ? ` (EPSG:${st.epsg})` : ''}`,
    '',
    `| ${L('File', 'Файл')} | ${L('Rows', 'Мөр')} |`,
    '|---|---:|',
    ...Object.entries(counts).map(([f, n]) => `| ${f} | ${n} |`),
    '',
    `- ${L('Headers are ORD field keys; depths have 3 decimals.', 'Толгой нь ORD талбарын түлхүүр; гүн 3 оронтой.')}`,
    `- ${L(`Dip is ${st.dipNegativeDown !== false ? 'negative down' : 'positive down'}.`, `Налуу ${st.dipNegativeDown !== false ? 'доош сөрөг' : 'доош эерэг'}.`)}`,
    `- ${L('structure.csv: dipCalc / dipDirCalc are true dip and dip direction from alpha/beta and the desurveyed hole.', 'structure.csv: dipCalc / dipDirCalc нь альфа/бета болон цооногийн траекторээс бодсон жинхэнэ налуу, налуугийн чиглэл.')}`,
    `- ${L(`Assay values below detection are stored as ${bd} (project setting).`, `Илрүүлэх хязгаараас доош утгыг ${bd} гэж хадгалсан (төслийн тохиргоо).`)}`,
    `- ${L('samples_assays.csv holds primary samples with depths (latest certificate wins per element); QC samples are in qc_samples_assays.csv.', 'samples_assays.csv — гүнтэй үндсэн дээжүүд (элемент бүрт хамгийн сүүлийн сертификат); QC дээж qc_samples_assays.csv-д.')}`,
    excluded.length ? `- ${L(`${excluded.length} survey reading(s) marked “Exclude” were left out of survey.csv.`, `«Хасах» тэмдэгтэй ${excluded.length} хэмжилтийг survey.csv-д оруулаагүй.`)}` : null,
    '',
  ].filter((x) => x !== null);
  files.push({ name: 'export_report.md', data: md.join('\n') });
  return { files, report: { counts, excludedSurveys: excluded.length, holes: ids.length } };
}

// ============================================================== MX Deposit

export const MX_SHEETS = [
  { table: 'collar', file: '1_Header.csv', mx: 'Header' },
  { table: 'survey', file: '2_Survey.csv', mx: 'Survey' },
  { table: 'lith', file: '3_Lithology.csv', mx: 'Lithology', fill: 'comments' },
  { table: 'geotech', file: '4_Recovery.csv', mx: 'Recovery', fill: 'remarks' },
  { table: 'struct', file: '5_Structure.csv', mx: 'Structure' },
  { table: 'samples', file: '6_Samples.csv', mx: 'Samples' },
  { table: 'phys', file: '7_SG_MagSus.csv', mx: 'SG / Mag Sus' },
];

const HOLE_MX = TABLES.collar.fields.find((f) => f.key === 'holeId').mx;
const q2 = (v) => (isNum(v) ? v.toFixed(2) : '?');

/**
 * MX Deposit CSVs + export_report.md.
 * options: holeIds (default all), fallbackPendingCodes (default true), lang.
 * → {files, report}
 */
export function mxExport({ holeIds, fallbackPendingCodes = true, lang } = {}) {
  const lg = lang || S.lang;
  const ids = selectHoleIds(holeIds);
  const idSet = new Set(ids);
  const st = settings();
  const max = toNum(st.commentsMax) ?? 500;
  const rep = {
    holes: ids.length,
    tables: [],
    fills: [],
    fallbacks: new Map(), // 'LIST:CODE' → {list, code, to, rows, holes:Set}
    pendingKept: new Map(),
    unknownCodes: new Map(),
    longComments: [],
    overlaps: [],
    beyondEoh: [],
    noEoh: [],
    lonlatRounded: 0,
    lonlatOutside: [],
    newlines: 0,
    omitted: [],
  };

  const mxValue = (f, r, table) => {
    const v = r[f.key];
    if (v === null || v === undefined || v === '') return '';
    switch (f.type) {
      case 'code': {
        const code = String(v);
        const c = codeMap(f.list).get(code);
        const k = `${f.list}:${code}`;
        if (!c) {
          const u = rep.unknownCodes.get(k) || { list: f.list, code, rows: 0, holes: new Set() };
          u.rows++;
          if (r.holeId) u.holes.add(r.holeId);
          rep.unknownCodes.set(k, u);
          return code;
        }
        if (c.mxPending) {
          const target = fallbackPendingCodes ? rep.fallbacks : rep.pendingKept;
          const e = target.get(k) || { list: f.list, code, to: c.mxFallback || '', field: f.mx, table, rows: 0, holes: new Set() };
          e.rows++;
          if (r.holeId) e.holes.add(r.holeId);
          target.set(k, e);
          return fallbackPendingCodes ? c.mxFallback || '' : code;
        }
        return code;
      }
      case 'num':
      case 'pct':
      case 'int': {
        if (!isNum(v)) return '';
        if (f.key === 'lon' || f.key === 'lat') {
          const rv = round(v, 8);
          if (rv !== v) rep.lonlatRounded++;
          return String(rv);
        }
        return DEPTH_KEYS.has(f.key) ? num(v, 3) : num(v);
      }
      case 'bool':
        return v ? 'TRUE' : 'FALSE';
      case 'date':
        return String(v).slice(0, 10);
      default: {
        let s = String(v);
        if (/[\r\n]/.test(s)) {
          s = s.replace(/\s*[\r\n]+\s*/g, ' ');
          rep.newlines++;
        }
        if (f.type === 'note' && s.length > max) rep.longComments.push({ table, holeId: r.holeId, label: r.__label || '', field: f.mx, length: s.length });
        return s;
      }
    }
  };

  const files = [];
  for (const sh of MX_SHEETS) {
    const def = TABLES[sh.table];
    const fields = def.fields.filter((f) => f.mx && f.type !== 'calc' && f.key !== 'holeId');
    rep.omitted.push({ table: sh.table, calc: def.fields.filter((f) => f.type === 'calc').map((f) => f.label), other: def.fields.filter((f) => !f.mx && f.type !== 'calc' && f.key !== 'holeId').map((f) => f.label) });
    const cols = [{ header: HOLE_MX, get: (r) => r.holeId }, ...fields.map((f) => ({ header: f.mx, get: (r) => mxValue(f, r, sh.table) }))];
    let out = [];
    let fillers = 0;
    if (sh.table === 'collar') {
      out = holes().filter((h) => idSet.has(h.holeId));
      for (const c of out) {
        if (isNum(c.lon) && isNum(c.lat) && !(c.lon >= 87 && c.lon <= 120 && c.lat >= 41 && c.lat <= 52)) rep.lonlatOutside.push({ holeId: c.holeId, lon: c.lon, lat: c.lat });
      }
    } else {
      for (const h of ids) {
        const list = rows(sh.table, h).map((r) => ({ ...r, __label: labelOf(sh.table, r) }));
        if (sh.fill && list.length) {
          const eoh = hole(h)?.eoh;
          if (!isNum(eoh)) rep.noEoh.push({ table: sh.table, holeId: h });
          for (const o of overlaps(list)) rep.overlaps.push({ table: sh.table, holeId: h, a: `${q2(o.a.from)}–${q2(o.a.to)}`, b: `${q2(o.b.from)}–${q2(o.b.to)}` });
          if (isNum(eoh)) for (const r of list) if (isNum(r.to) && r.to > eoh + 0.001) rep.beyondEoh.push({ table: sh.table, holeId: h, label: `${q2(r.from)}–${q2(r.to)}`, eoh });
          const g = gaps(list, { start: 0, end: isNum(eoh) ? eoh : null }).filter((x) => x.to - x.from > 0.0005);
          for (const x of g) {
            list.push({ holeId: h, from: x.from, to: x.to, [sh.fill]: NOT_MEASURED, __filler: true });
            rep.fills.push({ table: sh.table, holeId: h, from: x.from, to: x.to });
            fillers++;
          }
          list.sort((a, b) => (a.from ?? 0) - (b.from ?? 0) || (a.to ?? 0) - (b.to ?? 0));
        }
        out.push(...list);
      }
    }
    files.push({ name: sh.file, data: toCSV(out, cols, { bom: false }) });
    rep.tables.push({ table: sh.table, file: sh.file, mx: sh.mx, rows: out.length, fillers });
  }
  const md = mxReport(rep, { lang: lg, ids, fallbackPendingCodes, max });
  files.push({ name: 'export_report.md', data: md });
  return { files, report: summarizeMx(rep) };
}

function labelOf(table, r) {
  if (table === 'samples') return r.sampleId || '';
  if (TABLES[table].kind === 'interval') return `${q2(r.from)}–${q2(r.to)}`;
  if (TABLES[table].kind === 'point') return `@ ${q2(r.depth)}`;
  return '';
}

function summarizeMx(rep) {
  const list = (m) => [...m.values()].map((e) => ({ ...e, holes: [...e.holes].sort(natCmp) }));
  return {
    holes: rep.holes,
    tables: rep.tables,
    fills: rep.fills,
    fallbacks: list(rep.fallbacks),
    pendingKept: list(rep.pendingKept),
    unknownCodes: list(rep.unknownCodes),
    longComments: rep.longComments,
    overlaps: rep.overlaps,
    beyondEoh: rep.beyondEoh,
    noEoh: rep.noEoh,
    lonlatRounded: rep.lonlatRounded,
    lonlatOutside: rep.lonlatOutside,
    newlines: rep.newlines,
    blocking: rep.longComments.length + rep.overlaps.length + rep.unknownCodes.size + rep.pendingKept.size,
  };
}

function mxReport(rep, { lang, ids, fallbackPendingCodes, max }) {
  const L = (en, mn) => (lang === 'en' ? en : mn);
  const tl = (t) => (lang === 'en' ? TABLES[t].short?.en || TABLES[t].label.en : TABLES[t].short?.mn || TABLES[t].label.mn);
  const lbl = (p) => (p ? (lang === 'en' ? p.en : p.mn) : '');
  const cap = (arr, n = 200) => (arr.length > n ? [...arr.slice(0, n), null] : arr);
  const more = (arr, n = 200) => (arr.length > n ? L(`… and ${arr.length - n} more`, `… бас ${arr.length - n}`) : '');
  const o = [];
  o.push(`# ${L('MX Deposit export', 'MX Deposit экспорт')} — ${S.project?.name || 'ORD'}`);
  o.push('');
  o.push(`${L('Created', 'Үүсгэсэн')}: ${dateTime(Date.now())} · ORD · ${L('holes', 'цооног')}: ${ids.length}`);
  o.push('');
  o.push(`## ${L('Files and import order', 'Файлууд, импортлох дараалал')}`);
  o.push('');
  o.push(`| # | ${L('File', 'Файл')} | ${L('MX table', 'MX хүснэгт')} | ${L('Rows', 'Мөр')} | ${L('of which “Not measured”', 'үүнээс «Not measured»')} |`);
  o.push('|---|---|---|---:|---:|');
  rep.tables.forEach((t, i) => o.push(`| ${i + 1} | ${t.file} | ${t.mx} | ${t.rows} | ${t.fillers || ''} |`));
  o.push('');
  o.push(L('Import in this order (header first, so every hole exists before its intervals). Files are UTF-8 without BOM; dates are YYYY-MM-DD; the hole column is “Hole Number”.', 'Энэ дарааллаар импортлоно (эхлээд Header — интервал орохоос өмнө цооног бүр байх ёстой). Файлууд BOM-гүй UTF-8; огноо YYYY-MM-DD; цооногийн багана «Hole Number».'));
  o.push('');

  o.push(`## ${L('What ORD changed so MX accepts the files', 'MX хүлээн авахын тулд ORD юу өөрчилсөн')}`);
  o.push('');
  o.push(`### 1. ${L('Calculated columns left out', 'Тооцоолдог баганыг оруулаагүй')}`);
  o.push('');
  o.push(L('MX Deposit calculates these itself and rejects them in an import file:', 'MX Deposit эдгээрийг өөрөө тооцдог бөгөөд импортын файлд байвал татгалздаг:'));
  for (const t of rep.omitted) if (t.calc.length) o.push(`- ${tl(t.table)}: ${t.calc.map(lbl).join(', ')}`);
  const other = rep.omitted.filter((t) => t.other.length);
  if (other.length) {
    o.push('');
    o.push(L('ORD-only columns with no MX column (not exported):', 'MX-д багана байхгүй ORD-ийн талбар (экспортлоогүй):'));
    for (const t of other) o.push(`- ${tl(t.table)}: ${t.other.map(lbl).join(', ')}`);
  }
  o.push('');
  o.push(`### 2. ${L('Gaps filled with “Not measured” rows', 'Завсрыг «Not measured» мөрөөр нөхсөн')}`);
  o.push('');
  if (rep.fills.length) {
    o.push(L(`MX rejects interval tables with gaps. ${rep.fills.length} blank row(s) were added from 0 m to the end of hole, with “${NOT_MEASURED}” in Comments (Lithology) / REMARKS (Recovery). They are not stored in ORD.`, `MX завсартай интервал хүснэгтийг хүлээж авдаггүй. 0 м-ээс эцсийн гүн хүртэл ${rep.fills.length} хоосон мөр нэмж, Comments (Литологи) / REMARKS (Авралт)-д «${NOT_MEASURED}» гэж бичсэн. ORD-д хадгалагдахгүй.`));
    o.push('');
    o.push(`| ${L('Table', 'Хүснэгт')} | ${L('Hole', 'Цооног')} | ${L('From', 'Эхлэл')} | ${L('To', 'Төгсгөл')} |`);
    o.push('|---|---|---:|---:|');
    for (const f of cap(rep.fills)) o.push(f ? `| ${tl(f.table)} | ${f.holeId} | ${f.from.toFixed(2)} | ${f.to.toFixed(2)} |` : `| ${more(rep.fills)} | | | |`);
  } else o.push(L('No gaps — nothing added.', 'Завсар байхгүй — юу ч нэмээгүй.'));
  if (rep.noEoh.length) {
    o.push('');
    o.push(L(`Holes without an EOH depth (only gaps above the last interval were filled): ${[...new Set(rep.noEoh.map((x) => x.holeId))].join(', ')}`, `Эцсийн гүн (EOH) оруулаагүй цооног (зөвхөн сүүлийн интервал хүртэлх завсрыг нөхсөн): ${[...new Set(rep.noEoh.map((x) => x.holeId))].join(', ')}`));
  }
  o.push('');
  const fb = [...rep.fallbacks.values()];
  o.push(`### 3. ${L('Codes not yet in the MX lists', 'MX жагсаалтад хараахан ороогүй код')}`);
  o.push('');
  if (fallbackPendingCodes) {
    if (fb.length) {
      o.push(L('These codes are in ORD (MU Lithology Code Standard v4 and texture list) but not yet in the MX Deposit pick lists, so MX would reject them. They were written as:', 'Эдгээр код ORD-д (MU литологийн стандарт v4, текстурын жагсаалт) байгаа ч MX Deposit-ийн жагсаалтад хараахан ороогүй тул MX татгалзана. Дараах байдлаар бичсэн:'));
      o.push('');
      o.push(`| ${L('List', 'Жагсаалт')} | ${L('ORD code', 'ORD код')} | ${L('Written to MX as', 'MX-д бичсэн')} | ${L('Rows', 'Мөр')} | ${L('Holes', 'Цооног')} |`);
      o.push('|---|---|---|---:|---|');
      for (const e of fb) o.push(`| ${e.list} | ${e.code} | ${e.to || L('(blank)', '(хоосон)')} | ${e.rows} | ${[...e.holes].sort(natCmp).join(', ')} |`);
      o.push('');
      o.push(L('ORD keeps the original codes. Once the codes are added to the MX lists, export again with the fallback option switched off.', 'ORD анхны кодыг хадгалсаар байна. Кодуудыг MX жагсаалтад нэмсний дараа fallback-ийг унтрааж дахин экспортлоно.'));
    } else o.push(L('None used in the exported holes.', 'Экспортолсон цооногт ийм код алга.'));
  } else o.push(L('Fallback switched off: codes were written as they are (see “Needs your attention”).', 'Fallback унтраалттай: кодыг байгаагаар нь бичсэн («Анхаарах зүйлс»-ийг үз).'));
  o.push('');
  o.push(`### 4. ${L('Other formatting', 'Бусад хэлбэржүүлэлт')}`);
  o.push('');
  o.push(`- ${L(`Longitude/latitude rounded to 8 decimals (MX limit): ${rep.lonlatRounded} value(s).`, `Уртраг/өргөрөг 8 орон хүртэл бөөрөнхийлсөн (MX-ийн хязгаар): ${rep.lonlatRounded} утга.`)}`);
  o.push(`- ${L(`Line breaks inside text replaced by spaces: ${rep.newlines} cell(s).`, `Текст доторх мөр шилжилтийг зайгаар сольсон: ${rep.newlines} нүд.`)}`);
  o.push(`- ${L('Depths written with up to 3 decimals; yes/no as TRUE/FALSE.', 'Гүнийг 3 хүртэл оронтой; тийм/үгүйг TRUE/FALSE гэж бичсэн.')}`);
  o.push('');

  o.push(`## ${L('Needs your attention before importing (not changed)', 'Импортлохоос өмнө анхаарах (өөрчлөөгүй)')}`);
  o.push('');
  let issues = 0;
  if (rep.longComments.length) {
    issues++;
    o.push(`### ${L(`Text longer than ${max} characters — MX rejects these rows`, `${max}-аас урт текст — MX эдгээр мөрийг хүлээж авахгүй`)}`);
    o.push('');
    o.push(L('ORD does not cut text silently. Shorten these in ORD and export again:', 'ORD текстийг чимээгүй тайрдаггүй. ORD-д богиносгоод дахин экспортлоно уу:'));
    for (const c of cap(rep.longComments)) o.push(c ? `- ${tl(c.table)} · ${c.holeId} ${c.label} · ${c.field}: ${c.length} ${L('characters', 'тэмдэгт')}` : `- ${more(rep.longComments)}`);
    o.push('');
  }
  if (rep.overlaps.length) {
    issues++;
    o.push(`### ${L('Overlapping intervals — MX rejects these', 'Давхацсан интервал — MX татгалзана')}`);
    o.push('');
    for (const x of cap(rep.overlaps)) o.push(x ? `- ${tl(x.table)} · ${x.holeId}: ${x.a} / ${x.b}` : `- ${more(rep.overlaps)}`);
    o.push('');
  }
  if (rep.beyondEoh.length) {
    issues++;
    o.push(`### ${L('Intervals past the end of hole', 'Эцсийн гүнээс хэтэрсэн интервал')}`);
    o.push('');
    for (const x of cap(rep.beyondEoh)) o.push(x ? `- ${tl(x.table)} · ${x.holeId} ${x.label} (EOH ${x.eoh})` : `- ${more(rep.beyondEoh)}`);
    o.push('');
  }
  const unk = [...rep.unknownCodes.values()];
  if (unk.length) {
    issues++;
    o.push(`### ${L('Codes that are not in the ORD code lists', 'ORD-ийн кодын жагсаалтад байхгүй код')}`);
    o.push('');
    for (const u of unk) o.push(`- ${u.list}: ${u.code} — ${u.rows} ${L('row(s)', 'мөр')} (${[...u.holes].sort(natCmp).join(', ')})`);
    o.push('');
  }
  const kept = [...rep.pendingKept.values()];
  if (kept.length) {
    issues++;
    o.push(`### ${L('Codes not yet in the MX lists (fallback off)', 'MX жагсаалтад ороогүй код (fallback унтраалттай)')}`);
    o.push('');
    for (const e of kept) o.push(`- ${e.list}: ${e.code} — ${e.rows} ${L('row(s)', 'мөр')} (${[...e.holes].sort(natCmp).join(', ')})`);
    o.push('');
  }
  if (rep.lonlatOutside.length) {
    issues++;
    o.push(`### ${L('Longitude/latitude outside Mongolia (swapped?)', 'Монголоос гадуурх уртраг/өргөрөг (солигдсон уу?)')}`);
    o.push('');
    for (const x of rep.lonlatOutside) o.push(`- ${x.holeId}: lon ${x.lon}, lat ${x.lat}`);
    o.push('');
  }
  if (!issues) {
    o.push(L('Nothing — the files should import cleanly.', 'Алга — файлууд асуудалгүй орох ёстой.'));
    o.push('');
  }
  o.push(`## ${L('Holes that already exist in MX', 'MX-д аль хэдийн байгаа цооног')}`);
  o.push('');
  o.push(L('These files have no MX “ID” column, so MX adds every row as new. Importing into holes that already have rows in MX appends duplicates (MX cannot delete rows by import). For such holes, clear the table in MX first, or import only the holes that are new to MX. Also check that the holes are not assigned/locked in MX — MX then reports the job as “Succeeded” but inserts 0 rows.', 'Эдгээр файлд MX-ийн «ID» багана байхгүй тул MX мөр бүрийг шинээр нэмнэ. MX-д мөртэй цооногт импортловол давхардал үүснэ (MX импортоор мөр устгаж чаддаггүй). Ийм цооногийн хүснэгтийг эхлээд MX-д цэвэрлэх, эсвэл зөвхөн MX-д шинэ цооногуудыг импортлоно уу. Цооног MX-д оноогдсон/түгжигдсэн эсэхийг бас шалгаарай — тэгвэл MX ажлыг «Succeeded» гэж харуулаад 0 мөр оруулдаг.'));
  o.push('');
  return o.join('\n');
}

// ================================================================== backup

/** Full project snapshot as JSON text. */
export function backupExport() {
  const data = JSON.stringify(exportProjectJSON());
  return { files: [{ name: `${fileStem('backup')}.json`, data }], report: { bytes: data.length } };
}

/**
 * Read a backup (.json, or a .zip made by ORD) → {obj, summary}.
 * Pass the result's obj to importProjectJSON() to merge it.
 */
export async function readBackup(input) {
  let bytes = null;
  let textIn = null;
  const u8 = (b) => (ArrayBuffer.isView(b) ? new Uint8Array(b.buffer, b.byteOffset, b.byteLength) : new Uint8Array(b));
  if (typeof input === 'string') textIn = input;
  else if (input instanceof ArrayBuffer || ArrayBuffer.isView(input)) bytes = u8(input);
  else if (input?.text && typeof input.text === 'string') textIn = input.text;
  else if (input?.buffer) bytes = u8(input.buffer);
  else if (input && typeof input.arrayBuffer === 'function') bytes = new Uint8Array(await input.arrayBuffer());
  else throw new Error('Nothing to read');
  if (bytes && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entries = await unzip(bytes);
    const json = entries.find((e) => /\.json$/i.test(e.name));
    if (!json) throw new Error('No .json backup inside the zip');
    textIn = new TextDecoder().decode(json.data);
  } else if (bytes) textIn = new TextDecoder().decode(bytes);
  let obj;
  try {
    obj = JSON.parse(String(textIn).replace(/^﻿/, ''));
  } catch {
    throw new Error('Not a JSON file');
  }
  if (obj?.format !== 'ord-project') throw new Error('Not an ORD project backup');
  const docs = obj.docs || [];
  const live = (d) => (d.rows || []).filter((r) => !r._d).length;
  const count = (t) => docs.filter((d) => d.table === t).reduce((s, d) => s + live(d), 0);
  const summary = {
    project: obj.project?.name || '',
    projectId: obj.project?.id || '',
    exported: obj.exported || '',
    docs: docs.length,
    holes: count('collar'),
    lith: count('lith'),
    samples: count('samples'),
    assays: count('assays'),
  };
  return { obj, summary };
}

// ==================================================================== zip

function slug(s) {
  return (
    String(s || 'project')
      .normalize('NFC')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'project'
  );
}

/** 'ORD_<project>_<type>_<date>' */
export function fileStem(type) {
  return `ORD_${slug(S.project?.name)}_${type}_${todayISO()}`;
}

/**
 * Build an export and bundle it: type 'leapfrog' | 'mx' | 'backup'.
 * → {fileName, bytes (Uint8Array), blob (when Blob exists), files, report}
 */
export function exportZip(type, opts = {}) {
  const fn = { leapfrog: leapfrogExport, mx: mxExport, backup: backupExport }[type];
  if (!fn) throw new Error(`Unknown export type ${type}`);
  const { files, report } = fn(opts);
  const bytes = zipFiles(files);
  const fileName = `${fileStem(type)}.zip`;
  const blob = typeof Blob === 'function' ? new Blob([bytes], { type: 'application/zip' }) : null;
  return { fileName, bytes, blob, files, report };
}

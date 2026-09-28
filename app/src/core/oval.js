// Loads the consolidated Oval (Yambat) database that ships in this repository
// (database/csv/*.csv, WGS84 / UTM 46N) into an ORD project: 76 collars, the
// downhole surveys, drill-core petrography samples and their assay suite.

import { parseCSVObjects } from './csv.js';
import { toNum, toISODate, round } from './util.js';
import { mutate, setSettings, codeMap } from './store.js';

const SOURCES = ['data/oval/', '../database/csv/'];

async function fetchCSV(name) {
  let lastErr;
  for (const base of SOURCES) {
    try {
      const r = await fetch(base + name);
      if (r.ok) return parseCSVObjects(await r.text()).rows;
      lastErr = new Error(`${base + name}: HTTP ${r.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`${name} not found`);
}

const STATUS = { completed: 'CMP', 'not accepted': 'NAC', ongoing: 'ACT', planned: 'PLN', abandoned: 'ABD' };

function methodCode(m) {
  const s = String(m || '').trim();
  if (!s) return null;
  if (/ez-?trac/i.test(s)) return 'EZT';
  if (/^ms$/i.test(s) || /multi/i.test(s)) return 'MS';
  if (/gyro/i.test(s)) return 'GYR';
  return s.toUpperCase();
}

/** Assay header "Au_ppm__PGM_ICP27" → {key:'Au_ppm', method:'PGM-ICP27'} */
export function parseAssayHeader(h) {
  const [left, method = ''] = String(h).split('__');
  const toks = left.split('_');
  const el = toks[0];
  const unitRaw = (toks[1] || '').toLowerCase();
  const unit = unitRaw === 'pct' ? 'pct' : unitRaw === 'ppb' ? 'ppb' : unitRaw === 'gpt' ? 'gpt' : 'ppm';
  return { key: `${el}_${unit}`, el, unit, method: method.replace(/_/g, '-') };
}

export async function loadOval() {
  const [collars, surveys, samples, assays] = await Promise.all([fetchCSV('collar.csv'), fetchCSV('survey.csv'), fetchCSV('samples.csv'), fetchCSV('sample_assays.csv')]);
  const ops = [];
  const holeSet = new Set();

  for (const c of collars) {
    const holeId = c.hole_id.trim();
    holeSet.add(holeId);
    ops.push({
      type: 'upsert',
      table: 'collar',
      holeId,
      row: {
        holeId,
        prospect: (c.prospect || '').trim() || null,
        holeType: c.hole_type || 'DD',
        status: STATUS[String(c.status || '').trim().toLowerCase()] || null,
        east: toNum(c.east),
        north: toNum(c.north),
        rl: toNum(c.rl),
        azimuth: toNum(c.azimuth),
        dip: toNum(c.dip),
        eoh: toNum(c.total_depth_m),
        startDate: toISODate(c.start_date),
        endDate: toISODate(c.end_date),
        contractor: c.company || null,
        geologist: c.supervisor || null,
        lease: c.lease || null,
        remarks: [c.remarks, Number(c.start_depth_m) > 0 ? `Re-drill from ${c.start_depth_m} m; survey depths are from surface` : ''].filter(Boolean).join(' · ') || null,
      },
    });
  }

  const extraMethods = new Set();
  for (const s of surveys) {
    const holeId = s.hole_id.trim();
    const method = methodCode(s.method);
    if (method && !codeMap('SURVMETHOD').has(method)) extraMethods.add(method);
    ops.push({
      type: 'upsert',
      table: 'survey',
      holeId,
      row: {
        depth: toNum(s.depth_m),
        azimuth: toNum(s.azimuth),
        dip: toNum(s.dip),
        method,
        date: toISODate(s.survey_date),
        company: s.survey_company || null,
        exclude: /drop this row/i.test(s.qa_note || '') || null,
        remarks: s.qa_note ? s.qa_note.slice(0, 480) : null,
      },
    });
  }
  for (const m of extraMethods) ops.push({ type: 'upsert', table: 'codes', row: { id: `SURVMETHOD:${m}`, list: 'SURVMETHOD', code: m, meaning: `${m} (as recorded in source – verify)`, meaningMn: `${m} (эх сурвалжийнхаар – шалга)`, order: 90 } });

  // drill-core petrography samples with a hole in the collar table
  const sampleHole = new Map();
  let skipped = 0;
  for (const s of samples) {
    const holeId = (s.hole_id_norm || '').trim();
    if (!holeSet.has(holeId) || s.sample_source !== 'drill core') {
      skipped++;
      continue;
    }
    sampleHole.set(s.sample_id, holeId);
    const from = toNum(s.depth_from_m);
    ops.push({
      type: 'upsert',
      table: 'samples',
      holeId,
      row: {
        sampleId: s.sample_id,
        sampleType: 'PETRO',
        from,
        to: toNum(s.depth_to_m) ?? (from !== null ? round(from + 0.1, 3) : null),
        comments: [s.petro_lithology || s.field_lithology, s.rock_group ? `[${s.rock_group}]` : '', s.petrographer_lab ? `(${s.petrographer_lab} ${s.year || ''})` : ''].filter(Boolean).join(' ').slice(0, 480) || null,
      },
    });
  }

  // assays (verbatim values; '<x' kept as below-detection flags)
  const headers = assays.length ? Object.keys(assays[0]) : [];
  const cols = headers.filter((h) => h.includes('__')).map((h) => ({ h, ...parseAssayHeader(h) }));
  const used = new Map();
  for (const c of cols) {
    let key = c.key;
    if (used.has(key) && used.get(key) !== c.method) key = `${key}_${c.method.split('-').pop()}`;
    used.set(key, c.method);
    c.finalKey = key;
  }
  const elements = {};
  for (const c of cols) elements[c.finalKey] = { unit: c.unit, method: c.method, lor: null };
  let nAssays = 0;
  for (const a of assays) {
    const holeId = sampleHole.get(a.sample_id);
    if (!holeId) continue;
    const values = {};
    const flags = {};
    for (const c of cols) {
      const raw = String(a[c.h] ?? '').trim();
      if (!raw) continue;
      if (raw.startsWith('<')) {
        const lor = toNum(raw.slice(1));
        if (lor !== null) {
          values[c.finalKey] = lor / 2;
          flags[c.finalKey] = '<';
          if (!elements[c.finalKey].lor) elements[c.finalKey].lor = lor;
        }
        continue;
      }
      const v = toNum(raw);
      if (v !== null) values[c.finalKey] = v;
    }
    if (!Object.keys(values).length) continue;
    nAssays++;
    ops.push({ type: 'upsert', table: 'assays', holeId, row: { sampleId: a.sample_id, certificate: 'Yambat Petrographic Master Data (All)', values, flags } });
  }

  setSettings({ elements, stripElements: ['Ni_ppm', 'Cu_ppm'], intercepts: { element: 'Ni_ppm', cutoff: 1000, minLen: 0, maxDil: 0, incl: 3000, secondary: ['Cu_ppm', 'Co_ppm'] } });
  const res = mutate(ops, { label: 'Oval database (repo: database/csv)' });
  return { ...res, holes: holeSet.size, surveys: surveys.length, samples: sampleHole.size, skippedSamples: skipped, assays: nAssays };
}

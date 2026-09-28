// Import engine tests: node --test app/tests/importer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, mutate, emit, rows, hole, undoBatch, codeMap, batches } from '../src/core/store.js';
import { DEFAULT_LISTS, defaultSettings } from '../src/core/codes.js';
import * as IM from '../src/core/importer.js';

function reset({ holes = [] } = {}) {
  S.pid = 'test';
  S.adapter = null;
  S.project = null;
  S.docs = new Map();
  const ops = [];
  for (const [list, items] of Object.entries(DEFAULT_LISTS)) {
    items.forEach((c, i) => ops.push({ type: 'upsert', table: 'codes', row: { id: `${list}:${c.code}`, list, code: c.code, meaning: c.meaning, order: i, warn: c.warn || null, mxPending: c.mxPending || null, mxFallback: c.mxFallback || null } }));
  }
  ops.push({ type: 'upsert', table: 'settings', row: { id: 'settings', ...defaultSettings() } });
  for (const h of holes) ops.push({ type: 'upsert', table: 'collar', holeId: h.holeId, row: { east: 500000, north: 5100000, rl: 1500, ...h } });
  mutate(ops, { label: 'seed' });
  emit();
}

const csvObjs = (text) => IM.readTabular(text, { fileName: 'test.csv' }).then((t) => t.sheets[0]);

async function planCSV(table, text, options = {}, fileName = 'test.csv') {
  const sh = (await IM.readTabular({ name: fileName, text })).sheets[0];
  const mapping = IM.autoMap(table, sh.headers, { units: sh.units });
  return IM.planImport({ table, rows: sh.rows, rowNos: sh.rowNos, mapping, options, fileName });
}

// ------------------------------------------------------------------ reading

test('readTabular: MX style (title row 1, headers row 2) and generic CSV', async () => {
  const mx = await csvObjs('Lithology,,,\nHole Number,From,To,Lith1\nMU2601,0,2.5,COLL\nMU2601,2.5,10,FRHY\n');
  assert.equal(mx.headerRow, 1);
  assert.deepEqual(mx.headers, ['Hole Number', 'From', 'To', 'Lith1']);
  assert.equal(mx.rows.length, 2);
  assert.deepEqual(mx.rowNos, [3, 4]);
  assert.equal(mx.title, 'Lithology');

  const gen = await csvObjs('hole_id;depth_from;depth_to;lith\nA1;0;1;COLL\n\nA1;1;2;FRHY\n');
  assert.equal(gen.headerRow, 0);
  assert.equal(gen.rows.length, 2);
  assert.deepEqual(gen.rowNos, [2, 4]);
});

test('readTabular: pasted Excel data (TSV), units row, duplicate headers', async () => {
  const t = await IM.readTabular('Hole\tFrom\tTo\tCu\tCu\n\tm\tm\t%\tppm\nA1\t0\t1\t0.5\t5000\n');
  const sh = t.sheets[0];
  assert.deepEqual(sh.headers, ['Hole', 'From', 'To', 'Cu', 'Cu (2)']);
  assert.equal(sh.units.Cu, '%');
  assert.equal(sh.units['Cu (2)'], 'ppm');
  assert.equal(sh.rows.length, 1);
  const map = IM.autoMap('pxrf', sh.headers, { units: sh.units });
  assert.equal(map.Cu, 'values:Cu_pct');
  assert.equal(map['Cu (2)'], 'values:Cu_ppm');
});

test('readTabular: XLSX workbook (lazy SheetJS), MX header rows, dates, bytes input', async () => {
  const XLSX = await IM.loadXLSX();
  const wb = XLSX.utils.book_new();
  const h = XLSX.utils.aoa_to_sheet([['Header'], ['Hole Number', 'Easting', 'Northing', 'Elevation', 'Final depth', 'Start date'], ['MU2601', 512345.5, 5134567.25, 1520, 250.4, 46000]]);
  h.F3.z = 'yyyy-mm-dd';
  XLSX.utils.book_append_sheet(wb, h, 'Header');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Lithology'], ['Hole Number', 'From', 'To', 'Lith1'], ['MU2601', 0, 3, 'COLL']]), 'Lithology');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const t = await IM.readTabular({ name: 'mx_export.xlsx', buffer: buf });
  assert.equal(t.kind, 'workbook');
  assert.deepEqual(t.sheets.map((s) => s.name), ['Header', 'Lithology']);
  const [hs, ls] = t.sheets;
  assert.equal(hs.headerRow, 1);
  assert.equal(hs.rows[0]['Start date'], '2025-12-09');
  assert.equal(hs.rows[0].Easting, 512345.5);
  assert.equal(IM.guessTable(hs.name, hs.headers), 'collar');
  assert.equal(IM.guessTable(ls.name, ls.headers), 'lith');
  // raw bytes also work (sniffed as a workbook)
  const t2 = await IM.readTabular(new Uint8Array(buf));
  assert.equal(t2.sheets.length, 2);
});

// ---------------------------------------------------------- guess & mapping

test('guessTable: MX sheet names and header overlap', () => {
  const g = IM.guessTable;
  assert.equal(g('Header', ['Hole Number']), 'collar');
  assert.equal(g('Coordinates', ['Hole Number', 'Easting', 'Northing']), 'collar');
  assert.equal(g('Survey', ['Hole Number', 'Depth', 'Azimuth', 'Dip']), 'survey');
  assert.equal(g('Lithology', ['Hole Number', 'From', 'To']), 'lith');
  assert.equal(g('Recovery', ['Hole Number', 'From', 'To']), 'geotech');
  assert.equal(g('Geotech', []), 'geotech');
  assert.equal(g('Structure', ['Hole Number', 'Depth']), 'struct');
  assert.equal(g('Samples', ['Hole Number', 'From', 'To', 'Sample ID']), 'samples');
  assert.equal(g('Assay', ['Sample ID', 'Au_ppm']), 'assays');
  assert.equal(g('XRF', ['Hole Number', 'From', 'Cu', 'Zn']), 'pxrf');
  assert.equal(g('Mag Sus', ['Hole Number', 'Depth', 'MagSus']), 'phys');
  assert.equal(g('SG', ['Hole Number', 'Depth', 'SG']), 'phys');
  // headers only
  assert.equal(g('Sheet1', ['hole_id', 'depth_from', 'depth_to', 'Lith1', 'Alt1', 'Int1']), 'lith');
  assert.equal(g('Sheet1', ['BHID', 'FROM', 'TO', 'Recovered', 'RQD', 'Fractures']), 'geotech');
  assert.equal(g('Sheet1', ['HoleID', 'East', 'North', 'RL', 'EOH', 'Azimuth', 'Dip']), 'collar');
  assert.equal(g('Sheet1', ['HoleID', 'Depth', 'Azimuth', 'Dip', 'Method']), 'survey');
  assert.equal(g('Sheet1', ['Sample ID', 'Hole', 'From', 'To', 'Sample Type', 'Weight']), 'samples');
  assert.equal(g('Sheet1', ['SAMPLE', 'Au_ppm', 'Cu_pct', 'Ag_ppm', 'S_pct']), 'assays');
  assert.equal(g('Sheet1', ['Hole', 'From', 'To', 'Reading', 'Cu', 'Cu Error', 'Zn', 'Fe']), 'pxrf');
  assert.equal(g('Sheet1', ['Hole', 'Depth', 'Alpha', 'Beta', 'Structure type']), 'struct');
  assert.equal(g('Sheet1', ['List', 'Code', 'Description']), 'codes');
});

test('autoMap: MX headers, aliases, calculated columns ignored', () => {
  const lith = IM.autoMap('lith', ['Hole Number', 'From', 'To', 'Lith1', 'Rock Name', 'Total SLF', 'VQZ %', 'PY', 'Comments', 'ID']);
  assert.deepEqual(lith, {
    'Hole Number': 'holeId',
    From: 'from',
    To: 'to',
    Lith1: 'lith1',
    'Rock Name': 'ignore',
    'Total SLF': 'ignore',
    'VQZ %': 'veinPct',
    PY: 'py',
    Comments: 'comments',
    ID: 'ignore',
  });
  assert.ok(IM.calcHeader('lith', 'Rock Name'));
  assert.ok(IM.calcHeader('lith', 'Total SLF'));
  assert.equal(IM.calcHeader('lith', 'Lith1'), null);

  const gt = IM.autoMap('geotech', ['Hole Number', 'From', 'To', 'Run length', 'Recovered', 'Core loss', 'Recovered %', 'Actual depth', 'RQD', 'REMARKS']);
  assert.equal(gt.Recovered, 'recovered');
  assert.equal(gt['Recovered %'], 'ignore');
  assert.equal(gt['Run length'], 'ignore');
  assert.equal(gt['Core loss'], 'ignore');
  assert.equal(gt['Actual depth'], 'ignore');
  assert.equal(gt.RQD, 'rqd');
  assert.equal(gt.REMARKS, 'remarks');
  for (const h of ['Run length', 'Core loss', 'Recovered %', 'Actual depth']) assert.ok(IM.calcHeader('geotech', h), h);
  assert.equal(IM.calcHeader('geotech', 'Recovered'), null);

  const col = IM.autoMap('collar', ['Hole Number', 'Easting', 'Northing', 'Elevation', 'Longitude', 'Latitude', 'Final depth', 'Logged to (m)']);
  assert.equal(col['Hole Number'], 'holeId');
  assert.equal(col['Final depth'], 'eoh');
  assert.equal(col['Logged to (m)'], 'ignore');
});

test('parseElementHeader: the header styles labs and MX use', () => {
  const p = (h) => {
    const e = IM.parseElementHeader(h, { defaultUnit: 'ppm' });
    return e && { key: e.key, method: e.method };
  };
  assert.deepEqual(p('Au_ppm'), { key: 'Au_ppm', method: null });
  assert.deepEqual(p('Au (ppm)'), { key: 'Au_ppm', method: null });
  assert.deepEqual(p('Au ppm'), { key: 'Au_ppm', method: null });
  assert.deepEqual(p('Cu_pct__ME_ICP61'), { key: 'Cu_pct', method: 'ME-ICP61' });
  assert.deepEqual(p('Cu %'), { key: 'Cu_pct', method: null });
  assert.deepEqual(p('Cu (%)'), { key: 'Cu_pct', method: null });
  assert.deepEqual(p('Au-AA23 ppm'), { key: 'Au_ppm', method: 'Au-AA23' });
  assert.deepEqual(p('Au-AA23 (ppm)'), { key: 'Au_ppm', method: 'Au-AA23' });
  assert.deepEqual(p('ME-ICP61 Cu ppm'), { key: 'Cu_ppm', method: 'ME-ICP61' });
  assert.deepEqual(p('Au g/t'), { key: 'Au_gpt', method: null });
  assert.deepEqual(p('AU_PPB'), { key: 'Au_ppb', method: null });
  assert.deepEqual(p('Fe2O3 %'), { key: 'Fe2O3_pct', method: null });
  assert.deepEqual(p('Au, г/т'), { key: 'Au_gpt', method: null });
  assert.deepEqual(p('Zn'), { key: 'Zn_ppm', method: null });
  for (const h of ['Cu Error', 'Cu +/-', 'Sample ID', 'From', 'Hole', 'Recvd Wt.', 'Depth', 'Batch', 'Date', 'No']) assert.equal(p(h), null, h);
  const a = IM.autoMap('assays', ['SAMPLE', 'Au_ppm', 'Cu_pct__ME_ICP61', 'Cu %', 'Au-AA23 ppm', 'Certificate']);
  assert.equal(a.SAMPLE, 'sampleId');
  assert.equal(a.Au_ppm, 'values:Au_ppm');
  assert.equal(a.Cu_pct__ME_ICP61, 'values:Cu_pct');
  assert.equal(a['Cu %'], 'ignore', 'second Cu_pct column is not mapped twice');
  assert.equal(a['Au-AA23 ppm'], 'ignore');
  assert.equal(a.Certificate, 'certificate');
});

test('parseLabValue: below / over detection, missing flags, modes', () => {
  assert.deepEqual(IM.parseLabValue('<0.005'), { value: 0.0025, flag: '<', lor: 0.005 });
  assert.equal(IM.parseLabValue('<0.005', { mode: 'lor' }).value, 0.005);
  assert.equal(IM.parseLabValue('<0.005', { mode: 'zero' }).value, 0);
  assert.equal(IM.parseLabValue('<0.005', { mode: 'negative' }).value, -0.005);
  assert.deepEqual(IM.parseLabValue('>10000'), { value: 10000, flag: '>', limit: 10000 });
  assert.deepEqual(IM.parseLabValue(-0.01), { value: 0.005, flag: '<', lor: 0.01 });
  for (const s of ['NSS', 'IS', 'LNR', 'NA', '-', 'n/a']) assert.equal(IM.parseLabValue(s).value, null, s);
  assert.equal(IM.parseLabValue('NSS').flag, 'NSS');
  assert.equal(IM.parseLabValue('N/A').flag, 'N/A');
  assert.deepEqual(IM.parseLabValue('1,25'), { value: 1.25, flag: null });
  assert.equal(IM.parseLabValue('abc').flag, '?');
});

// ------------------------------------------------------------------ plans

const LITH = 'Hole Number,From,To,Lith1,Alt1,Comments\nMU2601,0,2.5,COLL,,soil\nMU2601,2.5,10,FRHY,ASER,rhyolite\nMU2601,10,20,FRHYF,AHEM,\n';

test('plan → commit → re-import is unchanged (no duplicates) → edits update; one undoable batch', async () => {
  reset({ holes: [{ holeId: 'MU2601', eoh: 100 }] });
  const p1 = await planCSV('lith', LITH, {}, 'lith.csv');
  assert.equal(p1.summary.create, 3);
  assert.equal(p1.summary.errors, 0);
  assert.equal(rows('lith', 'MU2601').length, 0, 'dry run writes nothing');
  const r1 = IM.commitImport(p1, { fileName: 'lith.csv' });
  assert.equal(r1.created, 3);
  assert.match(r1.label, /^Import lith\.csv → Lithology: 3 new, 0 updated$/);
  assert.equal(rows('lith', 'MU2601').length, 3);
  assert.equal(rows('lith', 'MU2601')[2].lith1, 'FRHYF');

  const p2 = await planCSV('lith', LITH);
  assert.equal(p2.summary.create, 0);
  assert.equal(p2.summary.update, 0);
  assert.equal(p2.summary.unchanged, 3);

  const edited = LITH.replace('2.5,10,FRHY,ASER,rhyolite', '2.5,10,RHD,ASER,rhyodacite');
  const p3 = await planCSV('lith', edited);
  assert.equal(p3.summary.update, 1);
  assert.deepEqual(p3.update[0].changes, { lith1: ['FRHY', 'RHD'], comments: ['rhyolite', 'rhyodacite'] });
  const r3 = IM.commitImport(p3, { fileName: 'lith.csv' });
  assert.equal(r3.updated, 1);
  assert.equal(rows('lith', 'MU2601')[1].lith1, 'RHD');
  undoBatch(r3.batch);
  assert.equal(rows('lith', 'MU2601')[1].lith1, 'FRHY');
  undoBatch(r1.batch);
  assert.equal(rows('lith', 'MU2601').length, 0);
});

test('empty cells keep existing values by default; "clear" erases them explicitly', async () => {
  reset({ holes: [{ holeId: 'MU2601', eoh: 100 }] });
  IM.commitImport(await planCSV('lith', LITH));
  const blank = 'Hole Number,From,To,Lith1,Alt1,Comments\nMU2601,2.5,10,FRHY,,\n';
  const keep = await planCSV('lith', blank);
  assert.equal(keep.summary.unchanged, 1);
  assert.equal(keep.summary.update, 0);
  const clear = await planCSV('lith', blank, { emptyCells: 'clear' });
  assert.equal(clear.summary.update, 1);
  assert.deepEqual(clear.update[0].changes, { alt1: ['ASER', null], comments: ['rhyolite', null] });
  // a required field is never cleared
  const req = await planCSV('lith', 'Hole Number,From,To,Lith1\nMU2601,2.5,10,\n', { emptyCells: 'clear' });
  assert.equal(req.summary.update, 0);
  assert.ok(req.warnings.some((w) => w.code === 'clear-required'));
});

test('unknown codes: reject (default) / addToList / keep', async () => {
  reset({ holes: [{ holeId: 'MU2601', eoh: 100 }] });
  const csv = 'Hole Number,From,To,Lith1\nMU2601,0,1,frhy\nMU2601,1,2,XYZ\nMU2601,2,3,XYZ\n';
  const rej = await planCSV('lith', csv);
  assert.equal(rej.summary.create, 1, 'lower-case code normalised to the list');
  assert.equal(rej.create[0].row.lith1, 'FRHY');
  assert.deepEqual(rej.unknownCodes, { LITH: { XYZ: 2 } });
  assert.equal(rej.errors.filter((e) => e.code === 'code-unknown').length, 2);

  const add = await planCSV('lith', csv, { unknownCodes: 'addToList' });
  assert.equal(add.summary.create, 3);
  assert.deepEqual(add.codeAdds.map((c) => `${c.list}:${c.code}`), ['LITH:XYZ']);
  const res = IM.commitImport(add);
  assert.ok(codeMap('LITH').get('XYZ')?.verify);
  undoBatch(res.batch);
  assert.equal(codeMap('LITH').get('XYZ'), undefined, 'undo removes the added code too');

  const keep = await planCSV('lith', csv, { unknownCodes: 'keep' });
  assert.equal(keep.summary.create, 3);
  assert.equal(keep.codeAdds.length, 0);
  assert.ok(keep.warnings.some((w) => w.code === 'code-kept'));
});

test('holes: not found → error; createMissingHoles; locked → explicit error; case-insensitive match', async () => {
  reset({ holes: [{ holeId: 'MU2601', eoh: 100 }, { holeId: 'MU2602', eoh: 50, locked: true }] });
  const csv = 'Hole Number,From,To,Lith1\nMU2699,0,1,COLL\nMU2602,0,1,COLL\nmu2601,0,1,COLL\n';
  const p = await planCSV('lith', csv);
  assert.equal(p.errors.find((e) => e.rowNo === 2).code, 'hole-not-found');
  assert.equal(p.errors.find((e) => e.rowNo === 3).code, 'locked');
  assert.equal(p.summary.create, 1);
  assert.equal(p.create[0].holeId, 'MU2601');
  assert.ok(p.warnings.some((w) => w.code === 'hole-case'));

  const p2 = await planCSV('lith', csv, { createMissingHoles: true });
  assert.deepEqual(p2.newHoles, ['MU2699']);
  assert.equal(p2.summary.create, 2);
  const r = IM.commitImport(p2);
  assert.ok(hole('MU2699'));
  assert.equal(rows('lith', 'MU2699').length, 1);
  undoBatch(r.batch);
  assert.equal(hole('MU2699'), null);
});

test('interval rules: from ≥ to, overlaps in file and vs existing, duplicates, beyond EOH', async () => {
  reset({ holes: [{ holeId: 'MU2601', eoh: 30 }] });
  IM.commitImport(await planCSV('lith', LITH));
  const csv = [
    'Hole Number,From,To,Lith1',
    'MU2601,20,25,FRHY', // ok (new)
    'MU2601,24,28,FRHY', // overlaps row 2 of this file
    'MU2601,5,8,IAND', // overlaps existing 2.5–10
    'MU2601,28,27,FRHY', // from > to
    'MU2601,20,25,RHD', // duplicate key of row 2
    'MU2601,29,35,FRHY', // past EOH 30 → warning only
  ].join('\n');
  const p = await planCSV('lith', csv);
  const byRow = Object.fromEntries(p.errors.map((e) => [e.rowNo, e.code]));
  assert.deepEqual(byRow, { 3: 'overlap', 4: 'overlap', 5: 'from-to', 6: 'dup' });
  assert.deepEqual(p.create.map((c) => c.rowNo), [2, 7]);
  assert.ok(p.warnings.some((w) => w.code === 'beyond-eoh' && w.rowNo === 7));
  assert.match(p.errors.find((e) => e.rowNo === 4).message, /Replace hole intervals/);
});

test('replaceHoleIntervals: rows not in the file are planned for delete (and listed)', async () => {
  reset({ holes: [{ holeId: 'MU2601', eoh: 100 }, { holeId: 'MU2603', eoh: 100 }] });
  IM.commitImport(await planCSV('lith', LITH + 'MU2603,0,5,COLL\n'));
  const corrected = 'Hole Number,From,To,Lith1\nMU2601,0,4,COLL\nMU2601,4,20,FRHY\n';
  const noRep = await planCSV('lith', corrected);
  assert.ok(noRep.errors.some((e) => e.code === 'overlap'));
  const rep = await planCSV('lith', corrected, { replaceHoleIntervals: true });
  assert.equal(rep.summary.errors, 0);
  assert.equal(rep.summary.create, 2);
  assert.equal(rep.summary.delete, 3);
  assert.ok(rep.delete.every((d) => d.holeId === 'MU2601'), 'other holes untouched');
  const r = IM.commitImport(rep);
  assert.deepEqual(rows('lith', 'MU2601').map((x) => [x.from, x.to]), [[0, 4], [4, 20]]);
  assert.equal(rows('lith', 'MU2603').length, 1);
  undoBatch(r.batch);
  assert.equal(rows('lith', 'MU2601').length, 3);

  // a hole with an error keeps its rows (no partial replace)
  const withErr = await planCSV('lith', corrected + 'MU2601,20,30,NOPE\n', { replaceHoleIntervals: true });
  assert.equal(withErr.summary.delete, 0);
  assert.ok(withErr.warnings.some((w) => w.code === 'replace-skipped'));
});

test('collar: lon/lat swap detected with a fix, >8 decimals rounded, comments and % limits', async () => {
  reset();
  const csv = 'Hole Number,Easting,Northing,Elevation,Final depth,Longitude,Latitude,REMARKS\n' + `MU2601,512000,5134000,1500,250,46.41234567891,95.91234567891,ok\nMU2602,512100,5134100,1500,200,95.912345678912,46.4,${'x'.repeat(501)}\nMU2603,512200,5134200,1500,200,95.9,46.4,${'y'.repeat(250)}\n`;
  const p = await planCSV('collar', csv);
  const sw = p.warnings.find((w) => w.code === 'lonlat-swapped');
  assert.ok(sw && sw.fix.option === 'swapLonLat');
  assert.equal(p.summary.lonlatSwaps, 1);
  assert.equal(p.create.find((c) => c.row.holeId === 'MU2601').row.lon, undefined, 'swapped values are not written unfixed');
  assert.equal(p.errors.find((e) => e.rowNo === 3).code, 'comment-long');
  assert.ok(p.warnings.some((w) => w.code === 'comment-soft' && w.rowNo === 4));

  const fixed = await planCSV('collar', csv, { swapLonLat: true });
  const mu1 = fixed.create.find((c) => c.row.holeId === 'MU2601').row;
  assert.equal(mu1.lon, 95.91234568);
  assert.equal(mu1.lat, 46.41234568);
  assert.ok(fixed.warnings.some((w) => w.code === 'lonlat-swapped-fixed'));
  assert.ok(fixed.warnings.some((w) => w.code === 'lonlat-rounded'));

  const pct = await planCSV('lith', 'Hole,From,To,Lith1,PY\nMU2603,0,1,COLL,120\n');
  assert.equal(pct.errors[0].code, 'pct-range');
});

test('workbook: collar + survey + lith in dependency order, one batch, one undo', async () => {
  reset();
  const read = async (name, text) => (await IM.readTabular({ name, text })).sheets[0];
  const lith = await read('Lithology.csv', 'Hole Number,From,To,Lith1\nMU2610,0,5,COLL\nMU2610,5,60,FRHY\n');
  const col = await read('Header.csv', 'Hole Number,Easting,Northing,Elevation,Final depth\nMU2610,512000,5134000,1500,50\n');
  const sv = await read('Survey.csv', 'Hole Number,Depth,Azimuth,Dip\nMU2610,0,90,-60\nMU2610,50,92,-58\n');
  const items = [lith, col, sv].map((s) => ({ table: IM.guessTable(s.name, s.headers), rows: s.rows, rowNos: s.rowNos, mapping: IM.autoMap(IM.guessTable(s.name, s.headers), s.headers), sheetName: s.name, fileName: 'mx.xlsx' }));
  const plans = IM.planWorkbook(items);
  assert.deepEqual(plans.map((p) => p.table), ['collar', 'survey', 'lith']);
  assert.equal(plans[2].summary.errors, 0, 'lith sees the hole created by the collar sheet');
  assert.ok(plans[2].warnings.some((w) => w.code === 'beyond-eoh'), 'EOH from the collar sheet is used');
  const before = batches().length;
  const r = IM.commitWorkbook(plans, { fileName: 'mx.xlsx' });
  assert.equal(batches().length, before + 1);
  assert.match(r.label, /Collar \/ header: 1 new, 0 updated; Downhole survey: 2 new, 0 updated; Lithology: 2 new, 0 updated/);
  assert.equal(rows('survey', 'MU2610').length, 2);
  undoBatch(r.batch);
  assert.equal(hole('MU2610'), null);
  assert.equal(rows('lith', 'MU2610').length, 0);
});

test('samples and assays: key by sample ID, hole derived, below-detection values, certificate from file name', async () => {
  reset({ holes: [{ holeId: 'MU2601', eoh: 100 }, { holeId: 'MU2602', eoh: 100 }] });
  const s = await planCSV('samples', 'Hole Number,From,To,Sample ID,Sample Type\nMU2601,0,1,S001,PRIM\nMU2601,1,2,S002,PRIM\n,,,S003,CRM\n');
  assert.equal(s.summary.create, 2);
  assert.equal(s.errors[0].code, 'hole-missing');
  IM.commitImport(s);
  // update without a hole column: hole comes from the existing sample
  const w = await planCSV('samples', 'Sample ID,Weight\ns001,3.2\n');
  assert.equal(w.summary.update, 1);
  assert.equal(w.update[0].holeId, 'MU2601');
  // moving a sample to another hole is shown as a change of hole
  const mv = await planCSV('samples', 'Sample ID,Hole Number\nS002,MU2602\n');
  assert.deepEqual(mv.update[0].changes, { holeId: ['MU2601', 'MU2602'] });
  IM.commitImport(mv);
  assert.equal(rows('samples', 'MU2602')[0].sampleId, 'S002');
  assert.equal(rows('samples', 'MU2601').length, 1);

  const a = await planCSV('assays', 'SAMPLE,Au_ppm,Cu_pct\nS001,<0.005,0.12\nS002,1.5,>10\nS999,1,1\n', {}, 'UL26123456.csv');
  assert.equal(a.summary.create, 2);
  assert.equal(a.errors[0].code, 'sample-not-found');
  const r1 = a.create.find((c) => c.row.sampleId === 'S001');
  assert.equal(r1.holeId, 'MU2601');
  assert.equal(r1.row.certificate, 'UL26123456');
  assert.deepEqual(r1.row.values, { Au_ppm: 0.0025, Cu_pct: 0.12 });
  assert.deepEqual(r1.row.flags, { Au_ppm: '<' });
  IM.commitImport(a);
  const again = await planCSV('assays', 'SAMPLE,Au_ppm,Cu_pct\nS001,<0.005,0.12\nS002,1.5,>10\n', {}, 'UL26123456.csv');
  assert.equal(again.summary.unchanged, 2, 're-import of the same certificate never duplicates');
});

test('missing key column is a plan-level error; required columns reported', () => {
  reset();
  const p = IM.planImport({ table: 'lith', rows: [{ Hole: 'A', Lith: 'COLL' }], mapping: { Hole: 'holeId', Lith: 'lith1' } });
  assert.ok(p.summary.fatal);
  assert.deepEqual(p.fatal.map((f) => f.field), ['from', 'to']);
  assert.deepEqual(IM.missingRequired('lith', { A: 'holeId', B: 'from', C: 'to' }), ['lith1']);
});

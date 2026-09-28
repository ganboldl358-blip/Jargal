// Export tests: node --test app/tests/export.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, mutate, emit } from '../src/core/store.js';
import { DEFAULT_LISTS, defaultSettings } from '../src/core/codes.js';
import { parseCSV, parseCSVObjects } from '../src/core/csv.js';
import { unzip } from '../src/core/zip.js';
import * as EX from '../src/core/export.js';

function build() {
  S.pid = 'test';
  S.adapter = null;
  S.project = { id: 'test', name: 'Red Hill (MU) 2026' };
  S.docs = new Map();
  S.lang = 'en';
  const ops = [];
  const up = (table, holeId, row) => ops.push({ type: 'upsert', table, holeId, row });
  for (const [list, items] of Object.entries(DEFAULT_LISTS)) items.forEach((c, i) => ops.push({ type: 'upsert', table: 'codes', row: { id: `${list}:${c.code}`, list, code: c.code, meaning: c.meaning, meaningMn: c.meaningMn, order: i, mxPending: c.mxPending || null, mxFallback: c.mxFallback || null } }));
  ops.push({ type: 'upsert', table: 'settings', row: { id: 'settings', ...defaultSettings() } });
  up('collar', 'MU2601', { holeId: 'MU2601', east: 512000, north: 5134000, rl: 1500, azimuth: 90, dip: -60, eoh: 30, lon: 95.912345678912, lat: 46.412345678912, remarks: 'line one\nline two' });
  up('collar', 'MU2602', { holeId: 'MU2602', east: 512100, north: 5134100, rl: 1500, azimuth: 0, dip: -90, eoh: 10 });
  up('survey', 'MU2601', { depth: 0, azimuth: 90, dip: -60 });
  up('survey', 'MU2601', { depth: 30, azimuth: 92, dip: -58, exclude: false });
  up('survey', 'MU2601', { depth: 15, azimuth: 150, dip: -10, exclude: true });
  // lith with a gap 5–8 and a tail gap 20–30 (EOH 30)
  up('lith', 'MU2601', { from: 0, to: 5, lith1: 'COLL', comments: 'soil' });
  up('lith', 'MU2601', { from: 8, to: 12, lith1: 'FRHYF', texture: 'VUG', alt1: 'AHEM' });
  up('lith', 'MU2601', { from: 12, to: 20, lith1: 'SCHRF', comments: 'z'.repeat(620) });
  up('lith', 'MU2602', { from: 0, to: 10, lith1: 'FRHY' });
  up('geotech', 'MU2601', { from: 0, to: 3, recovered: 2.7, rqd: 1.5 });
  up('struct', 'MU2601', { depth: 10, type: 'VN', alpha: 45, beta: 90 });
  up('samples', 'MU2601', { sampleId: 'S001', sampleType: 'PRIM', from: 8, to: 9 });
  up('samples', 'MU2601', { sampleId: 'S002', sampleType: 'CRM', crm: 'OREAS 504c' });
  up('assays', 'MU2601', { sampleId: 'S001', certificate: 'UL26123456', received: '2026-09-15', values: { Au_ppm: 1.234, Cu_pct: 0.5 }, flags: {} });
  up('assays', 'MU2601', { sampleId: 'S002', certificate: 'UL26123456', received: '2026-09-15', values: { Au_ppm: 1.6 }, flags: {} });
  up('pxrf', 'MU2601', { from: 8.5, to: 8.5, reading: '1', values: { Cu_ppm: 5000, Zn_ppm: 120 } });
  up('phys', 'MU2601', { depth: 9, sg: 2.71, magsus: 0.35 });
  mutate(ops, { label: 'seed' });
  emit();
}

const file = (res, name) => res.files.find((f) => f.name === name)?.data;
const objs = (csv) => parseCSVObjects(csv).rows;

test('Leapfrog: one CSV per table, field-key headers, depths 3 dp, true dip, samples joined with assays', () => {
  build();
  const res = EX.leapfrogExport();
  assert.deepEqual(res.files.map((f) => f.name), ['collar.csv', 'survey.csv', 'lithology.csv', 'recovery.csv', 'structure.csv', 'samples_assays.csv', 'qc_samples_assays.csv', 'pxrf.csv', 'density_magsus.csv', 'export_report.md']);
  const collar = parseCSV(file(res, 'collar.csv'));
  assert.equal(collar[0][0], 'holeId');
  assert.ok(collar[0].includes('east') && collar[0].includes('eoh'));
  assert.ok(!collar[0].includes('locked'));
  const lith = objs(file(res, 'lithology.csv'));
  assert.equal(lith[0].from, '0.000');
  assert.equal(lith[0].to, '5.000');
  assert.equal(lith[0].rockName, 'Colluvium', 'calculated rock name is included for Leapfrog');
  assert.equal(objs(file(res, 'survey.csv')).length, 2, 'excluded survey left out');
  const st = objs(file(res, 'structure.csv'))[0];
  assert.ok(st.dipCalc !== '' && st.dipDirCalc !== '', 'true dip / dip direction calculated');
  assert.ok(Number(st.dipCalc) >= 0 && Number(st.dipCalc) <= 90);
  const sa = objs(file(res, 'samples_assays.csv'));
  assert.equal(sa.length, 1);
  assert.equal(sa[0].sampleId, 'S001');
  assert.equal(sa[0].Au_ppm, '1.234');
  assert.equal(sa[0].Cu_pct, '0.5');
  assert.equal(objs(file(res, 'qc_samples_assays.csv'))[0].sampleId, 'S002');
  assert.equal(objs(file(res, 'pxrf.csv'))[0].Cu_ppm, '5000');
  assert.equal(objs(file(res, 'density_magsus.csv'))[0].sg, '2.71');
  assert.ok(file(res, 'recovery.csv').split('\n')[0].includes('recPct'));
  // hole selection
  const one = EX.leapfrogExport({ holeIds: ['MU2602'] });
  assert.equal(objs(file(one, 'lithology.csv')).length, 1);
});

test('MX: MX headers, no calculated columns, Not-measured gap fill, code fallbacks, 8-dp lon/lat, long text flagged not cut', () => {
  build();
  const res = EX.mxExport();
  assert.deepEqual(res.files.map((f) => f.name), ['1_Header.csv', '2_Survey.csv', '3_Lithology.csv', '4_Recovery.csv', '5_Structure.csv', '6_Samples.csv', '7_SG_MagSus.csv', 'export_report.md']);
  const hdr = parseCSV(file(res, '3_Lithology.csv'))[0];
  assert.deepEqual(hdr.slice(0, 4), ['Hole Number', 'From', 'To', 'Lith1']);
  for (const calc of ['Rock name', 'Total SLF %', 'rockName', 'totalSlf']) assert.ok(!hdr.includes(calc), calc);
  const rec = parseCSV(file(res, '4_Recovery.csv'))[0];
  for (const calc of ['Run length', 'Core loss (m)', 'Recovered %', 'RQD %']) assert.ok(!rec.includes(calc), calc);

  const lith = objs(file(res, '3_Lithology.csv')).filter((r) => r['Hole Number'] === 'MU2601');
  assert.deepEqual(lith.map((r) => [r.From, r.To, r.Lith1, r.Comments.slice(0, 12)]), [
    ['0', '5', 'COLL', 'soil'],
    ['5', '8', '', 'Not measured'],
    ['8', '12', 'FRHY', ''],
    ['12', '20', 'SCHR', 'zzzzzzzzzzzz'],
    ['20', '30', '', 'Not measured'],
  ]);
  assert.equal(lith[3].Comments.length, 620, 'long text is not cut');
  assert.equal(lith[2].Texture, '', 'VUG written blank');
  const rc = objs(file(res, '4_Recovery.csv'));
  assert.deepEqual(rc.map((r) => [r.From, r.To, r.REMARKS]), [['0', '3', ''], ['3', '30', 'Not measured']]);

  const col = objs(file(res, '1_Header.csv'));
  assert.equal(col[0].Longitude, '95.91234568');
  assert.equal(col[0].Latitude, '46.41234568');
  assert.equal(col[0].REMARKS, 'line one line two');

  const r = res.report;
  assert.equal(r.fills.length, 3);
  assert.deepEqual(r.fallbacks.map((f) => `${f.list}:${f.code}→${f.to}:${f.rows}`).sort(), ['LITH:FRHYF→FRHY:1', 'LITH:SCHRF→SCHR:1', 'TEXTURE:VUG→:1']);
  assert.equal(r.longComments.length, 1);
  assert.equal(r.longComments[0].length, 620);
  assert.equal(r.lonlatRounded, 2);
  const md = file(res, 'export_report.md');
  assert.match(md, /FRHYF \| FRHY/);
  assert.match(md, /Not measured/);
  assert.match(md, /620 characters/);
  assert.match(md, /Rock name/);
  assert.match(md, /Longitude\/latitude rounded to 8 decimals \(MX limit\): 2/);
});

test('MX: fallback off keeps the pending codes and flags them', () => {
  build();
  const res = EX.mxExport({ fallbackPendingCodes: false, holeIds: ['MU2601'] });
  const lith = objs(file(res, '3_Lithology.csv'));
  assert.ok(lith.some((r) => r.Lith1 === 'FRHYF'));
  assert.equal(res.report.fallbacks.length, 0);
  assert.equal(res.report.pendingKept.length, 3);
  assert.match(file(res, 'export_report.md'), /fallback off/);
  assert.ok(!objs(file(res, '1_Header.csv')).some((c) => c['Hole Number'] === 'MU2602'));
});

test('Mongolian report when the UI language is Mongolian', () => {
  build();
  const md = file(EX.mxExport({ lang: 'mn' }), 'export_report.md');
  assert.match(md, /MX Deposit экспорт/);
  assert.match(md, /Завсрыг «Not measured» мөрөөр нөхсөн/);
});

test('zip bundles and backup round trip', async () => {
  build();
  const z = EX.exportZip('mx');
  assert.match(z.fileName, /^ORD_Red_Hill_MU_2026_mx_\d{4}-\d{2}-\d{2}\.zip$/);
  const entries = await unzip(z.bytes);
  assert.equal(entries.length, 8);
  assert.ok(z.blob instanceof Blob);

  const b = EX.exportZip('backup');
  const inner = await unzip(b.bytes);
  assert.match(inner[0].name, /^ORD_Red_Hill_MU_2026_backup_.*\.json$/);
  const { obj, summary } = await EX.readBackup(b.bytes);
  assert.equal(obj.format, 'ord-project');
  assert.equal(summary.holes, 2);
  assert.equal(summary.assays, 2);
  const again = await EX.readBackup({ name: 'x.json', text: new TextDecoder().decode(inner[0].data) });
  assert.equal(again.summary.samples, 2);
  await assert.rejects(EX.readBackup('{"a":1}'), /Not an ORD project/);
});

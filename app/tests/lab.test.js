// Lab certificate parsing / import tests: node --test app/tests/lab.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, mutate, emit, rows, settings, undoBatch, assayValues } from '../src/core/store.js';
import { defaultSettings } from '../src/core/codes.js';
import { parseCSV } from '../src/core/csv.js';
import { loadXLSX } from '../src/core/importer.js';
import * as LAB from '../src/core/lab.js';

function reset() {
  S.pid = 'test';
  S.adapter = null;
  S.project = null;
  S.docs = new Map();
  const ops = [{ type: 'upsert', table: 'settings', row: { id: 'settings', ...defaultSettings(), elements: { Au_ppm: { lor: 0.005, unit: 'ppm', method: 'Au-AA23' } } } }];
  for (const h of ['MU2601', 'MU2602']) ops.push({ type: 'upsert', table: 'collar', holeId: h, row: { holeId: h, eoh: 100 } });
  const smp = [['MU0001', 'MU2601'], ['MU0002', 'MU2601'], ['MU0003', 'MU2602'], ['MU0004', 'MU2602']];
  smp.forEach(([sampleId, holeId], i) => ops.push({ type: 'upsert', table: 'samples', holeId, row: { sampleId, sampleType: 'PRIM', from: i, to: i + 1 } }));
  mutate(ops, { label: 'seed' });
  emit();
}

const ALS = [
  'ALS Mongolia LLC,,,,,,,',
  'CERTIFICATE UL26123456,,,,,,,',
  'Client: AZZURO RESOURCES,,,,,,,',
  'P.O. No.: ABM-26-07,,,,,,,',
  'Date Finalized: 15-SEP-2026,,,,,,,',
  ',,,,,,,',
  'SAMPLE,WEI-21,Au-AA23,Au-GRA21,ME-ICP61,ME-ICP61,ME-ICP61,ME-ICP61',
  'DESCRIPTION,Recvd Wt.,Au,Au,Ag,Cu,S,Be',
  ',kg,ppm,ppm,ppm,%,%,ppm',
  ',0.02,0.005,0.05,0.5,0.0001,0.01,0.5',
  'MU0001,2.10,<0.005,,<0.5,0.0123,1.20,0.6',
  'MU0002,1.90,>10.0,15.20,3.1,>10,NSS,<0.5',
  'mu 0003,2.00,0.456,,0.7,0.456,2.10,1.1',
  'STD OREAS 504c,0.10,1.61,,1.1,1.10,1.00,0.5',
  'MU9999,1.00,0.100,,1.0,1.00,1.00,0.5',
].join('\n');

test('ALS multi-row header: methods, analytes, units, LOR, flags, over-limit re-assay', () => {
  reset();
  const p = LAB.parseLab(parseCSV(ALS), { fileName: 'UL26123456_ABM-26-07.csv' });
  assert.equal(p.labJob, 'UL26123456');
  assert.equal(p.po, 'ABM-26-07');
  assert.equal(p.lab, 'ALS');
  assert.equal(p.reported, '2026-09-15');
  assert.deepEqual(
    p.elements.map((e) => [e.key, e.method, e.lor]),
    [
      ['Au_ppm', 'Au-AA23 / Au-GRA21', 0.005],
      ['Ag_ppm', 'ME-ICP61', 0.5],
      ['Cu_pct', 'ME-ICP61', 0.0001],
      ['S_pct', 'ME-ICP61', 0.01],
      ['Be_ppm', 'ME-ICP61', 0.5],
    ],
  );
  assert.equal(p.rows.length, 5);
  const [r1, r2] = p.rows;
  assert.deepEqual(r1.values, { Au_ppm: 0.0025, Ag_ppm: 0.25, Cu_pct: 0.0123, S_pct: 1.2, Be_ppm: 0.6 });
  assert.deepEqual(r1.flags, { Au_ppm: '<', Ag_ppm: '<' });
  assert.equal(r2.values.Au_ppm, 15.2, 'Au-GRA21 over-limit value replaces the >10 of Au-AA23');
  assert.equal(r2.flags.Au_ppm, undefined);
  assert.equal(r2.values.Cu_pct, 10);
  assert.equal(r2.flags.Cu_pct, '>');
  assert.equal(r2.values.S_pct, null);
  assert.equal(r2.flags.S_pct, 'NSS');
  assert.equal(r2.values.Be_ppm, 0.25);
  assert.ok(LAB.looksLikeLabCertificate({ matrix: parseCSV(ALS) }));
});

test('below-detection modes follow settings().belowDetection', () => {
  reset();
  for (const [mode, v] of [['half', 0.0025], ['lor', 0.005], ['zero', 0], ['negative', -0.005]]) {
    const p = LAB.parseLab(parseCSV(ALS), { fileName: 'x.csv', belowDetection: mode });
    assert.equal(p.rows[0].values.Au_ppm, v, mode);
  }
});

test('single header row styles and SGS-style labelled rows', () => {
  reset();
  const one = LAB.parseLab(parseCSV('Sample ID,Au-AA23 (ppm),Cu (%),Ag_ppm,Mo ppm\nMU0001,0.12,0.5,<0.5,12\nMU0002,1.5,1.2,3,<2\n'), { fileName: 'ABM-26-07.csv' });
  assert.deepEqual(one.elements.map((e) => e.key), ['Au_ppm', 'Cu_pct', 'Ag_ppm', 'Mo_ppm']);
  assert.equal(one.elements[0].method, 'Au-AA23');
  assert.equal(one.labJob, 'ABM-26-07');
  assert.equal(one.rows[1].flags.Mo_ppm, '<');
  assert.equal(one.rows[1].values.Mo_ppm, 1);

  const sgs = LAB.parseLab(
    parseCSV('SGS Mongolia LLC,,,\nJob: UB26-00123,,,\nSample ID,Au,Cu,As\nMethod,FAA505,ICP40B,ICP40B\nUnits,g/t,%,ppm\nDetection Limit,0.01,0.001,5\nMU0001,0.02,0.15,<5\nMU0002,2.34,1.2,120\n'),
    { fileName: 'sgs.csv' },
  );
  assert.equal(sgs.lab, 'SGS');
  assert.equal(sgs.labJob, 'UB26-00123');
  assert.deepEqual(sgs.elements.map((e) => [e.key, e.method, e.lor]), [['Au_gpt', 'FAA505', 0.01], ['Cu_pct', 'ICP40B', 0.001], ['As_ppm', 'ICP40B', 5]]);
  assert.deepEqual(sgs.rows[0].values, { Au_gpt: 0.02, Cu_pct: 0.15, As_ppm: 2.5 });

  const mn = LAB.parseLab(parseCSV('Дээжийн дугаар,Au г/т,Cu %\nMU0001,0.5,0.2\n'), { fileName: 'CGL_2026.csv' });
  assert.deepEqual(mn.elements.map((e) => e.key), ['Au_gpt', 'Cu_pct']);
  assert.equal(mn.rows[0].sampleId, 'MU0001');
});

test('XLSX certificate is read through readLabFile', async () => {
  reset();
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Notes'], ['nothing here']]), 'Info');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(parseCSV(ALS).map((r) => r.map((v) => (v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v)))), 'UL26123456');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const p = await LAB.readLabFile({ name: 'UL26123456.xlsx', buffer: buf });
  assert.equal(p.sheetName, 'UL26123456');
  assert.equal(p.rows.length, 5);
  assert.equal(p.rows[0].values.Cu_pct, 0.0123);
});

test('plan: match samples case/space-insensitively, list unmatched and lab QC, commit in one batch, re-import updates', () => {
  reset();
  const parsed = LAB.parseLab(parseCSV(ALS), { fileName: 'UL26123456.csv' });
  const plan = LAB.planLabImport(parsed, { certificate: 'UL26123456' });
  assert.equal(plan.summary.matched, 3);
  assert.deepEqual(plan.unmatched.map((u) => u.sampleId), ['MU9999']);
  assert.deepEqual(plan.labQc.map((u) => u.sampleId), ['STD OREAS 504c']);
  assert.equal(plan.summary.create, 3);
  const mu3 = plan.create.find((c) => c.sampleId === 'MU0003');
  assert.equal(mu3.holeId, 'MU2602');
  assert.equal(mu3.row.certificate, 'UL26123456');
  assert.equal(mu3.row.labJob, 'UL26123456');
  assert.equal(mu3.row.received, '2026-09-15');
  assert.ok(plan.elementUpdates.Cu_pct && plan.elementUpdates.Cu_pct.lor === 0.0001);
  assert.equal(plan.elementUpdates.Au_ppm, undefined, 'existing Au_ppm metadata is complete, kept');

  const res = LAB.commitLabImport(plan);
  assert.equal(res.created, 3);
  assert.match(res.label, /Lab certificate UL26123456: 3 new, 0 updated/);
  assert.equal(rows('assays').length, 3);
  assert.equal(settings().elements.Cu_pct.method, 'ME-ICP61');
  assert.equal(assayValues('MU0002').values.Au_ppm, 15.2);

  // same certificate again → unchanged, never duplicated
  const again = LAB.planLabImport(parsed, { certificate: 'UL26123456' });
  assert.ok(again.reimport);
  assert.equal(again.summary.create, 0);
  assert.equal(again.summary.unchanged, 3);

  // corrected certificate → update with a diff
  const fixed = LAB.parseLab(parseCSV(ALS.replace('mu 0003,2.00,0.456', 'mu 0003,2.00,0.512')), { fileName: 'UL26123456.csv' });
  const up = LAB.planLabImport(fixed, { certificate: 'UL26123456' });
  assert.equal(up.summary.update, 1);
  assert.deepEqual(up.update[0].changes, { 'values.Au_ppm': [0.456, 0.512] });
  const r2 = LAB.commitLabImport(up);
  assert.equal(assayValues('MU0003').values.Au_ppm, 0.512);
  undoBatch(r2.batch);
  assert.equal(assayValues('MU0003').values.Au_ppm, 0.456);
  undoBatch(res.batch);
  assert.equal(rows('assays').length, 0);
  assert.equal(settings().elements.Cu_pct, undefined, 'undo also reverts the element metadata');
});

test('unmatched rows only with opt-in (hole ""), later moved into the right hole', () => {
  reset();
  const parsed = LAB.parseLab(parseCSV(ALS), { fileName: 'UL26123456.csv' });
  const plan = LAB.planLabImport(parsed, { allowUnmatched: true });
  assert.equal(plan.summary.create, 5);
  assert.equal(plan.create.find((c) => c.sampleId === 'MU9999').holeId, '');
  LAB.commitLabImport(plan);
  mutate([{ type: 'upsert', table: 'samples', holeId: 'MU2601', row: { sampleId: 'MU9999', sampleType: 'PRIM' } }]);
  const again = LAB.planLabImport(parsed, { allowUnmatched: true });
  const mv = again.update.find((u) => u.sampleId === 'MU9999');
  assert.ok(!mv, 'values identical → unchanged even though the hole is now known');
  const changed = LAB.parseLab(parseCSV(ALS.replace('MU9999,1.00,0.100', 'MU9999,1.00,0.200')), { fileName: 'UL26123456.csv' });
  const p3 = LAB.planLabImport(changed, { allowUnmatched: true });
  assert.equal(p3.update.find((u) => u.sampleId === 'MU9999').moveTo, 'MU2601');
  LAB.commitLabImport(p3);
  assert.equal(rows('assays', 'MU2601').filter((a) => a.sampleId === 'MU9999').length, 1);
  assert.equal(rows('assays', '').filter((a) => a.sampleId === 'MU9999').length, 0);
});

test('a certificate without a name is refused', () => {
  reset();
  const plan = LAB.planLabImport({ rows: [], elements: [], certificate: '' }, {});
  assert.equal(plan.errors[0].code, 'no-certificate');
  assert.throws(() => LAB.commitLabImport(plan));
});

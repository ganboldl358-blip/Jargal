// Core engine tests: store (mutate / undo / merge), intervals, desurvey,
// structure orientation, validation rules, CSV, cloud chunking, demo build.
// Run: node --test app/tests/*.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { S, mutate, rows, undoBatch, history, mergeDocs, hole, settings, docKey, createProject, codeMap, renameHole } from '../src/core/store.js';
import { memoryAdapter } from '../src/core/persist.js';
import { overlaps, gaps, splitRow, gapFillers, coverage } from '../src/core/intervals.js';
import { buildTrace, dirVec } from '../src/core/desurvey.js';
import { alphaBetaToPlane } from '../src/core/structure.js';
import { validateHole, validateAll } from '../src/core/validate.js';
import { parseCSV, toCSV, parseCSVObjects } from '../src/core/csv.js';
import { encodeKey, decodeKey, chunkDoc } from '../src/core/cloud.js';
import { coerce } from '../src/core/coerce.js';
import { toNum, toISODate, natCmp } from '../src/core/util.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

async function freshProject() {
  S.adapter = memoryAdapter();
  S.projects = [];
  await createProject({ name: 'test' });
}

test('util: numbers, dates, natural sort', () => {
  assert.equal(toNum('1,5'), 1.5);
  assert.equal(toNum('1,234.5'), 1234.5);
  assert.equal(toNum(''), null);
  assert.equal(toNum('abc'), null);
  assert.equal(toISODate('7/19/2024'), '2024-07-19');
  assert.equal(toISODate('2024-7-9'), '2024-07-09');
  assert.equal(toISODate('19.07.2024'), '2024-07-19');
  assert.deepEqual(['OVD10', 'OVD2', 'OVD1'].sort(natCmp), ['OVD1', 'OVD2', 'OVD10']);
});

test('csv: quotes, newlines, delimiter detection, round trip', () => {
  const t = 'a;b;c\n1;"x;y";"he said ""hi"""\n2;"multi\nline";3\n';
  const r = parseCSV(t);
  assert.deepEqual(r[1], ['1', 'x;y', 'he said "hi"']);
  assert.equal(r[2][1], 'multi\nline');
  const out = toCSV([{ a: 'x,y', b: 2 }], ['a', 'b'], { bom: false });
  assert.equal(out, 'a,b\r\n"x,y",2\r\n');
  const o = parseCSVObjects('﻿Hole,From\nMU1,0\n');
  assert.deepEqual(o.rows, [{ Hole: 'MU1', From: '0' }]);
});

test('coerce by field type', () => {
  assert.equal(coerce({ type: 'num' }, ' 12,5 '), 12.5);
  assert.equal(coerce({ type: 'code' }, ' frhy '), 'FRHY');
  assert.equal(coerce({ type: 'bool' }, 'yes'), true);
  assert.equal(coerce({ type: 'date' }, '5/30/2023'), '2023-05-30');
  assert.equal(coerce({ type: 'text' }, ''), null);
});

test('intervals: overlaps, gaps, split, fill, coverage', () => {
  const L = [
    { id: 'a', from: 0, to: 2 },
    { id: 'b', from: 2, to: 5 },
    { id: 'c', from: 4.5, to: 6 },
    { id: 'd', from: 7, to: 9 },
  ];
  const o = overlaps(L);
  assert.equal(o.length, 1);
  assert.equal(o[0].b.id, 'c');
  assert.deepEqual(gaps(L), [{ from: 6, to: 7 }]);
  assert.deepEqual(gaps(L, { end: 10 }).at(-1), { from: 9, to: 10, tail: true });
  const [up, low] = splitRow({ id: 'x', from: 0, to: 4, lith1: 'FRHY', _t: 1 }, 1.5);
  assert.deepEqual(up, { id: 'x', to: 1.5 });
  assert.deepEqual(low, { from: 1.5, to: 4, lith1: 'FRHY' });
  assert.equal(splitRow({ from: 0, to: 4 }, 4), null);
  assert.equal(gapFillers(L, { fields: { comments: 'Not measured' } })[0].comments, 'Not measured');
  near(coverage(L), 8);
});

test('desurvey: vertical and straight inclined holes', () => {
  const v = buildTrace({ east: 1000, north: 2000, rl: 500, azimuth: 0, dip: -90, eoh: 100 }, []);
  const p = v.at(100).p;
  near(p[0], 1000);
  near(p[1], 2000);
  near(p[2], 400);
  // 60° down to the east: 100 m → dx = 50, dz = -86.6
  const s = buildTrace({ east: 0, north: 0, rl: 0, azimuth: 90, dip: -60, eoh: 100 }, [{ depth: 50, azimuth: 90, dip: -60 }]);
  const q = s.at(100).p;
  near(q[0], 50, 1e-6);
  near(q[1], 0, 1e-6);
  near(q[2], -86.60254, 1e-4);
  // curved hole: interpolated point stays on the arc (length preserved approx.)
  const c = buildTrace({ east: 0, north: 0, rl: 0, azimuth: 0, dip: -90, eoh: 100 }, [
    { depth: 0, azimuth: 0, dip: -90 },
    { depth: 100, azimuth: 0, dip: -60 },
  ]);
  const a = c.at(50).p;
  const b = c.at(100).p;
  assert.ok(a[1] > 0 && b[1] > a[1], 'hole bends north');
  const d = dirVec(0, -60);
  near(Math.hypot(...d), 1);
});

test('structure: alpha/beta to true dip / dip direction', () => {
  // vertical hole: alpha 90 → horizontal plane; alpha 0 → vertical plane
  const down = [0, 0, -1];
  near(alphaBetaToPlane(90, 0, down).dip, 0, 1e-9);
  near(alphaBetaToPlane(0, 0, down).dip, 90, 1e-9);
  near(alphaBetaToPlane(30, 0, down).dip, 60, 1e-9);
  // inclined hole to the north at -60; a plane at alpha 30, beta 180 (top of core)
  // is perpendicular to vertical?  check the known case: plane perpendicular to the hole
  const hole = dirVec(0, -60);
  const perp = alphaBetaToPlane(90, 0, hole);
  near(perp.dip, 30, 1e-9); // plane normal = hole axis, which plunges 60°
  near(perp.dipDir, 180, 1e-9); // normal points up-hole (south, up) → plane dips south
  // plane containing the hole axis and the horizontal (beta 0): dips with the hole, 60° north
  const par = alphaBetaToPlane(0, 0, hole);
  near(par.dip, 60, 1e-9);
  near(par.dipDir, 0, 1e-9);
});

test('store: mutate, history, undo, row-level merge', async () => {
  await freshProject();
  assert.ok(codeMap('LITH').get('FRHYF'), 'default LITH v4 list seeded');
  assert.equal(codeMap('LITH').size, 36);
  mutate([{ type: 'upsert', table: 'collar', holeId: 'MU1', row: { holeId: 'MU1', east: 500000, north: 5140000, rl: 1800, azimuth: 0, dip: -90, eoh: 10 } }]);
  const r1 = mutate(
    [
      { type: 'upsert', table: 'lith', holeId: 'MU1', row: { from: 0, to: 4, lith1: 'COLL' } },
      { type: 'upsert', table: 'lith', holeId: 'MU1', row: { from: 4, to: 10, lith1: 'FRHY' } },
    ],
    { label: 'log' },
  );
  assert.equal(r1.created, 2);
  assert.equal(rows('lith', 'MU1').length, 2);
  const id = rows('lith', 'MU1')[1].id;
  const r2 = mutate([{ type: 'upsert', table: 'lith', holeId: 'MU1', row: { id, lith1: 'CMSQ', comments: 'vuggy' } }], { label: 'edit' });
  assert.equal(r2.updated, 1);
  const e = history().find((h) => h.b === r2.batch);
  assert.deepEqual(e.c.lith1, ['FRHY', 'CMSQ']);
  // no-op edit is not recorded
  assert.equal(mutate([{ type: 'upsert', table: 'lith', holeId: 'MU1', row: { id, lith1: 'CMSQ' } }]).updated, 0);
  undoBatch(r2.batch);
  assert.equal(rows('lith', 'MU1')[1].lith1, 'FRHY');
  assert.equal(rows('lith', 'MU1')[1].comments, null);
  undoBatch(r1.batch);
  assert.equal(rows('lith', 'MU1').length, 0, 'undo of creation deletes (tombstones)');
  // merge: newer row wins, older ignored, new rows added
  const doc = S.docs.get(docKey('lith', 'MU1'));
  const row0 = doc.rows[0];
  mergeDocs([{ key: doc.key, holeId: 'MU1', table: 'lith', rows: [{ ...row0, _d: undefined, lith1: 'VMS', _t: row0._t + 1000 }, { id: 'remote1', holeId: 'MU1', from: 10, to: 12, lith1: 'MSUL', _t: 5 }], hist: [] }], { persist: false });
  const live = rows('lith', 'MU1');
  assert.equal(live.length, 2);
  assert.equal(live[0].lith1, 'VMS');
  mergeDocs([{ key: doc.key, holeId: 'MU1', table: 'lith', rows: [{ ...row0, lith1: 'OLD', _t: 1 }], hist: [] }], { persist: false });
  assert.equal(rows('lith', 'MU1')[0].lith1, 'VMS', 'older remote change ignored');
});

test('store: rename hole moves every table and is undoable', async () => {
  await freshProject();
  mutate([
    { type: 'upsert', table: 'collar', holeId: 'A1', row: { holeId: 'A1', east: 1, north: 1, rl: 1, eoh: 5 } },
    { type: 'upsert', table: 'lith', holeId: 'A1', row: { from: 0, to: 5, lith1: 'FRHY' } },
    { type: 'upsert', table: 'samples', holeId: 'A1', row: { from: 0, to: 1, sampleId: 'S1', sampleType: 'PRIM' } },
  ]);
  const res = renameHole('A1', 'B2');
  assert.ok(hole('B2'));
  assert.equal(hole('A1'), null);
  assert.equal(rows('lith', 'B2').length, 1);
  assert.equal(rows('samples', 'B2')[0].holeId, 'B2');
  undoBatch(res.batch);
  assert.ok(hole('A1'));
  assert.equal(hole('B2'), null);
});

test('validation: overlaps, gaps, codes, comments, chemistry rule, duplicates', async () => {
  await freshProject();
  mutate([
    { type: 'upsert', table: 'collar', holeId: 'V1', row: { holeId: 'V1', east: 500000, north: 5140000, rl: 1800, azimuth: 0, dip: -60, eoh: 20, lon: 46.4, lat: 95.9 } },
    { type: 'upsert', table: 'lith', holeId: 'V1', row: { from: 0, to: 5, lith1: 'FRHY' } },
    { type: 'upsert', table: 'lith', holeId: 'V1', row: { from: 4, to: 8, lith1: 'QRM' } },
    { type: 'upsert', table: 'lith', holeId: 'V1', row: { from: 9, to: 12, lith1: 'CMSQ', comments: 'x'.repeat(600) } },
    { type: 'upsert', table: 'lith', holeId: 'V1', row: { from: 12, to: 22, lith1: 'MT' } },
    { type: 'upsert', table: 'samples', holeId: 'V1', row: { from: 9, to: 10.5, sampleId: 'S1', sampleType: 'PRIM' } },
    { type: 'upsert', table: 'samples', holeId: 'V1', row: { from: 10.5, to: 12, sampleId: 'S1', sampleType: 'PRIM' } },
    { type: 'upsert', table: 'samples', holeId: 'V1', row: { sampleId: 'S3', sampleType: 'CRM' } },
    { type: 'upsert', table: 'assays', holeId: 'V1', row: { sampleId: 'S1', certificate: 'C1', values: { Al_pct: 3.2, S_pct: 0.4 } } },
    { type: 'upsert', table: 'geotech', holeId: 'V1', row: { from: 0, to: 3, recovered: 3.4, rqd: 1 } },
  ]);
  const rules = new Set(validateHole('V1').map((i) => i.rule));
  for (const r of ['I02', 'I03', 'I06', 'I07', 'I08', 'I04', 'C04', 'L01', 'P03', 'G01']) assert.ok(rules.has(r), `expected rule ${r}`);
  const all = validateAll();
  assert.ok(all.some((i) => i.rule === 'P01'), 'duplicate sample id across project');
});

test('cloud: key encoding round trip and chunking under the size limit', () => {
  for (const k of ['OVD001|lith', 'ARDH-2005-01|samples', '_|codes', 'МУ-01 /x|lith']) {
    const e = encodeKey(k);
    assert.match(e, /^[A-Za-z0-9_\-.:~]+$/);
    assert.equal(decodeKey(e), k);
  }
  const big = { key: 'H|assays', holeId: 'H', table: 'assays', t: 1, hist: [], rows: Array.from({ length: 3000 }, (_, i) => ({ id: 'r' + i, sampleId: 'S' + i, values: { Au_ppm: i / 7, Cu_pct: i / 13, Ag_ppm: 1, Zn_ppm: 2, S_pct: 3, Al_pct: 4, Fe_pct: 5 } })) };
  const chunks = chunkDoc(big);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(new TextEncoder().encode(JSON.stringify(c)).length < 256 * 1024);
  assert.equal(chunks.reduce((n, c) => n + c.rows.length, 0), 3000);
});

test('demo project builds and validates', async () => {
  await freshProject();
  const { buildDemo } = await import('../src/core/demo.js');
  const t0 = Date.now();
  buildDemo();
  const ms = Date.now() - t0;
  assert.ok(rows('collar').length >= 10);
  assert.ok(rows('lith').length > 200);
  assert.ok(rows('samples').some((s) => s.sampleType === 'CRM'));
  assert.ok(rows('assays').length > 500);
  const issues = validateAll();
  const r = new Set(issues.map((i) => i.rule));
  for (const x of ['I02', 'I03', 'I06', 'I07', 'I08', 'L01', 'S03']) assert.ok(r.has(x), `demo seeds ${x}`);
  assert.ok(ms < 8000, `demo build took ${ms} ms`);
  assert.ok(settings().elements.Au_ppm);
});

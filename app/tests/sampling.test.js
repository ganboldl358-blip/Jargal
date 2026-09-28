// node --test app/tests/sampling.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { S, mutate, rows, undoBatch } from '../src/core/store.js';
import {
  parseSampleId,
  nextSampleId,
  nextFreeId,
  sampleSeries,
  qcSlots,
  lithUnits,
  cutUnit,
  planSamples,
  sampleTicketRows,
  ticketTotals,
  nextDispatchId,
  dispatchPrefixOf,
  dispatchStatus,
  idLetters,
} from '../src/core/sampling.js';

S.pid = 'test';

const NO_QC = { crmEvery: 0, blankEvery: 0, dupEvery: 0 };
const QC = { crmEvery: 25, blankEvery: 25, blankOffset: 12, dupEvery: 20, dupType: 'FDUP', crmRotation: ['OREAS 504c', 'OREAS 235', 'OREAS 621'], blankCode: 'BLK-QTZ' };
const prims = (plan) => plan.items.filter((i) => i.kind === 'PRIM').map((i) => [i.row.from, i.row.to]);
const byId = (plan) => new Map(plan.rows.map((r) => [r.sampleId, r]));

test('sample ID parsing and incrementing keeps prefixes and zero padding', () => {
  assert.deepEqual(parseSampleId('MU260001'), { prefix: 'MU', num: 260001, width: 6, suffix: '' });
  assert.equal(nextSampleId('MU260001'), 'MU260002');
  assert.equal(nextSampleId('MU260009'), 'MU260010');
  assert.equal(nextSampleId('OVD-10001'), 'OVD-10002');
  assert.equal(nextSampleId('A099'), 'A100');
  assert.equal(nextSampleId('X999'), 'X1000');
  assert.equal(nextSampleId('MU2601-001'), 'MU2601-002');
  assert.equal(nextSampleId('S0009A'), 'S0010A');
  assert.equal(nextSampleId('MU260001', 5), 'MU260006');
  assert.equal(nextSampleId('ABC'), null);
  assert.equal(parseSampleId(''), null);
  assert.equal(idLetters('OVD-10001'), 'OVD');
  assert.equal(idLetters('mu2601'), 'MU');
});

test('next free ID follows the highest used ID of the same series', () => {
  const ids = ['MU260001', 'MU260015', 'MU260003', 'OVD-10001', 'OVD-10007'];
  assert.equal(nextFreeId(ids, 'MU260001'), 'MU260016');
  assert.equal(nextFreeId(ids, 'MU'), 'MU260016');
  assert.equal(nextFreeId(ids, 'OVD-'), 'OVD-10008');
  assert.equal(nextFreeId(ids, 'ZZ0001'), 'ZZ0001');
  assert.equal(nextFreeId(ids, 'ZZ'), 'ZZ0001');
  const series = sampleSeries(ids);
  assert.equal(series[0].prefix, 'MU');
  assert.equal(series[0].nextId, 'MU260016');
  assert.equal(series[1].nextId, 'OVD-10008');
});

test('QC slots are fixed by ticket number', () => {
  assert.deepEqual(qcSlots(260025, QC), { crm: true, blank: false, dup: false });
  assert.deepEqual(qcSlots(260012, QC), { crm: false, blank: true, dup: false });
  assert.deepEqual(qcSlots(260037, QC), { crm: false, blank: true, dup: false });
  assert.deepEqual(qcSlots(260040, QC), { crm: false, blank: false, dup: true });
  assert.deepEqual(qcSlots(260100, QC), { crm: true, blank: false, dup: true });
  assert.deepEqual(qcSlots(260001, NO_QC), { crm: false, blank: false, dup: false });
});

test('cutting: remnants shorter than min length fold into a neighbour or rebalance', () => {
  assert.deepEqual(cutUnit(0, 5.1, { nominal: 2, minLen: 0.3, maxLen: 2 }), [
    { from: 0, to: 2 },
    { from: 2, to: 4 },
    { from: 4, to: 5.1 },
  ]);
  // 0.1 m remnant cannot join a 2 m sample (max 2) → last two split evenly
  assert.deepEqual(cutUnit(0, 4.1, { nominal: 2, minLen: 0.3, maxLen: 2 }), [
    { from: 0, to: 2 },
    { from: 2, to: 3.05 },
    { from: 3.05, to: 4.1 },
  ]);
  // with 1 m target and 2 m max the remnant merges
  assert.deepEqual(cutUnit(0, 4.1, { nominal: 1, minLen: 0.3, maxLen: 2 }).map((p) => p.to), [1, 2, 3, 4.1]);
  // aligned to whole metres; short head and tail are absorbed
  assert.deepEqual(cutUnit(45.9, 47.1, { nominal: 1, minLen: 0.3, maxLen: 2, align: true }), [{ from: 45.9, to: 47.1 }]);
  assert.deepEqual(cutUnit(45.35, 48.8, { nominal: 1, minLen: 0.3, maxLen: 2, align: true }).map((p) => [p.from, p.to]), [
    [45.35, 46],
    [46, 47],
    [47, 48],
    [48, 48.8],
  ]);
  // unit shorter than min stays whole
  assert.deepEqual(cutUnit(3.5, 3.7, { nominal: 1, minLen: 0.3, maxLen: 2 }), [{ from: 3.5, to: 3.7 }]);
});

const LITH = [
  { from: 0, to: 3.5, lith1: 'FRHY' },
  { from: 3.5, to: 3.7, lith1: 'VQZ' },
  { from: 3.7, to: 6, lith1: 'FDAC' },
  { from: 6, to: 8, lith1: 'FDAC' }, // same code: not a contact
  { from: 8, to: 8.4, lith1: 'CL' },
  { from: 8.4, to: 10, lith1: 'FDAC' },
];

test('lith units merge equal codes and flag core loss', () => {
  const u = lithUnits(0, 10, LITH, { breakAt: 'lith', skipCodes: ['CL'] });
  assert.deepEqual(
    u.map((x) => [x.from, x.to, x.code, x.skip]),
    [
      [0, 3.5, 'FRHY', false],
      [3.5, 3.7, 'VQZ', false],
      [3.7, 8, 'FDAC', false],
      [8, 8.4, 'CL', true],
      [8.4, 10, 'FDAC', false],
    ],
  );
  const none = lithUnits(0, 10, LITH, { breakAt: 'none', skipCodes: ['CL'] });
  assert.deepEqual(
    none.map((x) => [x.from, x.to, x.skip]),
    [
      [0, 8, false],
      [8, 8.4, true],
      [8.4, 10, false],
    ],
  );
});

test('primary intervals never straddle a Lith1 contact and skip core loss', () => {
  const plan = planSamples({ holeId: 'H1', from: 0, to: 10, startId: 'MU260001', nominal: 1, maxLen: 2, minLen: 0.3, align: true, breakAt: 'lith', lithRows: LITH, qc: NO_QC });
  assert.equal(plan.ok, true);
  assert.deepEqual(prims(plan), [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 3.5],
    [3.5, 3.7],
    [3.7, 4],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 8],
    [8.4, 9],
    [9, 10],
  ]);
  for (const [a, b] of prims(plan)) {
    for (const c of [3.5, 3.7, 8, 8.4]) assert.ok(!(a < c && b > c), `${a}-${b} straddles ${c}`);
    assert.ok(!(a < 8.4 && b > 8), 'no sample in core loss');
  }
  assert.equal(plan.summary.skipped, 0.4);
  assert.equal(plan.summary.metres, 9.6);
  assert.ok(plan.warnings.some((w) => w.code === 'shortUnit'), 'narrow VQZ vein flagged');
  assert.ok(plan.warnings.some((w) => w.code === 'skipped'));
  // IDs run on without gaps
  assert.deepEqual(
    plan.rows.map((r) => r.sampleId),
    Array.from({ length: 12 }, (_, i) => `MU${260001 + i}`),
  );
  assert.equal(plan.summary.nextId, 'MU260013');
  assert.equal(plan.items[4].lith, 'VQZ');

  const loose = planSamples({ holeId: 'H1', from: 0, to: 10, startId: 'MU260001', nominal: 1, maxLen: 2, minLen: 0.3, align: true, breakAt: 'none', lithRows: LITH, qc: NO_QC });
  assert.ok(prims(loose).some(([a, b]) => a < 3.5 && b > 3.5), 'breakAt none ignores contacts');
  assert.ok(!prims(loose).some(([a, b]) => a < 8.4 && b > 8), 'but still skips core loss');
});

test('QC tags consume tickets: blanks, CRMs rotate, dups follow their parent', () => {
  const plan = planSamples({ holeId: 'H2', from: 0, to: 70, startId: 'MU260001', nominal: 1, maxLen: 1, minLen: 0.3, breakAt: 'none', qc: QC });
  assert.equal(plan.ok, true);
  const m = byId(plan);
  assert.equal(m.get('MU260012').sampleType, 'BLK');
  assert.equal(m.get('MU260012').crm, 'BLK-QTZ');
  assert.equal(m.get('MU260012').from, null);
  const dup = m.get('MU260020');
  assert.equal(dup.sampleType, 'FDUP');
  assert.equal(dup.parentId, 'MU260019');
  assert.equal(m.get('MU260019').sampleType, 'PRIM');
  assert.equal(dup.from, m.get('MU260019').from);
  assert.equal(dup.to, m.get('MU260019').to);
  assert.equal(m.get('MU260025').sampleType, 'CRM');
  assert.equal(m.get('MU260025').crm, 'OREAS 504c');
  assert.equal(m.get('MU260050').crm, 'OREAS 235');
  assert.equal(m.get('MU260075').crm, 'OREAS 621');
  assert.equal(m.get('MU260037').sampleType, 'BLK');
  assert.equal(m.get('MU260040').parentId, 'MU260039');
  // every ticket used exactly once, in order
  plan.rows.forEach((r, i) => assert.equal(r.sampleId, `MU${260001 + i}`));
  const s = plan.summary;
  assert.equal(s.primary, 70);
  assert.equal(s.primary + s.crm + s.blank + s.dup, s.total);
  assert.equal(s.crm, 3);
  assert.equal(s.blank, 3);
  assert.equal(s.dup, 3);
  assert.equal(s.total, 79);
  assert.equal(s.lastId, 'MU260079');
  assert.equal(s.metres, 70);
  assert.equal(s.firstId, 'MU260001');
  assert.equal(s.nextId, nextSampleId(s.lastId));
  // primaries stay in depth order
  const p = prims(plan);
  for (let i = 1; i < p.length; i++) assert.equal(p[i][0], p[i - 1][1]);
});

test('QC collisions: CRM wins, displaced dup goes right after the next primary', () => {
  const plan = planSamples({ holeId: 'H3', from: 0, to: 8, startId: 'T0095', nominal: 1, maxLen: 1, minLen: 0.3, breakAt: 'none', qc: { crmEvery: 25, dupEvery: 20, crmRotation: ['STD-A'] } });
  const seq = plan.rows.map((r) => `${r.sampleId}:${r.sampleType}${r.parentId ? '<' + r.parentId : ''}`);
  assert.deepEqual(seq.slice(0, 8), ['T0095:PRIM', 'T0096:PRIM', 'T0097:PRIM', 'T0098:PRIM', 'T0099:PRIM', 'T0100:CRM', 'T0101:PRIM', 'T0102:FDUP<T0101']);

  // a dup slot on the very first ticket has no parent yet: primary first, dup next
  const first = planSamples({ holeId: 'H3', from: 0, to: 3, startId: 'T0020', nominal: 1, maxLen: 1, qc: { dupEvery: 20, dupType: 'CDUP' } });
  assert.deepEqual(
    first.rows.map((r) => [r.sampleId, r.sampleType, r.parentId ?? null]),
    [
      ['T0020', 'PRIM', null],
      ['T0021', 'CDUP', 'T0020'],
      ['T0022', 'PRIM', null],
      ['T0023', 'PRIM', null],
    ],
  );
});

test('refuses to reuse IDs and warns on overlaps with existing samples', () => {
  const base = { holeId: 'H4', from: 0, to: 6, startId: 'MU260001', nominal: 1, maxLen: 2, minLen: 0.3, qc: NO_QC };
  const reuse = planSamples({ ...base, existing: new Set(['MU260004', 'MU260099']) });
  assert.equal(reuse.ok, false);
  const e = reuse.errors.find((x) => x.code === 'idExists');
  assert.ok(e);
  assert.match(e.params.ids, /MU260004/);
  assert.ok(!/MU260099/.test(e.params.ids));
  assert.equal(reuse.rows.length, 6, 'the plan is still returned for preview');

  const ov = planSamples({ ...base, holeSamples: [{ sampleId: 'OLD1', from: 2, to: 4, sampleType: 'PRIM' }, { sampleId: 'OLDCRM', sampleType: 'CRM' }] });
  assert.equal(ov.ok, true);
  const w = ov.warnings.find((x) => x.code === 'overlap');
  assert.ok(w);
  assert.equal(w.params.n, 2);
  assert.equal(ov.overlaps[0].existingId, 'OLD1');

  // `existing` may be sample rows: IDs are checked project-wide, overlaps for this hole only
  const rowsIn = planSamples({ ...base, existing: [{ sampleId: 'X1', holeId: 'H4', from: 5, to: 7 }, { sampleId: 'MU260002', holeId: 'OTHER', from: 0, to: 6 }] });
  assert.ok(rowsIn.errors.some((x) => x.code === 'idExists'));
  assert.equal(rowsIn.warnings.find((x) => x.code === 'overlap').params.n, 1);
});

test('input validation', () => {
  assert.ok(planSamples({ holeId: 'H', from: 5, to: 5, startId: 'A1' }).errors.some((e) => e.code === 'range'));
  assert.ok(planSamples({ holeId: 'H', from: 0, to: 5, startId: 'ABC' }).errors.some((e) => e.code === 'startId'));
  assert.ok(planSamples({ holeId: 'H', from: 0, to: 5, startId: 'A1', maxLen: 0.2, minLen: 0.5 }).errors.some((e) => e.code === 'lengths'));
  assert.ok(planSamples({ from: 0, to: 5, startId: 'A1' }).errors.some((e) => e.code === 'hole'));
  const allLoss = planSamples({ holeId: 'H', from: 0, to: 2, startId: 'A1', lithRows: [{ from: 0, to: 2, lith1: 'CL' }] });
  assert.ok(allLoss.errors.some((e) => e.code === 'nothing'));
  const noLith = planSamples({ holeId: 'H', from: 0, to: 2, startId: 'A1', qc: NO_QC });
  assert.ok(noLith.warnings.some((w) => w.code === 'noLith'));
  assert.ok(planSamples({ holeId: 'H', from: 0, to: 30, startId: 'A1', maxLen: 1, qc: { crmEvery: 25, crmRotation: [] } }).warnings.some((w) => w.code === 'noCrm'));
});

test('store round trip: plan from logged lith, commit as one batch, undo', () => {
  mutate(
    [
      { type: 'upsert', table: 'collar', holeId: 'MU2601', row: { holeId: 'MU2601', eoh: 12 } },
      ...LITH.map((r) => ({ type: 'upsert', table: 'lith', holeId: 'MU2601', row: r })),
      { type: 'upsert', table: 'samples', holeId: 'MU2605', row: { sampleId: 'MU260001', from: 0, to: 1, sampleType: 'PRIM' } },
    ],
    { label: 'fixture' },
  );
  const existing = rows('samples').map((s) => s.sampleId);
  const startId = nextFreeId(existing, 'MU260001');
  assert.equal(startId, 'MU260002');
  const plan = planSamples({
    holeId: 'MU2601',
    from: 0,
    to: 10,
    startId,
    nominal: 1,
    maxLen: 2,
    minLen: 0.3,
    align: true,
    lithRows: rows('lith', 'MU2601'),
    holeSamples: rows('samples', 'MU2601'),
    existing,
    qc: QC,
  });
  assert.equal(plan.ok, true);
  assert.equal(plan.summary.blank, 1); // MU260012
  const res = mutate(
    plan.rows.map((row) => ({ type: 'upsert', table: 'samples', holeId: 'MU2601', row })),
    { label: 'Generate samples' },
  );
  assert.equal(res.created, plan.rows.length);
  assert.equal(rows('samples', 'MU2601').length, plan.rows.length);
  assert.ok(rows('samples', 'MU2601').every((s) => s.holeId === 'MU2601'));

  // generating again from the same start ID is refused
  const again = planSamples({ holeId: 'MU2601', from: 0, to: 10, startId, existing: rows('samples'), holeSamples: rows('samples', 'MU2601'), qc: NO_QC });
  assert.equal(again.ok, false);
  assert.ok(again.warnings.some((w) => w.code === 'overlap'));

  undoBatch(res.batch);
  assert.equal(rows('samples', 'MU2601').length, 0);
});

test('ticket rows and totals per type', () => {
  const list = [
    { sampleId: 'MU260003', holeId: 'H', sampleType: 'CRM', crm: 'OREAS 235', weight: 0.06 },
    { sampleId: 'MU260001', holeId: 'H', from: 0, to: 1.2, sampleType: 'PRIM', weight: 3.1 },
    { sampleId: 'MU260002', holeId: 'H', from: 0, to: 1.2, sampleType: 'FDUP', parentId: 'MU260001', weight: 1.5 },
    { sampleId: 'MU260010', holeId: 'H', from: 1.2, to: 2, weight: 2 },
    { sampleId: 'MU260004', holeId: 'H', sampleType: 'BLK', crm: 'BLK-QTZ' },
  ];
  const t = sampleTicketRows(list);
  assert.deepEqual(
    t.map((r) => r.sampleId),
    ['MU260001', 'MU260002', 'MU260003', 'MU260004', 'MU260010'],
  );
  assert.equal(t[0].note, '0.00–1.20 m');
  assert.equal(t[0].length, 1.2);
  assert.equal(t[1].ref, 'MU260001');
  assert.equal(t[2].ref, 'OREAS 235');
  assert.equal(t[4].type, 'PRIM');
  assert.equal(t[3].from, null);
  const tot = ticketTotals(t);
  assert.equal(tot.n, 5);
  assert.equal(tot.weight, 6.66);
  assert.equal(tot.metres, 2);
  assert.deepEqual(
    tot.types.map((x) => [x.type, x.n]),
    [
      ['PRIM', 2],
      ['CRM', 1],
      ['BLK', 1],
      ['FDUP', 1],
    ],
  );
  assert.equal(tot.types.find((x) => x.type === 'BLK').weighed, 0);
});

test('dispatch numbering and status', () => {
  const ids = ['MU-DSP-2026-013', 'MU-DSP-2026-009', 'MU-DSP-2025-044', 'OV-DSP-2026-100', 'junk'];
  assert.equal(nextDispatchId(ids, 'MU', 2026), 'MU-DSP-2026-014');
  assert.equal(nextDispatchId(ids, 'MU', 2027), 'MU-DSP-2027-001');
  assert.equal(nextDispatchId(ids, 'OV', 2026), 'OV-DSP-2026-101');
  assert.equal(nextDispatchId([], 'MU', 2026), 'MU-DSP-2026-001');
  assert.equal(dispatchPrefixOf('MU-DSP-2026-013'), 'MU');
  assert.equal(dispatchPrefixOf('whatever'), null);

  const smp = [{ sampleId: 'a' }, { sampleId: 'b' }];
  const none = () => false;
  assert.equal(dispatchStatus({ status: 'draft' }, smp, none).status, 'draft');
  assert.equal(dispatchStatus({ dispatched: '2026-09-01', status: 'dispatched' }, smp, none).status, 'dispatched');
  assert.equal(dispatchStatus({ dispatched: '2026-09-01', received: '2026-09-03' }, smp, none).status, 'received');
  const part = dispatchStatus({ dispatched: '2026-09-01' }, smp, (s) => s.sampleId === 'a');
  assert.deepEqual(part, { status: 'partial', n: 2, assayed: 1 });
  assert.equal(dispatchStatus({ dispatched: '2026-09-01' }, smp, () => true).status, 'results');
  assert.equal(dispatchStatus({ dispatched: '2026-09-01' }, [], () => true).status, 'dispatched');
});

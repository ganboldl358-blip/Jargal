// QA/QC logic tests: node --test app/tests/qaqc.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S, mutate, emit, setSettings } from '../src/core/store.js';
import * as QC from '../src/core/qaqc.js';

const EL = 'Au_ppm';
const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, msg || `${a} ≉ ${b}`);

function reset() {
  S.pid = 'test';
  S.adapter = null;
  S.project = null;
  S.docs = new Map();
  emit();
}

/**
 * Build a project from compact sample specs:
 *   [sampleId, type, value | null, {job, date, crm, parentId, hole, flag, from, to, dispatch}]
 * value null = sample exists but was never assayed.
 */
function build(specs, { crms = [], dispatch = [], settings, element = EL } = {}) {
  reset();
  const ops = [];
  for (const [sampleId, sampleType, value, o = {}] of specs) {
    const holeId = o.hole || 'H1';
    ops.push({
      type: 'upsert',
      table: 'samples',
      holeId,
      row: { sampleId, sampleType, crm: o.crm ?? null, parentId: o.parentId ?? null, dispatchId: o.dispatch ?? 'D1', from: o.from ?? null, to: o.to ?? null },
    });
    if (value !== null && value !== undefined) {
      ops.push({
        type: 'upsert',
        table: 'assays',
        holeId,
        row: { sampleId, labJob: o.job ?? 'J1', certificate: (o.job ?? 'J1') + '.csv', received: o.date ?? '2026-03-01', values: { [element]: value }, flags: o.flag ? { [element]: o.flag } : {} },
      });
    }
  }
  for (const row of crms) ops.push({ type: 'upsert', table: 'crms', row });
  for (const row of dispatch) ops.push({ type: 'upsert', table: 'dispatch', row });
  mutate(ops, { label: 'test data' });
  if (settings) setSettings(settings);
}

const OREAS = { code: 'OREAS 504c', element: EL, expected: 1.0, sd: 0.05, supplier: 'OREAS' };

// ------------------------------------------------------------------ CRMs

test('CRM z-scores, pass/warn/fail limits and Westgard 2x2SD', () => {
  build(
    [
      ['S001', 'PRIM', 0.4],
      ['S002', 'CRM', 1.0, { crm: 'OREAS 504c' }], // z 0     pass
      ['S003', 'CRM', 1.12, { crm: 'OREAS 504c' }], // z 2.4  warn
      ['S004', 'CRM', 1.13, { crm: 'OREAS 504c' }], // z 2.6  warn -> fail (2x2SD, same side)
      ['S005', 'CRM', 0.97, { crm: 'OREAS 504c' }], // z -0.6 pass
      ['S006', 'CRM', 0.88, { crm: 'OREAS 504c' }], // z -2.4 warn
      ['S007', 'CRM', 1.2, { crm: 'OREAS 504c' }], //  z 4    fail (limit)
      ['S008', 'CRM', 0.89, { crm: 'OREAS 504c' }], // z -2.2 warn (previous was on the other side)
      ['S009', 'CRM', 0.5, { crm: 'OREAS 999' }], //   no definition
      ['S010', 'CRM', null, { crm: 'OREAS 504c' }], // not assayed
    ],
    { crms: [OREAS] },
  );
  const res = QC.crmResults(EL);
  assert.deepEqual(res.map((r) => r.sampleId), ['S002', 'S003', 'S004', 'S005', 'S006', 'S007', 'S008']);
  assert.deepEqual(res.map((r) => r.status), ['pass', 'warn', 'fail', 'pass', 'warn', 'fail', 'warn']);
  assert.equal(res[2].rule, '2x2SD');
  assert.equal(res[5].rule, 'limit');
  assert.equal(res[6].rule, null);
  close(res[1].z, 2.4);
  close(res[5].z, 4);
  assert.equal(res[0].crm, 'OREAS 504c');
  assert.equal(res[0].expected, 1);
  assert.equal(res[0].labJob, 'J1');
  assert.equal(res[0].seq, 2, 'sequence counts every assayed sample');

  const undef = QC.crmUndefined(EL);
  assert.equal(undef.length, 1);
  assert.equal(undef[0].crm, 'OREAS 999');
  assert.equal(undef[0].reason, 'missing');
});

test('two consecutive warns on opposite sides do not trigger 2x2SD', () => {
  build(
    [
      ['A1', 'CRM', 1.11, { crm: 'OREAS 504c' }],
      ['A2', 'CRM', 0.89, { crm: 'OREAS 504c' }],
    ],
    { crms: [OREAS] },
  );
  assert.deepEqual(QC.crmResults(EL).map((r) => r.status), ['warn', 'warn']);
});

test('CRM codes match loosely and ordering follows batch report date, then sample id', () => {
  build(
    [
      ['X10', 'CRM', 1.0, { crm: 'oreas-504C', job: 'A-JOB', date: '2026-05-01' }],
      ['X02', 'CRM', 1.01, { crm: 'OREAS504c', job: 'B-JOB', date: '2026-04-01' }],
      ['X01', 'CRM', 0.99, { crm: 'OREAS 504c', job: 'B-JOB', date: '2026-04-01' }],
    ],
    { crms: [OREAS] },
  );
  const res = QC.crmResults(EL);
  assert.deepEqual(res.map((r) => r.sampleId), ['X01', 'X02', 'X10']);
  assert.deepEqual(res.map((r) => r.seq), [1, 2, 3]);
  assert.deepEqual(res.map((r) => r.batch), ['B-JOB', 'B-JOB', 'A-JOB']);
  // filters never change statuses
  assert.deepEqual(QC.crmResults(EL, { batch: 'A-JOB' }).map((r) => r.sampleId), ['X10']);
  assert.equal(QC.crmResults(EL, { crmCode: 'oreas 504c' }).length, 3);
  assert.equal(QC.crmResults(EL, { crmCode: 'OREAS 235' }).length, 0);
});

test('CRM summary: mean, bias %, pass rate and drift per 100 samples', () => {
  const specs = [];
  for (let i = 1; i <= 10; i++) specs.push([`C${String(i).padStart(2, '0')}`, 'CRM', 10 + 0.02 * i, { crm: 'STD-A' }]);
  build(specs, { crms: [{ code: 'STD-A', element: EL, expected: 10, sd: 0.1 }] });
  const [s] = QC.crmSummary(EL);
  assert.equal(s.crm, 'STD-A');
  assert.equal(s.n, 10);
  close(s.mean, 10.11);
  close(s.bias, 1.1);
  close(s.drift, 2, 1e-9, 'slope 0.02 per sample = 2 per 100 samples');
  close(s.driftPct, 20);
  // z = 0.2i: i 1..10 -> pass up to z 2.0 (i<=10 gives z<=2.0) -> all pass
  assert.equal(s.nPass, 10);
  assert.equal(s.passRate, 100);
  assert.equal(s.biasStatus, 'ok');
});

// ------------------------------------------------------------------ blanks

test('blank threshold = blankFactor × LOR, preceding high-grade sample flags carry-over', () => {
  build(
    [
      ['B001', 'PRIM', 0.2],
      ['B002', 'BLK', 0.003, { crm: 'BLK-QTZ' }], // pass, preceded by 0.2
      ['B003', 'PRIM', 12.5],
      ['B004', 'CRM', 1.0, { crm: 'OREAS 504c' }], // CRMs are skipped when looking back
      ['B005', 'BLK', 0.08, { crm: 'BLK-QTZ' }], // fail, preceded by 12.5 g/t
      ['B006', 'CRM', 0.004, { crm: 'OREAS 22h' }], // certified blank material
      ['C001', 'BLK', 0.01, { job: 'J2', date: '2026-03-05' }], // first sample of its batch
    ],
    {
      crms: [OREAS, { code: 'OREAS 22h', element: EL, expected: 0.001, sd: 0.001, isBlank: true }],
      settings: { elements: { [EL]: { lor: 0.005, unit: 'ppm' } }, qc: { highGrade: { [EL]: 5 } } },
    },
  );
  const res = QC.blankResults(EL);
  assert.deepEqual(res.map((r) => r.sampleId), ['B002', 'B005', 'B006', 'C001']);
  close(res[0].threshold, 0.05);
  assert.equal(res[0].lorSource, 'settings');
  assert.deepEqual(res.map((r) => r.status), ['pass', 'fail', 'pass', 'pass']);
  assert.equal(res[0].prevId, 'B001');
  assert.equal(res[0].carryOver, false);
  assert.equal(res[1].prevId, 'B003');
  assert.equal(res[1].prevValue, 12.5);
  assert.equal(res[1].carryOver, true);
  assert.equal(res[3].prevId, null, 'no look-back across batches');
  // certified blanks are not charted as CRMs
  assert.deepEqual(QC.crmResults(EL).map((r) => r.sampleId), ['B004']);
});

test('LOR is inferred from below-detection values, then falls back to defaults', () => {
  build([
    ['L1', 'PRIM', 0.0025, { flag: '<' }],
    ['L2', 'PRIM', 0.0025, { flag: '<' }],
    ['L3', 'PRIM', 0.005, { flag: '<' }],
    ['L4', 'BLK', 0.02],
  ]);
  assert.deepEqual(QC.elementLOR(EL), { lor: 0.005, source: 'data' }); // belowDetection 'half'
  const [b] = QC.blankResults(EL);
  close(b.threshold, 0.05);
  assert.deepEqual(QC.elementLOR('Cu_ppm'), { lor: 1, source: 'default' });
  // high-grade default: max(P95 of primaries, 100 × LOR)
  close(QC.highGradeThreshold(EL).value, 0.5);
});

// -------------------------------------------------------------- duplicates

test('duplicate pairs: HARD, status by type, near-LOR pairs excluded from stats', () => {
  build(
    [
      ['P10', 'PRIM', 1.0],
      ['D10', 'FDUP', 1.2, { parentId: 'P10' }], // HARD 9.09 pass
      ['P11', 'PRIM', 1.0],
      ['D11', 'FDUP', 2.0, { parentId: 'P11' }], // HARD 33.3 fail (limit 30)
      ['P12', 'PRIM', 0.01],
      ['D12', 'FDUP', 0.03, { parentId: 'P12' }], // both < 10×LOR -> listed, excluded
      ['P13', 'PRIM', 2.0],
      ['D13', 'PDUP', 2.3, { parentId: 'P13' }], // HARD 6.98 pass (limit 10)
      ['D14', 'FDUP', 0.5], // no parent id
      ['D15', 'CDUP', 0.5, { parentId: 'NOPE' }], // unknown parent
      ['P16', 'PRIM', null],
      ['D16', 'FDUP', 0.7, { parentId: 'P16' }], // parent not assayed
      ['D17', 'FDUP', null, { parentId: 'P10' }], // duplicate not assayed: ignored
    ],
    { settings: { elements: { [EL]: { lor: 0.005 } } } },
  );
  const pairs = QC.duplicatePairs(EL);
  assert.deepEqual(pairs.map((p) => p.dupId), ['D10', 'D11', 'D12', 'D13']);
  const [p10, p11, p12, p13] = pairs;
  assert.equal(p10.a, 1.0);
  assert.equal(p10.b, 1.2);
  close(p10.hard, (0.2 / 2.2) * 100);
  close(p10.relDiff, (0.2 / 1.1) * 100);
  close(p10.mean, 1.1);
  assert.equal(p10.status, 'pass');
  assert.equal(p11.status, 'fail');
  assert.equal(p12.lowGrade, true);
  assert.equal(p13.type, 'PDUP');
  assert.equal(p13.limit, 10);
  assert.equal(p13.status, 'pass');

  const issues = QC.duplicateIssues(EL);
  assert.deepEqual(
    issues.map((i) => [i.dupId, i.problem]),
    [
      ['D14', 'noParent'],
      ['D15', 'parentMissing'],
      ['D16', 'parentNoAssay'],
    ],
  );

  const sum = QC.duplicateSummary(EL);
  const f = sum.find((s) => s.type === 'FDUP');
  assert.equal(f.n, 3);
  assert.equal(f.nLow, 1);
  assert.equal(f.nUsed, 2);
  assert.equal(f.nPass, 1);
  assert.equal(f.passRate, 50);
  assert.equal(f.status, 'fail');
  const cvs = [p10, p11].map((p) => Math.SQRT2 * p.hard);
  close(f.cv, Math.sqrt((cvs[0] ** 2 + cvs[1] ** 2) / 2));
  const pd = sum.find((s) => s.type === 'PDUP');
  assert.equal(pd.passRate, 100);
  assert.equal(pd.status, 'ok');
  assert.equal(QC.duplicatePairs(EL, { type: 'PDUP' }).length, 1);
});

// --------------------------------------------------------- insertion rates

test('rateStatus against a 1-in-N target', () => {
  assert.equal(QC.rateStatus(4, 100, 25), 'ok');
  assert.equal(QC.rateStatus(3, 100, 25), 'ok'); // within 10 %
  assert.equal(QC.rateStatus(2, 100, 25), 'warn');
  assert.equal(QC.rateStatus(1, 100, 25), 'fail');
  assert.equal(QC.rateStatus(0, 10, 25), 'ok'); // too few samples to expect one
  assert.equal(QC.rateStatus(0, 0, 25), 'na');
});

test('insertion rates per hole and per dispatch', () => {
  const specs = [];
  let n = 0;
  const id = () => `I${String(++n).padStart(4, '0')}`;
  for (let i = 0; i < 50; i++) specs.push([id(), 'PRIM', null, { hole: 'H1', from: i, to: i + 1, dispatch: 'D1' }]);
  for (let i = 0; i < 2; i++) specs.push([id(), 'CRM', null, { hole: 'H1', crm: 'OREAS 504c', dispatch: 'D1' }]);
  for (let i = 0; i < 2; i++) specs.push([id(), 'BLK', null, { hole: 'H1', dispatch: 'D1' }]);
  for (let i = 0; i < 2; i++) specs.push([id(), 'FDUP', null, { hole: 'H1', dispatch: 'D1' }]);
  for (let i = 0; i < 100; i++) specs.push([id(), 'PRIM', null, { hole: 'H2', from: i * 2, to: i * 2 + 2, dispatch: 'D2' }]);
  specs.push([id(), 'CRM', null, { hole: 'H2', dispatch: 'D2' }]);
  for (let i = 0; i < 2; i++) specs.push([id(), 'BLK', null, { hole: 'H2', dispatch: 'D2' }]);
  for (let i = 0; i < 5; i++) specs.push([id(), 'CDUP', null, { hole: 'H2', dispatch: 'D2' }]);
  build(specs, { dispatch: [{ batchId: 'D2', lab: 'ALS Ulaanbaatar', labJob: 'UB26001' }] });

  const ins = QC.insertionRates();
  const [h1, h2] = ins.holes;
  assert.equal(h1.key, 'H1');
  assert.equal(h1.primaries, 50);
  assert.equal(h1.meters, 50);
  assert.equal(h1.crms, 2);
  close(h1.crm.oneIn, 25);
  assert.equal(h1.status, 'ok');
  assert.equal(h2.meters, 200);
  assert.equal(h2.crm.status, 'fail');
  assert.equal(h2.blank.status, 'warn');
  assert.equal(h2.dup.status, 'ok');
  assert.equal(h2.cdup, 5);
  assert.equal(h2.status, 'fail');
  const d2 = ins.dispatches.find((d) => d.key === 'D2');
  assert.equal(d2.lab, 'ALS Ulaanbaatar');
  assert.equal(ins.total.primaries, 150);
  assert.equal(ins.total.qc, 14);
  assert.deepEqual(ins.targets, { crm: 25, blank: 25, dup: 20 });
});

// ---------------------------------------------------------- batch decisions

test('batch status: accept / review / reject with reasons', () => {
  const crm = (id, v, job) => [id, 'CRM', v, { crm: 'OREAS 504c', job, date: '2026-03-0' + job.slice(-1) }];
  const prim = (id, v, job) => [id, 'PRIM', v, { job, date: '2026-03-0' + job.slice(-1) }];
  const blk = (id, v, job) => [id, 'BLK', v, { job, date: '2026-03-0' + job.slice(-1) }];
  build(
    [
      prim('A01', 0.3, 'J1'),
      crm('A02', 1.01, 'J1'),
      blk('A03', 0.002, 'J1'),
      prim('B01', 0.3, 'J2'),
      crm('B02', 1.11, 'J2'), // warn
      blk('B03', 0.002, 'J2'),
      prim('C01', 0.3, 'J3'),
      crm('C02', 1.3, 'J3'), // fail
      blk('C03', 0.002, 'J3'),
      prim('D01', 0.3, 'J4'),
      crm('D02', 1.0, 'J4'),
      blk('D03', 0.2, 'J4'), // fail
      blk('D04', 0.3, 'J4'), // fail
      prim('E01', 0.3, 'J5'), // primaries only
      prim('E02', 0.3, 'J5'),
    ],
    { crms: [OREAS], settings: { elements: { [EL]: { lor: 0.005 } } } },
  );
  const bs = QC.batchStatus(EL);
  const by = Object.fromEntries(bs.map((b) => [b.key, b]));
  assert.equal(by.J1.status, 'accept');
  assert.equal(by.J2.status, 'review');
  assert.ok(by.J2.reasons.some((r) => r.code === 'crmWarn' && r.n === 1));
  assert.equal(by.J3.status, 'reject');
  assert.ok(by.J3.reasons.some((r) => r.code === 'crmFail' && r.sampleId === 'C02' && r.rule === 'limit'));
  assert.equal(by.J4.status, 'reject');
  assert.ok(by.J4.reasons.some((r) => r.code === 'blankFails' && r.n === 2));
  assert.equal(by.J5.status, 'review');
  assert.ok(by.J5.reasons.some((r) => r.code === 'noCrm'));
  assert.ok(by.J5.reasons.some((r) => r.code === 'noBlank' && r.level === 'info'));
  assert.equal(by.J1.nSamples, 3);
  assert.equal(by.J1.crm.pass, 1);
  // newest report first
  assert.equal(bs[0].key, 'J5');
  assert.deepEqual(QC.batchStatus(EL, { batch: 'J3' }).map((b) => b.key), ['J3']);

  const s = QC.qcSummary(EL);
  assert.equal(s.crm.n, 4);
  assert.equal(s.crm.fail, 1);
  assert.equal(s.blank.fail, 2);
  assert.deepEqual(s.batches, { n: 5, accept: 1, review: 2, reject: 2 });
  assert.equal(QC.qcSummary(EL, { batch: 'J1' }).crm.n, 1);
});

test('duplicate pass rate below target flags the batch for review', () => {
  build(
    [
      ['P1', 'PRIM', 1.0],
      ['P2', 'CRM', 1.0, { crm: 'OREAS 504c' }],
      ['P3', 'BLK', 0.001],
      ['P4', 'FDUP', 3.0, { parentId: 'P1' }], // HARD 50
    ],
    { crms: [OREAS], settings: { elements: { [EL]: { lor: 0.005 } } } },
  );
  const [b] = QC.batchStatus(EL);
  assert.equal(b.status, 'review');
  const r = b.reasons.find((x) => x.code === 'dupRate');
  assert.equal(r.type, 'FDUP');
  assert.equal(r.rate, 0);
});

test('empty project and missing assays are handled gracefully', () => {
  reset();
  assert.deepEqual(QC.crmResults(EL), []);
  assert.deepEqual(QC.blankResults(EL), []);
  assert.deepEqual(QC.duplicatePairs(EL), []);
  assert.deepEqual(QC.crmSummary(EL), []);
  assert.deepEqual(QC.duplicateSummary(EL), []);
  assert.deepEqual(QC.batchStatus(EL), []);
  assert.equal(QC.insertionRates().total.primaries, 0);
  assert.equal(QC.qcSummary(EL).crm.passRate, null);
  build([['Z1', 'CRM', null, { crm: 'OREAS 504c' }], ['Z2', 'BLK', null]], { crms: [OREAS] });
  assert.deepEqual(QC.crmResults(EL), []);
  assert.deepEqual(QC.blankResults(EL), []);
  assert.equal(QC.insertionRates().total.crms, 1);
});

test('sample type aliases are normalised', () => {
  assert.equal(QC.qcType({ sampleType: 'std' }), 'CRM');
  assert.equal(QC.qcType({ sampleType: 'Blank' }), 'BLK');
  assert.equal(QC.qcType({ sampleType: 'DUP' }), 'FDUP');
  assert.equal(QC.qcType({ sampleType: '' }), 'PRIM');
  assert.equal(QC.qcType({ sampleType: 'PDUP' }), 'PDUP');
});

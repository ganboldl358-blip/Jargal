// node --test app/tests/intercepts.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { S, mutate, rows, assayValues } from '../src/core/store.js';
import { toGrade, gradeUnit, gradeText, computeIntercepts, holeIntercepts, projectIntercepts, normParams, criteriaText, segments } from '../src/core/intercepts.js';

S.pid = 'test';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

/**
 * Fixture hole through the store. `spec` items: a number (Au g/t, 1 m sample),
 * null (sample with no assay), or {from, to, au, cu, type, flag, raw}.
 */
function makeHole(holeId, spec) {
  const ops = [{ type: 'upsert', table: 'collar', holeId, row: { holeId } }];
  let depth = 0;
  spec.forEach((x, i) => {
    const o = x !== null && typeof x === 'object' ? x : { au: x };
    const from = o.from ?? depth;
    const to = o.to ?? from + 1;
    depth = to;
    const sampleId = `${holeId}-${String(i + 1).padStart(3, '0')}`;
    ops.push({ type: 'upsert', table: 'samples', holeId, row: { sampleId, from, to, sampleType: o.type || 'PRIM' } });
    if ((o.au === null || o.au === undefined) && o.raw === undefined) return;
    const values = { Au_ppm: o.raw ?? o.au };
    if (o.cu !== undefined) values.Cu_pct = o.cu;
    const flags = o.flag ? { Au_ppm: o.flag } : {};
    ops.push({ type: 'upsert', table: 'assays', holeId, row: { sampleId, certificate: 'UB26000001', values, flags } });
  });
  mutate(ops, { label: `fixture ${holeId}` });
}

const run = (holeId, params) => holeIntercepts({ holeId, samples: rows('samples', holeId), assay: assayValues }, params);
const P = { element: 'Au_ppm', cutoff: 0.3, minLen: 2, maxDil: 3, incl: 1, secondary: [] };

test('units and grade text from the element key', () => {
  assert.equal(gradeUnit('Au_ppm'), 'g/t');
  assert.equal(gradeUnit('Ag_ppm'), 'g/t');
  assert.equal(gradeUnit('Pt_ppm'), 'g/t');
  assert.equal(gradeUnit('Pd_ppm'), 'g/t');
  assert.equal(gradeUnit('Au_gpt'), 'g/t');
  assert.equal(gradeUnit('Cu_pct'), '%');
  assert.equal(gradeUnit('Mo_ppm'), 'ppm');
  assert.equal(gradeUnit('Au_ppb'), 'ppb');
  assert.equal(gradeText(1.234, 'Au_ppm'), '1.23 g/t Au');
  assert.equal(gradeText(0.451, 'Cu_pct'), '0.45% Cu');
  assert.equal(gradeText(352.4, 'Mo_ppm'), '352 ppm Mo');
});

test('below-detection values and sentinels', () => {
  assert.equal(toGrade('<0.01'), 0.005);
  assert.equal(toGrade('<0.01', null, 'lor'), 0.01);
  assert.equal(toGrade('<0.01', null, 'zero'), 0);
  assert.equal(toGrade(-0.01), 0.005);
  assert.equal(toGrade(0.01, '<'), 0.01, 'a stored value flagged < was already converted on import');
  assert.equal(toGrade(-99), null);
  assert.equal(toGrade(-999), null);
  assert.equal(toGrade('>10'), 10);
  assert.equal(toGrade(''), null);
  assert.equal(toGrade(undefined), null);
  assert.equal(toGrade('1,25'), 1.25);
  assert.equal(toGrade(2.5), 2.5);
});

test('composite with internal dilution, trailing waste excluded, including interval', () => {
  //            0    1    2    3    4    5    6    7    8    9     10    11    12    13
  makeHole('A1', [0.1, 0.5, 0.8, 0.1, 0.1, 0.6, 2.0, 5.0, 0.4, 0.05, 0.05, 0.05, 0.05, 0.9]);
  const res = run('A1', P);
  assert.equal(res.length, 1, 'the lone 0.9 g/t metre at 13 m is shorter than min length');
  const r = res[0];
  assert.equal(r.holeId, 'A1');
  assert.equal(r.from, 1);
  assert.equal(r.to, 9, 'ends on the last sample ≥ cut-off, trailing waste dropped');
  assert.equal(r.length, 8);
  near(r.grade, 9.5 / 8);
  near(r.gradeXm, 9.5);
  assert.equal(r.dilution, 2);
  assert.equal(r.n, 8);
  assert.equal(r.incl.length, 1);
  assert.equal(r.incl[0].from, 6);
  assert.equal(r.incl[0].to, 8);
  near(r.incl[0].grade, 3.5);
  assert.equal(r.text, '8.0 m @ 1.19 g/t Au from 1.0 m (incl. 2.0 m @ 3.50 g/t Au from 6.0 m)');
  assert.equal(r.unit, 'g/t');
});

test('single-sample hits honour the minimum length', () => {
  makeHole('A2', [0, 0, 5, 0, 0]);
  assert.equal(run('A2', P).length, 0);
  const one = run('A2', { ...P, minLen: 1 });
  assert.equal(one.length, 1);
  assert.equal(one[0].text, '1.0 m @ 5.00 g/t Au from 2.0 m');
  assert.equal(one[0].incl.length, 0, 'an including interval equal to the whole intercept is not repeated');
  // a grade×thickness floor
  assert.equal(run('A2', { ...P, minLen: 1, minGradeThickness: 6 }).length, 0);
  assert.equal(run('A2', { ...P, minLen: 1, minGradeThickness: 5 }).length, 1);
});

test('internal dilution exactly at the limit is accepted, one metre more splits', () => {
  makeHole('A3', [1, 0, 0, 0, 1]);
  const at = run('A3', { ...P, minLen: 1, maxDil: 3 });
  assert.equal(at.length, 1);
  assert.equal(at[0].length, 5);
  near(at[0].grade, 0.4);
  assert.equal(at[0].dilution, 3);
  const under = run('A3', { ...P, minLen: 1, maxDil: 2.99 });
  assert.deepEqual(
    under.map((r) => [r.from, r.to]),
    [
      [0, 1],
      [4, 5],
    ],
  );
  makeHole('A4', [1, 0, 0, 0, 0, 1]);
  assert.equal(run('A4', { ...P, minLen: 1, maxDil: 3 }).length, 2);
  // no internal dilution allowed at all
  makeHole('A5', [1, 1, 0.1, 1]);
  assert.deepEqual(
    run('A5', { ...P, minLen: 1, maxDil: 0 }).map((r) => [r.from, r.to]),
    [
      [0, 2],
      [3, 4],
    ],
  );
});

test('a composite that would fall below cut-off stops before the waste', () => {
  makeHole('A6', [0.5, 0, 0, 0.35]);
  const res = run('A6', { ...P, minLen: 1 });
  assert.deepEqual(
    res.map((r) => [r.from, r.to]),
    [
      [0, 1],
      [3, 4],
    ],
  );
});

test('unsampled gaps: zero-grade dilution or a break', () => {
  makeHole('A7', [
    { from: 0, to: 1, au: 2 },
    { from: 1, to: 2, au: 2 },
    { from: 3, to: 4, au: 2 },
  ]);
  const zero = run('A7', { ...P, minLen: 1, maxDil: 1, gapPolicy: 'zero', incl: null });
  assert.equal(zero.length, 1);
  assert.equal(zero[0].from, 0);
  assert.equal(zero[0].to, 4);
  near(zero[0].grade, 1.5);
  assert.equal(zero[0].gapLen, 1);
  const brk = run('A7', { ...P, minLen: 1, maxDil: 1, gapPolicy: 'break', incl: null });
  assert.deepEqual(
    brk.map((r) => [r.from, r.to, r.grade]),
    [
      [0, 2, 2],
      [3, 4, 2],
    ],
  );
  // a gap longer than the allowed dilution splits even with the zero policy
  assert.equal(run('A7', { ...P, minLen: 1, maxDil: 0.5, gapPolicy: 'zero' }).length, 2);
  // samples without assays behave like gaps
  makeHole('A8', [2, 2, null, 2]);
  const un = run('A8', { ...P, minLen: 1, maxDil: 1, incl: null });
  assert.equal(un.length, 1);
  near(un[0].grade, 1.5);
  assert.equal(run('A8', { ...P, minLen: 1, maxDil: 1, gapPolicy: 'break' }).length, 2);
});

test('zero samples, all waste and below-detection samples', () => {
  mutate([{ type: 'upsert', table: 'collar', holeId: 'EMPTY', row: { holeId: 'EMPTY' } }]);
  assert.deepEqual(run('EMPTY', P), []);
  assert.deepEqual(computeIntercepts([], P), []);
  makeHole('W1', [0.01, 0.02, 0, 0.1]);
  assert.deepEqual(run('W1', P), []);

  makeHole('B1', [1, { raw: '<0.01' }, { raw: 0.01, flag: '<' }, { raw: -0.01 }, 1]);
  const half = run('B1', { ...P, minLen: 1 });
  assert.equal(half.length, 1);
  near(half[0].grade, (1 + 0.005 + 0.01 + 0.005 + 1) / 5);
  const lor = run('B1', { ...P, minLen: 1, bdl: 'lor' });
  near(lor[0].grade, (1 + 0.01 * 3 + 1) / 5);
  const zero = run('B1', { ...P, minLen: 1, bdl: 'zero' });
  near(zero[0].grade, (1 + 0 + 0.01 + 0 + 1) / 5);
  // a BDL sample never starts an intercept even at a tiny cut-off with LOR policy
  makeHole('B2', [{ raw: '<0.5' }, { raw: '<0.5' }]);
  assert.equal(run('B2', { ...P, cutoff: 0.3, minLen: 1 }).length, 0, 'half of 0.5 LOR is below 0.3');
});

test('secondary elements are length-weighted and QC samples ignored', () => {
  makeHole('C1', [
    { from: 0, to: 2, au: 1, cu: 0.5 },
    { from: 2, to: 3, au: 1, cu: 0.2 },
    { from: 3, to: 4, au: 1 }, // Cu not analysed: left out of the Cu average
    { from: 0, to: 2, au: 50, cu: 9, type: 'FDUP' },
    { from: 4, to: 4.001, au: 99, type: 'CRM' },
  ]);
  const res = run('C1', { ...P, minLen: 1, secondary: ['Cu_pct'], incl: null });
  assert.equal(res.length, 1);
  assert.equal(res[0].length, 4);
  near(res[0].grade, 1);
  near(res[0].secondary.Cu_pct, (0.5 * 2 + 0.2) / 3);
  assert.equal(res[0].textFull, '4.0 m @ 1.00 g/t Au, 0.40% Cu from 0.0 m');

  // secondaries sit before "from" in the including part too
  makeHole('C2', [
    { au: 0.5, cu: 0.1 },
    { au: 3, cu: 1 },
    { au: 3, cu: 1 },
    { au: 0.5, cu: 0.1 },
  ]);
  const c2 = run('C2', { ...P, secondary: ['Cu_pct'], incl: 1 });
  assert.equal(c2[0].textFull, '4.0 m @ 1.75 g/t Au, 0.55% Cu from 0.0 m (incl. 2.0 m @ 3.00 g/t Au, 1.00% Cu from 1.0 m)');
  assert.equal(c2[0].text, '4.0 m @ 1.75 g/t Au from 0.0 m (incl. 2.0 m @ 3.00 g/t Au from 1.0 m)');
});

test('unsorted and overlapping inputs are handled', () => {
  const segs = segments([
    { from: 2, to: 3, g: 1 },
    { from: 0, to: 1, g: 1 },
    { from: 0.5, to: 2, g: 1 }, // overlaps the first: clipped
  ]);
  assert.deepEqual(
    segs.map((s) => [s.from, s.to]),
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  );
  const r = computeIntercepts(
    [
      { from: 2, to: 3, g: 1 },
      { from: 0, to: 1, g: 1 },
      { from: 1, to: 2, g: 1 },
    ],
    { ...P, minLen: 1 },
    'X',
  );
  assert.equal(r[0].length, 3);
});

test('project run: intercepts per hole, NSI and unassayed lists, criteria line', () => {
  makeHole('P1', [0, 1.2, 1.4, 0.2, 3, 0]);
  makeHole('P2', [0.05, 0.05]);
  makeHole('P3', [null, null]);
  const res = projectIntercepts(
    { holeIds: ['P3', 'P2', 'P1'], samplesOf: (h) => rows('samples', h), assay: assayValues },
    { ...P, incl: 1 },
  );
  assert.equal(res.rows.length, 1);
  assert.equal(res.rows[0].holeId, 'P1');
  assert.equal(res.rows[0].from, 1);
  assert.equal(res.rows[0].to, 5);
  assert.deepEqual(res.nsi, ['P2']);
  assert.deepEqual(res.unassayed, ['P3']);
  assert.match(criteriaText(P), /0\.3 g\/t Au cut-off, minimum 2 m/);
  assert.equal(normParams({ secondary: 'Cu_pct, Au_ppm , Ag_ppm' }).secondary.join(), 'Cu_pct,Ag_ppm');
});

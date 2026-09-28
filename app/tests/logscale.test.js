// Strip-log helper tests: node --test app/tests/logscale.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/core/logscale.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('zoom steps move through the level list and clamp at the ends', () => {
  assert.equal(L.stepZoom(4, 1), 5);
  assert.equal(L.stepZoom(4, -1), 3);
  assert.equal(L.stepZoom(4.4, 1), 5);
  assert.equal(L.stepZoom(4.4, -1), 4);
  assert.equal(L.stepZoom(60, 1), 60);
  assert.equal(L.stepZoom(0.25, -1), 0.25);
  assert.equal(L.stepZoom(1000, -1), 50);
  assert.equal(L.clampPpm(0.01), L.PPM_MIN);
  assert.equal(L.clampPpm(NaN), 4);
});

test('fit-to-height divides the viewport by the depth', () => {
  close(L.fitPpm(200, 800), 4);
  assert.equal(L.fitPpm(0, 800), 4);
  assert.equal(L.fitPpm(100000, 100), L.PPM_MIN);
  assert.equal(L.approxScale(4), 940);
  assert.equal(L.approxScale(1), 3800);
});

test('depth ticks: labelled steps grow as the scale shrinks, minor ticks divide them', () => {
  const at = (ppm) => L.depthTicks(ppm, 300);
  assert.equal(at(40).major, 1);
  assert.equal(at(40).minor, 0.2);
  assert.equal(at(8).major, 5);
  assert.equal(at(4).major, 10);
  assert.equal(at(4).minor, 2);
  assert.equal(at(2).major, 20);
  assert.equal(at(1).major, 50);
  assert.equal(at(0.25).major, 200);
  for (const ppm of [0.25, 0.5, 1, 2, 3, 4, 6, 10, 20, 40, 60]) {
    const t = at(ppm);
    assert.ok(t.major * ppm >= 40, `labels too close at ${ppm}`);
    assert.ok(t.minor * ppm >= 5, `minor ticks too close at ${ppm}`);
    close(t.major / t.minor, Math.round(t.major / t.minor));
    assert.ok(Number.isInteger(t.major));
  }
  const t = L.depthTicks(4, 95);
  assert.deepEqual(t.majorDepths, [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.equal(t.minorDepths[1], 2);
  assert.equal(t.minorDepths.at(-1), 94);
  assert.equal(L.depthLabel(10, 10), '10');
});

test('niceMax rounds up to a readable axis maximum', () => {
  assert.equal(L.niceMax(0.37), 0.4);
  assert.equal(L.niceMax(12.4), 15);
  assert.equal(L.niceMax(100), 100);
  assert.equal(L.niceMax(101), 120);
  assert.equal(L.niceMax(7.9), 8);
  assert.equal(L.niceMax(0), 1);
  assert.equal(L.niceMax(-3), 1);
});

test('value domains and scales (linear and log)', () => {
  const lin = L.valueDomain([0.1, 2.3, null, 0.02], false);
  assert.deepEqual(lin, { min: 0, max: 2.5, log: false, dataMax: 2.3 });
  const sx = L.valueScale(lin, 10, 110);
  assert.equal(sx(0), 10);
  assert.equal(sx(2.5), 110);
  assert.equal(sx(1.25), 60);
  assert.equal(sx(99), 110, 'clamps');
  assert.equal(sx(null), null);

  const log = L.valueDomain([0.0025, 0.5, 12.4], true);
  assert.equal(log.min, 0.001);
  assert.equal(log.max, 100);
  const lx = L.valueScale(log, 0, 100);
  close(lx(0.001), 0);
  close(lx(100), 100);
  close(lx(0.1), 40);
  assert.equal(lx(0), 0, 'non-positive values sit on the axis');
  assert.deepEqual(L.valueTicks(log), [0.001, 0.01, 0.1, 1, 10, 100]);
  assert.deepEqual(L.valueTicks(lin), [0, 0.625, 1.25, 1.875, 2.5]);

  const exact = L.valueDomain([1, 10], true);
  assert.equal(exact.min, 1);
  assert.equal(exact.max, 10);
  const one = L.valueDomain([5], true);
  assert.equal(one.min, 1);
  assert.equal(one.max, 10);
  const wide = L.valueDomain([1e-9, 1000], true);
  assert.equal(wide.max / wide.min, 1e6, 'log range capped at six decades');
  assert.deepEqual(L.valueDomain([], true), { min: 0.001, max: 1, log: true, dataMax: null });
});

test('below-detection values plot at half LOR by default', () => {
  assert.equal(L.plotValue(0.005, '<'), 0.0025);
  assert.equal(L.plotValue(-0.01, undefined), 0.005);
  assert.equal(L.plotValue(-0.01, undefined, 'lor'), 0.01);
  assert.equal(L.plotValue(-0.01, '<', 'zero'), 0);
  assert.equal(L.plotValue(1.2, undefined), 1.2);
  assert.equal(L.plotValue(null, '<'), null);
});

test('grade thresholds: settings first, then house defaults by element and unit', () => {
  assert.equal(L.gradeThreshold('Au_ppm'), 0.5);
  assert.equal(L.gradeThreshold('Au_ppb'), 500);
  assert.equal(L.gradeThreshold('Cu_pct'), 0.2);
  assert.equal(L.gradeThreshold('Fe_pct'), null);
  assert.equal(L.gradeThreshold('Au_ppm', { Au_ppm: { threshold: 1 } }), 1);
  assert.equal(L.gradeThreshold('Fe_pct', { Fe_pct: { stripThreshold: 20 } }), 20);
});

test('fmtVal keeps about three significant figures', () => {
  assert.equal(L.fmtVal(12.43), '12.4');
  assert.equal(L.fmtVal(0.0456), '0.0456');
  assert.equal(L.fmtVal(0.5), '0.5');
  assert.equal(L.fmtVal(1234.5), '1235');
  assert.equal(L.fmtVal(123.4), '123');
  assert.equal(L.fmtVal(0.0025), '0.0025');
  assert.equal(L.depthLabel(12.5, 0.5), '12.5');
  assert.equal(L.fmtVal(3.456), '3.46');
  assert.equal(L.fmtVal(0), '0');
  assert.equal(L.fmtVal(null), '');
});

test('step paths follow intervals and break at gaps and missing values', () => {
  const x = (v) => v * 10;
  const y = (d) => d * 2;
  const segs = [
    { from: 0, to: 1, v: 1 },
    { from: 1, to: 2, v: 3 },
    { from: 3, to: 4, v: 2 }, // gap before
    { from: 4, to: 5, v: null }, // missing
    { from: 5, to: 6, v: 1 },
  ];
  const { line, area } = L.stepPaths(segs, x, y, 0);
  assert.equal(line, 'M10 0V2L30 2V4M20 6V8M10 10V12');
  assert.equal(area, 'M0 0L10 0V2L30 2V4H0ZM0 6L20 6V8H0ZM0 10L10 10V12H0Z');
  assert.deepEqual(L.stepPaths([], x, y, 0), { line: '', area: '' });
  assert.equal(L.rectPath(1, 2, 3, 4), 'M1 2h3v4h-3Z');
  assert.equal(L.rectPath(1, 2, 0, 4), '');
});

test('track layout grows, shrinks, respects caps and falls back to minimums', () => {
  const T = [
    { key: 'a', w: 40, min: 40, grow: 0 },
    { key: 'b', w: 60, min: 30, grow: 1, max: 80 },
    { key: 'c', w: 100, min: 50, grow: 1 },
  ];
  const exact = L.layoutTracks(T, 200);
  assert.deepEqual(exact.tracks.map((t) => [t.x, t.w]), [[0, 40], [40, 60], [100, 100]]);
  const wide = L.layoutTracks(T, 300);
  assert.deepEqual(wide.tracks.map((t) => t.w), [40, 80, 180], 'b capped at 80, rest to c');
  assert.equal(wide.width, 300);
  const narrow = L.layoutTracks(T, 160);
  assert.deepEqual(narrow.tracks.map((t) => t.w), [40, 45, 75]);
  const tiny = L.layoutTracks(T, 50);
  assert.deepEqual(tiny.tracks.map((t) => t.w), [40, 30, 50]);
  assert.equal(tiny.width, 120, 'wider than the container → scrolls');
});

test('QC placement: own depth, parent depth, or after the previous primary', () => {
  const S = [
    { sampleId: 'S003', sampleType: 'PRIM', from: 2, to: 3 },
    { sampleId: 'S001', sampleType: 'PRIM', from: 0, to: 1 },
    { sampleId: 'S002', sampleType: 'CRM', crm: 'OREAS 504c' },
    { sampleId: 'S004', sampleType: 'BLK' },
    { sampleId: 'S005', sampleType: 'FDUP', parentId: 'S003' },
    { sampleId: 'S006', sampleType: 'FDUP', from: 4, to: 5 },
    { sampleId: 'S000', sampleType: 'CRM' }, // before any primary → unknown → skipped
    { sampleId: 'S007', sampleType: 'PDUP' }, // no parent, not CRM/blank → skipped
    { sampleId: 'S010', sampleType: 'PRIM', from: 5, to: 6 },
  ];
  const out = L.placeQC(S);
  const got = Object.fromEntries(out.map((q) => [q.row.sampleId, [q.kind, q.depth, q.how]]));
  assert.deepEqual(got, {
    S002: ['crm', 1, 'prev'],
    S004: ['blank', 3, 'prev'],
    S005: ['dup', 2.5, 'parent'],
    S006: ['dup', 4.5, 'own'],
  });
  assert.deepEqual(out.map((q) => q.depth), [1, 2.5, 3, 4.5], 'sorted by depth');
  assert.equal(out[0].after, 'S001');
  assert.ok(L.isPrimary({ sampleId: 'x' }), 'no type = primary');
});

test('pXRF readings are averaged per interval', () => {
  const r = [
    { from: 1, to: 2, values: { Cu_ppm: 100 } },
    { from: 0, to: 1, values: { Cu_ppm: 50 } },
    { from: 1, to: 2, values: { Cu_ppm: 300 } },
    { from: 3, values: { Cu_ppm: 10 } },
    { from: 4, to: 5, values: { Zn_ppm: 1 } },
  ];
  const a = L.aggregateReadings(r, 'Cu_ppm');
  assert.deepEqual(a.map((g) => [g.from, g.to, g.v, g.n]), [[0, 1, 50, 1], [1, 2, 200, 2], [3, null, 10, 1]]);
});

test('hit testing finds intervals (with grace for thin ones) and points', () => {
  const iv = [
    { y0: 0, y1: 10, id: 'a' },
    { y0: 10, y1: 11, id: 'b' },
    { y0: 20, y1: 30, id: 'c' },
  ];
  assert.equal(L.findInterval(iv, 5).id, 'a');
  assert.equal(L.findInterval(iv, 10.5).id, 'b');
  assert.equal(L.findInterval(iv, 12).id, 'b', 'within grace');
  assert.equal(L.findInterval(iv, 16), null, 'in the gap');
  assert.equal(L.findInterval(iv, 25).id, 'c');
  assert.equal(L.findInterval([], 5), null);
  const pts = [{ x: 10, y: 10, id: 'p' }, { y: 50, id: 'q' }];
  assert.equal(L.findPoint(pts, 12, 12).id, 'p');
  assert.equal(L.findPoint(pts, 30, 30), null);
  assert.equal(L.findPoint(pts, 999, 52).id, 'q', 'points without x match on depth only');
});

test('intensity and weathering bar fractions', () => {
  assert.equal(L.intFrac('W'), 0.2);
  assert.equal(L.intFrac('i'), 1);
  assert.equal(L.intFrac(''), 0);
  assert.equal(L.intFrac('X'), 0.5);
  assert.equal(L.weathFrac('1'), 1);
  close(L.weathFrac(6), 1 / 6);
  assert.equal(L.weathFrac('7'), 0);
  assert.equal(L.weathFrac(null), 0);
});

test('text fitting: wrap with ellipsis, keep head or tail', () => {
  assert.deepEqual(L.wrapText('Massive py-cpy with bornite blebs', 12, 3), ['Massive', 'py-cpy with', 'bornite…']);
  assert.deepEqual(L.wrapText('short', 12, 2), ['short']);
  assert.deepEqual(L.wrapText('  ', 12, 2), []);
  assert.deepEqual(L.wrapText('abcdefghij', 4, 5), ['abcd', 'efgh', 'ij']);
  const one = L.wrapText('Clay gouge, broken core.', 10, 1);
  assert.equal(one.length, 1);
  assert.ok(one[0].endsWith('…') && one[0].length <= 10);
  assert.equal(L.fitHead('Rhyolite', 5), 'Rhyo…');
  assert.equal(L.fitHead('FRHY', 5), 'FRHY');
  assert.equal(L.fitTail('DM000123', 5), '…0123');
  assert.equal(L.fitTail('DM1', 5), 'DM1');
});

test('text colour on fills and CSS variable resolution for export', () => {
  assert.equal(L.inkOn('#ffffff'), '#15201f');
  assert.equal(L.inkOn('#1b1b1f'), '#ffffff');
  assert.equal(L.inkOn('#efb3c4'), '#15201f');
  assert.equal(L.inkOn('#3e5b47'), '#ffffff');
  assert.equal(L.inkOn('nope'), '#15201f');
  const vars = { '--ink': '#142120', '--mono': "'JetBrains Mono', \"Cascadia\", monospace" };
  const look = (n) => vars[n];
  assert.equal(L.resolveCssVars('fill:var(--ink);stroke:var(--nope, #fff)', look), 'fill:#142120;stroke:#fff');
  assert.equal(L.resolveCssVars('font-family:var(--mono)', look), "font-family:'JetBrains Mono', 'Cascadia', monospace");
  assert.equal(L.resolveCssVars('a var( --ink ) b', look), 'a #142120 b');
});

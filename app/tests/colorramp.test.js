import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RAMPS,
  hexToRgb,
  rgbToHex,
  toLinear,
  lightness,
  mix,
  rampColor,
  rampColors,
  isDark,
  rampFor,
  niceRound,
  fmtValue,
  quantileBreaks,
  logBreaks,
  linearBreaks,
  decades,
  classIndex,
  makeClassScale,
  rampGradientCSS,
  PERCENTILES,
} from '../src/core/colorramp.js';

test('hex / rgb parsing round-trips', () => {
  assert.deepEqual(hexToRgb('#0d7a74'), [13, 122, 116]);
  assert.deepEqual(hexToRgb('#fff'), [255, 255, 255]);
  assert.deepEqual(hexToRgb('rgb(10, 20, 30)'), [10, 20, 30]);
  assert.deepEqual(hexToRgb('rgb(10 20 30 / 50%)'), [10, 20, 30]);
  assert.equal(hexToRgb('nope'), null);
  assert.equal(rgbToHex([13, 122, 116]), '#0d7a74');
  assert.equal(rgbToHex([300, -5, 127.6]), '#ff0080');
});

test('toLinear decodes sRGB', () => {
  const [r, g, b] = toLinear('#ffffff');
  assert.ok(Math.abs(r - 1) < 1e-9 && Math.abs(g - 1) < 1e-9 && Math.abs(b - 1) < 1e-9);
  const [m] = toLinear('#808080');
  assert.ok(m > 0.2 && m < 0.23, `mid grey linear ${m}`);
});

test('OKLab mix keeps end points and is monotone in lightness', () => {
  assert.equal(mix('#102030', '#e0d0c0', 0), '#102030');
  assert.equal(mix('#102030', '#e0d0c0', 1), '#e0d0c0');
  const Ls = [0, 0.25, 0.5, 0.75, 1].map((t) => lightness(mix('#000000', '#ffffff', t)));
  for (let i = 1; i < Ls.length; i++) assert.ok(Ls[i] > Ls[i - 1]);
});

test('grade ramps are monotone in lightness for their theme', () => {
  const light = rampColors(RAMPS.light, 12).map(lightness);
  for (let i = 1; i < light.length; i++) assert.ok(light[i] < light[i - 1], `light ramp step ${i}`);
  const dark = rampColors(RAMPS.dark, 12).map(lightness);
  for (let i = 1; i < dark.length; i++) assert.ok(dark[i] > dark[i - 1], `dark ramp step ${i}`);
});

test('rampColor clamps and hits the stops', () => {
  assert.equal(rampColor(RAMPS.light, -1), RAMPS.light[0]);
  assert.equal(rampColor(RAMPS.light, 2), RAMPS.light[RAMPS.light.length - 1]);
  assert.equal(rampColor(RAMPS.light, 0.2), RAMPS.light[1]);
  assert.equal(rampColors(RAMPS.dark, 6).length, 6);
});

test('theme detection picks the right ramp', () => {
  assert.equal(isDark('#0d1413'), true);
  assert.equal(isDark('#f2f5f4'), false);
  assert.equal(rampFor('#0d1413'), RAMPS.dark);
  assert.equal(rampFor('#ffffff'), RAMPS.light);
});

test('niceRound / fmtValue', () => {
  assert.equal(niceRound(0.012345), 0.012);
  assert.equal(niceRound(1234), 1200);
  assert.equal(niceRound(0.1 + 0.2), 0.3);
  assert.equal(niceRound(0), 0);
  assert.equal(fmtValue(0.00512), '0.00512');
  assert.equal(fmtValue(1.2345), '1.23');
  assert.equal(fmtValue(152.4), '152');
  assert.equal(fmtValue(12500.4), '12500');
  assert.equal(fmtValue(null), '');
});

test('quantile breaks are ascending, deduplicated and above the minimum', () => {
  const vals = Array.from({ length: 101 }, (_, i) => i); // 0..100
  assert.deepEqual(quantileBreaks(vals), [50, 75, 90, 95, 98]);
  // heavy detection-limit mass: many identical values collapse to one break
  const dl = [...Array(80).fill(0.005), 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, ...Array(10).fill(0.3)];
  const b = quantileBreaks(dl);
  for (let i = 1; i < b.length; i++) assert.ok(b[i] > b[i - 1]);
  assert.ok(b.every((x) => x > 0.005));
  assert.deepEqual(quantileBreaks([]), []);
});

test('decades, log and linear breaks', () => {
  assert.equal(decades([0.01, 0.1, 1, 10]), 3);
  assert.equal(decades([-1, 0, 5]), 0);
  const lb = logBreaks([0.01, 0.1, 1, 10, 100], 4);
  assert.equal(lb.length, 3);
  for (let i = 1; i < lb.length; i++) assert.ok(lb[i] / lb[i - 1] > 3); // geometric spacing
  const lin = linearBreaks(Array.from({ length: 101 }, (_, i) => i), 4);
  assert.equal(lin.length, 3);
  assert.ok(Math.abs(lin[1] - 50) < 1);
});

test('classIndex puts break values in the upper class', () => {
  const br = [1, 2, 5];
  assert.equal(classIndex(br, 0.5), 0);
  assert.equal(classIndex(br, 1), 1);
  assert.equal(classIndex(br, 4.99), 2);
  assert.equal(classIndex(br, 5), 3);
  assert.equal(classIndex(br, 1e9), 3);
  assert.equal(classIndex(br, null), -1);
});

test('makeClassScale: percentile classes, legend and colours', () => {
  const vals = Array.from({ length: 1000 }, (_, i) => 0.001 * 1.01 ** i); // log-spread
  const s = makeClassScale(vals, { stops: RAMPS.light });
  assert.equal(s.method, 'quantile');
  assert.equal(s.breaks.length, PERCENTILES.length);
  assert.equal(s.colors.length, s.breaks.length + 1);
  assert.equal(s.legend.length, s.colors.length);
  assert.equal(s.log, true);
  assert.equal(s.legend.reduce((a, l) => a + l.count, 0), vals.length);
  assert.match(s.legend[0].label, /^< /);
  assert.match(s.legend[s.legend.length - 1].label, /^≥ /);
  assert.equal(s.legend[0].pct, '< P50');
  assert.equal(s.color(s.max), s.colors[s.colors.length - 1]);
  assert.equal(s.color(s.min), s.colors[0]);
  assert.equal(s.color(null, 'x'), 'x');
  // log-aware gradient position: geometric mean sits mid-bar
  const mid = s.t(Math.sqrt(s.min * s.max));
  assert.ok(Math.abs(mid - 0.5) < 0.01, `t(mid)=${mid}`);
});

test('makeClassScale handles constant and empty data', () => {
  const c = makeClassScale([1, 1, 1]);
  assert.equal(c.breaks.length, 0);
  assert.equal(c.colors.length, 1);
  assert.equal(c.color(1), c.colors[0]);
  const e = makeClassScale([]);
  assert.equal(e.n, 0);
  assert.equal(e.legend.length, 1);
});

test('makeClassScale log method falls back when no positive spread', () => {
  const s = makeClassScale([0, 0, 1, 2, 3, 4], { method: 'log' });
  assert.ok(s.breaks.length >= 1);
});

test('rampGradientCSS builds a CSS gradient', () => {
  const g = rampGradientCSS(RAMPS.light, 4);
  assert.match(g, /^linear-gradient\(90deg, #[0-9a-f]{6} 0\.0%/);
  assert.match(g, /100\.0%\)$/);
});

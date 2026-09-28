// Colour ramps, class breaks and legends for grade colouring (3D view, map,
// sections). Pure functions: no DOM, no store, so they run under `node --test`.
//
// The grade ramps are "semantic heat" sequential ramps: lightness changes
// monotonically from the low end (recedes into the surface) to the high end
// (stands out), with hue moving teal -> brass -> red. Each theme has its own
// steps: on a light surface low = pale, high = dark red; on a dark surface
// low = deep teal, high = pale gold. Interpolation is done in OKLab so equal
// steps in t look like equal steps in colour.

import { isNum } from './util.js';

export const RAMPS = {
  light: ['#b8d5cf', '#7fb5ab', '#b0973f', '#c2672b', '#a3322a', '#6b1823'],
  dark: ['#22524d', '#2b8178', '#8a9642', '#d3993a', '#efc070', '#f9e6b2'],
};

/** Geochemical percentile classes: <P50, P50–75, P75–90, P90–95, P95–98, ≥P98. */
export const PERCENTILES = [0.5, 0.75, 0.9, 0.95, 0.98];

// ------------------------------------------------------------------ colour

/** '#rgb' | '#rrggbb' | 'rgb(r, g, b)' | 'rgb(r g b / a)' -> [r, g, b] (0..255), or null. */
export function hexToRgb(c) {
  if (Array.isArray(c)) return c.slice(0, 3);
  const s = String(c ?? '').trim();
  let m = s.match(/^#?([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = s.match(/^#?([0-9a-f]{3})$/i);
  if (m) return [...m[1]].map((h) => parseInt(h + h, 16));
  m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return [+m[1], +m[2], +m[3]].map((v) => Math.max(0, Math.min(255, Math.round(v))));
  return null;
}

export function rgbToHex(rgb) {
  return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

const toLin = (v) => {
  v /= 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const fromLin = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055);

/** sRGB colour -> linear-light [r, g, b] in 0..1 (what WebGL vertex colours want). */
export function toLinear(c) {
  const rgb = hexToRgb(c) || [128, 128, 128];
  return rgb.map(toLin);
}

/** sRGB [0..255] -> OKLab [L, a, b]. */
export function rgbToOklab(rgb) {
  const [r, g, b] = rgb.map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab -> sRGB [0..255] (clamped to gamut). */
export function oklabToRgb([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ].map((v) => Math.max(0, Math.min(255, v)));
}

/** OKLab lightness (0..1) of a colour. */
export const lightness = (c) => rgbToOklab(hexToRgb(c) || [0, 0, 0])[0];

/** Mix two colours in OKLab. */
export function mix(c1, c2, t) {
  const a = rgbToOklab(hexToRgb(c1));
  const b = rgbToOklab(hexToRgb(c2));
  return rgbToHex(oklabToRgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
}

/** Colour at t (0..1) along a ramp of stops. */
export function rampColor(stops, t) {
  if (!stops?.length) return '#808080';
  if (stops.length === 1 || !isNum(t)) return stops[0];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

/** n colours evenly spaced along a ramp (both ends included). */
export function rampColors(stops, n) {
  if (n <= 1) return [rampColor(stops, 1)];
  return Array.from({ length: n }, (_, i) => rampColor(stops, i / (n - 1)));
}

/** WCAG relative luminance. */
export function luminance(c) {
  const [r, g, b] = (hexToRgb(c) || [0, 0, 0]).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const isDark = (c) => luminance(c) < 0.2;

/** Ramp suited to a background colour (light / dark theme). */
export const rampFor = (bg) => (isDark(bg) ? RAMPS.dark : RAMPS.light);

/** CSS gradient for a legend bar. */
export function rampGradientCSS(stops, steps = 12, dir = '90deg') {
  const cols = rampColors(stops, steps);
  return `linear-gradient(${dir}, ${cols.map((c, i) => `${c} ${((100 * i) / (steps - 1)).toFixed(1)}%`).join(', ')})`;
}

// ------------------------------------------------------------------ breaks

/** Finite numbers, sorted ascending. */
export function finiteSorted(values) {
  const out = [];
  for (const v of values) if (isNum(v)) out.push(v);
  return out.sort((a, b) => a - b);
}

function q(sorted, p) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Round to `sig` significant figures (0.012345 -> 0.012, 1234 -> 1200). */
export function niceRound(v, sig = 2) {
  if (!isNum(v) || v === 0) return v;
  const e = Math.floor(Math.log10(Math.abs(v)));
  const f = 10 ** (sig - 1 - e);
  const r = Math.round(v * f) / f;
  // clean float noise (0.30000000000000004)
  return Number(r.toPrecision(Math.max(sig, 1)));
}

/** Compact number for legends / tooltips: 0.005, 0.12, 1.5, 12, 1250. */
export function fmtValue(v, sig = 3) {
  if (!isNum(v)) return '';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1000) return String(Math.round(v));
  if (a >= 100) return v.toFixed(0);
  const s = Number(v.toPrecision(sig));
  return String(s);
}

function dedupe(breaks) {
  const out = [];
  for (const b of breaks) if (isNum(b) && (!out.length || b > out[out.length - 1])) out.push(b);
  return out;
}

/** Breaks at the given quantiles (ascending, duplicates removed). */
export function quantileBreaks(values, qs = PERCENTILES, { round = true } = {}) {
  const s = finiteSorted(values);
  if (!s.length) return [];
  const raw = qs.map((p) => q(s, p));
  const br = dedupe(round ? raw.map((b) => niceRound(b, 2)) : raw);
  // a break at (or below) the minimum would leave class 0 empty
  return br.filter((b) => b > s[0]);
}

/** Orders of magnitude spanned by the positive values (0 when none). */
export function decades(values) {
  const s = finiteSorted(values).filter((v) => v > 0);
  if (s.length < 2) return 0;
  return Math.log10(s[s.length - 1] / s[0]);
}

/** Equal intervals in log10 space between the positive min and max. */
export function logBreaks(values, n = 6) {
  const s = finiteSorted(values).filter((v) => v > 0);
  if (s.length < 2 || n < 2) return [];
  const lo = Math.log10(q(s, 0.02));
  const hi = Math.log10(q(s, 0.98));
  if (!(hi > lo)) return [];
  const br = [];
  for (let i = 1; i < n; i++) br.push(niceRound(10 ** (lo + ((hi - lo) * i) / n), 2));
  return dedupe(br);
}

/** Equal intervals between P2 and P98 (robust to outliers). */
export function linearBreaks(values, n = 6) {
  const s = finiteSorted(values);
  if (s.length < 2 || n < 2) return [];
  const lo = q(s, 0.02);
  const hi = q(s, 0.98);
  if (!(hi > lo)) return [];
  const br = [];
  for (let i = 1; i < n; i++) br.push(niceRound(lo + ((hi - lo) * i) / n, 2));
  return dedupe(br);
}

/** Index of the class a value falls in: class i holds breaks[i-1] <= v < breaks[i]. */
export function classIndex(breaks, v) {
  if (!isNum(v)) return -1;
  let lo = 0;
  let hi = breaks.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (v >= breaks[m]) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/**
 * Classed colour scale for assay values.
 *   method: 'quantile' (geochemical percentiles) | 'log' (equal log intervals) | 'linear'
 *   'auto' picks 'quantile'. Log awareness: `log` is true when the positive values
 *   span >= 2 decades; the legend bar and number formatting use it.
 * Returns {method, breaks, colors, log, min, max, n, classOf, color, legend, t}
 */
export function makeClassScale(values, { method = 'quantile', classes = 6, stops = RAMPS.light, qs = PERCENTILES } = {}) {
  const s = finiteSorted(values);
  const log = decades(s) >= 2;
  const m = method === 'auto' ? 'quantile' : method;
  let breaks = [];
  if (m === 'quantile') breaks = quantileBreaks(s, qs);
  else if (m === 'log') breaks = logBreaks(s, classes);
  else breaks = linearBreaks(s, classes);
  if (m === 'log' && !breaks.length) breaks = quantileBreaks(s, qs);
  const colors = rampColors(stops, breaks.length + 1);
  const counts = new Array(breaks.length + 1).fill(0);
  for (const v of s) counts[classIndex(breaks, v)]++;
  const min = s.length ? s[0] : null;
  const max = s.length ? s[s.length - 1] : null;
  const legend = colors.map((color, i) => {
    const from = i === 0 ? min : breaks[i - 1];
    const to = i === breaks.length ? max : breaks[i];
    let label;
    if (!breaks.length) label = s.length ? `${fmtValue(min)} – ${fmtValue(max)}` : '';
    else if (i === 0) label = `< ${fmtValue(breaks[0])}`;
    else if (i === breaks.length) label = `≥ ${fmtValue(breaks[i - 1])}`;
    else label = `${fmtValue(breaks[i - 1])} – ${fmtValue(breaks[i])}`;
    let pct = '';
    if (m === 'quantile' && breaks.length === qs.length) {
      const P = (p) => `P${Math.round(p * 100)}`;
      pct = i === 0 ? `< ${P(qs[0])}` : i === qs.length ? `≥ ${P(qs[i - 1])}` : `${P(qs[i - 1])}–${P(qs[i])}`;
    }
    return { from, to, color, label, pct, count: counts[i] };
  });
  /** Position (0..1) of a value along the data range, log-aware; for gradient bars. */
  const t = (v) => {
    if (!isNum(v) || min === null || max === min) return 0;
    if (log && v > 0) {
      const pos = s.find((x) => x > 0);
      const lo = Math.log10(pos);
      return Math.max(0, Math.min(1, (Math.log10(v) - lo) / (Math.log10(max) - lo)));
    }
    return Math.max(0, Math.min(1, (v - min) / (max - min)));
  };
  return {
    method: m,
    breaks,
    colors,
    log,
    min,
    max,
    n: s.length,
    classOf: (v) => classIndex(breaks, v),
    color: (v, fallback = null) => (isNum(v) ? colors[classIndex(breaks, v)] : fallback),
    legend,
    t,
  };
}

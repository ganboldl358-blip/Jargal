// Strip log (graphic log): one drill hole drawn as a printed-style SVG log —
// depth ruler, lithology, weathering, alteration, sulphides, veins, recovery /
// RQD, samples with QC, assay and pXRF step curves, structure tadpoles and
// comments. Colours come from the design tokens so the log reads in light and
// dark themes; "Export SVG" resolves the tokens so the file stands on its own.
//
//   StripLog      embeddable log (hole workspace side panel, comparison view)
//   StripLogView  full-page route: hole picker, optional second hole side by side

import { html, useState, useEffect, useLayoutEffect, useRef, useMemo } from '../../lib.js';
import { S, rows, hole, holes, codes, codeColor, meaning, settings, assayValues, elementKeys } from '../../core/store.js';
import { TABLES, SULPHIDES, elementLabel } from '../../core/schema.js';
import { isNum, fix, natCmp, escapeHtml, todayISO, safeColor } from '../../core/util.js';
import '../../core/structure.js'; // registers S.ctx.orient (true dip of structures)
import * as L from '../../core/logscale.js';
import { useStore, usePref, useSize, injectCSS, saveFile, toast, navigate, Select, Empty, Button } from '../kit.js';
import { Icon } from '../icons.js';
import { tr, t as tk, label as fieldLabel } from '../../i18n.js';

// ------------------------------------------------------------ constants

const HEAD_H = 62; // header row (track titles + scales)
const TOP = 12; // space above 0 m
const BOT = 40; // space below the deepest data / EOH
const FONT = 'font-family:var(--font)';
const MONO = 'font-family:var(--mono)';
const r1 = (v) => Math.round(v * 10) / 10;

const SUL_GROUPS = [
  { key: 'py', fields: ['py'], color: '#d3b340', label: { en: 'Pyrite', mn: 'Пирит' } },
  { key: 'cpy', fields: ['cpy'], color: '#e0842a', label: { en: 'Chalcopyrite', mn: 'Халькопирит' } },
  { key: 'bn', fields: ['bn'], color: '#8c5aa8', label: { en: 'Bornite', mn: 'Борнит' } },
  { key: 'oth', fields: ['po', 'cc', 'pn', 'sph', 'gn', 'asp'], color: '#8a979b', label: { en: 'Other sulphides', mn: 'Бусад сульфид' } },
];
const WEATH_COL = { 1: '#8f5227', 2: '#a86934', 3: '#bf8547', 4: '#cda26a', 5: '#d6bb8e', 6: '#aebbb6' };
const STR_COL = { FLT: '#d0453a', SHR: '#9b59b6', JNT: '#7f8c8d', VN: '#3d7cc9', FOL: '#3f9a5a', BED: '#b07a3c', CNT: '#c98a12', FRC: '#95a5a6' };
const DUP_COL = '#8a4a8a';
const PX_PREF = ['Cu_ppm', 'Cu_pct', 'Cu', 'Zn_ppm', 'Fe_pct', 'S_pct'];

const T = {
  depth: { en: 'Depth', mn: 'Гүн' },
  lith: { en: 'Lithology', mn: 'Литологи' },
  weath: { en: 'Weathering', mn: 'Өгөршил' },
  alt: { en: 'Alteration', mn: 'Хувирал' },
  sulph: { en: 'Sulphides', mn: 'Сульфид' },
  vein: { en: 'Veins', mn: 'Судал' },
  geo: { en: 'Recovery', mn: 'Авралт' },
  samples: { en: 'Samples', mn: 'Дээж' },
  struct: { en: 'Structure', mn: 'Бүтэц' },
  comments: { en: 'Comments', mn: 'Тайлбар' },
  max: { en: 'max', mn: 'макс' },
};

// Track catalogue: preferred width, min (narrow panes), max (wide screens), growth share.
const TRACKS = {
  depth: { label: T.depth, w: 46, min: 36, grow: 0 },
  lith: { label: T.lith, short: { en: 'Lith', mn: 'Лит.' }, w: 64, min: 34, max: 120, grow: 1, table: 'lith' },
  weath: { label: T.weath, short: { en: 'Weath.', mn: 'Өгөр.' }, w: 20, min: 12, max: 28, grow: 0.1, table: 'lith' },
  alt: { label: T.alt, short: { en: 'Alt.', mn: 'Хув.' }, w: 36, min: 18, max: 60, grow: 0.3, table: 'lith' },
  sulph: { label: T.sulph, short: { en: 'Sulph.', mn: 'Сульф.' }, w: 66, min: 34, max: 130, grow: 0.6, table: 'lith' },
  vein: { label: T.vein, short: { en: 'Vein', mn: 'Судал' }, w: 40, min: 22, max: 70, grow: 0.2, table: 'lith' },
  geo: { label: T.geo, short: { en: 'Rec.', mn: 'Авр.' }, w: 66, min: 38, max: 130, grow: 0.6, table: 'geotech' },
  samples: { label: T.samples, short: { en: 'Smpl', mn: 'Дээж' }, w: 64, min: 34, max: 96, grow: 0.3, table: 'samples' },
  assay: { w: 76, min: 44, max: 180, grow: 1, table: 'samples' },
  pxrf: { w: 70, min: 40, max: 160, grow: 0.8, table: 'pxrf' },
  struct: { label: T.struct, short: { en: 'Struct', mn: 'Бүтэц' }, w: 56, min: 30, max: 90, grow: 0.3, table: 'struct' },
  comments: { label: T.comments, w: 150, min: 76, grow: 2.5, table: 'lith' },
};

const G_MINUS = 'M5 12h14';
const G_PLUS = 'M12 5v14M5 12h14';
const G_FIT = 'M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4';
const Glyph = ({ d }) => html`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d=${d} /></svg>`;

const sulphOf = (r, g) => g.fields.reduce((s, k) => s + (isNum(r[k]) && r[k] > 0 ? r[k] : 0), 0);
const sulphTotal = (r) => SUL_GROUPS.reduce((s, g) => s + sulphOf(r, g), 0);
const strColor = (type) => codeColor('STRTYPE', type, '') || STR_COL[type] || '#7f8c8d';
const span = (r) => `${fix(r.from, 2)}–${fix(r.to, 2)} m`;

function orientSafe(r) {
  try {
    return S.ctx.orient ? S.ctx.orient(r) : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------- data

/** Everything the log draws for one hole (one pass over the store). */
function collect(holeId, pxPick) {
  const h = hole(holeId);
  const good = (r) => isNum(r.from) && isNum(r.to) && r.to > r.from;
  const lith = rows('lith', holeId).filter(good);
  const geo = rows('geotech', holeId).filter(good);
  const struct = rows('struct', holeId).filter((r) => isNum(r.depth));
  const samplesAll = rows('samples', holeId);
  const prim = samplesAll.filter((s) => L.isPrimary(s) && good(s)).sort((a, b) => a.from - b.from || a.to - b.to);
  const qc = L.placeQC(samplesAll);
  const stg = settings();
  const assays = (stg.stripElements || []).map((key) => {
    const segs = prim.map((s) => {
      const a = assayValues(s.sampleId);
      const raw = a?.values?.[key];
      const flag = a?.flags?.[key];
      return { from: s.from, to: s.to, v: L.plotValue(raw, flag, stg.belowDetection), raw, flag, row: s };
    });
    return { key, segs, thr: L.gradeThreshold(key, stg.elements), any: segs.some((s) => isNum(s.v)) };
  });
  const pxRows = rows('pxrf', holeId);
  const pxSeen = new Set();
  for (const r of pxRows) for (const [k, v] of Object.entries(r.values || {})) if (isNum(v)) pxSeen.add(k);
  const pxKeys = [...pxSeen].sort(natCmp);
  const pxEl = pxPick && pxSeen.has(pxPick) ? pxPick : PX_PREF.find((k) => pxSeen.has(k)) || pxKeys[0] || '';
  const pxrf = pxEl ? L.aggregateReadings(pxRows, pxEl) : [];

  const eoh = isNum(h?.eoh) ? h.eoh : null;
  let depth = eoh ?? 0;
  const up = (v) => {
    if (isNum(v) && v > depth) depth = v;
  };
  for (const r of lith) up(r.to);
  for (const r of geo) up(r.to);
  for (const r of prim) up(r.to);
  for (const r of struct) up(r.depth);
  for (const g of pxrf) up(g.to ?? g.from);
  for (const q of qc) up(q.depth);
  if (!(depth > 0)) depth = isNum(h?.plannedDepth) && h.plannedDepth > 0 ? h.plannedDepth : 10;
  return { holeId, h, lith, geo, struct, prim, qc, assays, pxrf, pxEl, pxKeys, depth, eoh };
}

/** Depth (m) the log of a hole spans: EOH or the deepest data. */
export function stripLogDepth(holeId) {
  return holeId ? collect(holeId, '').depth : 0;
}

function trackList(d) {
  const out = [];
  const add = (key, extra, base = key) => out.push({ key, ...TRACKS[base], ...extra });
  add('depth', { has: true });
  add('lith', { has: d.lith.length > 0 });
  add('weath', { has: d.lith.some((r) => L.weathFrac(r.weathering) > 0) });
  add('alt', { has: d.lith.some((r) => r.alt1 || r.alt2) });
  add('sulph', { has: d.lith.some((r) => sulphTotal(r) > 0) });
  add('vein', { has: d.lith.some((r) => isNum(r.veinPct) && r.veinPct > 0) });
  add('geo', { has: d.geo.some((r) => isNum(r.recovered) || isNum(r.rqd)) });
  add('samples', { has: d.prim.length > 0 || d.qc.length > 0 });
  for (const a of d.assays) add('assay:' + a.key, { label: elementLabel(a.key), short: elementLabel(a.key).split(' ')[0], assay: a, has: a.any }, 'assay');
  add('pxrf', { label: 'pXRF', has: d.pxrf.length > 0 });
  add('struct', { has: d.struct.length > 0 });
  add('comments', { has: d.lith.some((r) => r.comments && String(r.comments).trim()) });
  return out;
}

// ------------------------------------------------------------ headers

function drawAxis(a) {
  const yA = HEAD_H - 15;
  let d = `M${r1(a.x0)} ${yA}H${r1(a.x1)}`;
  for (const x of a.ticks) d += `M${r1(x)} ${yA}v4`;
  return html`<g>
    <path d=${d} style="stroke:var(--muted);stroke-width:0.8;fill:none" />
    ${a.labels.map((l) => html`<text x=${r1(l.x)} y=${HEAD_H - 4} text-anchor=${l.anchor} style=${`fill:var(--muted);${MONO};font-size:8.5px`}>${l.text}</text>`)}
  </g>`;
}

/** Header cell: title (rotated when the track is narrow), subtitle, scale axis. */
function headCell(t, { sub, rich, axis } = {}) {
  const full = tr(t.label);
  const short = t.short ? tr(t.short) : full;
  const cx = t.x + t.w / 2;
  const fits = (s) => s.length * 6.2 + 8 <= t.w;
  const flat = fits(full) || fits(short);
  let title;
  if (flat) title = html`<text x=${r1(cx)} y="17" text-anchor="middle" style=${`fill:var(--ink);${FONT};font-size:10.5px;font-weight:600`}>${fits(full) ? full : short}</text>`;
  else {
    const txt = L.fitHead(tr(t.short || t.label), Math.floor((HEAD_H - (axis ? 24 : 10)) / 5.8));
    title = html`<text transform=${`translate(${r1(cx + 3.5)} ${HEAD_H - (axis ? 20 : 6)}) rotate(-90)`} style=${`fill:var(--ink);${FONT};font-size:9.5px;font-weight:600`}>${txt}</text>`;
  }
  const subEl = flat
    ? rich || (sub ? html`<text x=${r1(cx)} y="31" text-anchor="middle" style=${`fill:var(--muted);${MONO};font-size:9px`}>${L.fitHead(sub, Math.floor((t.w - 4) / 5.4))}</text>` : null)
    : null;
  return html`<g>
    <rect x=${t.x} y="0" width=${t.w} height=${HEAD_H} style="fill:var(--surface-2)" />
    ${title}${subEl}${axis && t.w >= 30 ? drawAxis(axis) : null}
  </g>`;
}

const vGrid = (xs, c) => xs.map((x) => `M${r1(x)} ${TOP}V${r1(c.y(c.d.depth))}`).join('');

// ------------------------------------------------------------- tracks

function drawDepth(t, d, c) {
  const xr = t.x + t.w;
  let minor = '';
  let major = '';
  for (const m of c.ticks.minorDepths) minor += `M${xr - 4} ${r1(c.y(m))}h4`;
  for (const m of c.ticks.midDepths) minor += `M${xr - 6} ${r1(c.y(m))}h6`;
  for (const m of c.ticks.majorDepths) major += `M${xr - 9} ${r1(c.y(m))}h9`;
  const yEoh = isNum(d.eoh) ? c.y(d.eoh) : null;
  const labels = c.ticks.majorDepths
    .filter((m) => yEoh === null || Math.abs(c.y(m) - yEoh) > 12 || c.y(m) < yEoh - 12)
    .map((m) => html`<text x=${xr - 11} y=${r1(c.y(m))} dy="0.34em" text-anchor="end">${L.depthLabel(m, c.ticks.major)}</text>`);
  return {
    head: headCell(t, { sub: tr({ en: 'm', mn: 'м' }) }),
    body: html`<g>
      <path d=${`M${xr - 0.5} ${TOP}V${r1(c.y(d.depth))}`} style="stroke:var(--line-2);stroke-width:1" />
      <path d=${minor} style="stroke:var(--muted);stroke-width:0.7;fill:none" />
      <path d=${major} style="stroke:var(--ink-2);stroke-width:1;fill:none" />
      <g style=${`fill:var(--ink-2);${MONO};font-size:9.5px`}>${labels}</g>
    </g>`,
  };
}

function drawLith(t, d, c) {
  const x = t.x + 1;
  const w = t.w - 2;
  const byColor = new Map();
  let cl = '';
  let seps = '';
  const labels = [];
  const iv = [];
  const cols = Math.floor((w - 2) / 5.8);
  for (const r of d.lith) {
    const y0 = c.y(r.from);
    const y1 = c.y(r.to);
    const hgt = y1 - y0;
    iv.push({ y0, y1, row: r, table: 'lith', kind: 'lith' });
    const isCL = r.lith1 === 'CL';
    const col = codeColor('LITH', r.lith1);
    if (isCL) cl += L.rectPath(x, y0, w, hgt);
    else byColor.set(col, (byColor.get(col) || '') + L.rectPath(x, y0, w, hgt));
    if (hgt >= 3) seps += `M${x} ${r1(y0)}h${w}M${x} ${r1(y1)}h${w}`;
    if (hgt >= 10 && r.lith1 && cols >= 2) {
      const named = !isCL && hgt >= 28 && w >= 72 && meaning('LITH', r.lith1);
      const cy = (y0 + y1) / 2 - (named ? 5 : 0);
      const ink = isCL ? undefined : L.inkOn(col);
      const halo = isCL ? 'fill:var(--ink);paint-order:stroke;stroke:var(--surface);stroke-width:3px' : undefined;
      labels.push(html`<text x=${r1(x + w / 2)} y=${r1(cy)} dy="0.34em" text-anchor="middle" fill=${ink} style=${halo}>${L.fitHead(r.lith1, cols)}</text>`);
      if (named) labels.push(html`<text x=${r1(x + w / 2)} y=${r1(cy + 11)} dy="0.34em" text-anchor="middle" fill=${ink} style=${`${FONT};font-size:8.5px;font-weight:400;opacity:0.85`}>${L.fitHead(meaning('LITH', r.lith1), Math.floor((w - 6) / 4.8))}</text>`);
    }
  }
  return {
    head: headCell(t, { sub: 'Lith1' }),
    body: html`<g>
      ${[...byColor].map(([col, p]) => html`<path d=${p} fill=${col} />`)}
      ${cl ? html`<path d=${cl} fill=${`url(#${c.uid}-cl)`} />` : null}
      <path d=${seps} stroke="#000" stroke-opacity="0.28" stroke-width="0.6" fill="none" />
      <g style=${`${MONO};font-size:9px;font-weight:600`}>${labels}</g>
    </g>`,
    iv,
  };
}

function drawWeath(t, d, c) {
  const byColor = new Map();
  const iv = [];
  for (const r of d.lith) {
    const f = L.weathFrac(r.weathering);
    if (!f) continue;
    const y0 = c.y(r.from);
    const y1 = c.y(r.to);
    const col = WEATH_COL[Number(r.weathering)];
    byColor.set(col, (byColor.get(col) || '') + L.rectPath(t.x + 1, y0, (t.w - 2) * f, y1 - y0));
    iv.push({ y0, y1, row: r, table: 'lith', kind: 'lith' });
  }
  return {
    head: headCell(t, { sub: '1–6' }),
    body: html`<g>${[...byColor].map(([col, p]) => html`<path d=${p} fill=${col} />`)}</g>`,
    iv,
  };
}

function drawAlt(t, d, c) {
  const has2 = d.lith.some((r) => r.alt2) && t.w >= 24;
  const main = t.w - 2 - (has2 ? 6 : 0);
  const byColor = new Map();
  const add = (col, p) => byColor.set(col, (byColor.get(col) || '') + p);
  const iv = [];
  for (const r of d.lith) {
    if (!r.alt1 && !r.alt2) continue;
    const y0 = c.y(r.from);
    const y1 = c.y(r.to);
    if (r.alt1) add(codeColor('ALT', r.alt1), L.rectPath(t.x + 1, y0, main * (L.intFrac(r.int1) || 0.5), y1 - y0));
    if (r.alt2 && has2) add(codeColor('ALT', r.alt2), L.rectPath(t.x + t.w - 6, y0, 5, y1 - y0));
    iv.push({ y0, y1, row: r, table: 'lith', kind: 'lith' });
  }
  return {
    head: headCell(t, { sub: 'Alt1 · Int' }),
    body: html`<g>${[...byColor].map(([col, p]) => html`<path d=${p} fill=${col} stroke="#000" stroke-opacity="0.18" stroke-width="0.5" />`)}</g>`,
    iv,
  };
}

function drawSulph(t, d, c) {
  const x0 = t.x + 3;
  const x1 = t.x + t.w - 4;
  const dom = L.valueDomain(d.lith.map(sulphTotal), false);
  const sx = L.valueScale(dom, x0, x1);
  const paths = SUL_GROUPS.map(() => '');
  const iv = [];
  for (const r of d.lith) {
    const tot = sulphTotal(r);
    if (!(tot > 0)) continue;
    const y0 = c.y(r.from);
    const y1 = c.y(r.to);
    let cum = 0;
    SUL_GROUPS.forEach((g, i) => {
      const v = sulphOf(r, g);
      if (!(v > 0)) return;
      const a = sx(cum);
      cum += v;
      paths[i] += L.rectPath(a, y0, sx(cum) - a, y1 - y0);
    });
    iv.push({ y0, y1, row: r, table: 'lith', kind: 'lith' });
  }
  const ticks = L.valueTicks(dom).map(sx);
  return {
    head: headCell(t, {
      sub: 'py·cpy·bn %',
      axis: { x0, x1, ticks: [ticks[0], ticks[2], ticks[4]], labels: [{ x: x0, text: '0', anchor: 'start' }, { x: x1, text: `${L.fmtVal(dom.max)}%`, anchor: 'end' }] },
    }),
    body: html`<g>
      <path d=${vGrid(ticks.slice(1, -1), c)} style="stroke:var(--line);stroke-width:0.8;stroke-dasharray:2 3" />
      ${paths.map((p, i) => (p ? html`<path d=${p} fill=${SUL_GROUPS[i].color} />` : null))}
    </g>`,
    iv,
  };
}

function drawVein(t, d, c) {
  const x0 = t.x + 3;
  const x1 = t.x + t.w - 4;
  const dom = L.valueDomain(d.lith.map((r) => r.veinPct), false);
  dom.max = Math.min(100, dom.max);
  const sx = L.valueScale(dom, x0, x1);
  let p = '';
  const iv = [];
  for (const r of d.lith) {
    if (!(isNum(r.veinPct) && r.veinPct > 0)) continue;
    const y0 = c.y(r.from);
    const y1 = c.y(r.to);
    p += L.rectPath(x0, y0, sx(r.veinPct) - x0, y1 - y0);
    iv.push({ y0, y1, row: r, table: 'lith', kind: 'lith' });
  }
  return {
    head: headCell(t, { sub: 'VQZ %', axis: { x0, x1, ticks: [x0, x1], labels: [{ x: x1, text: L.fmtVal(dom.max), anchor: 'end' }] } }),
    body: html`<path d=${p} style="fill:var(--info);fill-opacity:0.6;stroke:var(--info);stroke-width:0.6" />`,
    iv,
  };
}

function drawGeo(t, d, c) {
  const x0 = t.x + 4;
  const x1 = t.x + t.w - 5;
  const sx = (p) => x0 + ((x1 - x0) * Math.max(0, Math.min(100, p))) / 100;
  const rec = [];
  const rqd = [];
  let loss = '';
  const iv = [];
  for (const r of d.geo) {
    const len = r.to - r.from;
    const rp = isNum(r.recovered) ? (100 * r.recovered) / len : null;
    const qp = isNum(r.rqd) ? (100 * r.rqd) / len : null;
    rec.push({ from: r.from, to: r.to, v: rp });
    rqd.push({ from: r.from, to: r.to, v: qp });
    const y0 = c.y(r.from);
    const y1 = c.y(r.to);
    if (isNum(rp) && rp < 100) loss += L.rectPath(sx(rp), y0, x1 - sx(rp), y1 - y0);
    iv.push({ y0, y1, row: r, table: 'geotech', kind: 'geo' });
  }
  const R = L.stepPaths(rec, sx, c.y, x0);
  const Q = L.stepPaths(rqd, sx, c.y, x0);
  const rich = html`<text x=${r1(t.x + t.w / 2)} y="31" text-anchor="middle" style=${`${MONO};font-size:9px`}><tspan style="fill:var(--accent)">Rec</tspan><tspan style="fill:var(--muted)"> · </tspan><tspan style="fill:var(--info)">RQD</tspan></text>`;
  return {
    head: headCell(t, {
      rich,
      axis: { x0, x1, ticks: [x0, sx(50), x1], labels: [{ x: x0, text: '0', anchor: 'start' }, { x: x1, text: '100%', anchor: 'end' }] },
    }),
    body: html`<g>
      <path d=${vGrid([sx(25), sx(50), sx(75)], c)} style="stroke:var(--line);stroke-width:0.8;stroke-dasharray:2 3" />
      <path d=${loss} style="fill:var(--err);fill-opacity:0.16" />
      <path d=${Q.area} style="fill:var(--info);fill-opacity:0.22" />
      <path d=${Q.line} style="fill:none;stroke:var(--info);stroke-width:1" />
      <path d=${R.line} style="fill:none;stroke:var(--accent);stroke-width:1.5;stroke-linejoin:round" />
    </g>`,
    iv,
  };
}

function qcMark(kind, row, cx, cy) {
  if (kind === 'crm') return html`<path d=${`M${r1(cx)} ${r1(cy - 4.6)}L${r1(cx + 4.6)} ${r1(cy)}L${r1(cx)} ${r1(cy + 4.6)}L${r1(cx - 4.6)} ${r1(cy)}Z`} style="fill:var(--brass);stroke:var(--surface);stroke-width:1" />`;
  if (kind === 'blank') return html`<rect x=${r1(cx - 3.6)} y=${r1(cy - 3.6)} width="7.2" height="7.2" style="fill:var(--info);stroke:var(--surface);stroke-width:1" />`;
  return html`<circle cx=${r1(cx)} cy=${r1(cy)} r="3.7" fill=${codeColor('SAMPTYPE', row.sampleType, DUP_COL)} style="stroke:var(--surface);stroke-width:1" />`;
}

function drawSamples(t, d, c) {
  const qcW = d.qc.length ? 14 : 0;
  const x0 = t.x + 3;
  const bw = Math.max(6, t.w - 6 - qcW);
  const lens = d.prim.map((s) => s.to - s.from).sort((a, b) => a - b);
  const thin = !lens.length || lens[lens.length >> 1] * c.ppm < 6;
  let done = '';
  let pend = '';
  let ticks = '';
  const labels = [];
  const iv = [];
  const cols = Math.floor((bw - 2) / 5.2);
  for (const s of d.prim) {
    const y0 = c.y(s.from);
    const y1 = c.y(s.to);
    const p = L.rectPath(x0, y0, bw, y1 - y0);
    if (assayValues(s.sampleId)) done += p;
    else pend += p;
    if (thin) ticks += `M${r1(x0)} ${r1(y0)}h5`;
    iv.push({ y0, y1, row: s, table: 'samples', kind: 'sample' });
    if (y1 - y0 >= 9 && cols >= 3) labels.push(html`<text x=${r1(x0 + bw / 2)} y=${r1((y0 + y1) / 2)} dy="0.34em" text-anchor="middle">${L.fitTail(s.sampleId, cols)}</text>`);
  }
  const stroke = thin ? '' : ';stroke:var(--muted);stroke-width:0.6';
  const marks = [];
  const pts = [];
  let lastY = -Infinity;
  let stack = 0;
  for (const q of d.qc) {
    const cy = c.y(q.depth);
    stack = cy - lastY < 8 ? stack + 1 : 0;
    lastY = cy;
    const cx = Math.max(t.x + 5, t.x + t.w - 8 - stack * 8);
    marks.push(qcMark(q.kind, q.row, cx, cy));
    pts.push({ x: cx, y: cy, row: q.row, q, table: 'samples', kind: 'qc' });
  }
  const nq = d.qc.length;
  return {
    head: headCell(t, { sub: nq ? `${d.prim.length} · QC ${nq}` : String(d.prim.length) }),
    body: html`<g>
      <path d=${pend} style=${'fill:var(--surface-3)' + stroke} />
      <path d=${done} style=${'fill:var(--accent-soft)' + stroke} />
      ${thin ? html`<path d=${ticks} style="stroke:var(--ink-2);stroke-width:0.8;stroke-opacity:0.7" />` : null}
      <g style=${`fill:var(--ink-2);${MONO};font-size:8.5px`}>${labels}</g>
      ${marks}
    </g>`,
    iv,
    pts,
  };
}

/** Step curve shared by assay and pXRF tracks. */
function drawCurve(t, d, c, { segs, thr, color, sub, lead }) {
  const x0 = t.x + 4;
  const x1 = t.x + t.w - 5;
  const dom = L.valueDomain(
    segs.map((s) => s.v),
    c.log,
  );
  const sx = L.valueScale(dom, x0, x1);
  const ticks = L.valueTicks(dom);
  const steps = segs.filter((s) => isNum(s.to));
  const { line, area } = L.stepPaths(steps, sx, c.y, x0);
  let pl = '';
  let dots = '';
  segs
    .filter((s) => !isNum(s.to) && isNum(s.v))
    .forEach((s, i) => {
      const x = r1(sx(s.v));
      const y = r1(c.y(s.from));
      pl += `${i ? 'L' : 'M'}${x} ${y}`;
      dots += `M${x - 1.6} ${y}a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0`;
    });
  let hi = '';
  if (isNum(thr)) for (const s of steps) if (isNum(s.v) && s.v >= thr) hi += L.rectPath(x0, c.y(s.from), sx(s.v) - x0, c.y(s.to) - c.y(s.from));
  const thrX = isNum(thr) && thr > dom.min && thr < dom.max ? sx(thr) : null;
  let top = null;
  for (const s of segs) if (isNum(s.v) && (!top || s.v > top.v)) top = s;
  let maxLabel = null;
  if (top && top.v > 0) {
    const x = sx(top.v);
    const y = isNum(top.to) ? (c.y(top.from) + c.y(top.to)) / 2 : c.y(top.from);
    const left = x - x0 > 34;
    maxLabel = html`<g>
      <circle cx=${r1(x)} cy=${r1(y)} r="2.2" style=${`fill:${color}`} />
      <text x=${r1(left ? x - 4 : x + 4)} y=${r1(y)} dy="0.34em" text-anchor=${left ? 'end' : 'start'} style=${`fill:var(--ink);${MONO};font-size:9px;font-weight:700;paint-order:stroke;stroke:var(--surface);stroke-width:3px;stroke-linejoin:round`}>${L.fmtVal(isNum(top.raw) && top.raw > 0 ? top.raw : top.v)}</text>
    </g>`;
  }
  const iv = steps.map((s) => ({ y0: c.y(s.from), y1: c.y(s.to), ...s.hit }));
  const pts = segs.filter((s) => !isNum(s.to) && isNum(s.v)).map((s) => ({ x: sx(s.v), y: c.y(s.from), ...s.hit }));
  const axTicks = dom.log ? ticks.map(sx) : [sx(ticks[0]), sx(ticks[2]), sx(ticks[4])];
  return {
    head: headCell(t, {
      sub: `${lead ? lead + ' · ' : ''}${tr(T.max)} ${L.fmtVal(dom.dataMax)}${dom.log ? ' · log' : ''}${sub ? ' · ' + sub : ''}`,
      axis: { x0, x1, ticks: axTicks, labels: [{ x: x0, text: L.fmtVal(dom.min), anchor: 'start' }, { x: x1, text: L.fmtVal(dom.max), anchor: 'end' }] },
    }),
    body: html`<g>
      <path d=${vGrid(ticks.slice(1, -1).map(sx), c)} style="stroke:var(--line);stroke-width:0.8;stroke-dasharray:2 3" />
      <path d=${area} style=${`fill:${color};fill-opacity:0.13`} />
      ${hi ? html`<path d=${hi} style="fill:var(--brass);fill-opacity:0.9" />` : null}
      ${thrX !== null ? html`<path d=${`M${r1(thrX)} ${TOP}V${r1(c.y(d.depth))}`} style="stroke:var(--brass);stroke-width:1;stroke-dasharray:4 3" />` : null}
      <path d=${line} style=${`fill:none;stroke:${color};stroke-width:1.3;stroke-linejoin:round`} />
      ${pl ? html`<path d=${pl} style=${`fill:none;stroke:${color};stroke-width:1;stroke-linejoin:round`} /><path d=${dots} style=${`fill:${color}`} />` : null}
      ${maxLabel}
    </g>`,
    iv,
    pts,
  };
}

function drawAssay(t, d, c) {
  const a = t.assay;
  const segs = a.segs.map((s) => ({ ...s, hit: { row: s.row, table: 'samples', kind: 'sample', key: a.key } }));
  return drawCurve(t, d, c, { segs, thr: a.thr, color: 'var(--accent)', sub: isNum(a.thr) ? `≥${L.fmtVal(a.thr)}` : '' });
}

function drawPxrf(t, d, c) {
  const segs = d.pxrf.map((g) => ({ from: g.from, to: g.to, v: g.v, hit: { row: g.rows[0], rows: g.rows, g, table: 'pxrf', kind: 'pxrf', key: d.pxEl } }));
  return drawCurve(t, d, c, { segs, thr: null, color: 'var(--info)', lead: elementLabel(d.pxEl) });
}

function drawStruct(t, d, c) {
  const x0 = t.x + 7;
  const x1 = t.x + t.w - 7;
  const TL = Math.max(6, Math.min(11, t.w / 4));
  const marks = [];
  const pts = [];
  for (const r of d.struct) {
    const cy = c.y(r.depth);
    const a = isNum(r.alpha) ? Math.max(0, Math.min(90, r.alpha)) : null;
    const cx = a === null ? (x0 + x1) / 2 : x0 + ((x1 - x0) * a) / 90;
    const col = strColor(r.type);
    const o = orientSafe(r);
    const rad = ((a ?? 0) * Math.PI) / 180;
    // tail at angle alpha from the core axis (down-hole = down): 90° → across the core
    const tx = cx - Math.sin(rad) * TL;
    const ty = cy + Math.cos(rad) * TL;
    marks.push(html`<g>
      ${a !== null ? html`<path d=${`M${r1(cx)} ${r1(cy)}L${r1(tx)} ${r1(ty)}`} stroke=${col} stroke-width="1.4" stroke-linecap="round" />` : null}
      <circle cx=${r1(cx)} cy=${r1(cy)} r="3" fill=${o ? col : undefined} stroke=${col} stroke-width="1.3" style=${o ? undefined : 'fill:var(--surface)'} />
    </g>`);
    pts.push({ x: cx, y: cy, row: r, table: 'struct', kind: 'struct', orient: o });
  }
  const sx = (v) => x0 + ((x1 - x0) * v) / 90;
  return {
    head: headCell(t, {
      sub: 'α 0–90°',
      axis: { x0, x1, ticks: [x0, sx(45), x1], labels: [{ x: x0, text: '0', anchor: 'start' }, { x: x1, text: '90', anchor: 'end' }] },
    }),
    body: html`<g>
      <path d=${vGrid([sx(30), sx(60)], c)} style="stroke:var(--line);stroke-width:0.8;stroke-dasharray:2 3" />
      ${marks}
    </g>`,
    pts,
  };
}

function drawComments(t, d, c) {
  const LH = 10.5;
  const cols = Math.max(4, Math.floor((t.w - 14) / 5.3));
  let lastBottom = -Infinity;
  let brackets = '';
  const texts = [];
  const iv = [];
  for (const r of d.lith) {
    const txt = r.comments && String(r.comments).trim();
    if (!txt) continue;
    const y0 = c.y(r.from);
    const y1 = c.y(r.to);
    iv.push({ y0, y1, row: r, table: 'lith', kind: 'lith' });
    const hgt = y1 - y0;
    const mid = (y0 + y1) / 2;
    // centred on the interval's mid-depth; never overlapping the note above
    let lines = L.wrapText(txt, cols, Math.max(1, Math.min(8, Math.floor((hgt - 2) / LH))));
    if (!lines.length) continue;
    const limit = Math.max(y1, mid + LH / 2);
    const top = Math.max(mid - (lines.length * LH) / 2, lastBottom + 1);
    const n = Math.floor((limit - top) / LH + 1e-6);
    if (n < 1) continue;
    if (n < lines.length) lines = L.wrapText(txt, cols, n);
    if (hgt >= 4) brackets += `M${r1(t.x + 6)} ${r1(y0 + 1)}h-2V${r1(y1 - 1)}h2`;
    const bx = r1(t.x + 9);
    texts.push(html`<text x=${bx} y=${r1(top + 8)}>${lines.map((ln, i) => html`<tspan x=${bx} dy=${i ? LH : 0}>${ln}</tspan>`)}</text>`);
    lastBottom = top + lines.length * LH;
  }
  return {
    head: headCell(t, { sub: tr({ en: 'lithology notes', mn: 'литологийн тэмдэглэл' }) }),
    body: html`<g>
      <path d=${brackets} style="fill:none;stroke:var(--line-2);stroke-width:1" />
      <g style=${`fill:var(--ink-2);${FONT};font-size:9.5px`}>${texts}</g>
    </g>`,
    iv,
  };
}

const DRAW = { depth: drawDepth, lith: drawLith, weath: drawWeath, alt: drawAlt, sulph: drawSulph, vein: drawVein, geo: drawGeo, samples: drawSamples, assay: drawAssay, pxrf: drawPxrf, struct: drawStruct, comments: drawComments };

// ------------------------------------------------------------ geometry

/** Lay out and draw the whole log. Pure given the store snapshot; memoised by the caller. */
const AUTO_DROP = ['comments', 'pxrf', 'vein'];

function buildLog(d, tracks, o) {
  let vis = tracks.filter((t) => t.has && (t.key === 'depth' || !o.hidden.includes(t.key)));
  const dropped = [];
  const minSum = () => vis.reduce((s, t) => s + (t.min ?? t.w), 0);
  for (const k of AUTO_DROP) {
    if (minSum() <= o.width) break;
    if (vis.some((t) => t.key === k)) {
      vis = vis.filter((t) => t.key !== k);
      dropped.push(k);
    }
  }
  const { tracks: laid, width: W } = L.layoutTracks(vis, Math.max(0, o.width));
  const ppm = o.ppm;
  const y = (m) => TOP + m * ppm;
  const H = Math.ceil(y(d.depth) + BOT);
  const ticks = L.depthTicks(ppm, d.depth);
  const c = { y, ppm, H, W, log: o.log, uid: o.uid, ticks, d };
  const heads = [];
  const bodies = [];
  const hits = {};
  const index = new Map();
  for (const t of laid) {
    const res = DRAW[t.key.startsWith('assay:') ? 'assay' : t.key](t, d, c);
    heads.push(res.head);
    bodies.push(res.body);
    hits[t.key] = { iv: res.iv || [], pts: res.pts || [] };
    const put = (id, cell, table) => {
      if (!id) return;
      const e = index.get(id) || { table, y0: Infinity, y1: -Infinity, cells: [] };
      e.cells.push(cell);
      e.y0 = Math.min(e.y0, cell.pt ? cell.y : cell.y0);
      e.y1 = Math.max(e.y1, cell.pt ? cell.y : cell.y1);
      index.set(id, e);
    };
    for (const it of hits[t.key].iv) for (const row of it.rows || [it.row]) put(row.id, { x: t.x, w: t.w, y0: it.y0, y1: it.y1 }, it.table);
    for (const p of hits[t.key].pts) put(p.row.id, { pt: true, x: p.x, y: p.y }, p.table);
  }
  const dt = laid[0];
  let grid = '';
  for (const m of ticks.majorDepths) grid += `M${dt.x + dt.w} ${r1(y(m))}H${W}`;
  let seps = '';
  for (const t of laid) seps += `M${t.x + t.w - 0.5} 0V${H}`;
  const yEoh = isNum(d.eoh) ? r1(y(d.eoh)) : null;

  const head = html`<svg width=${W} height=${HEAD_H} viewBox=${`0 0 ${W} ${HEAD_H}`} aria-hidden="true">
    ${heads}
    <path d=${laid.map((t) => `M${t.x + t.w - 0.5} 0V${HEAD_H}`).join('') + `M0 ${HEAD_H - 0.5}H${W}`} style="stroke:var(--line-2);stroke-width:1" />
  </svg>`;
  const body = html`<g>
    <defs>
      <pattern id=${`${o.uid}-cl`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
        <rect width="6" height="6" style="fill:var(--surface)" />
        <path d="M0 0V6" style="stroke:var(--ink-2);stroke-width:1.3" />
      </pattern>
    </defs>
    <rect x="0" y="0" width=${W} height=${H} style="fill:var(--surface)" />
    ${yEoh !== null ? html`<rect x="0" y=${yEoh} width=${W} height=${Math.max(0, H - yEoh)} style="fill:var(--surface-2)" />` : null}
    <path d=${grid} style="stroke:var(--line);stroke-width:1" />
    ${bodies}
    <path d=${seps} style="stroke:var(--line);stroke-width:1" />
    ${yEoh !== null
      ? html`<g>
          <path d=${`M0 ${yEoh}H${W}`} style="stroke:var(--err);stroke-width:1.4;stroke-dasharray:6 3" />
          <text x="4" y=${yEoh + 12} style=${`fill:var(--err);${MONO};font-size:9.5px;font-weight:700`}>EOH ${fix(d.eoh, 2)} m</text>
        </g>`
      : null}
  </g>`;
  return { tracks: laid, W, H, ppm, head, body, hits, index, dropped };
}

/** Laid-out geometry of a hole's log without rendering it (tests, print layouts). */
export function stripLogGeometry(holeId, { ppm = 4, width = 900, log = false, hidden = [], pxrf = '' } = {}) {
  const d = collect(holeId, pxrf);
  return buildLog(d, trackList(d), { ppm: L.clampPpm(ppm), width, log, hidden, uid: 'slg' });
}

function hitTest(g, x, y) {
  const t = g.tracks.find((tt) => x >= tt.x && x < tt.x + tt.w);
  if (!t) return null;
  const h = g.hits[t.key];
  const item = (h.pts.length ? L.findPoint(h.pts, x, y, 7) : null) || (h.iv.length ? L.findInterval(h.iv, y, 2) : null);
  return { track: t, item };
}

// ------------------------------------------------------------- tooltip

const kv = (k, v, strong) => html`<div class=${'slg-kv' + (strong ? ' on' : '')}><span>${k}</span><b>${v}</b></div>`;
const chip = (col) => html`<i class="slg-chip" style=${`background:${col}`}></i>`;

function valueText(a, key) {
  const v = a?.values?.[key];
  if (!isNum(v)) return '—';
  const unit = elementLabel(key).split(' ')[1] || '';
  return `${a.flags?.[key] === '<' ? '<' : ''}${L.fmtVal(Math.abs(v))}${unit ? ' ' + unit : ''}`;
}

function describe(it, track) {
  const r = it.row;
  if (it.kind === 'lith') {
    const lines = [];
    if (r.weathering) lines.push(kv(tr(T.weath), `${r.weathering} · ${meaning('WEATH', r.weathering)}`, track.key === 'weath'));
    for (const i of [1, 2, 3]) {
      const a = r['alt' + i];
      if (!a) continue;
      const bits = [meaning('ALT', a), r['int' + i] && `${r['int' + i]} (${meaning('INT', r['int' + i]).toLowerCase()})`, r['style' + i]].filter(Boolean).join(' · ');
      lines.push(html`<div class=${'slg-kv' + (track.key === 'alt' && i === 1 ? ' on' : '')}><span>${tr(T.alt)} ${i}</span><b>${chip(codeColor('ALT', a))}${a} ${bits}</b></div>`);
    }
    const sul = SULPHIDES.filter(([k]) => isNum(r[k]) && r[k] > 0)
      .map(([k]) => `${k} ${L.fmtVal(r[k])}`)
      .join(' · ');
    if (sul) lines.push(kv(tr(T.sulph), `${sul} %`, track.key === 'sulph'));
    if (isNum(r.veinPct) && r.veinPct > 0) lines.push(kv(tr(T.vein), `${L.fmtVal(r.veinPct)} %${r.veinStyle ? ' · ' + r.veinStyle : ''}${r.veinMinerals ? ' · ' + r.veinMinerals : ''}`, track.key === 'vein'));
    return html`
      <div class="slg-tip-h"><span>${tr(TABLES.lith.short)}</span><span class="mono">${span(r)}</span></div>
      <div class="slg-tip-t">${chip(r.lith1 === 'CL' ? 'var(--surface-3)' : codeColor('LITH', r.lith1))}<span class="mono">${r.lith1 || '—'}</span><span>${meaning('LITH', r.lith1)}</span></div>
      ${lines}
      ${r.comments ? html`<div class=${'slg-tip-note' + (track.key === 'comments' ? ' on' : '')}>${L.fitHead(String(r.comments), track.key === 'comments' ? 420 : 160)}</div>` : null}`;
  }
  if (it.kind === 'geo') {
    const len = r.to - r.from;
    return html`
      <div class="slg-tip-h"><span>${tr(TABLES.geotech.short)}</span><span class="mono">${span(r)}</span></div>
      ${kv(tr({ en: 'Recovery', mn: 'Авралт' }), isNum(r.recovered) ? `${L.fmtVal((100 * r.recovered) / len)} % (${fix(r.recovered, 2)} m)` : '—', true)}
      ${kv('RQD', isNum(r.rqd) ? `${L.fmtVal((100 * r.rqd) / len)} % (${fix(r.rqd, 2)} m)` : '—')}
      ${isNum(r.fractures) ? kv(tr({ en: 'Fractures', mn: 'Ан цав' }), r.fractures) : null}
      ${r.trayNo ? kv(tr({ en: 'Tray', mn: 'Хайрцаг' }), r.trayNo) : null}`;
  }
  if (it.kind === 'sample' || it.kind === 'qc') {
    const a = assayValues(r.sampleId);
    const keys = settings().stripElements || [];
    const where = it.q?.how === 'prev' ? tr({ en: 'placed after {s}', mn: '{s}-ийн дараа' }, { s: it.q.after }) : it.q?.how === 'parent' ? tr({ en: 'at parent {s}', mn: 'эх дээж {s}-ийн гүнд' }, { s: it.q.after }) : null;
    return html`
      <div class="slg-tip-h"><span>${tr(TABLES.samples.short)}</span><span class="mono">${isNum(r.from) && isNum(r.to) ? span(r) : where || '—'}</span></div>
      <div class="slg-tip-t"><span class="mono">${r.sampleId}</span><span>${r.sampleType || 'PRIM'} · ${meaning('SAMPTYPE', r.sampleType || 'PRIM')}</span></div>
      ${r.crm ? kv(tr({ en: 'Standard', mn: 'Стандарт' }), r.crm) : null}
      ${r.parentId ? kv(tr({ en: 'Duplicate of', mn: 'Эх дээж' }), r.parentId) : null}
      ${where && isNum(r.from) ? kv('', where) : null}
      ${a ? keys.map((k) => kv(elementLabel(k), valueText(a, k), track.assay?.key === k)) : kv(tr({ en: 'Status', mn: 'Төлөв' }), r.dispatchId ? tr({ en: 'dispatched', mn: 'илгээсэн' }) : tr({ en: 'awaiting dispatch', mn: 'илгээгээгүй' }))}`;
  }
  if (it.kind === 'pxrf') {
    const g = it.g;
    return html`
      <div class="slg-tip-h"><span>pXRF</span><span class="mono">${isNum(g.to) ? span(g) : `${fix(g.from, 2)} m`}</span></div>
      ${kv(elementLabel(it.key), L.fmtVal(g.v), true)}
      ${g.n > 1 ? kv(tr({ en: 'Readings', mn: 'Хэмжилт' }), `${g.n} (${tr({ en: 'mean', mn: 'дундаж' })})`) : r.reading ? kv(tr({ en: 'Reading', mn: 'Хэмжилт' }), r.reading) : null}`;
  }
  if (it.kind === 'struct') {
    const o = it.orient;
    return html`
      <div class="slg-tip-h"><span>${tr(TABLES.struct.short)}</span><span class="mono">${fix(r.depth, 2)} m</span></div>
      <div class="slg-tip-t">${chip(strColor(r.type))}<span class="mono">${r.type || '—'}</span><span>${meaning('STRTYPE', r.type)}</span></div>
      ${kv('α / β', `${isNum(r.alpha) ? Math.round(r.alpha) + '°' : '—'} / ${isNum(r.beta) ? Math.round(r.beta) + '°' : '—'}`, true)}
      ${o ? kv(tr({ en: 'True dip → dir', mn: 'Жинхэнэ налуу → чиг' }), `${Math.round(o.dip)}° → ${String(Math.round(o.dipDir)).padStart(3, '0')}°`) : kv(tr({ en: 'Orientation', mn: 'Чиглэл' }), tr({ en: 'unoriented', mn: 'чиглүүлээгүй' }))}
      ${isNum(r.thickness) ? kv(tr({ en: 'Thickness', mn: 'Зузаан' }), `${L.fmtVal(r.thickness)} cm`) : null}
      ${r.fill ? kv(tr({ en: 'Fill', mn: 'Дүүргэгч' }), r.fill) : null}
      ${r.comments ? html`<div class="slg-tip-note">${L.fitHead(String(r.comments), 160)}</div>` : null}`;
  }
  return null;
}

function Tip({ hover, clickable }) {
  const body = describe(hover.item, hover.track);
  if (!body) return null;
  const flipX = hover.px + 16 + 290 > hover.ww;
  const flipY = hover.py + 14 + 170 > hover.wh && hover.py > 170;
  const style = `left:${Math.round(flipX ? hover.px - 14 : hover.px + 16)}px;top:${Math.round(flipY ? hover.py - 12 : hover.py + 14)}px;transform:translate(${flipX ? '-100%' : '0'},${flipY ? '-100%' : '0'})`;
  return html`<div class="slg-tip" style=${style} role="tooltip">
    ${body}
    ${clickable ? html`<div class="slg-tip-foot">${tr({ en: 'Click to select', mn: 'Дарж сонгоно' })}</div>` : null}
  </div>`;
}

// -------------------------------------------------------------- legend

/** Combine collected holes (comparison legend). */
function mergeData(list) {
  if (list.length === 1) return list[0];
  const cat = (k) => list.flatMap((x) => x[k]);
  const assays = list[0].assays.map((a, i) => ({ ...a, any: list.some((x) => x.assays[i]?.any) }));
  return { ...list[0], lith: cat('lith'), geo: cat('geo'), struct: cat('struct'), prim: cat('prim'), qc: cat('qc'), pxrf: cat('pxrf'), assays };
}

/** Legend sections for what this hole actually shows. */
function legendModel(d) {
  const secs = [];
  const order = new Map(codes('LITH', { includeInactive: true }).map((c, i) => [c.code, i]));
  const lith = [...new Set(d.lith.map((r) => r.lith1).filter(Boolean))].sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || natCmp(a, b));
  if (lith.length) secs.push({ title: T.lith, items: lith.map((c) => ({ sym: c === 'CL' ? 'hatch' : 'rect', color: codeColor('LITH', c), code: c, label: meaning('LITH', c) })) });
  const alt = [...new Set(d.lith.flatMap((r) => [r.alt1, r.alt2]).filter(Boolean))].sort(natCmp);
  if (alt.length) secs.push({ title: T.alt, items: alt.map((c) => ({ sym: 'rect', color: codeColor('ALT', c), code: c, label: meaning('ALT', c) })) });
  const sul = SUL_GROUPS.filter((g) => d.lith.some((r) => sulphOf(r, g) > 0));
  if (sul.length) secs.push({ title: T.sulph, items: sul.map((g) => ({ sym: 'rect', color: g.color, label: tr(g.label) })) });
  const smp = [];
  if (d.prim.length) {
    smp.push({ sym: 'box', color: 'var(--accent-soft)', label: tr({ en: 'Assayed', mn: 'Шинжилсэн' }) });
    if (d.prim.some((s) => !assayValues(s.sampleId))) smp.push({ sym: 'box', color: 'var(--surface-3)', label: tr({ en: 'Awaiting results', mn: 'Хариу хүлээж буй' }) });
  }
  if (d.qc.some((q) => q.kind === 'crm')) smp.push({ sym: 'diamond', color: 'var(--brass)', label: 'CRM' });
  if (d.qc.some((q) => q.kind === 'blank')) smp.push({ sym: 'square', color: 'var(--info)', label: tr({ en: 'Blank', mn: 'Хоосон (blank)' }) });
  if (d.qc.some((q) => q.kind === 'dup')) smp.push({ sym: 'circle', color: DUP_COL, label: tr({ en: 'Duplicate', mn: 'Давхар' }) });
  if (smp.length) secs.push({ title: T.samples, items: smp });
  const cur = [];
  if (d.assays.some((a) => a.any)) {
    cur.push({ sym: 'line', color: 'var(--accent)', label: tr({ en: 'Assay (step)', mn: 'Шинжилгээ (шатлал)' }) });
    const thr = d.assays.filter((a) => a.any && isNum(a.thr)).map((a) => `${elementLabel(a.key).split(' ')[0]} ≥ ${L.fmtVal(a.thr)}`);
    if (thr.length) cur.push({ sym: 'bar', color: 'var(--brass)', label: thr.join(', ') });
  }
  if (d.pxrf.length) cur.push({ sym: 'line', color: 'var(--info)', label: `pXRF ${elementLabel(d.pxEl)}` });
  if (d.geo.length) {
    cur.push({ sym: 'line', color: 'var(--accent)', label: tr({ en: 'Recovery %', mn: 'Авралт %' }) });
    cur.push({ sym: 'area', color: 'var(--info)', label: 'RQD %' });
    cur.push({ sym: 'area', color: 'var(--err)', label: tr({ en: 'Core loss', mn: 'Кернийн алдагдал' }) });
  }
  if (d.lith.some((r) => r.veinPct > 0)) cur.push({ sym: 'area', color: 'var(--info)', label: tr({ en: 'Vein %', mn: 'Судал %' }) });
  if (cur.length) secs.push({ title: { en: 'Curves', mn: 'Муруй' }, items: cur });
  const st = [...new Set(d.struct.map((r) => r.type).filter(Boolean))].sort(natCmp);
  if (st.length) secs.push({ title: T.struct, items: st.map((c) => ({ sym: 'tadpole', color: strColor(c), code: c, label: meaning('STRTYPE', c) })) });
  return secs;
}

/** 16×10 legend symbol as SVG markup (shared by the page legend and the export). */
function symMarkup(sym, color) {
  color = safeColor(color, '#999');
  const fill = `fill:${color}`;
  switch (sym) {
    case 'hatch':
      return '<rect x="1" y="1" width="14" height="8" style="fill:var(--surface);stroke:var(--ink-2);stroke-width:0.6"/><path d="M2 9l6-8M7 9l6-8M12 9l3-4" style="stroke:var(--ink-2);stroke-width:1"/>';
    case 'diamond':
      return `<path d="M8 0.4L12.6 5L8 9.6L3.4 5Z" style="${fill}"/>`;
    case 'square':
      return `<rect x="4.4" y="1.4" width="7.2" height="7.2" style="${fill}"/>`;
    case 'circle':
      return `<circle cx="8" cy="5" r="3.7" style="${fill}"/>`;
    case 'line':
      return `<path d="M1 8V5H8V2H15" style="fill:none;stroke:${color};stroke-width:1.5"/>`;
    case 'bar':
      return `<rect x="1" y="2" width="10" height="6" style="${fill}"/><path d="M11 0V10" style="stroke:${color};stroke-dasharray:2 1.5"/>`;
    case 'area':
      return `<rect x="1" y="1" width="14" height="8" style="${fill};fill-opacity:0.3;stroke:${color};stroke-width:0.8"/>`;
    case 'box':
      return `<rect x="1.5" y="1.5" width="13" height="7" style="${fill};stroke:var(--muted);stroke-width:0.6"/>`;
    case 'tadpole':
      return `<path d="M10 3.5L4.5 8.5" style="stroke:${color};stroke-width:1.4;stroke-linecap:round"/><circle cx="10" cy="3.5" r="2.6" style="${fill}"/>`;
    default:
      return `<rect x="1" y="1" width="14" height="8" style="${fill};stroke:#000;stroke-opacity:0.25;stroke-width:0.6"/>`;
  }
}

function Legend({ d }) {
  const secs = useMemo(() => legendModel(d), [d]);
  if (!secs.length) return null;
  return html`<div class="slv-legend">
    ${secs.map(
      (s) => html`<section>
        <h4>${tr(s.title)}</h4>
        <ul>
          ${s.items.map(
            (i) => html`<li title=${i.label}>
              <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: symMarkup(i.sym, i.color) }}></svg>
              ${i.code ? html`<b class="mono">${i.code}</b>` : null}<span>${i.label}</span>
            </li>`,
          )}
        </ul>
      </section>`,
    )}
  </div>`;
}

// -------------------------------------------------------------- export

function legendSvg(d, W) {
  const secs = legendModel(d);
  if (!secs.length) return { svg: '', h: 0 };
  const colW = Math.max(150, Math.floor((W - 24) / Math.max(1, Math.floor((W - 24) / 190))));
  const perRow = Math.max(1, Math.floor((W - 24) / colW));
  const cols = Math.floor((colW - 26) / 5.4);
  let y = 18;
  let out = `<text x="12" y="${y}" style="fill:var(--ink);font-family:var(--font);font-size:11px;font-weight:700">${escapeHtml(tr({ en: 'Legend', mn: 'Тайлбар' }))}</text>`;
  y += 8;
  for (const s of secs) {
    y += 16;
    out += `<text x="12" y="${y}" style="fill:var(--muted);font-family:var(--font);font-size:9.5px;font-weight:600;letter-spacing:0.05em">${escapeHtml(tr(s.title).toUpperCase())}</text>`;
    y += 4;
    s.items.forEach((it, i) => {
      if (i % perRow === 0) y += 15;
      const x = 12 + (i % perRow) * colW;
      const text = it.code ? `${it.code}  ${it.label}` : it.label;
      out += `<g transform="translate(${x} ${y - 9})">${symMarkup(it.sym, it.color)}</g>`;
      out += `<text x="${x + 22}" y="${y}" style="fill:var(--ink-2);font-family:var(--font);font-size:9.5px">${escapeHtml(L.fitHead(text, cols))}</text>`;
    });
  }
  return { svg: `<path d="M0 0.5H${W}" style="stroke:var(--line-2)"/>${out}`, h: y + 16 };
}

function titleSvg(d, g, W, TITLE_H) {
  const h = d.h || {};
  const n = (v, dp = 1) => (isNum(v) ? fix(v, dp) : '—');
  const meta = [
    h.prospect,
    h.holeType,
    isNum(h.east) ? `E ${n(h.east)}  N ${n(h.north)}  RL ${n(h.rl)}` : null,
    isNum(h.azimuth) || isNum(h.dip) ? `Az ${n(h.azimuth)}°  Dip ${n(h.dip)}°` : null,
    isNum(d.eoh) ? `EOH ${fix(d.eoh, 2)} m` : null,
    h.geologist,
    h.startDate ? `${h.startDate}${h.endDate ? ' → ' + h.endDate : ''}` : null,
  ]
    .filter(Boolean)
    .join('   ·   ');
  const right = `ORD · ${todayISO()} · ${L.trimNum(g.ppm, 2)} px/m ≈ 1:${L.approxScale(g.ppm)}`;
  return (
    `<text x="12" y="25" style="fill:var(--ink);font-family:var(--display);font-size:17px;font-weight:600">${escapeHtml(d.holeId)}</text>` +
    `<text x="${W - 12}" y="25" text-anchor="end" style="fill:var(--muted);font-family:var(--mono);font-size:9.5px">${escapeHtml(right)}</text>` +
    `<text x="12" y="44" style="fill:var(--muted);font-family:var(--font);font-size:10.5px">${escapeHtml(L.fitHead(meta, Math.floor((W - 24) / 5.6)))}</text>` +
    `<path d="M0 ${TITLE_H - 0.5}H${W}" style="stroke:var(--line-2)"/>`
  );
}

/** Standalone SVG file: title block, header, log body, legend — tokens resolved to colours. */
function exportSvgString(d, g, headEl, bodyEl, rootEl) {
  const cs = getComputedStyle(rootEl);
  const look = (name) => cs.getPropertyValue(name);
  const ser = new XMLSerializer();
  const TITLE_H = 58;
  const W = Math.max(g.W, 560);
  const leg = legendSvg(d, W);
  const part = (el, y) => {
    const c = el.cloneNode(true);
    c.querySelectorAll('[data-overlay]').forEach((n) => n.remove());
    for (const a of ['class', 'style', 'role', 'aria-hidden', 'aria-label']) c.removeAttribute(a);
    c.setAttribute('x', '0');
    c.setAttribute('y', String(y));
    return ser.serializeToString(c);
  };
  const total = Math.ceil(TITLE_H + HEAD_H + g.H + leg.h);
  let s =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${total}" viewBox="0 0 ${W} ${total}" style="font-family:var(--font)">` +
    `<title>${escapeHtml(`${d.holeId} strip log`)}</title>` +
    `<rect width="${W}" height="${total}" style="fill:var(--surface)"/>` +
    titleSvg(d, g, W, TITLE_H) +
    part(headEl, TITLE_H) +
    part(bodyEl, TITLE_H + HEAD_H) +
    `<g transform="translate(0 ${TITLE_H + HEAD_H + g.H})">${leg.svg}</g></svg>`;
  s = L.resolveCssVars(s, look).replace(/url\((['"]?)[^#)'"]*#([^)'"]+)\1\)/g, 'url(#$2)');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${s}\n`;
}

// ---------------------------------------------------------------- CSS

function ensureCSS() {
  injectCSS(
    'striplog',
    `
.slg { container-type: inline-size; position: relative; display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; height: 100%; background: var(--surface); color: var(--ink); }
.slg-bar { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid var(--line); flex-wrap: wrap; background: var(--surface); position: relative; z-index: 4; }
.slg-title { font-family: var(--mono); font-weight: 600; font-size: 13px; padding: 0 4px 0 2px; white-space: nowrap; }
.slg-zoom { display: inline-flex; align-items: stretch; border: 1px solid var(--line-2); border-radius: 8px; overflow: hidden; height: 28px; }
.slg-zoom button { border: 0; background: var(--surface); color: var(--ink-2); width: 28px; display: grid; place-items: center; cursor: pointer; padding: 0; }
.slg-zoom button:hover { background: var(--surface-2); color: var(--ink); }
.slg-zoom output { font: 11.5px/26px var(--mono); color: var(--ink-2); min-width: 62px; text-align: center; border-inline: 1px solid var(--line-2); padding: 0 6px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.slg-bar .btn.sm { height: 28px; }
.slg-bar .btn.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-2); }
.slg-bar .seg { height: 28px; }
.slg-bar .seg button { padding: 0 9px; font-size: 12.5px; }
.slg-px { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
.slg-px .inp { padding: 2px 22px 2px 7px; font-size: 12.5px; height: 28px; max-width: 120px; }
.slg-menu { position: relative; }
.slg-pop { position: absolute; top: calc(100% + 6px); right: 0; z-index: 20; background: var(--surface); border: 1px solid var(--line-2); border-radius: 10px; box-shadow: var(--shadow); padding: 6px; width: 240px; max-height: min(60vh, 440px); overflow: auto; }
.slg-pop h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); padding: 4px 8px 6px; font-weight: 600; }
.slg-chk { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.slg-chk:hover { background: var(--surface-2); }
.slg-chk.off { color: var(--muted); cursor: default; }
.slg-chk.off:hover { background: none; }
.slg-chk small { margin-left: auto; font-size: 11px; color: var(--muted); }
.slg-chk input { accent-color: var(--accent); margin: 0; }
.slg-pop .btn { margin: 4px 4px 2px; }
.slg-wrap { position: relative; flex: 1; min-height: 200px; }
@container (max-width: 640px) {
  .slg-bar .slg-lbl, .slg-bar .slg-px > span, .slg-bar .slg-menu .btn > span, .slg-bar > .btn > span { display: none; }
  .slg-bar { gap: 4px; }
  .slg-bar .btn.sm { padding-inline: 7px; }
  .slg-zoom output { min-width: 38px; padding: 0 3px; }
  .slg-bar .seg button { padding: 0 7px; }
  .slg-px .inp { max-width: 84px; }
}
.slg-scroll { position: absolute; inset: 0; overflow: auto; overscroll-behavior: contain; background: var(--surface); }
.slg-headbar { position: sticky; top: 0; z-index: 2; line-height: 0; width: max-content; min-width: 100%; background: var(--surface-2); }
.slg svg { display: block; }
.slg-scroll svg text { user-select: none; -webkit-user-select: none; pointer-events: none; }
.slg-body { cursor: crosshair; }
.slg-body.hit { cursor: pointer; }
.slg-center { position: absolute; inset: 0; display: grid; place-items: center; overflow: auto; }
.slg-tip { position: absolute; z-index: 6; pointer-events: none; background: var(--surface); color: var(--ink); border: 1px solid var(--line-2); border-radius: 8px; box-shadow: var(--shadow); padding: 8px 10px; font-size: 12px; line-height: 1.45; width: max-content; max-width: min(290px, calc(100% - 16px)); }
.slg-tip-h { display: flex; justify-content: space-between; gap: 14px; font-size: 11px; color: var(--muted); margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.04em; }
.slg-tip-h .mono { color: var(--ink-2); text-transform: none; letter-spacing: 0; }
.slg-tip-t { display: flex; align-items: center; gap: 6px; font-weight: 600; margin-bottom: 3px; }
.slg-tip-t span + span { font-weight: 500; color: var(--ink-2); }
.slg-kv { display: flex; gap: 10px; justify-content: space-between; align-items: baseline; }
.slg-kv span { color: var(--muted); white-space: nowrap; }
.slg-kv b { font-weight: 500; text-align: right; }
.slg-kv.on b { font-weight: 700; color: var(--ink); }
.slg-chip { display: inline-block; width: 10px; height: 10px; border-radius: 2px; border: 1px solid rgb(0 0 0 / 22%); margin-right: 4px; vertical-align: -1px; flex: none; }
.slg-tip-note { margin-top: 5px; color: var(--ink-2); font-size: 11.5px; border-top: 1px solid var(--line); padding-top: 4px; }
.slg-tip-note.on { color: var(--ink); }
.slg-tip-foot { margin-top: 5px; font-size: 10.5px; color: var(--muted); }
`,
  );
}

function ensurePageCSS() {
  injectCSS(
    'striplog-page',
    `
.slv { display: flex; flex-direction: column; gap: 12px; height: 100%; min-height: 0; padding: 14px 18px 16px; overflow: auto; }
.slv-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px 20px; flex-wrap: wrap; }
.slv-head h1 { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.slv-head h1 .mono { font-size: 0.9em; color: var(--accent-2); }
.slv-head p { margin-top: 4px; font-size: 13px; }
.slv-pick { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.slv-pick .fld { min-width: 150px; }
.slv-pick .check { font-size: 13px; padding-bottom: 7px; }
.slv-body { flex: 1; min-height: 480px; display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 12px; }
.slv-body.cmp { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 260px; }
.slv-log { min-height: 0; min-width: 0; display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; background: var(--surface); }
.slv-side { min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
.slv-side .card > .body { padding: 12px 14px; }
.slv-side .card > header { padding: 8px 8px 8px 14px; flex-wrap: nowrap; }
.slv-open { margin-top: 12px; }
.slv-dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; font-size: 12.5px; }
.slv-dl dt { color: var(--muted); }
.slv-dl dd { margin: 0; overflow-wrap: anywhere; }
.slv-legend { display: flex; flex-direction: column; gap: 12px; }
.slv-legend h4 { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--muted); margin-bottom: 5px; font-weight: 600; }
.slv-legend ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.slv-legend li { display: flex; align-items: center; gap: 7px; font-size: 12px; min-width: 0; }
.slv-legend li svg { flex: none; }
.slv-legend li b { font-weight: 600; font-size: 11.5px; }
.slv-legend li span { color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 1100px) {
  .slv-body, .slv-body.cmp { grid-template-columns: minmax(0, 1fr); grid-auto-rows: auto; flex: none; }
  .slv-log { height: 78vh; min-height: 440px; }
}
@media (max-width: 820px) { .slv { padding: 12px 16px; } }
`,
  );
}

// ----------------------------------------------------------- component

/**
 * Graphic log of one hole.
 * Props: holeId, onSelect({table, id}), selectedId, height (px; default fills the parent).
 * Optional (comparison): title, zoom ('fit' | px per metre) + onZoom, fitDepth (m),
 * scrollDepth (m) + onScrollDepth — controlled zoom / linked scrolling.
 */
export function StripLog({ holeId, onSelect, selectedId, height, title, zoom: zoomProp, onZoom, fitDepth, scrollDepth, onScrollDepth }) {
  ensureCSS();
  const rev = useStore();
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const bodyRef = useRef(null);
  const headRef = useRef(null);
  const menuRef = useRef(null);
  const size = useSize(scrollRef);
  const uid = useMemo(() => 'slg' + Math.random().toString(36).slice(2, 8), []);
  const [zoomPref, setZoomPref] = usePref('striplog.zoom', 'fit');
  const zoom = zoomProp !== undefined ? zoomProp : zoomPref;
  const setZoom = onZoom || setZoomPref;
  const [log, setLog] = usePref('striplog.log', false);
  const [hiddenPref, setHidden] = usePref('striplog.hidden', []);
  const hidden = Array.isArray(hiddenPref) ? hiddenPref : [];
  const [pxPick, setPxPick] = usePref('striplog.pxrf', '');
  const [hover, setHover] = useState(null);
  const [menu, setMenu] = useState(false);

  const data = useMemo(() => (holeId ? collect(holeId, pxPick) : null), [rev, holeId, pxPick]);
  const tracks = useMemo(() => (data ? trackList(data) : []), [data]);
  const viewPx = size.h - HEAD_H - TOP - BOT - 2;
  const ppm = zoom === 'fit' ? L.fitPpm(fitDepth || data?.depth || 100, viewPx) : L.clampPpm(Number(zoom));
  const hiddenKey = hidden.join('|');
  const geom = useMemo(
    () => (data && size.w > 0 && size.h > 0 ? buildLog(data, tracks, { ppm, width: size.w, log: !!log, hidden, uid }) : null),
    [data, tracks, ppm, size.w, size.h > 0, log, hiddenKey, uid],
  );
  const geomRef = useRef(null);
  geomRef.current = geom;
  const hasData = tracks.some((t) => t.has && t.key !== 'depth');

  // ---- zoom, keeping the depth under the focus point in place
  const anchor = useRef(null);
  const zoomTo = (next, focusY) => {
    const sc = scrollRef.current;
    if (sc && geom) {
      const fy = focusY ?? (HEAD_H + sc.clientHeight) / 2;
      anchor.current = { depth: (sc.scrollTop + fy - HEAD_H - TOP) / geom.ppm, fy };
    }
    setZoom(next);
  };
  useLayoutEffect(() => {
    const a = anchor.current;
    const sc = scrollRef.current;
    if (!a || !sc || !geom) return;
    anchor.current = null;
    sc.scrollTop = Math.max(0, HEAD_H + TOP + a.depth * geom.ppm - a.fy);
  }, [geom?.ppm]);

  // ---- linked scrolling (comparison view)
  // A position we set ourselves is not echoed back (a shorter log clamps, and
  // the echo would drag the other log up); anything else is the user scrolling.
  const echo = useRef(null);
  const onScroll = () => {
    const g = geomRef.current;
    const sc = scrollRef.current;
    if (!onScrollDepth || !g || !sc) return;
    const mine = echo.current !== null && Math.abs(sc.scrollTop - echo.current) < 1;
    echo.current = null;
    if (!mine) onScrollDepth(Math.round((sc.scrollTop / g.ppm) * 100) / 100);
  };
  useEffect(() => {
    const sc = scrollRef.current;
    const g = geomRef.current;
    if (scrollDepth === undefined || scrollDepth === null || !sc || !g) return;
    const target = scrollDepth * g.ppm;
    if (Math.abs(sc.scrollTop - target) > 1.5) {
      sc.scrollTop = target;
      echo.current = sc.scrollTop;
    }
  }, [scrollDepth, !!geom]);

  // ---- bring the selected row into view
  useEffect(() => {
    const sc = scrollRef.current;
    const e = selectedId && geomRef.current?.index.get(selectedId);
    if (!sc || !e) return;
    const top = HEAD_H + e.y0;
    const bot = HEAD_H + e.y1;
    if (top < sc.scrollTop + HEAD_H + 4 || bot > sc.scrollTop + sc.clientHeight - 4) sc.scrollTop = Math.max(0, (top + bot) / 2 - (HEAD_H + sc.clientHeight) / 2);
  }, [selectedId, !!geom]);

  const firstHole = useRef(holeId);
  useEffect(() => {
    if (firstHole.current === holeId) return;
    firstHole.current = holeId;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setHover(null);
  }, [holeId]);

  // ---- track menu closes on outside click / Escape
  useEffect(() => {
    if (!menu) return;
    const down = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenu(false);
    };
    const key = (e) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [menu]);

  // ---- hover (one state update per animation frame) and click
  const raf = useRef(0);
  const last = useRef(null);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const locate = (cx, cy) => {
    const g = geomRef.current;
    const b = bodyRef.current;
    if (!g || !b) return null;
    const r = b.getBoundingClientRect();
    const x = cx - r.left;
    const y = cy - r.top;
    return { x, y, g, ...(hitTest(g, x, y) || {}) };
  };
  const onMove = (e) => {
    last.current = { cx: e.clientX, cy: e.clientY };
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const ev = last.current;
      const loc = ev && locate(ev.cx, ev.cy);
      const wr = rootRef.current?.querySelector('.slg-wrap')?.getBoundingClientRect();
      if (!loc || !wr) return setHover(null);
      setHover({ x: loc.x, y: loc.y, track: loc.track, item: loc.item, px: ev.cx - wr.left, py: ev.cy - wr.top, ww: wr.width, wh: wr.height });
    });
  };
  const onLeave = () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    setHover(null);
  };
  const onClick = (e) => {
    const loc = locate(e.clientX, e.clientY);
    if (loc?.item && onSelect) onSelect({ table: loc.item.table, id: loc.item.row.id });
  };
  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey) || !geom) return;
    e.preventDefault();
    const sc = scrollRef.current;
    const fy = e.clientY - sc.getBoundingClientRect().top;
    zoomTo(L.stepZoom(geom.ppm, e.deltaY < 0 ? 1 : -1), fy);
  };

  const exportSvg = async () => {
    const g = geomRef.current;
    if (!g || !data || !bodyRef.current || !headRef.current) return;
    try {
      const svg = exportSvgString(data, g, headRef.current.firstElementChild, bodyRef.current, rootRef.current);
      await saveFile(`${holeId}_striplog.svg`, svg, 'image/svg+xml');
    } catch (err) {
      console.error(err);
      toast(tr({ en: 'SVG export failed', mn: 'SVG экспорт амжилтгүй боллоо' }), { kind: 'err' });
    }
  };

  // ---- overlay: selection, hovered item, depth cross-hair (never exported)
  const overlay = [];
  if (geom) {
    const sel = selectedId ? geom.index.get(selectedId) : null;
    if (sel) {
      if (sel.y1 > sel.y0) overlay.push(html`<rect x="0" y=${r1(sel.y0)} width=${geom.W} height=${r1(sel.y1 - sel.y0)} style="fill:var(--accent);fill-opacity:0.08" />`);
      for (const cl of sel.cells) {
        overlay.push(
          cl.pt
            ? html`<circle cx=${r1(cl.x)} cy=${r1(cl.y)} r="6.5" style="fill:none;stroke:var(--accent);stroke-width:2" />`
            : html`<rect x=${cl.x + 1} y=${r1(cl.y0 - 1)} width=${Math.max(2, cl.w - 2)} height=${r1(Math.max(2, cl.y1 - cl.y0 + 2))} rx="2" style="fill:none;stroke:var(--accent);stroke-width:2" />`,
        );
      }
    }
    if (hover) {
      const it = hover.item;
      if (it && hover.track) {
        overlay.push(
          it.y0 === undefined
            ? html`<circle cx=${r1(it.x)} cy=${r1(it.y)} r="5.5" style="fill:none;stroke:var(--accent);stroke-width:1.2" />`
            : html`<rect x=${hover.track.x + 0.5} y=${r1(it.y0)} width=${hover.track.w - 1} height=${r1(Math.max(1, it.y1 - it.y0))} style="fill:var(--accent);fill-opacity:0.06;stroke:var(--accent);stroke-width:1" />`,
        );
      }
      const dt = geom.tracks[0];
      const depth = Math.max(0, (hover.y - TOP) / geom.ppm);
      const yy = r1(hover.y);
      overlay.push(html`<path d=${`M${dt.x + dt.w} ${yy}H${geom.W}`} style="stroke:var(--accent);stroke-width:0.8;stroke-dasharray:3 3;opacity:0.75" />`);
      overlay.push(html`<g>
        <rect x=${dt.x + 1} y=${yy - 7.5} width=${dt.w - 2} height="15" rx="3" style="fill:var(--accent)" />
        <text x=${r1(dt.x + dt.w / 2)} y=${yy} dy="0.34em" text-anchor="middle" style=${`fill:var(--accent-ink);${MONO};font-size:9.5px;font-weight:600`}>${depth < 100 ? depth.toFixed(2) : depth.toFixed(1)}</text>
      </g>`);
    }
  }

  const pxOptions = data?.pxKeys.length ? elementKeys('pxrf').map((k) => ({ value: k, label: elementLabel(k) })) : [];
  const ppmText = ppm >= 10 ? L.trimNum(ppm, 0) : L.trimNum(ppm, ppm >= 1 ? 1 : 2);
  const toggle = (key, on) => setHidden((cur) => {
    const list = Array.isArray(cur) ? cur.filter((k) => k !== key) : [];
    return on ? list : [...list, key];
  });

  const bar = html`<div class="slg-bar">
    ${title ? html`<span class="slg-title">${title}</span>` : null}
    <div class="slg-zoom" role="group" aria-label=${tr({ en: 'Vertical scale', mn: 'Босоо масштаб' })}>
      <button type="button" onClick=${() => zoomTo(L.stepZoom(ppm, -1))} title=${tr({ en: 'Zoom out (Ctrl + wheel)', mn: 'Жижигрүүлэх (Ctrl + дугуй)' })} aria-label=${tr({ en: 'Zoom out', mn: 'Жижигрүүлэх' })}><${Glyph} d=${G_MINUS} /></button>
      <output title=${`${ppmText} ${tr({ en: 'px/m', mn: 'px/м' })} ≈ 1:${L.approxScale(ppm)}`}>${ppmText}<span class="slg-lbl"> ${tr({ en: 'px/m', mn: 'px/м' })}</span></output>
      <button type="button" onClick=${() => zoomTo(L.stepZoom(ppm, 1))} title=${tr({ en: 'Zoom in (Ctrl + wheel)', mn: 'Томруулах (Ctrl + дугуй)' })} aria-label=${tr({ en: 'Zoom in', mn: 'Томруулах' })}><${Glyph} d=${G_PLUS} /></button>
    </div>
    <button type="button" class=${'btn sm' + (zoom === 'fit' ? ' on' : '')} onClick=${() => setZoom('fit')} title=${tr({ en: 'Fit the whole hole to the height', mn: 'Цооногийг бүтнээр нь өндөрт багтаах' })} aria-pressed=${zoom === 'fit'}>
      <${Glyph} d=${G_FIT} /><span class="slg-lbl">${tr({ en: 'Fit', mn: 'Багтаах' })}</span>
    </button>
    <div class="seg" role="group" aria-label=${tr({ en: 'Curve scale', mn: 'Муруйн масштаб' })}>
      <button type="button" class=${log ? '' : 'on'} aria-pressed=${!log} onClick=${() => setLog(false)} title=${tr({ en: 'Linear scale', mn: 'Шугаман масштаб' })}>${tr({ en: 'Lin', mn: 'Шугам' })}</button>
      <button type="button" class=${log ? 'on' : ''} aria-pressed=${!!log} onClick=${() => setLog(true)} title=${tr({ en: 'Logarithmic scale', mn: 'Логарифм масштаб' })}>${tr({ en: 'Log', mn: 'Лог' })}</button>
    </div>
    ${pxOptions.length
      ? html`<label class="slg-px" title=${tr({ en: 'pXRF element shown', mn: 'Харуулах pXRF элемент' })}><span>pXRF</span><${Select} value=${data.pxEl} options=${pxOptions} onChange=${setPxPick} /></label>`
      : null}
    <span class="spacer"></span>
    <div class="slg-menu" ref=${menuRef}>
      <${Button} size="sm" icon="columns" onClick=${() => setMenu(!menu)} aria-expanded=${menu} aria-haspopup="true" title=${tr({ en: 'Choose tracks', mn: 'Багана сонгох' })}>${tr({ en: 'Tracks', mn: 'Баганууд' })}<//>
      ${menu
        ? html`<div class="slg-pop" role="menu">
            <h4>${tr({ en: 'Show tracks', mn: 'Харуулах баганууд' })}</h4>
            ${tracks
              .filter((tt) => tt.key !== 'depth')
              .map(
                (tt) => html`<label class=${'slg-chk' + (tt.has ? '' : ' off')} key=${tt.key}>
                  <input type="checkbox" checked=${tt.has && !hidden.includes(tt.key)} disabled=${!tt.has} onChange=${(e) => toggle(tt.key, e.target.checked)} />
                  <span>${tr(tt.label)}</span>
                  ${!tt.has
                    ? html`<small>${tr({ en: 'no data', mn: 'өгөгдөлгүй' })}</small>`
                    : geom?.dropped.includes(tt.key)
                      ? html`<small title=${tr({ en: 'Hidden because the panel is narrow — hide another track or widen the panel', mn: 'Цонх нарийн тул нуусан — өөр багана нуух эсвэл цонхыг өргөсгөнө үү' })}>${tr({ en: 'no room', mn: 'зай багатай' })}</small>`
                      : null}
                </label>`,
              )}
            ${hidden.length ? html`<${Button} size="sm" kind="ghost" onClick=${() => setHidden([])}>${tr({ en: 'Show all', mn: 'Бүгдийг харуулах' })}<//>` : null}
          </div>`
        : null}
    </div>
    <${Button} size="sm" icon="download" onClick=${exportSvg} disabled=${!geom || !hasData} title=${tr({ en: 'Download the log as an SVG drawing', mn: 'Логийг SVG зураг болгон татах' })}>SVG<//>
  </div>`;

  let content = null;
  if (!holeId) content = html`<div class="slg-center"><${Empty} icon="log" title=${tr({ en: 'No hole selected', mn: 'Цооног сонгоогүй байна' })} /></div>`;
  else if (data && !hasData)
    content = html`<div class="slg-center"><${Empty} icon="log" title=${tr({ en: 'Nothing logged yet', mn: 'Одоогоор логдоогүй байна' })}>${tr({ en: 'Lithology, recovery, samples or structures for {h} will draw here.', mn: '{h} цооногийн литологи, авралт, дээж, бүтцийн хэмжилт энд зурагдана.' }, { h: holeId })}<//></div>`;

  return html`<div class="slg" ref=${rootRef} style=${height ? `height:${height}px;flex:none` : undefined}>
    ${bar}
    <div class="slg-wrap">
      <div class="slg-scroll" ref=${scrollRef} onScroll=${onScroll} onWheel=${onWheel}>
        ${!content && geom
          ? html`<div class="slg-headbar" ref=${headRef}>${geom.head}</div>
              <svg
                ref=${bodyRef}
                class=${'slg-body' + (hover?.item && onSelect ? ' hit' : '')}
                width=${geom.W}
                height=${geom.H}
                viewBox=${`0 0 ${geom.W} ${geom.H}`}
                role="img"
                aria-label=${tr({ en: 'Strip log of {h}', mn: '{h} цооногийн баганан лог' }, { h: holeId })}
                onMouseMove=${onMove}
                onMouseLeave=${onLeave}
                onClick=${onClick}
              >
                ${geom.body}
                <g data-overlay="1">${overlay}</g>
              </svg>`
          : null}
      </div>
      ${content}
      ${hover?.item && geom && !content ? html`<${Tip} hover=${hover} clickable=${!!onSelect} />` : null}
    </div>
  </div>`;
}

// ------------------------------------------------------------ page view

function RowDetails({ sel }) {
  const r = rows(sel.table, sel.holeId).find((x) => x.id === sel.id);
  const def = TABLES[sel.table];
  if (!r || !def) return html`<p class="muted">${tr({ en: 'The selected row no longer exists.', mn: 'Сонгосон мөр устсан байна.' })}</p>`;
  const items = [];
  for (const f of def.fields) {
    let v = f.type === 'calc' ? f.calc?.(r, S.ctx) : r[f.key];
    if (v === null || v === undefined || v === '') continue;
    if (f.type === 'code') {
      const m = meaning(f.list, v);
      v = m ? `${v} — ${m}` : v;
    } else if (typeof v === 'boolean') v = v ? tk('yes') : tk('no');
    else if (isNum(v)) v = isNum(f.dp) ? fix(v, f.dp) : f.key === 'from' || f.key === 'to' || f.key === 'depth' ? fix(v, 2) : L.fmtVal(v);
    items.push([fieldLabel(f), String(v)]);
  }
  const vals = sel.table === 'samples' ? assayValues(r.sampleId) : sel.table === 'pxrf' ? { values: r.values || {}, flags: {} } : null;
  if (vals) for (const k of Object.keys(vals.values || {}).sort(natCmp)) items.push([elementLabel(k), valueText(vals, k)]);
  return html`<dl class="slv-dl">${items.map(([k, v]) => html`<dt>${k}</dt><dd class=${/^[\d.–<-]/.test(v) ? 'mono' : ''}>${v}</dd>`)}</dl>`;
}

function holeMeta(h) {
  if (!h) return '';
  return [
    h.prospect,
    h.holeType,
    h.status ? meaning('HOLESTATUS', h.status) || h.status : null,
    isNum(h.azimuth) || isNum(h.dip) ? `Az ${isNum(h.azimuth) ? L.trimNum(h.azimuth, 1) : '—'}° / ${isNum(h.dip) ? L.trimNum(h.dip, 1) : '—'}°` : null,
    isNum(h.eoh) ? `EOH ${fix(h.eoh, 2)} m` : isNum(h.plannedDepth) ? `${tr({ en: 'planned', mn: 'төлөвлөсөн' })} ${fix(h.plannedDepth, 1)} m` : null,
    h.geologist,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Full-page strip log with a hole picker and an optional second hole for comparison. */
export function StripLogView({ params = {} }) {
  ensureCSS();
  ensurePageCSS();
  const rev = useStore();
  const ids = holes().map((h) => h.holeId);
  const [a, setA] = useState(params.holeId || '');
  const [b, setB] = useState(params.compare || '');
  const [zoom, setZoom] = usePref('striplog.page.zoom', 'fit');
  const [linked, setLinked] = usePref('striplog.link', true);
  const [sy, setSy] = useState(0);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    if (params.holeId && params.holeId !== a) setA(params.holeId);
  }, [params.holeId]);

  const pickA = (id) => {
    setA(id);
    setSel(null);
    if (id === b) setB('');
    try {
      history.replaceState(null, '', id ? `#/striplog/${encodeURIComponent(id)}` : '#/striplog');
    } catch {}
  };
  const cmp = !!(a && b && a !== b && ids.includes(b));
  const fitDepth = useMemo(() => (cmp ? Math.max(stripLogDepth(a), stripLogDepth(b)) : undefined), [rev, a, b, cmp]);
  const legendData = useMemo(() => {
    const list = [a, cmp ? b : null].filter((id) => id && ids.includes(id)).map((id) => collect(id, ''));
    return list.length ? mergeData(list) : null;
  }, [rev, a, b, cmp]);
  const hA = a ? hole(a) : null;

  const logFor = (id, withTitle) => html`<div class="slv-log">
    <${StripLog}
      holeId=${id}
      title=${withTitle ? id : undefined}
      selectedId=${sel?.holeId === id ? sel.id : undefined}
      onSelect=${(s) => setSel({ ...s, holeId: id })}
      zoom=${zoom}
      onZoom=${setZoom}
      fitDepth=${fitDepth}
      scrollDepth=${cmp && linked ? sy : undefined}
      onScrollDepth=${cmp && linked ? setSy : undefined}
    />
  </div>`;

  let body;
  if (!ids.length) body = html`<div class="slv-log"><${Empty} icon="holes" title=${tr({ en: 'No drill holes yet', mn: 'Цооног алга байна' })}>${tr({ en: 'Add or import collars first.', mn: 'Эхлээд цооногийн амыг нэмэх эсвэл импортлоно уу.' })}<//></div>`;
  else if (!a) body = html`<div class="slv-log"><${Empty} icon="log" title=${tr({ en: 'Choose a hole', mn: 'Цооног сонгоно уу' })}>${tr({ en: 'Pick a hole above to draw its strip log. Add a second hole to compare them side by side.', mn: 'Дээрээс цооног сонгоход баганан лог зурагдана. Хоёр дахь цооног сонгож зэрэгцүүлэн харьцуулж болно.' })}<//></div>`;
  else if (!hA) body = html`<div class="slv-log"><${Empty} icon="alert" title=${tr({ en: 'Hole {h} not found', mn: '{h} цооног олдсонгүй' }, { h: a })} /></div>`;
  else body = html`${logFor(a, cmp)}${cmp ? logFor(b, true) : null}`;

  const selLabel = sel ? tr(TABLES[sel.table]?.short || TABLES[sel.table]?.label) : '';
  return html`<div class="slv">
    <header class="slv-head">
      <div>
        <h1>${tr({ en: 'Strip log', mn: 'Баганан лог' })}${a && hA ? html`<span class="mono">${a}${cmp ? html` <span class="muted">vs</span> ${b}` : null}</span>` : null}</h1>
        <p class="muted">${hA ? holeMeta(hA) : tr({ en: 'Graphic log of lithology, alteration, mineralisation, recovery, samples, assays and structures.', mn: 'Литологи, хувирал, эрдэсжилт, авралт, дээж, шинжилгээ, бүтцийн графикийн лог.' })}</p>
      </div>
      <div class="slv-pick">
        <label class="fld"><span>${tr({ en: 'Hole', mn: 'Цооног' })}</span><${Select} value=${a} options=${ids} placeholder=${tr({ en: 'Select a hole…', mn: 'Цооног сонгох…' })} onChange=${pickA} /></label>
        <label class="fld"><span>${tr({ en: 'Compare with', mn: 'Харьцуулах' })}</span><${Select} value=${cmp ? b : ''} options=${ids.filter((x) => x !== a)} placeholder=${tr({ en: '— none —', mn: '— байхгүй —' })} onChange=${(v) => { setB(v); setSy(0); }} /></label>
        ${cmp
          ? html`<label class="check" title=${tr({ en: 'Scroll both logs together, depth for depth', mn: 'Хоёр логийг гүнээр нь хамт гүйлгэх' })}><input type="checkbox" checked=${!!linked} onChange=${(e) => setLinked(e.target.checked)} /> ${tr({ en: 'Link depth', mn: 'Гүнийг холбох' })}</label>`
          : null}
      </div>
    </header>
    <div class=${'slv-body' + (cmp ? ' cmp' : '')}>
      ${body}
      <aside class="slv-side">
        ${sel
          ? html`<section class="card">
              <header>
                <h3>${selLabel} <span class="mono muted">${sel.holeId}</span></h3>
                <button class="icon-btn" type="button" onClick=${() => setSel(null)} aria-label=${tk('close')} title=${tk('close')}><${Icon} name="x" size=${16} /></button>
              </header>
              <div class="body">
                <${RowDetails} sel=${sel} />
                <div class="slv-open">
                  <${Button} size="sm" icon="link" onClick=${() => { S.nav = { rowId: sel.id }; navigate(`#/hole/${encodeURIComponent(sel.holeId)}/${sel.table}`); }}>${tr({ en: 'Open in hole workspace', mn: 'Цооногийн ажлын талбарт нээх' })}<//>
                </div>
              </div>
            </section>`
          : a && hA
            ? html`<p class="muted" style="font-size:12.5px">${tr({ en: 'Hover the log for details; click an interval to see the full record.', mn: 'Лог дээр хулганаа аваачихад дэлгэрэнгүй гарна; интервал дээр дарж бүрэн бичлэгийг харна.' })}</p>`
            : null}
        ${legendData ? html`<section class="card"><header><h3>${tr({ en: 'Legend', mn: 'Тайлбар' })}</h3></header><div class="body"><${Legend} d=${legendData} /></div></section>` : null}
      </aside>
    </div>
  </div>`;
}

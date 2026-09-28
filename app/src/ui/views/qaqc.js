// QA/QC page: lab-batch acceptance, CRM control charts, blanks, duplicates,
// insertion rates and the standards (CRM) library. Logic lives in core/qaqc.js;
// this file only lays it out and draws the charts (inline SVG, design tokens).

import { html, useState, useMemo, useRef, useEffect } from '../../lib.js';
import { rows, settings, elementKeys, mutate, undoBatch } from '../../core/store.js';
import { elementLabel, splitElementKey, unitLabel } from '../../core/schema.js';
import { isNum, natCmp, toNum, fmt, todayISO } from '../../core/util.js';
import { toCSV, parseCSV } from '../../core/csv.js';
import * as QC from '../../core/qaqc.js';
import { tr } from '../../i18n.js';
import { Icon } from '../icons.js';
import { useStore, Button, IconButton, Select, Tabs, Pill, Empty, Stat, PageHead, injectCSS, usePref, useSize, navigate, saveFile, toast, confirmDialog } from '../kit.js';

// ------------------------------------------------------------------ strings

const L = {
  title: { en: 'QA/QC', mn: 'QA/QC' },
  sub: {
    en: 'Check certified standards, blanks and duplicates for every lab batch before the assays are accepted into the database.',
    mn: 'Лабын багц бүрийн стандарт (CRM), blank, давхар дээжийг шалгаж, шинжилгээг мэдээллийн санд хүлээн авахаас өмнө баталгаажуулна.',
  },
  element: { en: 'Element', mn: 'Элемент' },
  exportCsv: { en: 'Export CSV', mn: 'CSV татах' },
  batch: { en: 'Batch', mn: 'Багц' },
  clearBatch: { en: 'Show all batches', mn: 'Бүх багцыг харуулах' },
  tabs: {
    overview: { en: 'Overview', mn: 'Тойм' },
    crm: { en: 'Standards (CRM)', mn: 'Стандарт (CRM)' },
    blanks: { en: 'Blanks', mn: 'Blank' },
    dups: { en: 'Duplicates', mn: 'Давхар дээж' },
    insertion: { en: 'Insertion rates', mn: 'Оруулалтын давтамж' },
    library: { en: 'Standards library', mn: 'Стандартын сан' },
  },
  status: {
    pass: { en: 'Pass', mn: 'Тэнцсэн' },
    warn: { en: 'Warning', mn: 'Анхааруулга' },
    fail: { en: 'Fail', mn: 'Тэнцээгүй' },
    low: { en: 'Near LOR', mn: 'LOR-т ойр' },
    ok: { en: 'On target', mn: 'Хэвийн' },
    na: { en: '—', mn: '—' },
    accept: { en: 'Accept', mn: 'Хүлээн авах' },
    review: { en: 'Review', mn: 'Хянах' },
    reject: { en: 'Reject', mn: 'Буцаах' },
  },
  sample: { en: 'Sample', mn: 'Дээж' },
  hole: { en: 'Hole', mn: 'Цооног' },
  labJob: { en: 'Lab job', mn: 'Лаб. ажил' },
  reported: { en: 'Reported', mn: 'Ирсэн' },
  seq: { en: 'Sequence', mn: 'Дараалал' },
  seqAxis: { en: 'Sequence in lab reports', mn: 'Лабын тайлан дахь дараалал' },
  importLab: { en: 'Import lab results', mn: 'Лабын үр дүн импортлох' },
  defineStd: { en: 'Define standards', mn: 'Стандарт тодорхойлох' },
  showAll: { en: 'Show all', mn: 'Бүгдийг харуулах' },
  showIssues: { en: 'Only issues', mn: 'Зөвхөн асуудалтай' },
  resultsTable: { en: 'Results table', mn: 'Үр дүнгийн хүснэгт' },
  settingsLink: { en: 'Change limits in Settings', mn: 'Хязгаарыг «Тохиргоо»-оос өөрчилнө' },
  keys: { en: 'Arrow keys step through the points.', mn: 'Сумтай товчоор цэгүүдийг гүйлгэнэ.' },
};

const STATUS_PILL = { pass: 'ok', ok: 'ok', accept: 'ok', warn: 'warn', review: 'warn', fail: 'err', reject: 'err', low: '', na: '' };
const statusText = (s) => tr(L.status[s] || { en: s, mn: s });
const StatusPill = ({ s, children }) => html`<${Pill} kind=${STATUS_PILL[s] ?? ''}>${children ?? statusText(s)}<//>`;

// ------------------------------------------------------------------ numbers

function num(v, d) {
  if (!isNum(v)) return '—';
  if (d !== undefined) return v.toFixed(d);
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1000) return Math.round(v).toLocaleString('en-US');
  if (a >= 100) return v.toFixed(1);
  if (a >= 10) return v.toFixed(2);
  if (a >= 1) return v.toFixed(3);
  return String(Number(v.toPrecision(3)));
}
const pctTxt = (v) => (isNum(v) ? `${fmt(v, 1)}%` : '—');
const signed = (v, d = 2) => (isNum(v) ? (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(d) : '—');
const oneIn = (v) => (isNum(v) ? `1:${v >= 10 ? Math.round(v) : fmt(v, 1)}` : '—');
const unitOf = (el) => unitLabel(splitElementKey(el).unit);

// --------------------------------------------------------------- chart core

const textW = (s) => String(s).length * 6.3 + 2;
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

function niceStep(span, count) {
  const raw = span / Math.max(1, count);
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
}

function linTicks(min, max, count, integer) {
  let step = niceStep(max - min, count);
  if (integer) step = Math.max(1, Math.round(step));
  const out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step) out.push(Number(v.toPrecision(12)));
  return { step, ticks: out };
}

function logTicks(min, max, count) {
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  for (const mant of [[1, 2, 5], [1, 3], [1]]) {
    const t = [];
    for (let e = lo; e <= hi; e++) for (const m of mant) {
      const v = Number((m * 10 ** e).toPrecision(3));
      if (v >= min * 0.999 && v <= max * 1.001) t.push(v);
    }
    if (t.length <= count) return t.length >= 2 ? t : linTicks(min, max, Math.max(2, count), false).ticks.filter((v) => v > 0);
  }
  const k = Math.ceil((hi - lo + 1) / Math.max(1, count));
  const t = [];
  for (let e = lo; e <= hi; e++) if ((e - lo) % k === 0 && 10 ** e >= min && 10 ** e <= max) t.push(Number((10 ** e).toPrecision(3)));
  return t;
}

function fmtTick(v) {
  if (v === 0) return '0';
  if (Math.abs(v) >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return String(Number(v.toPrecision(6)));
}

/** Resolve an axis spec {min, max, log, nice, integer} for a pixel length. */
function axis(a, px, spacing) {
  const count = Math.max(2, Math.floor(px / spacing));
  let { min, max } = a;
  if (a.log) {
    min = Math.max(min, 1e-9);
    if (!(max > min)) max = min * 10;
    return { ...a, min, max, ticks: logTicks(min, max, count) };
  }
  if (!(max > min)) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  let { step, ticks } = linTicks(min, max, count, a.integer);
  for (let c = count + 1; ticks.length < 2 && c <= count + 4; c++) ({ step, ticks } = linTicks(min, max, c, a.integer));
  if (a.nice !== false) {
    min = Math.floor(min / step + 1e-9) * step;
    max = Math.ceil(max / step - 1e-9) * step;
    return { ...a, min, max, ticks: linTicks(min, max, count, a.integer).ticks };
  }
  return { ...a, min, max, ticks };
}

function scale(ax, r0, r1) {
  if (ax.log) {
    const a = Math.log10(ax.min);
    const b = Math.log10(ax.max);
    return (v) => r0 + ((Math.log10(Math.max(v, ax.min * 1e-6)) - a) / (b - a)) * (r1 - r0);
  }
  return (v) => r0 + ((v - ax.min) / (ax.max - ax.min)) * (r1 - r0);
}

/** Keep labels (by priority) whose positions are at least `gap` apart. */
function thin(items, gap) {
  const kept = [];
  for (const it of [...items].sort((a, b) => (b.prio || 0) - (a.prio || 0))) {
    if (kept.every((k) => Math.abs(k.pos - it.pos) >= gap)) kept.push(it);
  }
  return kept;
}

function layout(spec, W) {
  const H = spec.square ? Math.round(clampN(W * 0.8, 260, 460)) : spec.height || 240;
  const T = 14;
  const B = spec.x.label ? 42 : 26;
  const plotH = H - T - B;
  const ya = axis(spec.y, plotH, 36);
  const yLab = Math.max(10, ...ya.ticks.map((t) => textW(fmtTick(t))));
  const Lm = Math.ceil(yLab + 10 + (spec.y.label ? 18 : 0));
  const hasRight = (spec.refs || []).some((r) => r.label && r.kind === 'h') || (spec.series || []).some((s) => s.label);
  const Rm = spec.rightPad ?? (hasRight ? 58 : 14);
  const plotW = Math.max(60, W - Lm - Rm);
  const xa = axis(spec.x, plotW, spec.x.log ? 52 : 64);
  const sx = scale(xa, Lm, Lm + plotW);
  const sy = scale(ya, T + plotH, T);
  const pts = (spec.points || []).map((d) => {
    let y = d.y;
    let clip = null;
    if (spec.y.clamp !== false && y > ya.max) {
      y = ya.max;
      clip = 'up';
    } else if (spec.y.clamp !== false && y < ya.min) {
      y = ya.min;
      clip = 'down';
    }
    const x = clampN(d.x, xa.min, xa.max);
    return { d, px: sx(x), py: sy(y), clip };
  });
  return { W, H, T, Lm, Rm, plotW, plotH, xa, ya, sx, sy, pts };
}

const PATHS = {
  tri: 'M0,-5.2L4.8,3.4L-4.8,3.4Z',
  diamond: 'M0,-5.6L5.2,0L0,5.6L-5.2,0Z',
  up: 'M0,-6L5,2.5L-5,2.5Z',
  down: 'M0,6L5,-2.5L-5,-2.5Z',
  square: 'M-4,-4H4V4H-4Z',
};
const SHAPE = { pass: 'circle', warn: 'tri', fail: 'diamond', low: 'circle' };

function mark(p, active = false) {
  const d = p.d;
  const st = d.status || 'pass';
  const cls = 'qc-m ' + (d.color ? 'series' : st);
  const style = d.color ? `fill:${d.color}` : undefined;
  const s = active ? 1.45 : 1;
  const shape = p.clip || d.shape || SHAPE[st] || 'circle';
  const ring = d.ring ? html`<circle class="qc-ring" cx=${p.px} cy=${p.py} r=${8 * s} />` : null;
  if (shape === 'circle') return html`${ring}<circle class=${cls} style=${style} cx=${p.px} cy=${p.py} r=${(d.size || 4.2) * s} />`;
  return html`${ring}<path class=${cls} style=${style} transform=${`translate(${p.px} ${p.py}) scale(${s})`} d=${PATHS[shape]} />`;
}

function drawStatic(spec, g, ids) {
  const { Lm, T, plotW, plotH, H, xa, ya, sx, sy } = g;
  const right = Lm + plotW;
  const bottom = T + plotH;
  const out = [];
  // grid + axes
  for (const t of ya.ticks) out.push(html`<line class="qc-grid" x1=${Lm} x2=${right} y1=${sy(t)} y2=${sy(t)} />`);
  if (spec.grid === 'xy') for (const t of xa.ticks) out.push(html`<line class="qc-grid" x1=${sx(t)} x2=${sx(t)} y1=${T} y2=${bottom} />`);
  out.push(html`<line class="qc-axis" x1=${Lm} x2=${right} y1=${bottom} y2=${bottom} />`);
  if (spec.grid === 'xy') out.push(html`<line class="qc-axis" x1=${Lm} x2=${Lm} y1=${T} y2=${bottom} />`);
  for (const t of ya.ticks) out.push(html`<text x=${Lm - 6} y=${sy(t) + 3.5} text-anchor="end">${fmtTick(t)}</text>`);
  let lastR = -Infinity;
  for (const t of xa.ticks) {
    const x = sx(t);
    const w = textW(fmtTick(t));
    if (x - w / 2 < lastR + 6) continue;
    lastR = x + w / 2;
    out.push(html`<text x=${x} y=${bottom + 15} text-anchor="middle">${fmtTick(t)}</text>`);
  }
  if (spec.x.label) out.push(html`<text class="ax-title" x=${Lm + plotW / 2} y=${H - 6} text-anchor="middle">${spec.x.label}</text>`);
  if (spec.y.label) out.push(html`<text class="ax-title" transform=${`translate(12 ${T + plotH / 2}) rotate(-90)`} text-anchor="middle">${spec.y.label}</text>`);

  // data layers, clipped to the plot area
  const clipped = [];
  for (const s of spec.shade || []) {
    const x0 = sx(Math.max(s.x0, xa.min));
    const x1 = sx(Math.min(s.x1, xa.max));
    const y0 = sy(Math.max(s.y0, ya.min));
    const y1 = sy(Math.min(s.y1, ya.max));
    if (x1 > x0 && y0 > y1) clipped.push(html`<rect class=${'qc-shade ' + (s.cls || '')} x=${x0} y=${y1} width=${x1 - x0} height=${y0 - y1} />`);
  }
  const rightLabels = [];
  const inLabels = [];
  for (const r of spec.refs || []) {
    if (r.kind === 'h') {
      if (r.y < ya.min || r.y > ya.max) continue;
      const y = sy(r.y);
      clipped.push(html`<line class=${'qc-ref ' + r.cls} x1=${Lm} x2=${right} y1=${y} y2=${y} />`);
      if (r.label) rightLabels.push({ pos: y, text: r.label, prio: r.prio || 1 });
    } else if (r.kind === 'v') {
      if (r.x < xa.min || r.x > xa.max) continue;
      const x = sx(r.x);
      clipped.push(html`<line class=${'qc-ref ' + r.cls} x1=${x} x2=${x} y1=${T} y2=${bottom} />`);
      if (r.label) inLabels.push(html`<text x=${x + 4} y=${T + 10}>${r.label}</text>`);
    } else if (r.kind === 'ratio') {
      const x0 = xa.min;
      const x1 = xa.max;
      clipped.push(html`<line class=${'qc-ref ' + r.cls} x1=${sx(x0)} y1=${sy(r.k * x0)} x2=${sx(x1)} y2=${sy(r.k * x1)} />`);
      if (r.label) {
        if (r.k * x1 > ya.max) inLabels.push(html`<text x=${sx(ya.max / r.k) - 5} y=${T + 11} text-anchor="end">${r.label}</text>`);
        else inLabels.push(html`<text x=${right - 4} y=${sy(r.k * x1) - 5} text-anchor="end">${r.label}</text>`);
      }
    } else if (r.kind === 'seg') {
      clipped.push(html`<line class=${'qc-ref ' + r.cls} x1=${sx(r.x1)} y1=${sy(r.y1)} x2=${sx(r.x2)} y2=${sy(r.y2)} />`);
    }
  }
  for (const s of spec.series || []) {
    if (!s.pts.length) continue;
    const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(clampN(p.y, ya.min, ya.max)).toFixed(1)}`).join('');
    clipped.push(html`<path class="qc-line" d=${d} style=${`stroke:${s.color}`} />`);
    if (s.label) {
      const last = s.pts[s.pts.length - 1];
      rightLabels.push({ pos: sy(clampN(last.y, ya.min, ya.max)), text: s.label, prio: 10, color: s.color });
    }
  }
  out.push(html`<clipPath id=${ids.c}><rect x=${Lm} y=${T} width=${plotW} height=${plotH} /></clipPath>`);
  out.push(html`<g clip-path=${`url(#${ids.c})`}>${clipped}</g>`);
  out.push(...inLabels);
  for (const lb of thin(rightLabels, 12)) {
    out.push(
      lb.color
        ? html`<g><line x1=${right + 4} x2=${right + 12} y1=${lb.pos} y2=${lb.pos} style=${`stroke:${lb.color};stroke-width:2`} /><text class="ink" x=${right + 15} y=${lb.pos + 3.5}>${lb.text}</text></g>`
        : html`<text x=${right + 5} y=${lb.pos + 3.5}>${lb.text}</text>`,
    );
  }
  out.push(html`<g class="qc-marks">${g.pts.map((p) => mark(p))}</g>`);
  return out;
}

/**
 * Responsive SVG chart. `spec` must be memoised by the caller:
 * {title, desc, height|square, grid, x:{min,max,log,nice,integer,label}, y:{…, clamp},
 *  points:[{x,y,status,shape,color,ring,size,row}], refs, series, shade}.
 * `tip(point)` renders the tooltip; `speak(point)` the screen-reader line.
 */
function Plot({ spec, tip, speak }) {
  const box = useRef(null);
  const svgRef = useRef(null);
  const { w } = useSize(box);
  const [act, setAct] = useState(-1);
  const ids = useMemo(() => {
    const u = 'qc' + Math.random().toString(36).slice(2, 9);
    return { t: u + 't', d: u + 'd', c: u + 'c' };
  }, []);
  const geo = useMemo(() => (w > 0 ? layout(spec, w) : null), [spec, w]);
  const body = useMemo(() => (geo ? drawStatic(spec, geo, ids) : null), [geo]);
  const order = useMemo(() => (geo ? geo.pts.map((_, i) => i).sort((a, b) => geo.pts[a].px - geo.pts[b].px || geo.pts[a].py - geo.pts[b].py) : []), [geo]);
  useEffect(() => setAct(-1), [spec]);
  const p = geo && act >= 0 ? geo.pts[act] : null;

  const onMove = (e) => {
    if (!geo || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best = -1;
    let bd = 26 * 26;
    geo.pts.forEach((q, i) => {
      const d = (q.px - mx) ** 2 + (q.py - my) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best !== act) setAct(best);
  };
  const onKey = (e) => {
    if (!order.length) return;
    const pos = order.indexOf(act);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = order[Math.min(order.length - 1, pos + 1)];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = order[Math.max(0, pos < 0 ? 0 : pos - 1)];
    else if (e.key === 'Home') next = order[0];
    else if (e.key === 'End') next = order[order.length - 1];
    else if (e.key === 'Escape') next = -1;
    if (next === null) return;
    e.preventDefault();
    setAct(next);
  };

  let tipStyle = '';
  if (p && geo) {
    const flip = p.px > geo.W - 250;
    const top = clampN(p.py - 18, 0, Math.max(0, geo.H - 120));
    tipStyle = flip ? `left:${p.px - 14}px;top:${top}px;transform:translateX(-100%)` : `left:${p.px + 14}px;top:${top}px`;
  }
  const h = geo ? geo.H : spec.square ? 320 : spec.height || 240;
  return html`<div class="qc-chart" ref=${box} tabindex="0" role="group" aria-label=${`${spec.title}. ${tr(L.keys)}`} onKeyDown=${onKey} onBlur=${() => setAct(-1)}>
    ${geo
      ? html`<svg ref=${svgRef} width=${geo.W} height=${geo.H} viewBox=${`0 0 ${geo.W} ${geo.H}`} role="img" aria-labelledby=${`${ids.t} ${ids.d}`} onPointerMove=${onMove} onPointerLeave=${() => setAct(-1)}>
          <title id=${ids.t}>${spec.title}</title>
          <desc id=${ids.d}>${spec.desc || ''}</desc>
          ${body}
          ${p ? html`<g class="qc-active"><circle class="qc-halo" cx=${p.px} cy=${p.py} r="10" />${mark(p, true)}</g>` : null}
        </svg>`
      : html`<div style=${`height:${h}px`}></div>`}
    ${p && tip ? html`<div class="qc-tip" style=${tipStyle}>${tip(p.d)}</div>` : null}
    <div class="qc-sr" aria-live="polite">${p && speak ? speak(p.d) : ''}</div>
  </div>`;
}

function LegendMark({ status, shape }) {
  const d = { status, shape };
  return html`<svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">${mark({ d, px: 0, py: 0, clip: null })}</svg>`;
}
function LegendLine({ cls, color }) {
  return html`<svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true"><line class=${'qc-ref ' + (cls || '')} x1="1" x2="21" y1="5" y2="5" style=${color ? `stroke:${color};stroke-width:2` : undefined} /></svg>`;
}
function Legend({ items }) {
  return html`<div class="qc-legend">
    ${items.map(
      (it) => html`<span>
        ${it.line ? html`<${LegendLine} cls=${it.line} color=${it.color} />` : it.ring ? html`<svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden="true"><circle class="qc-ring" r="7" /><circle class="qc-m fail" r="4" /></svg>` : it.shade ? html`<span class="qc-shade-key"></span>` : html`<${LegendMark} status=${it.status} shape=${it.shape} />`}
        ${it.label}
      </span>`,
    )}
  </div>`;
}

const Tip = ({ value, head, items }) => html`<b class="v">${value}</b>${head ? html`<div>${head}</div>` : null}
  <dl>${items.filter(Boolean).map(([k, v]) => html`<dt>${k}</dt><dd>${v || '—'}</dd>`)}</dl>`;

// --------------------------------------------------------------- reasons

function reasonText(r, q) {
  const el = r.element ? elementLabel(r.element) : '';
  const z = signed(r.z);
  switch (r.code) {
    case 'crmFail':
      return r.rule === '2x2SD'
        ? tr({ en: `${r.crm} ${el}: ${r.sampleId} is the 2nd result in a row beyond ±${q.crmWarnSD} SD on one side (z ${z})`, mn: `${r.crm} ${el}: ${r.sampleId} — ±${q.crmWarnSD} SD-ээс нэг талдаа дараалан 2 дахь удаа гарсан (z ${z})` })
        : tr({ en: `${r.crm} ${el}: ${r.sampleId} beyond ±${q.crmFailSD} SD (z ${z})`, mn: `${r.crm} ${el}: ${r.sampleId} ±${q.crmFailSD} SD-ээс гарсан (z ${z})` });
    case 'crmWarn':
      return tr({ en: `${r.n} CRM result(s) for ${el} between ±${q.crmWarnSD} and ±${q.crmFailSD} SD (${r.crms.join(', ')})`, mn: `${el}: ${r.n} CRM үр дүн ±${q.crmWarnSD}–${q.crmFailSD} SD-ийн хооронд (${r.crms.join(', ')})` });
    case 'crmBias':
      return tr({ en: `CRMs for ${el} biased ${signed(r.meanZ, 1)} SD on average (${r.n} results)`, mn: `${el}: CRM-ууд дунджаар ${signed(r.meanZ, 1)} SD хазайлттай (${r.n} үр дүн)` });
    case 'noCrm':
      return tr({ en: `No CRM with a certified ${el} value in this batch`, mn: `Энэ багцад ${el}-ийн гэрчилгээт утгатай CRM алга` });
    case 'blankFail':
      return (
        tr({ en: `Blank ${r.sampleId}: ${el} ${num(r.value)} > ${num(r.threshold)}`, mn: `Blank ${r.sampleId}: ${el} ${num(r.value)} > ${num(r.threshold)}` }) +
        (r.carryOver ? tr({ en: ` — after high-grade ${r.prevId} (${num(r.prevValue)})`, mn: ` — өндөр агуулгатай ${r.prevId} (${num(r.prevValue)})-ийн дараа` }) : '')
      );
    case 'blankFails':
      return tr({ en: `${r.n} blanks above ${num(r.threshold)} ${el} — possible contamination`, mn: `${r.n} blank ${num(r.threshold)} ${el}-ээс их — бохирдол байж болзошгүй` });
    case 'carryOver':
      return tr({ en: `${r.n} blank(s) followed a high-grade sample (within limit)`, mn: `${r.n} blank өндөр агуулгатай дээжийн дараа орсон (хязгаарт багтсан)` });
    case 'dupRate':
      return tr({ en: `${r.type} ${el}: ${fmt(r.rate, 0)}% of ${r.n} pairs within HARD ${r.limit}% (target ${r.target}%)`, mn: `${r.type} ${el}: ${r.n} хосын ${fmt(r.rate, 0)}% нь HARD ${r.limit}%-д багтсан (зорилт ${r.target}%)` });
    case 'noBlank':
      return tr({ en: 'No blank in this batch', mn: 'Энэ багцад blank алга' });
    default:
      return r.code;
  }
}

function Reasons({ list, q, max = 3 }) {
  const [open, setOpen] = useState(false);
  if (!list.length) return html`<span class="muted">${tr({ en: 'All checks passed', mn: 'Бүх шалгуурыг давсан' })}</span>`;
  const shown = open ? list : list.slice(0, max);
  const icon = { reject: 'alert', review: 'alert', info: 'info' };
  return html`<ul class="qc-reasons">
    ${shown.map((r) => html`<li class=${r.level}><${Icon} name=${icon[r.level]} size=${14} /><span>${reasonText(r, q)}</span></li>`)}
    ${list.length > max
      ? html`<li><button class="qc-link" onClick=${(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}>${open ? tr({ en: 'Show less', mn: 'Хураах' }) : tr({ en: `+${list.length - max} more`, mn: `+${list.length - max} бусад` })}</button></li>`
      : null}
  </ul>`;
}

// ------------------------------------------------------------ small pieces

function Seg({ value, options, onChange, label }) {
  return html`<div class="seg" role="group" aria-label=${label}>
    ${options.map((o) => html`<button type="button" class=${o.value === value ? 'on' : ''} aria-pressed=${o.value === value} onClick=${() => onChange(o.value)}>${o.label}</button>`)}
  </div>`;
}

/** Plain results table with an "only issues / show all" switch and a row cap. */
function ResultTable({ cols, list, isIssue, cap = 300, title }) {
  const [all, setAll] = useState(false);
  const issues = isIssue ? list.filter(isIssue) : list;
  const shown = (all || !isIssue ? list : issues).slice(0, cap);
  const total = all || !isIssue ? list.length : issues.length;
  return html`<details class="qc-details" open=${!!isIssue && issues.length > 0 && issues.length <= 40}>
    <summary>${title || tr(L.resultsTable)} <span class="muted">(${isIssue ? `${issues.length} / ${list.length}` : list.length})</span></summary>
    ${isIssue
      ? html`<div class="row" style="margin:8px 0"><${Seg} label=${title || tr(L.resultsTable)} value=${all ? 'all' : 'issues'} onChange=${(v) => setAll(v === 'all')} options=${[{ value: 'issues', label: tr(L.showIssues) }, { value: 'all', label: tr(L.showAll) }]} /></div>`
      : null}
    ${shown.length
      ? html`<div class="tbl-wrap qc-tbl-scroll"><table class="tbl">
          <thead><tr>${cols.map((c) => html`<th class=${c.num ? 'num' : ''}>${c.label}</th>`)}</tr></thead>
          <tbody>${shown.map((r) => html`<tr>${cols.map((c) => html`<td class=${c.num ? 'num' : ''}>${c.render ? c.render(r) : r[c.key] ?? ''}</td>`)}</tr>`)}</tbody>
        </table></div>`
      : html`<p class="muted" style="padding:8px 0">${tr({ en: 'Nothing to show — no issues.', mn: 'Асуудал алга.' })}</p>`}
    ${total > cap ? html`<p class="muted" style="margin-top:6px">${tr({ en: `First ${cap} of ${total} rows — export CSV for all.`, mn: `${total} мөрийн эхний ${cap} — бүгдийг CSV-ээр татна.` })}</p>` : null}
  </details>`;
}

function NoData({ title, children, onLibrary }) {
  return html`<div class="card"><${Empty} icon="flask" title=${title}>
    <p>${children}</p>
    <div class="row" style="justify-content:center;margin-top:12px">
      <${Button} kind="primary" icon="upload" onClick=${() => navigate('#/import')}>${tr(L.importLab)}<//>
      ${onLibrary ? html`<${Button} icon="list" onClick=${onLibrary}>${tr(L.defineStd)}<//>` : null}
    </div>
  <//></div>`;
}

function LimitsNote({ q, children }) {
  return html`<p class="muted qc-note">${children}
    <a href="#/settings">${tr(L.settingsLink)}</a></p>`;
}

// ------------------------------------------------------------------ overview

function Overview({ el, batch, setBatch, q, rev, goTab }) {
  const s = useMemo(() => QC.qcSummary(el, { batch }), [rev, el, batch]);
  const batches = useMemo(() => QC.batchStatus(el), [rev, el]);
  const ins = s.insertion;
  const crmKind = s.crm.passRate === null ? '' : s.crm.passRate >= 95 ? 'ok' : s.crm.passRate >= 90 ? 'warn' : 'err';
  const blkKind = s.blank.passRate === null ? '' : s.blank.passRate >= 98 ? 'ok' : s.blank.passRate >= 90 ? 'warn' : 'err';
  const dupKind = s.dup.passRate === null ? '' : s.dup.passRate >= q.dupPassRate ? 'ok' : s.dup.passRate >= q.dupPassRate - 10 ? 'warn' : 'err';
  const insKind = { ok: 'ok', warn: 'warn', fail: 'err' }[ins.status] || '';
  const noQc = !s.crm.n && !s.blank.n && !s.dup.n && !batches.length;
  if (noQc && !ins.total)
    return html`<${NoData} title=${tr({ en: 'No QC data yet', mn: 'QC өгөгдөл алга байна' })} onLibrary=${() => goTab('library')}>
      ${tr({
        en: 'Log samples with their QC type (CRM, blank, field/coarse/pulp duplicate), import the lab certificates, and enter the certified values of your standards. Charts and batch decisions appear here automatically.',
        mn: 'Дээжийг QC төрөлтэй нь (CRM, blank, хээрийн/бутлагдсан/нунтаг давхар) бүртгэж, лабын сертификатыг импортлоод, стандартынхаа гэрчилгээт утгыг оруулна. Графикууд болон багцын шийдвэр энд автоматаар гарна.',
      })}
    <//>`;
  return html`<div class="stack">
    <div class="stats">
      <${Stat} label=${tr({ en: 'CRM pass rate', mn: 'CRM тэнцсэн' })} value=${pctTxt(s.crm.passRate)} kind=${crmKind}
        sub=${s.crm.n ? tr({ en: `${s.crm.n} results · ${s.crm.warn} warn · ${s.crm.fail} fail`, mn: `${s.crm.n} үр дүн · ${s.crm.warn} анхаар. · ${s.crm.fail} тэнцээгүй` }) : tr({ en: 'No CRM results', mn: 'CRM үр дүн алга' })} />
      <${Stat} label=${tr({ en: 'Blank pass rate', mn: 'Blank тэнцсэн' })} value=${pctTxt(s.blank.passRate)} kind=${blkKind}
        sub=${s.blank.n ? tr({ en: `${s.blank.n} blanks · ${s.blank.fail} over ${q.blankFactor}×LOR`, mn: `${s.blank.n} blank · ${s.blank.fail} нь ${q.blankFactor}×LOR-оос их` }) : tr({ en: 'No blank results', mn: 'Blank үр дүн алга' })} />
      <${Stat} label=${tr({ en: 'Duplicate pass rate', mn: 'Давхар дээж тэнцсэн' })} value=${pctTxt(s.dup.passRate)} kind=${dupKind}
        sub=${s.dup.n ? tr({ en: `${s.dup.used} pairs · target ≥${q.dupPassRate}%${s.dup.low ? ` · ${s.dup.low} near LOR` : ''}`, mn: `${s.dup.used} хос · зорилт ≥${q.dupPassRate}%${s.dup.low ? ` · ${s.dup.low} LOR-т ойр` : ''}` }) : tr({ en: 'No duplicate pairs', mn: 'Давхар дээжийн хос алга' })} />
      <${Stat} label=${tr({ en: 'QC insertion', mn: 'QC оруулалт' })} value=${pctTxt(ins.qcPct)} kind=${insKind}
        sub=${`CRM ${oneIn(ins.crm.oneIn)} · blank ${oneIn(ins.blank.oneIn)} · dup ${oneIn(ins.dup.oneIn)}`} />
      <${Stat} label=${tr({ en: 'Batches accepted', mn: 'Хүлээн авах багц' })} value=${`${s.batches.accept}/${s.batches.n}`} kind=${s.batches.reject ? 'err' : s.batches.review ? 'warn' : s.batches.n ? 'ok' : ''}
        sub=${tr({ en: `${s.batches.review} to review · ${s.batches.reject} to reject`, mn: `${s.batches.review} хянах · ${s.batches.reject} буцаах` })} />
    </div>

    ${s.undefinedCrms.length
      ? html`<div class="card qc-callout warn"><${Icon} name="alert" />
          <div>${tr({ en: `${s.undefinedCrms.reduce((a, u) => a + u.n, 0)} CRM results for ${elementLabel(el)} cannot be checked — no certified value for: `, mn: `${elementLabel(el)}-ийн ${s.undefinedCrms.reduce((a, u) => a + u.n, 0)} CRM үр дүнг шалгах боломжгүй — гэрчилгээт утга алга: ` })}
            <b>${s.undefinedCrms.map((u) => u.crm || tr({ en: '(no code)', mn: '(кодгүй)' })).join(', ')}</b></div>
          <${Button} size="sm" onClick=${() => goTab('library')}>${tr(L.defineStd)}<//>
        </div>`
      : null}

    <section class="card">
      <header>
        <div><h2>${tr({ en: 'Lab batches', mn: 'Лабын багцууд' })}</h2>
          <p class="muted" style="font-size:12.5px;margin-top:2px">${tr({ en: `Decision for ${elementLabel(el)} — click a batch to filter every tab.`, mn: `${elementLabel(el)}-ийн шийдвэр — багц дээр дарж бүх табыг шүүнэ.` })}</p></div>
      </header>
      ${batches.length
        ? html`<div class="qc-tbl-scroll"><table class="tbl qc-batches">
            <thead><tr>
              <th>${tr({ en: 'Batch / lab job', mn: 'Багц / лаб. ажил' })}</th>
              <th>${tr({ en: 'Lab · dispatch', mn: 'Лаб · илгээлт' })}</th>
              <th>${tr(L.reported)}</th>
              <th class="num">${tr({ en: 'Samples', mn: 'Дээж' })}</th>
              <th>CRM</th><th>Blank</th><th>${tr({ en: 'Dup', mn: 'Давхар' })}</th>
              <th>${tr({ en: 'Decision', mn: 'Шийдвэр' })}</th>
              <th>${tr({ en: 'Reasons', mn: 'Шалтгаан' })}</th>
            </tr></thead>
            <tbody>
              ${batches.map(
                (b) => html`<tr class=${'click' + (batch === b.key ? ' sel' : '')} tabindex="0" aria-selected=${batch === b.key}
                    onClick=${() => setBatch(batch === b.key ? null : b.key)}
                    onKeyDown=${(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setBatch(batch === b.key ? null : b.key))}>
                  <td><b class="mono">${b.key || tr({ en: '(no job no.)', mn: '(дугааргүй)' })}</b>${b.certificates.length && b.certificates[0] !== b.key ? html`<div class="muted qc-small">${b.certificates.join(', ')}</div>` : null}</td>
                  <td>${b.lab || ''}${b.dispatchIds.length ? html`<div class="muted qc-small">${b.dispatchIds.join(', ')}</div>` : null}</td>
                  <td class="mono qc-small qc-nowrap">${b.date || '—'}</td>
                  <td class="num">${b.nSamples}</td>
                  <td><${Counts} n=${b.nCrm} warn=${b.crm.warn} fail=${b.crm.fail} /></td>
                  <td><${Counts} n=${b.nBlk} fail=${b.blank.fail} /></td>
                  <td><${Counts} n=${b.nDup} fail=${b.dup.fail} /></td>
                  <td><${StatusPill} s=${b.status} /></td>
                  <td class="qc-reason-cell"><${Reasons} list=${b.reasons} q=${q} /></td>
                </tr>`,
              )}
            </tbody>
          </table></div>`
        : html`<${Empty} icon="flask" title=${tr({ en: `No assays for ${elementLabel(el)}`, mn: `${elementLabel(el)}-ийн шинжилгээ алга` })}>${tr({ en: 'Import lab results to see batch decisions.', mn: 'Багцын шийдвэр харахын тулд лабын үр дүнг импортлоно уу.' })}<//>`}
    </section>
  </div>`;
}

function Counts({ n, warn = 0, fail = 0 }) {
  return html`<span class="qc-counts"><span class="num">${n}</span>
    ${fail ? html`<${Pill} kind="err">${fail} ${tr({ en: 'fail', mn: 'тэнц.' })}<//>` : null}
    ${warn ? html`<${Pill} kind="warn">${warn} ${tr({ en: 'warn', mn: 'анхаар.' })}<//>` : null}
  </span>`;
}

// ---------------------------------------------------------------- CRM tab

function crmTip(el) {
  const u = unitOf(el);
  return (d) => {
    const r = d.row;
    return html`<${Tip} value=${`${num(r.value)} ${u}`} head=${html`<b>${r.crm}</b> · ${statusText(r.status)}${r.rule === '2x2SD' ? ' (2×2SD)' : ''} · z ${signed(r.z)}`}
      items=${[[tr(L.sample), r.sampleId], [tr(L.hole), r.holeId], [tr(L.labJob), r.labJob], [tr(L.reported), r.date], [tr(L.seq), r.seq]]} />`;
  };
}
const crmSpeak = (d) => `${d.row.crm} ${d.row.sampleId}: ${num(d.row.value)}, z ${signed(d.row.z)}, ${statusText(d.row.status)}`;

function crmSpec(sum, list, el, q) {
  const { expected: exp, sd } = sum;
  const vals = list.map((r) => r.value);
  const lo = Math.max(Math.min(exp - 3.6 * sd, ...vals), exp - 7 * sd);
  const hi = Math.min(Math.max(exp + 3.6 * sd, ...vals), exp + 7 * sd);
  const seqs = list.map((r) => r.seq);
  const x0 = Math.min(...seqs);
  const x1 = Math.max(...seqs);
  const pad = Math.max(0.6, (x1 - x0) * 0.025);
  const w = q.crmWarnSD;
  const f = q.crmFailSD;
  const refs = [
    { kind: 'h', y: exp, cls: 'exp', label: num(exp), prio: 9 },
    { kind: 'h', y: exp + w * sd, cls: 'warn', label: `+${w}SD`, prio: 3 },
    { kind: 'h', y: exp - w * sd, cls: 'warn', label: `−${w}SD`, prio: 3 },
    { kind: 'h', y: exp + f * sd, cls: 'fail', label: `+${f}SD`, prio: 5 },
    { kind: 'h', y: exp - f * sd, cls: 'fail', label: `−${f}SD`, prio: 5 },
  ];
  if (sum.fit && list.length >= 3) refs.push({ kind: 'seg', x1: x0, y1: sum.fit.intercept + sum.fit.slope * x0, x2: x1, y2: sum.fit.intercept + sum.fit.slope * x1, cls: 'trend' });
  return {
    title: `${sum.crm} — ${elementLabel(el)}`,
    desc: tr({
      en: `Control chart: ${sum.n} results, ${sum.nPass} pass, ${sum.nWarn} warning, ${sum.nFail} fail. Certified ${num(exp)} ± ${num(sd)} (1 SD).`,
      mn: `Хяналтын график: ${sum.n} үр дүн, ${sum.nPass} тэнцсэн, ${sum.nWarn} анхааруулга, ${sum.nFail} тэнцээгүй. Гэрчилгээт ${num(exp)} ± ${num(sd)} (1 SD).`,
    }),
    height: 230,
    grid: 'y',
    x: { min: x0 - pad, max: x1 + pad, nice: false, integer: true, label: tr(L.seqAxis) },
    y: { min: lo, max: hi, nice: false, label: elementLabel(el) },
    points: list.map((r) => ({ x: r.seq, y: r.value, status: r.status, row: r })),
    refs,
  };
}

function zSpec(list, el, q) {
  const f = q.crmFailSD;
  const w = q.crmWarnSD;
  const zs = list.map((r) => r.z);
  const lim = Math.min(Math.max(f + 1, ...zs.map(Math.abs)), 8);
  const seqs = list.map((r) => r.seq);
  const x0 = Math.min(...seqs);
  const x1 = Math.max(...seqs);
  const pad = Math.max(0.6, (x1 - x0) * 0.02);
  return {
    title: tr({ en: `All CRMs — z-score, ${elementLabel(el)}`, mn: `Бүх CRM — z-оноо, ${elementLabel(el)}` }),
    desc: tr({ en: `${list.length} CRM results as standard deviations from their certified values.`, mn: `${list.length} CRM үр дүнг гэрчилгээт утгаасаа хазайсан SD-ээр.` }),
    height: 280,
    grid: 'y',
    x: { min: x0 - pad, max: x1 + pad, nice: false, integer: true, label: tr(L.seqAxis) },
    y: { min: -lim, max: lim, nice: false, label: 'z (SD)' },
    points: list.map((r) => ({ x: r.seq, y: r.z, status: r.status, row: r })),
    refs: [
      { kind: 'h', y: 0, cls: 'exp', label: '0', prio: 9 },
      { kind: 'h', y: w, cls: 'warn', label: `+${w}SD`, prio: 3 },
      { kind: 'h', y: -w, cls: 'warn', label: `−${w}SD`, prio: 3 },
      { kind: 'h', y: f, cls: 'fail', label: `+${f}SD`, prio: 5 },
      { kind: 'h', y: -f, cls: 'fail', label: `−${f}SD`, prio: 5 },
    ],
  };
}

function CrmTab({ el, batch, q, rev, goTab }) {
  const [mode, setMode] = usePref('qaqc.crmMode', 'each');
  const data = useMemo(() => {
    const res = QC.crmResults(el, { batch });
    const sums = QC.crmSummary(el, { batch });
    const specs = sums.map((s) => ({ sum: s, spec: crmSpec(s, res.filter((r) => r.crm === s.crm), el, q) }));
    return { res, sums, specs, z: res.length ? zSpec(res, el, q) : null, undef: QC.crmUndefined(el) };
  }, [rev, el, batch]);
  const tip = useMemo(() => crmTip(el), [el]);
  const u = unitOf(el);

  if (!data.res.length)
    return html`<div class="stack">
      <${NoData} title=${tr({ en: `No CRM results for ${elementLabel(el)}`, mn: `${elementLabel(el)}-ийн CRM үр дүн алга` })} onLibrary=${() => goTab('library')}>
        ${tr({
          en: 'Insert certified reference materials in the sample stream (sample type CRM, with the standard code), import the lab results, and give each standard a certified value and 1 SD for this element in the Standards library.',
          mn: 'Дээжийн урсгалд гэрчилгээт стандарт (төрөл CRM, стандартын кодтой) оруулж, лабын үр дүнг импортлоод, «Стандартын сан»-д стандарт бүрийн энэ элементийн гэрчилгээт утга, 1 SD-г оруулна.',
        })}
      <//>
      ${data.undef.length ? html`<${UndefinedNote} list=${data.undef} el=${el} goTab=${goTab} />` : null}
    </div>`;

  return html`<div class="stack">
    <div class="row between">
      <${Legend} items=${[
        { status: 'pass', label: `${tr(L.status.pass)} (≤${q.crmWarnSD} SD)` },
        { status: 'warn', label: `${tr(L.status.warn)} (${q.crmWarnSD}–${q.crmFailSD} SD)` },
        { status: 'fail', label: `${tr(L.status.fail)} (>${q.crmFailSD} SD / 2×2SD)` },
        { line: 'exp', label: tr({ en: 'Certified', mn: 'Гэрчилгээт' }) },
        { line: 'warn', label: `±${q.crmWarnSD} SD` },
        { line: 'fail', label: `±${q.crmFailSD} SD` },
        { line: 'trend', label: tr({ en: 'Trend', mn: 'Чиг хандлага' }) },
        { status: 'fail', shape: 'up', label: tr({ en: 'Off scale', mn: 'Хуваариас гадуур' }) },
      ]} />
      <${Seg} label=${tr({ en: 'Chart mode', mn: 'Графикийн горим' })} value=${mode} onChange=${setMode}
        options=${[{ value: 'each', label: tr({ en: 'Per CRM', mn: 'CRM тус бүр' }) }, { value: 'z', label: tr({ en: 'All (z-score)', mn: 'Бүгд (z-оноо)' }) }]} />
    </div>

    <div class="tbl-wrap qc-tbl-scroll"><table class="tbl">
      <thead><tr>
        <th>CRM</th><th>${tr({ en: 'Supplier', mn: 'Нийлүүлэгч' })}</th>
        <th class="num">${tr({ en: 'Certified ± 1SD', mn: 'Гэрчилгээт ± 1SD' })}</th>
        <th class="num">n</th><th class="num">${tr({ en: 'Mean', mn: 'Дундаж' })}</th>
        <th class="num">Bias</th><th class="num">${tr({ en: 'Pass', mn: 'Тэнцсэн' })}</th>
        <th class="num">${tr({ en: 'Warn / fail', mn: 'Анхаар. / тэнц.' })}</th>
        <th class="num" title=${tr({ en: 'Slope of the values per 100 samples of the sequence, as % of the certified value', mn: 'Дарааллын 100 дээж тутамд утгын өөрчлөлт, гэрчилгээт утгын %' })}>${tr({ en: 'Drift /100', mn: 'Drift /100' })}</th>
      </tr></thead>
      <tbody>${data.sums.map(
        (s) => html`<tr class="click" onClick=${() => document.getElementById(`qc-crm-${QC.normCode(s.crm)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <td><b>${s.crm}</b></td><td class="muted">${s.supplier}</td>
          <td class="num">${num(s.expected)} ± ${num(s.sd)} <span class="muted">${u}</span></td>
          <td class="num">${s.n}</td><td class="num">${num(s.mean)}</td>
          <td class="num"><${StatusPill} s=${s.biasStatus}>${signed(s.bias, 1)}%<//></td>
          <td class="num">${pctTxt(s.passRate)}</td>
          <td class="num">${s.nWarn} / ${s.nFail}</td>
          <td class="num">${isNum(s.driftPct) ? `${signed(s.driftPct, 1)}%` : '—'}</td>
        </tr>`,
      )}</tbody>
    </table></div>
    <${LimitsNote} q=${q}>${tr({ en: `Bias: ≤${q.biasWarn}% good, >${q.biasFail}% unacceptable. Two consecutive results of one CRM beyond ±${q.crmWarnSD} SD on the same side fail (Westgard 2×2SD).`, mn: `Bias: ≤${q.biasWarn}% сайн, >${q.biasFail}% хүлээн зөвшөөрөхгүй. Нэг CRM-ийн дараалсан 2 үр дүн нэг талдаа ±${q.crmWarnSD} SD-ээс гарвал тэнцээгүй (Westgard 2×2SD).` })}<//>

    ${mode === 'z' && data.z
      ? html`<section class="card"><div class="body"><${Plot} spec=${data.z} tip=${tip} speak=${crmSpeak} /></div></section>`
      : html`<div class="qc-charts">${data.specs.map(
          ({ sum: s, spec }) => html`<section class="card" id=${`qc-crm-${QC.normCode(s.crm)}`}>
            <header>
              <div class="row"><h3>${s.crm}</h3><span class="muted qc-small">${s.supplier}</span>
                <span class="qc-small">${tr({ en: 'certified', mn: 'гэрчилгээт' })} <b class="num">${num(s.expected)} ± ${num(s.sd)}</b> ${u}</span></div>
              <div class="row qc-small">
                <span>n <b>${s.n}</b></span>
                <span>${tr({ en: 'mean', mn: 'дундаж' })} <b class="num">${num(s.mean)}</b></span>
                <span>bias <b class="num">${signed(s.bias, 1)}%</b></span>
                <span>${tr({ en: 'pass', mn: 'тэнцсэн' })} <b class="num">${pctTxt(s.passRate)}</b></span>
                <span>drift <b class="num">${isNum(s.driftPct) ? `${signed(s.driftPct, 1)}%` : '—'}</b></span>
                <${StatusPill} s=${s.status} />
              </div>
            </header>
            <div class="body"><${Plot} spec=${spec} tip=${tip} speak=${crmSpeak} /></div>
          </section>`,
        )}</div>`}

    ${data.undef.length ? html`<${UndefinedNote} list=${data.undef} el=${el} goTab=${goTab} />` : null}

    <${ResultTable}
      list=${data.res}
      isIssue=${(r) => r.status !== 'pass'}
      cols=${[
        { label: tr(L.seq), num: true, key: 'seq' },
        { label: 'CRM', key: 'crm' },
        { label: tr(L.sample), render: (r) => html`<span class="mono">${r.sampleId}</span>` },
        { label: tr(L.hole), key: 'holeId' },
        { label: tr(L.labJob), key: 'labJob' },
        { label: tr(L.reported), key: 'date' },
        { label: elementLabel(el), num: true, render: (r) => num(r.value) },
        { label: 'z', num: true, render: (r) => signed(r.z) },
        { label: tr({ en: 'Status', mn: 'Төлөв' }), render: (r) => html`<${StatusPill} s=${r.status}>${statusText(r.status)}${r.rule === '2x2SD' ? ' · 2×2SD' : ''}<//>` },
      ]}
    />
  </div>`;
}

function UndefinedNote({ list, el, goTab }) {
  const why = { missing: tr({ en: 'no definition', mn: 'тодорхойлолтгүй' }), invalid: tr({ en: 'value or SD missing', mn: 'утга эсвэл SD дутуу' }), noCode: tr({ en: 'standard code missing on the sample', mn: 'дээжид стандартын код алга' }) };
  return html`<div class="card qc-callout warn"><${Icon} name="alert" />
    <div>
      <b>${tr({ en: `CRM samples that cannot be checked for ${elementLabel(el)}`, mn: `${elementLabel(el)}-ээр шалгах боломжгүй CRM дээж` })}</b>
      <ul class="qc-plain">${list.map((u) => html`<li><span class="mono">${u.crm || '—'}</span> · ${u.n} × · ${why[u.reason]}</li>`)}</ul>
    </div>
    <${Button} size="sm" onClick=${() => goTab('library')}>${tr(L.defineStd)}<//>
  </div>`;
}

// -------------------------------------------------------------- blanks tab

function BlanksTab({ el, batch, q, rev }) {
  const [log, setLog] = usePref('qaqc.blankLog', false);
  const u = unitOf(el);
  const data = useMemo(() => {
    const res = QC.blankResults(el, { batch });
    const lor = QC.elementLOR(el);
    const hg = QC.highGradeThreshold(el);
    if (!res.length) return { res, lor, hg, spec: null };
    const thr = res[0].threshold;
    const vals = res.map((r) => r.value);
    const pos = vals.filter((v) => v > 0);
    const seqs = res.map((r) => r.seq);
    const x0 = Math.min(...seqs);
    const x1 = Math.max(...seqs);
    const pad = Math.max(0.6, (x1 - x0) * 0.02);
    const ymin = log ? Math.min(lor.lor / 2, ...pos) / 1.4 : 0;
    const ymax = log ? Math.max(thr * 3, ...vals) * 1.4 : Math.max(thr * 1.4, ...vals) * 1.06;
    const spec = {
      title: tr({ en: `Blanks — ${elementLabel(el)}`, mn: `Blank — ${elementLabel(el)}` }),
      desc: tr({
        en: `${res.length} blanks; ${res.filter((r) => r.status === 'fail').length} above the threshold of ${num(thr)} ${u} (${q.blankFactor} × LOR ${num(lor.lor)}).`,
        mn: `${res.length} blank; ${res.filter((r) => r.status === 'fail').length} нь босго ${num(thr)} ${u}-ээс их (${q.blankFactor} × LOR ${num(lor.lor)}).`,
      }),
      height: 260,
      grid: 'y',
      x: { min: x0 - pad, max: x1 + pad, nice: false, integer: true, label: tr(L.seqAxis) },
      y: { min: ymin, max: ymax, log, nice: !log, label: elementLabel(el) },
      points: res.map((r) => ({ x: r.seq, y: log ? Math.max(r.value, ymin) : r.value, status: r.status, ring: r.carryOver, row: r })),
      refs: [
        { kind: 'h', y: thr, cls: 'fail', label: `${q.blankFactor}×LOR`, prio: 9 },
        { kind: 'h', y: lor.lor, cls: 'lor', label: 'LOR', prio: 5 },
      ],
    };
    return { res, lor, hg, spec, thr };
  }, [rev, el, batch, log]);

  const tip = (d) => {
    const r = d.row;
    return html`<${Tip} value=${`${r.flag === '<' ? '<' : ''}${num(r.value)} ${u}`} head=${html`${statusText(r.status)} · ${fmt(r.ratio, 1)} × LOR${r.carryOver ? html` · <b>${tr({ en: 'possible carry-over', mn: 'шилжин бохирдол байж болзошгүй' })}</b>` : ''}`}
      items=${[
        [tr(L.sample), r.sampleId],
        [tr(L.hole), r.holeId],
        [tr(L.labJob), r.labJob],
        [tr({ en: 'Threshold', mn: 'Босго' }), `${num(r.threshold)} ${u}`],
        [tr({ en: 'Preceded by', mn: 'Өмнөх дээж' }), r.prevId ? `${r.prevId} (${r.prevHole || '—'})` : null],
        [tr({ en: 'Its grade', mn: 'Түүний агуулга' }), r.prevId ? `${num(r.prevValue)} ${u}` : null],
      ]} />`;
  };
  const speak = (d) => `${d.row.sampleId}: ${num(d.row.value)} ${u}, ${statusText(d.row.status)}${d.row.carryOver ? ', carry-over' : ''}`;

  if (!data.res.length)
    return html`<${NoData} title=${tr({ en: `No blank results for ${elementLabel(el)}`, mn: `${elementLabel(el)}-ийн blank үр дүн алга` })}>
      ${tr({ en: 'Insert blank material (sample type BLK) after likely high-grade intervals and import the lab results. Blanks above the threshold point to contamination during sample preparation.', mn: 'Өндөр агуулгатай байж болох интервалын дараа blank (төрөл BLK) оруулж, лабын үр дүнг импортлоно. Босгоос их blank нь дээж бэлтгэлийн үеийн бохирдлыг илтгэнэ.' })}
    <//>`;

  const src = { settings: tr({ en: 'from Settings', mn: 'Тохиргооноос' }), data: tr({ en: 'from lab "<" values', mn: 'лабын «<» утгаас' }), default: tr({ en: 'default — set it in Settings', mn: 'анхдагч — Тохиргоонд оруулна уу' }) };
  const nFail = data.res.filter((r) => r.status === 'fail').length;
  const nCarry = data.res.filter((r) => r.carryOver).length;
  return html`<div class="stack">
    <div class="stats">
      <${Stat} label=${tr({ en: 'Blanks', mn: 'Blank' })} value=${data.res.length} sub=${tr({ en: `${nFail} above threshold`, mn: `${nFail} нь босгоос их` })} kind=${nFail ? 'err' : 'ok'} />
      <${Stat} label=${tr({ en: 'Threshold', mn: 'Босго' })} value=${num(data.thr)} unit=${u} sub=${`${q.blankFactor} × LOR ${num(data.lor.lor)} (${src[data.lor.source]})`} />
      <${Stat} label=${tr({ en: 'After high grade', mn: 'Өндөр агуулгын дараа' })} value=${nCarry} sub=${tr({ en: `preceding sample ≥ ${num(data.hg.value)} ${u}`, mn: `өмнөх дээж ≥ ${num(data.hg.value)} ${u}` })} kind=${nCarry ? 'warn' : ''} />
    </div>
    <section class="card">
      <header>
        <${Legend} items=${[
          { status: 'pass', label: tr(L.status.pass) },
          { status: 'fail', label: tr({ en: 'Above threshold', mn: 'Босгоос их' }) },
          { ring: true, label: tr({ en: 'After a high-grade sample', mn: 'Өндөр агуулгатай дээжийн дараа' }) },
          { line: 'fail', label: `${q.blankFactor} × LOR` },
          { line: 'lor', label: 'LOR' },
        ]} />
        <${Seg} label=${tr({ en: 'Scale', mn: 'Хуваарь' })} value=${log ? 'log' : 'lin'} onChange=${(v) => setLog(v === 'log')}
          options=${[{ value: 'lin', label: tr({ en: 'Linear', mn: 'Шугаман' }) }, { value: 'log', label: 'Log' }]} />
      </header>
      <div class="body"><${Plot} spec=${data.spec} tip=${tip} speak=${speak} /></div>
    </section>
    <${ResultTable}
      list=${data.res}
      isIssue=${(r) => r.status === 'fail' || r.carryOver}
      cols=${[
        { label: tr(L.seq), num: true, key: 'seq' },
        { label: tr(L.sample), render: (r) => html`<span class="mono">${r.sampleId}</span>` },
        { label: tr(L.hole), key: 'holeId' },
        { label: tr(L.labJob), key: 'labJob' },
        { label: elementLabel(el), num: true, render: (r) => `${r.flag === '<' ? '<' : ''}${num(r.value)}` },
        { label: '× LOR', num: true, render: (r) => fmt(r.ratio, 1) },
        { label: tr({ en: 'Status', mn: 'Төлөв' }), render: (r) => html`<${StatusPill} s=${r.status} />` },
        { label: tr({ en: 'Preceded by', mn: 'Өмнөх дээж' }), render: (r) => (r.prevId ? html`<span class="mono">${r.prevId}</span>` : '—') },
        { label: tr({ en: 'Its grade', mn: 'Түүний агуулга' }), num: true, render: (r) => num(r.prevValue) },
        { label: tr({ en: 'Carry-over', mn: 'Шилжин бохирдол' }), render: (r) => (r.carryOver ? html`<${Pill} kind="brass">${tr({ en: 'possible', mn: 'болзошгүй' })}<//>` : '') },
      ]}
    />
  </div>`;
}

// ------------------------------------------------------------ duplicates tab

const TYPE_COLOR = { FDUP: 'var(--accent)', CDUP: 'var(--brass)', PDUP: 'var(--info)' };
const TYPE_NAME = {
  FDUP: { en: 'Field duplicate', mn: 'Хээрийн давхар' },
  CDUP: { en: 'Coarse reject duplicate', mn: 'Бутлагдсан давхар' },
  PDUP: { en: 'Pulp duplicate', mn: 'Нунтаг давхар' },
};

function DupsTab({ el, batch, q, rev }) {
  const [type, setType] = usePref('qaqc.dupType', 'ALL');
  const [log, setLog] = usePref('qaqc.dupLog', true);
  const u = unitOf(el);
  const data = useMemo(() => {
    const all = QC.duplicatePairs(el, { batch });
    const types = QC.DUP_TYPES.filter((t) => all.some((p) => p.type === t));
    const sel = type !== 'ALL' && types.includes(type) ? type : 'ALL';
    const pairs = sel === 'ALL' ? all : all.filter((p) => p.type === sel);
    const summary = QC.duplicateSummary(el, { batch });
    const issues = QC.duplicateIssues(el, { batch });
    const lor = QC.elementLOR(el).lor;
    if (!pairs.length) return { all, types, sel, pairs, summary, issues };
    const vals = pairs.flatMap((p) => [p.a, p.b]);
    const pos = vals.filter((v) => v > 0);
    const dmin = log ? Math.min(...(pos.length ? pos : [lor])) / 1.3 : 0;
    const dmax = Math.max(...vals, lor * 10) * (log ? 1.3 : 1.05);
    const limitOn = sel === 'ALL' ? null : q.dupHard[sel];
    const refs = [{ kind: 'ratio', k: 1, cls: 'one', label: '1:1' }];
    for (const h of [10, 20, 30]) {
      const k = (1 + h / 100) / (1 - h / 100);
      const on = h === limitOn;
      refs.push({ kind: 'ratio', k, cls: 'env' + (on ? ' on' : ''), label: on ? `HARD ${h}%` : null });
      refs.push({ kind: 'ratio', k: 1 / k, cls: 'env' + (on ? ' on' : '') });
    }
    const scatter = {
      title: tr({ en: `Duplicates — ${elementLabel(el)}, original vs duplicate`, mn: `Давхар дээж — ${elementLabel(el)}, эх ба давхар` }),
      desc: tr({
        en: `${pairs.length} pairs. Solid line 1:1; dashed lines HARD 10, 20 and 30 %. Shaded corner: both values below 10 × LOR (excluded from statistics).`,
        mn: `${pairs.length} хос. Бүтэн шугам 1:1; тасархай шугам HARD 10, 20, 30 %. Сүүдэртэй булан: хоёулаа 10 × LOR-оос бага (статистикт ороогүй).`,
      }),
      square: true,
      grid: 'xy',
      rightPad: 16,
      x: { min: dmin, max: dmax, log, nice: !log, label: `${tr({ en: 'Original', mn: 'Эх дээж' })} (${u})` },
      y: { min: dmin, max: dmax, log, nice: !log, label: `${tr({ en: 'Duplicate', mn: 'Давхар дээж' })} (${u})` },
      points: pairs.map((p) => ({ x: log ? Math.max(p.a, dmin) : p.a, y: log ? Math.max(p.b, dmin) : p.b, status: p.lowGrade ? 'low' : p.status, row: p })),
      refs,
      shade: [{ x0: dmin, x1: 10 * lor, y0: dmin, y1: 10 * lor }],
    };
    const series = [];
    const rpoints = [];
    let maxH = 0;
    const shownTypes = sel === 'ALL' ? types : [sel];
    for (const t of shownTypes) {
      const used = pairs.filter((p) => p.type === t && !p.lowGrade).sort((a, b) => a.hard - b.hard);
      const pts = used.map((p, i) => ({ x: ((i + 0.5) / used.length) * 100, y: p.hard, row: p }));
      pts.forEach((pt) => {
        maxH = Math.max(maxH, pt.y);
        rpoints.push({ ...pt, color: TYPE_COLOR[t], size: 2.6 });
      });
      series.push({ pts, color: TYPE_COLOR[t], label: shownTypes.length > 1 ? t : null });
    }
    const rrefs = [{ kind: 'v', x: q.dupPassRate, cls: 'target', label: `P${q.dupPassRate}` }];
    for (const t of shownTypes) rrefs.push({ kind: 'h', y: q.dupHard[t], cls: shownTypes.length > 1 ? 'thr' : 'fail', label: shownTypes.length > 1 ? `${t} ${q.dupHard[t]}%` : `HARD ${q.dupHard[t]}%`, prio: 4 });
    const ranked = {
      title: tr({ en: `Ranked HARD — ${elementLabel(el)}`, mn: `Эрэмбэлсэн HARD — ${elementLabel(el)}` }),
      desc: tr({
        en: `Half absolute relative difference of each pair, sorted. The curve should stay below the limit line up to the P${q.dupPassRate} line.`,
        mn: `Хос бүрийн хагас харьцангуй зөрүү, эрэмбэлсэн. Муруй P${q.dupPassRate} шугам хүртэл хязгаарын шугамаас доош байх ёстой.`,
      }),
      square: true,
      grid: 'xy',
      x: { min: 0, max: 100, label: tr({ en: 'Percentile rank (%)', mn: 'Персентиль зэрэглэл (%)' }) },
      y: { min: 0, max: Math.min(100, Math.max(Math.max(...shownTypes.map((t) => q.dupHard[t])) * 1.6, maxH * 1.05)), label: 'HARD (%)' },
      points: rpoints,
      series,
      refs: rrefs,
    };
    return { all, types, sel, pairs, summary, issues, scatter, ranked, shownTypes };
  }, [rev, el, batch, type, log]);

  const tip = (d) => {
    const p = d.row;
    return html`<${Tip} value=${`${num(p.a)} → ${num(p.b)} ${u}`} head=${html`${p.type} · HARD ${fmt(p.hard, 1)}% · ${p.lowGrade ? tr(L.status.low) : statusText(p.status)}`}
      items=${[
        [tr({ en: 'Duplicate', mn: 'Давхар' }), p.dupId],
        [tr({ en: 'Original', mn: 'Эх дээж' }), p.parentId],
        [tr(L.hole), p.holeId],
        [tr(L.labJob), p.labJob],
        [tr({ en: 'Rel. diff.', mn: 'Харьц. зөрүү' }), `${signed(p.relDiff, 1)}%`],
      ]} />`;
  };
  const speak = (d) => `${d.row.type} ${d.row.dupId}: ${num(d.row.a)} / ${num(d.row.b)}, HARD ${fmt(d.row.hard, 1)}%`;

  if (!data.all.length)
    return html`<div class="stack"><${NoData} title=${tr({ en: `No duplicate pairs for ${elementLabel(el)}`, mn: `${elementLabel(el)}-ийн давхар дээжийн хос алга` })}>
      ${tr({ en: 'Log duplicates with sample type FDUP, CDUP or PDUP and the original sample id in "Parent (dup of)", then import the lab results.', mn: 'Давхар дээжийг FDUP, CDUP, PDUP төрлөөр, «Эх дээж» талбарт эх дээжийн дугаартай бүртгээд лабын үр дүнг импортлоно.' })}
    <//>${data.issues.length ? html`<${DupIssues} list=${data.issues} />` : null}</div>`;

  return html`<div class="stack">
    <div class="tbl-wrap qc-tbl-scroll"><table class="tbl">
      <thead><tr>
        <th>${tr({ en: 'Type', mn: 'Төрөл' })}</th><th class="num">${tr({ en: 'Pairs', mn: 'Хос' })}</th>
        <th class="num">${tr({ en: 'Near LOR', mn: 'LOR-т ойр' })}</th>
        <th class="num">${tr({ en: 'HARD limit', mn: 'HARD хязгаар' })}</th>
        <th class="num">${tr({ en: 'Pass rate', mn: 'Тэнцсэн хувь' })}</th><th></th>
        <th class="num" title="RMS CV% = √(mean((√2·|a−b|/(a+b))²))">${tr({ en: 'Precision (CV%)', mn: 'Нарийвчлал (CV%)' })}</th>
        <th class="num">${tr({ en: 'HARD median', mn: 'HARD медиан' })}</th>
        <th class="num">${`HARD P${q.dupPassRate}`}</th>
      </tr></thead>
      <tbody>${data.summary.map(
        (s) => html`<tr>
          <td><span class="qc-key" style=${`background:${TYPE_COLOR[s.type]}`}></span><b>${s.type}</b> <span class="muted qc-small">${tr(TYPE_NAME[s.type])}</span></td>
          <td class="num">${s.n}</td><td class="num">${s.nLow}</td>
          <td class="num">${s.limit}%</td>
          <td class="num">${pctTxt(s.passRate)}</td>
          <td><${StatusPill} s=${s.status}>${s.status === 'na' ? '—' : s.status === 'ok' ? `≥${s.target}%` : `<${s.target}%`}<//></td>
          <td class="num">${isNum(s.cv) ? `${fmt(s.cv, 1)}%` : '—'}</td>
          <td class="num">${isNum(s.hardMedian) ? `${fmt(s.hardMedian, 1)}%` : '—'}</td>
          <td class="num">${isNum(s.hardP90) ? `${fmt(s.hardP90, 1)}%` : '—'}</td>
        </tr>`,
      )}</tbody>
    </table></div>
    <${LimitsNote} q=${q}>${tr({ en: `HARD = |a − b| / (a + b) × 100. A pair passes within its type's limit; ≥${q.dupPassRate}% of pairs should pass. Pairs with both values below 10 × LOR are shown but not counted.`, mn: `HARD = |a − b| / (a + b) × 100. Хос төрлийнхөө хязгаарт багтвал тэнцэнэ; хосын ≥${q.dupPassRate}% тэнцэх ёстой. Хоёулаа 10 × LOR-оос бага хосыг харуулна, тооцохгүй.` })}<//>

    <div class="row between">
      <${Seg} label=${tr({ en: 'Duplicate type', mn: 'Давхар дээжийн төрөл' })} value=${data.sel} onChange=${setType}
        options=${[{ value: 'ALL', label: tr({ en: 'All types', mn: 'Бүх төрөл' }) }, ...data.types.map((t) => ({ value: t, label: t }))]} />
      <${Seg} label=${tr({ en: 'Scale', mn: 'Хуваарь' })} value=${log ? 'log' : 'lin'} onChange=${(v) => setLog(v === 'log')}
        options=${[{ value: 'lin', label: tr({ en: 'Linear', mn: 'Шугаман' }) }, { value: 'log', label: 'Log–log' }]} />
    </div>

    ${data.pairs.length
      ? html`<div class="grid2">
          <section class="card">
            <header><h3>${tr({ en: 'Original vs duplicate', mn: 'Эх ба давхар дээж' })}</h3>
              <${Legend} items=${[
                { status: 'pass', label: tr(L.status.pass) },
                { status: 'fail', label: tr(L.status.fail) },
                { status: 'low', label: tr({ en: 'Near LOR (not counted)', mn: 'LOR-т ойр (тооцоогүй)' }) },
                { line: 'one', label: '1:1' },
                { line: 'env', label: 'HARD 10/20/30%' },
              ]} /></header>
            <div class="body"><${Plot} spec=${data.scatter} tip=${tip} speak=${speak} /></div>
          </section>
          <section class="card">
            <header><h3>${tr({ en: 'Ranked HARD', mn: 'Эрэмбэлсэн HARD' })}</h3>
              <${Legend} items=${[
                ...data.shownTypes.map((t) => ({ line: 'x', color: TYPE_COLOR[t], label: t })),
                { line: data.shownTypes.length > 1 ? 'thr' : 'fail', label: tr({ en: 'Limit', mn: 'Хязгаар' }) },
                { line: 'target', label: `P${q.dupPassRate}` },
              ]} /></header>
            <div class="body"><${Plot} spec=${data.ranked} tip=${tip} speak=${speak} /></div>
          </section>
        </div>`
      : null}

    ${data.issues.length ? html`<${DupIssues} list=${data.issues} />` : null}

    <${ResultTable}
      list=${data.pairs}
      isIssue=${(p) => p.status === 'fail' && !p.lowGrade}
      cols=${[
        { label: tr({ en: 'Duplicate', mn: 'Давхар' }), render: (p) => html`<span class="mono">${p.dupId}</span>` },
        { label: tr({ en: 'Original', mn: 'Эх дээж' }), render: (p) => html`<span class="mono">${p.parentId}</span>` },
        { label: tr({ en: 'Type', mn: 'Төрөл' }), key: 'type' },
        { label: tr(L.hole), key: 'holeId' },
        { label: tr(L.labJob), key: 'labJob' },
        { label: tr({ en: 'Original', mn: 'Эх' }) + ` (${u})`, num: true, render: (p) => num(p.a) },
        { label: tr({ en: 'Duplicate', mn: 'Давхар' }) + ` (${u})`, num: true, render: (p) => num(p.b) },
        { label: 'HARD %', num: true, render: (p) => fmt(p.hard, 1) },
        { label: tr({ en: 'Limit', mn: 'Хязгаар' }), num: true, render: (p) => `${p.limit}%` },
        { label: tr({ en: 'Status', mn: 'Төлөв' }), render: (p) => html`<${StatusPill} s=${p.lowGrade ? 'low' : p.status} />` },
      ]}
    />
  </div>`;
}

function DupIssues({ list }) {
  const why = {
    noParent: tr({ en: 'no parent sample id', mn: 'эх дээжийн дугаар алга' }),
    parentMissing: tr({ en: 'parent sample not found', mn: 'эх дээж олдсонгүй' }),
    parentNoAssay: tr({ en: 'parent not assayed for this element', mn: 'эх дээж энэ элементээр шинжлэгдээгүй' }),
  };
  return html`<div class="card qc-callout warn"><${Icon} name="alert" />
    <div><b>${tr({ en: `${list.length} duplicate(s) could not be paired`, mn: `${list.length} давхар дээжийг хослуулж чадсангүй` })}</b>
      <ul class="qc-plain">${list.slice(0, 12).map((i) => html`<li><span class="mono">${i.dupId}</span> (${i.type}${i.parentId ? ` → ${i.parentId}` : ''}) · ${why[i.problem]}</li>`)}
      ${list.length > 12 ? html`<li class="muted">+${list.length - 12}</li>` : null}</ul></div>
  </div>`;
}

// ---------------------------------------------------------- insertion tab

function CatCell({ c }) {
  return html`<span class="qc-counts"><span class="num">${c.count}</span><${StatusPill} s=${c.status}>${c.count ? oneIn(c.oneIn) : tr({ en: 'none', mn: 'алга' })}<//></span>`;
}

function InsertionTab({ batch, q, rev, by, setBy }) {
  const ins = useMemo(() => QC.insertionRates({ batch }), [rev, batch]);
  const list = by === 'hole' ? ins.holes : ins.dispatches;
  if (!ins.total.total)
    return html`<${NoData} title=${tr({ en: 'No samples yet', mn: 'Дээж алга байна' })}>
      ${tr({ en: 'Import or log samples with their sample type to see how many standards, blanks and duplicates were inserted.', mn: 'Хэдэн стандарт, blank, давхар дээж оруулсныг харахын тулд дээжийг төрөлтэй нь импортлох эсвэл бүртгэнэ үү.' })}
    <//>`;
  const row = (g, total) => html`<tr class=${total ? 'qc-total' : ''}>
    <td>${total ? html`<b>${tr({ en: 'Total', mn: 'Нийт' })}</b>` : html`<b class="mono">${g.key || '—'}</b>`}</td>
    ${by === 'dispatch' ? html`<td>${total ? '' : g.lab || ''}${!total && g.labJob ? html`<div class="muted qc-small">${g.labJob}</div>` : null}</td>` : null}
    ${by === 'dispatch' ? html`<td class="num">${g.holes.length}</td>` : null}
    <td class="num">${fmt(g.meters, 1)}</td>
    <td class="num">${g.primaries}</td>
    <td><${CatCell} c=${g.crm} /></td>
    <td><${CatCell} c=${g.blank} /></td>
    <td><${CatCell} c=${g.dup} />${g.dups ? html`<div class="muted qc-small">${['fdup', 'cdup', 'pdup'].filter((k) => g[k]).map((k) => `${k.toUpperCase()} ${g[k]}`).join(' · ')}</div>` : null}</td>
    <td class="num">${pctTxt(g.qcPct)}</td>
    <td><${StatusPill} s=${g.status} /></td>
  </tr>`;
  return html`<div class="stack">
    <div class="row between">
      <${Seg} label=${tr({ en: 'Group by', mn: 'Бүлэглэх' })} value=${by} onChange=${setBy}
        options=${[{ value: 'hole', label: tr({ en: 'By hole', mn: 'Цооногоор' }) }, { value: 'dispatch', label: tr({ en: 'By dispatch', mn: 'Илгээлтээр' }) }]} />
      <${LimitsNote} q=${q}>${tr({ en: `Targets: CRM 1 in ${q.crmEvery}, blank 1 in ${q.blankEvery}, duplicate 1 in ${q.dupEvery} primaries.`, mn: `Зорилт: ${q.crmEvery} үндсэн дээж тутамд 1 CRM, ${q.blankEvery}-д 1 blank, ${q.dupEvery}-д 1 давхар.` })}<//>
    </div>
    <div class="tbl-wrap qc-tbl-scroll"><table class="tbl">
      <thead><tr>
        <th>${by === 'hole' ? tr(L.hole) : tr({ en: 'Dispatch', mn: 'Илгээлт' })}</th>
        ${by === 'dispatch' ? html`<th>${tr({ en: 'Lab', mn: 'Лаб' })}</th><th class="num">${tr({ en: 'Holes', mn: 'Цооног' })}</th>` : null}
        <th class="num">${tr({ en: 'Metres', mn: 'Метр' })}</th>
        <th class="num">${tr({ en: 'Primaries', mn: 'Үндсэн' })}</th>
        <th>CRM</th><th>Blank</th><th>${tr({ en: 'Duplicates', mn: 'Давхар' })}</th>
        <th class="num">QC %</th><th>${tr({ en: 'Status', mn: 'Төлөв' })}</th>
      </tr></thead>
      <tbody>${list.map((g) => row(g, false))}</tbody>
      <tfoot>${row(ins.total, true)}</tfoot>
    </table></div>
  </div>`;
}

// ------------------------------------------------------------ library tab

const normKey = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/g\/t/g, 'gpt')
    .replace(/%/g, 'pct')
    .replace(/[^a-z0-9]/g, '');

/** Map a typed/pasted element ("Au ppm", "Au (g/t)", "Cu %", "Au") to a known element key. */
function matchElement(raw, keys) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (keys.includes(s)) return s;
  const n = normKey(s);
  const hit = keys.find((k) => normKey(k) === n || normKey(elementLabel(k)) === n);
  if (hit) return hit;
  const same = keys.filter((k) => splitElementKey(k).el.toLowerCase() === s.toLowerCase());
  return same.length === 1 ? same[0] : s;
}

const truthy = (v) => /^(y|yes|true|1|x|blank|тийм)$/i.test(String(v ?? '').trim());

function parsePaste(text, keys, existing) {
  const out = [];
  const errors = [];
  if (!text.trim()) return { out, errors };
  const lines = parseCSV(text, text.includes('\t') ? '\t' : undefined);
  lines.forEach((cells, i) => {
    const c = cells.map((x) => String(x ?? '').trim());
    if (c.every((x) => !x)) return;
    if (i === 0 && toNum(c[2]) === null && !/^\d/.test(c[2] || '')) return; // header row
    const code = c[0];
    const element = matchElement(c[1], keys);
    const expected = toNum(c[2]);
    const sd = toNum(c[3]);
    const isBlank = truthy(c[5]);
    if (!code || !element || expected === null || (!(sd > 0) && !isBlank)) {
      errors.push({ line: i + 1, text: c.join(' | ') });
      return;
    }
    const cur = existing.find((d) => QC.normCode(d.code) === QC.normCode(code) && String(d.element).toLowerCase() === element.toLowerCase());
    out.push({ id: cur?.id, code, element, expected, sd, supplier: c[4] || cur?.supplier || null, isBlank: isBlank || !!cur?.isBlank, update: !!cur });
  });
  return { out, errors };
}

function EditCell({ value, type = 'text', label, list, onCommit }) {
  const show = (v) => (v === null || v === undefined ? '' : String(v));
  const [v, setV] = useState(show(value));
  useEffect(() => setV(show(value)), [value]);
  const commit = () => {
    const nv = type === 'num' ? toNum(v) : v.trim();
    const cur = type === 'num' ? toNum(value) : show(value).trim();
    if (nv === cur || (nv === '' && cur === '')) return;
    if (onCommit(nv === '' ? null : nv) === false) setV(show(value));
  };
  return html`<input class=${'inp qc-cell' + (type === 'num' ? ' num' : '')} aria-label=${label} value=${v} list=${list}
    inputmode=${type === 'num' ? 'decimal' : undefined}
    onInput=${(e) => setV(e.target.value)} onBlur=${commit}
    onKeyDown=${(e) => {
      if (e.key === 'Enter') e.target.blur();
      else if (e.key === 'Escape') {
        setV(show(value));
        setTimeout(() => e.target.blur());
      }
    }} />`;
}

function LibraryTab({ el, rev }) {
  const defs = rows('crms');
  const keys = elementKeys('assays');
  const undef = useMemo(() => (el ? QC.crmUndefined(el) : []), [rev, el]);
  const used = useMemo(() => {
    const m = new Map();
    for (const s of rows('samples')) if (s.crm) m.set(QC.normCode(s.crm), (m.get(QC.normCode(s.crm)) || 0) + 1);
    return m;
  }, [rev]);
  const blankForm = () => ({ code: '', element: el || keys[0] || '', expected: '', sd: '', supplier: '', isBlank: false });
  const [form, setForm] = useState(blankForm);
  const [paste, setPaste] = useState('');
  const parsed = useMemo(() => parsePaste(paste, keys, defs), [paste, rev]);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const saveField = (row, key, val) => {
    if ((key === 'code' || key === 'element') && !val) {
      toast(tr({ en: 'Code and element are required', mn: 'Код, элемент заавал байна' }), { kind: 'warn' });
      return false;
    }
    if (key === 'expected' && val === null) {
      toast(tr({ en: 'Enter a number', mn: 'Тоо оруулна уу' }), { kind: 'warn' });
      return false;
    }
    if (key === 'sd' && !(val > 0) && !row.isBlank) {
      toast(tr({ en: '1 SD must be greater than 0', mn: '1 SD 0-оос их байх ёстой' }), { kind: 'warn' });
      return false;
    }
    const v = key === 'element' ? matchElement(val, keys) : val;
    mutate([{ type: 'upsert', table: 'crms', row: { id: row.id, [key]: v } }], { label: `Edit standard ${row.code}` });
    return true;
  };

  const del = async (row) => {
    const ok = await confirmDialog({
      title: tr({ en: 'Delete standard?', mn: 'Стандартыг устгах уу?' }),
      body: tr({ en: `${row.code} · ${row.element} will be removed from the library. Samples keep their standard code.`, mn: `${row.code} · ${row.element} сангаас хасагдана. Дээжүүд стандартын кодоо хадгална.` }),
      ok: tr({ en: 'Delete', mn: 'Устгах' }),
      danger: true,
    });
    if (!ok) return;
    const res = mutate([{ type: 'delete', table: 'crms', id: row.id }], { label: `Delete standard ${row.code} ${row.element}` });
    toast(tr({ en: 'Standard deleted', mn: 'Стандарт устгагдлаа' }), { action: { label: tr({ en: 'Undo', mn: 'Буцаах' }), run: () => undoBatch(res.batch) } });
  };

  const add = () => {
    const code = form.code.trim();
    const element = matchElement(form.element, keys);
    const expected = toNum(form.expected);
    const sd = toNum(form.sd);
    if (!code || !element || (expected === null && !form.isBlank) || (!(sd > 0) && !form.isBlank)) {
      toast(tr({ en: 'Enter code, element, certified value and a 1 SD above 0', mn: 'Код, элемент, гэрчилгээт утга, 0-оос их 1 SD оруулна уу' }), { kind: 'warn' });
      return;
    }
    const cur = defs.find((d) => QC.normCode(d.code) === QC.normCode(code) && String(d.element).toLowerCase() === element.toLowerCase());
    mutate([{ type: 'upsert', table: 'crms', row: { id: cur?.id, code, element, expected, sd, supplier: form.supplier.trim() || null, isBlank: !!form.isBlank } }], { label: `${cur ? 'Update' : 'Add'} standard ${code}` });
    toast(cur ? tr({ en: `${code} · ${element} updated`, mn: `${code} · ${element} шинэчлэгдлээ` }) : tr({ en: `${code} · ${element} added`, mn: `${code} · ${element} нэмэгдлээ` }));
    setForm({ ...blankForm(), element, supplier: form.supplier });
  };

  const importPaste = () => {
    const ops = parsed.out.map(({ update, ...row }) => ({ type: 'upsert', table: 'crms', row }));
    if (!ops.length) return;
    const res = mutate(ops, { label: `Paste ${ops.length} standards` });
    toast(tr({ en: `${res.created} added, ${res.updated} updated`, mn: `${res.created} нэмэгдэж, ${res.updated} шинэчлэгдлээ` }), { action: { label: tr({ en: 'Undo', mn: 'Буцаах' }), run: () => undoBatch(res.batch) } });
    setPaste('');
  };

  const suggest = undef.filter((u) => u.reason === 'missing' && u.crm);
  return html`<div class="stack">
    <datalist id="qc-el-list">${keys.map((k) => html`<option value=${k}>${elementLabel(k)}</option>`)}</datalist>
    <datalist id="qc-code-list">${suggest.map((u) => html`<option value=${u.crm} />`)}</datalist>

    ${suggest.length
      ? html`<div class="card qc-callout warn"><${Icon} name="alert" />
          <div><b>${tr({ en: `Standards used in samples without a ${elementLabel(el)} value`, mn: `Дээжид хэрэглэгдсэн боловч ${elementLabel(el)}-ийн утгагүй стандарт` })}</b>
            <div class="chip-list" style="margin-top:6px">${suggest.map(
              (u) => html`<button class="btn sm" onClick=${() => setForm({ ...form, code: u.crm, element: el })}><${Icon} name="plus" size=${14} /> ${u.crm} <span class="muted">(${u.n})</span></button>`,
            )}</div></div>
        </div>`
      : null}

    <section class="card">
      <header><h2>${tr({ en: 'Standards & blanks', mn: 'Стандарт, blank' })} <span class="muted qc-small">(${defs.length})</span></h2>
        <p class="muted qc-small">${tr({ en: 'One row per standard and element. Edits save when you leave the cell and can be undone from History.', mn: 'Стандарт, элемент тус бүр нэг мөр. Нүднээс гарахад хадгалагдах бөгөөд «Түүх»-ээс буцааж болно.' })}</p></header>
      <div class="qc-tbl-scroll"><table class="tbl qc-lib">
        <thead><tr>
          <th>${tr({ en: 'Code', mn: 'Код' })}</th><th>${tr({ en: 'Element key', mn: 'Элемент' })}</th>
          <th class="num">${tr({ en: 'Certified value', mn: 'Гэрчилгээт утга' })}</th><th class="num">1 SD</th>
          <th>${tr({ en: 'Supplier', mn: 'Нийлүүлэгч' })}</th><th>Blank</th>
          <th class="num">${tr({ en: 'Samples', mn: 'Дээж' })}</th><th><span class="qc-sr">${tr({ en: 'Delete', mn: 'Устгах' })}</span></th>
        </tr></thead>
        <tbody>
          ${defs.map(
            (d) => html`<tr key=${d.id}>
              <td><${EditCell} label=${tr({ en: 'Code', mn: 'Код' })} value=${d.code} onCommit=${(v) => saveField(d, 'code', v)} /></td>
              <td><${EditCell} label=${tr({ en: 'Element key', mn: 'Элемент' })} value=${d.element} list="qc-el-list" onCommit=${(v) => saveField(d, 'element', v)} /></td>
              <td><${EditCell} type="num" label=${tr({ en: 'Certified value', mn: 'Гэрчилгээт утга' })} value=${d.expected} onCommit=${(v) => saveField(d, 'expected', v)} /></td>
              <td><${EditCell} type="num" label="1 SD" value=${d.sd} onCommit=${(v) => saveField(d, 'sd', v)} /></td>
              <td><${EditCell} label=${tr({ en: 'Supplier', mn: 'Нийлүүлэгч' })} value=${d.supplier} onCommit=${(v) => saveField(d, 'supplier', v)} /></td>
              <td><input type="checkbox" aria-label="Blank" checked=${!!d.isBlank} onChange=${(e) => mutate([{ type: 'upsert', table: 'crms', row: { id: d.id, isBlank: e.target.checked } }], { label: `Edit standard ${d.code}` })} /></td>
              <td class="num">${used.get(QC.normCode(d.code)) || 0}</td>
              <td><${IconButton} icon="trash" title=${tr({ en: `Delete ${d.code} · ${d.element}`, mn: `${d.code} · ${d.element} устгах` })} onClick=${() => del(d)} /></td>
            </tr>`,
          )}
          <tr class="qc-add">
            <td><input class="inp qc-cell" list="qc-code-list" placeholder="OREAS 504c" aria-label=${tr({ en: 'New code', mn: 'Шинэ код' })} value=${form.code} onInput=${set('code')} /></td>
            <td><input class="inp qc-cell" list="qc-el-list" placeholder="Au_ppm" aria-label=${tr({ en: 'Element key', mn: 'Элемент' })} value=${form.element} onInput=${set('element')} /></td>
            <td><input class="inp qc-cell num" inputmode="decimal" placeholder="1.46" aria-label=${tr({ en: 'Certified value', mn: 'Гэрчилгээт утга' })} value=${form.expected} onInput=${set('expected')} /></td>
            <td><input class="inp qc-cell num" inputmode="decimal" placeholder="0.05" aria-label="1 SD" value=${form.sd} onInput=${set('sd')} /></td>
            <td><input class="inp qc-cell" placeholder="OREAS" aria-label=${tr({ en: 'Supplier', mn: 'Нийлүүлэгч' })} value=${form.supplier} onInput=${set('supplier')} /></td>
            <td><input type="checkbox" aria-label="Blank" checked=${form.isBlank} onChange=${set('isBlank')} /></td>
            <td colspan="2"><${Button} kind="primary" size="sm" icon="plus" onClick=${add}>${tr({ en: 'Add', mn: 'Нэмэх' })}<//></td>
          </tr>
        </tbody>
      </table></div>
      ${!defs.length ? html`<p class="muted" style="padding:10px 14px">${tr({ en: 'No standards yet — add one above or paste them from Excel below.', mn: 'Стандарт алга — дээр нэмэх эсвэл доор Excel-ээс буулгана уу.' })}</p>` : null}
    </section>

    <section class="card qc-paste">
      <header><h3>${tr({ en: 'Paste from Excel', mn: 'Excel-ээс буулгах' })}</h3></header>
      <div class="body stack">
        <p class="muted qc-small">${tr({
          en: 'Copy columns in this order: code, element, certified value, 1 SD — optionally supplier and blank (yes/no). A header row is skipped. Existing code + element pairs are updated.',
          mn: 'Баганын дараалал: код, элемент, гэрчилгээт утга, 1 SD — нэмэлтээр нийлүүлэгч, blank (тийм/үгүй). Толгой мөрийг алгасна. Байгаа код + элементийн хосыг шинэчилнэ.',
        })}</p>
        <textarea class="inp" aria-label=${tr({ en: 'Paste standards', mn: 'Стандарт буулгах' })} placeholder=${'OREAS 504c\tAu_ppm\t1.48\t0.045\tOREAS\nOREAS 504c\tCu_pct\t1.11\t0.029\tOREAS'} value=${paste} onInput=${(e) => setPaste(e.target.value)}></textarea>
        ${parsed.out.length || parsed.errors.length
          ? html`<div class="stack" style="gap:8px">
              ${parsed.out.length
                ? html`<div class="tbl-wrap qc-tbl-scroll" style="max-height:240px"><table class="tbl">
                    <thead><tr><th>${tr({ en: 'Code', mn: 'Код' })}</th><th>${tr({ en: 'Element', mn: 'Элемент' })}</th><th class="num">${tr({ en: 'Value', mn: 'Утга' })}</th><th class="num">1 SD</th><th>${tr({ en: 'Supplier', mn: 'Нийлүүлэгч' })}</th><th></th></tr></thead>
                    <tbody>${parsed.out.map(
                      (r) => html`<tr><td>${r.code}</td><td>${r.element}${keys.includes(r.element) ? '' : html` <${Pill} kind="warn">${tr({ en: 'new key', mn: 'шинэ түлхүүр' })}<//>`}</td><td class="num">${r.expected}</td><td class="num">${r.sd ?? ''}</td><td>${r.supplier || ''}</td>
                        <td>${r.update ? html`<${Pill} kind="info">${tr({ en: 'update', mn: 'шинэчлэх' })}<//>` : html`<${Pill} kind="ok">${tr({ en: 'new', mn: 'шинэ' })}<//>`}</td></tr>`,
                    )}</tbody></table></div>`
                : null}
              ${parsed.errors.length
                ? html`<div class="qc-small" style="color:var(--err)">${tr({ en: 'Lines skipped (need code, element, value and 1 SD > 0):', mn: 'Алгассан мөр (код, элемент, утга, 0-оос их 1 SD шаардлагатай):' })}
                    ${parsed.errors.slice(0, 8).map((e) => html`<div class="mono">#${e.line}: ${e.text}</div>`)}</div>`
                : null}
              <div class="row">
                <${Button} kind="primary" icon="plus" disabled=${!parsed.out.length} onClick=${importPaste}>${tr({ en: `Save ${parsed.out.length} standard rows`, mn: `${parsed.out.length} мөр хадгалах` })}<//>
                <${Button} onClick=${() => setPaste('')}>${tr({ en: 'Clear', mn: 'Цэвэрлэх' })}<//>
              </div>
            </div>`
          : null}
      </div>
    </section>
  </div>`;
}

// ------------------------------------------------------------------ export

function exportTab(tab, el, batch, q, insBy) {
  let list = [];
  let cols = [];
  const lang = (r) => reasonText(r, q);
  if (tab === 'overview') {
    list = QC.batchStatus(el, { batch });
    cols = [
      { key: 'key', header: 'Batch' },
      { key: 'labJob', header: 'Lab job' },
      { key: 'lab', header: 'Lab' },
      { header: 'Dispatches', get: (b) => b.dispatchIds.join(' ') },
      { header: 'Certificates', get: (b) => b.certificates.join(' ') },
      { key: 'date', header: 'Reported' },
      { key: 'nSamples', header: 'Samples' },
      { key: 'nPrim', header: 'Primaries' },
      { key: 'nCrm', header: 'CRMs' },
      { header: 'CRM warn', get: (b) => b.crm.warn },
      { header: 'CRM fail', get: (b) => b.crm.fail },
      { key: 'nBlk', header: 'Blanks' },
      { header: 'Blank fail', get: (b) => b.blank.fail },
      { key: 'nDup', header: 'Duplicates' },
      { header: 'Dup fail', get: (b) => b.dup.fail },
      { key: 'status', header: 'Decision' },
      { header: 'Reasons', get: (b) => b.reasons.map(lang).join('; ') },
    ];
  } else if (tab === 'crm') {
    list = QC.crmResults(el, { batch });
    cols = ['seq', 'sampleId', 'holeId', 'crm', 'element', 'value', 'expected', 'sd', { header: 'z', get: (r) => Number(r.z.toFixed(3)) }, 'status', 'rule', 'labJob', 'certificate', 'date', 'dispatchId'];
  } else if (tab === 'blanks') {
    list = QC.blankResults(el, { batch });
    cols = ['seq', 'sampleId', 'holeId', 'crm', 'element', 'value', 'flag', 'lor', 'threshold', 'status', 'prevId', 'prevValue', 'carryOver', 'labJob', 'date', 'dispatchId'];
  } else if (tab === 'dups') {
    list = QC.duplicatePairs(el, { batch });
    cols = ['dupId', 'parentId', 'type', 'holeId', 'element', { key: 'a', header: 'original' }, { key: 'b', header: 'duplicate' }, { header: 'hard', get: (p) => Number(p.hard.toFixed(3)) }, { header: 'relDiff', get: (p) => Number(p.relDiff.toFixed(3)) }, 'limit', 'status', 'lowGrade', 'labJob', 'date'];
  } else if (tab === 'insertion') {
    const ins = QC.insertionRates({ batch });
    list = [...(insBy === 'dispatch' ? ins.dispatches : ins.holes), { ...ins.total, key: 'TOTAL' }];
    cols = [
      { key: 'key', header: insBy === 'dispatch' ? 'Dispatch' : 'Hole' },
      { key: 'meters', header: 'Metres', get: (g) => Number(g.meters.toFixed(2)) },
      'primaries',
      'crms',
      { header: 'CRM 1 in', get: (g) => (g.crm.oneIn ? Number(g.crm.oneIn.toFixed(1)) : '') },
      { header: 'CRM status', get: (g) => g.crm.status },
      'blanks',
      { header: 'Blank 1 in', get: (g) => (g.blank.oneIn ? Number(g.blank.oneIn.toFixed(1)) : '') },
      { header: 'Blank status', get: (g) => g.blank.status },
      'fdup',
      'cdup',
      'pdup',
      { header: 'Dup 1 in', get: (g) => (g.dup.oneIn ? Number(g.dup.oneIn.toFixed(1)) : '') },
      { header: 'Dup status', get: (g) => g.dup.status },
      'status',
    ];
  } else {
    list = rows('crms');
    cols = ['code', 'element', 'expected', 'sd', 'supplier', 'isBlank'];
  }
  if (!list.length) {
    toast(tr({ en: 'Nothing to export', mn: 'Татах зүйл алга' }), { kind: 'warn' });
    return;
  }
  const name = `QAQC_${tab === 'library' ? 'standards' : tab}${tab === 'library' || tab === 'insertion' ? '' : '_' + el}${batch ? '_' + batch : ''}_${todayISO()}.csv`.replace(/[^\w.-]+/g, '_');
  saveFile(name, toCSV(list, cols), 'text/csv');
}

// -------------------------------------------------------------------- view

const TAB_KEYS = ['overview', 'crm', 'blanks', 'dups', 'insertion', 'library'];

export function QAQCView({ params = {} } = {}) {
  injectCSS('qaqc', CSS);
  const rev = useStore();
  const st = settings();
  const q = QC.qcSettings();
  const keys = elementKeys('assays');
  const [elPref, setEl] = usePref('qaqc.element', '');
  const [tabPref, setTab] = usePref('qaqc.tab', 'overview');
  const [batch, setBatch] = useState(null);
  const [insBy, setInsBy] = usePref('qaqc.insBy', 'hole');

  // deep links: #/qaqc?tab=crm&el=Au_ppm&batch=UB26001
  useEffect(() => {
    const qs = new URLSearchParams(location.hash.split('?')[1] || '');
    const t = params.tab || qs.get('tab');
    const e = params.element || qs.get('el') || qs.get('element');
    const b = params.batch || qs.get('batch');
    if (t && TAB_KEYS.includes(t)) setTab(t);
    if (e) setEl(e);
    if (b) setBatch(b);
  }, []);

  const el = keys.includes(elPref) ? elPref : keys.includes(st.intercepts?.element) ? st.intercepts.element : keys[0] || '';
  const tab = TAB_KEYS.includes(tabPref) ? tabPref : 'overview';

  const badges = useMemo(() => {
    if (!el) return {};
    const s = QC.qcSummary(el, { batch });
    return { crm: s.crm.fail, blanks: s.blank.fail, dups: s.dup.fail, library: s.undefinedCrms.length };
  }, [rev, el, batch]);

  const tabs = TAB_KEYS.map((k) => ({
    key: k,
    label: tr(L.tabs[k]),
    badge: badges[k] || null,
    badgeKind: k === 'library' ? 'warn' : k === 'dups' ? 'warn' : 'err',
  }));

  const goTab = (k) => setTab(k);
  const needsEl = tab !== 'insertion' && tab !== 'library';

  let body;
  if (needsEl && !el)
    body = html`<${NoData} title=${tr({ en: 'No assays yet', mn: 'Шинжилгээний үр дүн алга' })} onLibrary=${() => goTab('library')}>
      ${tr({
        en: 'QA/QC needs lab results. Import the lab certificates (CSV or Excel), log your QC samples with their sample type, and define the certified values of your standards.',
        mn: 'QA/QC-д лабын үр дүн хэрэгтэй. Лабын сертификатыг (CSV эсвэл Excel) импортлож, QC дээжийг төрөлтэй нь бүртгээд, стандартынхаа гэрчилгээт утгыг оруулна уу.',
      })}
    <//>`;
  else if (tab === 'overview') body = html`<${Overview} el=${el} batch=${batch} setBatch=${setBatch} q=${q} rev=${rev} goTab=${goTab} />`;
  else if (tab === 'crm') body = html`<${CrmTab} el=${el} batch=${batch} q=${q} rev=${rev} goTab=${goTab} />`;
  else if (tab === 'blanks') body = html`<${BlanksTab} el=${el} batch=${batch} q=${q} rev=${rev} />`;
  else if (tab === 'dups') body = html`<${DupsTab} el=${el} batch=${batch} q=${q} rev=${rev} />`;
  else if (tab === 'insertion') body = html`<${InsertionTab} batch=${batch} q=${q} rev=${rev} by=${insBy} setBy=${setInsBy} />`;
  else body = html`<${LibraryTab} el=${el} rev=${rev} />`;

  return html`<div class="qc-page">
    <${PageHead} title=${tr(L.title)} sub=${tr(L.sub)}>
      <label class="qc-el">
        <span>${tr(L.element)}</span>
        <${Select} value=${el} onChange=${setEl} options=${keys.map((k) => ({ value: k, label: elementLabel(k) }))} placeholder=${keys.length ? undefined : '—'} />
      </label>
      <${Button} icon="download" onClick=${() => exportTab(tab, el, batch, q, insBy)} disabled=${needsEl && !el}>${tr(L.exportCsv)}<//>
    <//>
    <${Tabs} tabs=${tabs} active=${tab} onChange=${setTab} />
    ${batch !== null && tab !== 'library'
      ? html`<div class="qc-filterbar"><span class="qc-filter">${tr(L.batch)}: <b class="mono">${batch || '—'}</b>
          <button type="button" onClick=${() => setBatch(null)} aria-label=${tr(L.clearBatch)} title=${tr(L.clearBatch)}><${Icon} name="x" size=${14} /></button></span></div>`
      : null}
    <div class="qc-body">${body}</div>
  </div>`;
}

// --------------------------------------------------------------------- CSS

const CSS = `
.qc-page .page-actions { align-items: flex-end; }
.qc-el { display: flex; flex-direction: column; gap: 3px; font-size: 12px; color: var(--muted); font-weight: 550; }
.qc-el select { min-width: 140px; }
.qc-body { margin-top: 14px; }
.qc-filterbar { margin-top: 10px; }
.qc-filter { display: inline-flex; align-items: center; gap: 6px; background: var(--accent-soft); color: var(--accent-2); border-radius: 999px; padding: 3px 4px 3px 12px; font-size: 12.5px; font-weight: 600; }
.qc-filter button { border: 0; background: none; color: inherit; cursor: pointer; display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; }
.qc-filter button:hover { background: var(--surface); }
.qc-small { font-size: 12px; }
.qc-nowrap { white-space: nowrap; }
.qc-note { font-size: 12.5px; }
.qc-note a { margin-left: 4px; }
.qc-link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: 12px; }
.qc-tbl-scroll { overflow-x: auto; }
.qc-tbl-scroll.tbl-wrap { max-height: 520px; }
.qc-charts { display: grid; gap: 14px; }
.qc-charts .card > header { align-items: flex-start; }
.card > header .row { gap: 6px 12px; }
.qc-batches td { vertical-align: middle; }
.qc-batches td.qc-reason-cell { min-width: 260px; max-width: 460px; }
.tbl tr.sel td { background: var(--accent-soft); }
.tbl tr.click:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.tbl tfoot td { border-top: 1px solid var(--line-2); background: var(--surface-2); }
.qc-counts { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.qc-reasons { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 3px; font-size: 12.5px; }
.qc-reasons li { display: flex; gap: 6px; align-items: flex-start; }
.qc-reasons .ico { margin-top: 2px; flex: none; }
.qc-reasons li.reject .ico { color: var(--err); }
.qc-reasons li.review .ico { color: var(--warn); }
.qc-reasons li.info .ico { color: var(--info); }
.qc-callout { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; font-size: 13px; }
.qc-callout > .ico { flex: none; margin-top: 1px; }
.qc-callout.warn { border-color: var(--warn); background: var(--warn-soft); }
.qc-callout.warn > .ico { color: var(--warn); }
.qc-callout > div { flex: 1; min-width: 0; }
.qc-plain { margin: 4px 0 0; padding-left: 18px; }
.qc-details > summary { cursor: pointer; font-weight: 600; padding: 4px 0; }
.qc-details[open] > summary { margin-bottom: 4px; }
.qc-key { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.qc-cell { width: 100%; min-width: 72px; padding: 4px 7px; }
.qc-cell.num { text-align: right; font-variant-numeric: tabular-nums; }
.qc-lib td { vertical-align: middle; padding: 4px 6px; }
.qc-lib tr.qc-add td { background: var(--surface-2); }
.qc-paste textarea { width: 100%; min-height: 120px; font-family: var(--mono); font-size: 12.5px; }
.qc-total td { font-weight: 600; }
.qc-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.qc-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--ink-2); align-items: center; }
.qc-legend > span { display: inline-flex; align-items: center; gap: 6px; }
.qc-legend svg { overflow: visible; }
.qc-shade-key { display: inline-block; width: 12px; height: 12px; border-radius: 2px; background: var(--surface-3); }

.qc-chart { position: relative; width: 100%; outline: none; }
.qc-chart:focus-visible { box-shadow: 0 0 0 2px var(--accent); border-radius: 6px; }
.qc-chart svg { display: block; overflow: visible; touch-action: pan-y; }
.qc-chart text { font: 11px var(--font); fill: var(--muted); font-variant-numeric: tabular-nums; }
.qc-chart text.ax-title { fill: var(--ink-2); font-weight: 550; }
.qc-chart text.ink { fill: var(--ink-2); font-weight: 600; }
.qc-grid { stroke: var(--line); stroke-width: 1; shape-rendering: crispEdges; }
.qc-axis { stroke: var(--line-2); stroke-width: 1; shape-rendering: crispEdges; }
.qc-ref { fill: none; stroke-width: 1.25; }
.qc-ref.exp, .qc-ref.one { stroke: var(--ink-2); stroke-width: 1.5; }
.qc-ref.warn { stroke: var(--warn); stroke-dasharray: 5 4; }
.qc-ref.fail { stroke: var(--err); stroke-width: 1.5; }
.qc-ref.lor { stroke: var(--muted); stroke-dasharray: 2 3; }
.qc-ref.env { stroke: var(--line-2); stroke-dasharray: 4 4; }
.qc-ref.env.on { stroke: var(--err); stroke-dasharray: 5 4; }
.qc-ref.thr { stroke: var(--muted); stroke-dasharray: 5 4; }
.qc-ref.target { stroke: var(--muted); stroke-dasharray: 2 3; }
.qc-ref.trend { stroke: var(--accent); stroke-width: 2; opacity: 0.75; }
.qc-shade { fill: var(--surface-3); opacity: 0.7; }
.qc-line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.qc-m { stroke: var(--surface); stroke-width: 1.5; }
.qc-m.pass { fill: var(--ok); }
.qc-m.warn { fill: var(--warn); }
.qc-m.fail { fill: var(--err); }
.qc-m.low { fill: var(--surface); stroke: var(--muted); stroke-width: 1.5; }
.qc-m.series { stroke-width: 1; }
.qc-ring { fill: none; stroke: var(--brass); stroke-width: 2; }
.qc-halo { fill: none; stroke: var(--ink); stroke-width: 1.5; opacity: 0.55; }
.qc-tip { position: absolute; pointer-events: none; z-index: 5; background: var(--surface); border: 1px solid var(--line-2); border-radius: 8px; box-shadow: var(--shadow); padding: 8px 10px; font-size: 12px; min-width: 170px; max-width: 250px; color: var(--ink-2); }
.qc-tip b.v { display: block; font-size: 15px; color: var(--ink); font-variant-numeric: tabular-nums; }
.qc-tip dl { display: grid; grid-template-columns: auto 1fr; gap: 1px 10px; margin: 6px 0 0; }
.qc-tip dt { color: var(--muted); }
.qc-tip dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
@media (max-width: 640px) {
  .qc-el { flex: 1; }
  .qc-el select { width: 100%; }
  .qc-batches td.qc-reason-cell { min-width: 220px; }
}
`;

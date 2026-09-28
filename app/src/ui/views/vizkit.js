// Shared pieces of the plan map, the section tool and the 3D view:
// theme colours for SVG/canvas/WebGL, hole filters, colour modes
// (lithology / assay grade / hole status), legends and the hover card.

import { html, useState, useEffect, useMemo } from '../../lib.js';
import { S, holes, hole, rows, codes, codeColor, meaning, settings, assayValues, elementKeys, memo } from '../../core/store.js';
import { holeTrace, buildTrace } from '../../core/desurvey.js';
import { elementLabel } from '../../core/schema.js';
import { makeClassScale, rampFor, fmtValue, mix, isDark } from '../../core/colorramp.js';
import { colourPieces, intervalAt } from '../../core/geom2d.js';
import { isNum, natCmp, fmt } from '../../core/util.js';
import { tr } from '../../i18n.js';
import { usePref, injectCSS, Swatch } from '../kit.js';
import { Icon } from '../icons.js';

// ------------------------------------------------------------------ theme

const VARS = ['bg', 'surface', 'surface-2', 'surface-3', 'ink', 'ink-2', 'muted', 'line', 'line-2', 'accent', 'accent-2', 'accent-ink', 'accent-soft', 'brass', 'ok', 'warn', 'err', 'info'];
const FALLBACK = {
  bg: '#f2f5f4', surface: '#ffffff', surface2: '#edf2f0', surface3: '#e3eae8', ink: '#142120', ink2: '#394a48', muted: '#62746f',
  line: '#d8e1de', line2: '#c3d0cc', accent: '#0d7a74', accent2: '#0a625d', accentInk: '#ffffff', accentSoft: '#d5ecea', brass: '#b3862a',
  ok: '#2d8752', warn: '#b97d0b', err: '#bd3f2a', info: '#3767a8',
};
const camel = (s) => s.replace(/-(\w)/g, (_, c) => c.toUpperCase());

/** Current design-token colours (resolved hex / rgb strings) for canvas, SVG export and WebGL. */
export function readTheme() {
  const o = { ...FALLBACK };
  try {
    const cs = getComputedStyle(document.documentElement);
    for (const v of VARS) {
      const val = cs.getPropertyValue('--' + v).trim();
      if (val) o[camel(v)] = val;
    }
    o.font = cs.getPropertyValue('--font').trim() || 'system-ui, sans-serif';
    o.mono = cs.getPropertyValue('--mono').trim() || 'ui-monospace, monospace';
  } catch {
    o.font = 'system-ui, sans-serif';
    o.mono = 'ui-monospace, monospace';
  }
  o.dark = isDark(o.bg);
  o.key = VARS.map((v) => o[camel(v)]).join('|');
  return o;
}

/** Theme colours that follow prefers-color-scheme and the root data-theme attribute. */
export function useTheme() {
  const [th, setTh] = useState(readTheme);
  useEffect(() => {
    const upd = () => setTh((cur) => {
      const n = readTheme();
      return n.key === cur.key ? cur : n;
    });
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', upd);
    const mo = new MutationObserver(upd);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    const t = setTimeout(upd, 250); // stylesheet may still be loading on first paint
    return () => {
      mq?.removeEventListener?.('change', upd);
      mo.disconnect();
      clearTimeout(t);
    };
  }, []);
  return th;
}

/** Colour for unlogged / unsampled depths: recessive but visible on the surface. */
export const neutralColour = (theme) => mix(theme.muted, theme.bg, theme.dark ? 0.3 : 0.4);

// ---------------------------------------------------------------- filters

export const DEFAULT_FILTER = { prospect: '', status: [], q: '' };

/** Map / 3D hole filter, remembered per viewer and shared by both views. */
export function useVizFilter() {
  const [f, setF] = usePref('viz.filter', DEFAULT_FILTER);
  return [{ ...DEFAULT_FILTER, ...(f || {}) }, setF];
}

function termMatch(id, term) {
  if (!term) return true;
  if (term.includes('*') || term.includes('?')) {
    const re = new RegExp('^' + term.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
    return re.test(id);
  }
  return id.toLowerCase().includes(term.toLowerCase());
}

/** Does a collar pass the filter? Text: comma/space separated terms (any), * and ? wildcards. */
export function matchFilter(c, f) {
  if (!c) return false;
  if (f.prospect && (c.prospect || '') !== f.prospect) return false;
  if (f.status?.length && !f.status.includes(c.status || '')) return false;
  const terms = String(f.q || '').split(/[\s,;]+/).filter(Boolean);
  if (terms.length && !terms.some((t) => termMatch(String(c.holeId), t))) return false;
  return true;
}

export const hasCoords = (c) => isNum(c?.east) && isNum(c?.north);

export function FilterPanel({ filter, setFilter, all, shown, selected, onPick, open, onClose }) {
  const prospects = useMemo(() => [...new Set(all.map((c) => c.prospect).filter(Boolean))].sort(natCmp), [all]);
  const statuses = codes('HOLESTATUS');
  const counts = useMemo(() => {
    const m = new Map();
    for (const c of all) m.set(c.status || '', (m.get(c.status || '') || 0) + 1);
    return m;
  }, [all]);
  const set = (patch) => setFilter({ ...filter, ...patch });
  const toggleStatus = (code) => {
    const cur = new Set(filter.status || []);
    if (cur.has(code)) cur.delete(code);
    else cur.add(code);
    // everything ticked again = no status filter (keeps holes without a status)
    set({ status: cur.size >= statuses.length ? [] : [...cur] });
  };
  const active = filter.prospect || filter.status?.length || filter.q;
  return html`<aside class=${'viz-side' + (open ? ' open' : '')} aria-label=${tr({ en: 'Hole filters', mn: 'Цооногийн шүүлтүүр' })}>
    <div class="viz-side-head">
      <h2>${tr({ en: 'Filters', mn: 'Шүүлтүүр' })}</h2>
      ${active ? html`<button class="viz-link" onClick=${() => setFilter({ ...DEFAULT_FILTER })}>${tr({ en: 'Clear', mn: 'Цэвэрлэх' })}</button>` : null}
      <button class="icon-btn viz-side-x" onClick=${onClose} aria-label=${tr({ en: 'Hide filters', mn: 'Шүүлтүүр нуух' })}><${Icon} name="x" /></button>
    </div>
    <label class="fld">
      <span>${tr({ en: 'Hole ID', mn: 'Цооногийн дугаар' })}</span>
      <input class="inp" type="search" value=${filter.q} placeholder=${tr({ en: 'e.g. MU26* or OVD2', mn: 'ж: MU26* эсвэл OVD2' })} onInput=${(e) => set({ q: e.target.value })} />
    </label>
    ${prospects.length
      ? html`<label class="fld">
          <span>${tr({ en: 'Prospect', mn: 'Талбай' })}</span>
          <select class="inp" value=${filter.prospect} onChange=${(e) => set({ prospect: e.target.value })}>
            <option value="">${tr({ en: 'All prospects', mn: 'Бүх талбай' })}</option>
            ${prospects.map((p) => html`<option value=${p}>${p}</option>`)}
          </select>
        </label>`
      : null}
    <fieldset class="viz-status">
      <legend>${tr({ en: 'Status', mn: 'Төлөв' })}</legend>
      ${statuses.map(
        (s) => html`<label class="check">
          <input type="checkbox" checked=${!filter.status?.length || filter.status.includes(s.code)} onChange=${() => {
            // first click on an unfiltered list narrows to "all but this one"
            if (!filter.status?.length) set({ status: statuses.map((x) => x.code).filter((c) => c !== s.code) });
            else toggleStatus(s.code);
          }} />
          <${Swatch} color=${s.color} size=${10} />
          <span>${meaning('HOLESTATUS', s.code) || s.code}</span>
          <small class="muted num">${counts.get(s.code) || 0}</small>
        </label>`,
      )}
    </fieldset>
    <p class="muted viz-count">${tr({ en: 'Showing {n} of {m} holes', mn: '{m} цооногоос {n} харагдаж байна' }, { n: shown.length, m: all.length })}</p>
    <ul class="viz-holes" role="listbox" aria-label=${tr({ en: 'Holes', mn: 'Цооногууд' })}>
      ${shown.map(
        (c) => html`<li key=${c.holeId}>
          <button role="option" aria-selected=${selected === c.holeId} class=${selected === c.holeId ? 'on' : ''} onClick=${() => onPick?.(c.holeId)}>
            <${Swatch} color=${codeColor('HOLESTATUS', c.status)} size=${9} />
            <span class="mono">${c.holeId}</span>
            <small class="muted num">${isNum(c.eoh) ? fmt(c.eoh, 1) + ' ' + tr({ en: 'm', mn: 'м' }) : ''}</small>
          </button>
        </li>`,
      )}
    </ul>
  </aside>`;
}

// ------------------------------------------------------------ colour modes

export const isPrimarySample = (s) => !s?.sampleType || s.sampleType === 'PRIM';

export function modeOptions() {
  return [
    { value: 'lith', label: tr({ en: 'Lithology', mn: 'Литологи' }) },
    { value: 'assay', label: tr({ en: 'Assay grade', mn: 'Агуулга (шинжилгээ)' }) },
    { value: 'status', label: tr({ en: 'Hole status', mn: 'Цооногийн төлөв' }) },
  ];
}

export function methodOptions() {
  return [
    { value: 'quantile', label: tr({ en: 'Percentile classes', mn: 'Перцентиль' }) },
    { value: 'log', label: tr({ en: 'Log intervals', mn: 'Лог интервал' }) },
    { value: 'linear', label: tr({ en: 'Equal intervals', mn: 'Тэнцүү интервал' }) },
  ];
}

export function elementOptions() {
  return elementKeys('assays').map((k) => ({ value: k, label: elementLabel(k) }));
}

export function defaultElement() {
  const keys = elementKeys('assays');
  const st = settings();
  const pref = [st.intercepts?.element, ...(st.stripElements || [])].find((k) => k && keys.includes(k));
  return pref || keys[0] || '';
}

/** Colour-mode preferences shared by map, section and 3D. */
export function useColourPrefs() {
  const [p, setP] = usePref('viz.colour', { mode: 'lith', el: '', method: 'quantile' });
  const v = { mode: 'lith', el: '', method: 'quantile', ...(p || {}) };
  return [v, (patch) => setP({ ...v, ...patch })];
}

/** Assay value used for colouring (below-detection stored as negative -> half the limit). */
export function sampleValue(s, el) {
  const v = assayValues(s?.sampleId)?.values?.[el];
  if (!isNum(v)) return null;
  return v < 0 ? Math.abs(v) / 2 : v;
}

/** Desurveyed trace for display; planned holes without depth use their planned depth. */
export function traceOf(holeId) {
  return memo(`viz.trace|${holeId}`, () => {
    const c = hole(holeId);
    if (!hasCoords(c)) return null;
    let t = holeTrace(holeId);
    let planned = c.status === 'PLN';
    if ((!t || !(t.eoh > 0)) && isNum(c.plannedDepth) && c.plannedDepth > 0) {
      t = buildTrace({ ...c, eoh: c.plannedDepth }, rows('survey', holeId), { negDown: settings().dipNegativeDown !== false });
      planned = true;
    }
    if (!t) return null;
    return { holeId, pts: t.polyline(2), eoh: t.eoh, planned };
  });
}

/**
 * Colouring for a mode. Returns
 *   {mode, el, method, neutral, scale, intervals(holeId) -> [{from, to, color}], pieces(holeId), legend(ids), title}
 * Colours follow the code / value, never the filter, so filtering never repaints holes.
 */
export function buildColouring({ mode = 'lith', el = '', method = 'quantile', theme }) {
  const neutral = neutralColour(theme);
  const out = { mode, el: '', method, neutral, scale: null, theme };
  if (mode === 'assay') {
    const key = el && elementKeys('assays').includes(el) ? el : defaultElement();
    out.el = key;
    out.scale = memo(`viz.scale|${key}|${method}|${theme.dark}`, () => {
      const vals = [];
      for (const s of rows('samples')) if (isPrimarySample(s) && isNum(s.from) && isNum(s.to)) {
        const v = sampleValue(s, key);
        if (v !== null) vals.push(v);
      }
      return makeClassScale(vals, { method, stops: rampFor(theme.bg) });
    });
    out.intervals = (id) =>
      rows('samples', id)
        .filter((s) => isPrimarySample(s) && isNum(s.from) && isNum(s.to))
        .map((s) => {
          const v = sampleValue(s, key);
          return { from: s.from, to: s.to, color: v === null ? null : out.scale.color(v), value: v };
        });
    out.title = key ? elementLabel(key) : tr({ en: 'Assay grade', mn: 'Шинжилгээний агуулга' });
  } else if (mode === 'status') {
    out.intervals = (id) => [{ from: -1e9, to: 1e9, color: codeColor('HOLESTATUS', hole(id)?.status, neutral) }];
    out.title = tr({ en: 'Hole status', mn: 'Цооногийн төлөв' });
  } else {
    out.mode = 'lith';
    out.intervals = (id) => rows('lith', id).map((r) => ({ from: r.from, to: r.to, color: r.lith1 ? codeColor('LITH', r.lith1, neutral) : null }));
    out.title = tr({ en: 'Lithology (Lith1)', mn: 'Литологи (Lith1)' });
  }
  out.pieces = (id) => {
    const t = traceOf(id);
    return t ? colourPieces(t.pts, out.intervals(id), neutral) : [];
  };
  out.legend = (ids) => legendFor(out, ids);
  return out;
}

function legendFor(c, ids) {
  const list = [...(ids || [])];
  if (c.mode === 'status') {
    const n = new Map();
    for (const id of list) {
      const s = hole(id)?.status || '';
      n.set(s, (n.get(s) || 0) + 1);
    }
    const items = codes('HOLESTATUS')
      .filter((s) => n.get(s.code))
      .map((s) => ({ color: s.color || c.neutral, label: meaning('HOLESTATUS', s.code) || s.code, count: n.get(s.code) }));
    if (n.get('')) items.push({ color: c.neutral, label: tr({ en: 'No status', mn: 'Төлөвгүй' }), count: n.get('') });
    return { title: c.title, items, unit: tr({ en: 'holes', mn: 'цооногийн тоо' }) };
  }
  if (c.mode === 'assay') {
    const s = c.scale;
    const items = s.n
      ? s.legend.map((l) => ({ color: l.color, label: l.label, sub: l.pct, count: l.count }))
      : [];
    items.push({ color: c.neutral, label: tr({ en: 'Not assayed', mn: 'Шинжлээгүй' }), gap: true });
    const how = methodOptions().find((m) => m.value === s.method)?.label || '';
    return {
      title: c.title,
      sub: s.n ? `${how} · n = ${s.n}${s.log ? ' · ' + tr({ en: 'log-spread', mn: 'лог тархалт' }) : ''}` : tr({ en: 'No assays for this element yet', mn: 'Энэ элементийн шинжилгээ алга' }),
      items,
      unit: tr({ en: 'samples', mn: 'дээжийн тоо' }),
      range: s.n ? [s.min, s.max] : null,
    };
  }
  // lithology: codes present in the shown holes, in code-list order, with metres
  const m = new Map();
  for (const id of list) for (const r of rows('lith', id)) if (r.lith1 && isNum(r.from) && isNum(r.to)) m.set(r.lith1, (m.get(r.lith1) || 0) + (r.to - r.from));
  const order = new Map(codes('LITH', { includeInactive: true }).map((x, i) => [x.code, i]));
  const items = [...m.entries()]
    .sort((a, b) => (order.get(a[0]) ?? 999) - (order.get(b[0]) ?? 999) || natCmp(a[0], b[0]))
    .map(([code, metres]) => ({ color: codeColor('LITH', code, c.neutral), label: code, sub: meaning('LITH', code), count: Math.round(metres), mono: true }));
  items.push({ color: c.neutral, label: tr({ en: 'Not logged', mn: 'Логгүй' }), gap: true });
  return { title: c.title, items, unit: tr({ en: 'metres logged', mn: 'логдсон метр' }) };
}

/** Legend card (HTML overlay). */
export function Legend({ legend, class: cls = '' }) {
  const [open, setOpen] = usePref('viz.legendOpen', true);
  if (!legend) return null;
  return html`<div class=${'viz-legend ' + cls} role="group" aria-label=${tr({ en: 'Legend', mn: 'Тайлбар' })}>
    <button class="viz-legend-head" onClick=${() => setOpen(!open)} aria-expanded=${open}>
      <b>${legend.title}</b>
      <${Icon} name=${open ? 'chevronDown' : 'chevronRight'} size=${15} />
    </button>
    ${open
      ? html`${legend.sub ? html`<div class="muted viz-legend-sub">${legend.sub}</div>` : null}
          <ul>
            ${legend.items.map(
              (it) => html`<li class=${it.gap ? 'gap' : ''}>
                <${Swatch} color=${it.color} size=${11} />
                <span class=${it.mono ? 'mono' : 'num'}>${it.label}</span>
                ${it.sub ? html`<small class="muted" title=${it.sub}>${it.sub}</small>` : null}
                ${isNum(it.count) ? html`<small class="muted num cnt">${it.count}</small>` : null}
              </li>`,
            )}
          </ul>
          ${legend.unit ? html`<div class="muted viz-legend-unit">${tr({ en: 'Right column: {u}', mn: 'Баруун багана: {u}' }, { u: legend.unit })}</div>` : null}`
      : null}
  </div>`;
}

// -------------------------------------------------------------- hover card

/** What is at depth `md` of a hole: status, lithology and sample (with the current element). */
export function describeAt(holeId, md, colouring) {
  const c = hole(holeId);
  if (!c) return null;
  const t = traceOf(holeId);
  const lith = intervalAt(rows('lith', holeId), md);
  const samp = intervalAt(rows('samples', holeId).filter((s) => isPrimarySample(s) && isNum(s.from) && isNum(s.to)), md);
  const el = colouring?.mode === 'assay' ? colouring.el : defaultElement();
  const val = samp && el ? sampleValue(samp, el) : null;
  return {
    holeId,
    md,
    eoh: isNum(c.eoh) ? c.eoh : t?.eoh ?? null,
    planned: !!t?.planned,
    status: c.status,
    statusColor: codeColor('HOLESTATUS', c.status),
    statusLabel: meaning('HOLESTATUS', c.status) || c.status || '',
    prospect: c.prospect || '',
    lith: lith ? { code: lith.lith1, name: meaning('LITH', lith.lith1), from: lith.from, to: lith.to, color: codeColor('LITH', lith.lith1) } : null,
    sample: samp ? { id: samp.sampleId, from: samp.from, to: samp.to, el, value: val, color: colouring?.mode === 'assay' && val !== null ? colouring.scale.color(val) : null } : null,
  };
}

export function HoverCard({ info, x, y, w, h, hint = true }) {
  if (!info) return null;
  const m = tr({ en: 'm', mn: 'м' });
  // keep the card inside the stage: flip left / up near the edges
  const left = x + 16 + 260 > w ? Math.max(4, x - 16 - 260) : x + 16;
  const top = y + 12 + 150 > h ? Math.max(4, y - 12 - 150) : y + 12;
  return html`<div class="viz-tip" style=${`left:${left}px;top:${top}px`} role="tooltip">
    <div class="viz-tip-head">
      <b class="mono">${info.holeId}</b>
      <span class="pill" style=${`background:color-mix(in srgb, ${info.statusColor} 18%, transparent)`}><${Swatch} color=${info.statusColor} size=${8} /> ${info.statusLabel}</span>
    </div>
    <div class="viz-tip-row"><span>${tr({ en: 'Depth', mn: 'Гүн' })}</span><b class="num">${fmt(info.md, 1)} ${m}</b>${isNum(info.eoh) ? html`<small class="muted num">/ ${fmt(info.eoh, 1)} ${m}${info.planned ? ' · ' + tr({ en: 'planned', mn: 'төлөвлөсөн' }) : ''}</small>` : null}</div>
    ${info.lith
      ? html`<div class="viz-tip-row"><${Swatch} color=${info.lith.color} size=${10} /><b class="mono">${info.lith.code}</b><span class="muted">${info.lith.name}</span></div>
          <div class="viz-tip-sub muted num">${fmt(info.lith.from, 2)}–${fmt(info.lith.to, 2)} ${m}</div>`
      : html`<div class="viz-tip-row muted">${tr({ en: 'Not logged here', mn: 'Энд логгүй' })}</div>`}
    ${info.sample
      ? html`<div class="viz-tip-row">${info.sample.color ? html`<${Swatch} color=${info.sample.color} size=${10} />` : null}<span class="mono">${info.sample.id}</span><span class="muted num">${fmt(info.sample.from, 2)}–${fmt(info.sample.to, 2)} ${m}</span></div>
          ${info.sample.el
            ? html`<div class="viz-tip-sub">${elementLabel(info.sample.el)}: <b class="num">${info.sample.value === null ? tr({ en: 'no result', mn: 'үр дүнгүй' }) : fmtValue(info.sample.value)}</b></div>`
            : null}`
      : null}
    ${hint ? html`<div class="viz-tip-hint muted">${tr({ en: 'Double-click to open the hole', mn: 'Цооногийг нээхийн тулд давхар товшино уу' })}</div>` : null}
  </div>`;
}

/**
 * Hover tooltip fed imperatively (bind.current(hv)) so pointer moves re-render only
 * this layer. hv = {id, md, x, y, px?, py?}; px/py draw a dot on the trace.
 */
export function HoverLayer({ bind, colouring, w, h, hint = true }) {
  const [hv, setHv] = useState(null);
  useEffect(() => {
    bind.current = setHv;
    return () => {
      bind.current = null;
      setHv(null);
    };
  }, [bind]);
  const mdKey = hv ? Math.round(hv.md * 10) : 0;
  const info = useMemo(() => (hv ? describeAt(hv.id, hv.md, colouring) : null), [hv?.id, mdKey, colouring]);
  if (!hv || !info) return null;
  return html`${isNum(hv.px) ? html`<span class="viz-dot" style=${`left:${hv.px}px;top:${hv.py}px`}></span>` : null}
    <${HoverCard} info=${info} x=${hv.x} y=${hv.y} w=${w} h=${h} hint=${hint} />`;
}

/** Read an optional ?hole= from the hash (e.g. #/map?hole=MU2601). */
export function hashParam(name) {
  const q = (location.hash.split('?')[1] || '').split('&');
  for (const kv of q) {
    const [k, v] = kv.split('=');
    if (k === name) return decodeURIComponent(v || '');
  }
  return '';
}

/** Collars with coordinates (memoised per store revision). */
export function mappableHoles() {
  return memo('viz.mappable', () => holes().filter(hasCoords));
}

/** Debounced copy of a value. */
export function useDebounced(value, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---------------------------------------------------------------- styles

injectCSS(
  'vizkit',
  `
.viz { flex: 1; min-height: 0; min-width: 0; display: flex; flex-direction: column; background: var(--bg); position: relative; }
.viz-bar { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); background: var(--surface); }
.viz-bar h1 { font-size: 16px; font-weight: 650; margin-right: 2px; }
.viz-bar .grp { display: inline-flex; align-items: center; gap: 6px; }
.viz-bar .lbl { font-size: 12px; color: var(--muted); font-weight: 550; white-space: nowrap; }
.viz-bar .inp { padding: 4px 8px; font-size: 13px; max-width: 210px; }
.viz-bar input[type=range] { width: 92px; accent-color: var(--accent); }
.viz-bar .val { font-size: 12px; font-variant-numeric: tabular-nums; min-width: 32px; color: var(--ink-2); }
.viz-bar .sep { width: 1px; align-self: stretch; background: var(--line); }
.viz-body { flex: 1; min-height: 0; display: flex; position: relative; }
.viz-side { width: 240px; flex: none; border-right: 1px solid var(--line); background: var(--surface); overflow: auto; display: flex; flex-direction: column; gap: 12px; padding: 12px; }
.viz-side-head { display: flex; align-items: center; gap: 8px; }
.viz-side-head h2 { font-size: 14px; flex: 1; }
.viz-side-x { width: 28px; height: 28px; }
.viz-link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; font-size: 12.5px; }
.viz-status { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 5px; }
.viz-status legend { font-size: 12px; color: var(--muted); font-weight: 550; margin-bottom: 4px; padding: 0; }
.viz-status .check { font-size: 13px; }
.viz-status .check small { margin-left: auto; }
.viz-count { font-size: 12px; }
.viz-holes { list-style: none; margin: 0 -6px; padding: 0; display: flex; flex-direction: column; gap: 1px; min-height: 60px; overflow: auto; flex: 1; }
.viz-holes button { display: flex; align-items: center; gap: 7px; width: 100%; border: 0; background: none; color: var(--ink); padding: 4px 6px; border-radius: 6px; cursor: pointer; font: inherit; font-size: 12.5px; text-align: left; }
.viz-holes button:hover { background: var(--surface-2); }
.viz-holes button.on { background: var(--accent-soft); color: var(--accent-2); }
.viz-holes small { margin-left: auto; }
.viz-stage { flex: 1; min-width: 0; min-height: 0; position: relative; overflow: hidden; }
.viz-legend { position: absolute; right: 12px; bottom: 12px; z-index: 6; width: 250px; max-width: calc(100% - 24px); max-height: calc(100% - 24px); overflow: auto; background: color-mix(in srgb, var(--surface) 94%, transparent); border: 1px solid var(--line); border-radius: 10px; padding: 6px 10px 8px; font-size: 12px; box-shadow: var(--shadow); }
.viz-legend-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; border: 0; background: none; color: var(--ink); padding: 2px 0 4px; cursor: pointer; font: inherit; font-size: 12.5px; text-align: left; }
.viz-legend-sub, .viz-legend-unit { font-size: 11px; margin-bottom: 4px; }
.viz-legend-unit { margin: 4px 0 0; }
.viz-legend ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
.viz-legend li { display: flex; align-items: center; gap: 6px; min-width: 0; }
.viz-legend li > span { white-space: nowrap; }
.viz-legend li small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.viz-legend li small.cnt { margin-left: auto; flex: none; }
.viz-legend li.gap { color: var(--muted); }
.viz-tip { position: absolute; z-index: 12; pointer-events: none; width: max-content; max-width: 260px; background: var(--surface); color: var(--ink); border: 1px solid var(--line); border-radius: 9px; box-shadow: var(--shadow); padding: 8px 10px; font-size: 12.5px; display: grid; gap: 3px; }
.viz-tip-head { display: flex; align-items: center; gap: 8px; justify-content: space-between; margin-bottom: 2px; }
.viz-tip-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.viz-tip-sub { font-size: 11.5px; padding-left: 17px; }
.viz-tip-hint { font-size: 11px; margin-top: 3px; }
.viz-dot { position: absolute; z-index: 11; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: var(--ink); border: 2px solid var(--surface); pointer-events: none; }
.viz-msg { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; text-align: center; }
.viz-msg > div { max-width: 440px; display: grid; gap: 10px; justify-items: center; }
.viz-card { position: absolute; left: 12px; top: 12px; z-index: 7; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; box-shadow: var(--shadow); padding: 10px 12px; font-size: 12.5px; display: grid; gap: 6px; min-width: 200px; max-width: min(300px, calc(100% - 24px)); }
.viz-card-head { display: flex; align-items: center; gap: 8px; }
.viz-card-head b { font-size: 14px; flex: 1; }
.viz-card dl { display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; margin: 0; }
.viz-card dt { color: var(--muted); }
.viz-card dd { margin: 0; font-variant-numeric: tabular-nums; }
@media (max-width: 820px) {
  .viz-side { position: absolute; z-index: 20; inset: 0 auto 0 0; width: min(86vw, 300px); box-shadow: var(--shadow); transform: translateX(-102%); transition: transform .18s ease; }
  .viz-side.open { transform: none; }
  .viz-bar { padding: 8px; gap: 6px 10px; }
  .viz-bar .hide-sm { display: none; }
  .viz-legend { width: 210px; right: 8px; bottom: 8px; }
}
@media (min-width: 821px) { .viz-side:not(.open) { display: none; } }
`,
);

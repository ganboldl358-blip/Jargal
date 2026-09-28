// Plan map (SVG): collars by status, desurveyed traces in plan coloured by
// lithology / assay / status, greedy label placement, pan & zoom, grid, scale
// bar, north arrow and cursor E/N readout. The section tool cuts a vertical
// cross-section through a corridor (±width) along a line drawn on the map.
// Also exports MiniMap, a plan thumbnail for the hole workspace header.
//
// Traces are drawn once in (recentred) world units inside a transformed group
// with non-scaling strokes, merged into one <path> per colour, so panning and
// zooming only change a transform; markers and labels are recomputed in screen
// space each frame (cheap: one per hole).

import { html, useState, useEffect, useRef, useMemo, Component } from '../../lib.js';
import { S, hole, holes, rows, codeColor, meaning, assayValues } from '../../core/store.js';
import { isNum, fmt } from '../../core/util.js';
import { coverage } from '../../core/intervals.js';
import {
  niceStep,
  niceFloor,
  ticks,
  emptyBounds,
  extendBounds,
  validBounds,
  fitView,
  screenToWorld,
  zoomAt,
  placeLabels,
  nearestOnPolyline,
  sectionFrame,
  toSection,
  fromSection,
  clipToCorridor,
  compass,
} from '../../core/geom2d.js';
import { tr } from '../../i18n.js';
import { useStore, Button, IconButton, Select, injectCSS, usePref, useSize, navigate, saveFile, toast, Swatch } from '../kit.js';
import { Icon } from '../icons.js';
import {
  useTheme,
  useVizFilter,
  matchFilter,
  FilterPanel,
  DEFAULT_FILTER,
  useColourPrefs,
  modeOptions,
  methodOptions,
  elementOptions,
  buildColouring,
  traceOf,
  Legend,
  HoverLayer,
  hashParam,
  mappableHoles,
  isPrimarySample,
} from './vizkit.js';

const M = () => tr({ en: 'm', mn: 'м' });
const fmtCoord = (v) => String(Math.round(v));

// ------------------------------------------------------------------- data

/** Plan geometry of every mappable hole, recentred on a rounded collar centroid. */
function planData(list, colouring) {
  let sx = 0;
  let sy = 0;
  for (const c of list) {
    sx += c.east;
    sy += c.north;
  }
  const n = list.length || 1;
  const ox = Math.round(sx / n / 100) * 100;
  const oy = Math.round(sy / n / 100) * 100;
  const bounds = emptyBounds();
  const hs = [];
  for (const c of list) {
    const t = traceOf(c.holeId);
    const pts = t ? t.pts : [{ md: 0, p: [c.east, c.north, isNum(c.rl) ? c.rl : 0] }];
    const N = pts.length;
    const xs = new Float64Array(N);
    const ys = new Float64Array(N);
    const mds = new Float64Array(N);
    const bb = emptyBounds();
    for (let i = 0; i < N; i++) {
      xs[i] = pts[i].p[0] - ox;
      ys[i] = pts[i].p[1] - oy;
      mds[i] = pts[i].md;
      extendBounds(bounds, xs[i], ys[i]);
      extendBounds(bb, xs[i], ys[i]);
    }
    // plan direction at EOH, from the last couple of metres that move in plan
    let dir = null;
    const L = N - 1;
    for (let i = L - 1; i >= 0; i--) {
      const dx = xs[L] - xs[i];
      const dy = ys[L] - ys[i];
      const d = Math.hypot(dx, dy);
      if (d > 0.5) {
        dir = [dx / d, dy / d];
        break;
      }
    }
    hs.push({
      id: c.holeId,
      c,
      x: xs[0],
      y: ys[0],
      xs,
      ys,
      mds,
      bb,
      dir,
      planLen: Math.hypot(xs[L] - xs[0], ys[L] - ys[0]),
      planned: t ? t.planned : c.status === 'PLN',
      pieces: t ? colouring.pieces(c.holeId) : [],
      pts,
    });
  }
  return { ox, oy, holes: hs, byId: new Map(hs.map((h) => [h.id, h])), bounds };
}

/** One <path> per colour (world units, y flipped) for the shown holes. */
function tracePaths(data, shownIds) {
  const groups = new Map();
  const { ox, oy } = data;
  for (const h of data.holes) {
    if (!shownIds.has(h.id)) continue;
    for (const pc of h.pieces) {
      if (pc.pts.length < 2) continue;
      const key = `${pc.gap ? 0 : 1}|${h.planned ? 1 : 0}|${pc.color}`;
      let d = '';
      for (let i = 0; i < pc.pts.length; i++) {
        const p = pc.pts[i].p;
        d += (i ? 'L' : 'M') + (p[0] - ox).toFixed(2) + ' ' + (oy - p[1]).toFixed(2);
      }
      const arr = groups.get(key);
      if (arr) arr.push(d);
      else groups.set(key, [d]);
    }
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, parts]) => {
      const [solid, planned, color] = k.split('|');
      return { key: k, color, gap: solid === '0', planned: planned === '1', d: parts.join('') };
    });
}

/** Static trace layer: only re-renders when the merged paths change. */
class TraceLayer extends Component {
  shouldComponentUpdate(np) {
    return np.paths !== this.props.paths;
  }
  render({ paths }) {
    return html`<g class="map-traces">
      ${paths.map((p) => html`<path key=${p.key} d=${p.d} stroke=${p.color} class=${(p.gap ? 'gap' : '') + (p.planned ? ' pln' : '')} />`)}
    </g>`;
  }
}

// ------------------------------------------------------------- plan stage

function PlanStage({ data, paths, shownIds, selected, onSelect, colouring, section, onSection, tool, onToolDone, focus, hoverBind, readoutBind }) {
  const boxRef = useRef(null);
  const svgRef = useRef(null);
  const { w, h } = useSize(boxRef);
  const [view, setView] = useState(null);
  const [draft, setDraft] = useState(null); // section start (real coords) while drawing
  const [rubber, setRubber] = useState(null); // cursor (real coords) while drawing
  const st = useRef({ pointers: new Map() }).current;
  const viewRef = useRef(view);
  viewRef.current = view;
  const sizeRef = useRef({ w, h });
  sizeRef.current = { w, h };
  const fittedFor = useRef('');

  // fit on first layout and whenever the project (origin) changes
  useEffect(() => {
    if (!w || !h) return;
    const key = `${data.ox}|${data.oy}`;
    if (fittedFor.current === key && view) return;
    fittedFor.current = key;
    const f = focus?.id && data.byId.get(focus.id);
    const v = fitView(data.bounds, w, h, 56);
    setView(f ? { ...v, cx: f.x, cy: f.y, k: Math.max(v.k, 1.2) } : v);
  }, [w, h, data]);

  // centre on a hole picked from the list
  useEffect(() => {
    if (!focus || !view || !w) return;
    const f = data.byId.get(focus.id);
    if (!f) return;
    const cx = (f.bb.minX + f.bb.maxX) / 2;
    const cy = (f.bb.minY + f.bb.maxY) / 2;
    const span = Math.max(f.bb.maxX - f.bb.minX, f.bb.maxY - f.bb.minY, 60);
    const k = Math.max(view.k, Math.min(w, h) / (span * 4));
    setView({ cx, cy, k: Math.min(k, 40) });
  }, [focus?.n]);

  useEffect(() => {
    if (tool !== 'section') {
      setDraft(null);
      setRubber(null);
    }
  }, [tool]);

  // wheel zoom (non-passive so the page does not scroll)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const v = viewRef.current;
      if (!v) return;
      const r = el.getBoundingClientRect();
      const f = Math.exp(-Math.max(-60, Math.min(60, e.deltaY * (e.deltaMode === 1 ? 16 : 1))) * 0.0022);
      setView(zoomAt(v, sizeRef.current.w, sizeRef.current.h, e.clientX - r.left, e.clientY - r.top, f, 1e-4, 200));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [svgRef.current]);

  const v = view || { cx: 0, cy: 0, k: 1 };
  const X = (x) => w / 2 + (x - v.cx) * v.k;
  const Y = (y) => h / 2 - (y - v.cy) * v.k;
  const toWorld = (mx, my) => screenToWorld(v, w, h, mx, my);
  const toReal = (mx, my) => {
    const [x, y] = toWorld(mx, my);
    return [x + data.ox, y + data.oy];
  };
  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const vis = useMemo(() => data.holes.filter((x) => shownIds.has(x.id)), [data, shownIds]);

  /** Nearest shown hole within 10 px: {id, md, x, y} in world units. */
  const hitTest = (mx, my) => {
    const [wx, wy] = toWorld(mx, my);
    const tol = 10 / v.k;
    let best = null;
    for (const hh of vis) {
      if (wx < hh.bb.minX - tol || wx > hh.bb.maxX + tol || wy < hh.bb.minY - tol || wy > hh.bb.maxY + tol) continue;
      const dc = (hh.x - wx) ** 2 + (hh.y - wy) ** 2;
      if (dc <= (9 / v.k) ** 2) {
        const r = { id: hh.id, md: 0, d2: dc * 0.25, x: hh.x, y: hh.y };
        if (!best || r.d2 < best.d2) best = r;
        continue;
      }
      const r = nearestOnPolyline(hh.xs, hh.ys, hh.mds, wx, wy);
      if (r && r.d2 <= tol * tol && (!best || r.d2 < best.d2)) {
        const j = Math.min(r.i + 1, hh.xs.length - 1);
        best = { id: hh.id, md: r.md, d2: r.d2, x: hh.xs[r.i] + (hh.xs[j] - hh.xs[r.i]) * r.t, y: hh.ys[r.i] + (hh.ys[j] - hh.ys[r.i]) * r.t };
      }
    }
    return best;
  };

  const setHover = (hit, mx, my) => {
    hoverBind.current?.(hit ? { id: hit.id, md: hit.md, x: mx, y: my, px: X(hit.x), py: Y(hit.y) } : null);
    if (svgRef.current) svgRef.current.style.cursor = hit && tool !== 'section' ? 'pointer' : '';
  };

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button > 1) return;
    const [mx, my] = local(e);
    svgRef.current.setPointerCapture?.(e.pointerId);
    st.pointers.set(e.pointerId, [mx, my]);
    st.down = [mx, my];
    st.moved = 0;
    setHover(null);
    const hd = e.target?.getAttribute?.('data-handle');
    if (hd && section) {
      st.handle = hd;
      return;
    }
    if (st.pointers.size === 2) {
      const [p, q] = [...st.pointers.values()];
      st.pinch = { d: Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, mid: [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], view: viewRef.current };
      st.pan = null;
      st.moved = 99;
    } else st.pan = { x: mx, y: my, view: viewRef.current };
  };

  const onPointerMove = (e) => {
    if (!view) return;
    const [mx, my] = local(e);
    readoutBind.current?.(toReal(mx, my));
    if (st.pointers.has(e.pointerId)) {
      st.pointers.set(e.pointerId, [mx, my]);
      if (st.down) st.moved = Math.max(st.moved, Math.hypot(mx - st.down[0], my - st.down[1]));
      if (st.handle) {
        onSection({ ...section, [st.handle]: toReal(mx, my) });
        return;
      }
      if (st.pinch && st.pointers.size === 2) {
        const [p, q] = [...st.pointers.values()];
        const d = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const pv = st.pinch.view;
        let nv = zoomAt(pv, w, h, st.pinch.mid[0], st.pinch.mid[1], d / st.pinch.d, 1e-4, 200);
        nv = { ...nv, cx: nv.cx - (mid[0] - st.pinch.mid[0]) / nv.k, cy: nv.cy + (mid[1] - st.pinch.mid[1]) / nv.k };
        setView(nv);
        return;
      }
      if (st.pan && st.moved > 3) {
        const pv = st.pan.view;
        setView({ ...pv, cx: pv.cx - (mx - st.pan.x) / pv.k, cy: pv.cy + (my - st.pan.y) / pv.k });
      }
      return;
    }
    if (tool === 'section' && draft) setRubber(toReal(mx, my));
    if (e.pointerType !== 'touch') setHover(tool === 'section' ? null : hitTest(mx, my), mx, my);
  };

  const onPointerUp = (e) => {
    const [mx, my] = local(e);
    const wasHandle = st.handle;
    st.pointers.delete(e.pointerId);
    st.handle = null;
    if (st.pointers.size < 2) st.pinch = null;
    if (st.pointers.size === 1) {
      const [p] = [...st.pointers.values()];
      st.pan = { x: p[0], y: p[1], view: viewRef.current };
      return;
    }
    st.pan = null;
    if (wasHandle || st.moved > 5 || !st.down) return;
    st.down = null;
    if (tool === 'section') {
      const pt = toReal(mx, my);
      if (!draft) {
        setDraft(pt);
        setRubber(pt);
      } else {
        if (Math.hypot(pt[0] - draft[0], pt[1] - draft[1]) * v.k > 8) onSection({ a: draft, b: pt, width: section?.width ?? 50 });
        setDraft(null);
        setRubber(null);
        onToolDone();
      }
      return;
    }
    const hit = hitTest(mx, my);
    onSelect(hit ? hit.id : null);
  };

  const onDbl = (e) => {
    if (tool === 'section') return;
    const [mx, my] = local(e);
    const hit = hitTest(mx, my);
    if (hit) navigate('#/hole/' + encodeURIComponent(hit.id));
  };

  const onKey = (e) => {
    if (!view) return;
    const step = 80 / v.k;
    const k = e.key;
    if (k === 'Escape') {
      if (tool === 'section') onToolDone();
      else onSelect(null);
    } else if (k === 'ArrowLeft') setView({ ...v, cx: v.cx - step });
    else if (k === 'ArrowRight') setView({ ...v, cx: v.cx + step });
    else if (k === 'ArrowUp') setView({ ...v, cy: v.cy + step });
    else if (k === 'ArrowDown') setView({ ...v, cy: v.cy - step });
    else if (k === '+' || k === '=') setView(zoomAt(v, w, h, w / 2, h / 2, 1.4));
    else if (k === '-' || k === '_') setView(zoomAt(v, w, h, w / 2, h / 2, 1 / 1.4));
    else return;
    e.preventDefault();
  };

  const zoomBtn = (f) => view && setView(zoomAt(v, w, h, w / 2, h / 2, f, 1e-4, 200));
  const fit = () => w && setView(fitView(vis.length ? boundsOf(vis) : data.bounds, w, h, 56));

  // ---------------------------------------------------- screen-space layers
  let grid = null;
  let markers = null;
  let labels = null;
  let ticksEOH = null;
  let secLayer = null;
  let scalebar = null;
  if (view && w && h) {
    const x0 = v.cx - w / 2 / v.k + data.ox;
    const x1 = v.cx + w / 2 / v.k + data.ox;
    const y0 = v.cy - h / 2 / v.k + data.oy;
    const y1 = v.cy + h / 2 / v.k + data.oy;
    const step = niceStep(x1 - x0, Math.max(2, w / 160));
    const gx = ticks(x0, x1, step);
    const gy = ticks(y0, y1, step);
    grid = html`<g class="map-grid">
      ${gx.map((x) => html`<line x1=${X(x - data.ox)} x2=${X(x - data.ox)} y1="0" y2=${h} />`)}
      ${gy.map((y) => html`<line y1=${Y(y - data.oy)} y2=${Y(y - data.oy)} x1="0" x2=${w} />`)}
      ${gx.map((x) => (X(x - data.ox) > 70 && X(x - data.ox) < w - 50 ? html`<text x=${X(x - data.ox)} y="14" text-anchor="middle">${fmtCoord(x)}E</text>` : null))}
      ${gy.map((y) => (Y(y - data.oy) > 30 && Y(y - data.oy) < h - 170 ? html`<text x="6" y=${Y(y - data.oy) - 4}>${fmtCoord(y)}N</text>` : null))}
    </g>`;

    const onScreen = [];
    const obstacles = [];
    for (const hh of vis) {
      const sx = X(hh.x);
      const sy = Y(hh.y);
      if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
      onScreen.push({ hh, sx, sy });
      obstacles.push([sx - 6, sy - 6, sx + 6, sy + 6]);
    }
    ticksEOH = vis.map((hh) => {
      if (!hh.dir || hh.planLen * v.k < 6) return null;
      const L = hh.xs.length - 1;
      const ex = X(hh.xs[L]);
      const ey = Y(hh.ys[L]);
      if (ex < -10 || ey < -10 || ex > w + 10 || ey > h + 10) return null;
      const px = -hh.dir[1];
      const py = -hh.dir[0]; // perpendicular, in screen space (y down)
      return html`<line class="map-eoh" x1=${ex - px * 5} y1=${ey - py * 5} x2=${ex + px * 5} y2=${ey + py * 5} />`;
    });
    markers = onScreen.map(({ hh, sx, sy }) => {
      const col = codeColor('HOLESTATUS', hh.c.status);
      const sel = hh.id === selected;
      return html`<g key=${hh.id}>
        ${sel ? html`<circle class="map-sel" cx=${sx} cy=${sy} r="10" />` : null}
        <circle class=${'map-collar' + (hh.planned ? ' pln' : '')} cx=${sx} cy=${sy} r=${sel ? 6 : 5} fill=${hh.planned ? 'var(--surface)' : col} stroke=${hh.planned ? col : null} />
      </g>`;
    });
    const priority = onScreen.slice().sort((a, b) => (b.hh.id === selected) - (a.hh.id === selected));
    const placed = placeLabels(
      priority.map(({ hh, sx, sy }) => ({ id: hh.id, x: sx, y: sy, w: hh.id.length * 6.7 + 4, h: 13 })),
      { width: w, height: h, obstacles },
    );
    labels = placed.map((p) => html`<text class=${'map-lbl' + (p.id === selected ? ' sel' : '')} x=${p.tx} y=${p.ty + 4} text-anchor=${p.anchor}>${p.id}</text>`);

    // scale bar (~110 px)
    const len = niceFloor(110 / v.k);
    const px = len * v.k;
    scalebar = html`<g class="map-scale" transform=${`translate(14 ${h - 22})`}>
      <rect x="0" y="0" width=${px / 2} height="5" class="a" />
      <rect x=${px / 2} y="0" width=${px / 2} height="5" class="b" />
      <text x="0" y="-5">0</text>
      <text x=${px} y="-5" text-anchor="end">${len >= 1000 ? fmt(len / 1000, 2) + ' ' + tr({ en: 'km', mn: 'км' }) : fmt(len, 2) + ' ' + M()}</text>
    </g>`;

    // section line, corridor and handles
    const secSvg = (a, b, width, live) => {
      const A = [a[0] - data.ox, a[1] - data.oy];
      const B = [b[0] - data.ox, b[1] - data.oy];
      const f = sectionFrame(A, B);
      if (!(f.len > 0)) return null;
      const corner = (al, ac) => {
        const p = fromSection(f, al, ac);
        return `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`;
      };
      const poly = [corner(0, width), corner(f.len, width), corner(f.len, -width), corner(0, -width)].join(' ');
      // end ticks point the way the section looks (the n direction)
      const tick = (al) => {
        const p = fromSection(f, al, 0);
        const q = fromSection(f, al, Math.max(width, 14 / v.k));
        return html`<line class="map-sec-tick" x1=${X(p[0])} y1=${Y(p[1])} x2=${X(q[0])} y2=${Y(q[1])} />`;
      };
      const lab = (al, text) => {
        const p = fromSection(f, al + (al > 0 ? 1 : -1) * (16 / v.k), 0);
        return html`<text class="map-sec-lbl" x=${X(p[0])} y=${Y(p[1]) + 4} text-anchor="middle">${text}</text>`;
      };
      return html`<g class=${'map-sec' + (live ? ' live' : '')}>
        <polygon points=${poly} />
        <line x1=${X(A[0])} y1=${Y(A[1])} x2=${X(B[0])} y2=${Y(B[1])} />
        ${live ? null : html`${tick(0)}${tick(f.len)}${lab(0, 'A')}${lab(f.len, 'A′')}
            <circle class="map-handle" data-handle="a" cx=${X(A[0])} cy=${Y(A[1])} r="7"><title>${tr({ en: 'Drag to move A', mn: 'A цэгийг чирж зөөх' })}</title></circle>
            <circle class="map-handle" data-handle="b" cx=${X(B[0])} cy=${Y(B[1])} r="7"><title>${tr({ en: 'Drag to move A′', mn: 'A′ цэгийг чирж зөөх' })}</title></circle>`}
      </g>`;
    };
    secLayer = html`${section?.a && section?.b ? secSvg(section.a, section.b, section.width || 50, false) : null}
      ${draft && rubber ? secSvg(draft, rubber, section?.width || 50, true) : null}
      ${draft ? html`<circle class="map-draft" cx=${X(draft[0] - data.ox)} cy=${Y(draft[1] - data.oy)} r="5" />` : null}`;
  }

  const selH = selected && data.byId.get(selected);
  const tx = w / 2 - v.cx * v.k;
  const ty = h / 2 + v.cy * v.k;
  const hint = tool === 'section' ? (draft ? tr({ en: 'Click the end point (A′). Esc cancels.', mn: 'Төгсгөлийн цэгийг (A′) дарна уу. Esc — болих.' }) : tr({ en: 'Click the start point of the section (A).', mn: 'Зүсэлтийн эхлэх цэгийг (A) дарна уу.' })) : null;

  return html`<div class="map-box" ref=${boxRef}>
    <svg
      ref=${svgRef}
      class=${'map-svg' + (tool === 'section' ? ' drawing' : '')}
      width=${w}
      height=${h}
      tabindex="0"
      role="application"
      aria-label=${tr({ en: 'Plan map of drill holes. Drag to pan, wheel or +/− to zoom, arrow keys to move.', mn: 'Цооногийн план зураг. Чирж зөөнө, дугуй эсвэл +/− товчоор томруулна, сумаар хөдөлгөнө.' })}
      onPointerDown=${onPointerDown}
      onPointerMove=${onPointerMove}
      onPointerUp=${onPointerUp}
      onPointerCancel=${onPointerUp}
      onPointerLeave=${(e) => {
        if (!st.pointers.size) {
          setHover(null);
          readoutBind.current?.(null);
        }
      }}
      onDblClick=${onDbl}
      onKeyDown=${onKey}
    >
      ${grid}
      <g transform=${`translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${v.k})`}>
        ${selH && selH.xs.length > 1 ? html`<path class="map-halo" d=${'M' + [...selH.xs].map((x, i) => `${x.toFixed(2)} ${(-selH.ys[i]).toFixed(2)}`).join('L')} />` : null}
        <${TraceLayer} paths=${paths} />
      </g>
      ${secLayer}
      ${ticksEOH}
      ${markers}
      ${labels}
      ${scalebar}
      <g class="map-north" transform=${`translate(${w - 30} 34)`} aria-hidden="true">
        <circle r="17" />
        <path d="M0 -12 L6 6 L0 2 L-6 6 Z" />
        <text y="-19" text-anchor="middle">N</text>
      </g>
    </svg>
    <div class="map-zoom">
      <${IconButton} icon="plus" title=${tr({ en: 'Zoom in', mn: 'Томруулах' })} onClick=${() => zoomBtn(1.5)} />
      <button class="icon-btn" type="button" title=${tr({ en: 'Zoom out', mn: 'Жижигрүүлэх' })} aria-label=${tr({ en: 'Zoom out', mn: 'Жижигрүүлэх' })} onClick=${() => zoomBtn(1 / 1.5)}><span class="map-minus">−</span></button>
      <${IconButton} icon="target" title=${tr({ en: 'Fit shown holes', mn: 'Харагдах цооногуудад багтаах' })} onClick=${fit} />
    </div>
    ${hint ? html`<div class="map-hint" role="status">${hint}</div>` : null}
  </div>`;
}

function boundsOf(list) {
  const b = emptyBounds();
  for (const h of list) {
    extendBounds(b, h.bb.minX, h.bb.minY);
    extendBounds(b, h.bb.maxX, h.bb.maxY);
  }
  return b;
}

/** Cursor E/N readout, fed imperatively so mouse moves do not re-render the map. */
function Readout({ bind }) {
  const [p, setP] = useState(null);
  useEffect(() => {
    bind.current = setP;
    return () => {
      bind.current = null;
    };
  }, []);
  if (!p) return null;
  return html`<div class="map-readout num" aria-live="off">E ${fmtCoord(p[0])} · N ${fmtCoord(p[1])}</div>`;
}

// ---------------------------------------------------------- hole summary

function HoleSummary({ id, onClose }) {
  const c = hole(id);
  if (!c) return null;
  const m = M();
  const lith = rows('lith', id);
  const logged = coverage(lith);
  const samples = rows('samples', id);
  const prim = samples.filter(isPrimarySample);
  const assayed = prim.filter((s) => assayValues(s.sampleId)).length;
  const qc = samples.length - prim.length;
  const surveys = rows('survey', id).length;
  const eoh = isNum(c.eoh) ? c.eoh : null;
  const pct = eoh ? Math.min(100, (100 * logged) / eoh) : null;
  const t = traceOf(id);
  return html`<aside class="viz-card map-info" aria-label=${tr({ en: 'Hole summary', mn: 'Цооногийн товч' })}>
    <div class="viz-card-head">
      <b class="mono">${id}</b>
      <span class="pill"><${Swatch} color=${codeColor('HOLESTATUS', c.status)} size=${8} /> ${meaning('HOLESTATUS', c.status) || c.status || '—'}</span>
      <button class="icon-btn" style="width:26px;height:26px" onClick=${onClose} aria-label=${tr({ en: 'Close', mn: 'Хаах' })}><${Icon} name="x" size=${15} /></button>
    </div>
    <dl>
      ${c.prospect ? html`<dt>${tr({ en: 'Prospect', mn: 'Талбай' })}</dt><dd>${c.prospect}</dd>` : null}
      <dt>${tr({ en: 'Collar', mn: 'Ам' })}</dt>
      <dd class="mono" style="font-size:11.5px">${fmtCoord(c.east)}E ${fmtCoord(c.north)}N${isNum(c.rl) ? ` · ${fmt(c.rl, 1)} RL` : ''}</dd>
      <dt>${tr({ en: 'Az / dip', mn: 'Азимут / налуу' })}</dt>
      <dd>${isNum(c.azimuth) ? fmt(c.azimuth, 1) + '°' : '—'} / ${isNum(c.dip) ? fmt(c.dip, 1) + '°' : '—'}</dd>
      <dt>${tr({ en: 'EOH', mn: 'Эцсийн гүн' })}</dt>
      <dd>${eoh !== null ? `${fmt(eoh, 2)} ${m}` : isNum(c.plannedDepth) ? `${fmt(c.plannedDepth, 1)} ${m} (${tr({ en: 'planned', mn: 'төлөвлөсөн' })})` : '—'}</dd>
      <dt>${tr({ en: 'Logged', mn: 'Логдсон' })}</dt>
      <dd>${fmt(logged, 1)} ${m}${pct !== null ? html` <small class="muted">(${fmt(pct, 0)}%)</small>` : null}</dd>
      <dt>${tr({ en: 'Samples', mn: 'Дээж' })}</dt>
      <dd>${prim.length}${prim.length ? html` <small class="muted">(${tr({ en: '{n} assayed', mn: '{n} шинжлэгдсэн' }, { n: assayed })}${qc ? ', ' + tr({ en: '{n} QC', mn: '{n} QC' }, { n: qc }) : ''})</small>` : null}</dd>
      <dt>${tr({ en: 'Surveys', mn: 'Гүний хэмжилт' })}</dt>
      <dd>${surveys}</dd>
      ${c.startDate ? html`<dt>${tr({ en: 'Drilled', mn: 'Өрөмдсөн' })}</dt><dd>${c.startDate}${c.endDate ? ' – ' + c.endDate : ''}</dd>` : null}
    </dl>
    ${pct !== null ? html`<span class="meter" role="meter" aria-valuenow=${Math.round(pct)} aria-valuemin="0" aria-valuemax="100" title=${tr({ en: 'Logged share of EOH', mn: 'Эцсийн гүнээс логдсон хувь' })}><i style=${`width:${pct}%`}></i></span>` : null}
    ${t?.planned && !isNum(c.eoh) ? html`<small class="muted">${tr({ en: 'Trace drawn to the planned depth.', mn: 'Төлөвлөсөн гүн хүртэл зурсан.' })}</small>` : null}
    <div class="row">
      <${Button} size="sm" kind="primary" icon="log" onClick=${() => navigate('#/hole/' + encodeURIComponent(id))}>${tr({ en: 'Open hole', mn: 'Цооног нээх' })}<//>
    </div>
  </aside>`;
}

// ---------------------------------------------------------------- section

/** Traces inside the section corridor, clipped and projected: {f, holes, zmin, zmax}. */
function sectionModel(section, data, shownIds) {
  const f = sectionFrame(section.a, section.b);
  const width = Math.max(1, section.width || 50);
  const out = [];
  let zmin = Infinity;
  let zmax = -Infinity;
  for (const hh of data.holes) {
    if (!shownIds.has(hh.id)) continue;
    const whole = clipToCorridor(f, hh.pts, width);
    if (!whole.length) continue;
    const pieces = [];
    for (const pc of hh.pieces) {
      const runs = clipToCorridor(f, pc.pts, width);
      if (runs.length) pieces.push({ color: pc.color, gap: pc.gap, runs });
    }
    for (const run of whole)
      for (const q of run) {
        if (q.z < zmin) zmin = q.z;
        if (q.z > zmax) zmax = q.z;
      }
    const p0 = hh.pts[0].p;
    const col = toSection(f, p0[0], p0[1]);
    out.push({ id: hh.id, status: hh.c.status, planned: hh.planned, whole, pieces, collar: { ...col, z: p0[2], inside: Math.abs(col.across) <= width && col.along >= 0 && col.along <= f.len }, entry: whole[0][0] });
  }
  return { f, width, holes: out, zmin, zmax };
}

function SectionPanel({ section, onSection, onClose, data, shownIds, colouring, theme, selected, onSelect, height }) {
  const boxRef = useRef(null);
  const svgRef = useRef(null);
  const tipRef = useRef(null);
  const { w: W, h: H } = useSize(boxRef);
  const [ve, setVe] = usePref('map.secVE', 1);
  const [widthText, setWidthText] = useState(String(section.width ?? 50));
  useEffect(() => setWidthText(String(section.width ?? 50)), [section.width]);
  const sm = useMemo(() => sectionModel(section, data, shownIds), [section, data, shownIds]);
  const m = M();
  const f = sm.f;

  // layout: equal horizontal / vertical scale × VE, centred in the panel
  const ml = 62;
  const mr = 18;
  const mt = 26;
  const mb = 36;
  let zmin = sm.zmin;
  let zmax = sm.zmax;
  if (!isFinite(zmin)) {
    const rl = data.holes.length ? data.holes.reduce((a, x) => a + x.pts[0].p[2], 0) / data.holes.length : 0;
    zmin = rl - 150;
    zmax = rl + 10;
  }
  const zpad = Math.max(10, (zmax - zmin) * 0.06);
  zmin -= zpad;
  zmax += zpad;
  const len = Math.max(f.len, 1);
  const zr = Math.max(zmax - zmin, 1);
  const iw = Math.max(40, W - ml - mr);
  const ih = Math.max(40, H - mt - mb);
  const k = Math.min(iw / len, ih / (zr * ve));
  const x0 = ml + (iw - len * k) / 2;
  const y0 = mt + (ih - zr * k * ve) / 2;
  const X = (a) => x0 + a * k;
  const Y = (z) => y0 + (zmax - z) * k * ve;

  // screen-space copies of the traces for hover picking
  const pickData = useMemo(
    () =>
      sm.holes.map((hh) => ({
        id: hh.id,
        runs: hh.whole.map((run) => ({ xs: run.map((q) => X(q.along)), ys: run.map((q) => Y(q.z)), mds: run.map((q) => q.md) })),
      })),
    [sm, W, H, ve],
  );
  const pick = (mx, my) => {
    let best = null;
    for (const hh of pickData)
      for (const r of hh.runs) {
        const n = nearestOnPolyline(r.xs, r.ys, r.mds, mx, my);
        if (n && n.d2 <= 100 && (!best || n.d2 < best.d2)) {
          const j = Math.min(n.i + 1, r.xs.length - 1);
          best = { id: hh.id, md: n.md, d2: n.d2, px: r.xs[n.i] + (r.xs[j] - r.xs[n.i]) * n.t, py: r.ys[n.i] + (r.ys[j] - r.ys[n.i]) * n.t };
        }
      }
    return best;
  };
  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const onMove = (e) => {
    const [mx, my] = local(e);
    const p = pick(mx, my);
    tipRef.current?.(p ? { id: p.id, md: p.md, x: mx, y: my, px: p.px, py: p.py } : null);
    svgRef.current.style.cursor = p ? 'pointer' : '';
  };

  // grouped trace paths
  const groups = new Map();
  for (const hh of sm.holes)
    for (const pc of hh.pieces) {
      const key = `${pc.gap ? 0 : 1}|${hh.planned ? 1 : 0}|${pc.color}`;
      let d = '';
      for (const run of pc.runs) d += 'M' + run.map((q) => `${X(q.along).toFixed(1)} ${Y(q.z).toFixed(1)}`).join('L');
      groups.set(key, (groups.get(key) || '') + d);
    }
  const paths = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const aTicks = ticks(0, len, niceStep(len, Math.max(2, (len * k) / 110)));
  const zTicks = ticks(zmin, zmax, niceStep(zr, Math.max(2, (zr * k * ve) / 46)));
  const fx0 = X(0);
  const fx1 = X(len);
  const fy0 = Y(zmax);
  const fy1 = Y(zmin);
  const placed =
    W && H
      ? placeLabels(
          sm.holes
            .slice()
            .sort((a, b) => (b.id === selected) - (a.id === selected))
            .map((hh) => {
              const p = hh.collar.inside ? hh.collar : hh.entry;
              return { id: hh.id, x: X(p.along), y: Y(p.z), w: hh.id.length * 6.7 + 4, h: 13 };
            }),
          { width: W, height: H, candidates: [[0, -13, 'c'], [6, -11, 'l'], [-6, -11, 'r'], [8, 0, 'l'], [-8, 0, 'r'], [0, -26, 'c']] },
        )
      : [];
  const mono = theme.mono;
  const font = theme.font;

  const save = async () => {
    const el = svgRef.current;
    if (!el) return;
    try {
      const clone = el.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.querySelectorAll('[data-noexport]').forEach((n) => n.remove());
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${S.project?.name || 'ORD'} – section A–A′`;
      clone.insertBefore(title, clone.firstChild);
      const str = '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
      await saveFile('ord_section.svg', str, 'image/svg+xml');
    } catch (e) {
      console.error(e);
      toast(tr({ en: 'Could not save the section', mn: 'Зүсэлтийг хадгалж чадсангүй' }), { kind: 'err' });
    }
  };
  const commitWidth = () => {
    const v = parseFloat(widthText);
    if (v > 0 && v <= 5000) onSection({ ...section, width: v });
    else setWidthText(String(section.width ?? 50));
  };

  return html`<section class="map-section" style=${`flex:0 0 ${height}`} aria-label=${tr({ en: 'Cross-section', mn: 'Хөндлөн зүсэлт' })}>
    <header class="map-sec-head">
      <b>A–A′</b>
      <span class="muted num">${fmt(f.len, 0)} ${m} · ${fmt(f.bearing, 0)}° ${compass(f.bearing)} · ${tr({ en: 'looking', mn: 'харах чиг' })} ${compass(f.facing)}</span>
      <label class="grp">
        <span class="lbl">±</span>
        <input class="inp num" type="number" min="1" step="5" value=${widthText} style="width:72px" onInput=${(e) => setWidthText(e.target.value)} onChange=${commitWidth} onKeyDown=${(e) => e.key === 'Enter' && commitWidth()} aria-label=${tr({ en: 'Corridor half-width (m)', mn: 'Зурвасын хагас өргөн (м)' })} />
        <span class="lbl">${m}</span>
      </label>
      <label class="grp">
        <span class="lbl">${tr({ en: 'Vert. exag.', mn: 'Босоо томр.' })}</span>
        <select class="inp" value=${String(ve)} onChange=${(e) => setVe(+e.target.value)}>
          ${[1, 1.5, 2, 3].map((x) => html`<option value=${String(x)}>${x}×</option>`)}
        </select>
      </label>
      <span class="muted">${tr({ en: '{n} holes', mn: '{n} цооног' }, { n: sm.holes.length })}</span>
      <span class="spacer"></span>
      <${Button} size="sm" onClick=${() => onSection({ ...section, a: section.b, b: section.a })} title=${tr({ en: 'Swap ends (look the other way)', mn: 'Төгсгөлийг солих (эсрэг талаас харах)' })}>A ⇄ A′<//>
      <${Button} size="sm" icon="download" onClick=${save}>${tr({ en: 'Save SVG', mn: 'SVG хадгалах' })}<//>
      <${IconButton} icon="x" title=${tr({ en: 'Remove section', mn: 'Зүсэлт арилгах' })} onClick=${onClose} />
    </header>
    <div class="map-sec-box" ref=${boxRef}>
      ${W && H
        ? html`<svg
            ref=${svgRef}
            width=${W}
            height=${H}
            viewBox=${`0 0 ${W} ${H}`}
            font-family=${font}
            onPointerMove=${onMove}
            onPointerLeave=${() => tipRef.current?.(null)}
            onClick=${(e) => {
              const [mx, my] = local(e);
              const p = pick(mx, my);
              onSelect(p ? p.id : null);
            }}
            onDblClick=${(e) => {
              const [mx, my] = local(e);
              const p = pick(mx, my);
              if (p) navigate('#/hole/' + encodeURIComponent(p.id));
            }}
            role="img"
            aria-label=${tr({ en: 'Section A–A′: distance along the line against RL', mn: 'A–A′ зүсэлт: шугамын дагуух зай, RL өндөр' })}
          >
            <rect x="0" y="0" width=${W} height=${H} fill=${theme.surface} />
            <g stroke=${theme.line} stroke-width="1">
              ${aTicks.map((a) => html`<line x1=${X(a)} x2=${X(a)} y1=${fy0} y2=${fy1} />`)}
              ${zTicks.map((z) => html`<line x1=${fx0} x2=${fx1} y1=${Y(z)} y2=${Y(z)} />`)}
            </g>
            <rect x=${fx0} y=${fy0} width=${fx1 - fx0} height=${fy1 - fy0} fill="none" stroke=${theme.line2} stroke-width="1" />
            <g fill=${theme.muted} font-size="10.5" font-family=${mono}>
              ${aTicks.map((a) => html`<text x=${X(a)} y=${fy1 + 14} text-anchor="middle">${fmt(a, 0)}</text>`)}
              ${zTicks.map((z) => html`<text x=${fx0 - 6} y=${Y(z) + 3.5} text-anchor="end">${fmt(z, 0)}</text>`)}
            </g>
            <text x=${(fx0 + fx1) / 2} y=${Math.min(H - 4, fy1 + 30)} text-anchor="middle" font-size="11" fill=${theme.ink2}>${tr({ en: 'Distance along A–A′ (m)', mn: 'A–A′ шугамын дагуух зай (м)' })}</text>
            <text transform=${`translate(${Math.max(12, fx0 - 46)} ${(fy0 + fy1) / 2}) rotate(-90)`} text-anchor="middle" font-size="11" fill=${theme.ink2}>${tr({ en: 'RL (m)', mn: 'RL өндөр (м)' })}</text>
            <text x=${fx0} y=${fy0 - 8} font-size="12" font-weight="700" fill=${theme.ink}>A</text>
            <text x=${fx1} y=${fy0 - 8} font-size="12" font-weight="700" fill=${theme.ink} text-anchor="end">A′</text>
            <g fill="none" stroke-linejoin="round">
              ${paths.map(([key, d]) => {
                const [solid, planned, color] = key.split('|');
                return html`<path d=${d} stroke=${color} stroke-width=${solid === '1' ? 5 : 3} stroke-opacity=${planned === '1' ? 0.5 : 1} />`;
              })}
            </g>
            ${sm.holes.map((hh) =>
              hh.collar.inside
                ? html`<circle cx=${X(hh.collar.along)} cy=${Y(hh.collar.z)} r=${hh.id === selected ? 5.5 : 4} fill=${hh.planned ? theme.surface : codeColor('HOLESTATUS', hh.status)} stroke=${hh.id === selected ? theme.accent : hh.planned ? codeColor('HOLESTATUS', hh.status) : theme.surface} stroke-width="2" />`
                : html`<circle cx=${X(hh.entry.along)} cy=${Y(hh.entry.z)} r="3" fill=${theme.surface} stroke=${theme.muted} stroke-width="1.5" />`,
            )}
            <g font-size="11" font-family=${mono} font-weight="500">
              ${placed.map(
                (p) => html`<text x=${p.tx} y=${p.ty + 4} text-anchor=${p.anchor} fill=${p.id === selected ? theme.accent : theme.ink} stroke=${theme.surface} stroke-width="3" paint-order="stroke" stroke-linejoin="round">${p.id}</text>`,
              )}
            </g>
            ${!sm.holes.length
              ? html`<text x=${(fx0 + fx1) / 2} y=${(fy0 + fy1) / 2} text-anchor="middle" font-size="13" fill=${theme.muted}>${tr({ en: 'No shown holes pass through this corridor', mn: 'Энэ зурвасаар харагдах цооног дайрахгүй байна' })}</text>`
              : null}
          </svg>`
        : null}
      <${HoverLayer} bind=${tipRef} colouring=${colouring} w=${W} h=${H} />
    </div>
  </section>`;
}

// -------------------------------------------------------------- map view

export function MapView({ params }) {
  const rev = useStore();
  const theme = useTheme();
  const [filter, setFilter] = useVizFilter();
  const [cp, setCp] = useColourPrefs();
  const [sideOpen, setSideOpen] = useState(() => !window.matchMedia?.('(max-width: 820px)').matches);
  const initialHole = params?.holeId || hashParam('hole') || null;
  const [selected, setSelected] = useState(initialHole);
  const [focus, setFocus] = useState(initialHole ? { id: initialHole, n: 0 } : null);
  const [tool, setTool] = useState('');
  const [section, setSection] = usePref('map.section.' + (S.pid || 'none'), null);
  const [secShare] = usePref('map.secShare', 42);
  const hoverRef = useRef(null);
  const readoutRef = useRef(null);
  const stageRef = useRef(null);
  const size = useSize(stageRef);

  const all = useMemo(() => mappableHoles(), [rev]);
  const total = useMemo(() => holes().length, [rev]);
  const shown = useMemo(() => all.filter((c) => matchFilter(c, filter)), [all, filter]);
  const shownIds = useMemo(() => new Set(shown.map((c) => c.holeId)), [shown]);
  const colouring = useMemo(() => buildColouring({ ...cp, theme }), [rev, cp.mode, cp.el, cp.method, theme.key]);
  const data = useMemo(() => planData(all, colouring), [all, colouring]);
  const paths = useMemo(() => tracePaths(data, shownIds), [data, shownIds]);
  const legend = useMemo(() => colouring.legend(shownIds), [colouring, shownIds]);
  const validSection = section && Array.isArray(section.a) && Array.isArray(section.b) && section.a.every(isNum) && section.b.every(isNum);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && tool) setTool('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool]);

  const pick = (id) => {
    setSelected(id);
    setFocus({ id, n: (focus?.n || 0) + 1 });
    if (window.matchMedia?.('(max-width: 820px)').matches) setSideOpen(false);
  };

  if (!all.length) {
    return html`<div class="viz vmap">
      <div class="viz-bar"><h1>${tr({ en: 'Map', mn: 'Зураг' })}</h1></div>
      <div class="viz-msg"><div>
        <${Icon} name="map" size=${30} />
        <h3>${tr({ en: 'No holes with coordinates yet', mn: 'Координаттай цооног алга байна' })}</h3>
        <p class="muted">${total
          ? tr({ en: '{n} holes have no Easting/Northing. Add collar coordinates to map them.', mn: '{n} цооногт Easting/Northing алга. Зураглахын тулд амны координат оруулна уу.' }, { n: total })
          : tr({ en: 'Add collars with Easting/Northing to see them here.', mn: 'Easting/Northing координаттай цооногийн ам оруулснаар энд харагдана.' })}</p>
      </div></div>
    </div>`;
  }

  return html`<div class="viz vmap">
    <div class="viz-bar">
      <${IconButton} icon="list" title=${tr({ en: 'Filters and hole list', mn: 'Шүүлтүүр, цооногийн жагсаалт' })} class=${sideOpen ? 'on' : ''} onClick=${() => setSideOpen(!sideOpen)} />
      <h1>${tr({ en: 'Map', mn: 'Зураг' })}</h1>
      <div class="grp">
        <span class="lbl">${tr({ en: 'Colour by', mn: 'Өнгө' })}</span>
        <${Select} value=${colouring.mode} options=${modeOptions()} onChange=${(v) => setCp({ mode: v })} />
        ${colouring.mode === 'assay'
          ? html`<${Select} value=${colouring.el} options=${elementOptions()} onChange=${(v) => setCp({ el: v })} />
              <${Select} value=${cp.method} options=${methodOptions()} onChange=${(v) => setCp({ method: v })} />`
          : null}
      </div>
      <span class="spacer"></span>
      <${Button}
        size="sm"
        kind=${tool === 'section' ? 'primary' : 'default'}
        icon="split"
        aria-pressed=${tool === 'section'}
        onClick=${() => setTool(tool === 'section' ? '' : 'section')}
        title=${tr({ en: 'Draw a section line: click A, then A′', mn: 'Зүсэлтийн шугам татах: A, дараа нь A′ дээр дарна' })}
        >${tool === 'section' ? tr({ en: 'Cancel section', mn: 'Зүсэлт болих' }) : validSection ? tr({ en: 'New section', mn: 'Шинэ зүсэлт' }) : tr({ en: 'Section', mn: 'Зүсэлт' })}<//
      >
    </div>
    <div class="viz-body">
      <${FilterPanel} filter=${filter} setFilter=${setFilter} all=${all} shown=${shown} selected=${selected} onPick=${pick} open=${sideOpen} onClose=${() => setSideOpen(false)} />
      <div class="vmap-main">
        <div class="viz-stage vmap-stage" ref=${stageRef}>
          <${PlanStage}
            data=${data}
            paths=${paths}
            shownIds=${shownIds}
            selected=${selected}
            onSelect=${setSelected}
            colouring=${colouring}
            section=${validSection ? section : null}
            onSection=${setSection}
            tool=${tool}
            onToolDone=${() => setTool('')}
            focus=${focus}
            hoverBind=${hoverRef}
            readoutBind=${readoutRef}
          />
          <${HoverLayer} bind=${hoverRef} colouring=${colouring} w=${size.w} h=${size.h} />
          <${Readout} bind=${readoutRef} />
          <${Legend} legend=${legend} />
          ${selected && hole(selected) ? html`<${HoleSummary} id=${selected} onClose=${() => setSelected(null)} />` : null}
          ${!shown.length
            ? html`<div class="map-empty">
                <span>${tr({ en: 'No holes match the filter', mn: 'Шүүлтүүрт тохирох цооног алга' })}</span>
                <${Button} size="sm" onClick=${() => setFilter({ ...DEFAULT_FILTER })}>${tr({ en: 'Clear filters', mn: 'Шүүлтүүр цэвэрлэх' })}<//>
              </div>`
            : null}
        </div>
        ${validSection
          ? html`<${SectionPanel}
              section=${section}
              onSection=${setSection}
              onClose=${() => setSection(null)}
              data=${data}
              shownIds=${shownIds}
              colouring=${colouring}
              theme=${theme}
              selected=${selected}
              onSelect=${setSelected}
              height=${`${Math.min(70, Math.max(25, secShare))}%`}
            />`
          : null}
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- minimap

function miniData() {
  const list = mappableHoles();
  const b = emptyBounds();
  const hs = [];
  let sx = 0;
  let sy = 0;
  for (const c of list) {
    sx += c.east;
    sy += c.north;
  }
  const ox = list.length ? Math.round(sx / list.length) : 0;
  const oy = list.length ? Math.round(sy / list.length) : 0;
  for (const c of list) {
    const t = traceOf(c.holeId);
    const pts = t ? t.pts : [{ p: [c.east, c.north] }];
    // every ~10 m is plenty for a thumbnail
    const stepN = Math.max(1, Math.floor(pts.length / 40));
    let d = '';
    for (let i = 0; i < pts.length; i += stepN) {
      const x = pts[i].p[0] - ox;
      const y = oy - pts[i].p[1];
      d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      extendBounds(b, x, y);
    }
    const last = pts[pts.length - 1].p;
    d += 'L' + (last[0] - ox).toFixed(1) + ' ' + (oy - last[1]).toFixed(1);
    extendBounds(b, last[0] - ox, oy - last[1]);
    hs.push({ id: c.holeId, x: c.east - ox, y: oy - c.north, d, status: c.status });
  }
  return { holes: hs, bounds: b };
}

/** Plan thumbnail of all collars with one hole highlighted (hole workspace header). */
export function MiniMap({ holeId, height = 120 }) {
  const rev = useStore();
  const d = useMemo(() => miniData(), [rev]);
  const target = d.holes.find((x) => x.id === holeId);
  if (!d.holes.length || !validBounds(d.bounds)) {
    return html`<div class="minimap minimap-empty muted" style=${`height:${height}px`}>${tr({ en: 'No coordinates', mn: 'Координатгүй' })}</div>`;
  }
  const b = d.bounds;
  const span = Math.max(b.maxX - b.minX, b.maxY - b.minY, 80);
  const pad = span * 0.1;
  const vb = [b.minX - pad, b.minY - pad, b.maxX - b.minX + 2 * pad, b.maxY - b.minY + 2 * pad];
  // keep a sensible aspect for very narrow projects (a single fence of holes)
  if (vb[2] < span * 0.5) {
    vb[0] -= (span * 0.5 - vb[2]) / 2;
    vb[2] = span * 0.5;
  }
  if (vb[3] < span * 0.5) {
    vb[1] -= (span * 0.5 - vb[3]) / 2;
    vb[3] = span * 0.5;
  }
  const r = span * 0.014;
  const others = d.holes.filter((x) => x.id !== holeId);
  const open = () => navigate('#/map?hole=' + encodeURIComponent(holeId || ''));
  return html`<div class="minimap" style=${`height:${height}px`}>
    <svg viewBox=${vb.map((x) => x.toFixed(1)).join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label=${tr({ en: 'Location of {id} among all holes (plan, north up)', mn: '{id} цооногийн байршил (план, хойд зүг дээш)' }, { id: holeId || '' })} onClick=${open}>
      <title>${tr({ en: 'Open on the map', mn: 'Зураг дээр нээх' })}</title>
      <path class="mm-trace" d=${others.map((x) => x.d).join('')} />
      ${others.map(
        (x) => html`<circle class="mm-dot" cx=${x.x} cy=${x.y} r=${r} onClick=${(e) => {
          e.stopPropagation();
          navigate('#/hole/' + encodeURIComponent(x.id));
        }}><title>${x.id}</title></circle>`,
      )}
      ${target
        ? html`<path class="mm-target" d=${target.d} />
            <circle class="mm-ring" cx=${target.x} cy=${target.y} r=${r * 2.6} />
            <circle class="mm-hit" cx=${target.x} cy=${target.y} r=${r * 1.4}><title>${target.id}</title></circle>`
        : null}
    </svg>
    <span class="mm-n" aria-hidden="true">N↑</span>
  </div>`;
}

// ----------------------------------------------------------------- styles

injectCSS(
  'map',
  `
.vmap-main { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.vmap-stage { flex: 1 1 auto; min-height: 200px; }
.map-box { position: absolute; inset: 0; }
.map-svg { display: block; width: 100%; height: 100%; touch-action: none; user-select: none; -webkit-user-select: none; outline: none; cursor: grab; }
.map-svg:active { cursor: grabbing; }
.map-svg.drawing { cursor: crosshair; }
.map-svg:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.map-grid line { stroke: var(--line); stroke-width: 1; shape-rendering: crispEdges; }
.map-grid text { font: 10.5px var(--mono); fill: var(--muted); paint-order: stroke; stroke: var(--bg); stroke-width: 3px; stroke-linejoin: round; }
.map-traces path { fill: none; stroke-width: 3.5; vector-effect: non-scaling-stroke; stroke-linejoin: round; stroke-linecap: butt; }
.map-traces path.gap { stroke-width: 2; }
.map-traces path.pln { stroke-opacity: 0.55; }
.map-halo { fill: none; stroke: var(--accent); stroke-opacity: 0.35; stroke-width: 11; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
.map-collar { stroke: var(--surface); stroke-width: 2; }
.map-collar.pln { stroke-width: 2; }
.map-sel { fill: none; stroke: var(--accent); stroke-width: 2.5; }
.map-eoh { stroke: var(--ink-2); stroke-width: 2; stroke-linecap: round; }
.map-lbl { font: 500 11px var(--mono); fill: var(--ink); paint-order: stroke; stroke: var(--bg); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
.map-lbl.sel { fill: var(--accent-2); font-weight: 700; }
.map-scale rect.a { fill: var(--ink-2); }
.map-scale rect.b { fill: var(--surface); stroke: var(--ink-2); stroke-width: 1; }
.map-scale text { font: 10.5px var(--font); fill: var(--ink-2); paint-order: stroke; stroke: var(--bg); stroke-width: 3px; }
.map-north circle { fill: color-mix(in srgb, var(--surface) 88%, transparent); stroke: var(--line-2); }
.map-north path { fill: var(--ink-2); }
.map-north text { font: 700 11px var(--font); fill: var(--ink-2); }
.map-sec polygon { fill: var(--brass); fill-opacity: 0.1; stroke: var(--brass); stroke-opacity: 0.5; stroke-width: 1; }
.map-sec line { stroke: var(--brass); stroke-width: 2.5; }
.map-sec .map-sec-tick { stroke-width: 2.5; }
.map-sec.live line { stroke-dasharray: 6 4; }
.map-sec-lbl { font: 700 12px var(--font); fill: var(--ink); paint-order: stroke; stroke: var(--bg); stroke-width: 3px; }
.map-handle { fill: var(--surface); stroke: var(--brass); stroke-width: 2.5; cursor: move; }
.map-handle:hover { fill: var(--brass-soft); }
.map-draft { fill: var(--brass); }
.map-zoom { position: absolute; left: 12px; bottom: 58px; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: 9px; box-shadow: var(--shadow); overflow: hidden; }
.map-minus { font-size: 20px; line-height: 1; font-weight: 500; }
.map-hint { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); background: var(--ink); color: var(--bg); padding: 6px 12px; border-radius: 8px; font-size: 13px; box-shadow: var(--shadow); pointer-events: none; max-width: calc(100% - 140px); text-align: center; }
.map-readout { position: absolute; left: 14px; bottom: 34px; font: 11px var(--mono); color: var(--ink-2); background: color-mix(in srgb, var(--bg) 75%, transparent); padding: 1px 5px; border-radius: 5px; pointer-events: none; }
.map-info { left: auto; right: 12px; top: 12px; }
.map-info .meter { height: 5px; }
.map-empty { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: grid; gap: 8px; justify-items: center; background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; box-shadow: var(--shadow); }
.vmap .viz-legend { bottom: 12px; }
.map-section { flex: none; min-height: 220px; border-top: 1px solid var(--line-2); background: var(--surface); display: flex; flex-direction: column; }
.map-sec-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; padding: 6px 12px; border-bottom: 1px solid var(--line); font-size: 13px; }
.map-sec-head .grp { display: inline-flex; align-items: center; gap: 5px; }
.map-sec-head .lbl { font-size: 12px; color: var(--muted); }
.map-sec-head .inp { padding: 3px 7px; font-size: 13px; }
.map-sec-box { flex: 1; min-height: 0; position: relative; overflow: hidden; }
.map-sec-box svg { display: block; }
.minimap { position: relative; border: 1px solid var(--line); border-radius: 8px; background: var(--surface-2); overflow: hidden; cursor: pointer; }
.minimap svg { display: block; width: 100%; height: 100%; }
.minimap-empty { display: grid; place-items: center; font-size: 12px; cursor: default; }
.mm-trace { fill: none; stroke: var(--line-2); stroke-width: 1.2; vector-effect: non-scaling-stroke; }
.mm-dot { fill: var(--muted); fill-opacity: 0.7; cursor: pointer; }
.mm-dot:hover { fill: var(--ink); fill-opacity: 1; }
.mm-target { fill: none; stroke: var(--accent); stroke-width: 2.5; vector-effect: non-scaling-stroke; stroke-linecap: round; }
.mm-ring { fill: none; stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
.mm-hit { fill: var(--accent); }
.mm-n { position: absolute; right: 5px; top: 3px; font: 600 10px var(--font); color: var(--muted); pointer-events: none; }
@media (max-width: 820px) {
  .map-info { top: auto; bottom: 12px; right: 12px; left: 12px; max-width: none; }
  .map-section { min-height: 200px; }
  .map-readout { display: none; }
}
`,
);

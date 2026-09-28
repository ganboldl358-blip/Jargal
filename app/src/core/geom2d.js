// Plan / section geometry shared by the map, the section tool and the 3D view.
// Pure functions (no DOM, no store) so they are unit-tested under node.
//
// Coordinates: x = Easting, y = Northing, z = RL (up). A trace point is
// {md, p:[x, y, z]} as produced by desurvey's polyline().

import { isNum } from './util.js';

const EPS = 1e-9;

// ------------------------------------------------------------ ticks & scale

/** A 1-2-5 step giving about `target` intervals over `span`. */
export function niceStep(span, target = 5) {
  if (!(span > 0) || !(target > 0)) return 1;
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

/** Largest 1-2-5 value <= v (scale bars). */
export function niceFloor(v) {
  if (!(v > 0)) return 0;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  return (n >= 5 ? 5 : n >= 2 ? 2 : 1) * mag;
}

/** Multiples of `step` inside [min, max]. */
export function ticks(min, max, step) {
  if (!(step > 0) || !isNum(min) || !isNum(max) || max < min) return [];
  const out = [];
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  if (last - first > 2000) return out;
  const dp = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  for (let i = first; i <= last; i++) out.push(Number((i * step).toFixed(dp)));
  return out;
}

// ------------------------------------------------------------------ bounds

export function emptyBounds() {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function extendBounds(b, x, y) {
  if (x < b.minX) b.minX = x;
  if (x > b.maxX) b.maxX = x;
  if (y < b.minY) b.minY = y;
  if (y > b.maxY) b.maxY = y;
  return b;
}

export const validBounds = (b) => b && isFinite(b.minX) && isFinite(b.maxX) && isFinite(b.minY) && isFinite(b.maxY);

/** View {cx, cy, k} (centre + pixels per metre) that fits bounds in a w×h box. */
export function fitView(b, w, h, margin = 40, minSpan = 50) {
  if (!validBounds(b) || !(w > 0) || !(h > 0)) return { cx: 0, cy: 0, k: 1 };
  const sx = Math.max(b.maxX - b.minX, minSpan);
  const sy = Math.max(b.maxY - b.minY, minSpan);
  const k = Math.min(Math.max(w - 2 * margin, 20) / sx, Math.max(h - 2 * margin, 20) / sy);
  return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, k };
}

/** World (x, y) -> screen for a view {cx, cy, k} in a w×h viewport (north up). */
export function worldToScreen(v, w, h, x, y) {
  return [w / 2 + (x - v.cx) * v.k, h / 2 - (y - v.cy) * v.k];
}

export function screenToWorld(v, w, h, sx, sy) {
  return [v.cx + (sx - w / 2) / v.k, v.cy - (sy - h / 2) / v.k];
}

/** Zoom by `f` keeping the world point under screen (sx, sy) fixed. */
export function zoomAt(v, w, h, sx, sy, f, kMin = 1e-4, kMax = 1e3) {
  const k = Math.max(kMin, Math.min(kMax, v.k * f));
  const [wx, wy] = screenToWorld(v, w, h, sx, sy);
  return { cx: wx - (sx - w / 2) / k, cy: wy + (sy - h / 2) / k, k };
}

// ----------------------------------------------------------- polylines

/** Point on a trace at measured depth md (linear between samples). */
export function interpAt(pts, md) {
  if (!pts?.length) return null;
  if (md <= pts[0].md) return pts[0].p;
  const n = pts.length;
  if (md >= pts[n - 1].md) return pts[n - 1].p;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (pts[m].md <= md) lo = m;
    else hi = m;
  }
  const a = pts[lo];
  const b = pts[hi];
  const f = b.md > a.md ? (md - a.md) / (b.md - a.md) : 0;
  return [a.p[0] + (b.p[0] - a.p[0]) * f, a.p[1] + (b.p[1] - a.p[1]) * f, a.p[2] + (b.p[2] - a.p[2]) * f];
}

/** Sub-trace between depths `from` and `to`, with interpolated end points. */
export function slicePolyline(pts, from, to) {
  if (!pts?.length || !(to >= from)) return [];
  const out = [{ md: from, p: interpAt(pts, from) }];
  for (const q of pts) if (q.md > from + EPS && q.md < to - EPS) out.push(q);
  if (to > from + EPS) out.push({ md: to, p: interpAt(pts, to) });
  return out;
}

/**
 * Split a trace into coloured pieces from depth intervals.
 * intervals: [{from, to, color}] (any order; overlaps resolved first-come).
 * Uncovered depths become pieces with `gap: true` and the neutral colour.
 * Adjacent pieces of the same colour are merged. Returns [{from, to, color, gap, pts}].
 */
export function colourPieces(pts, intervals, neutral = '#999999') {
  if (!pts?.length) return [];
  const start = pts[0].md;
  const end = pts[pts.length - 1].md;
  if (!(end > start)) return [{ from: start, to: end, color: neutral, gap: true, pts: [pts[0]] }];
  const iv = (intervals || [])
    .filter((r) => isNum(r.from) && isNum(r.to) && r.to > r.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const raw = [];
  let cur = start;
  for (const r of iv) {
    if (r.to <= cur + EPS) continue;
    if (r.from >= end - EPS) break;
    const a = Math.max(r.from, cur);
    const b = Math.min(r.to, end);
    if (a > cur + EPS) raw.push({ from: cur, to: a, color: neutral, gap: true });
    if (b > a + EPS) raw.push({ from: a, to: b, color: r.color || neutral, gap: !r.color });
    cur = Math.max(cur, b);
  }
  if (end > cur + EPS) raw.push({ from: cur, to: end, color: neutral, gap: true });
  const merged = [];
  for (const p of raw) {
    const last = merged[merged.length - 1];
    if (last && last.color === p.color && last.gap === p.gap && Math.abs(last.to - p.from) < 1e-6) last.to = p.to;
    else merged.push({ ...p });
  }
  for (const m of merged) m.pts = slicePolyline(pts, m.from, m.to);
  return merged;
}

/** The interval row containing depth md (first match), or null. */
export function intervalAt(list, md) {
  if (!list || !isNum(md)) return null;
  for (const r of list) if (isNum(r.from) && isNum(r.to) && md >= r.from - EPS && md < r.to + EPS) return r;
  return null;
}

/** Closest point of segment AB to P: {t, d2}. */
export function nearestOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const L = dx * dx + dy * dy;
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + dx * t - px;
  const y = ay + dy * t - py;
  return { t, d2: x * x + y * y };
}

/**
 * Nearest point of a 2D polyline given as flat arrays xs, ys (screen coords),
 * with `mds` measured depths. Returns {i, t, d2, md} or null.
 */
export function nearestOnPolyline(xs, ys, mds, px, py) {
  const n = xs.length;
  if (!n) return null;
  let best = null;
  if (n === 1) {
    const d2 = (xs[0] - px) ** 2 + (ys[0] - py) ** 2;
    return { i: 0, t: 0, d2, md: mds ? mds[0] : 0 };
  }
  for (let i = 0; i < n - 1; i++) {
    if (!isFinite(xs[i]) || !isFinite(xs[i + 1])) continue;
    const r = nearestOnSegment(px, py, xs[i], ys[i], xs[i + 1], ys[i + 1]);
    if (!best || r.d2 < best.d2) best = { i, t: r.t, d2: r.d2 };
  }
  if (best && mds) best.md = mds[best.i] + (mds[best.i + 1] - mds[best.i]) * best.t;
  return best;
}

// -------------------------------------------------------------- sections

/**
 * Section frame for a line A->B in plan. `u` runs A->B, `n` is u turned 90°
 * anticlockwise: the direction the viewer faces (A on the left, B on the right).
 */
export function sectionFrame(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const u = len > 0 ? [dx / len, dy / len] : [1, 0];
  const n = [-u[1], u[0]];
  const bearing = ((Math.atan2(u[0], u[1]) * 180) / Math.PI + 360) % 360;
  const facing = ((Math.atan2(n[0], n[1]) * 180) / Math.PI + 360) % 360;
  return { a, b, u, n, len, bearing, facing };
}

/** Plan point -> {along, across} in a section frame. */
export function toSection(f, x, y) {
  const dx = x - f.a[0];
  const dy = y - f.a[1];
  return { along: dx * f.u[0] + dy * f.u[1], across: dx * f.n[0] + dy * f.n[1] };
}

/** Section coordinates back to plan (x, y). */
export function fromSection(f, along, across = 0) {
  return [f.a[0] + f.u[0] * along + f.n[0] * across, f.a[1] + f.u[1] * along + f.n[1] * across];
}

/** Liang–Barsky clip of segment (x0,y0)-(x1,y1) to a box; returns [t0, t1] or null. */
export function clipSegment(x0, y0, x1, y1, xmin, xmax, ymin, ymax) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - xmin, xmax - x0, y0 - ymin, ymax - y0];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < EPS) {
      if (q[i] < -EPS) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [t0, t1];
}

/**
 * Parts of a trace inside a section corridor (|across| <= halfWidth and
 * -pad <= along <= len + pad). Returns runs: [[{md, along, across, z}, ...], ...].
 */
export function clipToCorridor(f, pts, halfWidth, { pad = 0 } = {}) {
  if (!pts?.length) return [];
  const sp = pts.map((q) => {
    const s = toSection(f, q.p[0], q.p[1]);
    return { md: q.md, along: s.along, across: s.across, z: q.p[2] };
  });
  const xmin = -pad;
  const xmax = f.len + pad;
  const inside = (s) => s.along >= xmin - EPS && s.along <= xmax + EPS && Math.abs(s.across) <= halfWidth + EPS;
  if (sp.length === 1) return inside(sp[0]) ? [[sp[0]]] : [];
  const lerp = (a, b, t) => ({ md: a.md + (b.md - a.md) * t, along: a.along + (b.along - a.along) * t, across: a.across + (b.across - a.across) * t, z: a.z + (b.z - a.z) * t });
  const runs = [];
  let run = null;
  for (let i = 0; i < sp.length - 1; i++) {
    const a = sp[i];
    const b = sp[i + 1];
    const c = clipSegment(a.along, a.across, b.along, b.across, xmin, xmax, -halfWidth, halfWidth);
    if (!c) {
      run = null;
      continue;
    }
    const [t0, t1] = c;
    const p0 = t0 <= EPS ? a : lerp(a, b, t0);
    const p1 = t1 >= 1 - EPS ? b : lerp(a, b, t1);
    if (run && t0 <= EPS) run.push(p1);
    else {
      run = [p0, p1];
      runs.push(run);
    }
    if (t1 < 1 - EPS) run = null;
  }
  return runs;
}

// ------------------------------------------------------------ labelling

// Candidate label boxes around an anchor (marker radius ~5 px):
// [dx, dy, align] where align l/r/c says which box edge sits at x+dx and dy is the box centre.
export const LABEL_CANDIDATES = [
  [8, -7, 'l'],
  [8, 7, 'l'],
  [-8, -7, 'r'],
  [-8, 7, 'r'],
  [0, -14, 'c'],
  [0, 14, 'c'],
  [10, 0, 'l'],
  [-10, 0, 'r'],
];

/**
 * Greedy label placement with collision avoidance. `items` in priority order:
 * [{id, x, y, w, h}]. Obstacles: [[x0, y0, x1, y1]] (e.g. markers).
 * Returns [{id, x0, y0, x1, y1, tx, ty, anchor}] for labels that fit; the rest are dropped.
 */
export function placeLabels(items, { width = Infinity, height = Infinity, obstacles = [], candidates = LABEL_CANDIDATES, gap = 2, cell = 64 } = {}) {
  const grid = new Map();
  const key = (i, j) => i * 100003 + j;
  const cells = (b, fn) => {
    const i0 = Math.floor(b[0] / cell);
    const i1 = Math.floor(b[2] / cell);
    const j0 = Math.floor(b[1] / cell);
    const j1 = Math.floor(b[3] / cell);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) if (fn(key(i, j)) === false) return false;
    return true;
  };
  const add = (b) => cells(b, (k) => {
    let l = grid.get(k);
    if (!l) grid.set(k, (l = []));
    l.push(b);
  });
  const hits = (b) => !cells(b, (k) => {
    const l = grid.get(k);
    if (!l) return true;
    for (const o of l) if (b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]) return false;
    return true;
  });
  for (const o of obstacles) add(o);
  const out = [];
  for (const it of items) {
    if (!isFinite(it.x) || !isFinite(it.y)) continue;
    for (const [dx, dy, al] of candidates) {
      const x0 = al === 'l' ? it.x + dx : al === 'r' ? it.x + dx - it.w : it.x + dx - it.w / 2;
      const y0 = it.y + dy - it.h / 2;
      const b = [x0, y0, x0 + it.w, y0 + it.h];
      if (b[0] < 0 || b[1] < 0 || b[2] > width || b[3] > height) continue;
      const bg = [b[0] - gap, b[1] - gap, b[2] + gap, b[3] + gap];
      if (hits(bg)) continue;
      add(b);
      out.push({ id: it.id, x0: b[0], y0: b[1], x1: b[2], y1: b[3], tx: al === 'l' ? b[0] : al === 'r' ? b[2] : (b[0] + b[2]) / 2, ty: it.y + dy, anchor: al === 'l' ? 'start' : al === 'r' ? 'end' : 'middle' });
      break;
    }
  }
  return out;
}

/** Bearing in degrees -> 16-point compass (N, NNE, …). */
export function compass(deg) {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}

// Minimum-curvature desurvey. Coordinates: x = Easting, y = Northing, z = RL (up).
// Dip is negative-down (MX / Leapfrog convention) unless the project says otherwise.

import { isNum } from './util.js';
import { rows, hole, settings, memo } from './store.js';

const D2R = Math.PI / 180;

/** Unit direction vector for an azimuth/dip pair (dip negative = down). */
export function dirVec(azimuth, dip, negDown = true) {
  const d = (negDown ? dip : -dip) * D2R;
  const a = azimuth * D2R;
  return [Math.cos(d) * Math.sin(a), Math.cos(d) * Math.cos(a), Math.sin(d)];
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Direction at fraction f along the arc from t1 to t2 (slerp). */
function slerp(t1, t2, f, beta) {
  if (beta < 1e-9) return norm([t1[0] + (t2[0] - t1[0]) * f, t1[1] + (t2[1] - t1[1]) * f, t1[2] + (t2[2] - t1[2]) * f]);
  const s = Math.sin(beta);
  const a = Math.sin((1 - f) * beta) / s;
  const b = Math.sin(f * beta) / s;
  return norm([a * t1[0] + b * t2[0], a * t1[1] + b * t2[1], a * t1[2] + b * t2[2]]);
}

function mcStep(p, t1, t2, len) {
  const beta = Math.acos(Math.max(-1, Math.min(1, dot(t1, t2))));
  const rf = beta > 1e-9 ? (2 / beta) * Math.tan(beta / 2) : 1;
  const k = (len / 2) * rf;
  return [p[0] + k * (t1[0] + t2[0]), p[1] + k * (t1[1] + t2[1]), p[2] + k * (t1[2] + t2[2])];
}

/**
 * Build a desurveyed trace.
 * collar: {east, north, rl, azimuth, dip, eoh}
 * surveys: [{depth, azimuth, dip, exclude}]
 * Returns {stations:[{md, p:[x,y,z], t:[dx,dy,dz]}], at(md) -> {p, t}, eoh}
 */
export function buildTrace(collar, surveys = [], { negDown = true } = {}) {
  if (!collar || !isNum(collar.east) || !isNum(collar.north)) return null;
  const rl = isNum(collar.rl) ? collar.rl : 0;
  const sv = surveys
    .filter((s) => !s.exclude && isNum(s.depth) && isNum(s.azimuth) && isNum(s.dip))
    .sort((a, b) => a.depth - b.depth);
  // de-duplicate identical depths (keep the later row in the list = latest reading)
  const uniq = [];
  for (const s of sv) {
    if (uniq.length && Math.abs(uniq[uniq.length - 1].depth - s.depth) < 1e-6) uniq[uniq.length - 1] = s;
    else uniq.push(s);
  }
  const cAz = isNum(collar.azimuth) ? collar.azimuth : uniq[0]?.azimuth ?? 0;
  const cDip = isNum(collar.dip) ? collar.dip : uniq[0]?.dip ?? (negDown ? -90 : 90);
  if (!uniq.length || uniq[0].depth > 0) uniq.unshift({ depth: 0, azimuth: uniq[0]?.azimuth ?? cAz, dip: uniq[0]?.dip ?? cDip });

  const lastDepth = uniq[uniq.length - 1].depth;
  const eoh = Math.max(isNum(collar.eoh) ? collar.eoh : 0, lastDepth);
  if (eoh > lastDepth) uniq.push({ ...uniq[uniq.length - 1], depth: eoh });

  const stations = [];
  let p = [collar.east, collar.north, rl];
  let tPrev = dirVec(uniq[0].azimuth, uniq[0].dip, negDown);
  stations.push({ md: uniq[0].depth, p, t: tPrev });
  for (let i = 1; i < uniq.length; i++) {
    const t = dirVec(uniq[i].azimuth, uniq[i].dip, negDown);
    p = mcStep(p, tPrev, t, uniq[i].depth - uniq[i - 1].depth);
    stations.push({ md: uniq[i].depth, p, t });
    tPrev = t;
  }

  function at(md) {
    if (!isNum(md)) return null;
    if (md <= stations[0].md) {
      const s = stations[0];
      const d = md - s.md;
      return { p: [s.p[0] + s.t[0] * d, s.p[1] + s.t[1] * d, s.p[2] + s.t[2] * d], t: s.t };
    }
    let lo = 0;
    let hi = stations.length - 1;
    if (md >= stations[hi].md) {
      const s = stations[hi];
      const d = md - s.md;
      return { p: [s.p[0] + s.t[0] * d, s.p[1] + s.t[1] * d, s.p[2] + s.t[2] * d], t: s.t };
    }
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (stations[m].md <= md) lo = m;
      else hi = m;
    }
    const a = stations[lo];
    const b = stations[hi];
    const L = b.md - a.md;
    if (L <= 0) return { p: a.p, t: a.t };
    const f = (md - a.md) / L;
    const beta = Math.acos(Math.max(-1, Math.min(1, dot(a.t, b.t))));
    const tf = slerp(a.t, b.t, f, beta);
    return { p: mcStep(a.p, a.t, tf, f * L), t: tf };
  }

  /** Polyline sampled every `step` metres (plus every station). */
  function polyline(step = 5) {
    const out = [];
    const mds = new Set(stations.map((s) => s.md));
    for (let m = 0; m < eoh; m += step) mds.add(m);
    mds.add(eoh);
    for (const m of [...mds].sort((x, y) => x - y)) out.push({ md: m, ...at(m) });
    return out;
  }

  return { stations, at, polyline, eoh };
}

/** Cached trace of a hole from the store. */
export function holeTrace(holeId) {
  return memo(`trace|${holeId}`, () => {
    const c = hole(holeId);
    if (!c) return null;
    return buildTrace(c, rows('survey', holeId), { negDown: settings().dipNegativeDown !== false });
  });
}

/** Dogleg severity (degrees per 30 m) between consecutive survey stations. */
export function doglegs(surveys, negDown = true) {
  const sv = surveys.filter((s) => isNum(s.depth) && isNum(s.azimuth) && isNum(s.dip)).sort((a, b) => a.depth - b.depth);
  const out = [];
  for (let i = 1; i < sv.length; i++) {
    const L = sv[i].depth - sv[i - 1].depth;
    if (L <= 0) continue;
    const b = Math.acos(Math.max(-1, Math.min(1, dot(dirVec(sv[i - 1].azimuth, sv[i - 1].dip, negDown), dirVec(sv[i].azimuth, sv[i].dip, negDown))))) / D2R;
    out.push({ from: sv[i - 1], to: sv[i], deg: b, per30: (b / L) * 30 });
  }
  return out;
}

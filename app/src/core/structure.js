// True dip / dip direction of planes measured in oriented core (alpha, beta).
//
// Convention: alpha = acute angle between the plane and the core axis (0–90°);
// beta = angle measured clockwise, looking down-hole, from the orientation
// (bottom-of-hole) reference line to the lowest point of the ellipse (0–360°).

import { isNum } from './util.js';
import { S } from './store.js';
import { holeTrace } from './desurvey.js';

const D2R = Math.PI / 180;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * @param holeDir unit vector pointing down-hole in (E, N, Up)
 * @returns {dip, dipDir} in degrees, or null
 */
export function alphaBetaToPlane(alpha, beta, holeDir) {
  if (!isNum(alpha) || !holeDir) return null;
  const Z = norm(holeDir);
  // bottom-of-hole reference: steepest downward direction perpendicular to the axis
  const down = [0, 0, -1];
  const dz = Z[0] * down[0] + Z[1] * down[1] + Z[2] * down[2];
  let X = [down[0] - dz * Z[0], down[1] - dz * Z[1], down[2] - dz * Z[2]];
  if (Math.hypot(...X) < 1e-6) {
    // vertical hole: reference line is undefined; use grid north as a stand-in
    const n = [0, 1, 0];
    const dn = Z[1];
    X = [n[0] - dn * Z[0], n[1] - dn * Z[1], n[2] - dn * Z[2]];
  }
  X = norm(X);
  const Y = cross(Z, X); // looking down-hole, X -> Y is clockwise
  const a = alpha * D2R;
  const b = (isNum(beta) ? beta : 0) * D2R;
  const nc = [-Math.cos(a) * Math.cos(b), -Math.cos(a) * Math.sin(b), Math.sin(a)];
  let n = [
    nc[0] * X[0] + nc[1] * Y[0] + nc[2] * Z[0],
    nc[0] * X[1] + nc[1] * Y[1] + nc[2] * Z[1],
    nc[0] * X[2] + nc[1] * Y[2] + nc[2] * Z[2],
  ];
  if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
  n = norm(n);
  const dip = Math.acos(Math.max(-1, Math.min(1, n[2]))) / D2R;
  let dipDir = Math.atan2(n[0], n[1]) / D2R;
  if (dipDir < 0) dipDir += 360;
  if (dip < 1e-6) dipDir = 0;
  return { dip, dipDir };
}

/** Orientation of a structure row using the desurveyed hole direction at its depth. */
export function orientRow(r) {
  if (!r || !isNum(r.alpha) || !isNum(r.depth)) return null;
  if (!isNum(r.beta)) return null; // unoriented: only alpha is meaningful
  const tr = holeTrace(r.holeId);
  const at = tr?.at(r.depth);
  if (!at) return null;
  return alphaBetaToPlane(r.alpha, r.beta, at.t);
}

S.ctx.orient = orientRow;

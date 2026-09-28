// Tube mesh builder for drill traces: one indexed triangle mesh per hole with a
// flat colour per piece (lithology / grade interval). Pure math on typed arrays
// so it is testable under node and cheap to rebuild (vertical exaggeration,
// thickness, colour mode). Frames use a projection (parallel-transport style)
// normal so tubes do not twist along curved holes.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : null;
};

/**
 * pieces: [{color, pts:[{md, p:[x,y,z]}]}] in depth order (pieces share end points).
 * opts: {radius, radial = 6, map(p) -> [x,y,z], rgb(color) -> [r,g,b] (0..1), caps = true}
 * Returns {positions, normals, colors, indices, rings, vertexCount} or null.
 */
export function buildTube(pieces, { radius = 1, radial = 6, map = (p) => p, rgb = () => [0.5, 0.5, 0.5], caps = true } = {}) {
  const P = [];
  const C = [];
  for (const pc of pieces || []) {
    const col = rgb(pc.color);
    for (const q of pc.pts || []) {
      P.push(map(q.p));
      C.push(col);
    }
  }
  const R = P.length;
  if (R < 2) return null;
  // tangents from the nearest distinct neighbours (duplicate points sit at colour breaks)
  const T = new Array(R);
  const tol = 1e-6 * Math.max(1, radius);
  for (let k = 0; k < R; k++) {
    let i = k - 1;
    while (i >= 0 && len(sub(P[k], P[i])) <= tol) i--;
    let j = k + 1;
    while (j < R && len(sub(P[j], P[k])) <= tol) j++;
    const back = i >= 0 ? unit(sub(P[k], P[i])) : null;
    const fwd = j < R ? unit(sub(P[j], P[k])) : null;
    let t = back && fwd ? unit([back[0] + fwd[0], back[1] + fwd[1], back[2] + fwd[2]]) : back || fwd;
    T[k] = t || (k ? T[k - 1] : null);
  }
  if (!T[0]) {
    const first = T.find(Boolean);
    if (!first) return null;
    for (let k = 0; k < R && !T[k]; k++) T[k] = first;
  }
  const S = radial;
  const nCap = caps ? 2 * (S + 1) : 0;
  const vCount = R * S + nCap;
  const positions = new Float32Array(vCount * 3);
  const normals = new Float32Array(vCount * 3);
  const colors = new Float32Array(vCount * 3);
  const triCount = (R - 1) * S * 2 + (caps ? 2 * S : 0);
  const indices = vCount > 65535 ? new Uint32Array(triCount * 3) : new Uint16Array(triCount * 3);
  const cosA = new Float64Array(S);
  const sinA = new Float64Array(S);
  for (let j = 0; j < S; j++) {
    cosA[j] = Math.cos((2 * Math.PI * j) / S);
    sinA[j] = Math.sin((2 * Math.PI * j) / S);
  }
  const helper = (t) => (Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]);
  let N = unit(cross(T[0], helper(T[0])));
  let v = 0;
  for (let k = 0; k < R; k++) {
    const t = T[k];
    if (k) {
      const proj = [N[0] - t[0] * dot(N, t), N[1] - t[1] * dot(N, t), N[2] - t[2] * dot(N, t)];
      N = unit(proj) || unit(cross(t, helper(t)));
    }
    const B = cross(t, N);
    const p = P[k];
    const c = C[k];
    for (let j = 0; j < S; j++) {
      const nx = cosA[j] * N[0] + sinA[j] * B[0];
      const ny = cosA[j] * N[1] + sinA[j] * B[1];
      const nz = cosA[j] * N[2] + sinA[j] * B[2];
      positions[v * 3] = p[0] + radius * nx;
      positions[v * 3 + 1] = p[1] + radius * ny;
      positions[v * 3 + 2] = p[2] + radius * nz;
      normals[v * 3] = nx;
      normals[v * 3 + 1] = ny;
      normals[v * 3 + 2] = nz;
      colors[v * 3] = c[0];
      colors[v * 3 + 1] = c[1];
      colors[v * 3 + 2] = c[2];
      v++;
    }
  }
  let ix = 0;
  for (let k = 0; k < R - 1; k++) {
    for (let j = 0; j < S; j++) {
      const a = k * S + j;
      const b = k * S + ((j + 1) % S);
      const c = a + S;
      const d = b + S;
      indices[ix++] = a;
      indices[ix++] = b;
      indices[ix++] = c;
      indices[ix++] = b;
      indices[ix++] = d;
      indices[ix++] = c;
    }
  }
  if (caps) {
    for (const [k, sign] of [
      [0, -1],
      [R - 1, 1],
    ]) {
      const t = T[k];
      const centre = v;
      const put = (x, y, z) => {
        positions[v * 3] = x;
        positions[v * 3 + 1] = y;
        positions[v * 3 + 2] = z;
        normals[v * 3] = sign * t[0];
        normals[v * 3 + 1] = sign * t[1];
        normals[v * 3 + 2] = sign * t[2];
        colors[v * 3] = C[k][0];
        colors[v * 3 + 1] = C[k][1];
        colors[v * 3 + 2] = C[k][2];
        v++;
      };
      put(P[k][0], P[k][1], P[k][2]);
      for (let j = 0; j < S; j++) {
        const o = (k * S + j) * 3;
        put(positions[o], positions[o + 1], positions[o + 2]);
      }
      for (let j = 0; j < S; j++) {
        const a = centre + 1 + j;
        const b = centre + 1 + ((j + 1) % S);
        indices[ix++] = centre;
        if (sign < 0) {
          indices[ix++] = b;
          indices[ix++] = a;
        } else {
          indices[ix++] = a;
          indices[ix++] = b;
        }
      }
    }
  }
  return { positions, normals, colors, indices, rings: R, vertexCount: vCount };
}

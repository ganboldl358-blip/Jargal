import test from 'node:test';
import assert from 'node:assert/strict';
import {
  niceStep,
  niceFloor,
  ticks,
  emptyBounds,
  extendBounds,
  validBounds,
  fitView,
  worldToScreen,
  screenToWorld,
  zoomAt,
  interpAt,
  slicePolyline,
  colourPieces,
  intervalAt,
  nearestOnSegment,
  nearestOnPolyline,
  sectionFrame,
  toSection,
  fromSection,
  clipSegment,
  clipToCorridor,
  placeLabels,
  compass,
} from '../src/core/geom2d.js';
import { buildTube } from '../src/core/tube.js';

const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// straight trace from (0,0,100) heading east, dipping 45°, sampled every metre of md
function trace(eoh = 10, az = 90, dip = -45) {
  const d = (dip * Math.PI) / 180;
  const a = (az * Math.PI) / 180;
  const t = [Math.cos(d) * Math.sin(a), Math.cos(d) * Math.cos(a), Math.sin(d)];
  const out = [];
  for (let m = 0; m <= eoh; m++) out.push({ md: m, p: [t[0] * m, t[1] * m, 100 + t[2] * m] });
  return out;
}

test('niceStep / niceFloor / ticks', () => {
  assert.equal(niceStep(1000, 5), 200);
  assert.equal(niceStep(730, 5), 100);
  assert.equal(niceStep(0.9, 5), 0.2);
  assert.equal(niceFloor(137), 100);
  assert.equal(niceFloor(260), 200);
  assert.equal(niceFloor(740), 500);
  assert.deepEqual(ticks(722030, 722420, 100), [722100, 722200, 722300, 722400]);
  assert.deepEqual(ticks(0, 1, 0.25), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(ticks(5, 1, 1), []);
});

test('bounds and view fitting', () => {
  const b = emptyBounds();
  assert.equal(validBounds(b), false);
  extendBounds(b, 10, 20);
  extendBounds(b, 110, 70);
  assert.equal(validBounds(b), true);
  const v = fitView(b, 400, 300, 50);
  assert.equal(v.cx, 60);
  assert.equal(v.cy, 45);
  assert.ok(near(v.k, 3)); // (400-100)/100 = 3, (300-100)/50 = 4 -> 3
  const [sx, sy] = worldToScreen(v, 400, 300, 110, 70);
  assert.ok(near(sx, 350) && near(sy, 75));
  const [wx, wy] = screenToWorld(v, 400, 300, sx, sy);
  assert.ok(near(wx, 110) && near(wy, 70));
});

test('zoomAt keeps the point under the cursor fixed', () => {
  const v = { cx: 100, cy: 200, k: 2 };
  const [wx, wy] = screenToWorld(v, 800, 600, 123, 456);
  const z = zoomAt(v, 800, 600, 123, 456, 1.7);
  assert.ok(near(z.k, 3.4));
  const [wx2, wy2] = screenToWorld(z, 800, 600, 123, 456);
  assert.ok(near(wx, wx2) && near(wy, wy2));
});

test('interpAt / slicePolyline', () => {
  const pts = trace(10);
  const p = interpAt(pts, 2.5);
  assert.ok(near(p[0], pts[2].p[0] + (pts[3].p[0] - pts[2].p[0]) / 2));
  assert.deepEqual(interpAt(pts, -5), pts[0].p);
  assert.deepEqual(interpAt(pts, 50), pts[10].p);
  const s = slicePolyline(pts, 2.5, 5.2);
  assert.equal(s[0].md, 2.5);
  assert.equal(s[s.length - 1].md, 5.2);
  assert.deepEqual(s.map((q) => q.md), [2.5, 3, 4, 5, 5.2]);
});

test('colourPieces covers the trace, fills gaps and merges equal colours', () => {
  const pts = trace(10);
  const iv = [
    { from: 2, to: 4, color: '#aa0000' },
    { from: 4, to: 6, color: '#aa0000' },
    { from: 7, to: 12, color: '#00aa00' },
  ];
  const pcs = colourPieces(pts, iv, '#999');
  assert.deepEqual(
    pcs.map((p) => [p.from, p.to, p.color, p.gap]),
    [
      [0, 2, '#999', true],
      [2, 6, '#aa0000', false],
      [6, 7, '#999', true],
      [7, 10, '#00aa00', false],
    ],
  );
  // pieces share their boundary points (duplicated for sharp colour breaks)
  assert.deepEqual(pcs[0].pts[pcs[0].pts.length - 1].p, pcs[1].pts[0].p);
  // overlaps: first come wins, no double coverage
  const ov = colourPieces(pts, [{ from: 0, to: 6, color: 'a' }, { from: 5, to: 10, color: 'b' }]);
  assert.deepEqual(ov.map((p) => [p.from, p.to, p.color]), [[0, 6, 'a'], [6, 10, 'b']]);
  // single-point trace (planned hole with no depth)
  assert.equal(colourPieces([{ md: 0, p: [0, 0, 0] }], iv).length, 1);
});

test('intervalAt finds the containing row', () => {
  const list = [{ from: 0, to: 2, k: 'a' }, { from: 2, to: 5, k: 'b' }];
  assert.equal(intervalAt(list, 1).k, 'a');
  assert.equal(intervalAt(list, 2).k, 'a');
  assert.equal(intervalAt(list, 3).k, 'b');
  assert.equal(intervalAt(list, 6), null);
});

test('nearest point on segment / polyline', () => {
  const r = nearestOnSegment(5, 5, 0, 0, 10, 0);
  assert.ok(near(r.t, 0.5) && near(r.d2, 25));
  const beyond = nearestOnSegment(20, 0, 0, 0, 10, 0);
  assert.equal(beyond.t, 1);
  const n = nearestOnPolyline([0, 10, 10], [0, 0, 10], [0, 10, 20], 12, 5);
  assert.equal(n.i, 1);
  assert.ok(near(n.md, 15) && near(n.d2, 4));
  assert.equal(nearestOnPolyline([], [], [], 0, 0), null);
});

test('section frame: bearings, facing and round trip', () => {
  const f = sectionFrame([0, 0], [100, 0]); // W -> E
  assert.equal(f.len, 100);
  assert.ok(near(f.bearing, 90));
  assert.ok(near(f.facing, 0)); // looking north, A on the left
  const s = toSection(f, 30, 12);
  assert.ok(near(s.along, 30) && near(s.across, 12));
  const f2 = sectionFrame([0, 0], [0, 100]); // S -> N, looking west
  assert.ok(near(f2.facing, 270));
  const f3 = sectionFrame([722000, 5144000], [722300, 5144400]);
  const [x, y] = fromSection(f3, 250, -40);
  const back = toSection(f3, x, y);
  assert.ok(near(back.along, 250) && near(back.across, -40));
});

test('Liang-Barsky clipping', () => {
  assert.deepEqual(clipSegment(-10, 0, 10, 0, 0, 20, -5, 5), [0.5, 1]);
  assert.equal(clipSegment(-10, 10, 10, 10, 0, 20, -5, 5), null);
  const c = clipSegment(0, -10, 0, 10, -1, 1, -5, 5);
  assert.ok(near(c[0], 0.25) && near(c[1], 0.75));
  // degenerate (vertical hole in plan): a point inside is accepted whole
  assert.deepEqual(clipSegment(3, 1, 3, 1, 0, 20, -5, 5), [0, 1]);
});

test('clipToCorridor keeps only the part of a trace inside the corridor', () => {
  const pts = trace(100, 90, -45); // heads east from x=0, reaches x≈70.7
  // section running N-S through x=40, looking west; corridor ±10 m
  const f = sectionFrame([40, -50], [40, 50]);
  const runs = clipToCorridor(f, pts, 10);
  assert.equal(runs.length, 1);
  const run = runs[0];
  // across = -(x - 40) for this frame; inside where 30 <= x <= 50
  const first = run[0];
  const last = run[run.length - 1];
  assert.ok(near(first.across, 10, 1e-6) && near(last.across, -10, 1e-6));
  assert.ok(near(first.md, 30 / Math.cos(Math.PI / 4), 1e-6));
  assert.ok(near(last.md, 50 / Math.cos(Math.PI / 4), 1e-6));
  assert.ok(near(first.z, 100 - 30, 1e-6)); // 45° dip: drop == horizontal distance
  for (const q of run) assert.ok(Math.abs(q.across) <= 10 + 1e-9 && near(q.along, 50, 1e-6));
  // a trace entirely outside gives nothing
  assert.deepEqual(clipToCorridor(sectionFrame([500, 0], [500, 10]), pts, 10), []);
  // a vertical hole in plan is a single location: inside -> whole trace
  const vert = trace(20, 0, -90);
  const vr = clipToCorridor(f, vert.map((q) => ({ md: q.md, p: [45, 0, q.p[2]] })), 10);
  assert.equal(vr.length, 1);
  assert.equal(vr[0].length, 21);
  // along limits (pad) cut the trace at the section ends
  const g = sectionFrame([0, 0], [20, 0]);
  const cut = clipToCorridor(g, pts, 5, { pad: 0 });
  assert.ok(near(cut[0][cut[0].length - 1].along, 20, 1e-6));
});

test('placeLabels avoids collisions, obstacles and the viewport edge', () => {
  const items = [
    { id: 'a', x: 100, y: 100, w: 40, h: 12 },
    { id: 'b', x: 102, y: 101, w: 40, h: 12 },
    { id: 'c', x: 104, y: 99, w: 40, h: 12 },
    { id: 'd', x: 106, y: 100, w: 40, h: 12 },
    { id: 'e', x: 103, y: 100, w: 40, h: 12 },
  ];
  const out = placeLabels(items, { width: 400, height: 300 });
  assert.equal(out[0].id, 'a');
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++) {
      const A = out[i];
      const B = out[j];
      assert.ok(!(A.x0 < B.x1 && A.x1 > B.x0 && A.y0 < B.y1 && A.y1 > B.y0), `${A.id} overlaps ${B.id}`);
    }
  // crowded cluster: some labels are dropped rather than overlapped
  const crowd = Array.from({ length: 30 }, (_, i) => ({ id: 'h' + i, x: 200 + (i % 3), y: 150, w: 50, h: 12 }));
  assert.ok(placeLabels(crowd, { width: 400, height: 300 }).length < 30);
  // edge: label flips to the left side instead of leaving the viewport
  const edge = placeLabels([{ id: 'z', x: 390, y: 150, w: 40, h: 12 }], { width: 400, height: 300 });
  assert.equal(edge[0].anchor, 'end');
  // obstacles block candidates
  const blocked = placeLabels([{ id: 'o', x: 100, y: 100, w: 20, h: 10 }], { width: 400, height: 300, obstacles: [[0, 0, 400, 300]] });
  assert.equal(blocked.length, 0);
});

test('compass points', () => {
  assert.equal(compass(0), 'N');
  assert.equal(compass(44), 'NE');
  assert.equal(compass(225), 'SW');
  assert.equal(compass(-90), 'W');
  assert.equal(compass(359), 'N');
});

test('buildTube: ring counts, radius and outward normals', () => {
  const pts = trace(10);
  const pieces = colourPieces(pts, [{ from: 0, to: 5, color: 'r' }, { from: 5, to: 10, color: 'g' }], 'n');
  const rgb = (c) => (c === 'r' ? [1, 0, 0] : c === 'g' ? [0, 1, 0] : [0.5, 0.5, 0.5]);
  const radial = 6;
  const m = buildTube(pieces, { radius: 2, radial, rgb });
  const rings = pieces.reduce((a, p) => a + p.pts.length, 0);
  assert.equal(m.rings, rings);
  assert.equal(m.vertexCount, rings * radial + 2 * (radial + 1));
  assert.equal(m.indices.length, ((rings - 1) * radial * 2 + 2 * radial) * 3);
  assert.ok(m.indices instanceof Uint16Array);
  // every ring vertex sits `radius` from its centreline point, normal points outward
  let v = 0;
  for (const pc of pieces)
    for (const q of pc.pts)
      for (let j = 0; j < radial; j++, v++) {
        const dx = m.positions[v * 3] - q.p[0];
        const dy = m.positions[v * 3 + 1] - q.p[1];
        const dz = m.positions[v * 3 + 2] - q.p[2];
        assert.ok(near(Math.hypot(dx, dy, dz), 2, 1e-4));
        const dotn = dx * m.normals[v * 3] + dy * m.normals[v * 3 + 1] + dz * m.normals[v * 3 + 2];
        assert.ok(near(dotn, 2, 1e-4));
      }
  // colours follow pieces: first ring red, last ring green
  assert.deepEqual([...m.colors.slice(0, 3)], [1, 0, 0]);
  const lastRing = (rings - 1) * radial * 3;
  assert.deepEqual([...m.colors.slice(lastRing, lastRing + 3)], [0, 1, 0]);
  // triangle winding: face normal agrees with the vertex normals
  const P = (i) => [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
  const [a, b, c] = [m.indices[0], m.indices[1], m.indices[2]].map(P);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const fn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const vn = [m.normals[m.indices[0] * 3], m.normals[m.indices[0] * 3 + 1], m.normals[m.indices[0] * 3 + 2]];
  assert.ok(fn[0] * vn[0] + fn[1] * vn[1] + fn[2] * vn[2] > 0);
  // map() transforms positions (recentring + vertical exaggeration)
  const m2 = buildTube(pieces, { radius: 1, radial: 4, rgb, caps: false, map: (p) => [p[0] - 5, p[1], p[2] * 2] });
  assert.ok(near(m2.positions[2], 200 + 1 * m2.normals[2], 1e-3) || m2.positions[2] > 190);
  assert.equal(m2.vertexCount, rings * 4);
});

test('buildTube handles vertical holes and degenerate input', () => {
  const vert = trace(20, 0, -90);
  const m = buildTube([{ color: 'x', pts: vert }], { radius: 1, radial: 5, rgb: () => [1, 1, 1] });
  assert.equal(m.rings, 21);
  for (const x of m.positions) assert.ok(Number.isFinite(x));
  assert.equal(buildTube([{ color: 'x', pts: [vert[0]] }]), null);
  assert.equal(buildTube([]), null);
  // all points identical -> no direction -> null rather than NaNs
  assert.equal(buildTube([{ color: 'x', pts: [vert[0], vert[0]] }]), null);
});

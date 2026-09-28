// Strip-log geometry on the synthetic demo project (no DOM): node --test app/tests/striplog.test.js
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { S, createProject, rows, hole, holes, upsert } from '../src/core/store.js';
import { buildDemo } from '../src/core/demo.js';
import { placeQC } from '../src/core/logscale.js';
import { stripLogGeometry, stripLogDepth } from '../src/ui/views/striplog.js';

before(async () => {
  S.adapter = null;
  await createProject({ name: 'Demo', demo: true });
  S.lang = 'en';
  buildDemo();
});

const keys = (g) => g.tracks.map((t) => t.key);

test('every demo hole lays out without errors; tracks follow the data', () => {
  for (const h of holes()) {
    const g = stripLogGeometry(h.holeId);
    assert.equal(g.tracks[0].key, 'depth', h.holeId);
    const hasLith = rows('lith', h.holeId).length > 0;
    assert.equal(keys(g).includes('lith'), hasLith, `${h.holeId} lith track`);
    assert.equal(keys(g).includes('samples'), rows('samples', h.holeId).length > 0, `${h.holeId} samples track`);
    if (!hasLith) assert.deepEqual(keys(g), ['depth'], 'planned hole: nothing but the ruler');
  }
});

test('vertical geometry: depth → y and total height', () => {
  const g = stripLogGeometry('DEMO-02', { ppm: 4, width: 900 });
  const d = stripLogDepth('DEMO-02');
  assert.equal(d, hole('DEMO-02').eoh);
  assert.equal(g.H, Math.ceil(12 + d * 4 + 40));
  const first = rows('lith', 'DEMO-02')[0];
  const e = g.index.get(first.id);
  assert.equal(e.table, 'lith');
  assert.equal(e.y0, 12 + first.from * 4);
  assert.equal(e.y1, 12 + first.to * 4);
  assert.ok(e.cells.length >= 2, 'lith row outlined in several lith-derived tracks');
  assert.equal(stripLogDepth('DEMO-11'), hole('DEMO-11').plannedDepth, 'planned hole spans its planned depth');
});

test('tracks fill the width, and hidden / narrow panes drop tracks', () => {
  const wide = stripLogGeometry('DEMO-02', { width: 1400 });
  assert.equal(wide.W, 1400);
  assert.ok(keys(wide).includes('comments'));
  const hid = stripLogGeometry('DEMO-02', { width: 1400, hidden: ['comments', 'assay:Cu_pct'] });
  assert.ok(!keys(hid).includes('comments') && !keys(hid).includes('assay:Cu_pct'));
  assert.ok(keys(hid).includes('assay:Au_ppm'));
  const narrow = stripLogGeometry('DEMO-02', { width: 380 });
  assert.ok(narrow.dropped.includes('comments'), 'comments give way first in a narrow pane');
  assert.ok(!keys(narrow).includes('comments'));
  for (const g of [wide, narrow]) for (const [i, t] of g.tracks.entries()) if (i) assert.equal(t.x, g.tracks[i - 1].x + g.tracks[i - 1].w);
});

test('hit lists are sorted and QC samples are all placed', () => {
  const g = stripLogGeometry('DEMO-03', { ppm: 6 });
  for (const [k, h] of Object.entries(g.hits)) for (let i = 1; i < h.iv.length; i++) assert.ok(h.iv[i].y0 >= h.iv[i - 1].y0, `${k} sorted`);
  const qc = placeQC(rows('samples', 'DEMO-03'));
  assert.ok(qc.length > 0);
  assert.equal(g.hits.samples.pts.length, qc.length);
  assert.ok(g.hits['assay:Au_ppm'].iv.length > 0);
  assert.ok(g.hits.struct.pts.every((p) => p.table === 'struct'));
});

test('log scale, zoom extremes and edits rebuild cleanly', () => {
  for (const ppm of [0.25, 1, 4, 20, 60]) {
    const g = stripLogGeometry('DEMO-06', { ppm, log: true, width: 700 });
    assert.equal(g.ppm, ppm);
    assert.ok(g.H > 0 && g.W > 0);
  }
  const r = rows('lith', 'DEMO-06')[2];
  upsert('lith', 'DEMO-06', { id: r.id, lith1: 'CL', comments: 'Core loss — lost in a cavity' });
  const g = stripLogGeometry('DEMO-06');
  assert.ok(g.index.has(r.id));
  const px = stripLogGeometry('DEMO-06', { pxrf: 'Zn_ppm' });
  assert.ok(keys(px).includes('pxrf'));
  assert.ok(px.hits.pxrf.iv.length > 0);
});

// 3D drillhole view. three.js (vendored, r160) is loaded on demand so the rest
// of the app never pays for it. Traces are thick tubes (one merged, vertex-
// coloured mesh per hole) coloured by lithology, assay grade or hole status.
// Everything is recentred on the collar centroid before it reaches WebGL, so
// UTM-sized coordinates never jitter. Labels, grid labels and the axis triad are
// an HTML/SVG overlay projected each frame (crisper than sprites).

import { html, useState, useEffect, useRef, useMemo } from '../../lib.js';
import { S, hole, holes, meaning, codeColor } from '../../core/store.js';
import { isNum, fmt } from '../../core/util.js';
import { toLinear } from '../../core/colorramp.js';
import { niceStep, ticks, placeLabels, nearestOnPolyline, emptyBounds, extendBounds, validBounds } from '../../core/geom2d.js';
import { buildTube } from '../../core/tube.js';
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
  useDebounced,
} from './vizkit.js';

// ------------------------------------------------------------ three loader

let threeP = null;
function loadThree() {
  if (!threeP) {
    threeP = Promise.all([import('../../../vendor/three.module.min.js'), import('../../../vendor/OrbitControls.js')])
      .then(([T, O]) => ({ THREE: T, OrbitControls: O.OrbitControls }))
      .catch((e) => {
        threeP = null;
        throw e;
      });
  }
  return threeP;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

const D2R = Math.PI / 180;
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------------ model

/** Plain data for the scene: recentring origin, per-hole traces and coloured pieces. */
function buildModel(list, colouring) {
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let nz = 0;
  for (const c of list) {
    sx += c.east;
    sy += c.north;
    if (isNum(c.rl)) {
      sz += c.rl;
      nz++;
    }
  }
  const n = list.length || 1;
  const meanRL = nz ? sz / nz : 0;
  const origin = [Math.round(sx / n / 10) * 10, Math.round(sy / n / 10) * 10, Math.round(meanRL)];
  const items = [];
  const b = emptyBounds();
  let zmin = Infinity;
  let zmax = -Infinity;
  for (const c of list) {
    const t = traceOf(c.holeId);
    if (!t) continue;
    for (const q of t.pts) {
      extendBounds(b, q.p[0], q.p[1]);
      if (q.p[2] < zmin) zmin = q.p[2];
      if (q.p[2] > zmax) zmax = q.p[2];
    }
    items.push({ id: c.holeId, pts: t.pts, pieces: colouring.pieces(c.holeId), planned: t.planned });
  }
  return { origin, meanRL, items, bounds: b, zmin, zmax };
}

// ------------------------------------------------------------ scene class

class Scene3D {
  constructor(T, OrbitControls, host, cb) {
    this.T = T;
    this.host = host;
    this.cb = cb;
    this.w = 0;
    this.h = 0;
    this.holes = new Map();
    this.order = [];
    this.visible = null;
    this.selected = null;
    this.hoverId = null;
    this.showLabels = true;
    this.builtVE = 1;
    this.liveVE = 1;
    this.frameVer = 0;
    this.screenVer = -1;
    this.dirty = true;
    this.lastLabels = [];
    this.lastGrid = [];
    this.gridAnchors = [];
    this.rgbCache = new Map();
    this.theme = null;

    const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer = renderer;
    const cv = renderer.domElement;
    cv.className = 'v3d-canvas';
    cv.tabIndex = 0;
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', tr({ en: '3D view of drill hole traces. Drag to rotate, right-drag to pan, wheel to zoom.', mn: 'Цооногуудын 3D харагдац. Чирж эргүүлнэ, баруун товчоор зөөнө, дугуйгаар томруулна.' }));
    host.appendChild(cv);
    this.gridLayer = document.createElement('div');
    this.gridLayer.className = 'v3d-grid-labels';
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'v3d-labels';
    host.append(this.gridLayer, this.labelLayer);
    this.triad = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.triad.setAttribute('class', 'v3d-triad');
    this.triad.setAttribute('viewBox', '0 0 84 84');
    this.triad.setAttribute('aria-hidden', 'true');
    this.triad.innerHTML = '<circle cx="42" cy="42" r="38" class="bg"/>' + ['z', 'e', 'n'].map((k) => `<g class="ax ${k}"><line x1="42" y1="42" x2="42" y2="42"/><text x="42" y="42">${k === 'n' ? 'N' : k === 'e' ? 'E' : 'Z'}</text></g>`).join('');
    host.appendChild(this.triad);

    this.scene = new T.Scene();
    this.world = new T.Group();
    this.scene.add(this.world);
    this.holeGroup = new T.Group();
    this.world.add(this.holeGroup);
    this.groundGroup = new T.Group();
    this.scene.add(this.groundGroup);

    this.persp = new T.PerspectiveCamera(40, 1, 0.5, 1e6);
    this.persp.up.set(0, 0, 1);
    this.persp.position.set(-300, -800, 500);
    this.ortho = new T.OrthographicCamera(-1, 1, 1, -1, -1e5, 1e5);
    this.ortho.up.set(0, 0, 1);
    this.camera = this.persp;
    const controls = new OrbitControls(this.persp, cv);
    controls.enableDamping = true;
    controls.dampingFactor = 0.14;
    controls.screenSpacePanning = true;
    if ('zoomToCursor' in controls) controls.zoomToCursor = true;
    controls.listenToKeyEvents?.(cv);
    controls.addEventListener('start', () => {
      this.tween = null;
    });
    this.controls = controls;

    this.ambient = new T.AmbientLight(0xffffff, 0.62 * Math.PI);
    this.sun = new T.DirectionalLight(0xffffff, 0.58 * Math.PI);
    this.scene.add(this.ambient, this.sun, this.sun.target);

    this.mat = new T.MeshLambertMaterial({ vertexColors: true });
    this.matPlanned = new T.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false });
    this.matHalo = new T.MeshBasicMaterial({ color: 0x0d7a74, side: T.BackSide });
    this.matMarker = new T.MeshBasicMaterial({ color: 0x142120 });
    this.matGrid = new T.LineBasicMaterial({ color: 0xd8e1de });
    this.matGridMajor = new T.LineBasicMaterial({ color: 0xc3d0cc });
    this.matPlane = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    this.marker = new T.Mesh(new T.SphereGeometry(1, 20, 14), this.matMarker);
    this.marker.visible = false;
    this.world.add(this.marker);
    this.pm = new T.Matrix4();

    this.onDown = (e) => {
      this.down = { x: e.clientX, y: e.clientY, b: e.button, t: performance.now() };
      this.setHover(null);
    };
    this.onUp = (e) => {
      const d = this.down;
      this.down = null;
      if (!d || d.b !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      const r = cv.getBoundingClientRect();
      const p = this.pick(e.clientX - r.left, e.clientY - r.top);
      // touch has no dblclick once touch-action is none: detect double taps here
      if (e.pointerType === 'touch' && p) {
        const now = performance.now();
        if (this.lastTap && this.lastTap.id === p.id && now - this.lastTap.t < 380) {
          this.lastTap = null;
          this.cb.onOpen?.(p.id);
          return;
        }
        this.lastTap = { id: p.id, t: now };
      }
      this.cb.onSelect?.(p ? p.id : null);
    };
    this.onMove = (e) => {
      const r = cv.getBoundingClientRect();
      this.mouse = [e.clientX - r.left, e.clientY - r.top];
      if (this.down || e.pointerType === 'touch') return;
      if (!this.hoverRaf) {
        this.hoverRaf = requestAnimationFrame(() => {
          this.hoverRaf = 0;
          if (this.mouse && !this.down) this.setHover(this.pick(this.mouse[0], this.mouse[1]));
        });
      }
    };
    this.onLeave = () => {
      this.mouse = null;
      this.setHover(null);
    };
    this.onDbl = (e) => {
      const r = cv.getBoundingClientRect();
      const p = this.pick(e.clientX - r.left, e.clientY - r.top);
      if (p) this.cb.onOpen?.(p.id);
    };
    this.onLost = (e) => {
      e.preventDefault();
      this.cb.onLost?.();
    };
    cv.addEventListener('pointerdown', this.onDown);
    cv.addEventListener('pointerup', this.onUp);
    cv.addEventListener('pointermove', this.onMove);
    cv.addEventListener('pointerleave', this.onLeave);
    cv.addEventListener('dblclick', this.onDbl);
    cv.addEventListener('webglcontextlost', this.onLost);

    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // -------------------------------------------------------------- frame loop

  loop(now) {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.w || !this.h) return;
    let moved = false;
    if (this.tween) moved = this.stepTween(now);
    if (this.controls.update()) moved = true;
    if (moved) this.frameVer++;
    if (moved || this.dirty) this.renderNow();
  }

  renderNow() {
    this.dirty = false;
    if (this.needsFit && this.model) {
      this.needsFit = false;
      if (this.pendingFocus && this.holes.has(this.pendingFocus)) this.focus(this.pendingFocus, false);
      else this.fit('reset', false);
      this.pendingFocus = null;
    }
    const cam = this.camera;
    // head-light: from the camera, a little above and to the right
    const off = new this.T.Vector3(0.35, 0.6, 0).applyQuaternion(cam.quaternion);
    this.sun.position.copy(cam.position).add(off.multiplyScalar(cam.position.distanceTo(this.controls.target) * 0.5 + 1));
    this.sun.target.position.copy(this.controls.target);
    this.renderer.render(this.scene, cam);
    cam.updateMatrixWorld();
    this.world.updateMatrixWorld();
    this.pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).multiply(this.world.matrixWorld);
    if (this.overlayVer !== this.frameVer) {
      this.overlayVer = this.frameVer;
      this.updateLabels();
      this.updateGridLabels();
      this.updateTriad();
    }
  }

  invalidate() {
    this.frameVer++;
    this.dirty = true;
  }

  /** Project scene point (inside the world group) to CSS pixels; null when behind the camera. */
  project(x, y, z) {
    const m = this.pm.elements;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 1e-6) return null;
    const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w;
    const cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    const cz = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
    if (cz > 1 || cz < -1) return null;
    return [((cx + 1) / 2) * this.w, ((1 - cy) / 2) * this.h];
  }

  // ------------------------------------------------------------- building

  rgb(c) {
    let v = this.rgbCache.get(c);
    if (!v) this.rgbCache.set(c, (v = toLinear(c)));
    return v;
  }

  disposeHoles() {
    for (const h of this.holes.values()) {
      if (h.mesh) {
        this.holeGroup.remove(h.mesh);
        h.mesh.geometry.dispose();
      }
    }
    this.clearHalo();
  }

  /** (Re)build every hole from a model at a given vertical exaggeration and tube thickness. */
  setModel(model, { ve = 1, thick = 1 } = {}) {
    const T = this.T;
    const first = !this.model;
    const oldLabels = new Map([...this.holes].map(([id, h]) => [id, h.label]));
    this.disposeHoles();
    this.model = model;
    this.builtVE = ve;
    this.world.scale.z = (this.liveVE || ve) / ve;
    const [ox, oy, oz] = model.origin;
    const map = (p) => [p[0] - ox, p[1] - oy, (p[2] - oz) * ve];
    const b = model.bounds;
    const span = validBounds(b) ? Math.max(b.maxX - b.minX, b.maxY - b.minY, (model.zmax - model.zmin) * ve, 100) : 500;
    this.span = span;
    this.radius = Math.min(15, Math.max(0.5, span / 300)) * thick;
    let rings = 0;
    for (const it of model.items) rings += it.pieces.reduce((a, p) => a + p.pts.length, 0);
    const radial = rings > 60000 ? 6 : 8;
    const rgb = (c) => this.rgb(c);
    this.holes = new Map();
    this.order = [];
    for (const it of model.items) {
      const g = buildTube(it.pieces, { radius: this.radius, radial, map, rgb });
      let mesh = null;
      if (g) {
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(g.positions, 3));
        geo.setAttribute('normal', new T.BufferAttribute(g.normals, 3));
        geo.setAttribute('color', new T.BufferAttribute(g.colors, 3));
        geo.setIndex(new T.BufferAttribute(g.indices, 1));
        geo.computeBoundingSphere();
        mesh = new T.Mesh(geo, it.planned ? this.matPlanned : this.mat);
        mesh.userData.holeId = it.id;
        if (it.planned) mesh.renderOrder = 1;
        this.holeGroup.add(mesh);
      }
      const n = it.pts.length;
      const xs = new Float32Array(n);
      const ys = new Float32Array(n);
      const zs = new Float32Array(n);
      const mds = new Float64Array(n);
      it.pts.forEach((q, i) => {
        const p = map(q.p);
        xs[i] = p[0];
        ys[i] = p[1];
        zs[i] = p[2];
        mds[i] = q.md;
      });
      let label = oldLabels.get(it.id);
      oldLabels.delete(it.id);
      if (!label) {
        label = document.createElement('div');
        label.className = 'v3d-lbl';
        label.textContent = it.id;
        label.style.display = 'none';
        this.labelLayer.appendChild(label);
      }
      label.w = null;
      const h = { id: it.id, mesh, xs, ys, zs, mds, pts: it.pts, planned: it.planned, label, sx: new Float32Array(n), sy: new Float32Array(n) };
      if (mesh) mesh.visible = !this.visible || this.visible.has(it.id);
      this.holes.set(it.id, h);
      this.order.push(it.id);
    }
    for (const el of oldLabels.values()) el?.remove();
    this.marker.scale.setScalar(this.radius * 1.9);
    this.buildGrid();
    // clipping planes / zoom limits scaled to the project
    const R = span;
    this.persp.near = Math.max(0.05, R / 20000);
    this.persp.far = R * 200;
    this.persp.updateProjectionMatrix();
    this.ortho.near = -R * 50;
    this.ortho.far = R * 50;
    this.ortho.updateProjectionMatrix();
    this.controls.maxDistance = R * 30;
    this.controls.minDistance = Math.max(0.5, this.radius * 2);
    if (this.selected) this.setSelected(this.selected, true);
    if (first) this.needsFit = true;
    this.invalidate();
  }

  buildGrid() {
    const T = this.T;
    for (const o of [...this.groundGroup.children]) {
      this.groundGroup.remove(o);
      o.geometry?.dispose();
    }
    this.gridAnchors = [];
    for (const el of [...this.gridLayer.children]) el.remove();
    const m = this.model;
    if (!m || !validBounds(m.bounds)) return;
    const [ox, oy] = m.origin;
    const b = m.bounds;
    const spanXY = Math.max(b.maxX - b.minX, b.maxY - b.minY, 100);
    const step = spanXY <= 3000 ? 100 : Math.max(100, niceStep(spanXY, 20));
    const pad = step;
    const x0 = Math.floor((b.minX - pad) / step) * step;
    const x1 = Math.ceil((b.maxX + pad) / step) * step;
    const y0 = Math.floor((b.minY - pad) / step) * step;
    const y1 = Math.ceil((b.maxY + pad) / step) * step;
    this.gridRect = [x0 - ox, y0 - oy, x1 - ox, y1 - oy];
    const minor = [];
    const major = [];
    const majorEvery = step * 5;
    for (const x of ticks(x0, x1, step)) (Math.abs(x % majorEvery) < 1e-6 ? major : minor).push(x - ox, y0 - oy, 0, x - ox, y1 - oy, 0);
    for (const y of ticks(y0, y1, step)) (Math.abs(y % majorEvery) < 1e-6 ? major : minor).push(x0 - ox, y - oy, 0, x1 - ox, y - oy, 0);
    const lines = (arr, mat) => {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(arr, 3));
      return new T.LineSegments(g, mat);
    };
    if (minor.length) this.groundGroup.add(lines(minor, this.matGrid));
    if (major.length) this.groundGroup.add(lines(major, this.matGridMajor));
    const plane = new T.Mesh(new T.PlaneGeometry(x1 - x0, y1 - y0), this.matPlane);
    plane.position.set((x0 + x1) / 2 - ox, (y0 + y1) / 2 - oy, 0);
    plane.renderOrder = 2;
    this.groundGroup.add(plane);
    // labels along the south (eastings) and west (northings) edges
    for (const x of ticks(x0, x1, step)) this.gridAnchors.push({ text: `${Math.round(x)}E`, p: [x - ox, y0 - oy, 0] });
    for (const y of ticks(y0, y1, step)) this.gridAnchors.push({ text: `${Math.round(y)}N`, p: [x0 - ox, y - oy, 0] });
    for (const a of this.gridAnchors) {
      const el = document.createElement('div');
      el.className = 'v3d-glbl';
      el.textContent = a.text;
      el.style.display = 'none';
      a.el = el;
      a.w = a.text.length * 6.4 + 6;
      this.gridLayer.appendChild(el);
    }
  }

  clearHalo() {
    if (this.halo) {
      this.holeGroup.remove(this.halo);
      this.halo.geometry.dispose();
      this.halo = null;
    }
  }

  setSelected(id, force = false) {
    if (id === this.selected && !force) return;
    this.selected = id;
    this.clearHalo();
    const h = id && this.holes.get(id);
    if (h && h.pts.length > 1 && this.model) {
      const [ox, oy, oz] = this.model.origin;
      const ve = this.builtVE;
      const g = buildTube([{ color: '#000', pts: h.pts }], { radius: this.radius * 1.75, radial: 10, map: (p) => [p[0] - ox, p[1] - oy, (p[2] - oz) * ve], rgb: () => [0, 0, 0] });
      if (g) {
        const geo = new this.T.BufferGeometry();
        geo.setAttribute('position', new this.T.BufferAttribute(g.positions, 3));
        geo.setIndex(new this.T.BufferAttribute(g.indices, 1));
        this.halo = new this.T.Mesh(geo, this.matHalo);
        this.halo.visible = !this.visible || this.visible.has(id);
        this.holeGroup.add(this.halo);
      }
    }
    this.invalidate();
  }

  setVisible(ids) {
    this.visible = ids;
    for (const h of this.holes.values()) if (h.mesh) h.mesh.visible = ids.has(h.id);
    if (this.halo) this.halo.visible = !!this.selected && ids.has(this.selected);
    this.invalidate();
  }

  setVELive(ve) {
    this.liveVE = ve;
    const s = ve / (this.builtVE || 1);
    if (Math.abs(this.world.scale.z - s) < 1e-6) return;
    this.world.scale.z = s;
    this.invalidate();
  }

  setLabels(on) {
    this.showLabels = on;
    this.invalidate();
  }

  setTheme(th) {
    this.theme = th;
    this.renderer.setClearColor(th.bg, 1);
    this.matGrid.color.set(th.line);
    this.matGridMajor.color.set(th.line2);
    this.matPlane.color.set(th.surface);
    this.matPlane.opacity = th.dark ? 0.28 : 0.22;
    this.matHalo.color.set(th.accent);
    this.matMarker.color.set(th.ink);
    this.invalidate();
  }

  resize(w, h) {
    if (!w || !h) return;
    this.w = w;
    this.h = h;
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    const top = this.ortho.top;
    this.ortho.left = -top * (w / h);
    this.ortho.right = top * (w / h);
    this.ortho.updateProjectionMatrix();
    this.invalidate();
  }

  setProjection(kind) {
    const want = kind === 'ortho' ? this.ortho : this.persp;
    if (want === this.camera) return;
    const from = this.camera;
    const target = this.controls.target;
    const tanH = Math.tan((this.persp.fov * D2R) / 2);
    const aspect = this.w && this.h ? this.w / this.h : 1;
    if (want === this.ortho) {
      const d = from.position.distanceTo(target);
      const half = d * tanH;
      Object.assign(this.ortho, { top: half, bottom: -half, left: -half * aspect, right: half * aspect, zoom: 1 });
      this.ortho.position.copy(from.position);
    } else {
      const half = this.ortho.top / (this.ortho.zoom || 1);
      const d = half / tanH;
      const dir = from.position.clone().sub(target).normalize();
      this.persp.position.copy(target).add(dir.multiplyScalar(d));
    }
    want.quaternion.copy(from.quaternion);
    want.updateProjectionMatrix();
    this.camera = want;
    this.controls.object = want;
    this.controls.update();
    this.invalidate();
  }

  // --------------------------------------------------------------- camera

  visibleBox() {
    const s = this.world.scale.z;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const h of this.holes.values()) {
      if (this.visible && !this.visible.has(h.id)) continue;
      for (let i = 0; i < h.xs.length; i++) {
        const p = [h.xs[i], h.ys[i], h.zs[i] * s];
        for (let k = 0; k < 3; k++) {
          if (p[k] < min[k]) min[k] = p[k];
          if (p[k] > max[k]) max[k] = p[k];
        }
      }
    }
    if (!isFinite(min[0])) return null;
    return { min, max };
  }

  flyTo(target, dir, radius, animate = true) {
    const T = this.T;
    const aspect = this.w && this.h ? this.w / this.h : 1;
    const vfov = this.persp.fov * D2R;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const r = Math.max(radius, 10);
    const dist = (r / Math.sin(Math.min(vfov, hfov) / 2)) * 1.02;
    const to = new T.Vector3(...dir).normalize().multiplyScalar(dist).add(new T.Vector3(...target));
    const tgt = new T.Vector3(...target);
    if (this.camera === this.ortho) {
      const half = aspect < 1 ? (r * 1.05) / aspect : r * 1.05;
      Object.assign(this.ortho, { top: half, bottom: -half, left: -half * aspect, right: half * aspect });
      this.ortho.updateProjectionMatrix();
    }
    if (!animate || reducedMotion()) {
      this.camera.position.copy(to);
      this.controls.target.copy(tgt);
      if (this.camera === this.ortho) this.ortho.zoom = 1;
      this.camera.updateProjectionMatrix();
      this.controls.update();
      this.invalidate();
      return;
    }
    this.tween = { t0: performance.now(), dur: 420, p0: this.camera.position.clone(), p1: to, g0: this.controls.target.clone(), g1: tgt, z0: this.camera.zoom, z1: 1 };
  }

  stepTween(now) {
    const tw = this.tween;
    const f = Math.min(1, (now - tw.t0) / tw.dur);
    const e = easeInOut(f);
    this.camera.position.lerpVectors(tw.p0, tw.p1, e);
    this.controls.target.lerpVectors(tw.g0, tw.g1, e);
    if (this.camera === this.ortho) {
      this.ortho.zoom = tw.z0 + (tw.z1 - tw.z0) * e;
      this.ortho.updateProjectionMatrix();
    }
    if (f >= 1) this.tween = null;
    return true;
  }

  /** Preset views: reset (oblique from SSW), plan (north up), north (look N), east (look E). */
  fit(kind = 'reset', animate = true) {
    const box = this.visibleBox();
    if (!box) return;
    const c = [0, 1, 2].map((k) => (box.min[k] + box.max[k]) / 2);
    const ext = [0, 1, 2].map((k) => (box.max[k] - box.min[k]) / 2);
    let dir;
    let r;
    if (kind === 'plan') {
      dir = [0, -0.0015, 1];
      r = Math.hypot(ext[0], ext[1]);
    } else if (kind === 'north') {
      dir = [0, -1, 0];
      r = Math.hypot(ext[0], ext[2]);
    } else if (kind === 'east') {
      dir = [-1, 0, 0];
      r = Math.hypot(ext[1], ext[2]);
    } else {
      const az = 200 * D2R;
      const el = 32 * D2R;
      dir = [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)];
      r = Math.hypot(ext[0], ext[1], ext[2]);
    }
    this.flyTo(c, dir, r * 1.08, animate);
  }

  focus(id, animate = true) {
    const h = this.holes.get(id);
    if (!h) return;
    const s = this.world.scale.z;
    const n = h.xs.length;
    const a = [h.xs[0], h.ys[0], h.zs[0] * s];
    const b = [h.xs[n - 1], h.ys[n - 1], h.zs[n - 1] * s];
    const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const r = Math.max(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 2, 40) * 1.4;
    const dir = this.camera.position.clone().sub(this.controls.target);
    const d = dir.length() > 1e-6 ? dir.toArray() : [0, -1, 0.6];
    this.flyTo(c, d, r, animate);
  }

  // -------------------------------------------------------------- picking

  ensureScreen() {
    if (this.screenVer === this.frameVer) return;
    this.screenVer = this.frameVer;
    const m = this.pm.elements;
    const W = this.w;
    const H = this.h;
    for (const h of this.holes.values()) {
      if (this.visible && !this.visible.has(h.id)) continue;
      const { xs, ys, zs, sx, sy } = h;
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i];
        const y = ys[i];
        const z = zs[i];
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        if (w <= 1e-6) {
          sx[i] = NaN;
          sy[i] = NaN;
          continue;
        }
        sx[i] = (((m[0] * x + m[4] * y + m[8] * z + m[12]) / w + 1) / 2) * W;
        sy[i] = ((1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w) / 2) * H;
      }
    }
  }

  /** Nearest visible trace within 10 px of (mx, my): {id, md, i, t}. */
  pick(mx, my) {
    if (!this.w) return null;
    this.ensureScreen();
    let best = null;
    const lim = 10 * 10;
    for (const h of this.holes.values()) {
      if (this.visible && !this.visible.has(h.id)) continue;
      const r = nearestOnPolyline(h.sx, h.sy, h.mds, mx, my);
      if (r && r.d2 <= lim && (!best || r.d2 < best.d2)) best = { id: h.id, md: r.md, i: r.i, t: r.t, d2: r.d2 };
    }
    return best;
  }

  setHover(p) {
    const id = p?.id || null;
    if (p) {
      const h = this.holes.get(p.id);
      const j = Math.min(p.i + 1, h.xs.length - 1);
      this.marker.position.set(h.xs[p.i] + (h.xs[j] - h.xs[p.i]) * p.t, h.ys[p.i] + (h.ys[j] - h.ys[p.i]) * p.t, h.zs[p.i] + (h.zs[j] - h.zs[p.i]) * p.t);
      this.marker.visible = true;
      this.dirty = true;
    } else if (this.marker.visible) {
      this.marker.visible = false;
      this.dirty = true;
    }
    this.renderer.domElement.classList.toggle('hot', !!p);
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.invalidate();
    }
    this.cb.onHover?.(p && this.mouse ? { id: p.id, md: p.md, x: this.mouse[0], y: this.mouse[1] } : null);
  }

  // ------------------------------------------------------------- overlays

  updateLabels() {
    const items = [];
    const s = this.world.scale.z;
    if (this.showLabels) {
      const pri = [this.selected, this.hoverId].filter(Boolean);
      const ids = [...pri, ...this.order.filter((id) => !pri.includes(id))];
      const lift = this.radius * 2;
      for (const id of ids) {
        const h = this.holes.get(id);
        if (!h || (this.visible && !this.visible.has(id))) continue;
        const sp = this.project(h.xs[0], h.ys[0], h.zs[0] + lift / (s || 1));
        if (!sp || sp[0] < -40 || sp[1] < -20 || sp[0] > this.w + 40 || sp[1] > this.h + 20) continue;
        if (h.label.w == null) {
          h.label.style.display = 'block';
          h.label.w = h.label.offsetWidth || id.length * 7 + 12;
        }
        items.push({ id, x: sp[0], y: sp[1], w: h.label.w, h: 18 });
      }
    }
    const placed = placeLabels(items, {
      width: this.w,
      height: this.h,
      candidates: [
        [5, -12, 'l'],
        [-5, -12, 'r'],
        [5, 12, 'l'],
        [-5, 12, 'r'],
        [0, -24, 'c'],
      ],
    });
    const on = new Map(placed.map((p) => [p.id, p]));
    for (const h of this.holes.values()) {
      const p = on.get(h.id);
      const el = h.label;
      if (!p) {
        if (el.style.display !== 'none') el.style.display = 'none';
        continue;
      }
      el.style.display = 'block';
      el.style.transform = `translate(${p.x0.toFixed(1)}px, ${p.y0.toFixed(1)}px)`;
      el.classList.toggle('sel', h.id === this.selected);
      el.classList.toggle('hov', h.id === this.hoverId);
    }
    this.lastLabels = placed.map((p) => ({ ...p, sel: p.id === this.selected }));
  }

  updateGridLabels() {
    const items = [];
    for (let i = 0; i < this.gridAnchors.length; i++) {
      const a = this.gridAnchors[i];
      // grid is outside the VE-scaled group: project with z = 0 regardless of scale
      const sp = this.project(a.p[0], a.p[1], 0);
      if (!sp || sp[0] < 0 || sp[1] < 0 || sp[0] > this.w || sp[1] > this.h) continue;
      items.push({ id: i, x: sp[0], y: sp[1], w: a.w, h: 14 });
    }
    const placed = placeLabels(items, { width: this.w, height: this.h, candidates: [[0, 0, 'c']], gap: 6 });
    const on = new Map(placed.map((p) => [p.id, p]));
    this.gridAnchors.forEach((a, i) => {
      const p = on.get(i);
      if (!p) {
        a.el.style.display = 'none';
        return;
      }
      a.el.style.display = 'block';
      a.el.style.transform = `translate(${p.x0.toFixed(1)}px, ${p.y0.toFixed(1)}px)`;
    });
    this.lastGrid = placed.map((p) => ({ ...p, text: this.gridAnchors[p.id].text }));
  }

  triadVectors() {
    const q = this.camera.quaternion.clone().invert();
    const T = this.T;
    const out = {};
    for (const [k, v] of [
      ['e', [1, 0, 0]],
      ['n', [0, 1, 0]],
      ['z', [0, 0, 1]],
    ]) {
      const c = new T.Vector3(...v).applyQuaternion(q);
      out[k] = [c.x, -c.y, c.z];
    }
    return out;
  }

  updateTriad() {
    const v = this.triadVectors();
    const L = 26;
    const order = Object.entries(v).sort((a, b) => a[1][2] - b[1][2]);
    for (const [k, d] of order) {
      const g = this.triad.querySelector('.ax.' + k);
      const line = g.firstChild;
      const text = g.lastChild;
      line.setAttribute('x2', (42 + d[0] * L).toFixed(1));
      line.setAttribute('y2', (42 + d[1] * L).toFixed(1));
      const len = Math.hypot(d[0], d[1]) || 1;
      text.setAttribute('x', (42 + d[0] * L + (d[0] / len) * 8).toFixed(1));
      text.setAttribute('y', (42 + d[1] * L + (d[1] / len) * 8).toFixed(1));
      g.style.opacity = Math.hypot(d[0], d[1]) < 0.12 ? '0.35' : '1';
      this.triad.appendChild(g); // draw axes pointing at the viewer last
    }
  }

  // ------------------------------------------------------------ screenshot

  /** PNG of the view with labels, axis triad, title and legend burnt in. */
  screenshot({ legend, title, theme }) {
    this.renderNow();
    const src = this.renderer.domElement;
    const W = src.width;
    const H = src.height;
    const k = W / Math.max(1, this.w);
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.scale(k, k);
    const th = theme;
    const rr = (x, y, w, h, r) => {
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, w, h, r);
      else g.rect(x, y, w, h);
    };
    g.textBaseline = 'middle';
    g.font = `10.5px ${th.mono}`;
    g.fillStyle = th.muted;
    g.textAlign = 'center';
    for (const l of this.lastGrid) g.fillText(l.text, (l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2);
    g.font = `500 11px ${th.mono}`;
    g.textAlign = 'left';
    for (const l of this.lastLabels) {
      rr(l.x0, l.y0, l.x1 - l.x0, l.y1 - l.y0, 4);
      g.globalAlpha = 0.85;
      g.fillStyle = l.sel ? th.accent : th.surface;
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = l.sel ? th.accentInk : th.ink;
      g.fillText(l.id, l.x0 + 5, (l.y0 + l.y1) / 2 + 0.5);
    }
    // axis triad
    const v = this.triadVectors();
    const cx = 52;
    const cy = this.h - 52;
    g.beginPath();
    g.arc(cx, cy, 38, 0, Math.PI * 2);
    g.globalAlpha = 0.85;
    g.fillStyle = th.surface;
    g.fill();
    g.globalAlpha = 1;
    g.font = `600 11px ${th.font}`;
    g.textAlign = 'center';
    for (const [key, d] of Object.entries(v).sort((a, b) => a[1][2] - b[1][2])) {
      const col = key === 'n' ? th.accent : key === 'e' ? th.ink2 : th.muted;
      g.strokeStyle = col;
      g.fillStyle = col;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx, cy);
      g.lineTo(cx + d[0] * 26, cy + d[1] * 26);
      g.stroke();
      const len = Math.hypot(d[0], d[1]) || 1;
      g.fillText(key === 'n' ? 'N' : key === 'e' ? 'E' : 'Z', cx + d[0] * 26 + (d[0] / len) * 8, cy + d[1] * 26 + (d[1] / len) * 8);
    }
    // title
    g.textAlign = 'left';
    g.font = `600 13px ${th.font}`;
    g.fillStyle = th.ink;
    g.fillText(title, 12, 18);
    // legend
    if (legend?.items?.length) {
      const rows = legend.items.slice(0, 24);
      const lw = 240;
      const lh = 30 + rows.length * 16 + (legend.sub ? 14 : 0);
      const x = this.w - lw - 12;
      const y = this.h - lh - 12;
      rr(x, y, lw, lh, 8);
      g.globalAlpha = 0.92;
      g.fillStyle = th.surface;
      g.fill();
      g.globalAlpha = 1;
      g.strokeStyle = th.line;
      g.lineWidth = 1;
      g.stroke();
      g.fillStyle = th.ink;
      g.font = `600 12px ${th.font}`;
      g.fillText(legend.title, x + 10, y + 14);
      let yy = y + 30;
      if (legend.sub) {
        g.font = `10.5px ${th.font}`;
        g.fillStyle = th.muted;
        g.fillText(legend.sub.slice(0, 44), x + 10, yy - 2);
        yy += 14;
      }
      for (const it of rows) {
        g.fillStyle = it.color;
        g.fillRect(x + 10, yy - 5, 11, 11);
        g.font = `${it.mono ? '500 11px ' + th.mono : '11px ' + th.font}`;
        g.fillStyle = it.gap ? th.muted : th.ink;
        g.textAlign = 'left';
        const label = String(it.label);
        g.fillText(label, x + 27, yy);
        if (it.sub) {
          g.fillStyle = th.muted;
          g.font = `10.5px ${th.font}`;
          const lx = x + 27 + g.measureText(label).width + 8;
          let sub = String(it.sub);
          while (sub.length > 3 && lx + g.measureText(sub).width > x + lw - 42) sub = sub.slice(0, -2);
          if (sub !== String(it.sub)) sub = sub.slice(0, -1) + '…';
          g.fillText(sub, lx, yy);
        }
        if (isNum(it.count)) {
          g.textAlign = 'right';
          g.fillStyle = th.muted;
          g.fillText(String(it.count), x + lw - 10, yy);
        }
        yy += 16;
      }
    }
    return new Promise((res) => c.toBlob(res, 'image/png'));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.hoverRaf);
    const cv = this.renderer.domElement;
    cv.removeEventListener('pointerdown', this.onDown);
    cv.removeEventListener('pointerup', this.onUp);
    cv.removeEventListener('pointermove', this.onMove);
    cv.removeEventListener('pointerleave', this.onLeave);
    cv.removeEventListener('dblclick', this.onDbl);
    cv.removeEventListener('webglcontextlost', this.onLost);
    this.controls.dispose();
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
    });
    for (const m of [this.mat, this.matPlanned, this.matHalo, this.matMarker, this.matGrid, this.matGridMajor, this.matPlane]) m.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    cv.remove();
    this.gridLayer.remove();
    this.labelLayer.remove();
    this.triad.remove();
    this.holes = new Map();
  }
}

// ------------------------------------------------------------- components

function SelectedCard({ id, onClose, onFocus }) {
  const c = hole(id);
  if (!c) return null;
  const t = traceOf(id);
  const m = tr({ en: 'm', mn: 'м' });
  return html`<div class="viz-card" role="region" aria-label=${id}>
    <div class="viz-card-head">
      <b class="mono">${id}</b>
      <span class="pill"><${Swatch} color=${codeColor('HOLESTATUS', c.status)} size=${8} /> ${meaning('HOLESTATUS', c.status) || c.status || '—'}</span>
      <button class="icon-btn" style="width:26px;height:26px" onClick=${onClose} aria-label=${tr({ en: 'Clear selection', mn: 'Сонголт арилгах' })}><${Icon} name="x" size=${15} /></button>
    </div>
    <dl>
      ${c.prospect ? html`<dt>${tr({ en: 'Prospect', mn: 'Талбай' })}</dt><dd>${c.prospect}</dd>` : null}
      <dt>${tr({ en: 'EOH', mn: 'Эцсийн гүн' })}</dt>
      <dd>${isNum(c.eoh) ? `${fmt(c.eoh, 1)} ${m}` : t?.planned && isNum(c.plannedDepth) ? `${fmt(c.plannedDepth, 1)} ${m} (${tr({ en: 'planned', mn: 'төлөвлөсөн' })})` : '—'}</dd>
      <dt>${tr({ en: 'Az / dip', mn: 'Азимут / налуу' })}</dt>
      <dd>${isNum(c.azimuth) ? fmt(c.azimuth, 1) + '°' : '—'} / ${isNum(c.dip) ? fmt(c.dip, 1) + '°' : '—'}</dd>
      <dt>RL</dt>
      <dd>${isNum(c.rl) ? `${fmt(c.rl, 1)} ${m}` : '—'}</dd>
    </dl>
    <div class="row">
      <${Button} size="sm" kind="primary" icon="log" onClick=${() => navigate('#/hole/' + encodeURIComponent(id))}>${tr({ en: 'Open hole', mn: 'Цооног нээх' })}<//>
      <${Button} size="sm" icon="target" onClick=${onFocus}>${tr({ en: 'Zoom to', mn: 'Ойртох' })}<//>
    </div>
  </div>`;
}

function Message({ icon = 'cube', title, children }) {
  return html`<div class="viz-msg"><div>
    <${Icon} name=${icon} size=${30} />
    <h3>${title}</h3>
    ${children}
  </div></div>`;
}

export function View3D({ params }) {
  const rev = useStore();
  const theme = useTheme();
  const [filter, setFilter] = useVizFilter();
  const [cp, setCp] = useColourPrefs();
  const [ve, setVe] = usePref('v3d.ve', 1);
  const [thick, setThick] = usePref('v3d.thick', 1);
  const [labels, setLabels] = usePref('v3d.labels', true);
  const [proj, setProj] = usePref('v3d.proj', 'persp');
  const [sideOpen, setSideOpen] = useState(() => !window.matchMedia?.('(max-width: 820px)').matches);
  const [status, setStatus] = useState('loading');
  const [err, setErr] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(() => params?.holeId || hashParam('hole') || null);
  const stageRef = useRef(null);
  const hostRef = useRef(null);
  const sceneRef = useRef(null);
  const tipRef = useRef(null);
  const size = useSize(stageRef);

  const all = useMemo(() => mappableHoles(), [rev]);
  const total = useMemo(() => holes().length, [rev]);
  const shown = useMemo(() => all.filter((c) => matchFilter(c, filter)), [all, filter]);
  const shownIds = useMemo(() => new Set(shown.map((c) => c.holeId)), [shown]);
  const colouring = useMemo(() => buildColouring({ ...cp, theme }), [rev, cp.mode, cp.el, cp.method, theme.key]);
  const model = useMemo(() => buildModel(all, colouring), [all, colouring]);
  const legend = useMemo(() => colouring.legend(shownIds), [colouring, shownIds]);
  const veBuild = useDebounced(ve, 250);
  const vex = Math.min(3, Math.max(1, +ve || 1));

  // create / dispose the scene
  useEffect(() => {
    let alive = true;
    let sc = null;
    if (!webglAvailable()) {
      setStatus('nogl');
      return undefined;
    }
    setStatus('loading');
    loadThree()
      .then(({ THREE, OrbitControls }) => {
        if (!alive || !hostRef.current) return;
        try {
          sc = new Scene3D(THREE, OrbitControls, hostRef.current, {
            onHover: (h) => tipRef.current?.(h),
            onSelect: (id) => setSelected(id),
            onOpen: (id) => navigate('#/hole/' + encodeURIComponent(id)),
            onLost: () => setStatus('lost'),
          });
          sc.pendingFocus = selected;
          sceneRef.current = sc;
          setStatus('ready');
        } catch (e) {
          console.error(e);
          setErr(String(e?.message || e));
          setStatus('nogl');
        }
      })
      .catch((e) => {
        console.error(e);
        if (!alive) return;
        setErr(String(e?.message || e));
        setStatus('error');
      });
    return () => {
      alive = false;
      sceneRef.current = null;
      sc?.dispose();
    };
  }, [attempt]);

  const ready = status === 'ready';
  const sc = sceneRef.current;
  useEffect(() => {
    if (ready) sc.setTheme(theme);
  }, [ready, theme.key]);
  useEffect(() => {
    if (ready) sc.resize(size.w, size.h);
  }, [ready, size.w, size.h]);
  useEffect(() => {
    if (ready) sc.setModel(model, { ve: Math.min(3, Math.max(1, +veBuild || 1)), thick });
  }, [ready, model, veBuild, thick]);
  useEffect(() => {
    if (ready) sc.setVELive(vex);
  }, [ready, vex, model]);
  useEffect(() => {
    if (ready) sc.setVisible(shownIds);
  }, [ready, shownIds, model]);
  useEffect(() => {
    if (ready) sc.setSelected(selected);
  }, [ready, selected]);
  useEffect(() => {
    if (ready) sc.setLabels(labels);
  }, [ready, labels]);
  useEffect(() => {
    if (ready) sc.setProjection(proj);
  }, [ready, proj]);

  const view = (k) => sceneRef.current?.fit(k);
  const shot = async () => {
    const s = sceneRef.current;
    if (!s) return;
    try {
      const title = `${S.project?.name || 'ORD'} · ${legend.title} · VE ${fmt(vex, 1)}×`;
      const blob = await s.screenshot({ legend, title, theme });
      if (!blob) throw new Error('empty image');
      await saveFile('ord_3d.png', blob, 'image/png');
    } catch (e) {
      console.error(e);
      toast(tr({ en: 'Could not capture the 3D view', mn: '3D харагдацыг зураг болгож чадсангүй' }), { kind: 'err' });
    }
  };
  const pick = (id) => {
    setSelected(id);
    sceneRef.current?.focus(id);
    if (window.matchMedia?.('(max-width: 820px)').matches) setSideOpen(false);
  };

  let overlay = null;
  if (status === 'loading') overlay = html`<${Message} title=${tr({ en: 'Loading 3D…', mn: '3D ачаалж байна…' })} />`;
  else if (status === 'nogl')
    overlay = html`<${Message} icon="alert" title=${tr({ en: '3D is not available on this device', mn: 'Энэ төхөөрөмж дээр 3D ажиллахгүй байна' })}>
      <p class="muted">${tr({ en: 'This browser has WebGL switched off or unsupported, so the 3D view cannot be drawn. The plan map and sections work without it.', mn: 'Энэ хөтөч WebGL-г дэмжихгүй эсвэл унтраасан тул 3D харагдацыг зурах боломжгүй. План зураг, зүсэлт WebGL-гүйгээр ажиллана.' })}</p>
      ${err ? html`<p class="muted mono" style="font-size:11px">${err}</p>` : null}
      <${Button} kind="primary" icon="map" onClick=${() => navigate('#/map')}>${tr({ en: 'Open the plan map', mn: 'План зураг нээх' })}<//>
    <//>`;
  else if (status === 'error')
    overlay = html`<${Message} icon="alert" title=${tr({ en: 'The 3D engine could not be loaded', mn: '3D хөдөлгүүрийг ачаалж чадсангүй' })}>
      ${err ? html`<p class="muted mono" style="font-size:11px">${err}</p>` : null}
      <${Button} kind="primary" onClick=${() => setAttempt((a) => a + 1)}>${tr({ en: 'Try again', mn: 'Дахин оролдох' })}<//>
    <//>`;
  else if (status === 'lost')
    overlay = html`<${Message} icon="alert" title=${tr({ en: 'The 3D view was interrupted', mn: '3D харагдац тасалдлаа' })}>
      <p class="muted">${tr({ en: 'The graphics card reset the drawing context.', mn: 'График карт зургийн контекстыг дахин эхлүүлсэн.' })}</p>
      <${Button} kind="primary" onClick=${() => setAttempt((a) => a + 1)}>${tr({ en: 'Reload 3D', mn: '3D дахин ачаалах' })}<//>
    <//>`;
  else if (!all.length)
    overlay = html`<${Message} icon="map" title=${tr({ en: 'No holes with coordinates yet', mn: 'Координаттай цооног алга байна' })}>
      <p class="muted">${total
        ? tr({ en: '{n} holes have no Easting/Northing. Add collar coordinates to see them in 3D.', mn: '{n} цооногт Easting/Northing алга. 3D-д харахын тулд амны координат оруулна уу.' }, { n: total })
        : tr({ en: 'Add collars with Easting/Northing to see them here.', mn: 'Easting/Northing координаттай цооногийн ам оруулснаар энд харагдана.' })}</p>
    <//>`;
  else if (!shown.length)
    overlay = html`<${Message} icon="search" title=${tr({ en: 'No holes match the filter', mn: 'Шүүлтүүрт тохирох цооног алга' })}>
      <${Button} onClick=${() => setFilter({ ...DEFAULT_FILTER })}>${tr({ en: 'Clear filters', mn: 'Шүүлтүүр цэвэрлэх' })}<//>
    <//>`;

  return html`<div class="viz v3d">
    <div class="viz-bar">
      <${IconButton} icon="list" title=${tr({ en: 'Filters and hole list', mn: 'Шүүлтүүр, цооногийн жагсаалт' })} class=${sideOpen ? 'on' : ''} onClick=${() => setSideOpen(!sideOpen)} />
      <h1>${tr({ en: '3D view', mn: '3D харагдац' })}</h1>
      <div class="grp">
        <span class="lbl">${tr({ en: 'Colour by', mn: 'Өнгө' })}</span>
        <${Select} value=${colouring.mode} options=${modeOptions()} onChange=${(v) => setCp({ mode: v })} />
        ${colouring.mode === 'assay'
          ? html`<${Select} value=${colouring.el} options=${elementOptions()} onChange=${(v) => setCp({ el: v })} />
              <${Select} value=${cp.method} options=${methodOptions()} onChange=${(v) => setCp({ method: v })} />`
          : null}
      </div>
      <div class="grp" title=${tr({ en: 'Vertical exaggeration', mn: 'Босоо томруулалт' })}>
        <label class="lbl" for="v3d-ve">${tr({ en: 'Vert. exag.', mn: 'Босоо томр.' })}</label>
        <input id="v3d-ve" type="range" min="1" max="3" step="0.1" value=${vex} onInput=${(e) => setVe(+e.target.value)} />
        <span class="val">${fmt(vex, 1)}×</span>
      </div>
      <div class="grp hide-sm">
        <label class="lbl" for="v3d-th">${tr({ en: 'Thickness', mn: 'Зузаан' })}</label>
        <input id="v3d-th" type="range" min="0.4" max="3" step="0.1" value=${thick} onInput=${(e) => setThick(+e.target.value)} />
      </div>
      <label class="check grp"><input type="checkbox" checked=${labels} onChange=${(e) => setLabels(e.target.checked)} /><span class="lbl">${tr({ en: 'Labels', mn: 'Шошго' })}</span></label>
      <div class="seg hide-sm" role="group" aria-label=${tr({ en: 'Projection', mn: 'Проекц' })}>
        <button class=${proj !== 'ortho' ? 'on' : ''} onClick=${() => setProj('persp')}>${tr({ en: 'Perspective', mn: 'Перспектив' })}</button>
        <button class=${proj === 'ortho' ? 'on' : ''} onClick=${() => setProj('ortho')}>${tr({ en: 'Orthographic', mn: 'Ортографик' })}</button>
      </div>
      <span class="spacer"></span>
      <div class="grp v3d-views">
        <${Button} size="sm" icon="target" onClick=${() => view('reset')} disabled=${!ready}>${tr({ en: 'Reset', mn: 'Анхны' })}<//>
        <${Button} size="sm" icon="map" onClick=${() => view('plan')} disabled=${!ready}>${tr({ en: 'Plan', mn: 'План' })}<//>
        <${Button} size="sm" icon="eye" onClick=${() => view('north')} disabled=${!ready} title=${tr({ en: 'Section view looking north', mn: 'Хойд зүг рүү харсан зүсэлт' })}>${tr({ en: 'Look N', mn: 'Хойд руу' })}<//>
        <${Button} size="sm" icon="eye" onClick=${() => view('east')} disabled=${!ready} title=${tr({ en: 'Section view looking east', mn: 'Зүүн зүг рүү харсан зүсэлт' })}>${tr({ en: 'Look E', mn: 'Зүүн руу' })}<//>
        <${IconButton} icon="image" title=${tr({ en: 'Save screenshot (PNG)', mn: 'Зураг хадгалах (PNG)' })} onClick=${shot} disabled=${!ready} />
      </div>
    </div>
    <div class="viz-body">
      <${FilterPanel} filter=${filter} setFilter=${setFilter} all=${all} shown=${shown} selected=${selected} onPick=${pick} open=${sideOpen} onClose=${() => setSideOpen(false)} />
      <div class="viz-stage" ref=${stageRef}>
        <div class="v3d-host" ref=${hostRef}></div>
        ${overlay}
        ${ready ? html`<${HoverLayer} bind=${tipRef} colouring=${colouring} w=${size.w} h=${size.h} />` : null}
        ${ready && selected && hole(selected) ? html`<${SelectedCard} id=${selected} onClose=${() => setSelected(null)} onFocus=${() => sceneRef.current?.focus(selected)} />` : null}
        ${ready && all.length ? html`<${Legend} legend=${legend} />` : null}
        ${ready && all.length ? html`<div class="v3d-help muted hide-sm">${tr({ en: 'Drag: rotate · Right-drag: pan · Wheel: zoom · Double-click a hole: open', mn: 'Чирэх: эргүүлэх · Баруун товч: зөөх · Дугуй: томруулах · Давхар товших: нээх' })}</div>` : null}
      </div>
    </div>
  </div>`;
}

injectCSS(
  'view3d',
  `
.v3d-host { position: absolute; inset: 0; }
.v3d-canvas { display: block; width: 100%; height: 100%; outline: none; touch-action: none; cursor: grab; }
.v3d-canvas:active { cursor: grabbing; }
.v3d-canvas.hot { cursor: pointer; }
.v3d-canvas:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.v3d-labels, .v3d-grid-labels { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.v3d-lbl { position: absolute; left: 0; top: 0; font: 500 11px/16px var(--mono); padding: 0 5px; border-radius: 4px; white-space: nowrap; will-change: transform;
  background: color-mix(in srgb, var(--surface) 84%, transparent); color: var(--ink); border: 1px solid color-mix(in srgb, var(--line-2) 70%, transparent); }
.v3d-lbl.sel { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); z-index: 2; }
.v3d-lbl.hov { border-color: var(--ink-2); z-index: 1; }
.v3d-glbl { position: absolute; left: 0; top: 0; font: 10.5px/14px var(--mono); color: var(--muted); white-space: nowrap; }
.v3d-triad { position: absolute; left: 10px; bottom: 10px; width: 84px; height: 84px; pointer-events: none; overflow: visible; }
.v3d-triad .bg { fill: color-mix(in srgb, var(--surface) 85%, transparent); stroke: var(--line); }
.v3d-triad line { stroke-width: 2; stroke-linecap: round; }
.v3d-triad text { font: 600 11px var(--font); text-anchor: middle; dominant-baseline: central; }
.v3d-triad .n line { stroke: var(--accent); } .v3d-triad .n text { fill: var(--accent); }
.v3d-triad .e line { stroke: var(--ink-2); } .v3d-triad .e text { fill: var(--ink-2); }
.v3d-triad .z line { stroke: var(--muted); } .v3d-triad .z text { fill: var(--muted); }
.v3d-help { position: absolute; left: 104px; bottom: 12px; font-size: 11.5px; pointer-events: none; background: color-mix(in srgb, var(--bg) 70%, transparent); padding: 2px 6px; border-radius: 6px; }
.v3d .viz-legend { bottom: 12px; }
@media (max-width: 1100px) { .v3d-help { display: none; } }
`,
);

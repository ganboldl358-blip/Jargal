// Synthetic demonstration project ("Red Hill demo"). Everything here is made up:
// a felsic volcanic host dipping NE with a VMS lens, a silica cap, an oxidised
// Fe-oxide halo, a fault and a dyke — enough structure to exercise every ORD
// feature (logging, QC, intercepts, 3D, validation). A handful of deliberate
// errors are seeded so the validation page has something to find.

import { rng, round } from './util.js';
import { mutate, setSettings, rows } from './store.js';
import { buildTrace } from './desurvey.js';

const OX_DEPTH = 32;

function unitAt(p, md, R, holeNo) {
  // lens plane: strikes NW, dips 60° NE; passes through (E0+150, N0+150, RL 1750)
  const n = [Math.sin((45 * Math.PI) / 180) * Math.sin((60 * Math.PI) / 180), Math.cos((45 * Math.PI) / 180) * Math.sin((60 * Math.PI) / 180), Math.cos((60 * Math.PI) / 180)];
  const P0 = [500150, 5140150, 1750];
  const d = (p[0] - P0[0]) * n[0] + (p[1] - P0[1]) * n[1] + (p[2] - P0[2]) * n[2];
  const along = (p[0] - P0[0]) * n[1] - (p[1] - P0[1]) * n[0];
  const lensThick = Math.max(0, 9 - Math.abs(along) / 22);
  // fault: steep plane striking N
  const fd = p[0] - 500215 + (p[2] - 1800) * 0.15;
  // dyke: sub-vertical, strikes E-W
  const dd = p[1] - 5140150 + (p[0] - 500150) * 0.05;
  if (md < 1.2 + (holeNo % 3) * 0.6) return 'COLL';
  if (Math.abs(fd) < 1.2) return 'BFG';
  if (Math.abs(fd) < 5) return 'BFZ';
  if (Math.abs(dd) < 3) return 'IAND';
  if (Math.abs(d) < lensThick / 2) {
    if (md < OX_DEPTH) return 'GOS';
    return Math.abs(d) < lensThick / 4 ? 'MSUL' : 'VMS';
  }
  if (lensThick > 1 && d > lensThick / 2 && d < lensThick / 2 + 5) return md < OX_DEPTH ? 'GOS' : 'VSU';
  // silica body in the hanging wall just above the lens
  if (lensThick > 3 && d >= lensThick / 2 + 5 && d < lensThick / 2 + 16 && Math.abs(along) < 70) return 'CMSQ';
  const schist = d < -55 || (d > 40 && d < 52);
  // tuff band parallel to the lens, 25-40 m into the footwall
  if (d < -25 && d > -40) return schist || md > 120 ? 'SCHTR' : 'FRHTF';
  if (md < OX_DEPTH) return schist ? 'SCHRF' : 'FRHYF';
  return schist ? 'SCHR' : 'FRHY';
}

const ALT = {
  COLL: [null, null, null],
  FRHYF: ['AHEM', 'H', 'PER'],
  SCHRF: ['ALIM', 'I', 'PER'],
  GOS: ['AGOE', 'I', 'PER'],
  CMSQ: ['ASIL', 'I', 'PER'],
  MSUL: ['ASER', 'S', 'PER'],
  VMS: ['ASER', 'S', 'PER'],
  VSU: ['ACHL', 'M', 'VNL'],
  FRHY: ['ASER', 'W', 'SEL'],
  SCHR: ['ASER', 'M', 'PER'],
  FRHTF: ['ACLY', 'M', 'PAT'],
  SCHTR: ['ASER', 'M', 'PER'],
  IAND: ['ACHL', 'M', 'PER'],
  BFZ: ['ACLY', 'S', 'FRC'],
  BFG: ['ACLY', 'I', 'PER'],
};

const COLOUR = { COLL: 'BRN', FRHYF: 'RED', SCHRF: 'ORG', GOS: 'BRN', CMSQ: 'WHT', MSUL: 'YEL', VMS: 'GRY', VSU: 'GRY', FRHY: 'PNK', SCHR: 'GRY', FRHTF: 'CRM', SCHTR: 'GRY', IAND: 'GRN', BFZ: 'GRY', BFG: 'BLK' };

function grades(u, R, md) {
  const ln = (mu, s) => Math.exp(Math.log(mu) + R.normal(0, s));
  const g = { Au_ppm: ln(0.03, 0.6), Cu_pct: ln(0.015, 0.5), Ag_ppm: ln(0.8, 0.5), Zn_ppm: ln(120, 0.5), S_pct: ln(0.4, 0.6), Al_pct: R.range(6.2, 8.1), Fe_pct: R.range(1.5, 3.5) };
  if (u === 'MSUL') Object.assign(g, { Au_ppm: ln(4.2, 0.45), Cu_pct: ln(2.4, 0.35), Ag_ppm: ln(38, 0.4), Zn_ppm: ln(9000, 0.5), S_pct: R.range(28, 42), Al_pct: R.range(0.4, 1.8), Fe_pct: R.range(22, 34) });
  if (u === 'VMS') Object.assign(g, { Au_ppm: ln(1.4, 0.5), Cu_pct: ln(0.8, 0.45), Ag_ppm: ln(12, 0.5), Zn_ppm: ln(3000, 0.6), S_pct: R.range(9, 22), Al_pct: R.range(2.5, 5), Fe_pct: R.range(9, 18) });
  if (u === 'VSU') Object.assign(g, { Au_ppm: ln(0.45, 0.6), Cu_pct: ln(0.25, 0.5), S_pct: R.range(3, 8) });
  if (u === 'GOS') Object.assign(g, { Au_ppm: ln(2.1, 0.5), Cu_pct: ln(0.12, 0.5), Ag_ppm: ln(9, 0.5), S_pct: R.range(0.1, 0.8), Fe_pct: R.range(25, 45), Al_pct: R.range(1, 3) });
  if (u === 'CMSQ') Object.assign(g, { Au_ppm: ln(0.55, 0.6), Cu_pct: ln(0.03, 0.5), S_pct: R.range(0.2, 2.5), Al_pct: R.range(0.2, 0.9), Fe_pct: R.range(2, 7) });
  if (u === 'FRHYF' || u === 'SCHRF') Object.assign(g, { Fe_pct: R.range(6, 14), Au_ppm: ln(0.08, 0.6) });
  if (u === 'IAND') Object.assign(g, { Al_pct: R.range(7.5, 9), Fe_pct: R.range(5, 8), Au_ppm: ln(0.01, 0.5) });
  if (md < OX_DEPTH && u !== 'GOS') g.S_pct = Math.min(g.S_pct, R.range(0.02, 0.3));
  for (const k of Object.keys(g)) g[k] = round(g[k], k === 'Au_ppm' ? 3 : k.endsWith('_pct') ? 3 : 1);
  return g;
}

const CRMS = [
  { code: 'DEMO-STD-A', Au_ppm: [0.52, 0.021], Cu_pct: [0.31, 0.009] },
  { code: 'DEMO-STD-B', Au_ppm: [2.05, 0.064], Cu_pct: [1.12, 0.03] },
  { code: 'DEMO-STD-C', Au_ppm: [7.9, 0.21], Cu_pct: [2.86, 0.07] },
];

export function buildDemo({ holes = 11, seed = 20260928 } = {}) {
  const R = rng(seed);
  const ops = [];
  const up = (table, holeId, row) => ops.push({ type: 'upsert', table, holeId, row });

  // project settings & libraries
  setSettings({
    elements: {
      Au_ppm: { lor: 0.005, unit: 'ppm', method: 'Au-AA23' },
      Cu_pct: { lor: 0.0001, unit: 'pct', method: 'ME-ICP61' },
      Ag_ppm: { lor: 0.5, unit: 'ppm', method: 'ME-ICP61' },
      Zn_ppm: { lor: 2, unit: 'ppm', method: 'ME-ICP61' },
      S_pct: { lor: 0.01, unit: 'pct', method: 'ME-ICP61' },
      Al_pct: { lor: 0.01, unit: 'pct', method: 'ME-ICP61' },
      Fe_pct: { lor: 0.01, unit: 'pct', method: 'ME-ICP61' },
    },
    qc: { crmRotation: CRMS.map((c) => c.code), blankCode: 'DEMO-BLANK' },
    stripElements: ['Au_ppm', 'Cu_pct'],
    intercepts: { element: 'Au_ppm', cutoff: 0.3, minLen: 2, maxDil: 3, incl: 1.0, secondary: ['Cu_pct', 'Ag_ppm'] },
    people: {},
  });
  for (const c of CRMS) {
    for (const el of ['Au_ppm', 'Cu_pct']) up('crms', '', { code: c.code, element: el, expected: c[el][0], sd: c[el][1], supplier: 'Demo (not a real CRM)' });
  }
  up('crms', '', { code: 'DEMO-BLANK', element: 'Au_ppm', expected: 0.0025, sd: 0.001, supplier: 'Demo', isBlank: true });

  let tag = 1;
  const tagId = () => `DM${String(tag++).padStart(6, '0')}`;
  let primCount = 0;
  let alSeed = null;
  let carrySeeded = false;
  const dispatches = [];
  let curDispatch = null;

  for (let h = 1; h <= holes; h++) {
    const holeId = `DEMO-${String(h).padStart(2, '0')}`;
    const line = Math.floor((h - 1) / 4);
    const pos = (h - 1) % 4;
    const east = round(500200 + pos * 45 - line * 70 + R.range(-6, 6), 2);
    const north = round(5140180 + pos * 12 + line * 70 + R.range(-6, 6), 2);
    const rl = round(1812 - pos * 3 + R.range(-2, 2), 2);
    const planned = h === holes;
    const drilling = h === holes - 1;
    const eohFull = round(140 + pos * 25 + R.range(0, 20), 1);
    const eoh = planned ? null : drilling ? round(eohFull * 0.55, 1) : eohFull;
    const azimuth = 225;
    const dip = -60;
    const start = new Date(2026, 5, 1 + h * 5);
    up('collar', holeId, {
      holeId,
      prospect: line === 0 ? 'Red Hill North' : line === 1 ? 'Red Hill Central' : 'Red Hill South',
      holeType: 'DD',
      status: planned ? 'PLN' : drilling ? 'ACT' : 'CMP',
      east,
      north,
      rl,
      azimuth,
      dip,
      plannedDepth: eohFull,
      eoh,
      startDate: planned ? null : start.toISOString().slice(0, 10),
      endDate: planned || drilling ? null : new Date(start.getTime() + 6 * 864e5).toISOString().slice(0, 10),
      coreSize: 'HQ',
      contractor: 'Demo Drilling LLC',
      rig: `RIG-${(h % 2) + 1}`,
      geologist: h % 2 ? 'Geologist A' : 'Geologist B',
      lease: 'DEMO-LIC-01',
      surveyMethod: 'DGPS',
      remarks: planned ? 'Planned — awaiting rig' : null,
    });
    if (planned) continue;

    // downhole surveys every 30 m (gyro), gentle lift and drift
    const surveys = [];
    for (let d = 0; d <= eoh; d += 30) {
      const s = { depth: d, azimuth: round(azimuth + d * 0.012 + R.range(-0.3, 0.3), 2), dip: round(dip + d * 0.02 + R.range(-0.2, 0.2), 2), method: 'GYR', date: start.toISOString().slice(0, 10), company: 'Demo Survey LLC' };
      if (h === 4 && d === 90) s.azimuth = round(s.azimuth + 14, 2); // bad reading → dogleg warning
      surveys.push(s);
      up('survey', holeId, s);
    }
    const tr = buildTrace({ east, north, rl, azimuth, dip, eoh }, surveys);

    // lithology: walk down-hole in 0.5 m steps, merge equal units
    const lith = [];
    let cur = null;
    for (let md = 0; md < eoh - 1e-6; md += 0.5) {
      const p = tr.at(md + 0.25).p;
      const u = unitAt(p, md, R, h);
      if (cur && cur.code === u && md - cur.from < 12) cur.to = round(md + 0.5, 2);
      else {
        cur = { code: u, from: round(md, 2), to: round(Math.min(eoh, md + 0.5), 2) };
        lith.push(cur);
      }
    }
    lith[lith.length - 1].to = eoh;
    // small core-loss runs in the fault zone
    for (const L of lith) if (L.code === 'BFG' && L.to - L.from > 1) L.code = R() < 0.4 ? 'CL' : 'BFG';

    for (const L of lith) {
      const [a1, i1, s1] = ALT[L.code] || [null, null, null];
      const sulph = L.code === 'MSUL' ? { py: round(R.range(42, 55), 0), cpy: round(R.range(6, 12), 0), bn: round(R.range(2, 6), 0) } : L.code === 'VMS' ? { py: round(R.range(12, 25), 0), cpy: round(R.range(2, 6), 1), bn: round(R.range(0, 2), 1) } : L.code === 'VSU' ? { py: round(R.range(3, 7), 1), cpy: round(R.range(0.5, 2), 1) } : ['FRHY', 'SCHR', 'FRHTF', 'SCHTR'].includes(L.code) && L.from > OX_DEPTH ? { py: round(R.range(0.5, 3), 1) } : {};
      const weathering = L.from < 3 ? '1' : L.from < 12 ? '2' : L.from < OX_DEPTH ? '3' : L.from < OX_DEPTH + 10 ? '5' : '6';
      up('lith', holeId, {
        from: L.from,
        to: L.to,
        lith1: L.code,
        weathering: L.code === 'CL' ? null : weathering,
        hardness: L.code === 'CMSQ' || L.code === 'MSUL' ? '6' : L.code === 'BFG' || L.code === 'COLL' ? '1' : L.code === 'BFZ' ? '2' : String(3 + (R() < 0.5 ? 1 : 0)),
        shade: R() < 0.5 ? 'L' : 'M',
        colour1: COLOUR[L.code] || 'GRY',
        grainSize: ['FRHY', 'FRHYF', 'SCHR', 'SCHRF', 'CMSQ'].includes(L.code) ? 'APH' : L.code === 'IAND' ? 'F' : L.code === 'MSUL' ? 'M' : null,
        texture: L.code === 'CMSQ' ? 'MAS' : L.code.includes('TF') || L.code === 'SCHTR' ? 'CLA' : L.code === 'FRHY' || L.code === 'FRHYF' ? (R() < 0.5 ? 'FLB' : 'POR') : L.code === 'BFG' ? 'FRG' : 'MAS',
        structure: L.code === 'BFZ' || L.code === 'BFG' ? 'FAU' : L.code.startsWith('SCH') ? 'FOL' : 'MAS',
        strucInt: L.code === 'BFG' ? 'S' : L.code.startsWith('SCH') ? 'M' : null,
        alt1: a1,
        int1: i1,
        style1: s1,
        ...(() => {
          const a2 = (L.code === 'FRHY' && R() < 0.4) || L.code === 'MSUL' ? 'ASIL' : null;
          return { alt2: a2, int2: a2 ? (L.code === 'MSUL' ? 'M' : 'W') : null, style2: a2 ? 'SEL' : null };
        })(),
        sulphStyle: L.code === 'MSUL' ? 'MAS' : L.code === 'VMS' ? 'SMS' : L.code === 'VSU' ? 'VNL' : sulph.py ? 'DIS' : null,
        ...sulph,
        veinPct: L.code === 'VSU' ? round(R.range(5, 20), 0) : L.code === 'FRHY' && R() < 0.2 ? round(R.range(1, 5), 0) : null,
        veinStyle: L.code === 'VSU' ? 'STK' : null,
        veinMinerals: L.code === 'VSU' ? 'qtz-py-cpy' : null,
        comments:
          L.code === 'MSUL' ? 'Massive py-cpy with bornite blebs; banded in part.' : L.code === 'CMSQ' ? 'Vuggy silica, steel will not scratch; no feldspar, no clay.' : L.code === 'GOS' ? 'Boxwork gossan after sulphide, goethite-hematite.' : L.code === 'BFG' ? 'Clay gouge, broken core.' : L.code === 'CL' ? 'Core loss in fault.' : null,
        logger: h % 2 ? 'Geologist A' : 'Geologist B',
        logDate: new Date(start.getTime() + 3 * 864e5).toISOString().slice(0, 10),
      });
    }

    // geotech runs (3 m)
    for (let f = 0; f < eoh - 1e-6; f += 3) {
      const t = round(Math.min(eoh, f + 3), 2);
      const len = t - f;
      const inFault = lith.some((L) => (L.code === 'BFZ' || L.code === 'BFG' || L.code === 'CL') && L.from < t && L.to > f);
      const rec = round(len * (inFault ? R.range(0.55, 0.85) : f < 6 ? R.range(0.7, 0.95) : R.range(0.93, 1)), 2);
      const rqd = round(rec * (inFault ? R.range(0.05, 0.3) : f < OX_DEPTH ? R.range(0.3, 0.7) : R.range(0.6, 0.97)), 2);
      up('geotech', holeId, { from: round(f, 2), to: t, recovered: rec, rqd, fractures: inFault ? R.int(15, 40) : R.int(1, 12), trayNo: String(Math.floor(f / 4.5) + 1), logger: 'Technician' });
    }

    // structures
    const nStr = R.int(10, 22);
    for (let i = 0; i < nStr; i++) {
      const depth = round(R.range(OX_DEPTH, eoh - 1), 2);
      const type = R.pick(['FOL', 'FOL', 'VN', 'JNT', 'FLT', 'CNT']);
      up('struct', holeId, { depth, type, alpha: Math.round(type === 'FOL' ? R.range(35, 55) : R.range(15, 80)), beta: Math.round(R.range(0, 359)), thickness: type === 'VN' ? round(R.range(0.2, 4), 1) : null, fill: type === 'VN' ? 'qtz' : type === 'FLT' ? 'clay' : null });
    }

    // density & magnetic susceptibility
    for (let d = 5; d < eoh; d += 10) {
      const L = lith.find((x) => x.from <= d && x.to > d);
      const sg = L?.code === 'MSUL' ? R.range(3.8, 4.4) : L?.code === 'VMS' ? R.range(3.0, 3.6) : L?.code === 'COLL' ? R.range(1.8, 2.1) : R.range(2.55, 2.75);
      up('phys', holeId, { depth: round(d, 2), sg: round(sg, 3), magsus: round(L?.code === 'IAND' ? R.range(8, 25) : R.range(0.02, 0.4), 3), method: 'Water immersion / KT-10' });
    }

    // pXRF every metre (indicative only)
    for (let d = 0; d < eoh - 0.5; d += 1) {
      const L = lith.find((x) => x.from <= d + 0.5 && x.to > d + 0.5);
      if (!L || L.code === 'CL') continue;
      const g = grades(L.code, R, d);
      up('pxrf', holeId, { from: round(d, 2), to: round(Math.min(eoh, d + 1), 2), reading: String(1000 + h * 300 + d), values: { Cu_pct: round(g.Cu_pct * R.range(0.7, 1.3), 3), Zn_ppm: round(g.Zn_ppm * R.range(0.6, 1.4), 0), Fe_pct: round(g.Fe_pct * R.range(0.8, 1.2), 2), S_pct: round(g.S_pct * R.range(0.6, 1.2), 2), Ba_ppm: round(R.range(200, 1800), 0) } });
    }

    // samples: 1 m (max 1.5, min 0.5), broken at lithology contacts; QC in stream
    if (drilling) continue; // core not yet sampled on the active hole
    const certA = `DEMO-LAB-${2600 + h}A`;
    const qcAssay = (sampleId, values, cert) => up('assays', holeId, { sampleId, labJob: cert.split('-').slice(0, 3).join('-'), certificate: cert, received: new Date(start.getTime() + 30 * 864e5).toISOString().slice(0, 10), values, flags: {} });
    if (!curDispatch || curDispatch.n > 180) {
      curDispatch = { batchId: `DEMO-DSP-${String(dispatches.length + 1).padStart(3, '0')}`, n: 0, date: new Date(start.getTime() + 9 * 864e5).toISOString().slice(0, 10) };
      dispatches.push(curDispatch);
    }
    let lastPrim = null;
    for (const L of lith) {
      if (L.code === 'CL' || L.code === 'COLL') continue;
      let f = L.from;
      while (f < L.to - 1e-6) {
        let t = Math.min(L.to, f + 1);
        if (L.to - t < 0.5 && L.to - t > 1e-6) t = L.to; // absorb short remnants
        const sampleId = tagId();
        const len = t - f;
        up('samples', holeId, { from: round(f, 2), to: round(t, 2), sampleId, sampleType: 'PRIM', weight: round(len * R.range(3.2, 3.8), 2), dispatchId: curDispatch.batchId });
        curDispatch.n++;
        primCount++;
        const md = (f + t) / 2;
        const g = grades(L.code, R, md);
        // seeded QA-rule hit: one CMSQ sample with Al above 1 %
        if (L.code === 'CMSQ' && (!alSeed || alSeed === L)) {
          alSeed = L;
          g.Al_pct = round(R.range(1.4, 2.2), 2);
        }
        const flags = {};
        if (g.Au_ppm < 0.005) {
          g.Au_ppm = 0.0025;
          flags.Au_ppm = '<';
        }
        qcAssay(sampleId, g, certA);
        lastPrim = { sampleId, f, t, g };
        // QC insertion
        if (primCount % 20 === 0) {
          const dupId = tagId();
          up('samples', holeId, { from: round(f, 2), to: round(t, 2), sampleId: dupId, sampleType: 'FDUP', parentId: sampleId, weight: round(len * 1.7, 2), dispatchId: curDispatch.batchId });
          const dg = {};
          for (const [k, v] of Object.entries(g)) dg[k] = round(v * Math.exp(R.normal(0, k === 'Au_ppm' ? 0.18 : 0.07)), 3);
          qcAssay(dupId, dg, certA);
        }
        if (primCount % 25 === 0) {
          const c = CRMS[Math.floor(primCount / 25) % CRMS.length];
          const id = tagId();
          up('samples', holeId, { sampleId: id, sampleType: 'CRM', crm: c.code, dispatchId: curDispatch.batchId });
          const bias = h === 6 && c.code === 'DEMO-STD-B' ? 3.6 : R.normal(0, 1); // seeded CRM failure
          qcAssay(id, { Au_ppm: round(c.Au_ppm[0] + bias * c.Au_ppm[1], 3), Cu_pct: round(c.Cu_pct[0] + R.normal(0, 1) * c.Cu_pct[1], 3) }, certA);
        }
        if ((primCount + 12) % 25 === 0) {
          const id = tagId();
          up('samples', holeId, { sampleId: id, sampleType: 'BLK', crm: 'DEMO-BLANK', dispatchId: curDispatch.batchId });
          const carry = !carrySeeded && lastPrim && lastPrim.g.Au_ppm > 1.5; // seeded carry-over after high grade
          if (carry) carrySeeded = true;
          qcAssay(id, { Au_ppm: carry ? 0.071 : R() < 0.8 ? 0.0025 : 0.006, Cu_pct: round(R.range(0.0005, 0.002), 4) }, certA);
        }
        f = t;
      }
    }
  }

  for (const d of dispatches) up('dispatch', '', { batchId: d.batchId, lab: 'Demo Lab (Ulaanbaatar)', methods: 'Au-AA23, ME-ICP61', dispatched: d.date, dispatchedBy: 'Geologist A', courier: 'Demo Courier', received: d.date, labJob: d.batchId.replace('DSP', 'LAB'), status: 'Results received' });

  // ---- deliberate problems for the validation page (clearly synthetic)
  const res = mutate(ops, { label: 'Demo data (synthetic)' });
  seedIssues();
  return res;
}

function seedIssues() {
  const ops = [];
  const lith3 = rows('lith', 'DEMO-03');
  if (lith3.length > 12) {
    const r = lith3[10];
    ops.push({ type: 'upsert', table: 'lith', holeId: 'DEMO-03', row: { id: r.id, to: round(r.to + 0.4, 2) } }); // overlap
  }
  const lith5 = rows('lith', 'DEMO-05');
  if (lith5.length > 8) ops.push({ type: 'delete', table: 'lith', holeId: 'DEMO-05', id: lith5[7].id }); // gap
  const lith7 = rows('lith', 'DEMO-07');
  if (lith7.length > 15) {
    ops.push({ type: 'upsert', table: 'lith', holeId: 'DEMO-07', row: { id: lith7[14].id, lith1: 'QRM', comments: 'v3.1 code typed by habit — not in the v4 list' } }); // unknown code
    ops.push({ type: 'upsert', table: 'lith', holeId: 'DEMO-07', row: { id: lith7[5].id, lith1: 'MT' } }); // do-not-use code
  }
  const lith1 = rows('lith', 'DEMO-01');
  if (lith1.length > 6) {
    ops.push({
      type: 'upsert',
      table: 'lith',
      holeId: 'DEMO-01',
      row: {
        id: lith1[6].id,
        comments:
          'Very long description pasted from a field notebook. ' +
          'Rhyolite with flow banding and scattered quartz-eye phenocrysts, sericite on foliation planes, weak pyrite along fractures, local hematite staining near the top of the interval, a few thin quartz veinlets at a low angle to the core axis, and one clay-filled fracture at the base. '.repeat(3),
      },
    }); // > 500 characters
  }
  if (ops.length) mutate(ops, { label: 'Demo: seeded data problems' });
}


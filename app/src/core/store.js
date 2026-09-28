// ORD data store.
//
// Data is held as *documents*: one document per (hole, table) plus one per
// project-scope table. A document carries its rows and its own change history.
// That unit is what gets persisted locally (IndexedDB) and synced to the shared
// cloud store, and it lets every row carry an id, a timestamp and an author so
// concurrent edits merge row-by-row instead of overwriting each other.
//
// Every change goes through `mutate()`, which records who changed what, when,
// old -> new, under a batch id. Any batch (an import, a paste, a split) can be
// undone as a whole — deletes are tombstones, so nothing is ever lost.

import { uid, now, natCmp, isNum, debounce } from './util.js';
import { TABLES } from './schema.js';
import { DEFAULT_LISTS, defaultSettings } from './codes.js';

const HIST_CAP = 400;
const listeners = new Set();
const cache = new Map();

export const S = {
  rev: 0,
  projects: [],
  pid: null,
  project: null,
  docs: new Map(),
  user: { id: 'local', name: '' },
  lang: 'mn',
  status: { saving: false, lastSaved: 0, error: null, cloud: 'off', storage: 'memory' },
  adapter: null,
  sync: null, // cloud sync hooks: { push(docs), deleteDocs(keys) }
  ctx: {},
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit() {
  S.rev++;
  cache.clear();
  for (const fn of [...listeners]) {
    try {
      fn(S.rev);
    } catch (e) {
      console.error(e);
    }
  }
}

export function memo(key, fn) {
  if (cache.has(key)) return cache.get(key);
  const v = fn();
  cache.set(key, v);
  return v;
}

// ---------------------------------------------------------------- documents

export const isProjectTable = (t) => TABLES[t]?.scope === 'project' || t === 'settings';
export const docKey = (table, holeId) => (isProjectTable(table) ? `_|${table}` : `${holeId ?? ''}|${table}`);

export function getDoc(table, holeId, create = false) {
  const key = docKey(table, holeId);
  let d = S.docs.get(key);
  if (!d && create) {
    d = { key, holeId: isProjectTable(table) ? '' : holeId ?? '', table, rows: [], hist: [], t: 0 };
    S.docs.set(key, d);
  }
  return d;
}

export function serializeDoc(d) {
  return { key: d.key, holeId: d.holeId, table: d.table, rows: d.rows, hist: d.hist, t: d.t };
}

// ------------------------------------------------------------------ queries

function sortRows(table, list) {
  const def = TABLES[table];
  if (!def) return list;
  if (table === 'collar') return list.sort((a, b) => natCmp(a.holeId, b.holeId));
  if (table === 'codes') return list.sort((a, b) => natCmp(a.list, b.list) || (a.order ?? 999) - (b.order ?? 999) || natCmp(a.code, b.code));
  if (table === 'samples' || table === 'assays') {
    return list.sort((a, b) => natCmp(a.holeId, b.holeId) || natCmp(a.sampleId, b.sampleId));
  }
  if (def.kind === 'interval' || table === 'pxrf') {
    return list.sort((a, b) => natCmp(a.holeId, b.holeId) || (a.from ?? 1e9) - (b.from ?? 1e9) || (a.to ?? 1e9) - (b.to ?? 1e9));
  }
  if (def.kind === 'point') {
    return list.sort((a, b) => natCmp(a.holeId, b.holeId) || (a.depth ?? 1e9) - (b.depth ?? 1e9));
  }
  if (def.match?.length) return list.sort((a, b) => natCmp(a[def.match[0]], b[def.match[0]]));
  return list;
}

/** Live (non-deleted) rows of a table; for a hole, or across all holes. */
export function rows(table, holeId) {
  return memo(`r|${table}|${holeId ?? '*'}`, () => {
    let out = [];
    if (holeId === undefined || isProjectTable(table)) {
      for (const d of S.docs.values()) if (d.table === table) for (const r of d.rows) if (!r._d) out.push(r);
    } else {
      const d = S.docs.get(docKey(table, holeId));
      if (d) out = d.rows.filter((r) => !r._d);
    }
    return sortRows(table, out);
  });
}

export const holes = () => rows('collar');
export const hole = (holeId) => memo(`h|${holeId}`, () => holes().find((h) => h.holeId === holeId) || null);
export const holeIds = () => memo('holeIds', () => holes().map((h) => h.holeId));

export function codes(list, { includeInactive = false } = {}) {
  return memo(`c|${list}|${includeInactive}`, () => rows('codes').filter((c) => c.list === list && (includeInactive || !c.inactive)));
}

export function codeMap(list) {
  return memo(`cm|${list}`, () => new Map(rows('codes').filter((c) => c.list === list).map((c) => [c.code, c])));
}

export function meaning(list, code) {
  if (code === null || code === undefined || code === '') return '';
  const c = codeMap(list).get(String(code));
  if (!c) return '';
  return S.lang === 'mn' ? c.meaningMn || c.meaning || '' : c.meaning || c.meaningMn || '';
}

export function codeColor(list, code, fallback = '#b8c2c0') {
  const c = codeMap(list).get(String(code ?? ''));
  return c?.color || fallback;
}

export function settings() {
  return memo('settings', () => {
    const d = S.docs.get(docKey('settings'));
    const row = d?.rows.find((r) => r.id === 'settings') || {};
    const def = defaultSettings();
    const out = { ...def, ...row };
    for (const k of ['qc', 'chem', 'intercepts']) out[k] = { ...def[k], ...(row[k] || {}) };
    out.elements = { ...(row.elements || {}) };
    return out;
  });
}

/** Max logged depth of a hole across interval tables. */
export function loggedTo(holeId) {
  return memo(`lt|${holeId}`, () => {
    let m = null;
    for (const t of ['lith', 'geotech']) for (const r of rows(t, holeId)) if (isNum(r.to) && (m === null || r.to > m)) m = r.to;
    return m;
  });
}

export function sampleById(sampleId) {
  return memo('sidx', () => new Map(rows('samples').map((s) => [String(s.sampleId), s]))).get(String(sampleId));
}

/** Assay values of a sample merged across certificates (latest report wins per element). */
export function assayValues(sampleId) {
  const idx = memo('aidx', () => {
    const m = new Map();
    const list = [...rows('assays')].sort((a, b) => String(a.received ?? '').localeCompare(String(b.received ?? '')) || (a._t ?? 0) - (b._t ?? 0));
    for (const a of list) {
      const k = String(a.sampleId);
      const cur = m.get(k) || { values: {}, flags: {}, certs: [] };
      Object.assign(cur.values, a.values || {});
      Object.assign(cur.flags, a.flags || {});
      if (a.certificate) cur.certs.push(a.certificate);
      m.set(k, cur);
    }
    return m;
  });
  return idx.get(String(sampleId)) || null;
}

export function sampleStatus(s) {
  if (!s) return '';
  if (assayValues(s.sampleId)) return 'assayed';
  if (s.dispatchId) return 'dispatched';
  return 'pending';
}

/** Known element keys (from settings + seen in assays/pXRF). */
export function elementKeys(table = 'assays') {
  return memo(`ek|${table}`, () => {
    const set = new Set();
    for (const r of rows(table)) for (const k of Object.keys(r.values || {})) set.add(k);
    if (table === 'assays') for (const k of Object.keys(settings().elements || {})) set.add(k);
    return [...set].sort(natCmp);
  });
}

// calc context used by schema `calc` fields
S.ctx = {
  meaning,
  loggedTo,
  sampleStatus,
  orient: null, // injected by core/structure.js
};

// ---------------------------------------------------------------- mutations

const same = (a, b) => {
  if (a === b) return true;
  const na = a === null || a === undefined || a === '';
  const nb = b === null || b === undefined || b === '';
  if (na && nb) return true;
  if (typeof a === 'object' && typeof b === 'object' && a && b) return JSON.stringify(a) === JSON.stringify(b);
  return false;
};

function cleanPatch(table, row) {
  const def = TABLES[table];
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) continue;
    const f = def?.fields.find((x) => x.key === k);
    if (f && f.type === 'calc') continue;
    out[k] = v === '' ? null : v;
  }
  return out;
}

const dirty = new Set(); // changed here: save locally and push to the cloud
const localDirty = new Set(); // arrived from the cloud: save locally only
let flushTimer = null;

function scheduleSave() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flushNow, 350);
}

export async function flushNow() {
  clearTimeout(flushTimer);
  if ((!dirty.size && !localDirty.size) || !S.pid) return;
  const pushList = [...dirty];
  const saveList = [...new Set([...dirty, ...localDirty])];
  dirty.clear();
  localDirty.clear();
  S.status.saving = true;
  try {
    if (S.adapter) await S.adapter.saveDocs(S.pid, saveList.map(serializeDoc));
    S.status.lastSaved = now();
    S.status.error = null;
    if (S.project && pushList.length) {
      S.project.updated = now();
      S.adapter?.saveProject?.(S.project);
    }
  } catch (e) {
    console.error(e);
    S.status.error = String(e?.message || e);
    for (const d of pushList) dirty.add(d);
  }
  S.status.saving = false;
  if (pushList.length) {
    try {
      S.sync?.push?.(pushList);
    } catch (e) {
      console.error(e);
    }
  }
  emit();
}

/**
 * Apply a list of operations as one batch.
 *   {type:'upsert', table, holeId, row}      row.id present -> patch, else create
 *   {type:'delete', table, holeId, id}
 *   {type:'restore', table, holeId, id}
 * Returns {batch, created, updated, deleted, ids}.
 */
export function mutate(ops, { batch, label = '' } = {}) {
  batch = batch || uid(8);
  const t = now();
  const u = S.user.id;
  const res = { batch, created: 0, updated: 0, deleted: 0, ids: [] };
  const touched = new Set();
  for (const op of ops) {
    const doc = getDoc(op.table, op.holeId, true);
    const hist = (o, rowId, c) => doc.hist.push({ id: uid(10), t, u, b: batch, l: label, r: rowId, o, c });
    if (op.type === 'upsert') {
      const patch = cleanPatch(op.table, op.row);
      const idx = patch.id ? doc.rows.findIndex((r) => r.id === patch.id) : -1;
      if (idx < 0) {
        const row = { ...patch, id: patch.id || uid(), _t: t, _u: u };
        if (!isProjectTable(op.table)) row.holeId = op.holeId;
        doc.rows.push(row);
        const c = {};
        for (const [k, v] of Object.entries(row)) if (!k.startsWith('_') && k !== 'id' && v !== null) c[k] = [null, v];
        hist('c', row.id, c);
        res.created++;
        res.ids.push(row.id);
      } else {
        const old = doc.rows[idx];
        const c = {};
        for (const [k, v] of Object.entries(patch)) {
          if (k === 'id' || k.startsWith('_')) continue;
          if (!same(old[k], v)) c[k] = [old[k] ?? null, v ?? null];
        }
        const wasDeleted = !!old._d;
        if (!Object.keys(c).length && !wasDeleted) continue;
        const row = { ...old, ...patch, _t: t, _u: u };
        delete row._d;
        doc.rows[idx] = row;
        hist(wasDeleted ? 'r' : 'u', row.id, c);
        if (wasDeleted) res.created++;
        else res.updated++;
        res.ids.push(row.id);
      }
    } else if (op.type === 'delete' || op.type === 'restore') {
      const idx = doc.rows.findIndex((r) => r.id === op.id);
      if (idx < 0) continue;
      const old = doc.rows[idx];
      if (op.type === 'delete' && old._d) continue;
      if (op.type === 'restore' && !old._d) continue;
      const row = { ...old, _t: t, _u: u };
      if (op.type === 'delete') row._d = true;
      else delete row._d;
      doc.rows[idx] = row;
      const snap = {};
      for (const [k, v] of Object.entries(old)) if (!k.startsWith('_') && k !== 'id' && v !== null) snap[k] = [v, v];
      hist(op.type === 'delete' ? 'd' : 'r', row.id, snap);
      if (op.type === 'delete') res.deleted++;
      else res.created++;
      res.ids.push(row.id);
    }
    doc.t = t;
    if (doc.hist.length > HIST_CAP) doc.hist.splice(0, doc.hist.length - HIST_CAP);
    touched.add(doc);
  }
  for (const d of touched) dirty.add(d);
  if (touched.size) {
    scheduleSave();
    emit();
  }
  return res;
}

export const upsert = (table, holeId, row, opt) => mutate([{ type: 'upsert', table, holeId, row }], opt);
export const remove = (table, holeId, ids, opt) => mutate(ids.map((id) => ({ type: 'delete', table, holeId, id })), opt);

/** Every history entry, newest first, with its document context. */
export function history() {
  return memo('hist', () => {
    const out = [];
    for (const d of S.docs.values()) for (const e of d.hist) out.push({ ...e, table: d.table, holeId: d.holeId });
    return out.sort((a, b) => b.t - a.t);
  });
}

export function batches() {
  return memo('batches', () => {
    const m = new Map();
    for (const e of history()) {
      const b = m.get(e.b) || { batch: e.b, label: e.l, t: e.t, u: e.u, n: 0, tables: new Set(), holes: new Set(), ops: { c: 0, u: 0, d: 0, r: 0 } };
      b.n++;
      b.tables.add(e.table);
      if (e.holeId) b.holes.add(e.holeId);
      b.ops[e.o] = (b.ops[e.o] || 0) + 1;
      if (e.t > b.t) b.t = e.t;
      m.set(e.b, b);
    }
    return [...m.values()].sort((a, b) => b.t - a.t);
  });
}

/** Reverse a whole batch (import, paste, split, delete...). */
export function undoBatch(batchId, label) {
  const entries = history().filter((e) => e.b === batchId);
  const ops = [];
  for (const e of entries) {
    if (e.o === 'c' || e.o === 'r') ops.push({ type: 'delete', table: e.table, holeId: e.holeId, id: e.r });
    else if (e.o === 'd') ops.push({ type: 'restore', table: e.table, holeId: e.holeId, id: e.r });
    else if (e.o === 'u') {
      const row = { id: e.r };
      for (const [k, [o]] of Object.entries(e.c || {})) row[k] = o;
      ops.push({ type: 'upsert', table: e.table, holeId: e.holeId, row });
    }
  }
  return mutate(ops, { label: label || `Undo: ${entries[0]?.l || batchId}` });
}

/** History of one row, newest first. */
export function rowHistory(table, holeId, rowId) {
  const d = getDoc(table, holeId);
  return d ? d.hist.filter((e) => e.r === rowId).sort((a, b) => b.t - a.t) : [];
}

// -------------------------------------------------------------- hole helpers

export function addHole(fields, opt) {
  return upsert('collar', fields.holeId, { status: 'PLN', holeType: 'DD', ...fields }, { label: `New hole ${fields.holeId}`, ...opt });
}

/** Rename a hole everywhere (all tables), as one undoable batch of moves. */
export function renameHole(oldId, newId) {
  if (!newId || oldId === newId || hole(newId)) return null;
  const batch = uid(8);
  const ops = [];
  for (const d of [...S.docs.values()]) {
    if (d.holeId !== oldId) continue;
    for (const r of d.rows) {
      if (r._d) continue;
      const { _t, _u, ...rest } = r;
      ops.push({ type: 'delete', table: d.table, holeId: oldId, id: r.id });
      ops.push({ type: 'upsert', table: d.table, holeId: newId, row: { ...rest, id: r.id, holeId: newId, ...(d.table === 'collar' ? { holeId: newId } : {}) } });
    }
  }
  return mutate(ops, { batch, label: `Rename ${oldId} → ${newId}` });
}

export function deleteHole(holeId) {
  const ops = [];
  for (const d of S.docs.values()) {
    if (d.holeId !== holeId) continue;
    for (const r of d.rows) if (!r._d) ops.push({ type: 'delete', table: d.table, holeId, id: r.id });
  }
  return mutate(ops, { label: `Delete hole ${holeId}` });
}

export function setSettings(patch) {
  const cur = settings();
  const next = { id: 'settings' };
  for (const [k, v] of Object.entries(patch)) next[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(cur[k] || {}), ...v } : v;
  return mutate([{ type: 'upsert', table: 'settings', row: next }], { label: 'Settings' });
}

// ------------------------------------------------------------ projects

function seedOps() {
  const ops = [];
  for (const [list, items] of Object.entries(DEFAULT_LISTS)) {
    items.forEach((c, i) => {
      const { code, meaning: en, meaningMn, color, group, verify, warn, mxPending, mxFallback } = c;
      ops.push({
        type: 'upsert',
        table: 'codes',
        row: { id: `${list}:${code}`, list, code, meaning: en, meaningMn, color: color || null, group: group || null, order: c.order ?? i, verify: verify || null, warn: warn || null, mxPending: mxPending || null, mxFallback: mxFallback || null },
      });
    });
  }
  ops.push({ type: 'upsert', table: 'settings', row: { id: 'settings', ...defaultSettings() } });
  return ops;
}

export async function listProjects() {
  S.projects = (await S.adapter?.listProjects?.()) || S.projects;
  return S.projects;
}

export async function openProject(id) {
  await flushNow();
  const meta = S.projects.find((p) => p.id === id);
  if (!meta) throw new Error(`Project ${id} not found`);
  S.pid = id;
  S.project = meta;
  S.docs = new Map();
  const docs = (await S.adapter?.loadDocs?.(id)) || [];
  for (const d of docs) S.docs.set(d.key, { ...d, rows: d.rows || [], hist: d.hist || [] });
  // make sure code lists exist for projects created by older versions
  if (!S.docs.get(docKey('codes'))) mutate(seedOps(), { label: 'Default code lists' });
  try {
    localStorage.setItem('ord.lastProject', id);
  } catch {}
  emit();
  return meta;
}

export async function createProject({ name, description = '', demo = false, id } = {}) {
  const meta = { id: id || `p${uid(10)}`, name: name || 'New project', description, demo, created: now(), updated: now(), owner: S.user.id };
  S.projects = [...S.projects.filter((p) => p.id !== meta.id), meta];
  await S.adapter?.saveProject?.(meta);
  await openProject(meta.id);
  mutate(seedOps(), { label: 'Project created' });
  await flushNow();
  return meta;
}

export async function renameProject(id, name) {
  const p = S.projects.find((x) => x.id === id);
  if (!p) return;
  p.name = name;
  await S.adapter?.saveProject?.(p);
  emit();
}

export async function deleteProject(id) {
  await S.adapter?.deleteProject?.(id);
  S.projects = S.projects.filter((p) => p.id !== id);
  if (S.pid === id) {
    S.pid = null;
    S.project = null;
    S.docs = new Map();
  }
  emit();
}

/** Merge docs arriving from elsewhere (cloud snapshot, backup file). Row-level last-writer-wins. */
export function mergeDocs(incoming, { persist = true, push = false } = {}) {
  let changed = 0;
  for (const inc of incoming) {
    const cur = S.docs.get(inc.key);
    if (!cur) {
      S.docs.set(inc.key, { key: inc.key, holeId: inc.holeId ?? '', table: inc.table, rows: [...(inc.rows || [])], hist: [...(inc.hist || [])], t: inc.t || 0 });
      changed++;
      if (persist) (push ? dirty : localDirty).add(S.docs.get(inc.key));
      continue;
    }
    const byId = new Map(cur.rows.map((r, i) => [r.id, i]));
    let docChanged = false;
    for (const r of inc.rows || []) {
      const i = byId.get(r.id);
      if (i === undefined) {
        cur.rows.push(r);
        byId.set(r.id, cur.rows.length - 1);
        docChanged = true;
      } else if ((r._t || 0) > (cur.rows[i]._t || 0)) {
        cur.rows[i] = r;
        docChanged = true;
      }
    }
    const hids = new Set(cur.hist.map((e) => e.id));
    for (const e of inc.hist || []) {
      if (!hids.has(e.id)) {
        cur.hist.push(e);
        docChanged = true;
      }
    }
    if (docChanged) {
      cur.hist.sort((a, b) => a.t - b.t);
      if (cur.hist.length > HIST_CAP) cur.hist.splice(0, cur.hist.length - HIST_CAP);
      cur.t = Math.max(cur.t || 0, inc.t || 0);
      changed++;
      if (persist) (push ? dirty : localDirty).add(cur);
    }
  }
  if (changed) {
    if (persist) scheduleSave();
    emit();
  }
  return changed;
}

/** Full project snapshot (backup / hand-over between offline users). */
export function exportProjectJSON() {
  return {
    format: 'ord-project',
    version: 1,
    exported: new Date().toISOString(),
    project: S.project,
    docs: [...S.docs.values()].map(serializeDoc),
  };
}

export async function importProjectJSON(obj, { asNew = false } = {}) {
  if (obj?.format !== 'ord-project') throw new Error('Not an ORD project file');
  let meta = { ...obj.project };
  const exists = S.projects.find((p) => p.id === meta.id);
  if (asNew || !exists) {
    if (asNew) meta = { ...meta, id: `p${uid(10)}`, name: `${meta.name} (copy)` };
    S.projects = [...S.projects.filter((p) => p.id !== meta.id), meta];
    await S.adapter?.saveProject?.(meta);
  }
  await openProject(meta.id);
  const n = mergeDocs(obj.docs || [], { push: true });
  await flushNow();
  return { project: meta, docs: n };
}

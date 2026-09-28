// Shared, live multi-user storage when ORD runs as a claude.ai artifact
// (the `db` capability). Everyone in the organisation who opens the page
// works on the same projects; edits from others arrive live and merge
// row-by-row (newest change per row wins, nothing is overwritten wholesale).
//
// Layout in the artifact store:
//   projects/<pid>                    project meta
//   projects/<pid>/docs/<docId>       one ORD document (hole × table), chunked
//                                      into <docId>@<n> when larger than ~180 kB

import { S, mergeDocs, emit, serializeDoc } from './store.js';

const MAX_BYTES = 180 * 1024;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function encodeKey(key) {
  let out = '';
  for (const ch of key) {
    if (/[A-Za-z0-9_\-.:]/.test(ch)) out += ch;
    else for (const b of enc.encode(ch)) out += '~' + b.toString(16).padStart(2, '0');
  }
  return out;
}

export function decodeKey(id) {
  const bytes = [];
  for (let i = 0; i < id.length; ) {
    if (id[i] === '~') {
      bytes.push(parseInt(id.slice(i + 1, i + 3), 16));
      i += 3;
    } else {
      bytes.push(...enc.encode(id[i]));
      i++;
    }
  }
  return dec.decode(new Uint8Array(bytes));
}

const size = (o) => enc.encode(JSON.stringify(o)).length;

/** Split a document into bodies that each fit the store's document limit. */
export function chunkDoc(doc) {
  const base = { key: doc.key, holeId: doc.holeId, table: doc.table, t: doc.t || 0 };
  let hist = doc.hist || [];
  while (hist.length && size(hist) > MAX_BYTES / 2) hist = hist.slice(Math.ceil(hist.length / 4));
  const chunks = [];
  let cur = [];
  let curSize = size(hist) + 200;
  for (const r of doc.rows) {
    const s = size(r) + 1;
    if (cur.length && curSize + s > MAX_BYTES) {
      chunks.push(cur);
      cur = [];
      curSize = 200;
    }
    cur.push(r);
    curSize += s;
  }
  chunks.push(cur);
  return chunks.map((rows, i) => ({ ...base, chunk: i, of: chunks.length, rows, hist: i === 0 ? hist : [] }));
}

function groupChunks(snaps) {
  const by = new Map();
  for (const d of snaps) {
    const b = d.data?.() ?? d;
    if (!b?.key) continue;
    const cur = by.get(b.key) || { key: b.key, holeId: b.holeId ?? '', table: b.table, rows: [], hist: [], t: 0 };
    cur.rows.push(...(b.rows || []));
    cur.hist.push(...(b.hist || []));
    cur.t = Math.max(cur.t, b.t || 0);
    by.set(b.key, cur);
  }
  return [...by.values()];
}

export async function startCloud() {
  if (!window.claude?.use) return null;
  const db = await window.claude.use('db');
  if (!db) return null;
  const userCap = await window.claude.use('user').catch(() => null);
  if (userCap) {
    const me = await userCap.me();
    if (me?.id) S.user = { id: me.id, name: me.name || '', color: me.color };
    const canWrite = await userCap.can?.('data.write');
    S.readOnly = canWrite === false;
    S.people = userCap;
  }

  const lastChunks = new Map(); // docKey -> number of chunks last written
  let docsUnsub = null;
  const queues = new Map();

  const col = (pid) => db.collection(`projects/${pid}/docs`);

  const adapter = {
    kind: 'cloud',
    async listProjects() {
      const snap = await db.collection('projects').get();
      return snap.docs.filter((d) => d.exists).map((d) => d.data());
    },
    async saveProject(meta) {
      await db.doc(`projects/${meta.id}`).set(JSON.parse(JSON.stringify(meta)));
    },
    async deleteProject(pid) {
      const snap = await col(pid).get();
      for (const d of snap.docs) await col(pid).doc(d.id).delete();
      await db.doc(`projects/${pid}`).delete();
    },
    async loadDocs(pid) {
      const snap = await col(pid).get();
      const docs = groupChunks(snap.docs.filter((d) => d.exists));
      for (const d of snap.docs) {
        const b = d.data();
        if (b?.key) lastChunks.set(b.key, Math.max(lastChunks.get(b.key) || 0, (b.chunk || 0) + 1));
      }
      subscribe(pid);
      return docs;
    },
    async saveDocs(pid, docs) {
      await Promise.all(docs.map((d) => enqueue(pid, d)));
    },
    async deleteDocs(pid, keys) {
      for (const k of keys) {
        const n = lastChunks.get(k) || 1;
        for (let i = 0; i < n; i++) await col(pid).doc(encodeKey(k) + (i ? '@' + i : '')).delete();
      }
    },
    async get() {
      return undefined;
    },
    async set() {},
  };

  // at most a few writes in flight overall (the store rate-limits each viewer)
  let active = 0;
  const waiting = [];
  const slot = () => (active < 4 ? (active++, Promise.resolve()) : new Promise((r) => waiting.push(r)).then(() => active++));
  const release = () => {
    active--;
    waiting.shift()?.();
  };

  // one write at a time per document (store rule), merged with what is there
  function enqueue(pid, doc) {
    const prev = queues.get(doc.key) || Promise.resolve();
    const next = prev.then(async () => {
      await slot();
      try {
        await writeDoc(pid, doc);
      } finally {
        release();
      }
    }).catch((e) => {
      console.error('cloud write failed', e);
      S.status.error = e?.code === 'quota_exceeded' ? 'Shared storage is full (5,000 documents). Archive or delete an old project.' : e?.code === 'invalid_argument' ? 'You have view-only access to this shared data.' : String(e?.message || e);
      if (e?.code === 'invalid_argument') S.readOnly = true;
      emit();
    });
    queues.set(doc.key, next);
    return next;
  }

  async function writeDoc(pid, doc) {
    // pull the latest remote version of this document first, so a concurrent
    // edit by someone else is merged rather than overwritten
    const id0 = encodeKey(doc.key);
    const known = lastChunks.has(doc.key);
    const first = known ? await col(pid).doc(id0).get() : { exists: false };
    if (first.exists) {
      const b = first.data();
      const parts = [first];
      for (let i = 1; i < (b.of || 1); i++) parts.push(await col(pid).doc(`${id0}@${i}`).get());
      mergeDocs(groupChunks(parts.filter((p) => p.exists)), { persist: false });
    }
    const local = S.docs.get(doc.key);
    const body = serializeDoc(local || doc);
    const chunks = chunkDoc(body);
    for (const c of chunks) await col(pid).doc(id0 + (c.chunk ? '@' + c.chunk : '')).set(JSON.parse(JSON.stringify(c)));
    const before = lastChunks.get(doc.key) || 0;
    for (let i = chunks.length; i < before; i++) await col(pid).doc(`${id0}@${i}`).delete();
    lastChunks.set(doc.key, chunks.length);
    S.status.lastSaved = Date.now();
  }

  function subscribe(pid) {
    docsUnsub?.();
    docsUnsub = col(pid).onSnapshot(
      (snap) => {
        const changed = snap.docChanges().filter((c) => c.type !== 'removed').map((c) => c.doc);
        if (!changed.length || S.pid !== pid) return;
        // re-read all chunks of the documents that changed
        for (const d of changed) {
          const b = d.data();
          if (b?.key) lastChunks.set(b.key, Math.max(lastChunks.get(b.key) || 0, b.of || 1));
        }
        const keys = new Set(changed.map((d) => d.data()?.key).filter(Boolean));
        const all = snap.docs.filter((d) => d.exists && keys.has(d.data()?.key));
        mergeDocs(groupChunks(all), { persist: false });
        S.status.cloud = 'live';
      },
      (err) => {
        console.warn('cloud subscription ended', err);
        S.status.cloud = 'offline';
        emit();
        if (err?.code === 'unavailable') setTimeout(() => S.pid === pid && subscribe(pid), 3000);
      },
    );
  }

  // probe first: if the store refuses this viewer, stay on device storage
  let first;
  try {
    first = await adapter.listProjects();
  } catch (e) {
    console.warn('shared storage unavailable, using this device', e);
    return null;
  }

  db.collection('projects').onSnapshot(
    (snap) => {
      S.projects = snap.docs.filter((d) => d.exists).map((d) => d.data());
      emit();
    },
    () => {},
  );

  S.localAdapter = S.adapter;
  S.adapter = adapter;
  S.status.cloud = 'live';
  S.status.storage = 'cloud';
  S.projects = first;
  let last = null;
  try {
    last = localStorage.getItem('ord.lastProject');
  } catch {}
  const pick = S.projects.find((p) => p.id === last) || S.projects[0];
  const { openProject, createProject } = await import('./store.js');
  if (pick) await openProject(pick.id);
  else {
    const { buildDemo } = await import('./demo.js');
    await createProject({ name: 'Red Hill demo (synthetic)', demo: true });
    buildDemo();
  }
  return adapter;
}

/** Resolve display names for user ids (cloud: claude.ai profiles; local: settings.people). */
const nameCache = new Map();
export async function resolveNames(ids) {
  const need = ids.filter((i) => i && !nameCache.has(i));
  if (need.length && S.people?.profiles) {
    try {
      const ps = await S.people.profiles(need);
      for (const id of need) nameCache.set(id, ps?.[id]?.name || '');
      emit();
    } catch {}
  }
}
export function userName(id) {
  if (!id) return '';
  if (id === S.user.id) return S.user.name || (S.lang === 'mn' ? 'Та' : 'You');
  if (nameCache.get(id)) return nameCache.get(id);
  return S.lang === 'mn' ? 'Хамтрагч' : 'Colleague';
}

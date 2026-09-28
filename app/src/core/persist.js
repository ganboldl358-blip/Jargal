// Local persistence. IndexedDB when available (offline, survives reloads),
// otherwise an in-memory fallback so the app still works in restricted frames.

const DB_NAME = 'ord-drillhole';
const DB_VER = 2;

function req(r) {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function txDone(tx) {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('transaction aborted'));
  });
}

export async function idbAdapter() {
  if (!globalThis.indexedDB) throw new Error('IndexedDB unavailable');
  const open = indexedDB.open(DB_NAME, DB_VER);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('docs')) {
      const s = db.createObjectStore('docs', { keyPath: ['pid', 'key'] });
      s.createIndex('pid', 'pid');
    }
    if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
  };
  const db = await Promise.race([
    req(open),
    new Promise((_, rej) => setTimeout(() => rej(new Error('IndexedDB open timed out')), 4000)),
  ]);
  return {
    kind: 'indexeddb',
    async listProjects() {
      const tx = db.transaction('projects', 'readonly');
      return req(tx.objectStore('projects').getAll());
    },
    async saveProject(meta) {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put(JSON.parse(JSON.stringify(meta)));
      return txDone(tx);
    },
    async deleteProject(pid) {
      const tx = db.transaction(['projects', 'docs'], 'readwrite');
      tx.objectStore('projects').delete(pid);
      const idx = tx.objectStore('docs').index('pid');
      const keys = await req(idx.getAllKeys(IDBKeyRange.only(pid)));
      for (const k of keys) tx.objectStore('docs').delete(k);
      return txDone(tx);
    },
    async loadDocs(pid) {
      const tx = db.transaction('docs', 'readonly');
      const list = await req(tx.objectStore('docs').index('pid').getAll(IDBKeyRange.only(pid)));
      return list.map(({ pid: _p, ...d }) => d);
    },
    async saveDocs(pid, docs) {
      const tx = db.transaction('docs', 'readwrite');
      const st = tx.objectStore('docs');
      for (const d of docs) st.put({ pid, ...d });
      return txDone(tx);
    },
    async deleteDocs(pid, keys) {
      const tx = db.transaction('docs', 'readwrite');
      for (const k of keys) tx.objectStore('docs').delete([pid, k]);
      return txDone(tx);
    },
    async putBlob(k, blob) {
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').put(blob, k);
      return txDone(tx);
    },
    async getBlob(k) {
      const tx = db.transaction('blobs', 'readonly');
      return req(tx.objectStore('blobs').get(k));
    },
    async deleteBlob(k) {
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').delete(k);
      return txDone(tx);
    },
    async get(k) {
      const tx = db.transaction('kv', 'readonly');
      return req(tx.objectStore('kv').get(k));
    },
    async set(k, v) {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(v, k);
      return txDone(tx);
    },
  };
}

export function memoryAdapter() {
  const projects = new Map();
  const docs = new Map();
  const kv = new Map();
  const blobs = new Map();
  const clone = (x) => JSON.parse(JSON.stringify(x));
  return {
    kind: 'memory',
    async listProjects() {
      return [...projects.values()].map(clone);
    },
    async saveProject(m) {
      projects.set(m.id, clone(m));
    },
    async deleteProject(pid) {
      projects.delete(pid);
      for (const k of [...docs.keys()]) if (k.startsWith(pid + '\u0000')) docs.delete(k);
    },
    async loadDocs(pid) {
      return [...docs.entries()].filter(([k]) => k.startsWith(pid + '\u0000')).map(([, d]) => clone(d));
    },
    async saveDocs(pid, list) {
      for (const d of list) docs.set(pid + '\u0000' + d.key, clone(d));
    },
    async deleteDocs(pid, keys) {
      for (const k of keys) docs.delete(pid + '\u0000' + k);
    },
    async putBlob(k, b) {
      blobs.set(k, b);
    },
    async getBlob(k) {
      return blobs.get(k);
    },
    async deleteBlob(k) {
      blobs.delete(k);
    },
    async get(k) {
      return kv.get(k);
    },
    async set(k, v) {
      kv.set(k, v);
    },
  };
}

export async function bestAdapter() {
  try {
    return await idbAdapter();
  } catch (e) {
    console.warn('Falling back to in-memory storage:', e);
    return memoryAdapter();
  }
}

// Core photos. File names follow the AZ9 core-photo convention
//   MU2611_0.00-7.70_Box 1-2.JPG   (inside …/Wet/ or …/Dry/)
// so hole, depth interval, boxes and wet/dry are read from the name and path.
// Images are downsized before storing: in the browser (IndexedDB) on a single
// device, or as shared artifact assets when ORD runs inside claude.ai.

import { S, mutate, rows, hole, holes } from './store.js';
import { round, uid } from './util.js';

const RE = /^(.+?)[_ ](\d+(?:[.,]\d+)?)\s*-\s*(\d+(?:[.,]\d+)?)(?:\s*m)?(?:[_ ]+box(?:es)?\s*([\d]+(?:\s*-\s*[\d]+)?))?/i;

/** Parse a photo file name (and optional relative path). */
export function parsePhotoName(name, path = '') {
  const base = String(name).replace(/\.[a-z0-9]+$/i, '');
  const m = base.match(RE);
  const lowerPath = `${path}/${name}`.toLowerCase();
  const kind = /(^|[/_\-\s])wet([/_\-\s.]|$)/.test(lowerPath) ? 'wet' : /(^|[/_\-\s])dry([/_\-\s.]|$)/.test(lowerPath) ? 'dry' : null;
  if (!m) return { ok: false, name, kind };
  const num = (x) => Number(String(x).replace(',', '.'));
  const from = num(m[2]);
  const to = num(m[3]);
  if (!(to > from)) return { ok: false, name, kind };
  return { ok: true, name, holeId: m[1].trim(), from, to, boxes: m[4] ? m[4].replace(/\s+/g, '') : null, kind };
}

/** Match a parsed hole id to an existing hole (exact, then case/dash-insensitive). */
export function matchHole(id) {
  if (!id) return null;
  if (hole(id)) return id;
  const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  const n = norm(id);
  return holes().find((h) => norm(h.holeId) === n)?.holeId || null;
}

async function downsize(file, maxSide = 2000, quality = 0.82) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k);
    const h = Math.round(bmp.height * k);
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/jpeg', quality }) : await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return { blob, w, h };
  } catch {
    return { blob: file, w: null, h: null }; // HEIC or undecodable: keep as is
  }
}

let assetsCap;
async function assets() {
  if (assetsCap !== undefined) return assetsCap;
  try {
    assetsCap = S.status.cloud === 'live' && window.claude?.use ? await window.claude.use('assets') : null;
  } catch {
    assetsCap = null;
  }
  return assetsCap;
}

/**
 * Store photos and create `photos` rows. files: File[] (with optional webkitRelativePath).
 * Returns {added, skipped:[{name, reason}]} ; onProgress(i, n).
 */
export async function addPhotos(files, { fallbackHole, onProgress } = {}) {
  const ops = [];
  const skipped = [];
  const cap = await assets();
  const existing = new Set(rows('photos').map((p) => `${p.holeId}|${p.name}`));
  let i = 0;
  for (const f of files) {
    onProgress?.(++i, files.length);
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|heic)$/i.test(f.name)) {
      skipped.push({ name: f.name, reason: 'not an image' });
      continue;
    }
    const p = parsePhotoName(f.name, f.webkitRelativePath || '');
    const hid = (p.ok ? matchHole(p.holeId) : null) || fallbackHole || null;
    if (!hid) {
      skipped.push({ name: f.name, reason: p.ok ? `hole ${p.holeId} not in project` : 'name not recognised (HOLE_from-to_Box n)' });
      continue;
    }
    if (existing.has(`${hid}|${f.name}`)) {
      skipped.push({ name: f.name, reason: 'already added' });
      continue;
    }
    const { blob, w, h } = await downsize(f);
    let ref;
    if (cap) {
      const a = await cap.upload(blob);
      ref = { assetId: a.id, url: a.url };
    } else {
      const key = `ph_${uid(14)}`;
      await S.adapter?.putBlob?.(key, blob);
      ref = { blobKey: key };
    }
    ops.push({ type: 'upsert', table: 'photos', holeId: hid, row: { from: p.ok ? round(p.from, 2) : null, to: p.ok ? round(p.to, 2) : null, boxes: p.boxes, kind: p.kind, name: f.name, w, h, bytes: blob.size, ...ref } });
  }
  const res = ops.length ? mutate(ops, { label: `Add ${ops.length} core photos` }) : null;
  return { added: ops.length, skipped, res };
}

const urlCache = new Map();
/** Displayable URL for a photo row (object URL for local blobs). */
export async function photoURL(row) {
  if (!row) return null;
  if (row.url) return row.url;
  if (row.assetId) return '/_blob/' + row.assetId;
  if (!row.blobKey) return null;
  if (urlCache.has(row.blobKey)) return urlCache.get(row.blobKey);
  const b = await (S.adapter?.getBlob?.(row.blobKey) ?? S.localAdapter?.getBlob?.(row.blobKey));
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urlCache.set(row.blobKey, u);
  return u;
}

/** Photos of a hole overlapping a depth interval, wet first. */
export function photosAt(holeId, from, to) {
  return rows('photos', holeId)
    .filter((p) => p.from !== null && p.to !== null && p.from < to && p.to > from)
    .sort((a, b) => (a.kind === 'wet' ? 0 : 1) - (b.kind === 'wet' ? 0 : 1) || a.from - b.from);
}

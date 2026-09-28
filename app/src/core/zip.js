// Minimal ZIP writer (STORE — no compression — CRC-32, UTF-8 names) and a
// small reader (STORE, plus DEFLATE where the platform has DecompressionStream)
// so exports bundle into one download and backups can be restored from the zip.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE) of bytes. */
export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const dosTime = (d) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d) => (((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

function bytesOf(data, enc) {
  if (typeof data === 'string') return enc.encode(data);
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  throw new Error('zip: file data must be a string or bytes');
}

/**
 * Build a ZIP archive.
 * @param files [{name, data: string | Uint8Array | ArrayBuffer, date?: Date}]
 * @returns Uint8Array
 */
export function zipFiles(files, { date = new Date() } = {}) {
  const enc = new TextEncoder();
  const seen = new Set();
  const entries = files.map((f) => {
    let name = String(f.name).replace(/\\/g, '/').replace(/^\/+/, '');
    while (seen.has(name)) name = name.replace(/(\.[^./]*)?$/, (m) => `_${m}`);
    seen.add(name);
    const nameBytes = enc.encode(name);
    const data = bytesOf(f.data, enc);
    return { nameBytes, data, crc: crc32(data), date: f.date || date, offset: 0 };
  });
  if (entries.length > 0xffff) throw new Error('zip: too many files');
  let size = 22;
  for (const e of entries) size += 30 + 46 + 2 * e.nameBytes.length + e.data.length;
  if (size > 0xffffffff) throw new Error('zip: archive too large');
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let p = 0;
  for (const e of entries) {
    e.offset = p;
    dv.setUint32(p, 0x04034b50, true); // local file header
    dv.setUint16(p + 4, 20, true); // version needed
    dv.setUint16(p + 6, 0x0800, true); // flags: UTF-8 names
    dv.setUint16(p + 8, 0, true); // method: STORE
    dv.setUint16(p + 10, dosTime(e.date), true);
    dv.setUint16(p + 12, dosDate(e.date), true);
    dv.setUint32(p + 14, e.crc, true);
    dv.setUint32(p + 18, e.data.length, true);
    dv.setUint32(p + 22, e.data.length, true);
    dv.setUint16(p + 26, e.nameBytes.length, true);
    dv.setUint16(p + 28, 0, true);
    out.set(e.nameBytes, p + 30);
    p += 30 + e.nameBytes.length;
    out.set(e.data, p);
    p += e.data.length;
  }
  const cd = p;
  for (const e of entries) {
    dv.setUint32(p, 0x02014b50, true); // central directory header
    dv.setUint16(p + 4, 20, true); // version made by
    dv.setUint16(p + 6, 20, true); // version needed
    dv.setUint16(p + 8, 0x0800, true);
    dv.setUint16(p + 10, 0, true);
    dv.setUint16(p + 12, dosTime(e.date), true);
    dv.setUint16(p + 14, dosDate(e.date), true);
    dv.setUint32(p + 16, e.crc, true);
    dv.setUint32(p + 20, e.data.length, true);
    dv.setUint32(p + 24, e.data.length, true);
    dv.setUint16(p + 28, e.nameBytes.length, true);
    dv.setUint16(p + 30, 0, true); // extra
    dv.setUint16(p + 32, 0, true); // comment
    dv.setUint16(p + 34, 0, true); // disk
    dv.setUint16(p + 36, 0, true); // internal attrs
    dv.setUint32(p + 38, 0, true); // external attrs
    dv.setUint32(p + 42, e.offset, true);
    out.set(e.nameBytes, p + 46);
    p += 46 + e.nameBytes.length;
  }
  dv.setUint32(p, 0x06054b50, true); // end of central directory
  dv.setUint16(p + 4, 0, true);
  dv.setUint16(p + 6, 0, true);
  dv.setUint16(p + 8, entries.length, true);
  dv.setUint16(p + 10, entries.length, true);
  dv.setUint32(p + 12, p - cd, true);
  dv.setUint32(p + 16, cd, true);
  dv.setUint16(p + 20, 0, true);
  return out;
}

/** ZIP as a Blob (for saveFile). */
export function zipBlob(files, opts) {
  return new Blob([zipFiles(files, opts)], { type: 'application/zip' });
}

async function inflateRaw(u8) {
  if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot decompress zip files; unzip it and choose the .json file');
  const stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Read a ZIP → [{name, data: Uint8Array}] (STORE and DEFLATE entries). */
export async function unzip(input) {
  const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out = [];
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt zip: central directory');
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (dv.getUint32(off, true) !== 0x04034b50) throw new Error('Corrupt zip: local header');
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const raw = u8.subarray(start, start + csize);
    let data;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error(`Unsupported zip compression (method ${method}) for ${name}`);
    if (crc32(data) !== crc) throw new Error(`CRC mismatch in ${name}`);
    out.push({ name, data });
  }
  return out;
}

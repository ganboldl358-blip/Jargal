// Small, dependency-free helpers shared by core and UI modules.

const ALPH = '0123456789abcdefghijklmnopqrstuvwxyz';
export function uid(n = 12) {
  let s = '';
  const c = globalThis.crypto;
  if (c && c.getRandomValues) {
    const b = new Uint8Array(n);
    c.getRandomValues(b);
    for (const x of b) s += ALPH[x % 36];
  } else {
    for (let i = 0; i < n; i++) s += ALPH[Math.floor(Math.random() * 36)];
  }
  return s;
}

export const now = () => Date.now();

export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Parse a user/CSV value into a number; returns null for blanks and junk. */
export function toNum(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/\s/g, '');
  // "1,5" (decimal comma) when there is no dot
  if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function round(v, d = 2) {
  if (!isNum(v)) return v;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export function fmt(v, d = 2) {
  if (v === null || v === undefined || v === '') return '';
  if (!isNum(v)) return String(v);
  return round(v, d).toFixed(d).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m));
}

/** Fixed decimals, keeping trailing zeros (depths: 12.40). */
export function fix(v, d = 2) {
  return isNum(v) ? v.toFixed(d) : '';
}

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function groupBy(arr, fn) {
  const m = new Map();
  for (const x of arr) {
    const k = fn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

export function sortBy(arr, ...keys) {
  return [...arr].sort((a, b) => {
    for (const k of keys) {
      const fa = typeof k === 'function' ? k(a) : a[k];
      const fb = typeof k === 'function' ? k(b) : b[k];
      if (fa === fb) continue;
      if (fa === null || fa === undefined) return 1;
      if (fb === null || fb === undefined) return -1;
      return fa < fb ? -1 : 1;
    }
    return 0;
  });
}

/** Natural compare so OVD2 < OVD10 and MU2601 < MU2613a. */
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export const natCmp = (a, b) => collator.compare(String(a ?? ''), String(b ?? ''));

export function debounce(fn, ms) {
  let t;
  const d = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  d.flush = (...a) => {
    clearTimeout(t);
    fn(...a);
  };
  return d;
}

export function todayISO() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Accept 2024-07-19, 7/19/2024, 19.07.2024, Excel serials; return ISO date or null. */
export function toISODate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // US m/d/yyyy (MX, Excel exports); d/m/yyyy when the first part > 12
  if (m) {
    let [mo, da] = [m[1], m[2]];
    if (Number(mo) > 12) [mo, da] = [da, mo];
    return `${m[3]}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`;
  }
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/); // d.m.yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  // local calendar date (toISOString would shift it a day in UTC+8)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function timeAgo(t, lang = 'en') {
  const s = Math.max(1, Math.round((Date.now() - t) / 1000));
  const mn = lang === 'mn';
  if (s < 60) return mn ? `${s} сек өмнө` : `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return mn ? `${m} мин өмнө` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return mn ? `${h} цагийн өмнө` : `${h} h ago`;
  const d = Math.round(h / 24);
  return mn ? `${d} өдрийн өмнө` : `${d} d ago`;
}

export function dateTime(t) {
  if (!t) return '';
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Seeded PRNG (mulberry32) for reproducible demo data. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.normal = (mu = 0, sd = 1) => {
    const u = 1 - r();
    const v = r();
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return r;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Length-weighted mean of values over [from,to] intervals. */
export function weightedMean(items, valueFn) {
  let sw = 0;
  let sv = 0;
  for (const it of items) {
    const v = valueFn(it);
    const w = (it.to ?? it.from) - it.from;
    if (!isNum(v) || !(w > 0)) continue;
    sw += w;
    sv += v * w;
  }
  return sw > 0 ? sv / sw : null;
}

export function sum(arr, fn = (x) => x) {
  let s = 0;
  for (const x of arr) {
    const v = fn(x);
    if (isNum(v)) s += v;
  }
  return s;
}

export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Accept only plain CSS colour tokens (hex, rgb/hsl, a named colour, a var()) — shared data is untrusted. */
export function safeColor(c, fallback = '#b8c2c0') {
  const s = String(c ?? '').trim();
  return /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/]+\)|[a-z]{3,20}|var\(--[a-z0-9-]+\))$/i.test(s) ? s : fallback;
}

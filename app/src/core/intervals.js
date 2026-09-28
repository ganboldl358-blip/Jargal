// Interval-table geometry: overlaps, gaps, split/merge, gap filling.
import { isNum, round } from './util.js';

const EPS = 1e-6;

/** Sorted intervals with numeric from/to. */
export function sorted(list) {
  return list.filter((r) => isNum(r.from) && isNum(r.to)).sort((a, b) => a.from - b.from || a.to - b.to);
}

/** [{a, b, from, to}] where interval b starts before a ends. */
export function overlaps(list) {
  const s = sorted(list);
  const out = [];
  for (let i = 1; i < s.length; i++) {
    // compare with the furthest-reaching previous interval
    let j = i - 1;
    let best = s[j];
    for (let k = i - 1; k >= 0 && k >= i - 20; k--) if (s[k].to > best.to) best = s[k];
    if (s[i].from < best.to - EPS) out.push({ a: best, b: s[i], from: s[i].from, to: Math.min(best.to, s[i].to) });
  }
  return out;
}

/** Gaps between consecutive intervals, plus the top gap from `start` (default 0). */
export function gaps(list, { start = 0, end = null } = {}) {
  const s = sorted(list);
  const out = [];
  let cur = start;
  for (const r of s) {
    if (r.from > cur + EPS) out.push({ from: round(cur, 3), to: round(r.from, 3) });
    if (r.to > cur) cur = r.to;
  }
  if (isNum(end) && end > cur + EPS && s.length) out.push({ from: round(cur, 3), to: round(end, 3), tail: true });
  return out;
}

/** Split one interval at depth `at` → [upperPatch, lowerNew]. */
export function splitRow(row, at) {
  if (!(at > row.from + EPS && at < row.to - EPS)) return null;
  const { id, _t, _u, _d, ...rest } = row;
  return [{ id, to: round(at, 3) }, { ...rest, from: round(at, 3), to: row.to }];
}

/** Merge a run of adjacent intervals (sorted) into the first; returns {keep, drop[]}. */
export function mergeRows(rows) {
  const s = sorted(rows);
  if (s.length < 2) return null;
  return { keep: { id: s[0].id, to: s[s.length - 1].to }, drop: s.slice(1).map((r) => r.id) };
}

/** Rows to create so the table has no gaps (MX Deposit rejects gaps). */
export function gapFillers(list, { start = 0, end = null, fields = {} } = {}) {
  return gaps(list, { start, end }).map((g) => ({ from: g.from, to: g.to, ...fields }));
}

/** Total length covered by intervals (overlaps counted once). */
export function coverage(list) {
  const s = sorted(list);
  let total = 0;
  let cur = -Infinity;
  for (const r of s) {
    const a = Math.max(r.from, cur);
    if (r.to > a) total += r.to - a;
    if (r.to > cur) cur = r.to;
  }
  return total;
}

/** Intervals from `list` overlapping [from, to], with overlap length. */
export function intersecting(list, from, to) {
  const out = [];
  for (const r of list) {
    if (!isNum(r.from)) continue;
    const rt = isNum(r.to) ? r.to : r.from;
    const a = Math.max(from, r.from);
    const b = Math.min(to, rt);
    if (b > a + EPS || (rt === r.from && r.from >= from && r.from <= to)) out.push({ row: r, len: Math.max(0, b - a) });
  }
  return out;
}

/** Next interval suggestion after the last row: starts where the last one ends. */
export function nextInterval(list, defaultLen = 1) {
  const s = sorted(list);
  const last = s[s.length - 1];
  const from = last ? last.to : 0;
  return { from, to: round(from + defaultLen, 3) };
}

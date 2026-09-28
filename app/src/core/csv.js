// RFC 4180 CSV / TSV reader and writer. Handles quoted fields, embedded
// newlines, BOM, and auto-detects the delimiter (comma, semicolon, tab).

export function detectDelimiter(text) {
  const head = text.slice(0, 4096).split(/\r?\n/).filter((l) => l.trim() !== '').slice(0, 5);
  if (!head.length) return ',';
  const cands = [',', '\t', ';', '|'];
  let best = ',';
  let bestScore = -1;
  for (const d of cands) {
    const counts = head.map((l) => l.split(d).length - 1);
    const min = Math.min(...counts);
    const score = min > 0 ? min * 10 + counts[0] : 0;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Parse delimited text into an array of string arrays. */
export function parseCSV(text, delimiter) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const d = delimiter || detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let i = 0;
  let q = false;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        q = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '') {
      q = true;
      i++;
      continue;
    }
    if (c === d) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  // drop fully empty trailing rows
  while (rows.length && rows[rows.length - 1].every((x) => x === '')) rows.pop();
  return rows;
}

/** Parse into objects using the header row (or a given header row index). */
export function parseCSVObjects(text, { headerRow = 0, delimiter } = {}) {
  const rows = parseCSV(text, delimiter);
  const headers = (rows[headerRow] || []).map((h) => String(h).trim());
  const out = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((x) => String(x).trim() === '')) continue;
    const o = {};
    headers.forEach((h, j) => {
      if (h) o[h] = row[j] ?? '';
    });
    out.push(o);
  }
  return { headers, rows: out };
}

function cell(v, d) {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : String(v);
  if (s.includes(d) || s.includes('"') || s.includes('\n') || s.includes('\r') || /^\s|\s$/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Serialize objects to CSV. `columns` = [{key, header}] or array of keys. */
export function toCSV(objs, columns, { delimiter = ',', bom = true } = {}) {
  const cols = columns.map((c) => (typeof c === 'string' ? { key: c, header: c } : c));
  const lines = [cols.map((c) => cell(c.header, delimiter)).join(delimiter)];
  for (const o of objs) {
    lines.push(cols.map((c) => cell(typeof c.get === 'function' ? c.get(o) : o[c.key], delimiter)).join(delimiter));
  }
  return (bom ? '﻿' : '') + lines.join('\r\n') + '\r\n';
}

/** Tab-separated text for clipboard (Excel paste). */
export function toTSV(rows) {
  return rows.map((r) => r.map((v) => (v === null || v === undefined ? '' : String(v).replace(/[\t\n]/g, ' '))).join('\t')).join('\n');
}

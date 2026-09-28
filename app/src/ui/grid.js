// Spreadsheet-style editor used by every table.
// Keyboard: arrows / Tab / Enter move, typing or F2 edits, Esc cancels,
// Delete clears, Ctrl+C / Ctrl+V copy & paste blocks (Excel-compatible, pasting
// past the last row creates rows), Ctrl+D fills down, Ctrl+Z undoes.

import { html, useState, useEffect, useRef, useMemo, useCallback } from '../lib.js';
import { S, mutate, codes as codeList, codeMap } from '../core/store.js';
import { coerce, isValidRaw } from '../core/coerce.js';
import { fmt, fix, isNum, round, safeColor } from '../core/util.js';
import { toTSV } from '../core/csv.js';
import { tr, label } from '../i18n.js';
import { Icon } from './icons.js';
import { toast } from './kit.js';
import { track, undoLast } from './undo.js';

const ROW_H = 30;
const OVERSCAN = 12;

export function getValue(field, row) {
  if (field.get) return field.get(row);
  if (field.type === 'calc') return field.calc ? field.calc(row, S.ctx) : null;
  return row[field.key];
}

export function displayValue(field, row) {
  if (field.display) return field.display(row) ?? '';
  const v = getValue(field, row);
  if (v === null || v === undefined || v === '') return '';
  if (field.labels?.[v]) return tr(field.labels[v]);
  if (field.type === 'bool') return v ? '✓' : '';
  if (typeof v === 'number') {
    if (field.key === 'from' || field.key === 'to' || field.key === 'depth') return fix(v, field.dp ?? 2);
    return field.dp !== undefined ? fmt(v, field.dp) : fmt(v, 3);
  }
  return String(v);
}

function rawForEdit(field, row) {
  const v = getValue(field, row);
  if (v === null || v === undefined) return '';
  if (field.type === 'bool') return v ? '1' : '';
  return String(v);
}

/** Patch object for setting `field` of `row` to `value`. */
function patchFor(field, row, value) {
  if (field.set) return field.set(row, value);
  return { [field.key]: value };
}

const editable = (field, readOnly) => !readOnly && field.type !== 'calc' && !field.readOnly;

// ------------------------------------------------------------- code editor

function CodeEditor({ field, initial, onCommit, onCancel, takePending }) {
  const [q, setQ] = useState(initial);
  const [hi, setHi] = useState(0);
  const inp = useRef();
  const options = useMemo(() => {
    const all = codeList(field.list);
    const Q = q.trim().toUpperCase();
    if (!Q) return all.slice(0, 60);
    const starts = all.filter((c) => c.code.toUpperCase().startsWith(Q));
    const rest = all.filter((c) => !c.code.toUpperCase().startsWith(Q) && `${c.code} ${c.meaning} ${c.meaningMn}`.toUpperCase().includes(Q));
    return [...starts, ...rest].slice(0, 60);
  }, [q, field.list, S.rev]);
  useEffect(() => {
    inp.current?.focus();
    const p = takePending?.();
    if (p) setQ((v) => v + p);
    const len = (inp.current?.value.length || 0) + (p?.length || 0);
    setTimeout(() => inp.current?.setSelectionRange(len, len), 0);
  }, []);
  useEffect(() => setHi(0), [q]);
  const pick = (code, move) => onCommit(code, move);
  return html`<div class="g-editor code">
    <input
      ref=${inp}
      class="g-input mono"
      value=${q}
      onInput=${(e) => setQ(e.target.value)}
      onKeyDown=${(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setHi((h) => Math.min(options.length - 1, h + 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setHi((h) => Math.max(0, h - 1));
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const Q = q.trim().toUpperCase();
          const exact = options.find((o) => o.code.toUpperCase() === Q);
          const chosen = !Q ? '' : exact ? exact.code : options[hi]?.code ?? Q;
          pick(chosen, e.key === 'Tab' ? (e.shiftKey ? 'left' : 'right') : 'down');
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
        e.stopPropagation();
      }}
    />
    <div class="g-dd" role="listbox">
      ${options.map(
        (o, i) => html`<div
          role="option"
          aria-selected=${i === hi}
          class=${'g-opt' + (i === hi ? ' on' : '') + (o.warn ? ' warnc' : '')}
          onMouseDown=${(e) => {
            e.preventDefault();
            pick(o.code, 'down');
          }}
        >
          ${o.color ? html`<span class="swatch" style=${`background:${safeColor(o.color)};width:12px;height:12px`}></span>` : html`<span style="width:12px"></span>`}
          <b class="mono">${o.code}</b>
          <span class="g-opt-m">${S.lang === 'mn' ? o.meaningMn || o.meaning : o.meaning}</span>
          ${o.mxPending ? html`<span class="pill warn" title=${tr({ en: 'Not yet in the MX Deposit list', mn: 'MX Deposit жагсаалтад хараахан нэмэгдээгүй' })}>MX</span>` : null}
        </div>`,
      )}
      ${!options.length ? html`<div class="g-opt muted">${tr({ en: 'No matching code — Enter keeps the text (it will be flagged)', mn: 'Тохирох код алга — Enter дарвал текстээр үлдэнэ (алдаа гэж тэмдэглэгдэнэ)' })}</div>` : null}
    </div>
  </div>`;
}

function TextEditor({ field, initial, onCommit, onCancel, takePending }) {
  const [v, setV] = useState(initial);
  const inp = useRef();
  const note = field.type === 'note';
  useEffect(() => {
    inp.current?.focus();
    const p = takePending?.();
    if (p) setV((x) => x + p);
    const len = (inp.current?.value.length || 0) + (p?.length || 0);
    setTimeout(() => inp.current?.setSelectionRange?.(len, len), 0);
  }, []);
  const onKey = (e) => {
    if (e.key === 'Enter' && (!note || !e.shiftKey)) {
      e.preventDefault();
      onCommit(v, 'down');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onCommit(v, e.shiftKey ? 'left' : 'right');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
    e.stopPropagation();
  };
  if (note) {
    const max = 500;
    return html`<div class="g-editor note">
      <textarea ref=${inp} class="g-input" rows="4" value=${v} onInput=${(e) => setV(e.target.value)} onKeyDown=${onKey}></textarea>
      <div class=${'g-count' + (v.length > max ? ' over' : '')}>${v.length} / ${max} · ${tr({ en: 'Shift+Enter = new line', mn: 'Shift+Enter = шинэ мөр' })}</div>
    </div>`;
  }
  return html`<div class="g-editor">
    <input
      ref=${inp}
      class=${'g-input' + (['num', 'pct', 'int'].includes(field.type) ? ' num' : '')}
      type=${field.type === 'date' ? 'date' : 'text'}
      inputmode=${['num', 'pct', 'int'].includes(field.type) ? 'decimal' : undefined}
      value=${v}
      onInput=${(e) => setV(e.target.value)}
      onKeyDown=${onKey}
      onBlur=${() => onCommit(v, null)}
    />
  </div>`;
}

// ------------------------------------------------------------------- grid

/**
 * Props:
 *   table, holeId       target of writes (holeId may be a function(row) for multi-hole grids)
 *   rows                sorted rows to show
 *   fields              visible field defs (calc allowed)
 *   readOnly
 *   issues              Map `${table}|${rowId}` -> [issue]
 *   activeId, onActive  selected row id (for strip-log sync)
 *   newRow()            defaults for a new row (or null to disable adding)
 *   height              CSS height of the scroll area
 */
export function Grid({ table, holeId, rows, fields, readOnly = false, issues, activeId, onActive, onRange, newRow, height = '100%', frozen = 2, onOpenRow }) {
  const wrap = useRef();
  const [sel, setSel] = useState({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState(null);
  const [edit, setEdit] = useState(null); // {r, c, initial}
  const [scroll, setScroll] = useState(0);
  const [viewH, setViewH] = useState(600);
  const focusId = useRef(null);
  const pendingKeys = useRef('');
  const takePending = () => {
    const p = pendingKeys.current;
    pendingKeys.current = '';
    return p;
  };

  const hid = (row) => (typeof holeId === 'function' ? holeId(row) : holeId ?? row?.holeId);

  // keep selection on the same row id after re-sorts
  useEffect(() => {
    if (focusId.current) {
      const i = rows.findIndex((r) => r.id === focusId.current);
      if (i >= 0) setSel((s) => ({ ...s, r: i }));
      focusId.current = null;
    } else if (sel.r >= rows.length && rows.length) setSel((s) => ({ ...s, r: rows.length - 1 }));
  }, [rows]);

  // external selection (e.g. click in strip log)
  useEffect(() => {
    if (!activeId) return;
    const i = rows.findIndex((r) => r.id === activeId);
    if (i >= 0 && i !== sel.r) {
      setSel((s) => ({ ...s, r: i }));
      setAnchor(null);
      scrollToRow(i);
    }
  }, [activeId]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const row = rows[sel.r];
    if (row && onActive && row.id !== activeId) onActive(row);
  }, [sel.r, rows]);

  function scrollToRow(i) {
    const el = wrap.current;
    if (!el) return;
    const top = i * ROW_H;
    const headH = 34;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H + headH > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H + headH - el.clientHeight + 4;
  }

  const range = useMemo(() => {
    const a = anchor || sel;
    return { r0: Math.min(a.r, sel.r), r1: Math.max(a.r, sel.r), c0: Math.min(a.c, sel.c), c1: Math.max(a.c, sel.c) };
  }, [anchor, sel]);

  useEffect(() => {
    onRange?.(rows.slice(range.r0, range.r1 + 1));
  }, [range.r0, range.r1, rows]);

  const inRange = (r, c) => r >= range.r0 && r <= range.r1 && c >= range.c0 && c <= range.c1;

  const move = useCallback(
    (dr, dc, extend = false) => {
      setSel((s) => {
        const r = Math.max(0, Math.min(rows.length - 1, s.r + dr));
        const c = Math.max(0, Math.min(fields.length - 1, s.c + dc));
        if (extend) setAnchor((a) => a || s);
        else setAnchor(null);
        setTimeout(() => scrollToRow(r), 0);
        return { r, c };
      });
    },
    [rows.length, fields.length],
  );

  function writeCells(cells, label) {
    // cells: [{row, field, value}] ; rows may be null -> create
    const ops = [];
    const creates = new Map();
    for (const { row, field, value, newIndex } of cells) {
      if (!editable(field, readOnly)) continue;
      if (row) {
        ops.push({ type: 'upsert', table, holeId: hid(row), row: { id: row.id, ...patchFor(field, row, value) } });
      } else {
        const cur = creates.get(newIndex) || { ...(newRow?.(newIndex) || {}) };
        Object.assign(cur, patchFor(field, cur, value));
        creates.set(newIndex, cur);
      }
    }
    for (const [, r] of [...creates.entries()].sort((a, b) => a[0] - b[0])) ops.push({ type: 'upsert', table, holeId: hid(r) ?? holeId, row: r });
    if (!ops.length) return null;
    // merge ops for the same row id
    const merged = [];
    const byId = new Map();
    for (const op of ops) {
      if (op.row.id && byId.has(op.row.id)) Object.assign(byId.get(op.row.id).row, op.row);
      else {
        merged.push(op);
        if (op.row.id) byId.set(op.row.id, op);
      }
    }
    return track(mutate(merged, { label }), label);
  }

  function commitEdit(raw, dir) {
    if (!edit) return;
    const { r, c } = edit;
    const row = rows[r];
    const field = fields[c];
    setEdit(null);
    if (row && editable(field, readOnly)) {
      if (!isValidRaw(field, raw)) {
        toast(tr({ en: '"{v}" is not a valid {t}', mn: '«{v}» нь зөв {t} биш' }, { v: raw, t: field.type === 'date' ? tr({ en: 'date', mn: 'огноо' }) : tr({ en: 'number', mn: 'тоо' }) }), { kind: 'err' });
        setTimeout(() => wrap.current?.focus(), 0);
        return;
      }
      const value = coerce(field, raw);
      const cur = getValue(field, row);
      const same = (cur ?? null) === (value ?? null) || (cur === undefined && value === null);
      if (!same) {
        focusId.current = row.id;
        writeCells([{ row, field, value }], `${label(field)} ${tr({ en: 'edit', mn: 'засвар' })}`);
      }
    }
    if (dir === 'down') move(1, 0);
    else if (dir === 'right') move(0, 1);
    else if (dir === 'left') move(0, -1);
    setTimeout(() => wrap.current?.focus(), 0);
  }

  function startEdit(initial) {
    pendingKeys.current = '';
    const field = fields[sel.c];
    const row = rows[sel.r];
    if (!row || !editable(field, readOnly)) return;
    if (field.type === 'bool') {
      writeCells([{ row, field, value: !getValue(field, row) }], label(field));
      return;
    }
    setEdit({ r: sel.r, c: sel.c, initial: initial ?? rawForEdit(field, row) });
  }

  function clearRange() {
    const cells = [];
    for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= range.c1; c++) {
      const f = fields[c];
      if (f.req && (f.key === 'from' || f.key === 'to' || f.key === 'depth' || f.key === 'sampleId' || f.key === 'holeId')) continue;
      cells.push({ row: rows[r], field: f, value: null });
    }
    writeCells(cells, tr({ en: 'Clear cells', mn: 'Нүд цэвэрлэх' }));
  }

  function copyRange(e) {
    const out = [];
    for (let r = range.r0; r <= range.r1; r++) {
      const line = [];
      for (let c = range.c0; c <= range.c1; c++) line.push(rawForEdit(fields[c], rows[r]));
      out.push(line);
    }
    const text = toTSV(out);
    if (e?.clipboardData) {
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
    } else navigator.clipboard?.writeText(text).catch(() => {});
    toast(tr({ en: 'Copied {n} cells', mn: '{n} нүд хуулсан' }, { n: out.length * (out[0]?.length || 0) }), { kind: 'info', ms: 1600 });
  }

  function pasteText(text) {
    if (readOnly) return;
    const lines = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));
    if (!lines.length) return;
    let rejected = 0;
    const cells = [];
    const push = (cell, raw) => {
      if (!isValidRaw(cell.field, raw)) {
        rejected++;
        return;
      }
      cells.push(cell);
    };
    const single = lines.length === 1 && lines[0].length === 1;
    if (single && (range.r1 > range.r0 || range.c1 > range.c0)) {
      for (let r = range.r0; r <= range.r1; r++) for (let c = range.c0; c <= range.c1; c++) push({ row: rows[r], field: fields[c], value: coerce(fields[c], lines[0][0]) }, lines[0][0]);
    } else {
      lines.forEach((line, i) => {
        const r = sel.r + i;
        line.forEach((raw, j) => {
          const c = sel.c + j;
          if (c >= fields.length) return;
          const f = fields[c];
          if (r < rows.length) push({ row: rows[r], field: f, value: coerce(f, raw) }, raw);
          else if (newRow) push({ row: null, newIndex: r - rows.length, field: f, value: coerce(f, raw) }, raw);
        });
      });
    }
    const res = writeCells(cells, tr({ en: 'Paste {n} rows', mn: '{n} мөр paste' }, { n: lines.length }));
    if (res || rejected)
      toast(
        tr({ en: 'Pasted: {c} new, {u} updated', mn: 'Paste: {c} шинэ, {u} шинэчилсэн' }, { c: res?.created || 0, u: res?.updated || 0 }) +
          (rejected ? tr({ en: ' · {r} cells skipped (not a number/date for that column)', mn: ' · {r} нүд алгассан (тухайн баганад тоо/огноо биш)' }, { r: rejected }) : ''),
        { kind: rejected ? 'warn' : 'ok' },
      );
  }

  function fillDown() {
    const cells = [];
    if (range.r1 > range.r0) {
      for (let c = range.c0; c <= range.c1; c++) {
        const f = fields[c];
        const v = getValue(f, rows[range.r0]);
        for (let r = range.r0 + 1; r <= range.r1; r++) cells.push({ row: rows[r], field: f, value: v ?? null });
      }
    } else if (sel.r > 0) {
      for (let c = range.c0; c <= range.c1; c++) cells.push({ row: rows[sel.r], field: fields[c], value: getValue(fields[c], rows[sel.r - 1]) ?? null });
    }
    writeCells(cells.filter((x) => !['from', 'to', 'depth', 'sampleId'].includes(x.field.key)), tr({ en: 'Fill down', mn: 'Доош хуулах' }));
  }

  function onKeyDown(e) {
    if (edit) {
      // keys typed before the editor has focus: keep them for the editor
      if (e.target === wrap.current && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        pendingKeys.current += e.key;
      }
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undoLast();
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      fillDown();
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setAnchor({ r: 0, c: 0 });
      setSel({ r: rows.length - 1, c: fields.length - 1 });
      return;
    }
    if (mod) return; // let copy/paste events fire
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(1, 0, e.shiftKey);
        return;
      case 'ArrowUp':
        e.preventDefault();
        move(-1, 0, e.shiftKey);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        move(0, -1, e.shiftKey);
        return;
      case 'ArrowRight':
        e.preventDefault();
        move(0, 1, e.shiftKey);
        return;
      case 'Tab':
        e.preventDefault();
        move(0, e.shiftKey ? -1 : 1);
        return;
      case 'Enter':
      case 'F2':
        e.preventDefault();
        if (e.key === 'Enter' && e.shiftKey) move(-1, 0);
        else startEdit();
        return;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        clearRange();
        return;
      case 'Home':
        e.preventDefault();
        setSel((s) => ({ ...s, c: 0 }));
        return;
      case 'End':
        e.preventDefault();
        setSel((s) => ({ ...s, c: fields.length - 1 }));
        return;
      case 'PageDown':
        e.preventDefault();
        move(Math.floor(viewH / ROW_H) - 2, 0, e.shiftKey);
        return;
      case 'PageUp':
        e.preventDefault();
        move(-(Math.floor(viewH / ROW_H) - 2), 0, e.shiftKey);
        return;
      case ' ':
        if (fields[sel.c]?.type === 'bool') {
          e.preventDefault();
          startEdit();
        }
        return;
      default:
        if (e.key.length === 1 && !e.altKey) {
          e.preventDefault();
          startEdit(e.key);
        }
    }
  }

  const total = rows.length;
  const first = Math.max(0, Math.floor(scroll / ROW_H) - OVERSCAN);
  const last = Math.min(total, Math.ceil((scroll + viewH) / ROW_H) + OVERSCAN);
  const visible = rows.slice(first, last);

  // sticky-left offsets for frozen columns
  const lefts = [];
  let acc = 44;
  fields.forEach((f, i) => {
    lefts[i] = i < frozen ? acc : null;
    acc += f.w || 90;
  });
  const widthPx = acc;

  const rowIssues = (row) => issues?.get(`${table}|${row.id}`) || null;

  return html`<div
    class="grid-wrap"
    ref=${wrap}
    tabindex="0"
    style=${`height:${height}`}
    onKeyDown=${onKeyDown}
    onScroll=${(e) => setScroll(e.currentTarget.scrollTop)}
    onCopy=${(e) => !edit && copyRange(e)}
    onPaste=${(e) => {
      if (edit) return;
      e.preventDefault();
      pasteText(e.clipboardData.getData('text/plain'));
    }}
  >
    <table class="grid" style=${`width:${widthPx}px`}>
      <colgroup>
        <col style="width:44px" />
        ${fields.map((f) => html`<col style=${`width:${f.w || 90}px`} />`)}
      </colgroup>
      <thead>
        <tr>
          <th class="g-rn">#</th>
          ${fields.map(
            (f, i) => html`<th
              class=${(f.type === 'calc' ? 'calc ' : '') + (lefts[i] !== null ? 'frz' : '') + (['num', 'pct', 'int', 'calc'].includes(f.type) ? ' num' : '')}
              style=${lefts[i] !== null ? `left:${lefts[i]}px` : ''}
              title=${`${label(f)}${f.list ? ` · ${f.list}` : ''}${f.type === 'calc' ? ' · ' + tr({ en: 'calculated', mn: 'тооцоолсон' }) : ''}${f.mx ? ` · MX: ${f.mx}` : ''}`}
            >
              ${f.short ? tr(f.short) : label(f)}${f.req ? html`<i class="req">*</i>` : null}
            </th>`,
          )}
        </tr>
      </thead>
      <tbody>
        ${first > 0 ? html`<tr style=${`height:${first * ROW_H}px`}><td colspan=${fields.length + 1}></td></tr>` : null}
        ${visible.map((row, k) => {
          const r = first + k;
          const iss = rowIssues(row);
          const sev = iss ? (iss.some((x) => x.sev === 'error') ? 'error' : iss.some((x) => x.sev === 'warn') ? 'warn' : 'info') : '';
          const isActive = row.id === activeId || r === sel.r;
          return html`<tr key=${row.id} class=${(isActive ? 'act ' : '') + (sev ? 'sev-' + sev : '')}>
            <td class="g-rn" title=${iss ? iss.map((x) => (S.lang === 'mn' ? x.msg.mn : x.msg.en)).join('\n') : ''} onDblClick=${() => onOpenRow?.(row)}>
              ${sev ? html`<${Icon} name="alert" size=${12} />` : r + 1}
            </td>
            ${fields.map((f, c) => {
              const cellIss = iss?.filter((x) => x.field === f.key);
              const isSel = r === sel.r && c === sel.c;
              const inR = inRange(r, c) && (range.r1 > range.r0 || range.c1 > range.c0);
              const editing = edit && edit.r === r && edit.c === c;
              const v = displayValue(f, row);
              const cls =
                'g-c' +
                (isSel ? ' sel' : '') +
                (inR ? ' rng' : '') +
                (f.type === 'calc' ? ' calc' : '') +
                (['num', 'pct', 'int', 'calc'].includes(f.type) && f.type !== 'calc' ? ' num' : '') +
                (f.type === 'calc' && typeof getValue(f, row) === 'number' ? ' num' : '') +
                (f.type === 'code' || f.key === 'sampleId' ? ' mono' : '') +
                (lefts[c] !== null ? ' frz' : '') +
                (cellIss?.length ? ' bad-' + (cellIss.some((x) => x.sev === 'error') ? 'error' : cellIss.some((x) => x.sev === 'warn') ? 'warn' : 'info') : '');
              let content = v;
              if (f.type === 'code' && v) {
                const entry = codeMap(f.list).get(v);
                content = html`${entry?.color ? html`<span class="swatch" style=${`background:${safeColor(entry.color)};width:10px;height:10px`}></span>` : null}<span>${v}</span>`;
              }
              return html`<td
                class=${cls}
                style=${lefts[c] !== null ? `left:${lefts[c]}px` : ''}
                title=${cellIss?.length
                  ? cellIss.map((x) => (S.lang === 'mn' ? x.msg.mn : x.msg.en)).join('\n')
                  : f.type === 'code' && v
                    ? codeMap(f.list).get(v)?.[S.lang === 'mn' ? 'meaningMn' : 'meaning'] || ''
                    : f.type === 'note'
                      ? v
                      : ''}
                onMouseDown=${(e) => {
                  if (editing) return;
                  if (e.shiftKey) setAnchor((a) => a || sel);
                  else setAnchor(null);
                  setSel({ r, c });
                }}
                onDblClick=${() => startEdit()}
              >
                ${editing
                  ? f.type === 'code'
                    ? html`<${CodeEditor} field=${f} initial=${edit.initial} takePending=${takePending} onCommit=${commitEdit} onCancel=${() => {
                        setEdit(null);
                        wrap.current?.focus();
                      }} />`
                    : html`<${TextEditor} field=${f} initial=${edit.initial} takePending=${takePending} onCommit=${commitEdit} onCancel=${() => {
                        setEdit(null);
                        wrap.current?.focus();
                      }} />`
                  : html`<div class="g-v">${content}</div>`}
              </td>`;
            })}
          </tr>`;
        })}
        ${last < total ? html`<tr style=${`height:${(total - last) * ROW_H}px`}><td colspan=${fields.length + 1}></td></tr>` : null}
      </tbody>
    </table>
    ${!rows.length
      ? html`<div class="g-empty muted">${readOnly ? tr({ en: 'No rows', mn: 'Мөр алга' }) : tr({ en: 'No rows yet. Add one, or paste straight from Excel (click here, then Ctrl+V).', mn: 'Мөр алга. Мөр нэмэх, эсвэл Excel-ээс шууд paste хийнэ үү (энд дараад Ctrl+V).' })}</div>`
      : null}
  </div>`;
}

export const GRID_CSS = `
.grid-wrap { position: relative; overflow: auto; background: var(--surface); outline: none; min-height: 120px; }
.grid-wrap:focus-visible { box-shadow: inset 0 0 0 2px var(--accent-soft); }
table.grid { border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 13px; }
.grid th { position: sticky; top: 0; z-index: 3; background: var(--surface-2); color: var(--ink-2); font-weight: 600; font-size: 12px; text-align: left; padding: 0 8px; height: 34px; border-bottom: 1px solid var(--line-2); border-right: 1px solid var(--line); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; user-select: none; }
.grid th.num { text-align: right; }
.grid th.calc { color: var(--muted); font-style: italic; }
.grid th .req { color: var(--err); font-style: normal; margin-left: 2px; }
.grid th.frz, .grid td.frz { position: sticky; z-index: 2; }
.grid th.frz { z-index: 4; }
.grid td.frz { background: var(--surface); }
.grid th.g-rn { left: 0; z-index: 5; text-align: center; }
.grid td { height: 30px; padding: 0; border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); position: relative; }
.grid td.g-rn { position: sticky; left: 0; z-index: 2; background: var(--surface-2); color: var(--muted); font-size: 11px; text-align: center; cursor: default; font-variant-numeric: tabular-nums; }
.grid tr.act td.g-rn { background: var(--accent-soft); color: var(--accent-2); }
.grid tr.sev-error td.g-rn { color: var(--err); }
.grid tr.sev-warn td.g-rn { color: var(--warn); }
.grid tr.sev-info td.g-rn { color: var(--info); }
.grid .g-v { padding: 0 8px; line-height: 29px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
.grid td.num .g-v { justify-content: flex-end; font-variant-numeric: tabular-nums; }
.grid td.mono .g-v { font-family: var(--mono); font-size: 12.5px; }
.grid td.calc { background: var(--surface-2); color: var(--muted); }
.grid td.calc.frz { background: var(--surface-2); }
.grid tr.act td:not(.g-rn) { background: color-mix(in srgb, var(--accent-soft) 35%, var(--surface)); }
.grid td.rng { background: color-mix(in srgb, var(--accent-soft) 70%, var(--surface)) !important; }
.grid td.sel { box-shadow: inset 0 0 0 2px var(--accent); z-index: 1; }
.grid td.bad-error { box-shadow: inset 3px 0 0 var(--err); }
.grid td.bad-warn { box-shadow: inset 3px 0 0 var(--warn); }
.grid td.bad-info { box-shadow: inset 3px 0 0 var(--info); }
.grid td.sel.bad-error, .grid td.sel.bad-warn, .grid td.sel.bad-info { box-shadow: inset 0 0 0 2px var(--accent), inset 5px 0 0 var(--err); }
.g-editor { position: absolute; inset: 0; z-index: 20; }
.g-input { width: 100%; height: 100%; border: 2px solid var(--accent); border-radius: 0; padding: 0 6px; font: inherit; background: var(--surface); color: var(--ink); outline: none; }
.g-input.num { text-align: right; }
.g-editor.note { inset: 0 auto auto 0; width: 380px; height: auto; }
.g-editor.note textarea { height: 110px; padding: 6px 8px; resize: vertical; box-shadow: var(--shadow); }
.g-count { background: var(--surface-2); border: 1px solid var(--line); border-top: 0; font-size: 11px; color: var(--muted); padding: 2px 8px; }
.g-count.over { color: var(--err); font-weight: 700; }
.g-editor.code { right: auto; min-width: 100%; width: max(100%, 120px); }
.g-dd { position: absolute; top: 100%; left: 0; width: 340px; max-height: 280px; overflow: auto; background: var(--surface); border: 1px solid var(--line-2); border-radius: 0 0 8px 8px; box-shadow: var(--shadow); }
.g-opt { display: flex; align-items: center; gap: 8px; padding: 5px 8px; cursor: pointer; font-size: 12.5px; }
.g-opt b { min-width: 52px; }
.g-opt-m { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.g-opt.on { background: var(--accent-soft); }
.g-opt.warnc b { text-decoration: line-through; color: var(--warn); }
.g-empty { position: absolute; left: 0; right: 0; top: 60px; text-align: center; padding: 0 16px; }
`;

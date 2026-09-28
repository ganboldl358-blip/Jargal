// Hole workspace: header form, one tab per table (spreadsheet grid), the live
// strip log beside it, and the hole's validation issues.
import { html, useState, useEffect, useMemo, useRef } from '../../lib.js';
import { S, hole, rows, mutate, settings, elementKeys, loggedTo, renameHole, deleteHole, upsert, rowHistory, sampleById } from '../../core/store.js';
import { TABLES, elementLabel } from '../../core/schema.js';
import { validateHole, issueIndex, msg, ruleName } from '../../core/validate.js';
import { splitRow, gapFillers, gaps, coverage, sorted } from '../../core/intervals.js';
import { isNum, round, fmt, fix, dateTime, timeAgo, natCmp } from '../../core/util.js';
import { userName } from '../../core/cloud.js';
import { tr, t, label } from '../../i18n.js';
import { Icon } from '../icons.js';
import { Grid } from '../grid.js';
import { useStore, Button, IconButton, Pill, Tabs, Empty, openModal, confirmDialog, promptDialog, toast, navigate, injectCSS, usePref, Field, Select } from '../kit.js';
import { track, doneToast } from '../undo.js';
import { PhotoTab, PhotoStrip } from '../photos.js';

injectCSS(
  'holeview',
  `
.hv { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.hv-head { display: flex; gap: 14px; align-items: center; padding: 12px 20px 10px; background: var(--surface); border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.hv-title { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.hv-title h1 { font-family: var(--display); font-size: 22px; letter-spacing: 0.01em; }
.hv-facts { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12.5px; color: var(--muted); }
.hv-facts b { color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }
.hv-tabs { background: var(--surface); padding: 0 12px; }
.hv-body { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 6px var(--log-w, 460px); min-height: 0; }
.hv-split { cursor: col-resize; background: var(--line); position: relative; }
.hv-split:hover, .hv-split.drag { background: var(--accent); }
.hv-body.nolog { grid-template-columns: minmax(0, 1fr); }
.hv-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.hv-tools { display: flex; gap: 6px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); flex-wrap: wrap; background: var(--surface); }
.hv-tools .sep { width: 1px; height: 22px; background: var(--line); margin: 0 4px; }
.hv-grid { flex: 1; min-height: 0; display: flex; }
.hv-grid > .grid-wrap { flex: 1; }
.hv-log { min-height: 0; min-width: 0; display: flex; flex-direction: column; background: var(--surface); }
.hv-foot { display: flex; gap: 14px; padding: 6px 12px; font-size: 12px; color: var(--muted); border-top: 1px solid var(--line); background: var(--surface); flex-wrap: wrap; }
.hv-lock { display: flex; gap: 10px; align-items: center; padding: 8px 20px; background: var(--warn-soft); color: var(--ink); font-size: 13px; flex-wrap: wrap; }
.hv-form { padding: 18px 20px; overflow: auto; }
.hv-form .form-grid { max-width: 1100px; }
.hv-issues { padding: 16px 20px; overflow: auto; }
@media (max-width: 1100px) { .hv-body { grid-template-columns: minmax(0, 1fr); } .hv-log, .hv-split { display: none; } }
.colpick { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 6px 12px; }
.hist-row { display: grid; grid-template-columns: 130px 1fr; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.diff del { color: var(--err); text-decoration: line-through; }
.diff ins { color: var(--ok); text-decoration: none; }
`,
);

const TABS = ['header', 'survey', 'lith', 'geotech', 'struct', 'samples', 'assays', 'pxrf', 'phys', 'photos', 'issues'];

function tabLabel(k) {
  if (k === 'header') return tr({ en: 'Header', mn: 'Толгой' });
  if (k === 'issues') return tr({ en: 'Issues', mn: 'Асуудал' });
  const d = TABLES[k];
  return tr(d.short || d.label);
}

/** Field list for a table in the grid (value columns for assays / pXRF). */
function gridFields(table, holeId, hidden) {
  const def = TABLES[table];
  let fields = def.fields.filter((f) => f.key !== 'holeId' || table === 'collar');
  if (table === 'assays' || table === 'pxrf') {
    const keys = new Set();
    for (const r of rows(table, holeId)) for (const k of Object.keys(r.values || {})) keys.add(k);
    const order = table === 'assays' ? elementKeys('assays') : [...keys].sort(natCmp);
    const els = order.filter((k) => keys.has(k));
    fields = fields.concat(
      els.map((k) => ({
        key: 'v:' + k,
        type: 'num',
        label: { en: elementLabel(k), mn: elementLabel(k) },
        w: 76,
        get: (r) => r.values?.[k] ?? null,
        set: (r, v) => ({ values: { ...(r.values || {}), [k]: v }, flags: { ...(r.flags || {}), [k]: undefined } }),
        display: (r) => {
          const v = r.values?.[k];
          if (v === null || v === undefined) return '';
          return (r.flags?.[k] === '<' ? '<' : r.flags?.[k] === '>' ? '>' : '') + fmt(v, 4);
        },
      })),
    );
  }
  return fields.filter((f) => !(hidden?.includes(f.key) ?? f.hidden));
}

function newRowFactory(table, holeId) {
  return (i = 0) => {
    const list = rows(table, holeId);
    const c = hole(holeId);
    const eoh = c?.eoh;
    if (table === 'survey') {
      const last = list[list.length - 1];
      return { depth: round((last?.depth ?? -30) + 30 * (i + 1), 2), azimuth: last?.azimuth ?? c?.azimuth ?? null, dip: last?.dip ?? c?.dip ?? null, method: last?.method ?? null };
    }
    if (TABLES[table].kind === 'interval' || table === 'pxrf') {
      const s = sorted(list);
      const last = s[s.length - 1];
      const len = table === 'geotech' ? 3 : last ? Math.min(3, round(last.to - last.from, 2)) || 1 : 1;
      const from = round((last?.to ?? 0) + len * i, 2);
      let to = round(from + len, 2);
      if (isNum(eoh) && to > eoh && from < eoh) to = eoh;
      const base = { from, to };
      if (table === 'samples') {
        const last2 = list[list.length - 1];
        return { ...base, sampleType: 'PRIM', sampleId: nextId(last2?.sampleId, i + 1) };
      }
      if (table === 'lith') return { ...base, logger: S.user.name || null, logDate: new Date().toISOString().slice(0, 10) };
      return base;
    }
    if (TABLES[table].kind === 'point') {
      const last = list[list.length - 1];
      return { depth: round((last?.depth ?? 0) + (table === 'phys' ? 10 : 1) * (i + (last ? 1 : 0)), 2) };
    }
    return {};
  };
}

function nextId(id, step = 1) {
  if (!id) return null;
  const m = String(id).match(/^(.*?)(\d+)$/);
  if (!m) return null;
  const n = String(Number(m[2]) + step).padStart(m[2].length, '0');
  return m[1] + n;
}

function RowHistory({ table, holeId, row }) {
  const list = rowHistory(table, holeId, row.id);
  const def = TABLES[table];
  const fl = (k) => {
    const f = def?.fields.find((x) => x.key === k);
    return f ? label(f) : k;
  };
  return html`<div class="dlg-body">
    ${!list.length ? html`<p class="muted">${tr({ en: 'No recorded changes.', mn: 'Бүртгэгдсэн өөрчлөлт алга.' })}</p>` : null}
    ${list.map(
      (e) => html`<div class="hist-row">
        <div><div class="num">${dateTime(e.t)}</div><div class="muted">${userName(e.u)}</div></div>
        <div class="diff">
          <div><b>${{ c: tr({ en: 'Created', mn: 'Үүсгэсэн' }), u: tr({ en: 'Edited', mn: 'Зассан' }), d: tr({ en: 'Deleted', mn: 'Устгасан' }), r: tr({ en: 'Restored', mn: 'Сэргээсэн' }) }[e.o]}</b> <span class="muted">· ${e.l}</span></div>
          ${e.o === 'u'
            ? Object.entries(e.c || {}).map(([k, [o, n]]) => html`<div>${fl(k)}: <del>${o === null ? '∅' : JSON.stringify(o)}</del> → <ins>${n === null ? '∅' : JSON.stringify(n)}</ins></div>`)
            : null}
        </div>
      </div>`,
    )}
  </div>`;
}

function HeaderForm({ c, readOnly }) {
  const def = TABLES.collar;
  const [draft, setDraft] = useState({});
  useEffect(() => setDraft({}), [c?.id]);
  if (!c) return null;
  const val = (f) => (f.key in draft ? draft[f.key] : c[f.key] ?? '');
  const commit = (f, raw) => {
    const v = f.type === 'num' ? (raw === '' ? null : Number(raw)) : f.type === 'bool' ? !!raw : raw === '' ? null : raw;
    if (f.key === 'holeId') return;
    if ((c[f.key] ?? null) === (v ?? null)) return;
    track(upsert('collar', c.holeId, { id: c.id, [f.key]: v }, { label: `${c.holeId} ${label(f)}` }), label(f));
  };
  const input = (f) => {
    if (f.type === 'calc') return html`<input class="inp num" value=${fmt(f.calc(c, S.ctx), 2)} disabled />`;
    if (f.type === 'code')
      return html`<${Select}
        id=${'hf-' + f.key}
        value=${val(f)}
        placeholder=""
        options=${rows('codes').filter((x) => x.list === f.list && !x.inactive).map((x) => ({ value: x.code, label: `${x.code} — ${S.lang === 'mn' ? x.meaningMn || x.meaning : x.meaning}` }))}
        onChange=${(v) => commit(f, v)}
      />`;
    if (f.type === 'note')
      return html`<textarea id=${'hf-' + f.key} class="inp" rows="3" disabled=${readOnly} value=${val(f)} onInput=${(e) => setDraft({ ...draft, [f.key]: e.target.value })} onBlur=${(e) => commit(f, e.target.value)}></textarea>`;
    if (f.type === 'bool') return html`<label class="check"><input type="checkbox" checked=${!!c[f.key]} disabled=${readOnly} onChange=${(e) => commit(f, e.target.checked)} /> ${label(f)}</label>`;
    return html`<input
      id=${'hf-' + f.key}
      class=${'inp' + (f.type === 'num' ? ' num' : '')}
      type=${f.type === 'date' ? 'date' : 'text'}
      inputmode=${f.type === 'num' ? 'decimal' : undefined}
      disabled=${readOnly || f.key === 'holeId'}
      value=${val(f)}
      onInput=${(e) => setDraft({ ...draft, [f.key]: e.target.value })}
      onBlur=${(e) => commit(f, e.target.value)}
      onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()}
    />`;
  };
  return html`<div class="hv-form">
    <div class="form-grid">
      ${def.fields
        .filter((f) => f.key !== 'locked')
        .map((f) => html`<${Field} label=${label(f) + (f.req ? ' *' : '')} wide=${f.type === 'note'}>${input(f)}<//>`)}
    </div>
    <p class="muted" style="margin-top:14px;max-width:70ch">
      ${tr({
        en: 'To rename the hole use the ⋯ menu — the new ID is applied to every table at once, and the change can be undone.',
        mn: 'Цооногийн дугаарыг ⋯ цэснээс солино — бүх хүснэгтэд нэг дор өөрчлөгдөж, буцаах боломжтой.',
      })}
    </p>
  </div>`;
}

function IssuesPanel({ holeId, onJump }) {
  const list = validateHole(holeId);
  if (!list.length) return html`<${Empty} icon="check" title=${tr({ en: 'No issues in this hole', mn: 'Энэ цооногт асуудал алга' })} />`;
  const order = { error: 0, warn: 1, info: 2 };
  return html`<div class="hv-issues"><div class="card">
    ${[...list]
      .sort((a, b) => order[a.sev] - order[b.sev])
      .map(
        (i) => html`<div class=${'issue ' + i.sev}>
          <${Icon} name=${i.sev === 'info' ? 'info' : 'alert'} size=${16} />
          <div style="flex:1">
            <div><b>${ruleName(i.rule)}</b> <span class="muted">· ${tabLabel(i.table)}</span></div>
            <div>${msg(i)}</div>
          </div>
          ${i.rowId ? html`<button class="btn sm" onClick=${() => onJump(i)}>${tr({ en: 'Show', mn: 'Харах' })}</button>` : null}
        </div>`,
      )}
  </div></div>`;
}

function LockBanner({ c }) {
  if (!c?.locked) return null;
  const mine = c.lockedBy === S.user.id;
  return html`<div class="hv-lock">
    <${Icon} name="lock" size=${16} />
    <span>
      ${mine
        ? tr({ en: 'You are logging this hole — others see it as locked.', mn: 'Та энэ цооногийг логлож байна — бусад түгжээтэй гэж харна.' })
        : tr({ en: 'Locked for logging by {u} since {t}. Editing is paused so two people do not log the same core.', mn: '{u} {t}-аас хойш логлож байгаа тул түгжээтэй. Нэг кернийг хоёр хүн давхар логлохоос сэргийлнэ.' }, { u: userName(c.lockedBy), t: timeAgo(c.lockedAt || c._t, S.lang) })}
    </span>
    <span class="spacer"></span>
    <${Button}
      size="sm"
      icon="unlock"
      onClick=${async () => {
        if (!mine) {
          const ok = await confirmDialog({
            title: tr({ en: 'Take over this hole?', mn: 'Энэ цооногийг авах уу?' }),
            body: tr({ en: 'Only do this if the other person has finished or agreed. Their saved work is kept.', mn: 'Нөгөө хүн дууссан эсвэл зөвшөөрсөн тохиолдолд л. Тэдний хадгалсан ажил хэвээр үлдэнэ.' }),
            ok: tr({ en: 'Take over', mn: 'Авах' }),
          });
          if (!ok) return;
        }
        track(upsert('collar', c.holeId, { id: c.id, locked: mine ? false : true, lockedBy: mine ? null : S.user.id, lockedAt: mine ? null : Date.now() }, { label: `${c.holeId} ${mine ? 'unlock' : 'take over'}` }));
      }}
    >${mine ? tr({ en: 'Finish & unlock', mn: 'Дуусгаж түгжээ тайлах' }) : tr({ en: 'Take over', mn: 'Авах' })}<//>
  </div>`;
}

let StripLogC = null;
function LogPane({ holeId, activeId, onSelect }) {
  const [C, setC] = useState(() => StripLogC);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (C) return;
    import('./striplog.js')
      .then((m) => {
        StripLogC = m.StripLog;
        setC(() => m.StripLog);
      })
      .catch((e) => setErr(e));
  }, []);
  if (err) return html`<div class="empty muted">${tr({ en: 'Strip log unavailable', mn: 'Баганан лог ачаалагдсангүй' })}</div>`;
  if (!C) return html`<div class="empty muted">…</div>`;
  return html`<${C} holeId=${holeId} selectedId=${activeId} onSelect=${onSelect} />`;
}

export function HoleView({ params }) {
  useStore();
  const holeId = params.holeId;
  const tab = TABS.includes(params.tab) ? params.tab : 'lith';
  const c = hole(holeId);
  const [activeId, setActiveId] = useState(null);
  const [rangeRows, setRangeRows] = useState([]);
  const [showLog, setShowLog] = usePref('hv.log', true);
  const [logW, setLogW] = usePref('hv.logw', 480);
  const [hiddenCols, setHiddenCols] = usePref('hv.cols', {});
  const issues = useMemo(() => (c ? validateHole(holeId) : []), [S.rev, holeId]);
  const idx = useMemo(() => (c ? issueIndex(holeId) : new Map()), [S.rev, holeId]);

  useEffect(() => {
    if (S.nav?.rowId) {
      setActiveId(S.nav.rowId);
      S.nav = null;
    }
  }, [holeId, tab]);

  if (!c)
    return html`<div class="hv-form"><${Empty} icon="holes" title=${tr({ en: 'Hole {h} not found', mn: '{h} цооног олдсонгүй' }, { h: holeId })}>
      <a href="#/holes">${tr({ en: 'Back to drill holes', mn: 'Цооногийн жагсаалт руу буцах' })}</a>
    <//></div>`;

  const lockedByOther = c.locked && c.lockedBy && c.lockedBy !== S.user.id;
  const readOnly = !!S.readOnly || lockedByOther;
  const table = tab;
  const isTable = !['header', 'issues', 'photos'].includes(tab);
  const def = TABLES[table];
  const list = isTable ? rows(table, holeId) : [];
  const fields = isTable ? gridFields(table, holeId, hiddenCols[table]) : [];
  const counts = Object.fromEntries(TABS.map((k) => [k, TABLES[k] ? rows(k, holeId).length : 0]));
  const sevCount = { error: issues.filter((i) => i.sev === 'error').length, warn: issues.filter((i) => i.sev === 'warn').length };
  const tabIssues = (k) => issues.filter((i) => i.table === k && i.sev !== 'info').length;
  const setTab = (k) => navigate(`#/hole/${encodeURIComponent(holeId)}/${k}`);

  const active = list.find((r) => r.id === activeId) || null;
  const selection = rangeRows.length > 1 ? rangeRows : active ? [active] : [];
  const interval = def?.kind === 'interval';

  async function addRow() {
    const nr = newRowFactory(table, holeId)(0);
    const res = track(mutate([{ type: 'upsert', table, holeId, row: nr }], { label: `${holeId} ${tabLabel(table)}: add row` }), 'add row');
    if (res?.ids?.[0]) setActiveId(res.ids[0]);
  }
  async function insertBelow() {
    if (!active || !interval) return addRow();
    const s = sorted(list);
    const i = s.findIndex((r) => r.id === active.id);
    const next = s[i + 1];
    const from = active.to;
    const to = next ? next.from : round(from + 1, 2);
    if (!(to > from)) {
      toast(tr({ en: 'No room below — split the interval instead.', mn: 'Доор зай алга — интервалыг хуваана уу.' }), { kind: 'warn' });
      return;
    }
    const res = track(mutate([{ type: 'upsert', table, holeId, row: { from, to } }], { label: `${holeId}: insert ${fix(from)}–${fix(to)}` }), 'insert');
    if (res?.ids?.[0]) setActiveId(res.ids[0]);
  }
  async function split() {
    if (!active || !interval) return;
    const mid = round((active.from + active.to) / 2, 2);
    const v = await promptDialog({ title: tr({ en: 'Split interval', mn: 'Интервал хуваах' }), label: tr({ en: `Split ${fix(active.from)}–${fix(active.to)} m at depth (m)`, mn: `${fix(active.from)}–${fix(active.to)} м-ийг хуваах гүн (м)` }), value: String(mid), ok: tr({ en: 'Split', mn: 'Хуваах' }) });
    if (v === null) return;
    const at = Number(String(v).replace(',', '.'));
    const parts = splitRow(active, at);
    if (!parts) {
      toast(tr({ en: 'Depth must be inside the interval', mn: 'Гүн интервал дотор байх ёстой' }), { kind: 'err' });
      return;
    }
    const res = track(mutate([{ type: 'upsert', table, holeId, row: parts[0] }, { type: 'upsert', table, holeId, row: parts[1] }], { label: `${holeId}: split at ${fix(at)} m` }), 'split');
    doneToast(res, tr({ en: 'Split at {d} m', mn: '{d} м-т хуваалаа' }, { d: fix(at) }));
  }
  async function mergeNext() {
    if (!active || !interval) return;
    const s = sorted(list);
    const group = selection.length > 1 ? sorted(selection) : [active, s[s.findIndex((r) => r.id === active.id) + 1]].filter(Boolean);
    if (group.length < 2) return;
    const codeKey = table === 'lith' ? 'lith1' : null;
    const differ = codeKey && new Set(group.map((r) => r[codeKey])).size > 1;
    if (differ) {
      const ok = await confirmDialog({
        title: tr({ en: 'Merge intervals with different codes?', mn: 'Өөр кодтой интервалуудыг нэгтгэх үү?' }),
        body: tr({ en: 'The merged interval keeps the attributes of the top interval ({c}). The others are deleted (undoable).', mn: 'Нэгтгэсэн интервал дээд интервалын ({c}) утгыг авна. Бусад нь устна (буцаах боломжтой).' }, { c: group[0][codeKey] }),
        ok: tr({ en: 'Merge', mn: 'Нэгтгэх' }),
      });
      if (!ok) return;
    }
    const ops = [{ type: 'upsert', table, holeId, row: { id: group[0].id, to: group[group.length - 1].to } }, ...group.slice(1).map((r) => ({ type: 'delete', table, holeId, id: r.id }))];
    const res = track(mutate(ops, { label: `${holeId}: merge ${group.length} intervals` }), 'merge');
    doneToast(res, tr({ en: 'Merged {n} intervals', mn: '{n} интервал нэгтгэлээ' }, { n: group.length }));
  }
  async function delRows() {
    const targets = selection.length ? selection : [];
    if (!targets.length) return;
    if (targets.length > 1) {
      const ok = await confirmDialog({ title: tr({ en: 'Delete {n} rows?', mn: '{n} мөр устгах уу?' }, { n: targets.length }), body: tr({ en: 'You can undo this from the toast or the History page.', mn: 'Мэдэгдэл эсвэл «Түүх» хуудаснаас буцааж болно.' }), ok: t('delete'), danger: true });
      if (!ok) return;
    }
    const res = track(mutate(targets.map((r) => ({ type: 'delete', table, holeId, id: r.id })), { label: `${holeId} ${tabLabel(table)}: delete ${targets.length}` }), 'delete');
    doneToast(res, tr({ en: 'Deleted {n} rows', mn: '{n} мөр устгалаа' }, { n: targets.length }));
  }
  async function fillGaps() {
    const g = gaps(list, { start: 0, end: c.eoh });
    if (!g.length) {
      toast(tr({ en: 'No gaps from 0 to EOH', mn: '0-ээс EOH хүртэл завсар алга' }), { kind: 'info' });
      return;
    }
    const ok = await confirmDialog({
      title: tr({ en: 'Fill {n} gaps?', mn: '{n} завсрыг бөглөх үү?' }, { n: g.length }),
      body: html`<p>${tr({ en: 'Creates a "Not measured" row for each gap, as MX Deposit requires:', mn: 'Завсар бүрд «Not measured» мөр үүсгэнэ (MX Deposit-ийн шаардлага):' })}</p>
        <div class="chip-list">${g.slice(0, 40).map((x) => html`<span class="pill mono">${fix(x.from)}–${fix(x.to)}</span>`)}</div>`,
      ok: tr({ en: 'Fill gaps', mn: 'Бөглөх' }),
    });
    if (!ok) return;
    const noteKey = def.fields.find((f) => f.type === 'note')?.key || 'comments';
    const res = track(mutate(gapFillers(list, { start: 0, end: c.eoh, fields: { [noteKey]: 'Not measured' } }).map((row) => ({ type: 'upsert', table, holeId, row })), { label: `${holeId} ${tabLabel(table)}: fill ${g.length} gaps` }), 'fill gaps');
    doneToast(res, tr({ en: 'Filled {n} gaps', mn: '{n} завсар бөглөлөө' }, { n: g.length }));
  }
  function pickColumns() {
    const all = gridFields(table, holeId, []);
    openModal(
      (close) => {
        const Body = () => {
          useStore();
          const cur = hiddenCols[table] ?? TABLES[table].fields.filter((f) => f.hidden).map((f) => f.key);
          const toggle = (k) => {
            const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
            setHiddenCols({ ...hiddenCols, [table]: next });
          };
          return html`<div class="dlg-body">
              <div class="colpick">
                ${all.map((f) => html`<label class="check"><input type="checkbox" checked=${!cur.includes(f.key)} onChange=${() => toggle(f.key)} /> ${label(f)}</label>`)}
              </div>
            </div>
            <div class="dlg-actions"><${Button} kind="primary" onClick=${() => close()}>${t('close')}<//></div>`;
        };
        return html`<${Body} />`;
      },
      { title: tr({ en: 'Columns', mn: 'Баганууд' }), wide: true },
    );
  }
  async function hostActions() {
    const choice = await openModal(
      (close) => html`<div class="dlg-body stack">
        <${Button} icon="edit" onClick=${() => close('rename')}>${tr({ en: 'Rename hole', mn: 'Цооногийн дугаар солих' })}<//>
        <${Button} icon="lock" onClick=${() => close('lock')}>${c.locked ? tr({ en: 'Unlock hole', mn: 'Түгжээ тайлах' }) : tr({ en: 'Start logging (lock for others)', mn: 'Логлож эхлэх (бусдад түгжих)' })}<//>
        <${Button} icon="trash" kind="danger" onClick=${() => close('delete')}>${tr({ en: 'Delete hole and all its data', mn: 'Цооног, бүх өгөгдлийг устгах' })}<//>
      </div>`,
      { title: holeId },
    );
    if (choice === 'rename') {
      const v = await promptDialog({ title: tr({ en: 'Rename hole', mn: 'Цооногийн дугаар солих' }), label: tr({ en: 'New hole ID', mn: 'Шинэ дугаар' }), value: holeId });
      if (!v || v === holeId) return;
      if (hole(v)) {
        toast(tr({ en: 'Hole {h} already exists', mn: '{h} цооног аль хэдийн байна' }, { h: v }), { kind: 'err' });
        return;
      }
      const res = renameHole(holeId, v);
      track(res, 'rename');
      navigate(`#/hole/${encodeURIComponent(v)}/${tab}`);
      doneToast(res, tr({ en: 'Renamed to {h}', mn: '{h} болгож солилоо' }, { h: v }));
    } else if (choice === 'lock') {
      track(upsert('collar', holeId, { id: c.id, locked: !c.locked, lockedBy: c.locked ? null : S.user.id, lockedAt: c.locked ? null : Date.now() }, { label: `${holeId} ${c.locked ? 'unlock' : 'lock'}` }));
    } else if (choice === 'delete') {
      const ok = await confirmDialog({ title: tr({ en: 'Delete {h}?', mn: '{h}-г устгах уу?' }, { h: holeId }), body: tr({ en: 'All tables of this hole are deleted as one step. You can restore it from History.', mn: 'Энэ цооногийн бүх хүснэгт нэг алхамаар устна. «Түүх»-ээс сэргээж болно.' }), ok: t('delete'), danger: true });
      if (!ok) return;
      const res = deleteHole(holeId);
      track(res, 'delete hole');
      navigate('#/holes');
      doneToast(res, tr({ en: 'Deleted {h}', mn: '{h} устгалаа' }, { h: holeId }));
    }
  }

  const lithCov = coverage(rows('lith', holeId));
  const eoh = c.eoh;
  const footer = isTable
    ? html`<div class="hv-foot">
        <span>${list.length} ${tr({ en: 'rows', mn: 'мөр' })}</span>
        ${interval && list.length ? html`<span>${tr({ en: 'Covered', mn: 'Хамарсан' })}: <b class="num">${fmt(coverage(list), 2)} m</b>${isNum(eoh) ? html` / ${fmt(eoh, 2)} m` : null}</span>` : null}
        ${selection.length > 1 ? html`<span>${selection.length} ${tr({ en: 'selected', mn: 'сонгосон' })}</span>` : null}
        <span class="spacer"></span>
        <span class="hide-sm"><span class="kbd">Ctrl</span>+<span class="kbd">V</span> ${tr({ en: 'paste from Excel', mn: 'Excel-ээс paste' })} · <span class="kbd">Ctrl</span>+<span class="kbd">D</span> ${tr({ en: 'fill down', mn: 'доош хуулах' })} · <span class="kbd">Ctrl</span>+<span class="kbd">Z</span> ${t('undo')}</span>
      </div>`
    : null;

  return html`<div class="hv">
    <div class="hv-head">
      <div class="hv-title">
        <h1>${holeId}</h1>
        ${c.status ? html`<${Pill} kind=${c.status === 'CMP' ? 'ok' : c.status === 'ACT' ? 'warn' : c.status === 'ABD' || c.status === 'NAC' ? 'err' : ''}>${c.status}<//>` : null}
        ${c.locked ? html`<${Pill} kind="warn"><${Icon} name="lock" size=${12} /> ${userName(c.lockedBy)}<//>` : null}
      </div>
      <div class="hv-facts">
        ${c.prospect ? html`<span>${c.prospect}</span>` : null}
        <span>E <b>${fmt(c.east, 1)}</b> N <b>${fmt(c.north, 1)}</b> RL <b>${fmt(c.rl, 1)}</b></span>
        <span>${tr({ en: 'Az/Dip', mn: 'Аз/Налуу' })} <b>${fmt(c.azimuth, 1)}° / ${fmt(c.dip, 1)}°</b></span>
        <span>EOH <b>${isNum(eoh) ? fmt(eoh, 2) + ' m' : '—'}</b></span>
        <span>${tr({ en: 'Logged', mn: 'Логдсон' })} <b>${fmt(lithCov, 1)} m</b></span>
        ${sevCount.error ? html`<span style="color:var(--err)"><b>${sevCount.error}</b> ${tr({ en: 'errors', mn: 'алдаа' })}</span>` : null}
        ${sevCount.warn ? html`<span style="color:var(--warn)"><b>${sevCount.warn}</b> ${tr({ en: 'warnings', mn: 'анхааруулга' })}</span>` : null}
      </div>
      <span class="spacer"></span>
      <div class="row">
        <${Button} size="sm" icon="log" onClick=${() => navigate('#/striplog/' + encodeURIComponent(holeId))}>${tr({ en: 'Strip log', mn: 'Баганан лог' })}<//>
        <${IconButton} icon="menu" title=${tr({ en: 'Hole actions', mn: 'Цооногийн үйлдэл' })} onClick=${hostActions} />
      </div>
    </div>
    <${LockBanner} c=${c} />
    <div class="hv-tabs">
      <${Tabs}
        active=${tab}
        onChange=${setTab}
        tabs=${TABS.map((k) => ({
          key: k,
          label: tabLabel(k),
          badge: k === 'issues' ? (sevCount.error || sevCount.warn || null) : tabIssues(k) || (TABLES[k] && counts[k]) || null,
          badgeKind: k === 'issues' ? (sevCount.error ? 'err' : 'warn') : tabIssues(k) ? 'err' : '',
        }))}
      />
    </div>
    ${tab === 'header'
      ? html`<${HeaderForm} c=${c} readOnly=${readOnly} />`
      : tab === 'photos'
        ? html`<${PhotoTab} holeId=${holeId} readOnly=${readOnly} />`
      : tab === 'issues'
        ? html`<${IssuesPanel}
            holeId=${holeId}
            onJump=${(i) => {
              S.nav = { rowId: i.rowId };
              setActiveId(i.rowId);
              navigate(`#/hole/${encodeURIComponent(holeId)}/${i.table === 'collar' ? 'header' : i.table}`);
            }}
          />`
        : html`<div class=${'hv-body' + (showLog ? '' : ' nolog')} style=${`--log-w:${Math.max(300, Math.min(logW, 1100))}px`}>
            <div class="hv-main">
              <div class="hv-tools">
                <${Button} size="sm" icon="plus" kind="primary" disabled=${readOnly} onClick=${addRow}>${tr({ en: 'Add row', mn: 'Мөр нэмэх' })}<//>
                ${interval
                  ? html`<${Button} size="sm" icon="arrowDown" disabled=${readOnly || !active} onClick=${insertBelow}>${tr({ en: 'Insert below', mn: 'Доор оруулах' })}<//>
                      <${Button} size="sm" icon="split" disabled=${readOnly || !active} onClick=${split}>${tr({ en: 'Split', mn: 'Хуваах' })}<//>
                      <${Button} size="sm" icon="merge" disabled=${readOnly || !active} onClick=${mergeNext}>${tr({ en: 'Merge', mn: 'Нэгтгэх' })}<//>`
                  : null}
                <${Button} size="sm" icon="trash" disabled=${readOnly || !selection.length} onClick=${delRows}>${t('delete')}${selection.length > 1 ? ` (${selection.length})` : ''}<//>
                ${interval && table !== 'samples' ? html`<span class="sep"></span><${Button} size="sm" icon="fill" disabled=${readOnly} onClick=${fillGaps}>${tr({ en: 'Fill gaps', mn: 'Завсар бөглөх' })}<//>` : null}
                <span class="spacer"></span>
                <${IconButton} icon="history" title=${tr({ en: 'Row history', mn: 'Мөрийн түүх' })} disabled=${!active} onClick=${() => active && openModal(() => html`<${RowHistory} table=${table} holeId=${holeId} row=${active} />`, { title: tr({ en: 'History', mn: 'Түүх' }) + ` · ${active.from ?? active.depth ?? active.sampleId ?? ''}`, wide: true })} />
                <${IconButton} icon="columns" title=${tr({ en: 'Columns', mn: 'Баганууд' })} onClick=${pickColumns} />
                <${IconButton} icon="log" class=${showLog ? 'on' : ''} title=${tr({ en: 'Show strip log', mn: 'Баганан лог харуулах' })} onClick=${() => setShowLog(!showLog)} />
              </div>
              <div class="hv-grid">
                <${Grid}
                  key=${table + holeId}
                  table=${table}
                  holeId=${holeId}
                  rows=${list}
                  fields=${fields}
                  readOnly=${readOnly}
                  issues=${idx}
                  activeId=${activeId}
                  onActive=${(r) => setActiveId(r.id)}
                  onRange=${setRangeRows}
                  newRow=${readOnly ? null : newRowFactory(table, holeId)}
                  frozen=${TABLES[table].kind === 'interval' || table === 'pxrf' ? 2 : 1}
                  onOpenRow=${(r) => openModal(() => html`<${RowHistory} table=${table} holeId=${holeId} row=${r} />`, { title: t('history'), wide: true })}
                />
              </div>
              ${active && table !== 'photos' ? html`<${PhotoStrip} holeId=${holeId} from=${active.from ?? active.depth} to=${active.to ?? active.depth} />` : null}
              ${footer}
            </div>
            ${showLog
              ? html`<div
                    class="hv-split"
                    role="separator"
                    aria-orientation="vertical"
                    title=${tr({ en: 'Drag to resize', mn: 'Чирж өргөнийг өөрчлөх' })}
                    onPointerDown=${(e) => {
                      const el = e.currentTarget;
                      el.setPointerCapture(e.pointerId);
                      el.classList.add('drag');
                      const body = el.parentElement.getBoundingClientRect();
                      const move = (ev) => setLogW(Math.round(body.right - ev.clientX));
                      const up = () => {
                        el.classList.remove('drag');
                        el.removeEventListener('pointermove', move);
                        el.removeEventListener('pointerup', up);
                      };
                      el.addEventListener('pointermove', move);
                      el.addEventListener('pointerup', up);
                    }}
                  ></div>
                  <aside class="hv-log">
                  <${LogPane}
                    holeId=${holeId}
                    activeId=${activeId}
                    onSelect=${(sel) => {
                      if (!sel) return;
                      if (sel.table && sel.table !== table) {
                        S.nav = { rowId: sel.id };
                        navigate(`#/hole/${encodeURIComponent(holeId)}/${sel.table}`);
                      } else setActiveId(sel.id);
                    }}
                  />
                </aside>`
              : null}
          </div>`}
  </div>`;
}

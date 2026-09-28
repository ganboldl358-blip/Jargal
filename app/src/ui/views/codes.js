// Code lists (pick lists): edit meanings / colours, see usage, import & export.
import { html, useState, useMemo } from '../../lib.js';
import { S, rows, mutate } from '../../core/store.js';
import { TABLES } from '../../core/schema.js';
import { LIST_NAMES } from '../../core/codes.js';
import { parseCSVObjects, toCSV } from '../../core/csv.js';
import { natCmp, safeColor } from '../../core/util.js';
import { tr, t } from '../../i18n.js';
import { Icon } from '../icons.js';
import { useStore, Button, Pill, PageHead, toast, pickFile, saveFile, injectCSS, promptDialog, confirmDialog } from '../kit.js';
import { track, doneToast } from '../undo.js';

injectCSS(
  'codes',
  `
.codes-layout { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 14px; align-items: start; }
@media (max-width: 900px) { .codes-layout { grid-template-columns: minmax(0, 1fr); } }
.list-btn { display: flex; justify-content: space-between; gap: 8px; width: 100%; padding: 8px 12px; border: 0; border-bottom: 1px solid var(--line); background: none; color: var(--ink); text-align: left; cursor: pointer; font: inherit; font-size: 13px; }
.list-btn:hover { background: var(--surface-2); }
.list-btn.on { background: var(--accent-soft); color: var(--accent-2); }
.code-tbl input.inp { width: 100%; padding: 4px 6px; }
.code-tbl input[type=color] { width: 34px; height: 26px; padding: 0; border: 1px solid var(--line-2); border-radius: 5px; background: none; cursor: pointer; }
.code-tbl tr.inactive td { opacity: 0.55; }
.grp-row td { background: var(--surface-2); font-weight: 600; font-size: 12px; color: var(--ink-2); }
`,
);

/** How many times each code of a list is used across all tables. */
function usage(list) {
  const m = new Map();
  for (const [tk, def] of Object.entries(TABLES)) {
    const fs = def.fields.filter((f) => f.type === 'code' && f.list === list);
    if (!fs.length) continue;
    for (const r of rows(tk)) for (const f of fs) if (r[f.key]) m.set(r[f.key], (m.get(r[f.key]) || 0) + 1);
  }
  return m;
}

export function CodesView() {
  useStore();
  const all = rows('codes');
  const lists = [...new Set(all.map((c) => c.list))].sort((a, b) => (a === 'LITH' ? -1 : b === 'LITH' ? 1 : natCmp(a, b)));
  const [cur, setCur] = useState('LITH');
  const [draft, setDraft] = useState({});
  const items = all.filter((c) => c.list === cur);
  const used = useMemo(() => usage(cur), [S.rev, cur]);
  const inUseUnknown = [...used.keys()].filter((k) => !items.some((c) => c.code === k));

  const save = (c, patch, label) => track(mutate([{ type: 'upsert', table: 'codes', row: { id: c.id, ...patch } }], { label: label || `${cur} ${c.code}` }));

  const addCode = async (code) => {
    const v = code || (await promptDialog({ title: tr({ en: 'Add code to {l}', mn: '{l}-д код нэмэх' }, { l: cur }), label: tr({ en: 'Code', mn: 'Код' }) }));
    if (!v) return;
    const c = v.trim().toUpperCase();
    if (items.some((x) => x.code === c)) return toast(tr({ en: '{c} already exists', mn: '{c} аль хэдийн байна' }, { c }), { kind: 'warn' });
    track(mutate([{ type: 'upsert', table: 'codes', row: { id: `${cur}:${c}`, list: cur, code: c, meaning: '', meaningMn: '', order: items.length } }], { label: `${cur}: add ${c}` }));
  };

  const importCSV = async () => {
    const f = await pickFile({ accept: '.csv,.txt,.tsv' });
    if (!f) return;
    const { rows: rs, headers } = parseCSVObjects(f.text);
    const H = (names) => headers.find((h) => names.includes(h.trim().toLowerCase()));
    const hList = H(['list', 'field', 'list name']);
    const hCode = H(['code', 'value']);
    const hMean = H(['meaning', 'description', 'name', 'meaning (en)', 'description (en)']);
    const hMn = H(['meaning (mn)', 'mn', 'mongolian', 'meaningmn', 'тайлбар']);
    const hCol = H(['colour', 'color', 'hex', 'rgb']);
    const hGrp = H(['group', 'category']);
    if (!hCode) return toast(tr({ en: 'The file needs a "code" column', mn: 'Файлд «code» багана хэрэгтэй' }), { kind: 'err' });
    const ops = [];
    for (const r of rs) {
      const list = (hList ? r[hList] : cur).trim().toUpperCase() || cur;
      const code = String(r[hCode] || '').trim().toUpperCase();
      if (!code) continue;
      const row = { id: `${list}:${code}`, list, code };
      if (hMean && r[hMean]) row.meaning = r[hMean];
      if (hMn && r[hMn]) row.meaningMn = r[hMn];
      if (hCol && r[hCol]) {
        const c = r[hCol].trim();
        const hex = /^#?[0-9a-f]{6}$/i.test(c) ? '#' + c.replace('#', '') : null;
        if (hex || safeColor(c, '') === c) row.color = hex || c;
      }
      if (hGrp && r[hGrp]) row.group = r[hGrp];
      ops.push({ type: 'upsert', table: 'codes', row });
    }
    const res = track(mutate(ops, { label: `Code list import ${f.name}` }));
    doneToast(res, tr({ en: '{c} new, {u} updated codes', mn: '{c} шинэ, {u} шинэчилсэн код' }, { c: res.created, u: res.updated }));
  };

  const exportCSV = () =>
    saveFile(`ORD_codes_${cur}.csv`, toCSV(items, ['list', 'code', 'meaning', 'meaningMn', 'group', 'color', 'inactive']), 'text/csv');

  let lastGroup = null;
  return html`<div class="stack">
    <${PageHead} title=${t('codes')} sub=${tr({ en: 'Pick lists used by the grids, validation and exports. Import your official lists (e.g. MU_Lithology_Codes_v4) to replace meanings and colours by code.', mn: 'Грид, шалгалт, экспортод ашиглах жагсаалтууд. Албан ёсны жагсаалтаа (ж: MU_Lithology_Codes_v4) импортлоход кодоор нь утга, өнгийг шинэчилнэ.' })}>
      <${Button} icon="upload" onClick=${importCSV}>${tr({ en: 'Import CSV', mn: 'CSV импорт' })}<//>
      <${Button} icon="download" onClick=${exportCSV}>CSV<//>
      <${Button} icon="plus" kind="primary" disabled=${!!S.readOnly} onClick=${() => addCode()}>${tr({ en: 'Add code', mn: 'Код нэмэх' })}<//>
    <//>
    <div class="codes-layout">
      <div class="card">
        ${lists.map(
          (l) => html`<button class=${'list-btn' + (l === cur ? ' on' : '')} onClick=${() => setCur(l)}>
            <span>${LIST_NAMES[l] ? tr(LIST_NAMES[l]) : l}</span><span class="badge">${all.filter((c) => c.list === l && !c.inactive).length}</span>
          </button>`,
        )}
      </div>
      <div class="stack">
        ${inUseUnknown.length
          ? html`<div class="card"><div class="body row">
              <${Icon} name="alert" />
              <span>${tr({ en: 'Codes in use but missing from this list:', mn: 'Ашиглагдаж байгаа боловч жагсаалтад байхгүй код:' })}</span>
              ${inUseUnknown.map((c) => html`<button class="btn sm" onClick=${() => addCode(c)}><span class="mono">${c}</span> <${Icon} name="plus" size=${13} /></button>`)}
            </div></div>`
          : null}
        <div class="tbl-wrap">
          <table class="tbl code-tbl">
            <thead>
              <tr>
                <th style="width:48px"></th>
                <th style="width:90px">${tr({ en: 'Code', mn: 'Код' })}</th>
                <th>${tr({ en: 'Meaning (EN)', mn: 'Утга (EN)' })}</th>
                <th>${tr({ en: 'Meaning (MN)', mn: 'Утга (MN)' })}</th>
                <th class="num" style="width:70px">${tr({ en: 'Used', mn: 'Хэрэглээ' })}</th>
                <th style="width:120px"></th>
              </tr>
            </thead>
            <tbody>
              ${items.map((c) => {
                const grp = c.group && c.group !== lastGroup ? html`<tr class="grp-row"><td colspan="6">${c.group}</td></tr>` : null;
                lastGroup = c.group;
                const val = (k) => (draft[c.id + k] !== undefined ? draft[c.id + k] : c[k] || '');
                const setD = (k) => (e) => setDraft({ ...draft, [c.id + k]: e.target.value });
                const commit = (k) => (e) => {
                  if ((c[k] || '') !== e.target.value) save(c, { [k]: e.target.value });
                };
                return html`${grp}<tr class=${c.inactive ? 'inactive' : ''}>
                  <td><input type="color" value=${/^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '#cccccc'} disabled=${!!S.readOnly} onChange=${(e) => save(c, { color: e.target.value })} title=${tr({ en: 'Colour', mn: 'Өнгө' })} /></td>
                  <td>
                    <b class="mono">${c.code}</b>${c.verify ? html`<span class="muted" title=${tr({ en: 'Meaning to be confirmed against the official list', mn: 'Утгыг албан ёсны жагсаалтаар батлах' })}> ?</span>` : null}
                    ${c.mxPending ? html`<div><${Pill} kind="warn" title=${tr({ en: 'Not yet in the MX Deposit list; MX export uses the fallback code', mn: 'MX Deposit жагсаалтад хараахан алга; MX export орлох кодыг ашиглана' })}>MX ${c.mxFallback ? '→ ' + c.mxFallback : ''}<//></div>` : null}
                    ${c.warn ? html`<div><${Pill} kind="err">${tr({ en: 'do not use', mn: 'бүү ашигла' })}<//></div>` : null}
                  </td>
                  <td><input class="inp" id=${'cm-' + c.id} value=${val('meaning')} disabled=${!!S.readOnly} onInput=${setD('meaning')} onBlur=${commit('meaning')} /></td>
                  <td><input class="inp" id=${'cmn-' + c.id} value=${val('meaningMn')} disabled=${!!S.readOnly} onInput=${setD('meaningMn')} onBlur=${commit('meaningMn')} /></td>
                  <td class="num">${used.get(c.code) || ''}</td>
                  <td style="white-space:nowrap">
                    <label class="check" style="font-size:12px"><input type="checkbox" checked=${!!c.inactive} disabled=${!!S.readOnly} onChange=${(e) => save(c, { inactive: e.target.checked || null })} /> ${tr({ en: 'inactive', mn: 'идэвхгүй' })}</label>
                    ${!used.get(c.code)
                      ? html`<button class="icon-btn" title=${t('delete')} disabled=${!!S.readOnly} onClick=${async () => {
                          if (await confirmDialog({ title: tr({ en: 'Delete code {c}?', mn: '{c} кодыг устгах уу?' }, { c: c.code }), ok: t('delete'), danger: true }))
                            doneToast(track(mutate([{ type: 'delete', table: 'codes', id: c.id }], { label: `${cur}: delete ${c.code}` })), tr({ en: 'Deleted', mn: 'Устгалаа' }));
                        }}><${Icon} name="trash" size=${15} /></button>`
                      : null}
                  </td>
                </tr>`;
              })}
            </tbody>
          </table>
        </div>
        ${items.some((c) => c.verify)
          ? html`<p class="muted">${tr({ en: 'Meanings of a few v4 codes were not available when ORD was set up and are marked for checking in the official MU_Lithology_Codes_v4.xlsx.', mn: 'Цөөн v4 кодын утга ORD-ийг тохируулах үед байгаагүй тул албан ёсны MU_Lithology_Codes_v4.xlsx-ээр шалгах шаардлагатай.' })}</p>`
          : null}
      </div>
    </div>
  </div>`;
}

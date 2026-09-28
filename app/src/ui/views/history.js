// Audit trail: every batch of changes (edit, paste, import, delete) with who,
// when and old → new, and one-click undo of a whole batch.
import { html, useState, useMemo, useEffect } from '../../lib.js';
import { S, batches, history, undoBatch } from '../../core/store.js';
import { TABLES } from '../../core/schema.js';
import { dateTime, timeAgo, natCmp } from '../../core/util.js';
import { userName, resolveNames } from '../../core/cloud.js';
import { tr, t, label } from '../../i18n.js';
import { Icon } from '../icons.js';
import { useStore, Button, Pill, PageHead, Empty, Select, confirmDialog, toast, injectCSS } from '../kit.js';

injectCSS(
  'history',
  `
.hb { border-bottom: 1px solid var(--line); }
.hb:last-child { border-bottom: 0; }
.hb-head { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; gap: 10px; padding: 10px 14px; align-items: center; cursor: pointer; }
.hb-head:hover { background: var(--surface-2); }
.hb-meta { font-size: 12px; color: var(--muted); }
.hb-body { padding: 0 14px 12px 48px; font-size: 12.5px; }
.hb-body table { width: 100%; border-collapse: collapse; }
.hb-body td { padding: 3px 6px; border-bottom: 1px dashed var(--line); vertical-align: top; }
.hb-body del { color: var(--err); }
.hb-body ins { color: var(--ok); text-decoration: none; }
`,
);

const OPN = { c: { en: 'new', mn: 'шинэ' }, u: { en: 'edited', mn: 'зассан' }, d: { en: 'deleted', mn: 'устгасан' }, r: { en: 'restored', mn: 'сэргээсэн' } };
const val = (v) => {
  const s = v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return s.length > 140 ? s.slice(0, 137) + '…' : s;
};

function BatchDetail({ batch }) {
  const entries = history().filter((e) => e.b === batch).slice(0, 200);
  const fl = (tb, k) => {
    const f = TABLES[tb]?.fields.find((x) => x.key === k);
    return f ? label(f) : k;
  };
  return html`<div class="hb-body">
    <table>
      <tbody>
        ${entries.map(
          (e) => html`<tr>
            <td style="width:110px"><b class="mono">${e.holeId || '—'}</b></td>
            <td style="width:110px">${TABLES[e.table] ? tr(TABLES[e.table].short || TABLES[e.table].label) : e.table}</td>
            <td style="width:80px"><${Pill} kind=${e.o === 'd' ? 'err' : e.o === 'c' ? 'ok' : ''}>${tr(OPN[e.o])}<//></td>
            <td>
              ${e.o === 'u'
                ? Object.entries(e.c || {}).map(([k, [o, n]]) => html`<div>${fl(e.table, k)}: <del>${val(o)}</del> → <ins>${val(n)}</ins></div>`)
                : html`<span class="muted">${Object.entries(e.c || {})
                    .slice(0, 6)
                    .map(([k, [o, n]]) => `${fl(e.table, k)}=${val(e.o === 'd' ? o : n)}`)
                    .join(' · ')}</span>`}
            </td>
          </tr>`,
        )}
      </tbody>
    </table>
    ${history().filter((e) => e.b === batch).length > 200 ? html`<p class="muted">${tr({ en: 'Showing the first 200 changes.', mn: 'Эхний 200 өөрчлөлтийг харуулав.' })}</p>` : null}
  </div>`;
}

export function HistoryView() {
  useStore();
  const [open, setOpen] = useState(null);
  const [holeF, setHoleF] = useState('');
  const [limit, setLimit] = useState(100);
  const list = batches().filter((b) => !holeF || b.holes.has(holeF));
  const holesSeen = useMemo(() => [...new Set(batches().flatMap((b) => [...b.holes]))].sort(natCmp), [S.rev]);
  useEffect(() => {
    resolveNames([...new Set(list.slice(0, limit).map((b) => b.u))]);
  }, [S.rev, limit]);

  return html`<div class="stack">
    <${PageHead} title=${t('history')} sub=${tr({ en: 'Every change is recorded with who made it and when. Undo reverses a whole batch — an import, a paste, a delete — as one new change, so nothing is lost.', mn: 'Өөрчлөлт бүрийг хэн, хэзээ хийснийг бүртгэнэ. «Буцаах» нь импорт, paste, устгалыг бүтнээр нь шинэ өөрчлөлтөөр буцаадаг тул юу ч алдагдахгүй.' })}>
      <${Select} id="hist-hole" value=${holeF} placeholder=${tr({ en: 'All holes', mn: 'Бүх цооног' })} options=${holesSeen} onChange=${setHoleF} />
    <//>
    ${!list.length
      ? html`<div class="card"><${Empty} icon="history" title=${tr({ en: 'No changes yet', mn: 'Өөрчлөлт алга' })} /></div>`
      : html`<div class="card">
          ${list.slice(0, limit).map(
            (b) => html`<div class="hb">
              <div class="hb-head" onClick=${() => setOpen(open === b.batch ? null : b.batch)}>
                <${Icon} name=${open === b.batch ? 'chevronDown' : 'chevronRight'} size=${16} />
                <div style="min-width:0">
                  <div>${b.label || '—'}</div>
                  <div class="hb-meta">
                    ${userName(b.u)} · ${dateTime(b.t)} (${timeAgo(b.t, S.lang)}) ·
                    ${b.ops.c ? `${b.ops.c} ${tr(OPN.c)} ` : ''}${b.ops.u ? `${b.ops.u} ${tr(OPN.u)} ` : ''}${b.ops.d ? `${b.ops.d} ${tr(OPN.d)} ` : ''}${b.ops.r ? `${b.ops.r} ${tr(OPN.r)}` : ''}
                    ${b.holes.size ? ` · ${[...b.holes].slice(0, 5).join(', ')}${b.holes.size > 5 ? '…' : ''}` : ''}
                  </div>
                </div>
                <${Button}
                  size="sm"
                  icon="undo"
                  disabled=${!!S.readOnly}
                  onClick=${async (e) => {
                    e.stopPropagation();
                    const ok = await confirmDialog({
                      title: tr({ en: 'Undo this change?', mn: 'Энэ өөрчлөлтийг буцаах уу?' }),
                      body: tr({ en: '"{l}" — {n} row changes will be reversed. Later edits to the same rows are overwritten.', mn: '«{l}» — {n} мөрийн өөрчлөлтийг буцаана. Тэдгээр мөрөнд дараа нь хийсэн засвар дарагдана.' }, { l: b.label, n: b.n }),
                      ok: t('undo'),
                    });
                    if (!ok) return;
                    const r = undoBatch(b.batch);
                    toast(tr({ en: 'Reversed {n} changes', mn: '{n} өөрчлөлтийг буцаалаа' }, { n: r.created + r.updated + r.deleted }));
                  }}
                  >${t('undo')}<//
                >
              </div>
              ${open === b.batch ? html`<${BatchDetail} batch=${b.batch} />` : null}
            </div>`,
          )}
          ${list.length > limit ? html`<div class="body"><${Button} onClick=${() => setLimit(limit + 200)}>${tr({ en: 'Show more', mn: 'Цааш харах' })}<//></div>` : null}
        </div>`}
  </div>`;
}

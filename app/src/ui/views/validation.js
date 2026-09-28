// Project-wide validation report with jump-to-row.
import { html, useState, useMemo } from '../../lib.js';
import { S } from '../../core/store.js';
import { TABLES } from '../../core/schema.js';
import { validateAll, summarize, msg, ruleName, RULES } from '../../core/validate.js';
import { natCmp } from '../../core/util.js';
import { toCSV } from '../../core/csv.js';
import { tr, t } from '../../i18n.js';
import { Icon } from '../icons.js';
import { useStore, Button, Pill, PageHead, Empty, Select, navigate, saveFile, injectCSS, Stat } from '../kit.js';

injectCSS(
  'validation',
  `
.val-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 14px; align-items: start; }
@media (max-width: 900px) { .val-layout { grid-template-columns: minmax(0, 1fr); } }
.rule-btn { display: flex; justify-content: space-between; gap: 8px; width: 100%; padding: 7px 12px; border: 0; background: none; color: var(--ink); cursor: pointer; text-align: left; font: inherit; font-size: 13px; border-bottom: 1px solid var(--line); }
.rule-btn:hover { background: var(--surface-2); }
.rule-btn.on { background: var(--accent-soft); color: var(--accent-2); }
.rule-btn .code { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-right: 6px; }
.val-list .issue { border-radius: 0; }
`,
);

const tableName = (k) => (TABLES[k] ? tr(TABLES[k].short || TABLES[k].label) : k);

export function ValidationView() {
  useStore();
  const [sev, setSev] = useState('');
  const [rule, setRule] = useState('');
  const [holeF, setHoleF] = useState('');
  const [limit, setLimit] = useState(300);
  const all = useMemo(() => validateAll(), [S.rev]);
  const sum = useMemo(() => summarize(all), [all]);
  const list = all.filter((i) => (!sev || i.sev === sev) && (!rule || i.rule === rule) && (!holeF || i.holeId === holeF));
  const order = { error: 0, warn: 1, info: 2 };
  const sorted = [...list].sort((a, b) => order[a.sev] - order[b.sev] || natCmp(a.holeId, b.holeId) || a.rule.localeCompare(b.rule));
  const rulesUsed = [...sum.byRule.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const holesUsed = [...sum.byHole.keys()].filter(Boolean).sort(natCmp);

  const jump = (i) => {
    S.nav = { rowId: i.rowId };
    const tab = i.table === 'collar' ? 'header' : i.table;
    if (i.holeId) navigate(`#/hole/${encodeURIComponent(i.holeId)}/${tab}`);
  };

  const exportCSV = () =>
    saveFile(
      `ORD_validation_${new Date().toISOString().slice(0, 10)}.csv`,
      toCSV(sorted, [
        { key: 'sev', header: 'severity' },
        { key: 'rule', header: 'rule' },
        { header: 'rule_name', get: (i) => RULES[i.rule]?.en || i.rule },
        { key: 'holeId', header: 'hole_id' },
        { key: 'table', header: 'table' },
        { key: 'field', header: 'field' },
        { header: 'message', get: (i) => i.msg.en },
        { header: 'message_mn', get: (i) => i.msg.mn },
      ]),
      'text/csv',
    );

  return html`<div class="stack">
    <${PageHead} title=${t('validation')} sub=${tr({ en: '{n} checks run live on every change — fix errors before exporting to MX Deposit or Leapfrog.', mn: 'Өөрчлөлт бүрд {n} шалгалт шууд ажиллана — MX Deposit эсвэл Leapfrog руу гаргахаас өмнө алдааг засна уу.' }, { n: Object.keys(RULES).length })}>
      <${Button} icon="download" onClick=${exportCSV} disabled=${!sorted.length}>CSV<//>
    <//>
    <div class="stats">
      <button class="stat" style="text-align:left;cursor:pointer" onClick=${() => setSev(sev === 'error' ? '' : 'error')}><div class="stat-label">${t('error')}</div><div class="stat-value" style="color:var(--err)">${sum.error}</div></button>
      <button class="stat" style="text-align:left;cursor:pointer" onClick=${() => setSev(sev === 'warn' ? '' : 'warn')}><div class="stat-label">${t('warning')}</div><div class="stat-value" style="color:var(--warn)">${sum.warn}</div></button>
      <button class="stat" style="text-align:left;cursor:pointer" onClick=${() => setSev(sev === 'info' ? '' : 'info')}><div class="stat-label">${t('info')}</div><div class="stat-value" style="color:var(--info)">${sum.info}</div></button>
      <${Stat} label=${tr({ en: 'Holes with errors', mn: 'Алдаатай цооног' })} value=${[...sum.byHole.values()].filter((h) => h.error).length} />
    </div>
    ${!all.length
      ? html`<div class="card"><${Empty} icon="check" title=${tr({ en: 'All checks pass', mn: 'Бүх шалгалт тэнцсэн' })} /></div>`
      : html`<div class="val-layout">
          <div class="card">
            <header><h3>${tr({ en: 'Rules', mn: 'Дүрмүүд' })}</h3>${rule ? html`<button class="btn sm ghost" onClick=${() => setRule('')}>${t('all')}</button>` : null}</header>
            ${rulesUsed.map(
              ([r, n]) => html`<button class=${'rule-btn' + (rule === r ? ' on' : '')} onClick=${() => setRule(rule === r ? '' : r)}>
                <span><span class="code">${r}</span>${ruleName(r)}</span><span class="badge">${n}</span>
              </button>`,
            )}
          </div>
          <div class="stack">
            <div class="row">
              <${Select} id="val-sev" value=${sev} placeholder=${tr({ en: 'All severities', mn: 'Бүх түвшин' })} options=${[{ value: 'error', label: t('error') }, { value: 'warn', label: t('warning') }, { value: 'info', label: t('info') }]} onChange=${setSev} />
              <${Select} id="val-hole" value=${holeF} placeholder=${tr({ en: 'All holes', mn: 'Бүх цооног' })} options=${holesUsed} onChange=${setHoleF} />
              <span class="muted">${sorted.length} / ${all.length}</span>
            </div>
            <div class="card val-list">
              ${sorted.slice(0, limit).map(
                (i) => html`<div class=${'issue ' + i.sev}>
                  <${Icon} name=${i.sev === 'info' ? 'info' : 'alert'} size=${16} />
                  <div style="flex:1;min-width:0">
                    <div class="row" style="gap:6px"><b class="mono">${i.holeId || '—'}</b><${Pill}>${tableName(i.table)}<//><span class="muted">${ruleName(i.rule)}</span></div>
                    <div>${msg(i)}</div>
                  </div>
                  ${i.holeId ? html`<button class="btn sm" onClick=${() => jump(i)}>${tr({ en: 'Fix', mn: 'Засах' })}</button>` : null}
                </div>`,
              )}
              ${sorted.length > limit ? html`<div class="body"><${Button} onClick=${() => setLimit(limit + 500)}>${tr({ en: 'Show more ({n} left)', mn: 'Цааш харах ({n} үлдсэн)' }, { n: sorted.length - limit })}<//></div>` : null}
            </div>
          </div>
        </div>`}
  </div>`;
}

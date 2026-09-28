// Project overview: what is drilled, logged, sampled, assayed — and what needs attention.
import { html, useMemo, useRef } from '../../lib.js';
import { S, holes, rows, batches, settings, assayValues } from '../../core/store.js';
import { projectIntercepts, criteriaText } from '../../core/intercepts.js';
import { validateAll, summarize, ruleName } from '../../core/validate.js';
import { coverage } from '../../core/intervals.js';
import { isNum, fmt, timeAgo, sum } from '../../core/util.js';
import { userName } from '../../core/cloud.js';
import { tr, t } from '../../i18n.js';
import { Icon } from '../icons.js';
import { useStore, Stat, PageHead, Button, Pill, Meter, navigate, injectCSS, useSize } from '../kit.js';
import { holeStats, newHoleDialog } from './holes.js';

injectCSS(
  'dash',
  `
.dash { display: grid; gap: 14px; }
.dash-cols { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 14px; }
@media (max-width: 1000px) { .dash-cols { grid-template-columns: minmax(0, 1fr); } }
.act-list { display: flex; flex-direction: column; }
.act-item { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; padding: 9px 14px; border-bottom: 1px solid var(--line); font-size: 13px; align-items: start; }
.act-item:last-child { border-bottom: 0; }
.act-item .ico { color: var(--muted); margin-top: 2px; }
.quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; }
.chart-box { width: 100%; height: 190px; }
.rule-row { display: grid; grid-template-columns: 1fr auto; gap: 8px; padding: 7px 14px; border-bottom: 1px solid var(--line); font-size: 13px; cursor: pointer; }
.rule-row:hover { background: var(--surface-2); }
.rule-row:last-child { border-bottom: 0; }
`,
);

function MonthlyChart({ data }) {
  const ref = useRef();
  const { w } = useSize(ref);
  const H = 190;
  const pad = { l: 44, r: 10, t: 12, b: 26 };
  const W = Math.max(w, 240);
  const max = Math.max(1, ...data.map((d) => d.m));
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const bw = (W - pad.l - pad.r) / Math.max(1, data.length);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return html`<div class="chart-box" ref=${ref}>
    ${w
      ? html`<svg width=${W} height=${H} role="img" aria-label=${tr({ en: 'Metres drilled per month', mn: 'Сард өрөмдсөн метр' })}>
          ${ticks.map((v) => html`<g><line x1=${pad.l} x2=${W - pad.r} y1=${y(v)} y2=${y(v)} stroke="var(--line)" stroke-width="1" />
            <text x=${pad.l - 6} y=${y(v) + 4} text-anchor="end" font-size="11" fill="var(--muted)">${fmt(v, 0)}</text></g>`)}
          ${data.map((d, i) => {
            const x = pad.l + i * bw + bw * 0.18;
            const bwi = bw * 0.64;
            return html`<g>
              <rect x=${x} y=${y(d.m)} width=${bwi} height=${Math.max(0, y(0) - y(d.m))} rx="3" fill=${i === data.length - 1 ? 'var(--brass)' : 'var(--accent)'}><title>${d.label}: ${fmt(d.m, 1)} m</title></rect>
              ${d.m > 0 && bw > 34 ? html`<text x=${x + bwi / 2} y=${y(d.m) - 4} text-anchor="middle" font-size="10.5" fill="var(--ink-2)">${fmt(d.m, 0)}</text>` : null}
              <text x=${x + bwi / 2} y=${H - 8} text-anchor="middle" font-size="11" fill="var(--muted)">${bw > 26 || i % 2 === 0 ? d.short : ''}</text>
            </g>`;
          })}
        </svg>`
      : null}
  </div>`;
}

function niceStep(x) {
  const p = 10 ** Math.floor(Math.log10(Math.max(x, 1e-9)));
  const f = x / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

function monthly(list) {
  const done = list.filter((c) => isNum(c.eoh) && (c.endDate || c.startDate));
  if (!done.length) return [];
  const byMonth = new Map();
  for (const c of done) {
    const d = (c.endDate || c.startDate).slice(0, 7);
    byMonth.set(d, (byMonth.get(d) || 0) + c.eoh);
  }
  const keys = [...byMonth.keys()].sort();
  const [y0, m0] = keys[0].split('-').map(Number);
  const [y1, m1] = keys[keys.length - 1].split('-').map(Number);
  const out = [];
  let y = y0;
  let m = m0;
  const names = S.lang === 'mn' ? ['1-р', '2-р', '3-р', '4-р', '5-р', '6-р', '7-р', '8-р', '9-р', '10-р', '11-р', '12-р'] : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  while (y < y1 || (y === y1 && m <= m1)) {
    const k = `${y}-${String(m).padStart(2, '0')}`;
    out.push({ key: k, m: byMonth.get(k) || 0, short: names[m - 1], label: `${y} ${names[m - 1]}` });
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out.slice(-18);
}

export function DashboardView() {
  useStore();
  const all = holes();
  const st = settings();
  const data = useMemo(() => {
    const drilled = sum(all.filter((c) => c.status !== 'PLN'), (c) => c.eoh);
    const logged = sum(all, (c) => coverage(rows('lith', c.holeId)));
    const smp = rows('samples');
    const prim = smp.filter((s) => s.sampleType === 'PRIM');
    const qc = smp.filter((s) => s.sampleType && s.sampleType !== 'PRIM' && s.sampleType !== 'PETRO');
    const assayed = prim.filter((s) => S.ctx.sampleStatus(s) === 'assayed').length;
    const byStatus = {};
    for (const c of all) byStatus[c.status || '—'] = (byStatus[c.status || '—'] || 0) + 1;
    const issues = summarize(validateAll());
    return { drilled, logged, prim, qc, assayed, byStatus, issues, months: monthly(all) };
  }, [S.rev]);
  const recent = batches().slice(0, 8);
  const best = useMemo(() => {
    try {
      const p = settings().intercepts;
      const res = projectIntercepts({ holeIds: all.map((h) => h.holeId), samplesOf: (h) => rows('samples', h), assay: assayValues }, p);
      return { rows: [...res.rows].sort((a, b) => (b.gradeXm || 0) - (a.gradeXm || 0)).slice(0, 6), criteria: criteriaText(p) };
    } catch (e) {
      console.warn(e);
      return { rows: [], criteria: '' };
    }
  }, [S.rev]);
  const topRules = [...data.issues.byRule.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const active = all.filter((c) => c.status === 'ACT' || c.locked);

  return html`<div class="dash">
    <${PageHead} title=${S.project?.name || t('dashboard')} sub=${`${st.crs || ''}${st.epsg ? ` · EPSG:${st.epsg}` : ''}`}>
      <${Button} icon="plus" disabled=${!!S.readOnly} onClick=${newHoleDialog}>${tr({ en: 'New hole', mn: 'Шинэ цооног' })}<//>
      <${Button} icon="upload" kind="primary" onClick=${() => navigate('#/import')}>${t('import')}<//>
    <//>
    <div class="stats">
      <${Stat} label=${t('holes')} value=${all.length} sub=${[['CMP', { en: 'done', mn: 'дууссан' }], ['ACT', { en: 'drilling', mn: 'өрөмдөж буй' }], ['PLN', { en: 'planned', mn: 'төлөвлөсөн' }]].filter(([k]) => data.byStatus[k]).map(([k, l]) => `${data.byStatus[k]} ${tr(l)}`).join(' · ')} />
      <${Stat} label=${tr({ en: 'Metres drilled', mn: 'Өрөмдсөн метр' })} value=${fmt(data.drilled, 0)} unit="m" />
      <${Stat} label=${tr({ en: 'Metres logged', mn: 'Логдсон метр' })} value=${fmt(data.logged, 0)} unit="m" sub=${data.drilled ? `${Math.round((100 * data.logged) / data.drilled)} % ${tr({ en: 'of drilled', mn: 'өрөмдсөнөөс' })}` : ''} />
      <${Stat} label=${tr({ en: 'Primary samples', mn: 'Үндсэн дээж' })} value=${data.prim.length} sub=${data.prim.length ? `${Math.round((100 * data.assayed) / data.prim.length)} % ${tr({ en: 'assayed', mn: 'шинжлэгдсэн' })} · ${data.qc.length} QC` : ''} />
      <${Stat}
        label=${t('validation')}
        value=${data.issues.error}
        unit=${tr({ en: 'errors', mn: 'алдаа' })}
        kind=${data.issues.error ? 'err' : 'ok'}
        sub=${`${data.issues.warn} ${tr({ en: 'warnings', mn: 'анхааруулга' })} · ${data.issues.info} ${tr({ en: 'notes', mn: 'тэмдэглэл' })}`}
      />
    </div>

    <div class="dash-cols">
      <div class="stack">
        <section class="card">
          <header><h2>${tr({ en: 'Metres drilled by month', mn: 'Сар бүр өрөмдсөн метр' })}</h2><span class="muted">${tr({ en: 'by end date', mn: 'дууссан огноогоор' })}</span></header>
          <div class="body">${data.months.length ? html`<${MonthlyChart} data=${data.months} />` : html`<p class="muted">${tr({ en: 'Add start/end dates to holes to see drilling progress.', mn: 'Явцыг харахын тулд цооногийн эхэлсэн/дууссан огноог оруулна уу.' })}</p>`}</div>
        </section>
        <section class="card">
          <header>
            <h2>${tr({ en: 'Logging progress', mn: 'Логлолтын явц' })}</h2>
            <a href="#/holes">${tr({ en: 'All holes', mn: 'Бүх цооног' })} →</a>
          </header>
          <div class="scroll-x">
            <table class="tbl">
              <thead><tr><th>${t('hole')}</th><th class="num">EOH</th><th>${tr({ en: 'Lithology', mn: 'Литологи' })}</th><th>${tr({ en: 'Sampled', mn: 'Дээж' })}</th><th>${tr({ en: 'Assayed', mn: 'Шинжлэгдсэн' })}</th></tr></thead>
              <tbody>
                ${(active.length ? active.concat(all.filter((c) => !active.includes(c))) : all).slice(0, 8).map((c) => {
                  const s = holeStats(c);
                  return html`<tr class="click" onClick=${() => navigate('#/hole/' + encodeURIComponent(c.holeId))}>
                    <td><b class="mono">${c.holeId}</b> ${c.status === 'ACT' ? html`<${Pill} kind="warn">${tr({ en: 'drilling', mn: 'өрөмдөж буй' })}<//>` : null} ${c.locked ? html`<${Icon} name="lock" size=${12} />` : null}</td>
                    <td class="num">${isNum(c.eoh) ? fmt(c.eoh, 1) : '—'}</td>
                    <td style="min-width:120px"><${Meter} value=${s.pct(s.lith)} kind=${s.pct(s.lith) > 99.5 ? 'ok' : ''} /></td>
                    <td style="min-width:120px"><${Meter} value=${s.pct(s.sampled)} /></td>
                    <td style="min-width:120px"><${Meter} value=${s.nSamples ? (100 * s.assayed) / s.nSamples : 0} kind=${s.nSamples && s.assayed === s.nSamples ? 'ok' : ''} /></td>
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <div class="stack">
        ${best.rows.length
          ? html`<section class="card">
              <header><h2>${tr({ en: 'Best intercepts', mn: 'Шилдэг интерсептүүд' })}</h2><a href="#/intercepts">${t('intercepts')} →</a></header>
              <div class="act-list">
                ${best.rows.map(
                  (r) => html`<div class="act-item" style="cursor:pointer" onClick=${() => navigate('#/hole/' + encodeURIComponent(r.holeId))}>
                    <${Icon} name="target" size=${16} />
                    <div><b class="mono">${r.holeId}</b> <span>${r.text}</span></div>
                    <span class="pill brass num">${fmt(r.gradeXm, 1)}</span>
                  </div>`,
                )}
              </div>
              <div class="body muted" style="font-size:12px;padding-top:6px">${best.criteria}</div>
            </section>`
          : null}
        <section class="card">
          <header><h2>${tr({ en: 'Needs attention', mn: 'Анхаарах зүйлс' })}</h2><a href="#/validation">${t('validation')} →</a></header>
          ${topRules.length
            ? topRules.map(
                ([r, n]) => html`<div class="rule-row" onClick=${() => navigate('#/validation')}>
                  <span>${ruleName(r)}</span><span class="badge">${n}</span>
                </div>`,
              )
            : html`<div class="body muted">${tr({ en: 'No validation issues. ', mn: 'Шалгалтын асуудал алга. ' })}</div>`}
        </section>
        <section class="card">
          <header><h2>${tr({ en: 'Recent changes', mn: 'Сүүлийн өөрчлөлтүүд' })}</h2><a href="#/history">${t('history')} →</a></header>
          <div class="act-list">
            ${recent.map(
              (b) => html`<div class="act-item">
                <${Icon} name=${b.ops.d && !b.ops.c ? 'trash' : b.label.startsWith('Import') ? 'upload' : b.label.startsWith('Undo') ? 'undo' : 'edit'} size=${16} />
                <div><div>${b.label || '—'}</div><div class="muted" style="font-size:12px">${userName(b.u)} · ${b.n} ${tr({ en: 'changes', mn: 'өөрчлөлт' })}</div></div>
                <span class="muted" style="font-size:12px">${timeAgo(b.t, S.lang)}</span>
              </div>`,
            )}
          </div>
        </section>
        <section class="card">
          <header><h2>${tr({ en: 'Why ORD', mn: 'Яагаад ORD' })}</h2></header>
          <div class="body stack">
            <p class="muted">${tr({ en: 'Dry-run imports, undo for everything, live validation, QA/QC, intercepts, strip logs and 3D in one place — and it works offline.', mn: 'Импортын урьдчилсан шалгалт, бүх зүйлийг буцаах, шууд шалгалт, QA/QC, интерсепт, баганан лог, 3D нэг дор — интернетгүй ч ажиллана.' })}</p>
            <div><${Button} icon="sparkle" onClick=${() => navigate('#/compare')}>${tr({ en: 'Compare with MX Deposit', mn: 'MX Deposit-тэй харьцуулах' })}<//></div>
          </div>
        </section>
      </div>
    </div>
  </div>`;
}

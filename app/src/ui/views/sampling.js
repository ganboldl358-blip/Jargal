// Sampling & dispatch: cut a hole into sample intervals with QC inserted from
// the ticket book, send samples to the lab as numbered dispatches (with a
// submission sheet), and report significant intercepts in ASX style.
//
// Planning and intercept maths live in core/sampling.js and core/intercepts.js;
// this module only reads the store, renders, and commits one batch per action.

import { html, useState, useMemo, useRef, useEffect } from '../../lib.js';
import { S, rows, holes, hole, settings, setSettings, mutate, assayValues, elementKeys, loggedTo, codeColor } from '../../core/store.js';
import { elementLabel } from '../../core/schema.js';
import { natCmp, round, fmt, fix, isNum, todayISO, toNum, escapeHtml } from '../../core/util.js';
import { toCSV } from '../../core/csv.js';
import { tr, t } from '../../i18n.js';
import { Icon } from '../icons.js';
import { useStore, openModal, confirmDialog, toast, saveFile, Button, IconButton, Select, Field, Tabs, Pill, Empty, Stat, PageHead, Meter, injectCSS, usePref, navigate } from '../kit.js';
import { track, doneToast } from '../undo.js';
import {
  planSamples,
  nextFreeId,
  sampleSeries,
  parseSampleId,
  idLetters,
  sampleTicketRows,
  ticketTotals,
  nextDispatchId,
  dispatchPrefixOf,
  dispatchStatus,
  crmRotationList,
  qcSlots,
  formatSampleId,
} from '../../core/sampling.js';
import { projectIntercepts, normParams, gradeUnit, gxmUnit, elementSymbol, criteriaText } from '../../core/intercepts.js';

const TAB_KEYS = ['generate', 'dispatch', 'intercepts'];
const DUP_TYPES = ['FDUP', 'CDUP', 'PDUP'];
const TYPE_KIND = { PRIM: '', CRM: 'brass', BLK: 'info', FDUP: 'accent', CDUP: 'accent', PDUP: 'accent' };
const ROW_CAP = 800;

const isPrim = (s) => !s.sampleType || s.sampleType === 'PRIM';
const readOnly = () => !!S.readOnly;
const holeHref = (id) => '#/hole/' + encodeURIComponent(id);

function hashQuery() {
  try {
    return Object.fromEntries(new URLSearchParams(location.hash.split('?')[1] || ''));
  } catch {
    return {};
  }
}

/** Every sample ID the project knows: sample rows and assay rows (orphans too). */
function projectIds() {
  const set = new Set();
  for (const s of rows('samples')) if (s.sampleId !== null && s.sampleId !== undefined) set.add(String(s.sampleId));
  for (const a of rows('assays')) if (a.sampleId !== null && a.sampleId !== undefined) set.add(String(a.sampleId));
  return set;
}

const newest = (a, b) => ((b._t ?? 0) > (a._t ?? 0) || ((b._t ?? 0) === (a._t ?? 0) && natCmp(b.sampleId, a.sampleId) > 0) ? b : a);

/** Default start ID: continue the series of this hole, else of the latest sample, else invent one. */
function defaultStartId(holeId, ids) {
  const usable = (list) => list.filter((s) => parseSampleId(s.sampleId));
  const own = usable(rows('samples', holeId));
  const all = own.length ? own : usable(rows('samples'));
  if (all.length) return nextFreeId(ids, all.reduce(newest).sampleId);
  const series = sampleSeries([...ids])[0];
  if (series) return series.nextId;
  return `${idLetters(holeId) || 'S'}${todayISO().slice(2, 4)}0001`;
}

function rangeDefaults(holeId) {
  const h = hole(holeId);
  let last = 0;
  for (const s of rows('samples', holeId)) if (isPrim(s) && isNum(s.to) && s.to > last) last = s.to;
  const end = [h?.eoh, loggedTo(holeId), h?.plannedDepth].find((v) => isNum(v) && v > 0);
  return { from: String(round(last, 2)), to: isNum(end) ? String(round(end, 2)) : '', sampledTo: last, end: end ?? null };
}

function inkOn(hex) {
  const m = String(hex || '').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return '#142120';
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#142120' : '#ffffff';
}

function TypePill({ type }) {
  const tp = type || 'PRIM';
  return tp === 'PRIM' ? html`<span class="mono muted">PRIM</span>` : html`<${Pill} kind=${TYPE_KIND[tp] ?? ''}>${tp}<//>`;
}

function Issues({ list }) {
  if (!list.length) return null;
  return html`<div class="smp-issues">
    ${list.map(
      (m) => html`<div class=${'issue ' + (m.level === 'info' ? 'info' : m.level === 'warn' ? 'warn' : 'error')}>
        <${Icon} name=${m.level === 'info' ? 'info' : 'alert'} size=${16} />
        <span>${tr(m.msg, m.params)}</span>
      </div>`,
    )}
  </div>`;
}

function Check({ checked, onChange, children, disabled }) {
  return html`<label class="check"><input type="checkbox" checked=${!!checked} disabled=${disabled} onChange=${(e) => onChange(e.target.checked)} /> <span>${children}</span></label>`;
}

// =================================================================== view

export function SamplingView({ params = {} } = {}) {
  injectCSS('ord-sampling', CSS);
  const rev = useStore();
  const q = useMemo(hashQuery, []);
  const [pref, setPref] = usePref('sampling.tab', 'generate');
  const want = params.tab || q.tab;
  const [tab, setTabState] = useState(TAB_KEYS.includes(want) ? want : TAB_KEYS.includes(pref) ? pref : 'generate');
  const setTab = (k) => {
    setTabState(k);
    setPref(k);
  };
  // the router ignores ?query, so follow #/sampling?tab=… links ourselves
  useEffect(() => {
    const f = () => {
      const tb = hashQuery().tab;
      if (TAB_KEYS.includes(tb)) setTabState(tb);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const pending = useMemo(() => rows('samples').filter((s) => !s.dispatchId && !assayValues(s.sampleId)).length, [rev]);
  const initialHole = params.holeId || q.hole || '';

  return html`<div class="smp">
    <${PageHead}
      title=${t('sampling')}
      sub=${tr({
        en: 'Cut sample intervals with QC from the ticket book, send them to the lab, and report significant intercepts.',
        mn: 'Тасалбарын дэвтрээс QC-тэй дээжийн завсар үүсгэх, лабораторид илгээх, ач холбогдолтой интерсепт тооцох.',
      })}
    />
    <${Tabs}
      tabs=${[
        { key: 'generate', icon: 'split', label: tr({ en: 'Generate samples', mn: 'Дээж үүсгэх' }) },
        { key: 'dispatch', icon: 'truck', label: tr({ en: 'Dispatch', mn: 'Илгээлт' }), badge: pending || null },
        { key: 'intercepts', icon: 'target', label: t('intercepts') },
      ]}
      active=${tab}
      onChange=${setTab}
    />
    <div class="smp-pane">
      ${tab === 'generate' ? html`<${GeneratePanel} initialHole=${initialHole} />` : tab === 'dispatch' ? html`<${DispatchPanel} initialHole=${initialHole} />` : html`<${InterceptsPanel} />`}
    </div>
  </div>`;
}

/** Intercepts on their own page (#/intercepts). */
export function InterceptsView() {
  injectCSS('ord-sampling', CSS);
  useStore();
  return html`<div class="smp">
    <${PageHead}
      title=${tr({ en: 'Significant intercepts', mn: 'Ач холбогдолтой интерсепт' })}
      sub=${tr({
        en: 'Length-weighted composites at a cut-off with limited internal dilution — ready for an ASX release table.',
        mn: 'Cut-off агуулга, хязгаарлагдмал дотоод шингэрэлттэй урт-жигнэсэн композит — ASX мэдээний хүснэгтэд бэлэн.',
      })}
    >
      <${Button} icon="truck" onClick=${() => navigate('#/sampling')}>${t('sampling')}<//>
    <//>
    <${InterceptsPanel} />
  </div>`;
}

// ======================================================= generate samples

function GeneratePanel({ initialHole }) {
  useStore();
  const hl = holes();
  const st = settings();
  const [prefHole, setPrefHole] = usePref('sampling.hole', '');
  const [holeSel, setHoleSel] = useState(initialHole || prefHole || '');
  const holeId = hl.some((h) => h.holeId === holeSel) ? holeSel : hl[0]?.holeId || '';
  const setHole = (h) => {
    setHoleSel(h);
    setPrefHole(h);
  };
  const [qc, setQc] = useState(() => ({ ...st.qc, crmRotation: crmRotationList(st.qc).join(', ') }));
  const [opt, setOpt] = usePref('sampling.opts', { nominal: 1, maxLen: st.maxSampleLen ?? 2, minLen: st.minSampleLen ?? 0.3, breakLith: true, align: true, skip: 'CL' });
  const [startIn, setStartIn] = useState('');

  if (!hl.length) {
    return html`<${Empty} icon="holes" title=${tr({ en: 'No holes yet', mn: 'Цооног алга' })}>
      ${tr({ en: 'Add or import collars first, then generate their samples here.', mn: 'Эхлээд цооногийн амыг нэмэх эсвэл импортлоод, дараа нь энд дээж үүсгэнэ.' })}
    <//>`;
  }
  return html`<${GenerateForm}
    key=${holeId}
    holeId=${holeId}
    setHole=${setHole}
    holeList=${hl}
    qc=${qc}
    setQc=${setQc}
    opt=${opt}
    setOpt=${setOpt}
    startIn=${startIn}
    setStartIn=${setStartIn}
  />`;
}

function GenerateForm({ holeId, setHole, holeList, qc, setQc, opt, setOpt, startIn, setStartIn }) {
  const rev = useStore();
  const [defaults] = useState(() => rangeDefaults(holeId));
  const [fromS, setFromS] = useState(defaults.from);
  const [toS, setToS] = useState(defaults.to);
  const ids = useMemo(projectIds, [rev]);
  const autoStart = useMemo(() => defaultStartId(holeId, ids), [rev, holeId]);
  const startId = String(startIn || '').trim() || autoStart;
  const lithRows = rows('lith', holeId);
  const holeSamples = rows('samples', holeId);
  const from = toNum(fromS);
  const to = toNum(toS);
  const setO = (k) => (v) => setOpt((o) => ({ ...o, [k]: v }));

  const plan = useMemo(
    () =>
      planSamples({
        holeId,
        from,
        to,
        startId,
        nominal: toNum(opt.nominal),
        maxLen: toNum(opt.maxLen),
        minLen: toNum(opt.minLen) ?? 0,
        align: !!opt.align,
        breakAt: opt.breakLith ? 'lith' : 'none',
        skipCodes: String(opt.skip ?? '')
          .split(/[,\s]+/)
          .filter(Boolean),
        lithRows,
        holeSamples,
        existing: ids,
        qc,
      }),
    [rev, holeId, from, to, startId, opt, qc],
  );
  const s = plan.summary;
  const done = isNum(from) && isNum(to) && from >= to - 1e-6;
  const messages = [...plan.errors.filter((e) => !(done && e.code === 'range')).map((e) => ({ ...e, level: 'error' })), ...plan.warnings];
  const sampledTo = useMemo(() => rangeDefaults(holeId), [rev, holeId]);

  async function create() {
    if (!plan.ok || readOnly()) return;
    if (plan.overlaps?.length) {
      const ok = await confirmDialog({
        title: tr({ en: 'Overlapping samples', mn: 'Давхцсан дээж' }),
        body: tr({
          en: '{n} new samples overlap samples already in {hole}. Create them anyway?',
          mn: '{n} шинэ дээж {hole} цооногийн одоо байгаа дээжтэй давхцаж байна. Үргэлжлүүлэх үү?',
        }, { n: plan.overlaps.length, hole: holeId }),
        ok: tr({ en: 'Create anyway', mn: 'Үргэлжлүүлэх' }),
      });
      if (!ok) return;
    }
    const label = `${tr({ en: 'Generate samples', mn: 'Дээж үүсгэх' })} ${holeId} ${s.firstId}–${s.lastId}`;
    const res = mutate(
      plan.rows.map((row) => ({ type: 'upsert', table: 'samples', holeId, row })),
      { label },
    );
    track(res, label);
    doneToast(res, tr({ en: '{n} samples created: {a}–{b}', mn: '{n} дээж үүсгэлээ: {a}–{b}' }, { n: res.created, a: s.firstId, b: s.lastId }));
    setStartIn('');
    setFromS(String(round(to, 2)));
  }

  const nextFree = () => setStartIn(nextFreeId(ids, startId));

  return html`<div class="smp-gen">
    <div class="stack">
      <section class="card">
        <header><h2>${tr({ en: 'Interval', mn: 'Завсар' })}</h2></header>
        <div class="body smp-fg">
          <${Field} label=${t('hole')} wide>
            <${Select} value=${holeId} options=${holeList.map((h) => h.holeId)} onChange=${setHole} />
          <//>
          <${Field} label=${`${t('from')} (m)`}>
            <input class="inp num" type="number" step="0.01" min="0" value=${fromS} onInput=${(e) => setFromS(e.target.value)} />
          <//>
          <${Field} label=${`${t('to')} (m)`}>
            <input class="inp num" type="number" step="0.01" min="0" value=${toS} onInput=${(e) => setToS(e.target.value)} />
          <//>
          <p class="muted smp-note">
            ${tr({ en: 'Sampled to {a} m', mn: '{a} м хүртэл дээжилсэн' }, { a: fix(sampledTo.sampledTo, 2) })}${isNum(sampledTo.end)
              ? tr({ en: ' of {b} m.', mn: ' / нийт {b} м.' }, { b: fix(sampledTo.end, 2) })
              : '.'}
          </p>
          <${Field}
            label=${tr({ en: 'Start sample ID', mn: 'Эхлэх дээжийн №' })}
            hint=${startIn ? null : tr({ en: 'Next free ID in this series', mn: 'Энэ цувралын дараагийн сул дугаар' })}
            wide
          >
            <div class="smp-idrow">
              <input class="inp mono" value=${startId} spellcheck="false" onInput=${(e) => setStartIn(e.target.value)} />
              <${IconButton} icon="sparkle" title=${tr({ en: 'Next free ID for this prefix', mn: 'Энэ угтварын дараагийн сул дугаар' })} onClick=${nextFree} />
            </div>
          <//>
        </div>
      </section>

      <section class="card">
        <header><h2>${tr({ en: 'Lengths and rules', mn: 'Урт, дүрэм' })}</h2></header>
        <div class="body smp-fg">
          <${Field} label=${tr({ en: 'Target length (m)', mn: 'Зорилтот урт (м)' })}>
            <input class="inp num" type="number" step="0.1" min="0.1" value=${opt.nominal} onInput=${(e) => setO('nominal')(e.target.value)} />
          <//>
          <${Field} label=${tr({ en: 'Max length (m)', mn: 'Дээд урт (м)' })}>
            <input class="inp num" type="number" step="0.1" min="0.1" value=${opt.maxLen} onInput=${(e) => setO('maxLen')(e.target.value)} />
          <//>
          <${Field} label=${tr({ en: 'Min length (m)', mn: 'Доод урт (м)' })}>
            <input class="inp num" type="number" step="0.05" min="0" value=${opt.minLen} onInput=${(e) => setO('minLen')(e.target.value)} />
          <//>
          <${Field} label=${tr({ en: 'Skip codes', mn: 'Алгасах код' })} hint=${tr({ en: 'Lith1 codes not sampled (core loss)', mn: 'Дээжлэхгүй Lith1 код (кернгүй)' })}>
            <input class="inp mono" value=${opt.skip} onInput=${(e) => setO('skip')(e.target.value)} />
          <//>
          <div class="smp-checks">
            <${Check} checked=${opt.breakLith} onChange=${setO('breakLith')}>${tr({ en: 'Never cross a Lith1 contact', mn: 'Lith1 контактыг давахгүй' })}<//>
            <${Check} checked=${opt.align} onChange=${setO('align')}>${tr({ en: 'Align cuts to multiples of the target length', mn: 'Зүсэлтийг зорилтот уртын үржвэрт тааруулах' })}<//>
          </div>
        </div>
      </section>

      <${QcCard} qc=${qc} setQc=${setQc} startId=${startId} />
    </div>

    <section class="card smp-preview">
      <header>
        <h2>${tr({ en: 'Preview', mn: 'Урьдчилан харах' })}</h2>
        <${Button} kind="primary" icon="plus" disabled=${!plan.ok || readOnly()} onClick=${create}>
          ${s.total ? tr({ en: 'Create {n} samples', mn: '{n} дээж үүсгэх' }, { n: s.total }) : tr({ en: 'Create samples', mn: 'Дээж үүсгэх' })}
        <//>
      </header>
      <div class="body stack">
        <div class="stats">
          <${Stat} label=${tr({ en: 'Primary', mn: 'Үндсэн' })} value=${s.primary} sub=${tr({ en: '{m} m sampled', mn: '{m} м дээжилнэ' }, { m: fmt(s.metres, 2) })} />
          <${Stat} label="CRM" value=${s.crm} />
          <${Stat} label=${tr({ en: 'Blanks', mn: 'Blank' })} value=${s.blank} />
          <${Stat} label=${tr({ en: 'Duplicates', mn: 'Давхар' })} value=${s.dup} />
          <${Stat} label=${tr({ en: 'Next free ID', mn: 'Дараагийн дугаар' })} value=${html`<span class="smp-stat-id">${s.nextId || '–'}</span>`} sub=${s.firstId ? `${s.firstId} → ${s.lastId}` : null} />
        </div>
        <${Issues} list=${messages} />
        ${plan.items.length
          ? html`<div class="smp-prev">
              <${PlanTable} items=${plan.items} overlaps=${plan.overlaps || []} />
              <${PlanStrip} plan=${plan} from=${from} to=${to} lithRows=${lithRows} holeSamples=${holeSamples} />
            </div>`
          : done
            ? html`<${Empty} icon="check" title=${tr({ en: 'Sampled to {m} m', mn: '{m} м хүртэл дээжилсэн' }, { m: fix(from, 2) })}>
                ${tr({ en: 'Change the depth range or pick another hole to add more samples.', mn: 'Нэмж дээжлэх бол гүний завсраа өөрчлөх эсвэл өөр цооног сонгоно уу.' })}
              <//>`
            : html`<${Empty} icon="split" title=${tr({ en: 'Nothing to preview', mn: 'Харуулах зүйл алга' })}>
                ${tr({ en: 'Set a depth range and a start ID.', mn: 'Гүний завсар болон эхлэх дугаараа оруулна уу.' })}
              <//>`}
      </div>
    </section>
  </div>`;
}

function PlanTable({ items, overlaps }) {
  const bad = new Set(overlaps.map((o) => o.sampleId));
  const shown = items.slice(0, 1500);
  return html`<div class="tbl-wrap smp-scroll">
    <table class="tbl smp-tbl">
      <thead>
        <tr>
          <th class="num">#</th>
          <th>${tr({ en: 'Sample ID', mn: 'Дээжийн №' })}</th>
          <th>${tr({ en: 'Type', mn: 'Төрөл' })}</th>
          <th class="num">${t('from')}</th>
          <th class="num">${t('to')}</th>
          <th class="num">${tr({ en: 'Len', mn: 'Урт' })}</th>
          <th>Lith1</th>
          <th>${tr({ en: 'Standard / parent', mn: 'Стандарт / эх дээж' })}</th>
        </tr>
      </thead>
      <tbody>
        ${shown.map((it, i) => {
          const r = it.row;
          const qcRow = it.kind !== 'PRIM';
          const depthless = it.kind === 'CRM' || it.kind === 'BLK';
          return html`<tr key=${r.sampleId} class=${(qcRow ? 'qc ' + it.kind.toLowerCase() : '') + (bad.has(r.sampleId) ? ' bad' : '')}>
            <td class="num muted">${i + 1}</td>
            <td class="mono">${r.sampleId}</td>
            <td><${TypePill} type=${r.sampleType} /></td>
            ${depthless
              ? html`<td class="num muted" colspan="3" title=${tr({ en: 'Inserted after this depth', mn: 'Энэ гүний дараа оруулна' })}>@ ${fix(it.at, 2)}</td>`
              : html`<td class="num">${fix(r.from, 2)}</td>
                  <td class="num">${fix(r.to, 2)}</td>
                  <td class="num">${fix(r.to - r.from, 2)}</td>`}
            <td>${it.lith ? html`<span class="smp-lith"><span class="swatch" style=${`background:${codeColor('LITH', it.lith)};width:10px;height:10px`}></span><span class="mono">${it.lith}</span></span>` : null}</td>
            <td class="mono">${r.crm || r.parentId || ''}</td>
          </tr>`;
        })}
      </tbody>
    </table>
    ${items.length > shown.length ? html`<p class="muted smp-note">${tr({ en: '…and {n} more', mn: '…бас {n}' }, { n: items.length - shown.length })}</p>` : null}
  </div>`;
}

/** Proposed intervals against the lith log, with QC insert positions. */
function PlanStrip({ plan, from, to, lithRows, holeSamples }) {
  const span = to - from;
  if (!(span > 0) || !plan.items.length) return null;
  const k = Math.min(28, Math.max(1.2, 640 / span));
  const pad = 8;
  const H = Math.round(span * k + pad * 2);
  const W = 170;
  const y = (d) => pad + (d - from) * k;
  const step = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200].find((x) => span / x <= 14) || 500;
  const ticks = [];
  for (let d = Math.ceil(from / step - 1e-9) * step; d <= to + 1e-9; d += step) ticks.push(round(d, 3));
  const lith = lithRows.filter((r) => isNum(r.from) && isNum(r.to) && r.to > from && r.from < to);
  const old = holeSamples.filter((x) => isPrim(x) && isNum(x.from) && isNum(x.to) && x.to > from && x.from < to);
  const bad = new Set((plan.overlaps || []).map((o) => o.sampleId));
  const clip = (a, b) => [y(Math.max(a, from)), y(Math.min(b, to))];
  let alt = 0;
  return html`<div class="smp-strip">
    <svg width=${W} height=${H} viewBox=${`0 0 ${W} ${H}`} role="img" aria-label=${tr({ en: 'Proposed samples against lithology', mn: 'Литологитой харьцуулсан шинэ дээж' })}>
      ${ticks.map((d) => html`<g key=${'t' + d}><line class="ax" x1="30" x2="35" y1=${y(d)} y2=${y(d)} /><text x="28" y=${y(d) + 3} text-anchor="end">${fmt(d, 1)}</text></g>`)}
      <line class="ax" x1="35" x2="35" y1=${pad} y2=${H - pad} />
      ${lith.map((r) => {
        const [a, b] = clip(r.from, r.to);
        const c = codeColor('LITH', r.lith1);
        return html`<g key=${'l' + r.id}>
          <rect x="37" y=${a} width="32" height=${Math.max(0.6, b - a)} fill=${c}><title>${fix(r.from, 2)}–${fix(r.to, 2)} m ${r.lith1 ?? ''}</title></rect>
          ${b - a >= 11 ? html`<text class="lt" x="53" y=${(a + b) / 2 + 3} text-anchor="middle" style=${`fill:${inkOn(c)}`}>${r.lith1}</text>` : null}
        </g>`;
      })}
      ${old.map((x) => {
        const [a, b] = clip(x.from, x.to);
        return html`<rect key=${'o' + x.id} class="old" x="72" y=${a} width="5" height=${Math.max(0.6, b - a)}><title>${x.sampleId} ${fix(x.from, 2)}–${fix(x.to, 2)}</title></rect>`;
      })}
      ${plan.items.map((it) => {
        const r = it.row;
        const tip = `${r.sampleId} ${it.kind === 'PRIM' || DUP_TYPES.includes(r.sampleType) ? `${fix(r.from, 2)}–${fix(r.to, 2)} m` : r.crm || ''}`;
        if (it.kind === 'PRIM') {
          const [a, b] = clip(r.from, r.to);
          const cls = bad.has(r.sampleId) ? 'bad' : alt++ % 2 ? 's1' : 's0';
          return html`<g key=${r.sampleId}>
            <rect class=${cls} x="80" y=${a} width="46" height=${Math.max(0.6, b - a)}><title>${tip}</title></rect>
            ${b - a >= 11 ? html`<text class="sid" x="103" y=${(a + b) / 2 + 3} text-anchor="middle">${String(r.sampleId).slice(-4)}</text>` : null}
          </g>`;
        }
        if (it.kind === 'CRM') {
          const yy = y(it.at);
          return html`<path key=${r.sampleId} class="crm" d=${`M136 ${yy - 5}l5 5-5 5-5-5z`}><title>${tip}</title></path>`;
        }
        if (it.kind === 'BLK') return html`<circle key=${r.sampleId} class="blk" cx="150" cy=${y(it.at)} r="4"><title>${tip}</title></circle>`;
        return html`<rect key=${r.sampleId} class="dup" x="159" y=${y((r.from + r.to) / 2) - 4} width="8" height="8"><title>${tip}</title></rect>`;
      })}
    </svg>
    <div class="legend smp-legend">
      <span><i class="lg s0"></i>${tr({ en: 'New', mn: 'Шинэ' })}</span>
      <span><i class="lg old"></i>${tr({ en: 'Existing', mn: 'Хуучин' })}</span>
      <span><i class="lg crm"></i>CRM</span>
      <span><i class="lg blk"></i>Blank</span>
      <span><i class="lg dup"></i>Dup</span>
    </div>
  </div>`;
}

const QC_KEYS = ['crmEvery', 'blankEvery', 'blankOffset', 'dupEvery', 'dupType', 'crmRotation', 'blankCode'];

function qcToSettings(qc) {
  const n = (v) => Math.max(0, Math.floor(toNum(v) ?? 0));
  return {
    crmEvery: n(qc.crmEvery),
    blankEvery: n(qc.blankEvery),
    blankOffset: n(qc.blankOffset),
    dupEvery: n(qc.dupEvery),
    dupType: DUP_TYPES.includes(qc.dupType) ? qc.dupType : 'FDUP',
    crmRotation: crmRotationList(qc),
    blankCode: String(qc.blankCode ?? '').trim(),
  };
}

/** First ticket at or after `startId` where each QC type falls due. */
function nextSlots(startId, qc) {
  const p = parseSampleId(startId);
  if (!p) return {};
  const out = {};
  for (let n = p.num; n < p.num + 1000 && Object.keys(out).length < 3; n++) {
    const d = qcSlots(n, qc);
    for (const k of ['crm', 'blank', 'dup']) if (d[k] && !out[k]) out[k] = formatSampleId(p, n);
  }
  return out;
}

function QcCard({ qc, setQc, startId }) {
  useStore();
  const saved = qcToSettings(settings().qc);
  const cur = qcToSettings(qc);
  const dirty = QC_KEYS.some((k) => JSON.stringify(cur[k]) !== JSON.stringify(saved[k]));
  const set = (k) => (e) => setQc((q) => ({ ...q, [k]: e.target.value }));
  const nx = nextSlots(startId, cur);
  const save = () => {
    const res = setSettings({ qc: cur });
    track(res, 'QC scheme');
    toast(tr({ en: 'QC scheme saved as the project default', mn: 'QC схемийг төслийн үндсэн тохиргоо болгон хадгаллаа' }));
  };
  const reset = () => {
    const q = settings().qc;
    setQc({ ...q, crmRotation: crmRotationList(q).join(', ') });
  };
  return html`<section class="card">
    <header>
      <h2>${tr({ en: 'QC scheme', mn: 'QC схем' })}</h2>
      ${dirty ? html`<${Pill} kind="warn">${tr({ en: 'Edited', mn: 'Өөрчилсөн' })}<//>` : null}
    </header>
    <div class="body smp-fg">
      <${Field} label=${tr({ en: 'CRM every (tickets)', mn: 'CRM (тасалбар тутам)' })}>
        <input class="inp num" type="number" min="0" step="1" value=${qc.crmEvery} onInput=${set('crmEvery')} />
      <//>
      <${Field} label=${tr({ en: 'Blank every', mn: 'Blank (тутам)' })}>
        <input class="inp num" type="number" min="0" step="1" value=${qc.blankEvery} onInput=${set('blankEvery')} />
      <//>
      <${Field} label=${tr({ en: 'Blank offset', mn: 'Blank шилжилт' })}>
        <input class="inp num" type="number" min="0" step="1" value=${qc.blankOffset} onInput=${set('blankOffset')} />
      <//>
      <${Field} label=${tr({ en: 'Duplicate every', mn: 'Давхар (тутам)' })}>
        <input class="inp num" type="number" min="0" step="1" value=${qc.dupEvery} onInput=${set('dupEvery')} />
      <//>
      <${Field} label=${tr({ en: 'Duplicate type', mn: 'Давхар дээжийн төрөл' })}>
        <${Select} value=${qc.dupType || 'FDUP'} options=${DUP_TYPES} onChange=${(v) => setQc((q) => ({ ...q, dupType: v }))} />
      <//>
      <${Field} label=${tr({ en: 'Blank material', mn: 'Blank материал' })}>
        <input class="inp mono" value=${qc.blankCode ?? ''} onInput=${set('blankCode')} />
      <//>
      <${Field} label=${tr({ en: 'CRM rotation (comma-separated)', mn: 'CRM ээлж (таслалаар)' })} wide>
        <input class="inp mono" value=${qc.crmRotation ?? ''} onInput=${set('crmRotation')} />
      <//>
      <p class="muted smp-note">
        ${tr({ en: 'QC falls on fixed ticket numbers; zero turns a type off.', mn: 'QC нь тогтмол тасалбарын дугаарт оногдоно; 0 бол тухайн төрлийг унтраана.' })}
        ${nx.crm || nx.blank || nx.dup
          ? html` ${tr({ en: 'Next:', mn: 'Дараагийн:' })} ${[
              ['Blank', nx.blank],
              ['Dup', nx.dup],
              ['CRM', nx.crm],
            ]
              .filter(([, id]) => id)
              .sort((a, b) => natCmp(a[1], b[1]))
              .map(([k, id]) => `${k} ${id}`)
              .join(' · ')}`
          : null}
      </p>
      ${dirty
        ? html`<div class="row smp-checks">
            <${Button} size="sm" onClick=${reset}>${tr({ en: 'Revert', mn: 'Буцаах' })}<//>
            <${Button} size="sm" kind="primary" disabled=${readOnly()} onClick=${save}>${tr({ en: 'Save as project default', mn: 'Төслийн үндсэн болгох' })}<//>
          </div>`
        : null}
    </div>
  </section>`;
}

// ================================================================= dispatch

const STATUS = {
  draft: { kind: '', label: { en: 'Draft', mn: 'Ноорог' } },
  dispatched: { kind: 'info', label: { en: 'Dispatched', mn: 'Илгээсэн' } },
  received: { kind: 'accent', label: { en: 'Received at lab', mn: 'Лабд хүлээн авсан' } },
  partial: { kind: 'warn', label: { en: 'Partially assayed', mn: 'Хэсэгчлэн ирсэн' } },
  results: { kind: 'ok', label: { en: 'Results in', mn: 'Үр дүн ирсэн' } },
};

const isAssayed = (s) => !!assayValues(s.sampleId);

/** Dispatch rows plus batches only known from samples (e.g. imported from MX). */
function dispatchList() {
  const byBatch = new Map();
  for (const s of rows('samples')) {
    if (!s.dispatchId) continue;
    const k = String(s.dispatchId);
    if (!byBatch.has(k)) byBatch.set(k, []);
    byBatch.get(k).push(s);
  }
  const list = rows('dispatch').map((d) => ({ d, samples: byBatch.get(String(d.batchId)) || [] }));
  const known = new Set(rows('dispatch').map((d) => String(d.batchId)));
  for (const [k, smp] of byBatch) if (!known.has(k)) list.push({ d: { batchId: k, virtual: true }, samples: smp });
  for (const x of list) Object.assign(x, dispatchStatus(x.d, x.samples, isAssayed));
  // drafts (no date yet) first, then newest dispatch first
  const key = (x) => String(x.d.dispatched || '9999');
  return list.sort((a, b) => key(b).localeCompare(key(a)) || natCmp(b.d.batchId, a.d.batchId));
}

function DispatchPanel({ initialHole }) {
  const rev = useStore();
  const [fHole, setFHole] = usePref('dispatch.hole', '');
  const [fType, setFType] = usePref('dispatch.type', '');
  const [sel, setSel] = useState(() => new Set());
  const [range, setRange] = useState({ a: '', b: '' });
  const anchor = useRef(null);

  const pending = useMemo(
    () =>
      rows('samples')
        .filter((s) => !s.dispatchId && !assayValues(s.sampleId))
        .sort((a, b) => natCmp(a.sampleId, b.sampleId)),
    [rev],
  );
  const holeOpts = useMemo(() => [...new Set(pending.map((s) => s.holeId))].sort(natCmp), [pending]);
  const want = initialHole && fHole === '' ? initialHole : fHole;
  const hf = holeOpts.includes(want) ? want : '';
  const typeOpts = useMemo(() => [...new Set(pending.map((s) => s.sampleType || 'PRIM'))].sort((a, b) => Object.keys(TYPE_KIND).indexOf(a) - Object.keys(TYPE_KIND).indexOf(b)), [pending]);
  const filtered = pending.filter((s) => (!hf || s.holeId === hf) && (!fType || (s.sampleType || 'PRIM') === fType));
  const shown = filtered.slice(0, ROW_CAP);
  const selected = pending.filter((s) => sel.has(s.id));
  const selTotals = ticketTotals(sampleTicketRows(selected));
  const allOn = filtered.length > 0 && filtered.every((s) => sel.has(s.id));
  const list = useMemo(dispatchList, [rev]);

  const toggle = (s, idx, e) => {
    const on = !sel.has(s.id);
    setSel((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && anchor.current !== null && anchor.current < shown.length) {
        const [a, b] = [Math.min(anchor.current, idx), Math.max(anchor.current, idx)];
        for (let i = a; i <= b; i++) on ? next.add(shown[i].id) : next.delete(shown[i].id);
      } else if (on) next.add(s.id);
      else next.delete(s.id);
      return next;
    });
    anchor.current = idx;
  };
  const toggleAll = () => {
    setSel((prev) => {
      const next = new Set(prev);
      for (const s of filtered) allOn ? next.delete(s.id) : next.add(s.id);
      return next;
    });
  };
  const selectRange = () => {
    const a = range.a.trim();
    const b = range.b.trim() || a;
    if (!a) return;
    const [lo, hi] = natCmp(a, b) <= 0 ? [a, b] : [b, a];
    const hit = filtered.filter((s) => natCmp(s.sampleId, lo) >= 0 && natCmp(s.sampleId, hi) <= 0);
    setSel((prev) => new Set([...prev, ...hit.map((s) => s.id)]));
    toast(tr({ en: '{n} samples selected', mn: '{n} дээж сонголоо' }, { n: hit.length }), { kind: hit.length ? 'ok' : 'warn' });
  };

  async function create() {
    if (!selected.length || readOnly()) return;
    const ds = rows('dispatch');
    const last = ds.reduce((a, b) => (!a || (b._t ?? 0) > (a._t ?? 0) ? b : a), null);
    const first = selected[0];
    const prefix = dispatchPrefixOf(last?.batchId) || idLetters(first.sampleId) || idLetters(first.holeId) || 'ORD';
    const taken = new Set([...ds.map((d) => String(d.batchId)), ...list.map((x) => String(x.d.batchId))]);
    const init = {
      batchId: nextDispatchId([...taken], prefix, Number(todayISO().slice(0, 4))),
      lab: last?.lab || '',
      methods: last?.methods || 'Au-AA23, ME-ICP61',
      dispatched: todayISO(),
      dispatchedBy: S.user.name || last?.dispatchedBy || '',
      courier: '',
      notes: '',
    };
    const v = await openModal((close) => html`<${DispatchForm} init=${init} taken=${taken} totals=${selTotals} close=${close} />`, {
      title: tr({ en: 'Create dispatch', mn: 'Илгээлт үүсгэх' }),
      wide: true,
    });
    if (!v) return;
    const batchId = v.batchId.trim();
    const draft = v.mode === 'draft';
    const ops = [
      {
        type: 'upsert',
        table: 'dispatch',
        row: {
          batchId,
          lab: v.lab.trim() || null,
          methods: v.methods.trim() || null,
          dispatched: draft ? null : v.dispatched || todayISO(),
          dispatchedBy: v.dispatchedBy.trim() || null,
          courier: v.courier.trim() || null,
          notes: v.notes.trim() || null,
          status: draft ? 'draft' : 'dispatched',
        },
      },
      ...selected.map((s) => ({ type: 'upsert', table: 'samples', holeId: s.holeId, row: { id: s.id, dispatchId: batchId } })),
    ];
    const label = `Dispatch ${batchId}`;
    const res = mutate(ops, { label });
    track(res, label);
    doneToast(res, tr({ en: '{id}: {n} samples', mn: '{id}: {n} дээж' }, { id: batchId, n: selected.length }));
    setSel(new Set());
  }

  return html`<div class="stack">
    <section class="card">
      <header>
        <h2>${tr({ en: 'Samples not yet dispatched', mn: 'Илгээгдээгүй дээж' })} <span class="badge">${pending.length}</span></h2>
        <div class="row">
          <${Select} value=${hf} options=${holeOpts} placeholder=${tr({ en: 'All holes', mn: 'Бүх цооног' })} onChange=${setFHole} />
          <${Select} value=${fType} options=${typeOpts} placeholder=${tr({ en: 'All types', mn: 'Бүх төрөл' })} onChange=${setFType} />
        </div>
      </header>
      <div class="body stack">
        ${pending.length
          ? html`<div class="row smp-range">
                <span class="muted">${tr({ en: 'Select by ID', mn: 'Дугаараар сонгох' })}</span>
                <input class="inp mono" placeholder=${shown[0]?.sampleId || 'MU260001'} value=${range.a} onInput=${(e) => setRange({ ...range, a: e.target.value })} />
                <span>–</span>
                <input class="inp mono" placeholder=${shown[shown.length - 1]?.sampleId || 'MU260050'} value=${range.b} onInput=${(e) => setRange({ ...range, b: e.target.value })} />
                <${Button} size="sm" onClick=${selectRange}>${tr({ en: 'Select range', mn: 'Мужаар сонгох' })}<//>
                ${sel.size ? html`<${Button} size="sm" kind="ghost" onClick=${() => setSel(new Set())}>${tr({ en: 'Clear', mn: 'Цэвэрлэх' })}<//>` : null}
                <span class="muted smp-note">${tr({ en: 'Shift-click to select a run.', mn: 'Shift дарж олноор сонгоно.' })}</span>
              </div>
              <div class="tbl-wrap smp-scroll">
                <table class="tbl smp-tbl">
                  <thead>
                    <tr>
                      <th><input type="checkbox" checked=${allOn} onChange=${toggleAll} aria-label=${tr({ en: 'Select all', mn: 'Бүгдийг сонгох' })} /></th>
                      <th>${tr({ en: 'Sample ID', mn: 'Дээжийн №' })}</th>
                      <th>${t('hole')}</th>
                      <th class="num">${t('from')}</th>
                      <th class="num">${t('to')}</th>
                      <th>${tr({ en: 'Type', mn: 'Төрөл' })}</th>
                      <th>${tr({ en: 'Standard / parent', mn: 'Стандарт / эх дээж' })}</th>
                      <th class="num">${tr({ en: 'Weight (kg)', mn: 'Жин (кг)' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${shown.map(
                      (s, i) => html`<tr key=${s.id} class=${'click' + (sel.has(s.id) ? ' on' : '')} onClick=${(e) => e.target.tagName !== 'INPUT' && toggle(s, i, e)}>
                        <td><input type="checkbox" checked=${sel.has(s.id)} onClick=${(e) => toggle(s, i, e)} aria-label=${s.sampleId} /></td>
                        <td class="mono">${s.sampleId}</td>
                        <td>${s.holeId}</td>
                        <td class="num">${fix(s.from, 2)}</td>
                        <td class="num">${fix(s.to, 2)}</td>
                        <td><${TypePill} type=${s.sampleType} /></td>
                        <td class="mono">${s.crm || s.parentId || ''}</td>
                        <td class="num">${fmt(s.weight, 2)}</td>
                      </tr>`,
                    )}
                  </tbody>
                </table>
                ${filtered.length > shown.length
                  ? html`<p class="muted smp-note">${tr({ en: 'Showing {a} of {b} — filter or select by ID range to reach the rest.', mn: '{b}-аас {a}-г харуулж байна — шүүх эсвэл дугаарын мужаар сонгоно уу.' }, { a: shown.length, b: filtered.length })}</p>`
                  : null}
              </div>
              <div class=${'smp-selbar' + (selected.length ? ' on' : '')}>
                <strong>${tr({ en: '{n} selected', mn: '{n} сонгосон' }, { n: selected.length })}</strong>
                <span class="muted">${selTotals.types.map((x) => `${x.type} ${x.n}`).join(' · ')}</span>
                <span class="spacer"></span>
                <${Button} kind="primary" icon="truck" disabled=${!selected.length || readOnly()} onClick=${create}>${tr({ en: 'Create dispatch', mn: 'Илгээлт үүсгэх' })}<//>
              </div>`
          : html`<${Empty} icon="check" title=${tr({ en: 'Everything is dispatched', mn: 'Бүх дээж илгээгдсэн' })}>
              ${tr({ en: 'Generate samples first, or all samples are already with a lab.', mn: 'Эхлээд дээж үүсгэнэ үү, эсвэл бүх дээж лабораторид очсон байна.' })}
            <//>`}
      </div>
    </section>

    <section class="card">
      <header><h2>${tr({ en: 'Dispatches', mn: 'Илгээлтүүд' })} <span class="badge">${list.length}</span></h2></header>
      ${list.length
        ? html`<div class="tbl-wrap smp-flat">
            <table class="tbl smp-tbl">
              <thead>
                <tr>
                  <th>${tr({ en: 'Dispatch no.', mn: 'Илгээлт №' })}</th>
                  <th>${tr({ en: 'Laboratory', mn: 'Лаборатори' })}</th>
                  <th>${tr({ en: 'Methods', mn: 'Арга' })}</th>
                  <th>${tr({ en: 'Dispatched', mn: 'Илгээсэн' })}</th>
                  <th class="num">${tr({ en: 'Samples', mn: 'Дээж' })}</th>
                  <th>${tr({ en: 'Lab received / job', mn: 'Лаб хүлээн авсан / ажил' })}</th>
                  <th>${tr({ en: 'Status', mn: 'Төлөв' })}</th>
                  <th>${tr({ en: 'Assayed', mn: 'Шинжлэгдсэн' })}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                ${list.map((x) => html`<${DispatchRow} key=${x.d.id || x.d.batchId} x=${x} />`)}
              </tbody>
            </table>
          </div>`
        : html`<${Empty} icon="truck" title=${tr({ en: 'No dispatches yet', mn: 'Илгээлт алга' })}>
            ${tr({ en: 'Select samples above and create the first dispatch.', mn: 'Дээрээс дээж сонгоод анхны илгээлтээ үүсгэнэ үү.' })}
          <//>`}
    </section>
  </div>`;
}

function DispatchRow({ x }) {
  const { d, samples, status, n, assayed } = x;
  const st = STATUS[status];
  const types = ticketTotals(sampleTicketRows(samples)).types.map((y) => `${y.type} ${y.n}`).join(' · ');
  const ro = readOnly();
  return html`<tr>
    <td class="mono"><strong>${d.batchId}</strong>${d.virtual ? html` <${Pill} title=${tr({ en: 'Only referenced by samples', mn: 'Зөвхөн дээжид бичигдсэн' })}>${tr({ en: 'unregistered', mn: 'бүртгэлгүй' })}<//>` : null}</td>
    <td>${d.lab || ''}</td>
    <td class="smp-methods">${d.methods || ''}</td>
    <td>${d.dispatched || ''}${d.dispatchedBy ? html`<div class="muted smp-sub">${d.dispatchedBy}</div>` : null}</td>
    <td class="num" title=${types}>${n}</td>
    <td>${d.received || ''}${d.labJob ? html`<div class="muted smp-sub mono">${d.labJob}</div>` : null}</td>
    <td><${Pill} kind=${st.kind}>${tr(st.label)}<//></td>
    <td class="smp-meter"><${Meter} value=${assayed} max=${n || 1} kind=${status === 'results' ? 'ok' : ''} /><small class="muted">${assayed}/${n}</small></td>
    <td class="smp-acts">
      ${status === 'draft' && !d.virtual
        ? html`<${Button} size="sm" disabled=${ro} onClick=${() => markDispatched(d)}>${tr({ en: 'Dispatch', mn: 'Илгээх' })}<//>`
        : null}
      ${!d.received && status !== 'draft' && status !== 'results'
        ? html`<${Button} size="sm" disabled=${ro} onClick=${() => markReceived(d)}>${tr({ en: 'Received', mn: 'Хүлээн авсан' })}<//>`
        : null}
      <${IconButton} icon="file" title=${tr({ en: 'Submission sheet', mn: 'Илгээлтийн хуудас' })} onClick=${() => openSheet(d)} />
      ${!assayed && !d.virtual ? html`<${IconButton} icon="trash" title=${tr({ en: 'Cancel dispatch', mn: 'Илгээлтийг цуцлах' })} disabled=${ro} onClick=${() => cancelDispatch(d, samples)} />` : null}
    </td>
  </tr>`;
}

function saveDispatch(d, patch, label) {
  const row = d.id ? { id: d.id, ...patch } : { batchId: d.batchId, ...patch };
  const res = mutate([{ type: 'upsert', table: 'dispatch', row }], { label });
  track(res, label);
  return res;
}

async function markDispatched(d) {
  const v = await openModal((close) => html`<${DateJobForm} close=${close} />`, { title: `${tr({ en: 'Dispatch', mn: 'Илгээх' })} ${d.batchId}` });
  if (!v) return;
  const res = saveDispatch(d, { dispatched: v.date, status: 'dispatched' }, `Dispatched ${d.batchId}`);
  doneToast(res, tr({ en: '{id} dispatched', mn: '{id} илгээгдлээ' }, { id: d.batchId }));
}

async function markReceived(d) {
  const v = await openModal((close) => html`<${DateJobForm} withJob job=${d.labJob || ''} close=${close} />`, {
    title: `${tr({ en: 'Received at lab', mn: 'Лабд хүлээн авсан' })} — ${d.batchId}`,
  });
  if (!v) return;
  const res = saveDispatch(d, { received: v.date, labJob: v.job || null, status: 'received' }, `Lab received ${d.batchId}`);
  doneToast(res, tr({ en: '{id} marked received', mn: '{id} хүлээн авсан гэж тэмдэглэлээ' }, { id: d.batchId }));
}

async function cancelDispatch(d, samples) {
  const ok = await confirmDialog({
    title: tr({ en: 'Cancel dispatch {id}?', mn: '{id} илгээлтийг цуцлах уу?' }, { id: d.batchId }),
    body: tr({ en: 'The dispatch is removed and its {n} samples return to the undispatched list.', mn: 'Илгээлт устаж, түүний {n} дээж илгээгдээгүй жагсаалтад буцна.' }, { n: samples.length }),
    ok: tr({ en: 'Cancel dispatch', mn: 'Цуцлах' }),
    danger: true,
  });
  if (!ok) return;
  const label = `Cancel dispatch ${d.batchId}`;
  const res = mutate(
    [{ type: 'delete', table: 'dispatch', id: d.id }, ...samples.map((s) => ({ type: 'upsert', table: 'samples', holeId: s.holeId, row: { id: s.id, dispatchId: null } }))],
    { label },
  );
  track(res, label);
  doneToast(res, tr({ en: '{id} cancelled', mn: '{id} цуцлагдлаа' }, { id: d.batchId }));
}

function DispatchForm({ init, taken, totals, close }) {
  const [v, setV] = useState(init);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const id = v.batchId.trim();
  const dupId = taken.has(id);
  const valid = !!id && !dupId;
  return html`<form
    onSubmit=${(e) => {
      e.preventDefault();
      if (valid) close({ ...v, mode: 'dispatched' });
    }}
  >
    <div class="dlg-body">
      <p class="muted">
        ${tr({ en: '{n} samples', mn: '{n} дээж' }, { n: totals.n })} — ${totals.types.map((x) => `${x.type} ${x.n}`).join(' · ')}${totals.metres ? ` · ${fmt(totals.metres, 2)} m` : ''}
      </p>
      <div class="form-grid">
        <${Field} label=${tr({ en: 'Dispatch no.', mn: 'Илгээлт №' })} hint=${dupId ? tr({ en: 'Already used', mn: 'Аль хэдийн ашиглагдсан' }) : null}>
          <input class=${'inp mono' + (dupId ? ' smp-bad' : '')} value=${v.batchId} onInput=${set('batchId')} autofocus />
        <//>
        <${Field} label=${tr({ en: 'Laboratory', mn: 'Лаборатори' })}>
          <input class="inp" value=${v.lab} placeholder="ALS Ulaanbaatar" onInput=${set('lab')} />
        <//>
        <${Field} label=${tr({ en: 'Date dispatched', mn: 'Илгээсэн огноо' })}>
          <input class="inp" type="date" value=${v.dispatched} onInput=${set('dispatched')} />
        <//>
        <${Field} label=${tr({ en: 'Dispatched by', mn: 'Илгээсэн' })}>
          <input class="inp" value=${v.dispatchedBy} onInput=${set('dispatchedBy')} />
        <//>
        <${Field} label=${tr({ en: 'Methods requested', mn: 'Шинжилгээний арга' })} wide>
          <input class="inp mono" value=${v.methods} placeholder="Au-AA23, ME-ICP61" onInput=${set('methods')} />
        <//>
        <${Field} label=${tr({ en: 'Courier / waybill', mn: 'Тээвэр / илгээмжийн №' })}>
          <input class="inp" value=${v.courier} onInput=${set('courier')} />
        <//>
        <${Field} label=${tr({ en: 'Notes', mn: 'Тэмдэглэл' })} wide>
          <textarea class="inp" rows="2" value=${v.notes} onInput=${set('notes')}></textarea>
        <//>
      </div>
    </div>
    <div class="dlg-actions">
      <${Button} onClick=${() => close()}>${t('cancel')}<//>
      <${Button} disabled=${!valid} onClick=${() => valid && close({ ...v, mode: 'draft' })}>${tr({ en: 'Save as draft', mn: 'Ноорог хадгалах' })}<//>
      <${Button} kind="primary" type="submit" icon="truck" disabled=${!valid}>${tr({ en: 'Create dispatch', mn: 'Илгээлт үүсгэх' })}<//>
    </div>
  </form>`;
}

function DateJobForm({ withJob = false, job = '', close }) {
  const [date, setDate] = useState(todayISO());
  const [j, setJ] = useState(job);
  return html`<form
    onSubmit=${(e) => {
      e.preventDefault();
      if (date) close({ date, job: j.trim() });
    }}
  >
    <div class="dlg-body">
      <div class="form-grid">
        <${Field} label=${tr({ en: 'Date', mn: 'Огноо' })}>
          <input class="inp" type="date" value=${date} onInput=${(e) => setDate(e.target.value)} />
        <//>
        ${withJob
          ? html`<${Field} label=${tr({ en: 'Lab job no.', mn: 'Лабын ажлын №' })}>
              <input class="inp mono" value=${j} placeholder="UB26123456" onInput=${(e) => setJ(e.target.value)} autofocus />
            <//>`
          : null}
      </div>
    </div>
    <div class="dlg-actions">
      <${Button} onClick=${() => close()}>${t('cancel')}<//>
      <${Button} kind="primary" type="submit" disabled=${!date}>${t('save')}<//>
    </div>
  </form>`;
}

// ------------------------------------------------------- submission sheet

function sheetData(d0) {
  const d = (d0.id && rows('dispatch').find((x) => x.id === d0.id)) || rows('dispatch').find((x) => x.batchId === d0.batchId) || d0;
  const tickets = sampleTicketRows(rows('samples').filter((s) => String(s.dispatchId) === String(d.batchId)));
  return { d, tickets, totals: ticketTotals(tickets) };
}

const refStd = (r) => (r.type === 'CRM' || r.type === 'BLK' ? r.ref : '');
const refParent = (r) => (DUP_TYPES.includes(r.type) ? r.ref : '');

function sheetCSV(d, tickets) {
  return toCSV(tickets, [
    { key: 'seq', header: 'Seq' },
    { key: 'sampleId', header: 'Sample ID' },
    { key: 'holeId', header: 'Hole ID' },
    { key: 'from', header: 'From (m)' },
    { key: 'to', header: 'To (m)' },
    { key: 'type', header: 'Sample Type' },
    { header: 'Standard ID', get: refStd },
    { header: 'Parent Sample ID', get: refParent },
    { key: 'weight', header: 'Weight (kg)' },
    { header: 'Dispatch', get: () => d.batchId },
    { header: 'Methods', get: () => d.methods || '' },
  ]);
}

function sheetHTML(d, tickets, totals) {
  const e = escapeHtml;
  const cell = (v) => `<td>${e(v ?? '')}</td>`;
  const num = (v, dp = 2) => `<td class="n">${isNum(v) ? v.toFixed(dp) : ''}</td>`;
  const head = [
    ['Dispatch no.', d.batchId],
    ['Laboratory', d.lab],
    ['Methods requested', d.methods],
    ['Date dispatched', d.dispatched],
    ['Dispatched by', d.dispatchedBy],
    ['Courier / waybill', d.courier],
    ['Lab job no.', d.labJob],
    ['Notes', d.notes],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><th>${e(k)}</th><td>${e(v)}</td></tr>`)
    .join('');
  const body = tickets
    .map((r) => `<tr>${num(r.seq, 0)}<td class="m">${e(r.sampleId)}</td>${cell(r.holeId)}${num(r.from)}${num(r.to)}${cell(r.type)}${cell(refStd(r))}${cell(refParent(r))}${num(r.weight)}</tr>`)
    .join('');
  const tot = totals.types.map((x) => `<tr><td>${e(x.type)}</td><td class="n">${x.n}</td><td class="n">${x.weighed ? x.weight.toFixed(2) : ''}</td></tr>`).join('');
  const sign = ['Dispatched by (site)', 'Courier / transport', 'Received by (laboratory)']
    .map((k, i) => `<div class="sg"><h3>${e(k)}</h3><p>Name: <span>${i === 0 ? e(d.dispatchedBy || '') : ''}</span></p><p>Signature: <span></span></p><p>Date / time: <span>${i === 0 ? e(d.dispatched || '') : ''}</span></p></div>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sample submission ${e(d.batchId)}</title>
<style>
body{font:12px/1.4 system-ui,'Segoe UI',sans-serif;color:#142120;margin:24px;background:#fff}
h1{font-size:18px;margin:0 0 12px}h2{font-size:14px;margin:18px 0 6px}h3{font-size:12px;margin:0 0 8px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #c3d0cc;padding:3px 6px;text-align:left}
th{background:#edf2f0}.n{text-align:right;font-variant-numeric:tabular-nums}.m{font-family:ui-monospace,Consolas,monospace}
.meta{width:auto;min-width:50%}.meta th{width:170px}.tot{width:auto;min-width:260px}
.signs{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:10px}
.sg{border:1px solid #c3d0cc;padding:10px}.sg p{margin:14px 0 0;display:flex;gap:6px}.sg span{flex:1;border-bottom:1px solid #394a48;min-height:14px}
@media print{body{margin:10mm}thead{display:table-header-group}tr{break-inside:avoid}}
</style></head><body>
<h1>Sample submission — ${e(d.batchId)}</h1>
<table class="meta">${head}</table>
<h2>Samples (${totals.n})</h2>
<table><thead><tr><th class="n">#</th><th>Sample ID</th><th>Hole</th><th class="n">From</th><th class="n">To</th><th>Type</th><th>Standard / blank</th><th>Parent</th><th class="n">Weight (kg)</th></tr></thead><tbody>${body}</tbody></table>
<h2>Totals by type</h2>
<table class="tot"><thead><tr><th>Type</th><th class="n">Samples</th><th class="n">Weight (kg)</th></tr></thead><tbody>${tot}<tr><th>Total</th><th class="n">${totals.n}</th><th class="n">${totals.weight ? totals.weight.toFixed(2) : ''}</th></tr></tbody></table>
<h2>Chain of custody</h2>
<div class="signs">${sign}</div>
</body></html>`;
}

function openSheet(d) {
  openModal((close) => html`<${SubmissionSheet} d0=${d} close=${close} />`, { title: `${tr({ en: 'Submission sheet', mn: 'Илгээлтийн хуудас' })} — ${d.batchId}`, full: true });
}

function SubmissionSheet({ d0, close }) {
  useStore();
  const { d, tickets, totals } = sheetData(d0);
  const meta = [
    [tr({ en: 'Laboratory', mn: 'Лаборатори' }), d.lab],
    [tr({ en: 'Methods requested', mn: 'Шинжилгээний арга' }), d.methods],
    [tr({ en: 'Dispatched', mn: 'Илгээсэн' }), [d.dispatched, d.dispatchedBy].filter(Boolean).join(' · ')],
    [tr({ en: 'Courier / waybill', mn: 'Тээвэр / илгээмж' }), d.courier],
    [tr({ en: 'Lab received / job', mn: 'Лаб хүлээн авсан / ажил' }), [d.received, d.labJob].filter(Boolean).join(' · ')],
    [tr({ en: 'Notes', mn: 'Тэмдэглэл' }), d.notes],
  ].filter(([, v]) => v);
  const custody = [
    [tr({ en: 'Dispatched by (site)', mn: 'Илгээсэн (талбай)' }), d.dispatchedBy, d.dispatched],
    [tr({ en: 'Courier / transport', mn: 'Тээвэрлэгч' }), '', ''],
    [tr({ en: 'Received by (laboratory)', mn: 'Хүлээн авсан (лаборатори)' }), '', d.received],
  ];
  return html`
    <div class="dlg-body smp-sheet">
      <dl class="smp-meta">${meta.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
      <div class="tbl-wrap smp-scroll">
        <table class="tbl smp-tbl">
          <thead>
            <tr>
              <th class="num">#</th>
              <th>${tr({ en: 'Sample ID', mn: 'Дээжийн №' })}</th>
              <th>${t('hole')}</th>
              <th class="num">${t('from')}</th>
              <th class="num">${t('to')}</th>
              <th>${tr({ en: 'Type', mn: 'Төрөл' })}</th>
              <th>${tr({ en: 'Standard / blank', mn: 'Стандарт / blank' })}</th>
              <th>${tr({ en: 'Parent', mn: 'Эх дээж' })}</th>
              <th class="num">${tr({ en: 'Weight (kg)', mn: 'Жин (кг)' })}</th>
            </tr>
          </thead>
          <tbody>
            ${tickets.map(
              (r) => html`<tr key=${r.sampleId}>
                <td class="num muted">${r.seq}</td>
                <td class="mono">${r.sampleId}</td>
                <td>${r.holeId}</td>
                <td class="num">${fix(r.from, 2)}</td>
                <td class="num">${fix(r.to, 2)}</td>
                <td><${TypePill} type=${r.type} /></td>
                <td class="mono">${refStd(r)}</td>
                <td class="mono">${refParent(r)}</td>
                <td class="num">${fmt(r.weight, 2)}</td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
      <div class="smp-sheet-foot">
        <table class="tbl smp-tot">
          <thead>
            <tr>
              <th>${tr({ en: 'Type', mn: 'Төрөл' })}</th>
              <th class="num">${tr({ en: 'Samples', mn: 'Дээж' })}</th>
              <th class="num">${tr({ en: 'Weight (kg)', mn: 'Жин (кг)' })}</th>
            </tr>
          </thead>
          <tbody>
            ${totals.types.map((x) => html`<tr key=${x.type}><td><${TypePill} type=${x.type} /></td><td class="num">${x.n}</td><td class="num">${x.weighed ? fmt(x.weight, 2) : ''}</td></tr>`)}
            <tr class="smp-total"><td>${tr({ en: 'Total', mn: 'Нийт' })}</td><td class="num">${totals.n}</td><td class="num">${totals.weight ? fmt(totals.weight, 2) : ''}</td></tr>
          </tbody>
        </table>
        <div class="smp-custody">
          <h3>${tr({ en: 'Chain of custody', mn: 'Дамжуулалтын бүртгэл (chain of custody)' })}</h3>
          <div class="smp-signs">
            ${custody.map(
              ([k, name, date]) => html`<div class="smp-sign">
                <strong>${k}</strong>
                <p><span>${tr({ en: 'Name', mn: 'Нэр' })}</span><i>${name || ''}</i></p>
                <p><span>${tr({ en: 'Signature', mn: 'Гарын үсэг' })}</span><i></i></p>
                <p><span>${tr({ en: 'Date / time', mn: 'Огноо / цаг' })}</span><i>${date || ''}</i></p>
              </div>`,
            )}
          </div>
        </div>
      </div>
    </div>
    <div class="dlg-actions">
      <${Button} icon="download" disabled=${!tickets.length} onClick=${() => saveFile(`${d.batchId}_submission.csv`, sheetCSV(d, tickets), 'text/csv')}>${tr({ en: 'Download CSV', mn: 'CSV татах' })}<//>
      <${Button} icon="download" disabled=${!tickets.length} onClick=${() => saveFile(`${d.batchId}_submission.html`, sheetHTML(d, tickets, totals), 'text/html')}>${tr({ en: 'Download HTML', mn: 'HTML татах' })}<//>
      <${Button} kind="primary" onClick=${() => close()}>${t('close')}<//>
    </div>
  `;
}

// =============================================================== intercepts

function toForm(p) {
  const s = (v) => (v === null || v === undefined ? '' : String(v));
  return {
    element: p.element || 'Au_ppm',
    cutoff: s(p.cutoff),
    minLen: s(p.minLen),
    maxDil: s(p.maxDil),
    incl: s(p.incl),
    inclMinLen: s(p.inclMinLen),
    minGradeThickness: s(p.minGradeThickness),
    gapPolicy: p.gapPolicy === 'break' ? 'break' : 'zero',
    secondary: Array.isArray(p.secondary) ? [...p.secondary] : [],
  };
}

function fromForm(f) {
  return {
    element: f.element,
    cutoff: toNum(f.cutoff) ?? 0,
    minLen: toNum(f.minLen) ?? 0,
    maxDil: toNum(f.maxDil) ?? 0,
    incl: toNum(f.incl),
    inclMinLen: toNum(f.inclMinLen),
    minGradeThickness: toNum(f.minGradeThickness),
    gapPolicy: f.gapPolicy,
    secondary: f.secondary.filter((k) => k !== f.element),
  };
}

const SORTS = {
  holeId: (a, b) => natCmp(a.holeId, b.holeId) || a.from - b.from,
  from: (a, b) => a.from - b.from || natCmp(a.holeId, b.holeId),
  length: (a, b) => a.length - b.length,
  grade: (a, b) => a.grade - b.grade,
  gradeXm: (a, b) => a.gradeXm - b.gradeXm,
};

function InterceptsPanel() {
  const rev = useStore();
  const saved = settings().intercepts;
  const [form, setForm] = useState(() => toForm(saved));
  const [holeF, setHoleF] = usePref('icpt.hole', '');
  const [sort, setSort] = usePref('icpt.sort', { key: 'holeId', dir: 1 });
  const bdl = settings().belowDetection;
  const params = useMemo(() => normParams({ ...fromForm(form), bdl }), [form, bdl]);
  const dirty = JSON.stringify(fromForm(form)) !== JSON.stringify(fromForm(toForm(saved)));
  const els = useMemo(() => {
    const set = new Set(elementKeys('assays'));
    set.add(form.element);
    return [...set].sort(natCmp);
  }, [rev, form.element]);
  const allHoles = useMemo(() => [...new Set([...holes().map((h) => h.holeId), ...rows('samples').map((s) => s.holeId)])].filter(Boolean).sort(natCmp), [rev]);
  const holeId = allHoles.includes(holeF) ? holeF : '';
  const res = useMemo(
    () => projectIntercepts({ holeIds: holeId ? [holeId] : allHoles, samplesOf: (h) => rows('samples', h), assay: assayValues }, params),
    [rev, params, holeId, allHoles],
  );
  const cmp = SORTS[sort.key] || SORTS.holeId;
  const list = [...res.rows].sort((a, b) => sort.dir * cmp(a, b) || SORTS.holeId(a, b));
  const best = res.rows.reduce((a, b) => (!a || b.gradeXm > a.gradeXm ? b : a), null);
  const withHits = new Set(res.rows.map((r) => r.holeId)).size;
  const assayedHoles = withHits + res.nsi.length;
  const unit = gradeUnit(params.element);
  const sym = unitSym(params.element);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const text = useMemo(() => {
    const lines = [criteriaText(params), ''];
    const byHole = new Map();
    for (const r of [...res.rows].sort(SORTS.holeId)) {
      if (!byHole.has(r.holeId)) byHole.set(r.holeId, []);
      byHole.get(r.holeId).push(r);
    }
    for (const h of [...new Set([...byHole.keys(), ...res.nsi, ...res.unassayed])].sort(natCmp)) {
      if (byHole.has(h)) for (const r of byHole.get(h)) lines.push(`${h}: ${r.textFull}`);
      else if (res.nsi.includes(h)) lines.push(`${h}: NSI (no significant intercept)`);
      else lines.push(`${h}: assays pending`);
    }
    return lines.join('\n');
  }, [res, params]);

  const save = () => {
    const r = setSettings({ intercepts: fromForm(form) });
    track(r, 'Intercept parameters');
    toast(tr({ en: 'Intercept parameters saved', mn: 'Интерсептийн тохиргоог хадгаллаа' }));
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast(tr({ en: 'Copied', mn: 'Хуулсан' }));
    } catch {
      const el = document.getElementById('icpt-text');
      el?.focus();
      el?.select();
      toast(tr({ en: 'Press Ctrl+C to copy', mn: 'Ctrl+C дарж хуулна уу' }), { kind: 'info' });
    }
  };
  const exportCSV = () => {
    const out = [];
    for (const r of [...res.rows].sort(SORTS.holeId)) {
      out.push({ ...r, kind: 'Intercept' });
      for (const x of r.incl) out.push({ ...x, holeId: r.holeId, kind: 'Including' });
    }
    const cols = [
      { key: 'holeId', header: 'Hole ID' },
      { key: 'kind', header: 'Type' },
      { header: 'From (m)', get: (r) => round(r.from, 2) },
      { header: 'To (m)', get: (r) => round(r.to, 2) },
      { header: 'Length (m)', get: (r) => round(r.length, 2) },
      { header: `${params.element}`, get: (r) => round(r.grade, 4) },
      { header: `${gxmUnit(params.element)} ${sym}`, get: (r) => round(r.gradeXm, 3) },
      ...params.secondary.map((k) => ({ header: k, get: (r) => (isNum(r.secondary?.[k]) ? round(r.secondary[k], 4) : '') })),
      { header: 'Cut-off', get: (r) => r.cutoff },
      { key: 'n', header: 'Samples' },
      { key: 'dilution', header: 'Internal dilution (m)' },
      { key: 'gapLen', header: 'Unsampled (m)' },
      { header: 'Text', get: (r) => r.textFull },
    ];
    saveFile(`intercepts_${params.element}_${params.cutoff}.csv`, toCSV(out, cols), 'text/csv');
  };
  const th = (key, label, cls = '') => html`<th
    class=${'sort ' + cls}
    aria-sort=${sort.key === key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
    onClick=${() => setSort(sort.key === key ? { key, dir: -sort.dir } : { key, dir: key === 'holeId' || key === 'from' ? 1 : -1 })}
  >
    ${label}${sort.key === key ? html`<${Icon} name=${sort.dir > 0 ? 'arrowUp' : 'arrowDown'} size=${12} />` : null}
  </th>`;
  const open = (h) => navigate(holeHref(h));

  return html`<div class="stack">
    <section class="card">
      <header>
        <h2>${tr({ en: 'Parameters', mn: 'Параметр' })}</h2>
        <div class="row">
          ${dirty ? html`<${Pill} kind="warn">${tr({ en: 'Not saved', mn: 'Хадгалаагүй' })}<//>` : null}
          ${dirty ? html`<${Button} size="sm" onClick=${() => setForm(toForm(settings().intercepts))}>${tr({ en: 'Revert', mn: 'Буцаах' })}<//>` : null}
          <${Button} size="sm" kind=${dirty ? 'primary' : 'default'} disabled=${!dirty || readOnly()} onClick=${save}>${tr({ en: 'Save as project default', mn: 'Төслийн үндсэн болгох' })}<//>
        </div>
      </header>
      <div class="body stack">
        <div class="form-grid">
          <${Field} label=${tr({ en: 'Element', mn: 'Элемент' })}>
            <${Select} value=${form.element} options=${els.map((k) => ({ value: k, label: `${unitSym(k)} (${elementLabel(k)})` }))} onChange=${(v) => setForm({ ...form, element: v, secondary: form.secondary.filter((k) => k !== v) })} />
          <//>
          <${Field} label=${tr({ en: 'Cut-off ({u})', mn: 'Cut-off ({u})' }, { u: unit })}>
            <input class="inp num" type="number" step="any" min="0" value=${form.cutoff} onInput=${set('cutoff')} />
          <//>
          <${Field} label=${tr({ en: 'Min length (m)', mn: 'Доод урт (м)' })}>
            <input class="inp num" type="number" step="any" min="0" value=${form.minLen} onInput=${set('minLen')} />
          <//>
          <${Field} label=${tr({ en: 'Max internal dilution (m)', mn: 'Дотоод шингэрэлт, дээд (м)' })} hint=${tr({ en: 'Consecutive metres below cut-off', mn: 'Cut-off-оос доош дараалсан метр' })}>
            <input class="inp num" type="number" step="any" min="0" value=${form.maxDil} onInput=${set('maxDil')} />
          <//>
          <${Field} label=${tr({ en: 'Including cut-off ({u})', mn: '"Дотор нь" cut-off ({u})' }, { u: unit })} hint=${tr({ en: 'Blank = no including intervals', mn: 'Хоосон бол тооцохгүй' })}>
            <input class="inp num" type="number" step="any" min="0" value=${form.incl} onInput=${set('incl')} />
          <//>
          <${Field} label=${tr({ en: 'Including min length (m)', mn: '"Дотор нь" доод урт (м)' })} hint=${tr({ en: 'Blank = same as min length', mn: 'Хоосон бол доод урттай ижил' })}>
            <input class="inp num" type="number" step="any" min="0" value=${form.inclMinLen} placeholder=${form.minLen} onInput=${set('inclMinLen')} />
          <//>
          <${Field} label=${tr({ en: 'Min grade × length ({u})', mn: 'Доод агуулга × урт ({u})' }, { u: gxmUnit(params.element) })} hint=${tr({ en: 'Optional', mn: 'Заавал биш' })}>
            <input class="inp num" type="number" step="any" min="0" value=${form.minGradeThickness} onInput=${set('minGradeThickness')} />
          <//>
          <${Field} label=${tr({ en: 'Unsampled gaps', mn: 'Дээжлээгүй завсар' })}>
            <${Select}
              value=${form.gapPolicy}
              options=${[
                { value: 'zero', label: tr({ en: 'Zero grade (dilution)', mn: 'Тэг агуулга (шингэрэлт)' }) },
                { value: 'break', label: tr({ en: 'End the intercept', mn: 'Интерсептийг таслана' }) },
              ]}
              onChange=${(v) => setForm({ ...form, gapPolicy: v })}
            />
          <//>
          <${Field} label=${t('hole')}>
            <${Select} value=${holeId} options=${allHoles} placeholder=${tr({ en: 'All holes', mn: 'Бүх цооног' })} onChange=${setHoleF} />
          <//>
        </div>
        <div class="fld">
          <span class="smp-lbl">${tr({ en: 'Secondary elements (length-weighted)', mn: 'Туслах элементүүд (урт-жигнэсэн)' })}</span>
          <div class="smp-chips">
            ${els
              .filter((k) => k !== form.element)
              .map((k) => {
                const on = form.secondary.includes(k);
                return html`<label key=${k} class=${'smp-chip' + (on ? ' on' : '')}>
                  <input type="checkbox" checked=${on} onChange=${() => setForm({ ...form, secondary: on ? form.secondary.filter((x) => x !== k) : [...form.secondary, k] })} />
                  ${unitSym(k)}
                </label>`;
              })}
            ${els.length <= 1 ? html`<span class="muted">${tr({ en: 'No other assayed elements yet.', mn: 'Өөр шинжилсэн элемент алга.' })}</span>` : null}
          </div>
        </div>
      </div>
    </section>

    <div class="stats">
      <${Stat} label=${tr({ en: 'Intercepts', mn: 'Интерсепт' })} value=${res.rows.length} sub=${tr({ en: '{n} m in total', mn: 'нийт {n} м' }, { n: fmt(res.rows.reduce((a, r) => a + r.length, 0), 1) })} />
      <${Stat} label=${tr({ en: 'Holes with a hit', mn: 'Интерсепттэй цооног' })} value=${withHits} sub=${tr({ en: 'of {n} assayed', mn: '{n} шинжлэгдсэнээс' }, { n: assayedHoles })} />
      <${Stat}
        label=${tr({ en: 'Best grade × length', mn: 'Хамгийн их агуулга × урт' })}
        value=${best ? fmt(best.gradeXm, 1) : '–'}
        unit=${best ? gxmUnit(params.element) : null}
        kind=${best ? 'brass' : ''}
        sub=${best ? `${best.holeId} · ${fix(best.from, 1)} m` : null}
      />
      <${Stat} label=${tr({ en: 'Pending assays', mn: 'Хүлээгдэж буй' })} value=${res.unassayed.length} sub=${tr({ en: 'holes without grades', mn: 'агуулгагүй цооног' })} />
    </div>

    <section class="card">
      <header>
        <h2>${tr({ en: 'Significant intercepts', mn: 'Ач холбогдолтой интерсепт' })}</h2>
        <${Button} size="sm" icon="download" disabled=${!res.rows.length} onClick=${exportCSV}>CSV<//>
      </header>
      ${res.rows.length
        ? html`<div class="tbl-wrap smp-flat">
            <table class="tbl smp-tbl icpt-tbl">
              <thead>
                <tr>
                  ${th('holeId', t('hole'))}
                  ${th('from', `${t('from')} (m)`, 'num')}
                  <th class="num">${t('to')} (m)</th>
                  ${th('length', tr({ en: 'Length (m)', mn: 'Урт (м)' }), 'num')}
                  ${th('grade', sym, 'num')}
                  ${th('gradeXm', gxmUnit(params.element), 'num')}
                  ${params.secondary.map((k) => html`<th class="num" key=${k}>${unitSym(k)}</th>`)}
                  <th>${tr({ en: 'Intercept', mn: 'Интерсепт' })}</th>
                </tr>
              </thead>
              <tbody>
                ${list.map(
                  (r) => html`
                    <tr
                      key=${r.holeId + r.from}
                      class=${'click' + (r === best ? ' best' : '')}
                      tabindex="0"
                      onClick=${() => open(r.holeId)}
                      onKeyDown=${(e) => e.key === 'Enter' && open(r.holeId)}
                    >
                      <td><strong>${r.holeId}</strong></td>
                      <td class="num">${fix(r.from, 2)}</td>
                      <td class="num">${fix(r.to, 2)}</td>
                      <td class="num">${fix(r.length, 2)}</td>
                      <td class="num"><strong>${fmtGrade(r.grade, unit)}</strong></td>
                      <td class="num">${fix(r.gradeXm, 1)}${r === best ? html` <${Pill} kind="brass">${tr({ en: 'best', mn: 'шилдэг' })}<//>` : null}</td>
                      ${params.secondary.map((k) => html`<td class="num" key=${k}>${isNum(r.secondary[k]) ? fmtGrade(r.secondary[k], gradeUnit(k)) : ''}</td>`)}
                      <td class="smp-text">${r.text}</td>
                    </tr>
                    ${r.incl.map(
                      (x) => html`<tr key=${r.holeId + r.from + 'i' + x.from} class="click incl" onClick=${() => open(r.holeId)}>
                        <td class="muted">${tr({ en: 'incl.', mn: 'дотор нь' })}</td>
                        <td class="num">${fix(x.from, 2)}</td>
                        <td class="num">${fix(x.to, 2)}</td>
                        <td class="num">${fix(x.length, 2)}</td>
                        <td class="num">${fmtGrade(x.grade, unit)}</td>
                        <td class="num">${fix(x.gradeXm, 1)}</td>
                        ${params.secondary.map((k) => html`<td class="num" key=${k}>${isNum(x.secondary[k]) ? fmtGrade(x.secondary[k], gradeUnit(k)) : ''}</td>`)}
                        <td class="smp-text muted">${x.text}</td>
                      </tr>`,
                    )}
                  `,
                )}
              </tbody>
            </table>
          </div>`
        : html`<${Empty} icon="target" title=${tr({ en: 'No significant intercepts', mn: 'Ач холбогдолтой интерсепт алга' })}>
            ${res.nsi.length || res.unassayed.length
              ? tr({ en: 'No composite meets these parameters. Try a lower cut-off or more dilution.', mn: 'Эдгээр параметрт тохирох композит алга. Cut-off-ыг бууруулах эсвэл шингэрэлтийг нэмнэ үү.' })
              : tr({ en: 'No assayed primary samples for {el} yet.', mn: '{el}-ийн шинжилгээтэй үндсэн дээж одоогоор алга.' }, { el: sym })}
          <//>`}
    </section>

    <section class="card">
      <header>
        <h2>${tr({ en: 'ASX text', mn: 'ASX текст' })}</h2>
        <${Button} size="sm" icon="copy" onClick=${copy}>${tr({ en: 'Copy', mn: 'Хуулах' })}<//>
      </header>
      <div class="body">
        <textarea id="icpt-text" class="inp icpt-text" readonly rows=${Math.min(18, text.split('\n').length + 1)} value=${text}></textarea>
      </div>
    </section>
  </div>`;
}

/** 'Au g/t', 'Cu %' — reporting units, as in the intercept text. */
const unitSym = (k) => `${elementSymbol(k)} ${gradeUnit(k)}`;

function fmtGrade(v, unit) {
  if (!isNum(v)) return '';
  if (unit === 'g/t' || unit === '%') return fix(v, 2);
  return Math.abs(v) >= 10 ? fix(v, 0) : fix(v, 2);
}

// ====================================================================== CSS

const CSS = `
.smp-pane { margin-top: 16px; }
.smp-gen { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 14px; align-items: start; }
@media (max-width: 1060px) { .smp-gen { grid-template-columns: minmax(0, 1fr); } }
.smp-fg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
.smp-fg .fld.wide, .smp-fg .smp-note, .smp-fg .smp-checks { grid-column: 1 / -1; }
.smp-note { font-size: 12px; }
.smp-idrow { display: flex; gap: 4px; align-items: center; }
.smp-idrow .inp { flex: 1; min-width: 0; }
.smp-checks { display: flex; flex-direction: column; gap: 6px; }
.smp-checks.row { flex-direction: row; justify-content: flex-end; }
.smp-stat-id { font-family: var(--mono); font-size: 17px; }
.smp-issues { border: 1px solid var(--line); border-radius: var(--radius-sm); }
.smp-prev { display: grid; grid-template-columns: minmax(0, 1fr) 184px; gap: 12px; align-items: start; }
@media (max-width: 700px) { .smp-prev { grid-template-columns: minmax(0, 1fr); } .smp-strip { order: -1; max-height: 300px; } }
.smp-scroll { max-height: 68vh; }
.smp-tbl th, .smp-tbl td { white-space: nowrap; }
.smp-tbl tr.qc td { background: var(--surface-2); }
.smp-tbl tr.qc.crm td:first-child { box-shadow: inset 3px 0 0 var(--brass); }
.smp-tbl tr.qc.blk td:first-child { box-shadow: inset 3px 0 0 var(--info); }
.smp-tbl tr.qc.dup td:first-child { box-shadow: inset 3px 0 0 var(--accent); }
.smp-tbl tr.bad td { background: var(--err-soft); }
.smp-tbl tr.on td { background: var(--accent-soft); }
.smp-tbl tr.click { user-select: none; }
.smp-lith { display: inline-flex; align-items: center; gap: 5px; }
.smp-strip { position: sticky; top: 0; max-height: 68vh; overflow: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); padding: 6px 4px 8px; }
.smp-strip svg { display: block; margin: 0 auto; }
.smp-strip svg text { font-family: var(--mono); font-size: 9.5px; fill: var(--muted); }
.smp-strip svg text.sid { fill: var(--ink-2); font-size: 9px; }
.smp-strip svg text.lt { font-size: 8.5px; font-weight: 600; }
.smp-strip .ax { stroke: var(--line-2); stroke-width: 1; }
.smp-strip .s0 { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 0.6; }
.smp-strip .s1 { fill: var(--surface-3); stroke: var(--accent); stroke-width: 0.6; }
.smp-strip .bad { fill: var(--err-soft); stroke: var(--err); stroke-width: 0.8; }
.smp-strip .old { fill: var(--muted); opacity: 0.6; }
.smp-strip .crm { fill: var(--brass); }
.smp-strip .blk { fill: var(--info); }
.smp-strip .dup { fill: var(--accent); }
.smp-legend { justify-content: center; margin-top: 6px; font-size: 11px; gap: 4px 8px; }
.smp-legend .lg { display: inline-block; width: 10px; height: 10px; border-radius: 2px; }
.smp-legend .lg.s0 { background: var(--accent-soft); border: 1px solid var(--accent); }
.smp-legend .lg.old { background: var(--muted); }
.smp-legend .lg.crm { background: var(--brass); transform: rotate(45deg) scale(0.8); }
.smp-legend .lg.blk { background: var(--info); border-radius: 50%; }
.smp-legend .lg.dup { background: var(--accent); }
.smp-range .inp { width: 130px; }
.smp-selbar { position: sticky; bottom: 0; z-index: 2; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.smp-selbar.on { border-color: var(--accent); box-shadow: var(--shadow); }
.smp-flat { border: 0; border-radius: 0; }
.smp-methods { font-family: var(--mono); font-size: 12px; }
.smp-sub { font-size: 11.5px; }
.smp-meter { min-width: 90px; }
.smp-meter small { display: block; font-size: 11px; }
.smp-acts { white-space: nowrap; text-align: right; }
.smp-acts > * { vertical-align: middle; }
.smp-bad { border-color: var(--err); }
.smp-meta { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 8px 16px; margin: 0; }
.smp-meta dt { font-size: 11.5px; color: var(--muted); }
.smp-meta dd { margin: 0; font-weight: 550; }
.smp-sheet-foot { display: grid; grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 760px) { .smp-sheet-foot { grid-template-columns: minmax(0, 1fr); } }
.smp-tot { border: 1px solid var(--line); border-radius: var(--radius-sm); }
.smp-total td { font-weight: 650; }
.smp-custody h3 { margin-bottom: 8px; }
.smp-signs { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: 10px; }
.smp-sign { border: 1px solid var(--line-2); border-radius: var(--radius-sm); padding: 10px; font-size: 12.5px; }
.smp-sign p { display: flex; gap: 6px; margin-top: 12px; align-items: flex-end; }
.smp-sign p span { color: var(--muted); white-space: nowrap; }
.smp-sign p i { flex: 1; border-bottom: 1px solid var(--ink-2); min-height: 16px; font-style: normal; }
.smp-lbl { font-size: 12px; color: var(--muted); font-weight: 550; }
.smp-chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 104px; overflow: auto; }
.smp-chip { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--line-2); border-radius: 999px; padding: 2px 10px 2px 7px; font-size: 12.5px; cursor: pointer; }
.smp-chip input { margin: 0; }
.smp-chip.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-2); }
.stat.brass .stat-value { color: var(--brass); }
.icpt-tbl th.sort { cursor: pointer; user-select: none; }
.icpt-tbl th.sort:hover { color: var(--ink); }
.icpt-tbl th .ico { display: inline-block; vertical-align: -2px; margin-left: 3px; }
.icpt-tbl tr.best td { background: var(--brass-soft); }
.icpt-tbl tr.best td:first-child { box-shadow: inset 3px 0 0 var(--brass); }
.icpt-tbl tr.incl td { font-size: 12.5px; border-bottom-style: dashed; }
.icpt-tbl tr.incl td:first-child { padding-left: 22px; }
.smp-tbl td.smp-text { min-width: 280px; white-space: normal; }
.icpt-text { width: 100%; font-family: var(--mono); font-size: 12.5px; line-height: 1.5; white-space: pre; overflow: auto; }
`;

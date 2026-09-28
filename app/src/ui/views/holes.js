// Drill hole register: progress per hole, filters, new hole, and an editable
// collar table (spreadsheet) for bulk header edits.
import { html, useState, useMemo } from '../../lib.js';
import { S, holes, rows, addHole, hole, codes, meaning } from '../../core/store.js';
import { TABLES } from '../../core/schema.js';
import { validateAll, summarize } from '../../core/validate.js';
import { coverage } from '../../core/intervals.js';
import { isNum, fmt, natCmp, toNum } from '../../core/util.js';
import { tr, t, label } from '../../i18n.js';
import { Icon } from '../icons.js';
import { Grid } from '../grid.js';
import { useStore, Button, Pill, Meter, PageHead, Empty, openModal, toast, navigate, Select, Field, usePref, injectCSS } from '../kit.js';
import { track } from '../undo.js';

injectCSS(
  'holes',
  `
.holes-filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
.holes-grid { height: calc(100vh - 260px); min-height: 360px; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; display: flex; }
.holes-grid > .grid-wrap { flex: 1; }
.prog { display: grid; grid-template-columns: 1fr 44px; gap: 6px; align-items: center; min-width: 110px; }
.prog small { font-variant-numeric: tabular-nums; color: var(--muted); text-align: right; }
.hole-id { font-family: var(--mono); font-weight: 600; }
`,
);

export function holeStats(c) {
  const eoh = isNum(c.eoh) ? c.eoh : null;
  const lith = coverage(rows('lith', c.holeId));
  const geo = coverage(rows('geotech', c.holeId));
  const smp = rows('samples', c.holeId).filter((s) => s.sampleType === 'PRIM' || !s.sampleType);
  const sampled = coverage(smp);
  let assayed = 0;
  for (const s of smp) if (S.ctx.sampleStatus(s) === 'assayed') assayed++;
  return { eoh, lith, geo, sampled, nSamples: smp.length, assayed, pct: (v) => (eoh ? Math.min(100, (100 * v) / eoh) : 0) };
}

function NewHoleForm({ close }) {
  const [f, setF] = useState({ holeId: '', prospect: '', east: '', north: '', rl: '', azimuth: '', dip: '-60', plannedDepth: '', holeType: 'DD' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = (e) => {
    e.preventDefault();
    const id = f.holeId.trim();
    if (!id) return toast(tr({ en: 'Enter a hole ID', mn: 'Цооногийн дугаар оруулна уу' }), { kind: 'err' });
    if (hole(id)) return toast(tr({ en: 'Hole {h} already exists', mn: '{h} цооног аль хэдийн байна' }, { h: id }), { kind: 'err' });
    const res = addHole({ holeId: id, prospect: f.prospect || null, holeType: f.holeType, east: toNum(f.east), north: toNum(f.north), rl: toNum(f.rl), azimuth: toNum(f.azimuth), dip: toNum(f.dip), plannedDepth: toNum(f.plannedDepth), eoh: null, surveyMethod: 'PLN' });
    track(res, `New hole ${id}`);
    close(id);
  };
  const inp = (k, lbl, num) => html`<${Field} label=${lbl}><input id=${'nh-' + k} class=${'inp' + (num ? ' num' : '')} inputmode=${num ? 'decimal' : undefined} value=${f[k]} onInput=${set(k)} /><//>`;
  return html`<form onSubmit=${submit}>
    <div class="dlg-body">
      <div class="form-grid">
        ${inp('holeId', tr({ en: 'Hole ID *', mn: 'Цооногийн дугаар *' }))}
        ${inp('prospect', tr({ en: 'Prospect', mn: 'Талбай' }))}
        <${Field} label=${tr({ en: 'Hole type', mn: 'Төрөл' })}><${Select} id="nh-type" value=${f.holeType} options=${codes('HOLETYPE').map((c) => ({ value: c.code, label: `${c.code} — ${meaning('HOLETYPE', c.code)}` }))} onChange=${(v) => setF({ ...f, holeType: v })} /><//>
        ${inp('east', 'Easting', true)} ${inp('north', 'Northing', true)} ${inp('rl', 'RL', true)}
        ${inp('azimuth', tr({ en: 'Azimuth', mn: 'Азимут' }), true)} ${inp('dip', tr({ en: 'Dip (negative down)', mn: 'Налуу (доош сөрөг)' }), true)}
        ${inp('plannedDepth', tr({ en: 'Planned depth', mn: 'Төлөвлөсөн гүн' }), true)}
      </div>
    </div>
    <div class="dlg-actions">
      <${Button} onClick=${() => close()}>${t('cancel')}<//>
      <${Button} kind="primary" type="submit">${tr({ en: 'Create hole', mn: 'Цооног үүсгэх' })}<//>
    </div>
  </form>`;
}

export async function newHoleDialog() {
  const id = await openModal((close) => html`<${NewHoleForm} close=${close} />`, { title: tr({ en: 'New drill hole', mn: 'Шинэ цооног' }), wide: true });
  if (id) navigate(`#/hole/${encodeURIComponent(id)}/header`);
}

export function HolesView() {
  useStore();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [prospect, setProspect] = useState('');
  const [mode, setMode] = usePref('holes.mode', 'list');
  const all = holes();
  const issues = useMemo(() => summarize(validateAll()), [S.rev]);
  const prospects = [...new Set(all.map((h) => h.prospect).filter(Boolean))].sort(natCmp);
  const list = all.filter((h) => (!q || h.holeId.toUpperCase().includes(q.toUpperCase())) && (!status || h.status === status) && (!prospect || h.prospect === prospect));

  const head = html`<${PageHead}
    title=${t('holes')}
    sub=${tr({ en: '{n} holes · click a hole to log it', mn: '{n} цооног · логлохын тулд цооног дээр дарна уу' }, { n: all.length })}
  >
    <div class="seg" role="group">
      <button class=${mode === 'list' ? 'on' : ''} onClick=${() => setMode('list')}>${tr({ en: 'Progress', mn: 'Явц' })}</button>
      <button class=${mode === 'table' ? 'on' : ''} onClick=${() => setMode('table')}>${tr({ en: 'Collar table', mn: 'Collar хүснэгт' })}</button>
    </div>
    <${Button} icon="upload" onClick=${() => navigate('#/import')}>${t('import')}<//>
    <${Button} icon="plus" kind="primary" disabled=${!!S.readOnly} onClick=${newHoleDialog}>${tr({ en: 'New hole', mn: 'Шинэ цооног' })}<//>
  <//>`;

  const filters = html`<div class="holes-filters">
    <input class="inp" id="holes-q" placeholder=${tr({ en: 'Filter hole ID…', mn: 'Цооногоор шүүх…' })} value=${q} onInput=${(e) => setQ(e.target.value)} />
    <${Select} id="holes-status" value=${status} placeholder=${tr({ en: 'All statuses', mn: 'Бүх төлөв' })} options=${codes('HOLESTATUS').map((c) => ({ value: c.code, label: meaning('HOLESTATUS', c.code) }))} onChange=${setStatus} />
    ${prospects.length > 1 ? html`<${Select} id="holes-prospect" value=${prospect} placeholder=${tr({ en: 'All prospects', mn: 'Бүх талбай' })} options=${prospects} onChange=${setProspect} />` : null}
    <span class="muted">${list.length} / ${all.length}</span>
  </div>`;

  if (!all.length)
    return html`${head}<div class="card"><${Empty} icon="holes" title=${tr({ en: 'No drill holes yet', mn: 'Цооног алга' })}>
      ${tr({ en: 'Create a hole, or import collars from CSV / an MX Deposit export.', mn: 'Цооног үүсгэх, эсвэл CSV / MX Deposit export-оос collar импортлоно уу.' })}
    <//></div>`;

  if (mode === 'table') {
    const fields = TABLES.collar.fields.filter((f) => f.key !== 'locked' && !f.hidden).map((f) => (f.key === 'holeId' ? { ...f, readOnly: true } : f));
    return html`${head}${filters}
      <div class="holes-grid">
        <${Grid} table="collar" holeId=${(r) => r.holeId} rows=${list} fields=${fields} readOnly=${!!S.readOnly} frozen=${1} onOpenRow=${(r) => navigate('#/hole/' + encodeURIComponent(r.holeId) + '/header')} />
      </div>
      <p class="muted" style="margin-top:8px">${tr({ en: 'Hole IDs are renamed from the hole page so every table follows. Double-click the row number to open a hole.', mn: 'Цооногийн дугаарыг цооногийн хуудаснаас солино (бүх хүснэгт дагаж өөрчлөгдөнө). Мөрийн дугаар дээр давхар дарж нээнэ.' })}</p>`;
  }

  return html`${head}${filters}
    <div class="tbl-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>${t('hole')}</th>
            <th>${tr({ en: 'Status', mn: 'Төлөв' })}</th>
            <th class="hide-sm">${tr({ en: 'Prospect', mn: 'Талбай' })}</th>
            <th class="num">EOH (m)</th>
            <th>${tr({ en: 'Lithology', mn: 'Литологи' })}</th>
            <th class="hide-sm">${tr({ en: 'Recovery', mn: 'Авралт' })}</th>
            <th>${tr({ en: 'Sampled', mn: 'Дээжилсэн' })}</th>
            <th class="hide-sm">${tr({ en: 'Assays', mn: 'Шинжилгээ' })}</th>
            <th>${tr({ en: 'Issues', mn: 'Асуудал' })}</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((c) => {
            const s = holeStats(c);
            const iss = issues.byHole.get(c.holeId);
            return html`<tr class="click" onClick=${() => navigate('#/hole/' + encodeURIComponent(c.holeId))}>
              <td>
                <span class="hole-id">${c.holeId}</span>
                ${c.locked ? html` <${Icon} name="lock" size=${12} />` : null}
              </td>
              <td>${c.status ? html`<${Pill} kind=${c.status === 'CMP' ? 'ok' : c.status === 'ACT' ? 'warn' : c.status === 'ABD' || c.status === 'NAC' ? 'err' : ''}>${meaning('HOLESTATUS', c.status) || c.status}<//>` : ''}</td>
              <td class="hide-sm">${c.prospect || ''}</td>
              <td class="num">${isNum(c.eoh) ? fmt(c.eoh, 1) : '—'}</td>
              <td><div class="prog"><${Meter} value=${s.pct(s.lith)} kind=${s.pct(s.lith) >= 99.5 ? 'ok' : ''} /><small>${s.eoh ? Math.round(s.pct(s.lith)) + '%' : fmt(s.lith, 0) + ' m'}</small></div></td>
              <td class="hide-sm"><div class="prog"><${Meter} value=${s.pct(s.geo)} kind=${s.pct(s.geo) >= 99.5 ? 'ok' : ''} /><small>${s.eoh ? Math.round(s.pct(s.geo)) + '%' : ''}</small></div></td>
              <td><div class="prog"><${Meter} value=${s.pct(s.sampled)} /><small>${s.nSamples}</small></div></td>
              <td class="hide-sm"><div class="prog"><${Meter} value=${s.nSamples ? (100 * s.assayed) / s.nSamples : 0} kind=${s.nSamples && s.assayed === s.nSamples ? 'ok' : ''} /><small>${s.nSamples ? Math.round((100 * s.assayed) / s.nSamples) + '%' : ''}</small></div></td>
              <td>
                ${iss?.error ? html`<${Pill} kind="err">${iss.error}<//> ` : null}
                ${iss?.warn ? html`<${Pill} kind="warn">${iss.warn}<//>` : null}
                ${!iss?.error && !iss?.warn ? html`<${Pill} kind="ok"><${Icon} name="check" size=${12} /><//>` : null}
              </td>
            </tr>`;
          })}
        </tbody>
      </table>
    </div>`;
}

// Project settings: coordinate system, limits, QC scheme, chemistry rules.
import { html, useState } from '../../lib.js';
import { S, settings, setSettings, renameProject, elementKeys } from '../../core/store.js';
import { elementLabel } from '../../core/schema.js';
import { tr, t } from '../../i18n.js';
import { useStore, Button, PageHead, Field, Select, toast, injectCSS, navigate } from '../kit.js';
import { track } from '../undo.js';

injectCSS('settings', `.set-sec .body { display: grid; gap: 12px; } .set-sec h2 { font-size: 15px; }`);

function NumField({ label: lbl, value, onSave, hint, step = 'any', id }) {
  const [v, setV] = useState(value ?? '');
  return html`<${Field} label=${lbl} hint=${hint}>
    <input
      id=${id}
      class="inp num"
      type="number"
      step=${step}
      value=${v}
      onInput=${(e) => setV(e.target.value)}
      onBlur=${() => {
        const n = v === '' ? null : Number(v);
        if (n !== value) onSave(n);
      }}
    />
  <//>`;
}

function TextField({ label: lbl, value, onSave, hint, id }) {
  const [v, setV] = useState(value ?? '');
  return html`<${Field} label=${lbl} hint=${hint}>
    <input id=${id} class="inp" value=${v} onInput=${(e) => setV(e.target.value)} onBlur=${() => v !== (value ?? '') && onSave(v)} />
  <//>`;
}

export function SettingsView() {
  useStore();
  const st = settings();
  const save = (patch, what) => {
    track(setSettings(patch), 'Settings');
    toast(tr({ en: 'Saved: {w}', mn: 'Хадгаллаа: {w}' }, { w: what }), { ms: 1800 });
  };
  const q = st.qc;
  return html`<div class="stack" style="max-width:1000px">
    <${PageHead} title=${t('settings')} sub=${tr({ en: 'Project-wide settings. They are shared with everyone working on this project.', mn: 'Төслийн нийтлэг тохиргоо. Энэ төсөл дээр ажиллаж буй бүх хүнд хамаарна.' })} />

    <section class="card set-sec">
      <header><h2>${tr({ en: 'Project', mn: 'Төсөл' })}</h2></header>
      <div class="body form-grid">
        <${TextField} id="set-name" label=${tr({ en: 'Project name', mn: 'Төслийн нэр' })} value=${S.project?.name} onSave=${(v) => v && renameProject(S.pid, v)} />
        <${TextField} id="set-crs" label=${tr({ en: 'Coordinate system', mn: 'Координатын систем' })} value=${st.crs} onSave=${(v) => save({ crs: v }, 'CRS')} />
        <${NumField} id="set-epsg" label="EPSG" value=${st.epsg} step="1" onSave=${(v) => save({ epsg: v }, 'EPSG')} />
        <${Field} label=${tr({ en: 'Dip convention', mn: 'Налуугийн тэмдэг' })}>
          <${Select} id="set-dip" value=${st.dipNegativeDown === false ? 'pos' : 'neg'} options=${[{ value: 'neg', label: tr({ en: 'Negative = down (MX, Leapfrog)', mn: 'Сөрөг = доош (MX, Leapfrog)' }) }, { value: 'pos', label: tr({ en: 'Positive = down', mn: 'Эерэг = доош' }) }]} onChange=${(v) => save({ dipNegativeDown: v !== 'pos' }, 'dip')} />
        <//>
      </div>
    </section>

    <section class="card set-sec">
      <header><h2>${tr({ en: 'Logging rules', mn: 'Логлолтын дүрэм' })}</h2></header>
      <div class="body form-grid">
        <${NumField} id="set-cmax" label=${tr({ en: 'Comment limit (error)', mn: 'Тайлбарын хязгаар (алдаа)' })} hint=${tr({ en: 'MX Deposit rejects > 500', mn: 'MX Deposit 500-аас их бол хүлээж авахгүй' })} value=${st.commentsMax} step="1" onSave=${(v) => save({ commentsMax: v }, 'comments')} />
        <${NumField} id="set-csoft" label=${tr({ en: 'Comment house style (note)', mn: 'Тайлбарын дотоод журам' })} value=${st.commentsSoft} step="1" onSave=${(v) => save({ commentsSoft: v }, 'comments')} />
        <${NumField} id="set-minlen" label=${tr({ en: 'Min sample length (m)', mn: 'Дээжийн доод урт (м)' })} value=${st.minSampleLen} onSave=${(v) => save({ minSampleLen: v }, 'samples')} />
        <${NumField} id="set-maxlen" label=${tr({ en: 'Max sample length (m)', mn: 'Дээжийн дээд урт (м)' })} value=${st.maxSampleLen} onSave=${(v) => save({ maxSampleLen: v }, 'samples')} />
      </div>
    </section>

    <section class="card set-sec">
      <header><h2>${tr({ en: 'Lithology chemistry check (MU v4 QA rules)', mn: 'Литологийн химийн шалгалт (MU v4 QA дүрэм)' })}</h2></header>
      <div class="body">
        <p class="muted">${tr({ en: 'CMSQ must have 4-acid Al < 1 % and S < 5 %; above that the host code + ASIL (Al) or VMS/MSUL (S) is suggested. pXRF is never used for this.', mn: 'CMSQ-д 4-acid Al < 1 %, S < 5 % байх ёстой; түүнээс их бол хост код + ASIL (Al) эсвэл VMS/MSUL (S)-ийг санал болгоно. pXRF-ийг ашиглахгүй.' })}</p>
        <div class="form-grid">
          <${TextField} id="set-al" label=${tr({ en: 'Al element key', mn: 'Al элементийн түлхүүр' })} value=${st.chem.alKey} onSave=${(v) => save({ chem: { alKey: v } }, 'Al')} />
          <${TextField} id="set-s" label=${tr({ en: 'S element key', mn: 'S элементийн түлхүүр' })} value=${st.chem.sKey} onSave=${(v) => save({ chem: { sKey: v } }, 'S')} />
          <${NumField} id="set-cal" label="CMSQ Al max (%)" value=${st.chem.cmsqAlMax} onSave=${(v) => save({ chem: { cmsqAlMax: v } }, 'CMSQ')} />
          <${NumField} id="set-cs" label="CMSQ S max (%)" value=${st.chem.cmsqSMax} onSave=${(v) => save({ chem: { cmsqSMax: v } }, 'CMSQ')} />
          <${NumField} id="set-smin" label=${tr({ en: 'Sulphide S flag (%)', mn: 'Сульфидын S босго (%)' })} value=${st.chem.sulphideSMin} onSave=${(v) => save({ chem: { sulphideSMin: v } }, 'S')} />
        </div>
      </div>
    </section>

    <section class="card set-sec">
      <header><h2>${tr({ en: 'QC scheme', mn: 'QC схем' })}</h2><a href="#/qaqc">QA/QC →</a></header>
      <div class="body form-grid">
        <${NumField} id="set-crm" label=${tr({ en: 'CRM every N samples', mn: 'N дээж тутамд CRM' })} value=${q.crmEvery} step="1" onSave=${(v) => save({ qc: { crmEvery: v } }, 'QC')} />
        <${NumField} id="set-blk" label=${tr({ en: 'Blank every N', mn: 'N тутамд blank' })} value=${q.blankEvery} step="1" onSave=${(v) => save({ qc: { blankEvery: v } }, 'QC')} />
        <${NumField} id="set-dup" label=${tr({ en: 'Duplicate every N', mn: 'N тутамд давхар' })} value=${q.dupEvery} step="1" onSave=${(v) => save({ qc: { dupEvery: v } }, 'QC')} />
        <${NumField} id="set-warn" label=${tr({ en: 'CRM warning (SD)', mn: 'CRM анхааруулга (SD)' })} value=${q.crmWarnSD} onSave=${(v) => save({ qc: { crmWarnSD: v } }, 'QC')} />
        <${NumField} id="set-fail" label=${tr({ en: 'CRM failure (SD)', mn: 'CRM алдаа (SD)' })} value=${q.crmFailSD} onSave=${(v) => save({ qc: { crmFailSD: v } }, 'QC')} />
        <${NumField} id="set-bf" label=${tr({ en: 'Blank limit (× LOR)', mn: 'Blank хязгаар (× LOR)' })} value=${q.blankFactor} onSave=${(v) => save({ qc: { blankFactor: v } }, 'QC')} />
        <${TextField} id="set-rot" label=${tr({ en: 'CRM rotation (comma separated)', mn: 'CRM ээлж (таслалаар)' })} value=${(q.crmRotation || []).join(', ')} onSave=${(v) => save({ qc: { crmRotation: v.split(',').map((x) => x.trim()).filter(Boolean) } }, 'QC')} />
        <${Field} label=${tr({ en: 'Below detection values', mn: 'Илрүүлэх хязгаараас бага утга' })}>
          <${Select} id="set-bdl" value=${st.belowDetection} options=${[{ value: 'half', label: tr({ en: 'Half of LOR', mn: 'LOR-ийн хагас' }) }, { value: 'lor', label: 'LOR' }, { value: 'zero', label: '0' }, { value: 'negative', label: '−LOR' }]} onChange=${(v) => save({ belowDetection: v }, 'LOR')} />
        <//>
      </div>
    </section>

    <${ElementsSection} st=${st} save=${save} />

    <section class="card set-sec">
      <header><h2>${tr({ en: 'Storage', mn: 'Хадгалалт' })}</h2></header>
      <div class="body">
        <p>${S.status.cloud === 'live'
          ? tr({ en: 'Shared live storage in claude.ai — everyone in your organisation with access sees the same data. Edits merge row by row.', mn: 'claude.ai-ийн хамтын шууд хадгалалт — эрхтэй бүх хүн ижил өгөгдлийг харна. Засварууд мөр бүрээр нэгтгэгдэнэ.' })
          : tr({ en: 'Stored in this browser ({k}). Use Backup on the Projects page to move data between computers or to share with colleagues (their changes merge row by row).', mn: 'Энэ хөтөч дээр хадгалагдана ({k}). Компьютер хооронд шилжүүлэх, хамт олонтой хуваалцахдаа «Төслүүд» хуудасны «Нөөц»-ийг ашиглана (засварууд мөр бүрээр нэгтгэгдэнэ).' }, { k: S.status.storage })}</p>
        <div><${Button} onClick=${() => navigate('#/projects')}>${t('projects')}<//></div>
      </div>
    </section>
  </div>`;
}

function ElementsSection({ st, save }) {
  const keys = [...new Set([...Object.keys(st.elements || {}), ...elementKeys('assays')])];
  if (!keys.length) return null;
  const upd = (k, field, raw) => {
    const cur = { ...(st.elements?.[k] || {}) };
    const v = raw === '' ? null : field === 'method' || field === 'unit' ? raw : Number(raw);
    if (cur[field] === v) return;
    cur[field] = v;
    save({ elements: { [k]: cur } }, k);
  };
  const cell = (k, field, num = true) => html`<td>
    <input class=${'inp' + (num ? ' num' : '')} style="width:100%" id=${`el-${k}-${field}`} defaultValue=${st.elements?.[k]?.[field] ?? ''} onBlur=${(e) => upd(k, field, e.target.value.trim())} />
  </td>`;
  return html`<section class="card set-sec">
    <header><h2>${tr({ en: 'Assay elements', mn: 'Шинжилгээний элементүүд' })}</h2></header>
    <div class="body">
      <p class="muted">${tr({ en: 'Detection limit (LOR) drives below-detection values and the blank check; the strip-log threshold fills grades above it in brass; high grade flags blanks that follow a high-grade sample.', mn: 'Илрүүлэх хязгаар (LOR) нь илрүүлэхээс бага утга ба blank шалгалтад; баганан логийн босгоос дээш агуулгыг шараар будна; өндөр агуулгын босго нь түүний дараах blank-ийг тэмдэглэнэ.' })}</p>
      <div class="tbl-wrap" style="max-height:420px">
        <table class="tbl">
          <thead><tr><th>${tr({ en: 'Element', mn: 'Элемент' })}</th><th>${tr({ en: 'Method', mn: 'Арга' })}</th><th class="num">LOR</th><th class="num">${tr({ en: 'Strip-log threshold', mn: 'Логийн босго' })}</th><th class="num">${tr({ en: 'High grade', mn: 'Өндөр агуулга' })}</th></tr></thead>
          <tbody>
            ${keys.map((k) => html`<tr><td><b class="mono">${elementLabel(k)}</b> <span class="muted mono" style="font-size:11px">${k}</span></td>${cell(k, 'method', false)}${cell(k, 'lor')}${cell(k, 'threshold')}${cell(k, 'highGrade')}</tr>`)}
          </tbody>
        </table>
      </div>
    </div>
  </section>`;
}

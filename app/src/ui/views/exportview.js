// Export: Leapfrog Geo CSV set, MX Deposit-ready CSVs (+ a report of every
// change ORD made for MX), full JSON backup, and restore-from-backup (merge).
import { html, useState, useMemo } from '../../lib.js';
import { S, holes, importProjectJSON } from '../../core/store.js';
import { natCmp } from '../../core/util.js';
import { exportZip, mxExport, readBackup } from '../../core/export.js';
import { tr } from '../../i18n.js';
import { Icon } from '../icons.js';
import { useStore, Button, Pill, PageHead, Empty, toast, pickFile, saveFile, injectCSS, openModal } from '../kit.js';

injectCSS(
  'exportview',
  `
.exp-holes { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 2px 10px; max-height: 220px; overflow: auto; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
.exp-holes label { display: flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 12.5px; padding: 2px 0; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.exp-card { display: flex; flex-direction: column; }
.exp-card > .body { display: flex; flex-direction: column; gap: 12px; flex: 1; }
.exp-card .exp-go { margin-top: auto; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.exp-files { margin: 0; padding-left: 18px; font-size: 13px; color: var(--ink-2); }
.exp-files code { font-size: 12px; }
.exp-check { display: grid; gap: 4px; font-size: 13px; }
.exp-check div { display: flex; gap: 8px; align-items: center; }
.exp-head-ico { display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 8px; background: var(--accent-soft); color: var(--accent-2); flex: none; }
.exp-title { display: flex; gap: 10px; align-items: center; }
`,
);

function HolePicker({ all, sel, setSel }) {
  const [q, setQ] = useState('');
  const prospects = useMemo(() => [...new Set(all.map((h) => h.prospect).filter(Boolean))].sort(natCmp), [all]);
  const shown = all.filter((h) => !q || h.holeId.toLowerCase().includes(q.toLowerCase()) || String(h.prospect || '').toLowerCase().includes(q.toLowerCase()));
  const selected = sel || new Set(all.map((h) => h.holeId));
  const toggle = (id) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSel(n);
  };
  return html`<div class="card">
    <header>
      <div>
        <h2>${tr({ en: 'Holes to export', mn: 'Экспортлох цооног' })}</h2>
        <p class="muted" style="font-size:13px">${tr({ en: '{n} of {t} selected — applies to Leapfrog and MX Deposit', mn: '{t}-аас {n} сонгосон — Leapfrog, MX Deposit-д хамаарна' }, { n: selected.size, t: all.length })}</p>
      </div>
      <div class="row">
        <input class="inp" type="search" placeholder=${tr({ en: 'Filter holes…', mn: 'Цооног шүүх…' })} value=${q} onInput=${(e) => setQ(e.target.value)} style="width:170px" aria-label=${tr({ en: 'Filter holes', mn: 'Цооног шүүх' })} />
        <${Button} size="sm" onClick=${() => setSel(new Set([...selected, ...shown.map((h) => h.holeId)]))}>${q ? tr({ en: 'Select shown', mn: 'Харагдаж буйг сонгох' }) : tr({ en: 'All', mn: 'Бүгд' })}<//>
        <${Button} size="sm" onClick=${() => setSel(q ? new Set([...selected].filter((id) => !shown.some((h) => h.holeId === id))) : new Set())}>${q ? tr({ en: 'Clear shown', mn: 'Харагдаж буйг цэвэрлэх' }) : tr({ en: 'None', mn: 'Аль нь ч биш' })}<//>
      </div>
    </header>
    <div class="body stack" style="gap:8px">
      ${prospects.length > 1
        ? html`<div class="chip-list">
            ${prospects.map(
              (p) => html`<button class="btn sm" key=${p} onClick=${() => setSel(new Set(all.filter((h) => h.prospect === p).map((h) => h.holeId)))}>${tr({ en: 'Only {p}', mn: 'Зөвхөн {p}' }, { p })}</button>`,
            )}
          </div>`
        : null}
      <div class="exp-holes">
        ${shown.map(
          (h) => html`<label key=${h.holeId} title=${[h.holeId, h.prospect, h.status].filter(Boolean).join(' · ')}>
            <input type="checkbox" checked=${selected.has(h.holeId)} onChange=${() => toggle(h.holeId)} />${h.holeId}
          </label>`,
        )}
      </div>
    </div>
  </div>`;
}

async function download(type, opts, what) {
  try {
    const z = exportZip(type, opts);
    const ok = await saveFile(z.fileName, z.blob || z.bytes, 'application/zip');
    if (ok) toast(tr({ en: '{w} saved: {f}', mn: '{w} хадгалагдлаа: {f}' }, { w: what, f: z.fileName }));
    return z;
  } catch (e) {
    console.error(e);
    toast(String(e.message || e), { kind: 'err' });
    return null;
  }
}

function CardHead({ icon, title, sub }) {
  return html`<header>
    <div class="exp-title">
      <span class="exp-head-ico"><${Icon} name=${icon} /></span>
      <div><h2>${title}</h2>${sub ? html`<p class="muted" style="font-size:12.5px">${sub}</p>` : null}</div>
    </div>
  </header>`;
}

function MxCheck({ report }) {
  const r = report;
  const item = (kind, text) => html`<div><${Pill} kind=${kind}>${kind === 'ok' ? '✓' : kind === 'err' ? '!' : '•'}<//><span>${text}</span></div>`;
  const pendingRows = r.fallbacks.reduce((s, f) => s + f.rows, 0);
  return html`<div class="exp-check">
    ${item(r.fills.length ? 'info' : 'ok', tr({ en: '{n} “Not measured” row(s) fill interval gaps', mn: 'Интервалын завсрыг {n} «Not measured» мөрөөр нөхнө' }, { n: r.fills.length }))}
    ${r.fallbacks.length
      ? item('info', tr({ en: 'Codes not yet in MX mapped in {n} row(s): {c}', mn: 'MX-д ороогүй кодыг {n} мөрөнд сольсон: {c}' }, { n: pendingRows, c: r.fallbacks.map((f) => `${f.code}→${f.to || '∅'}`).join(', ') }))
      : null}
    ${r.pendingKept.length ? item('err', tr({ en: 'Codes MX will reject (fallback off): {c}', mn: 'MX татгалзах код (fallback унтраалттай): {c}' }, { c: r.pendingKept.map((f) => f.code).join(', ') })) : null}
    ${r.longComments.length ? item('err', tr({ en: '{n} text value(s) longer than the MX limit — listed in the report, not cut', mn: 'MX-ийн хязгаараас урт {n} текст — тайланд жагсаасан, тайраагүй' }, { n: r.longComments.length })) : null}
    ${r.overlaps.length ? item('err', tr({ en: '{n} overlapping interval(s)', mn: '{n} давхацсан интервал' }, { n: r.overlaps.length })) : null}
    ${r.unknownCodes.length ? item('err', tr({ en: 'Codes not in ORD lists: {c}', mn: 'ORD-ийн жагсаалтад байхгүй код: {c}' }, { c: r.unknownCodes.map((u) => u.code).join(', ') })) : null}
    ${r.beyondEoh.length ? item('info', tr({ en: '{n} interval(s) past EOH', mn: 'EOH-оос хэтэрсэн {n} интервал' }, { n: r.beyondEoh.length })) : null}
    ${r.lonlatOutside.length ? item('info', tr({ en: '{n} collar(s) with lon/lat outside Mongolia', mn: 'Монголоос гадуур уртраг/өргөрөгтэй {n} цооног' }, { n: r.lonlatOutside.length })) : null}
    ${!r.blocking ? item('ok', tr({ en: 'Nothing MX Deposit would reject', mn: 'MX Deposit татгалзах зүйл алга' })) : null}
  </div>`;
}

async function restore() {
  const f = await pickFile({ accept: '.json,.zip', binary: true });
  if (!f) return;
  let data;
  try {
    data = await readBackup({ name: f.name, buffer: f.buffer });
  } catch (e) {
    toast(tr({ en: 'Not a backup ORD can read: {e}', mn: 'ORD унших боломжгүй нөөц файл: {e}' }, { e: e.message || e }), { kind: 'err' });
    return;
  }
  const { obj, summary: s } = data;
  const same = s.projectId && s.projectId === S.pid;
  const known = S.projects.some((p) => p.id === s.projectId);
  const choice = await openModal(
    (close) => html`<div class="dlg-body">
        <dl class="imp-kv" style="display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:13px">
          <dt class="muted">${tr({ en: 'Project', mn: 'Төсөл' })}</dt><dd style="margin:0"><strong>${s.project}</strong></dd>
          <dt class="muted">${tr({ en: 'Saved', mn: 'Хадгалсан' })}</dt><dd style="margin:0">${String(s.exported).replace('T', ' ').slice(0, 16)}</dd>
          <dt class="muted">${tr({ en: 'Contents', mn: 'Агуулга' })}</dt><dd style="margin:0">${tr({ en: '{h} holes · {l} lithology rows · {s} samples · {a} assay rows', mn: '{h} цооног · {l} литологийн мөр · {s} дээж · {a} шинжилгээ' }, { h: s.holes, l: s.lith, s: s.samples, a: s.assays })}</dd>
        </dl>
        <p style="font-size:13px">${tr({ en: 'Merging is safe: rows are combined row by row and the newer edit wins; nothing in ORD is deleted, and edit history is kept.', mn: 'Нэгтгэх нь аюулгүй: мөр мөрөөр нийлүүлж, шинэ засвар нь давуу; ORD-д юу ч устахгүй, засварын түүх хадгалагдана.' })}</p>
        ${!same && known ? html`<p class="muted" style="font-size:13px">${tr({ en: 'This backup belongs to another of your projects; merging opens that project.', mn: 'Энэ нөөц таны өөр төслийнх; нэгтгэвэл тэр төсөл нээгдэнэ.' })}</p>` : null}
        ${!known ? html`<p class="muted" style="font-size:13px">${tr({ en: 'This project is not on this device yet — it will be added.', mn: 'Энэ төсөл энэ төхөөрөмж дээр алга — нэмэгдэнэ.' })}</p>` : null}
      </div>
      <div class="dlg-actions">
        <${Button} onClick=${() => close(null)}>${tr({ en: 'Cancel', mn: 'Болих' })}<//>
        <${Button} onClick=${() => close('copy')}>${tr({ en: 'Restore as a separate copy', mn: 'Тусдаа хуулбараар сэргээх' })}<//>
        <${Button} kind="primary" onClick=${() => close('merge')}>${same ? tr({ en: 'Merge into this project', mn: 'Энэ төсөлд нэгтгэх' }) : tr({ en: 'Merge', mn: 'Нэгтгэх' })}<//>
      </div>`,
    { title: tr({ en: 'Restore from backup', mn: 'Нөөцөөс сэргээх' }) },
  );
  if (!choice) return;
  try {
    const res = await importProjectJSON(obj, { asNew: choice === 'copy' });
    toast(tr({ en: 'Backup merged into “{p}” ({n} documents changed)', mn: 'Нөөцийг «{p}»-д нэгтгэлээ ({n} баримт өөрчлөгдсөн)' }, { p: res.project?.name || s.project, n: res.docs }));
  } catch (e) {
    console.error(e);
    toast(String(e.message || e), { kind: 'err' });
  }
}

export function ExportView() {
  const rev = useStore();
  const all = holes();
  const [sel, setSel] = useState(null);
  const [fallback, setFallback] = useState(true);
  const [busy, setBusy] = useState('');
  const holeIds = sel ? all.map((h) => h.holeId).filter((id) => sel.has(id)) : undefined;
  const count = holeIds ? holeIds.length : all.length;
  const mxCheck = useMemo(() => (count ? mxExport({ holeIds, fallbackPendingCodes: fallback }).report : null), [rev, sel, fallback, count]);

  if (!S.pid) return html`<${Empty} icon="folder" title=${tr({ en: 'Open a project first', mn: 'Эхлээд төсөл нээнэ үү' })} />`;
  const go = async (type, opts, what) => {
    setBusy(type);
    await download(type, opts, what);
    setBusy('');
  };

  return html`<div class="stack" style="max-width:1200px">
    <${PageHead}
      title=${tr({ en: 'Export', mn: 'Экспорт' })}
      sub=${tr({ en: 'Every export is one ZIP file. MX Deposit files are made to import first time, with a report of every change ORD made for MX.', mn: 'Экспорт бүр нэг ZIP файл. MX Deposit-ийн файлуудыг анхны оролдлогоор орохоор бэлдэж, ORD-ийн хийсэн өөрчлөлт бүрийг тайланд бичнэ.' })}
    />
    ${all.length ? html`<${HolePicker} all=${all} sel=${sel} setSel=${setSel} />` : html`<${Empty} icon="holes" title=${tr({ en: 'No holes in this project yet', mn: 'Энэ төсөлд цооног алга' })} />`}
    <div class="grid2">
      <div class="card exp-card">
        <${CardHead} icon="cube" title="Leapfrog Geo" sub=${tr({ en: 'Drillhole CSVs for Leapfrog’s import wizard', mn: 'Leapfrog-ийн импортод зориулсан CSV' })} />
        <div class="body">
          <ul class="exp-files">
            <li><code>collar.csv</code>, <code>survey.csv</code> ${tr({ en: '(excluded readings left out)', mn: '(хассан хэмжилтгүй)' })}</li>
            <li><code>lithology.csv</code> ${tr({ en: 'with rock names', mn: 'чулуулгийн нэртэй' })}, <code>recovery.csv</code> ${tr({ en: 'with recovery / RQD %', mn: 'авралт / RQD %-тай' })}</li>
            <li><code>structure.csv</code> ${tr({ en: 'with true dip / dip direction', mn: 'жинхэнэ налуу, налуугийн чиглэлтэй' })}</li>
            <li><code>samples_assays.csv</code> ${tr({ en: '(one column per element), QC samples separately', mn: '(элемент бүр багана), QC дээж тусдаа' })}</li>
            <li><code>pxrf.csv</code>, <code>density_magsus.csv</code></li>
          </ul>
          <p class="muted" style="font-size:12.5px">${tr({ en: 'Headers are ORD field names; depths have 3 decimals.', mn: 'Толгой нь ORD-ийн талбарын нэр; гүн 3 оронтой.' })}</p>
          <div class="exp-go">
            <${Button} kind="primary" icon="download" disabled=${!count || busy} onClick=${() => go('leapfrog', { holeIds }, 'Leapfrog')}>${tr({ en: 'Download ZIP ({n} holes)', mn: 'ZIP татах ({n} цооног)' }, { n: count })}<//>
          </div>
        </div>
      </div>

      <div class="card exp-card">
        <${CardHead} icon="upload" title="MX Deposit" sub=${tr({ en: 'One CSV per MX table, in import order', mn: 'MX хүснэгт бүрт нэг CSV, импортлох дарааллаар' })} />
        <div class="body">
          <ul class="exp-files">
            <li>${tr({ en: 'MX column headers; calculated columns (Rock name, Total SLF, Run length, Core loss, Recovered %) left out', mn: 'MX-ийн баганын нэр; тооцоолдог баганыг (Rock name, Total SLF, Run length, Core loss, Recovered %) оруулахгүй' })}</li>
            <li>${tr({ en: 'Interval gaps filled with “Not measured” rows from 0 m to EOH', mn: 'Интервалын завсрыг 0 м-ээс EOH хүртэл «Not measured» мөрөөр нөхнө' })}</li>
            <li>${tr({ en: 'Longitude/latitude ≤ 8 decimals; long comments flagged in the report, never cut', mn: 'Уртраг/өргөрөг ≤ 8 орон; урт тайлбарыг тайланд тэмдэглэнэ, тайрахгүй' })}</li>
            <li><code>export_report.md</code> — ${tr({ en: 'every change and everything MX would reject', mn: 'өөрчлөлт бүр, MX татгалзах бүх зүйл' })}</li>
          </ul>
          <label class="check" style="align-items:flex-start">
            <input type="checkbox" checked=${fallback} onChange=${(e) => setFallback(e.target.checked)} style="margin-top:3px" />
            <span>
              <strong>${tr({ en: 'Map codes not yet in the MX lists', mn: 'MX жагсаалтад ороогүй кодыг солих' })}</strong><br />
              <small class="muted">${tr({ en: 'FRHYF → FRHY, SCHRF → SCHR, texture VUG → blank. ORD keeps the real codes; switch off once they are added in MX.', mn: 'FRHYF → FRHY, SCHRF → SCHR, текстур VUG → хоосон. ORD жинхэнэ кодоо хадгална; MX-д нэмэгдсэний дараа унтраана.' })}</small>
            </span>
          </label>
          ${mxCheck ? html`<${MxCheck} report=${mxCheck} />` : null}
          <div class="exp-go">
            <${Button} kind="primary" icon="download" disabled=${!count || busy} onClick=${() => go('mx', { holeIds, fallbackPendingCodes: fallback }, 'MX Deposit')}>${tr({ en: 'Download ZIP ({n} holes)', mn: 'ZIP татах ({n} цооног)' }, { n: count })}<//>
          </div>
        </div>
      </div>

      <div class="card exp-card">
        <${CardHead} icon="shield" title=${tr({ en: 'Full backup', mn: 'Бүрэн нөөц' })} sub=${tr({ en: 'The whole project, including edit history', mn: 'Төслийг бүхэлд нь, засварын түүхтэй нь' })} />
        <div class="body">
          <p style="font-size:13px">${tr({ en: 'A JSON snapshot of every table, code list, setting and change history (in a ZIP). Keep one before big imports, or use it to hand a project to a colleague who works offline.', mn: 'Бүх хүснэгт, кодын жагсаалт, тохиргоо, өөрчлөлтийн түүхийн JSON хуулбар (ZIP дотор). Том импортын өмнө хадгалах, эсвэл офлайн ажилладаг хамт олонд төслөө шилжүүлэхэд хэрэглэнэ.' })}</p>
          <div class="exp-go">
            <${Button} kind="primary" icon="download" disabled=${!!busy} onClick=${() => go('backup', {}, tr({ en: 'Backup', mn: 'Нөөц' }))}>${tr({ en: 'Download backup', mn: 'Нөөц татах' })}<//>
          </div>
        </div>
      </div>

      <div class="card exp-card">
        <${CardHead} icon="history" title=${tr({ en: 'Restore from backup', mn: 'Нөөцөөс сэргээх' })} sub=${tr({ en: 'Merge a backup (.json or .zip)', mn: 'Нөөцийг нэгтгэх (.json эсвэл .zip)' })} />
        <div class="body">
          <p style="font-size:13px">${tr({ en: 'Rows are merged one by one and the newer edit wins, so restoring never wipes work done since the backup. You can also restore it as a separate copy to compare.', mn: 'Мөрүүдийг нэг бүрчлэн нэгтгэж, шинэ засвар давуу тул сэргээлт нь нөөцөөс хойш хийсэн ажлыг устгахгүй. Харьцуулах бол тусдаа хуулбараар сэргээж болно.' })}</p>
          <div class="exp-go">
            <${Button} icon="upload" onClick=${restore}>${tr({ en: 'Choose backup file…', mn: 'Нөөц файл сонгох…' })}<//>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

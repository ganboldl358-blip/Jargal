// Projects (open / create / load datasets / backup) and the MX Deposit comparison.
import { html, useState } from '../../lib.js';
import { S, createProject, openProject, deleteProject, renameProject, importProjectJSON, exportProjectJSON, holes, flushNow } from '../../core/store.js';
import { timeAgo, todayISO } from '../../core/util.js';
import { tr, t } from '../../i18n.js';
import { Icon, Logo } from '../icons.js';
import { useStore, Button, Pill, PageHead, Empty, confirmDialog, promptDialog, toast, navigate, pickFile, saveFile, injectCSS, Field } from '../kit.js';

injectCSS(
  'projects',
  `
.proj-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: 12px; }
.proj { display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.proj.cur { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
.proj h3 { font-size: 15px; }
.proj .row { gap: 6px; }
.hero-row { display: flex; gap: 16px; align-items: center; }
.vs td, .vs th { vertical-align: top; }
.vs td:first-child { font-weight: 600; width: 22%; }
.vs td.mx { color: var(--muted); width: 32%; }
.vs td.ord { width: 46%; }
.vs .ico { display: inline-block; vertical-align: -3px; margin-right: 4px; }
`,
);

async function loadDataset(kind) {
  try {
    if (kind === 'demo') {
      await createProject({ name: 'Red Hill demo (synthetic)', demo: true });
      const { buildDemo } = await import('../../core/demo.js');
      buildDemo();
      await flushNow();
      toast(tr({ en: 'Demo project ready', mn: 'Туршилтын төсөл бэлэн' }));
      navigate('#/');
    } else if (kind === 'oval') {
      const { readOvalSources, loadOval, OVAL_FILES } = await import('../../core/oval.js');
      let src;
      try {
        src = await readOvalSources();
      } catch {
        // not shipped with this copy of ORD: ask for the files from database/csv
        const ok = await confirmDialog({
          title: tr({ en: 'Choose the Oval CSV files', mn: 'Oval CSV файлуудыг сонгоно уу' }),
          body: tr({ en: 'Select these four files from the repository folder database/csv: {f}', mn: 'Репогийн database/csv хавтаснаас эдгээр дөрвөн файлыг сонгоно уу: {f}' }, { f: OVAL_FILES.join(', ') }),
          ok: tr({ en: 'Choose files', mn: 'Файл сонгох' }),
        });
        if (!ok) return;
        const files = await new Promise((resolve) => {
          const inp = document.createElement('input');
          inp.type = 'file';
          inp.multiple = true;
          inp.accept = '.csv';
          inp.onchange = () => resolve([...(inp.files || [])]);
          inp.click();
        });
        if (!files.length) return;
        src = await readOvalSources(files);
      }
      await createProject({ name: 'Oval (Yambat) – repository database', description: 'database/csv from the Jargal repository' });
      const r = await loadOval(src);
      await flushNow();
      toast(tr({ en: 'Loaded {h} holes, {s} samples, {a} assay records', mn: '{h} цооног, {s} дээж, {a} шинжилгээ ачааллаа' }, { h: r.holes, s: r.samples, a: r.assays }));
      navigate('#/holes');
    }
  } catch (e) {
    console.error(e);
    toast(tr({ en: 'Could not load: {e}', mn: 'Ачаалж чадсангүй: {e}' }, { e: e.message || e }), { kind: 'err', ms: 8000 });
  }
}

export function ProjectsView() {
  useStore();
  const [name, setName] = useState('');
  const [me, setMe] = useState(S.user.name || '');
  const list = [...S.projects].sort((a, b) => (b.updated || 0) - (a.updated || 0));
  const cloud = S.status.cloud === 'live';

  const create = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    await createProject({ name: n });
    setName('');
    toast(tr({ en: 'Project created', mn: 'Төсөл үүслээ' }));
    navigate('#/holes');
  };

  return html`<div class="stack" style="max-width:1100px">
    <div class="hero-row">
      <${Logo} size=${44} />
      <div>
        <h1 style="font-family:var(--display);font-weight:600">ORD</h1>
        <p class="muted">${tr({ en: 'Drillhole logging, sampling, QA/QC and 3D — built to replace MX Deposit for our projects.', mn: 'Цооногийн логлолт, дээжлэлт, QA/QC, 3D — манай төслүүдэд MX Deposit-ийг орлох зорилгоор бүтээсэн.' })}</p>
      </div>
    </div>

    <section class="card">
      <header>
        <h2>${t('projects')}</h2>
        <span class="muted">${cloud ? tr({ en: 'Shared with your organisation · live', mn: 'Байгууллагатайгаа хуваалцсан · шууд' }) : tr({ en: 'Stored in this browser · works offline', mn: 'Энэ хөтөч дээр хадгалагдана · интернетгүй ажиллана' })}</span>
      </header>
      <div class="body stack">
        ${list.length
          ? html`<div class="proj-list">
              ${list.map(
                (p) => html`<div class=${'proj' + (p.id === S.pid ? ' cur' : '')}>
                  <div class="row between">
                    <h3>${p.name}</h3>
                    ${p.id === S.pid ? html`<${Pill} kind="accent">${tr({ en: 'Open', mn: 'Нээлттэй' })}<//>` : null}
                    ${p.demo ? html`<${Pill} kind="brass">${tr({ en: 'Sample data', mn: 'Туршилтын' })}<//>` : null}
                  </div>
                  <div class="muted" style="font-size:12.5px">
                    ${p.id === S.pid ? `${holes().length} ${tr({ en: 'holes', mn: 'цооног' })} · ` : ''}${tr({ en: 'updated', mn: 'шинэчилсэн' })} ${timeAgo(p.updated || p.created, S.lang)}
                  </div>
                  <div class="row">
                    ${p.id !== S.pid
                      ? html`<${Button} size="sm" kind="primary" onClick=${async () => {
                          await openProject(p.id);
                          navigate('#/');
                        }}>${tr({ en: 'Open', mn: 'Нээх' })}<//>`
                      : html`<${Button} size="sm" kind="primary" onClick=${() => navigate('#/')}>${t('dashboard')}<//>`}
                    <${Button}
                      size="sm"
                      onClick=${async () => {
                        const v = await promptDialog({ title: tr({ en: 'Rename project', mn: 'Төслийн нэр солих' }), label: tr({ en: 'Name', mn: 'Нэр' }), value: p.name });
                        if (v) renameProject(p.id, v);
                      }}
                      >${tr({ en: 'Rename', mn: 'Нэр солих' })}<//
                    >
                    ${p.id === S.pid
                      ? html`<${Button} size="sm" icon="download" onClick=${() => saveFile(`ORD_${p.name.replace(/[^\w.-]+/g, '_')}_${todayISO()}.json`, JSON.stringify(exportProjectJSON()), 'application/json')}>${tr({ en: 'Backup', mn: 'Нөөц' })}<//>`
                      : null}
                    <${Button}
                      size="sm"
                      icon="trash"
                      kind="ghost"
                      onClick=${async () => {
                        const ok = await confirmDialog({
                          title: tr({ en: 'Delete project "{n}"?', mn: '«{n}» төслийг устгах уу?' }, { n: p.name }),
                          body: cloud
                            ? tr({ en: 'This deletes it for everyone in your organisation. Download a backup first if unsure.', mn: 'Байгууллагын бүх хүнд устна. Эргэлзэж байвал эхлээд нөөц татаж аваарай.' })
                            : tr({ en: 'This removes it from this browser. Download a backup first if unsure.', mn: 'Энэ хөтчөөс устна. Эргэлзэж байвал эхлээд нөөц татаж аваарай.' }),
                          ok: t('delete'),
                          danger: true,
                        });
                        if (ok) {
                          await deleteProject(p.id);
                          toast(tr({ en: 'Project deleted', mn: 'Төсөл устгагдлаа' }));
                        }
                      }}
                      title=${t('delete')}
                    />
                  </div>
                </div>`,
              )}
            </div>`
          : html`<${Empty} icon="folder" title=${tr({ en: 'No projects yet', mn: 'Төсөл алга' })} />`}
        <form class="row" onSubmit=${create}>
          <input class="inp" id="new-project" style="flex:1;min-width:200px" placeholder=${tr({ en: 'New project name, e.g. Maikhan Uul 2026', mn: 'Шинэ төслийн нэр, ж: Майхан уул 2026' })} value=${name} onInput=${(e) => setName(e.target.value)} />
          <${Button} kind="primary" type="submit" icon="plus">${tr({ en: 'Create project', mn: 'Төсөл үүсгэх' })}<//>
        </form>
      </div>
    </section>

    <div class="grid3">
      <button class="option-card" onClick=${() => loadDataset('oval')}>
        <${Icon} name="holes" size=${22} />
        <b>${tr({ en: 'Oval (Yambat) database', mn: 'Oval (Ямбат) мэдээллийн сан' })}</b>
        <small>${tr({ en: 'Real data from this repository: 76 collars, 1,990 survey stations, drill-core petrography samples and their assay suite (UTM 46N).', mn: 'Энэ репогийн бодит өгөгдөл: 76 цооног, 1,990 гүний хэмжилт, кернийн петрографийн дээж, шинжилгээ (UTM 46N).' })}</small>
      </button>
      <button class="option-card" onClick=${() => loadDataset('demo')}>
        <${Icon} name="sparkle" size=${22} />
        <b>${tr({ en: 'Red Hill demo (synthetic)', mn: 'Red Hill туршилт (зохиомол)' })}</b>
        <small>${tr({ en: 'Made-up VMS-style project with full logging, QC, assays and a few seeded mistakes — to try every feature safely.', mn: 'Бүрэн лог, QC, шинжилгээтэй, цөөн санаатай алдаатай зохиомол төсөл — бүх боломжийг аюулгүй туршихад.' })}</small>
      </button>
      <button
        class="option-card"
        onClick=${async () => {
          const f = await pickFile({ accept: '.json,application/json' });
          if (!f) return;
          try {
            const r = await importProjectJSON(JSON.parse(f.text));
            toast(tr({ en: 'Restored "{n}" ({d} documents merged)', mn: '«{n}» сэргээлээ ({d} баримт нэгтгэсэн)' }, { n: r.project.name, d: r.docs }));
            navigate('#/');
          } catch (e) {
            toast(String(e.message || e), { kind: 'err' });
          }
        }}
      >
        <${Icon} name="upload" size=${22} />
        <b>${tr({ en: 'Restore / merge a backup', mn: 'Нөөцөөс сэргээх / нэгтгэх' })}</b>
        <small>${tr({ en: 'Open an ORD .json backup. If the project exists, changes are merged row by row — newest edit wins.', mn: 'ORD .json нөөц нээх. Төсөл байгаа бол мөр бүрээр нэгтгэнэ — хамгийн сүүлийн засвар давуу.' })}</small>
      </button>
    </div>

    ${!cloud
      ? html`<section class="card">
          <header><h2>${tr({ en: 'Your name', mn: 'Таны нэр' })}</h2></header>
          <form class="body row" onSubmit=${(e) => {
            e.preventDefault();
            S.user.name = me.trim();
            try {
              localStorage.setItem('ord.userName', S.user.name);
            } catch {}
            toast(tr({ en: 'Saved — your changes are recorded under this name.', mn: 'Хадгаллаа — таны өөрчлөлт энэ нэрээр бүртгэгдэнэ.' }));
          }}>
            <input class="inp" id="me-name" style="flex:1;min-width:200px" value=${me} placeholder=${tr({ en: 'e.g. L. Jargal', mn: 'ж: Л.Жаргал' })} onInput=${(e) => setMe(e.target.value)} />
            <${Button} type="submit">${t('save')}<//>
          </form>
        </section>`
      : null}
  </div>`;
}

const VS = [
  {
    f: { en: 'Import', mn: 'Импорт' },
    mx: { en: 'Job runs blind; can report "Succeeded" with 0 rows when a hole is assigned/locked.', mn: 'Job сохроор ажиллана; цооног assign/lock-той бол «Succeeded» гээд 0 мөр оруулж болно.' },
    ord: { en: 'Dry run first: every new, changed and rejected row is listed with the reason before anything is written.', mn: 'Эхлээд урьдчилсан шалгалт: шинэ, өөрчлөгдөх, татгалзсан мөр бүрийг шалтгаантай нь харуулсны дараа л бичнэ.' },
  },
  {
    f: { en: 'Empty cells on update', mn: 'Шинэчлэлтийн хоосон нүд' },
    mx: { en: 'An empty cell in an ID-update CSV erases the stored value.', mn: 'ID-update CSV-ийн хоосон нүд хадгалсан утгыг арилгана.' },
    ord: { en: 'Empty cells keep existing values by default; clearing is an explicit option.', mn: 'Хоосон нүд одоогийн утгыг хадгална; арилгах нь тусдаа сонголт.' },
  },
  {
    f: { en: 'Delete & undo', mn: 'Устгах, буцаах' },
    mx: { en: 'Rows cannot be deleted by import; re-imports append duplicates.', mn: 'Импортоор мөр устгах боломжгүй; дахин импорт давхардал нэмнэ.' },
    ord: { en: 'Delete, split, merge in the grid; every edit and every whole import can be undone; full per-row history.', mn: 'Гридэд устгах, хуваах, нэгтгэх; засвар бүр, импорт бүрийг бүтнээр нь буцаана; мөр бүрийн бүрэн түүх.' },
  },
  {
    f: { en: 'Codes', mn: 'Кодууд' },
    mx: { en: 'Unknown list codes make the job fail or leave the value blank.', mn: 'Жагсаалтад байхгүй код job-ыг унагаах эсвэл утгыг хоосон үлдээнэ.' },
    ord: { en: 'Unknown codes are shown before import and can be added to the list in one click; do-not-use codes (MT, AHGO) are flagged.', mn: 'Үл мэдэгдэх кодыг импортын өмнө харуулж, нэг товчоор жагсаалтад нэмнэ; «бүү ашигла» кодыг (MT, AHGO) тэмдэглэнэ.' },
  },
  {
    f: { en: 'Gaps & overlaps', mn: 'Завсар, давхцал' },
    mx: { en: 'Gaps are rejected; "Not measured" rows are typed by hand.', mn: 'Завсрыг хүлээж авахгүй; «Not measured» мөрийг гараар бичнэ.' },
    ord: { en: 'Shown live on the row; one click fills gaps; the MX export adds "Not measured" rows automatically.', mn: 'Мөр дээр шууд харагдана; нэг товчоор бөглөнө; MX export «Not measured» мөрийг автоматаар нэмнэ.' },
  },
  {
    f: { en: 'Data entry', mn: 'Өгөгдөл оруулах' },
    mx: { en: 'Old web grid cannot add or edit rows — import only.', mn: 'Хуучин веб грид мөр нэмэх, засах боломжгүй — зөвхөн импорт.' },
    ord: { en: 'Excel-like grid: paste blocks from Excel, fill down, code picker with meanings and colours, keyboard-only logging.', mn: 'Excel шиг грид: Excel-ээс блок paste, доош хуулах, утга, өнгөтэй код сонгогч, зөвхөн гараар логлох.' },
  },
  {
    f: { en: 'Sessions & offline', mn: 'Session, офлайн' },
    mx: { en: 'Session expires about hourly; needs Seequent ID sign-in.', mn: 'Session ойролцоогоор цаг тутам дуусна; Seequent ID нэвтрэлт шаардлагатай.' },
    ord: { en: 'No session timeout. Works offline in the core shed; shared live when opened in claude.ai.', mn: 'Session дуусахгүй. Кернийн агуулахад интернетгүй ажиллана; claude.ai-д нээхэд шууд хуваалцана.' },
  },
  {
    f: { en: 'Validation', mn: 'Шалгалт' },
    mx: { en: 'Basic interval checks at import.', mn: 'Импортын үеийн энгийн интервалын шалгалт.' },
    ord: { en: '36 rules live: EOH, dogleg, lon/lat swap, comment length, QC insertion, MU v4 chemistry rule for CMSQ (Al<1 %, S<5 %), MSUL/VMS vs logged sulphide %.', mn: '36 дүрэм шууд: EOH, dogleg, уртраг/өргөрөг солигдол, тайлбарын урт, QC оруулалт, CMSQ-ийн MU v4 химийн дүрэм (Al<1 %, S<5 %), MSUL/VMS ба логдсон сульфид %.' },
  },
  {
    f: { en: 'QA/QC & results', mn: 'QA/QC, үр дүн' },
    mx: { en: 'QC charts are limited; intercepts need other software.', mn: 'QC график хязгаартай; интерсептэд өөр программ хэрэгтэй.' },
    ord: { en: 'CRM control charts, blanks, duplicate HARD plots, batch accept/reject, ASX-style significant intercepts.', mn: 'CRM хяналтын график, blank, давхар дээжийн HARD, багцыг хүлээн авах/татгалзах, ASX маягийн интерсепт.' },
  },
  {
    f: { en: 'Visualisation', mn: 'Дүрслэл' },
    mx: { en: 'Needs Leapfrog for 3D and sections.', mn: '3D, огтлолд Leapfrog хэрэгтэй.' },
    ord: { en: 'Strip logs, plan map, cross-sections and 3D built in; Leapfrog-ready export.', mn: 'Баганан лог, план зураг, огтлол, 3D суурилуулсан; Leapfrog-т бэлэн export.' },
  },
  {
    f: { en: 'Language & ownership', mn: 'Хэл, эзэмшил' },
    mx: { en: 'English UI; data inside a vendor cloud.', mn: 'Англи интерфейс; өгөгдөл нийлүүлэгчийн cloud-д.' },
    ord: { en: 'Монгол / English; plain CSV / JSON / ZIP out at any time.', mn: 'Монгол / English; хүссэн үедээ CSV / JSON / ZIP-ээр гаргана.' },
  },
];

const STILL = [
  { en: 'Organisation-level administration and role permissions', mn: 'Байгууллагын түвшний удирдлага, эрхийн тохиргоо' },
  { en: 'Direct Leapfrog Central / Seequent Evo connection', mn: 'Leapfrog Central / Seequent Evo-той шууд холболт' },
  { en: 'Native tablet app with years of field use', mn: 'Олон жил хээрт хэрэглэгдсэн tablet апп' },
  { en: 'Lab system integrations (direct certificate feeds)', mn: 'Лабораторийн системтэй шууд холболт' },
];

export function CompareView() {
  useStore();
  return html`<div class="stack" style="max-width:1100px">
    <${PageHead} title=${tr({ en: 'ORD vs MX Deposit', mn: 'ORD ба MX Deposit' })} sub=${tr({ en: 'Built around the problems we hit with MX Deposit on Maikhan Uul.', mn: 'Майхан ууланд MX Deposit-оор ажиллахад тулгарсан асуудлууд дээр суурилж бүтээсэн.' })} />
    <div class="tbl-wrap">
      <table class="tbl vs">
        <thead><tr><th></th><th>MX Deposit</th><th>ORD</th></tr></thead>
        <tbody>
          ${VS.map(
            (r) => html`<tr>
              <td>${tr(r.f)}</td>
              <td class="mx"><${Icon} name="x" size=${14} />${tr(r.mx)}</td>
              <td class="ord"><${Icon} name="check" size=${14} />${tr(r.ord)}</td>
            </tr>`,
          )}
        </tbody>
      </table>
    </div>
    <section class="card">
      <header><h2>${tr({ en: 'Where MX Deposit is still ahead', mn: 'MX Deposit давуу хэвээр байгаа зүйлс' })}</h2></header>
      <div class="body">
        <ul style="margin:0;padding-left:18px;display:grid;gap:4px">${STILL.map((s) => html`<li>${tr(s)}</li>`)}</ul>
        <p class="muted" style="margin-top:10px">${tr({ en: 'ORD exports MX-ready CSVs, so both can run side by side during the switch.', mn: 'ORD нь MX-д бэлэн CSV гаргадаг тул шилжилтийн үед хоёуланг зэрэг ашиглаж болно.' })}</p>
      </div>
    </section>
  </div>`;
}

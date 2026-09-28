// Import: a wizard that shows exactly what will happen before anything is
// written (file → columns → options → dry-run preview → import), plus a lab
// certificate tab. Every import is one batch with an Undo button.
import { html, useState, useMemo, useEffect } from '../../lib.js';
import { S, undoBatch, elementKeys } from '../../core/store.js';
import { TABLES, elementLabel } from '../../core/schema.js';
import { natCmp, isNum } from '../../core/util.js';
import * as IM from '../../core/importer.js';
import * as LAB from '../../core/lab.js';
import { tr } from '../../i18n.js';
import { Icon } from '../icons.js';
import { useStore, Button, Pill, PageHead, Tabs, Empty, Stat, toast, pickFile, injectCSS, navigate } from '../kit.js';

injectCSS(
  'importview',
  `
.imp-drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; padding: 28px 16px; border: 2px dashed var(--line-2); border-radius: var(--radius); background: var(--surface); color: var(--ink-2); cursor: pointer; }
.imp-drop:hover, .imp-drop.over { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-2); }
.imp-drop .ico { color: var(--accent); }
.imp-steps { display: flex; gap: 4px; flex-wrap: wrap; margin: 4px 0 14px; padding: 0; list-style: none; counter-reset: st; }
.imp-steps li { display: flex; align-items: center; gap: 6px; padding: 5px 10px 5px 6px; border-radius: 999px; font-size: 13px; color: var(--muted); background: var(--surface-2); }
.imp-steps li b { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--surface-3); color: var(--ink-2); font-size: 11.5px; }
.imp-steps li.on { background: var(--accent-soft); color: var(--accent-2); font-weight: 600; }
.imp-steps li.on b { background: var(--accent); color: var(--accent-ink); }
.imp-steps li.done b { background: var(--ok); color: #fff; }
.imp-steps button { all: unset; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.imp-map td { vertical-align: middle; }
.imp-map select.inp { width: 100%; min-width: 180px; }
.imp-map tr.calc td { color: var(--muted); }
.imp-map tr.req-missing td { background: var(--err-soft); }
.imp-sample { font-family: var(--mono); font-size: 12px; color: var(--ink-2); max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.imp-opt { display: grid; gap: 8px; }
.imp-opt label.choice { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; align-items: start; padding: 10px 12px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; background: var(--surface); }
.imp-opt label.choice:hover { border-color: var(--line-2); }
.imp-opt label.choice.on { border-color: var(--accent); background: var(--accent-soft); }
.imp-opt label.choice input { margin-top: 3px; }
.imp-opt label.choice small { grid-column: 2; color: var(--ink-2); }
details.imp-sec { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
details.imp-sec + details.imp-sec { margin-top: 8px; }
details.imp-sec > summary { cursor: pointer; padding: 9px 12px; font-weight: 600; display: flex; gap: 8px; align-items: center; list-style: none; }
details.imp-sec > summary::-webkit-details-marker { display: none; }
details.imp-sec > summary::before { content: '▸'; color: var(--muted); }
details.imp-sec[open] > summary::before { content: '▾'; }
details.imp-sec > .imp-sec-body { padding: 0 12px 12px; }
.imp-diff del { color: var(--err); text-decoration: line-through; background: var(--err-soft); padding: 0 3px; border-radius: 3px; }
.imp-diff ins { color: var(--ok); text-decoration: none; background: var(--ok-soft); padding: 0 3px; border-radius: 3px; }
.imp-diff .fld-name { color: var(--muted); font-size: 12px; margin-right: 4px; }
.imp-list { max-height: 360px; overflow: auto; }
.imp-banner { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 8px; background: var(--info-soft); color: var(--ink); }
.imp-banner.warn { background: var(--warn-soft); }
.imp-banner.err { background: var(--err-soft); }
.imp-banner.ok { background: var(--ok-soft); }
.imp-banner .ico { flex: none; margin-top: 2px; }
.imp-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: space-between; align-items: center; margin-top: 14px; }
.imp-paste { width: 100%; min-height: 90px; font-family: var(--mono); font-size: 12px; }
.imp-hole-links { display: flex; flex-wrap: wrap; gap: 6px; }
.imp-hole-links a { font-family: var(--mono); font-size: 12.5px; padding: 2px 8px; border: 1px solid var(--line-2); border-radius: 999px; text-decoration: none; }
.imp-hole-links a:hover { background: var(--accent-soft); }
.imp-flag { color: var(--warn); font-weight: 700; margin-right: 2px; }
.imp-kv { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; font-size: 13px; }
.imp-kv dt { color: var(--muted); }
.imp-kv dd { margin: 0; font-weight: 550; }
`,
);

// ------------------------------------------------------------ labels

const TABLE_KEYS = IM.IMPORT_ORDER.filter((t) => TABLES[t]);
const tableName = (t) => (t && TABLES[t] ? tr(TABLES[t].label) : tr({ en: '— skip —', mn: '— алгасах —' }));

const ISSUE_LABELS = {
  'key-unmapped': { en: 'Key column not mapped', mn: 'Түлхүүр багана сонгоогүй' },
  number: { en: 'Not a number', mn: 'Тоо биш' },
  date: { en: 'Not a date', mn: 'Огноо биш' },
  bool: { en: 'Not yes/no', mn: 'Тийм/үгүй биш' },
  'pct-range': { en: 'Percentage outside 0–100', mn: 'Хувь 0–100-аас гадуур' },
  'code-unknown': { en: 'Code not in the list', mn: 'Жагсаалтад байхгүй код' },
  'comment-long': { en: 'Text too long', mn: 'Текст хэт урт' },
  'hole-missing': { en: 'Hole ID empty', mn: 'Цооногийн дугаар хоосон' },
  'hole-not-found': { en: 'Hole not in the collar table', mn: 'Цооног collar хүснэгтэд алга' },
  'sample-not-found': { en: 'Sample not found', mn: 'Дээж олдсонгүй' },
  locked: { en: 'Hole locked', mn: 'Цооног түгжээтэй' },
  dup: { en: 'Duplicate in the file', mn: 'Файлд давхардсан' },
  required: { en: 'Required value missing', mn: 'Заавал бөглөх утга дутуу' },
  'no-values': { en: 'No values', mn: 'Утга алга' },
  'from-to': { en: 'From ≥ To', mn: 'Эхлэл ≥ Төгсгөл' },
  overlap: { en: 'Overlapping intervals', mn: 'Давхацсан интервал' },
  negative: { en: 'Negative depth', mn: 'Сөрөг гүн' },
  range: { en: 'Value out of range', mn: 'Утга хүрээнээс гадуур' },
  'lonlat-range': { en: 'Longitude/latitude out of range', mn: 'Уртраг/өргөрөг хүрээнээс гадуур' },
  'beyond-eoh': { en: 'Past end of hole', mn: 'Эцсийн гүнээс хэтэрсэн' },
  'code-warn': { en: 'Code marked “do not use”', mn: '«Бүү ашигла» код' },
  'code-inactive': { en: 'Inactive code', mn: 'Идэвхгүй код' },
  'code-kept': { en: 'Unknown code kept', mn: 'Үл мэдэгдэх кодыг үлдээсэн' },
  'codes-added': { en: 'Codes added to lists', mn: 'Жагсаалтад нэмэх код' },
  'comment-soft': { en: 'Long text (house style)', mn: 'Урт текст (дотоод журам)' },
  'lonlat-swapped': { en: 'Longitude/latitude swapped', mn: 'Уртраг/өргөрөг солигдсон' },
  'lonlat-swapped-fixed': { en: 'Longitude/latitude swap fixed', mn: 'Уртраг/өргөрөгийг зассан' },
  'lonlat-rounded': { en: 'Rounded to 8 decimals', mn: '8 орон хүртэл бөөрөнхийлсөн' },
  'en-degrees': { en: 'Easting/Northing look like degrees', mn: 'Easting/Northing градус шиг' },
  'hole-case': { en: 'Hole ID matched ignoring case/spaces', mn: 'Цоонгийг том/жижиг үсэг, зайг үл харгалзан тулгасан' },
  'clear-required': { en: 'Required value not cleared', mn: 'Заавал бөглөх утгыг устгаагүй' },
  recovery: { en: 'Recovered > run length', mn: 'Авсан > рейсийн урт' },
  rqd: { en: 'RQD > recovered', mn: 'RQD > авсан' },
  'sample-length': { en: 'Sample length outside settings', mn: 'Дээжийн урт тохиргооноос гадуур' },
  'replace-skipped': { en: 'Replace skipped for a hole with errors', mn: 'Алдаатай цооногийн мөрийг солиогүй' },
  'replace-na': { en: 'Replace does not apply', mn: 'Солих сонголт хамаарахгүй' },
  'calc-ignored': { en: 'Calculated columns ignored', mn: 'Тооцоолдог баганыг орхисон' },
  'unit-assumed': { en: 'Unit assumed', mn: 'Нэгжийг таамагласан' },
  unreadable: { en: 'Unreadable values', mn: 'Уншигдаагүй утга' },
  reimport: { en: 'Certificate imported before', mn: 'Сертификат өмнө орсон' },
  'job-other-cert': { en: 'Lab job under another certificate', mn: 'Лаб. ажил өөр сертификатаар орсон' },
  unmatched: { en: 'Samples not found', mn: 'Олдоогүй дээж' },
  'lab-qc': { en: 'Laboratory QC rows', mn: 'Лабораторийн QC мөр' },
  'lor-differs': { en: 'Detection limit differs', mn: 'Илрүүлэх хязгаар зөрүүтэй' },
  'no-certificate': { en: 'Certificate name missing', mn: 'Сертификатын нэр алга' },
  'no-elements': { en: 'No element columns', mn: 'Элементийн багана алга' },
};
const issueLabel = (code) => tr(ISSUE_LABELS[code] || { en: code, mn: code });
const msg = (e) => tr({ en: e.message, mn: e.mn || e.message });

const fmtVal = (v) => {
  if (v === null || v === undefined || v === '') return '∅';
  if (typeof v === 'boolean') return v ? tr({ en: 'yes', mn: 'тийм' }) : tr({ en: 'no', mn: 'үгүй' });
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

function fieldName(table, key) {
  if (key.startsWith('values.')) return elementLabel(key.slice(7));
  if (key.startsWith('flags.')) return `${elementLabel(key.slice(6))} ${tr({ en: 'flag', mn: 'тэмдэг' })}`;
  const f = IM.fieldOf(table, key);
  return f ? tr(f.label) : key;
}

// ------------------------------------------------------------ small parts

function DropZone({ onFile, accept, title, hint }) {
  const [over, setOver] = useState(false);
  const choose = async () => {
    const f = await pickFile({ accept, binary: true });
    if (f) onFile({ name: f.name, buffer: f.buffer });
  };
  return html`<div
    class=${'imp-drop' + (over ? ' over' : '')}
    role="button"
    tabindex="0"
    onClick=${choose}
    onKeyDown=${(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), choose())}
    onDragOver=${(e) => {
      e.preventDefault();
      setOver(true);
    }}
    onDragLeave=${() => setOver(false)}
    onDrop=${(e) => {
      e.preventDefault();
      setOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) onFile(f);
    }}
  >
    <${Icon} name="upload" size=${30} />
    <strong>${title || tr({ en: 'Drop a file here, or click to choose one', mn: 'Файлаа энд чирж оруулах, эсвэл дарж сонгоно уу' })}</strong>
    <span class="muted">${hint}</span>
  </div>`;
}

function Banner({ kind = 'info', icon, children }) {
  return html`<div class=${'imp-banner ' + kind}><${Icon} name=${icon || (kind === 'err' || kind === 'warn' ? 'alert' : kind === 'ok' ? 'check' : 'info')} /><div class="stack" style="gap:6px">${children}</div></div>`;
}

function Steps({ steps, cur, onGo }) {
  const idx = steps.findIndex((s) => s.key === cur);
  return html`<ol class="imp-steps" aria-label=${tr({ en: 'Import steps', mn: 'Импортын алхам' })}>
    ${steps.map(
      (s, i) => html`<li key=${s.key} class=${i === idx ? 'on' : i < idx ? 'done' : ''} aria-current=${i === idx ? 'step' : undefined}>
        ${i < idx && onGo ? html`<button onClick=${() => onGo(s.key)}><b>${i + 1}</b>${s.label}</button>` : html`<b>${i + 1}</b>${s.label}`}
      </li>`,
    )}
  </ol>`;
}

function Choice({ name, value, cur, onChange, title, children, type = 'radio' }) {
  const on = type === 'radio' ? cur === value : !!cur;
  return html`<label class=${'choice' + (on ? ' on' : '')}>
    <input type=${type} name=${name} checked=${on} onChange=${(e) => onChange(type === 'radio' ? value : e.target.checked)} />
    <strong>${title}</strong>
    <small>${children}</small>
  </label>`;
}

function IssueGroups({ list, kind }) {
  const groups = useMemo(() => {
    const m = new Map();
    for (const e of list) {
      if (!m.has(e.code)) m.set(e.code, []);
      m.get(e.code).push(e);
    }
    return [...m.entries()];
  }, [list]);
  if (!list.length) return null;
  return groups.map(
    ([code, items]) => html`<details class="imp-sec" key=${code} open=${groups.length === 1 && items.length <= 20}>
      <summary><${Pill} kind=${kind === 'error' ? 'err' : kind === 'info' ? 'info' : 'warn'}>${items.length}<//> ${issueLabel(code)}</summary>
      <div class="imp-sec-body imp-list">
        ${items.slice(0, 300).map(
          (e, i) => html`<div class=${'issue ' + (kind === 'error' ? 'error' : kind === 'info' ? 'info' : 'warn')} key=${i}>
            <${Icon} name=${kind === 'info' ? 'info' : 'alert'} size=${16} />
            <span>${e.rowNo ? html`<span class="mono muted">${tr({ en: 'row', mn: 'мөр' })} ${e.rowNo} · </span>` : null}${msg(e)}</span>
          </div>`,
        )}
        ${items.length > 300 ? html`<p class="muted">${tr({ en: '… and {n} more', mn: '… бас {n}' }, { n: items.length - 300 })}</p>` : null}
      </div>
    </details>`,
  );
}

function HoleLinks({ holes }) {
  if (!holes?.length) return null;
  return html`<div class="imp-hole-links">
    ${holes.slice(0, 200).map((h) => html`<a key=${h} href=${'#/hole/' + encodeURIComponent(h)}>${h}</a>`)}
    ${holes.length > 200 ? html`<span class="muted">+${holes.length - 200}</span>` : null}
  </div>`;
}

function sampleValues(sheet, header, n = 3) {
  const out = [];
  for (const r of sheet.rows) {
    const v = r[header];
    if (v !== '' && v !== null && v !== undefined) out.push(String(v));
    if (out.length >= n) break;
  }
  return out;
}

// ============================================================ data import

const DATA_STEPS = [
  { key: 'file', label: { en: 'File', mn: 'Файл' } },
  { key: 'map', label: { en: 'Columns', mn: 'Баганууд' } },
  { key: 'options', label: { en: 'Options', mn: 'Тохиргоо' } },
  { key: 'preview', label: { en: 'Preview', mn: 'Урьдчилан харах' } },
  { key: 'done', label: { en: 'Done', mn: 'Дууссан' } },
];

function makeItem(sh, i, table) {
  return { idx: i, include: !!table && sh.rows.length > 0, table: table || '', mapping: table ? IM.autoMap(table, sh.headers, { units: sh.units }) : {}, sheet: sh, lab: LAB.looksLikeLabCertificate(sh) };
}

function DataImport({ onLabFile }) {
  const rev = useStore();
  const [step, setStep] = useState('file');
  const [src, setSrc] = useState(null);
  const [items, setItems] = useState([]);
  const [opts, setOpts] = useState({ ...IM.DEFAULT_OPTIONS });
  const [skipErrors, setSkipErrors] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const [rawFile, setRawFile] = useState(null);

  const load = async (input, name) => {
    setBusy(true);
    try {
      const t = await IM.readTabular(input, { fileName: name });
      if (!t.sheets.length) throw new Error(tr({ en: 'The file has no rows', mn: 'Файлд мөр алга' }));
      setSrc(t);
      setRawFile(input);
      setItems(t.sheets.map((sh, i) => makeItem(sh, i, IM.guessTable(sh.name, sh.headers))));
      setResult(null);
      setSkipErrors(false);
      setStep('file');
    } catch (e) {
      console.error(e);
      toast(tr({ en: 'Could not read the file: {e}', mn: 'Файлыг уншиж чадсангүй: {e}' }, { e: e.message || e }), { kind: 'err' });
    }
    setBusy(false);
  };

  const setItem = (i, patch) => setItems((list) => list.map((it) => (it.idx === i ? { ...it, ...patch } : it)));
  const setTable = (i, table) => {
    const it = items.find((x) => x.idx === i);
    setItem(i, { table, include: !!table, mapping: table ? IM.autoMap(table, it.sheet.headers, { units: it.sheet.units }) : {} });
  };
  const active = items.filter((it) => it.include && it.table);
  const keyProblems = active.map((it) => ({ it, missing: IM.missingKeyFields(it.table, it.mapping) })).filter((x) => x.missing.length);

  const plans = useMemo(() => {
    if (step !== 'preview' || !active.length) return null;
    return IM.planWorkbook(
      active.map((it) => ({ table: it.table, rows: it.sheet.rows, rowNos: it.sheet.rowNos, mapping: it.mapping, sheetName: it.sheet.name, fileName: src?.fileName || '' })),
      opts,
    );
  }, [step, items, opts, rev]);

  const totals = useMemo(() => {
    if (!plans) return null;
    const s = { create: 0, update: 0, delete: 0, unchanged: 0, errors: 0, errorRows: 0, warnings: 0, writes: 0, fatal: false };
    for (const p of plans) {
      for (const k of ['create', 'update', 'delete', 'unchanged', 'errors', 'errorRows', 'warnings', 'writes']) s[k] += p.summary[k];
      if (p.summary.fatal) s.fatal = true;
    }
    return s;
  }, [plans]);

  const commit = () => {
    if (!plans) return;
    try {
      const res = IM.commitWorkbook(plans, { fileName: src?.fileName || tr({ en: 'pasted data', mn: 'хуулсан өгөгдөл' }) });
      setResult({ ...res, totals });
      setStep('done');
      toast(tr({ en: 'Imported — {n} changes', mn: 'Импортлов — {n} өөрчлөлт' }, { n: res.created + res.updated + res.deleted }));
    } catch (e) {
      console.error(e);
      toast(String(e.message || e), { kind: 'err' });
    }
  };

  const reset = () => {
    setSrc(null);
    setItems([]);
    setResult(null);
    setPaste('');
    setStep('file');
  };

  const steps = DATA_STEPS.map((s) => ({ ...s, label: tr(s.label) }));
  const goBack = step === 'done' ? null : (k) => setStep(k);

  return html`<div class="stack">
    <${Steps} steps=${steps} cur=${step} onGo=${goBack} />

    ${step === 'file' ? html`<${FileStep} busy=${busy} src=${src} items=${items} load=${load} paste=${paste} setPaste=${setPaste} setItem=${setItem} setTable=${setTable} onLab=${() => onLabFile(rawFile, src?.fileName)} />` : null}
    ${step === 'map' ? html`<${MapStep} items=${active} setItem=${setItem} />` : null}
    ${step === 'options' ? html`<${OptionsStep} opts=${opts} setOpts=${setOpts} items=${active} />` : null}
    ${step === 'preview' && plans ? html`<${PreviewStep} plans=${plans} totals=${totals} opts=${opts} setOpts=${setOpts} skipErrors=${skipErrors} setSkipErrors=${setSkipErrors} />` : null}
    ${step === 'done' && result ? html`<${DoneStep} result=${result} fileName=${src?.fileName} onAgain=${reset} />` : null}

    ${step !== 'done' && src
      ? html`<div class="imp-actions">
          <div class="row">
            ${step !== 'file' ? html`<${Button} icon="chevronLeft" onClick=${() => setStep(DATA_STEPS[DATA_STEPS.findIndex((s) => s.key === step) - 1].key)}>${tr({ en: 'Back', mn: 'Буцах' })}<//>` : null}
            <${Button} kind="ghost" onClick=${reset}>${tr({ en: 'Start over', mn: 'Дахин эхлэх' })}<//>
          </div>
          <div class="row">
            ${step === 'file'
              ? html`<${Button} kind="primary" disabled=${!active.length} onClick=${() => setStep('map')}>${tr({ en: 'Next: check columns', mn: 'Дараах: баганыг шалгах' })}<//>`
              : null}
            ${step === 'map'
              ? html`${keyProblems.length ? html`<span class="muted" style="font-size:13px">${tr({ en: 'Map the key columns first', mn: 'Эхлээд түлхүүр баганыг сонгоно уу' })}</span>` : null}
                  <${Button} kind="primary" disabled=${keyProblems.length > 0} onClick=${() => setStep('options')}>${tr({ en: 'Next: options', mn: 'Дараах: тохиргоо' })}<//>`
              : null}
            ${step === 'options' ? html`<${Button} kind="primary" icon="eye" onClick=${() => setStep('preview')}>${tr({ en: 'Preview (dry run — nothing is written)', mn: 'Урьдчилан харах (юу ч бичихгүй)' })}<//>` : null}
            ${step === 'preview' && totals
              ? html`<${Button} kind="primary" icon="upload" disabled=${!totals.writes || totals.fatal || (totals.errorRows > 0 && !skipErrors)} onClick=${commit}>
                  ${tr({ en: 'Import {n} changes', mn: '{n} өөрчлөлт импортлох' }, { n: totals.writes })}
                <//>`
              : null}
          </div>
        </div>`
      : null}
  </div>`;
}

function FileStep({ busy, src, items, load, paste, setPaste, setItem, setTable, onLab }) {
  const multi = items.length > 1;
  const allLab = items.length > 0 && items.every((it) => it.lab);
  return html`<div class="stack">
    <div class="grid2">
      <${DropZone}
        accept=".csv,.tsv,.txt,.xlsx,.xls,.xlsm"
        hint=${tr({ en: 'CSV, TSV or Excel (.xlsx / .xls). An MX Deposit export workbook imports all its sheets at once.', mn: 'CSV, TSV эсвэл Excel (.xlsx / .xls). MX Deposit-ийн экспорт ажлын номыг бүх sheet-тэй нь нэг дор оруулна.' })}
        onFile=${(f) => load(f)}
      />
      <div class="card">
        <header><h3>${tr({ en: 'Or paste from Excel', mn: 'Эсвэл Excel-ээс хуулж буулгах' })}</h3></header>
        <div class="body stack" style="gap:8px">
          <textarea class="inp imp-paste" placeholder=${tr({ en: 'Copy cells including the header row, then paste here (Ctrl+V)', mn: 'Толгой мөртэй нь нүднүүдийг хуулаад энд буулгана уу (Ctrl+V)' })} value=${paste} onInput=${(e) => setPaste(e.target.value)}></textarea>
          <div><${Button} disabled=${!paste.trim()} onClick=${() => load(paste, tr({ en: 'Pasted data', mn: 'Хуулсан өгөгдөл' }))}>${tr({ en: 'Use pasted data', mn: 'Хуулсан өгөгдлийг ашиглах' })}<//></div>
        </div>
      </div>
    </div>
    ${busy ? html`<p class="muted">${tr({ en: 'Reading…', mn: 'Уншиж байна…' })}</p>` : null}
    ${src
      ? html`<div class="card">
          <header>
            <div>
              <h2>${src.fileName || tr({ en: 'Pasted data', mn: 'Хуулсан өгөгдөл' })}</h2>
              <p class="muted" style="font-size:13px">${multi
                ? tr({ en: '{n} sheets. Tick the ones to import — they are imported together in dependency order (collar → survey → intervals → samples → assays) as one batch you can undo.', mn: '{n} sheet. Оруулахыг сонгоно уу — хамааралын дарааллаар (collar → survey → интервал → дээж → assay) нэг багц болж орох бөгөөд буцааж болно.' }, { n: items.length })
                : tr({ en: 'Check the table ORD guessed for this data.', mn: 'ORD-ийн таамагласан хүснэгтийг шалгана уу.' })}</p>
            </div>
          </header>
          <div class="body stack">
            ${allLab
              ? html`<${Banner} kind="warn">
                  <span>${tr({ en: 'This looks like a laboratory certificate. The Lab certificate tab reads units, methods and detection limits and matches samples.', mn: 'Энэ нь лабораторийн сертификат бололтой. «Лабораторийн сертификат» таб нь нэгж, арга, илрүүлэх хязгаарыг уншиж, дээжтэй тулгана.' })}</span>
                  <div><${Button} size="sm" icon="flask" onClick=${onLab}>${tr({ en: 'Open as lab certificate', mn: 'Лабораторийн сертификатаар нээх' })}<//></div>
                <//>`
              : null}
            <div class="tbl-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>${tr({ en: 'Import', mn: 'Оруулах' })}</th>
                    <th>${tr({ en: 'Sheet', mn: 'Sheet' })}</th>
                    <th class="num">${tr({ en: 'Rows', mn: 'Мөр' })}</th>
                    <th>${tr({ en: 'Into table', mn: 'Хүснэгт' })}</th>
                    <th>${tr({ en: 'Columns', mn: 'Баганууд' })}</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map(
                    (it) => html`<tr key=${it.idx}>
                      <td><input type="checkbox" aria-label=${it.sheet.name} checked=${it.include} disabled=${!it.table} onChange=${(e) => setItem(it.idx, { include: e.target.checked })} /></td>
                      <td>
                        <strong>${it.sheet.name}</strong>
                        ${it.sheet.headerRow > 0 ? html`<div class="muted" style="font-size:12px">${tr({ en: 'headers in row {r}', mn: 'толгой {r}-р мөрөнд' }, { r: it.sheet.headerRow + 1 })}${it.sheet.title ? ` · ${it.sheet.title.slice(0, 60)}` : ''}</div>` : null}
                      </td>
                      <td class="num">${it.sheet.rows.length}</td>
                      <td>
                        <select class="inp" value=${it.table} onChange=${(e) => setTable(it.idx, e.target.value)} aria-label=${tr({ en: 'Table', mn: 'Хүснэгт' })}>
                          <option value="">${tableName('')}</option>
                          ${TABLE_KEYS.map((t) => html`<option value=${t}>${tableName(t)}</option>`)}
                        </select>
                      </td>
                      <td class="muted" style="font-size:12px;max-width:380px">${it.sheet.headers.slice(0, 10).join(', ')}${it.sheet.headers.length > 10 ? ` … (+${it.sheet.headers.length - 10})` : ''}</td>
                    </tr>`,
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>`
      : html`<div class="grid3">
          ${[
            [{ en: 'Nothing is written until you confirm', mn: 'Та батлахаас өмнө юу ч бичигдэхгүй' }, { en: 'Every file goes through a dry run: new / updated / unchanged / errors, row by row.', mn: 'Файл бүр урьдчилан шалгагдана: шинэ / шинэчлэгдэх / өөрчлөгдөөгүй / алдаа, мөр бүрээр.' }],
            [{ en: 'Re-imports never duplicate', mn: 'Дахин импортлоход давхардахгүй' }, { en: 'Rows are matched by hole + depth or sample ID and updated in place; empty cells keep existing values.', mn: 'Мөрүүдийг цооног + гүн эсвэл дээжийн дугаараар тулгаж, байранд нь шинэчилнэ; хоосон нүд байгаа утгыг устгахгүй.' }],
            [{ en: 'One click to undo', mn: 'Нэг товшилтоор буцаах' }, { en: 'An import is one batch; undo it from the result card or the History page.', mn: 'Импорт бүр нэг багц; үр дүнгийн карт эсвэл «Түүх» хуудаснаас буцаана.' }],
          ].map(
            ([h, p]) => html`<div class="card"><div class="body stack" style="gap:4px"><h3>${tr(h)}</h3><p class="muted" style="font-size:13px">${tr(p)}</p></div></div>`,
          )}
        </div>`}
  </div>`;
}

function targetOptions(table, header, sheet, current) {
  const out = [{ value: 'ignore', label: tr({ en: '— ignore this column —', mn: '— энэ баганыг алгасах —' }) }];
  for (const f of IM.importFields(table)) {
    if (f.type === 'calc') continue;
    out.push({ value: f.key, label: `${tr(f.label)}${f.req ? ' *' : ''}${f.mx && f.mx !== tr(f.label) ? ` · ${f.mx}` : ''}` });
  }
  if (table === 'assays' || table === 'pxrf') {
    const keys = new Set(elementKeys(table));
    const e = IM.parseElementHeader(header, { unit: sheet.units?.[header], defaultUnit: 'ppm' });
    if (e?.key) keys.add(e.key);
    if (String(current).startsWith('values:')) keys.add(current.slice(7));
    for (const k of [...keys].sort(natCmp)) out.push({ value: 'values:' + k, label: `${tr({ en: 'Value', mn: 'Утга' })}: ${elementLabel(k)}` });
  }
  return out;
}

function MapCard({ it, setItem }) {
  const { table, sheet, mapping } = it;
  const missingKey = IM.missingKeyFields(table, mapping);
  const missingReq = IM.missingRequired(table, mapping).filter((k) => !missingKey.includes(k));
  const reqOf = (k) => (k === 'values' ? tr({ en: 'element values', mn: 'элементийн утга' }) : tr(IM.fieldOf(table, k)?.label) || k);
  const set = (h, v) => setItem(it.idx, { mapping: { ...mapping, [h]: v } });
  return html`<div class="card">
    <header>
      <h2>${sheet.name} → ${tableName(table)}</h2>
      <span class="muted" style="font-size:13px">${tr({ en: '{n} rows', mn: '{n} мөр' }, { n: sheet.rows.length })}</span>
    </header>
    <div class="body stack">
      ${missingKey.length
        ? html`<${Banner} kind="err">${tr({ en: 'Needed to match rows — choose a column for: {f}', mn: 'Мөрүүдийг тулгахад шаардлагатай — багана сонгоно уу: {f}' }, { f: missingKey.map(reqOf).join(', ') })}<//>`
        : null}
      ${missingReq.length
        ? html`<${Banner} kind="warn">${tr({ en: 'Required for new rows but not in the file: {f}. Existing rows can still be updated; new rows without them will be listed as errors.', mn: 'Шинэ мөрөнд заавал хэрэгтэй ч файлд алга: {f}. Байгаа мөрүүдийг шинэчилж болно; эдгээргүй шинэ мөрүүд алдаа болно.' }, { f: missingReq.map(reqOf).join(', ') })}<//>`
        : null}
      <div class="tbl-wrap">
        <table class="tbl imp-map">
          <thead>
            <tr>
              <th>${tr({ en: 'Column in file', mn: 'Файлын багана' })}</th>
              <th>${tr({ en: 'First values', mn: 'Эхний утгууд' })}</th>
              <th>${tr({ en: 'Goes into', mn: 'Хаана орох' })}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sheet.headers.map((h) => {
              const target = mapping[h] || 'ignore';
              const calc = IM.calcHeader(table, h);
              const note = IM.mappingNote(table, h, target, { units: sheet.units });
              const f = IM.fieldOf(table, target);
              return html`<tr key=${h} class=${calc ? 'calc' : ''}>
                <td><strong>${h}</strong>${sheet.units?.[h] ? html` <span class="muted">(${sheet.units[h]})</span>` : null}</td>
                <td><div class="imp-sample" title=${sampleValues(sheet, h, 6).join(' · ')}>${sampleValues(sheet, h).join(' · ') || html`<span class="muted">${tr({ en: '(empty)', mn: '(хоосон)' })}</span>`}</div></td>
                <td>
                  ${calc
                    ? html`<span class="muted">${tr({ en: 'not imported', mn: 'оруулахгүй' })}</span>`
                    : html`<select class="inp" value=${target} onChange=${(e) => set(h, e.target.value)} aria-label=${h}>
                        ${targetOptions(table, h, sheet, target).map((o) => html`<option value=${o.value}>${o.label}</option>`)}
                      </select>`}
                </td>
                <td>
                  ${calc ? html`<${Pill} kind="info" title=${tr({ en: 'ORD calculates this column itself', mn: 'ORD энэ баганыг өөрөө тооцдог' })}>${tr({ en: 'calculated in ORD — ignored', mn: 'ORD тооцдог — орхино' })}<//>` : null}
                  ${!calc && f?.req ? html`<${Pill} kind="accent">${tr({ en: 'required', mn: 'заавал' })}<//>` : null}
                  ${!calc && IM.fieldOf(table, target) && TABLES[table].match.includes(target) ? html`<${Pill} kind="brass">${tr({ en: 'match key', mn: 'тулгах түлхүүр' })}<//>` : null}
                  ${note === 'unit-assumed' ? html`<${Pill} kind="warn">${tr({ en: 'unit assumed ppm', mn: 'нэгжийг ppm гэж үзэв' })}<//>` : null}
                </td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function MapStep({ items, setItem }) {
  return html`<div class="stack">
    <p class="muted">${tr({ en: 'ORD matched the columns by name (MX Deposit headers, ORD field names and common synonyms). Check each one; * = required for new rows.', mn: 'ORD баганыг нэрээр нь тулгасан (MX Deposit-ийн толгой, ORD-ийн талбарын нэр, түгээмэл ижил нэрс). Тус бүрийг шалгана уу; * = шинэ мөрөнд заавал.' })}</p>
    ${items.map((it) => html`<${MapCard} key=${it.idx} it=${it} setItem=${setItem} />`)}
  </div>`;
}

function OptionsStep({ opts, setOpts, items }) {
  const set = (k) => (v) => setOpts({ ...opts, [k]: v });
  const replaceable = items.some((it) => IM.REPLACEABLE.has(it.table));
  const holeTables = items.some((it) => IM.isHoleTable(it.table) && it.table !== 'collar');
  return html`<div class="grid2">
    <div class="card">
      <header><h3>${tr({ en: 'Empty cells in the file', mn: 'Файлын хоосон нүд' })}</h3></header>
      <div class="body imp-opt">
        <${Choice} name="empty" value="keep" cur=${opts.emptyCells} onChange=${set('emptyCells')} title=${tr({ en: 'Keep existing values (recommended)', mn: 'Байгаа утгыг хадгалах (зөвлөмж)' })}>
          ${tr({ en: 'An empty cell never erases anything in ORD. (MX Deposit erases the value — the opposite.)', mn: 'Хоосон нүд ORD-д юу ч устгахгүй. (MX Deposit утгыг устгадаг — эсрэгээрээ.)' })}
        <//>
        <${Choice} name="empty" value="clear" cur=${opts.emptyCells} onChange=${set('emptyCells')} title=${tr({ en: 'Clear values', mn: 'Утгыг цэвэрлэх' })}>
          ${tr({ en: 'For rows that already exist, an empty cell erases the value in ORD. Use only for a complete, corrected file. Required values are never cleared.', mn: 'Байгаа мөрүүдэд хоосон нүд ORD дахь утгыг устгана. Зөвхөн бүрэн, засварласан файлд хэрэглэнэ. Заавал бөглөх утгыг устгахгүй.' })}
        <//>
      </div>
    </div>
    <div class="card">
      <header><h3>${tr({ en: 'Codes that are not in the code list', mn: 'Кодын жагсаалтад байхгүй код' })}</h3></header>
      <div class="body imp-opt">
        <${Choice} name="codes" value="reject" cur=${opts.unknownCodes} onChange=${set('unknownCodes')} title=${tr({ en: 'Reject those rows (recommended)', mn: 'Тэдгээр мөрийг оруулахгүй (зөвлөмж)' })}>
          ${tr({ en: 'The preview lists every unknown code and how often it occurs; you can still switch below.', mn: 'Урьдчилсан харагдац үл мэдэгдэх код бүрийг, хэдэн удаа гарсныг жагсаана; дараа нь сольж болно.' })}
        <//>
        <${Choice} name="codes" value="addToList" cur=${opts.unknownCodes} onChange=${set('unknownCodes')} title=${tr({ en: 'Add them to the code list', mn: 'Кодын жагсаалтад нэмэх' })}>
          ${tr({ en: 'New codes are added (marked “verify”, meaning empty) in the same batch, and the rows imported.', mn: 'Шинэ кодыг («шалгах» тэмдэгтэй, утгагүй) мөн багцад нэмж, мөрүүдийг оруулна.' })}
        <//>
        <${Choice} name="codes" value="keep" cur=${opts.unknownCodes} onChange=${set('unknownCodes')} title=${tr({ en: 'Import as typed', mn: 'Байгаагаар нь оруулах' })}>
          ${tr({ en: 'Rows are imported with the codes as they are; they show up on the Validation page to fix later.', mn: 'Мөрүүд кодтойгоо орно; «Шалгалт» хуудсанд харагдах тул дараа засна.' })}
        <//>
      </div>
    </div>
    ${replaceable
      ? html`<div class="card">
          <header><h3>${tr({ en: 'Re-importing a corrected log', mn: 'Засварласан логийг дахин оруулах' })}</h3></header>
          <div class="body imp-opt">
            <${Choice} type="checkbox" cur=${opts.replaceHoleIntervals} onChange=${set('replaceHoleIntervals')} title=${tr({ en: 'Replace the rows of each hole in the file', mn: 'Файлд буй цооног бүрийн мөрүүдийг солих' })}>
              ${tr({ en: 'For every hole in the file, rows of this table that are not in the file are deleted (e.g. intervals that were split or re-cut). Every delete is listed in the preview and undone with the import. Other holes are not touched. MX Deposit cannot delete rows by import and appends duplicates instead.', mn: 'Файлд буй цооног бүрийн, файлд байхгүй мөрүүдийг устгана (жишээ нь хуваасан, дахин хэмжсэн интервал). Устгах мөр бүрийг урьдчилан харуулж, импорттой хамт буцаана. Бусад цооногт хүрэхгүй. MX Deposit импортоор мөр устгаж чаддаггүй тул давхардал нэмдэг.' })}
            <//>
          </div>
        </div>`
      : null}
    ${holeTables
      ? html`<div class="card">
          <header><h3>${tr({ en: 'Holes that are not in ORD yet', mn: 'ORD-д хараахан байхгүй цооног' })}</h3></header>
          <div class="body imp-opt">
            <${Choice} type="checkbox" cur=${opts.createMissingHoles} onChange=${set('createMissingHoles')} title=${tr({ en: 'Create missing holes', mn: 'Байхгүй цоонгийг үүсгэх' })}>
              ${tr({ en: 'A collar is created for each unknown hole ID (status Planned, no coordinates — add them later). Off: those rows are listed as errors so a typo in a hole ID cannot create a new hole.', mn: 'Үл мэдэгдэх цооног бүрт collar үүсгэнэ (төлөв Төлөвлөсөн, солбицолгүй — дараа нь нэмнэ). Унтраалттай бол эдгээр мөр алдаа болж, цооногийн дугаарын үсгийн алдаа шинэ цооног үүсгэхгүй.' })}
            <//>
          </div>
        </div>`
      : null}
  </div>`;
}

function Diff({ table, changes }) {
  return html`<span class="imp-diff">
    ${Object.entries(changes).map(
      ([k, [a, b]]) => html`<span key=${k} style="margin-right:12px;display:inline-block"><span class="fld-name">${fieldName(table, k)}</span><del>${fmtVal(a)}</del> → <ins>${fmtVal(b)}</ins></span>`,
    )}
  </span>`;
}

function rowPreview(table, row) {
  const skip = new Set(['holeId', 'values', 'flags', ...TABLES[table].match]);
  const parts = [];
  for (const [k, v] of Object.entries(row)) {
    if (skip.has(k) || v === null || v === undefined || v === '') continue;
    parts.push(`${fieldName(table, k)}: ${fmtVal(v)}`);
    if (parts.length >= 6) break;
  }
  if (row.values) {
    for (const [k, v] of Object.entries(row.values).slice(0, 6)) parts.push(`${elementLabel(k)}: ${row.flags?.[k] || ''}${fmtVal(v)}`);
  }
  return parts.join(' · ');
}

function PlanCard({ plan, opts, setOpts }) {
  const s = plan.summary;
  const unknown = Object.entries(plan.unknownCodes);
  const swaps = plan.warnings.filter((w) => w.code === 'lonlat-swapped');
  const infoW = plan.warnings.filter((w) => ['calc-ignored', 'codes-added', 'lonlat-rounded', 'hole-case', 'lonlat-swapped-fixed'].includes(w.code));
  const realW = plan.warnings.filter((w) => !infoW.includes(w) && w.code !== 'lonlat-swapped');
  return html`<div class="card">
    <header>
      <h2>${plan.sheetName ? `${plan.sheetName} → ` : ''}${tableName(plan.table)}</h2>
      <span class="muted" style="font-size:13px">${tr({ en: '{n} rows in file', mn: 'файлд {n} мөр' }, { n: s.rows })}</span>
    </header>
    <div class="body stack">
      <div class="stats">
        <${Stat} label=${tr({ en: 'New', mn: 'Шинэ' })} value=${s.create} kind=${s.create ? 'ok' : ''} />
        <${Stat} label=${tr({ en: 'Updated', mn: 'Шинэчлэгдэх' })} value=${s.update} />
        <${Stat} label=${tr({ en: 'Unchanged', mn: 'Өөрчлөлтгүй' })} value=${s.unchanged} />
        ${s.delete ? html`<${Stat} label=${tr({ en: 'Deleted (replace)', mn: 'Устгах (солих)' })} value=${s.delete} kind="warn" />` : null}
        <${Stat} label=${tr({ en: 'Rows with errors', mn: 'Алдаатай мөр' })} value=${s.errorRows} kind=${s.errorRows ? 'err' : ''} sub=${s.errorRows ? tr({ en: 'not imported', mn: 'оруулахгүй' }) : null} />
        <${Stat} label=${tr({ en: 'Warnings', mn: 'Анхааруулга' })} value=${realW.length} kind=${realW.length ? 'warn' : ''} />
      </div>

      ${plan.fatal.length ? html`<${Banner} kind="err">${plan.fatal.map((f) => html`<span>${msg(f)}</span>`)}<//>` : null}

      ${plan.newHoles.length
        ? html`<${Banner} kind="info" icon="holes">
            <span>${tr({ en: '{n} new hole(s) will be created (status Planned, no coordinates):', mn: '{n} шинэ цооног үүснэ (төлөв Төлөвлөсөн, солбицолгүй):' }, { n: plan.newHoles.length })} <span class="mono">${plan.newHoles.join(', ')}</span></span>
          <//>`
        : null}

      ${swaps.length
        ? html`<${Banner} kind="warn">
            <span>${tr({ en: 'Longitude and latitude look swapped in {n} row(s) (Mongolia: longitude ≈ 87–120, latitude ≈ 41–52). They will not be imported unless swapped.', mn: '{n} мөрөнд уртраг, өргөрөг солигдсон бололтой (Монгол: уртраг ≈ 87–120, өргөрөг ≈ 41–52). Солихгүй бол оруулахгүй.' }, { n: swaps.length })}</span>
            <div><${Button} size="sm" onClick=${() => setOpts({ ...opts, swapLonLat: true })}>${tr({ en: 'Swap them for me', mn: 'Сольж өгөх' })}<//></div>
          <//>`
        : null}

      ${unknown.length
        ? html`<${Banner} kind=${opts.unknownCodes === 'reject' ? 'warn' : 'info'}>
            <strong>${tr({ en: 'Codes not in the code lists', mn: 'Кодын жагсаалтад байхгүй код' })}</strong>
            <div class="chip-list">
              ${unknown.flatMap(([list, m]) => Object.entries(m).map(([code, n]) => html`<${Pill} key=${list + code} kind="warn">${list}: <span class="mono">${code}</span> ×${n}<//>`))}
            </div>
            <div class="row">
              <span class="muted" style="font-size:13px">${opts.unknownCodes === 'reject' ? tr({ en: 'These rows are rejected. Instead:', mn: 'Эдгээр мөрийг оруулахгүй. Үүний оронд:' }) : opts.unknownCodes === 'addToList' ? tr({ en: 'These codes will be added to the lists.', mn: 'Эдгээр код жагсаалтад нэмэгдэнэ.' }) : tr({ en: 'Imported as typed.', mn: 'Байгаагаар нь орно.' })}</span>
              ${opts.unknownCodes !== 'addToList' ? html`<${Button} size="sm" onClick=${() => setOpts({ ...opts, unknownCodes: 'addToList' })}>${tr({ en: 'Add them to the lists', mn: 'Жагсаалтад нэмэх' })}<//>` : null}
              ${opts.unknownCodes !== 'reject' ? html`<${Button} size="sm" kind="ghost" onClick=${() => setOpts({ ...opts, unknownCodes: 'reject' })}>${tr({ en: 'Reject the rows', mn: 'Мөрүүдийг татгалзах' })}<//>` : null}
              ${opts.unknownCodes !== 'keep' ? html`<${Button} size="sm" kind="ghost" onClick=${() => setOpts({ ...opts, unknownCodes: 'keep' })}>${tr({ en: 'Keep as typed', mn: 'Байгаагаар нь' })}<//>` : null}
            </div>
          <//>`
        : null}

      ${plan.errors.length && !plan.fatal.length
        ? html`<div><h3 style="margin-bottom:6px">${tr({ en: 'Errors — these rows are not imported', mn: 'Алдаа — эдгээр мөрийг оруулахгүй' })}</h3><${IssueGroups} list=${plan.errors} kind="error" /></div>`
        : null}
      ${realW.length ? html`<div><h3 style="margin-bottom:6px">${tr({ en: 'Warnings — imported, but check', mn: 'Анхааруулга — орно, гэхдээ шалгана уу' })}</h3><${IssueGroups} list=${realW} kind="warn" /></div>` : null}
      ${infoW.length ? html`<${IssueGroups} list=${infoW} kind="info" />` : null}

      ${plan.create.length
        ? html`<details class="imp-sec">
            <summary><${Pill} kind="ok">${plan.create.length}<//> ${tr({ en: 'New rows', mn: 'Шинэ мөр' })}</summary>
            <div class="imp-sec-body imp-list">
              <table class="tbl">
                <tbody>
                  ${plan.create.slice(0, 200).map(
                    (c, i) => html`<tr key=${i}><td class="mono muted">${c.rowNo}</td><td class="mono">${c.label}</td><td style="font-size:12.5px">${rowPreview(plan.table, c.row)}</td></tr>`,
                  )}
                </tbody>
              </table>
              ${plan.create.length > 200 ? html`<p class="muted">${tr({ en: '… and {n} more', mn: '… бас {n}' }, { n: plan.create.length - 200 })}</p>` : null}
            </div>
          </details>`
        : null}
      ${plan.update.length
        ? html`<details class="imp-sec" open=${plan.update.length <= 10}>
            <summary><${Pill} kind="info">${plan.update.length}<//> ${tr({ en: 'Updated rows (old → new)', mn: 'Шинэчлэгдэх мөр (хуучин → шинэ)' })}</summary>
            <div class="imp-sec-body imp-list">
              <table class="tbl">
                <tbody>
                  ${plan.update.slice(0, 300).map(
                    (u, i) => html`<tr key=${i}><td class="mono muted">${u.rowNo}</td><td class="mono">${u.label}</td><td><${Diff} table=${plan.table} changes=${u.changes} /></td></tr>`,
                  )}
                </tbody>
              </table>
              ${plan.update.length > 300 ? html`<p class="muted">${tr({ en: '… and {n} more', mn: '… бас {n}' }, { n: plan.update.length - 300 })}</p>` : null}
            </div>
          </details>`
        : null}
      ${plan.delete.length
        ? html`<details class="imp-sec" open>
            <summary><${Pill} kind="warn">${plan.delete.length}<//> ${tr({ en: 'Rows deleted because they are not in the file (replace)', mn: 'Файлд байхгүй тул устгах мөр (солих)' })}</summary>
            <div class="imp-sec-body imp-list">
              <table class="tbl">
                <tbody>
                  ${plan.delete.slice(0, 300).map((d, i) => html`<tr key=${i}><td class="mono">${d.label}</td><td style="font-size:12.5px">${rowPreview(plan.table, d.row)}</td></tr>`)}
                </tbody>
              </table>
            </div>
          </details>`
        : null}
    </div>
  </div>`;
}

function PreviewStep({ plans, totals, opts, setOpts, skipErrors, setSkipErrors }) {
  return html`<div class="stack">
    ${totals.fatal
      ? html`<${Banner} kind="err">${tr({ en: 'A key column is not mapped — go back to Columns.', mn: 'Түлхүүр багана сонгоогүй — «Баганууд» руу буцна уу.' })}<//>`
      : !totals.writes
        ? html`<${Banner} kind="ok">${tr({ en: 'Nothing to change: every row in the file is already in ORD exactly like this.', mn: 'Өөрчлөх зүйл алга: файлын мөр бүр ORD-д яг ийм байдлаар байна.' })}<//>`
        : html`<${Banner} kind="info" icon="eye">
            ${tr({ en: 'Dry run: nothing has been written yet. {c} new, {u} updated, {d} deleted, {n} unchanged.', mn: 'Урьдчилсан шалгалт: юу ч бичигдээгүй байна. {c} шинэ, {u} шинэчлэгдэх, {d} устгах, {n} өөрчлөлтгүй.' }, { c: totals.create, u: totals.update, d: totals.delete, n: totals.unchanged })}
          <//>`}
    ${plans.map((p, i) => html`<${PlanCard} key=${i} plan=${p} opts=${opts} setOpts=${setOpts} />`)}
    ${totals.errorRows > 0 && totals.writes > 0
      ? html`<${Banner} kind="err">
          <label class="check">
            <input type="checkbox" checked=${skipErrors} onChange=${(e) => setSkipErrors(e.target.checked)} />
            ${tr({ en: 'Import the valid rows and leave out the {n} row(s) with errors (listed above)', mn: 'Зөв мөрүүдийг оруулж, алдаатай {n} мөрийг (дээр жагсаасан) орхих' }, { n: totals.errorRows })}
          </label>
        <//>`
      : null}
  </div>`;
}

function DoneStep({ result, fileName, onAgain }) {
  const [undone, setUndone] = useState(false);
  const undo = () => {
    undoBatch(result.batch);
    setUndone(true);
    toast(tr({ en: 'Import undone', mn: 'Импортыг буцаалаа' }), { kind: 'info' });
  };
  return html`<div class="card">
    <header>
      <h2>${undone ? tr({ en: 'Import undone', mn: 'Импортыг буцаасан' }) : tr({ en: 'Import finished', mn: 'Импорт дууслаа' })}</h2>
      <span class="muted" style="font-size:13px">${fileName || ''}</span>
    </header>
    <div class="body stack">
      <div class="stats">
        <${Stat} label=${tr({ en: 'Created', mn: 'Үүссэн' })} value=${result.created} kind="ok" />
        <${Stat} label=${tr({ en: 'Updated', mn: 'Шинэчлэгдсэн' })} value=${result.updated} />
        <${Stat} label=${tr({ en: 'Deleted', mn: 'Устгасан' })} value=${result.deleted} />
        <${Stat} label=${tr({ en: 'Rows left out', mn: 'Орхисон мөр' })} value=${result.totals?.errorRows || 0} kind=${result.totals?.errorRows ? 'warn' : ''} />
      </div>
      <p class="muted mono" style="font-size:12px">${result.label}</p>
      ${result.holes?.length
        ? html`<div class="stack" style="gap:6px"><h3>${tr({ en: 'Holes affected', mn: 'Нөлөөлсөн цооног' })}</h3><${HoleLinks} holes=${result.holes} /></div>`
        : null}
      <div class="row">
        <${Button} icon="undo" kind=${undone ? 'default' : 'danger'} disabled=${undone} onClick=${undo}>${tr({ en: 'Undo this import', mn: 'Энэ импортыг буцаах' })}<//>
        <${Button} icon="history" onClick=${() => navigate('#/history')}>${tr({ en: 'History', mn: 'Түүх' })}<//>
        <${Button} icon="shield" onClick=${() => navigate('#/validation')}>${tr({ en: 'Validation', mn: 'Шалгалт' })}<//>
        <span class="spacer"></span>
        <${Button} kind="primary" icon="upload" onClick=${onAgain}>${tr({ en: 'Import another file', mn: 'Өөр файл оруулах' })}<//>
      </div>
    </div>
  </div>`;
}

// ============================================================= lab import

function LabImport({ handoff }) {
  const rev = useStore();
  const [parsed, setParsed] = useState(null);
  const [cert, setCert] = useState('');
  const [received, setReceived] = useState('');
  const [allowUnmatched, setAllowUnmatched] = useState(false);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [undone, setUndone] = useState(false);

  const load = async (input, name) => {
    setBusy(true);
    try {
      const p = await LAB.readLabFile(input, { fileName: name });
      setParsed(p);
      setCert(p.certificate || '');
      setReceived(p.reported || '');
      setResult(null);
      setUndone(false);
    } catch (e) {
      console.error(e);
      toast(tr({ en: 'Could not read the certificate: {e}', mn: 'Сертификатыг уншиж чадсангүй: {e}' }, { e: e.message || e }), { kind: 'err' });
    }
    setBusy(false);
  };
  useEffect(() => {
    if (handoff?.input) load(handoff.input, handoff.name);
  }, [handoff]);

  const plan = useMemo(() => (parsed && !result ? LAB.planLabImport(parsed, { certificate: cert, received: received || undefined, allowUnmatched }) : null), [parsed, cert, received, allowUnmatched, rev, result]);

  const commit = () => {
    try {
      const res = LAB.commitLabImport(plan);
      setResult({ ...res, summary: plan.summary, certificate: plan.certificate });
      toast(tr({ en: 'Certificate {c} imported', mn: '{c} сертификатыг импортлов' }, { c: plan.certificate }));
    } catch (e) {
      toast(String(e.message || e), { kind: 'err' });
    }
  };
  const undo = () => {
    undoBatch(result.batch);
    setUndone(true);
    toast(tr({ en: 'Import undone', mn: 'Импортыг буцаалаа' }), { kind: 'info' });
  };

  const els = parsed?.elements || [];
  const shownEls = els.slice(0, 10);

  return html`<div class="stack">
    <${DropZone}
      accept=".csv,.tsv,.txt,.xlsx,.xls"
      title=${tr({ en: 'Drop a lab certificate here, or click to choose', mn: 'Лабораторийн сертификатыг энд чирж оруулах, эсвэл дарж сонгоно уу' })}
      hint=${tr({ en: 'ALS, SGS, Bureau Veritas and local lab CSV / Excel exports. Units, methods and detection limits are read from the header rows.', mn: 'ALS, SGS, Bureau Veritas, дотоодын лабораторийн CSV / Excel. Нэгж, арга, илрүүлэх хязгаарыг толгой мөрөөс уншина.' })}
      onFile=${(f) => load(f)}
    />
    ${busy ? html`<p class="muted">${tr({ en: 'Reading…', mn: 'Уншиж байна…' })}</p>` : null}
    ${parsed && !parsed.rows.length
      ? html`<${Banner} kind="err">${(parsed.warnings || []).map((w) => html`<span>${msg(w)}</span>`)}${tr({ en: 'No assay rows were found in this file.', mn: 'Энэ файлаас шинжилгээний мөр олдсонгүй.' })}<//>`
      : null}
    ${parsed && parsed.rows.length && !result
      ? html`<div class="grid2">
            <div class="card">
              <header><h2>${tr({ en: 'Certificate', mn: 'Сертификат' })}</h2><span class="muted" style="font-size:13px">${parsed.fileName}${parsed.sheetName ? ` · ${parsed.sheetName}` : ''}</span></header>
              <div class="body stack">
                <dl class="imp-kv">
                  <dt>${tr({ en: 'Laboratory', mn: 'Лаборатори' })}</dt><dd>${parsed.lab || '—'}</dd>
                  <dt>${tr({ en: 'Lab job', mn: 'Лаб. ажил' })}</dt><dd class="mono">${parsed.labJob || '—'}</dd>
                  <dt>${tr({ en: 'Dispatch / PO', mn: 'Илгээлт / PO' })}</dt><dd class="mono">${parsed.po || '—'}</dd>
                  <dt>${tr({ en: 'Rows', mn: 'Мөр' })}</dt><dd>${parsed.rows.length}</dd>
                  <dt>${tr({ en: 'Elements', mn: 'Элемент' })}</dt><dd>${els.length}</dd>
                </dl>
                <div class="form-grid">
                  <label class="fld">
                    <span>${tr({ en: 'Certificate name (re-imports match on this)', mn: 'Сертификатын нэр (дахин импортлоход үүгээр тулгана)' })}</span>
                    <input class="inp mono" value=${cert} onInput=${(e) => setCert(e.target.value)} />
                  </label>
                  <label class="fld">
                    <span>${tr({ en: 'Reported date', mn: 'Хариу ирсэн огноо' })}</span>
                    <input class="inp" type="date" value=${received} onInput=${(e) => setReceived(e.target.value)} />
                  </label>
                </div>
              </div>
            </div>
            <div class="card">
              <header><h2>${tr({ en: 'Elements', mn: 'Элементүүд' })}</h2></header>
              <div class="body tbl-wrap" style="max-height:300px;padding:0;border:0">
                <table class="tbl">
                  <thead><tr><th>${tr({ en: 'Key', mn: 'Түлхүүр' })}</th><th>${tr({ en: 'Method', mn: 'Арга' })}</th><th class="num">LOR</th><th></th></tr></thead>
                  <tbody>
                    ${els.map(
                      (e) => html`<tr key=${e.key}>
                        <td class="mono">${elementLabel(e.key)}</td>
                        <td class="mono">${e.method || '—'}</td>
                        <td class="num">${isNum(e.lor) ? e.lor : '—'}</td>
                        <td>${plan?.elementUpdates?.[e.key] ? html`<${Pill} kind="accent">${tr({ en: 'new to project', mn: 'төсөлд шинэ' })}<//>` : null}${e.unitAssumed ? html`<${Pill} kind="warn">${tr({ en: 'unit assumed', mn: 'нэгж таамаг' })}<//>` : null}</td>
                      </tr>`,
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="card">
            <header><h2>${tr({ en: 'First rows as read', mn: 'Уншсан эхний мөрүүд' })}</h2><span class="muted" style="font-size:12.5px">${tr({ en: '< below detection · > over limit', mn: '< илрүүлэх хязгаараас доош · > дээд хязгаараас дээш' })}</span></header>
            <div class="body tbl-wrap" style="border:0;padding:0">
              <table class="tbl">
                <thead><tr><th>${tr({ en: 'Sample', mn: 'Дээж' })}</th>${shownEls.map((e) => html`<th class="num">${elementLabel(e.key)}</th>`)}</tr></thead>
                <tbody>
                  ${parsed.rows.slice(0, 12).map(
                    (r) => html`<tr key=${r.rowNo}>
                      <td class="mono">${r.sampleId}</td>
                      ${shownEls.map((e) => html`<td class="num">${r.flags[e.key] ? html`<span class="imp-flag">${r.flags[e.key]}</span>` : null}${r.values[e.key] ?? ''}</td>`)}
                    </tr>`,
                  )}
                </tbody>
              </table>
            </div>
          </div>

          ${plan
            ? html`<div class="card">
                <header><h2>${tr({ en: 'Match to samples', mn: 'Дээжтэй тулгах' })}</h2></header>
                <div class="body stack">
                  <div class="stats">
                    <${Stat} label=${tr({ en: 'Matched samples', mn: 'Таарсан дээж' })} value=${plan.summary.matched} kind="ok" />
                    <${Stat} label=${tr({ en: 'Not in samples table', mn: 'Дээжийн хүснэгтэд алга' })} value=${plan.summary.unmatched} kind=${plan.summary.unmatched ? 'warn' : ''} />
                    <${Stat} label=${tr({ en: 'Lab QC rows', mn: 'Лаб. QC мөр' })} value=${plan.summary.labQc} />
                    <${Stat} label=${tr({ en: 'New', mn: 'Шинэ' })} value=${plan.summary.create} />
                    <${Stat} label=${tr({ en: 'Updated', mn: 'Шинэчлэгдэх' })} value=${plan.summary.update} />
                    <${Stat} label=${tr({ en: 'Unchanged', mn: 'Өөрчлөлтгүй' })} value=${plan.summary.unchanged} />
                  </div>
                  ${plan.reimport
                    ? html`<${Banner} kind="info">${tr({ en: 'This certificate was imported before — matching rows are updated, never duplicated.', mn: 'Энэ сертификатыг өмнө оруулсан — таарсан мөрүүд шинэчлэгдэнэ, давхардахгүй.' })}<//>`
                    : null}
                  ${plan.errors.length ? html`<${IssueGroups} list=${plan.errors} kind="error" />` : null}
                  <${IssueGroups} list=${plan.warnings.filter((w) => w.code !== 'reimport')} kind="warn" />
                  ${plan.unmatched.length || plan.labQc.length
                    ? html`<label class="check">
                        <input type="checkbox" checked=${allowUnmatched} onChange=${(e) => setAllowUnmatched(e.target.checked)} />
                        ${tr({ en: 'Also import the {n} unmatched / lab QC rows without a hole (they are linked once the sample is registered and the certificate re-imported)', mn: 'Тулгагдаагүй / лаб. QC {n} мөрийг цооноггүйгээр оруулах (дээжийг бүртгэж, сертификатыг дахин оруулахад холбогдоно)' }, { n: plan.unmatched.length + plan.labQc.length })}
                      </label>`
                    : null}
                  ${plan.update.length
                    ? html`<details class="imp-sec">
                        <summary><${Pill} kind="info">${plan.update.length}<//> ${tr({ en: 'Updated rows (old → new)', mn: 'Шинэчлэгдэх мөр (хуучин → шинэ)' })}</summary>
                        <div class="imp-sec-body imp-list">
                          <table class="tbl"><tbody>${plan.update.slice(0, 300).map((u, i) => html`<tr key=${i}><td class="mono">${u.label}</td><td><${Diff} table="assays" changes=${u.changes} /></td></tr>`)}</tbody></table>
                        </div>
                      </details>`
                    : null}
                  <div class="row">
                    <span class="spacer"></span>
                    <${Button} kind="primary" icon="upload" disabled=${!plan.summary.writes || plan.errors.length > 0} onClick=${commit}>
                      ${tr({ en: 'Import {n} assay rows', mn: '{n} шинжилгээний мөр импортлох' }, { n: plan.summary.writes })}
                    <//>
                  </div>
                </div>
              </div>`
            : null}`
      : null}
    ${result
      ? html`<div class="card">
          <header><h2>${undone ? tr({ en: 'Import undone', mn: 'Импортыг буцаасан' }) : tr({ en: 'Certificate {c} imported', mn: '{c} сертификат орлоо' }, { c: result.certificate })}</h2></header>
          <div class="body stack">
            <div class="stats">
              <${Stat} label=${tr({ en: 'Created', mn: 'Үүссэн' })} value=${result.summary.create} kind="ok" />
              <${Stat} label=${tr({ en: 'Updated', mn: 'Шинэчлэгдсэн' })} value=${result.summary.update} />
              <${Stat} label=${tr({ en: 'Not matched', mn: 'Тулгагдаагүй' })} value=${result.summary.unmatched} kind=${result.summary.unmatched ? 'warn' : ''} />
            </div>
            ${result.holes?.length ? html`<div class="stack" style="gap:6px"><h3>${tr({ en: 'Holes affected', mn: 'Нөлөөлсөн цооног' })}</h3><${HoleLinks} holes=${result.holes} /></div>` : null}
            <div class="row">
              <${Button} icon="undo" kind=${undone ? 'default' : 'danger'} disabled=${undone} onClick=${undo}>${tr({ en: 'Undo this import', mn: 'Энэ импортыг буцаах' })}<//>
              <${Button} kind="primary" icon="flask" onClick=${() => navigate('#/qaqc')}>${tr({ en: 'Check QA/QC for this batch', mn: 'Энэ багцын QA/QC-г шалгах' })}<//>
              <span class="spacer"></span>
              <${Button} onClick=${() => { setParsed(null); setResult(null); }}>${tr({ en: 'Import another certificate', mn: 'Өөр сертификат оруулах' })}<//>
            </div>
          </div>
        </div>`
      : null}
    ${!parsed && !busy
      ? html`<${Empty} icon="flask" title=${tr({ en: 'Assays are matched to your samples by sample ID', mn: 'Шинжилгээг дээжийн дугаараар таны дээжтэй тулгана' })}>
          ${tr({ en: 'Below-detection values (“<0.005”) follow the project setting; over-limit (“>10”) keeps the limit and a flag; NSS / IS / LNR are kept as flags. New elements and their detection limits are added to the project.', mn: 'Илрүүлэх хязгаараас доош («<0.005») утгыг төслийн тохиргоогоор; дээд хязгаараас дээш («>10») утгыг хязгаар, тэмдэгтэйгээр; NSS / IS / LNR-ийг тэмдэг болгон хадгална. Шинэ элемент, түүний илрүүлэх хязгаар төсөлд нэмэгдэнэ.' })}
        <//>`
      : null}
  </div>`;
}

// ================================================================== view

export function ImportView({ params } = {}) {
  useStore();
  const [tab, setTab] = useState(params?.tab === 'lab' ? 'lab' : 'data');
  const [handoff, setHandoff] = useState(null);
  if (!S.pid) return html`<${Empty} icon="folder" title=${tr({ en: 'Open a project first', mn: 'Эхлээд төсөл нээнэ үү' })} />`;
  return html`<div class="stack" style="max-width:1200px">
    <${PageHead}
      title=${tr({ en: 'Import', mn: 'Импорт' })}
      sub=${tr({ en: 'Collars, surveys, logs, samples, assays and code lists from CSV, Excel or an MX Deposit export. You see every change before it is written, and every import can be undone.', mn: 'Collar, survey, лог, дээж, шинжилгээ, кодын жагсаалтыг CSV, Excel эсвэл MX Deposit-ийн экспортоос. Бичихээс өмнө өөрчлөлт бүрийг харж, импорт бүрийг буцааж болно.' })}
    />
    <${Tabs}
      tabs=${[
        { key: 'data', label: tr({ en: 'Drillhole data', mn: 'Өрөмдлөгийн өгөгдөл' }), icon: 'upload' },
        { key: 'lab', label: tr({ en: 'Lab certificate', mn: 'Лабораторийн сертификат' }), icon: 'flask' },
      ]}
      active=${tab}
      onChange=${setTab}
    />
    <div style=${tab === 'data' ? '' : 'display:none'}>
      <${DataImport}
        onLabFile=${(input, name) => {
          setHandoff({ input, name, t: Date.now() });
          setTab('lab');
        }}
      />
    </div>
    <div style=${tab === 'lab' ? '' : 'display:none'}>
      <${LabImport} handoff=${handoff} />
    </div>
  </div>`;
}

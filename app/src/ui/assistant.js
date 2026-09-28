// "Ask ORD" — a chat panel that lets Claude answer questions about the open
// project by calling read-only page tools (holes, intervals, assays, issues).
// Available only inside claude.ai (the `sample` capability); hidden elsewhere.
// Runs on the viewer's own Claude account; nothing here writes data.

import { html, useState, useEffect, useRef } from '../lib.js';
import { S, holes, hole, rows, settings, assayValues, elementKeys, codeMap } from '../core/store.js';
import { validateAll, validateHole, summarize } from '../core/validate.js';
import { coverage, intersecting } from '../core/intervals.js';
import { isNum, round, natCmp } from '../core/util.js';
import { tr } from '../i18n.js';
import { Icon } from './icons.js';
import { injectCSS, IconButton, Button } from './kit.js';

injectCSS(
  'assistant',
  `
.ask-panel { position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 100%); background: var(--surface); border-left: 1px solid var(--line); box-shadow: var(--shadow); z-index: 90; display: flex; flex-direction: column; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
.ask-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--line); }
.ask-head h2 { flex: 1; }
.ask-log { flex: 1; overflow: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.ask-msg { padding: 9px 12px; border-radius: 10px; max-width: 92%; white-space: pre-wrap; line-height: 1.5; font-size: 13.5px; }
.ask-msg.user { align-self: flex-end; background: var(--accent); color: var(--accent-ink); }
.ask-msg.bot { align-self: flex-start; background: var(--surface-2); color: var(--ink); }
.ask-msg.note { align-self: center; background: none; color: var(--muted); font-size: 12px; padding: 2px; }
.ask-form { display: flex; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--line); }
.ask-form textarea { flex: 1; resize: none; height: 64px; }
.ask-sugg { display: flex; flex-wrap: wrap; gap: 6px; }
.ask-sugg button { border: 1px solid var(--line-2); background: var(--surface); color: var(--ink-2); border-radius: 999px; padding: 4px 10px; font: inherit; font-size: 12.5px; cursor: pointer; text-align: left; }
.ask-sugg button:hover { border-color: var(--accent); color: var(--ink); }
`,
);

let samplePromise = null;
export function getSample() {
  if (!samplePromise) samplePromise = window.claude?.use ? window.claude.use('sample').catch(() => null) : Promise.resolve(null);
  return samplePromise;
}

function avgAssays(holeId, from, to, keys) {
  const smp = rows('samples', holeId).filter((s) => (s.sampleType || 'PRIM') === 'PRIM' && isNum(s.from) && isNum(s.to));
  const out = {};
  for (const k of keys) {
    let sw = 0;
    let sv = 0;
    for (const h of intersecting(smp, from, to)) {
      const v = assayValues(h.row.sampleId)?.values?.[k];
      if (!isNum(v) || !(h.len > 0)) continue;
      sw += h.len;
      sv += v * h.len;
    }
    if (sw > 0) out[k] = round(sv / sw, 4);
  }
  return out;
}

const TOOLS = [
  {
    name: 'project_summary',
    description: 'Summary of the open drillhole project: hole count by status, metres drilled/logged, lithology code frequencies with meanings, assay element keys, validation issue counts by rule. Call this first.',
    execute: () => {
      const all = holes();
      const lithCount = {};
      for (const r of rows('lith')) lithCount[r.lith1] = (lithCount[r.lith1] || 0) + round(r.to - r.from, 1);
      const sum = summarize(validateAll());
      const byStatus = {};
      for (const c of all) byStatus[c.status || '-'] = (byStatus[c.status || '-'] || 0) + 1;
      return {
        project: S.project?.name,
        crs: settings().crs,
        holes: all.length,
        byStatus,
        metresDrilled: round(all.reduce((a, c) => a + (isNum(c.eoh) ? c.eoh : 0), 0), 1),
        metresLogged: round(all.reduce((a, c) => a + coverage(rows('lith', c.holeId)), 0), 1),
        lithologyMetres: Object.fromEntries(Object.entries(lithCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, { metres: round(v, 1), meaning: codeMap('LITH').get(k)?.meaning || '(not in list)' }])),
        assayElements: elementKeys('assays').slice(0, 60),
        issues: { errors: sum.error, warnings: sum.warn, byRule: Object.fromEntries(sum.byRule) },
      };
    },
  },
  {
    name: 'list_holes',
    description: 'List drill holes with status, prospect, collar E/N/RL, azimuth/dip, EOH depth and metres logged. Optional filters: prospect, status (PLN, ACT, CMP, ABD, NAC).',
    inputSchema: { type: 'object', properties: { prospect: { type: 'string' }, status: { type: 'string' } } },
    execute: ({ prospect, status } = {}) =>
      holes()
        .filter((c) => (!prospect || String(c.prospect || '').toLowerCase().includes(String(prospect).toLowerCase())) && (!status || c.status === status))
        .slice(0, 150)
        .map((c) => ({ holeId: c.holeId, status: c.status, prospect: c.prospect, east: c.east, north: c.north, rl: c.rl, azimuth: c.azimuth, dip: c.dip, eoh: c.eoh, logged: round(coverage(rows('lith', c.holeId)), 1) })),
  },
  {
    name: 'hole_log',
    description: 'Lithology log of one hole: intervals with from, to, Lith1 code, alteration (Alt1/Int1), total sulphide %, comments, and length-weighted assays of the given element keys over each interval.',
    inputSchema: { type: 'object', properties: { holeId: { type: 'string' }, elements: { type: 'array', items: { type: 'string' } } }, required: ['holeId'] },
    execute: ({ holeId, elements } = {}) => {
      const c = hole(String(holeId || '').trim()) || holes().find((h) => h.holeId.toLowerCase() === String(holeId || '').toLowerCase());
      if (!c) return { error: `Hole ${holeId} not found` };
      const keys = (elements?.length ? elements : settings().stripElements || []).slice(0, 4);
      return {
        holeId: c.holeId,
        eoh: c.eoh,
        intervals: rows('lith', c.holeId)
          .slice(0, 250)
          .map((r) => ({ from: r.from, to: r.to, lith1: r.lith1, alt1: r.alt1, int1: r.int1, slf: ['py', 'po', 'cpy', 'bn', 'cc', 'pn', 'sph', 'gn', 'asp'].reduce((a, k) => a + (isNum(r[k]) ? r[k] : 0), 0) || undefined, comments: r.comments ? String(r.comments).slice(0, 120) : undefined, assays: avgAssays(c.holeId, r.from, r.to, keys) })),
      };
    },
  },
  {
    name: 'find_intervals',
    description: 'Find lithology intervals across all holes matching a Lith1 code (optional) and/or a minimum length-weighted grade of one element key (e.g. Au_ppm ≥ 1). Returns hole, from, to, code and grade.',
    inputSchema: { type: 'object', properties: { lith1: { type: 'string' }, element: { type: 'string' }, minGrade: { type: 'number' } } },
    execute: ({ lith1, element, minGrade } = {}) => {
      const out = [];
      for (const c of holes()) {
        for (const r of rows('lith', c.holeId)) {
          if (lith1 && r.lith1 !== String(lith1).toUpperCase()) continue;
          let g;
          if (element) {
            g = avgAssays(c.holeId, r.from, r.to, [element])[element];
            if (isNum(minGrade) && !(g >= minGrade)) continue;
          }
          out.push({ holeId: c.holeId, from: r.from, to: r.to, lith1: r.lith1, ...(element ? { [element]: g ?? null } : {}) });
          if (out.length >= 200) return out;
        }
      }
      return out;
    },
  },
  {
    name: 'validation_issues',
    description: 'Data-quality issues found by ORD validation (overlaps, gaps, unknown codes, EOH, dogleg, QA chemistry rules...). Optional holeId and severity (error, warn, info). Max 80.',
    inputSchema: { type: 'object', properties: { holeId: { type: 'string' }, severity: { type: 'string' } } },
    execute: ({ holeId, severity } = {}) =>
      (holeId ? validateHole(holeId) : validateAll())
        .filter((i) => !severity || i.sev === severity)
        .slice(0, 80)
        .map((i) => ({ hole: i.holeId, table: i.table, severity: i.sev, rule: i.rule, message: i.msg.en })),
  },
  {
    name: 'significant_intercepts',
    description: 'Length-weighted significant intercepts for an element key (e.g. Au_ppm) at a cut-off, with min length and max internal dilution in metres. Returns ASX-style text per intercept.',
    inputSchema: { type: 'object', properties: { element: { type: 'string' }, cutoff: { type: 'number' }, minLen: { type: 'number' }, maxDil: { type: 'number' } }, required: ['element', 'cutoff'] },
    execute: async ({ element, cutoff, minLen = 1, maxDil = 2 } = {}) => {
      try {
        const { projectIntercepts } = await import('../core/intercepts.js');
        const res = projectIntercepts({ holeIds: holes().map((h) => h.holeId), samplesOf: (h) => rows('samples', h), assay: assayValues }, { element, cutoff: Number(cutoff), minLen: Number(minLen), maxDil: Number(maxDil) });
        return { intercepts: res.rows.slice(0, 60).map((r) => `${r.holeId}: ${r.textFull || r.text}`), noSignificantIntercept: res.nsi, notAssayed: res.unassayed };
      } catch (e) {
        return { error: String(e.message || e) };
      }
    },
  },
];

const INSTRUCTIONS = (lang) => `You are ORD's assistant for exploration geologists (AZ9; Maikhan Uul Cu-Au "Red Hill" and Oval Ni-Cu, Mongolia).
Answer questions about the open drillhole project using the tools; never invent data — if a tool returns nothing, say so.
Lithology codes follow the MU Lithology Code Standard v4 (e.g. CMSQ silica body must have 4-acid Al < 1 % and S < 5 %; MSUL > 50 % sulphide; VMS 10–50 %).
Depths are metres down-hole; grades are as stored (element keys like Au_ppm, Cu_pct). Be concise: short paragraphs or a compact list, cite hole IDs and depths.
Reply in ${lang === 'mn' ? 'Mongolian (Cyrillic), keeping codes and element symbols as they are' : 'English'}.`;

const SUGGEST = [
  { en: 'Summarise this project and what needs fixing first', mn: 'Энэ төслийг товч дүгнэж, юуг түрүүлж засах вэ?' },
  { en: 'Where are the best Au intervals and in which lithology?', mn: 'Хамгийн сайн Au интервалууд хаана, ямар литологид байна вэ?' },
  { en: 'Which CMSQ intervals break the v4 chemistry rule?', mn: 'Аль CMSQ интервалууд v4 химийн дүрмийг зөрчиж байна вэ?' },
];

export function AskButton() {
  const [avail, setAvail] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    getSample().then(async (s) => {
      if (!alive || !s) return;
      const lim = await s.limits?.().catch(() => null);
      if (lim && lim.tools === false) return;
      setAvail(true);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!avail) return null;
  return html`<${Button} size="sm" icon="sparkle" onClick=${() => setOpen(true)}>${tr({ en: 'Ask', mn: 'Асуух' })}<//>
    ${open ? html`<${AskPanel} onClose=${() => setOpen(false)} />` : null}`;
}

function AskPanel({ onClose }) {
  const [turns, setTurns] = useState([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(null); // status text
  const [live, setLive] = useState('');
  const ctl = useRef(null);
  const log = useRef();
  useEffect(() => {
    log.current && (log.current.scrollTop = log.current.scrollHeight);
  }, [turns, live, busy]);

  async function ask(q) {
    const text = (q ?? draft).trim();
    if (!text || busy) return;
    setDraft('');
    const next = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setBusy(tr({ en: 'Thinking…', mn: 'Бодож байна…' }));
    setLive('');
    const sample = await getSample();
    ctl.current = new AbortController();
    const tools = TOOLS.map((t) => ({
      ...t,
      execute: async (input) => {
        setBusy(tr({ en: 'Reading project data ({t})…', mn: 'Төслийн өгөгдлийг уншиж байна ({t})…' }, { t: t.name }));
        return t.execute(input || {});
      },
    }));
    try {
      const convo = [{ role: 'user', content: INSTRUCTIONS(S.lang) }, ...next.slice(-12)];
      const { text: ans } = await sample(convo, {
        tools,
        signal: ctl.current.signal,
        onText: ({ text: t }) => {
          setBusy(null);
          setLive(t);
        },
      });
      setTurns([...next, { role: 'assistant', content: ans }]);
    } catch (e) {
      const msg =
        e?.code === 'cancelled'
          ? tr({ en: 'Stopped.', mn: 'Зогсоосон.' })
          : e?.code === 'not_granted'
            ? tr({ en: 'Claude was not allowed for this page.', mn: 'Энэ хуудсанд Claude-ыг зөвшөөрөөгүй.' })
            : e?.code === 'rate_limited'
              ? tr({ en: 'Too many requests — wait a moment and ask again.', mn: 'Хэт олон хүсэлт — түр хүлээгээд дахин асууна уу.' })
              : tr({ en: 'Could not get an answer ({c}).', mn: 'Хариу авч чадсангүй ({c}).' }, { c: e?.code || 'error' });
      setTurns([...next, ...(e?.text ? [{ role: 'assistant', content: e.text }] : []), { role: 'note', content: msg }]);
    }
    setBusy(null);
    setLive('');
  }

  return html`<aside class="ask-panel" role="dialog" aria-label="Ask ORD">
    <div class="ask-head">
      <${Icon} name="sparkle" />
      <h2>${tr({ en: 'Ask about this project', mn: 'Төслийн талаар асуух' })}</h2>
      <${IconButton} icon="x" title=${tr({ en: 'Close', mn: 'Хаах' })} onClick=${() => {
        ctl.current?.abort();
        onClose();
      }} />
    </div>
    <div class="ask-log" ref=${log}>
      ${!turns.length
        ? html`<p class="muted">${tr({ en: 'Claude reads your project through ORD (read-only) and answers with hole IDs and depths. It uses your own Claude account.', mn: 'Claude таны төслийг ORD-оор дамжуулан (зөвхөн уншиж) хариулна — цооног, гүнийг заана. Таны Claude бүртгэлийг ашиглана.' })}</p>
            <div class="ask-sugg">${SUGGEST.map((s) => html`<button onClick=${() => ask(tr(s))}>${tr(s)}</button>`)}</div>`
        : null}
      ${turns.map((t) => html`<div class=${'ask-msg ' + (t.role === 'user' ? 'user' : t.role === 'note' ? 'note' : 'bot')}>${t.content}</div>`)}
      ${live ? html`<div class="ask-msg bot">${live}</div>` : null}
      ${busy ? html`<div class="ask-msg note">${busy}</div>` : null}
    </div>
    <form class="ask-form" onSubmit=${(e) => {
      e.preventDefault();
      ask();
    }}>
      <textarea
        class="inp"
        id="ask-input"
        value=${draft}
        placeholder=${tr({ en: 'e.g. Which holes intersect MSUL below 100 m?', mn: 'ж: 100 м-ээс доош MSUL огтолсон цооногууд аль вэ?' })}
        onInput=${(e) => setDraft(e.target.value)}
        onKeyDown=${(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            ask();
          }
        }}
      ></textarea>
      ${busy || live
        ? html`<${Button} onClick=${() => ctl.current?.abort()}>${tr({ en: 'Stop', mn: 'Зогсоох' })}<//>`
        : html`<${Button} kind="primary" type="submit" icon="play">${tr({ en: 'Ask', mn: 'Асуух' })}<//>`}
    </form>
  </aside>`;
}

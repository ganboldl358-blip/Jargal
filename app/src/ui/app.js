// App shell: navigation, top bar, router (hash based, lazy-loaded views).
import { html, useState, useEffect, useMemo, useRef } from '../lib.js';
import { S, holes, rows, flushNow } from '../core/store.js';
import { validateAll, summarize } from '../core/validate.js';
import { t, tr, setLang } from '../i18n.js';
import { Icon, Logo } from './icons.js';
import { useStore, OverlayHost, navigate, injectCSS, IconButton, usePref } from './kit.js';
import { GRID_CSS } from './grid.js';
import { undoLast } from './undo.js';
import { AskButton } from './assistant.js';

injectCSS('grid', GRID_CSS);

// route pattern -> [module loader, export name]
const ROUTES = [
  ['', () => import('./views/dashboard.js'), 'DashboardView'],
  ['projects', () => import('./views/projects.js'), 'ProjectsView'],
  ['holes', () => import('./views/holes.js'), 'HolesView'],
  ['hole/:holeId/:tab', () => import('./views/holeview.js'), 'HoleView'],
  ['hole/:holeId', () => import('./views/holeview.js'), 'HoleView'],
  ['striplog/:holeId', () => import('./views/striplog.js'), 'StripLogView'],
  ['striplog', () => import('./views/striplog.js'), 'StripLogView'],
  ['map', () => import('./views/map.js'), 'MapView'],
  ['3d', () => import('./views/view3d.js'), 'View3D'],
  ['qaqc', () => import('./views/qaqc.js'), 'QAQCView'],
  ['sampling', () => import('./views/sampling.js'), 'SamplingView'],
  ['intercepts', () => import('./views/sampling.js'), 'InterceptsView'],
  ['import', () => import('./views/importview.js'), 'ImportView'],
  ['import/:tab', () => import('./views/importview.js'), 'ImportView'],
  ['export', () => import('./views/exportview.js'), 'ExportView'],
  ['validation', () => import('./views/validation.js'), 'ValidationView'],
  ['codes', () => import('./views/codes.js'), 'CodesView'],
  ['history', () => import('./views/history.js'), 'HistoryView'],
  ['settings', () => import('./views/settings.js'), 'SettingsView'],
  ['compare', () => import('./views/projects.js'), 'CompareView'],
];

function matchRoute(hash) {
  const [path, qs = ''] = hash.replace(/^#\/?/, '').split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  const parts = path ? path.split('/').map(decodeURIComponent) : [];
  for (const [pat, load, name] of ROUTES) {
    const pp = pat ? pat.split('/') : [];
    if (pp.length !== parts.length) continue;
    const params = {};
    let ok = true;
    pp.forEach((p, i) => {
      if (p.startsWith(':')) params[p.slice(1)] = parts[i];
      else if (p !== parts[i]) ok = false;
    });
    if (ok) return { pat, load, name, params: { ...params, query } };
  }
  return { pat: '', load: ROUTES[0][1], name: ROUTES[0][2], params: { query } };
}

function useHash() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const f = () => setH(location.hash);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return h;
}

const modCache = new Map();
function LazyView({ route }) {
  const [state, setState] = useState(() => (modCache.has(route.name + route.pat) ? { C: modCache.get(route.name + route.pat) } : { loading: true }));
  useEffect(() => {
    let alive = true;
    const key = route.name + route.pat;
    if (modCache.has(key)) {
      setState({ C: modCache.get(key) });
      return;
    }
    setState({ loading: true });
    route
      .load()
      .then((m) => {
        const C = m[route.name];
        if (!C) throw new Error(`${route.name} not found in module`);
        modCache.set(key, C);
        if (alive) setState({ C });
      })
      .catch((e) => {
        console.error(e);
        if (alive) setState({ error: e });
      });
    return () => {
      alive = false;
    };
  }, [route.name, route.pat]);
  if (state.error)
    return html`<div class="card" style="margin:20px"><div class="body stack">
      <h2>${tr({ en: 'This page could not load', mn: 'Энэ хуудас ачаалагдсангүй' })}</h2>
      <pre class="mono muted" style="white-space:pre-wrap">${String(state.error?.stack || state.error)}</pre>
    </div></div>`;
  if (state.loading) return html`<div class="empty"><span class="muted">${tr({ en: 'Loading…', mn: 'Ачаалж байна…' })}</span></div>`;
  const C = state.C;
  return html`<${ErrorBoundary} key=${route.name + JSON.stringify(route.params)}><${C} params=${route.params} /><//>`;
}

import { Component } from '../lib.js';
class ErrorBoundary extends Component {
  constructor() {
    super();
    this.state = { err: null };
  }
  componentDidCatch(err) {
    console.error(err);
    this.setState({ err });
  }
  render() {
    if (this.state.err)
      return html`<div class="card" style="margin:20px"><div class="body stack">
        <h2>${tr({ en: 'Something went wrong on this page', mn: 'Энэ хуудсанд алдаа гарлаа' })}</h2>
        <p class="muted">${tr({ en: 'Your data is safe — every change is saved and can be undone from History.', mn: 'Өгөгдөл тань аюулгүй — өөрчлөлт бүр хадгалагдсан, «Түүх»-ээс буцааж болно.' })}</p>
        <pre class="mono muted" style="white-space:pre-wrap">${String(this.state.err?.stack || this.state.err)}</pre>
        <div><button class="btn" onClick=${() => this.setState({ err: null })}>${tr({ en: 'Try again', mn: 'Дахин оролдох' })}</button></div>
      </div></div>`;
    return this.props.children;
  }
}

const NAV = [
  { sec: { en: 'Project', mn: 'Төсөл' } },
  { key: '', icon: 'overview', label: 'dashboard' },
  { key: 'holes', icon: 'holes', label: 'holes', match: ['holes', 'hole'] },
  { key: 'striplog', icon: 'log', label: { en: 'Strip logs', mn: 'Баганан лог' } },
  { key: 'map', icon: 'map', label: 'map' },
  { key: '3d', icon: 'cube', label: 'view3d' },
  { sec: { en: 'Samples & assays', mn: 'Дээж, шинжилгээ' } },
  { key: 'sampling', icon: 'truck', label: 'sampling' },
  { key: 'qaqc', icon: 'flask', label: 'qaqc' },
  { key: 'intercepts', icon: 'target', label: 'intercepts' },
  { sec: { en: 'Data', mn: 'Өгөгдөл' } },
  { key: 'validation', icon: 'shield', label: 'validation', badge: true },
  { key: 'import', icon: 'upload', label: 'import' },
  { key: 'export', icon: 'download', label: 'export' },
  { key: 'codes', icon: 'list', label: 'codes' },
  { key: 'history', icon: 'history', label: 'history' },
  { key: 'settings', icon: 'gear', label: 'settings' },
];

function Nav({ route, open, onClose }) {
  useStore();
  const issues = useMemo(() => (S.pid ? summarize(validateAll()) : null), [S.rev, S.pid]);
  const cur = route.pat.split('/')[0];
  return html`
    ${open ? html`<div class="nav-scrim" onClick=${onClose}></div>` : null}
    <nav class=${'nav' + (open ? ' open' : '')} aria-label="Main">
      <div class="brand">
        <${Logo} size=${30} />
        <div><b>ORD</b><small>${t('appTagline')}</small></div>
      </div>
      <div class="nav-scroll">
        ${NAV.map((n) => {
          if (n.sec) return html`<div class="nav-sec">${tr(n.sec)}</div>`;
          const on = n.match ? n.match.includes(cur) : cur === n.key;
          const lbl = typeof n.label === 'string' ? t(n.label) : tr(n.label);
          return html`<a href=${'#/' + n.key} class=${on ? 'on' : ''} onClick=${onClose}>
            <${Icon} name=${n.icon} />
            <span>${lbl}</span>
            ${n.badge && issues && issues.error ? html`<span class="badge err">${issues.error}</span>` : n.badge && issues && issues.warn ? html`<span class="badge warn">${issues.warn}</span>` : null}
          </a>`;
        })}
      </div>
      <div class="nav-foot">
        <a href="#/compare" onClick=${onClose}><${Icon} name="sparkle" /><span>${tr({ en: 'ORD vs MX Deposit', mn: 'ORD ба MX Deposit' })}</span></a>
      </div>
    </nav>`;
}

function SaveState() {
  useStore();
  const st = S.status;
  const cls = st.error ? 'err' : st.saving ? 'busy' : '';
  const where = S.status.cloud === 'live' ? t('cloud') : t('offline');
  return html`<span class=${'save-state ' + cls} title=${st.error || ''}>
    <span class="dot"></span>
    <${Icon} name=${S.status.cloud === 'live' ? 'cloud' : 'device'} size=${14} />
    <span class="hide-sm">${st.error ? t('error') : st.saving ? t('saving') : `${t('saved')} · ${where}`}</span>
  </span>`;
}

function GlobalSearch() {
  useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const res = useMemo(() => {
    const Q = q.trim().toUpperCase();
    if (!Q) return [];
    const out = [];
    for (const h of holes()) if (h.holeId.toUpperCase().includes(Q)) out.push({ kind: 'hole', label: h.holeId, sub: h.prospect || '', go: `#/hole/${encodeURIComponent(h.holeId)}` });
    for (const s of rows('samples')) {
      if (out.length > 30) break;
      if (String(s.sampleId).toUpperCase().includes(Q)) out.push({ kind: 'sample', label: s.sampleId, sub: `${s.holeId} ${s.from ?? ''}–${s.to ?? ''}`, go: `#/hole/${encodeURIComponent(s.holeId)}/samples` });
    }
    return out.slice(0, 30);
  }, [q, S.rev]);
  const go = (r) => {
    navigate(r.go);
    setQ('');
    setOpen(false);
  };
  return html`<div class="gsearch">
    <${Icon} name="search" size=${15} />
    <input
      class="inp"
      id="ord-search"
      placeholder=${tr({ en: 'Hole or sample ID…', mn: 'Цооног, дээжийн №…' })}
      value=${q}
      onInput=${(e) => {
        setQ(e.target.value);
        setOpen(true);
        setHi(0);
      }}
      onFocus=${() => setOpen(true)}
      onBlur=${() => setTimeout(() => setOpen(false), 150)}
      onKeyDown=${(e) => {
        if (e.key === 'ArrowDown') setHi((h) => Math.min(res.length - 1, h + 1));
        else if (e.key === 'ArrowUp') setHi((h) => Math.max(0, h - 1));
        else if (e.key === 'Enter' && res[hi]) go(res[hi]);
        else if (e.key === 'Escape') setOpen(false);
      }}
    />
    ${open && res.length
      ? html`<div class="gsearch-res">
          ${res.map(
            (r, i) => html`<button class=${i === hi ? 'on' : ''} onMouseDown=${() => go(r)}>
              <${Icon} name=${r.kind === 'hole' ? 'holes' : 'flask'} size=${15} />
              <b class="mono">${r.label}</b><span class="muted">${r.sub}</span>
            </button>`,
          )}
        </div>`
      : null}
  </div>`;
}

function ThemeToggle() {
  const [theme, setTheme] = usePref('theme', '');
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme]);
  const dark = theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches);
  return html`<${IconButton} icon=${dark ? 'sun' : 'moon'} title=${tr({ en: 'Light / dark', mn: 'Цайвар / бараан' })} onClick=${() => setTheme(dark ? 'light' : 'dark')} />`;
}

function TopBar({ onMenu }) {
  useStore();
  return html`<div class="topbar">
    <button class="icon-btn mobile-bar" onClick=${onMenu} aria-label="Menu"><${Icon} name="menu" /></button>
    <button class="proj-btn" onClick=${() => navigate('#/projects')} title=${t('projects')}>
      <${Icon} name="folder" size=${16} />
      <span>${S.project?.name || t('projects')}</span>
      <${Icon} name="chevronDown" size=${14} />
    </button>
    <${SaveState} />
    <div class="grow"></div>
    <${AskButton} />
    <${GlobalSearch} />
    <button class="btn ghost sm" onClick=${() => setLang(S.lang === 'mn' ? 'en' : 'mn')} title="Монгол / English">
      <${Icon} name="globe" size=${15} /><span>${S.lang === 'mn' ? 'EN' : 'МН'}</span>
    </button>
    <${ThemeToggle} />
    ${S.user?.name ? html`<span class="pill hide-sm" title=${tr({ en: 'Changes are recorded under this name', mn: 'Өөрчлөлтүүд энэ нэрээр бүртгэгдэнэ' })}><${Icon} name="user" size=${12} />${S.user.name}</span>` : null}
  </div>`;
}

export function App() {
  useStore();
  const hash = useHash();
  const route = useMemo(() => matchRoute(hash), [hash]);
  const [menu, setMenu] = useState(false);
  const flush = ['hole', '3d', 'map', 'striplog'].includes(route.pat.split('/')[0]);

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !['input', 'textarea', 'select'].includes(tag) && !e.target?.closest?.('.grid-wrap')) {
        e.preventDefault();
        undoLast();
      }
      if (e.key === '/' && !['input', 'textarea', 'select'].includes(tag)) {
        e.preventDefault();
        document.getElementById('ord-search')?.focus();
      }
    };
    const onHide = () => flushNow();
    window.addEventListener('keydown', onKey);
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  const needsProject = !S.pid && route.pat !== 'projects' && route.pat !== 'compare';
  return html`<div class="app">
    <${Nav} route=${route} open=${menu} onClose=${() => setMenu(false)} />
    <main class="main">
      <${TopBar} onMenu=${() => setMenu(true)} />
      ${S.project?.demo
        ? html`<div class="demo-banner"><${Icon} name="info" size=${16} /><span>${t('demoBanner')}</span></div>`
        : null}
      <div class=${'content' + (flush && !needsProject ? ' flush' : '')}>
        ${needsProject ? html`<${LazyView} route=${{ pat: 'projects', load: ROUTES[1][1], name: 'ProjectsView', params: {} }} />` : html`<${LazyView} route=${route} />`}
      </div>
    </main>
    <${OverlayHost} />
  </div>`;
}

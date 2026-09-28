// Shared UI building blocks: store hook, modals, confirm, toasts, file save,
// buttons and form fields. Views import from here instead of re-inventing them.

import { html, useState, useEffect, useRef, useCallback } from '../lib.js';
import { S, subscribe } from '../core/store.js';
import { tr, t } from '../i18n.js';
import { Icon } from './icons.js';

// ------------------------------------------------------------------ hooks

/** Re-render when the data store changes. Returns the store revision. */
export function useStore() {
  const [rev, setRev] = useState(S.rev);
  useEffect(() => subscribe((r) => setRev(r)), []);
  return rev;
}

/** localStorage-backed state for per-viewer conveniences (never data). */
export function usePref(key, initial) {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem('ord.pref.' + key);
      return s === null ? initial : JSON.parse(s);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (nv) => {
      setV((cur) => {
        const val = typeof nv === 'function' ? nv(cur) : nv;
        try {
          localStorage.setItem('ord.pref.' + key, JSON.stringify(val));
        } catch {}
        return val;
      });
    },
    [key],
  );
  return [v, set];
}

const injected = new Set();
/** Add a view's CSS once. Use the design tokens (var(--accent) ...). */
export function injectCSS(id, css) {
  if (injected.has(id)) return;
  injected.add(id);
  const el = document.createElement('style');
  el.dataset.ord = id;
  el.textContent = css;
  document.head.appendChild(el);
}

// ---------------------------------------------------------------- overlays

let overlays = [];
const overlayListeners = new Set();
const notifyOverlays = () => overlayListeners.forEach((f) => f([...overlays]));

/**
 * Open a modal. `render(close)` returns the dialog body. Resolves with the value
 * passed to close(). Options: {title, wide, dismissable}
 */
export function openModal(render, opts = {}) {
  return new Promise((resolve) => {
    const id = Math.random().toString(36).slice(2);
    const close = (v) => {
      overlays = overlays.filter((o) => o.id !== id);
      notifyOverlays();
      resolve(v);
    };
    overlays.push({ id, render, close, opts });
    notifyOverlays();
  });
}

/** In-page confirmation (window.confirm is blocked in embedded viewers). */
export function confirmDialog({ title, body, ok, danger = false, cancel } = {}) {
  const Body = ({ close }) => {
    const okRef = useRef();
    useEffect(() => {
      const b = okRef.current?.querySelectorAll?.('button');
      b?.[b.length - 1]?.focus();
    }, []);
    return html`
      <div class="dlg-body">${typeof body === 'string' ? html`<p>${body}</p>` : body}</div>
      <div class="dlg-actions" ref=${okRef}>
        <${Button} onClick=${() => close(false)}>${cancel || t('cancel')}<//>
        <${Button} kind=${danger ? 'danger' : 'primary'} onClick=${() => close(true)}>${ok || tr({ en: 'Confirm', mn: 'Батлах' })}<//>
      </div>
    `;
  };
  return openModal((close) => html`<${Body} close=${close} />`, { title: title || tr({ en: 'Are you sure?', mn: 'Итгэлтэй байна уу?' }) });
}

/** In-page text prompt. Resolves the string, or null when cancelled. */
export function promptDialog({ title, label, value = '', placeholder = '', ok } = {}) {
  return openModal((close) => {
    const Body = () => {
      const [v, setV] = useState(value);
      const ref = useRef();
      useEffect(() => {
        ref.current?.focus();
        ref.current?.select();
      }, []);
      return html`<form
        onSubmit=${(e) => {
          e.preventDefault();
          close(v.trim() || null);
        }}
      >
        <div class="dlg-body">
          <label class="fld">
            <span>${label}</span>
            <input id="ord-prompt" ref=${ref} class="inp" value=${v} placeholder=${placeholder} onInput=${(e) => setV(e.target.value)} />
          </label>
        </div>
        <div class="dlg-actions">
          <${Button} type="button" onClick=${() => close(null)}>${t('cancel')}<//>
          <${Button} kind="primary" type="submit">${ok || t('save')}<//>
        </div>
      </form>`;
    };
    return html`<${Body} />`;
  }, { title });
}

let toasts = [];
const toastListeners = new Set();
/** Short, non-blocking message. kind: ok | warn | err | info. action: {label, run} */
export function toast(msg, { kind = 'ok', action, ms = 4200 } = {}) {
  const id = Math.random().toString(36).slice(2);
  toasts = [...toasts, { id, msg, kind, action }];
  toastListeners.forEach((f) => f(toasts));
  setTimeout(() => {
    toasts = toasts.filter((x) => x.id !== id);
    toastListeners.forEach((f) => f(toasts));
  }, action ? ms + 3000 : ms);
}

export function OverlayHost() {
  const [list, setList] = useState(overlays);
  const [ts, setTs] = useState(toasts);
  useEffect(() => {
    overlayListeners.add(setList);
    toastListeners.add(setTs);
    return () => {
      overlayListeners.delete(setList);
      toastListeners.delete(setTs);
    };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && list.length) {
        const top = list[list.length - 1];
        if (top.opts.dismissable !== false) top.close(undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [list]);
  return html`
    ${list.map(
      (o) => html`<div class="scrim" key=${o.id} onMouseDown=${(e) => e.target === e.currentTarget && o.opts.dismissable !== false && o.close(undefined)}>
        <div class=${'dlg' + (o.opts.wide ? ' wide' : '') + (o.opts.full ? ' full' : '')} role="dialog" aria-modal="true" aria-label=${o.opts.title || ''}>
          ${o.opts.title
            ? html`<header class="dlg-head">
                <h2>${o.opts.title}</h2>
                <button class="icon-btn" onClick=${() => o.close(undefined)} aria-label=${t('close')}><${Icon} name="x" /></button>
              </header>`
            : null}
          ${o.render(o.close)}
        </div>
      </div>`,
    )}
    <div class="toasts" aria-live="polite">
      ${ts.map(
        (x) => html`<div class=${'toast ' + x.kind} key=${x.id}>
          <${Icon} name=${x.kind === 'err' ? 'alert' : x.kind === 'warn' ? 'alert' : x.kind === 'info' ? 'info' : 'check'} />
          <span>${x.msg}</span>
          ${x.action ? html`<button class="toast-act" onClick=${() => x.action.run()}>${x.action.label}</button>` : null}
        </div>`,
      )}
    </div>
  `;
}

// -------------------------------------------------------------- file save

let downloadsCap;
async function downloadsCapability() {
  if (downloadsCap !== undefined) return downloadsCap;
  try {
    downloadsCap = window.claude?.use ? await window.claude.use('downloads') : null;
  } catch {
    downloadsCap = null;
  }
  return downloadsCap;
}

/**
 * Save a generated file. Uses the viewer's download capability inside claude.ai,
 * a normal browser download elsewhere, and a copyable text box as last resort.
 */
export async function saveFile(filename, data, mime = 'text/plain') {
  const cap = await downloadsCapability();
  if (cap) {
    try {
      await cap.save({ filename, data: data instanceof Blob ? data : typeof data === 'string' ? data : new Blob([data], { type: mime }) });
      return true;
    } catch (e) {
      if (e?.code === 'declined') return false;
      console.warn('downloads.save failed', e);
    }
  }
  if (!window.claude) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  }
  if (typeof data === 'string') {
    await openModal(
      (close) => html`<div class="dlg-body">
          <p class="muted">${tr({ en: 'Downloads are not available in this view. Copy the contents instead.', mn: 'Энэ цонхонд файл татах боломжгүй. Агуулгыг хуулж авна уу.' })}</p>
          <textarea class="inp mono" id="ord-copy-out" style="width:100%;height:320px" readonly>${data}</textarea>
        </div>
        <div class="dlg-actions">
          <${Button}
            kind="primary"
            onClick=${async () => {
              try {
                await navigator.clipboard.writeText(data);
                toast(tr({ en: 'Copied', mn: 'Хуулсан' }));
              } catch {
                document.getElementById('ord-copy-out')?.select();
              }
            }}
            >${tr({ en: 'Copy', mn: 'Хуулах' })}<//
          >
          <${Button} onClick=${() => close()}>${t('close')}<//>
        </div>`,
      { title: filename, wide: true },
    );
  } else toast(tr({ en: 'Downloads are not available in this view.', mn: 'Энэ цонхонд файл татах боломжгүй.' }), { kind: 'warn' });
  return false;
}

/** Ask for a local file; resolves {name, text|buffer} or null. */
export function pickFile({ accept = '', binary = false } = {}) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return resolve(null);
      resolve({ name: f.name, size: f.size, file: f, ...(binary ? { buffer: await f.arrayBuffer() } : { text: await f.text() }) });
    };
    inp.click();
  });
}

// ------------------------------------------------------------- components

export function Button({ kind = 'default', size, icon, children, class: cls = '', ...rest }) {
  return html`<button class=${`btn ${kind} ${size || ''} ${cls}`} type="button" ...${rest}>
    ${icon ? html`<${Icon} name=${icon} size=${size === 'sm' ? 15 : 17} />` : null}
    ${children ? html`<span>${children}</span>` : null}
  </button>`;
}

export function IconButton({ icon, title, class: cls = '', ...rest }) {
  return html`<button class=${'icon-btn ' + cls} type="button" title=${title} aria-label=${title} ...${rest}><${Icon} name=${icon} /></button>`;
}

export function Pill({ kind = '', children, title }) {
  return html`<span class=${'pill ' + kind} title=${title}>${children}</span>`;
}

export function Swatch({ color, size = 12 }) {
  return html`<span class="swatch" style=${`background:${color || 'transparent'};width:${size}px;height:${size}px`}></span>`;
}

export function Field({ label, hint, children, wide }) {
  return html`<label class=${'fld' + (wide ? ' wide' : '')}>
    <span>${label}</span>
    ${children}
    ${hint ? html`<small class="muted">${hint}</small>` : null}
  </label>`;
}

export function Select({ value, options, onChange, id, class: cls = '', placeholder }) {
  return html`<select id=${id} class=${'inp ' + cls} value=${value ?? ''} onChange=${(e) => onChange(e.target.value)}>
    ${placeholder !== undefined ? html`<option value="">${placeholder}</option>` : null}
    ${options.map((o) => (typeof o === 'object' ? html`<option value=${o.value}>${o.label}</option>` : html`<option value=${o}>${o}</option>`))}
  </select>`;
}

export function Tabs({ tabs, active, onChange, class: cls = '' }) {
  return html`<div class=${'tabs ' + cls} role="tablist">
    ${tabs.map(
      (tb) => html`<button role="tab" aria-selected=${tb.key === active} class=${'tab' + (tb.key === active ? ' on' : '')} onClick=${() => onChange(tb.key)}>
        ${tb.icon ? html`<${Icon} name=${tb.icon} size=${16} />` : null}
        <span>${tb.label}</span>
        ${tb.badge ? html`<span class=${'badge ' + (tb.badgeKind || '')}>${tb.badge}</span>` : null}
      </button>`,
    )}
  </div>`;
}

export function Empty({ icon = 'info', title, children }) {
  return html`<div class="empty">
    <${Icon} name=${icon} size=${28} />
    ${title ? html`<h3>${title}</h3>` : null}
    ${children ? html`<div class="muted">${children}</div>` : null}
  </div>`;
}

export function Stat({ label, value, unit, sub, kind = '' }) {
  return html`<div class=${'stat ' + kind}>
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}${unit ? html`<small>${unit}</small>` : null}</div>
    ${sub ? html`<div class="stat-sub">${sub}</div>` : null}
  </div>`;
}

export function PageHead({ title, sub, children }) {
  return html`<header class="page-head">
    <div>
      <h1>${title}</h1>
      ${sub ? html`<p class="muted">${sub}</p>` : null}
    </div>
    ${children ? html`<div class="page-actions">${children}</div>` : null}
  </header>`;
}

/** Horizontal bar used for completeness / pass-rate. */
export function Meter({ value, max = 100, kind = '' }) {
  const pct = Math.max(0, Math.min(100, (100 * (value || 0)) / (max || 1)));
  return html`<span class=${'meter ' + kind} role="meter" aria-valuenow=${Math.round(pct)} aria-valuemin="0" aria-valuemax="100"><i style=${`width:${pct}%`}></i></span>`;
}

export function navigate(hash) {
  if (location.hash !== hash) location.hash = hash;
}

/** Autosize helper for canvas/SVG containers. */
export function useSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref.current]);
  return size;
}

export { useRef };

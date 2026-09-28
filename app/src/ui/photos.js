// Core photo gallery for a hole, and a compact strip for the selected interval.
import { html, useState, useEffect, useRef } from '../lib.js';
import { S, rows, mutate } from '../core/store.js';
import { addPhotos, photoURL, photosAt } from '../core/photos.js';
import { fix } from '../core/util.js';
import { tr, t } from '../i18n.js';
import { Icon } from './icons.js';
import { Button, IconButton, Empty, toast, openModal, confirmDialog, injectCSS } from './kit.js';
import { track, doneToast } from './undo.js';

injectCSS(
  'photos',
  `
.ph-wrap { padding: 14px 16px; overflow: auto; flex: 1; }
.ph-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.ph-card { border: 1px solid var(--line); border-radius: var(--radius-sm); overflow: hidden; background: var(--surface); cursor: zoom-in; display: flex; flex-direction: column; }
.ph-card:hover { border-color: var(--accent); }
.ph-img { aspect-ratio: 16 / 9; background: var(--surface-3); display: grid; place-items: center; overflow: hidden; }
.ph-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.ph-cap { display: flex; justify-content: space-between; gap: 6px; padding: 6px 8px; font-size: 12px; }
.ph-cap b { font-family: var(--mono); font-weight: 600; }
.ph-drop { border: 2px dashed var(--line-2); border-radius: var(--radius); padding: 18px; text-align: center; color: var(--muted); }
.ph-drop.over { border-color: var(--accent); background: var(--accent-soft); color: var(--ink); }
.ph-strip { display: flex; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--line); background: var(--surface); overflow-x: auto; align-items: center; }
.ph-strip img { height: 64px; border-radius: 4px; cursor: zoom-in; border: 1px solid var(--line); }
.ph-light { display: flex; flex-direction: column; gap: 10px; }
.ph-light img { max-width: 100%; max-height: calc(100vh - 220px); object-fit: contain; align-self: center; border-radius: 6px; background: #000; }
`,
);

export function Thumb({ row, onClick, cls = '' }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    photoURL(row).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [row.id, row.blobKey, row.assetId]);
  return url ? html`<img class=${cls} src=${url} alt=${row.name} loading="lazy" onClick=${onClick} />` : html`<${Icon} name="image" size=${28} />`;
}

export function openPhoto(list, index) {
  openModal(
    (close) => {
      const Body = () => {
        const [i, setI] = useState(index);
        const r = list[i];
        useEffect(() => {
          const k = (e) => {
            if (e.key === 'ArrowRight') setI((x) => Math.min(list.length - 1, x + 1));
            if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
          };
          window.addEventListener('keydown', k);
          return () => window.removeEventListener('keydown', k);
        }, []);
        return html`<div class="dlg-body ph-light">
          <${Thumb} row=${r} />
          <div class="row between">
            <div><b class="mono">${r.holeId}</b> ${r.from !== null ? `${fix(r.from)}–${fix(r.to)} m` : ''} ${r.boxes ? `· Box ${r.boxes}` : ''} ${r.kind ? `· ${r.kind}` : ''}</div>
            <div class="row">
              <${IconButton} icon="chevronLeft" title="←" disabled=${i === 0} onClick=${() => setI(i - 1)} />
              <span class="muted num">${i + 1} / ${list.length}</span>
              <${IconButton} icon="chevronRight" title="→" disabled=${i === list.length - 1} onClick=${() => setI(i + 1)} />
            </div>
          </div>
          <div class="muted" style="font-size:12px">${r.name}</div>
        </div>`;
      };
      return html`<${Body} />`;
    },
    { title: tr({ en: 'Core photo', mn: 'Кернийн зураг' }), full: true },
  );
}

function pickImages(folder) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.accept = 'image/*,.heic';
    if (folder) inp.webkitdirectory = true;
    inp.onchange = () => resolve([...(inp.files || [])]);
    inp.click();
  });
}

export function PhotoTab({ holeId, readOnly }) {
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(null);
  const [over, setOver] = useState(false);
  const list = rows('photos', holeId).filter((p) => !kind || p.kind === kind);

  async function add(files) {
    if (!files?.length) return;
    setBusy(`0 / ${files.length}`);
    try {
      const r = await addPhotos(files, { fallbackHole: holeId, onProgress: (i, n) => setBusy(`${i} / ${n}`) });
      track(r.res, 'photos');
      const msg = tr({ en: '{a} photos added', mn: '{a} зураг нэмлээ' }, { a: r.added }) + (r.skipped.length ? tr({ en: ', {s} skipped', mn: ', {s} алгассан' }, { s: r.skipped.length }) : '');
      if (r.res) doneToast(r.res, msg);
      else toast(msg, { kind: 'warn' });
      if (r.skipped.length)
        openModal(
          () => html`<div class="dlg-body"><table class="tbl"><tbody>${r.skipped.slice(0, 200).map((x) => html`<tr><td class="mono">${x.name}</td><td class="muted">${x.reason}</td></tr>`)}</tbody></table></div>`,
          { title: tr({ en: 'Skipped files', mn: 'Алгассан файлууд' }), wide: true },
        );
    } catch (e) {
      toast(String(e.message || e), { kind: 'err' });
    }
    setBusy(null);
  }

  return html`<div class="ph-wrap">
    <div class="stack">
      <div class="row">
        <${Button} icon="image" kind="primary" disabled=${readOnly || !!busy} onClick=${async () => add(await pickImages(false))}>${tr({ en: 'Add photos', mn: 'Зураг нэмэх' })}<//>
        <${Button} icon="folder" disabled=${readOnly || !!busy} onClick=${async () => add(await pickImages(true))}>${tr({ en: 'Add a folder (Wet / Dry)', mn: 'Хавтас нэмэх (Wet / Dry)' })}<//>
        <div class="seg">
          ${[['', t('all')], ['wet', 'Wet'], ['dry', 'Dry']].map(([k, l]) => html`<button class=${kind === k ? 'on' : ''} onClick=${() => setKind(k)}>${l}</button>`)}
        </div>
        ${busy ? html`<span class="muted">${tr({ en: 'Processing', mn: 'Боловсруулж байна' })} ${busy}…</span>` : null}
      </div>
      ${!readOnly
        ? html`<div
            class=${'ph-drop' + (over ? ' over' : '')}
            onDragOver=${(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave=${() => setOver(false)}
            onDrop=${(e) => {
              e.preventDefault();
              setOver(false);
              add([...(e.dataTransfer?.files || [])]);
            }}
          >
            ${tr({ en: 'Drop photos here. Names like MU2611_0.00-7.70_Box 1-2.JPG are placed at their depth automatically; photos of other holes go to those holes.', mn: 'Зургаа энд чирж оруулна уу. MU2611_0.00-7.70_Box 1-2.JPG хэлбэрийн нэртэй зураг гүндээ автоматаар байрлана; бусад цооногийн зураг тухайн цооногт очно.' })}
          </div>`
        : null}
      ${list.length
        ? html`<div class="ph-grid">
            ${list.map(
              (r, i) => html`<div class="ph-card" onClick=${() => openPhoto(list, i)}>
                <div class="ph-img"><${Thumb} row=${r} /></div>
                <div class="ph-cap">
                  <span><b>${r.from !== null ? `${fix(r.from)}–${fix(r.to)}` : '—'}</b> m ${r.boxes ? html`<span class="muted">· Box ${r.boxes}</span>` : null}</span>
                  <span class="row" style="gap:4px">
                    ${r.kind ? html`<span class="pill">${r.kind}</span>` : null}
                    ${!readOnly
                      ? html`<button
                          class="icon-btn"
                          style="width:24px;height:24px"
                          title=${t('delete')}
                          onClick=${async (e) => {
                            e.stopPropagation();
                            if (await confirmDialog({ title: tr({ en: 'Remove this photo?', mn: 'Энэ зургийг хасах уу?' }), body: r.name, ok: t('delete'), danger: true }))
                              doneToast(track(mutate([{ type: 'delete', table: 'photos', holeId, id: r.id }], { label: `Remove photo ${r.name}` })), tr({ en: 'Removed', mn: 'Хаслаа' }));
                          }}
                        ><${Icon} name="trash" size=${14} /></button>`
                      : null}
                  </span>
                </div>
              </div>`,
            )}
          </div>`
        : html`<${Empty} icon="image" title=${tr({ en: 'No core photos for this hole yet', mn: 'Энэ цооногт кернийн зураг алга' })} />`}
    </div>
  </div>`;
}

/** Thumbnails of the photos covering the selected interval. */
export function PhotoStrip({ holeId, from, to }) {
  if (from === null || from === undefined) return null;
  const list = photosAt(holeId, from, to ?? from + 0.01);
  if (!list.length) return null;
  return html`<div class="ph-strip">
    <${Icon} name="image" size=${16} />
    <span class="muted" style="font-size:12px;white-space:nowrap">${fix(from)}–${fix(to)} m</span>
    ${list.slice(0, 8).map((r, i) => html`<span title=${r.name}><${Thumb} row=${r} onClick=${() => openPhoto(list, i)} /></span>`)}
  </div>`;
}

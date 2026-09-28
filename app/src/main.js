// Boot: storage, identity, language, first project, then render.
import { html, render } from './lib.js';
import { S, listProjects, openProject, createProject, emit } from './core/store.js';
import { bestAdapter } from './core/persist.js';
import './core/structure.js';
import { initLang } from './i18n.js';
import { App } from './ui/app.js';
import { startCloud } from './core/cloud.js';

async function identify() {
  let name = '';
  try {
    name = localStorage.getItem('ord.userName') || '';
  } catch {}
  let id = null;
  try {
    id = localStorage.getItem('ord.userId');
    if (!id) {
      id = 'l_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('ord.userId', id);
    }
  } catch {
    id = 'l_anon';
  }
  S.user = { id, name };
}

async function boot() {
  initLang();
  await identify();
  S.adapter = await bestAdapter();
  S.status.storage = S.adapter.kind;
  await listProjects();

  // Inside claude.ai the shared cloud store replaces device-only storage.
  const cloud = await startCloud().catch((e) => {
    console.warn('cloud unavailable', e);
    return null;
  });

  if (!cloud) {
    let last = null;
    try {
      last = localStorage.getItem('ord.lastProject');
    } catch {}
    const pick = S.projects.find((p) => p.id === last) || S.projects[0];
    if (pick) await openProject(pick.id);
    else {
      // First run: open the synthetic demo so every feature has something to show.
      const { buildDemo } = await import('./core/demo.js');
      await createProject({ name: 'Red Hill demo (synthetic)', demo: true });
      buildDemo();
    }
  }
  emit();
  render(html`<${App} />`, document.getElementById('ord-root'));
  document.getElementById('ord-boot')?.remove();
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('ord-boot');
  if (el) el.textContent = 'ORD failed to start: ' + (e?.message || e);
});

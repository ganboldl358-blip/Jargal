// Bilingual UI (Монгол / English). Modules pass inline pairs with tr({en, mn})
// so each view owns its own strings; shared words live in DICT.

import { S, emit } from './core/store.js';

export const DICT = {
  appTagline: { en: 'Drillhole data platform', mn: 'Өрөмдлөгийн мэдээллийн платформ' },
  dashboard: { en: 'Overview', mn: 'Тойм' },
  holes: { en: 'Drill holes', mn: 'Цооногууд' },
  map: { en: 'Map', mn: 'Зураг' },
  view3d: { en: '3D', mn: '3D' },
  qaqc: { en: 'QA/QC', mn: 'QA/QC' },
  sampling: { en: 'Sampling & dispatch', mn: 'Дээж, илгээлт' },
  import: { en: 'Import', mn: 'Импорт' },
  export: { en: 'Export', mn: 'Экспорт' },
  intercepts: { en: 'Intercepts', mn: 'Интерсепт' },
  validation: { en: 'Validation', mn: 'Шалгалт' },
  codes: { en: 'Code lists', mn: 'Кодын жагсаалт' },
  history: { en: 'History', mn: 'Түүх' },
  settings: { en: 'Settings', mn: 'Тохиргоо' },
  projects: { en: 'Projects', mn: 'Төслүүд' },
  save: { en: 'Save', mn: 'Хадгалах' },
  cancel: { en: 'Cancel', mn: 'Болих' },
  close: { en: 'Close', mn: 'Хаах' },
  delete: { en: 'Delete', mn: 'Устгах' },
  add: { en: 'Add', mn: 'Нэмэх' },
  edit: { en: 'Edit', mn: 'Засах' },
  undo: { en: 'Undo', mn: 'Буцаах' },
  search: { en: 'Search', mn: 'Хайх' },
  hole: { en: 'Hole', mn: 'Цооног' },
  from: { en: 'From', mn: 'Эхлэл' },
  to: { en: 'To', mn: 'Төгсгөл' },
  depth: { en: 'Depth', mn: 'Гүн' },
  metres: { en: 'm', mn: 'м' },
  none: { en: 'None', mn: 'Байхгүй' },
  all: { en: 'All', mn: 'Бүгд' },
  yes: { en: 'Yes', mn: 'Тийм' },
  no: { en: 'No', mn: 'Үгүй' },
  error: { en: 'Error', mn: 'Алдаа' },
  warning: { en: 'Warning', mn: 'Анхааруулга' },
  info: { en: 'Info', mn: 'Мэдээлэл' },
  saved: { en: 'Saved', mn: 'Хадгалагдсан' },
  saving: { en: 'Saving…', mn: 'Хадгалж байна…' },
  offline: { en: 'On this device', mn: 'Энэ төхөөрөмж дээр' },
  cloud: { en: 'Shared (live)', mn: 'Хамтын (шууд)' },
  demoBanner: {
    en: 'Sample project with synthetic data – for trying ORD out. Your own projects are listed under Projects.',
    mn: 'Туршилтын төсөл — зохиомол өгөгдөл. Өөрийн төслөө «Төслүүд» хэсгээс нээнэ үү.',
  },
};

export const lang = () => S.lang;

export function t(key) {
  const e = DICT[key];
  if (!e) return key;
  return e[S.lang] ?? e.en;
}

/** Pick the current-language string from an {en, mn} pair (or return a plain string). */
export function tr(pair, params) {
  let s = pair && typeof pair === 'object' ? pair[S.lang] ?? pair.en : pair;
  if (params && typeof s === 'string') s = s.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? '');
  return s ?? '';
}

export function setLang(l) {
  S.lang = l === 'en' ? 'en' : 'mn';
  try {
    localStorage.setItem('ord.lang', S.lang);
  } catch {}
  document.documentElement.lang = S.lang;
  emit();
}

export function initLang() {
  let l = 'mn';
  try {
    l = localStorage.getItem('ord.lang') || l;
  } catch {}
  S.lang = l === 'en' ? 'en' : 'mn';
  document.documentElement.lang = S.lang;
}

export const label = (f) => tr(f?.label) || f?.key || '';

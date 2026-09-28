// Table definitions. Every grid, form, import mapping, export and validation
// rule is driven from here, so adding a field is a one-line change.
//
// Field types: text | note | num | int | pct | date | code | bool | calc
// `mx`       column header used by MX Deposit (export / import auto-mapping)
// `aliases`  other headers recognised on import (case/space/underscore-insensitive)
// `calc`     derived value; never imported, never exported to MX

import { isNum, sum } from './util.js';

const F = (key, type, en, mn, opts = {}) => ({ key, type, label: { en, mn }, ...opts });

export const SULPHIDES = [
  ['py', 'PY', 'Pyrite %', 'Пирит %'],
  ['po', 'PO', 'Pyrrhotite %', 'Пирротин %'],
  ['cpy', 'CPY', 'Chalcopyrite %', 'Халькопирит %'],
  ['bn', 'BN', 'Bornite %', 'Борнит %'],
  ['cc', 'CC', 'Chalcocite %', 'Халькозин %'],
  ['pn', 'PN', 'Pentlandite %', 'Пентландит %'],
  ['sph', 'SPH', 'Sphalerite %', 'Сфалерит %'],
  ['gn', 'GN', 'Galena %', 'Галенит %'],
  ['asp', 'ASP', 'Arsenopyrite %', 'Арсенопирит %'],
];

const intervalBase = () => [
  F('from', 'num', 'From', 'Эхлэл', { req: true, w: 70, mx: 'From', aliases: ['depth from', 'from m', 'from_m', 'depth_from', 'depth_from_m', 'mfrom', 'start'] }),
  F('to', 'num', 'To', 'Төгсгөл', { req: true, w: 70, mx: 'To', aliases: ['depth to', 'to m', 'to_m', 'depth_to', 'depth_to_m', 'mto', 'end'] }),
];

export const TABLES = {
  collar: {
    key: 'collar',
    label: { en: 'Collar / header', mn: 'Цооногийн ам (Header)' },
    scope: 'hole',
    kind: 'single',
    match: ['holeId'],
    fields: [
      F('holeId', 'text', 'Hole ID', 'Цооног', { req: true, w: 110, mx: 'Hole Number', aliases: ['hole id', 'holeid', 'hole_id', 'hole', 'hole no', 'hole_number', 'bhid', 'dhid'] }),
      F('prospect', 'text', 'Prospect', 'Талбай', { w: 110, mx: 'Prospect', aliases: ['target', 'area'] }),
      F('holeType', 'code', 'Hole type', 'Төрөл', { list: 'HOLETYPE', w: 70, mx: 'Hole Type', aliases: ['type', 'hole_type', 'drill type'] }),
      F('status', 'code', 'Status', 'Төлөв', { list: 'HOLESTATUS', w: 90, mx: 'Status', aliases: ['hole status'] }),
      F('east', 'num', 'Easting', 'X (Easting)', { req: true, w: 100, dp: 2, mx: 'Easting', aliases: ['east', 'x', 'easting', 'utm_e', 'e'] }),
      F('north', 'num', 'Northing', 'Y (Northing)', { req: true, w: 110, dp: 2, mx: 'Northing', aliases: ['north', 'y', 'northing', 'utm_n', 'n'] }),
      F('rl', 'num', 'RL', 'Z (RL)', { req: true, w: 80, dp: 2, mx: 'Elevation', aliases: ['rl', 'z', 'elevation', 'elev', 'height'] }),
      F('lon', 'num', 'Longitude', 'Уртраг', { w: 100, dp: 8, mx: 'Longitude', aliases: ['lon', 'long', 'longitude'], hidden: true }),
      F('lat', 'num', 'Latitude', 'Өргөрөг', { w: 100, dp: 8, mx: 'Latitude', aliases: ['lat', 'latitude'], hidden: true }),
      F('azimuth', 'num', 'Azimuth', 'Азимут', { w: 70, dp: 1, mx: 'Azimuth', aliases: ['azi', 'az', 'azimuth'] }),
      F('dip', 'num', 'Dip', 'Налуу', { w: 60, dp: 1, mx: 'Dip', aliases: ['dip', 'inclination', 'incl'] }),
      F('plannedDepth', 'num', 'Planned depth', 'Төлөвлөсөн гүн', { w: 80, dp: 1, mx: 'Planned depth', aliases: ['planned depth', 'plan depth'] }),
      F('eoh', 'num', 'EOH depth', 'Эцсийн гүн (EOH)', { w: 80, dp: 2, req: true, mx: 'Final depth', aliases: ['eoh', 'total depth', 'total_depth_m', 'max depth', 'depth', 'final depth', 'td'] }),
      F('startDate', 'date', 'Start date', 'Эхэлсэн', { w: 100, mx: 'Start date', aliases: ['start', 'start_date', 'date started'] }),
      F('endDate', 'date', 'End date', 'Дууссан', { w: 100, mx: 'End date', aliases: ['end', 'end_date', 'date completed'] }),
      F('coreSize', 'code', 'Core size', 'Диаметр', { list: 'CORESIZE', w: 60, mx: 'Core size', aliases: ['core size', 'diameter'] }),
      F('contractor', 'text', 'Drilling contractor', 'Гүйцэтгэгч', { w: 130, mx: 'Contractor', aliases: ['drilling company', 'company', 'driller'] }),
      F('rig', 'text', 'Rig', 'Машин', { w: 70, mx: 'Rig', hidden: true }),
      F('geologist', 'text', 'Geologist', 'Геологич', { w: 110, mx: 'Geologist', aliases: ['supervisor', 'logged by', 'logger'] }),
      F('lease', 'text', 'Licence', 'Тусгай зөвшөөрөл', { w: 100, mx: 'Licence', aliases: ['lease', 'license', 'licence', 'tenement'] }),
      F('surveyMethod', 'code', 'Collar survey', 'Амны хэмжилт', { list: 'SURVMETHOD', w: 80, mx: 'Collar survey method', hidden: true }),
      F('remarks', 'note', 'Remarks', 'Тэмдэглэл', { w: 220, mx: 'REMARKS', aliases: ['remarks', 'comments', 'comment', 'notes'] }),
      F('locked', 'bool', 'Locked', 'Түгжээ', { w: 60, noImport: true }),
      F('loggedTo', 'calc', 'Logged to (m)', 'Логдсон гүн', { w: 80, dp: 2, calc: (r, ctx) => ctx?.loggedTo?.(r.holeId) ?? null }),
    ],
  },

  survey: {
    key: 'survey',
    label: { en: 'Downhole survey', mn: 'Гүний хэмжилт (Survey)' },
    scope: 'hole',
    kind: 'point',
    depthField: 'depth',
    match: ['holeId', 'depth'],
    fields: [
      F('depth', 'num', 'Depth', 'Гүн', { req: true, w: 70, dp: 2, mx: 'Depth', aliases: ['depth_m', 'at', 'survey depth'] }),
      F('azimuth', 'num', 'Azimuth', 'Азимут', { req: true, w: 70, dp: 2, mx: 'Azimuth', aliases: ['azi', 'az', 'azimuth'] }),
      F('dip', 'num', 'Dip', 'Налуу', { req: true, w: 70, dp: 2, mx: 'Dip', aliases: ['dip', 'inclination', 'incl'] }),
      F('method', 'code', 'Method', 'Арга', { list: 'SURVMETHOD', w: 80, mx: 'Method', aliases: ['survey method', 'instrument'] }),
      F('date', 'date', 'Date', 'Огноо', { w: 100, mx: 'Date', aliases: ['survey_date', 'survey date'] }),
      F('company', 'text', 'Company', 'Компани', { w: 130, mx: 'Company', aliases: ['survey_company', 'contractor'] }),
      F('exclude', 'bool', 'Exclude', 'Хасах', { w: 60, mx: 'Exclude' }),
      F('remarks', 'note', 'Remarks', 'Тэмдэглэл', { w: 200, mx: 'REMARKS', aliases: ['qa_note', 'comments'] }),
    ],
  },

  lith: {
    key: 'lith',
    label: { en: 'Lithology & alteration', mn: 'Литологи, хувирал' },
    short: { en: 'Lithology', mn: 'Литологи' },
    scope: 'hole',
    kind: 'interval',
    match: ['holeId', 'from', 'to'],
    fields: [
      ...intervalBase(),
      F('lith1', 'code', 'Lith1', 'Lith1', { list: 'LITH', req: true, w: 80, mx: 'Lith1', aliases: ['lith', 'lith1', 'lithology', 'rock code', 'code', 'lith code'] }),
      F('rockName', 'calc', 'Rock name', 'Чулуулгийн нэр', { w: 150, calc: (r, ctx) => ctx?.meaning?.('LITH', r.lith1) ?? '' }),
      F('weathering', 'code', 'Weathering', 'Өгөршил', { list: 'WEATH', w: 50, mx: 'Weathering', group: 'rock' }),
      F('hardness', 'code', 'Hardness', 'Хатуулаг', { list: 'HARD', w: 50, mx: 'Hardness', group: 'rock' }),
      F('shade', 'code', 'Shade', 'Гэгээ', { list: 'SHADE', w: 50, mx: 'Shade', group: 'rock' }),
      F('colour1', 'code', 'Colour 1', 'Өнгө 1', { list: 'COLOUR', w: 60, mx: 'Colour 1', aliases: ['colour', 'color', 'color 1', 'colour1'], group: 'rock' }),
      F('colour2', 'code', 'Colour 2', 'Өнгө 2', { list: 'COLOUR', w: 60, mx: 'Colour 2', aliases: ['color 2', 'colour2'], group: 'rock' }),
      F('grainSize', 'code', 'Grain size', 'Ширхэг', { list: 'GRAIN', w: 55, mx: 'GrainSize', aliases: ['grain size', 'grainsize', 'grain'], group: 'rock' }),
      F('texture', 'code', 'Texture', 'Текстур', { list: 'TEXTURE', w: 60, mx: 'Texture', group: 'rock' }),
      F('structure', 'code', 'Structure', 'Бүтэц', { list: 'STRUCT', w: 60, mx: 'Structure', group: 'rock' }),
      F('strucInt', 'code', 'Struc Int', 'Бүтц. эрчим', { list: 'STRINT', w: 50, mx: 'Struc Int', aliases: ['structure intensity', 'strucint'], group: 'rock' }),
      F('alt1', 'code', 'Alt1', 'Хувирал 1', { list: 'ALT', w: 60, mx: 'Alt1', aliases: ['alteration', 'alt', 'alt 1'], group: 'alt' }),
      F('int1', 'code', 'Int1', 'Эрчим 1', { list: 'INT', w: 45, mx: 'Int1', aliases: ['int 1', 'alt int', 'intensity'], group: 'alt' }),
      F('style1', 'code', 'Style1', 'Хэлбэр 1', { list: 'STYLE', w: 55, mx: 'Style1', aliases: ['style 1'], group: 'alt' }),
      F('alt2', 'code', 'Alt2', 'Хувирал 2', { list: 'ALT', w: 60, mx: 'Alt2', aliases: ['alt 2'], group: 'alt' }),
      F('int2', 'code', 'Int2', 'Эрчим 2', { list: 'INT', w: 45, mx: 'Int2', aliases: ['int 2'], group: 'alt' }),
      F('style2', 'code', 'Style2', 'Хэлбэр 2', { list: 'STYLE', w: 55, mx: 'Style2', aliases: ['style 2'], group: 'alt' }),
      F('alt3', 'code', 'Alt3', 'Хувирал 3', { list: 'ALT', w: 60, mx: 'Alt3', aliases: ['alt 3'], group: 'alt', hidden: true }),
      F('int3', 'code', 'Int3', 'Эрчим 3', { list: 'INT', w: 45, mx: 'Int3', aliases: ['int 3'], group: 'alt', hidden: true }),
      F('style3', 'code', 'Style3', 'Хэлбэр 3', { list: 'STYLE', w: 55, mx: 'Style3', aliases: ['style 3'], group: 'alt', hidden: true }),
      F('sulphStyle', 'code', 'Sulph style', 'Сульф. хэлбэр', { list: 'STYLE', w: 60, mx: 'Sulphide Style', aliases: ['sulphide style', 'sulfide style', 'min style'], group: 'min' }),
      ...SULPHIDES.map(([k, mx, en, mn]) => F(k, 'pct', en, mn, { w: 48, dp: 2, mx, aliases: [mx.toLowerCase(), `${mx.toLowerCase()} %`, `${mx.toLowerCase()}_pct`], group: 'min', hidden: ['pn', 'gn', 'asp', 'po'].includes(k) })),
      F('totalSlf', 'calc', 'Total SLF %', 'Нийт сульфид %', { w: 60, dp: 2, group: 'min', calc: (r) => { const s = sum(SULPHIDES, ([k]) => r[k]); return s > 0 ? s : null; } }),
      F('veinPct', 'pct', 'VQZ %', 'Судал %', { w: 50, dp: 1, mx: 'VQZ %', aliases: ['vqz', 'vein %', 'vein pct', 'qtz vein %'], group: 'vein' }),
      F('veinStyle', 'code', 'Vein style', 'Судл. хэлбэр', { list: 'VEINSTYLE', w: 60, mx: 'VeinStyle', aliases: ['vein style'], group: 'vein' }),
      F('veinMinerals', 'text', 'Vein minerals', 'Судлын эрдэс', { w: 110, mx: 'Vein_Minerals', aliases: ['vein minerals'], group: 'vein' }),
      F('comments', 'note', 'Comments', 'Тайлбар', { w: 240, mx: 'Comments', aliases: ['comment', 'description', 'remarks', 'notes'] }),
      F('logger', 'text', 'Logged by', 'Логчин', { w: 90, mx: 'Logger', aliases: ['geologist', 'logged by'], hidden: true }),
      F('logDate', 'date', 'Log date', 'Логдсон огноо', { w: 95, mx: 'Log date', aliases: ['date logged', 'logged date', 'date'], hidden: true }),
    ],
  },

  geotech: {
    key: 'geotech',
    label: { en: 'Recovery & RQD', mn: 'Авралт, RQD' },
    short: { en: 'Recovery', mn: 'Авралт' },
    scope: 'hole',
    kind: 'interval',
    match: ['holeId', 'from', 'to'],
    fields: [
      ...intervalBase(),
      F('runLen', 'calc', 'Run length', 'Рейсийн урт', { w: 60, dp: 2, calc: (r) => (isNum(r.from) && isNum(r.to) ? r.to - r.from : null) }),
      F('recovered', 'num', 'Recovered (m)', 'Авсан (м)', { w: 70, dp: 2, mx: 'Recovered', aliases: ['recovered m', 'core recovered', 'rec m', 'recovery m'] }),
      F('coreLoss', 'calc', 'Core loss (m)', 'Алдагдал (м)', { w: 60, dp: 2, calc: (r) => (isNum(r.recovered) && isNum(r.from) && isNum(r.to) ? Math.max(0, r.to - r.from - r.recovered) : null) }),
      F('recPct', 'calc', 'Recovered %', 'Авралт %', { w: 60, dp: 1, calc: (r) => (isNum(r.recovered) && r.to > r.from ? (100 * r.recovered) / (r.to - r.from) : null) }),
      F('rqd', 'num', 'RQD length (m)', 'RQD урт (м)', { w: 70, dp: 2, mx: 'RQD', aliases: ['rqd m', 'rqd length', 'sum >10cm'] }),
      F('rqdPct', 'calc', 'RQD %', 'RQD %', { w: 55, dp: 1, calc: (r) => (isNum(r.rqd) && r.to > r.from ? (100 * r.rqd) / (r.to - r.from) : null) }),
      F('fractures', 'int', 'Fractures', 'Ан цавын тоо', { w: 60, mx: 'Fractures', aliases: ['fracture count', 'ff'] }),
      F('trayNo', 'text', 'Tray no.', 'Хайрцаг №', { w: 60, mx: 'TrayNo', aliases: ['tray', 'box', 'box no', 'tray no'] }),
      F('logger', 'text', 'Logged by', 'Логчин', { w: 90, mx: 'Logger', hidden: true }),
      F('remarks', 'note', 'Remarks', 'Тэмдэглэл', { w: 220, mx: 'REMARKS', aliases: ['comments', 'comment'] }),
    ],
  },

  struct: {
    key: 'struct',
    label: { en: 'Structure measurements', mn: 'Бүтцийн хэмжилт' },
    short: { en: 'Structure', mn: 'Бүтэц' },
    scope: 'hole',
    kind: 'point',
    depthField: 'depth',
    match: ['holeId', 'depth', 'type'],
    fields: [
      F('depth', 'num', 'Depth', 'Гүн', { req: true, w: 70, dp: 2, mx: 'Depth', aliases: ['depth_m', 'at'] }),
      F('type', 'code', 'Type', 'Төрөл', { list: 'STRTYPE', req: true, w: 60, mx: 'Structure type', aliases: ['structure', 'struct type', 'feature'] }),
      F('alpha', 'num', 'Alpha', 'Альфа', { w: 55, dp: 0, mx: 'Alpha', aliases: ['alpha', 'a'] }),
      F('beta', 'num', 'Beta', 'Бета', { w: 55, dp: 0, mx: 'Beta', aliases: ['beta', 'b'] }),
      F('dipCalc', 'calc', 'Dip (true)', 'Налуу (жинх.)', { w: 60, dp: 0, calc: (r, ctx) => ctx?.orient?.(r)?.dip ?? null }),
      F('dipDirCalc', 'calc', 'Dip dir (true)', 'Налуугийн чиг', { w: 70, dp: 0, calc: (r, ctx) => ctx?.orient?.(r)?.dipDir ?? null }),
      F('thickness', 'num', 'Thickness (cm)', 'Зузаан (см)', { w: 60, dp: 1, mx: 'Thickness', aliases: ['width', 'thick'] }),
      F('fill', 'text', 'Fill', 'Дүүргэгч', { w: 90, mx: 'Fill', aliases: ['infill', 'filling'] }),
      F('orientConf', 'code', 'Orientation', 'Чиглүүлэлт', { list: 'STRINT', w: 60, mx: 'Orientation confidence', hidden: true }),
      F('comments', 'note', 'Comments', 'Тайлбар', { w: 200, mx: 'Comments' }),
    ],
  },

  samples: {
    key: 'samples',
    label: { en: 'Samples & QC', mn: 'Дээж, QC' },
    short: { en: 'Samples', mn: 'Дээж' },
    scope: 'hole',
    kind: 'interval',
    allowNoDepth: true,
    match: ['sampleId'],
    fields: [
      F('from', 'num', 'From', 'Эхлэл', { w: 70, dp: 2, mx: 'From', aliases: ['depth from', 'from_m', 'depth_from', 'depth_from_m'] }),
      F('to', 'num', 'To', 'Төгсгөл', { w: 70, dp: 2, mx: 'To', aliases: ['depth to', 'to_m', 'depth_to', 'depth_to_m'] }),
      F('sampleId', 'text', 'Sample ID', 'Дээжийн №', { req: true, w: 100, mx: 'Sample ID', aliases: ['sample', 'sample_id', 'sampleid', 'sample no', 'sample number', 'tag'] }),
      F('sampleType', 'code', 'Type', 'Төрөл', { list: 'SAMPTYPE', req: true, w: 60, mx: 'Sample Type', aliases: ['type', 'sample type', 'qc type'] }),
      F('parentId', 'text', 'Parent (dup of)', 'Эх дээж', { w: 100, mx: 'Parent Sample ID', aliases: ['parent', 'original', 'original sample', 'dup of'] }),
      F('crm', 'text', 'Standard / blank', 'Стандарт', { w: 100, mx: 'Standard ID', aliases: ['standard', 'crm', 'std', 'standard id', 'blank id'] }),
      F('length', 'calc', 'Length', 'Урт', { w: 55, dp: 2, calc: (r) => (isNum(r.from) && isNum(r.to) ? r.to - r.from : null) }),
      F('weight', 'num', 'Weight (kg)', 'Жин (кг)', { w: 60, dp: 2, mx: 'Weight', aliases: ['weight kg', 'wt', 'mass'] }),
      F('dispatchId', 'text', 'Dispatch', 'Илгээлт', { w: 90, mx: 'Dispatch', aliases: ['batch', 'dispatch no', 'submission'] }),
      F('status', 'calc', 'Status', 'Төлөв', { w: 90, calc: (r, ctx) => ctx?.sampleStatus?.(r) ?? '', labels: { pending: { en: 'pending', mn: 'хүлээгдэж буй' }, dispatched: { en: 'dispatched', mn: 'илгээсэн' }, assayed: { en: 'assayed', mn: 'шинжлэгдсэн' } } }),
      F('comments', 'note', 'Comments', 'Тайлбар', { w: 180, mx: 'Comments' }),
    ],
  },

  assays: {
    key: 'assays',
    label: { en: 'Assays', mn: 'Шинжилгээ (Assay)' },
    scope: 'hole',
    kind: 'values',
    match: ['sampleId', 'certificate'],
    fields: [
      F('sampleId', 'text', 'Sample ID', 'Дээжийн №', { req: true, w: 100, aliases: ['sample', 'sample_id', 'sampleid', 'sample description', 'sample no'] }),
      F('labJob', 'text', 'Lab job', 'Лаб. ажил', { w: 100, aliases: ['job', 'work order', 'workorder', 'lab job no'] }),
      F('certificate', 'text', 'Certificate', 'Сертификат', { w: 110, aliases: ['certificate', 'cert', 'file'] }),
      F('received', 'date', 'Reported', 'Ирсэн', { w: 95, aliases: ['date', 'reported', 'date received'] }),
    ],
  },

  pxrf: {
    key: 'pxrf',
    label: { en: 'pXRF readings', mn: 'pXRF хэмжилт' },
    short: { en: 'pXRF', mn: 'pXRF' },
    scope: 'hole',
    kind: 'values',
    depthField: 'from',
    match: ['holeId', 'from', 'reading'],
    fields: [
      F('from', 'num', 'From', 'Эхлэл', { req: true, w: 70, dp: 2, aliases: ['depth', 'depth from', 'from_m'] }),
      F('to', 'num', 'To', 'Төгсгөл', { w: 70, dp: 2, aliases: ['depth to', 'to_m'] }),
      F('reading', 'text', 'Reading #', 'Хэмжилт №', { w: 70, aliases: ['reading', 'reading no', 'reading #', 'shot'] }),
      F('date', 'date', 'Date', 'Огноо', { w: 95 }),
      F('instrument', 'text', 'Instrument', 'Багаж', { w: 90, aliases: ['serial', 'instrument', 'device'], hidden: true }),
    ],
  },

  phys: {
    key: 'phys',
    label: { en: 'Density & mag. susceptibility', mn: 'Нягт, соронзон мэдрэмж' },
    short: { en: 'SG / MagSus', mn: 'Нягт / MS' },
    scope: 'hole',
    kind: 'point',
    depthField: 'depth',
    match: ['holeId', 'depth'],
    fields: [
      F('depth', 'num', 'Depth', 'Гүн', { req: true, w: 70, dp: 2, mx: 'Depth', aliases: ['depth_m', 'at', 'from'] }),
      F('sg', 'num', 'SG (g/cm³)', 'Нягт (г/см³)', { w: 70, dp: 3, mx: 'SG', aliases: ['density', 'sg', 'bulk density'] }),
      F('magsus', 'num', 'MagSus (×10⁻³ SI)', 'Соронзон (×10⁻³ SI)', { w: 80, dp: 3, mx: 'MagSus', aliases: ['mag sus', 'ms', 'magsus', 'susceptibility'] }),
      F('method', 'text', 'Method', 'Арга', { w: 100, mx: 'Method', aliases: ['instrument'] }),
      F('comments', 'note', 'Comments', 'Тайлбар', { w: 180, mx: 'Comments' }),
    ],
  },

  // ---- project-scope tables ------------------------------------------------
  codes: {
    key: 'codes',
    label: { en: 'Code lists', mn: 'Кодын жагсаалт' },
    scope: 'project',
    kind: 'list',
    match: ['list', 'code'],
    fields: [
      F('list', 'text', 'List', 'Жагсаалт', { req: true, w: 90 }),
      F('code', 'text', 'Code', 'Код', { req: true, w: 80 }),
      F('meaning', 'text', 'Meaning (EN)', 'Утга (EN)', { w: 260, aliases: ['description', 'name', 'meaning'] }),
      F('meaningMn', 'text', 'Meaning (MN)', 'Утга (MN)', { w: 200, aliases: ['mongolian', 'mn'] }),
      F('group', 'text', 'Group', 'Бүлэг', { w: 180 }),
      F('color', 'text', 'Colour', 'Өнгө', { w: 80, aliases: ['colour', 'color', 'hex'] }),
      F('order', 'int', 'Order', 'Дараалал', { w: 50, hidden: true }),
      F('inactive', 'bool', 'Inactive', 'Идэвхгүй', { w: 60 }),
    ],
  },

  crms: {
    key: 'crms',
    label: { en: 'Standards (CRM) & blanks', mn: 'Стандарт (CRM), blank' },
    scope: 'project',
    kind: 'list',
    match: ['code', 'element'],
    fields: [
      F('code', 'text', 'CRM', 'CRM', { req: true, w: 110, aliases: ['standard', 'crm', 'std'] }),
      F('element', 'text', 'Element key', 'Элемент', { req: true, w: 90, aliases: ['analyte', 'element'] }),
      F('expected', 'num', 'Certified value', 'Гэрчилгээт утга', { req: true, w: 90, dp: 4, aliases: ['value', 'expected', 'certified', 'mean'] }),
      F('sd', 'num', '1 SD', '1 SD', { req: true, w: 70, dp: 4, aliases: ['sd', 'std dev', '1sd', 'stdev'] }),
      F('supplier', 'text', 'Supplier', 'Нийлүүлэгч', { w: 100 }),
      F('isBlank', 'bool', 'Blank', 'Blank', { w: 55 }),
    ],
  },

  dispatch: {
    key: 'dispatch',
    label: { en: 'Lab dispatches', mn: 'Лаб илгээлт' },
    scope: 'project',
    kind: 'list',
    match: ['batchId'],
    fields: [
      F('batchId', 'text', 'Dispatch no.', 'Илгээлт №', { req: true, w: 110 }),
      F('lab', 'text', 'Laboratory', 'Лаборатори', { w: 120 }),
      F('methods', 'text', 'Methods requested', 'Шинжилгээний арга', { w: 180 }),
      F('dispatched', 'date', 'Dispatched', 'Илгээсэн', { w: 95 }),
      F('dispatchedBy', 'text', 'Dispatched by', 'Илгээсэн', { w: 110 }),
      F('courier', 'text', 'Courier / waybill', 'Тээвэр', { w: 120 }),
      F('received', 'date', 'Lab received', 'Лаб хүлээн авсан', { w: 95 }),
      F('labJob', 'text', 'Lab job no.', 'Лаб. ажлын №', { w: 110 }),
      F('status', 'text', 'Status', 'Төлөв', { w: 90 }),
      F('notes', 'note', 'Notes', 'Тэмдэглэл', { w: 200 }),
    ],
  },
};

export const HOLE_TABLES = ['survey', 'lith', 'geotech', 'struct', 'samples', 'assays', 'pxrf', 'phys'];
export const LOG_TABLES = ['lith', 'geotech', 'struct', 'samples', 'pxrf', 'phys'];

export const tableDef = (t) => TABLES[t];
export const fieldDef = (t, k) => TABLES[t]?.fields.find((f) => f.key === k);

/** Element key helpers: "Au_ppm" <-> {el:'Au', unit:'ppm'} */
export function splitElementKey(k) {
  const m = String(k).match(/^([A-Za-z][A-Za-z0-9]*)_(ppm|ppb|pct|gpt|gt|pctm|ppmm|kg|g)$/);
  return m ? { el: m[1], unit: m[2] } : { el: k, unit: '' };
}
export const unitLabel = (u) => ({ pct: '%', gpt: 'g/t', gt: 'g/t', ppm: 'ppm', ppb: 'ppb', kg: 'kg', g: 'g' })[u] ?? u;
export const elementLabel = (k) => {
  const { el, unit } = splitElementKey(k);
  return unit ? `${el} ${unitLabel(unit)}` : el;
};

// Short grid headers for narrow code columns (full label stays in the tooltip).
const SHORT = {
  lith: {
    weathering: ['Weath', 'Өгөр'], hardness: ['Hard', 'Хат'], shade: ['Shade', 'Гэгээ'], colour1: ['Col 1', 'Өнгө1'], colour2: ['Col 2', 'Өнгө2'],
    grainSize: ['Grain', 'Ширх'], texture: ['Text', 'Текс'], structure: ['Struct', 'Бүтэц'], strucInt: ['S.Int', 'Б.эрч'],
    alt1: ['Alt1', 'Alt1'], int1: ['Int1', 'Int1'], style1: ['Sty1', 'Sty1'], alt2: ['Alt2', 'Alt2'], int2: ['Int2', 'Int2'], style2: ['Sty2', 'Sty2'],
    alt3: ['Alt3', 'Alt3'], int3: ['Int3', 'Int3'], style3: ['Sty3', 'Sty3'], sulphStyle: ['S.Sty', 'С.хэлб'], totalSlf: ['ΣSLF %', 'ΣСульф %'],
    veinStyle: ['V.Sty', 'Суд.хэлб'], veinMinerals: ['V.Min', 'Суд.эрдэс'], rockName: ['Rock name', 'Чулуулаг'],
    ...Object.fromEntries(SULPHIDES.map(([k, mx]) => [k, [mx, mx]])),
  },
  geotech: { runLen: ['Run', 'Рейс'], recovered: ['Rec m', 'Авсан м'], coreLoss: ['Loss', 'Алдаг.'], recPct: ['Rec %', 'Авр %'], rqd: ['RQD m', 'RQD м'], fractures: ['Frac', 'Ан цав'], trayNo: ['Tray', 'Хайрц.'] },
  samples: { sampleType: ['Type', 'Төрөл'], parentId: ['Parent', 'Эх'], crm: ['Std', 'Станд.'], weight: ['kg', 'кг'], dispatchId: ['Dispatch', 'Илгээлт'] },
  struct: { dipCalc: ['Dip', 'Налуу'], dipDirCalc: ['DipDir', 'Чиг'], thickness: ['cm', 'см'], orientConf: ['Conf', 'Итг.'] },
  collar: { holeType: ['Type', 'Төрөл'], plannedDepth: ['Plan m', 'Төл. м'], coreSize: ['Core', 'Керн'], surveyMethod: ['Surv', 'Хэмж'], loggedTo: ['Logged', 'Логдсон'] },
};
for (const [t, m] of Object.entries(SHORT)) for (const f of TABLES[t].fields) if (m[f.key]) f.short = { en: m[f.key][0], mn: m[f.key][1] };

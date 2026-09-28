// Validation engine. Every rule reports {sev, rule, table, holeId, rowId, field, msg}
// with a bilingual message, so problems are visible *before* data leaves ORD —
// unlike MX Deposit, where an import can "succeed" and silently drop rows.

import { isNum, round, fmt } from './util.js';
import { TABLES, SULPHIDES } from './schema.js';
import { rows, holes, hole, codeMap, settings, assayValues, memo, S } from './store.js';
import { overlaps, gaps, intersecting } from './intervals.js';
import { doglegs } from './desurvey.js';

const I = (sev, rule, table, holeId, rowId, field, en, mn) => ({ sev, rule, table, holeId, rowId, field, msg: { en, mn } });

export const RULES = {
  C01: { en: 'Collar coordinates missing', mn: 'Амны координат дутуу' },
  C02: { en: 'EOH depth missing', mn: 'Эцсийн гүн (EOH) дутуу' },
  C03: { en: 'Azimuth/dip out of range', mn: 'Азимут/налуу хязгаараас гарсан' },
  C04: { en: 'Longitude/latitude swapped', mn: 'Уртраг/өргөрөг солигдсон' },
  C05: { en: 'Implausible UTM coordinates', mn: 'UTM координат бодит бус' },
  C06: { en: 'Completed hole without lithology', mn: 'Дууссан цооног литологигүй' },
  C07: { en: 'Two collars at the same position', mn: 'Хоёр цооногийн ам давхцсан' },
  S01: { en: 'Survey deeper than EOH', mn: 'Хэмжилт EOH-оос гүн' },
  S02: { en: 'Duplicate survey depth', mn: 'Давхардсан хэмжилтийн гүн' },
  S03: { en: 'Severe dogleg', mn: 'Огцом муруйлт (dogleg)' },
  S04: { en: 'No downhole survey', mn: 'Гүний хэмжилт байхгүй' },
  S05: { en: 'Dip sign inconsistent', mn: 'Налуугийн тэмдэг зөрүүтэй' },
  I01: { en: 'From ≥ To', mn: 'Эхлэл ≥ Төгсгөл' },
  I02: { en: 'Overlapping intervals', mn: 'Давхацсан интервал' },
  I03: { en: 'Gap in intervals', mn: 'Интервалын завсар' },
  I04: { en: 'Beyond EOH', mn: 'EOH-оос хэтэрсэн' },
  I05: { en: 'Required value missing', mn: 'Заавал бөглөх утга дутуу' },
  I06: { en: 'Code not in list', mn: 'Жагсаалтад байхгүй код' },
  I07: { en: 'Code flagged "do not use"', mn: '«Бүү ашигла» гэсэн код' },
  I08: { en: 'Comment too long', mn: 'Тайлбар хэт урт' },
  I09: { en: 'Percentage outside 0–100', mn: 'Хувь 0–100-аас гадуур' },
  L01: { en: 'CMSQ fails chemistry rule', mn: 'CMSQ химийн дүрэмд тэнцэхгүй' },
  L02: { en: 'Sulphide code vs logged sulphide %', mn: 'Сульфидын код ба логдсон % зөрүүтэй' },
  L03: { en: 'High S in non-sulphide unit', mn: 'Сульфидгүй кодтой интервалд S өндөр' },
  L04: { en: 'Alteration code/intensity incomplete', mn: 'Хувирлын код/эрчим дутуу' },
  G01: { en: 'Recovered > run length', mn: 'Авсан урт > рейсийн урт' },
  G02: { en: 'RQD > recovered', mn: 'RQD > авсан урт' },
  P01: { en: 'Duplicate sample ID', mn: 'Давхардсан дээжийн дугаар' },
  P02: { en: 'Sample length outside limits', mn: 'Дээжийн урт хязгаараас гадуур' },
  P03: { en: 'QC sample incomplete', mn: 'QC дээжийн мэдээлэл дутуу' },
  P04: { en: 'Primary sample without depth', mn: 'Гүнгүй үндсэн дээж' },
  P05: { en: 'QC insertion rate below target', mn: 'QC оруулалтын хувь бага' },
  A01: { en: 'Assay for unknown sample', mn: 'Бүртгэлгүй дээжийн шинжилгээ' },
  T01: { en: 'Alpha/beta out of range', mn: 'Альфа/бета хязгаараас гарсан' },
  T02: { en: 'Structure beyond EOH', mn: 'Бүтцийн хэмжилт EOH-оос хэтэрсэн' },
  D01: { en: 'SG outside 1.5–6.0', mn: 'Нягт 1.5–6.0-аас гадуур' },
};

function codeChecks(table, r, out) {
  const def = TABLES[table];
  for (const f of def.fields) {
    if (f.type !== 'code') continue;
    const v = r[f.key];
    if (v === null || v === undefined || v === '') continue;
    const c = codeMap(f.list).get(String(v));
    if (!c) out.push(I('error', 'I06', table, r.holeId, r.id, f.key, `${f.label.en}: "${v}" is not in the ${f.list} list`, `${f.label.mn}: «${v}» ${f.list} жагсаалтад алга`));
    else if (c.warn) out.push(I('warn', 'I07', table, r.holeId, r.id, f.key, `${f.label.en}: "${v}" – ${c.meaning}`, `${f.label.mn}: «${v}» – ${c.meaningMn || c.meaning}`));
    else if (c.inactive) out.push(I('info', 'I07', table, r.holeId, r.id, f.key, `${f.label.en}: "${v}" is inactive`, `${f.label.mn}: «${v}» идэвхгүй код`));
  }
}

function requiredChecks(table, r, out) {
  for (const f of TABLES[table].fields) {
    if (!f.req || f.type === 'calc') continue;
    if (table === 'samples' && (f.key === 'from' || f.key === 'to')) continue;
    const v = r[f.key];
    if (v === null || v === undefined || v === '') out.push(I('error', 'I05', table, r.holeId, r.id, f.key, `${f.label.en} is required`, `${f.label.mn} заавал бөглөнө`));
  }
}

function textChecks(table, r, out, st) {
  for (const f of TABLES[table].fields) {
    if (f.type === 'note' && r[f.key]) {
      const n = String(r[f.key]).length;
      if (n > st.commentsMax) out.push(I('error', 'I08', table, r.holeId, r.id, f.key, `${f.label.en}: ${n} characters (MX limit ${st.commentsMax})`, `${f.label.mn}: ${n} тэмдэгт (MX хязгаар ${st.commentsMax})`));
      else if (n > st.commentsSoft && table === 'lith') out.push(I('info', 'I08', table, r.holeId, r.id, f.key, `${f.label.en}: ${n} characters (house style ≤ ${st.commentsSoft})`, `${f.label.mn}: ${n} тэмдэгт (дотоод журам ≤ ${st.commentsSoft})`));
    }
    if (f.type === 'pct' && isNum(r[f.key]) && (r[f.key] < 0 || r[f.key] > 100)) {
      out.push(I('error', 'I09', table, r.holeId, r.id, f.key, `${f.label.en} = ${r[f.key]}`, `${f.label.mn} = ${r[f.key]}`));
    }
  }
}

function intervalChecks(table, list, c, out, { gapSev = 'warn' } = {}) {
  const eoh = c?.eoh;
  for (const r of list) {
    if (!isNum(r.from) || !isNum(r.to)) continue;
    if (r.from >= r.to) out.push(I('error', 'I01', table, r.holeId, r.id, 'to', `${fmt(r.from)}–${fmt(r.to)} m`, `${fmt(r.from)}–${fmt(r.to)} м`));
    if (isNum(eoh) && r.to > eoh + 1e-6) out.push(I('warn', 'I04', table, r.holeId, r.id, 'to', `To ${fmt(r.to)} m > EOH ${fmt(eoh)} m`, `Төгсгөл ${fmt(r.to)} м > EOH ${fmt(eoh)} м`));
  }
  const withDepth = list.filter((r) => isNum(r.from) && isNum(r.to) && r.to > r.from);
  for (const o of overlaps(withDepth)) {
    out.push(I('error', 'I02', table, o.b.holeId, o.b.id, 'from', `${fmt(o.a.from)}–${fmt(o.a.to)} overlaps ${fmt(o.b.from)}–${fmt(o.b.to)} m`, `${fmt(o.a.from)}–${fmt(o.a.to)} ба ${fmt(o.b.from)}–${fmt(o.b.to)} м давхацсан`));
  }
  if (gapSev && withDepth.length) {
    for (const g of gaps(withDepth, { start: 0 })) {
      const after = withDepth.find((r) => Math.abs(r.from - g.to) < 1e-6);
      out.push(I(gapSev, 'I03', table, c?.holeId ?? withDepth[0].holeId, after?.id ?? null, 'from', `Gap ${fmt(g.from)}–${fmt(g.to)} m (MX Deposit rejects gaps)`, `Завсар ${fmt(g.from)}–${fmt(g.to)} м (MX Deposit завсар хүлээж авдаггүй)`));
    }
  }
}

function lithChemistry(holeId, lith, samples, st, out) {
  const { alKey, sKey, cmsqAlMax, cmsqSMax, sulphideSMin } = st.chem;
  const primaries = samples.filter((s) => s.sampleType === 'PRIM' && isNum(s.from) && isNum(s.to));
  if (!primaries.length) return;
  const sulphideCodes = new Set(['MSUL', 'VMS', 'VSU', 'VQS', 'GOS']);
  for (const r of lith) {
    if (!isNum(r.from) || !isNum(r.to)) continue;
    const hits = intersecting(primaries, r.from, r.to);
    let sw = 0;
    let al = 0;
    let s = 0;
    let wa = 0;
    let ws = 0;
    for (const h of hits) {
      const v = assayValues(h.row.sampleId)?.values;
      if (!v) continue;
      if (isNum(v[alKey])) {
        al += v[alKey] * h.len;
        wa += h.len;
      }
      if (isNum(v[sKey])) {
        s += v[sKey] * h.len;
        ws += h.len;
      }
      sw += h.len;
    }
    const alAvg = wa > 0 ? al / wa : null;
    const sAvg = ws > 0 ? s / ws : null;
    if (r.lith1 === 'CMSQ') {
      if (isNum(alAvg) && alAvg >= cmsqAlMax)
        out.push(I('warn', 'L01', 'lith', holeId, r.id, 'lith1', `CMSQ ${fmt(r.from)}–${fmt(r.to)} m: Al ${round(alAvg, 2)} % ≥ ${cmsqAlMax} % → host code + ASIL (MU v4 QA rule)`, `CMSQ ${fmt(r.from)}–${fmt(r.to)} м: Al ${round(alAvg, 2)} % ≥ ${cmsqAlMax} % → хост код + ASIL (MU v4 дүрэм)`));
      if (isNum(sAvg) && sAvg >= cmsqSMax)
        out.push(I('warn', 'L01', 'lith', holeId, r.id, 'lith1', `CMSQ ${fmt(r.from)}–${fmt(r.to)} m: S ${round(sAvg, 2)} % ≥ ${cmsqSMax} % → VMS / MSUL`, `CMSQ ${fmt(r.from)}–${fmt(r.to)} м: S ${round(sAvg, 2)} % ≥ ${cmsqSMax} % → VMS / MSUL`));
    } else if (isNum(sAvg) && sAvg >= sulphideSMin && !sulphideCodes.has(r.lith1) && r.lith1 !== 'CL') {
      out.push(I('info', 'L03', 'lith', holeId, r.id, 'lith1', `${r.lith1} ${fmt(r.from)}–${fmt(r.to)} m: S ${round(sAvg, 2)} % — check for VMS/MSUL`, `${r.lith1} ${fmt(r.from)}–${fmt(r.to)} м: S ${round(sAvg, 2)} % — VMS/MSUL эсэхийг шалга`));
    }
  }
}

function lithRules(holeId, lith, out) {
  for (const r of lith) {
    let tot = 0;
    let any = false;
    for (const [k] of SULPHIDES) if (isNum(r[k])) {
      tot += r[k];
      any = true;
    }
    if (tot > 100) out.push(I('error', 'I09', 'lith', holeId, r.id, 'py', `Total sulphide ${round(tot, 1)} %`, `Нийт сульфид ${round(tot, 1)} %`));
    if (any && r.lith1 === 'MSUL' && tot <= 50) out.push(I('warn', 'L02', 'lith', holeId, r.id, 'lith1', `MSUL needs >50 % sulphide; logged ${round(tot, 1)} %`, `MSUL >50 % сульфид шаардана; логдсон ${round(tot, 1)} %`));
    if (any && r.lith1 === 'VMS' && (tot < 10 || tot > 50)) out.push(I('warn', 'L02', 'lith', holeId, r.id, 'lith1', `VMS is 10–50 % sulphide; logged ${round(tot, 1)} %`, `VMS нь 10–50 % сульфид; логдсон ${round(tot, 1)} %`));
    for (const n of [1, 2, 3]) {
      const a = r['alt' + n];
      const it = r['int' + n];
      if (a && !it) out.push(I('info', 'L04', 'lith', holeId, r.id, 'int' + n, `Alt${n} ${a} without intensity`, `Alt${n} ${a} эрчимгүй`));
      if (!a && it) out.push(I('warn', 'L04', 'lith', holeId, r.id, 'alt' + n, `Int${n} without Alt${n} code`, `Alt${n} кодгүй эрчим`));
    }
  }
}

/** Issues for one hole (all tables). */
export function validateHole(holeId) {
  return memo(`val|${holeId}`, () => {
    const out = [];
    const st = settings();
    const c = hole(holeId);
    if (c) {
      if (!isNum(c.east) || !isNum(c.north)) out.push(I('error', 'C01', 'collar', holeId, c.id, 'east', 'Easting/Northing missing', 'X/Y координат дутуу'));
      else if (c.east < 100000 || c.east > 900000 || c.north < 0 || c.north > 10000000) out.push(I('warn', 'C05', 'collar', holeId, c.id, 'east', `E ${c.east}, N ${c.north} do not look like UTM metres`, `E ${c.east}, N ${c.north} UTM метр биш бололтой`));
      if (!isNum(c.rl)) out.push(I('warn', 'C01', 'collar', holeId, c.id, 'rl', 'RL missing', 'Z (RL) дутуу'));
      if (!isNum(c.eoh) && c.status !== 'PLN') out.push(I('warn', 'C02', 'collar', holeId, c.id, 'eoh', 'EOH depth missing', 'Эцсийн гүн дутуу'));
      if ((isNum(c.azimuth) && (c.azimuth < 0 || c.azimuth >= 360.0001)) || (isNum(c.dip) && (c.dip < -90 || c.dip > 90)))
        out.push(I('error', 'C03', 'collar', holeId, c.id, 'dip', `Azimuth ${c.azimuth}, dip ${c.dip}`, `Азимут ${c.azimuth}, налуу ${c.dip}`));
      if (isNum(c.lon) && isNum(c.lat)) {
        const swapped = Math.abs(c.lat) > 90 || (c.lat >= 87 && c.lat <= 120 && c.lon >= 41 && c.lon <= 52);
        if (swapped) out.push(I('warn', 'C04', 'collar', holeId, c.id, 'lat', `Lon ${c.lon}, Lat ${c.lat} — looks swapped`, `Уртраг ${c.lon}, өргөрөг ${c.lat} — солигдсон бололтой`));
      }
      if (c.status === 'CMP' && !rows('lith', holeId).length) out.push(I('info', 'C06', 'collar', holeId, c.id, 'status', 'Status is Completed but no lithology is logged', 'Төлөв «Дууссан» боловч литологи логдоогүй'));
      codeChecks('collar', c, out);
      textChecks('collar', c, out, st);
    }
    // survey
    const sv = rows('survey', holeId);
    const negDown = st.dipNegativeDown !== false;
    const seen = new Map();
    for (const s of sv) {
      if (isNum(s.depth)) {
        const k = round(s.depth, 3);
        if (seen.has(k) && !s.exclude && !seen.get(k).exclude) out.push(I('error', 'S02', 'survey', holeId, s.id, 'depth', `Two stations at ${fmt(s.depth)} m (Leapfrog/Micromine reject this)`, `${fmt(s.depth)} м-т хоёр хэмжилт (Leapfrog/Micromine хүлээж авахгүй)`));
        seen.set(k, s);
        if (c && isNum(c.eoh) && s.depth > c.eoh + 0.01) out.push(I('warn', 'S01', 'survey', holeId, s.id, 'depth', `${fmt(s.depth)} m > EOH ${fmt(c.eoh)} m`, `${fmt(s.depth)} м > EOH ${fmt(c.eoh)} м`));
      }
      if (isNum(s.dip) && ((negDown && s.dip > 0) || (!negDown && s.dip < 0))) out.push(I('warn', 'S05', 'survey', holeId, s.id, 'dip', `Dip ${s.dip} has the wrong sign for this project`, `Налуу ${s.dip} тэмдэг буруу`));
      if (isNum(s.azimuth) && (s.azimuth < 0 || s.azimuth > 360)) out.push(I('error', 'C03', 'survey', holeId, s.id, 'azimuth', `Azimuth ${s.azimuth}`, `Азимут ${s.azimuth}`));
      codeChecks('survey', s, out);
    }
    for (const d of doglegs(sv.filter((s) => !s.exclude), negDown)) {
      if (d.per30 > 6 && d.to.depth - d.from.depth <= 60)
        out.push(I('warn', 'S03', 'survey', holeId, d.to.id, 'azimuth', `${round(d.per30, 1)}°/30 m between ${fmt(d.from.depth)} and ${fmt(d.to.depth)} m — check for a bad reading`, `${fmt(d.from.depth)}–${fmt(d.to.depth)} м хооронд ${round(d.per30, 1)}°/30 м — буруу хэмжилт эсэхийг шалга`));
    }
    if (c && !sv.length && isNum(c.eoh) && c.eoh > 30) out.push(I('info', 'S04', 'survey', holeId, null, null, 'No downhole survey — trace assumed straight from collar azimuth/dip', 'Гүний хэмжилтгүй — амны азимут/налуугаар шулуун гэж тооцсон'));

    // lithology
    const lith = rows('lith', holeId);
    intervalChecks('lith', lith, c, out, { gapSev: 'warn' });
    for (const r of lith) {
      requiredChecks('lith', r, out);
      codeChecks('lith', r, out);
      textChecks('lith', r, out, st);
    }
    lithRules(holeId, lith, out);

    // geotech
    const gt = rows('geotech', holeId);
    intervalChecks('geotech', gt, c, out, { gapSev: 'info' });
    for (const r of gt) {
      const L = isNum(r.from) && isNum(r.to) ? r.to - r.from : null;
      if (isNum(L) && isNum(r.recovered) && r.recovered > L * 1.02 + 0.01) out.push(I('error', 'G01', 'geotech', holeId, r.id, 'recovered', `Recovered ${fmt(r.recovered)} m > run ${fmt(L)} m`, `Авсан ${fmt(r.recovered)} м > рейс ${fmt(L)} м`));
      if (isNum(r.rqd) && isNum(r.recovered) && r.rqd > r.recovered + 0.01) out.push(I('error', 'G02', 'geotech', holeId, r.id, 'rqd', `RQD ${fmt(r.rqd)} m > recovered ${fmt(r.recovered)} m`, `RQD ${fmt(r.rqd)} м > авсан ${fmt(r.recovered)} м`));
      textChecks('geotech', r, out, st);
    }

    // samples
    const smp = rows('samples', holeId);
    intervalChecks('samples', smp.filter((s) => s.sampleType === 'PRIM' || !s.sampleType), c, out, { gapSev: null });
    let prim = 0;
    let crm = 0;
    let blk = 0;
    let dup = 0;
    for (const s of smp) {
      requiredChecks('samples', s, out);
      codeChecks('samples', s, out);
      const L = isNum(s.from) && isNum(s.to) ? s.to - s.from : null;
      const typ = s.sampleType || 'PRIM';
      if (typ === 'PRIM') {
        prim++;
        if (!isNum(s.from) || !isNum(s.to)) out.push(I('error', 'P04', 'samples', holeId, s.id, 'from', `${s.sampleId}: primary sample needs From/To`, `${s.sampleId}: үндсэн дээжид эхлэл/төгсгөл хэрэгтэй`));
        else if (L < st.minSampleLen - 1e-6 || L > st.maxSampleLen + 1e-6) out.push(I('warn', 'P02', 'samples', holeId, s.id, 'to', `${s.sampleId}: ${fmt(L)} m (limits ${st.minSampleLen}–${st.maxSampleLen} m)`, `${s.sampleId}: ${fmt(L)} м (хязгаар ${st.minSampleLen}–${st.maxSampleLen} м)`));
      } else if (typ === 'CRM') {
        crm++;
        if (!s.crm) out.push(I('error', 'P03', 'samples', holeId, s.id, 'crm', `${s.sampleId}: CRM without standard code`, `${s.sampleId}: стандартын кодгүй CRM`));
      } else if (typ === 'BLK') blk++;
      else if (typ.endsWith('DUP')) {
        dup++;
        if (!s.parentId) out.push(I('error', 'P03', 'samples', holeId, s.id, 'parentId', `${s.sampleId}: duplicate without parent sample`, `${s.sampleId}: эх дээжгүй давхар дээж`));
      }
      textChecks('samples', s, out, st);
    }
    if (prim >= 40) {
      const q = st.qc;
      const want = (n) => (n > 0 ? Math.floor(prim / n) : 0);
      const short = [];
      if (q.crmEvery && crm < want(q.crmEvery) * 0.8) short.push(`CRM ${crm}/${want(q.crmEvery)}`);
      if (q.blankEvery && blk < want(q.blankEvery) * 0.8) short.push(`blank ${blk}/${want(q.blankEvery)}`);
      if (q.dupEvery && dup < want(q.dupEvery) * 0.8) short.push(`dup ${dup}/${want(q.dupEvery)}`);
      if (short.length) out.push(I('info', 'P05', 'samples', holeId, null, 'sampleType', `${prim} primaries: ${short.join(', ')}`, `${prim} үндсэн дээж: ${short.join(', ')}`));
    }
    lithChemistry(holeId, lith, smp, st, out);

    // structure
    for (const r of rows('struct', holeId)) {
      if ((isNum(r.alpha) && (r.alpha < 0 || r.alpha > 90)) || (isNum(r.beta) && (r.beta < 0 || r.beta > 360)))
        out.push(I('error', 'T01', 'struct', holeId, r.id, 'alpha', `α ${r.alpha}, β ${r.beta}`, `α ${r.alpha}, β ${r.beta}`));
      if (c && isNum(c.eoh) && isNum(r.depth) && r.depth > c.eoh + 0.01) out.push(I('warn', 'T02', 'struct', holeId, r.id, 'depth', `${fmt(r.depth)} m > EOH`, `${fmt(r.depth)} м > EOH`));
      requiredChecks('struct', r, out);
      codeChecks('struct', r, out);
    }
    // pxrf / phys
    intervalChecks('pxrf', rows('pxrf', holeId).filter((r) => isNum(r.to)), c, out, { gapSev: null });
    for (const r of rows('phys', holeId)) {
      if (isNum(r.sg) && (r.sg < 1.5 || r.sg > 6)) out.push(I('warn', 'D01', 'phys', holeId, r.id, 'sg', `SG ${r.sg}`, `Нягт ${r.sg}`));
    }
    out.forEach((x, i) => (x.id = `${holeId}:${x.rule}:${x.rowId ?? ''}:${x.field ?? ''}:${i}`));
    return out;
  });
}

/** Project-wide issues. */
export function validateAll() {
  return memo('val|*', () => {
    const out = [];
    for (const c of holes()) out.push(...validateHole(c.holeId));
    // project-wide: duplicate sample ids
    const byId = new Map();
    for (const s of rows('samples')) {
      const k = String(s.sampleId ?? '').trim().toUpperCase();
      if (!k) continue;
      if (!byId.has(k)) byId.set(k, []);
      byId.get(k).push(s);
    }
    for (const [k, list] of byId) {
      if (list.length > 1) for (const s of list) out.push(I('error', 'P01', 'samples', s.holeId, s.id, 'sampleId', `${k} used ${list.length}× (${list.map((x) => x.holeId).join(', ')})`, `${k} ${list.length} удаа (${list.map((x) => x.holeId).join(', ')})`));
      for (const s of list) {
        if (s.parentId && !byId.has(String(s.parentId).trim().toUpperCase()))
          out.push(I('error', 'P03', 'samples', s.holeId, s.id, 'parentId', `${s.sampleId}: parent ${s.parentId} not found`, `${s.sampleId}: эх дээж ${s.parentId} олдсонгүй`));
      }
    }
    // collar duplicates
    const pos = new Map();
    for (const c of holes()) {
      if (!isNum(c.east) || !isNum(c.north)) continue;
      const k = `${round(c.east, 1)}|${round(c.north, 1)}`;
      if (pos.has(k)) out.push(I('info', 'C07', 'collar', c.holeId, c.id, 'east', `Same collar position as ${pos.get(k)} (re-drill?)`, `${pos.get(k)}-тэй ижил байрлал (дахин өрөмдсөн үү?)`));
      else pos.set(k, c.holeId);
    }
    // assays without samples
    let orphan = 0;
    for (const a of rows('assays')) {
      if (!byId.has(String(a.sampleId ?? '').trim().toUpperCase())) {
        orphan++;
        if (orphan <= 200) out.push(I('warn', 'A01', 'assays', a.holeId, a.id, 'sampleId', `${a.sampleId} (${a.certificate || a.labJob || '—'})`, `${a.sampleId} (${a.certificate || a.labJob || '—'})`));
      }
    }
    return out;
  });
}

export function summarize(issues) {
  const s = { error: 0, warn: 0, info: 0, byRule: new Map(), byHole: new Map() };
  for (const i of issues) {
    s[i.sev]++;
    s.byRule.set(i.rule, (s.byRule.get(i.rule) || 0) + 1);
    const h = s.byHole.get(i.holeId) || { error: 0, warn: 0, info: 0 };
    h[i.sev]++;
    s.byHole.set(i.holeId, h);
  }
  return s;
}

/** Issues indexed by `${table}|${rowId}` for grid cell highlighting. */
export function issueIndex(holeId) {
  return memo(`vidx|${holeId}`, () => {
    const m = new Map();
    const list = holeId ? validateHole(holeId).concat(validateAll().filter((i) => i.holeId === holeId && i.rule === 'P01')) : validateAll();
    for (const i of list) {
      if (!i.rowId) continue;
      const k = `${i.table}|${i.rowId}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(i);
    }
    return m;
  });
}

export const msg = (i) => (S.lang === 'mn' ? i.msg.mn : i.msg.en);
export const ruleName = (r) => (S.lang === 'mn' ? RULES[r]?.mn : RULES[r]?.en) || r;

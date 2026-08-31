# Oval Ni-Cu Project — Petrographic Report Extraction (Google Drive sources)

Extraction date: 2026-08-31. Data files in this folder:

- `samples.json` — 89 records: 63 per-sample petrographic descriptions + 26 sample-list
  (cross-reference) entries from the ABM "Suggested Petro for the Oval 2024" spreadsheet.
- `samples.csv` — same records flattened (minerals as `mineral:pct; mineral:pct`; UTF-8 BOM
  so Mongolian Cyrillic opens correctly in Excel).
- Raw downloads under `/home/user/Jargal/workspace/raw/` (decoded zip + both Crawford PDFs).

Record types: `petrographic_description` (a microscope description exists) vs
`sample_list_entry` (row from the sample-selection spreadsheet only — no description).

---

## 1. Петрограф008.docx (Drive id 1tw3IOr7TudHqMDZz22kbLw2BvtTgugtK, ~12 MB)

- **What it is:** Mongolian-language "Петрографи, минераграфийн бичиглэл" (petrographic +
  mineragraphic descriptions) with photomicrographs, one section per sample. Each sample is
  headed `ӨТШ-<hole>-<depth>` (ӨТШ = өнгөлсөн тунгалаг шлиф = polished thin section).
- **Lab/author:** Not stated anywhere in the text (no analyst name, no date). The ABM
  "Suggested Petro for the Oval 2024" list attributes these 12 samples to **"Khanlab"**
  (SEM-EDS ref "2"), so the report is almost certainly the Khanlab deliverable, 2024.
- **Samples: 12**, drillholes OVD003 (1), OVD005 (1), OVD007 (4), OVD008 (6).
  IDs: `OVD008-27.3`, `OVD008-39.5`, `OVD008-40.1`, `OVD008-60.3`, `OVD008-88.9`,
  `OVD008-90.5`, `OVD007-50.0`, `OVD007-55.9`, `OVD007-58.2`, `OVD007-87.8`,
  `OVD003-155.3`, `OVD005-13.4`.
- **ID scheme:** `OVD<hole no.>-<depth m>` (hole-depth, no assay tag). The Suggested-Petro
  sheet maps each to a 41xxx assay tag (41011–41032), recorded as `lab_tag` in samples.json.
- **Completeness check:** the 12 samples exactly match the 12 "Khanlab / 2" rows of the
  Suggested-Petro list, so the Drive text extraction captured the whole document.
- Rocks: altered gabbro porphyries / melanocratic gabbros, one metasomatic gabbrodiorite
  porphyry (40.1 m), one strongly mineralized quartz diorite porphyry (90.5 m), one
  peridotite (OVD005-13.4), one mineralized melanocratic gabbro/peridotite with 20-25 %
  pentlandite-pyrrhotite-chalcopyrite lenses (OVD007-50.0).

## 2. AM_ThinSectionMongolia_Report_2024.pdf (id 1mNAkW0F0qWUuq2vDpBnjOtZ5oEcfESYj, ~14 MB)

- **What it is:** "Чулуулгийн эрдэслэг бүрэлдэхүүний судалгааны ажлын үр дүнгийн тайлан" —
  microscope study report, 36 pages, Mongolian.
- **Lab:** ThinSection Mongolia LLC. **Client:** "Авентура Минералс" ХХК (Aventura Minerals
  LLC — ABM's Mongolian operating entity). **Analysts:** Dr. T.Oyunchimeg PhD,
  Dr. B.Enkhjargal PhD, Dr. B.Dolzodmaa PhD.
- **Dates:** samples received 2024-05-06, results 2024-05-09.
- **Samples: 8 described** (cover page says "Дээжийн тоо: 8"), polished thin sections:
  `TS-2…TS-7` (written interchangeably as `ТЦ-2…ТЦ-7`) + `Дээж-2`, `Дээж-3`.
- **ID scheme:** `TS-n` / `ТЦ-n` ("толилуулах цэг"?-style sequential numbers) and `Дээж-n`
  ("Sample-n"). **No drillhole/depth/coordinates given** — provenance unknown (presumably
  surface/outcrop samples; rock types are andesite, amphibolite, basalt, felsic subvolcanite,
  rhyolite porphyry, phyllite — country rocks, not the Oval gabbro suite).
- **Quirks:** TOC lists a `ТЦ-1` with no rock name and no description (9 TOC rows for 8
  described samples); TOC row 9 repeats "Дээж-2" where the body describes Дээж-3; the TS-5
  figure captions are mislabelled "ТЦ-7 5"; appendix photo captions mislabel TS-4 as "TS-4"
  vs body "ТЦ-4" and TS-6 as "TS-3".

## 3. 2023-08-06-2 шлиф.pdf (id 1UONp87cloKEolNq0fNTAcR_WPXKZMaJE)

- **What it is:** "Петрографийн бүрэн бичиглэл (2 шлиф)" — full petrographic descriptions of
  2 thin sections, Mongolian.
- **Analyst:** Л.Жаргал PhD (L.Jargal). **Date:** 2023-08-06. Order ref: Зах-2023/01.
- **Samples: 2** — `С-1` (strongly mineralized quartz-sericite schist, 10-15 % opaque),
  `С-2` (mineralized sericite-quartz schist, 5-10 % opaque). Both with Fe-hydroxide-replaced
  opaques — gossan-weathering style; likely surface/schist (host-rock) samples.
- **ID scheme:** `С-n` sequential; no hole/depth given.

## 4. 2023-06-20-3 thin sections.pdf (id 1kkEQHYDCdr7ckB7d7xv7zssmCIkEGpU-)

- **What it is:** "Петрографийн бүрэн бичиглэл" of 3 thin sections, Mongolian.
- **Analyst:** Л.Жаргал PhD. **Dates:** cover 2023-06-21, end of text 2023-06-20.
  **Client:** "Рагнарок инвестмент" ХХК (Ragnarok Investment LLC). Order ref: Зах-2023/01.
- **Samples: 3** — шлиф №`40763`, `40900`, `40913` (5-digit **assay-tag** numbers).
- **ID scheme:** bare assay sample tags. The ABM Suggested-Petro list resolves them:
  40900 = OVD-001 @ 56.8 m (non-mineralized gabbro), 40913 = OVD-001 @ 68 m (semi-massive;
  described with 35-40 % opaque), 40763 = OVD-008 @ 84.5 m (disseminated). These holes are
  from the 2023 nine-hole scout program, consistent with the June-2023 date.

## 5. FW_ Petrology - Oval Nickel Project.zip (id 1n_jRl5VBRsIzcX8KFezy7IznoPbUGIL-, ~2 MB)

Forwarded-email attachment bundle; unzipped to `workspace/raw/FW_Petrology/`. Contents:

1. **`Suggested Petro for the Oval 2024.xlsx`** — "Петрографийн дээжнүүд": 26 selected
   samples (tag, depth, hole id, mineralization, rock type, SEM-EDS ref, lab). This is the
   master cross-reference between assay tags (40xxx/41xxx) and hole@depth IDs, and it names
   three destinations: **Oyunjargal** (40900, 40913, 40763 → the L.Jargal 2023 reports /
   "pdf1"), **Mireslab** (40910, 40628, 40635, 40645 → a "pdf2" report NOT among the Drive
   files reviewed), **Khanlab** (19 samples: refs "1" = 7 OVD-009 samples and "2" = the 12
   samples of Петрограф008.docx; a Khanlab "Петрограф009"-type report for ref "1" is NOT in
   this file set). Two extra un-tagged suggestions at the bottom (OVD009 178-180 m "Highest
   MgO with low sulfide", OVD003 202 m "Low MgO gabbro") were later realized in Crawford's
   38-sample set. All 26 rows are captured in samples.json as `sample_list_entry` records.
2. **`Copy of All_Assay (21Aug2023) AJC edit.xlsx`** — multi-element assay table, 667 data
   rows (`Hole_ID` OVD-001…, `Sample Number` = tag, From/To, Rock Type + oxides/metals);
   Sheet1 holds an OVD009 Ni-Cu-Au-Pd-Pt interval list. Context only, not petrography.
3. **`Review of Work on 'The Oval' Ni-CU Target, Mongolia.pdf`** — the ORIGINAL (May 2024)
   14-page Crawford desktop review, superseded by file 6 below; no per-sample descriptions.

## 6. Review of Work on 'The Oval' Ni-CU Target, Mongolia Revised March 2025.pdf (id 1oLGiwQWcY8r_S9nhTHozPrDgJhzkjzss)

- **What it is:** Dr Tony Crawford (A & A Crawford Geological Research Consultants),
  PowerPoint-style review, 14 pages: "Review of Previous Work, Including New Petrographic
  Descriptions of 38 Rocks…". No per-sample descriptions here (they are in file 7).
- **What it says about petrography/sample datasets:**
  - Information provided for the May 2024 review included **previous petrology/mineralogy
    reports** (the 2023-24 Mongolian reports above), core photos, and **multi-element assay
    data for 509 samples from 9 drillholes** (359 'gabbros', 17 'gossans', 70 hornfelsic
    'spotted contact rocks', 58 'schists and black schists', 5 'fault rocks').
  - Prior prospect reviews referenced: Gtech; Dennis (RPM Global, Oct 2023); Chuluunbataar
    (Vi Vitex LLC, May 2022); Prof D. Holwell (Oct 2023).
  - "Available petrography is useful, but lacks a coherent summary or any integration with
    lithogeochemistry. More detailed petrography recommended … now implemented with **38 new
    petrographic samples** selected by project geologists from diamond drilling across the
    Oval" (matching lithogeochemical assays).
  - 2023 nine-hole scout program (OVD001-009) demonstrated mineralized, mineralogically
    layered gabbroic rocks; ~40 m of 20-25 % MgO rocks at the base of OVD005.

## 7. Asian Battery Metals March 2025 The Oval Summary Report.pdf (id 1HQZSTrXY79Q10i0cLzdl1Ug5Zp9POr9z)

- **What it is:** "PETROGRAPHIC REPORT — 38 Rocks from Diamond Drilling on The Oval Ni-Cu
  Prospect, Yambat Project, Mongolia", **Dr Anthony J Crawford**, dated **29/3/2025**
  (Attn. Enkhbayasgalan Dugerjav, Batkhurel Battulga, Gan-Ochir Zunduisuren). 16 pages:
  6-page synthesis + Table 1 with full per-sample summary descriptions. English.
- **Samples: 38** polished thin sections, ID scheme `HOLE@depth m`:
  SC04 (3: 168.3, 171.0, 280.7), OVD002 (1: 37), OVD003 (2: 155.3, 202),
  OVD005 (4: 13.4, 40.5, 53.0, 71.0), OVD007 (4: 50.0, 55.9, 58.2, 87.8),
  OVD008 (6: 27.3, 39.5, 40.1, 60.3, 88.9, 90.5),
  OVD009 (9: 126.7, 143, 149.5, 149.8, 151.6, 161, 171.5, 178-180, 195.2),
  OVD021 (9: 42.3, 76.6, 94.4, 101.5, 107.0, 116.1, 146.9, 148.8, 165.2).
- Key synthesis: crystallization sequence olivine(+chromite) → augite → hornblende →
  phlogopite → FeTi oxides → apatite; rock spectrum from olivine-hornblende orthocumulates
  and "hornblendites" through poikilitic olivine gabbros to vari-textured hornblende
  gabbros; all sulfides are magmatic three-phase po-cpy-pn; OVD007@87.8m and SC04@280.7m
  are near-chilled-margin "parent magma" candidates.

---

## ID schemes across sources

| Scheme | Example | Used by |
|---|---|---|
| `OVD<hole>-<depth>` / `OVD<hole>@<depth>m` | OVD008-27.3 / OVD008@27.3m | Петрограф008.docx; Crawford 2025 |
| Assay tag (5-digit) | 40763, 41028 | L.Jargal Ragnarok report; Suggested-Petro list; assay xlsx |
| `TS-n` / `ТЦ-n`, `Дээж-n` | TS-2, Дээж-3 | ThinSection Mongolia 2024 |
| `С-n` | С-1 | L.Jargal 2023-08-06 report |

Drillhole IDs appear both as `OVD-001` (assay/selection sheets) and `OVD001/OVD008`
(petrography reports) — same holes. Holes represented in petrography overall: OVD001, 002,
003, 005, 007, 008, 009, 021, plus SC04 (scout/step-out core).

## Overlaps between sources

- **12 samples are described twice** (Mongolian Khanlab description in Петрограф008.docx and
  English Crawford 2025 description): OVD003-155.3, OVD005-13.4, OVD007-50.0/55.9/58.2/87.8,
  OVD008-27.3/39.5/40.1/60.3/88.9/90.5. Rock-name calls differ systematically (e.g. docx
  "хувирсан габбро порфир" vs Crawford "poikilitic hornblende-bearing olivine gabbro";
  docx "перидотит" OVD005-13.4 vs Crawford "olivine hornblendite").
- **The 26-row Suggested-Petro list** overlaps: 12 rows = docx samples, 7 rows = Crawford
  OVD009 samples (also flagged for a Khanlab report "1" not in this file set), 3 rows =
  L.Jargal/Oyunjargal 2023 thin sections (40900, 40913, 40763), 4 rows = Mireslab "pdf2"
  samples of which 3 (OVD005 @ 40.5, 53, 71 = tags 40628/40635/40645) and OVD002@37 (40910)
  were also re-described by Crawford.
- 40763 (OVD-008 @ 84.5 m) is described **only** in the 2023 Ragnarok report — Crawford's
  set does not include 84.5 m.
- The Review PDF in the zip is the earlier (May 2024) version of Drive file 6.
- No overlap of the ThinSection Mongolia (TS/Дээж) and L.Jargal С-1/С-2 samples with any
  hole@depth-identified set (no provenance given for them).

## Data-quality notes

1. **Sample/assay mismatches flagged by Crawford:** OVD008@88.9m lacks sulfides despite
   2.5 %S assay; OVD008@90.5m thin section (hornblende-phyric basalt, <2 % sulfide) does not
   match the ~30 %-pyrrhotite assay; OVD009@178-180m "wholerock assay does not match this
   thin section" (suspected swap with a leucogabbro dyke like OVD021@101.5m); OVD021@101.5m
   high-Cr assay has no chromite in section; OVD007@55.9m core photo may not match section.
2. **Section quality:** Crawford notes sub-standard polish on many of the 38 sections;
   OVD005@40.5m and @53.0m are "far too thin" for confident diagnosis (identified mainly
   from wholerock chemistry); OVD021@148.8m sulfides too poorly polished to describe;
   carbon coating (from prior EPMA) obscured sulfides on OVD005@40.5m.
3. **Missing metadata:** Петрограф008.docx has no analyst/date; ThinSection Mongolia and
   L.Jargal С-1/С-2 samples have no location/hole/depth; ТЦ-1 listed but never described.
4. **Typos in sources** (preserved, noted in records): docx "Хувирсан хувирсан…" (OVD008-39.5
   heading), OVD008-39.5 microphoto caption mentions chromite/hematite not in its mineral
   table; Crawford p.6 "OVD003@OVD008@40.1m" (should be OVD003@202m, OVD008@40.1m and
   OVD009@126.7m) and "OVD002@202m" (should be OVD003@202m).
5. **Depths:** docx/Crawford depths are point depths (m); OVD009@178-180m is an interval
   (depth_from/to). Suggested-Petro depths are simplified (e.g. "37m" vs assay interval
   37.2-39.2 m for tag 40420-series sampling); treat as approximate to ±1 m.
6. **Percentages:** Mongolian reports give modal % ranges and qualitative "цөөн" (few) /
   "ганц нэг" (single grains) / "ховор" (rare) — kept verbatim in `minerals[].pct`.
   Crawford gives approximate visual estimates (~, %) — kept verbatim.

## How many petrographic samples exist overall (per the review documents)

- 2023: at least 5 commissioned thin sections tied to the scout drilling era (3 Ragnarok/
  L.Jargal core samples + 2 С-series schist samples), plus the "previous petrology/
  mineralogy reports" (Gtech / Vi Vitex 2022) mentioned but not present in this Drive set.
- 2024: 26 samples selected ("Suggested Petro for the Oval 2024") split between Oyunjargal,
  Mireslab and Khanlab; the Khanlab "2" batch (12) = Петрограф008.docx; the Khanlab "1"
  batch (7, OVD-009) and Mireslab "pdf2" batch (4) reports are referenced but NOT among the
  Drive files reviewed here; ThinSection Mongolia described 8 further (country-rock) samples
  in May 2024.
- 2025: Crawford re-described/described 38 polished thin sections (incl. OVD021 and SC04,
  i.e. post-2023 drilling), the only English dataset integrated with lithogeochemistry.

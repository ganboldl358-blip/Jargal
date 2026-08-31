# QA report — Oval Petrography Database v1.1

Built by `scripts/build_database.py` (v1.1) on 2026-08-31 from `workspace/extracted/`. CRS: WGS84 / UTM zone 46N (EPSG:32646).

v1.1 applies every defect raised by the two independent audits (`VERIFICATION_integrity.md` D1–D10, `VERIFICATION_coverage.md` G1–G14) and merges the `missing_sources` extraction batch. See §12 for the changelog and §11 for what is still missing at source.

## 0. Build assertions (the build fails if any of these break)

- [PASS] row counts consistent CSV = SQLite = XLSX = dataframe
- [PASS] samples.sample_id unique and non-blank
- [PASS] every descriptions.sample_id is in samples (or blank)
- [PASS] depth_from_m <= depth_to_m everywhere (D1)
- [PASS] depth_from_m <= depth_to_m in sample_assays
- [PASS] D1: sample 47176 re-desurveyed to the corrected 114-116 m interval
- [PASS] G10: the bichiglel `OVD015-175.5 (B)` row joins to 42389
- [PASS] G10: the bichiglel `OVD015-175.5 (A)` row joins to 42388
- [PASS] G1: new Crawford sample OVD003@202 exists, is desurveyed and carries its description
- [PASS] G1: new Crawford sample OVD009@178 exists, is desurveyed and carries its description
- [PASS] G2: `OVD021@101.5m` re-joined to 42027
- [PASS] G2: `OVD20-121` re-joined to 43251
- [PASS] D3: lu_rock_type covers every distinct rock name in samples+descriptions
- [PASS] D6: descriptions.sample_id is NULL (not '') in SQLite for unjoined rows
- [PASS] D6: SQLite primary keys present
- [PASS] D6: SQLite indexes present
- [PASS] D6: SQLite foreign keys resolve
- [PASS] every drill-core sample whose hole is in collar is desurveyed

## 1. Row counts (dataframe = csv = sqlite = xlsx)

| table | rows | csv | sqlite | xlsx | ok |
|---|---|---|---|---|---|
| samples | 395 | 395 | 395 | 395 | OK |
| descriptions | 572 | 572 | 572 | 572 | OK |
| collar | 76 | 76 | 76 | 76 | OK |
| survey | 1990 | 1990 | 1990 | 1990 | OK |
| sample_assays | 277 | 277 | 277 | 277 | OK |
| lu_hole_alias | 101 | 101 | 101 | 101 | OK |
| lu_lab | 31 | 31 | 31 | 31 | OK |
| lu_rock_type | 704 | 704 | 704 | 704 | OK |
| sources | 48 | 48 | 48 | 48 | OK |

xlsx sheets: samples, descriptions, collar, survey, sample_assays, lu_hole_alias, lu_lab, lu_rock_type, sources

SQLite carries real `NULL`s (never `''`), a primary key on `samples.sample_id`, `descriptions.desc_id`, `collar.hole_id` and `sample_assays.sample_id`, foreign keys `descriptions.sample_id`/`sample_assays.sample_id` → `samples.sample_id` and `survey.hole_id` → `collar.hole_id`, and the indexes `idx_descriptions_sample_id`, `idx_descriptions_source`, `idx_samples_hole_depth`, `idx_samples_coord_source`, `idx_survey_hole_depth`, `idx_assays_hole_depth`, `idx_alias_norm`. `PRAGMA foreign_key_check` is clean. No FK is declared on `samples.hole_id_norm` because the 17 legacy ARDH-2005-01 rows reference a hole that is not in `collar` (see §11).

## 2. Coordinate coverage

- samples total: **395**
- with coordinates: **343** (86.8 %)
  - desurveyed 3D (x,y,z): 285
  - master/grab X,Y only (z null): 58
- without coordinates: 52 (rockchips w/o coords, unlocated lab-number/TS/C samples)
- drill-core samples whose hole is in collar but NOT desurveyed: **0**
- samples referencing a hole that is NOT in `collar`: **17** (holes: ARDH-2005-01) — the legacy 2005 photo-only stubs; no collar, no survey, no coordinates

## 3. Description join statistics

- descriptions total: **572**; matched: **569** (99.5 %), unmatched: 3
- join methods: tag: 314, label: 133, grab sheet row: 54, grab sheet id: 24, tag (MIRESL code): 23, hole+depth: 17, unmatched: 3, xref-corrected: 2, hole+depth+suffix: 2
- v1.1 additions: **54** grab-sheet field descriptions (G9) and **67** rows from the `missing_sources` batch (tag: 40, grab sheet id: 24, unmatched: 3). The batch's other 17 records are photo-only and became sample rows, not descriptions.

| source | descriptions | matched |
|---|---|---|
| 15ш пет-мин бичиглэл. 09.02. (2 петрографи, 13 пет-мин бичиглэл) (1).d | 15 | 15 |
| 2023-06-20-3 thin sections.pdf | 3 | 3 |
| 2023-08-06-2 шлиф.pdf | 2 | 2 |
| 22 р цооног зассан 14ш.docx (hole OVD22, 14 samples) | 14 | 14 |
| 23 р цооног дууссан 9ш.docx (hole OVD23, 9 samples) | 9 | 9 |
| 24 р цооног зассан 13ш.docx (hole OVD24, 13 samples) | 13 | 13 |
| 25 цооног 10ш.docx (hole OVD25, 10 samples) | 10 | 10 |
| 26 р цооног 16 ш зассан.docx (hole OVD26, 16 samples) | 16 | 16 |
| 27 р цооног 12ш.docx (hole OVD27, 12 samples) | 12 | 12 |
| 28 ба 29 р цооног 9ш.docx (holes OVD28 + OVD29, 9 samples) | 9 | 9 |
| 5 петрографи баттерей (2).docx | 5 | 5 |
| AM_ThinSectionMongolia_Report_2024.pdf | 8 | 8 |
| Asian Battery Metals March 2025 The Oval Summary Report.pdf | 38 | 38 |
| BE-3 samples in English.pdf (Results of Ore Petrology - Ragnarock Inve | 3 | 3 |
| BayanSair_Drilling Sample Petrography_12 Sample.docx | 12 | 12 |
| Drillhole Petrograph_2023__Sheet1.csv | 50 | 50 |
| English 41 Petrographic and Mineragraphic description.docx | 41 | 41 |
| English Petrographic and Mineragraphic Descriptions. 6.docx | 6 | 6 |
| English Petrographic and Mineragraphic description. 15.docx (Innova Mi | 15 | 15 |
| MINERALOGICAL-DESCRIPTIONS_2023.03.25.pdf | 1 | 0 |
| MS3_Outcrop Sample_Петрографи-минераграфи 4ш.docx | 4 | 4 |
| Petrograph_MIRESL20230816_summary.xlsx | 23 | 23 |
| Petrographic descriptions 06.23.pdf | 2 | 2 |
| Petrographic descriptions 11.04.pdf | 6 | 6 |
| Petrography_mineragraphy_24 sample.pdf (consolidated 24-sample Khanlab | 12 | 12 |
| Report20231124.docx | 2 | 2 |
| Report_0715_Ni.pdf | 2 | 0 |
| Report_20230816_Part1.pdf + Report_20230816_Part2.pdf | 23 | 23 |
| Report_ABM 2025.09.09 final.pdf (MUST lab, 22 samples, SEM-EDX) | 22 | 22 |
| Report_microscope_20221012.pdf | 8 | 8 |
| Thin and polish-1.docx | 1 | 1 |
| Thin and polish-1sh.docx | 1 | 1 |
| Thin and polish-2sh.docx | 2 | 2 |
| Thin and polish-4.docx | 4 | 4 |
| Yambat Petrographic Master Data.xlsx :: 2022-2024 grab sheet (field de | 54 | 54 |
| Yambat_petrography_samples_2022-2024_from_Core___grab__Petrography_bic | 104 | 104 |
| Yambat_petrography_samples_2022-2024_from_Core___grab__Samples_to_Japa | 8 | 8 |
| Петрограф008.docx | 12 | 12 |

### Unmatched descriptions

- `2111` (Report_0715_Ni.pdf) — UNMATCHED (v1.1): no field/sample number anywhere in Report_0715_Ni.pdf and no row in the 2022-2024 grab sheet or Master All — cannot be joined until a field number is supplied (missing_sources README §4.7)
- `2107` (Report_0715_Ni.pdf) — UNMATCHED (v1.1): AMBIGUOUS ID: `2107` in Report_0715_Ni.pdf is a Ni-ore sample (XRD + ore microscopy + SEM-EDS), while grab row 21 `2107` is an amphibolite thin section (Thin and polish-4.docx). The grab-sheet coordinates put row 21 in the same outcrop cluster, so they are probably the same physical sample described by different methods — but no document states it, so this record is left UNJOINED rather than force-merged (missing_sources README §4.6)
- `2023Nisample` (MINERALOGICAL-DESCRIPTIONS_2023.03.25.pdf) — UNMATCHED (v1.1): descriptive placeholder, not a field number: MINERALOGICAL-DESCRIPTIONS_2023.03.25.pdf gives no sample id for the garnierite / Ni-goethite sample (missing_sources README §4.7)

## 4. Duplicate handling

- dropped: no-id row SC04 'SC04-168.3' dropped (duplicates tagged SC04 rows)
- dropped: no-id row SC04 'SC04-171, SC04-280.7' dropped (duplicates tagged SC04 rows)
- dropped: 45652 (BS001 380) exact duplicate row dropped
- split: tag 42808 used twice; second occurrence (SC04 @ 280.7) stored as SC04@280.7
- merged: 32 rockchip-sheet rows merged into existing grab-sheet samples (same Sample_numbers; grab sheet supplies their X/Y)
- Master All formatting rows skipped (no id, no interval): 14

## 5. Depth handling — parsing AND range validation

**Depth-parse failures** (a depth string that could not be read at all):
- none

**Depth-RANGE validation** (v1.1 — v1.0 had none, which is how D1 survived; a parse success is not a range success):
- 47176: D1 CORRECTED: master sheets record this sample interval as From 144 / To 114.1 (inverted — a source typo for the depth 114 m); the assay block on the same Yambat_petrography_samples_2022-2024_from_Core___grab__2024_Phase_2_Drilling.csv row reads from 114 m / to 116 m and the 2024-2026 report extract states 'sample sits at 114-116 m, listed after deeper samples in the source doc'. Interval set to 114-116 m and re-desurveyed; the '144' of Yambat_Petrographic_Master_Data__All.csv / the bichiglel table is a master-sheet typo (144 for 114)

The build now asserts `depth_from_m <= depth_to_m` over every `samples` and `sample_assays` row and aborts if a violation cannot be corrected from a corroborating source.

## 6. Samples added beyond the Master All spine (116)

- Yambat_Petrographic_Master_Data__2022-2024_grab.csv: 65
- CORE PHOTO/ARDH-2005-01/4. Thin section photo folder — 17 photo_only stubs: 17
- 15ш пет-мин бичиглэл. 09.02. (2 петрографи, 13 пет-мин бичиглэл) (1).docx: 15
- AM_ThinSectionMongolia_Report_2024.pdf: 8
- MS3_Outcrop Sample_Петрографи-минераграфи 4ш.docx: 4
- 2023-08-06-2 шлиф.pdf: 2
- Asian Battery Metals March 2025 The Oval Summary Report.pdf: 2
- Petrograph_2023__Sheet1.csv; Yambat_petrography_samples_2022-2024_from_Core___grab__Petrog: 1
- Yambat_petrography_samples_2022-2024_from_Core___grab__Petrography_bichiglel_table.csv; Sa: 1
- Yambat_petrography_samples_2022-2024_from_Core___grab__Sheet3.csv: 1

## 7. Hole-ID aliases applied (raw -> normalized)

25 raw spellings normalized (full list in `csv/lu_hole_alias.csv`):
- `CRSO1A` -> `CRS01A`
- `OVD-001` -> `OVD001`
- `OVD-002` -> `OVD002`
- `OVD-003` -> `OVD003`
- `OVD-004` -> `OVD004`
- `OVD-005` -> `OVD005`
- `OVD-007` -> `OVD007`
- `OVD-008` -> `OVD008`
- `OVD-009` -> `OVD009`
- `OVD-11` -> `OVD011`
- `OVD-21` -> `OVD021`
- `OVD008a` -> `OVD008A`
- `OVD11` -> `OVD011`
- `OVD14` -> `OVD014`
- `OVD15` -> `OVD015`
- `OVD20` -> `OVD020`
- `OVD21` -> `OVD021`
- `OVD22` -> `OVD022`
- `OVD23` -> `OVD023`
- `OVD24` -> `OVD024`
- `OVD25` -> `OVD025`
- `OVD26` -> `OVD026`
- `OVD27` -> `OVD027`
- `OVD28` -> `OVD028`
- `OVD29` -> `OVD029`

## 8. Spot checks

- 41011: hole=OVD007 depth=50.0 x=721995.29 y=5144402.98 z=1792.49 coord=desurvey descriptions=4
- 47188: hole=OVD026 depth=105.0 x=722009.85 y=5144396.96 z=1755.55 coord=desurvey descriptions=1
- 43816: hole=OVD009 depth=126.6 x=722139.21 y=5144159.37 z=1723.64 coord=desurvey descriptions=1
- 47176: hole=OVD023 depth=115.0 x=722067.76 y=5144288.08 z=1738.42 coord=desurvey descriptions=1
- OVD003@202: hole=OVD003 depth=202.0 x=722112.94 y=5144191.32 z=1670.78 coord=desurvey descriptions=1
- OVD009@178: hole=OVD009 depth=179.0 x=722129.62 y=5144154.24 z=1672.39 coord=desurvey descriptions=1
- 42389: hole=OVD015 depth=175.5 x=722137.27 y=5144150.7 z=1697.48 coord=desurvey descriptions=2

## 9. Known issues carried from sources

- **Crawford 2025 sample/assay mix-up flags.** CORRECTED CLAIM (v1.0 §9 said these were in `descriptions.qa_notes` when they were only in the tail of `description_text`): as of v1.1 each caveat is written into BOTH `descriptions.qa_notes` AND the joined `samples.qa_flags`, and the original wording still stands verbatim inside `description_text`. Rows carrying a Crawford caveat: D0222 (OVD007@55.9m -> 41031), D0229 (OVD008@88.9m -> 41030), D0230 (OVD008@90.5m -> 41024), D0218 (OVD005@40.5m -> 40628), D0219 (OVD005@53.0m -> 40635), D0247 (OVD021@148.8m -> 43267), D0243 (OVD021@101.5m -> 42027), D0238 (OVD009@178-180m -> OVD009@178).
- Crawford notes sub-standard polish on many of the 38 sections; OVD005@40.5 and @53.0 'far too thin'; OVD021@148.8 sulfides too poorly polished. These three are also in `qa_notes`/`qa_flags` as of v1.1.
- `OVD021@101.5m` (Crawford) is OVD011-101.5 (tag **42027**) — as of v1.1 the description IS joined (`join_method = xref-corrected`), on the strength of the identical Crawford micro-description filed against OVD011-101.5 in the `KhanAltai vs Tony` sheet. v1.0 left it unmatched.
- Tag **42808** is printed on two SC04 samples (171.0 m and 280.7 m); the 280.7 m sample is stored as `SC04@280.7`.
- BS001 sample numbering: report prints 45652 on both 380.5 and 380.8 m (summary suggests 45653); Master All carries a single 45652 row (380-382 m), the exact duplicate row was dropped.
- `OVD015-175.4` (Sheet3) vs `OVD015-175.5 (A)/(B)` (Master All) — possible depth typo; kept as a separate sample with a QA flag.
- 14 lab numbers of the 2025 '15ш' report (40340-41363 series) have no drillhole/depth stated anywhere — samples exist with no location.
- TS-n / Дээж-n (ThinSection Mongolia 2024) and С-1/С-2 (L.Jargal 2023) samples have no location; ТЦ-1 is listed in that report's TOC but never described.
- The master workbook's 'rockchip' sheet Sample_numbers duplicate the numeric-tag / CR-xx rows of the grab sheet (same physical samples): they were merged, classed `rockchip`, with X/Y from the grab sheet. The master README's 'tags 43113-43154' description of that sheet is inaccurate.
- The MIRESL summary `Code` column (OVD001-OVD023) is a lab sample code, NOT a drillhole id.
- Depths of 2023-era registers are point depths written as text ('36m'); tag 40715 was written '98.2' without the unit.
- Master workbook's own Collar/Survey sheets are stale (68 holes); Collar_all_combined / Survey_all_YMB (76 holes) are the location authority.
- Survey azimuths are used as grid azimuths (Grid (Orig) = WGS84_46N; `Azim (UTM)` column is empty in the source).
- Collar data typo: MU2502 End date '10/14/225' (kept verbatim).
- **OVD008A depth datum**: OVD008A is a re-drill sharing the OVD008 collar. `collar.start_depth_m` is 110.5 m, but its 33 survey stations run 0 → 162.5 m MEASURED FROM SURFACE, not from the re-entry point. Any depth quoted against OVD008A must therefore be surface-referenced. No sample in the database is assigned to OVD008A.
- **Duplicate survey station** OVD009 @ 240.0 m (see §10 D4) — both readings are kept verbatim, flagged in the new `survey.qa_note` column.

## 10. v1.1 defect resolutions (audit D1–D10, G1–G14)

### Integrity audit (`VERIFICATION_integrity.md`)

**D1 — inverted depth interval on 47176 (HIGH).** Fixed. 47176: D1 CORRECTED: master sheets record this sample interval as From 144 / To 114.1 (inverted — a source typo for the depth 114 m); the assay block on the same Yambat_petrography_samples_2022-2024_from_Core___grab__2024_Phase_2_Drilling.csv row reads from 114 m / to 116 m and the 2024-2026 report extract states 'sample sits at 114-116 m, listed after deeper samples in the source doc'. Interval set to 114-116 m and re-desurveyed; the '144' of Yambat_Petrographic_Master_Data__All.csv / the bichiglel table is a master-sheet typo (144 for 114). The sample now sits at 114–116 m (mid 115 m) and desurveys to (722067.76, 5144288.08, 1738.42) — a 14.05 m correction from the v1.0 position (722071.89, 5144281.90, 1726.51). A global `depth_from <= depth_to` guard plus a build assertion now make this class of defect impossible to ship.

**D2 — Crawford caveats not queryable.** Fixed: 8 description rows now carry the caveat in `qa_notes`, and every joined sample carries it in `qa_flags`. §9 above is corrected.

**D3 — `lu_rock_type` incomplete.** Fixed: the lookup is now built from `samples.field_lithology` + `petro_lithology` + `iogas_lithology` **and** `descriptions.rock_name` **and** `descriptions.rock_name_original` — **704** distinct names (v1.0: 473), each with a `rock_group`, a new coarse `rock_family` column and a `seen_in` column, and `n_occurrences` recounted over all five fields. Names left `other / unclassified`: 2.

**D4 — duplicate survey station.** Both rows kept verbatim; the new `survey.qa_note` column names the conflict and the recommended row on BOTH rows of the pair:
- OVD009 @ 240 m: 2 readings — dip -78.91 / azi 244.64 (MS, Bayan Undraga LLC, 7/28/2024) vs dip -78.0 / azi 246.5 (Ez-trac, Multi shot, Ragnarok Investment LLC, 5/30/2023) | recommended: 7/28/2024 Bayan Undraga LLC

The desurvey now resolves duplicate `(hole, depth)` stations deterministically to the most recent survey date, so the database and the README import guide agree. No stored coordinate changes (the deepest OVD009 sample is 195.2 m).

**D5 — stored interval vs report-named interval.** 87 descriptions name an explicit interval; **12** disagree with the sample's stored interval and now carry a `qa_flags` entry on the sample and a `qa_notes` entry on the description:

| desc | report label | report interval | sample | stored | gap (m) |
|---|---|---|---|---|---|
| D0390 | `OVD028-38 (33.14-35)` | 33.14-35 | OVD028@38 | 38-38 | 3 |
| D0373 | `OVD27-54-56 (47194)` | 54-56 | 47194 | 52.1-52.3 | 1.9 |
| D0323 | `OVD22-146.5-148 (47166)` | 146.5-148 | 47166 | 145-146 | 1.5 |
| D0377 | `OVD27-80-82 (47198)` | 80-82 | 47198 | 78.9-79.1 | 1.1 |
| D0356 | `OVD025-58.85-60.85 (47152)` | 58.85-60.85 | 47152 | 61.4-61.5 | 0.65 |
| D0392 | `OVD029-122.4 (123-124.5)` | 123-124.5 | OVD029@122.4 | 122.4-122.4 | 0.6 |
| D0379 | `OVD27-98.15-99 (47200)` | 98.15-99 | 47200 | 98-98.2 | 0.15 |
| D0312 | `OVD22-37-39 (47155)` | 37-39 | 47155 | 36.9-37 | 0.1 |
| D0380 | `OVD27-99-100 (47091)` | 99-100 | 47091 | 98.9-99.1 | 0.1 |
| D0384 | `OVD27-135-137 (47095)` | 135-137 | 47095 | 134.9-135.1 | 0.1 |
| D0340 | `OVD24-54.07-56 (47136)` | 54.07-56 | 47136 | 54-54.1 | 0.07 |
| D0386 | `OVD28-19-21.25 (47097)` | 19-21.25 | 47097 | 21.1-21.3 | 0.05 |

The audit's D5 named 9 of these. The generic detector used here also catches `OVD028-38 (33.14-35)` (named in D5's own text as a related case), `OVD029-122.4 (123-124.5)` — both of which write the report interval as a caption rather than in the id — and `OVD28-19-21.25 (47097)` at 0.05 m. All 12 are flagged.

**D6 — SQLite ergonomics.** Fixed: real NULLs, primary keys, foreign keys and 7 indexes (see §1).

**D7 — near-duplicate samples not cross-referenced.** Fixed: a generic scan of every hole for sample pairs within 0.35 m found **5** pairs; both members of each pair now carry a `D7 cross-reference` entry in `qa_flags`:
- CRS02: 43569 @ 54.7 m vs 43570 @ 55 m (0.3 m apart)
- OVD009: 43816 @ 126.6 m vs 41021 @ 126.7 m (0.1 m apart)
- OVD009: 41015 @ 149.5 m vs 41033 @ 149.8 m (0.3 m apart)
- OVD015: OVD015@175.4 @ 175.4 m vs 42388 @ 175.5 m (0.1 m apart)
- OVD015: 42388 @ 175.5 m vs 42389 @ 175.5 m (0 m apart)

**D8 — `depth_mid_m` vs the master's point depth.** Unchanged by design: where the Phase-2 sheet supplies a narrow interval the build stores that interval and uses its midpoint (typical difference 0.05 m, worst 0.5 m). Recorded here so the difference is not mistaken for corruption.

**D9 — A/B suffix rests on letter order.** Fixed: 8 description rows now record the inference in `qa_notes` — D0075 `OVD014-89.8 (A)` -> 42147, D0076 `OVD014-89.8 (B)` -> 42147, D0088 `OVD015-175.5 (A)` -> 42388, D0089 `OVD015-175.5 (B)` -> 42389, D0292 `OVD14-89.8A` -> 42147, D0294 `OVD14-89.8B` -> 42147, D0304 `OVD15-175.5a` -> 42388, D0305 `OVD15-175.5B` -> 42389.

**D10 — OVD008A depth datum undocumented.** Fixed: documented in §9 above and in `README.md` (import notes).

### Coverage audit (`VERIFICATION_coverage.md`)

**G1 — 2 described thin sections with no sample row.** Fixed: `OVD003@202` and `OVD009@178` created from the Crawford 2025 report and desurveyed; their descriptions (previously unmatched) are now joined.

**G2 — 2 resolvable unmatched descriptions.** Fixed: D0243 `OVD021@101.5m` -> 42027; D0310 `OVD20-121` -> 43251.

**G3 — whole-dataset omissions unacknowledged.** Fixed: §11.

**G4/G5/G6/G7 — unextracted source documents.** Largely fixed by the `missing_sources` batch (§4 of that folder's README): 84 records, of which 67 became descriptions and 17 became photo-only sample stubs. What is still missing is listed in §11.

Depth cross-check on the batch's tag-joined records — the report's stated depth vs the sample register's (1 disagreement, recorded in `descriptions.qa_notes`; the register value is kept):
- D0563 tag 41018: report 80.9 m vs register 80.8 m (0.1 m)

**No new SURFACE sample rows were needed.** All 24 surface records of the batch (sources 1, 2, 4 and 6–9) map onto rows 1–24 of the master grab sheet — which already have sample rows — after case folding, leading-zero stripping and the documented `2021-01` / `2022-01` year-digit typo, and the mapping agrees with the row order the batch README reconstructs. Where the two spellings differ, BOTH the description (`qa_notes`) and the sample (`qa_flags`) record it. The three records that map to no sample (`2111`, the Ni-report `2107`, `2023Nisample`) are kept UNJOINED rather than given invented sample rows, because none of them has a field number — see §11.

**G8 — `sources.csv` provenance.** Fixed: every fileId is now resolved to the inventory-canonical copy (duplicates are followed through `isDuplicateOf`), the omitted contributing files are registered, and the corrections are recorded in the new `sources.provenance_note` column:
- Petrograph_MIRESL20230816_summary.xlsx: fileId corrected in v1.1: the build cited 1WoLN-IjSNCLeOxNqkBHa8S9UXbzHwloF, which is not an inventory entry; the inventory-canonical copy of this title is 1xtXI_avodVIDEyqzPANfOnjWdssdiFPR
- AM_ThinSectionMongolia_Report_2024.pdf: not listed in workspace/inventory.json (inventory gap)
- 2023-08-06-2 шлиф.pdf: not listed in workspace/inventory.json (inventory gap)
- 2023-06-20-3 thin sections.pdf: fileId corrected in v1.1: the build cited 1kkEQHYDCdr7ckB7d7xv7zssmCIkEGpU-, which is not an inventory entry; the inventory-canonical copy of this title is 1laCOiOgBKgIdPSmLIRmnRHeu7UAxTfhm
- Asian Battery Metals March 2025 The Oval Summary Report.pdf: not listed in workspace/inventory.json (inventory gap)
- Review of Work on 'The Oval' Ni-CU Target Revised March 2025.pdf: not listed in workspace/inventory.json (inventory gap)
- FW_ Petrology - Oval Nickel Project.zip: not listed in workspace/inventory.json (inventory gap)
- MS3_Outcrop Sample_Петрографи-минераграфи 4ш.docx: fileId corrected in v1.1: the build cited 1pdeSCucBLmStN5nrRrOUaMwXzr_KpQK-, which is not an inventory entry; the inventory-canonical copy of this title is 1pdeSCucBLmStH5nrRrOUaMwXzr_KpQK-

**G9 — grab-sheet field descriptions dropped.** Fixed: 54 field descriptions recovered from the `2022-2024 grab` sheet's right-hand `Description` column and emitted as description rows (`join_method = grab sheet row`, language `mn`/`en` as written).

**G10 — `D0089` mis-join.** Fixed in `match_by_label`: the verbatim label (suffix included) is now tried before the suffix-stripped form, so `OVD015-175.5 (A)` → 42388 and `OVD015-175.5 (B)` → 42389.

**G11 — undocumented OVD014-89.8 (A)/(B) merge.** Fixed: sample 42147 carries a `COVERAGE G11` note in `qa_flags`.

**G12/G13/G14 — unverified tables, the BE-3 assumption and the photo datasets.** G13 is now resolved: `BE-3 samples in English.pdf` was read in the `missing_sources` batch and its three block samples ARE tags 40763 / 40900 / 40913, confirming the v1.0 assumption. G12 and G14 remain open — see §11.

## 11. Known missing at source (datasets identified but NOT in this database)

This section exists because the coverage audit found that v1.0 acknowledged none of these. Row counts were never inflated — nothing below is silently counted as covered.

### Absent from Google Drive itself (cannot be ingested)

- **Gtech prospect review** — referenced by name in project correspondence; no file in the Drive set.
- **Chuluunbataar / Vi Vitex LLC review (May 2022)** — referenced by name; no file in the Drive set.
- **Dennis (RPM Global, Oct 2023)** and **Prof. D. Holwell (Oct 2023)** reviews — referenced by name; no file in the Drive set.
- **ARDH-2005-02 thin-section photos** — folder `1AHFQu0eLtEZbbM-nrJFZvfu2-OUqRxid` exists but is EMPTY on Drive.
- **`41016.jpg`** — the hand-specimen photo for tag 41016 is missing from both `Khanlab_Petrograph_samples` photo folders (23 JPGs for 24 samples). The 41016 DESCRIPTION is present (ingested in v1.1 from the consolidated Khanlab О-24 PDF).
- **Khanlab batch-1 report** (SEM-EDS reference '1', 7 × OVD-009 sections: 41014, 41015, 41016, 41017, 41020, 41021, 41023) — the report document itself is not in the Drive set. All 7 samples exist and, as of v1.1, all 7 carry the Khanlab О-24 narrative from the consolidated PDF.

### Out of scope for this database (no table models them)

- **≈330 sample photographs in 13 Drive folders** — `Petrographic_photos_2023` (36 PNG), `Mineralogical_photos_2023` (31), `SEM-EDS_photos_2023` (17), `Khanlab_Petrograph_samples` (23), `ymb_2024_Scanned…` (~75), Phase-1 (~55), Phase-2 (~45), ARDH-2005-01 (18). Many are named by sample tag (40530–40915) and are therefore directly linkable to `samples.sample_id`. **There is no `sample_photos` table in v1.1** — the images themselves are not ingested and no per-image row exists, EXCEPT the 17 ARDH-2005-01 thin-section photographs, which are carried as photo-only sample stubs because they are the only record of that hole's sections.
- **`МП2026-24 Батбадмаараг ХХК …pdf` (Modot-3, licence XV-020181)** — deliberately excluded: a different project, not Oval/Yambat.

### Present on Drive, still not opened (G12 — no evidence they add samples, but unverified)

- `2023 Drilling petrography samples.xlsx` — `17GqS_Wo0T6OOEIAgiUyl6rkUgjN2Ox5Z`
- `Yambat petrography samples 2024 from Core.xlsx` — `1dRlx13-icZZl-OokbD9OfXov-mbuoP4o`
- `Petrograph_2023_07_31.xlsx` — `1PPWrYjVeLfTTgec-Qmazi_oYdYnOu3Gi`
- `Deejiin hoolgoonii list_ABM (1).xlsx` — `1o_jgfkLe_lC4f21Uf1z3uoSmZZtfoVId`
- Grab lists `Grab 2022aug-2023.xlsx/.csv` (`16f8S2Si…`, `1JeL0cAM…`), `2022aug-2023.xlsx` (`1is5GE0W…`), `03Aug2022.xlsx` (`1XZC2MhQ…`) — the 65-sample grab count rests on the master grab sheet, not on these.
- The three 250–320 MB Khanlab `.doc` files (`1b2NKUWu…`, `1d9YIMNE…`, `1jhySMOE…`) — the same 24-sample report; the consolidated PDF used in v1.1 covers all 24 sections, but the ENGLISH translation has not been harvested, so the 12 new Khanlab records carry Mongolian `description_text` with an English `rock_name`.
- `R_2023-21 Petrology, mineralogy – Mireslab Mongol LLC.pdf` (`16QAZBbGJVSkJSjXjzeO6RLW_De4LCIhH`) — READ in the v1.1 batch and found to be the WORK CONTRACT, not a petrography report (26 samples ordered, 23 delivered as Report #2302). No sample data; deliberately not ingested.

### Sample suites that still have no petrographic description

- **Grab-sheet rows 25–65** — `TS1`–`TS7`, `RC5`, `RC6`, tags `43113, 43122, 43123, 43125, 43141, 43144, 43146, 41154, 41155, 41160–41163, 41167–41169, 41172, 41178–41180, 41183, 47071–47073, 47076, 47077, 47084`, and `CR66, CR99, CR71, CR1, CRE`. None of the recovered 2022–23 reports describes them. As of v1.1 they do carry the geologist's FIELD description (§10 G9), but no microscope determination.

### Unjoinable records (ingested, but with no sample to attach to)

- `2023Nisample` — descriptive placeholder, not a field number: MINERALOGICAL-DESCRIPTIONS_2023.03.25.pdf gives no sample id for the garnierite / Ni-goethite sample (missing_sources README §4.7)
- `2107` — AMBIGUOUS ID: `2107` in Report_0715_Ni.pdf is a Ni-ore sample (XRD + ore microscopy + SEM-EDS), while grab row 21 `2107` is an amphibolite thin section (Thin and polish-4.docx). The grab-sheet coordinates put row 21 in the same outcrop cluster, so they are probably the same physical sample described by different methods — but no document states it, so this record is left UNJOINED rather than force-merged (missing_sources README §4.6)
- `2111` — no field/sample number anywhere in Report_0715_Ni.pdf and no row in the 2022-2024 grab sheet or Master All — cannot be joined until a field number is supplied (missing_sources README §4.7)

Full list of every unmatched description row (all sources):

- `D0514` `2111` (Report_0715_Ni.pdf)
- `D0515` `2107` (Report_0715_Ni.pdf)
- `D0524` `2023Nisample` (MINERALOGICAL-DESCRIPTIONS_2023.03.25.pdf)

### Datasets the audit listed as missing that v1.1 RESOLVED

- The 10 unextracted 2022–23 Mireslab surface reports — **ingested** (`Petrographic descriptions 06.23`, `… 11.04`, `Report_0715_Ni`, `Report_microscope_20221012`, `MINERALOGICAL-DESCRIPTIONS_2023.03.25` + its `-NI.docx` twin, `Thin and polish-1/-1sh/-2sh/-4`). 24 of the 65 grab/rockchip samples now carry a laboratory petrographic description.
- `Report20231124.docx` and `Report_20230816 Part1/Part2` — **ingested**; the 23 MIRESL 2023 drill-core samples now carry the FULL narrative (hand specimen, texture, per-mineral habit and size, alteration, SEM-EDS), not only the one-line summary-sheet fields.
- The Khanlab О-24 consolidated report — **ingested**; the 12 OVD009 sections (41014–41023, 41033, 41034) that `Петрограф008.docx` did not cover now have their primary-source description.
- **Mireslab 'pdf2' (tags 40910, 40628, 40635, 40645)** — RESOLVED as an artefact: all four tags are Report #2302 sections (Mireslab internal codes OVD019, OVD007, OVD004, OVD005), whose full narrative arrived with `Report_20230816 Part1/Part2` in this batch. There is no separate 'pdf2' document to find; the four samples now carry the primary-source narrative alongside the MIRESL summary row and the Crawford description.
- **ARDH-2005-01** — the 17 unique thin-section photographs are now carried as sample rows (photo-only stubs). There is still no petrographic text for them: no report, sheet or description exists under that hole.
- The `BE-3 samples` PDFs (G13) — read; the 3 NUM sections are confirmed to be tags 40763 / 40900 / 40913.

## 12. Changelog v1.0 → v1.1

| table | v1.0 rows | v1.1 rows | change |
|---|---|---|---|
| samples | 376 | 395 | +19 |
| descriptions | 451 | 572 | +121 |
| collar | 76 | 76 | +0 |
| survey | 1990 | 1990 | +0 |
| sample_assays | 277 | 277 | +0 |
| lu_hole_alias | 101 | 101 | +0 |
| lu_lab | 20 | 31 | +11 |
| lu_rock_type | 473 | 704 | +231 |
| sources | 32 | 48 | +16 |

**Data corrections**

- 47176: interval 144.0–114.1 → 114.0–116.0 m; position moved 14.05 m (D1).
- `OVD015-175.5 (B)` description re-joined 42388 → 42389 (G10).
- `OVD021@101.5m` → 42027 and `OVD20-121` → 43251, both previously unmatched (G2).
- 2 new drill-core samples created and desurveyed (G1).
- 17 legacy ARDH-2005-01 photo-only sample stubs created.

**New content**

- 54 grab-sheet field descriptions recovered (G9).
- 67 descriptions merged from the `missing_sources` batch (of 84 records; the other 17 are photo-only stubs).

**Schema changes**

- `survey` gains `qa_note`.
- `lu_rock_type` gains `rock_family` and `seen_in`.
- `sources` gains `provenance_note`.
- SQLite gains NULLs, primary keys, foreign keys and indexes.

**Documentation**

- §5 now separates depth PARSING from depth RANGE validation (the v1.0 claim 'depth-parse failures: none' was true but masked D1).
- §9 corrected: the Crawford caveats are now genuinely in `descriptions.qa_notes` and `samples.qa_flags`, as v1.0 claimed.
- §11 'Known missing at source' added.

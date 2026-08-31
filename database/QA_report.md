# QA report — Oval Petrography Database

Built by `scripts/build_database.py` on 2026-08-31 from `workspace/extracted/`. CRS: WGS84 / UTM zone 46N (EPSG:32646).

## 1. Row counts (dataframe = csv = sqlite)

| table | rows | csv | sqlite | ok |
|---|---|---|---|---|
| samples | 376 | 376 | 376 | OK |
| descriptions | 451 | 451 | 451 | OK |
| collar | 76 | 76 | 76 | OK |
| survey | 1990 | 1990 | 1990 | OK |
| sample_assays | 277 | 277 | 277 | OK |
| lu_hole_alias | 101 | 101 | 101 | OK |
| lu_lab | 20 | 20 | 20 | OK |
| lu_rock_type | 473 | 473 | 473 | OK |
| sources | 32 | 32 | 32 | OK |

xlsx sheets: samples, descriptions, collar, survey, sample_assays, lu_hole_alias, lu_lab, lu_rock_type, sources

## 2. Coordinate coverage

- samples total: **376**
- with coordinates: **341** (90.7 %)
  - desurveyed 3D (x,y,z): 283
  - master/grab X,Y only (z null): 58
- without coordinates: 35 (rockchips w/o coords, unlocated lab-number/TS/C samples)
- drill-core samples whose hole is in collar but NOT desurveyed: **0**

## 3. Description join statistics

- descriptions total: **451**; matched: **447** (99.1 %), unmatched: 4
- join methods: tag: 297, label: 131, hole+depth: 17, unmatched: 4, hole+depth+suffix: 2

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
| Asian Battery Metals March 2025 The Oval Summary Report.pdf | 38 | 35 |
| BayanSair_Drilling Sample Petrography_12 Sample.docx | 12 | 12 |
| Drillhole Petrograph_2023__Sheet1.csv | 50 | 50 |
| English 41 Petrographic and Mineragraphic description.docx | 41 | 40 |
| English Petrographic and Mineragraphic Descriptions. 6.docx | 6 | 6 |
| English Petrographic and Mineragraphic description. 15.docx (Innova Mi | 15 | 15 |
| MS3_Outcrop Sample_Петрографи-минераграфи 4ш.docx | 4 | 4 |
| Petrograph_MIRESL20230816_summary.xlsx | 23 | 23 |
| Report_ABM 2025.09.09 final.pdf (MUST lab, 22 samples, SEM-EDX) | 22 | 22 |
| Yambat_petrography_samples_2022-2024_from_Core___grab__Petrography_bic | 104 | 104 |
| Yambat_petrography_samples_2022-2024_from_Core___grab__Samples_to_Japa | 8 | 8 |
| Петрограф008.docx | 12 | 12 |

### Unmatched descriptions

- `OVD003@202m` (Asian Battery Metals March 2025 The Oval Summary R) — untagged Crawford extra suggestion (Low MgO gabbro)
- `OVD009@178-180m` (Asian Battery Metals March 2025 The Oval Summary R) — untagged Crawford suggestion; Crawford flags 'wholerock assay does not match this thin section' (suspected swap)
- `OVD021@101.5m` (Asian Battery Metals March 2025 The Oval Summary R) — probably OVD011-101.5 (tag 42027): Crawford set contains no other OVD021@101.5 source sample; leucogabbro dyke QA flag in Crawford report
- `OVD20-121` (English 41 Petrographic and Mineragraphic descript) — 41-report id inconsistency: its microphoto is captioned '21-121', so this is most likely OVD021-121 (tag 43251); OVD020 has no sample at 121 m — left unmatched rather than force-joined

## 4. Duplicate handling

- dropped: no-id row SC04 'SC04-168.3' dropped (duplicates tagged SC04 rows)
- dropped: no-id row SC04 'SC04-171, SC04-280.7' dropped (duplicates tagged SC04 rows)
- dropped: 45652 (BS001 380) exact duplicate row dropped
- split: tag 42808 used twice; second occurrence (SC04 @ 280.7) stored as SC04@280.7
- merged: 32 rockchip-sheet rows merged into existing grab-sheet samples (same Sample_numbers; grab sheet supplies their X/Y)
- Master All formatting rows skipped (no id, no interval): 14

## 5. Depth-parse failures

- none

## 6. Samples added beyond the Master All spine (97)

- Yambat_Petrographic_Master_Data__2022-2024_grab.csv: 65
- 15ш пет-мин бичиглэл. 09.02. (2 петрографи, 13 пет-мин бичиглэл) (1).docx: 15
- AM_ThinSectionMongolia_Report_2024.pdf: 8
- MS3_Outcrop Sample_Петрографи-минераграфи 4ш.docx: 4
- 2023-08-06-2 шлиф.pdf: 2
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

## 9. Known issues carried from sources

- **Crawford 2025 sample/assay mix-up flags** (kept in `descriptions.qa_notes`): OVD008@88.9m lacks sulfides despite 2.5 %S assay; OVD008@90.5m section (hbl-phyric basalt) does not match ~30 % pyrrhotite assay; OVD009@178-180m wholerock assay does not match section (suspected swap with a leucogabbro dyke like OVD021@101.5m); OVD021@101.5m high-Cr assay has no chromite; OVD007@55.9m core photo may not match section.
- Crawford notes sub-standard polish on many of the 38 sections; OVD005@40.5 and @53.0 'far too thin'; OVD021@148.8 sulfides too poorly polished.
- `OVD021@101.5m` (Crawford) is most likely OVD011-101.5 (tag 42027) — the description is left unmatched rather than force-joined.
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

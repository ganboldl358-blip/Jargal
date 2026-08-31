# Independent coverage verification — Oval / Yambat petrography database

Adversarial QA re-derivation, 2026-08-31. **Read-only audit** of
`workspace/inventory.json` (128 entries), `workspace/extracted/**`, and
`database/csv/{samples,descriptions,sources}.csv` + `QA_report.md`.
Nothing was taken on the builders' word: every count below was recomputed from
the source CSV/JSON with `scratchpad/verify_cov/recon.py`.

---

## 0. Verdict

**GAPS FOUND — but no sample or description that reached the extraction layer was
lost by the database build.**

| Question | Answer |
|---|---|
| Did any identifier present in `extracted/**` fail to reach `samples.csv`? | **No.** 0 of ~1,600 harvested identifiers across 20 extraction id-sets are absent. |
| Are there DB rows with no traceable source? | **No.** 0 of 376 sample rows. |
| Does the description arithmetic close? | **Yes, exactly.** 63 + 203 + 23 + 50 + 104 + 8 = **451** = `descriptions.csv`. Every exclusion is justified. |
| Did any dataset the **inventory** identifies fail to reach the DB? | **Yes — 10 report datasets and 1 legacy dataset were never extracted, and none of them is acknowledged in `QA_report.md`.** |
| Are the "known-missing" items documented? | **No. `QA_report.md` and `README.md` mention none of them** (Khanlab batch-1, Mireslab "pdf2", Gtech, Vi Vitex, ARDH-2005, 41016.jpg). |
| Physical samples with a description but no sample row? | **2** — Crawford `OVD003@202m` and `OVD009@178-180m`. |

The build is **sound**; the *inventory-to-extraction* hand-off is where the coverage
was lost, and the QA report does not say so. Net effect: 65 grab/rockchip samples
and 23 Mireslab 2023 drill-core samples carry no narrative petrographic text
because the reports that contain it were never opened.

---

## 1. Dataset coverage matrix

Legend — **COVERED**: dataset present at expected count. **PARTIAL**: samples/short-form
data present, source document never extracted. **MISSING**: nothing from this dataset
reached the DB. **MISSING@SOURCE**: absent from Google Drive itself. **UNVERIFIED**:
file never opened, no evidence it adds anything, but not checked.

### A. 2022–2023 Mireslab surface sets (inventory §2.A)

| Dataset | fileId | Expected n | Found in DB | Status |
|---|---|---|---|---|
| `Report_0715_Ni.pdf` (first Ni petrography, 2022-07) | `1jIT5VpacpQcvW1KbUty6C1EmT2PPr1Fu` | not stated | 0 descriptions, not in `sources.csv` | **MISSING** |
| `Petrographic descriptions 06.23.pdf` / `.docx` | `16r0N4TEldedRvrGcPM_hEvIeCsZfMA7v` (+docx) | not stated | 0 | **MISSING** |
| `Petrographic descriptions 11.04.pdf` / `.docx` | `1nIKqxM9CtQt3Hn62D0ExKWKdL-CAaVPq` (+docx) | not stated | 0 | **MISSING** |
| `Report_microscope_20221012.pdf` | `1sBdqf9GC7ZO_690r9rE2R6QhJe2cq54t` | not stated | 0 | **MISSING** |
| `MINERALOGICAL-DESCRIPTIONS_2023.03.25.pdf` + `-NI.docx` | `1PqskoIsimAuRzmS2h6uQeKGz1cv2ZHoq` / `1uyNsf1sdkrkh0Y9Pi8lhvYlksLJGVf55` | not stated | 0 | **MISSING** |
| `Thin and polish-1 / -1sh / -2sh / -4.docx` (4 files) | `1DfMbUNC…`, `1UiyI5UX…`, `15hjIW8s…`, `1ip2bAQR…` | not stated | 0 | **MISSING** |
| Grab sample lists `Grab 2022aug-2023.xlsx/.csv`, `2022aug-2023.xlsx`, `03Aug2022.xlsx` | `16f8S2Si…`, `1JeL0cAM…`, `1is5GE0W…`, `1XZC2MhQ…` | ? (coords) | 65 grab samples via Master grab sheet | **PARTIAL** — lists never opened; the 65-sample count is unverified against them |
| NUM 3 thin sections (`BE-3 samples in English/Mongolian.pdf`, `2023-06-20/21` PDFs) | `1JCorsOW…`, `1POBc4Or…`, `1laCOiOg…`, `14pglJES…` | 3 | 3 samples `40763`, `40900`, `40913` (lab = NUM) + 3 descriptions | **COVERED** — but only via `2023-06-20-3 thin sections.pdf`; the two `BE-3 …pdf` files were never opened, so "BE-3 = these 3" is an **assumption** |
| Aug-2023 2-sample set (`2023.08.06 2 samples` / `2023-08-06-2 шлиф`) | folder `1hQ5eM9_…`, pdf `1UONp87c…` | 2 | 2 samples `C-1`, `C-2` + 2 descriptions | **COVERED** |

> **Consequence:** the 65 grab + rockchip samples (`sample_source` = grab 33 / rockchip 32)
> have **zero** description rows. Their petrography lives only in the 10 unextracted
> 2022–23 Mireslab documents above.

### B. 2023 Khanlab «О-24», 24 samples (41011–41034)

| Dataset | fileId | Expected n | Found in DB | Status |
|---|---|---|---|---|
| `41011.pdf … 41034.pdf` (24 per-sample PDFs) | folder `1DBdBb9KnrdmkNTViAqC0M0wZMNWiBmX7` | 24 | **24/24 samples present**; every tag carries 2–4 descriptions | **PARTIAL** — samples + narrative present (transcribed into the master workbook), but no description in the DB cites these PDFs; they were never opened |
| `Петрографи, минераграфи О -24 (1).doc`, `Results_of_petrographic_…doc`, `Petrography_mineragraphy_24 sample.pdf/.doc`, `Eng Петрографи…doc`, `008. Petrographical…docx` | `1b2NKUWu…`, `1d9YIMNE…`, `17L0euxd…`, `1bdCx_kE…`, `1jhySMOE…`, `1BVrktox…` | 24 | 0 rows cite them | **PARTIAL** (same content, other route) |
| `Петрограф008.docx` (12 of the 24) | `1tw3IOr7…` (canonical) | 12 | 12 descriptions | **COVERED** |
| `Khanlab_petrography_Samples.xlsx` | `1W3XRRKA…` | 23 rows | 23/23 matched on hole+interval | **COVERED** (assay context) |

### C. 2023 Mireslab drill core + registers

| Dataset | fileId | Expected n | Found in DB | Status |
|---|---|---|---|---|
| `Petrograph_MIRESL20230816_summary.xlsx` | `1xtXI_av…` | 23 | 23 descriptions | **COVERED** |
| `Report_20230816_Part1.pdf` / `Part2.pdf` (the full report behind that summary) | `1KLR39-V…`, `1TEpS_kJ…` | 23 | 0 | **PARTIAL** — narrative never extracted |
| **`Report20231124.docx`** (canonical Mireslab drillhole report, 3 Drive copies) | `106T7bR2o5_Pw1pFPEcfzml6Q9DhdnFUT` | ? | 0, not in `sources.csv`, not acknowledged | **MISSING** |
| `R_2023-21 Petrology, mineralogy – Mireslab Mongol LLC.pdf` (official lab report) | `16QAZBbGJVSkJSjXjzeO6RLW_De4LCIhH` | ? | 0 | **MISSING** |
| `Drillhole Petrograph_2023.xlsx` (50-row 3-lab register) | `1gUTrLiQ…` | 50 | 50 descriptions | **COVERED** |
| `Petrograph_2023.xlsx` v3 (26-row register) | `1hLNU5HcF…` | 26 | 26 samples incl. tag **40904** | **COVERED** |
| `Petrograph_2023_07_31.xlsx` | `1PPWrYjVeLfTTgec-Qmazi_oYdYnOu3Gi` | ? | never opened | **UNVERIFIED** |
| `2023 Drilling petrography samples.xlsx` | `17GqS_Wo0T6OOEIAgiUyl6rkUgjN2Ox5Z` | ? | never opened | **UNVERIFIED** |

### D. 2024

| Dataset | Expected n | Found in DB | Status |
|---|---|---|---|
| 41-sample report (`English 41 …docx`) | 41 | 41 descriptions (40 joined, 1 unmatched = `OVD20-121`) | **COVERED** |
| 15-sample Innova (`… description. 15.docx`) | 15 | 15 | **COVERED** |
| 6-sample (`… Descriptions. 6.docx`) | 6 | 6 | **COVERED** |
| Per-hole OVD22–29 (7 docx) | 83 = 14+9+13+10+16+12+9 | **83**, exact per-file match on all seven | **COVERED** |
| `Sheet3` 2024 hole-depth core list | 56 | 56 | **COVERED** |
| Copper Ridge rockchips | 32 | 32 (merged into grab rows, per QA) | **COVERED** |
| `Yambat petrography samples 2024 from Core.xlsx` (`1dRlx13-icZZl-OokbD9OfXov-mbuoP4o`) | ? | never opened | **UNVERIFIED** |
| ThinSection Mongolia 2024 (`AM_ThinSectionMongolia_Report_2024.pdf`) | 8 (+ `ТЦ-1` in TOC, never described) | 8 samples + 8 descriptions | **COVERED** |
| `Suggested Petro for the Oval 2024.xlsx` (AJC) | 26 | 26 samples, all with ≥3 descriptions | **COVERED** |
| MN twins of the 41 / 15 reports (`1uDyW5O5…`, `1HOaqAhH…`) | — | rock names merged in, **absent from `sources.csv`** | **COVERED, unrecorded** |

### E. 2025

| Dataset | Expected n | Found in DB | Status |
|---|---|---|---|
| `Report_ABM 2025.09.09 final.pdf` (MUST/ШУТИС) | 22 | 22 | **COVERED** |
| `15ш пет-мин бичиглэл. 09.02 …docx` | 15 | 15 (14 unlocated + `43816`) | **COVERED** |
| `5 петрографи баттерей (2).docx` | 5 | 5 | **COVERED** |
| `PETRO LIST 2025.xlsx` | 39 | 39 | **COVERED** |
| 2025 phase-3 sheet | 42 | 42 | **COVERED** |
| `Deejiin hoolgoonii list_ABM (1).xlsx` (`1o_jgfkLe_lC4f21Uf1z3uoSmZZtfoVId`) | ? | never opened | **UNVERIFIED** |

### F. 2026

| Dataset | Expected n | Found in DB | Status |
|---|---|---|---|
| `BayanSair_… 12 Sample.docx` | 12 | 12 descriptions; 12 sample rows (`45653` folded into `45652`, documented) | **COVERED** |
| `MS3_Outcrop … 4ш.docx` | 4 | 4 | **COVERED** |

### G. Legacy, external and referenced-only

| Dataset | Expected n | Found in DB | Status |
|---|---|---|---|
| **ARDH-2005-01** `4. Thin section photo` (18 JPG, DSC00228–DSC00260), folder `1SpY0E3wPZudd9e6KIC5D8SpFgfnRF2tk` | 18 sections | **0 samples, 0 descriptions, not in `sources.csv`, not acknowledged** | **MISSING** |
| **ARDH-2005-02** `4. Thin section photo`, folder `1AHFQu0eLtEZbbM-nrJFZvfu2-OUqRxid` | ? | folder empty on Drive; inventory flags it, `QA_report.md` does not | **MISSING@SOURCE, unacknowledged** |
| Crawford `Asian Battery Metals March 2025 … Summary Report.pdf` | 38 | 38 descriptions; **35 joined**, 3 unmatched; **2 of the 38 have no sample row** | **PARTIAL** |
| Crawford `Review of Work …` (May-2024 + Revised Mar-2025) | context | both in `sources.csv` | **COVERED** |
| **Khanlab batch-1** report (SEM-EDS ref "1", 7 × OVD-009 sections) | 7 | samples `41014 41015 41016 41017 41020 41021 41023` all present with 3 descriptions each; **the report itself is not in the Drive set** | **MISSING@SOURCE, unacknowledged** |
| **Mireslab "pdf2"** report (tags `40910 40628 40635 40645`) | 4 | all 4 samples present with 4 descriptions each (MIRESL summary + Crawford); **report not in the Drive set** | **MISSING@SOURCE, unacknowledged** |
| Gtech; Chuluunbataar (Vi Vitex LLC, May 2022); Dennis (RPM Global, Oct 2023); Prof D. Holwell (Oct 2023) | unknown | 0 | **MISSING@SOURCE, unacknowledged** |
| Photo datasets — 13 folders, ≈330 images (`Petrographic_photos_2023` 36 PNG, `Mineralogical_photos_2023` 31, `SEM-EDS_photos_2023` 17, `Khanlab_Petrograph_samples` 23, `ymb_2024_Scanned…` ~75, Phase-1 ~55, Phase-2 ~45, ARDH 18) | ≈330 | **no photo table exists in the DB** | **OUT OF SCOPE, undocumented** |
| `41016.jpg` hand-specimen photo | 1 | absent from both photo folders on Drive | **MISSING@SOURCE, unacknowledged** |
| `МП2026-24 Батбадмаараг ХХК …pdf` (Modot-3, XV-020181) | — | correctly excluded | **INTENTIONALLY EXCLUDED** (per inventory note; not restated in `QA_report.md`) |

**Matrix summary:** 24 datasets **COVERED**, 6 **PARTIAL**, 8 **MISSING**, 6
**MISSING@SOURCE**, 5 **UNVERIFIED**, 1 intentionally excluded, 1 out of scope.

---

## 2. Sample-level reconciliation

20 identifier sets were harvested from the extraction layer and each id was matched
against `samples.csv` (`sample_id` ∪ `alt_ids`, plus canonicalised hole-id spellings
and a hole+depth fallback).

| Extraction id-set | unique ids | matched in DB | missing |
|---|---|---|---|
| Master `All`.SAMPLE_ID | 278 | 278 | 0 |
| Master grab sheet.Sample ID | 65 | 65 | 0 |
| Copper-Ridge rockchip.Sample_number | 32 | 32 | 0 |
| `Sheet3`.Sample_number | 56 | 56 | 0 |
| `Petrography bichiglel table`.Sample Number | 191 | 191 | 0 |
| `KhanAltai vs Tony`.Sample Number | 191 | 191 | 0 |
| `Samples to Japan`.Sample Number | 20 | 20 | 0 |
| 2023 Phase 1.Sample Number | 90 | 90 | 0 |
| 2024 Phase 2.Sample Number (both columns) | 84 / 84 | 84 / 84 | 0 |
| 2025 phase 3.Дээжийн дугаар / SAMPLE_ID | 42 | 42 | 0 |
| `PETRO LIST 2025`.Sample id | 39 | 39 | 0 |
| `Petrograph_2023`.Tag | 26 | 26 | 0 |
| `Suggested Petro 2024`.Tag | 26 | 26 | 0 |
| `Drillhole Petrograph_2023`.Tag | 50 | 50 | 0 |
| `Petrograph_MIRESL20230816`.Tag | 23 | 23 | 0 |
| `Khanlab_petrography_Samples` (hole+interval) | 23 | 23 | 0 |
| `reports/samples.json`.sample_id | 86 | 83 | **3** |
| `reports/samples.json`.lab_tag | 26 | 26 | 0 |
| `reports2024_2026/samples.json`.sample_id | 198 | 197 | **1** |

### 2.1 Every identifier present in the extraction layer but absent from the DB

Only **four**, all of them description-level ids from report PDFs/DOCX:

| Identifier | Source | Status |
|---|---|---|
| `OVD003@202m` | Crawford 2025 | **No sample row anywhere.** OVD003 has only 2 samples (`41012` @155.3, `40530` @157.5). A real thin section with no register entry. |
| `OVD009@178-180m` | Crawford 2025 | **No sample row anywhere.** OVD009 samples jump 171.5 → 190.8. A real thin section with no register entry. |
| `OVD021@101.5m` | Crawford 2025 | Sample row **exists** as `42027` (OVD011 @101.5). Description left unjoined — see finding G2. |
| `OVD20-121` | 41-sample report | Sample row **exists** as `43251` (OVD021 @121.0, `alt_id` `OVD21-121`). Description left unjoined — see finding G2. |

The 63 apparent "misses" my first pass reported for `reports2024_2026` were all
composite labels of the form `OVD22-105-107 (47162)` / `BS001-287 (45635)`; parsing the
parenthetical lab number resolves **all** of them. Verified individually.

### 2.2 Reverse — DB rows with no traceable source

**0 of 376.** Every `samples.csv` row resolves to at least one extraction-layer
identifier. The 3 rows the QA report flags as "absent from Master All"
(`40904`, `47153`, `OVD015@175.4`) are correctly carried and flagged; both tags the
master README called missing (`40904`, `47153`) are in the DB.

---

## 3. Description arithmetic reconciliation

`descriptions.csv` = **451** rows. Re-derived, closing exactly:

| Input | Records in | Rows out | Excluded | Exclusion justified? |
|---|---|---|---|---|
| `reports/samples.json` — `petrographic_description` | 63 | **63** | 0 | — (12 Петрограф008 + 8 ThinSection Mongolia + 2 L.Jargal C-series + 3 L.Jargal tags + 38 Crawford = 63 ✓) |
| `reports/samples.json` — `sample_list_entry` | 26 | 0 | 26 | **YES.** These are rows of the AJC selection spreadsheet, not descriptions. All 26 tags exist as samples and each carries ≥3 descriptions from other sources (verified tag-by-tag). |
| `reports2024_2026/samples.json` | 203 | **203** | 0 | — 100 % pass-through; per-file counts match the source README exactly (41/22/16/15/15/14/13/12/12/10/9/9/6/5/4). |
| `xlsx/Petrograph_MIRESL20230816_summary` | 23 | **23** | 0 | — |
| `xlsx/Drillhole Petrograph_2023__Sheet1` | 50 | **50** | 0 | — |
| `xlsx/Petrograph_MIRESL20230816_summary (1)` | 23 | 0 | 23 | **YES.** Byte-identical duplicate; including it would have double-counted. |
| `master/…Petrography_bichiglel_table` | 191 | **104** | 87 | **YES.** All 87 excluded rows are empty in *all nine* description columns (cols 16–24). They are the 2024 Phase-2 rows `47091–47200`, `OVD028-38`, `OVD029-4/-122.4/-129.4`, plus `OVD21-61` and `OVD21-121` — their descriptions arrive from the seven per-hole DOCX files. Verified cell-by-cell. |
| `master/…Samples_to_Japan` | 20 | **8** | 12 | **YES.** The 12 excluded rows have an empty `Micro - description` column (they are the 47xxx and rockchip rows sent for fluid-inclusion / S / EPMA work only). |
| `master/…KhanAltai_vs_Tony` | 191 | 0 | 191 | **MOSTLY.** Its `Petrography study by Altantsetseg` columns hold the same 103 descriptions as the bichiglel table; its `Petrographic study by Tony Crawford` columns hold **36** micro-descriptions, and I confirmed all 36 correspond to samples already described from the Crawford PDF. **One exception:** see G2 below. |
| **Total** | | **451** | | matches `descriptions.csv` exactly |

Cross-check by layer: 63 (reports) + 203 (reports2024_2026) + 73 (xlsx) + 112 (master)
= **451** ✓. Join methods re-counted: tag 297, label 131, hole+depth 17,
hole+depth+suffix 2, unmatched 4 — identical to `QA_report.md` §3.

---

## 4. Known-missing acknowledgment audit

The QA report was checked for every item that exists in the sources only as a *name*.

| Item that should be acknowledged | In `QA_report.md`? | In `README.md`? | Silently counted as covered? |
|---|---|---|---|
| Khanlab batch-1 report — 7 × OVD-009 sections (SEM-EDS ref "1") | **NO** | NO | No — the 7 samples exist and carry other labs' descriptions |
| Mireslab "pdf2" report — tags `40910`, `40628`, `40635`, `40645` | **NO** | NO | No — all 4 samples exist with MIRESL-summary + Crawford descriptions |
| Gtech prospect review | **NO** | NO | No |
| Chuluunbataar / Vi Vitex LLC (May 2022) review | **NO** | NO | No |
| Dennis (RPM Global, Oct 2023), Holwell (Oct 2023) reviews | **NO** | NO | No |
| ARDH-2005-02 thin-section photos (empty Drive folder) | **NO** | NO | No |
| ARDH-2005-01 thin sections (18 photos that *do* exist) | **NO** | NO | No — but also not extracted at all |
| `41016.jpg` hand-specimen photo missing from both photo folders | **NO** | NO | No |
| The 10 unextracted 2022–23 Mireslab surface reports | **NO** | NO | No |
| `Report20231124.docx`, `Report_20230816 Part1/2`, `R_2023-21` | **NO** | NO | No |
| The 7 Khanlab О-24 report documents / 24 per-sample PDFs | **NO** | NO | No |
| All 13 photo datasets (≈330 images) | **NO** | NO | No |
| Modot-3 `МП2026-24` deliberate exclusion | **NO** | NO | Correctly excluded, but the reason is only in `inventory.md` |

**Result: check 4 FAILS.** Nothing is fraudulently counted as covered — the row counts
are honest — but `QA_report.md` §9 "Known issues carried from sources" documents only
*within-dataset* quirks and is silent on every *whole-dataset* omission. A reader of the
database has no way to learn that the 2022–23 surface petrography, the 2023 Mireslab
narrative reports, the Khanlab report documents and the 2005 legacy sections exist and
are not in it.

---

## 5. `sources.csv` audit (32 rows, all 32 checked)

**Resolution against `inventory.json`:** 27 of 32 `drive_fileId` values are inventory
entries. The 5 that are not:

| sources.csv row | fileId | Assessment |
|---|---|---|
| `AM_ThinSectionMongolia_Report_2024.pdf` | `1mNAkW0F0qWUuq2vDpBnjOtZ5oEcfESYj` | **Inventory gap, not a sources gap** — a real 8-sample dataset the inventory never listed |
| `2023-08-06-2 шлиф.pdf` | `1UONp87cloKEolNq0fNTAcR_WPXKZMaJE` | file inside inventory folder-entry `folder:1hQ5eM9_RhDSY_WGKF_4MaxmK_GFSGofm` — OK |
| `Asian Battery Metals March 2025 The Oval Summary Report.pdf` | `1HQZSTrXY79Q10i0cLzdl1Ug5Zp9POr9z` | **Inventory gap** — the 38-sample Crawford report is not in `inventory.json` at all |
| `Review of Work … Revised March 2025.pdf` | `1oLGiwQWcY8r_S9nhTHozPrDgJhzkjzss` | newer version of inventory `#121` (`1877seW_koSkJbu-or-24G2kaeNYx3l3H`); inventory lists only the May-2024 edition |
| `FW_ Petrology - Oval Nickel Project.zip` | `1n_jRl5VBRsIzcX8KFezy7IznoPbUGIL-` | **Inventory gap** — the zip bundle is not listed (its unpacked members are) |

**Provenance defects found:**

1. **Three rows cite a duplicate copy where the inventory marks another file canonical:**
   - `PETRO LIST 2025.xlsx` → `19_86z6DSb2PMclXSzPuJBTVJwc-U6Ahl`, which `inventory.json`
     marks `isDuplicateOf: 1X95MBGNX1QTlsDtQ26fcaXHIJIecNO1O`.
   - `Петрограф008.docx` → `1g1XzQNPExltgXYax7dNieSAFGhnFes-_`, marked
     `isDuplicateOf: 1tw3IOr7TudHqMDZz22kbLw2BvtTgugtK` — and `extracted/reports/README.md`
     cites the *canonical* `1tw3IOr7…`. Internal contradiction.
   - `2023-06-20-3 thin sections.pdf` → `1EkoHRvviZAooeAEkEmwHpM7KmeMZ6ZS8`, marked
     `isDuplicateOf: 1laCOiOgBKgIdPSmLIRmnRHeu7UAxTfhm` — while `reports/README.md`
     cites a **third** id `1kkEQHYDCdr7ckB7d7xv7zssmCIkEGpU-` that appears nowhere in the
     inventory. Three ids for one 3-sample PDF.
2. **`Petrograph_MIRESL20230816_summary.xlsx` has two conflicting provenances.**
   `sources.csv` cites `1xtXI_avodVIDEyqzPANfOnjWdssdiFPR` (= inventory `#49`), but
   `extracted/xlsx/README.md` states the 23 rows were read from
   `1WoLN-IjSNCLeOxNqkBHa8S9UXbzHwloF` (twin `1s1ZUznWlsP6tvng8pfhBe-AjGNcXAQFJ`) —
   **neither is in the inventory.** Data content is not in doubt (the two extracted CSVs
   are byte-identical), but the recorded fileId is not the one that was read.
3. **Contributing files absent from `sources.csv`** (their content demonstrably reached
   the DB):
   - `41ш петрографи, минераграфийн бичиглэл.docx` — `1uDyW5O5Ij4LixvQfTtNdwZAQlAQs2y00`
     (Mongolian rock names merged into the 41 English descriptions)
   - `Петрографи минераграфийн бичиглэл. 15 ш. Иннова Минерал.docx` — `1HOaqAhH-D7Jm6CRRXwDuMw28lm7woGRK`
     (same, for the Innova 15)
   - `Petrograph_MIRESL20230816_summary (1).xlsx` — reviewed and rejected as a duplicate;
     the rejection is not recorded anywhere in the DB.
4. **Breadth:** only **27 of the 93 non-duplicate inventory entries**, and **25 of the 63
   non-duplicate `petrography_report` / `petrography_table` entries**, are represented in
   `sources.csv`. `sources.csv` is a list of what was used, not of what exists — which is
   correct in itself, but combined with §4 it means the unused two-thirds are invisible.

---

## 6. Ranked gap list

| # | Severity | Gap | Exact identifiers / fileIds | Fix |
|---|---|---|---|---|
| **G1** | **HIGH — data** | Two physically-existing thin sections described by Crawford have **no `samples.csv` row**. | `OVD003@202m`, `OVD009@178-180m` (desc `D0216`, `D0238`) | Create 2 sample rows (`OVD003@202`, `OVD009@178-180`) with `coord_source` = desurvey from collar/survey; they are drill core with known hole+depth. |
| **G2** | **HIGH — join** | Two unmatched descriptions are resolvable from evidence *already in the extraction layer*, which the build did not use. | `D0243` (`OVD021@101.5m`) → **`42027`**: the `KhanAltai vs Tony` sheet assigns Tony Crawford's identical micro-description ("An intensely altered aphyric, quite fine-grained leucogabbroic dyke(?)") to row `OVD011-101.5`. `D0310` (`OVD20-121`) → **`43251`**: `Sheet3`/bichiglel carry `OVD21-121` = tag 43251, and the report's own microphoto is captioned "21-121". | Join both with a `qa_notes` provenance string, or state explicitly in `QA_report.md` that the `KhanAltai vs Tony` corroboration was considered and rejected. |
| **G3** | **HIGH — documentation** | `QA_report.md` acknowledges **none** of the 14 whole-dataset omissions in §4. | see §4 table | Add a "Datasets identified but not ingested" section. |
| **G4** | **MEDIUM — coverage** | The entire 2022–23 Mireslab surface petrography set (10 documents) was never extracted; **65 grab/rockchip samples have 0 descriptions**. | `1jIT5Vpa…` (Report_0715_Ni), `16r0N4TE…`/docx (06.23), `1nIKqxM9…`/docx (11.04), `1sBdqf9G…` (microscope_20221012), `1PqskoIs…`+`1uyNsf1s…` (MINERALOGICAL-DESCRIPTIONS), `1DfMbUNC…`, `1UiyI5UX…`, `15hjIW8s…`, `1ip2bAQR…` (Thin and polish ×4) | Extract; these are the only source of petrographic text for the surface sample suite. |
| **G5** | **MEDIUM — coverage** | The 2023 Mireslab drill-core narrative reports were never extracted; the 23 MIRESL samples carry only summary-table fields (lithofacies / alteration / ore minerals), no descriptive text. | `106T7bR2o5_Pw1pFPEcfzml6Q9DhdnFUT` (Report20231124.docx), `1KLR39-VqsFSizHMIQk81Alv-HWZuslik` + `1TEpS_kJCBV63jULDdND8Y7DZHfoEGHFH` (Report_20230816 Part1/2), `16QAZBbGJVSkJSjXjzeO6RLW_De4LCIhH` (R_2023-21) | Extract, or state that the summary xlsx is deemed sufficient. |
| **G6** | **MEDIUM — coverage** | The Khanlab О-24 report documents (24 per-sample PDFs + 6 consolidated docs) were never opened; the 24 samples' descriptions are the master-workbook transcription only, with no way to audit against the primary source. | folder `1DBdBb9KnrdmkNTViAqC0M0wZMNWiBmX7`; `1b2NKUWu…`, `1d9YIMNE…`, `17L0euxd…`, `1bdCx_kE…`, `1jhySMOE…`, `1BVrktox…` | Extract at least the consolidated English `Petrography_mineragraphy_24 sample.pdf` as a check. |
| **G7** | **MEDIUM — coverage** | 2005 legacy dataset entirely absent and unmentioned. | folder `1SpY0E3wPZudd9e6KIC5D8SpFgfnRF2tk` (ARDH-2005-01, 18 JPG); folder `1AHFQu0eLtEZbbM-nrJFZvfu2-OUqRxid` (ARDH-2005-02, empty) | Record as out-of-scope with a reason, or ingest. |
| **G8** | **MEDIUM — provenance** | `sources.csv` cites duplicate-copy fileIds (3 rows), conflicts with the extraction READMEs on 3 fileIds, and omits 3 contributing files. | see §5 items 1–3 | Point every row at the inventory-canonical fileId; add the two MN twin DOCX files. |
| **G9** | **LOW — data loss** | Free-text field descriptions in the master grab sheet (54 of 65 rows, e.g. `YT-08` "Strong porisity sulfide, sercite alteration zone…") are dropped: `samples.csv` has no field-description column and the text appears nowhere. Rockchip descriptions survived (as `field_lithology`). | 54 rows of `Yambat_Petrographic_Master_Data__2022-2024_grab.csv` col 13 | Add a `field_description` column or emit them as descriptions. |
| **G10** | **LOW — join** | `D0089` (bichiglel `OVD015-175.5 (B)`) is joined to `42388` but should join to `42389`; `D0088`/`D0089` both landed on `42388`, while the 41-report equivalents `D0304`/`D0305` split correctly. | `D0089` → `42389` | One-line fix. |
| **G11** | **LOW — undocumented merge** | `OVD014-89.8 (A)` and `(B)` — two thin sections — are merged into the single row `42147` (4 descriptions). Documented for the analogous `BS001` 380.5/380.8 case, not for this one. | `42147` | Add a `qa_flags` note. |
| **G12** | **LOW — unverified** | Seven source tables were never opened; no evidence they add samples, but not checked. | `17GqS_Wo0T6OOEIAgiUyl6rkUgjN2Ox5Z` (2023 Drilling petrography samples), `1dRlx13-icZZl-OokbD9OfXov-mbuoP4o` (Yambat petrography samples 2024 from Core), `1PPWrYjVeLfTTgec-Qmazi_oYdYnOu3Gi` (Petrograph_2023_07_31), `1o_jgfkLe_lC4f21Uf1z3uoSmZZtfoVId` (Deejiin hoolgoonii list_ABM), `16f8S2Si…`/`1JeL0cAM…` (Grab 2022aug-2023), `1is5GE0W…` (2022aug-2023), `1XZC2MhQ…` (03Aug2022) | Open and diff sample-id sets. |
| **G13** | **LOW — unverified assumption** | The NUM "BE-3 samples" PDFs were never opened; the DB assumes the 3 NUM sections are `40763`/`40900`/`40913`. If `BE-3` denotes a different suite, 3 samples are missing. | `1JCorsOW4v8Vepb9HJlzYNDtzabENxU25`, `1POBc4Or0a4L_m33xSjb5WwJSULy7bb0X` | Open one PDF to confirm the sample numbering. |
| **G14** | **LOW — scope** | No table models the ≈330 sample photographs, including 36 petrographic + 31 mineralogical + 17 SEM-EDS microphotographs keyed by sample tag (40530–40915) — directly linkable to existing `sample_id`s. No statement that this is out of scope. | folders `1RWxR0xvK7oB4W3Onm02V7g0nXbZhd7__`, `1vxYfRpql2s06wEa8Mque7nZQfnacRx5f`, `18wma4dF7X1wNzDWqtCD8OJeV590iZxyF`, `1K_O_lMNXmuKrixMWCBnRoiqq8bEYJwAc`, `1IwyGwDBci3EeBNpOLx55QueAcWBdKsci`, `1YFeXy9WqrHp_qnDjnTCB8hhkeJQYJlaD`, `1udaP9NHDNZ7tRgc7Ck-28g7RBaiHoYAV` | Add a `sample_photos` table or an explicit scope note. |

---

## 7. What the builders got right (verified, not taken on trust)

- Every one of the 376 sample rows traces to a real extraction-layer identifier — **no invented rows**.
- Every identifier in the 18 tabular extraction sets is in the DB — **zero table-level loss**.
- The description total (451) reconciles to the byte, and each of the four exclusion
  classes (26 xref rows, 87 empty bichiglel rows, 12 empty Samples-to-Japan rows, the
  191-row `KhanAltai vs Tony` sheet, the duplicate MIRESL copy) is genuinely redundant
  or genuinely empty — checked cell-by-cell.
- The two tags the master README flagged as missing from Master All (`40904`, `47153`)
  are both present and QA-flagged.
- The 83 per-hole 2024 descriptions match the seven source files' expected counts exactly
  (14/9/13/10/16/12/9), as do the 41/15/6, 22/15/5 and 12/4 sets.
- All 26 AJC "Suggested Petro" tags, all 24 Khanlab tags `41011–41034`, all 39
  `PETRO LIST 2025` ids and all 42 phase-3 ids are present.
- The four unmatched descriptions listed in `QA_report.md` §3 are exactly the four I
  independently derived — the report does not under-state its own join failures.

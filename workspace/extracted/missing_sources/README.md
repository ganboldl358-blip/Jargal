# missing_sources — petrography sources missed by the earlier extraction passes

Oval / Yambat Ni-Cu project (Gobi-Altai, Mongolia). This folder holds per-sample petrographic and
mineragraphic records pulled from the Drive sources that the coverage audit flagged as **never extracted**.

* `samples.json` — 84 records, schema below.
* `samples.csv` — same records flattened (UTF-8 **with BOM**), `minerals` written as `mineral:pct; mineral:pct; …`.
* `build_batch1.py`, `build_batch2.py`, `make_csv.py` — the scripts that produced them (re-runnable; batch1 writes, batch2 appends).
* Raw text pulled from Drive is kept in `../../raw/missing_sources/`.

### Record schema
`source_file, source_fileId, sample_id, drillhole_id, depth, sample_type, rock_name, rock_name_original,
texture, minerals [{mineral, pct}], alteration, opaque_minerals, description_summary, analyst_or_lab, report_date`

Missing values are `null` (empty string in the CSV). Nothing is inferred into a field except where the
text of the record says so explicitly ("per ABM list", "per Table 1", etc.).

---

## 1. Sources extracted — per source

| # | Source file | fileId | Lab / analyst | Report date | Samples | ID scheme |
|---|---|---|---|---|---|---|
| 1 | `Petrographic descriptions 06.23.pdf` | `16r0N4TEldedRvrGcPM_hEvIeCsZfMA7v` | Mireslab Mongol — Undarmaa Batsaikhan; Report #004 / Order 004 | 2022-06-23 | 2 | `OV2022xx` (OV202202, OV202203); "SECTION NO 3011" |
| 2 | `Petrographic descriptions 11.04.pdf` | `1nIKqxM9CtQt3Hn62D0ExKWKdL-CAaVPq` | Mireslab Mongol — Undarmaa; Report #005 / Order 005 | 2022-11-07 | 6 | mixed: `OVF-n`, bare number `020`, `OV-nn` |
| 3 | `Report_0715_Ni.pdf` | `1jIT5VpacpQcvW1KbUty6C1EmT2PPr1Fu` | Mireslab Mongol — Jamsran Erdenebayar; Report #004 / Order 002. Sections at MUST; XRD at MiReS Lab Japan; SEM-EDS JEOL JSM 5400 + Oxford, Akita Univ. | 2022-07-15 | 2 | 4-digit lab numbers `2111`, `2107` |
| 4 | `Report_microscope_20221012.pdf` | `1sBdqf9GC7ZO_690r9rE2R6QhJe2cq54t` | Mireslab Mongol — J. Erdenebayar; Report #004 / Order 003. Sections at Geological Central Laboratory; microscopy at MUST; XRD Akita | 2022-10-12 | 8 | **`YT-nn` / `YM-nn` field numbers** (printed in Cyrillic as `ҮТ-nn`) plus `2022-01` |
| 5 | `MINERALOGICAL-DESCRIPTIONS_2023.03.25.pdf` | `1PqskoIsimAuRzmS2h6uQeKGz1cv2ZHoq` | Mireslab Mongol — Jamsran Erdenebayar; Report #001 / Order 001 | 2023-03-15 | 1 | descriptive name `2023Nisample` |
| 6 | `Thin and polish-1.docx` | `1DfMbUNC3_4pIxEMFYjDPUb3TQZ5WHzM2` | not stated (MN "Петрографи, минераграфийн бичиглэл" sheet) | not stated | 1 | `SH-nn` |
| 7 | `Thin and polish-1sh.docx` | `1UiyI5UX26_xmf4BTJIIUTL2yWWZ-FGEa` | as above | not stated | 1 | `SH-nn` |
| 8 | `Thin and polish-2sh.docx` | `15hjIW8slda5_7rpK_Hkbvake7Qq7J0pW` | as above | not stated | 2 | `SH-nn`, `SH-nn-n` |
| 9 | `Thin and polish-4.docx` | `1ip2bAQRB303SZq0R5zbY0CBuhQnA02cs` | as above | not stated | 4 | 4-digit `21xx` numbers plus a single-letter `A` |
| 10 | `BE-3 samples in English.pdf` (= *Results of Ore Petrology, Ragnarock Investment, 3 block samples*) | `1JCorsOW4v8Vepb9HJlzYNDtzabENxU25` | **L. Oyunjargal Ph.D (NUM)** | 2023-06-22 | 3 | 5-digit ABM lab tags `40763 / 40900 / 40913` |
| 11 | `Report20231124.docx` (canonical copy) | `106T7bR2o5_Pw1pFPEcfzml6Q9DhdnFUT` | Mireslab Mongol — Eng. Erdenebayar J. Ph.D, Dir. Batsumber A. M.Eng; Report #2303 / Order 008 for Innova Mineral | 2023-11-24 | 2 | 5-digit lab tags + `OVD-00n` hole + depth |
| 12 | `Report_20230816_Part1.pdf` + `Part2.pdf` | `1KLR39-VqsFSizHMIQk81Alv-HWZuslik`, `1TEpS_kJCBV63jULDdND8Y7DZHfoEGHFH` | Mireslab Mongol — same signatories; Report #2302 / Order 007 | 2023-08-16 | **23** | 5-digit lab tags `405xx–409xx` + internal Mireslab codes `OVD001–OVD023` |
| 13 | `Petrography_mineragraphy_24 sample.pdf` (Khanlab О-24 consolidated) | `17L0euxdhc6dl-FDZchKX9xKrgYgvpKS3` | not stated in document; Khanlab per ABM *Suggested Petro for the Oval 2024* | not stated | **12 new** (of 24) | section header `ӨТШ-<hole>-<depth>`; per-sample PDFs named by 5-digit tag `41011–41034` |
| 14 | `CORE PHOTO/ARDH-2005-01/4. Thin section photo` (folder) | `folder:1SpY0E3wPZudd9e6KIC5D8SpFgfnRF2tk` | none — photos only | 2005-11-09/10 (file dates) | 17 stubs | camera filenames `DSC00228–DSC00260` |

**Total: 84 records.**

---

## 2. Sources checked that produced NO new sample records

| Source | fileId | Why |
|---|---|---|
| `MINERALOGICAL-DESCRIPTIONS-NI.docx` | `1uyNsf1sdkrkh0Y9Pi8lhvYlksLJGVf55` | Read in full — **identical text** to `MINERALOGICAL-DESCRIPTIONS_2023.03.25.pdf` (source #5). The DOCX is the editable original, the PDF its print. Single sample `2023Nisample` recorded once. |
| `Petrographic descriptions 06.23.docx` (`1ea1Pic-…`), `Petrographic descriptions 11.04.docx` (`10g2-xZR-…`) | — | Same title, same folder, same report number as the PDFs already extracted; the DOCX files are 7.5 MB / 18 MB against 0.8 MB / 1.4 MB for the PDFs, i.e. the same text carrying the embedded microphotographs. Treated as the editable originals of #1 and #2 (this matches the verified DOCX/PDF pair above); **not** re-extracted. |
| `2023-06-21-3-thin-sections-english-last edition.pdf` | `14pglJESjfJevJ6NDv0HgXleE2S52m40t` | Read in full — it is the **English translation** of `2023-06-20-3 thin sections.pdf`, already extracted into `../reports/samples.json` (samples 40763 / 40900 / 40913, L. Jargal PhD, order Зах-2023/01). No new samples; it does add English rock names ("intensively altered fine-medium grained olivine-amphibole gabbro", "altered fine-medium grained biotite-amphibole gabbro", "ore mineralized altered fine-medium grained biotite subalkaline diorite") that can be merged into those three existing records. |
| `BE-3 samples in Mongolian.pdf` | `1POBc4Or0a4L_m33xSjb5WwJSULy7bb0X` | Mongolian twin of source #10; same 3 samples, same date/analyst. Not double-recorded. |
| `R_2023-21 Petrology, mineralogy - Mireslab Mongol LLC.pdf` | `16QAZBbGJVSkJSjXjzeO6RLW_De4LCIhH` | **Not a petrography report — it is the work contract** (Ажил гүйцэтгэх гэрээ R 2023/21) between Ragnarock Investment LLC (Z. Gan-Ochir) and Mireslab Mongol LLC (A. Batsumber). Useful metadata only: 26 samples ordered — 26 sample preps, 26 petrographic descriptions, 26 mineragraphic descriptions, 6 SEM-EDS; ₮9,702,000 incl. VAT; work window 2023-07-01 → 2023-08-15; samples shipped to Mineral Resource Science Laboratory, 1-4-1 Sakuragaoka, Akita, Japan. This is the contract that produced Report #2302 (`Report_20230816`, 23 sections delivered of 26 ordered). |
| `2023.08.06 2 samples` set (folder `1hQ5eM9_RhDSY_WGKF_4MaxmK_GFSGofm`) | — | Already extracted (samples **С-1 / С-2**, L. Jargal PhD, 2023-08-06) in `../reports/samples.json`. Skipped as instructed. |
| Khanlab О-24 — the other 12 samples | — | `Петрограф008.docx` (`1tw3IOr7…`) already covers OVD003-155.3, OVD005-13.4, OVD007-50.0/55.9/58.2/87.8, OVD008-27.3/39.5/40.1/60.3/88.9/90.5 (tags 41011–41013, 41024–41032) in `../reports/samples.json`. Only the 12 **OVD009** sections were missing and they are the 12 recorded here. |

---

## 3. Khanlab О-24 — the tag ↔ hole/depth mapping (verified)

The 24 per-sample PDFs (`41011.pdf … 41034.pdf`, folder `1DBdBb9KnrdmkNTViAqC0M0wZMNWiBmX7`) are page
extracts from one consolidated report; the PDF filename is the ABM 5-digit lab tag but the page header
carries only `ӨТШ-<hole>-<depth>`. The mapping was reconstructed from the row order of
`Khanlab_petrography_Samples.xlsx` and **verified at three independent points**:

* `41014.pdf` → `ӨТШ-OVD009-195.2` (read directly)
* `41033.pdf` → `ӨТШ-OVD009-149.8` (read directly)
* tags 41011–41013 and 41024–41032 → matched against the 12 already-extracted `Петрограф008.docx` records

| Tag | Hole | Depth | Status |
|---|---|---|---|
| 41011 | OVD007 | 50.0 m | already extracted |
| 41012 | OVD003 | 155.3 m | already extracted |
| 41013 | OVD008 | 40.1 m | already extracted |
| **41014** | OVD009 | 195.2 m | **new here** (verified) |
| **41015** | OVD009 | 149.5 m | **new here** |
| **41016** | OVD009 | 171.5 m | **new here** |
| **41017** | OVD009 | 161 m | **new here** |
| **41018** | OVD009 | 80.9 m *(sample sheet says 80.8 m)* | **new here** |
| **41019** | OVD009 | 17.2 m | **new here** |
| **41020** | OVD009 | 143 m | **new here** |
| **41021** | OVD009 | 126.7 m | **new here** |
| **41022** | OVD009 | 11.3 m | **new here** |
| **41023** | OVD009 | 151.6 m | **new here** |
| 41024 | OVD008 | 90.5 m | already extracted *(this row is missing from `Khanlab_petrography_Samples.xlsx`)* |
| 41025 | OVD007 | 58.2 m | already extracted |
| 41026 | OVD007 | 87.8 m | already extracted |
| 41027 | OVD005 | 13.4 m | already extracted |
| 41028 | OVD008 | 27.3 m | already extracted |
| 41029 | OVD008 | 60.3 m | already extracted |
| 41030 | OVD008 | 88.9 m | already extracted |
| 41031 | OVD007 | 55.9 m | already extracted |
| 41032 | OVD008 | 39.5 m | already extracted |
| **41033** | OVD009 | 149.8 m | **new here** (verified) |
| **41034** | OVD009 | 190.8 m | **new here** |

Note: `Khanlab_Petrograph_samples` photo folders hold 23 JPGs renamed 41011–41034 with **41016 missing**,
but all 24 description PDFs are present.

---

## 4. Mapping notes — how the surface IDs relate to the grab-sheet identifiers

**This is the key result for the 65 surface grab/rockchip samples that previously had zero descriptions.**

The grab sheet is `Yambat Petrographic Master Data.xlsx` → sheet `2022-2024 grab`
(extracted copy: `../master/Yambat_Petrographic_Master_Data__2022-2024_grab.csv`), columns
`#, Sample ID, Lab type, X, Y, Rock name`. Its rows **1–24 map one-to-one, in order, onto the surface
descriptions recorded here** — the grab sheet was evidently compiled from exactly these four 2022 reports
plus the "Thin and polish" description sheets:

| Grab row | Grab-sheet `Sample ID` | Grab-sheet `Rock name` | Record in this folder (`sample_id`) | Source |
|---|---|---|---|---|
| 1 | `YT-08` | Rhyodacite | `YT-08` | Report_microscope_20221012 |
| 2 | `YT-20` | Basalt – Andesite basalt | `YT-20` (printed `ҮТ-20`) | Report_microscope_20221012 |
| 3 | `YM-27` | Andesite porphyry | `YM-27` | Report_microscope_20221012 |
| 4 | `YM-29` | Subvolcanic Rock | `YM-29` | Report_microscope_20221012 |
| 5 | `YT-21` | Basalt – Andesite basalt | `YT-21` (printed `ҮТ-21`) | Report_microscope_20221012 |
| 6 | `YT-38` | Andesite porphyry | `YT-38` | Report_microscope_20221012 |
| 7 | `YT-40` | Tuffsandstone | `YT-40` (printed `ҮТ-40`) | Report_microscope_20221012 |
| 8 | `2021-01` | *(blank; Description = Gossan)* | **`2022-01`** ⚠ | Report_microscope_20221012 |
| 9 | `OV202202` | Altered andesite | `OV202202` | Petrographic descriptions 06.23 |
| 10 | `OV202203` | Schist or Mudstone | `OV202203` | Petrographic descriptions 06.23 |
| 11 | `OVF-1` | Quartz vein | `OVF-1` | Petrographic descriptions 11.04 |
| 12 | `OVF-2` | Quartzite | `OVF-2` | Petrographic descriptions 11.04 |
| 13 | `20` | Dacite Porphyry | **`020`** ⚠ | Petrographic descriptions 11.04 |
| 14 | `OV-40` | Intrusive Rock? | `OV-40` | Petrographic descriptions 11.04 |
| 15 | `OV-41` | mafic intrusive | `OV-41` | Petrographic descriptions 11.04 |
| 16 | `OV-51` | altered dolerite | `OV-51` | Petrographic descriptions 11.04 |
| 17 | `sh-14` | Gossan | **`SH-14`** ⚠ case | Thin and polish-1.docx |
| 18 | `sh-18` | Diorite | **`SH-18`** ⚠ case | Thin and polish-1sh.docx |
| 19 | `sh-14-1` | Diorite | **`SH-14-1`** ⚠ case | Thin and polish-2sh.docx |
| 20 | `sh-16` | Gossan | **`SH-16`** ⚠ case | Thin and polish-2sh.docx |
| 21 | `2107` | Gabbro amphybolite | `2107` | Thin and polish-4.docx |
| 22 | `2104-1` | Габбродиорит порфироор үүссэн амфиболит | `2104-1` | Thin and polish-4.docx |
| 23 | `A` | Gabbro pyroxenite | `A` | Thin and polish-4.docx |
| 24 | `2102` | Gabbrodiorite porphyry and Amphybolite | `2102` | Thin and polish-4.docx |

**Join rules for loading these into the samples table**

1. **Normalise case** before joining — the grab sheet uses lower-case `sh-14`, the description sheets use
   upper-case `SH-14`. Same for nothing else; every other ID matches byte-for-byte after case folding.
2. **Strip leading zeros** on the bare-number IDs: grab `20` = report `020` (dacite porphyry, section no. 020).
3. **`2021-01` vs `2022-01` is a year-digit typo, not two samples.** Grab row 8 has no rock name but its
   `Description` column reads *Gossan*, at 721977 E / 5144570 N; the report's `2022-01` is an *anshlif*
   (polished section, mineragraphy + XRD only) described as `Гематит-гётит-гидрогётитийн хүдэр`
   (hematite-goethite-hydrogoethite ore, i.e. gossan), and it is the only sample in that report without a
   YT/YM prefix. Treat them as the same sample; flag for a human to confirm which spelling is authoritative.
4. **Cyrillic vs Latin prefix.** `Report_microscope_20221012.pdf` prints some sample numbers with the
   Cyrillic letter **Ү** (`ҮТ-20`, `ҮТ-21`, `ҮТ-40`, `ҮТ-08`) and others with Latin **Y** (`YT-08`, `YT-38`,
   `YM-27`, `YM-29`); the report's own sample table at the front uses Latin throughout. `sample_id` in this
   folder is normalised to the Latin `YT-`/`YM-` form used by the grab sheet, and the original Cyrillic
   spelling is preserved in `sample_type`. The same report also has one figure caption typo, `YM-38` where
   the sample is `YT-38`.
5. **`YT` vs `YM` are two different field-site series** (both on the same grab sheet, with distinct
   coordinates). Do not fold them together.
6. **`2107` is ambiguous across reports.** It appears twice with different meanings:
   * grab row 21 `2107` = amphibolite after gabbro, thin section, `Thin and polish-4.docx`;
   * `Report_0715_Ni.pdf` sample `2107` = a *Ni-bearing ore* sample analysed by XRD + ore microscopy + SEM-EDS
     (nimite, chromite Cr₂O₃·NiO, chlorite-serpentine, talc, azurite, pyrite, hematite, goethite).

   The coordinates in the grab sheet (721940 / 5144536) place row 21 in the same outcrop cluster as
   `2102`, `2104-1` and `A`, so these are most likely the *same* physical sample described twice by
   different methods — but this is **not stated anywhere in the documents**. Both records are kept
   separately, keyed by `source_file`; a human should confirm before merging.
7. **Two samples do not appear on the grab sheet at all:**
   * `2111` (hematite ore, `Report_0715_Ni.pdf`) — no row in `2022-2024 grab` or `Yambat_Petrographic_Master_Data__All`;
   * `2023Nisample` (garnierite / Ni-goethite, `MINERALOGICAL-DESCRIPTIONS_2023.03.25.pdf`) — a descriptive
     placeholder, no field number given anywhere in the report.

   These two need a field/sample number supplied from an external source before they can be joined.
8. Grab rows **25–65** (`TS1–TS7`, `RC5`, `RC6`, the 5-digit tags `43113–47084`, and `CR66/CR99/CR71/CR1/CRE`)
   are **still without descriptions** — none of the sources in this batch covers them. See §6.

---

## 5. Expected match keys to the existing samples table

| Record group | Join on | Target |
|---|---|---|
| Sources 1, 2, 4, 6–9 (24 surface records) | `sample_id` case-folded, leading zeros stripped | `Yambat Petrographic Master Data.xlsx` → `2022-2024 grab`, column `Sample ID`, rows 1–24 |
| Source 3 (`2111`, `2107`) and source 5 (`2023Nisample`) | none available | unmatched — needs a field number |
| Source 10 (`40763`, `40900`, `40913`) | `sample_id` = 5-digit lab tag | `Petrograph_2023.xlsx` / `Drillhole Petrograph_2023.xlsx` `Tag`; also joins to the existing `2023-06-20-3 thin sections.pdf` records (petrography) — this batch adds the **ore-petrology / polished-block** description of the same three samples |
| Source 11 (`40763`, `40913`) | `sample_id` = tag; `drillhole_id` + `depth` also given | same tag list; supplements the same two samples with the Nov-2023 SEM-EDS/PGM work |
| Source 12 (23 records, tags `40530`–`40915`) | `sample_id` = tag → `Tag`; secondary key `drillhole_id` + `depth` | `Petrograph_2023.xlsx`, `Petrograph_MIRESL20230816_summary.xlsx`, `Drillhole Petrograph_2023.xlsx`. **These are the 23 MIRESL samples** — the summary spreadsheet already in the DB is a one-line-per-sample table; these records carry the full narrative (lithofacies, hand specimen, texture, alteration, per-mineral habit and size, SEM-EDS element data). Also joins to `Petrographic_photos_2023`, `Mineralogical_photos_2023`, `SEM-EDS_photos_2023` (PNG named `<tag>[-n].png`). |
| Source 13 (12 records, tags `41014`–`41023`, `41033`, `41034`) | `sample_id` = tag; also `drillhole_id` + `depth` | `Khanlab_petrography_Samples.xlsx` (`Interval` + `Hole_ID`; note the sheet is missing the 41024 row and writes 80.8 m for 41018's 80.9 m); `Khanlab_Petrograph_samples` photo folder |
| Source 14 (17 ARDH stubs) | none — `sample_id` is a camera filename | unmatched; `drillhole_id = ARDH-2005-01` only |

---

## 6. Not found / unreadable / still outstanding

* **`Petrography_mineragraphy_24 sample.pdf` exceeded the MCP text-return limit** on first read; the full
  91,111-character rendering was recovered to `../../raw/missing_sources/Petrography_mineragraphy_24sample.txt`
  and processed from there. Nothing was lost.
* **The three huge `.doc` files in the Khanlab folder were not opened** —
  `Петрографи, минераграфи О -24 (1).doc` (320 MB, `1b2NKUWubstTZywQjh5f9DTaSEhiUsvX6`),
  `Results_of_petrographic_mineralogical_description.doc` (250 MB, `1d9YIMNESsFNrwozfbeQz_NRxzFUfZKEj`) and
  `Eng Петрографи, минераграфи О -24.doc` (320 MB, `1jhySMOEqrfCC4za9wNHRO-z0bjGD_76y`). They are the same
  24-sample report in `.doc`/English form (the size is embedded microphotographs); the PDF used here covers
  all 24 sections, so nothing is missing — but **the English translation has not been harvested**, so all 12
  new Khanlab records carry Mongolian `description_summary` text with an English `rock_name`.
* **`ARDH-2005-01` has no petrography document.** The hole's tree contains only
  `1. Hole Location photo`, `2. Core photo`, `3. Speciment photo` and `4. Thin section photo`; there is no
  report, sheet or description anywhere under it. 18 JPGs are present, of which 17 are unique
  (`Copy of DSC00233.JPG` duplicates `DSC00233.JPG`). 17 `photo_only` stub records were emitted.
  `ARDH-2005-02`'s equivalent folder (`1AHFQu0eLtEZbbM-nrJFZvfu2-OUqRxid`) is **empty**.
* **`2111` and `2023Nisample` cannot be joined** to any sample table (see §4.7).
* **Grab-sheet rows 25–65 remain uncovered** — `TS1–TS7`, `RC5`, `RC6`, 5-digit tags
  `43113, 43122, 43123, 43125, 43141, 43144, 43146, 41154, 41155, 41160–41163, 41167–41169, 41172,
  41178–41180, 41183, 47071–47073, 47076, 47077, 47084`, and `CR66, CR99, CR71, CR1, CRE`.
  None of the sources in this audit batch describes them. The 2024 report set (`English 41 Petrographic and
  Mineragraphic description.docx`, the 15-sample Innova Mineral set, the 6-sample set) is already extracted
  into `../reports2024_2026/` and is the place to look for the `41xxx`/`43xxx`/`47xxx` tags.
* **Known ID errors carried through from the sources** (all recorded in the record text, none silently fixed):
  * `Report_20230816` body text repeats "Tag: 40902 / Depth 87.4 m" for **OVD013**, duplicating OVD011;
    Table 1 gives **40904 / 44.2 m**, which is what `sample_id` and `depth` use.
  * `Report_20230816` OVD021: Table 1 says 137.6 m, body says 137.4 m.
  * `Report_0715_Ni.pdf` SEM-EDS section refers to "samples from the Tsagaan ders occurrence" — a
    copy-paste artefact from another Mireslab report; the samples are the Oval Ni samples 2111 and 2107.
  * Khanlab 41018: section header `OVD009-80.9`, sample sheet `80.8 m`.

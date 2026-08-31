# Petrography extraction — Oval Ni-Cu project (Yambat), 2024–2026 lab reports

Extracted from the AZ9 GeoHub petrography tree on Google Drive
(`.../07_Geochemical_Sampling/06_Petrography_Mineralogy/03_2024, 04_2025, 05_2026`).
Outputs: `samples.json` (203 records), `samples.csv` (flattened; minerals as `mineral:pct; ...`).
All files identified via `/home/user/Jargal/workspace/inventory.json`; canonical copies only
(duplicates in the parallel "Mineragraphy tree/2024" folder were skipped, as flagged by `isDuplicateOf`).
The seven fileIds reserved for the other agent were not touched; none of the target files duplicated them.

## Sources (15 files, 203 sample records)

### A. 2024 drilling summary reports (62 records)

| Source | fileId | Samples | Lab / date | Notes |
|---|---|---|---|---|
| English Petrographic and Mineragraphic Descriptions. 6.docx | 1oaodEQTEk0STZ9sRQ0X9ysVSqs4arRxc | 6 | not stated | Only an English version exists as canonical; the copy in the Mineragraphy tree is a duplicate of this English file (no separate Mongolian 6-sample doc found). Sample 90.5 includes XRD (lizardite, clinochlore). |
| English Petrographic and Mineragraphic description. 15.docx (Innova Mineral) | 1H4Afka4AW1Irumg9EYs2XIw5n2rRa4Ga | 15 | Innova Mineral LLC (from file title); date not stated | Extracted from English version; Mongolian rock names merged in from the MN version (1HOaqAhH-...). Includes a duplicate slide "OVD-21-116.1 (There was 2)" counted as a separate record. |
| English 41 Petrographic and Mineragraphic description.docx | 1beJzCAEVfCiPwChYtmCDu0vhlxqy4qAV | 41 | not stated | Extracted from English version; Mongolian rock names merged in from MN version (1uDyW5O5...). Neither language version carries a lab name or date in the text. |

**Sample-ID scheme (A):** `HOLE-DEPTH` — e.g. `OVD20-60.6`, `CRSO1A-114.8`, `OVD14-95.8-95.9`
(depth in metres; occasional interval IDs and letter suffixes A/Б for two slides of one sample).
Hole spellings vary: CRS01A/CRSO1A, OVD010/OVD10, OVD011/OVD-11/OVD11, OVD015/OVD15, OVD21/OVD-21.
`drillhole_id` in the dataset is normalized (CRS01A, OVD010, OVD011, OVD14, OVD015, OVD20, OVD21, SC04).

**Holes seen (A):** CRS01A, OVD010, OVD011, OVD14, OVD015, OVD20 (41-sample report);
CRS01A, OVD11, OVD21, SC04 (Innova 15); CRS01A, OVD20 (6-sample).

### B. 2024 per-hole descriptions, holes 22–29 (83 records, all Mongolian)

| Source | fileId | Hole | Samples | Lab-number range |
|---|---|---|---|---|
| 22 р цооног зассан 14ш.docx | 1ogaE3Tl1iDtPXh9h5ZKylOqCqTS58Tvx | OVD22 | 14 | 47154–47167 |
| 23 р цооног дууссан 9ш.docx | 1Hpn_S6ZrXwAI93crIjVJlKaG6QD6qAv- | OVD23 | 9 | 47168–47176 |
| 24 р цооног зассан 13ш.docx | 1IehFzGt7P_1swflmBZWZOxwkH0alPxBT | OVD24 | 13 | 47130–47142 |
| 25 цооног 10ш.docx | 1SkGc5ogH9rFr2AUsZ353aTqoG2OFv4KJ | OVD25 | 10 | 47143–47152 |
| 26 р цооног 16 ш зассан.docx | 1RmOTmYH2cLctQR66cq2a_j8u1PhOTHMk | OVD26 | 16 | 47177, 47179–47193 (47178 absent) |
| 27 р цооног 12ш.docx | 1vPXAWelQlX_bfjQp1jOqa8xwVMsp91U6 | OVD27 | 12 | 47194–47200 then 47091–47095 |
| 28 ба 29 р цооног 9ш.docx | 1ZwejH5NIjLSqTYBmuRyl5PoCSmgAdsMR | OVD28, OVD29 | 6 + 3 | 47096–47100, OVD028-38; OVD29 samples have no 47xxx numbers |

Total = 14+9+13+10+16+12+9 = 83 ✓ (matches the expected counts).

**Sample-ID scheme (B):** `OVDnn-<from>-<to> (47xxx)` — depth interval in metres plus a 5-digit
geochem/lab sample number in parentheses (471xx/470xx series). The 47xxx numbers match the scanned
hand-specimen photo series in `ymb_2024_Scanned_Drilling_Petrography_samples_from_Core_Photo`.
No analyst/lab or report date is stated in any per-hole file. All are ӨТШ (polished thin sections).

Highlights: massive-sulfide ore samples OVD26-104.9-105.1 (47188) and OVD26-105.4-105.6 (47191);
massive pyrrhotite-chalcopyrite-millerite ore with possible Pt/Ag grains at OVD27-99-100 (47091);
arsenopyrite occurrences at OVD25 (47151) and OVD29-129.4.

### C. 2025 (42 records)

| Source | fileId | Samples | Lab / date |
|---|---|---|---|
| 15ш пет-мин бичиглэл. 09.02.docx | 17UhBmihR8HYhLMbUo0qz-myjvxNi7G6y | 15 (2 petrography-only + 13 petro-minera) | not stated; 2025-09-02 inferred from file name |
| 5 петрографи баттерей (2).docx | 1JSiTRfddzTDCi4VRso_BGmQKA_S6WVB7 | 5 (petrography only) | not stated |
| Report_ABM 2025.09.09 final.pdf | 1el3ET8WvDjbohD0oJyQJ1CU4Lo7h-0-Z | 22 | **MUST (ШУТИС) Mineral Resource Research professor team** — B.Enkhjargal, T.Oyunchimeg, N.Bolorchimeg, B.Altanzul (all PhD); client "Ragnarok Investment LLC"; samples received 2025-08-10, results **2025-09-09**; microscopy (NIKON-50i) + SEM-EDX (HITACHI TM-1000, MUST–Nagoya Univ. joint centre); 196 pp |

**Sample-ID scheme (C):** bare 5-digit lab numbers (40340–43816 in the 15ш doc; 43460–43515 in the
5-sample doc; 41508–46592 in the MUST report). Drillhole/depth are NOT stated except one sample:
`43816 = OVD-009-126.6 м`. The MUST report says samples are drill-core derived but gives no hole IDs.
The 41xxx/43xxx/46xxx series continues the project-wide geochem numbering.

MUST-report key findings (per sample in the records): heazlewoodite + isoferroplatinum (46459),
platinum in several ultramafics (46545, 46564, 46592, 46342), Cr-bearing magnetite (46545, 46564, 41546),
millerite (46451, 46592), Ag-bearing pentlandite point analysis (46489), rare galena in wehrlite (46545);
rock spectrum: wehrlite/websterite/peridotite/picrite → olivine gabbro/gabbronorite → diorite →
volcanics (andesite, tuff, diabase, rhyolite porphyry) → metasomatites/hornfels.
Note: the read text representation of the PDF did not include page-level table figures; two samples
have minor table gaps in the source itself (41330 lacks main-mineral percentages).

### D. 2026 (16 records)

| Source | fileId | Samples | Notes |
|---|---|---|---|
| BayanSair_Drilling Sample Petrography_12 Sample.docx | 1XSM2M96NX3-UdzGe8csb3RF95jqecbOD | 12 | Hole **BS001**, depths 111.5–510.2 m, lab numbers 456xx. ID scheme `BS001-<depth> (456xx)`. Rock types: altered diorite porphyry, gabbrodiorite porphyry, pyritized argillite; report's own conclusion: weak propylitic + phyllic alteration, minor sulfides, possibly margin/top of a porphyry system. |
| MS3_Outcrop Sample_Петрографи-минераграфи 4ш.docx | 1pdeSCucBLmStH5nrRrOUaMwXzr_KpQK- | 4 | MS3 outcrop samples 46808/46810/46811/46812; no coordinates in doc. Gabbrodiorites + spotted meta-siltstone; oxide-dominant (magnetite-hematite-goethite) mineralisation. |

## Overlap analysis

- **6-sample report ⊂ 41-sample report.** All six samples (OVD20-60.6, CRSO1A-61.3, -81.1, -90.5,
  -104.4, -111.8) reappear in the 41-sample report with lightly re-edited text and slightly different
  mineral percentages (e.g. CRSO1A-81.1 pyrite 5-8% in the 41-report vs 1-3% in the 6-report;
  81.1 spinel/serpentine splits differ). Both versions are kept as separate records — treat the
  41-report as the later, consolidated edition.
- **Innova 15 vs 41-sample report: no shared samples.** Sets are disjoint (Innova covers CRS01A-41.4/53.4,
  OVD11-101.5, OVD21, SC04; the 41-report covers CRS01A-61.3…188.4, OVD010, OVD011, OVD14, OVD015, OVD20).
  However the 41-report text repeatedly references "samples 41.4 and 53.4" (Innova samples), so the same
  analyst wrote both. Caution: **OVD15-116.1 (41-report) and OVD-21-116.1 (Innova) are different samples**
  despite identical depth numbers.
- **Per-hole files (holes 22–29) vs the 41/15/6 reports: no overlap** — entirely different holes
  (OVD22–OVD29 vs CRS01A/OVD010-21/SC04). The per-hole docs are a separate 2024 campaign batch.
- **2025 files:** the three sources are mutually disjoint by sample number (MUST report 41508–46592;
  15ш doc 40340–43816; 5-sample doc 43460–43515 — no shared numbers).
- **2026:** no overlap with anything else (BS001 and MS3 46808–46812 series are unique).

## Quality notes

- **Language:** group A extracted from English versions (Mongolian rock names merged from MN twins);
  groups B–D are Mongolian originals — English `rock_name` values there are my translations,
  `rock_name_original` preserves the source wording.
- **Metadata gaps:** none of the 2024 docs state lab, analyst, or date anywhere in their text.
  Only the 2025 MUST report has full lab metadata. The Innova attribution for the 15-sample report
  comes solely from its file name.
- **ID inconsistencies flagged inside records:** OVD20-121 vs microphoto "21-121" (41-report);
  OVD22.9-25 missing hole number (hole-28 file, restored as OVD28); BS001-111.5 lab number
  45616 vs 45621 in the report summary; BS001-380.8 shares printed number 45652 with 380.5
  (summary suggests 45653); hole-25 sample 47148 has no depth interval given at all;
  hole-26 sample 47178 is skipped in the source; 41-report table for OVD14-89.8A says
  "altered pyroxene" where the narrative describes plagioclase.
- **Percent values** are kept as printed (ranges "30-35", "trace", "rare", "few" = цөөн,
  "single grains" = ганц нэг); the mineral tables mix rock-forming, ore and secondary minerals —
  the `minerals` list follows the table, `alteration` lists secondary/alteration phases,
  `opaque_minerals` summarizes ore mineralogy and paragenesis.
- **Coverage:** every per-sample block in every file was read in full (large files were downloaded
  as text representations and read chunk-by-chunk; the 38 MB PDF text layer came through cleanly).
  Photo-only content (microphotos, SEM spectra images) is inherently not extractable from the text
  representation; captions and EDS weight-% tables were used where present.

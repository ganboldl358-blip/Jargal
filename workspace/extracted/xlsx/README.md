# Petrography Excel extractions — Oval Ni-Cu project (Mongolia)

Extracted 2026-08-31 from three Google Drive xlsx files (owner ganboldl358@gmail.com).
All content is English; no Mongolian Cyrillic was present. Original spellings/typos are
preserved verbatim (e.g. "oxidazed", "cu enchired", "Origine", "Unknow mineral",
"orthoperoxene", "Gothite", "meduim"). Each workbook has exactly one sheet.

**Retrieval note:** the sandbox proxy blocks direct download from drive.google.com and the
base64 MCP download channel corrupted binary transfers, so cell values were extracted via
the Drive `read_file_content` API (full-fidelity text rendering of each sheet). The .xlsx
files under `../../raw/` are rebuilt from these values — cell-value-faithful, not
byte-identical to the Drive originals (see `../../raw/NOTE.txt`). Extraction was
cross-validated: the 5 columns shared between the two workbooks (Tag, depth, hole id,
Mineralization, Rock type) match exactly for all 23 common samples, and the MIRESL summary
tag set is exactly the set of "Mireslab" rows in the 2023 workbook.

---

## 1. `Drillhole Petrograph_2023__Sheet1.csv`

- Source: **Drillhole Petrograph_2023.xlsx** (fileId `1gUTrLiQm_mVlDuPpeIpjaHLlXvxgYHvl`, modified 2024-05-15), sheet **Sheet1**.
- **50 data rows** + 1 header row. Original sheet row 1 was a decorative title
  ("Petrography description of Oval") spanning the header — dropped from the CSV.
- Content: master register of drill-core petrography samples from the Oval project,
  combining determinations from three sources: **Mireslab** (23 rows), **Khanlab**
  (24 rows), **Oyunjargal** (3 rows, in-house geologist).
- Columns (8):

| Column | Role |
|---|---|
| `Tag` | **Sample ID** (5-digit sample tag number, 40530–41034; unique) |
| `depth` | **Depth, point sample** — text like `36m` / `157.5m` (metres downhole; no from/to intervals) |
| `hole id` | **Drillhole ID** (`OVD-001` … `OVD-009`) |
| `Mineralization` | Mineralization style note (disseminate, semi-massive, pyrite, gossan, "cu enchired, malachite", …; often blank) |
| `Rock type` | Field/log **rock name** (gabbro, schist, gossan, spotted, …) |
| `SEM-EDS` | Flag `eds` if SEM-EDS analysis done (else blank) |
| `Lab` | Analysing lab/person: Mireslab / Khanlab / Oyunjargal |
| `Petrographic determination` | Final petrographic **rock name / description** |

- No coordinates, no alteration column, no mineral-list column in this workbook.

## 2. `Petrograph_MIRESL20230816_summary__Summary Table.csv`

- Source: **Petrograph_MIRESL20230816_summary.xlsx** (fileId `1WoLN-IjSNCLeOxNqkBHa8S9UXbzHwloF`, modified 2023-08-17), sheet **Summary Table**.
- **23 data rows** + 1 header row. Original sheet row 1 was a banner row with "MIRESL"
  above column F — dropped from the CSV.
- Content: MIRESL laboratory petrography summary (2023-08-16 report) — the detailed
  results behind the 23 Mireslab rows of workbook 1, adding lithofacies, alteration and
  ore-mineralogy detail.
- Columns (13):

| Column | Role |
|---|---|
| `Tag` | **Sample ID** (same tag numbers as workbook 1) |
| `depth` | **Depth, point sample** (`36m` style) |
| `hole id` | **Drillhole ID** (`OVD-001` … `OVD-009`) |
| `Mineralization` | Mineralization style note |
| `Rock type` | Field/log **rock name** |
| `Code` | MIRESL internal sample code `OVD001`–`OVD023` (NOT a hole ID — see data-quality note) |
| `Lithofacies` | Petrographic **rock name** (lab determination) |
| `Alteration` | **Alteration intensity** (Weak / Middle / Partly strong / Strong / Not alt.) |
| `Alteration minerals` | **Alteration mineral** list (sericite, chlorite, calcite, …) |
| `EDS-SEM` | Flag `O` if EDS-SEM done |
| `Ore mineral` | **Ore mineral** list (chalcopyrite, pentlandite, Ni-bearing pyrite/pyrrhotite, …) |
| `Unknow mineral` | Unidentified phases (Ag-Te, Ag-Te-Bi, Ag-Au, As-Ag-Te minerals, …) |
| `Another opaque and mineralization related minerals` | Other opaques (hematite, ilmenite, magnetite, goethite, veinlets) |

- Rock **description** beyond the name is spread across Lithofacies/Alteration/mineral columns; no coordinates.

## 3. `Petrograph_MIRESL20230816_summary (1)__Summary Table.csv`

- Source: **Petrograph_MIRESL20230816_summary (1).xlsx** (fileId `1s1ZUznWlsP6tvng8pfhBe-AjGNcXAQFJ`, modified 2023-08-17, ~50 min after #2).
- **Diff result: cell-for-cell IDENTICAL to #2** (extracted CSVs are byte-identical;
  Drive text renderings identical). Neither is a superset — it is a plain duplicate
  (Drive "(1)" copy stored in a different folder). The Drive file sizes differ
  (22,695 B vs 19,985 B) only because of formatting/re-save differences, not data.
  For consolidation, use #2 and ignore #3.

---

## Cross-file relationships

- Summary tag set (23) == workbook 1 rows with Lab = Mireslab (23). Workbook 1 additionally
  holds 24 Khanlab rows (tags 41011–41034, mostly OVD-007/008/009) and 3 Oyunjargal rows
  (40763, 40900, 40913).
- Samples per hole (workbook 1): OVD-001: 8, OVD-002: 8, OVD-003: 2, OVD-004: 3,
  OVD-005: 4, OVD-007: 5, OVD-008: 7, OVD-009: 13. **No OVD-006 sample in any file.**

## Data-quality issues

1. **Depth stored as text with unit** (`36m`, `7.15m`); one inconsistent value: tag
   `40715` has depth `98.2` (no `m`), in both workbooks. Strip the `m` and cast to float
   for consolidation. Point depths only — no from/to intervals.
2. **No coordinates** in any file; join to collar table via `hole id`.
3. **Hole-ID vs sample-code confusion risk**: summary column `Code` uses `OVD001…OVD023`
   (MIRESL sample codes) while `hole id` uses `OVD-001…OVD-009` — same prefix, different
   meaning. Do not merge on the wrong one.
4. Hole IDs themselves are internally consistent (`OVD-0##` everywhere; no `OVD1`/`OVD 1`
   variants).
5. Tag `40904` (OVD-002, 44.2m) has an **empty Petrographic determination** in workbook 1
   (its lab result exists in the MIRESL summary as code OVD013).
6. Trailing spaces inside some cell values preserved from source (`weakly mineralized `,
   `spotted/Schist `, `Strong altered diabase `, `Pelitic rock `).
7. Uncertainty markers in source kept verbatim: `spotted???`, `schist?`, `Heideite (?)`,
   `(Peridotite?)`.
8. English typos preserved: `oxidazed`, `cu enchired` (= Cu enriched), `Origine`,
   `Unknow mineral`, `orthoperoxene`, `Gothite`, `meduim`, `identification`.
9. Workbook 1 mixes determinations from three labs with different naming styles
   (e.g. Mireslab "Amphibole micro-gabbro" vs Khanlab "Porphyritic fine grained
   pyroxene-hornblende gabbro"); harmonize before statistics.

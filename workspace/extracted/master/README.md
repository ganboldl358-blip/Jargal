# Extracted MASTER tables — Oval Ni-Cu (Yambat) petrography consolidation

Source files downloaded from Google Drive to `/home/user/Jargal/workspace/raw/master/` on 2026-08-31.
Every sheet of every workbook was exported to UTF-8 CSV (`<workbook>__<sheet>.csv`, BOM included so Excel opens Cyrillic correctly). Merged cells were filled with the top-left value; many tables have a 2-row header (grouped label on row 1, detail label on row 2).

---

## 1. Yambat Petrographic Master Data.xlsx  (fileId 1lG0hZDsnslLbezFCw34bx6f_bZn3YJ4w, modified 2026-04-01) — THE MASTER

5 sheets:

### `Yambat_Petrographic_Master_Data__All.csv` — the master petrography sample table
- 306 CSV rows = 2 header rows + 282 data rows (+22 empty formatting rows). **280 rows carry a SAMPLE_ID (278 unique — duplicated ids: 42808, 45652)**; 2 rows (SC04-168.3, SC04-171/280.7) have interval but no id.
- 107 columns: `#, Drillhole, X, Y, Sample interval (from), Sample interval (label), SAMPLE_ID, Petrographer, Өнгөлгөө (polishing), Year`, then 7 analysis flags (`Polished thin section` 205×, `Thin section` 22×, `ASD` 12×, `XRD` 1×, `Fluid inclusion` 13×, `EDS` 8×, `EPMA` 0×), `Field Lithology, New Lithology by Petrography, New Lithology by iOGAS, Cr/V, Sr/Rb`, then assays: PGM-ICP27 (Au/Pt/Pd), ME-ICP61 33-element suite, trace/REE add-ons (Se…Ge PPM), and XRF oxide suite (Al2O3 %…ZnO %).
- Coverage: **Years 2023 (49), 2024 (138), 2025 (93)**. Labs/petrographers: Altantsetseg 162, SHUTIS (MUST) 42, MIRES 22, NUM 3, blank 75. 40 drillholes (OVD001–OVD050, SC01–SC11 subset, CRS01A–CRS03, BS001). Numeric tag range 40530–47200 plus 4 hole-depth ids (OVD028-38, OVD029-4, OVD029-122.4, OVD029-129.4).
- **What it consolidates:** all 24 Khanlab tags 41011–41034 present; all 26 Suggested-Petro-2024 (Tony/AJC) tags present; all 39 PETRO LIST 2025 tags present; all 42 phase-3 2025 tags present; 25 of 26 Petrograph_2023 tags present.
- **What looks missing:**
  - Tag **40904** (in Petrograph_2023 list and the bichiglel table) and tag **47153** (bichiglel / Samples-to-Japan) are absent.
  - The entire **2024 hole-depth-labelled core sample series (56 samples, Sheet3 of the Core & grab workbook)** — `CRS01A-41.4 … SC04-…` from holes CRS01A, OVD010, OVD011, OVD014, OVD015, OVD020, OVD21(=OVD021), SC04 — 0 of 56 are in `All` (only four OVD028/OVD029 hole-depth ids made it in).
  - **Grab samples (65, YT-xx/YM-xx)** and **2024 Copper Ridge rockchips (32, tags 43113–43154)** are held in separate sheets of this workbook, not merged into `All`.
  - `All` contains no petrographic micro-description text — descriptions live in the Core & grab workbook (`Petrography bichiglel table`, `KhanAltai vs Tony`, `Samples to Japan`).
  - EPMA flag never used; `Azim (UTM)`-style location columns are just collar X/Y (no depth-corrected 3D coords).

### `…__Collar.csv` — 68 holes; cols `No, Hole id, east, North, Elev, Azi, Dip, Depth, Project`. A snapshot of Collar_all_combined **missing 8 holes**: MU2501, MU2502, OVD008a, OVD011E, OVD013A, OVD013E, OVD030A, SC02.
### `…__Survey.csv` — 1784 data rows, 68 holes; cols `No, Hole ID, Depth, Dip, Azimuth`.
### `…__2024_Copper_ridge_rockchip_samp.csv` — 32 rockchip samples (tags 43113–43154), analysis flags + New Lithology + sugar (cube) prep columns.
### `…__2022-2024_grab.csv` — 65 grab samples (`YT-xx`, `YM-xx`), Lab type (petrography 63, petro/xrd 2), X/Y, rock name, analysis flags, description.

---

## 2. Yambat petrography samples 2022-2024 from Core & grab.xlsx  (1y25l1orJYDXQjXNupiht93Wg7Tr17Ste, modified 2026-02-07)

10 sheets (the working/QA workbook behind the master):

| Sheet | CSV | Data rows | Content |
|---|---|---|---|
| 2022-2024 grab | `…__2022-2024_grab.csv` | 65 | identical copy of master grab sheet |
| 2024 Copper ridge rockchip samp | `…__2024_Copper_ridge_rockchip_samp.csv` | 32 | identical copy of master rockchip sheet |
| Petrography bichiglel table | `…__Petrography_bichiglel_table.csv` | 191 | master **description** table: Sample Number, ioGAS number, Drillhole, From/To, field lithology, Petrographer (Khanlab 24, Mireslab 23, Oyunjargal 3), analysis flags + long petrographic descriptions (107 cols). Includes the 56 hole-depth-ID samples missing from the Master `All`. |
| 2023 Phase 1 Drilling | `…__2023_Phase_1_Drilling.csv` | 90 | tags 40530–41034, 13 holes `OVD-001…OVD-009, CRS01A…` (hyphenated hole ids) |
| 2024 Phase 2 Drilling | `…__2024_Phase_2_Drilling.csv` | 84 | holes OVD022–OVD029; dual sample keys (hole-depth id `OVD027-99` + tag 47091–47200) |
| 2025 phase 3 drilling | `…__2025_phase_3_drilling.csv` | 42 | Mongolian headers (Цооногийн дугаар, Дээжийн дугаар…); holes OVD030–OVD040, SC06, SC07, CRS02, CRS03; tags 41504–46592 |
| Sheet3 | `…__Sheet3.csv` | 56 | the 2024 hole-depth sample list (CRS01A, OVD010, OVD011, OVD014, OVD015, OVD020, **OVD21** [sic], SC04) |
| KhanAltai vs Tony | `…__KhanAltai_vs_Tony.csv` | 191 | same 191 samples, lithology comparison KhanAltai lab vs Tony Christie (109 cols) |
| Samples to Japan | `…__Samples_to_Japan.csv` | 20 | subset sent to Japan (fluid inclusion / sulphur / EPMA) with micro-descriptions |
| All Petro samples with XRF-Mult | `…__All_Petro_samples_with_XRF-Mult.csv` | 106 | keyed by ioGAS number, rock type + XRF oxide suite |

---

## 3. Khanlab_petrography_Samples.xlsx  (1W3XRRKAl-s3UAJY9ZpEal1rZjToOw0uh)
`Khanlab_petrography_Samples__Sheet1.csv` — 23 sample rows (+5 repeated verification rows with extra Ag/S %/Te columns). Keyed by **Interval + Hole_ID** (`50m / OVD-007` — hyphenated ids, holes OVD-003, -005, -007, -008, -009), Rock Type (all Gabbro), then 84 assay columns (Au/Pd/Pt PPB, ME suite, oxides). **The file itself carries no 41011–41034 tag numbers** — the hole/depth pairs are the link; all 24 tags are already present in the Master `All` sheet.

## 4. PETRO LIST 2025.xlsx  (1X95MBGNX1QTlsDtQ26fcaXHIJIecNO1O, newest version 2025-12-08)
`PETRO_LIST_2025__Sheet1.csv` — 39 samples: `No, Sample id, holeid, interval m, Package id (Batch 1/2), Lithology, Year, Drilling phase`. A 39-of-42 subset of the 2025 phase-3 sheet; all in Master `All`.

## 5. Petrograph_2023.xlsx  (1hLNU5HcF31MqC9LaTzQ4rn6qFQ1flvB3 — v3, modified 2025-01-06)
`Petrograph_2023__Sheet1.csv` — 26 samples, tags 40530–40915: `Tag, depth, hole id (OVD-001…OVD-009), Mineralization, Rock type, SEM-EDS` + lab column (MUIS). Tag **40904 missing from the Master `All`**.

## 6. Suggested Petro for the Oval 2024.xlsx  (1bR-8vDiTDOcK4RclatPAGfHOIj-Y7Rct, AJC / Tony Christie)
`Suggested_Petro_for_the_Oval_2024__Sheet1.csv` — 26 suggested samples: `Tag, depth, hole id, Mineralization, Rock type, SEM-EDS (report/pdf ref), reviewer (Oyunjargal)`. Mixed hole-id spellings in one column (`OVD-009` and `OVD009`). All 26 tags are in Master `All`.

---

## 7. Collar_all_combined.csv  (1MxtDUzpvCtD9Nbi9IODl8EmXQOLCgvh2, 2025-12-01)
- **76 holes**, 21 columns: `PROJECT, PROSPECT, HOLE_ID, Hole_TYPE (all DD), ORIG_EAST, ORIG_NORTH, ORIG_RL, Azimuth, Dip, Starting depth, Drilled depth, Total drilled depth, Start/End date, DH statuus, LEASE, COMPANY, SUPERVISOR, DH closed and sealed, REMARKS, Edited date`.
- Projects: YMBT 73, Maihan Ulaan 2, BS 1. Prospects: OVAL / North Oval / DISCOVERY / SOUTH / Central / MS1 / MS2 / Copper Ridge / Maihan Ulaan / Bayansair.
- **Hole-ID pattern: `OVD###` (OVD001–OVD052, with re-entry suffixes OVD008a, OVD011E, OVD013A, OVD013E, OVD030A), `SC01–SC11`, `CRS01–CRS04` (+CRS01A), `MU2501/MU2502`, `BS001`** — NOT the `OVDD24_022` style.
- Total depths 5.9–525.7 m; extension holes have non-zero `Starting depth` (e.g. OVD030A 300.5→459.5). Dates 2023-07 → 2025-11; statuses Completed / Not accepted (CRS01, OVD013A, SC02) / Ongoing (OVD050). Leases XV-20515 (+XV-20516…XV-20524 for 2023 holes), MV-019681 (MU), XV-23028 (BS).
- **CRS:** not stated in the collar file itself, but the companion survey file declares `Grid (Orig) = WGS84_46N` → **WGS84 / UTM zone 46N (EPSG:32646)**; eastings 714,615–727,787, northings 5,138,590–5,150,808 are consistent with that.
- Data typo: MU2502 End date `10/14/225`.

## 8. Survey_all_YMB.csv  (1fqyguCqRGnMgmuTm8pJbuPPmFTo3OMf0, 2025-12-01)
- 1,990 downhole survey rows, **76 holes** (matches collar). Columns: `HOLE_ID, Depth (m), Dip, Azim (Orig), Grid (Orig) [= WGS84_46N throughout], Azim (UTM) [empty], SURVEY METHOD (GM 1574, GY 193, MS 133, Ez-trac/Multi-shot 34, blank 56), DH SURVEY COMPANY, SURVEY DATE`.
- Depths 0–525.7 m. **Case mismatch: collar `OVD008a` vs survey `OVD008A`.**

---

## Foreseeable hole-ID join issues (petrography ↔ collar)
1. **Hyphenated ids** in 2023-era tables: `OVD-001`, `OVD-007` (Petrograph_2023, Khanlab, 2023 Phase 1, bichiglel, KhanAltai vs Tony) vs collar `OVD001`. Strip the hyphen to join.
2. **`OVD21`** (Sheet3 and Samples-to-Japan ids `OVD21-42.3`) = `OVD021` — missing zero-padding.
3. **Case**: `OVD008a` (collar) vs `OVD008A` (survey/master usage) — use case-insensitive keys.
4. **Mixed spellings inside one file**: Suggested Petro 2024 has both `OVD-009` and `OVD009`.
5. Master workbook's own Collar/Survey sheets are stale (68 holes) — 8 holes short of Collar_all_combined (MU2501, MU2502, OVD008a, OVD011E, OVD013A, OVD013E, OVD030A, SC02); use Collar_all_combined/Survey_all_YMB as the location authority.
6. Hole-depth sample ids (`CRS01A-41.4`, `OVD027-99`) embed the hole id and a depth — parse on the last `-` (beware `OVD014-89.8 (A)/(B)` duplicates and the two-sample cell `SC04-171, SC04-280.7`).

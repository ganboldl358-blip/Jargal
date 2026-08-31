# Oval Ni-Cu (Yambat) — Consolidated Petrography Database (v1.1)

Built from the Google Drive petrography/drilling sources of the AZ9 GeoHub
by `scripts/build_database.py`. One row per **physical sample** in `samples`,
one row per **petrographic description** in `descriptions` (a sample can have
several descriptions: Mongolian lab report, Crawford 2025, MIRESL 2023, ...).

- CRS of all coordinates: **WGS84 / UTM zone 46N (EPSG:32646)**
- Files: `csv/*.csv` (UTF-8 with BOM — opens correctly in Excel),
  `Oval_Petrography_DB.xlsx`, `Oval_Petrography_DB.sqlite`, `QA_report.md`.

## Contents (v1.1, built 2026-08-31)

| table | rows | what it is |
|---|---|---|
| `samples` | 395 | physical samples (the spine) |
| `descriptions` | 572 | petrographic / mineragraphic descriptions |
| `collar` | 76 | drillhole collars |
| `survey` | 1990 | downhole survey stations |
| `sample_assays` | 277 | wide assay suite from the Master "All" sheet |
| `lu_hole_alias` | 101 | raw hole-id spelling → normalized id |
| `lu_lab` | 31 | lab / petrographer lookup |
| `lu_rock_type` | 704 | every distinct rock name → group / family |
| `sources` | 48 | contributing files with Drive fileIds |

- **343 of 395** samples (86.8 %) carry
  coordinates — 285 desurveyed in 3-D (x, y, z), 58 with
  surface X/Y only, 52 with none.
- **569 of 572**
  (99.5 %) descriptions
  are joined to a sample; 3 cannot be (see `QA_report.md` §11).
- v1.1 fixes every defect raised by the two independent audits
  (`VERIFICATION_integrity.md`, `VERIFICATION_coverage.md`) and merges the
  `missing_sources` batch. Changelog: `QA_report.md` §12.

## Re-running

```bash
pip install pandas openpyxl
python3 scripts/build_database.py
```

Inputs are read from `workspace/extracted/` (master/, xlsx/, reports/,
reports2024_2026/, missing_sources/). Outputs are rewritten under `database/`.
The build is deterministic — two consecutive runs produce byte-identical CSVs,
SQLite, XLSX and Markdown — and it aborts with an `AssertionError` if any of
the invariants listed in `QA_report.md` §0 is broken.

## Tables

### samples.csv — дээжийн бүртгэл (one row per physical sample)

| column | meaning (EN) | тайлбар (MN) |
|---|---|---|
| sample_id | canonical id: 5-digit lab tag when known, else `HOLE@DEPTH` composite | дээжийн дугаар (шошго) |
| alt_ids | other ids used in sources (`CRS01A-81`, shared tags), `\|`-separated | бусад дугаарууд |
| hole_id_norm | normalized drillhole id (join key to collar/survey) | цооногийн дугаар |
| depth_from_m / depth_to_m / depth_mid_m | sample interval and midpoint, metres downhole | дээжийн интервал, гүн (м) |
| sample_source | drill core / grab / rockchip / outcrop / unknown | дээжийн төрөл |
| year | sampling/analysis year from the master table | он |
| petrographer_lab | petrographer or lab from the master table | шинжээч / лаборатори |
| thin_section, polished_thin_section, asd, xrd, eds, fluid_incl, epma | analysis flags (1/0) | шинжилгээний төрлүүд (ТШ=thin section, ӨТШ=polished thin section) |
| field_lithology | geologist's core-log rock name | хээрийн чулуулгийн нэр |
| petro_lithology | rock name after petrography ("New Lithology by Petrographic") | петрографийн дараах нэр |
| iogas_lithology | rock name after ioGAS lithogeochemistry | iOGAS ангилал |
| rock_group | standardized rock group (see lu_rock_type) | нэгдсэн бүлэг |
| iogas_no | ioGAS sample number (from the bichiglel table) | ioGAS дугаар |
| x_utm, y_utm, z_rl | 3D position at depth_mid_m (WGS84 / UTM zone 46N (EPSG:32646)) | байрлал (X, Y, Z) |
| coord_source | desurvey / master_xy / none | координатын эх үүсвэр |
| qa_flags | data-quality flags for this sample | чанарын тэмдэглэл |
| source_files | contributing source files | эх файлууд |

### descriptions.csv — петрографийн бичиглэлүүд

| column | meaning |
|---|---|
| sample_id | canonical sample (empty when the description could not be joined) |
| desc_id | unique description id (D0001...) |
| raw_sample_id / raw_hole_id / raw_depth | ids exactly as written in the source |
| source_file | report / sheet the description comes from |
| analyst_or_lab, report_date | who described it and when (blank when not stated) |
| language | mn / en |
| rock_name | rock name (English where available) |
| rock_name_original | original (usually Mongolian) rock name |
| texture | texture / structure notes |
| minerals_json | mineral list as JSON (`[{"mineral":..., "pct":...}]` or `{"rock_forming": "Pl, Amph"}`) |
| alteration | alteration minerals / intensity |
| opaque_minerals | ore/opaque mineralogy and paragenesis |
| description_text | free-text description / summary |
| join_method | tag / label / hole+depth / hole+depth+suffix / report id / grab sheet id / grab sheet row / xref-corrected / unmatched |
| qa_notes | join or source-quality notes (Crawford caveats, A/B-suffix inferences, interval disagreements, id corrections) |

`join_method` values added in v1.1: **`grab sheet row`** (a field description
recovered from the master grab sheet), **`grab sheet id`** (a 2022–23 surface
lab description matched to a grab row after case folding / leading-zero
stripping) and **`xref-corrected`** (a source id typo corrected against
independent evidence — see `QA_report.md` §10 G2).

### collar.csv / survey.csv

Normalized copies of `Collar_all_combined` (76 holes) and `Survey_all_YMB`
(downhole surveys). `hole_id` is normalized (`OVD008a`->`OVD008A`);
raw spelling kept in `hole_id_raw`. Depths in metres; dips negative-down;
azimuths are grid azimuths (WGS84_46N). `survey.qa_note` (new in v1.1) carries
station-level warnings — currently the duplicate-station conflict below.

### sample_assays.csv

Wide assay suite carried over verbatim from the Master "All" sheet, keyed by
`sample_id`. Column names are `Element_unit__Method` (e.g. `Ni_ppm__ME_ICP61`,
`Au_ppm__PGM_ICP27`, `MgO_pct__ME_XRF26`). Values are as printed in the master
(no unit conversion); `-` placeholders were blanked.

### Lookups

- `lu_hole_alias.csv` — every raw hole-id spelling seen anywhere -> normalized id.
- `lu_lab.csv` — raw lab/petrographer strings -> canonical lab.
- `lu_rock_type.csv` — **every** distinct rock name across
  `samples.field_lithology` / `petro_lithology` / `iogas_lithology` and
  `descriptions.rock_name` / `rock_name_original` (the Mongolian vocabulary
  included, which v1.0 omitted) -> best-effort standardized `rock_group`, a
  coarse `rock_family` (ultramafic / mafic intrusive /
  felsic-intermediate intrusive / volcanic / sedimentary / metamorphic /
  vein-ore / unknown), `n_occurrences` and `seen_in`. Originals untouched.
- `sources.csv` — contributing files with Google Drive fileIds, resolved to the
  inventory-canonical copy; `provenance_note` records any correction.

## Loading into Leapfrog / Micromine

**Drillhole database (recommended):**
1. Collar table: `csv/collar.csv` — Hole ID = `hole_id`, East = `east`,
   North = `north`, RL = `rl`, Max depth = `total_depth_m`. CRS EPSG:32646.
2. Survey table: `csv/survey.csv` — Hole ID = `hole_id`, Depth = `depth_m`,
   Azimuth = `azimuth`, Dip = `dip` (negative down).
3. Interval/points table: `csv/samples.csv` filtered to
   `sample_source = "drill core"` — Hole ID = `hole_id_norm`,
   From = `depth_from_m`, To = `depth_to_m` (use `depth_mid_m` as a point
   table where To is null). Attribute columns: `rock_group`,
   `petro_lithology`, `field_lithology`, analysis flags.
4. Assays: `csv/sample_assays.csv` joined on `sample_id` (or imported as an
   interval table on `hole_id_norm` + `depth_from_m`/`depth_to_m`).

**As points:** `samples.csv` already carries desurveyed `x_utm, y_utm, z_rl`
(minimum-curvature at `depth_mid_m`), so it can be loaded directly as a 3D
points file — filter `coord_source = "desurvey"` for true 3D positions;
`master_xy` rows (grab samples) are surface X/Y without Z.

**Descriptions** are text: join `descriptions.csv` to the loaded samples on
`sample_id` in your GIS/DB, or keep it as the reference table.

### Import notes you must read first

**1. Duplicate survey station — OVD009 @ 240.0 m.** `survey.csv` contains two
rows for this hole+depth, both verbatim from `Survey_all_YMB.csv`:

| dip | azimuth | method | company | date |
|---|---|---|---|---|
| −78.91 | 244.64 | MS | Bayan Undraga LLC | 7/28/2024 |
| −78.00 | 246.50 | Ez-trac, Multi shot | Ragnarok Investment LLC | 5/30/2023 |

Leapfrog and Micromine reject or silently resolve duplicate hole+depth survey
keys. **Recommended: keep the 2024-07-28 Bayan Undraga MS reading (−78.91 /
244.64) and delete the 2023-05-30 row.** That is the most recent instrument
survey of the hole and is the station this build's own desurvey uses, so the
imported trace will match `samples.x_utm/y_utm/z_rl` exactly. Nothing stored
depends on the choice in practice — the deepest OVD009 sample is at 195.2 m,
above both readings. Both rows carry the full explanation in `survey.qa_note`,
so you can filter with `qa_note LIKE '%drop this row%'`.

**2. OVD008A depths are measured FROM SURFACE.** OVD008A is a re-drill sharing
the OVD008 collar and `collar.start_depth_m` = 110.5 m, but its 33 survey
stations run 0 → 162.5 m **from surface**, not from the 110.5 m re-entry point.
Desurveying OVD008A @ 110.0 m and OVD008 @ 110.5 m gives positions 0.54 m
apart, which is the correct behaviour for a re-drill of the same collar. If you
add an OVD008A sample, quote its depth from surface — quoting it from the
re-entry datum would place it ~110 m too shallow. No sample in the database is
currently assigned to OVD008A.

**3. 17 samples reference hole `ARDH-2005-01`, which is NOT in `collar`.**
These are the legacy 2005 thin-section photo stubs (`qa_flags` begins
`legacy_2005_photo_only`). They have no depth and no coordinates. Filter them
out with `coord_source <> 'none'` or `hole_id_norm <> 'ARDH-2005-01'` before
building a drillhole database, otherwise the importer will report an unknown
hole. This is also why the SQLite file declares no foreign key on
`samples.hole_id_norm`.

**4. `samples.csv` as an interval table.** `depth_to_m` is null for point
samples — use `depth_mid_m` as a point table, or `COALESCE(depth_to_m,
depth_from_m)`. Every row satisfies `depth_from_m <= depth_to_m` (asserted at
build time); the one inverted interval found by the audit (47176) is corrected
and flagged.

## Provenance and caveats

See `QA_report.md` for row counts, join statistics, duplicate handling,
unmatched descriptions, the full v1.0 → v1.1 changelog (§12), the resolution of
every audit defect (§10) and — new in v1.1 — **§11 "Known missing at source"**,
which lists the datasets that exist only as a name, the ≈330 sample photographs
that no table models, and the sample suites that still have no microscope
description.

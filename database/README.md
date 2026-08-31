# Oval Ni-Cu (Yambat) — Consolidated Petrography Database

Built from the Google Drive petrography/drilling sources of the AZ9 GeoHub
by `scripts/build_database.py`. One row per **physical sample** in `samples`,
one row per **petrographic description** in `descriptions` (a sample can have
several descriptions: Mongolian lab report, Crawford 2025, MIRESL 2023, ...).

- CRS of all coordinates: **WGS84 / UTM zone 46N (EPSG:32646)**
- Files: `csv/*.csv` (UTF-8 with BOM — opens correctly in Excel),
  `Oval_Petrography_DB.xlsx`, `Oval_Petrography_DB.sqlite`, `QA_report.md`.

## Re-running

```bash
pip install pandas openpyxl
python3 scripts/build_database.py
```

Inputs are read from `workspace/extracted/` (master/, xlsx/, reports/,
reports2024_2026/). Outputs are rewritten under `database/`.

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
| join_method | tag / hole+depth / hole+depth+suffix / report id / unmatched |
| qa_notes | join or source-quality notes |

### collar.csv / survey.csv

Normalized copies of `Collar_all_combined` (76 holes) and `Survey_all_YMB`
(downhole surveys). `hole_id` is normalized (`OVD008a`->`OVD008A`);
raw spelling kept in `hole_id_raw`. Depths in metres; dips negative-down;
azimuths are grid azimuths (WGS84_46N).

### sample_assays.csv

Wide assay suite carried over verbatim from the Master "All" sheet, keyed by
`sample_id`. Column names are `Element_unit__Method` (e.g. `Ni_ppm__ME_ICP61`,
`Au_ppm__PGM_ICP27`, `MgO_pct__ME_XRF26`). Values are as printed in the master
(no unit conversion); `-` placeholders were blanked.

### Lookups

- `lu_hole_alias.csv` — every raw hole-id spelling seen anywhere -> normalized id.
- `lu_lab.csv` — raw lab/petrographer strings -> canonical lab.
- `lu_rock_type.csv` — every distinct rock name (samples + descriptions) ->
  best-effort standardized `rock_group`; originals kept untouched.
- `sources.csv` — contributing files with Google Drive fileIds.

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

## Provenance and caveats

See `QA_report.md` for row counts, join statistics, duplicate handling,
unmatched descriptions and known source issues (Crawford sample mix-up flags,
shared tag 42808, unlocated 2025 lab-number samples, etc.).

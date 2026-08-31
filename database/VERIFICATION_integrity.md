# Independent verification — Oval Petrography Database

Adversarial QA of `database/` (CSV + SQLite + XLSX) against the source-of-truth
inputs in `workspace/extracted/`. Nothing in the builder's `QA_report.md` was
taken on trust: every number below was re-derived by independently written
scripts (kept in the session scratchpad `verify/`, files `v1_counts.py` …
`v12_misc.py`), including two from-scratch desurvey implementations.

Date of verification: 2026-08-31. Verified build: commit `9b91906`.

## Verdict summary

| # | Claim | Verdict | Headline evidence |
|---|---|---|---|
| 1 | Row counts 376/451/76/1990/277; CSV = SQLite = XLSX | **PASS** | All 9 tables match on rows **and** columns; 0 differing cells across all three carriers |
| 2 | 341/376 with coords; 283 drill-core full x/y/z; 0 drill-core gaps | **PASS** | 341 / 283 / 0 reproduced exactly; also 0 samples with a collar hole + depth left un-desurveyed |
| 3 | Minimum-curvature desurvey correct (<2 m) | **PASS** | Max deviation **0.008 m** over **all 283** desurveyed samples (not just 5); two independent methods agree to 0.01 m |
| 4 | 447/451 descriptions matched; suffix + unmatched cases correct | **PASS** | 20/20 stratified re-joins agree; 0 tag/hole contradictions over all 451; all 4 unmatched confirmed unmatchable |
| 5 | No data invented; text verbatim; mineral % from source | **PASS** | 451/451 descriptions traced to a source; **0** field differences (byte-exact on 266 JSON-sourced); 23,205 assay cells, **0** differences |
| 6 | Integrity (uniqueness, FK, depth, parsing, UTF-8) | **PARTIAL** | All checks clean **except one inverted depth interval** (defect D1) |
| 7 | lu_hole_alias lands every raw spelling on a collar hole | **PASS** | 103 harvested spellings, 101 resolve via the map, 2 are annotated strings that still resolve; 0 land nowhere |

**Overall: the database is sound.** One material data defect (D1) and a small
set of documentation/completeness gaps. No evidence of fabricated content
anywhere: every text field and every assay value traced back byte-for-byte.

---

## Claim 1 — Row counts and three-carrier consistency: **PASS**

Read all nine tables from `csv/`, from `Oval_Petrography_DB.sqlite` and from
`Oval_Petrography_DB.xlsx`, and compared row counts, column counts, column
names and every cell (numeric-normalised).

| table | claimed | csv | sqlite | xlsx | cols | cell diffs vs sqlite | vs xlsx |
|---|---|---|---|---|---|---|---|
| samples | 376 | 376 | 376 | 376 | 27/27/27 | 0 | 0 |
| descriptions | 451 | 451 | 451 | 451 | 18/18/18 | 0 | 0 |
| collar | 76 | 76 | 76 | 76 | 21/21/21 | 0 | 0 |
| survey | 1990 | 1990 | 1990 | 1990 | 9/9/9 | 0 | 0 |
| sample_assays | 277 | 277 | 277 | 277 | 89/89/89 | 0 | 0 |
| lu_hole_alias | 101 | 101 | 101 | 101 | 4 | 0 | 0 |
| lu_lab | 20 | 20 | 20 | 20 | 4 | 0 | 0 |
| lu_rock_type | 473 | 473 | 473 | 473 | 3 | 0 | 0 |
| sources | 32 | 32 | 32 | 32 | 3 | 0 | 0 |

All nine CSVs carry a UTF-8 BOM as README states. SQLite affinities are correct
(REAL for depths/coordinates, INTEGER for flags, TEXT for the rest).

## Claim 2 — Coordinate coverage: **PASS**

| metric | claimed | verified |
|---|---|---|
| samples total | 376 | 376 |
| with x & y | 341 (90.7 %) | **341** |
| with x, y and z | 283 | **283** |
| `coord_source = desurvey` | 283 | **283** (all 283 have full x/y/z) |
| `coord_source = master_xy` | 58 | **58** (all have x/y, **all 58 have z null** — correct) |
| `coord_source = none` | 35 | **35** (all 35 have no coords, and **all 35 carry a `qa_flags` explanation**) |
| drill-core samples | — | 283 |
| drill-core samples whose hole is in collar | — | 283 (i.e. all) |
| …of those lacking full x/y/z | 0 | **0** |

Two additional checks the builder did not claim, both clean:
- Samples with a hole present in `collar` **and** a depth but *not* desurveyed: **0**
  (no missed desurvey opportunities hiding behind a non-"drill core" `sample_source`).
- All 58 `master_xy` X/Y values were traced back to the master grab/rockchip
  sheets: **58/58 matched to within 0.6 m; 0 mismatches, 0 unfindable.**

## Claim 3 — Desurvey correctness: **PASS** (strongest result in this audit)

I wrote **two independent desurvey implementations** from first principles and
ran them over **every** desurveyed sample, not the 5 requested:

- **(A) Minimum curvature** — Sawaryn & Thorogood form, inclination-from-vertical,
  target depth inserted as a linearly interpolated station.
- **(B) Numerical integration** — no min-curvature formula at all: 0.02 m
  trapezoid integration of the unit tangent with linearly interpolated
  dip/azimuth. This is a genuinely different algorithm, used to prove that
  agreement is not an artefact of copying the same formula.

Both start from `collar.east/north/rl` and the `survey` stations; where a hole's
first station is below surface (OVD003, first station 29 m) the first
orientation is held up to collar.

| statistic | result |
|---|---|
| desurveyed samples recomputed | **283 / 283** |
| max \|stored − my minimum curvature\| | **0.0080 m** |
| mean deviation | 0.0047 m |
| samples deviating > 0.01 m | **0** |
| samples deviating > 2 m (tolerance) | **0** |
| max \|method A − method B\| | 0.0098 m |

The 0.008 m residual is exactly what 2-decimal rounding of the stored
coordinates produces — there is no systematic bias.

### Mandated spot checks

| # | case | sample | hole @ depth | stored x, y, z | my min-curvature | Δ3D |
|---|---|---|---|---|---|---|
| 1 | expected value | 41011 | OVD007 @ 50.0 | 721995.29, 5144402.98, 1792.49 | 721995.29, 5144402.98, 1792.49 | 0.004 m |
| 2 | deep (>250 m) | 45681 | BS001 @ 509.55 | 725992.46, 5138669.80, 1251.39 | 725992.46, 5138669.80, 1251.39 | 0.005 m |
| 3 | SC hole | 44981 | SC11 @ 268.0 | 727641.85, 5142055.65, 1598.60 | 727641.85, 5142055.65, 1598.60 | 0.007 m |
| 4 | CRS hole | 42899 | CRS01A @ 81.0 | 725251.11, 5150594.08, 1914.82 | 725251.11, 5150594.08, 1914.82 | 0.006 m |
| 5 | parent of re-entry | 41028 | OVD008 @ 27.3 | 722094.79, 5144244.52, 1815.41 | 722094.79, 5144244.52, 1815.41 | 0.003 m |

Claim 1's target of "approx (721995.3, 5144403.0, 1792.5)" is met to 1 cm.
41 samples are deeper than 250 m; the deepest (509.55 m on BS001) reproduces
to 5 mm, so no drift accumulates over long traces.

**Re-entry sub-case (OVD008A): NOT TESTABLE — no sample in the database is
assigned to OVD008A** (see D10). I verified the trace itself instead: OVD008A's
survey runs 0 → 162.5 m *from surface* (not from the 110.5 m re-entry point,
despite `collar.start_depth_m = 110.5`), method A and B agree to 0.0001 m, and
OVD008 @ 110.5 m vs OVD008A @ 110.0 m land 0.54 m apart — exactly the behaviour
expected for a re-drill sharing a collar. Both interpretations are internally
consistent; the depth-datum convention should be documented (D10).

### Geometric sanity — all clean

| check | result |
|---|---|
| desurveyed points outside the collar bounding box ± 3 km | **0** (bbox E 714615–727787, N 5138590–5150808) |
| z above collar RL | **0** |
| vertical drop exceeding downhole depth (impossible geometry) | **0** |
| non-monotonic z with increasing depth on the same hole | **0** |
| samples deeper than the hole's `total_depth_m` | **0** |
| samples desurveyed beyond the last survey station (extrapolated) | **0** |
| survey rows with \|dip\| > 90° or azimuth outside [0, 360) | **0** |
| positive (up-hole) dips in collar or survey | **0** |

## Claim 4 — Description joins: **PASS**

451 descriptions, 447 with a `sample_id`, 4 blank — reproduced exactly. The
`join_method` histogram (tag 297, label 131, hole+depth 17, unmatched 4,
hole+depth+suffix 2) and the entire per-source table in `QA_report.md` §3
reproduce row-for-row.

**Whole-table independent contradiction scan (all 451 rows):**

| test | result |
|---|---|
| `raw_sample_id` contains a resolvable 5-digit lab tag but `sample_id` differs | **0** |
| joined sample's `hole_id_norm` contradicts the normalised `raw_hole_id` | **0** |
| every `descriptions.sample_id` exists in `samples` | **447/447** |
| `desc_id` unique | yes |

**Stratified random re-join (20 rows, seed 20260831)** across Crawford 2025 (3),
Mongolian/Khanlab PDFs (3), MIRESL (2), the 2024 41-report (3), per-hole
OVD22-29 docs (3), 2025 MUST (2), 2026/other English reports (2) and the master
CSV sheets (2). I re-derived each `sample_id` from the raw record using my own
rules (lab tag → `alt_ids` label → hole + depth within 0.6 m), blind to
`join_method`. **Result: 20 agreements, 0 disagreements.** Examples:

- `D0223` Crawford `OVD007@58.2m` → 41025 (mine: 41025, hole+depth)
- `D0267` `SC04-168.3` → 42807 (mine: 42807, via `alt_ids`)
- `D0257` `CRSO1A-53.4` → 42865 (mine: 42865 — confirms the `CRSO1A → CRS01A` alias)
- `D0321` `OVD22-124-126 (47164)` → 47164 (mine: 47164, embedded tag)
- `D0243`, `D0310` → blank; my rules also find no candidate

**The 2 suffix-disambiguated rows are correct as assigned:**

| desc | raw | → sample | sample `alt_ids` |
|---|---|---|---|
| D0304 | `OVD15-175.5a` | 42388 | `OVD015-175.5 (A)` |
| D0305 | `OVD15-175.5B` | 42389 | `OVD015-175.5 (B)` |

The letters line up with the master's (A)/(B) suffixes and both samples sit at
175.5 m on OVD015, so the mapping is self-consistent. It rests on letter order
alone, however — see D9.

**The 4 deliberately unmatched rows are genuinely unmatchable.** For each I
searched every sample on the normalised hole for a depth within 1 m:

| desc | raw | hole | samples on hole | candidates within 1 m | qa_notes present |
|---|---|---|---|---|---|
| D0216 | `OVD003@202m` | OVD003 | 2 (155.3, 157.5 m) | **none** | yes |
| D0238 | `OVD009@178-180m` | OVD009 | 14 (max 195.2 m, none 178–180) | **none** | yes |
| D0243 | `OVD021@101.5m` | OVD021 | 10 | **none** | yes |
| D0310 | `OVD20-121` | OVD020 | 3 (60.6, 101.4, 124.2 m) | **none** | yes |

The alternatives the notes propose also check out: sample **42027** does exist
(`OVD011-101.5`, and already carries 2 descriptions), and **43251** does exist
(`OVD21-121`, OVD021 @ 121.0 m). Leaving both unjoined rather than force-joining
is the defensible call, and it is documented.

## Claim 5 — No data invented: **PASS** (verified exhaustively, not on 10 rows)

Rather than the 10 requested rows, I traced **every one of the 451
descriptions** back to its source. Coverage: 266 rows from the two
`samples.json` extracts, 185 from four master CSV/XLSX sheets — **0 rows from
an unverifiable source.**

| source group | rows | fields compared | differences |
|---|---|---|---|
| `reports/samples.json` + `reports2024_2026/samples.json` | 266 | rock_name, rock_name_original, texture, alteration, opaque_minerals, description_text, analyst_or_lab, report_date | **0** (byte-exact, whitespace-sensitive) |
| `…Petrography_bichiglel_table.csv` | 104 | rock_name (Micro-description), texture, rock-forming minerals, alteration, ore minerals, brief description | **0** (8 apparent hits were embedded source newlines the DB preserves verbatim) |
| `Drillhole Petrograph_2023__Sheet1.csv` | 50 | every populated text field must occur in the source row | **0** |
| `Petrograph_MIRESL20230816_summary.xlsx` | 23 | Lithofacies, Alteration + Alteration minerals, Ore mineral, other opaques | **0** |
| `…Samples_to_Japan.csv` | 8 | rock name / description | **0** |

**`minerals_json`:** for all 266 JSON-sourced rows the parsed object is
**identical** to the raw `minerals` array — same minerals, same order, same
percentage strings (`"30-35"`, `"few"`, `"trace"`). No percentage anywhere is
absent from its source record. All 451 values parse as valid JSON.

**Assays:** I independently re-mapped all 85 element columns of
`sample_assays.csv` back to the Master "All" header and compared every cell:
**23,205 cells compared, 0 differences.** `MgO_pct__ME_ICP61` (which looks
derived, = Mg % × 1.658) is in fact printed verbatim in the master at column 43.

**Samples table vs Master "All":** 274 shared ids compared on hole, year,
petrographer, field/petro/ioGAS lithology and all 7 analysis flags —
**0 mismatches**. Collar (76 rows × 18 fields) and survey (1990 rows) are also
byte-identical to `Collar_all_combined.csv` / `Survey_all_YMB.csv`.

Verbatim spot sample (10 random JSON-sourced rows, seed 1) — all six text fields
identical and minerals identical for every one: D0254, D0218, D0316, D0246,
D0439, D0416, D0427, D0380, D0293, D0234.

**Cyrillic:** 222 descriptions carry Cyrillic `rock_name_original`; **0 rows
anywhere in the database contain mojibake markers** (`Ð`, `Ã`, U+FFFD).
Spot render: `Шигтгээ маягийн жижиг ширхэгтэй пироксен эвэр хуурмагт габбро
(Хувирсан габбро порфир)` — correct.

## Claim 6 — Integrity: **PARTIAL** (one defect)

| check | result |
|---|---|
| `samples.sample_id` unique, none blank | **PASS** (376 unique, 0 blank) |
| every `descriptions.sample_id` exists in `samples` or is blank | **PASS** (447 resolve, 4 blank, 0 orphans) |
| every `coord_source = desurvey` hole exists in `collar` | **PASS** (0 violations, 0 blank holes) |
| `depth_from_m > depth_to_m` | **FAIL — 1 row (defect D1)** |
| `depth_mid_m` = midpoint of from/to | **PASS** (0 deviations > 0.011 m) |
| no `"36m"`-style strings in numeric columns | **PASS** — every value in samples `depth_*`/`x_utm`/`y_utm`/`z_rl`/`year`, survey `depth_m`/`dip`/`azimuth`, collar `east`/`north`/`rl`/`azimuth`/`dip`/`*_depth_m` and assay `depth_*` is strictly numeric. The `"36m"` text survives only in `descriptions.raw_depth`, where README says it should. |
| `sample_assays.sample_id` unique and all in `samples` | **PASS** (277 unique, 0 orphans) |
| `desc_id` unique; `minerals_json` parses | **PASS** |
| UTF-8 / Cyrillic intact | **PASS** (see Claim 5) |

Duplicate-handling claims in `QA_report.md` §4 all verified: tag 42808 split
(42808 @ 171.0 m and `SC04@280.7` with the shared-tag `qa_flags`); BS001 45652
present once at 380–382 m; 32 rockchip samples merged and carrying X/Y from the
grab sheet; 97 samples beyond the Master All spine (279 samples reference the
All sheet; 376 − 279 = 97 ✓).

## Claim 7 — `lu_hole_alias` consistency: **PASS**

I harvested every hole-like token from all extracted CSV/JSON sources
(103 distinct spellings) and pushed each through the alias map:

| outcome | count |
|---|---|
| resolved by `lu_hole_alias` | 100 |
| resolved by zero-padding pattern (`OVD-012`, mentioned only inside free description text — never a hole-id field) | 1 |
| **landed nowhere** | **0** |

The 2 tokens my harvester flagged are the annotated strings
`"OVD001 (per ABM Suggested Petro 2024 list)"` and
`"OVD008 (per ABM Suggested Petro 2024 list)"` in `reports/samples.json`; both
resolve once the parenthetical is stripped, which the builder did correctly
(samples 40763, 40900, 40913 sit on OVD008/OVD001).

Map self-consistency: 101 rows / 101 unique raw spellings, **no raw spelling
maps to two targets**, **every alias target exists in `collar`**, **every
collar hole appears in the map**, and the `changed` flag agrees with
`raw != norm` on all 101 rows. Exactly 25 rows have `changed = 1`, matching
`QA_report.md` §7 item for item. Zero `samples.hole_id_norm` values and zero
`descriptions.raw_hole_id` values fail to resolve to a collar hole.

---

## Defect list (ranked by severity)

### D1 — HIGH — Inverted depth interval places sample 47176 about 14 m off

- **Row:** `csv/samples.csv` row index 121, `sample_id = 47176`, hole OVD023.
- **Stored:** `depth_from_m = 144.0`, `depth_to_m = 114.1`, `depth_mid_m = 129.05`,
  `x_utm = 722071.89`, `y_utm = 5144281.90`, `z_rl = 1726.51`, `coord_source = desurvey`,
  `qa_flags` **empty**.
- **What the sources say:** the master sheets carry a typo —
  `…2024_Phase_2_Drilling.csv` line 58 and `…Petrography_bichiglel_table.csv`
  line 178 both give From = 144, To = 114.1; `Yambat_Petrographic_Master_Data__All.csv`
  line 124 gives a bare point depth of 144. But the **assay block on that same
  Phase-2 row** reads `from = 114, to = 116`, and the 2024–2026 extract
  (`reports2024_2026/samples.csv`, `OVD23-114-116 (47176)`) states explicitly:
  *"(Sample sits at 114-116 m, listed after deeper samples in the source doc.)"*
- **Impact:** the desurvey runs at the meaningless midpoint 129.05 m. Recomputed
  at the reported 115 m the position is **722067.76, 5144288.08, 1738.42** —
  a **14.05 m 3-D error**. Loading `samples.csv` as an interval table will also
  fail or silently drop this row in Leapfrog/Micromine (To < From).
- **Why it slipped through:** the build performs no `from <= to` validation, and
  `QA_report.md` §5 states "Depth-parse failures: none" — true for parsing, but
  it masks a failed *range* check.
- **Fix:** set `depth_from_m = 114.0`, `depth_to_m = 116.0`, `depth_mid_m = 115.0`,
  re-desurvey, and add a `qa_flags` note recording the 144 m master typo. Add a
  `from <= to` assertion to `build_database.py`.

### D2 — MEDIUM — `QA_report.md` §9 misstates where the Crawford flags live

§9 says the Crawford 2025 mix-up flags are *"kept in `descriptions.qa_notes`"*.
Only **5** descriptions have any `qa_notes`, and 4 of them are the unmatched
rows. Three of the five named Crawford caveats carry **empty** `qa_notes`:

| description | raw id | qa_notes | caveat actually lives in |
|---|---|---|---|
| D0229 | `OVD008@88.9m` (→ 41030) | *(empty)* | tail of `description_text`: *"…lacks sulfides despite the 2.5%S assay for the interval."* |
| D0230 | `OVD008@90.5m` (→ 41024) | *(empty)* | `description_text` |
| D0222 | `OVD007@55.9m` (→ 41031) | *(empty)* | *"…the analyst was unsure the provided core photo matches the thin section."* |

Same for the polish caveats (D0218 OVD005@40.5, D0219 OVD005@53.0, D0247
OVD021@148.8) and for the corresponding `samples.qa_flags`, which are all empty.
The information is present and verbatim-correct — it is simply not queryable
from the column the documentation points at. **Fix:** either populate
`qa_notes`/`qa_flags` for these six rows or correct §9 to say the flags remain
inside `description_text`.

### D3 — MEDIUM — `lu_rock_type` is not "every distinct rock name"

README: *"every distinct rock name (samples + descriptions) → best-effort
standardized `rock_group`"*. Actual coverage:

| column | distinct values | in `lu_rock_type` | missing |
|---|---|---|---|
| `samples.field_lithology` | 119 | 119 | 0 |
| `samples.petro_lithology` | 85 | 85 | 0 |
| `samples.iogas_lithology` | 7 | 7 | 0 |
| `descriptions.rock_name` | 315 | 315 | 0 |
| **`descriptions.rock_name_original`** | **186** | **14** | **172** |

172 of 645 distinct names (27 %) — essentially the whole Mongolian
`rock_name_original` vocabulary (`Амфиболитжсон пироксенит`,
`Гранат-карбонатат метасоматит (Скарн)`, `Жигд биш ширхэгтэй аркоз элсжин`, …) —
have no `rock_group`. Related: 14 `lu_rock_type` rows under-report
`n_occurrences` because `rock_name_original` hits are not counted
(`Верлит` says 2, actual 3; `Хувирсан габбро` says 2, actual 3; `Андезит`,
`Габбродиорит`, `Диабаз`, `Диорит`, `Пикрит` etc. each say 1, actual 2).
**Fix:** extend the lookup over `rock_name_original` (or narrow the README claim)
and recount.

### D4 — LOW-MEDIUM — Duplicate survey station with conflicting orientation

`csv/survey.csv` rows 39 and 415 both describe **OVD009 @ 240.0 m** with
different readings:

| dip | azimuth | method | company | date |
|---|---|---|---|---|
| −78.91 | 244.64 | MS | Bayan Undraga LLC | 7/28/2024 |
| −78.00 | 246.50 | Ez-trac, Multi shot | Ragnarok Investment LLC | 5/30/2023 |

Both are verbatim from `Survey_all_YMB.csv` (so not a build error), but the
table is published as a Leapfrog/Micromine survey table, and duplicate
hole+depth keys are rejected or silently resolved by those importers.
**No stored coordinate is affected** — the deepest OVD009 sample is 195.2 m, so
the 240 m station never enters any desurvey. It is the only such pair in 1990
rows. **Fix:** drop or flag one reading, and note the choice.

### D5 — LOW — 9 samples sit outside the depth interval their own report names

Of 77 descriptions whose `raw_sample_id` carries an explicit report interval,
68 contain the sample's stored interval. The other 9 do not:

| desc | report says | stored interval | gap |
|---|---|---|---|
| D0373 | `OVD27-54-56 (47194)` | 52.1 – 52.3 | **1.70 m** |
| D0377 | `OVD27-80-82 (47198)` | 78.9 – 79.1 | 0.90 m |
| D0356 | `OVD025-58.85-60.85 (47152)` | 61.4 – 61.5 | 0.55 m |
| D0323 | `OVD22-146.5-148 (47166)` | 145.0 – 146.0 | 0.50 m |
| D0384 / D0380 / D0379 / D0340 / D0312 | — | — | ≤ 0.10 m |

These reflect a conflict inside the master workbook itself (the Phase-2 sheet's
sample From/To vs the assay interval on the same row), not a build error — but
none of the affected samples carries a `qa_flags` note, so the ambiguity is
invisible downstream. The related row **D0390** (`OVD028-38 (33.14-35)`) is
joined to `OVD028@38` and desurveyed at 38.0 m although its own caption says
33.14–35 m.

### D6 — LOW — SQLite ergonomics

- `descriptions.sample_id` stores `''` (empty string), not `NULL`, for the 4
  unmatched rows — `WHERE sample_id IS NULL` returns 0, contradicting the
  README's "empty when the description could not be joined". Every other
  nullable column (e.g. `samples.x_utm`, 35 NULLs) uses proper NULL.
- The SQLite file has **no primary keys, no indexes and no foreign keys** on any
  of the 9 tables. Fine for a 2 400-row database, but `sample_id` /
  `hole_id_norm` indexes and an FK on `descriptions.sample_id` would make the
  invariants self-enforcing on re-build.

### D7 — INFO — Un-cross-referenced near-duplicate samples

Three pairs sit within 0.31 m on the same hole and are not linked as possible
duplicates (unlike SC04/BS001/OVD015, which are flagged):

| hole | pair | note |
|---|---|---|
| OVD009 | **43816 @ 126.6** (from `15ш пет-мин бичиглэл…docx`) vs **41021 @ 126.7** (Master All) | most likely one physical sample recorded twice; 43816 is only flagged "absent from Master All sheet" |
| CRS02 | 43569 @ 54.7 vs 43570 @ 55.0 | both Master All — probably genuinely distinct |
| OVD009 | 41015 @ 149.5 vs 41033 @ 149.8 | both Master All — probably genuinely distinct |

### D8 — INFO — 99 `depth_mid_m` values differ slightly from the Master All point depth

Where the Phase-2 sheet supplies a narrow interval, the build uses its midpoint
rather than the master's point depth. Typical difference **0.05 m** (e.g. 47160:
master 96.25, DB mid 96.30), worst case 0.5 m (47166). Spatially immaterial
(< 0.5 m), and the resulting `depth_from_m` values are 0.1 m below the master
point depth for 35 samples. Recorded here only so the discrepancy is not
mistaken for corruption later.

### D9 — INFO — The A/B suffix assignment rests on letter order alone

`OVD15-175.5a` → 42388 (master `(A)`) and `OVD15-175.5B` → 42389 (master `(B)`)
is internally consistent, but there is no independent discriminator: the master
lists **both** 42388 and 42389 as `Peridodtite`, while the (B) description is a
*gabbrodiorite*. If either source transposed the letters, the two descriptions
are swapped between the two samples. Both share identical coordinates
(722137.27, 5144150.70, 1697.48), so the spatial impact is nil, but neither
D0304 nor D0305 carries a `qa_notes` recording the inference.

### D10 — INFO — The OVD008A re-entry is untested and its depth datum undocumented

No sample in the database references OVD008A (7 OVD008 samples, all ≤ 90.5 m),
so the re-entry case could not be exercised against stored data. I verified the
trace independently: OVD008A's 33 survey stations run **0 → 162.5 m measured
from surface**, even though `collar.start_depth_m = 110.5`. Desurveying at
110 m on OVD008A and 110.5 m on OVD008 gives positions 0.54 m apart — the
correct behaviour for a re-drill of the same collar. README should state that
OVD008A depths are surface-referenced, otherwise a future user adding an
OVD008A sample at, say, 130 m from the re-entry datum would place it 110 m too
shallow.

---

## What was checked and found clean (no defect)

- Row/column/cell equality of CSV, SQLite and XLSX across all 9 tables.
- All 283 desurveyed positions, against two independent algorithms.
- Bounding box, monotonic depth, z-vs-collar, total-depth and survey-extrapolation sanity.
- All 451 description→sample joins for tag and hole contradictions; 20 stratified manual re-joins.
- All 451 descriptions' text traced to source; 0 differences in 8 fields.
- 23,205 assay cells; 274 sample rows; 76 collar rows; 1990 survey rows — all verbatim.
- Referential integrity (samples ↔ descriptions ↔ sample_assays ↔ collar ↔ survey).
- Numeric-column purity, JSON validity, UTF-8/Cyrillic fidelity, BOM presence.
- `lu_hole_alias` completeness and self-consistency; `lu_lab` coverage (0 unmapped lab strings);
  `sources.csv` (32 entries, no blanks, no duplicates, every `source_file` attributable).
- Every `QA_report.md` §3 per-source count, §4 duplicate-handling claim, §6 spine count
  and §7 alias list — all reproduce exactly.

# Independent delta verification — v1.0 → v1.1

Adversarial verification of the v1.1 rebuild (`6066379`) against its parent
`7e963d4` (v1.0). Scope: the **deltas only**. Checks that the v1.0 integrity
and coverage audits already passed were not re-run except where a v1.1 change
could have broken them (regression guard, check 1).

Method: v1.0 artifacts recovered with `git show 7e963d4:…`; all comparisons made
with an independent parser (`csv`/`json`/`sqlite3`/`openpyxl`), not with
`build_database.py`. The desurvey was re-implemented from scratch against
`collar.csv` + `survey.csv` rather than trusting the build's own trace class.

| # | Check | Verdict |
|---|---|---|
| 1 | Regression guard (coords, description text, joins) | **PASS** |
| 2 | +19 new sample rows (2 Crawford + 17 ARDH) | **PASS** |
| 3 | +121 new descriptions, arithmetic reconciled | **PASS** |
| 4 | Spot-verify new descriptions vs `missing_sources/samples.json` | **PASS** |
| 5 | SQLite PK/FK/index, NULLs, CSV=SQLite=XLSX | **PASS** |
| 6 | Rebuild reproducibility | **PASS** |
| 7 | QA_report v1.1 §11 + changelog + D2 corrections | **PASS** |

No data defect was found. Four non-blocking observations are recorded in §8.

---

## 1. Regression guard — PASS

### samples.csv (376 → 395, 0 rows removed)

Field-level diff over the 376 v1.0 sample_ids, all 27 columns:

| column | rows changed |
|---|---|
| `depth_from_m`, `depth_to_m`, `depth_mid_m` | **1** (47176) |
| `x_utm`, `y_utm`, `z_rl` | **1** (47176) |
| `rock_group` | 53 |
| `qa_flags` | 37 |
| every other column (21 of them) | **0** |

**Exactly one v1.0 sample coordinate changed**, and it is the claimed one:

```
47176  depth_from 144.0 -> 114.0 | depth_to 114.1 -> 116.0 | mid 129.05 -> 115.0
       x 722071.89 -> 722067.76  | y 5144281.9 -> 5144288.08 | z 1726.51 -> 1738.42
```

Matches the claim (114–116 m at 722067.76 / 5144288.08 / 1738.42). The other
375 v1.0 coordinate triples are byte-identical.

The correction is independently corroborated, not merely asserted:

* `…__2024_Phase_2_Drilling.csv` contains **exactly one** row whose sample
  `From > To` — tag 47176, From 144 / To 114.1 — and the assay block on that
  same row (cols 21/22) reads **from 114 / to 116**.
* `workspace/extracted/reports2024_2026/samples.csv` line 86 independently
  names the sample `OVD23-114-116 (47176)`, 114.0–116.0 m.

The 53 `rock_group` and 37 `qa_flags` changes are non-coordinate, additive
reclassification / documentation (lu_rock_type grew 473 → 704; the Crawford
caveats and D7 near-duplicate cross-references are new). No v1.0 sample row lost
information.

### descriptions.csv (451 → 572, 0 rows removed)

Over the 451 v1.0 `desc_id`s, only **three** columns changed:

| column | rows changed |
|---|---|
| `sample_id` | **5** |
| `join_method` | 4 |
| `qa_notes` | 30 |
| `description_text`, `rock_name`, `rock_name_original`, `texture`, `minerals_json`, `alteration`, `opaque_minerals` | **0** |
| `raw_sample_id`, `raw_hole_id`, `raw_depth`, `source_file`, `analyst_or_lab`, `report_date`, `language` | **0** |

**All 451 original description text and mineral fields are unchanged.**

### Reconciling "5 join changes" vs the 6 named desc_ids

The five `sample_id` reassignments are:

| desc_id | raw id | v1.0 → v1.1 | join_method |
|---|---|---|---|
| D0089 | `OVD015-175.5 (B)` | 42388 → **42389** | label (unchanged) |
| D0216 | `OVD003@202m` | *(none)* → **OVD003@202** | unmatched → label |
| D0238 | `OVD009@178-180m` | *(none)* → **OVD009@178** | unmatched → label |
| D0243 | `OVD021@101.5m` | *(none)* → **42027** | unmatched → xref-corrected |
| D0310 | `OVD20-121` | *(none)* → **43251** | unmatched → xref-corrected |

**D0088 is the sixth named desc_id and is NOT a join change.** Its `sample_id`
stayed 42388; it received only the D9 A/B-ambiguity `qa_note` as the partner row
of D0089. So the claim's six ids = five re-joins + one note-only partner. The
5-vs-6 discrepancy is a labelling artefact of the claim, not a data problem.

Collateral evidence that G10 (D0089) was a real defect: in v1.0, sample 42388
carried **3** descriptions and 42389 carried **1**, even though the master lists
`(A)` and `(B)` as two slides. In v1.1 each carries 2 (42388: D0088+D0304;
42389: D0089+D0305).

The 30 `qa_notes` changes are all additive documentation (D5 interval
disagreements ×12, D9 A/B ambiguity ×6, Crawford caveats ×6, coverage joins ×4,
two others). Four rewrite an existing note (D0216, D0238, D0243, D0310); in each
the old substance is retained and expanded — none deletes a caveat.

Unmatched descriptions among the originals: **4 → 0** (D0216/D0238/D0243/D0310
all resolved). No v1.0 description was silently un-joined.

---

## 2. New sample rows — PASS

+19 rows, 0 removed, 376 + 19 = **395** ✓

| group | n | verified |
|---|---|---|
| Crawford 2025 (G1) | 2 | `OVD003@202`, `OVD009@178` |
| ARDH-2005-01 photo stubs | 17 | `ARDH-2005-01-DSC00228…00260` |

### Desurvey verified independently

A from-scratch minimum-curvature implementation (stations deduplicated by
most-recent `survey_date`, collar-anchored, azimuth interpolated on the shortest
arc) was run over **all 285 `coord_source = desurvey` samples**:

```
desurveyed samples checked: 285   mismatches: 0
OVD003@202  OVD003 mid 202.0  -> (722112.94, 5144191.32, 1670.78)  = db
OVD009@178  OVD009 mid 179.0  -> (722129.62, 5144154.24, 1672.39)  = db
47176       OVD023 mid 115.0  -> (722067.76, 5144288.08, 1738.42)  = db
```

Both new Crawford rows and the corrected 47176 reproduce exactly. Depths are
inside their holes (OVD003 TD 209.5 m; OVD009 TD 240 m).

### Flags

* `OVD009@178` carries the swap caveat in `qa_flags`: *"the analyst states the
  wholerock assay for this interval does not match the thin section and suspects
  a SAMPLE SWAP … treat the location as provisional"*. ✓
* `OVD003@202` carries the G1 no-register-entry flag. ✓
* All 17 ARDH stubs: `coord_source = none`, `x_utm`/`y_utm`/`z_rl` empty,
  `thin_section = 1`, `legacy_2005_photo_only` flag. `ARDH-2005-01` is confirmed
  **absent** from `collar.csv`, so `none` is the correct coord_source. ✓

### Collision checks

No duplicate `sample_id`; no new `sample_id` collides with another row's
`alt_ids`; `OVD003@202` and `OVD009@178` are the sole occupants of their
`(hole, depth_mid)` keys — they did not shadow an existing register sample.

---

## 3. New descriptions — PASS, and the arithmetic is NOT 81 + 54

+121 rows, 0 removed, 451 + 121 = **572** ✓ (desc_ids D0452–D0572, contiguous).

### True arithmetic

```
workspace/extracted/missing_sources/samples.json ............  84 records
  ├─ 17 CORE PHOTO/ARDH-2005-01 records → SAMPLE rows (photo stubs, §2)
  └─ 67 description-bearing records     → DESCRIPTION rows
                                            ├─ 64 joined
                                            └─  3 unmatched (with qa_note)
grab-sheet field descriptions ..............................  54
                                                             ---
new description rows .......................................  121  ✓
```

**67 + 54 = 121.** Nothing is dropped: 17 + 67 = 84 = every record in
`samples.json`, and the 67 emitted rows are in exact JSON order.

The "**81** matched" figure reconciles as **81 = 64 joined descriptions + 17
photo stubs** — i.e. 84 minus the 3 unmatched. It is a count of *placed*
records, not of descriptions, and pairing it with "+54" to reach 121 is invalid
arithmetic. `QA_report.md` §10/§12 already states the correct decomposition
("84 records, of which 67 became descriptions and 17 became photo-only sample
stubs"), so the database and its own documentation are right; only the
81 + 54 phrasing is wrong.

### The 54 grab field descriptions, verified against source

`Yambat_Petrographic_Master_Data__2022-2024_grab.csv` has 65 data rows, of which
**exactly 54** have a non-empty right-hand `Description` cell (col 13). All 54
were emitted, and a row-by-row pairing found:

* 54/54 `description_text` values **verbatim** identical to the sheet cell;
* 54/54 joined (no empty `sample_id`);
* 54/54 joined to a sample whose `sample_id`/`alt_ids` set contains the sheet's
  `Sample ID`;
* 54/54 sample `x_utm` within 1 m of the sheet's `X`.

`0 problems`. No emitted row is unaccounted for and no source row was skipped.

### Breakdown of the 121 by join method

`grab sheet row` 54 · `grab sheet id` 24 · `tag (MIRESL code)` 23 · `tag` 17 ·
`unmatched` 3 (D0514 `2111`, D0515 `2107`, D0524 `2023Nisample` — all three
carry an explanatory `qa_notes`, all three are listed in QA_report §11).

---

## 4. Spot-verification against `missing_sources/samples.json` — PASS

### Verbatim fidelity — checked exhaustively, not by sample

All **67** missing_sources descriptions were compared field-by-field against the
JSON (`sample_id`, `drillhole_id`, `depth`, `source_file`, `analyst_or_lab`,
`report_date`, `rock_name`, `rock_name_original`, `texture`,
`minerals`→`minerals_json`, `alteration`, `opaque_minerals`,
`description_summary`→`description_text`):

```
verbatim field mismatches across all 67: 0
```

### The eight required join cases, each traced to a primary source

| # | case | desc_id | verification |
|---|---|---|---|
| 1 | surface ↔ grab row | D0522 `YT-08` → sample `YT-08` | grab sheet row 1, X/Y 722350.4 / 5143990.61 matches the sample's `master_xy` |
| 2 | surface, **zero-strip** | D0510 report id `020` → sample `20` | grab sheet **row 13** is literally `20` (Dacite Porphyry); `qa_notes` records the zero-strip and the sample's `qa_flags` records the id disagreement |
| 3 | Khanlab OVD009 tag | D0570 `41016` @171.5 m | `Suggested_Petro…2024` line 27, `Master All` line 49, `Drillhole Petrograph_2023` line 33 all give 41016 = OVD-009 @ 171.5 m |
| 4 | Khanlab OVD009 tag | D0564 `41021` @126.7 m | same four registers give 41021 = OVD-009 @ 126.7 m |
| 5 | Report_20230816 Code→tag | D0538 MIRESL code `OVD001` → 40579 | `Petrograph_MIRESL20230816_summary` row 2: `40579, 36m, OVD-004, …, OVD001` — matches the description's `OVD-004 / 36 m` |
| 6 | Report_20230816 Code→tag | D0550 MIRESL code `OVD013` → 40904 | summary row 14: `40904, 44.2m, OVD-002, …, OVD013`. The description's `raw_depth` explicitly records that the report body text repeats "Tag 40902 / 87.4 m" for OVD013 and that Table 1's 40904 / 44.2 m was preferred — the known source error is carried, not silently fixed |
| 7 | BE-3 | D0533 `40763` | `Suggested_Petro…2024` line 19: `40763, 84.5m, OVD-008`; samples.csv 40763 = OVD008 @ 84.5 m, desurveyed. (Siblings 40900 = OVD-001 @ 56.8 m and 40913 = OVD-001 @ 68 m likewise confirmed.) |
| 8 | unmatched + qa_note | D0514 `2111` | a repo-wide grep finds no standalone `2111` — the only hit is inside `42111`. Leaving it unjoined is correct, and the `qa_notes` says so. (D0515 `2107` and D0524 `2023Nisample` likewise carry explanatory notes; the ambiguity is additionally back-propagated to grab sample `2107`'s `qa_flags`.) |

---

## 5. SQLite / XLSX / CSV — PASS

### Schema

```
samples        pk=[sample_id]  fk=[]                        idx=coord_source, hole_depth
descriptions   pk=[desc_id]    fk=[samples.sample_id]       idx=source, sample_id
collar         pk=[hole_id]    fk=[]
survey         pk=[]           fk=[collar.hole_id]          idx=hole_depth
sample_assays  pk=[sample_id]  fk=[samples.sample_id]       idx=hole_depth
lu_hole_alias  pk=[]           fk=[]                        idx=alias_norm
```

`pragma foreign_key_check` → **empty**. `pragma integrity_check` → **ok**.

v1.0 had **no** primary keys, foreign keys or indexes on any table, so this is a
pure improvement (see §8.3 for the tables still without a PK).

### NULLs

```
descriptions.sample_id = ''    -> 0
descriptions.sample_id IS NULL -> 3   (the three unmatched rows)
empty-string cells in samples / descriptions / sources / lu_rock_type / lu_lab -> none
```

Real NULLs throughout; no `''` sentinels survive.

### Row counts and cell content

| table | csv | sqlite | xlsx |
|---|---|---|---|
| samples | 395 | 395 | 395 |
| descriptions | 572 | 572 | 572 |
| lu_rock_type | **704** | **704** | **704** |
| sources | **48** | **48** | **48** |
| lu_lab | **31** | **31** | **31** |
| collar / survey / sample_assays / lu_hole_alias | 76 / 1990 / 277 / 101 | same | same |

Beyond counts, a **cell-level** comparison of all 967 samples + descriptions rows
across CSV vs XLSX vs SQLite (numeric-normalised) returned **0 differences**.
Column order and names are identical in CSV and SQLite for every table.

---

## 6. Rebuild reproducibility — PASS

Working tree was clean at HEAD `6066379`. `python3 scripts/build_database.py`
was run once into its normal output (`database/`). It completed with
`== BUILD OK (v1.1) ==`, `assertions: 18/18 passed`.

```
$ git status --porcelain
(empty)
$ md5sum -c before.md5
(no FAILED lines)
```

Byte-identical, including the `.sqlite` and `.xlsx` binaries — the build is
deterministic and the committed artifacts are exactly what the script produces.

---

## 7. QA_report v1.1 — PASS

**§11 "Known missing at source"** is present and names every required item:

* **Gtech prospect review** — absent from Drive ✓
* **Chuluunbataar / Vi Vitex LLC review (May 2022)** — absent from Drive ✓
* **ARDH-2005-02 thin-section photos** — folder exists but is empty ✓
* **`41016.jpg`** — hand-specimen photo missing (23 JPGs for 24 samples); the
  41016 *description* is present ✓
* **Khanlab batch-1 report** (7 × OVD-009 sections) — document not on Drive ✓
* **Photo folders** — ≈330 images in 13 folders, explicitly out of scope, with
  the ARDH-2005-01 exception spelled out ✓

Also present: the three unjoinable records with their desc_ids, the sample
suites still lacking descriptions, and the "audit listed as missing / v1.1
RESOLVED" list.

**§12 Changelog v1.0 → v1.1** is present with the row-count table, data
corrections, new content, schema changes and documentation changes.

**The D2 correction holds.** D2 named six rows whose Crawford caveats lived only
inside `description_text` while §9 claimed they were in `qa_notes`. All six now
carry the caveat in **both** `descriptions.qa_notes` and the joined
`samples.qa_flags`:

| desc_id | sample | qa_notes | sample qa_flags |
|---|---|---|---|
| D0218 | 40628 | 94 chars | 117 chars |
| D0219 | 40635 | 78 | 101 |
| D0222 | 41031 | 93 | 116 |
| **D0229** | 41030 | **90** ("lacks sulfides despite the 2.5 %S assay") | 113 |
| **D0230** | 41024 | **194** ("~30 % pyrrhotite … vs <2 % sulfides") | 217 |
| D0247 | 43267 | 68 | 92 |

Aggregate: descriptions with non-empty `qa_notes` 5 → **118**; samples with
non-empty `qa_flags` 40 → **93**.

`sources.csv` grew 32 → 48; the 16 new rows cover all 13 new description source
documents plus 2 Mongolian twins and the ARDH photo folder.

---

## 8. Observations (non-blocking — no data defect)

1. **The "81 matched + 54 grab" claim is arithmetically wrong**, the database is
   not. True: 84 records = 67 descriptions + 17 photo stubs; 67 + 54 = 121.
   `QA_report.md` already states this correctly; only the 81 + 54 phrasing is
   defective. Nothing was dropped.

2. **`sources.title` is not a joinable key.** 16 of 32 distinct
   `descriptions.source_file` values and 26 `samples.source_files` entries have
   no exact `sources.title` match (they carry parenthetical annotations or
   per-image suffixes). This is **pre-existing** — v1.0 had the same mismatch on
   13 of 24 — and no FK is declared, so nothing breaks. Worth a normalised
   `source_id` in a future version.

3. **PKs are still absent on `survey`, `sources`, `lu_rock_type`, `lu_lab`,
   `lu_hole_alias`.** For `survey` this is deliberate and documented (the
   duplicate station OVD009 @ 240 m is kept verbatim, with the preferred row
   named in `qa_note`). The lookups are flat reference tables. Since v1.0 had no
   keys at all, this is a partial rather than a regressed fix.

4. **The ARDH "18 JPGs, 17 unique" claim cannot be re-verified from the repo.**
   `workspace/inventory.json` records only `4. Thin section photo (18 JPG,
   DSC00228-DSC00260)`; the de-duplication rationale (`Copy of DSC00233.JPG`
   duplicates `DSC00233.JPG`) lives in the extraction README. The 17 emitted
   stubs are internally consistent with it, but no raw file listing is in the
   repository to confirm it independently.

---

*Verified independently on 2026-08-31 against `6066379` (v1.1) and `7e963d4`
(v1.0). Scratch work: `/tmp/claude-0/-home-user-Jargal/…/scratchpad/verify_delta/`.*

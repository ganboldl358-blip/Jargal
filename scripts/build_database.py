#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_database.py — Consolidated, 3D-modelling-ready petrography database
for the Oval Ni-Cu project (Yambat, Mongolia).

Reads the extracted source tables under  workspace/extracted/  and writes
ONE consolidated database to  database/ :
  csv/samples.csv           one row per physical sample (the spine)
  csv/descriptions.csv      one row per petrographic description
  csv/collar.csv            normalized drillhole collars (WGS84 / UTM 46N)
  csv/survey.csv            normalized downhole surveys
  csv/sample_assays.csv     wide assay suite from the Master "All" sheet
  csv/lu_hole_alias.csv     raw hole-id spelling -> normalized hole id
  csv/lu_lab.csv            lab / petrographer lookup
  csv/lu_rock_type.csv      rock-name -> standardized rock group
  csv/sources.csv           registry of contributing files (Drive fileIds)
  Oval_Petrography_DB.xlsx  all tables as sheets
  Oval_Petrography_DB.sqlite same tables
  QA_report.md, README.md

Re-run:  python3 scripts/build_database.py   (from the repo root or anywhere)
Requires: pandas, openpyxl  (pip install pandas openpyxl)
"""

import csv
import json
import math
import re
import sqlite3
import sys
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent          # /home/user/Jargal
WS = ROOT / "workspace" / "extracted"
MASTER = WS / "master"
XLSX = WS / "xlsx"
OUT = ROOT / "database"
CSVDIR = OUT / "csv"
CSVDIR.mkdir(parents=True, exist_ok=True)

EPSG_NOTE = "WGS84 / UTM zone 46N (EPSG:32646)"

# ----------------------------------------------------------------------------
# small helpers
# ----------------------------------------------------------------------------

hole_alias_seen = defaultdict(set)   # raw -> set(sources)
hole_alias_norm = {}                 # raw -> norm

_RE_OVD = re.compile(r"^OVD[-_ ]?0*(\d+)\s*([A-Z]?)$")
_RE_SCCRS = re.compile(r"^(SC|CRS)[-_ ]?0*(\d+)\s*([A-Z]?)$")
_RE_BS = re.compile(r"^BS[-_ ]?0*(\d+)$")
_RE_MU = re.compile(r"^MU[-_ ]?(\d+)$")


def norm_hole(raw, source=""):
    """Normalize a drillhole ID.  OVD-001->OVD001, OVD21->OVD021,
    OVD008a->OVD008A, CRSO1A->CRS01A; SC/CRS/MU/BS styles kept intact.
    Returns '' when the value is not a hole id."""
    if raw is None:
        return ""
    s = str(raw).strip().upper().replace(" ", "")
    if not s:
        return ""
    s = s.replace("CRSO", "CRS0")            # letter O typo in 2024 reports
    out = ""
    m = _RE_OVD.match(s)
    if m:
        out = "OVD" + m.group(1).zfill(3) + m.group(2)
    else:
        m = _RE_SCCRS.match(s)
        if m:
            out = m.group(1) + m.group(2).zfill(2) + m.group(3)
        else:
            m = _RE_BS.match(s)
            if m:
                out = "BS" + m.group(1).zfill(3)
            else:
                m = _RE_MU.match(s)
                if m:
                    out = "MU" + m.group(1)
    if out:
        raw_s = str(raw).strip()
        hole_alias_seen[raw_s].add(source)
        hole_alias_norm[raw_s] = out
    return out


def is_cyrillic(text):
    if not text:
        return False
    cyr = sum(1 for ch in text if "Ѐ" <= ch <= "ӿ")
    return cyr > max(3, 0.15 * len(text))


def ffloat(v):
    """forgiving float; returns None on failure"""
    if v is None:
        return None
    s = str(v).strip().replace(",", ".")
    s = s.rstrip("mM").strip()
    try:
        return float(s)
    except ValueError:
        return None


def rdepth(v):
    return None if v is None else round(v, 3)


_RE_INTERVAL = re.compile(r"^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*m?$")
_RE_POINT = re.compile(r"^(\d+(?:\.\d+)?)\s*m?\s*(?:\(?([ABАБ])\)?)?$", re.I)


def parse_depth_text(s):
    """'36m'->(36,None) ; '95.8-95.9'->(95.8,95.9) ; '175.5 A'->(175.5,None)
    returns (from, to, note) — note!='' when unparseable/suffixed."""
    if s is None:
        return None, None, "empty"
    t = str(s).strip()
    if not t:
        return None, None, "empty"
    m = _RE_INTERVAL.match(t)
    if m:
        return float(m.group(1)), float(m.group(2)), ""
    m = _RE_POINT.match(t)
    if m:
        note = f"slide suffix {m.group(2)}" if m.group(2) else ""
        return float(m.group(1)), None, note
    return None, None, f"unparseable depth '{t}'"


def read_csv_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        return list(csv.reader(f))


# ============================================================================
# 1. Collar + survey (location authority) and minimum-curvature desurvey
# ============================================================================

collar_rows = []
collar_by_hole = {}
for row in read_csv_rows(MASTER / "Collar_all_combined.csv")[1:]:
    if not any(c.strip() for c in row):
        continue
    raw_h = row[2].strip()
    h = norm_hole(raw_h, "Collar_all_combined")
    rec = {
        "hole_id": h,
        "hole_id_raw": raw_h,
        "project": row[0].strip(),
        "prospect": row[1].strip(),
        "hole_type": row[3].strip(),
        "east": ffloat(row[4]),
        "north": ffloat(row[5]),
        "rl": ffloat(row[6]),
        "azimuth": ffloat(row[7]),
        "dip": ffloat(row[8]),
        "start_depth_m": ffloat(row[9]),
        "total_depth_m": ffloat(row[11]),
        "start_date": row[12].strip(),
        "end_date": row[13].strip(),
        "status": row[14].strip(),
        "lease": row[15].strip(),
        "company": row[16].strip(),
        "supervisor": row[17].strip(),
        "remarks": row[19].strip(),
        "edited_date": row[20].strip(),
        "crs": EPSG_NOTE,
    }
    collar_rows.append(rec)
    collar_by_hole[h] = rec

survey_rows = []
survey_by_hole = defaultdict(list)
for row in read_csv_rows(MASTER / "Survey_all_YMB.csv")[1:]:
    if not any(c.strip() for c in row):
        continue
    raw_h = row[0].strip()
    if not raw_h:
        continue
    h = norm_hole(raw_h, "Survey_all_YMB")
    d, dip, azi = ffloat(row[1]), ffloat(row[2]), ffloat(row[3])
    rec = {
        "hole_id": h,
        "hole_id_raw": raw_h,
        "depth_m": d,
        "dip": dip,
        "azimuth": azi,
        "grid": row[4].strip(),
        "azim_utm": row[5].strip(),
        "method": row[6].strip(),
        "survey_company": row[7].strip(),
        "survey_date": row[8].strip() if len(row) > 8 else "",
    }
    survey_rows.append(rec)
    if d is not None and dip is not None and azi is not None:
        survey_by_hole[h].append((d, dip, azi))


def _mc_delta(md1, i1, a1, md2, i2, a2):
    """minimum-curvature increment; inclinations from vertical, degrees.
    returns (dE, dN, dDown)"""
    dmd = md2 - md1
    I1, I2 = math.radians(i1), math.radians(i2)
    A1, A2 = math.radians(a1), math.radians(a2)
    cosdl = math.cos(I2 - I1) - math.sin(I1) * math.sin(I2) * (1 - math.cos(A2 - A1))
    cosdl = max(-1.0, min(1.0, cosdl))
    dl = math.acos(cosdl)
    rf = 1.0 if dl < 1e-9 else (2.0 / dl) * math.tan(dl / 2.0)
    dN = dmd / 2.0 * (math.sin(I1) * math.cos(A1) + math.sin(I2) * math.cos(A2)) * rf
    dE = dmd / 2.0 * (math.sin(I1) * math.sin(A1) + math.sin(I2) * math.sin(A2)) * rf
    dV = dmd / 2.0 * (math.cos(I1) + math.cos(I2)) * rf
    return dE, dN, dV


class HoleTrace:
    """Minimum-curvature desurveyed trace of one drillhole."""

    def __init__(self, collar, stations):
        self.ok = collar["east"] is not None and collar["north"] is not None
        self.collar = collar
        st = sorted({s[0]: s for s in stations}.values()) if stations else []
        # station: (md, inclination-from-vertical, azimuth)
        st = [(md, 90.0 + dip, azi) for md, dip, azi in st]
        if not st:
            dip = collar["dip"] if collar["dip"] is not None else -90.0
            azi = collar["azimuth"] if collar["azimuth"] is not None else 0.0
            st = [(0.0, 90.0 + dip, azi)]
        if st[0][0] > 0.0:                       # anchor at collar
            st.insert(0, (0.0, st[0][1], st[0][2]))
        self.st = st
        # cumulative positions at stations
        self.pos = [(0.0, 0.0, 0.0)]
        for k in range(1, len(st)):
            dE, dN, dV = _mc_delta(*st[k - 1], *st[k])
            e, n, v = self.pos[-1]
            self.pos.append((e + dE, n + dN, v + dV))

    def xyz_at(self, md):
        """(x, y, z) at measured depth md; None when collar has no coords."""
        if not self.ok or md is None:
            return None
        st, pos = self.st, self.pos
        if md <= st[0][0]:
            e, n, v = pos[0]
        elif md >= st[-1][0]:
            md1, i1, a1 = st[-1]
            dE, dN, dV = _mc_delta(md1, i1, a1, md, i1, a1)
            e, n, v = pos[-1][0] + dE, pos[-1][1] + dN, pos[-1][2] + dV
        else:
            k = max(i for i in range(len(st)) if st[i][0] <= md)
            md1, i1, a1 = st[k]
            md2, i2, a2 = st[k + 1]
            t = 0.0 if md2 == md1 else (md - md1) / (md2 - md1)
            ii = i1 + t * (i2 - i1)
            da = ((a2 - a1 + 180.0) % 360.0) - 180.0
            aa = a1 + t * da
            dE, dN, dV = _mc_delta(md1, i1, a1, md, ii, aa)
            e, n, v = pos[k][0] + dE, pos[k][1] + dN, pos[k][2] + dV
        c = self.collar
        z = None if c["rl"] is None else round(c["rl"] - v, 2)
        return round(c["east"] + e, 2), round(c["north"] + n, 2), z


traces = {h: HoleTrace(collar_by_hole[h], survey_by_hole.get(h, []))
          for h in collar_by_hole}

# ============================================================================
# 2. Master "All" sheet -> samples spine + assay table
# ============================================================================

all_rows = read_csv_rows(MASTER / "Yambat_Petrographic_Master_Data__All.csv")
hdr_grp, hdr_det = all_rows[0], all_rows[1]

# assay column names (cols 22..end), unique + sanitized
assay_cols = []          # (index, name)
prev_grp = ""
used_names = Counter()
for i in range(22, len(hdr_det)):
    det, grp = hdr_det[i].strip(), hdr_grp[i].strip()
    if not det:
        continue
    grp = grp or prev_grp
    prev_grp = grp
    name = re.sub(r"[^0-9A-Za-z]+", "_", det.replace("%", "pct")).strip("_")
    name = f"{name}__{re.sub(r'[^0-9A-Za-z]+', '_', grp).strip('_')}"
    used_names[name] += 1
    if used_names[name] > 1:
        name += f"_{used_names[name]}"
    assay_cols.append((i, name))

FLAG_COLS = [("polished_thin_section", 10), ("thin_section", 11), ("asd", 12),
             ("xrd", 13), ("fluid_incl", 14), ("eds", 15), ("epma", 16)]

samples = []             # list of dicts
sample_by_id = {}
tag2sample = {}          # numeric tag string -> sample dict
assay_records = []
qa = defaultdict(list)   # QA report bins

MASTER_ALL = "Yambat_Petrographic_Master_Data__All.csv"

HD_LABEL = re.compile(
    r"^([A-Za-z]+ ?-?\d+[A-Za-z]?)[-@](\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?"
    r"\s*(?:\(?([ABАБ])\)?)?$")


def composite_id(hole, dfrom):
    d = ("%g" % dfrom) if dfrom is not None else "?"
    return f"{hole}@{d}"


def add_sample(rec):
    samples.append(rec)
    sample_by_id[rec["sample_id"]] = rec
    for t in [rec["sample_id"]] + [a.strip() for a in rec["alt_ids"].split("|") if a.strip()]:
        t2 = t.split(" ")[0]
        if re.fullmatch(r"\d{5}", t2) and t2 not in tag2sample:
            tag2sample[t2] = rec


seen_exact = set()
skipped_formatting = 0
for row in all_rows[2:]:
    if not any(c.strip() for c in row):
        continue
    sid_raw = row[6].strip()
    label = row[5].strip()
    hole_raw = row[1].strip()
    if not sid_raw and not label:
        skipped_formatting += 1
        continue

    hole = norm_hole(hole_raw, MASTER_ALL)
    qa_flags = []
    alt_ids = []

    # --- depths ------------------------------------------------------------
    d_from, d_to = None, None
    f_raw = row[4].strip()
    f_val, _f2, f_note = parse_depth_text(f_raw)
    if f_val is not None:
        d_from = f_val
    if f_note and "suffix" not in f_note and f_raw:
        qa_flags.append(f_note)

    lab_val = ffloat(label)
    if lab_val is not None and label and not label.endswith("m"):
        # numeric label = interval TO (2025-era rows)
        if d_from is None or lab_val >= d_from:
            d_to = lab_val
    elif label:
        for part in [p.strip() for p in label.split(",") if p.strip()]:
            m = HD_LABEL.match(part)
            if m and norm_hole(m.group(1), MASTER_ALL + " (interval label)"):
                alt_ids.append(part)
                lf, lt = float(m.group(2)), (float(m.group(3)) if m.group(3) else None)
                if d_from is None:
                    d_from = lf
                if lt is not None:
                    d_from, d_to = lf, lt
            elif not re.fullmatch(r"\d+(\.\d+)?m?", part):
                qa_flags.append(f"interval label '{part}' not parsed")

    # --- duplicate handling ------------------------------------------------
    if sid_raw:
        key = (sid_raw, hole, row[4].strip(), label)
        if sid_raw in {s["sample_id"] for s in samples}:
            if key in seen_exact:
                qa["dup_rows_dropped"].append(
                    f"{sid_raw} ({hole} {row[4]}) exact duplicate row dropped")
                continue
            # same tag, different sample (42808 = SC04-171 AND SC04-280.7)
            sid = composite_id(hole, d_from)
            alt_ids.append(f"{sid_raw} (tag shared)")
            qa_flags.append(f"tag {sid_raw} shared with another sample; "
                            f"composite id assigned")
            qa["dup_tags_split"].append(
                f"tag {sid_raw} used twice; second occurrence ({hole} @ "
                f"{row[4]}) stored as {sid}")
        else:
            seen_exact.add(key)
            if re.fullmatch(r"\d{5}", sid_raw):
                sid = sid_raw
            else:                          # OVD028-38 style id
                sid = composite_id(hole, d_from)
                alt_ids.append(sid_raw)
    else:
        # no SAMPLE_ID: rows 230/231 duplicate the tagged SC04 rows above
        qa["dup_rows_dropped"].append(
            f"no-id row {hole} '{label}' dropped (duplicates tagged SC04 rows)")
        continue

    d_mid = None
    if d_from is not None:
        d_mid = (d_from + d_to) / 2.0 if d_to is not None else d_from
    if d_from is None:
        qa_flags.append("depth not parsed")
        qa["depth_parse_failures"].append(f"{sid}: from='{row[4]}' label='{label}'")

    rec = {
        "sample_id": sid,
        "alt_ids": " | ".join(dict.fromkeys(alt_ids)),
        "hole_id_norm": hole,
        "depth_from_m": rdepth(d_from),
        "depth_to_m": rdepth(d_to),
        "depth_mid_m": rdepth(d_mid),
        "sample_source": "drill core" if hole else "unknown",
        "year": row[9].strip(),
        "petrographer_lab": row[7].strip(),
        "field_lithology": row[17].strip(),
        "petro_lithology": row[18].strip(),
        "iogas_lithology": row[19].strip(),
        "iogas_no": "",
        "x_utm": None, "y_utm": None, "z_rl": None, "coord_source": "none",
        "qa_flags": "; ".join(qa_flags),
        "source_files": MASTER_ALL,
        "_master_x": ffloat(row[2]), "_master_y": ffloat(row[3]),
    }
    for fname, idx in FLAG_COLS:
        rec[fname] = 1 if row[idx].strip() else 0
    add_sample(rec)

    vals = {name: ("" if row[i].strip() == "-" else row[i].strip())
            for i, name in assay_cols}
    if any(vals.values()):
        assay_records.append({"sample_id": sid, **vals})

# ---------------------------------------------------------------------------
# enrich intervals of the 47xxx / OVD022-029 samples from the Phase-2 sheet
# ---------------------------------------------------------------------------
PH2 = "Yambat_petrography_samples_2022-2024_from_Core___grab__2024_Phase_2_Drilling.csv"
for row in read_csv_rows(MASTER / PH2)[2:]:
    if len(row) < 6 or not row[5].strip():
        continue
    tag = row[5].strip()
    f, t = ffloat(row[2]), ffloat(row[3])
    s = tag2sample.get(tag)
    if s and f is not None:
        if s["depth_to_m"] is None:
            s["depth_from_m"], s["depth_to_m"] = rdepth(f), rdepth(t)
            s["depth_mid_m"] = rdepth((f + t) / 2.0 if t is not None else f)
            s["source_files"] += "; " + PH2
        hd = row[4].strip()
        if hd and hd not in s["alt_ids"]:
            s["alt_ids"] = (s["alt_ids"] + " | " + hd).strip(" |")
        norm_hole(row[1], PH2)

# ---------------------------------------------------------------------------
# bichiglel table: ioGAS numbers, extra flags, and (later) descriptions
# ---------------------------------------------------------------------------
BICH = "Yambat_petrography_samples_2022-2024_from_Core___grab__Petrography_bichiglel_table.csv"
bich_rows = [r for r in read_csv_rows(MASTER / BICH)[2:] if any(c.strip() for c in r)]
for row in bich_rows:
    sn = row[1].strip()
    norm_hole(row[4], BICH)
    s = tag2sample.get(sn)
    if s and row[2].strip():
        s["iogas_no"] = row[2].strip()

# ============================================================================
# 3. ADD samples that are absent from the Master "All" sheet
# ============================================================================

def new_sample(sid, hole, d_from, d_to, source, year, ssource, lab="",
               field_lith="", petro_lith="", alt="", qa_flag="", flags=None,
               x=None, y=None):
    d_mid = None
    if d_from is not None:
        d_mid = (d_from + d_to) / 2.0 if d_to is not None else d_from
    rec = {
        "sample_id": sid, "alt_ids": alt, "hole_id_norm": hole,
        "depth_from_m": rdepth(d_from), "depth_to_m": rdepth(d_to),
        "depth_mid_m": rdepth(d_mid),
        "sample_source": ssource, "year": year, "petrographer_lab": lab,
        "field_lithology": field_lith, "petro_lithology": petro_lith,
        "iogas_lithology": "", "iogas_no": "",
        "x_utm": None, "y_utm": None, "z_rl": None, "coord_source": "none",
        "qa_flags": qa_flag, "source_files": source,
        "_master_x": x, "_master_y": y,
    }
    for fname, _ in FLAG_COLS:
        rec[fname] = 0
    if flags:
        for fl in flags:
            rec[fl] = 1
    add_sample(rec)
    qa["samples_added"].append(f"{sid} ({source})")
    return rec


# 3a. tag 40904 (Petrograph_2023 register + bichiglel; OVD-002 @ 44.2 m)
new_sample("40904", "OVD002", 44.2, None,
           "Petrograph_2023__Sheet1.csv; " + BICH, "2023", "drill core",
           lab="Mireslab", field_lith="gossan",
           qa_flag="absent from Master All sheet",
           flags=["polished_thin_section", "eds"])

# 3b. tag 47153 (bichiglel / Samples-to-Japan; OVD025 51.3-51.4 massive sulphide)
new_sample("47153", "OVD025", 51.3, 51.4,
           BICH + "; Samples_to_Japan sheet", "2024", "drill core",
           field_lith="Massive Sulphide", alt="OVD025-51.3",
           qa_flag="absent from Master All sheet",
           flags=["polished_thin_section"])

# 3c. Sheet3 2024 hole-depth series — all but one are already in "All"
SHEET3 = "Yambat_petrography_samples_2022-2024_from_Core___grab__Sheet3.csv"
sheet3_missing = 0
label_index = set()
for s in samples:
    for a in s["alt_ids"].split("|"):
        a = a.strip()
        label_index.add(a)                      # e.g. 'OVD015-175.5 (A)'
        label_index.add(a.split(" (")[0])       # e.g. 'OVD015-175.5'
    label_index.add(s["sample_id"])
for row in read_csv_rows(MASTER / SHEET3)[2:]:
    if len(row) < 4 or not row[3].strip():
        continue
    sn = row[3].strip()
    hole = norm_hole(row[1], SHEET3)
    if sn in label_index:
        continue
    m = HD_LABEL.match(sn)
    d = float(m.group(2)) if m else ffloat(row[2])
    sheet3_missing += 1
    new_sample(composite_id(hole, d), hole, d, None, SHEET3, "2024",
               "drill core", alt=sn,
               qa_flag="in Sheet3 hole-depth list but absent from Master All; "
                       "possible depth typo of OVD015-175.5 (A)/(B)",
               flags=["polished_thin_section"])

# 3d. 2025 "15ш" report lab numbers absent from All (incl. 43816 = OVD-009 @ 126.6)
with open(WS / "reports2024_2026" / "samples.json", encoding="utf-8") as f:
    recs2426 = json.load(f)
with open(WS / "reports" / "samples.json", encoding="utf-8") as f:
    recs_rep = json.load(f)

for r in recs2426:
    sid = str(r["sample_id"]).strip()
    m = re.match(r"^(\d{5})(?:\s*\((.*)\))?$", sid)
    if not m:
        continue
    tag = m.group(1)
    if tag in tag2sample:
        continue
    hole, d = "", None
    if r.get("drillhole_id"):
        hole = norm_hole(r["drillhole_id"], r["source_file"])
    if m.group(2):                      # e.g. 43816 (OVD-009-126.6)
        hm = HD_LABEL.match(m.group(2).replace(" ", ""))
        if hm:
            hole = norm_hole(hm.group(1), r["source_file"]) or hole
            d = float(hm.group(2))
    d = d if d is not None else r.get("depth_m")
    src = r["source_file"]
    if "MS3" in src:
        ssource, yr, qa_f = "outcrop", "2026", ("MS3 outcrop sample; no coordinates "
                                               "given in source report")
    else:
        ssource = "drill core" if hole else "unknown"
        yr = "2025"
        qa_f = "absent from Master All sheet" + (
            "" if hole else "; no drillhole/depth stated in source report")
    new_sample(tag, hole, d, None, src, yr, ssource,
               lab=str(r.get("analyst_or_lab") or ""), alt=sid if m.group(2) else "",
               petro_lith=str(r.get("rock_name") or ""), qa_flag=qa_f,
               flags=["polished_thin_section"])

# 3e. unlocated 2023-24 report samples: С-1/С-2 and TS-n / Дээж-n
for r in recs_rep:
    if r["record_type"] != "petrographic_description":
        continue
    sid = str(r["sample_id"]).strip()
    if sid.startswith("С-") or sid.startswith("TS-") or sid.startswith("Дээж"):
        canon = (sid.replace("С-", "C-").split(" ")[0]
                 .replace("Дээж-", "DEEJ-"))
        if canon in sample_by_id:
            continue
        new_sample(canon, "", None, None, r["source_file"],
                   (r.get("report_date") or "")[:4], "unknown",
                   lab=str(r.get("analyst_or_lab") or ""), alt=sid,
                   petro_lith=str(r.get("rock_name") or ""),
                   qa_flag="no drillhole/depth/coordinates given in source report",
                   flags=["polished_thin_section" if "ӨТШ" in str(r.get("sample_type"))
                          or "polished" in str(r.get("sample_type") or "")
                          else "thin_section"])

# 3f. grab samples (YT-xx / YM-xx) with X/Y
GRAB = "Yambat_Petrographic_Master_Data__2022-2024_grab.csv"
for row in read_csv_rows(MASTER / GRAB)[2:]:
    if len(row) < 6 or not row[1].strip():
        continue
    sid = row[1].strip()
    if sid in sample_by_id:
        continue
    flags = []
    if len(row) > 12:
        if row[9].strip():
            flags.append("polished_thin_section")
        if row[10].strip():
            flags.append("thin_section")
        if row[11].strip():
            flags.append("asd")
        if row[12].strip():
            flags.append("fluid_incl")
    if "xrd" in row[2].lower():
        flags.append("xrd")
    gx, gy = ffloat(row[3]), ffloat(row[4])
    new_sample(sid, "", None, None, GRAB, "", "grab",
               field_lith=row[5].strip(),
               qa_flag="" if gx is not None else "no X/Y in source grab sheet",
               flags=flags, x=gx, y=gy)

# 3g. 2024 Copper Ridge rockchip samples.
# NOTE: the rockchip sheet's 32 Sample_numbers are the SAME physical samples
# as the numeric-tag / CR-xx rows of the grab sheet (which carries their X/Y)
# — so they are reclassified as 'rockchip' and flag-enriched, not duplicated.
RC = "Yambat_Petrographic_Master_Data__2024_Copper_ridge_rockchip_samp.csv"
n_rc_merged = 0
for row in read_csv_rows(MASTER / RC)[2:]:
    if len(row) < 8 or not row[1].strip():
        continue
    sid = row[1].strip()
    s = sample_by_id.get(sid)
    if s is None:
        s = new_sample(sid, "", None, None, RC, "2024", "rockchip",
                       field_lith=row[2].strip(),
                       qa_flag="rockchip sample; no coordinates in source table",
                       flags=[])
    else:
        n_rc_merged += 1
        s["sample_source"] = "rockchip"
        s["source_files"] += "; " + RC
        s["year"] = s["year"] or "2024"
        if not s["field_lithology"]:
            s["field_lithology"] = row[2].strip()
    if row[3].strip():
        s["polished_thin_section"] = 1
    if row[4].strip():
        s["thin_section"] = 1
    if row[5].strip():
        s["asd"] = 1
    if row[6].strip():
        s["fluid_incl"] = 1
    if row[7].strip() and not s["petro_lithology"]:
        s["petro_lithology"] = row[7].strip()
qa["rockchip_merge"].append(
    f"{n_rc_merged} rockchip-sheet rows merged into existing grab-sheet samples "
    f"(same Sample_numbers; grab sheet supplies their X/Y)")

# ============================================================================
# 4. Coordinates
# ============================================================================

for s in samples:
    h = s["hole_id_norm"]
    if h and h in traces and s["depth_mid_m"] is not None:
        xyz = traces[h].xyz_at(s["depth_mid_m"])
        if xyz:
            s["x_utm"], s["y_utm"], s["z_rl"] = xyz
            s["coord_source"] = "desurvey"
            continue
    if s["_master_x"] is not None and s["_master_y"] is not None:
        s["x_utm"], s["y_utm"] = round(s["_master_x"], 2), round(s["_master_y"], 2)
        s["coord_source"] = "master_xy"
        if h:  # drill sample that could not be desurveyed
            s["qa_flags"] = (s["qa_flags"] + "; collar X/Y used (no desurvey)").strip("; ")
    else:
        s["coord_source"] = "none"
        if "no coordinates" not in s["qa_flags"] and "no drillhole" not in s["qa_flags"]:
            if not s["qa_flags"]:
                s["qa_flags"] = "no coordinates available"
for s in samples:
    s.pop("_master_x"), s.pop("_master_y")

# ============================================================================
# 5. tag <-> hole@depth cross-reference (2023 registers) for description joins
# ============================================================================

tag_xref = {}
for fn, src in [("Drillhole Petrograph_2023__Sheet1.csv", XLSX),
                ("Suggested_Petro_for_the_Oval_2024__Sheet1.csv", MASTER),
                ("Petrograph_2023__Sheet1.csv", MASTER)]:
    rows = read_csv_rows(src / fn)
    for row in rows:
        if len(row) < 3 or not re.fullmatch(r"\d{5}", row[0].strip()):
            continue
        tag = row[0].strip()
        d, _, _ = parse_depth_text(row[1])
        h = norm_hole(row[2], fn)
        if tag not in tag_xref and h:
            tag_xref[tag] = (h, d)

# depth index for hole+depth joins
depth_index = defaultdict(list)
for s in samples:
    if s["hole_id_norm"] and s["depth_from_m"] is not None:
        depth_index[s["hole_id_norm"]].append(s)

# label index for exact hole-depth-label joins (e.g. 'OVD028-38', 'CRS01A-81')
label2sample = {}
for s in samples:
    keys = {s["sample_id"]}
    for a in s["alt_ids"].split("|"):
        a = a.strip()
        if a:
            keys.add(a)
            keys.add(a.split(" (")[0])
    if s["hole_id_norm"] and s["depth_from_m"] is not None:
        dtxt = "%g" % s["depth_from_m"]
        keys.add(f"{s['hole_id_norm']}-{dtxt}")
        keys.add(f"{s['hole_id_norm']}@{dtxt}")
    for k in keys:
        if k and k not in label2sample:
            label2sample[k] = s


def match_by_label(raw_id):
    """exact match of a hole-depth label after normalizing the hole part."""
    if not raw_id:
        return None
    lab = str(raw_id).split(" (")[0].strip()
    if lab in label2sample:
        return label2sample[lab]
    m = HD_LABEL.match(lab)
    if m and not m.group(4):
        h = norm_hole(m.group(1))
        if h:
            d = m.group(2) + ("-" + m.group(3) if m.group(3) else "")
            for key in (f"{h}-{d}", f"{h}@{d}"):
                if key in label2sample:
                    return label2sample[key]
    return None


def match_by_depth(hole, d, dfrom=None, dto=None, suffix=None, tol=0.3):
    """Find the sample for hole+depth (±tol); prefers exact depth, then a
    slide-suffix (A/B) match among equidistant candidates."""
    cands = []
    for s in depth_index.get(hole, []):
        sf, st_ = s["depth_from_m"], s["depth_to_m"]
        target = d
        if target is None and dfrom is not None:
            target = (dfrom + dto) / 2.0 if dto is not None else dfrom
        if target is None:
            continue
        if st_ is not None and (sf - tol) <= target <= (st_ + tol):
            diff = 0.0
        else:
            diff = abs((sf if sf is not None else 1e9) - target)
        if diff <= tol:
            cands.append((diff, s))
    if not cands:
        return None, ""
    cands.sort(key=lambda t: t[0])
    best = [s for diff, s in cands if abs(diff - cands[0][0]) < 1e-9]
    if len(best) > 1 and suffix:
        sfx = {"А": "A", "Б": "B", "A": "A", "B": "B"}.get(suffix.upper(), suffix.upper())
        for s in best:
            if re.search(r"[\( ]" + sfx + r"\)?(\s*\||$)", s["alt_ids"]):
                return s, "hole+depth+suffix"
    note = "ambiguous: %d equidistant candidates" % len(best) if len(best) > 1 else ""
    return best[0], note


# ============================================================================
# 6. descriptions table
# ============================================================================

descriptions = []


def add_desc(raw_id, raw_hole, raw_depth, source_file, analyst, date, rock_name,
             rock_orig, texture, minerals_json, alteration, opaques, text,
             tag=None, hole=None, d=None, dfrom=None, dto=None, suffix=None,
             qa_notes=""):
    joined, method, note = None, "unmatched", ""
    if tag and str(tag) in tag2sample:
        joined, method = tag2sample[str(tag)], "tag"
    else:
        joined = match_by_label(raw_id)
        if joined is not None:
            method = "label"
        else:
            if (hole is None or d is None) and tag and str(tag) in tag_xref:
                hole, d = tag_xref[str(tag)]
            if hole and (d is not None or dfrom is not None):
                joined, note = match_by_depth(hole, d, dfrom, dto, suffix)
                if joined is not None:
                    method = "hole+depth" if note != "hole+depth+suffix" else note
                    note = "" if note.startswith("hole") else note
    lang = "mn" if is_cyrillic((text or "") + (rock_orig or "")) else "en"
    all_notes = "; ".join(x for x in [qa_notes, note] if x)
    descriptions.append({
        "sample_id": joined["sample_id"] if joined else "",
        "desc_id": f"D{len(descriptions)+1:04d}",
        "raw_sample_id": raw_id or "",
        "raw_hole_id": raw_hole or "",
        "raw_depth": raw_depth if raw_depth is not None else "",
        "source_file": source_file,
        "analyst_or_lab": analyst or "",
        "report_date": date or "",
        "language": lang,
        "rock_name": rock_name or "",
        "rock_name_original": rock_orig or "",
        "texture": texture or "",
        "minerals_json": minerals_json or "",
        "alteration": alteration or "",
        "opaque_minerals": opaques or "",
        "description_text": text or "",
        "join_method": method,
        "qa_notes": all_notes,
    })


# 6a. Petrography bichiglel table (master description sheet)
for row in bich_rows:
    row = row + [""] * (26 - len(row))
    has_desc = any(row[i].strip() for i in (16, 17, 18, 19, 20, 21, 24))
    if not has_desc:
        continue
    sn = row[1].strip()
    tag = sn if re.fullmatch(r"\d{5}", sn) else None
    hole = norm_hole(row[4], BICH)
    dfrom, _, _ = parse_depth_text(row[5])
    dto, _, _ = parse_depth_text(row[6])
    m = HD_LABEL.match(sn)
    suffix = m.group(4) if m else None
    if tag is None and m:
        dfrom = dfrom if dfrom is not None else float(m.group(2))
    text = row[21].strip()
    if row[24].strip():
        text = (text + " | Microscope rock name: " + row[24].strip()).strip(" |")
    minerals = json.dumps({"rock_forming": row[18].strip()}, ensure_ascii=False) \
        if row[18].strip() else ""
    add_desc(sn, row[4], row[5], BICH,
             row[9].strip() or "not stated", "", row[16].strip(), "",
             row[17].strip(), minerals, row[19].strip(), row[20].strip(), text,
             tag=tag, hole=hole, d=dfrom, dfrom=dfrom, dto=dto, suffix=suffix)

# 6b. Drillhole Petrograph_2023 register (Mireslab / Khanlab / Oyunjargal calls)
DP23 = "Drillhole Petrograph_2023__Sheet1.csv"
for row in read_csv_rows(XLSX / DP23)[1:]:
    if len(row) < 8 or not row[0].strip():
        continue
    d, _, _ = parse_depth_text(row[1])
    add_desc(row[0].strip(), row[2], row[1], DP23, row[6].strip(), "",
             row[7].strip(), "", "", "", "", "", row[7].strip(),
             tag=row[0].strip(), hole=norm_hole(row[2], DP23), d=d,
             qa_notes="" if row[7].strip() else "empty petrographic determination")

# 6c. MIRESL 2023-08-16 summary
MIR = "Petrograph_MIRESL20230816_summary__Summary Table.csv"
for row in read_csv_rows(XLSX / MIR)[1:]:
    if len(row) < 13 or not row[0].strip():
        continue
    d, _, _ = parse_depth_text(row[1])
    alte = " — ".join(x for x in [row[7].strip(), row[8].strip()] if x)
    opaq = "; ".join(x for x in [row[10].strip(),
                                 ("unknown: " + row[11].strip()) if row[11].strip() else "",
                                 ("other opaques: " + row[12].strip()) if row[12].strip() else ""] if x)
    add_desc(row[0].strip(), row[2], row[1], "Petrograph_MIRESL20230816_summary.xlsx",
             "MIRESL (Mireslab Mongol LLC)", "2023-08-16", row[6].strip(), "",
             "", "", alte, opaq,
             f"Lithofacies: {row[6].strip()}. MIRESL sample code {row[5].strip()}.",
             tag=row[0].strip(), hole=norm_hole(row[2], MIR), d=d)

# 6d. Samples-to-Japan sheet (micro-descriptions)
JAP = "Yambat_petrography_samples_2022-2024_from_Core___grab__Samples_to_Japan.csv"
for row in read_csv_rows(MASTER / JAP)[2:]:
    row = row + [""] * (11 - len(row))
    if not row[1].strip() or not row[8].strip():
        continue
    sn = row[1].strip()
    tag = sn if re.fullmatch(r"\d{5}", sn) else None
    m = HD_LABEL.match(row[3].strip() or sn)
    hole = norm_hole(row[2], JAP)
    d = float(m.group(2)) if m else None
    minerals = json.dumps({"rock_forming": row[10].strip()}, ensure_ascii=False) \
        if row[10].strip() else ""
    add_desc(sn, row[2], row[3], JAP, "not stated", "", row[8].strip(), "",
             row[9].strip(), minerals, "", "", row[8].strip(),
             tag=tag, hole=hole, d=d)

# 6e. 2022-2025 report descriptions (reports/samples.json)
for r in recs_rep:
    if r["record_type"] != "petrographic_description":
        continue
    sid = str(r["sample_id"]).strip()
    hole_raw = (r.get("drillhole_id") or "").split(" ")[0]
    hole = norm_hole(hole_raw, r["source_file"])
    # unlocated report samples were added as samples in 3e -> join by canonical id
    canon = sid.replace("С-", "C-").split(" ")[0].replace("Дээж-", "DEEJ-")
    tag = r.get("lab_tag")
    if tag is None and canon in sample_by_id and not hole:
        tag = None
    minerals = json.dumps(r.get("minerals"), ensure_ascii=False) if r.get("minerals") else ""
    joined_note = ""
    add_desc(sid, hole_raw, r.get("depth_m"), r["source_file"],
             r.get("analyst_or_lab"), r.get("report_date"),
             r.get("rock_name"), r.get("rock_name_original"), r.get("texture"),
             minerals, r.get("alteration"), r.get("mineralization"),
             r.get("description_summary"),
             tag=tag, hole=hole, d=r.get("depth_m"),
             dfrom=r.get("depth_from_m"), dto=r.get("depth_to_m"),
             qa_notes=joined_note)
    # unlocated samples: manual join via canonical id
    dd = descriptions[-1]
    if not dd["sample_id"] and canon in sample_by_id:
        dd["sample_id"] = canon
        dd["join_method"] = "report id"

# 6f. 2024-2026 report descriptions (reports2024_2026/samples.json)
for r in recs2426:
    sid = str(r["sample_id"]).strip()
    tag = None
    m = re.search(r"\((\d{5})\)", sid)
    if m:
        tag = m.group(1)
    elif re.match(r"^(\d{5})\b", sid):
        tag = re.match(r"^(\d{5})\b", sid).group(1)
    hole = norm_hole(r.get("drillhole_id") or "", r["source_file"])
    sfx = None
    ms = re.search(r"(?:[ .\-(]|(?<=\d))([ABАБab])\)?$",
                   sid.replace("(There was 2)", "").strip())
    if ms:
        sfx = ms.group(1)
    minerals = json.dumps(r.get("minerals"), ensure_ascii=False) if r.get("minerals") else ""
    add_desc(sid, r.get("drillhole_id"), r.get("depth_m") or r.get("depth_from_m"),
             r["source_file"], r.get("analyst_or_lab"), r.get("report_date"),
             r.get("rock_name"), r.get("rock_name_original"), r.get("texture"),
             minerals, r.get("alteration"), r.get("opaque_minerals"),
             r.get("description_summary"),
             tag=tag, hole=hole, d=r.get("depth_m"),
             dfrom=r.get("depth_from_m"), dto=r.get("depth_to_m"), suffix=sfx)

# known Crawford issues -> qa notes on unmatched
for dd in descriptions:
    if dd["join_method"] == "unmatched" and "Crawford" not in dd["qa_notes"]:
        if dd["raw_sample_id"].startswith("OVD021@101.5"):
            dd["qa_notes"] = ("probably OVD011-101.5 (tag 42027): Crawford set "
                              "contains no other OVD021@101.5 source sample; "
                              "leucogabbro dyke QA flag in Crawford report")
        if dd["raw_sample_id"].startswith("OVD009@178-180"):
            dd["qa_notes"] = ("untagged Crawford suggestion; Crawford flags "
                              "'wholerock assay does not match this thin section'"
                              " (suspected swap)")
        if dd["raw_sample_id"].startswith("OVD003@202"):
            dd["qa_notes"] = "untagged Crawford extra suggestion (Low MgO gabbro)"
        if dd["raw_sample_id"].strip() == "OVD20-121":
            dd["qa_notes"] = ("41-report id inconsistency: its microphoto is "
                              "captioned '21-121', so this is most likely "
                              "OVD021-121 (tag 43251); OVD020 has no sample at "
                              "121 m — left unmatched rather than force-joined")

# ============================================================================
# 7. Lookups
# ============================================================================

# 7a. hole aliases
lu_hole_alias = []
for raw in sorted(hole_alias_norm):
    lu_hole_alias.append({
        "hole_id_raw": raw,
        "hole_id_norm": hole_alias_norm[raw],
        "changed": 0 if raw == hole_alias_norm[raw] else 1,
        "seen_in": "; ".join(sorted(x for x in hole_alias_seen[raw] if x)),
    })

# 7b. labs
LAB_CANON = [
    ("Altantsetseg", "Altantsetseg (ABM/Aventura in-house petrographer)", "ABM in-house"),
    ("SHUTIS", "MUST — Mongolian University of Science & Technology (ШУТИС)", "university lab"),
    ("MUST", "MUST — Mongolian University of Science & Technology (ШУТИС)", "university lab"),
    ("MIRES", "Mireslab Mongol LLC (MIRESL)", "commercial lab"),
    ("Mireslab", "Mireslab Mongol LLC (MIRESL)", "commercial lab"),
    ("MIRESL", "Mireslab Mongol LLC (MIRESL)", "commercial lab"),
    ("Khanlab", "Khanlab LLC (KhanAltai)", "commercial lab"),
    ("NUM", "National University of Mongolia (МУИС/NUM; L.Jargal PhD)", "university lab"),
    ("MUIS", "National University of Mongolia (МУИС/NUM; L.Jargal PhD)", "university lab"),
    ("Oyunjargal", "Oyunjargal (project geologist, in-house)", "in-house"),
    ("Innova", "Innova Mineral LLC", "commercial lab"),
    ("ThinSection", "ThinSection Mongolia LLC", "commercial lab"),
    ("Жаргал", "National University of Mongolia (МУИС/NUM; L.Jargal PhD)", "university lab"),
    ("Crawford", "Dr Anthony J Crawford (A & A Crawford Geological Research)", "consultant"),
]


def canon_lab(raw):
    for key, canon, role in LAB_CANON:
        if key.lower() in str(raw).lower():
            return canon, role
    return "", ""


lab_raws = Counter()
for s in samples:
    if s["petrographer_lab"]:
        lab_raws[s["petrographer_lab"]] += 1
for dsc in descriptions:
    if dsc["analyst_or_lab"]:
        lab_raws[dsc["analyst_or_lab"]] += 1
lu_lab = []
for raw, n in sorted(lab_raws.items()):
    canon, role = canon_lab(raw)
    lu_lab.append({"lab_raw": raw, "lab_canonical": canon or raw,
                   "role": role or "unresolved", "n_records": n})

# 7c. rock types
ROCK_RULES = [
    ("massive sulfide / ore", r"massive sulph|massive sulf|net.?texture|semi.?massive|цул сульфид"),
    ("gossan / oxidized", r"gossan|limonit|госсан|oxidiz|oxidaz|hematite and limonite"),
    ("peridotite / ultramafic", r"peridot|wehrlite|dunite|lherzol|верлит|перидотит|picrite|websterite|pyroxenite|пироксенит|olivinite|serpentinit"),
    ("hornblendite", r"hornblendite|горнблендит"),
    ("olivine gabbro / melagabbro", r"olivine gabbro|melanocratic gabbro|melagabbro|оливин габбро|меланократ"),
    ("gabbro / gabbronorite / norite", r"gabbro(?!diorite)|norite|габбро(?!диорит)|норит"),
    ("gabbrodiorite", r"gabbrodiorite|габбродиорит"),
    ("diorite / quartz diorite", r"diorite|диорит"),
    ("granitoid", r"granodiorite|granite|гранодиорит|гранит|monzonit|syenit"),
    ("dolerite / diabase / basalt dyke", r"doleri|diabase|basalt|долерит|диабаз|базальт"),
    ("volcanic / subvolcanic", r"andesi|rhyoli|dacite|tuff|volcan|porphyry(?! system)|андезит|риолит|дацит|туф|субвулкан|felsic"),
    ("schist / phyllite", r"schist|phyllite|сланец|филлит"),
    ("hornfels / spotted rock", r"spotted|hornfels|роговик"),
    ("sediment / metasediment", r"sandstone|siltstone|argillite|mudstone|pelit|sediment|gneiss|песчаник|алевролит|аргиллит|гнейс|метаморф"),
    ("breccia / fault rock", r"breccia|fault|брекчи|разлом"),
    ("vein / quartz", r"quartz vein|vein|кварц(?!ит)"),
]


def rock_group(name):
    s = str(name).lower()
    if not s.strip():
        return ""
    for grp, pat in ROCK_RULES:
        if re.search(pat, s):
            return grp
    return "other / unclassified"


rock_counter = Counter()
for s in samples:
    for v in (s["field_lithology"], s["petro_lithology"], s["iogas_lithology"]):
        if v.strip():
            rock_counter[v.strip()] += 1
for dsc in descriptions:
    if dsc["rock_name"].strip():
        rock_counter[dsc["rock_name"].strip()] += 1
lu_rock_type = [{"rock_name_original": k, "rock_group": rock_group(k),
                 "n_occurrences": n}
                for k, n in sorted(rock_counter.items(), key=lambda t: (-t[1], t[0]))]

# also standardized group on samples
for s in samples:
    s["rock_group"] = rock_group(s["petro_lithology"] or s["field_lithology"])

# ============================================================================
# 8. sources.csv registry
# ============================================================================

SOURCES = [
    ("Yambat Petrographic Master Data.xlsx", "1lG0hZDsnslLbezFCw34bx6f_bZn3YJ4w",
     "master sample table (All sheet = spine; grab & rockchip sheets)"),
    ("Yambat petrography samples 2022-2024 from Core & grab.xlsx", "1y25l1orJYDXQjXNupiht93Wg7Tr17Ste",
     "working workbook: bichiglel description table, Sheet3, phase sheets, Samples-to-Japan"),
    ("Collar_all_combined.csv", "1MxtDUzpvCtD9Nbi9IODl8EmXQOLCgvh2",
     "drillhole collars (76 holes) — location authority"),
    ("Survey_all_YMB.csv", "1fqyguCqRGnMgmuTm8pJbuPPmFTo3OMf0",
     "downhole surveys (1,990 rows) — desurvey input"),
    ("Khanlab_petrography_Samples.xlsx", "1W3XRRKAl-s3UAJY9ZpEal1rZjToOw0uh",
     "Khanlab assay verification table (hole@depth keyed; context only)"),
    ("PETRO LIST 2025.xlsx", "1X95MBGNX1QTlsDtQ26fcaXHIJIecNO1O",
     "2025 phase-3 sample list (subset of Master All)"),
    ("Petrograph_2023.xlsx (v3)", "1hLNU5HcF31MqC9LaTzQ4rn6qFQ1flvB3",
     "2023 sample register — source of tag 40904"),
    ("Suggested Petro for the Oval 2024.xlsx", "1bR-8vDiTDOcK4RclatPAGfHOIj-Y7Rct",
     "AJC/Tony Christie tag<->hole@depth cross-reference"),
    ("Drillhole Petrograph_2023.xlsx", "1gUTrLiQm_mVlDuPpeIpjaHLlXvxgYHvl",
     "2023 register of 50 drill-core petrography determinations (3 labs)"),
    ("Petrograph_MIRESL20230816_summary.xlsx", "1WoLN-IjSNCLeOxNqkBHa8S9UXbzHwloF",
     "MIRESL 2023-08-16 summary: lithofacies/alteration/ore-mineral detail"),
    ("Петрограф008.docx", "1tw3IOr7TudHqMDZz22kbLw2BvtTgugtK",
     "Khanlab 2024 Mongolian descriptions, 12 samples (ӨТШ)"),
    ("AM_ThinSectionMongolia_Report_2024.pdf", "1mNAkW0F0qWUuq2vDpBnjOtZ5oEcfESYj",
     "ThinSection Mongolia 2024 report, 8 unlocated samples (TS-n/Дээж-n)"),
    ("2023-08-06-2 шлиф.pdf", "1UONp87cloKEolNq0fNTAcR_WPXKZMaJE",
     "L.Jargal 2023 descriptions of С-1/С-2 (unlocated)"),
    ("2023-06-20-3 thin sections.pdf", "1kkEQHYDCdr7ckB7d7xv7zssmCIkEGpU-",
     "L.Jargal/Ragnarok 2023 descriptions of tags 40763/40900/40913"),
    ("Asian Battery Metals March 2025 The Oval Summary Report.pdf", "1HQZSTrXY79Q10i0cLzdl1Ug5Zp9POr9z",
     "Crawford 2025 petrographic report — 38 samples (English)"),
    ("Review of Work on 'The Oval' Ni-CU Target Revised March 2025.pdf", "1oLGiwQWcY8r_S9nhTHozPrDgJhzkjzss",
     "Crawford review (context; no per-sample descriptions)"),
    ("FW_ Petrology - Oval Nickel Project.zip", "1n_jRl5VBRsIzcX8KFezy7IznoPbUGIL-",
     "email bundle: Suggested Petro xlsx + assay table + May-2024 review"),
    ("English Petrographic and Mineragraphic Descriptions. 6.docx", "1oaodEQTEk0STZ9sRQ0X9ysVSqs4arRxc",
     "2024 descriptions, 6 samples (superseded by 41-sample report)"),
    ("English Petrographic and Mineragraphic description. 15.docx", "1H4Afka4AW1Irumg9EYs2XIw5n2rRa4Ga",
     "Innova Mineral 2024 descriptions, 15 samples"),
    ("English 41 Petrographic and Mineragraphic description.docx", "1beJzCAEVfCiPwChYtmCDu0vhlxqy4qAV",
     "2024 consolidated descriptions, 41 samples"),
    ("22 р цооног зассан 14ш.docx", "1ogaE3Tl1iDtPXh9h5ZKylOqCqTS58Tvx", "OVD22 descriptions (14)"),
    ("23 р цооног дууссан 9ш.docx", "1Hpn_S6ZrXwAI93crIjVJlKaG6QD6qAv-", "OVD23 descriptions (9)"),
    ("24 р цооног зассан 13ш.docx", "1IehFzGt7P_1swflmBZWZOxwkH0alPxBT", "OVD24 descriptions (13)"),
    ("25 цооног 10ш.docx", "1SkGc5ogH9rFr2AUsZ353aTqoG2OFv4KJ", "OVD25 descriptions (10)"),
    ("26 р цооног 16 ш зассан.docx", "1RmOTmYH2cLctQR66cq2a_j8u1PhOTHMk", "OVD26 descriptions (16)"),
    ("27 р цооног 12ш.docx", "1vPXAWelQlX_bfjQp1jOqa8xwVMsp91U6", "OVD27 descriptions (12)"),
    ("28 ба 29 р цооног 9ш.docx", "1ZwejH5NIjLSqTYBmuRyl5PoCSmgAdsMR", "OVD28+OVD29 descriptions (9)"),
    ("15ш пет-мин бичиглэл. 09.02.docx", "17UhBmihR8HYhLMbUo0qz-myjvxNi7G6y",
     "2025 descriptions, 15 samples (14 unlocated + 43816=OVD009@126.6)"),
    ("5 петрографи баттерей (2).docx", "1JSiTRfddzTDCi4VRso_BGmQKA_S6WVB7", "2025 descriptions, 5 samples"),
    ("Report_ABM 2025.09.09 final.pdf", "1el3ET8WvDjbohD0oJyQJ1CU4Lo7h-0-Z",
     "MUST (ШУТИС) 2025-09-09 report, 22 samples, SEM-EDX"),
    ("BayanSair_Drilling Sample Petrography_12 Sample.docx", "1XSM2M96NX3-UdzGe8csb3RF95jqecbOD",
     "2026 BS001 descriptions (12)"),
    ("MS3_Outcrop Sample_Петрографи-минераграфи 4ш.docx", "1pdeSCucBLmStN5nrRrOUaMwXzr_KpQK-",
     "2026 MS3 outcrop descriptions (4)"),
]
# fix a typo-prone id from inventory directly
_inv = {}
try:
    with open(ROOT / "workspace" / "inventory.json", encoding="utf-8") as f:
        for it in json.load(f):
            _inv[it["title"]] = it["fileId"]
except Exception:
    pass
sources_tbl = []
for title, fid, role in SOURCES:
    fid2 = _inv.get(title, fid)
    sources_tbl.append({"title": title, "drive_fileId": fid2, "role": role})

# ============================================================================
# 9. write outputs
# ============================================================================

SAMPLE_COLS = ["sample_id", "alt_ids", "hole_id_norm", "depth_from_m",
               "depth_to_m", "depth_mid_m", "sample_source", "year",
               "petrographer_lab", "thin_section", "polished_thin_section",
               "asd", "xrd", "eds", "fluid_incl", "epma",
               "field_lithology", "petro_lithology", "iogas_lithology",
               "rock_group", "iogas_no", "x_utm", "y_utm", "z_rl",
               "coord_source", "qa_flags", "source_files"]
DESC_COLS = ["sample_id", "desc_id", "raw_sample_id", "raw_hole_id", "raw_depth",
             "source_file", "analyst_or_lab", "report_date", "language",
             "rock_name", "rock_name_original", "texture", "minerals_json",
             "alteration", "opaque_minerals", "description_text",
             "join_method", "qa_notes"]
COLLAR_COLS = ["hole_id", "project", "prospect", "hole_type", "east", "north",
               "rl", "azimuth", "dip", "start_depth_m", "total_depth_m",
               "start_date", "end_date", "status", "lease", "company",
               "supervisor", "remarks", "edited_date", "crs", "hole_id_raw"]
SURVEY_COLS = ["hole_id", "depth_m", "dip", "azimuth", "grid", "method",
               "survey_company", "survey_date", "hole_id_raw"]

df_samples = pd.DataFrame(samples)[SAMPLE_COLS]
df_desc = pd.DataFrame(descriptions)[DESC_COLS]
df_collar = pd.DataFrame(collar_rows)[COLLAR_COLS]
df_survey = pd.DataFrame(survey_rows)[SURVEY_COLS]
assay_col_names = ["sample_id", "hole_id_norm", "depth_from_m", "depth_to_m"] + \
                  [n for _, n in assay_cols]
for a in assay_records:
    s = sample_by_id.get(a["sample_id"])
    a["hole_id_norm"] = s["hole_id_norm"] if s else ""
    a["depth_from_m"] = s["depth_from_m"] if s else None
    a["depth_to_m"] = s["depth_to_m"] if s else None
df_assay = pd.DataFrame(assay_records)[assay_col_names]
df_alias = pd.DataFrame(lu_hole_alias)
df_lab = pd.DataFrame(lu_lab)
df_rock = pd.DataFrame(lu_rock_type)
df_sources = pd.DataFrame(sources_tbl)

TABLES = {
    "samples": df_samples, "descriptions": df_desc, "collar": df_collar,
    "survey": df_survey, "sample_assays": df_assay,
    "lu_hole_alias": df_alias, "lu_lab": df_lab, "lu_rock_type": df_rock,
    "sources": df_sources,
}

for name, df in TABLES.items():
    df.to_csv(CSVDIR / f"{name}.csv", index=False, encoding="utf-8-sig")

with pd.ExcelWriter(OUT / "Oval_Petrography_DB.xlsx", engine="openpyxl") as xw:
    for name, df in TABLES.items():
        df.to_excel(xw, sheet_name=name, index=False)

db_path = OUT / "Oval_Petrography_DB.sqlite"
if db_path.exists():
    db_path.unlink()
con = sqlite3.connect(db_path)
for name, df in TABLES.items():
    df.to_sql(name, con, index=False)
con.commit()

# ============================================================================
# 10. verification + QA report
# ============================================================================

ver = []
for name, df in TABLES.items():
    n_sql = con.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
    with open(CSVDIR / f"{name}.csv", encoding="utf-8-sig", newline="") as f:
        n_csv = sum(1 for _ in csv.reader(f)) - 1     # CSV records, not lines
    ok = (n_sql == len(df) == n_csv)
    ver.append((name, len(df), n_csv, n_sql, ok))
con.close()

from openpyxl import load_workbook  # noqa: E402
wb = load_workbook(OUT / "Oval_Petrography_DB.xlsx", read_only=True)
xlsx_sheets = wb.sheetnames
wb.close()

# drill samples whose hole exists in collar must have coordinates
uncovered = [s for s in samples
             if s["hole_id_norm"] and s["hole_id_norm"] in collar_by_hole
             and s["coord_source"] != "desurvey"]

# spot checks
spot = []
def _spot(sid):
    s = sample_by_id.get(sid)
    nd = sum(1 for d in descriptions if d["sample_id"] == sid)
    if s:
        spot.append(f"{sid}: hole={s['hole_id_norm']} depth={s['depth_mid_m']} "
                    f"x={s['x_utm']} y={s['y_utm']} z={s['z_rl']} "
                    f"coord={s['coord_source']} descriptions={nd}")
    else:
        spot.append(f"{sid}: NOT FOUND")
_spot("41011")
_spot("47188")
_spot("43816")

n_coord = sum(1 for s in samples if s["x_utm"] is not None)
n_desurv = sum(1 for s in samples if s["coord_source"] == "desurvey")
n_masterxy = sum(1 for s in samples if s["coord_source"] == "master_xy")
jm = Counter(d["join_method"] for d in descriptions)
unmatched = [d for d in descriptions if d["join_method"] == "unmatched"]
src_counts = Counter(d["source_file"] for d in descriptions)
src_match = defaultdict(lambda: [0, 0])
for d in descriptions:
    src_match[d["source_file"]][0] += 1
    if d["join_method"] != "unmatched":
        src_match[d["source_file"]][1] += 1

qa_md = []
qa_md.append("# QA report — Oval Petrography Database")
qa_md.append("")
qa_md.append(f"Built by `scripts/build_database.py` on 2026-08-31 from "
             f"`workspace/extracted/`. CRS: {EPSG_NOTE}.")
qa_md.append("")
qa_md.append("## 1. Row counts (dataframe = csv = sqlite)")
qa_md.append("")
qa_md.append("| table | rows | csv | sqlite | ok |")
qa_md.append("|---|---|---|---|---|")
for name, n, nc, ns, ok in ver:
    qa_md.append(f"| {name} | {n} | {nc} | {ns} | {'OK' if ok else '**MISMATCH**'} |")
qa_md.append("")
qa_md.append(f"xlsx sheets: {', '.join(xlsx_sheets)}")
qa_md.append("")
qa_md.append("## 2. Coordinate coverage")
qa_md.append("")
qa_md.append(f"- samples total: **{len(samples)}**")
qa_md.append(f"- with coordinates: **{n_coord}** ({100*n_coord/len(samples):.1f} %)")
qa_md.append(f"  - desurveyed 3D (x,y,z): {n_desurv}")
qa_md.append(f"  - master/grab X,Y only (z null): {n_masterxy}")
qa_md.append(f"- without coordinates: {len(samples)-n_coord} "
             f"(rockchips w/o coords, unlocated lab-number/TS/C samples)")
qa_md.append(f"- drill-core samples whose hole is in collar but NOT desurveyed: "
             f"**{len(uncovered)}**"
             + ("" if not uncovered else " — " + "; ".join(
                 f"{s['sample_id']} ({s['qa_flags']})" for s in uncovered)))
qa_md.append("")
qa_md.append("## 3. Description join statistics")
qa_md.append("")
qa_md.append(f"- descriptions total: **{len(descriptions)}**; matched: "
             f"**{len(descriptions)-len(unmatched)}** "
             f"({100*(len(descriptions)-len(unmatched))/len(descriptions):.1f} %), "
             f"unmatched: {len(unmatched)}")
qa_md.append(f"- join methods: " + ", ".join(f"{k}: {v}" for k, v in jm.most_common()))
qa_md.append("")
qa_md.append("| source | descriptions | matched |")
qa_md.append("|---|---|---|")
for src, (tot, mat) in sorted(src_match.items()):
    qa_md.append(f"| {src[:70]} | {tot} | {mat} |")
qa_md.append("")
qa_md.append("### Unmatched descriptions")
qa_md.append("")
for d in unmatched:
    qa_md.append(f"- `{d['raw_sample_id']}` ({d['source_file'][:50]}) — "
                 f"{d['qa_notes'] or 'no tag / no matching hole+depth sample'}")
qa_md.append("")
qa_md.append("## 4. Duplicate handling")
qa_md.append("")
for x in qa["dup_rows_dropped"]:
    qa_md.append(f"- dropped: {x}")
for x in qa["dup_tags_split"]:
    qa_md.append(f"- split: {x}")
for x in qa["rockchip_merge"]:
    qa_md.append(f"- merged: {x}")
qa_md.append(f"- Master All formatting rows skipped (no id, no interval): "
             f"{skipped_formatting}")
qa_md.append("")
qa_md.append("## 5. Depth-parse failures")
qa_md.append("")
if qa["depth_parse_failures"]:
    for x in qa["depth_parse_failures"]:
        qa_md.append(f"- {x}")
else:
    qa_md.append("- none")
qa_md.append("")
qa_md.append("## 6. Samples added beyond the Master All spine "
             f"({len(qa['samples_added'])})")
qa_md.append("")
add_counter = Counter(x.split("(", 1)[1].rstrip(")") for x in qa["samples_added"])
for src, n in add_counter.most_common():
    qa_md.append(f"- {src[:90]}: {n}")
qa_md.append("")
qa_md.append("## 7. Hole-ID aliases applied (raw -> normalized)")
qa_md.append("")
changed = [a for a in lu_hole_alias if a["changed"]]
qa_md.append(f"{len(changed)} raw spellings normalized "
             f"(full list in `csv/lu_hole_alias.csv`):")
for a in changed:
    qa_md.append(f"- `{a['hole_id_raw']}` -> `{a['hole_id_norm']}`")
qa_md.append("")
qa_md.append("## 8. Spot checks")
qa_md.append("")
for x in spot:
    qa_md.append(f"- {x}")
qa_md.append("")
qa_md.append("## 9. Known issues carried from sources")
qa_md.append("")
qa_md.extend([
    "- **Crawford 2025 sample/assay mix-up flags** (kept in `descriptions.qa_notes`): "
    "OVD008@88.9m lacks sulfides despite 2.5 %S assay; OVD008@90.5m section "
    "(hbl-phyric basalt) does not match ~30 % pyrrhotite assay; OVD009@178-180m "
    "wholerock assay does not match section (suspected swap with a leucogabbro "
    "dyke like OVD021@101.5m); OVD021@101.5m high-Cr assay has no chromite; "
    "OVD007@55.9m core photo may not match section.",
    "- Crawford notes sub-standard polish on many of the 38 sections; OVD005@40.5 "
    "and @53.0 'far too thin'; OVD021@148.8 sulfides too poorly polished.",
    "- `OVD021@101.5m` (Crawford) is most likely OVD011-101.5 (tag 42027) — the "
    "description is left unmatched rather than force-joined.",
    "- Tag **42808** is printed on two SC04 samples (171.0 m and 280.7 m); the "
    "280.7 m sample is stored as `SC04@280.7`.",
    "- BS001 sample numbering: report prints 45652 on both 380.5 and 380.8 m "
    "(summary suggests 45653); Master All carries a single 45652 row (380-382 m), "
    "the exact duplicate row was dropped.",
    "- `OVD015-175.4` (Sheet3) vs `OVD015-175.5 (A)/(B)` (Master All) — possible "
    "depth typo; kept as a separate sample with a QA flag.",
    "- 14 lab numbers of the 2025 '15ш' report (40340-41363 series) have no "
    "drillhole/depth stated anywhere — samples exist with no location.",
    "- TS-n / Дээж-n (ThinSection Mongolia 2024) and С-1/С-2 (L.Jargal 2023) "
    "samples have no location; ТЦ-1 is listed in that report's TOC but never "
    "described.",
    "- The master workbook's 'rockchip' sheet Sample_numbers duplicate the "
    "numeric-tag / CR-xx rows of the grab sheet (same physical samples): they "
    "were merged, classed `rockchip`, with X/Y from the grab sheet. The master "
    "README's 'tags 43113-43154' description of that sheet is inaccurate.",
    "- The MIRESL summary `Code` column (OVD001-OVD023) is a lab sample code, "
    "NOT a drillhole id.",
    "- Depths of 2023-era registers are point depths written as text ('36m'); "
    "tag 40715 was written '98.2' without the unit.",
    "- Master workbook's own Collar/Survey sheets are stale (68 holes); "
    "Collar_all_combined / Survey_all_YMB (76 holes) are the location authority.",
    "- Survey azimuths are used as grid azimuths (Grid (Orig) = WGS84_46N; "
    "`Azim (UTM)` column is empty in the source).",
    "- Collar data typo: MU2502 End date '10/14/225' (kept verbatim).",
])
qa_md.append("")
(OUT / "QA_report.md").write_text("\n".join(qa_md), encoding="utf-8")

# ============================================================================
# 11. README (schema documentation)
# ============================================================================

readme = f"""# Oval Ni-Cu (Yambat) — Consolidated Petrography Database

Built from the Google Drive petrography/drilling sources of the AZ9 GeoHub
by `scripts/build_database.py`. One row per **physical sample** in `samples`,
one row per **petrographic description** in `descriptions` (a sample can have
several descriptions: Mongolian lab report, Crawford 2025, MIRESL 2023, ...).

- CRS of all coordinates: **{EPSG_NOTE}**
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
| alt_ids | other ids used in sources (`CRS01A-81`, shared tags), `\\|`-separated | бусад дугаарууд |
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
| x_utm, y_utm, z_rl | 3D position at depth_mid_m ({EPSG_NOTE}) | байрлал (X, Y, Z) |
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
| minerals_json | mineral list as JSON (`[{{"mineral":..., "pct":...}}]` or `{{"rock_forming": "Pl, Amph"}}`) |
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
"""
(OUT / "README.md").write_text(readme, encoding="utf-8")

# ============================================================================
# console summary
# ============================================================================
print("== BUILD OK ==")
for name, n, nc, ns, ok in ver:
    print(f"{name:15s} rows={n:5d} csv={nc:5d} sqlite={ns:5d} {'OK' if ok else 'MISMATCH'}")
print(f"samples with coordinates: {n_coord}/{len(samples)} "
      f"({100*n_coord/len(samples):.1f}%)  desurvey={n_desurv} master_xy={n_masterxy}")
print(f"descriptions matched: {len(descriptions)-len(unmatched)}/{len(descriptions)}")
print("uncovered drill samples (hole in collar, no desurvey):", len(uncovered))
for x in spot:
    print("SPOT:", x)
if uncovered:
    for s in uncovered[:10]:
        print("  !", s["sample_id"], s["hole_id_norm"], s["depth_mid_m"], s["qa_flags"])

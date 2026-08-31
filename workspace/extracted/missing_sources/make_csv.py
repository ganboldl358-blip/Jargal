# -*- coding: utf-8 -*-
"""Flatten samples.json -> samples.csv (UTF-8 BOM, minerals as 'mineral:pct; ...')."""
import json, csv, os

OUT = os.path.dirname(os.path.abspath(__file__))
recs = json.load(open(os.path.join(OUT, "samples.json"), encoding="utf-8"))

COLS = ["source_file", "source_fileId", "sample_id", "drillhole_id", "depth", "sample_type",
        "rock_name", "rock_name_original", "texture", "minerals", "alteration",
        "opaque_minerals", "description_summary", "analyst_or_lab", "report_date"]

def flat(ms):
    if not ms:
        return ""
    out = []
    for m in ms:
        name = (m.get("mineral") or "").strip()
        pct = m.get("pct")
        out.append(f"{name}:{pct}" if pct not in (None, "") else name)
    return "; ".join(out)

with open(os.path.join(OUT, "samples.csv"), "w", encoding="utf-8-sig", newline="") as f:
    w = csv.DictWriter(f, fieldnames=COLS, extrasaction="ignore")
    w.writeheader()
    for r in recs:
        row = dict(r)
        row["minerals"] = flat(r.get("minerals"))
        for k in COLS:
            if row.get(k) is None:
                row[k] = ""
        w.writerow(row)
print("rows:", len(recs))

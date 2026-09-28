#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tables_to_csv.py — pull every markdown table out of L1/L2 files into CSV,
with no LLM.  Tables in the old reports (assays, occurrence registers such as
"Хүснэгт №42 МОЛИБДЕНЫ ЭРДЭСЖСЭН ЦЭГҮҮД", coordinates, sample lists) are the
most valuable structured data for L3 and GIS; copying them by script keeps the
numbers exactly as transcribed and costs zero tokens.

Output (UTF-8 with BOM, opens in Excel):
  <out>/<file stem>_p<page>_t<k>.csv   one CSV per table, header = table header,
                                       + columns source_file, page
  <out>/_tables_index.csv              file, page, k, caption (nearest
                                       "Хүснэгт …" line above), rows, cols
"<br>" inside a cell becomes "; ".  A table that runs onto the next page is
two CSVs; the index shows both so they can be joined.

Usage
  py tables_to_csv.py "…\\02_L1_Archive" --only 5000_ --out "…\\04_Structured_Data\\tables"
"""

import argparse
import csv
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from npg_common import is_heading, is_separator_row, is_table_line, read_text, split_pages, table_cells  # noqa: E402


def cell(s):
    return re.sub(r"\s*<br\s*/?>\s*", "; ", s).strip()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="+", help="L1/L2 .md files or folders")
    ap.add_argument("--only", help="only file names containing this text")
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    files = []
    for t in args.targets:
        p = Path(t)
        files += sorted(x for x in p.glob("*.md") if not x.name.startswith("_OLD_")) if p.is_dir() else [p]
    if args.only:
        files = [f for f in files if args.only in f.name]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    index = []
    for f in files:
        _, pages = split_pages(read_text(f))
        for pg in pages:
            k, recent, block = 0, [], []
            for ln in pg["lines"] + [""]:
                if is_table_line(ln):
                    block.append(ln)
                    continue
                if block:
                    k += 1
                    rows = [[cell(c) for c in table_cells(r)] for r in block if not is_separator_row(r)]
                    head, body = rows[0], rows[1:]
                    width = max([len(head)] + [len(r) for r in body])
                    head = head + [f"col_{i + 1}" for i in range(len(head), width)]
                    name = f"{f.stem}_p{pg['page']:03d}_t{k}.csv"
                    with (out / name).open("w", encoding="utf-8-sig", newline="") as fh:
                        w = csv.writer(fh)
                        w.writerow(head + ["source_file", "page"])
                        for r in body:
                            w.writerow(r + [""] * (width - len(r)) + [f.name, pg["page"]])
                    caption = " · ".join(x for x in recent if is_heading(x))
                    index.append([f.name, pg["page"], k, caption, len(body), len(head), name])
                    block, recent = [], []
                s = ln.strip()
                if s and not s.startswith(">"):
                    recent = (recent + [s])[-3:]
    with (out / "_tables_index.csv").open("w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["file", "page", "k", "caption", "rows", "cols", "csv"])
        w.writerows(index)
    print(f"{len(index)} хүснэгт → {out}")


if __name__ == "__main__":
    main()

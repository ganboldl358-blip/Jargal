#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
csv_bom.py — add the UTF-8 BOM to CSV files that lack it, so Excel shows
Cyrillic correctly.  Drive's text upload drops the BOM, so the L3
numbers.csv files arrive without it; run this once on the synced folder.

Usage
  py csv_bom.py "G:\\My Drive\\JG GeoHub\\_00_System\\03_Working\\NPG_Report_Texts\\04_Structured_Data"
  py csv_bom.py <folder> --dry-run
Only files without a BOM are rewritten; content is otherwise byte-identical.
"""

import argparse
import sys
from pathlib import Path

BOM = b"\xef\xbb\xbf"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    n = 0
    for f in sorted(Path(args.folder).glob("*.csv")):
        data = f.read_bytes()
        if data.startswith(BOM):
            continue
        try:
            data.decode("utf-8")
        except UnicodeDecodeError:
            print(f"алгасав (UTF-8 биш): {f.name}")
            continue
        n += 1
        print(("шалгах: " if args.dry_run else "BOM нэмэв: ") + f.name)
        if not args.dry_run:
            f.write_bytes(BOM + data)
    print(f"{n} файл")


if __name__ == "__main__":
    sys.exit(main())

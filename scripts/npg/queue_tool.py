#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
queue_tool.py — read / update _agents\\grok\\QUEUE.md without an LLM.

QUEUE.md is ~26 KB; letting Claude (or Grok/Gemini) read and rewrite it for
every status change burns ~20k tokens each time.  This tool does it locally:

  py queue_tool.py summary                      # 10-line status, per report
  py queue_tool.py next L1                      # next L1 row + Gem/Grok prompt to paste
  py queue_tool.py next L1 --emit api           # ... or the gemini_l1_api.py command
  py queue_tool.py next L2                      # next L2 row: l2_auto command (Mongolian
                                                #   source) or Grok Expert prompt (Russian)
  py queue_tool.py set 5000 071-080 "L1 in progress" --note "Gemini API 2026-09-28"
  py queue_tool.py set 5000 071-080 "L1 done" --note "5000_p071-080_L1_GEMAPI.md, [зөрөө] 3 ш"
  py queue_tool.py auto --rows 5 --with-l2      # UNATTENDED: next 5 L1 rows through the
                                                #   Gemini API, then l2_auto for Mongolian
                                                #   rows; QUEUE updated after each step

Paths: --base (or env NPG_BASE) = ...\\NPG_Report_Texts ; --queue defaults to
<base>\\_agents\\grok\\QUEUE.md.  Before the first change of a day a copy
_OLD_<date>_QUEUE.md is written next to it (the existing convention).
"""

import argparse
import datetime
import os
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from npg_common import STEM_RE, read_text, table_cells  # noqa: E402

DEFAULT_BASE = r"G:\My Drive\JG GeoHub\_00_System\03_Working\NPG_Report_Texts"
RUSSIAN = {"1853", "0057", "0645", "1889", "1663", "1303"}   # need a translating L2
COLS = ["report", "pages", "input", "l1", "l2", "status", "notes"]


def load(qpath):
    lines = read_text(qpath).split("\n")
    rows, in_table = [], False
    for i, ln in enumerate(lines):
        s = ln.strip()
        if s.startswith("| report | pages"):
            in_table = True
            continue
        if in_table and s.startswith("|---"):
            continue
        if in_table and s.startswith("|"):
            cells = table_cells(s)
            if len(cells) >= 7:
                rows.append({"line": i, **dict(zip(COLS, cells[:7]))})
        elif in_table and not s:
            in_table = False
    return lines, rows


def norm_pages(s):
    return re.sub(r"\s+", " ", s.replace("–", "-").replace("—", "-")).strip()


def span(pages):
    nums = [int(x) for x in re.findall(r"\d{1,3}", pages)]
    return (nums[0], nums[-1]) if nums else (0, -1)


def ticks(cell, ext):
    return [t for t in re.findall(r"`([^`]+)`", cell) if t.lower().endswith(ext)]


def eligible(row, level):
    st, notes = row["status"].strip(), row["notes"]
    if level == "L1":
        return st == "todo" and "⛔" not in notes and "in progress" not in notes
    return st.startswith("L1 done") and "in progress" not in notes


def cmd_summary(rows):
    agg = defaultdict(lambda: defaultdict(int))
    for r in rows:
        a, b = span(r["pages"])
        st = r["status"].split("(")[0].strip()
        agg[r["report"]][st] += max(0, b - a + 1)
    print("report  | хуудас төлөвөөр")
    for rep, d in agg.items():
        print(f"{rep:7} | " + ", ".join(f"{k}: {v}" for k, v in sorted(d.items())))
    todo = sum(d.get("todo", 0) for d in agg.values())
    l1d = sum(v for d in agg.values() for k, v in d.items() if k.startswith("L1 done"))
    print(f"L1 хүлээгдэж буй ≈{todo} х. (⛔ мөрүүд орсон) · L2 хүлээгдэж буй (L1 done) ≈{l1d} х.")


def cmd_next(rows, level, emit, base):
    row = next((r for r in rows if eligible(r, level)), None)
    if not row:
        print(f"{level}: авах мөр алга")
        return
    a, b = span(row["pages"])
    print(f"МӨР: {row['report']} х.{row['pages']} · status={row['status']}\n  notes: {row['notes'][:300]}")
    if level == "L1":
        pdfs = ticks(row["input"], ".pdf")
        outs = ticks(row["l1"], ".md")
        m = STEM_RE.match(outs[0]) if outs else None
        rep_stem = m.group("report") if m else row["report"]
        pm = re.search(r"\(PDF х\.((\d+)[^)]*)\)", row["input"])
        if emit == "api" and len(pdfs) == 1:
            start = f' --pdf-start {pm.group(2)}' if pm else ""
            print("\nPowerShell (Gemini API, gemini_l1_api.py-ийн хавтсаас):")
            print(f'py gemini_l1_api.py --pdf "{base}\\{pdfs[0]}" --report {rep_stem} --pages {a}-{b}{start} '
                  f'--out-dir "{base}\\02_L1_Archive" --rules "{base}\\_agents\\grok\\GEMINI_GEM_L1.md"')
        else:
            where = f" (PDF х.{pm.group(1)})" if pm else ""
            print("\nGem/Grok-д хуулах prompt (PDF-ийг @Google Drive-аар зааж/хавсаргана):")
            names = ", ".join(re.split(r"[\\/]", p)[-1] for p in pdfs)
            print(f"QUEUE мөр: {row['report']} х.{row['pages']} = {names}{where}. "
                  f"Гаралтын нэр: {rep_stem}_p{a:03d}-{b:03d}_L1_GEMINI.md. "
                  f"Анхаар: {row['notes'][:200]}. Эхний 2 хуудсаас эхэл.")
        print(f'\nЭхлэхдээ: py queue_tool.py set {row["report"]} "{norm_pages(row["pages"])}" "L1 in progress" --note "<хэрэгсэл>"')
        return
    l1s = [t for t in ticks(row["l1"], ".md") if "_L1" in t]
    if row["report"] not in RUSSIAN:
        print("\nМонгол эх → LLM хэрэггүй, механик L2 (l2_auto.py):")
        for f in l1s:
            print(f'py l2_auto.py "{base}\\02_L1_Archive\\{f}" --out "{base}\\03_L2_Normalized"')
    else:
        print("\nОрос эх → Grok Expert (Geo L2 Project) prompt, L1 файлуудыг хавсаргана:")
        print(f"QUEUE мөр: {row['report']} х.{row['pages']}. L1 хавсаргав: {', '.join(l1s)}. "
              f"х.{a}–{min(a + 5, b)}-аас эхэл (5–6 хуудас/prompt). Glossary-ийн сонгосон хэлбэрийг мөрд.")
        print(f'\nДараа нь шалга: py qa_check.py "{base}\\03_L2_Normalized\\<L2 файл>" --l1 "{base}\\02_L1_Archive\\<L1 файл>"')


def l1_job(row, base):
    """(pdf, report_stem, a, b, pdf_start) for a single-PDF L1 row, else None."""
    pdfs = ticks(row["input"], ".pdf")
    outs = ticks(row["l1"], ".md")
    if len(pdfs) != 1 or not outs or not STEM_RE.match(outs[0]):
        return None
    a, b = span(row["pages"])
    pm = re.search(r"\(PDF х\.(\d+)", row["input"])
    return (str(Path(base).joinpath(*re.split(r"[\\/]", pdfs[0]))),
            STEM_RE.match(outs[0]).group("report"), a, b, pm.group(1) if pm else None)


def cmd_auto(qpath, base, n_rows, with_l2, model):
    here = Path(__file__).resolve().parent
    done = 0
    while done < n_rows:
        lines, rows = load(qpath)
        row = next((r for r in rows if eligible(r, "L1") and l1_job(r, base)), None)
        if not row:
            print("auto: API-аар хийх L1 мөр дууслаа")
            break
        pdf, rep, a, b, start = l1_job(row, base)
        pages = norm_pages(row["pages"])
        cmd_set(qpath, lines, rows, row["report"], pages, "L1 in progress", "Gemini API (auto)")
        cmd = [sys.executable, str(here / "gemini_l1_api.py"), "--pdf", pdf, "--report", rep,
               "--pages", f"{a}-{b}", "--out-dir", str(Path(base) / "02_L1_Archive"),
               "--rules", str(Path(base) / "_agents" / "grok" / "GEMINI_GEM_L1.md")]
        if start:
            cmd += ["--pdf-start", start]
        if model:
            cmd += ["--model", model]
        print("auto:", " ".join(cmd[1:]), flush=True)
        subprocess.run(cmd)
        out = Path(base) / "02_L1_Archive" / f"{rep}_p{a:03d}-{b:03d}_L1_GEMAPI.md"
        lines, rows = load(qpath)
        if not out.exists() or "✔ L1 ТӨГСӨВ" not in read_text(out):
            cmd_set(qpath, lines, rows, row["report"], pages, "todo", f"⏸ API дутуу: {out.name} (дахин auto ажиллуулбал үргэлжилнэ)")
            print("auto: зогсов — алдааг шалга")
            break
        status, note = "L1 done", f"Gemini API, {out.name}"
        if with_l2 and row["report"] not in RUSSIAN:
            r = subprocess.run([sys.executable, str(here / "l2_auto.py"), str(out),
                                "--out", str(Path(base) / "03_L2_Normalized")],
                               capture_output=True, text=True, encoding="utf-8")
            print(r.stdout.strip())
            if r.returncode == 0:
                l2name = out.name.replace("_L1_GEMAPI", "_L2_AUTO")
                status, note = "L2 done", note + f"; {l2name} (l2_auto.py, LLM-гүй)"
        cmd_set(qpath, lines, rows, row["report"], pages, status, note)
        done += 1


def cmd_set(qpath, lines, rows, report, pages, status, note):
    target = [r for r in rows if r["report"] == report and norm_pages(r["pages"]) == norm_pages(pages)]
    if len(target) != 1:
        sys.exit(f"мөр олдсонгүй/давхар: {report} {pages} ({len(target)})")
    r = target[0]
    today = datetime.date.today().isoformat()
    backup = qpath.with_name(f"_OLD_{today}_QUEUE.md")
    if not backup.exists():
        backup.write_text("\n".join(lines), encoding="utf-8")
    r["status"] = status
    if note:
        note = note.replace("|", "/")
        stamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        r["notes"] = (r["notes"].rstrip() + f" · {stamp}: {note}").lstrip(" ·")
    lines[r["line"]] = "| " + " | ".join(r[c] for c in COLS) + " |"
    for i, ln in enumerate(lines):
        if ln.startswith("> Шинэчилсэн:"):
            lines[i] = re.sub(r"Шинэчилсэн: [^·]*", f"Шинэчилсэн: {datetime.datetime.now():%Y-%m-%d %H:%M} UB (queue_tool) ", ln, count=1)
            break
    qpath.write_text("\n".join(lines), encoding="utf-8")
    print(f"✓ {report} {r['pages']}: status = {status}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default=os.environ.get("NPG_BASE", DEFAULT_BASE))
    ap.add_argument("--queue")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("summary")
    n = sub.add_parser("next")
    n.add_argument("level", choices=["L1", "L2"])
    n.add_argument("--emit", choices=["prompt", "api"], default="prompt")
    s = sub.add_parser("set")
    s.add_argument("report")
    s.add_argument("pages", help='e.g. 071-080 or "zzz 001-020"')
    s.add_argument("status")
    s.add_argument("--note")
    au = sub.add_parser("auto")
    au.add_argument("--rows", type=int, default=3, help="how many QUEUE rows to process")
    au.add_argument("--with-l2", action="store_true", help="run l2_auto.py after L1 (Mongolian reports)")
    au.add_argument("--model", help="Gemini model id (else env GEMINI_MODEL)")
    args = ap.parse_args()
    qpath = Path(args.queue or Path(args.base) / "_agents" / "grok" / "QUEUE.md")
    lines, rows = load(qpath)
    if args.cmd == "summary":
        cmd_summary(rows)
    elif args.cmd == "next":
        cmd_next(rows, args.level, args.emit, args.base)
    elif args.cmd == "auto":
        cmd_auto(qpath, args.base, args.rows, args.with_l2, args.model)
    else:
        cmd_set(qpath, lines, rows, args.report, args.pages, args.status, args.note)


if __name__ == "__main__":
    main()

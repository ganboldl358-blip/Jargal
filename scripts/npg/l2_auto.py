#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
l2_auto.py — MECHANICAL L2 for MONGOLIAN-source reports (5000, 5020, 5172 ...).

For a report that is already written in Mongolian, most of L2 is mechanical:
join the typewriter line breaks into paragraphs, add the "(report, х.N)"
citation to every sentence that contains a number, apply the author's
handwritten corrections, unify terminology and redact personal data.  This
script does that with NO LLM, so no Grok / Gemini / Claude quota is spent on
~1,700 Mongolian pages.  Russian-source reports still need a translating L2
(Grok Expert / Gemini) — the script refuses them unless --force.

What it does, per L1 page (### Page N):
  * drops the "> Хэвлэсэн дугаар … · Архивын дугаар …" meta line and puts the
    printed number in the heading:  ### Page 71 (хэвл. 56)
  * joins wrapped lines into paragraphs; list items ("1.", "2)"), tables,
    [FIGURE] lines, headings (ALL CAPS, "Зураг 18", "Хүснэгт №42") stay
    on their own lines; a line ending in "-"/"–" is joined without a space
  * [гараар: хуучин → шинэ] -> шинэ ;  [гараар: текст] -> текст
  * "исэлдлийн" -> "исэлдэлтийн";  "[cite: N]" removed
  * every sentence / list item / figure line with a digit gets
    " (5000, х.71)" appended (never inside "1:200 000"); every table gets a
    citation line under it
  * a sentence carrying [⚠ хувийн мэдээлэл] becomes [хувийн мэдээлэл хасав]
  * keeps [зөрөө: …], [уншигдахгүй], tables and numbers exactly as in L1
Output: <report>_pAAA-BBB_L2_AUTO.md next to --out (never overwrites; _v2 …),
then runs qa_check (number fidelity vs the L1) and prints the result.

Usage
  python l2_auto.py "02_L1_Archive\\5000_p071-080_L1_GEMINI.md" --out 03_L2_Normalized
  python l2_auto.py 02_L1_Archive --only 5000_p1 --out 03_L2_Normalized   # many files
"""

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from npg_common import (CITE_RE, DONE_L1, DONE_L2, LIST_RE, SENT_SPLIT_RE,  # noqa: E402
                        STEM_RE, has_data_digit, is_heading, is_table_line,
                        next_free_path, read_text, resolve_hand, split_pages)

PII = "[⚠ хувийн мэдээлэл]"
TRAIL_RE = re.compile(r"([.!?:;]+)$")
NOTE_ONLY_RE = re.compile(r"^\[[^\]]*\]$")


def clean_line(s, stats):
    s = re.sub(r"\s*\[cite:\s*[^\]]*\]", "", s)
    s, n = resolve_hand(s)
    stats["hand"] += n
    s = re.sub(r"исэлдлийн", "исэлдэлтийн", s)
    s = re.sub(r"Исэлдлийн", "Исэлдэлтийн", s)
    return s


def blocks_of(lines):
    """Group page lines into ('p'|'list'|'head'|'table'|'fig'|'blank', text)."""
    out, cur = [], None

    def flush():
        nonlocal cur
        if cur:
            out.append(tuple(cur))
        cur = None

    for raw in lines:
        s = raw.strip()
        if not s:
            flush()
            out.append(("blank", ""))
        elif is_table_line(s):
            flush()
            out.append(("table", s))
        elif s.startswith("[FIGURE") or s.startswith("#"):
            flush()
            out.append(("fig" if s.startswith("[FIGURE") else "head", s))
        elif is_heading(s):
            flush()
            out.append(("head", s))
        elif LIST_RE.match(s):
            flush()
            cur = ["list", s]
        elif cur:
            sep = "" if re.search(r"\w[-–]$", cur[1]) else " "
            cur[1] = cur[1] + sep + s
        else:
            cur = ["p", s]
    flush()
    return out


def add_tag(sent, tag):
    m = TRAIL_RE.search(sent)
    return sent[:m.start()] + f" ({tag})" + m.group(1) if m else sent + f" ({tag})"


def cite(text, tag, stats, whole=False):
    """Append (tag) to every sentence of `text` that has a data digit and no
    citation; whole=True treats the line as one unit (figure captions)."""
    if NOTE_ONLY_RE.match(text):
        return text
    if whole:
        if has_data_digit(text) and not CITE_RE.search(text):
            stats["cites"] += 1
            return add_tag(text, tag)
        return text
    if PII in text:
        parts = SENT_SPLIT_RE.split(text)
        stats["pii"] += sum(PII in p for p in parts)
        text = " ".join("[хувийн мэдээлэл хасав]" if PII in p else p for p in parts)
    out = []
    for sent in SENT_SPLIT_RE.split(text):
        if has_data_digit(sent) and not CITE_RE.search(sent):
            sent = add_tag(sent, tag)
            stats["cites"] += 1
        out.append(sent)
    return " ".join(out)


def looks_russian(text):
    letters = sum(c.isalpha() for c in text)
    mn = sum(text.count(c) for c in "өүӨҮ")
    return letters > 500 and mn / letters < 0.004


def convert(l1_path, out_dir, force=False):
    l1_path = Path(l1_path)
    text = read_text(l1_path)
    m = STEM_RE.match(l1_path.name)
    if not m:
        raise SystemExit(f"файлын нэр <тайлан>_pAAA-BBB_… хэлбэртэй биш: {l1_path.name}")
    report, a, b = m.group("report"), m.group("a"), m.group("b")
    if looks_russian(text) and not force:
        raise SystemExit(f"{l1_path.name}: орос эх бололтой — l2_auto зөвхөн монгол эхэд. "
                         "Орчуулгатай L2-г Grok Expert/Gemini-ээр хий (эсвэл --force).")
    _, pages = split_pages(text)
    tag_report = re.sub(r"_zzz.*", "", report)
    stats = {"hand": 0, "cites": 0, "pii": 0, "paras": 0}
    out = [f"# {report} х.{a}–{b} — L2 (auto: l2_auto.py)",
           f"> Эх L1: {l1_path.name} · Арга: механик — мөр нэгтгэх, «({tag_report}, х.N)» иш, "
           "гар засвар, нэр томьёо; LLM ашиглаагүй. Тоо, зөрөө, хүснэгт L1-тэй яг адил.", ""]
    for p in pages:
        n, tag = p["page"], f"{tag_report}, х.{p['page']}"
        printed = p["printed"]
        head = f"### Page {n}" + (f" (хэвл. {printed})" if printed and printed not in ("—", "-", "") else "")
        out += [head, ""]
        body = [clean_line(ln, stats) for ln in p["lines"] if not ln.strip().startswith(">")]
        blocks = blocks_of(body)
        for i, (kind, s) in enumerate(blocks):
            if kind == "blank":
                if out[-1] != "":
                    out.append("")
                continue
            if kind == "table":
                out.append(s)
                nxt = blocks[i + 1][0] if i + 1 < len(blocks) else None
                if nxt != "table":
                    out += ["", f"_({tag})_"]
                continue
            if kind in ("p", "list", "fig"):
                stats["paras"] += 1
                s = cite(s, tag, stats, whole=(kind == "fig"))
            out.append(s)
            if kind == "p":
                out.append("")
        if out[-1] != "":
            out.append("")
    out.append(DONE_L2 if DONE_L1 in text else f"⏸ L2 ДУТУУ: х.{pages[-1]['page'] if pages else a} хүртэл")
    target = next_free_path(Path(out_dir) / f"{report}_p{a}-{b}_L2_AUTO.md")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(re.sub(r"\n{3,}", "\n\n", "\n".join(out)).split("\n")) + "\n",
                      encoding="utf-8")
    return target, stats, len(pages)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("l1", nargs="+", help="L1 .md file(s) or a folder")
    ap.add_argument("--out", default=".", help="output folder (03_L2_Normalized)")
    ap.add_argument("--only", help="with a folder: only names containing this text")
    ap.add_argument("--force", action="store_true", help="run even if the text looks Russian")
    ap.add_argument("--no-qa", action="store_true")
    args = ap.parse_args()

    files = []
    for t in args.l1:
        p = Path(t)
        files += sorted(x for x in p.glob("*_L1*.md") if not x.name.startswith("_OLD_")) if p.is_dir() else [p]
    if args.only:
        files = [f for f in files if args.only in f.name]
    import qa_check
    bad = 0
    for f in files:
        target, st, npg = convert(f, args.out, args.force)
        print(f"{f.name} -> {target.name}: {npg} х., {st['paras']} догол/жагсаалт, "
              f"{st['cites']} иш, {st['hand']} [гараар] засвар, {st['pii']} хувийн мэдээлэл хасав")
        if not args.no_qa:
            rep = qa_check.check_file(target, f)
            for e in rep.errors:
                print(f"    E: {e}")
            for w in rep.warnings:
                print(f"    W: {w}")
            bad += bool(rep.errors)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
qa_check.py — zero-token QA for L1 / L2 report-text files.

Replaces "ask an LLM to re-read the file" with deterministic checks, so no
Claude / Grok / Gemini quota is spent on routine review.

L1 checks : end marker, page sequence vs file-name range, page meta line,
            Greek look-alike letters (ΧΙΥ...), chemical symbols typed in
            Cyrillic (Ті, Мо), mixed Cyrillic+Latin words, Latin garbage
            words (leaked PDF text layer), leftover ``` fences, table rows
            whose cell count differs from the header, empty pages.
L2 checks : end marker, leftover [cite:], split map scale "1:200 (..) 000",
            "исэлдлийн" (must be "исэлдэлтийн"), sentences with numbers but
            no "(report, х.N)" citation; with --l1 also page coverage and
            NUMBER FIDELITY (every number of the L1 page must survive in L2,
            and L2 must not contain numbers absent from L1).

Usage
  python qa_check.py FILE_OR_DIR [...]            # one summary line per file
  python qa_check.py 5000_p071-080_L2_GROK.md --l1 5000_p071-080_L1_GEMINI.md
  python qa_check.py 02_L1_Archive --only 5000_p0 -v
  python qa_check.py FILE --json

Exit code 1 when any ERROR was found (usable in scripts / scheduled tasks).
"""

import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from npg_common import (CITE_RE, DONE_L1, DONE_L2, SENT_SPLIT_RE,  # noqa: E402
                        has_data_digit, is_heading, is_separator_row,
                        iter_tables, parse_stem, read_text, resolve_hand,
                        split_pages, table_cells)

GREEK_LOOKALIKE = set("ΑΒΕΖΗΙΚΜΝΟΡΤΥΧαοικνρτυχ")
GREEK_RE = re.compile(r"[Ͱ-Ͽ]")
CYR_RE = re.compile(r"[Ѐ-ӿ]")
LAT_RE = re.compile(r"[A-Za-z]")
CYR2LAT = str.maketrans("АВЕКМНОРСТХаеорсухіІ", "ABEKMHOPCTXaeopcyxiI")
ELEMENTS = set("""H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr
Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn
Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir
Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U""".split())
ELEM_TOKEN_RE = re.compile(r"(?<![\w])([A-Za-zА-Яа-яІі]{1,2})(?=\s?-\s?\d)")
WORD_RE = re.compile(r"[A-Za-zЀ-ӿ]+")
ROMAN_RE = re.compile(r"^[IVXLCY]+$")
LATIN_OK = {"FIGURE", "Page", "GROK", "GEMINI", "API", "AUTO", "PDF", "Drive",
            "md", "pdf", "dpi", "jpg", "L1", "L2", "br", "Grok", "Gemini",
            "Pro", "Expert", "Build", "Claude", "part", "zzz", "listiii"}
MARKERS = {"зөрөө": "[зөрөө", "уншигдахгүй": "[уншигдахгүй]",
           "гараар": "[гараар", "FIGURE": "[FIGURE", "ХООСОН": "[ХООСОН"}
NUM_RE = re.compile(r"(?<![A-Za-z])\d+(?:[.,]\d+)*")
SCALE_SPLIT_RE = re.compile(r"1\s?:\s?\d{2,3}\s*\([^)]*х\.[^)]*\)\s*\d{3}")


class Report:
    def __init__(self, path, level):
        self.path, self.level = Path(path), level
        self.errors, self.warnings, self.info = [], [], {}

    def err(self, msg):
        self.errors.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def as_dict(self):
        return {"file": str(self.path), "level": self.level,
                "errors": self.errors, "warnings": self.warnings,
                "info": self.info}


def detect_level(path, text):
    name = path.name.upper()
    if "_L2" in name or DONE_L2 in text or "L2 ДУТУУ" in text:
        return "L2"
    if "GLOSSARY" in name:
        return "GLOSSARY"
    return "L1"


def body_lines(page):
    """Content lines of a page: no meta (>) lines, no blank lines."""
    return [ln for ln in page["lines"] if ln.strip() and not ln.strip().startswith(">")]


def check_common(rep, text, pages, stem):
    if "```" in text:
        rep.err("``` код-блокийн тэмдэг үлдсэн (чатаас хуулахдаа fence-ийг хас)")
    nums = [p["page"] for p in pages]
    if not pages:
        rep.err("'### Page N' гарчиг нэг ч алга")
        return
    dup = sorted(n for n, c in Counter(nums).items() if c > 1)
    if dup:
        rep.err(f"давхардсан хуудас: {dup}")
    if nums != sorted(nums):
        rep.warn("хуудасны дараалал эрэмбэгүй")
    if stem:
        _, a, b = stem
        want = set(range(a, b + 1))
        missing = sorted(want - set(nums))
        extra = sorted(set(nums) - want)
        done = DONE_L1 in text or DONE_L2 in text
        if missing:
            (rep.err if done else rep.warn)(
                f"файлын нэрийн хүрээнд дутуу хуудас: {compress(missing)}")
        if extra:
            rep.warn(f"файлын нэрийн хүрээнээс гадуурх хуудас: {compress(extra)}")
    rep.info["pages"] = len(pages)
    rep.info["markers"] = {k: text.count(v) for k, v in MARKERS.items() if text.count(v)}


def check_l1(rep, text, pages):
    if DONE_L1 not in text and "L1 ДУТУУ" not in text:
        rep.err(f"төгсгөлийн тамга '{DONE_L1}' (эсвэл '⏸ L1 ДУТУУ') алга")
    greek_hits, elem_hits, mixed_hits, latin_hits, table_hits = [], [], [], [], []
    for p in pages:
        if p["printed"] is None:
            rep.warn(f"х.{p['page']}: '> Хэвлэсэн дугаар … · Архивын дугаар …' мөр алга")
        body = [ln for ln in body_lines(p)]
        if not body:
            rep.warn(f"х.{p['page']}: агуулгагүй (хоосон бол [ХООСОН ХУУДАС] гэж бич)")
        for ln in body:
            for ch in GREEK_RE.findall(ln):
                greek_hits.append((p["page"], ch, ln.strip()[:60]))
            for tok in ELEM_TOKEN_RE.findall(ln):
                if CYR_RE.search(tok) and tok.translate(CYR2LAT) in ELEMENTS:
                    elem_hits.append((p["page"], tok))
            for w in WORD_RE.findall(ln):
                has_c, has_l = bool(CYR_RE.search(w)), bool(LAT_RE.search(w))
                if has_c and has_l:
                    mixed_hits.append((p["page"], w))
                elif has_l and not has_c and len(w) >= 3 and w not in LATIN_OK \
                        and not ROMAN_RE.match(w) and w not in ELEMENTS:
                    latin_hits.append((p["page"], w))
        for block in iter_tables(p["lines"]):
            if len(block) < 2:
                continue
            ncol = len(table_cells(block[0]))
            for row in block[1:]:
                if is_separator_row(row):
                    continue
                n = len(table_cells(row))
                if n != ncol:
                    table_hits.append((p["page"], n, ncol, row.strip()[:40]))
    look = [h for h in greek_hits if h[1] in GREEK_LOOKALIKE]
    other = [h for h in greek_hits if h[1] not in GREEK_LOOKALIKE]
    if look:
        rep.err(f"грек үсэг латин/кирилл мэт ({len(look)}): " + examples(
            [f"х.{pg} «{ch}» {ctx}" for pg, ch, ctx in look]))
    if other:
        rep.warn(f"грек тэмдэг ({len(other)}) — эх дээр λ/α мэт тод хэвлэгдсэн эсэхийг шалга: "
                 + examples([f"х.{pg} «{ch}»" for pg, ch, _ in other]))
    if elem_hits:
        rep.err(f"химийн тэмдэг кириллээр ({len(elem_hits)}): "
                + examples([f"х.{pg} {t}" for pg, t in elem_hits]))
    if mixed_hits:
        rep.warn(f"кирилл+латин холилдсон үг ({len(mixed_hits)}): "
                 + examples([f"х.{pg} {w}" for pg, w in mixed_hits]))
    if latin_hits:
        rep.warn(f"латин үг ({len(latin_hits)}) — PDF-ийн хог OCR давхарга орсон эсэхийг шалга: "
                 + examples([f"х.{pg} {w}" for pg, w in latin_hits]))
    if table_hits:
        rep.warn(f"хүснэгтийн мөрийн нүдний тоо толгойноос өөр ({len(table_hits)}) — багана гулссан байж болзошгүй: "
                 + examples([f"х.{pg} {n}≠{c} «{r}»" for pg, n, c, r in table_hits]))


def page_numbers(page, drop_citations=True):
    toks = []
    for ln in body_lines(page):
        s, _ = resolve_hand(ln)
        if drop_citations:
            s = CITE_RE.sub(" ", s)
        s = re.sub(r"\[зөрөө:[^\]]*\]", " ", s)   # L2 may add its own [зөрөө: L1=.., зураг=..]
        s = re.sub(r"<br\s*/?>", " ", s)
        toks += NUM_RE.findall(s)
    return Counter(toks)


def check_l2(rep, text, pages, l1_pages=None):
    if DONE_L2 not in text and "L2 ДУТУУ" not in text:
        rep.err(f"төгсгөлийн тамга '{DONE_L2}' (эсвэл '⏸ L2 ДУТУУ') алга")
    if "[cite:" in text:
        rep.err(f"'[cite:' үлдсэн ({text.count('[cite:')})")
    sc = SCALE_SPLIT_RE.findall(text)
    if sc:
        rep.err(f"масштаб ишлэлээр таслагдсан ({len(sc)}): " + examples(sc))
    n_old = len(re.findall(r"исэлдлийн", text, re.I))
    if n_old:
        rep.warn(f"«исэлдлийн» {n_old} удаа → «исэлдэлтийн» болго")
    uncited, total = [], 0
    for p in pages:
        lines = p["lines"]
        for i, ln in enumerate(lines):
            s = ln.strip()
            if not s or s.startswith((">", "#", "[FIGURE", "|", "_(")) or is_heading(s) \
                    or re.fullmatch(r"\[[^\]]*\]", s) or not re.search(r"\d", s):
                continue
            for sent in SENT_SPLIT_RE.split(s):
                if has_data_digit(sent):
                    total += 1
                    if not CITE_RE.search(sent):
                        uncited.append((p["page"], sent[:50]))
        tbl_ends = [i for i, ln in enumerate(lines)
                    if ln.strip().startswith("|") and (i + 1 == len(lines) or not lines[i + 1].strip().startswith("|"))]
        for i in tbl_ends:
            near = " ".join(lines[max(0, i - 40): i + 4])
            if not CITE_RE.search(near):
                uncited.append((p["page"], "[хүснэгт иштэй биш]"))
    rep.info["numeric_sentences"] = total
    if uncited:
        rep.warn(f"тоотой боловч «(тайлан, х.N)» ишгүй өгүүлбэр {len(uncited)}/{total}: "
                 + examples([f"х.{pg} «{s}»" for pg, s in uncited]))
    if l1_pages is not None:
        l1_by = {p["page"]: p for p in l1_pages}
        l2_by = {p["page"]: p for p in pages}
        miss = sorted(set(l1_by) - set(l2_by))
        if miss and DONE_L2 in text:
            rep.err(f"L1-д байгаа боловч L2-т алга хуудас: {compress(miss)}")
        lost, added = [], []
        for n in sorted(set(l1_by) & set(l2_by)):
            a, b = page_numbers(l1_by[n]), page_numbers(l2_by[n])
            lost += [(n, k) for k in (a - b)]
            added += [(n, k) for k in (b - a)]
        if lost:
            rep.warn(f"ТООНЫ ҮНЭНЧ БАЙДАЛ: L1-ийн тоо L2-т алга ({len(lost)}): "
                     + examples([f"х.{pg} {k}" for pg, k in lost], 8))
        if added:
            rep.warn(f"ТООНЫ ҮНЭНЧ БАЙДАЛ: L2-т L1-д байхгүй тоо ({len(added)}): "
                     + examples([f"х.{pg} {k}" for pg, k in added], 8))
        rep.info["number_fidelity"] = {"lost": len(lost), "added": len(added)}


def compress(nums):
    out, start, prev = [], None, None
    for n in nums:
        if start is None:
            start = prev = n
        elif n == prev + 1:
            prev = n
        else:
            out.append(f"{start}" if start == prev else f"{start}-{prev}")
            start = prev = n
    if start is not None:
        out.append(f"{start}" if start == prev else f"{start}-{prev}")
    return ",".join(out)


def examples(items, k=5):
    s = "; ".join(items[:k])
    return s + (f"; … (+{len(items) - k})" if len(items) > k else "")


def check_file(path, l1=None):
    path = Path(path)
    text = read_text(path)
    level = detect_level(path, text)
    rep = Report(path, level)
    if level == "GLOSSARY":
        return rep
    _, pages = split_pages(text)
    check_common(rep, text, pages, parse_stem(path.name))
    if level == "L1":
        check_l1(rep, text, pages)
    else:
        l1_pages = split_pages(read_text(l1))[1] if l1 else None
        check_l2(rep, text, pages, l1_pages)
    return rep


def collect(targets, only):
    files = []
    for t in targets:
        p = Path(t)
        if p.is_dir():
            files += sorted(x for x in p.glob("*.md") if not x.name.startswith("_OLD_"))
        else:
            files.append(p)
    if only:
        files = [f for f in files if only in f.name]
    return files


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("targets", nargs="+", help="L1/L2 .md files or folders")
    ap.add_argument("--l1", help="matching L1 file (for an L2 target): page coverage + number fidelity")
    ap.add_argument("--only", help="only files whose name contains this text")
    ap.add_argument("-v", "--verbose", action="store_true", help="print warnings too (default: errors only)")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    reps = [check_file(f, args.l1) for f in collect(args.targets, args.only)]
    if args.json:
        print(json.dumps([r.as_dict() for r in reps], ensure_ascii=False, indent=1))
    else:
        for r in reps:
            status = "ERROR" if r.errors else ("warn " if r.warnings else "OK   ")
            mk = " ".join(f"{k}={v}" for k, v in r.info.get("markers", {}).items())
            print(f"{status} {r.level} {r.path.name}  pages={r.info.get('pages', 0)}  "
                  f"E={len(r.errors)} W={len(r.warnings)}  {mk}")
            for e in r.errors:
                print(f"    E: {e}")
            if args.verbose or len(reps) == 1:
                for w in r.warnings:
                    print(f"    W: {w}")
    sys.exit(1 if any(r.errors for r in reps) else 0)


if __name__ == "__main__":
    main()

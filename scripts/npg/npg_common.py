#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
npg_common.py — shared helpers for the NPG report-text pipeline
(L1 = verbatim page transcription, L2 = normalized Mongolian with citations).

Pure standard library.  Used by qa_check.py, l2_auto.py, tables_to_csv.py,
queue_tool.py and gemini_l1_api.py.
"""

import re
import sys
from pathlib import Path

# Windows: Cyrillic output must not crash when redirected to a log file
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

PAGE_RE = re.compile(r"^###\s+Page\s+(\d+)\b(.*)$")
META_RE = re.compile(r"^>\s*Хэвлэсэн дугаар:\s*([^·]*)·\s*Архивын дугаар:\s*([^·]*)")
DONE_L1 = "✔ L1 ТӨГСӨВ"
DONE_L2 = "✔ L2 ТӨГСӨВ"
# "5000_p071-080_L1_GROK.md" -> report 5000, pages 71..80
STEM_RE = re.compile(r"^(?P<report>[0-9A-Za-z]+(?:_zzz(?:-43listiii)?)?)_p(?P<a>\d{1,3})-(?P<b>\d{1,3})")
CITE_RE = re.compile(r"\((?P<rep>[0-9A-Za-z_\-]+),\s*х\.\s*\d+(?:\s*[–-]\s*\d+)?\)")
# sentence boundary: . ! ? after a 3+ char token, then space + capital/digit/bracket
# (keeps "х.71", "Д. Бат", "г.м." and "0,005" in one sentence)
SENT_SPLIT_RE = re.compile(r"(?<=[^\s.]{3}[.!?])\s+(?=[А-ЯЁӨҮA-Z0-9«\"(\[])")
LIST_RE = re.compile(r"^(\d{1,2}|[а-яё])\s*[.)]\s+\S", re.I)
LIST_MARK_RE = re.compile(r"^\s*(\d{1,2}|[а-яё])\s*[.)]\s+", re.I)
CAPTION_RE = re.compile(r"^(Зураг|Хүснэгт|Таблица|Рис\.?|Фото|Хавсралт)\b")
HAND_RE = re.compile(r"\[гараар:\s*([^\]]*?)\s*(?:→|->)\s*([^\]]*?)\s*\]")
HAND1_RE = re.compile(r"\[гараар:\s*([^\]]*?)\s*\]")
END_MARK_RE = re.compile(r"^\s*(✔ L[12] ТӨГСӨВ|⏸ L[12] ДУТУУ.*)\s*$")


def is_heading(s):
    """ALL-CAPS title line, or a caption line such as 'Зураг 18', 'Хүснэгт №42'."""
    s = s.strip()
    letters = [c for c in s if c.isalpha()]
    return (len(letters) >= 4 and all(c.isupper() for c in letters)) or bool(CAPTION_RE.match(s))


def resolve_hand(s):
    """[гараар: хуучин → шинэ] -> шинэ ; [гараар: текст] -> текст.  Returns (text, n)."""
    s, n1 = HAND_RE.subn(lambda m: m.group(2), s)
    s, n2 = HAND1_RE.subn(lambda m: m.group(1), s)
    return s, n1 + n2


def has_data_digit(s):
    """True if `s` has a digit outside citations and outside a leading list number."""
    s = LIST_MARK_RE.sub("", CITE_RE.sub("", s))
    return bool(re.search(r"\d", s))


def read_text(path):
    """Read a UTF-8 (optionally BOM) markdown file; normalize newlines."""
    return Path(path).read_text(encoding="utf-8-sig").replace("\r\n", "\n")


def parse_stem(name):
    """Return (report, first_page, last_page) from a file name, or None."""
    m = STEM_RE.match(Path(name).name)
    if not m:
        return None
    return m.group("report"), int(m.group("a")), int(m.group("b"))


def split_pages(text):
    """Split an L1/L2 markdown file into a header block and page sections.

    Returns (header_lines, pages) where pages is a list of dicts:
      {"page": int, "heading": str, "printed": str|None,
       "archive": str|None, "lines": [str, ...]}
    `lines` excludes the '### Page N' heading line itself.
    """
    header, pages, cur = [], [], None
    for line in text.split("\n"):
        m = PAGE_RE.match(line.strip())
        if m:
            cur = {"page": int(m.group(1)), "heading": line.strip(),
                   "printed": None, "archive": None, "lines": []}
            pages.append(cur)
            continue
        if cur is None:
            header.append(line)
            continue
        if END_MARK_RE.match(line):
            continue
        mm = META_RE.match(line.strip())
        if mm and cur["printed"] is None:
            cur["printed"] = mm.group(1).strip()
            cur["archive"] = mm.group(2).strip()
        cur["lines"].append(line)
    return header, pages


def is_table_line(line):
    s = line.strip()
    return s.startswith("|") and s.endswith("|") and s.count("|") >= 2


def table_cells(line):
    """Split a markdown table row into cells (outer pipes removed)."""
    s = line.strip()[1:-1]
    # a pipe escaped as \| stays inside the cell
    parts = re.split(r"(?<!\\)\|", s)
    return [p.strip() for p in parts]


def is_separator_row(line):
    return all(re.fullmatch(r":?-{2,}:?", c or "") for c in table_cells(line))


def iter_tables(lines):
    """Yield lists of consecutive table lines."""
    block = []
    for line in lines:
        if is_table_line(line):
            block.append(line)
        else:
            if block:
                yield block
            block = []
    if block:
        yield block


def next_free_path(path):
    """Never overwrite: foo.md -> foo_v2.md -> foo_v3.md ..."""
    path = Path(path)
    if not path.exists():
        return path
    n = 2
    while True:
        cand = path.with_name(f"{path.stem}_v{n}{path.suffix}")
        if not cand.exists():
            return cand
        n += 1

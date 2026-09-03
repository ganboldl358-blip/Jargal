#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
16_qc_contact_sheet_target.py — T1–T4 цооногийн баганын ВИЗУАЛ QC-д зориулсан contact sheet.

Цооног+загвар бүрийн PDF-ээс 1-р хуудас (толгой, bar, фото) ба сүүлийн хуудас (тайлбар)-ыг
жижигрүүлж, загвар тус бүрээр нэг хуудсанд 5 цооног (2 багана × 5 мөр) байрлуулна.
Гаралт (жижиг — Drive MCP-ээр 10 MB-ийн доор татагдана, cloud-оос Opus/Claude шалгах боломжтой):
    <Out_Target>/_QC_Sheets/QC_<TAG>_<k>.jpg
    <Out_Target>/_QC_Sheets/QC_Target_ContactSheets_<YYYYMMDD>.pdf   (бүх sheet нэг PDF)
    <Out_Target>/_QC_Sheets/QC_Target_Checklist_<YYYYMMDD>.md        (цооног бүрийн шалгах хүснэгт)

Рендер: pymupdf (fitz) байвал PDF-ээс шууд; үгүй бол <Out_Target>/QC_PNG/ доторх PNG (12_ скриптийн QC гаралт)-аас
цооног+загвар таарах эхний/сүүлийн файлыг авна.

Ажиллуулах: py 16_qc_contact_sheet_target.py [--out-target ...] [--dpi 60] [--per-sheet 5] [--date 20260903]
"""
import argparse
import collections
import datetime as dt
import re
import sys
from pathlib import Path

DEFAULT_OUT_TARGET = "D:/AZ9/_00_Work_Logs/Modot-3_StripLog/Out_Target"
HOLE_RE = re.compile(r"^(MTDH-\d{2})_DrillLog_A3L_(T[1-4])(?:_([^_]+(?:-[^_]+)*))?(?:_(\d{4}))?(?:_DRAFT)?\.pdf$", re.I)
TAGS = {"T1": "T1_Zn-Ag", "T2": "T2_Mo-W-Sn", "T3": "T3_Ag-As-Sb", "T4": "T4_GeoLog"}
CHECKS = ["Гарчиг/толгой", "Гүний масштаб", "Bar + босго", "Литологи/өнгө", "Фото тайралт", "Дээж/цоорхой", "Тайлбар хуудас", "Хуудасны тоо"]


def hole_num(h):
    m = re.search(r"(\d+)", h)
    return int(m.group(1)) if m else 0


def discover(out_target: Path):
    found = collections.defaultdict(dict)
    for p in sorted(out_target.glob("MTDH-*/*.pdf")):
        m = HOLE_RE.match(p.name)
        if m:
            hole, tn = m.group(1).upper(), m.group(2).upper()
            prev = found[tn].get(hole)
            if prev is None or ("DRAFT" in prev.name.upper() and "DRAFT" not in p.name.upper()):
                found[tn][hole] = p
    return found


def render_pages_fitz(pdf: Path, dpi: int):
    import fitz  # pymupdf
    from PIL import Image
    doc = fitz.open(str(pdf))
    n = len(doc)
    out = []
    for i in (0, n - 1):
        pix = doc[i].get_pixmap(dpi=dpi, alpha=False)
        out.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    doc.close()
    return out, n


def render_pages_png(out_target: Path, hole: str, tn: str):
    from PIL import Image
    qc = out_target / "QC_PNG"
    cands = sorted([p for p in qc.glob("*.png") if hole in p.name and re.search(tn, p.name, re.I)]) if qc.exists() else []
    if not cands:
        return None, 0
    ims = [Image.open(cands[0]).convert("RGB"), Image.open(cands[-1]).convert("RGB")]
    return ims, len(cands)


def font(size):
    from PIL import ImageFont
    try:
        import matplotlib.font_manager as fm
        return ImageFont.truetype(fm.findfont("DejaVu Sans"), size)
    except Exception:  # noqa
        return ImageFont.load_default()


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out-target", default=DEFAULT_OUT_TARGET)
    ap.add_argument("--qc-dir", default=None, help="default <out-target>/_QC_Sheets")
    ap.add_argument("--dpi", type=int, default=60)
    ap.add_argument("--per-sheet", type=int, default=5)
    ap.add_argument("--date", default=dt.date.today().strftime("%Y%m%d"))
    a = ap.parse_args(argv)
    from PIL import Image, ImageDraw

    out_target = Path(a.out_target)
    if not out_target.exists():
        sys.exit("Out_Target олдсонгүй: %s" % out_target)
    qc_dir = Path(a.qc_dir) if a.qc_dir else out_target / "_QC_Sheets"
    qc_dir.mkdir(parents=True, exist_ok=True)
    try:
        import fitz  # noqa
        use_fitz = True
    except Exception:  # noqa
        use_fitz = False
        print("pymupdf байхгүй → QC_PNG/-оос авна (py -m pip install pymupdf хийвэл PDF-ээс шууд рендер хийнэ)")
    found = discover(out_target)
    f_title, f_lbl, f_small = font(34), font(22), font(16)
    sheets = []
    check_rows = []
    for tn in ["T1", "T2", "T3", "T4"]:
        holes = sorted(found.get(tn, {}), key=hole_num)
        if not holes:
            continue
        for k in range(0, len(holes), a.per_sheet):
            chunk = holes[k:k + a.per_sheet]
            thumbs = []
            for h in chunk:
                pdf = found[tn][h]
                try:
                    ims, n = render_pages_fitz(pdf, a.dpi) if use_fitz else render_pages_png(out_target, h, tn)
                except Exception as e:  # noqa
                    ims, n = None, 0
                    print("  !", h, tn, "рендер алдаа:", e)
                size_mb = pdf.stat().st_size / 1e6
                thumbs.append((h, ims, n, size_mb))
                check_rows.append((tn, h, n, size_mb, pdf.name))
            if not any(t[1] for t in thumbs):
                continue
            w = max(im.width for t in thumbs if t[1] for im in t[1])
            hgt = max(im.height for t in thumbs if t[1] for im in t[1])
            pad, head = 24, 46
            W = 2 * w + 3 * pad
            H = 90 + len(thumbs) * (hgt + head + pad)
            sheet = Image.new("RGB", (W, H), "white")
            d = ImageDraw.Draw(sheet)
            d.text((pad, 18), "QC — Модот-3 T-загвар %s (%s) · %d/%d · %s" % (tn, TAGS[tn], k // a.per_sheet + 1, (len(holes) - 1) // a.per_sheet + 1, a.date), fill="#2F3B52", font=f_title)
            d.text((pad + 0, 62), "зүүн = 1-р хуудас (толгой · bar · литологи · фото) · баруун = сүүлийн хуудас (тайлбар)", fill="#666", font=f_small)
            y = 90
            for (h, ims, n, size_mb) in thumbs:
                d.text((pad, y + 8), "%s · %s · %d х. · %.1f MB · %s" % (h, TAGS[tn], n, size_mb, "PDF" if use_fitz else "QC_PNG"), fill="#111", font=f_lbl)
                if ims:
                    for j, im in enumerate(ims[:2]):
                        x = pad + j * (w + pad)
                        sheet.paste(im, (x, y + head))
                        d.rectangle([x, y + head, x + im.width - 1, y + head + im.height - 1], outline="#999", width=1)
                else:
                    d.text((pad, y + head + 10), "(рендер хийгдсэнгүй)", fill="red", font=f_lbl)
                y += hgt + head + pad
            name = qc_dir / ("QC_%s_%d.jpg" % (TAGS[tn], k // a.per_sheet + 1))
            sheet.save(name, "JPEG", quality=86, optimize=True)
            sheets.append((name, sheet.convert("RGB")))
            print("  %s: %d цооног → %s (%.1f MB)" % (tn, len(chunk), name.name, name.stat().st_size / 1e6))
    if sheets:
        pdf_out = qc_dir / ("QC_Target_ContactSheets_%s.pdf" % a.date)
        first, rest = sheets[0][1], [s for _, s in sheets[1:]]
        first.save(pdf_out, "PDF", resolution=a.dpi, save_all=True, append_images=rest)
        print("PDF:", pdf_out, "%.1f MB" % (pdf_out.stat().st_size / 1e6))
    md = qc_dir / ("QC_Target_Checklist_%s.md" % a.date)
    lines = ["# Модот-3 T1–T4 striplog — визуал QC хүснэгт (%s)" % a.date, "",
             "Contact sheet: `_QC_Sheets/QC_<TAG>_<k>.jpg` (1-р хуудас | тайлбар хуудас). Шалгах зүйл бүрд ✓ / ✗ + тэмдэглэл. "
             "v3.2-т хийсэн Opus QC-тэй ижил: ноцтой (дата буруу, багана давхцсан, фото зөрсөн) → скрипт засаад дахин гаргана; бага (шошго, зай) → нэг удаагийн засвар.", "",
             "| Загвар | Цооног | х. | MB | " + " | ".join(CHECKS) + " | Тэмдэглэл |",
             "|---|---|---:|---:|" + "|".join(["---"] * len(CHECKS)) + "|---|"]
    for tn, h, n, mb, fn in check_rows:
        lines.append("| %s | %s | %d | %.1f | " % (tn, h, n, mb) + " | ".join([""] * len(CHECKS)) + " | |")
    lines += ["", "Нийт: %d PDF (T1 %d · T2 %d · T3 %d · T4 %d)" % (len(check_rows), *[sum(1 for r in check_rows if r[0] == t) for t in ["T1", "T2", "T3", "T4"]])]
    md.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("Хүснэгт:", md)
    return 0


if __name__ == "__main__":
    sys.exit(main())

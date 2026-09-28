#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gemini_l1_api.py — unattended L1 (verbatim page transcription) through the
Gemini API.  Runs on Jak's PC against the Google-Drive-for-desktop folder,
so NO chat quota (Gemini app / Grok) and NO Claude tokens are used, and no
copy-paste: the L1 file is written straight into 02_L1_Archive.

Per QUEUE row it
  1. renders the needed split-PDF pages to grayscale, auto-contrast JPEG
     (the PDF text layer is garbage Latin OCR and is never used),
  2. sends 2 pages per request with the L1 rules as the system instruction,
  3. appends the answer to <report>_pAAA-BBB_L1_GEMAPI.md (resumable: a
     .progress.json beside it remembers finished pages),
  4. writes "✔ L1 ТӨГСӨВ" when every page is in, then runs qa_check.py.

Setup (once, Windows PowerShell)
  py -m pip install google-genai pymupdf pillow
  setx GEMINI_API_KEY "<key from aistudio.google.com/apikey>"
  (open a new PowerShell after setx)

Example — QUEUE row "5000 071–080", split part4 = report pages 61-80:
  $B = "G:\\My Drive\\JG GeoHub\\_00_System\\03_Working\\NPG_Report_Texts"
  py gemini_l1_api.py --pdf "$B\\01_Splits\\5000_1991-95_Mapping200K\\5000_p061-080_5000_part4.pdf" `
     --report 5000 --pages 71-80 --out-dir "$B\\02_L1_Archive" `
     --rules "$B\\_agents\\grok\\GEMINI_GEM_L1.md" --model <gemini-pro-model-id>
  (queue_tool.py next --emit api prints this command for the next row)

  --dry-run   renders the pages and prints the plan + token estimate, no API call.
Check the model id and price on ai.google.dev before a big run.
"""

import argparse
import datetime
import io
import json
import os
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from npg_common import DONE_L1, PAGE_RE, next_free_path  # noqa: E402

PDF_RANGE_RE = re.compile(r"_p(\d{1,3})-(\d{1,3})(?:_|\.pdf$)", re.I)
MAX_SIDE = 3500   # foldout maps: keep each image well under the inline request limit
IMG_TOKENS = {"low": 280, "medium": 560, "high": 1120}   # per image, Gemini 3 tiers (approx.)
API_OUTPUT_RULES = """
ГАРАЛТ (API горим — дээрх чатын гаралтын дүрмийг ОРЛОНО)
- Зөвхөн хүссэн хуудсуудын L1 markdown-ыг бич. Код блок (```), файлын нэр, файлын гарчиг (# ...), тайлбар, «✔ L1 ТӨГСӨВ» БҮҮ бич.
- Хуудас бүр «### Page N» гарчгаар эхэлж, дараагийн мөрөнд «> Хэвлэсэн дугаар: … · Архивын дугаар: … · Эх: <split PDF нэр> (PDF х.<n>)».
- N = хэрэглэгчийн хэлсэн ТАЙЛАНГИЙН хуудас (PDF-ийн хуудас биш).
- Хуудсыг дундуур нь таслахгүй; хүссэн бүх хуудсыг бич.
"""


def load_rules(path):
    """System instruction: the Gem's ````text block if present (without its chat
    GARALT section), else the whole file; then the API output rules."""
    text = Path(path).read_text(encoding="utf-8-sig")
    m = re.search(r"````text\n(.*?)\n````", text, re.S)
    if m:
        text = m.group(1)
        text = re.split(r"\n\s*ГАРАЛТ\s*\n", text)[0]
    return text.strip() + "\n" + API_OUTPUT_RULES


def render(doc, pdf_page, dpi):
    """PDF page (1-based) -> grayscale auto-contrast JPEG bytes."""
    import pymupdf
    from PIL import Image, ImageOps
    pix = doc[pdf_page - 1].get_pixmap(dpi=dpi, colorspace=pymupdf.csGRAY)
    img = Image.frombytes("L", (pix.width, pix.height), pix.samples)
    img = ImageOps.autocontrast(img, cutoff=1)
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def clean_answer(text):
    text = re.sub(r"^```[a-zA-Z]*\s*$", "", text, flags=re.M)
    lines = text.strip().split("\n")
    first = next((i for i, ln in enumerate(lines) if PAGE_RE.match(ln.strip())), None)
    if first is None:
        return None
    body = "\n".join(lines[first:])
    body = re.sub(r"^\s*(✔ L1 ТӨГСӨВ|⏸ L1 ДУТУУ.*)\s*$", "", body, flags=re.M)
    return body.strip() + "\n"


def pages_in(text):
    return {int(m.group(1)) for m in (PAGE_RE.match(ln.strip()) for ln in text.split("\n")) if m}


def call_gemini(client, types, args, rules, images, prompt):
    parts = [types.Part.from_bytes(data=b, mime_type="image/jpeg") for b in images] + [prompt]
    cfg = dict(system_instruction=rules, temperature=0.0, max_output_tokens=args.max_output,
               media_resolution=getattr(types.MediaResolution, f"MEDIA_RESOLUTION_{args.resolution.upper()}"))
    if args.thinking != "default":
        cfg["thinking_config"] = types.ThinkingConfig(thinking_level=args.thinking.upper())
    delay = 4
    for attempt in range(6):
        try:
            resp = client.models.generate_content(
                model=args.model, contents=parts, config=types.GenerateContentConfig(**cfg))
            return resp.text or "", resp.usage_metadata
        except Exception as e:  # 429 / 5xx / network: back off and retry
            if attempt == 5:
                raise
            print(f"    ! {type(e).__name__}: {str(e)[:120]} — {delay}s дараа дахин", flush=True)
            time.sleep(delay)
            delay *= 2


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", required=True, help="split PDF (01_Splits\\...)")
    ap.add_argument("--report", required=True, help="report stem, e.g. 5000 or 5000_zzz")
    ap.add_argument("--pages", required=True, help="REPORT page range, e.g. 71-80")
    ap.add_argument("--pdf-start", type=int,
                    help="PDF page holding the first report page (default: from '_pSSS-EEE_' in the PDF name)")
    ap.add_argument("--out-dir", required=True, help="02_L1_Archive folder")
    ap.add_argument("--rules", required=True, help="GEMINI_GEM_L1.md or L1_INSTRUCTIONS.md")
    ap.add_argument("--model", default=os.environ.get("GEMINI_MODEL"), help="Gemini model id (or env GEMINI_MODEL)")
    ap.add_argument("--per-call", type=int, default=2, help="pages per request (proven: 2)")
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--resolution", choices=["low", "medium", "high"], default="high")
    ap.add_argument("--thinking", choices=["default", "minimal", "low", "medium", "high"], default="low",
                    help="thinking level (Gemini 3.x); OCR needs little reasoning")
    ap.add_argument("--max-output", type=int, default=16000)
    ap.add_argument("--sleep", type=float, default=2.0, help="seconds between requests")
    ap.add_argument("--suffix", default="GEMAPI", help="output name suffix: _L1_<suffix>.md")
    ap.add_argument("--keep-images", help="folder to keep rendered JPEGs (e.g. _agents\\grok\\work)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    a, b = (int(x) for x in re.split(r"[-–]", args.pages))
    pdf = Path(args.pdf)
    pdf_start = args.pdf_start
    if pdf_start is None:
        m = PDF_RANGE_RE.search(pdf.name)
        if not m:
            sys.exit("--pdf-start заавал (PDF нэрэнд _pSSS-EEE_ алга)")
        pdf_start = a - int(m.group(1)) + 1
    stem = f"{args.report}_p{a:03d}-{b:03d}_L1_{args.suffix}"
    out = Path(args.out_dir) / f"{stem}.md"
    prog_path = out.with_suffix(".progress.json")
    if out.exists() and not prog_path.exists():
        out = next_free_path(out)
        prog_path = out.with_suffix(".progress.json")
    prog = json.loads(prog_path.read_text(encoding="utf-8")) if prog_path.exists() else \
        {"done": [], "usage": {"in": 0, "out": 0, "thoughts": 0}, "calls": 0}
    todo = [n for n in range(a, b + 1) if n not in prog["done"]]

    import pymupdf
    doc = pymupdf.open(pdf)
    last_pdf = pdf_start + (b - a)
    if last_pdf > doc.page_count:
        sys.exit(f"PDF-д {doc.page_count} хуудас байна, х.{b} → PDF х.{last_pdf} хэрэгтэй")
    rules = load_rules(args.rules)
    print(f"{stem}: тайлангийн х.{a}–{b} = {pdf.name} PDF х.{pdf_start}–{last_pdf}; "
          f"хийх {len(todo)} х., {-(-len(todo) // args.per_call)} хүсэлт → {out}")
    if args.dry_run:
        est_in = len(todo) * IMG_TOKENS[args.resolution] + -(-len(todo) // args.per_call) * (len(rules) // 2 + 200)
        print(f"  (ойролцоо) оролт ≈{est_in:,} токен, гаралт ≈{len(todo) * 1500:,} токен (+thinking). "
              "Үнийг ai.google.dev/pricing-аас шалга.")
        for n in todo[:2]:
            jpg = render(doc, pdf_start + n - a, args.dpi)
            print(f"  х.{n}: JPEG {len(jpg) // 1024} KB")
        return
    if not args.model:
        sys.exit("--model (эсвэл GEMINI_MODEL env) заавал — ai.google.dev дээрх Pro загварын id")
    from google import genai
    from google.genai import types
    client = genai.Client()   # GEMINI_API_KEY env

    if not out.exists():
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(f"# {args.report} х.{a:03d}–{b:03d} — L1 (Gemini API: {args.model})\n"
                       f"> Эх: {pdf.name} · Уншсан: зөвхөн зураг · Огноо: {datetime.date.today()}\n\n",
                       encoding="utf-8")
    chunks = [todo[i:i + args.per_call] for i in range(0, len(todo), args.per_call)]
    queue = list(chunks)
    while queue:
        chunk = queue.pop(0)
        imgs = []
        for n in chunk:
            jpg = render(doc, pdf_start + n - a, args.dpi)
            imgs.append(jpg)
            if args.keep_images:
                d = Path(args.keep_images) / f"{args.report}_p{a:03d}-{b:03d}"
                d.mkdir(parents=True, exist_ok=True)
                (d / f"{args.report}_p{n:03d}.jpg").write_bytes(jpg)
        p1, p2 = pdf_start + chunk[0] - a, pdf_start + chunk[-1] - a
        rng = f"х.{chunk[0]}" if len(chunk) == 1 else f"х.{chunk[0]}–{chunk[-1]}"
        prompt = (f"Тайлан {args.report}. Хавсаргасан {len(chunk)} зураг = тайлангийн {rng} "
                  f"(split PDF «{pdf.name}», PDF х.{p1}–{p2}), дарааллаар. L1 дүрмээр буулга.")
        text, usage = call_gemini(client, types, args, rules, imgs, prompt)
        prog["calls"] += 1
        if usage:
            prog["usage"]["in"] += usage.prompt_token_count or 0
            prog["usage"]["out"] += usage.candidates_token_count or 0
            prog["usage"]["thoughts"] += usage.thoughts_token_count or 0
        body = clean_answer(text)
        got = pages_in(body) if body else set()
        if not body or not set(chunk) <= got:
            if len(chunk) > 1:
                print(f"  {rng}: хариу дутуу ({sorted(got)}) — хуудас тус бүрээр дахин")
                queue[:0] = [[n] for n in chunk]
                continue
            print(f"  {rng}: хариу хоосон/буруу — алгасав (дахин ажиллуулахад дахин оролдоно)")
            continue
        with out.open("a", encoding="utf-8") as f:
            f.write(body + "\n")
        prog["done"] = sorted(set(prog["done"]) | set(chunk))
        prog_path.write_text(json.dumps(prog), encoding="utf-8")
        u = prog["usage"]
        print(f"  {rng} ✓  (нийт токен: оролт {u['in']:,} · гаралт {u['out']:,} · thinking {u['thoughts']:,})",
              flush=True)
        time.sleep(args.sleep)

    if set(range(a, b + 1)) <= set(prog["done"]):
        with out.open("a", encoding="utf-8") as f:
            f.write(DONE_L1 + "\n")
        prog_path.unlink(missing_ok=True)
        print(f"✔ {out.name} бүрэн. QA:")
        import qa_check
        rep = qa_check.check_file(out)
        for e in rep.errors:
            print(f"    E: {e}")
        for w in rep.warnings:
            print(f"    W: {w}")
        print(f"QUEUE: py queue_tool.py set {args.report} {a:03d}-{b:03d} \"L1 done\" "
              f"--note \"Gemini API, {out.name}, [зөрөө] {rep.info.get('markers', {}).get('зөрөө', 0)} ш\"")
    else:
        left = sorted(set(range(a, b + 1)) - set(prog["done"]))
        print(f"⏸ дутуу: {left} — дахин ажиллуулахад үргэлжилнэ")


if __name__ == "__main__":
    main()

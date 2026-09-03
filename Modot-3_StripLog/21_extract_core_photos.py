# -*- coding: utf-8 -*-
"""Керний фотоны PDF-ээс шигтгээсэн зургуудыг задлж photos/<HOLE>/<idx>.jpg болгоно."""
import sys, io
from pathlib import Path
import fitz
from PIL import Image

src = Path("photos_pdf"); dst = Path("photos"); dst.mkdir(exist_ok=True)
MAXW = 2000
for pdf in sorted(src.glob("MTDH-*.pdf")):
    hole = pdf.stem
    od = dst / hole
    if od.exists() and list(od.glob("*.jpg")):
        continue
    od.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(pdf)); n = 0
    for pi in range(len(doc)):
        imgs = doc[pi].get_images(full=True)
        # хуудсанд хамгийн том зураг = кернийн фото
        best = None
        for im in imgs:
            xref = im[0]
            try: d = doc.extract_image(xref)
            except Exception: continue
            if best is None or len(d["image"]) > len(best["image"]): best = d
        if best is None:
            pix = doc[pi].get_pixmap(dpi=150, alpha=False)
            img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        else:
            img = Image.open(io.BytesIO(best["image"])).convert("RGB")
        if img.width < 300 or img.height < 200:
            continue
        if img.width > MAXW:
            img = img.resize((MAXW, int(img.height * MAXW / img.width)), Image.LANCZOS)
        n += 1
        img.save(od / ("%s_%03d.jpg" % (hole, n)), "JPEG", quality=82, optimize=True)
    doc.close()
    print("%-9s pages=%2d  images=%2d" % (hole, pi + 1, n))

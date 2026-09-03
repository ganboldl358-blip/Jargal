#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ТЕСТ — синтетик Out_Target үүсгэнэ (жинхэнэ striplog БИШ): 15_/16_ скриптийг D:-гүй орчинд турших зорилготой.
Цооног бүрд ceil(TD/23)+1 хуудастай A3L PDF (том бичигтэй хоосон хуудас) + hole_template_map.csv (ТЕСТИЙН таамаг хуваарилалт —
жинхэнэ map D:\\AZ9\\_00_Work_Logs\\Modot-3_StripLog\\Templates\\hole_template_map.csv).
    python3 make_synthetic_out_target.py <MT_Drilling_Database.xlsx> <out_dir>
"""
import csv, math, sys
from pathlib import Path

# ТЕСТИЙН таамаг хуваарилалт (26 үндсэн + 7 хоёрдогч = 33): T1 11 · T2 9 · T3 3 · T4 3 (+7 second)
TEST_MAP = {
    "MTDH-01": ("T3", ""), "MTDH-02": ("T3", ""), "MTDH-03": ("T1", ""), "MTDH-04": ("T1", ""), "MTDH-05": ("T1", ""),
    "MTDH-06": ("T2", ""), "MTDH-07": ("T2", "T1"), "MTDH-08": ("T2", ""), "MTDH-09": ("T1", ""), "MTDH-10": ("T2", ""),
    "MTDH-11": ("T4", ""), "MTDH-12": ("T2", ""), "MTDH-13": ("T1", "T2"), "MTDH-14": ("T2", "T1"), "MTDH-15": ("T1", "T2"),
    "MTDH-16": ("T1", ""), "MTDH-17": ("T2", "T1"), "MTDH-18": ("T4", ""), "MTDH-19": ("T4", ""), "MTDH-20": ("T2", "T1"),
    "MTDH-21": ("T1", ""), "MTDH-22": ("T3", ""), "MTDH-23": ("T1", ""), "MTDH-24": ("T1", "T2"), "MTDH-25": ("T1", ""),
    "MTDH-26": ("T2", ""),
}
TAGS = {"T1": "T1_Zn-Ag", "T2": "T2_Mo-W-Sn", "T3": "T3_Ag-As-Sb", "T4": "T4_GeoLog"}


def main(db, out):
    import openpyxl
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages
    plt.rcParams["font.family"] = "DejaVu Sans"
    wb = openpyxl.load_workbook(db, data_only=True, read_only=True)
    it = wb["Collar"].iter_rows(values_only=True); hdr = [str(h) for h in next(it)]
    td = {r[hdr.index("Hole_ID")]: float(r[hdr.index("Max_Depth_m")]) for r in it if r and r[hdr.index("Hole_ID")]}
    out = Path(out); (out / "Templates").mkdir(parents=True, exist_ok=True)
    with open(out / "Templates" / "hole_template_map.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["Hole_ID", "Template", "Second_template_if_any", "Note"])
        for h, (t1, t2) in TEST_MAP.items():
            w.writerow([h, TAGS[t1], TAGS[t2] if t2 else "", "SYNTHETIC TEST MAP"])
    n = 0
    for h, (t1, t2) in TEST_MAP.items():
        for tn in [t1] + ([t2] if t2 else []):
            d = out / "Out_Target" / h; d.mkdir(parents=True, exist_ok=True)
            pages = math.ceil(td[h] / 23.0) + 1
            p = d / ("%s_DrillLog_A3L_%s_2026.pdf" % (h, TAGS[tn]))
            with PdfPages(str(p)) as pdf:
                for i in range(pages):
                    fig = plt.figure(figsize=(16.535, 11.693)); ax = fig.add_axes([0, 0, 1, 1]); ax.set_axis_off()
                    ax.text(0.5, 0.6, "SYNTHETIC TEST\n%s · %s" % (h, TAGS[tn]), ha="center", fontsize=40, color="#999")
                    ax.text(0.5, 0.35, ("хуудас %d/%d · %.1f–%.1f м" % (i + 1, pages, i * 23, min((i + 1) * 23, td[h]))) if i < pages - 1 else "ТАЙЛБАР (тест)", ha="center", fontsize=28, color="#bbb")
                    pdf.savefig(fig); plt.close(fig)
            n += 1
    print("synthetic PDFs:", n, "→", out / "Out_Target")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

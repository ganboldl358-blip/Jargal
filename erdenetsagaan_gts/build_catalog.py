"""Build the Erdenetsagaan GTS report catalog against 04_Base_Data (2026-09-28).

Inputs (erdenetsagaan_gts/inputs/):
  ETS_Reports_20260824.csv               221 reports intersecting the Erdenetsagaan AOI
                                         (03_Working/Erdenetsagaan_Gas/03_Cartogram/01_Data)
  00_GTS_Archive_Missing_20260824.csv    182 of them with no folder in the GTS archive
  GTS_Reports_Raw_children_20260928.tsv  every child of 04_Base_Data/01_GTS_Reports_Raw/<range>
                                         listed read-only from Drive on 2026-09-28

Output: erdenetsagaan_gts/ETS_GTS_Reports_Catalog.csv (one row per report, UTF-8 with BOM).
"""
import csv
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
INP = HERE / "inputs"
OUT = HERE / "ETS_GTS_Reports_Catalog.csv"

BASE = "G:/My Drive/JG GeoHub/04_Base_Data/01_GTS_Reports_Raw"

# 03_Working/Erdenetsagaan_Gas/03_Reports_Plots/01_Study_Reports/GTS_Archive — the 2026-08-24
# OneDrive download of the same reports (folder name, Drive id).
WORKING_COPY = {
    2: ("0002_1936_Mapping500K", "1hqcbj-_wIMYDh-t8VweL3Zac1Vy8GJo5"),
    57: ("0057_1932-1936_Thematic", "1vK4H4hGYlRaKBKO-gf3TNpweyXLQy7pi"),
    397: ("0397_1943_Hydrogeology", "19XaRUm_SxUY3V1hY_1mLICMTLENBHifU"),
    412: ("0412_1943_Exploration", "1IR9ibbooU2g6OAd_9jPPzpkTz30Ms2Bz"),
    623: ("0623_1953_Mapping200K", "1Wy0W5ettSvdlVEYk3_L56Ds4iEFnV1xi"),
    645: ("0645_1954_Mapping200K", "17fDRiEI-6U0656bmJDbChM5K05-demIR"),
    826: ("0826_1955-1956_Exploration", "1EHIckkbglJf6GyrXauBagYxDvSI1nod5"),
    1278: ("1278_1953_Mapping200K", "1Jgoppj942G0nVaHEDvxbdi6OAhqOkzBn"),
    1303: ("1303_1954_Mapping200K", "1IIUbGefyl7KWTCUpDxexZ5Mujk8Gse_r"),
    1323: ("1323_1956_Mapping100K", "1JzEvnchXOB32bZVHKuQz3QrQDqV5rZeF"),
    1324: ("1324_1956_Mapping100K", "1D2ZTenzTlQbJvAzF5TmM3yy_oqoDVTOQ"),
    1446: ("1446_1959_Geophysics", "1VLxL33yz6AtMGdbwHlT3iC77hvM9VGGy"),
    1663: ("1663_1966_Prospecting", "1_xbn8otVKbfclWnSyVIeIj3eqVuWt2qb"),
    1708: ("1708_1959_Geophysics", "1b3H-dV2KbrllrPbFA20jYhHeaNU-n-xJ"),
    1762: ("1762_1966-1967_Mapping200K", "1xK9cmNTd-zmQ4Cupofv0ggqZkTgKgIlZ"),
    1853: ("1853_1970_Mapping200K", "1g29GpGs-vg8f64KgK8xxw34JprzzfNCa"),
    1889: ("1889_1970_Mapping200K", "1N2l0_Qxt0FEmmEFfp_MPubDqJT-NS85U"),
    2025: ("2025_1971-1972_Mapping50K", "1aUxRV4ZdXQcwsR-ylRAfEq3_k4CD-bN8"),
    2149: ("2149_1974_Prospecting", "1s1tjoypz1VfLz7Ms1nvDmUNhyVtn2vWZ"),
    2153: ("2153_1973-1974_Exploration", "1Uc85FoMVZ5U33bOeQDnsiFVafE7Kqskh"),
    2348: ("2348_1975_Mapping50K", "1W2qfNE2IwsvrKvDvQRH3OC1bEU1onPcg"),
    2409: ("2409_1971_Evaluation", "1Nx_s-jIs2BOkAnE-KMkvQf0b4o00iGLP"),
    2411: ("2411_1972_Geophysics", "1zkgmazkS0iSqudH4lOdXNmzzZSKTPI1g"),
    2452: ("2452_1981_Geophysics", "1UjlDLAGs24FB7XNRMlnRnq3nMoXHh_VW"),
    2576: ("2576_1974-1976_Exploration", "1TcVuaQLkcbKGHaIDF2e9fGSGajaDqlrc"),
    2704: ("2704_1976_Evaluation", "1z2iD3mxMuE9oo2ZTlBEAq21v9SB1BuYN"),
    2739: ("2739_1947-1977_Prospecting", "1XEDb0XaXK7N28y43nd8lZZ4X2OB5olCr"),
    2992: ("2992_1976-1977_Evaluation", "1m7P-2YI_4BxZOpiFMqTt9K2awjwEmCZV"),
    3562: ("3562_1978-1980_Prospecting", "1Ss7Batff6oPv-s42WYobwZKLqCZfk3yK"),
    3651: ("3651_1983_Hydrogeology", "1_tTXBgOr-X8wf692mE-vrPwcZmX1x7TY"),
    4772: ("4772_1994_Mapping200K", "13lcyFxcZPmU7i0vbhC6DVdrzYA7i9GWe"),
    5000: ("5000_1991-95_Mapping200K", "1e9sYls54Mp5HRDy26ygXxXh-YHunY96T"),
    5020: ("5020_1993-95_Mapping200K", "1Uwuhku0XwaygkaU5yZbeY1Okzsnv8vb9"),
    5172: ("5172_1996-98_Mapping200K", "12Zo6eKIZcAHscfNz9NWOIE4f5RMgsilC"),
    5600: ("5600_nd_Mapping50K", "1H_HOxz1p0xWQu6EM6ry5bNbKdiS_ot3w"),
    6160: ("6160_nd_Mapping50K", "1AB-pxd0OCvPhkqrBtl956iXxDX5UHsE3"),
    6180: ("6180_nd_Mapping50K", "1mhH9gB5k6tDkozcwTn-cXPRRLu6LKLeA"),
    6314: ("6314_nd_Exploration", "1Z72wqBS3ozg6TlO7cudbJNpxf02Yrva5"),
    6443: ("6443_nd_Exploration", "1K1hMEqI2r64E5M-U_v7nhovjhpV45otT"),
}

# 03_Working/NPG_Report_Texts — L1/L2 text status from _agents/grok/QUEUE.md (2026-09-28 11:45 UB).
TEXT_STATUS = {
    57: "L2 done (бүрэн)",
    645: "L2 done (бүрэн)",
    1889: "L2 done (фрагмент)",
    1663: "L2 done х.001–077; дутуу хуудас hold (Jak шийднэ)",
    1853: "L2 done ихэнх; х.218–219, 220–232, 243–252, 253–269 L2 явагдаж байна",
    5000: "L2 done х.001–030; L1 done х.031–111; х.112–517 + zzz/listiii todo",
    5020: "todo — Jak-ын go хүлээж байна",
    5172: "todo — Jak-ын go хүлээж байна",
    5600: "hold — жинхэнэ тайлан эсэхийг Jak баталгаажуулна",
    6180: "hold — жинхэнэ тайлан эсэхийг Jak баталгаажуулна",
    1303: "blocked — эх скан алга (1663 PDF-д 4 х.)",
    6160: "blocked — эх скан алга (PDF 0, 44 native doc)",
}


def code_of(title):
    m = re.match(r"^(\d+)", title)
    return int(m.group(1)) if m else None


def main():
    ets = list(csv.DictReader(open(INP / "ETS_Reports_20260824.csv", encoding="utf-8-sig")))
    missing = {int(r["no"]) for r in csv.DictReader(
        open(INP / "00_GTS_Archive_Missing_20260824.csv", encoding="utf-8-sig"))}

    archive = {}
    for r in csv.DictReader(open(INP / "GTS_Reports_Raw_children_20260928.tsv", encoding="utf-8"),
                            delimiter="\t"):
        if r["range"] in ("Others", "00_Survey_Index") or r["is_folder"] != "TRUE":
            continue
        c = code_of(r["title"])
        if c is None:
            continue
        # prefer the zero-padded 4-digit folder (e.g. 0946 over the stray unpadded 946)
        if c in archive and len(archive[c]["title"]) >= len(r["title"]):
            continue
        archive[c] = r

    cols = ["no", "code", "year", "scale", "subs_mn", "author", "title", "pages", "lang",
            "pct_of_aoi", "in_gts_archive", "base_data_path", "base_data_folder_id",
            "base_data_url", "working_copy_folder", "working_copy_id", "text_L1L2_status",
            "rag_markdown"]
    out = []
    for r in ets:
        no = int(r["no"])
        a = archive.get(no)
        wc = WORKING_COPY.get(no, ("", ""))
        out.append({
            "no": no,
            "code": f"{no:04d}",
            "year": r["year"],
            "scale": r["scale"],
            "subs_mn": r["subs_mn"],
            "author": r["author"],
            "title": r["title"],
            "pages": r["pages"],
            "lang": r["lang"],
            "pct_of_aoi": r["pct_of_aoi"],
            "in_gts_archive": "тийм" if a else "үгүй",
            "base_data_path": f"{BASE}/{a['range']}/{a['title']}" if a else "",
            "base_data_folder_id": a["id"] if a else "",
            "base_data_url": f"https://drive.google.com/drive/folders/{a['id']}" if a else "",
            "working_copy_folder": wc[0],
            "working_copy_id": wc[1],
            "text_L1L2_status": TEXT_STATUS.get(no, ""),
            "rag_markdown": r["rag"],
        })
    out.sort(key=lambda x: (x["in_gts_archive"] != "тийм", x["no"]))

    with open(OUT, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(out)

    found = {x["no"] for x in out if x["in_gts_archive"] == "тийм"}
    absent = {x["no"] for x in out if x["in_gts_archive"] == "үгүй"}
    print(f"reports {len(out)} | in archive {len(found)} | not in archive {len(absent)}")
    print(f"archive folders indexed: {len(archive)}")
    print(f"not-in-archive == 2026-08-24 missing list: {absent == missing}")
    print(f"in-archive == 2026-08-24 working copy: {found == set(WORKING_COPY)}")


if __name__ == "__main__":
    main()

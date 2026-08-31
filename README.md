# Oval Project — Petrography Database

Oval Ni-Cu төслийн (Yambat, Asian Battery Metals / AZ9) петрографийн дээжүүдийн **нэгдсэн мэдээллийн сан**. Google Drive дээр тархсан 2022–2026 оны бүх петрографи/минераграфийн тайлан, хүснэгтээс нэгтгэв (2026-08-31).

## Гол тоо

| Хүснэгт | Мөр | Тайлбар |
|---|---|---|
| `samples` | 376 | Дээж бүр нэг мөр; 341 (90.7%) нь координаттай — 283 цооногийн дээж бүрэн 3D (x,y,z, minimum-curvature desurvey), 58 гадаргын дээж X/Y |
| `descriptions` | 451 | Петрографийн тайлбарууд (нэг дээжид хэд хэдэн лабораторийн тайлбар байж болно); 447 (99.1%) нь дээжтэй холбогдсон |
| `collar` | 76 | Цооногийн ам (OVD, SC, CRS, MU, BS цувралууд), WGS84/UTM 46N (EPSG:32646) |
| `survey` | 1,990 | Гүний чиглэлийн хэмжилт |
| `sample_assays` | 277 | ME-ICP61 / PGM-ICP27 / REE / XRF багц (85 багана) |
| `lu_*`, `sources` | — | Kод/alias хүснэгтүүд, эх файлын бүртгэл (Drive fileId-тай) |

## Бүтэц

- `database/` — **эцсийн сан**: `Oval_Petrography_DB.xlsx` (9 sheet), `Oval_Petrography_DB.sqlite`, `csv/` (9 хүснэгт), `QA_report.md`, `README.md` (схем + Leapfrog/Micromine-д ачаалах заавар)
- `docs/3D_Data_Requirements_MN.md` — 3D загварчлал, судалгаа, тайлалд шаардагдах өгөгдлийн баримт + gap analysis
- `workspace/` — Drive-ийн инвентор (110+ файл, давхардлын зураглал) ба задалсан завсрын өгөгдөл
- `scripts/build_database.py` — санг дахин угсрах скрипт (workspace/extracted → database/)

## Эх сурвалжууд (нэгтгэсэн)

Mireslab (2022–23), Khanlab (2023, таг 41011–41034), Оюунжаргал, ThinSection Mongolia (2024), Innova Mineral (2024), MUST/ШУТИС SEM-EDX (2025), Dr A.J. Crawford (2024–25), Л.Жаргал (2023), BayanSair/MS3 (2026), Yambat Petrographic Master Data.xlsx, Collar_all_combined + Survey_all_YMB.

Drive хуулбар: `AZ9 GeoHub - 02_Raw (Source)/…/06_Petrography_Mineralogy/00_Consolidated_Petrography_DB/`

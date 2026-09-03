# XV-020181 Модот-3 — T1–T4 элемент-зорилтот цооногийн багана: ДУУСГАХ багц (2026-09-03)

**Эх (мастер):** `D:\AZ9\_00_Work_Logs\Modot-3_StripLog\` (Cowork, 2026-09-02/03).
**Hand-off:** `G:\My Drive\JG GeoHub\_00_System\01_Logs\XV-020181_StripLog_Target_HANDOFF_20260903.md` (§2 B/C/D = үлдсэн ажил).
**Энэ хавтас:** cloud (Claude Code) session 2026-09-03-д бэлдсэн скриптүүд — **D: дээр (Windows) ажиллуулна**; cloud-д D:/G: mount байхгүй тул PDF-үүдэд шууд хүрээгүй.

## Файлууд

| Файл | Юу хийдэг |
|---|---|
| **`RUN_Finish_StripLog_Target.bat`** → `Finish_StripLog_Target.ps1` | **НЭГ ТОВШИЛТ** (idempotent): ① `Out_Target\<HOLE>\<HOLE>_DrillLog_A3L_<TAG>_2026.pdf` 33 PDF ↔ `Templates\hole_template_map.csv` тулгалт · ② `15_` нэгтгэл · ③ `16_` QC хуудас · ④ robocopy D: → G: **АЖЛЫН** (`03_Working\XV-020181…\09_Drilling\04_Striplog_Section\{Out_v3,Out_Target,Templates}`) + **СКРИПТ** хавтас · ⑤ лог `01_Logs\XV-020181_StripLog_Target_Finish_<огноо>.log.md`. **ХУВААЛЦАХ-д хүрэхгүй.** Параметр: `-SkipMirror -SkipQC -SkipMerge` |
| `15_merge_striplogs_target.py` | Загвар тус бүрд (T1_Zn-Ag · T2_Mo-W-Sn · T3_Ag-As-Sb · T4_GeoLog) **нэг нэгтгэсэн PDF** = нүүр + агуулгын хүснэгт (TD · хайрцаг · дээж · хамралт · загварын элементийн макс · Sig_Intervals гол огтлол · CaF₂ макс · эхлэх хуудас) + тайлбар хуудас (босго, эх дата, литологийн код/өнгө, анхаарах зүйл) + цооног бүрийн **bookmark** → `Out_Target\_Merged\Modot3_StripLog_<TAG>_<YYYYMMDD>.pdf` + `Merge_index_<YYYYMMDD>.md`. Хуудас тулгалт `ceil(TD/23)+1`; map-тай зөрүүг анхааруулна. `14_merge_striplogs.py` (v3.2)-ийн загвараар |
| `16_qc_contact_sheet_target.py` | **Визуал QC-д зориулсан contact sheet:** цооног+загвар бүрийн 1-р хуудас (толгой · bar · литологи · фото) ба сүүлийн хуудас (тайлбар)-ыг 5 цооног/хуудсаар JPG (≈0.2 MB) + нэг PDF + `QC_Target_Checklist_<огноо>.md` → `Out_Target\_QC_Sheets\`. pymupdf байвал PDF-ээс, үгүй бол `Out_Target\QC_PNG\`-оос. Жижиг тул Drive MCP (≤10 MB)-ээр cloud-оос татаж Opus/Claude шалгах боломжтой |
| `RUN_Mirror_StripLog_Work_to_G.bat` → `Mirror_StripLog_Work_to_G.ps1` | Зөвхөн D: → G: толин хуулбар (Cowork-ийн бэлдсэн скриптийн өөрчлөгдөөгүй хуулбар; `Finish` дотор мөн ижил алхам бий) |
| `RUN_Publish_StripLog_Target.bat` → `Publish_StripLog_Target.ps1` | ⚠️ **ХУВААЛЦАХ** (`01_Projects\…\09_Drilling\04_Striplog_Section\<HOLE>\`) руу T-загварын PDF хуулна — **ЗӨВХӨН Жаргалын шийдвэрээр** (HANDOFF §2-D: v2 + v3 + T-загвар зэрэгцээ, нэр `<HOLE>_DrillLog_A3L_<TAG>_2026.pdf`, DRAFT/AI үггүй). `-Yes`-гүй бол зөвхөн жагсаалт (dry-run); .bat нь `pause` + `-Yes` |
| `tests/make_synthetic_out_target.py` | **Синтетик тест** (жинхэнэ багана биш): D:-гүй орчинд 15_/16_-г турших — 33 хоосон A3L PDF (`ceil(TD/23)+1` хуудастай) + ТААМАГ `hole_template_map.csv` (жинхэнэ map D: дээр) |

## Ажиллуулах дараалал (Windows — Жаргал эсвэл Claude Code)

1. `G:\My Drive\JG GeoHub\_00_System\02_Scripts\XV-020181_StripLog_20260903\RUN_Finish_StripLog_Target.bat` давхар товшино
   (py + `pip install openpyxl pypdf matplotlib pillow pymupdf` автоматаар; ≈5–15 мин — 33 PDF ≈300 MB нэгтгэнэ, G: руу хуулна).
2. Гаралт: `Out_Target\_Merged\` (4 PDF + индекс), `Out_Target\_QC_Sheets\` (JPG/PDF + хүснэгт), G: АЖЛЫН + СКРИПТ хавтас, лог.
3. **Визуал QC** (HANDOFF §2-B, v3.2-тэй ижил: Opus 3 агент — 1-р хуудас + тайлбар хуудас): `_QC_Sheets\QC_<TAG>_<k>.jpg` + `QC_Target_Checklist_<огноо>.md`.
   Mirror хийгдсэн бол cloud-оос ч хийж болно (G: АЖЛЫН хавтас → Drive MCP).
4. Засвар гарвал `12_make_striplog_MT_A3L_target.py` → тухайн цооногийг дахин гаргах → `RUN_Finish` дахин (idempotent, шинэ огноотой нэгтгэл).
5. Жаргал шийдвэл `RUN_Publish_StripLog_Target.bat` (ХУВААЛЦАХ). Нэгтгэсэн PDF ХУВААЛЦАХ-д орох эсэх — v3-ын шийдвэр «оруулахгүй» байсан; T-загварт мөн Жаргал шийднэ.

## Шаардлага / замууд

- Python 3.9+ (`py`), `openpyxl pypdf matplotlib pillow pymupdf`. Фонт: matplotlib-ийн DejaVu Sans (кирилл ✓).
- Default замууд скрипт дотор: `Out_Target` = `D:/AZ9/_00_Work_Logs/Modot-3_StripLog/Out_Target`; бааз = G: `01_Drilling_Database/MT_Drilling_Database.xlsx` → D: `Modot-3_Prep/MT_Drilling_Database.xlsx`; map = `Templates/hole_template_map.csv`.
  Өөр бол: `py 15_merge_striplogs_target.py --out-target … --db … --map … --date 20260903 [--templates T1 T2] [--dry-run]`.
- Гаралтын нэрэнд «AI/Claude/DRAFT» үг байхгүй (CLAUDE.md §1); нүүрэн дээр «ХЯНАЛТЫН ХУВИЛБАР» гэсэн тэмдэглэгээтэй — визуал QC дуустал.

## Тест (cloud, 2026-09-03)

Синтетик 33 PDF → `15_`: T1 15 цооног 75 х. · T2 12 / 58 · T3 3 / 18 · T4 3 / 13 — бүгд төлөвлөсөн = бодит; bookmark 3 + цооног бүр; dry-run-д дутуу/илүү файлыг зөв илрүүлэв. `16_`: 8 JPG (0.1–0.2 MB) + PDF 1.8 MB + хүснэгт.
Жинхэнэ дата дээр PowerShell/robocopy хэсэг Windows дээр л батлагдана (cloud-д PowerShell байхгүй — синтакс, хаалт тулгасан).

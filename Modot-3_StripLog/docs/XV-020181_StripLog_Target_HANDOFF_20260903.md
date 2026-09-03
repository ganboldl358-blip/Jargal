# ⚡ HANDOFF — XV-020181 Модот-3: элемент-зорилтот striplog (T1–T4) + бүх 2026-09-02/03-ны ажил
**Бичсэн:** Claude (Cowork, Fable) · 2026-09-03 · Шалтгаан: Жаргалын компьютерийн цэнэг дуусах гэж байна → **Claude Code-оор үргэлжлүүлнэ.**
**Эхлэхэд:** энэ файл → `Modot-3_StripLog\00_STATUS.md` (D:) → доорх «ҮЛДСЭН АЖИЛ».

---

## 1. Хаана юу байна (бүгд D: МАСТЕР дээр — Cowork G: руу бинари бичдэггүй байсан)

| Зүйл | Байршил (D:) | Төлөв |
|---|---|---|
| Дахин дээжлэлтийн бүртгэл v2 (жонш) | `D:\AZ9\_00_Work_Logs\Modot-3_Prep\Modot3_Resampling_Register_v2_20260902.xlsx` + `.md` + `Register_v2_csv\` + `11_make_resampling_v2.py`, `12_build_v2_xlsx.py` | ✅ |
| Харилцагчийн керний хуваарь | `Modot-3_Prep\Модот-3_Керний_дахин_дээжлэлт_2026.xlsx` (`13_build_client_core_xlsx.py`) | ✅ Ч.Мэ багц руу Жаргал сольж тавина |
| Striplog **v3.2 (жонш)** 26 цооног | `D:\AZ9\_00_Work_Logs\Modot-3_StripLog\Out_v3\<HOLE>\<HOLE>_DrillLog_A3L_v3.2_DRAFT.pdf` + `QC_PNG_v3\` + `_Merged\` (Batch1 12 цооног · AllResample 25) · скрипт `09_make_striplog_MT_A3L_v3.py`, `10_prep_photos_all.py`, `10_verify_v3.py`, `14_merge_striplogs.py` | ✅ Opus QC хийгдсэн |
| v3 → ХУВААЛЦАХ нийтлэх скрипт | `G:\…\_00_System\02_Scripts\XV-020181_StripLog_v3_Publish_20260902\RUN_Publish_StripLog_v3.bat` (+ .ps1) | ⏸ **ажиллуулаагүй** — 25 цооног, v2/GeoLog хэвээр, нэгтгэсэн PDF орохгүй (Жаргалын шийдвэр) |
| Загварын санал T1–T4 | `Modot-3_StripLog\Templates\StripLog_Templates_Proposal_v1.1.md`, `hole_template_map.csv`, `t0_element_stats.py`, `StripLog_Templates_Check_v1.md`, `Phase1_Check.md`, `t1_check.py` | ✅ Жаргал батласан («бүгдийг хий») |
| **T-загварын скрипт v1.1** | `Modot-3_StripLog\12_make_striplog_MT_A3L_target.py` (1522 мөр; Opus бүтээсэн, Opus шалгагч 7 засвар → зассан) | ✅ |
| T-загварын гаралт | `Modot-3_StripLog\Out_Target\<HOLE>\<HOLE>_DrillLog_A3L_<TAG>_2026.pdf` + `Out_Target\QC_PNG\` | ⏳ **28/33 бэлэн** (доор) |
| Фото (канон нэртэй, sandbox) | sandbox `/sessions/…/tmp/mt/photos/<HOLE>` — Windows дээр хэрэггүй: G: `02_Core_Photos\<HOLE>\` шууд уншина | — |

TAG: `T1_Zn-Ag` · `T2_Mo-W-Sn` · `T3_Ag-As-Sb` · `T4_GeoLog`.

## 2. ҮЛДСЭН АЖИЛ (дарааллаар)

**A. ✅ ДУУССАН (handoff бичсэний дараа): 33/33 PDF гарсан, `Out_Target\_verify_target_20260903.txt` — бүгд OK (хуудас = ceil(TD/23)+1, асуудалтай 0).** Доорх командууд зөвхөн дахин гаргах шаардлага гарвал:
Windows дээр (Claude Code, `py`), скрипт default замууд G:/D: руу заана — зөвхөн цооног+загвар өгнө:
```
cd D:\AZ9\_00_Work_Logs\Modot-3_StripLog
py 12_make_striplog_MT_A3L_target.py MTDH-19 T4
py 12_make_striplog_MT_A3L_target.py MTDH-20 T1
py 12_make_striplog_MT_A3L_target.py MTDH-23 T1
py 12_make_striplog_MT_A3L_target.py MTDH-24 T2
py 12_make_striplog_MT_A3L_target.py MTDH-25 T1
```
(CLI: `<HOLE> <T1|T2|T3|T4> [DBX] [RS_CSV] [PHOTO_DIR] [OUTDIR] [QCDIR] [MAP_CSV]`; DBX default = эхлээд `G:\…\01_Drilling_Database\MT_DB.xlsx` → `D:\AZ9\_00_Work_Logs\Modot-3_Prep\MT_DB.xlsx` → `MT_Drilling_Database.xlsx`. **Анхаар:** Assay_OverRange/Log_Detail/Keyword_Index sheet-үүд `MT_Drilling_Database.xlsx`-д БИЙ (25 sheet) — `MT_DB.xlsx` гэдэг нь sandbox-ын хуулбарын нэр байсан; Windows дээр DBX-ийг `G:\My Drive\JG GeoHub\01_Projects\XV-020181_Dornogobi Airag_Modot-3\09_Drilling\01_Drilling_Database\MT_Drilling_Database.xlsx` гэж явуулбал найдвартай. RS_CSV default = `D:\AZ9\_00_Work_Logs\Modot-3_Prep\Register_v2_csv\Register_v2_Core.csv` ✓.)
Бүх 33 ажлын жагсаалт = `hole_template_map.csv`-ийн Template + Second_template_if_any.

**B. Хяналт:** техникийн verify ✅ хийгдсэн (`_verify_target_20260903.txt`). Үлдсэн: **Opus визуал QC** (v3.2-т хийсэн шиг: 1-р хуудас + тайлбар хуудас, 3 агентад хувааж) → бага засварыг скриптэд оруулж дахин гаргах.

**C. Нэгтгэл (санал):** `14_merge_striplogs.py`-ийн загвараар загвар тус бүрд нэг нэгтгэсэн PDF (T1 11 цооног, T2 9, T3 3, T4 3) — нүүр + агуулга + bookmark. Тусдаа `Out_Target\_Merged\`.

**D. G: дүрмийн дагуу байршуулах (CLAUDE.md §2.1, §4.7, §5):**
- **Бэлэн скрипт:** `_00_System\02_Scripts\XV-020181_StripLog_v3_Publish_20260902\RUN_Mirror_StripLog_Work_to_G.bat` (+ `.ps1`, robocopy /E /XO, idempotent) — Out_v3, Out_Target, Templates, Register v2, скриптүүдийг АЖЛЫН + СКРИПТ хавтас руу хуулж, `01_Logs\XV-020181_Mirror_StripLog_Work_*.log.md` бичнэ. **Жаргал эсвэл Claude Code ажиллуулна** (ХУВААЛЦАХ-д хүрэхгүй).
- АЖЛЫН `G:\My Drive\JG GeoHub\_00_System\03_Working\XV-020181_Dornogobi Airag_Modot-3\09_Drilling\04_Striplog_Section\` ← D: `Modot-3_StripLog\Out_v3\`, `Out_Target\` (robocopy /E, D:-тэй ижил харьцангуй зам). Одоо тэнд зөвхөн `…\03_Assay\04_Sample_Dispatch\Modot3_Resampling_Register_v2_20260902.md` бий.
- СКРИПТ `_00_System\02_Scripts\XV-020181_StripLog_20260903\` ← `Modot-3_StripLog\*.py` + `Modot-3_Prep\11_*,12_*,13_*.py` (одоо тэнд зөвхөн README + Publish .ps1/.bat).
- ЛОГ: энэ файл + `XV-020181_Resampling_v2_Log_20260902.md` (бүх өдрийн лог) + `00_STATUS.md` (шинэчилсэн). D: талын `Modot-3_StripLog\00_STATUS.md`, `Modot-3_Database\00_STATUS.md`-г мөн харна.
- ХУВААЛЦАХ (`01_Projects`): v3.2 25 цооног → `RUN_Publish_StripLog_v3.bat` (Жаргал товшино). T-загварын PDF-ийг ХУВААЛЦАХ-д тавих эсэх — **Жаргалын шийдвэр хүлээгдэж байна** (санал: `04_Striplog_Section\<HOLE>\` дотор v2 + v3 + T-загвар зэрэгцээ; нэр `<HOLE>_DrillLog_A3L_T1_Zn-Ag_2026.pdf` — DRAFT/AI үггүй).

**E. Дараагийн шат (санаа):** Policy v3 (T5 жонш ↑, Ag~Pb залруулга, «бүгд исэлдсэн» биш — S>0.5% 99 дээж 8 цооногт); Grok-д G-14…G-17 (`99_AI_Work\Modot-3\00_Instructions\03_Claude_Direction_Note_20260902_Resampling_v2.md`).

## 3. Өнөөдрийн шийдвэрүүд (Жаргал)
Дээжлэлт v2 жоншинд төвлөрнө · CL нэг нийлмэл · v3 = зөвхөн дахин дээжлэх цооногт (25), бусдад v2 хэвээр · v3 ХУВААЛЦАХ-д 25 цооног, v2/GeoLog үлдээх, нэгтгэлгүй · T-загвар: 4 загвар, Fe загваргүй, cut-off Pb 200/Fe 10%/As 300/Sb 5/Li 60, MTDH-14/17-д T2 үндсэн, бүх 26 цооног (приоритетаар биш бүгд) · Fable удирдана, Opus хийнэ, Opus тусдаа шалгана (фаз бүрд).

## 4. Мэдэх ёстой техникийн зүйл
- Cowork sandbox: G: mount-гүй, background процесс амьдардаггүй, bash дуудлага ≤175 с → цооногийг 2–3-аар нь. Claude Code (Windows) дээр энэ хязгаар байхгүй.
- Excel: Cowork outputs хавтасны зам >218 тэмдэгт тул Excel нээдэггүй — D:-ээс нээх.
- `09_/12_` скрипт: PhotoLog Rec = фотоны ТААМАГ; Ca ICM40B-д 15%-д тасалдсан → Tb/Ca-г CaF₂/CaCO₃-оос; Möller зөвхөн CaF₂≥10%; MTDH-23 «FL» = ХАГАРАЛ (жонш биш); ӨТШ 17-1 = MTDH-17 15.70–16.70 [Тооцоолсон, Ж-4].
- Бааз хөндөгдөөгүй (MD5 хэвээр). ХУВААЛЦАХ-д зөвхөн петрографийн 4 файлын нэр солигдсон (MTDH-21→20, 17-1 метр).

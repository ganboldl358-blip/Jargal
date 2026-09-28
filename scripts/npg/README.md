# scripts/npg — NPG тайлангийн L1/L2 хэрэгслүүд (LLM-гүй, лимит хэмнэх)

Ажлын урсгал, туршилтын дүн, аль ажилд аль моделийг хэрэглэх зөвлөмж: [`docs/AI_Workflow_L1L2L3_MN.md`](../../docs/AI_Workflow_L1L2L3_MN.md)

| Скрипт | Юу хийдэг | LLM |
|---|---|---|
| `queue_tool.py` | `_agents\grok\QUEUE.md`: `summary`, `next L1/L2` (paste-ready prompt эсвэл команд), `set` (status шинэчлэх), **`auto`** (L1 API → L2_AUTO → QA → QUEUE, хүнгүй) | — |
| `gemini_l1_api.py` | Split PDF → саарал JPEG → Gemini API (2 х./хүсэлт) → `02_L1_Archive\<stem>_L1_GEMAPI.md`; тасарвал үргэлжилнэ; `--dry-run` тооцоо | Gemini (API) |
| `l2_auto.py` | **Монгол эхийн** L1 → `03_L2_Normalized\<stem>_L2_AUTO.md`: мөр нэгтгэх, `(тайлан, х.N)` иш, `[гараар]` засвар, «исэлдэлтийн», хувийн мэдээлэл хасах. Орос эхийг хүлээж авахгүй | — |
| `qa_check.py` | L1: хуудас дутуу/давхар, мета мөр, грек үсэг, кириллээр бичсэн химийн тэмдэг, холимог үг, латин хог, хүснэгтийн багана гулсалт. L2: иш, масштаб таслагдсан эсэх, `[cite:`, `--l1`-тэй бол **тоо бүрийг L1-тэй тулгана** | — |
| `csv_bom.py` | Drive-аас ирсэн CSV-д UTF-8 BOM нэмнэ (Excel кирилл) | — |
| `tables_to_csv.py` | L1/L2 доторх бүх markdown хүснэгтийг CSV болгож, `_tables_index.csv` үүсгэнэ | — |
| `npg_common.py` | Бусад скриптийн ашигладаг нийтлэг функцууд | — |

## Суулгах (Windows, нэг удаа)

```powershell
py -m pip install google-genai pymupdf pillow      # зөвхөн gemini_l1_api.py-д хэрэгтэй; бусад нь стандарт Python
setx GEMINI_API_KEY "<aistudio.google.com/apikey>"
setx GEMINI_MODEL "<ai.google.dev дээрх Pro загварын id>"
setx NPG_BASE "G:\My Drive\JG GeoHub\_00_System\03_Working\NPG_Report_Texts"
```

Энэ хавтсын `.py` файлуудыг `NPG_Report_Texts\_agents\tools\`-д хуулна (Drive-аар бусад компьютерт синк болно).

## Жишээ

```powershell
py queue_tool.py summary
py gemini_l1_api.py --pdf "...\5000_p061-080_5000_part4.pdf" --report 5000 --pages 71-80 --out-dir "...\02_L1_Archive" --rules "...\_agents\grok\GEMINI_GEM_L1.md" --dry-run
py queue_tool.py auto --rows 5 --with-l2
py qa_check.py "...\03_L2_Normalized\5000_p031-050_L2_GROK.md" --l1 "...\02_L1_Archive\5000_p031-050_L1.md"
py tables_to_csv.py "...\02_L1_Archive" --only 5000_ --out "...\04_Structured_Data\tables"
```

Бүх скрипт **зөвхөн шинэ файл** үүсгэнэ (нэр давхцвал `_v2`). `queue_tool.py set` нь өдрийн анхны өөрчлөлтийн өмнө `_OLD_<огноо>_QUEUE.md` хуулбар хадгална.

## Тест

`tests/` доторх fixture-уудыг Drive-ийн `_agents\grok\test\`-ийн туршилтын гаралтаас (5000 х.71–72 Grok, х.434 Gemini) авсан. QA-г шалгахын тулд зарим алдааг зориуд нэмсэн: латин «buyu», дутуу нүдтэй мөр, `[гараар]`, `[⚠ хувийн мэдээлэл]`.

```bash
python3 qa_check.py tests            # 434 fixture дээр ERROR (грек ΧΙΥ, кирилл Ті) гарах ёстой
python3 l2_auto.py tests --out /tmp/l2
python3 queue_tool.py --queue tests/QUEUE_sample.md --base B: next L2
```

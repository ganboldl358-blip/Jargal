# L3 бүртгэл — NPG тайлангууд

> Шинэчилсэн: 2026-09-28 · Claude Code (Sonnet subagent-ууд + Opus зохицуулалт) · Заавар: `L3_INSTRUCTIONS.md`
> Хавтас: L3 → `06_Master_Reports` `1GqagVR5fvVucTPH0SqTmWcUpvEOmwVZL` · QA → `09_QA\<тайлан>` · numbers → `04_Structured_Data` `1iAVCH4RxrWtQDpUNTgptPLaHx57Udx7j`
> CSV-үүд BOM-гүй — Excel-д нээхийн өмнө `py csv_bom.py "...\04_Structured_Data"` ажиллуул.

## Товч

| Тайлан | Өнөөдөр хийсэн хэсэг | Хуудас | QA шалгасан тоо |
|---|---|---|---|
| 1853_1970_Mapping200K | 19 | 165 | 1557 |
| 0645_1954_Mapping200K | 1 | 2 | 9 |
| 1889_1970_Mapping200K | 1 | 8 | 45 |
| 0057_1932-1936_Thematic | 7 | 148 | 551 |
| 1663_1966_Prospecting | 6 | 77 | 993 |
| 1303 (1963, 1:200 000) — хэсэг | 1 | 4 | 17 |
| 5000_1991-95_Mapping200K | 2 | 30 | 284 |
| **Нийт** | **37** | **434** | **3456** |

QA = «шалгасан/таарсан/зөрөө». Зөрөө нь ихэвчлэн эх баримт доторх `[зөрөө]` (эх сурвалжийн хоёрдмол уншилт) эсвэл L2_GROK-ийн засвар (Gemini L1-ийн а/б/в индексийн алдаа).

## 1853_1970_Mapping200K

| Хуудас | Загварын бүлэг / агуулга | L3 | QA | numbers.csv | QA | Тэмдэглэл |
|---|---|---|---|---|---|---|
| 001-001 | Нүүр хуудас | `18UjRiQkBt2BeD82UtDpjQ5hsLWNdWGV5` | `1A0_wN7Qekh8w1EkmEEVP7NDrwYk8N9Bu` | `1R4oFQ2OIMoqdrjB1nh9Jz4wLoxiiLPQF` | 5/5/0 | — |
| 002-008 | Протокол, шүүмж, товч агуулга | `1SZSuAeALNDwCh1-1ZPMwuYmt2COvvda8` | `1smfnzCfn5pgvpOLYmFWHmniDOuTyhE5d` | `1eJq167IzDPJnD4bMqSsAI868RzuMomZp` | 10/9/1 | 807.1 м OCR гажилт (L2_GROK) |
| 009-010 | Гарчиг, хавсралтын жагсаалт | `1CxCOUJZmEPoMaTtIMCCtaNbq4KlU64VP` | `1psqFdK5HvWrqoCRq1vvz8dMbN_qaUTz6` | `1R_BA3-GqJ58XSNzrt2XpzjzCGQbRtzfL` | 23/22/1 | IV.3.б эхлэх х. L1-д алга |
| 011-014 | График хавсралт, зургийн жагсаалт | `1ywWo_cQbYbzoXuOa0YcTaWqGeroWHciJ` | `16bSsXB5JcAXDTLkNWgJ1z9rUsX1K5c6X` | `1b5ZZv4o_suCXzdSpnDzBR6zqD02WIZwF` | 46/46/4 зөрөө | 4 [зөрөө] эх доторх |
| 067-086 | 2.1 Давхарга зүй (J3–Cr1) | `1m2pTj8OASfVvIjA_ROYRxenkkGFESDB0` | `1-XhqPOytqOmQQd6oW5-P5lhW3wq7cxIN` | `1qbaFy3XBfEJgwU1l35HmJTTK_fFgjua5` | 122/121/1 | х.78 3327з,в засвар; х.83–85 зүсэлтийн нийлбэр эхтэй зөрсөн |
| 087-104 | 2.1 Давхарга зүй (J3–Cr1, Cr1dz) | `1Kvw1x62WZBsMS-jJQ4SdeHSjKf7G4XQ4` | `1_5AJKmr6FFlNrmN5gcf7wHazsf0u6r0f` | `1GxX5a9pyIaCt-7HceZfEG_1kkeGXb4DA` | 173/164/9 | х.93–96 индекс 5 засвар; х.93 13573б|3573б|185730 шийдээгүй; цооног №6, №12 нийлбэр зөрөө |
| 105-115 | 2.1 Давхарга зүй (N, Q) | `1qrYHhfWsxQrrdBA4JuVJNoAo5pNaLgkQ` | `1H_w0g0Gn1CjvA-Z5opbAuplfJkHY2fGH` | `1vSTIeRfS-EbPU3OKqhRe2TCr6sl3Bba9` | 99/98/1 | х.112 20 м|2.0 м зөрөө |
| 116-128 | 2.2 Гүний чулуулаг (P) | `1P7S5IZGOsq0yB3s9InnKL65K_jJTD9U4` | `1J1F9oJ2flUj39B0NITRDC-cXgi56Vh--` | `1PuJsGdDvTArWRKNSMQvRZNVWP3ED3mH6` | 40/37/3 | х.121 3567б засвар; х.120 2857|2839 |
| 129-138 | 2.2 Гүний чулуулаг (P-T, T дайк) | `1ON0naaYcWSfSqfLQw8LRWgGcl6LQCng3` | `1OKQhzUCydiKtu_R0xAGhQ47hA1s1wwr6` | `10POvZ1XIKVjcLt92H5PRu25fX3WCgpjm` | 32/31/1 | х.135 2691б засвар; х.130 км/км² зөрөө |
| 139-147 | 2.2 Гүний чулуулаг (J3, J3–Cr1, Cr1) | `1JU7xn9dnnFsU_1tsp38cEptAn4f2guMT` | `1oKcDG-CPPyPeg72_O3zrdhAabnyaaUqS` | `1lwbaUOyR7T38gU136b5I3L2Wv_mlhfxt` | 28/27/1 | х.146 4011б засвар |
| 148-166 | 2.3 Талбайн тектоник | `1UcD3f1v6CXfMy0EuOu2DT3wdDiWWQUWV` | `1_vFiQW38lK18jn0H4bO_-4Pn-Z8LPL1h` | `1XZr6iupjwV3mpVm0cw1d0FVnm7MA8bCg` | 47/47/0 | х.148 Хасин В.А.|Р.А. |
| 167-174 | 2.5 Геоморфологи | `1UjCigq1nHfSo6lBiuiXzgBwdAlocOasP` | `1kX22N-_CdvI9k3FbR41jbCt2Bvn0m81B` | `1cboJeolWiW2eC_rb3Ys8JOeOYY8O7leZ` | 36/35/1 | х.172 насны OCR гажиг (L2_GROK T–J1) |
| 175-179 | 2.4 Геологийн хөгжлийн түүх | `1hMnPDoFRuRTxVgZivEaN4eBIe9152kjX` | `1xqjMOC5Q38IUCzSsgtXgZg3Z74AC3O1U` | `1O4X8QSSGajuTF4t-aZQsQoLSI-9uAW9A` | 6/6/0 | — |
| 180-188 | 2.6 Гидрогеологи + 2.7 оршил | `1TzTjXUn5eg04d3Zx8JM8QHxv0hxTR_yD` | `1nvcZSiZmlFIKF5vKLKNO7L7LCUvjPt7e` | `1ccUm-LjwBz2Ljh-xs0n_Wk4NXYIXbARu` | 53/51/2 | х.184, 186 цооногийн дугаар L1-д OCR гажсан |
| 192-195 | 2.7 Ашигт малтмал (нүүрс, Fe, Au) | `1m-p7kOXsfavcid4RM-Tm6ZcMruBOJ3ci` | `1GcuvonjtyHtudD034Vo7QQ41gA2Ngynl` | `1Orj-UspvZv6jSU17JukKvX4iJIjxaWl6` | 46/44/2 | № II|№ 11; 18|19 м |
| 201-204 | 2.7 + 3.4 Шлихийн сорьцлолт | `1ItQsLLjGf5A5Ve7B0u-kAi4vVNJfnfcs` | `1vSxJBIU4deynC7U4VG44YeaM-wGC9Pwm` | `1gIOOH5RueOb3m06DOcwGyrds3IF6rIsm` | 45/45/0 | — |
| 207-217 | 3.6 Геофизикийн ажил (ВЭЗ, радиометр) | `1XtM-UZMDA2SFAOlYE4RWx2Z5ejr2uzVw` | `1J_X6VZTx0n1dhmI2QfmtiySoUvGXCK1q` | `111LkBys5WkhZCbZmKNNCLLktMjLpFL7u` | 97/95/2 | х.207 «омм» нэгжийн эх алдаа |
| 233-233 | Хавсралтын хүснэгт (№12 цооногийн фауна) | `1RgJhpL_qluzXB85JPfZgzREGPUC0lBlT` | `1_U3GJ35FCPbutL-GIYOArTLu6mSw1-yW` | `11VX4RKjDLLOMh0VHvpTPg1gOC4ItdDMH` | 5/5/0 | — |
| 234-242 | Хавсралтын хүснэгт (40 сорьцын химийн шинжилгээ, жагсаалт, акт) | `1MaxNiVlggKUB9DK0xICYyT4DMfjp5TKc` | `1zZkfPM8-zGzpOFOB8um0SxqPPmsIaA5h` | `1Rh0UV4cHv0XC16hJ3M9IiKH2zj2WrX-8` | 644/627/9 (+8 GROKFIX) | №8 Σ 99.63|99.98 эх зөрөө; λJ3→αJ3 7; 5016 |

## 0645_1954_Mapping200K

| Хуудас | Загварын бүлэг / агуулга | L3 | QA | numbers.csv | QA | Тэмдэглэл |
|---|---|---|---|---|---|---|
| 001-002 | Дүгнэлт (Модонгийн орд) + шлихийн зураг | `1BjrXz7Gk4hquJpXIXpgSVys6wrC9QcV2` | `1j9vTfXRhXWAFaYJctXY2xI6QPvPlyPgM` | `1qwDoEI-IMI-FaD8qrqD-IbSau-a84NXf` | 9/9/0 | тайлан бүхэлдээ (2 х.) |

## 1889_1970_Mapping200K

| Хуудас | Загварын бүлэг / агуулга | L3 | QA | numbers.csv | QA | Тэмдэглэл |
|---|---|---|---|---|---|---|
| 001-008 | Ag/Au, Cu (Хадат 635 мян.т, 0.43%), As, W, дүгнэлт | `1CeDWIjuvTo_NJrjaUM_FFVSM1Fouw8st` | `1rNFI2iGs8I6BYex_aUxT7qYj_cwc3KyW` | `1zUoA_0SWWnX-JmcOh8x8FKbdeGM7Ei9W` | 45/45/0 | х.2 давхар скан хасав |

## 0057_1932-1936_Thematic

| Хуудас | Загварын бүлэг / агуулга | L3 | QA | numbers.csv | QA | Тэмдэглэл |
|---|---|---|---|---|---|---|
| 001-020 | Нүүр, шүүмж, гарчиг, ОРШИЛ, 1.1–1.2, 1.4 эхлэл | `1CglWTJcqb-5QA2tUy69RQiHpRjSX3ceX` | `1a3Loi-Z00Bb79cRBsuAF1PAd_TyJnw85` | `1q3hEwJRTwccccn8x_8kiZcgCkfdUIQ88` | 57/57/0 | х.1–9 хэвлэмэл дугаар уншигдахгүй |
| 021-030 | 1.4, 2.1, 2.3, 2.4 | `11RqLIRdC9uUTNudvqUkp-ZeoLehhWU8V` | `1MswXOeJi_HpPKCwj86gCP1FHlBB49nzm` | `1bPkjcOUQjs3a-aDrc94nhINaVqUeh51_` | 23/23/0 | х.24=х.25 давхар скан; масштаб 1:1.5M|1:2.5M |
| 031-060 | 2.1 (III бүлгийн төгсгөл) + 2.7 Хүдрийн формацууд | `1FR6hWfTY4Z4WjyA7zDv64OLT3tWxjOCm` | `1pksgoJyaBm4HpjsrI9xt3NEjyCJ4O5X9` | `1bMjcsZNOq6xxF_yY564-JrenQPtz2Nbg` | 158/158/0 | х.47 цуцалсан өгүүлбэр; 3 [зөрөө] |
| 061-075 | 2.7 Металлогенийн тодорхойлолт | `1pS3hlqNz1509D6Drblcs_eIMb9eVL6Yd` | `1WK3ghLbxlB7gTDt-dmW9Y2hqoGr_u1uL` | `19MWyY5XBgAxW5whEL8B88GnJ7kRf5HX4` | 22/21/1 | х.75 хожмын гар тэмдэглэл; 6 [зөрөө] |
| 076-105 | 2.7 Металлогенийн мужлалт + 3. Эрлийн шинж тэмдэг | `12-J4WdO7Kv2p7LXLT5gWnWIHTS1YOYTy` | `1P-jfqRbQEZfZs23YSbnvpv9Kliku3P37` | `1r2A4dJhxmcF3iTvwhQMBEqRBq2efvoiB` | 59/59/0 | Мандах|Мантах [гараар] 4; х.99–101 хүснэгт нэгтгэв |
| 106-133 | 2.7 Ашигт малтмал (Цагаансуварга, Мандах, Хунгут, Нарийн-Худаг) + ДҮГНЭЛТ эхлэл | `1ycFX-Lbz3XVHsMsv1yRfH9GzYapGHuR8` | `1KkPHQQB73lWNdSgPxK7XEPuOfFW8G2eG` | `15kN9ctJY18FqvS27_AxeA5rpOJwahsts` | 150/150/0 | 3 [зөрөө], 2 [уншигдахгүй] |
| 134-148 | ДҮГНЭЛТ төгсгөл, 7. Ашигласан материал (38), ХАВСРАЛТ №1–9 | `143z_g73qtPRdfHKVLJLobu9jx37Zby-Q` | `1PrbhZKX2u0fWrwfZdN5OHvuleZ05M0la` | `1vaGLVxuWp5KlmxY68IjW9VHp73LnNU6q` | 82/78/4 | х.141 42 мөрт тайлангийн жагсаалт CSV-д |

## 1663_1966_Prospecting

| Хуудас | Загварын бүлэг / агуулга | L3 | QA | numbers.csv | QA | Тэмдэглэл |
|---|---|---|---|---|---|---|
| 001-020 | 2.7 Шар бүрдийн нуур, Шаробук нуур | `1OFL2Bn8xaxEY4HokeNRqjBhnyuX48Fjm` | `1RwJUbNukl95YErsRBo01VItCD10CRT2c` | `1Xac8ZXu2xIRpRXtJ9u4FzD8N00gG1xVH` | 263/263/4 | х.11 NaCl 39937,46|34937,46; х.12 CaCO3 21136,24 эх алдаа |
| 021-040 | 2.7 Шаробук нөөц, Нэргүй I орд + 3. аргачлал эхлэл | `1XP7jMJYO-L6iMu3jn341vZyWtrgkGbwy` | `10CtsegKn8B5At4km5gDGiXMmWbwJWQ--` | `1Hcezy79xQrsDO3gbHiCmeO5Eoyrku0dM` | 282/282/4 | х.24 хувийн мэдээлэл хасав; х.37 22|20; х.31 масштаб |
| 041-050 | 2.7 Нэргүй I С2 нөөц, Нэргүй II орд | `1i0OT0LYWKrr486nB7w--PnFX-Qzc7J8C` | `1_6OmhGqpMhq1q9wCqQmc4qg1fvE6md8n` | `1PZ3TTK74cZEDUcBot4RPE94VDX2tlNNy` | 178/175/3 | х.41 NaCl, MgCO3 [зөрөө]; х.50 Сумма тасарсан |
| 051-060 | 2.7 Нэргүй II нөөц, Их Далай, Баруун Шавар нуур | `1ZbpSYQ6I3RxaVDs1a7B_FQSjBrdCagV0` | `1zURwH6OrCkJ5-lbhAXPJr5MGJqRgc9Ec` | `1bib65-n6k6rN2tG77J_CnFjpY8trr3_Q` | 119/119/0 | х.51 297497|307507,2; х.53–54 хувийн мэдээлэл хасав |
| 061-064 | 2.7 Баруун Шавар нуур дүгнэлт, Хотонт нуур, цооног | `1ZWB1OMEV8wNttb7-XwXD1gHvoGN4p5zq` | `1fv1E_e6EOG23WdPPA5VQcn8W4sNP3ik1` | `1sYpL6FqVb6iBNHLz0thm_RfVLhLNm8Qm` | 55/55/0 | х.62 48°07′ засвар; х.63/64 урвуу |
| 065-077 | 2.7 / 3.x Боть II цооногийн баримтжуулалт (№70→60) | `1YNLLfAgg4KZRef4hri-gCVb1_15RvO1n` | `1fYBhHk7nurI6y1zKfLjr4lt1peJXkUCE` | `1FLhp3v2ele41HhJmMd8G_WFJG83zpidM` | 96/95/1 | 1-р багана [уншигдахгүй]; хавтаслалтын дарааллын тодорхойгүй хэсгүүд |

## 1303 (1963, 1:200 000) — хэсэг

| Хуудас | Загварын бүлэг / агуулга | L3 | QA | numbers.csv | QA | Тэмдэглэл |
|---|---|---|---|---|---|---|
| 078-081 (fragment) | 2.3 Тектоник (Матад, гравиметрийн цуваа) — 1663-ын скан дотор | `1b08dsD6RywNbnjRf5-EMNMyR0VAGWmmE` | `1o8_lG2152Keaa6uGA-FcDLQ2z2GvqnvW` | `1pSv4Dm8-8wGsnYNt8S5CEtulPirI6tgl` | 17/17/0 | иш (1303, хэвл. х.182–185) болгож зассан |

## 5000_1991-95_Mapping200K

| Хуудас | Загварын бүлэг / агуулга | L3 | QA | numbers.csv | QA | Тэмдэглэл |
|---|---|---|---|---|---|---|
| 001-020 | ОРШИЛ, 1. Ерөнхий бүлэг, 1.4, 2.7 (давс …) | `1raKK4QoFrqOn7I_ii8ryDJBpv09LyE-o` | `1AUHq7gubyLUv4377brDFzrX2Hh9nHjHd` | `1kAga7uz56D5G2mtBvG3xiVMz16XQTTZZ` | 131/128/3 | х.10 В+1; х.16/17 198_; х.8 дугаар алгассан |
| 021-030 | 2.1 Давхарга зүй (эхлэл) | `14HK6k-Ga_dYJkT8C00mieQUiL1DVG607` | `1y1bgBT0ajvhwdE_uo4ZINman5eMnROaC` | `1-hVrYn0rjmFOHzdWmcpZvPXC5RssFZYe` | 153/152/1 | х.25 520|600 м; х.28 м|мм? |
## Өмнө хийгдсэн L3 (1853, 2026-08-29…09-02, Gemini L2 дээр)

х.015–033 (ОРШИЛ, 1.2), 034–046 ба 047–066 (2.1), 189–191 (2.7 хүрэн нүүрс), 196–197, 198–200, 205–206, 218–219 (ДҮГНЭЛТ), 223–227, 228–232 (хавсралтын хүснэгт), 243–245, 246–252 (хавсралт). Нийт 84 хуудас. `06_Master_Reports`-д байгаа. Энэ удаа эдгээрт хүрээгүй.
Архив: х.253–268-ийн хуучин L3 `06_Master_Reports\_ZZ_old`-д байгаа.

**1853 бүрэн хамрагдсан:** х.001–219 болон 223–252 (тайлангийн үндсэн хэсэг, хавсралтын хүснэгтүүд).

## Хүлээгдэж буй

| Ажил | Юуг хүлээж байгаа |
|---|---|
| 1853 х.220–222 L3 | Grok L2_GROK (хийгдэж байна) |
| 1853 х.253–269 L3 (хавсралтын зураг) | Grok L2_GROK. Мөн эдгээр зурган хуудсанд L3 хэрэгтэй эсэхийг Jak шийднэ (хуучин L3 нь `_ZZ_old`-д байгаа) |
| 1853 х.246–252 L3-ийн «-6 → -б» шалгалт | х.243–252-ын L2_GROK. Одоогийн L3-д зөвхөн «1650/6» (х.248) олдсон |
| 1853-ын хуучин L3-ийг (84 х.) L2_GROK-той тулгах | `numbers.csv`-ийн тоонуудыг L2_GROK-той скриптээр харьцуулна. Зөрсөн мөрийг л засна |
| 5000 х.031–625, 5020, 5172 | L1/L2 (Gemini API эсвэл Gem → `l2_auto.py`) |

## Jak-д шийдүүлэх эх сурвалжийн асуудлууд (L3 Тугийн хүснэгтээс)

- **1853** х.83–85: зүсэлт №5, №13, №3-ын давхаргын нийлбэр эх бичвэрт заасан нийт зузаантай таарахгүй (737.6/766, 1180/767.2, 380.3/128.5 м). Засаагүй.
- **1853** х.93: шлифийн дугаар «13573б | 3573б», L1-д «185730». Шийдэгдээгүй.
- **1853** цооног №6, №12: давхаргын нийлбэр (52.5/53.2, 94.2/97.3, 54.8/62.0 м) зөрүүтэй.
- **1853** х.234 сорьц №8: Σ 99.63, хэвлэснээр 99.98. Эх баримтын зөрүү.
- **1663** х.11: NaCl нөөц 39937,46 эсвэл 34937,46. х.12: CaCO3 21 136,24 (тооцоогоор 2 136,24).
- **1663**: хэвлэмэл х.96–118, 127–134 скан дотор алга (2 дахь PDF-ийн асуудал).
- **5000** х.25: Скарн толгойн зүсэлт 520 м гэсэн боловч давхаргын нийлбэр 600 м. х.10 «В+1» (B+C1?). х.16–17 «198_».
- **1303**: 1663-ын скан дотор энэ тайлангийн 4 хуудас (хэвл. х.182–185) хавсарсан. Тусад нь `1303_p078-081_fragment_*` болгосон.

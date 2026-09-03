# XV-020181 «Модот-3» — T1–T4 элемент-зорилтот striplog: ШАЛГАХ → НЭГТГЭХ → QC хуудас → G: толин хуулбар (нэг товшилт)
# HANDOFF 2026-09-03 §2 B/C/D. Ажиллуулах: RUN_Finish_StripLog_Target.bat (давхар товшино). Дахин ажиллуулж болно (idempotent).
# Юу хийдэг:
#   1. D: Out_Target\<HOLE>\<HOLE>_DrillLog_A3L_<TAG>_2026.pdf — 33 PDF байгаа эсэхийг hole_template_map.csv-тэй тулгана
#   2. 15_merge_striplogs_target.py  → Out_Target\_Merged\Modot3_StripLog_<TAG>_<огноо>.pdf (T1/T2/T3/T4 тус бүр 1) + Merge_index
#   3. 16_qc_contact_sheet_target.py → Out_Target\_QC_Sheets\ (визуал QC-д зориулсан жижиг JPG/PDF + хүснэгт)
#   4. robocopy D: → G: АЖЛЫН (03_Working\…\09_Drilling\04_Striplog_Section\Out_v3, Out_Target, Templates) + СКРИПТ хавтас
#   5. Лог → G:\…\_00_System\01_Logs\XV-020181_StripLog_Target_Finish_<огноо>.log.md
# ХУВААЛЦАХ (01_Projects) руу ЮУ Ч бичихгүй — тэр нь Publish_StripLog_Target.ps1 (Жаргалын шийдвэрээр тусад нь).
param([switch]$SkipMirror, [switch]$SkipQC, [switch]$SkipMerge)
$ErrorActionPreference = "Continue"
$Here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkD   = "D:\AZ9\_00_Work_Logs\Modot-3_StripLog"
$PrepD   = "D:\AZ9\_00_Work_Logs\Modot-3_Prep"
$OutT    = Join-Path $WorkD "Out_Target"
$MapCsv  = Join-Path $WorkD "Templates\hole_template_map.csv"
$DbG     = "G:\My Drive\JG GeoHub\01_Projects\XV-020181_Dornogobi Airag_Modot-3\09_Drilling\01_Drilling_Database\MT_Drilling_Database.xlsx"
$DbD     = Join-Path $PrepD "MT_Drilling_Database.xlsx"
$WorkingG = "G:\My Drive\JG GeoHub\_00_System\03_Working\XV-020181_Dornogobi Airag_Modot-3"
$ScriptsG = "G:\My Drive\JG GeoHub\_00_System\02_Scripts\XV-020181_StripLog_20260903"
$LogsG   = "G:\My Drive\JG GeoHub\_00_System\01_Logs"
$Stamp   = Get-Date -Format "yyyyMMdd_HHmm"
$DateTag = Get-Date -Format "yyyyMMdd"
$LogF    = Join-Path $LogsG ("XV-020181_StripLog_Target_Finish_" + $Stamp + ".log.md")
$Lines   = @("# XV-020181 T1-T4 striplog — finish run " + (Get-Date -Format "yyyy-MM-dd HH:mm"), "")

function WriteStep([string]$msg) { Write-Host ""; Write-Host ("=== " + $msg + " ===") -ForegroundColor Cyan }
function AddLogLine([string]$s) { $script:Lines += $s; Write-Host $s }

WriteStep "0. Орчин"
if (-not (Test-Path $OutT)) { Write-Host ("Out_Target АЛГА: " + $OutT) -ForegroundColor Red; Read-Host "Enter"; exit 1 }
$Db = $null
if (Test-Path $DbG) { $Db = $DbG } elseif (Test-Path $DbD) { $Db = $DbD }
if (-not $Db) { Write-Host "MT_Drilling_Database.xlsx олдсонгүй (G: ба D:)" -ForegroundColor Red; Read-Host "Enter"; exit 1 }
$PyCmd = Get-Command py -ErrorAction SilentlyContinue
if (-not $PyCmd) { $PyCmd = Get-Command python -ErrorAction SilentlyContinue }
if (-not $PyCmd) { Write-Host "Python (py/python) олдсонгүй" -ForegroundColor Red; Read-Host "Enter"; exit 1 }
$Py = $PyCmd.Source
AddLogLine ("Python: " + $Py + " · Бааз: " + $Db)
& $Py -m pip install --quiet --disable-pip-version-check openpyxl pypdf matplotlib pillow pymupdf 2>&1 | Select-Object -Last 2

WriteStep "1. Гаралтын PDF тулгалт (Out_Target vs hole_template_map.csv)"
$Pdfs = Get-ChildItem -Path $OutT -Recurse -File -Filter "MTDH-*_DrillLog_A3L_T*.pdf" | Where-Object { $_.Directory.Name -like "MTDH-*" }
$Have = @{}
foreach ($p in $Pdfs) { if ($p.Name -match "^(MTDH-\d\d)_DrillLog_A3L_(T[1-4])") { $Have[($Matches[1] + " " + $Matches[2])] = $p.Length } }
$Expected = @{}
if (Test-Path $MapCsv) {
    $rows = Import-Csv -Path $MapCsv -Encoding UTF8
    $cols = ($rows | Get-Member -MemberType NoteProperty).Name
    $cHole = $cols | Where-Object { $_ -match "(?i)hole|цооног" } | Select-Object -First 1
    $cT1   = $cols | Where-Object { $_ -match "(?i)template" -and $_ -notmatch "(?i)second|2" } | Select-Object -First 1
    $cT2   = $cols | Where-Object { $_ -match "(?i)second" } | Select-Object -First 1
    foreach ($r in $rows) {
        $h = ("" + $r.$cHole).Trim().ToUpper(); if (-not $h) { continue }
        foreach ($c in @($cT1, $cT2)) { if ($c -and ("" + $r.$c) -match "T[1-4]") { $Expected[($h + " " + $Matches[0])] = 1 } }
    }
    AddLogLine ("Map: " + $Expected.Count + " ажил (" + $MapCsv + ")")
} else { AddLogLine ("Map csv алга: " + $MapCsv + " — зөвхөн олдсон файлаар үргэлжилнэ") }
$Missing = @($Expected.Keys | Where-Object { -not $Have.ContainsKey($_) } | Sort-Object)
$Extra   = @($Have.Keys | Where-Object { $Expected.Count -gt 0 -and -not $Expected.ContainsKey($_) } | Sort-Object)
$T1 = @($Have.Keys | Where-Object { $_ -like "* T1" }).Count; $T2 = @($Have.Keys | Where-Object { $_ -like "* T2" }).Count
$T3 = @($Have.Keys | Where-Object { $_ -like "* T3" }).Count; $T4 = @($Have.Keys | Where-Object { $_ -like "* T4" }).Count
AddLogLine ("Олдсон PDF: " + $Have.Count + " (T1 " + $T1 + " · T2 " + $T2 + " · T3 " + $T3 + " · T4 " + $T4 + ")")
if ($Missing.Count -gt 0) { AddLogLine ("!! Map-д байгаа ч PDF АЛГА: " + ($Missing -join ", ")) }
if ($Extra.Count -gt 0)   { AddLogLine ("!  PDF байгаа ч map-д байхгүй: " + ($Extra -join ", ")) }
if ($Have.Count -eq 0) { Write-Host "PDF олдсонгүй — зогсов" -ForegroundColor Red; Read-Host "Enter"; exit 1 }

if (-not $SkipMerge) {
    WriteStep "2. Загвар тус бүрийн нэгтгэсэн PDF (15_merge_striplogs_target.py)"
    & $Py (Join-Path $Here "15_merge_striplogs_target.py") --out-target $OutT --db $Db --map $MapCsv --date $DateTag
    $MergeRc = $LASTEXITCODE
    $Merged = Get-ChildItem -Path (Join-Path $OutT "_Merged") -Filter ("Modot3_StripLog_T*_" + $DateTag + ".pdf") -ErrorAction SilentlyContinue
    AddLogLine ("Нэгтгэсэн PDF: " + @($Merged).Count + " (rc=" + $MergeRc + ")")
    foreach ($m in $Merged) { AddLogLine ("  - " + $m.Name + "  " + [math]::Round($m.Length / 1MB, 1) + " MB") }
}
if (-not $SkipQC) {
    WriteStep "3. Визуал QC contact sheet (16_qc_contact_sheet_target.py)"
    & $Py (Join-Path $Here "16_qc_contact_sheet_target.py") --out-target $OutT --date $DateTag
    $Qc = Get-ChildItem -Path (Join-Path $OutT "_QC_Sheets") -File -ErrorAction SilentlyContinue
    AddLogLine ("QC файл: " + @($Qc).Count + " (_QC_Sheets)")
}
if (-not $SkipMirror) {
    WriteStep "4. D: → G: АЖЛЫН + СКРИПТ толин хуулбар (robocopy /E /XO)"
    $dst1 = Join-Path $WorkingG "09_Drilling\04_Striplog_Section"
    $dst2 = Join-Path $WorkingG "09_Drilling\03_Assay\04_Sample_Dispatch"
    foreach ($d in @($dst1, $dst2, $ScriptsG)) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null } }
    foreach ($sub in @("Out_v3", "Out_Target", "Templates")) {
        if (Test-Path (Join-Path $WorkD $sub)) { robocopy (Join-Path $WorkD $sub) (Join-Path $dst1 $sub) /E /XO /R:1 /W:1 /NP /NDL /NJH | Select-Object -Last 6 }
    }
    if (Test-Path (Join-Path $WorkD "00_STATUS.md")) { Copy-Item (Join-Path $WorkD "00_STATUS.md") (Join-Path $dst1 "00_STATUS_StripLog.md") -Force }
    if (Test-Path (Join-Path $PrepD "Register_v2_csv")) { robocopy (Join-Path $PrepD "Register_v2_csv") (Join-Path $dst2 "Register_v2_csv") /E /XO /R:1 /W:1 /NP /NDL /NJH | Select-Object -Last 6 }
    Get-ChildItem $PrepD -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like "Modot3_Resampling_Register_v2_*" -or $_.Name -like "*Керний*" } | ForEach-Object { Copy-Item $_.FullName $dst2 -Force }
    Get-ChildItem $WorkD -File -Filter *.py -ErrorAction SilentlyContinue | ForEach-Object { Copy-Item $_.FullName $ScriptsG -Force }
    Get-ChildItem $PrepD -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "^1[1-4]_.*\.py$" } | ForEach-Object { Copy-Item $_.FullName $ScriptsG -Force }
    Get-ChildItem (Join-Path $WorkD "Templates") -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "\.(py|csv|md)$" } | ForEach-Object { Copy-Item $_.FullName $ScriptsG -Force }
    $n1 = @(Get-ChildItem $dst1 -Recurse -File -ErrorAction SilentlyContinue).Count
    $m1 = @(Get-ChildItem (Join-Path $WorkD "Out_v3"), (Join-Path $WorkD "Out_Target"), (Join-Path $WorkD "Templates") -Recurse -File -ErrorAction SilentlyContinue).Count
    $n3 = @(Get-ChildItem $ScriptsG -File -ErrorAction SilentlyContinue).Count
    AddLogLine ("АЖЛЫН 04_Striplog_Section: " + $n1 + " файл (D: эх " + $m1 + ") · СКРИПТ хавтас: " + $n3 + " файл")
    AddLogLine "ХУВААЛЦАХ (01_Projects) хөндөгдөөгүй."
}
WriteStep "5. Лог"
if (-not (Test-Path $LogsG)) { New-Item -ItemType Directory -Path $LogsG | Out-Null }
$Lines | Out-File -FilePath $LogF -Encoding utf8
Write-Host ("Лог: " + $LogF) -ForegroundColor Yellow
Write-Host "Дараагийн алхам: _QC_Sheets/QC_*.jpg-ээр визуал QC → засвар → ХУВААЛЦАХ-д тавих эсэх (Жаргал) → RUN_Publish_StripLog_Target.bat" -ForegroundColor Green
Read-Host "Enter дарж хаана уу"

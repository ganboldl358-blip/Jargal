# XV-020181 «Модот-3» — D: ажлын хавтсыг G: АЖЛЫН/СКРИПТ давхаргад толин хуулах (CLAUDE.md §2.1, §4.7, §5)
# D:\AZ9\_00_Work_Logs\Modot-3_StripLog\{Out_v3,Out_Target,Templates,*.py,00_STATUS.md}
#   → G:\My Drive\JG GeoHub\_00_System\03_Working\XV-020181_Dornogobi Airag_Modot-3\09_Drilling\04_Striplog_Section\
# D:\AZ9\_00_Work_Logs\Modot-3_Prep\{Register_v2*, Modot3_Resampling_Register_v2_*, Модот-3_Керний_*, 11_,12_,13_*.py}
#   → G:\…\03_Working\XV-020181…\09_Drilling\03_Assay\04_Sample_Dispatch\
# Скриптүүд → G:\…\_00_System\02_Scripts\XV-020181_StripLog_20260903\
# Ажиллуулах: RUN_Mirror_StripLog_Work_to_G.bat (давхар товшино). Idempotent (robocopy /E /XO). ХУВААЛЦАХ (01_Projects) руу ЮУ Ч бичихгүй.
$ErrorActionPreference = "Continue"
$W = "G:\My Drive\JG GeoHub\_00_System\03_Working\XV-020181_Dornogobi Airag_Modot-3"
$S = "G:\My Drive\JG GeoHub\_00_System\02_Scripts\XV-020181_StripLog_20260903"
$src1 = "D:\AZ9\_00_Work_Logs\Modot-3_StripLog"
$src2 = "D:\AZ9\_00_Work_Logs\Modot-3_Prep"
$dst1 = Join-Path $W "09_Drilling\04_Striplog_Section"
$dst2 = Join-Path $W "09_Drilling\03_Assay\04_Sample_Dispatch"
foreach ($d in @($dst1, $dst2, $S)) { if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null } }
Write-Host "=== Out_v3 / Out_Target / Templates -> АЖЛЫН ===" -ForegroundColor Cyan
robocopy "$src1\Out_v3" "$dst1\Out_v3" /E /XO /R:1 /W:1 /NP /NDL | Select-Object -Last 8
robocopy "$src1\Out_Target" "$dst1\Out_Target" /E /XO /R:1 /W:1 /NP /NDL | Select-Object -Last 8
robocopy "$src1\Templates" "$dst1\Templates" /E /XO /R:1 /W:1 /NP /NDL | Select-Object -Last 8
Copy-Item "$src1\00_STATUS.md" "$dst1\00_STATUS_StripLog.md" -Force
Write-Host "=== Дахин дээжлэлт v2 -> АЖЛЫН ===" -ForegroundColor Cyan
robocopy "$src2\Register_v2_csv" "$dst2\Register_v2_csv" /E /XO /R:1 /W:1 /NP /NDL | Select-Object -Last 8
Get-ChildItem "$src2" -File | Where-Object { $_.Name -like "Modot3_Resampling_Register_v2_*" -or $_.Name -like "Модот-3_Керний_*" } | ForEach-Object { Copy-Item $_.FullName $dst2 -Force; Write-Host ("  " + $_.Name) }
Write-Host "=== Скриптүүд -> СКРИПТ ===" -ForegroundColor Cyan
Get-ChildItem "$src1" -File -Filter *.py | ForEach-Object { Copy-Item $_.FullName $S -Force; Write-Host ("  " + $_.Name) }
Get-ChildItem "$src2" -File | Where-Object { $_.Name -match "^1[1-4]_.*\.py$" } | ForEach-Object { Copy-Item $_.FullName $S -Force; Write-Host ("  " + $_.Name) }
Write-Host ""
$n1 = (Get-ChildItem $dst1 -Recurse -File).Count; $n2 = (Get-ChildItem $dst2 -Recurse -File).Count; $n3 = (Get-ChildItem $S -File).Count
$m1 = (Get-ChildItem "$src1\Out_v3","$src1\Out_Target","$src1\Templates" -Recurse -File).Count + 1
Write-Host ("АЖЛЫН 04_Striplog_Section: " + $n1 + " файл (D: эх " + $m1 + ") · 04_Sample_Dispatch: " + $n2 + " · СКРИПТ: " + $n3) -ForegroundColor Yellow
$log = "G:\My Drive\JG GeoHub\_00_System\01_Logs\XV-020181_Mirror_StripLog_Work_" + (Get-Date -Format "yyyyMMdd_HHmm") + ".log.md"
@("# XV-020181 D:→G: толин хуулбар " + (Get-Date -Format "yyyy-MM-dd HH:mm"), "", "| Хавтас | Файл |", "|---|---|",
  "| АЖЛЫН 04_Striplog_Section (Out_v3, Out_Target, Templates) | " + $n1 + " (D: эх " + $m1 + ") |",
  "| АЖЛЫН 03_Assay\04_Sample_Dispatch (Register v2) | " + $n2 + " |", "| СКРИПТ XV-020181_StripLog_20260903 | " + $n3 + " |",
  "", "ХУВААЛЦАХ (01_Projects) хөндөгдөөгүй.") | Out-File -FilePath $log -Encoding utf8
Write-Host ("Лог: " + $log)
Read-Host "Enter дарж хаана уу"

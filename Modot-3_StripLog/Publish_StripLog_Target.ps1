# XV-020181 «Модот-3» — T1–T4 элемент-зорилтот striplog → ХУВААЛЦАХ (01_Projects) давхарга
# !! ЗӨВХӨН ЖАРГАЛЫН ШИЙДВЭРЭЭР (HANDOFF §2-D: «T-загварын PDF-ийг ХУВААЛЦАХ-д тавих эсэх — Жаргалын шийдвэр хүлээгдэж байна»).
# Санал: 04_Striplog_Section\<HOLE>\ дотор v2 + v3 + T-загвар зэрэгцээ; нэр <HOLE>_DrillLog_A3L_<TAG>_2026.pdf (DRAFT/AI үггүй).
# Дүрэм: -Yes параметргүй бол ЗӨВХӨН жагсаалт хэвлэнэ (хуулахгүй). RUN_Publish_StripLog_Target.bat нь -Yes-тэй дууддаг.
param([switch]$Yes)
$ErrorActionPreference = "Stop"
$src  = "D:\AZ9\_00_Work_Logs\Modot-3_StripLog\Out_Target"
$dst  = "G:\My Drive\JG GeoHub\01_Projects\XV-020181_Dornogobi Airag_Modot-3\09_Drilling\04_Striplog_Section"
$logf = "G:\My Drive\JG GeoHub\_00_System\01_Logs" + "\XV-020181_StripLog_Target_Publish_" + (Get-Date -Format "yyyyMMdd_HHmm") + ".log.md"
$mode = if ($Yes) { "ХУУЛНА" } else { "ЗӨВХӨН ЖАГСААЛТ (dry-run) — хуулахын тулд -Yes" }
Write-Host ("=== XV-020181 StripLog T1-T4 -> ХУВААЛЦАХ · " + $mode + " ===") -ForegroundColor Cyan
Write-Host ("Эх:   " + $src); Write-Host ("Очих: " + $dst); Write-Host ""
$files = Get-ChildItem -Path $src -Recurse -File -Filter "MTDH-*_DrillLog_A3L_T*_2026.pdf" | Where-Object { $_.Directory.Name -like "MTDH-*" -and $_.Name -notmatch "DRAFT" } | Sort-Object Name
$before = @(Get-ChildItem -Path $dst -Recurse -Filter *.pdf -ErrorAction SilentlyContinue).Count
Write-Host ("ӨМНӨ: ХУВААЛЦАХ-д " + $before + " PDF · эх T-загвар " + @($files).Count + " PDF") -ForegroundColor Yellow
$rows = @(); $ok = 0; $fail = 0
foreach ($f in $files) {
    $hole = $f.Directory.Name
    $dDir = Join-Path $dst $hole
    $d = Join-Path $dDir $f.Name
    if (-not $Yes) { Write-Host ("  " + $hole + " : " + $f.Name + "  " + [math]::Round($f.Length / 1MB, 1) + " MB  -> " + $dDir); continue }
    if (-not (Test-Path $dDir)) { New-Item -ItemType Directory -Path $dDir | Out-Null }
    Copy-Item -LiteralPath $f.FullName -Destination $d -Force
    if ((Get-Item -LiteralPath $d).Length -eq $f.Length) { $ok++; $rows += ("| " + $hole + " | " + $f.Name + " | " + [math]::Round($f.Length / 1MB, 1) + " | OK |"); Write-Host ("  " + $hole + " : OK " + $f.Name) }
    else { $fail++; $rows += ("| " + $hole + " | " + $f.Name + " | 0 | SIZE MISMATCH |"); Write-Host ("  " + $hole + " : ХЭМЖЭЭ ЗӨРҮҮ " + $f.Name) -ForegroundColor Red }
}
if ($Yes) {
    $after = @(Get-ChildItem -Path $dst -Recurse -Filter *.pdf -ErrorAction SilentlyContinue).Count
    Write-Host ("ДАРАА: " + $after + " PDF · амжилттай " + $ok + " / алдаа " + $fail) -ForegroundColor Yellow
    @("# XV-020181 StripLog T1-T4 → ХУВААЛЦАХ " + (Get-Date -Format "yyyy-MM-dd HH:mm"), "",
      ("Эх: " + $src + " → " + $dst), "", ("| Өмнө | Дараа | OK | Алдаа |"), "|---|---|---|---|", ("| " + $before + " | " + $after + " | " + $ok + " | " + $fail + " |"), "",
      "| Цооног | Файл | MB | Төлөв |", "|---|---|---|---|") + $rows | Out-File -FilePath $logf -Encoding utf8
    Write-Host ("Лог: " + $logf) -ForegroundColor Cyan
}
Read-Host "Enter дарж хаана уу"

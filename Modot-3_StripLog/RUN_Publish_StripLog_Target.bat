@echo off
echo !! T-zagvar PDF -> HUVAALTSAH (01_Projects). Zuvhun Jargalyn shiidvereer. Ctrl+C = bolih.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Publish_StripLog_Target.ps1" -Yes

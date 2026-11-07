@echo off
cd /d "%~dp0"
echo AFTER 11:07 PUBLIC local server
echo Open: http://127.0.0.1:4173/
start "" "http://127.0.0.1:4173/"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0START_LOCAL_TEST.ps1"
pause

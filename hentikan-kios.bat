@echo off
title Hentikan Server Nusantara Payment
cd /d "%~dp0"

echo Menghentikan proses server background...
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*server\index.js*' -or $_.CommandLine -like '*server/index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Server (PID ' $_.ProcessId ') berhasil dihentikan.' }"

echo.
echo Server telah dihentikan.
pause

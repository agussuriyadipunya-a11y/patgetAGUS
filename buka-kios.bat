@echo off
title Nusantara Payment - Kiosk
cd /d "%~dp0"

echo Memeriksa status server Nusantara Payment...
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/api/health' -TimeoutSec 2 -UseBasicParsing; exit 0 } catch { exit 1 }"
if %errorlevel% neq 0 (
    echo Menjalankan server di background...
    wscript.exe "%~dp0jalankan-background.vbs"
) else (
    echo Server sudah berjalan di background. Membuka browser...
    start http://localhost:3000
)
exit

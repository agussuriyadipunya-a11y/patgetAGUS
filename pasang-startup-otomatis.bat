@echo off
title Pasang Nusantara Payment di Windows Startup
cd /d "%~dp0"

echo Memasang pintasan di Windows Startup...
powershell -NoProfile -Command "$wsh = New-Object -ComObject WScript.Shell; $startup = [Environment]::GetFolderPath('Startup'); $sc = $wsh.CreateShortcut($startup + '\NusantaraPayment-Kiosk.lnk'); $sc.TargetPath = 'wscript.exe'; $sc.Arguments = '\"%~dp0jalankan-background.vbs\"'; $sc.WorkingDirectory = '%~dp0'; $sc.Description = 'Nusantara Payment Auto-Start'; $sc.Save(); Write-Host 'Berhasil dipasang di folder Startup: ' $startup"

echo.
echo Selesai! Server Kios kini akan otomatis berjalan di background setiap kali komputer dinyalakan.
pause

@echo off
REM Backup harian ERP Astadeca (dipanggil oleh Windows Task Scheduler).
REM Menjalankan backup dan menulis log ke backups\backup.log
cd /d "%~dp0.."
echo ==== %date% %time% ==== >> "backups\backup.log"
node scripts\backup.mjs >> "backups\backup.log" 2>&1

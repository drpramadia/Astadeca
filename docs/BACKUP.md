# Backup & Restore — ERP Astadeca

Karena paket Supabase & Vercel gratis, backup dilakukan **mandiri ke komputer lokal**.

## Backup manual
```bash
npm run backup
```
Hasil tersimpan di folder `backups/erp-astadeca_<timestamp>.json`.

- Tanpa `pg_dump`/Docker, otomatis memakai **mode JSON** (semua tabel `public`).
- Kalau ada `pg_dump` (atau Docker jalan), ia membuat **SQL dump penuh** (termasuk `auth.users`).
- Paksa mode: `npm run backup -- --json` atau `npm run backup -- --sql`.

> Catatan: mode JSON **tidak** menyertakan `auth.users` (skema terproteksi) — data karyawan
> login tetap ada di Supabase. Untuk dump lengkap termasuk auth, pakai mode SQL (`pg_dump`).

## Restore
```bash
npm run restore backups/erp-astadeca_<timestamp>.json
```
- Menimpa isi tabel (TRUNCATE lalu INSERT). Minta konfirmasi; lewati dengan `--yes`.
- Sebaiknya lakukan di lingkungan uji dulu.

## Jadwal otomatis (Windows)
Script `scripts/backup-daily.bat` menjalankan backup & menulis log ke `backups/backup.log`.

Daftarkan ke Task Scheduler (jalankan di PowerShell **sebagai Administrator**):
```powershell
schtasks /Create /TN "ERP Astadeca Backup" /TR "cmd /c \"C:\Users\Dio Pramdia\erp-astadeca\scripts\backup-daily.bat\"" /SC DAILY /ST 23:00
```
Ubah path bila lokasi project berbeda. Cek dengan `schtasks /Query /TN "ERP Astadeca Backup"`.

## Simpan salinan di luar komputer
Agar aman bila komputer rusak, salin folder `backups/` secara berkala ke
flashdisk / Google Drive / komputer lain.

## Keamanan
- File backup berisi data perusahaan — simpan di tempat aman, jangan di-commit ke Git
  (folder `backups/` sudah di-`.gitignore`).
- `DATABASE_URL` disimpan di `.env.local` (tidak di-commit).

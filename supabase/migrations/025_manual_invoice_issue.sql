-- ============================================================
-- ERP ASTADECA — Migration 025
-- Penerbitan invoice menjadi MANUAL (via tombol "Terbitkan Invoice"),
-- bukan otomatis saat barang masuk/keluar.
--   - Hapus trigger trg_receiving_billing & trg_release_billing
--     (yang memanggil calculate_rental_billing otomatis).
--   - SNAPSHOT HARIAN tetap berjalan (refresh_daily_usage_*), sehingga
--     kg per hari tetap tercatat; invoice baru terbit saat Admin menekan
--     "Terbitkan Invoice" (memanggil calculate_rental_billing).
-- ============================================================

DROP TRIGGER IF EXISTS trg_receiving_billing ON public.rental_receivings;
DROP FUNCTION IF EXISTS public.on_rental_receiving_inserted();

DROP TRIGGER IF EXISTS trg_release_billing ON public.rental_releases;
DROP FUNCTION IF EXISTS public.on_rental_release_inserted();

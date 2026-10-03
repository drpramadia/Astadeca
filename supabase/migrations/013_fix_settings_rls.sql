-- ============================================================
-- ERP ASTADECA — Migration 013
-- Perbaiki RLS organization_settings:
--   - BACA  : anggota organisasi (agar halaman memakai nilainya)
--   - TULIS : hanya SYSTEM_ADMIN
-- Bug: policy lama "FOR ALL" membolehkan semua anggota org menulis,
--      padahal pengaturan global harus khusus SYSTEM_ADMIN.
-- ============================================================

DROP POLICY IF EXISTS organization_settings_org_access ON public.organization_settings;

-- Baca: anggota organisasi
DROP POLICY IF EXISTS organization_settings_read ON public.organization_settings;
CREATE POLICY organization_settings_read ON public.organization_settings FOR SELECT TO authenticated
  USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()));

-- Tulis (insert/update/delete): hanya SYSTEM_ADMIN
DROP POLICY IF EXISTS organization_settings_write ON public.organization_settings;
CREATE POLICY organization_settings_write ON public.organization_settings FOR ALL TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

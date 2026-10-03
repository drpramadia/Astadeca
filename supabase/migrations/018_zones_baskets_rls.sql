-- ============================================================
-- ERP ASTADECA — Migration 018
-- RLS untuk cold_storage_zones & cold_storage_baskets.
-- Bug: kedua tabel RLS aktif TAPI tanpa policy -> tidak ada yang
--      bisa baca -> dropdown Zona & Basket kosong ("zona tidak bisa dipakai").
-- Tabel ini tidak punya organization_id; org diambil via cold_storage_id.
-- ============================================================

-- ---------- ZONES ----------
DROP POLICY IF EXISTS zones_org_access ON public.cold_storage_zones;
CREATE POLICY zones_org_access ON public.cold_storage_zones FOR ALL TO authenticated
  USING (
    public.is_system_admin()
    OR cold_storage_id IN (
      SELECT id FROM public.cold_storages WHERE organization_id IN (SELECT public.my_org_ids())
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR cold_storage_id IN (
      SELECT id FROM public.cold_storages WHERE organization_id IN (SELECT public.my_org_ids())
    )
  );

-- ---------- BASKETS ----------
DROP POLICY IF EXISTS baskets_org_access ON public.cold_storage_baskets;
CREATE POLICY baskets_org_access ON public.cold_storage_baskets FOR ALL TO authenticated
  USING (
    public.is_system_admin()
    OR zone_id IN (
      SELECT z.id FROM public.cold_storage_zones z
      JOIN public.cold_storages cs ON cs.id = z.cold_storage_id
      WHERE cs.organization_id IN (SELECT public.my_org_ids())
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR zone_id IN (
      SELECT z.id FROM public.cold_storage_zones z
      JOIN public.cold_storages cs ON cs.id = z.cold_storage_id
      WHERE cs.organization_id IN (SELECT public.my_org_ids())
    )
  );

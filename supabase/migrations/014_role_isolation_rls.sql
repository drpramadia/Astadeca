-- ============================================================
-- ERP ASTADECA — Migration 014
-- Isolasi role di level DATABASE (RLS), bukan hanya di sidebar.
-- Masalah: policy lama hanya "org-scoped", sehingga WAREHOUSE bisa
--          membaca transaksi keuangan, invoice, payment, pengaturan,
--          permissions, role_permissions, accounts.
-- Solusi: batasi tabel sensitif ke role yang berhak.
-- ============================================================

-- Helper: apakah user punya salah satu role tertentu
CREATE OR REPLACE FUNCTION public.has_role(p_codes text[])
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_memberships om
    JOIN public.roles r ON r.id = om.role_id
    WHERE om.user_id = auth.uid()
      AND om.is_active = true
      AND r.code = ANY (p_codes)
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(text[]) TO authenticated, service_role;

-- ------------------------------------------------------------
-- KEUANGAN: hanya ADMIN, DIRECTOR, SYSTEM_ADMIN
-- ------------------------------------------------------------
DROP POLICY IF EXISTS transactions_org_access ON public.transactions;
CREATE POLICY transactions_finance_access ON public.transactions FOR ALL TO authenticated
  USING (public.is_system_admin() OR (public.has_role(ARRAY['ADMIN','DIRECTOR']) AND organization_id IN (SELECT public.my_org_ids())))
  WITH CHECK (public.is_system_admin() OR (public.has_role(ARRAY['ADMIN','DIRECTOR']) AND organization_id IN (SELECT public.my_org_ids())));

DROP POLICY IF EXISTS payments_org_access ON public.payments;
CREATE POLICY payments_finance_access ON public.payments FOR ALL TO authenticated
  USING (public.is_system_admin() OR (public.has_role(ARRAY['ADMIN','DIRECTOR']) AND organization_id IN (SELECT public.my_org_ids())))
  WITH CHECK (public.is_system_admin() OR (public.has_role(ARRAY['ADMIN','DIRECTOR']) AND organization_id IN (SELECT public.my_org_ids())));

DROP POLICY IF EXISTS rental_billing_org_access ON public.rental_billing;
CREATE POLICY rental_billing_finance_access ON public.rental_billing FOR ALL TO authenticated
  USING (public.is_system_admin() OR (public.has_role(ARRAY['ADMIN','DIRECTOR']) AND organization_id IN (SELECT public.my_org_ids())))
  WITH CHECK (public.is_system_admin() OR (public.has_role(ARRAY['ADMIN','DIRECTOR']) AND organization_id IN (SELECT public.my_org_ids())));

DROP POLICY IF EXISTS accounts_org_access ON public.accounts;
CREATE POLICY accounts_finance_access ON public.accounts FOR ALL TO authenticated
  USING (public.is_system_admin() OR (public.has_role(ARRAY['ADMIN','DIRECTOR']) AND organization_id IN (SELECT public.my_org_ids())))
  WITH CHECK (public.is_system_admin() OR (public.has_role(ARRAY['ADMIN','DIRECTOR']) AND organization_id IN (SELECT public.my_org_ids())));

-- ------------------------------------------------------------
-- Pengaturan global: baca tetap org; TULIS hanya SYSTEM_ADMIN (sudah dari 013)
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- Administrasi: permissions & role_permissions -> hanya SYSTEM_ADMIN
-- ------------------------------------------------------------
DROP POLICY IF EXISTS permissions_read ON public.permissions;
CREATE POLICY permissions_admin_read ON public.permissions FOR SELECT TO authenticated
  USING (public.is_system_admin());
DROP POLICY IF EXISTS permissions_admin_write ON public.permissions;
CREATE POLICY permissions_admin_write ON public.permissions FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

DROP POLICY IF EXISTS role_permissions_read ON public.role_permissions;
CREATE POLICY role_permissions_admin_read ON public.role_permissions FOR SELECT TO authenticated
  USING (public.is_system_admin());
DROP POLICY IF EXISTS role_permissions_admin_write ON public.role_permissions;
CREATE POLICY role_permissions_admin_write ON public.role_permissions FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

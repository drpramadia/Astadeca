-- ============================================================
-- Migration 003: RLS policies
-- Every authenticated user can read/write rows inside the
-- organization(s) they belong to. SYSTEM_ADMIN can do anything.
-- ============================================================

-- helper: orgs visible to current user (or all if system admin)
CREATE OR REPLACE FUNCTION public.my_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.organization_id
  FROM public.organization_memberships om
  WHERE om.user_id = auth.uid() AND om.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.my_org_ids() TO authenticated;

-- ------------------------------------------------------------
-- Roles / permissions: readable by any authenticated user
-- (needed so the UI can render role names); managed by SYSTEM_ADMIN
-- ------------------------------------------------------------
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_read ON public.roles;
CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS roles_admin_write ON public.roles;
CREATE POLICY roles_admin_write ON public.roles FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

DROP POLICY IF EXISTS permissions_read ON public.permissions;
CREATE POLICY permissions_read ON public.permissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS permissions_admin_write ON public.permissions;
CREATE POLICY permissions_admin_write ON public.permissions FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

DROP POLICY IF EXISTS role_permissions_read ON public.role_permissions;
CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS role_permissions_admin_write ON public.role_permissions;
CREATE POLICY role_permissions_admin_write ON public.role_permissions FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

-- ------------------------------------------------------------
-- Organizations
-- ------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_read ON public.organizations;
CREATE POLICY organizations_read ON public.organizations FOR SELECT TO authenticated
  USING (public.is_system_admin() OR id IN (SELECT public.my_org_ids()));
DROP POLICY IF EXISTS organizations_admin_write ON public.organizations;
CREATE POLICY organizations_admin_write ON public.organizations FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

-- ------------------------------------------------------------
-- Membership: read own memberships; SYSTEM_ADMIN full control
-- ------------------------------------------------------------
DROP POLICY IF EXISTS memberships_self_read ON public.organization_memberships;
CREATE POLICY memberships_self_read ON public.organization_memberships FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_system_admin());
DROP POLICY IF EXISTS memberships_admin_write ON public.organization_memberships;
CREATE POLICY memberships_admin_write ON public.organization_memberships FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

-- ------------------------------------------------------------
-- Profiles: users read/update own; org peers readable; admin all
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS profiles_org_read ON public.profiles;
CREATE POLICY profiles_org_read ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_system_admin()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships me
      JOIN public.organization_memberships them ON them.organization_id = me.organization_id
      WHERE me.user_id = auth.uid() AND me.is_active = true AND them.user_id = profiles.id
    )
  );
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_system_admin())
  WITH CHECK (id = auth.uid() OR public.is_system_admin());
DROP POLICY IF EXISTS profiles_admin_insert ON public.profiles;
CREATE POLICY profiles_admin_insert ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_system_admin());

-- ------------------------------------------------------------
-- Business tables carrying organization_id:
-- read/write within own org(s); SYSTEM_ADMIN anything.
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
  org_tables text[] := ARRAY[
    'cold_storages','rental_customers','rental_inquiries','rental_rates',
    'rental_contracts','rental_receivings','rental_releases','rental_billing',
    'suppliers','customers','products','product_categories','inventory',
    'purchase_orders','goods_receipts','sales_orders','qc_inspections',
    'inventory_movements','delivery_requests','delivery_orders',
    'approval_requests','transactions','documents','organization_settings'
  ];
BEGIN
  FOREACH t IN ARRAY org_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_access', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))
         WITH CHECK (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))',
      t || '_org_access', t
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Child tables (no organization_id): inherit via parent join.
-- ------------------------------------------------------------
DO $$
DECLARE
  spec record;
  child_tables record;
BEGIN
  FOR child_tables IN
    SELECT * FROM (VALUES
      ('purchase_order_lines', 'po_id', 'purchase_orders'),
      ('goods_receipt_lines',  'gr_id', 'goods_receipts'),
      ('sales_order_lines',    'so_id', 'sales_orders'),
      ('qc_inspection_lines',  'inspection_id', 'qc_inspections'),
      ('delivery_order_lines', 'do_id', 'delivery_orders'),
      ('rental_billing_lines', 'billing_id', 'rental_billing'),
      ('rental_contract_allocations', 'contract_id', 'rental_contracts')
    ) AS v(child, fk, parent)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', child_tables.child);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', child_tables.child || '_parent_access', child_tables.child);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (
           public.is_system_admin()
           OR EXISTS (
             SELECT 1 FROM public.%I p
             WHERE p.id = public.%I.%I
               AND p.organization_id IN (SELECT public.my_org_ids())
           )
         )
         WITH CHECK (
           public.is_system_admin()
           OR EXISTS (
             SELECT 1 FROM public.%I p
             WHERE p.id = public.%I.%I
               AND p.organization_id IN (SELECT public.my_org_ids())
           )
         )',
      child_tables.child || '_parent_access', child_tables.child,
      child_tables.parent, child_tables.child, child_tables.fk,
      child_tables.parent, child_tables.child, child_tables.fk
    );
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Storage-free tables that are org-less
-- ------------------------------------------------------------
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS units_read ON public.units;
CREATE POLICY units_read ON public.units FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS units_admin_write ON public.units;
CREATE POLICY units_admin_write ON public.units FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

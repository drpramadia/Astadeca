-- Product categories belong to an organization; only administrators manage them.
DROP POLICY IF EXISTS product_categories_org_access ON public.product_categories;
DROP POLICY IF EXISTS product_categories_org_read ON public.product_categories;
CREATE POLICY product_categories_org_read
  ON public.product_categories FOR SELECT TO authenticated
  USING (
    public.is_system_admin()
    OR organization_id IN (SELECT public.my_org_ids())
  );

DROP POLICY IF EXISTS product_categories_admin_manage ON public.product_categories;
CREATE POLICY product_categories_admin_manage
  ON public.product_categories FOR ALL TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.has_role(ARRAY['ADMIN', 'DIRECTOR'])
      AND organization_id IN (SELECT public.my_org_ids())
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR (
      public.has_role(ARRAY['ADMIN', 'DIRECTOR'])
      AND organization_id IN (SELECT public.my_org_ids())
    )
  );

-- Units are a shared catalog (the table has no organization_id).
DROP POLICY IF EXISTS units_read ON public.units;
DROP POLICY IF EXISTS units_admin_write ON public.units;
DROP POLICY IF EXISTS units_authenticated_read ON public.units;
CREATE POLICY units_authenticated_read
  ON public.units FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS units_admin_manage ON public.units;
CREATE POLICY units_admin_manage
  ON public.units FOR ALL TO authenticated
  USING (
    public.is_system_admin()
    OR public.has_role(ARRAY['ADMIN', 'DIRECTOR'])
  )
  WITH CHECK (
    public.is_system_admin()
    OR public.has_role(ARRAY['ADMIN', 'DIRECTOR'])
  );

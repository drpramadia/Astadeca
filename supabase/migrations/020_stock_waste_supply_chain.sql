-- ============================================================
-- ERP ASTADECA — Migration 020
-- Waste & Expiry untuk RANTAI PASOK (supply chain), bukan sewa.
--   - waste barang gudang (produk dari supplier) dicatat di stock_waste.
--   - monitoring expiry per batch stok (inventory.expiry_date).
--   - notifikasi agar barang segera keluar sebelum expiry.
-- ============================================================

-- ============================================================
-- 1) Tabel waste barang gudang
-- ============================================================
CREATE TABLE IF NOT EXISTS public.stock_waste (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  product_id UUID REFERENCES public.products(id),
  batch_number TEXT,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'SHRINKAGE'
    CHECK (reason IN ('SHRINKAGE', 'EXPIRY', 'DAMAGED', 'OTHER')),
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_waste ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_waste_org_access ON public.stock_waste;
CREATE POLICY stock_waste_org_access ON public.stock_waste FOR ALL TO authenticated
  USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()));

-- ============================================================
-- 2) Ambang notifikasi expiry (default 3 hari) untuk supply chain
-- ============================================================
INSERT INTO public.organization_settings (organization_id, key, value)
SELECT o.id, 'inventory.expiry_alert_days', '3'
FROM public.organizations o
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3) Fungsi: notifikasi batch stok gudang mendekati/lewat expiry
--    Mengirim ke DIRECTOR, ADMIN, WAREHOUSE, SYSTEM_ADMIN.
--    Idempoten: sekali per batch (baik terbaca maupun belum).
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_inventory_expiry(p_organization_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alert_days INTEGER := 3;
  v_row RECORD;
  v_user RECORD;
  v_count INTEGER := 0;
  v_title TEXT;
BEGIN
  SELECT COALESCE(MAX(NULLIF(value, '')::integer), 3) INTO v_alert_days
  FROM organization_settings
  WHERE key = 'inventory.expiry_alert_days'
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);

  FOR v_row IN
    SELECT i.organization_id, i.product_id, i.batch_number, i.expiry_date, i.quantity_kg,
           p.name AS product_name
    FROM inventory i
    LEFT JOIN products p ON p.id = i.product_id
    WHERE i.expiry_date IS NOT NULL
      AND i.quantity_kg > 0
      AND i.status NOT IN ('USED')
      AND i.expiry_date <= (current_date + (v_alert_days || ' days')::interval)
      AND (p_organization_id IS NULL OR i.organization_id = p_organization_id)
  LOOP
    v_title := 'Stok mendekati expiry — ' || COALESCE(v_row.product_name, 'produk') || ' batch ' || COALESCE(v_row.batch_number, '-');

    FOR v_user IN
      SELECT om.user_id
      FROM organization_memberships om
      JOIN roles r ON r.id = om.role_id
      WHERE om.organization_id = v_row.organization_id
        AND om.is_active
        AND r.code IN ('DIRECTOR', 'ADMIN', 'WAREHOUSE', 'SYSTEM_ADMIN')
    LOOP
      IF EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.recipient_user_id = v_user.user_id
          AND n.reference_type = 'STOCK_EXPIRY'
          AND n.title = v_title
      ) THEN
        CONTINUE;
      END IF;

      PERFORM public.notify_user(
        v_row.organization_id,
        v_user.user_id,
        v_title,
        'Stok ' || v_row.quantity_kg || ' kg' || COALESCE(' batch ' || v_row.batch_number, '') ||
          ' akan/sudah kedaluwarsa pada ' || v_row.expiry_date || '. Segera keluarkan/jual sebelum expiry.',
        'STOCK_EXPIRY',
        v_row.product_id
      );
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_inventory_expiry(uuid) TO authenticated, service_role;

-- ============================================================
-- 4) Fungsi: daftar stok mendekati/lewat expiry (untuk UI monitoring)
-- ============================================================
CREATE OR REPLACE FUNCTION public.inventory_expiring(p_organization_id uuid, p_days integer DEFAULT 3)
RETURNS TABLE(
  inventory_id uuid, product_id uuid, product_name text, batch_number text,
  quantity_kg numeric, expiry_date date, days_left integer, status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    i.id, i.product_id, p.name, i.batch_number, i.quantity_kg, i.expiry_date,
    (i.expiry_date - current_date) AS days_left, i.status
  FROM inventory i
  LEFT JOIN products p ON p.id = i.product_id
  WHERE i.organization_id = p_organization_id
    AND i.expiry_date IS NOT NULL
    AND i.quantity_kg > 0
    AND i.status <> 'USED'
    AND i.expiry_date <= (current_date + (p_days || ' days')::interval)
  ORDER BY i.expiry_date ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.inventory_expiring(uuid, integer) TO authenticated, service_role;

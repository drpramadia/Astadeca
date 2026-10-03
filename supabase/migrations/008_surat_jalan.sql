-- ============================================================
-- ERP ASTADECA — Migration 008
-- Surat Jalan (Delivery Order) flow completion:
-- - delivery_request_lines: rincian barang yang diminta keluar
-- - delivery_order_lines: dukung item bebas (barang non-produk)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Rincian permintaan keluar barang
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_request_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.delivery_requests(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  item_name TEXT NOT NULL,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  notes TEXT
);

ALTER TABLE public.delivery_request_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS delivery_request_lines_parent_access ON public.delivery_request_lines;
CREATE POLICY delivery_request_lines_parent_access ON public.delivery_request_lines FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_requests dr
      WHERE dr.id = request_id
        AND (public.is_system_admin() OR dr.organization_id IN (SELECT public.my_org_ids()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.delivery_requests dr
      WHERE dr.id = request_id
        AND (public.is_system_admin() OR dr.organization_id IN (SELECT public.my_org_ids()))
    )
  );

-- ------------------------------------------------------------
-- 2) Surat jalan: item bebas + satuan (barang bisa non-produk)
-- ------------------------------------------------------------
ALTER TABLE public.delivery_order_lines
  ADD COLUMN IF NOT EXISTS item_name TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.delivery_order_lines ALTER COLUMN product_id DROP NOT NULL;

-- ------------------------------------------------------------
-- 3) Permintaan keluar barang: status PREPARED + jejak penyiapan
-- ------------------------------------------------------------
ALTER TABLE public.delivery_requests
  ADD COLUMN IF NOT EXISTS prepared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS prepared_by UUID REFERENCES public.profiles(id);

ALTER TABLE public.delivery_requests DROP CONSTRAINT IF EXISTS delivery_requests_status_check;
ALTER TABLE public.delivery_requests
  ADD CONSTRAINT delivery_requests_status_check
  CHECK (status IN ('PENDING', 'PREPARED', 'APPROVED', 'REJECTED'));

-- ------------------------------------------------------------
-- 4) Saat permintaan disetujui director -> terbitkan surat jalan (DO)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_issue_delivery_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_do_id UUID;
  v_do_number TEXT;
BEGIN
  IF NEW.status = 'APPROVED' AND (OLD.status IS DISTINCT FROM 'APPROVED') THEN
    -- Hindari dobel bila surat jalan sudah pernah terbit
    IF EXISTS (SELECT 1 FROM public.delivery_orders WHERE delivery_request_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    v_do_number := public.generate_number('DO');

    INSERT INTO public.delivery_orders (
      organization_id, do_number, delivery_request_id, customer_id,
      driver_name, vehicle_number, destination, delivery_date,
      status, notes, created_by
    ) VALUES (
      NEW.organization_id, v_do_number, NEW.id, NEW.customer_id,
      NEW.driver_name, NEW.vehicle_number, NEW.destination, NEW.delivery_date,
      'PRINTED', NEW.notes, COALESCE(NEW.created_by, NEW.requested_by_user_id)
    )
    RETURNING id INTO v_do_id;

    INSERT INTO public.delivery_order_lines (do_id, product_id, item_name, quantity_kg, unit, notes)
    SELECT v_do_id, l.product_id, l.item_name, l.quantity_kg, 'kg', l.notes
    FROM public.delivery_request_lines l
    WHERE l.request_id = NEW.id;

    -- Catat dokumen (soft copy) untuk surat jalan yang terbit
    INSERT INTO public.documents (organization_id, doc_type, doc_number, reference_type, reference_id, created_by)
    VALUES (NEW.organization_id, 'DELIVERY_ORDER', v_do_number, 'DELIVERY_ORDER', v_do_id, COALESCE(NEW.created_by, NEW.requested_by_user_id));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS issue_delivery_order ON public.delivery_requests;
CREATE TRIGGER issue_delivery_order
  AFTER UPDATE ON public.delivery_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_issue_delivery_order();

-- ------------------------------------------------------------
-- 5) Beri tahu warehouse saat surat jalan baru saja terbit (INSERT)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_delivery_order_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT om.user_id
    FROM public.organization_memberships om
    JOIN public.roles ro ON ro.id = om.role_id
    WHERE om.organization_id = NEW.organization_id
      AND om.is_active = true
      AND ro.code IN ('WAREHOUSE', 'SYSTEM_ADMIN')
  LOOP
    PERFORM public.notify_user(
      NEW.organization_id,
      r.user_id,
      'Surat Jalan Terbit: ' || NEW.do_number,
      'Surat jalan ' || NEW.do_number || ' sudah dapat dicetak / diunduh.',
      'DELIVERY_ORDER',
      NEW.id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_delivery_order_insert ON public.delivery_orders;
CREATE TRIGGER notify_delivery_order_insert
  AFTER INSERT ON public.delivery_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_delivery_order_insert();

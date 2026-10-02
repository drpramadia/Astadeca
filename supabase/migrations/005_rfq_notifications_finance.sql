-- ============================================================
-- Migration 005: RFQ / Quotations, notification + finance triggers
-- ============================================================

-- ------------------------------------------------------------
-- Quotations (permintaan harga / penawaran harga)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  quotation_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT,
  quotation_date DATE NOT NULL DEFAULT current_date,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED')),
  notes TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  approval_request_id UUID,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, quotation_number)
);

CREATE TABLE IF NOT EXISTS public.quotation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  description TEXT,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  price_per_kg NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_lines ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Notification helper
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_user(
  p_org UUID,
  p_recipient UUID,
  p_title TEXT,
  p_message TEXT,
  p_ref_type TEXT DEFAULT NULL,
  p_ref_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_recipient IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications (organization_id, recipient_user_id, title, message, reference_type, reference_id)
  VALUES (p_org, p_recipient, p_title, p_message, p_ref_type, p_ref_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_user(UUID, UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- ------------------------------------------------------------
-- Notify directors/admins when an approval request is created
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_approval_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_label TEXT;
BEGIN
  v_label := CASE NEW.request_type
    WHEN 'PURCHASE_ORDER' THEN 'Purchase Order'
    WHEN 'SALES_ORDER' THEN 'Sales Order'
    WHEN 'CONTRACT' THEN 'Kontrak Rental'
    WHEN 'QUOTATION' THEN 'Penawaran Harga'
    WHEN 'DELIVERY' THEN 'Delivery Order'
    ELSE NEW.request_type
  END;

  FOR r IN
    SELECT om.user_id
    FROM public.organization_memberships om
    JOIN public.roles ro ON ro.id = om.role_id
    WHERE om.organization_id = NEW.organization_id
      AND om.is_active = true
      AND ro.code IN ('DIRECTOR', 'SYSTEM_ADMIN')
      AND om.user_id <> NEW.requested_by
  LOOP
    PERFORM public.notify_user(
      NEW.organization_id,
      r.user_id,
      'Persetujuan Baru: ' || v_label,
      'Ada permintaan ' || v_label || ' yang menunggu persetujuan Anda.',
      'APPROVAL',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_approval_created ON public.approval_requests;
CREATE TRIGGER notify_approval_created
  AFTER INSERT ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_approval_created();

-- ------------------------------------------------------------
-- Notify requester when a decision is made
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_approval_decided()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label TEXT;
  v_status TEXT;
BEGIN
  IF NEW.status = OLD.status OR NEW.status = 'PENDING' THEN
    RETURN NEW;
  END IF;

  v_label := CASE NEW.request_type
    WHEN 'PURCHASE_ORDER' THEN 'Purchase Order'
    WHEN 'SALES_ORDER' THEN 'Sales Order'
    WHEN 'CONTRACT' THEN 'Kontrak Rental'
    WHEN 'QUOTATION' THEN 'Penawaran Harga'
    WHEN 'DELIVERY' THEN 'Delivery Order'
    ELSE NEW.request_type
  END;
  v_status := CASE WHEN NEW.status = 'APPROVED' THEN 'disetujui' ELSE 'ditolak' END;

  PERFORM public.notify_user(
    NEW.organization_id,
    NEW.requested_by,
    'Permintaan ' || v_label || ' ' || v_status,
    'Permintaan ' || v_label || ' Anda telah ' || v_status || '.',
    'APPROVAL',
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_approval_decided ON public.approval_requests;
CREATE TRIGGER notify_approval_decided
  AFTER UPDATE ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_approval_decided();

-- ------------------------------------------------------------
-- Finance sync: PO approved -> expense transaction
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_po_finance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  IF NEW.status = 'APPROVED' AND (OLD.status IS DISTINCT FROM 'APPROVED') THEN
    SELECT COALESCE(SUM(subtotal), 0) INTO v_total
    FROM public.purchase_order_lines WHERE po_id = NEW.id;

    IF v_total > 0 THEN
      INSERT INTO public.transactions (organization_id, transaction_date, description, amount, type, reference_type, reference_id, created_by)
      VALUES (NEW.organization_id, current_date, 'Pembelian PO ' || NEW.po_number, v_total, 'DEBIT', 'PURCHASE_ORDER', NEW.id, NEW.created_by);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS po_finance_sync ON public.purchase_orders;
CREATE TRIGGER po_finance_sync
  AFTER UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_po_finance();

-- ------------------------------------------------------------
-- Finance sync: SO approved -> revenue transaction
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_so_finance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
BEGIN
  IF NEW.status = 'APPROVED' AND (OLD.status IS DISTINCT FROM 'APPROVED') THEN
    SELECT COALESCE(SUM(subtotal), 0) INTO v_total
    FROM public.sales_order_lines WHERE so_id = NEW.id;

    IF v_total > 0 THEN
      INSERT INTO public.transactions (organization_id, transaction_date, description, amount, type, reference_type, reference_id, created_by)
      VALUES (NEW.organization_id, current_date, 'Penjualan SO ' || NEW.so_number, v_total, 'CREDIT', 'SALES_ORDER', NEW.id, NEW.created_by);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS so_finance_sync ON public.sales_orders;
CREATE TRIGGER so_finance_sync
  AFTER UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_so_finance();

-- ------------------------------------------------------------
-- updated_at for quotations
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotations_set_updated_at ON public.quotations;
CREATE TRIGGER quotations_set_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.trg_set_updated_at();

-- ------------------------------------------------------------
-- RLS for quotations
-- ------------------------------------------------------------
DROP POLICY IF EXISTS quotations_org_access ON public.quotations;
CREATE POLICY quotations_org_access ON public.quotations FOR ALL TO authenticated
  USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()));

DROP POLICY IF EXISTS quotation_lines_org_access ON public.quotation_lines;
CREATE POLICY quotation_lines_org_access ON public.quotation_lines FOR ALL TO authenticated
  USING (
    public.is_system_admin()
    OR EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_lines.quotation_id
        AND q.organization_id IN (SELECT public.my_org_ids())
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR EXISTS (
      SELECT 1 FROM public.quotations q
      WHERE q.id = quotation_lines.quotation_id
        AND q.organization_id IN (SELECT public.my_org_ids())
    )
  );

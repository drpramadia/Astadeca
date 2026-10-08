-- ============================================================
-- ERP ASTADECA — Migration 021
-- Alur RFQ (Request For Quotation) rantai pasok:
--   1) Calon customer minta harga        -> customer_rfq
--   2) Terbitkan permintaan harga ke supplier -> supplier_rfq
--   3) Supplier memberi harga            -> supplier_quotes
--   4) Harga dinaikkan (margin)          -> quotations (link sumber)
--   5) Customer setuju                   -> sales_orders (link quotation)
--   6) Terbitkan PO ke supplier          -> purchase_orders (link supplier_rfq)
-- ============================================================

-- ============================================================
-- Common: kolom pendukung pada SO/PO (sebelumnya tidak ada)
-- ============================================================
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT current_date;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS quotation_id UUID;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS customer_rfq_id UUID;

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS order_date DATE DEFAULT current_date;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS supplier_rfq_id UUID;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS sales_order_id UUID;

-- ============================================================
-- 1) RFQ CUSTOMER (permintaan harga dari calon customer)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customer_rfq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  rfq_number TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT,
  request_date DATE NOT NULL DEFAULT current_date,
  needed_by DATE,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'QUOTED', 'WON', 'LOST', 'CANCELLED')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, rfq_number)
);
ALTER TABLE public.customer_rfq ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.customer_rfq_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES public.customer_rfq(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  description TEXT,
  quantity_kg NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.customer_rfq_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2) RFQ SUPPLIER (permintaan harga ke supplier)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supplier_rfq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  rfq_number TEXT NOT NULL,
  customer_rfq_id UUID REFERENCES public.customer_rfq(id),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  request_date DATE NOT NULL DEFAULT current_date,
  response_due DATE,
  status TEXT NOT NULL DEFAULT 'SENT'
    CHECK (status IN ('SENT', 'ANSWERED', 'CLOSED', 'CANCELLED')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, rfq_number)
);
ALTER TABLE public.supplier_rfq ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.supplier_rfq_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID NOT NULL REFERENCES public.supplier_rfq(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  description TEXT,
  quantity_kg NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.supplier_rfq_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3) SUPPLIER QUOTES (harga balasan dari supplier / harga beli)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supplier_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  quote_number TEXT NOT NULL,
  supplier_rfq_id UUID REFERENCES public.supplier_rfq(id),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  quote_date DATE NOT NULL DEFAULT current_date,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'SELECTED', 'REJECTED')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, quote_number)
);
ALTER TABLE public.supplier_quotes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.supplier_quote_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.supplier_quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  description TEXT,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  cost_per_kg NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0
);
ALTER TABLE public.supplier_quote_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4) QUOTATIONS: tautkan sumber + catat cost/markup/jual
-- ============================================================
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS customer_rfq_id UUID REFERENCES public.customer_rfq(id);
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS supplier_quote_id UUID REFERENCES public.supplier_quotes(id);
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS margin_percent NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.quotation_lines ADD COLUMN IF NOT EXISTS cost_per_kg NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.quotation_lines ADD COLUMN IF NOT EXISTS markup_percent NUMERIC NOT NULL DEFAULT 0;

-- ============================================================
-- 5) RLS semua tabel baru (org-scoped, konsisten dgn master lain)
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_rfq','supplier_rfq','supplier_quotes']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_access', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids())) WITH CHECK (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))',
      t || '_org_access', t
    );
  END LOOP;
END $$;

-- Tabel garis tidak punya organization_id -> scope lewat induk
DROP POLICY IF EXISTS customer_rfq_lines_org_access ON public.customer_rfq_lines;
CREATE POLICY customer_rfq_lines_org_access ON public.customer_rfq_lines FOR ALL TO authenticated
  USING (public.is_system_admin() OR EXISTS (
    SELECT 1 FROM public.customer_rfq r WHERE r.id = customer_rfq_lines.rfq_id
      AND r.organization_id IN (SELECT public.my_org_ids())
  ))
  WITH CHECK (public.is_system_admin() OR EXISTS (
    SELECT 1 FROM public.customer_rfq r WHERE r.id = customer_rfq_lines.rfq_id
      AND r.organization_id IN (SELECT public.my_org_ids())
  ));

DROP POLICY IF EXISTS supplier_rfq_lines_org_access ON public.supplier_rfq_lines;
CREATE POLICY supplier_rfq_lines_org_access ON public.supplier_rfq_lines FOR ALL TO authenticated
  USING (public.is_system_admin() OR EXISTS (
    SELECT 1 FROM public.supplier_rfq r WHERE r.id = supplier_rfq_lines.rfq_id
      AND r.organization_id IN (SELECT public.my_org_ids())
  ))
  WITH CHECK (public.is_system_admin() OR EXISTS (
    SELECT 1 FROM public.supplier_rfq r WHERE r.id = supplier_rfq_lines.rfq_id
      AND r.organization_id IN (SELECT public.my_org_ids())
  ));

DROP POLICY IF EXISTS supplier_quote_lines_org_access ON public.supplier_quote_lines;
CREATE POLICY supplier_quote_lines_org_access ON public.supplier_quote_lines FOR ALL TO authenticated
  USING (public.is_system_admin() OR EXISTS (
    SELECT 1 FROM public.supplier_quotes q WHERE q.id = supplier_quote_lines.quote_id
      AND q.organization_id IN (SELECT public.my_org_ids())
  ))
  WITH CHECK (public.is_system_admin() OR EXISTS (
    SELECT 1 FROM public.supplier_quotes q WHERE q.id = supplier_quote_lines.quote_id
      AND q.organization_id IN (SELECT public.my_org_ids())
  ));

-- ============================================================
-- 6) Nomor dokumen otomatis
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_rfq_number(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_date TEXT := to_char(current_date, 'YYYYMMDD');
  v_count INTEGER;
  v_num TEXT;
BEGIN
  SELECT count(*) + 1 INTO v_count
  FROM (
    SELECT rfq_number FROM customer_rfq WHERE rfq_number LIKE p_prefix || '/' || v_date || '/%'
    UNION ALL
    SELECT rfq_number FROM supplier_rfq WHERE rfq_number LIKE p_prefix || '/' || v_date || '/%'
    UNION ALL
    SELECT quote_number FROM supplier_quotes WHERE quote_number LIKE p_prefix || '/' || v_date || '/%'
  ) x;
  v_num := p_prefix || '/' || v_date || '/' || lpad(v_count::text, 4, '0');
  RETURN v_num;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.generate_rfq_number(text) TO authenticated, service_role;

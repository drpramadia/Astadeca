-- ============================================================
-- ERP ASTADECA — Schema Migration 001
-- Complete database schema: auth, profiles, roles, rental,
-- inventory, PO/SO, warehouse, QC, delivery, finance, documents
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS & AUTHENTICATION
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  username TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================
-- ORGANIZATIONS & ROLES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PERMISSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_org_permission(org_id UUID, perm_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role_code TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  SELECT r.code INTO v_role_code
  FROM public.organization_memberships om
  JOIN public.roles r ON r.id = om.role_id
  WHERE om.user_id = v_user_id
    AND om.organization_id = org_id
    AND om.is_active = true
  LIMIT 1;

  IF v_role_code IS NULL THEN RETURN FALSE; END IF;

  -- DIRECTOR and ADMIN have all permissions
  IF v_role_code IN ('DIRECTOR', 'ADMIN') THEN RETURN TRUE; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = (
      SELECT om.role_id FROM public.organization_memberships om
      WHERE om.user_id = v_user_id AND om.organization_id = org_id AND om.is_active = true LIMIT 1
    )
    AND p.code = perm_code
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE(permission_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT p.code
  FROM public.role_permissions rp
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE rp.role_id = (
    SELECT om.role_id
    FROM public.organization_memberships om
    WHERE om.user_id = auth.uid() AND om.is_active = true
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.login_with_username(p_username TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
BEGIN
  SELECT id INTO v_user_id FROM public.profiles WHERE username = p_username AND is_active = true;
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Username tidak ditemukan.');
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Akun tidak memiliki email.');
  END IF;

  RETURN json_build_object('success', true, 'email', v_email, 'user_id', v_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_number(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq_name TEXT;
  v_seq_val INT;
  v_result TEXT;
BEGIN
  v_seq_name := 'seq_' || lower(regexp_replace(p_prefix, '[^a-zA-Z]', '', 'g'));
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', v_seq_name);
  EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_seq_val;
  v_result := p_prefix || '/' || to_char(now(), 'YYYY/MM/') || lpad(v_seq_val::TEXT, 4, '0');
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT r.code
    FROM public.organization_memberships om
    JOIN public.roles r ON r.id = om.role_id
    WHERE om.user_id = auth.uid() AND om.is_active = true
    LIMIT 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- COLD STORAGE RENTAL
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cold_storages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  capacity_kg NUMERIC NOT NULL DEFAULT 0,
  temperature_min_c NUMERIC,
  temperature_max_c NUMERIC,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'MAINTENANCE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cold_storages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cold_storage_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cold_storage_id UUID NOT NULL REFERENCES public.cold_storages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL
);

ALTER TABLE public.cold_storage_zones ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.cold_storage_baskets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID NOT NULL REFERENCES public.cold_storage_zones(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  capacity_kg NUMERIC NOT NULL DEFAULT 1000,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'OCCUPIED', 'RESERVED'))
);

ALTER TABLE public.cold_storage_baskets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rental_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rental_customers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rental_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_id UUID REFERENCES public.rental_customers(id),
  cold_storage_id UUID REFERENCES public.cold_storages(id),
  requested_kg NUMERIC NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONVERTED', 'REJECTED')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rental_inquiries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rental_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  cold_storage_id UUID REFERENCES public.cold_storages(id),
  price_per_kg_per_day NUMERIC NOT NULL DEFAULT 0,
  minimum_days INTEGER NOT NULL DEFAULT 1,
  minimum_kg NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rental_rates ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rental_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_id UUID NOT NULL REFERENCES public.rental_customers(id),
  cold_storage_id UUID REFERENCES public.cold_storages(id),
  contract_number TEXT UNIQUE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  price_per_kg_per_day NUMERIC NOT NULL DEFAULT 0,
  total_estimated_kg NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'EXPIRED', 'CANCELLED')),
  approval_request_id UUID,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_rental_contracts_updated_at
  BEFORE UPDATE ON public.rental_contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.rental_contracts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rental_contract_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  basket_id UUID NOT NULL REFERENCES public.cold_storage_baskets(id),
  allocated_kg NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.rental_contract_allocations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rental_receivings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  contract_id UUID NOT NULL REFERENCES public.rental_contracts(id),
  received_kg NUMERIC NOT NULL DEFAULT 0,
  batch_number TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by UUID REFERENCES public.profiles(id),
  notes TEXT
);

ALTER TABLE public.rental_receivings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rental_releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  contract_id UUID NOT NULL REFERENCES public.rental_contracts(id),
  released_kg NUMERIC NOT NULL DEFAULT 0,
  batch_number TEXT,
  released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_by UUID REFERENCES public.profiles(id),
  delivery_order_id UUID,
  notes TEXT
);

ALTER TABLE public.rental_releases ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rental_billing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  contract_id UUID NOT NULL REFERENCES public.rental_contracts(id),
  invoice_number TEXT UNIQUE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rental_billing ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.rental_billing_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_id UUID NOT NULL REFERENCES public.rental_billing(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  price_per_kg NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.rental_billing_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- INVENTORY & OPERATIONAL
-- ============================================================

CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  abbreviation TEXT NOT NULL
);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL
);

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category_id UUID REFERENCES public.product_categories(id),
  unit_id UUID REFERENCES public.units(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, sku)
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  customer_type TEXT NOT NULL DEFAULT 'BOTH' CHECK (customer_type IN ('BUYER', 'SELLER', 'BOTH')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_number TEXT,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'QUARANTINE', 'RESERVED', 'USED')),
  cold_storage_id UUID REFERENCES public.cold_storages(id),
  basket_id UUID REFERENCES public.cold_storage_baskets(id),
  expiry_date DATE,
  received_at TIMESTAMPTZ
);

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id),
  po_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ORDERED', 'RECEIVED', 'CANCELLED')),
  notes TEXT,
  approval_request_id UUID,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  price_per_kg NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id),
  gr_number TEXT UNIQUE NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by UUID REFERENCES public.profiles(id),
  notes TEXT
);

ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.goods_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_number TEXT,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  quantity_received NUMERIC NOT NULL DEFAULT 0,
  condition TEXT NOT NULL DEFAULT 'GOOD' CHECK (condition IN ('GOOD', 'DAMAGED', 'REJECTED'))
);

ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SALES ORDERS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sales_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  so_number TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED')),
  notes TEXT,
  approval_request_id UUID,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.sales_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  so_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  price_per_kg NUMERIC NOT NULL DEFAULT 0,
  subtotal NUMERIC NOT NULL DEFAULT 0
);

ALTER TABLE public.sales_order_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- WAREHOUSE & QC
-- ============================================================

CREATE TABLE IF NOT EXISTS public.qc_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  gr_id UUID NOT NULL REFERENCES public.goods_receipts(id),
  inspector_user_id UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PASSED', 'FAILED')),
  notes TEXT,
  inspected_at TIMESTAMPTZ
);

ALTER TABLE public.qc_inspections ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.qc_inspection_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.qc_inspections(id) ON DELETE CASCADE,
  gr_line_id UUID NOT NULL REFERENCES public.goods_receipt_lines(id),
  condition TEXT NOT NULL CHECK (condition IN ('GOOD', 'DAMAGED', 'REJECTED')),
  notes TEXT
);

ALTER TABLE public.qc_inspection_lines ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('IN', 'OUT', 'TRANSFER', 'ADJUST')),
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_number TEXT,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  from_location TEXT,
  to_location TEXT,
  reference_type TEXT,
  reference_id UUID,
  performed_by UUID REFERENCES public.profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DELIVERY / SURAT JALAN
-- ============================================================

CREATE TABLE IF NOT EXISTS public.delivery_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  requested_by_user_id UUID NOT NULL REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  do_number TEXT UNIQUE NOT NULL,
  delivery_request_id UUID REFERENCES public.delivery_requests(id),
  customer_id UUID REFERENCES public.customers(id),
  driver_name TEXT,
  vehicle_number TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PRINTED', 'RELEASED', 'CANCELLED')),
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  printed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.delivery_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  do_id UUID NOT NULL REFERENCES public.delivery_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  batch_number TEXT,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  so_line_id UUID REFERENCES public.sales_order_lines(id)
);

ALTER TABLE public.delivery_order_lines ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- FINANCE & APPROVAL
-- ============================================================

CREATE TABLE IF NOT EXISTS public.approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  request_type TEXT NOT NULL,
  reference_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by UUID NOT NULL REFERENCES public.profiles(id),
  decided_by UUID REFERENCES public.profiles(id),
  decided_at TIMESTAMPTZ,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  transaction_date DATE NOT NULL DEFAULT current_date,
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('DEBIT', 'CREDIT')),
  reference_type TEXT,
  reference_id UUID,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DOCUMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  doc_type TEXT NOT NULL,
  doc_number TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  file_url TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  key TEXT NOT NULL,
  value TEXT,
  UNIQUE(organization_id, key)
);

-- ============================================================
-- SEED: ROLES
-- ============================================================
INSERT INTO public.roles (id, name, code) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Director', 'DIRECTOR'),
  ('00000000-0000-0000-0000-000000000002', 'Admin', 'ADMIN'),
  ('00000000-0000-0000-0000-000000000003', 'Warehouse', 'WAREHOUSE')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- SEED: PERMISSIONS
-- ============================================================
INSERT INTO public.permissions (id, code, name) VALUES
  ('10000000-0000-0000-0000-000000000001', 'dashboard.view', 'View Dashboard'),
  ('10000000-0000-0000-0000-000000000002', 'rental.view', 'View Rental'),
  ('10000000-0000-0000-0000-000000000003', 'rental.create', 'Create Rental'),
  ('10000000-0000-0000-0000-000000000004', 'rental.manage', 'Manage Rental'),
  ('10000000-0000-0000-0000-000000000005', 'rental.billing', 'Rental Billing'),
  ('10000000-0000-0000-0000-000000000006', 'inventory.view', 'View Inventory'),
  ('10000000-0000-0000-0000-000000000007', 'inventory.receive', 'Receive Inventory'),
  ('10000000-0000-0000-0000-000000000008', 'inventory.issue', 'Issue Inventory'),
  ('10000000-0000-0000-0000-000000000009', 'purchase.view', 'View Purchase'),
  ('10000000-0000-0000-0000-000000000010', 'purchase.create', 'Create Purchase'),
  ('10000000-0000-0000-0000-000000000011', 'purchase.approve', 'Approve Purchase'),
  ('10000000-0000-0000-0000-000000000012', 'sales.view', 'View Sales'),
  ('10000000-0000-0000-0000-000000000013', 'sales.create', 'Create Sales'),
  ('10000000-0000-0000-0000-000000000014', 'sales.approve', 'Approve Sales'),
  ('10000000-0000-0000-0000-000000000015', 'finance.view', 'View Finance'),
  ('10000000-0000-0000-0000-000000000016', 'finance.payment', 'Payment'),
  ('10000000-0000-0000-0000-000000000017', 'approval.approve', 'Approve Documents'),
  ('10000000-0000-0000-0000-000000000018', 'admin.master_data', 'Master Data'),
  ('10000000-0000-0000-0000-000000000019', 'admin.settings', 'Settings'),
  ('10000000-0000-0000-0000-000000000020', 'admin.users', 'User Management'),
  ('10000000-0000-0000-0000-000000000021', 'documents.view', 'View Documents'),
  ('10000000-0000-0000-0000-000000000022', 'documents.print', 'Print Documents'),
  ('10000000-0000-0000-0000-000000000023', 'qc.view', 'View QC'),
  ('10000000-0000-0000-0000-000000000024', 'qc.execute', 'Execute QC'),
  ('10000000-0000-0000-0000-000000000025', 'reports.view', 'View Reports')
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- SEED: ROLE PERMISSIONS
-- ============================================================
-- DIRECTOR: all permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM public.permissions
ON CONFLICT DO NOTHING;

-- ADMIN: all except approval.approve
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000002', id FROM public.permissions
WHERE code != 'approval.approve'
ON CONFLICT DO NOTHING;

-- WAREHOUSE: limited permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000003', id FROM public.permissions
WHERE code IN ('dashboard.view', 'inventory.view', 'inventory.receive', 'inventory.issue', 'qc.view', 'qc.execute', 'documents.view')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: ORGANIZATION
-- ============================================================
INSERT INTO public.organizations (id, name) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Astadeca Baswara Persada')
ON CONFLICT DO NOTHING;

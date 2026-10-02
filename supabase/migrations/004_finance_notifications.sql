-- ============================================================
-- Migration 004: Finance module, notifications, activity logs, payments, COA
-- ============================================================

-- ------------------------------------------------------------
-- General Ledger: Chart of Accounts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Payments against invoices / billing
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  reference_type TEXT,
  reference_id UUID,
  payment_date DATE NOT NULL DEFAULT current_date,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER')),
  bank_account TEXT,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Notifications (inbox for users)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  recipient_user_id UUID NOT NULL REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  message TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  reference_type TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Activity logs (audit trail)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- Seed: default Chart of Accounts
-- ------------------------------------------------------------
INSERT INTO public.accounts (organization_id, code, name, account_type) VALUES
  ('20000000-0000-0000-0000-000000000001', '1000', 'Kas', 'ASSET'),
  ('20000000-0000-0000-0000-000000000001', '1010', 'Bank', 'ASSET'),
  ('20000000-0000-0000-0000-000000000001', '2000', 'Utang Usaha', 'LIABILITY'),
  ('20000000-0000-0000-0000-000000000001', '3000', 'Modal', 'EQUITY'),
  ('20000000-0000-0000-0000-000000000001', '4000', 'Penjualan', 'REVENUE'),
  ('20000000-0000-0000-0000-000000000001', '5000', 'Biaya Sewa Cold Storage', 'EXPENSE'),
  ('20000000-0000-0000-0000-000000000001', '5010', 'Biaya Pokok Penjualan', 'EXPENSE')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- Add RLS policies for new tables
-- ------------------------------------------------------------

-- accounts: SYSTEM_ADMIN full, org members read
DROP POLICY IF EXISTS accounts_org_access ON public.accounts;
CREATE POLICY accounts_org_access ON public.accounts FOR ALL TO authenticated
  USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()));

-- payments: org access
DROP POLICY IF EXISTS payments_org_access ON public.payments;
CREATE POLICY payments_org_access ON public.payments FOR ALL TO authenticated
  USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()));

-- notifications: recipient OR system admin
DROP POLICY IF EXISTS notifications_recipient ON public.notifications;
CREATE POLICY notifications_recipient ON public.notifications FOR ALL TO authenticated
  USING (
    public.is_system_admin()
    OR recipient_user_id = auth.uid()
    OR organization_id IN (SELECT public.my_org_ids())
  )
  WITH CHECK (
    public.is_system_admin()
    OR recipient_user_id = auth.uid()
    OR organization_id IN (SELECT public.my_org_ids())
  );

-- activity_logs: org access
DROP POLICY IF EXISTS activity_logs_org_access ON public.activity_logs;
CREATE POLICY activity_logs_org_access ON public.activity_logs FOR ALL TO authenticated
  USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()));

-- ============================================================
-- ERP ASTADECA — Migration 010
-- Mode Titipan Harian (spot, bayar di depan) + saldo hari (carry-over)
-- ============================================================

-- 1) Kontrak/spot: penanda mode, hari dibayar, hari terpakai
ALTER TABLE public.rental_contracts
  ADD COLUMN IF NOT EXISTS is_spot BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS days_paid INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS days_used INTEGER NOT NULL DEFAULT 0;

-- Spot tidak wajib punya end_date (tanggal keluar belum tentu)
ALTER TABLE public.rental_contracts ALTER COLUMN end_date DROP NOT NULL;

-- 2) Riwayat pemakaian hari (audit carry-over)
CREATE TABLE IF NOT EXISTS public.rental_day_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  contract_id UUID NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,      -- TOPUP | USE | ADJUST
  days INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.rental_day_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rental_day_ledger_org ON public.rental_day_ledger;
CREATE POLICY rental_day_ledger_org ON public.rental_day_ledger FOR ALL TO authenticated
  USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()));

-- 3) Fungsi: top-up hari (bayar di depan) untuk spot/kontrak
CREATE OR REPLACE FUNCTION public.rental_topup_days(
  p_contract_id uuid,
  p_days integer,
  p_note text DEFAULT NULL,
  p_user uuid DEFAULT NULL
)
RETURNS TABLE(out_days_paid integer, out_days_used integer, out_days_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org UUID;
BEGIN
  IF p_days IS NULL OR p_days <= 0 THEN
    RAISE EXCEPTION 'Jumlah hari harus > 0';
  END IF;

  UPDATE public.rental_contracts
  SET days_paid = days_paid + p_days
  WHERE id = p_contract_id
  RETURNING organization_id INTO v_org;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contract % not found', p_contract_id;
  END IF;

  INSERT INTO public.rental_day_ledger (organization_id, contract_id, entry_type, days, notes, created_by)
  VALUES (v_org, p_contract_id, 'TOPUP', p_days, COALESCE(p_note, 'Top-up hari (bayar di depan)'), p_user);

  RETURN QUERY
    SELECT rc.days_paid, rc.days_used, rc.days_paid - rc.days_used
    FROM public.rental_contracts rc WHERE rc.id = p_contract_id;
END;
$$;

-- 4) Fungsi: pemakaian hari saat barang diterima/dikeluarkan (spot)
CREATE OR REPLACE FUNCTION public.rental_use_days(
  p_contract_id uuid,
  p_days integer,
  p_note text DEFAULT NULL,
  p_user uuid DEFAULT NULL
)
RETURNS TABLE(out_days_paid integer, out_days_used integer, out_days_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org UUID;
BEGIN
  IF p_days IS NULL OR p_days <= 0 THEN
    RAISE EXCEPTION 'Jumlah hari harus > 0';
  END IF;

  UPDATE public.rental_contracts
  SET days_used = days_used + p_days
  WHERE id = p_contract_id
  RETURNING organization_id INTO v_org;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Contract % not found', p_contract_id;
  END IF;

  INSERT INTO public.rental_day_ledger (organization_id, contract_id, entry_type, days, notes, created_by)
  VALUES (v_org, p_contract_id, 'USE', p_days, COALESCE(p_note, 'Pemakaian hari'), p_user);

  RETURN QUERY
    SELECT rc.days_paid, rc.days_used, rc.days_paid - rc.days_used
    FROM public.rental_contracts rc WHERE rc.id = p_contract_id;
END;
$$;

-- 5) Laporan saldo hari
CREATE OR REPLACE VIEW public.rental_day_balance AS
SELECT
  rc.id AS contract_id,
  rc.organization_id,
  rc.contract_number,
  rc.is_spot,
  rc.days_paid,
  rc.days_used,
  (rc.days_paid - rc.days_used) AS days_balance
FROM public.rental_contracts rc;

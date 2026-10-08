-- ============================================================
-- ERP ASTADECA — Migration 024
-- Penagihan berbasis SNAPSHOT HARIAN.
--   - rental_daily_usage: catatan kg & kg-ditagih per hari per kontrak.
--   - Snapshot diperbarui saat ada barang masuk/keluar (backfill hari
--     berjalan) sehingga tiap hari punya jejak yang bisa diaudit.
--   - calculate_rental_billing: akumulasi snapshot periode + membuat
--     SATU BARIS INVOICE PER HARI.
-- ============================================================

-- ------------------------------------------------------------
-- 1) TABEL SNAPSHOT HARIAN
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rental_daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  contract_id UUID NOT NULL REFERENCES public.rental_contracts(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL,
  actual_kg NUMERIC NOT NULL DEFAULT 0,   -- stok riil pada hari itu
  billed_kg NUMERIC NOT NULL DEFAULT 0,   -- kg yang ditagih (min 1 ton bila aktif)
  rate NUMERIC NOT NULL DEFAULT 0,        -- tarif per kg/hari saat snapshot
  subtotal NUMERIC NOT NULL DEFAULT 0,    -- billed_kg * rate
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, usage_date)
);

ALTER TABLE public.rental_daily_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rental_daily_usage_org ON public.rental_daily_usage;
CREATE POLICY rental_daily_usage_org ON public.rental_daily_usage FOR ALL TO authenticated
  USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()));

CREATE INDEX IF NOT EXISTS idx_rental_daily_usage_contract_date
  ON public.rental_daily_usage (contract_id, usage_date);

-- ------------------------------------------------------------
-- 2) FUNGSI: bangun ulang snapshot harian untuk satu kontrak
--    dari data masuk/keluar. Mengisi setiap hari dari start_date
--    s/d min(current_date, end_date). Hari tanpa stok tetap dicatat
--    (actual_kg = 0, billed_kg = 0) untuk jejak audit.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rebuild_rental_daily_usage(p_contract_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contract RECORD;
  v_day DATE;
  v_last DATE;
  v_kg NUMERIC;
  v_billed NUMERIC;
  v_min NUMERIC;
  v_rows INTEGER := 0;
BEGIN
  SELECT * INTO v_contract FROM public.rental_contracts WHERE id = p_contract_id;
  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'Contract % not found', p_contract_id;
  END IF;

  v_min := CASE WHEN v_contract.minimum_1_ton THEN 1000 ELSE 0 END;
  -- Hanya sampai hari ini (hari mendatang belum dihitung)
  v_last := LEAST(current_date, COALESCE(v_contract.end_date, current_date));

  FOR v_day IN
    SELECT d::date FROM generate_series(v_contract.start_date, v_last, '1 day'::interval) AS d
  LOOP
    SELECT GREATEST(
      (SELECT COALESCE(SUM(rr.received_kg), 0)
       FROM public.rental_receivings rr
       WHERE rr.contract_id = p_contract_id AND rr.received_at::date <= v_day)
      -
      (SELECT COALESCE(SUM(rel.released_kg), 0)
       FROM public.rental_releases rel
       WHERE rel.contract_id = p_contract_id AND rel.released_at::date <= v_day),
      0
    ) INTO v_kg;

    IF v_kg > 0 THEN
      v_billed := GREATEST(v_kg, v_min);
    ELSE
      v_billed := 0;
    END IF;

    INSERT INTO public.rental_daily_usage
      (organization_id, contract_id, usage_date, actual_kg, billed_kg, rate, subtotal)
    VALUES
      (v_contract.organization_id, p_contract_id, v_day, v_kg, v_billed,
       v_contract.price_per_kg_per_day, v_billed * v_contract.price_per_kg_per_day)
    ON CONFLICT (contract_id, usage_date) DO UPDATE
      SET actual_kg = EXCLUDED.actual_kg,
          billed_kg = EXCLUDED.billed_kg,
          rate = EXCLUDED.rate,
          subtotal = EXCLUDED.subtotal,
          updated_at = now();

    v_rows := v_rows + 1;
  END LOOP;

  RETURN v_rows;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rebuild_rental_daily_usage(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3) TRIGGER: perbarui snapshot saat ada masuk/keluar
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_refresh_daily_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.rebuild_rental_daily_usage(NEW.contract_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS refresh_daily_usage_on_receiving ON public.rental_receivings;
CREATE TRIGGER refresh_daily_usage_on_receiving
  AFTER INSERT OR UPDATE OR DELETE ON public.rental_receivings
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_daily_usage();

DROP TRIGGER IF EXISTS refresh_daily_usage_on_release ON public.rental_releases;
CREATE TRIGGER refresh_daily_usage_on_release
  AFTER INSERT OR UPDATE OR DELETE ON public.rental_releases
  FOR EACH ROW EXECUTE FUNCTION public.trg_refresh_daily_usage();

-- ------------------------------------------------------------
-- 4) BILLING: akumulasi snapshot + SATU BARIS INVOICE PER HARI
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_rental_billing(p_contract_id uuid)
RETURNS TABLE(out_contract_id uuid, out_invoice_number text, out_total_amount numeric, out_total_days integer, out_total_kg_day numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contract RECORD;
  v_period INTEGER := 7;
  v_total NUMERIC := 0;
  v_total_kg_day NUMERIC := 0;
  v_billing_id UUID;
  v_invoice TEXT;
  v_charged_days INTEGER := 0;
  v_period_start DATE;
  v_period_end DATE;
  v_min NUMERIC;
  r RECORD;
BEGIN
  SELECT * INTO v_contract FROM rental_contracts WHERE id = p_contract_id;
  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'Contract % not found', p_contract_id;
  END IF;

  SELECT COALESCE(MAX(NULLIF(value, '')::integer), 7) INTO v_period
  FROM organization_settings
  WHERE key = 'rental.billing_period_days' AND organization_id = v_contract.organization_id;
  IF v_period IS NULL OR v_period < 1 THEN v_period := 7; END IF;

  v_min := CASE WHEN v_contract.minimum_1_ton THEN 1000 ELSE 0 END;

  -- Periode berjalan (grid berjangkar di start_date)
  v_period_start := v_contract.start_date
    + (floor((current_date - v_contract.start_date)::numeric / v_period)::int * v_period);
  v_period_end := v_period_start + (v_period - 1);
  IF v_contract.end_date IS NOT NULL AND v_period_end > v_contract.end_date THEN
    v_period_end := v_contract.end_date;
  END IF;

  -- Pastikan snapshot harian terbaru sebelum menagih
  PERFORM public.rebuild_rental_daily_usage(p_contract_id);

  SELECT rb.id INTO v_billing_id
  FROM rental_billing rb
  WHERE rb.contract_id = p_contract_id
    AND rb.period_start = v_period_start
    AND rb.period_end = v_period_end
    AND rb.status NOT IN ('PAID', 'CANCELLED')
  LIMIT 1;

  IF v_billing_id IS NULL THEN
    INSERT INTO rental_billing (
      organization_id, contract_id, invoice_number,
      period_start, period_end, total_amount, status
    ) VALUES (
      v_contract.organization_id, p_contract_id,
      public.generate_number('INV'),
      v_period_start, v_period_end, 0, 'SENT'
    ) RETURNING id, invoice_number INTO v_billing_id, v_invoice;
  ELSE
    SELECT invoice_number INTO v_invoice FROM rental_billing WHERE id = v_billing_id;
  END IF;

  -- Akumulasi snapshot periode + rincian SATU BARIS PER HARI
  DELETE FROM rental_billing_lines rbl WHERE rbl.billing_id = v_billing_id;

  FOR r IN
    SELECT usage_date, actual_kg, billed_kg, rate, subtotal
    FROM public.rental_daily_usage
    WHERE contract_id = p_contract_id
      AND usage_date BETWEEN v_period_start AND v_period_end
    ORDER BY usage_date
  LOOP
    INSERT INTO rental_billing_lines (billing_id, description, quantity_kg, price_per_kg, subtotal)
    VALUES (
      v_billing_id,
      to_char(r.usage_date, 'DD Mon YYYY') || ' — ' ||
        CASE WHEN r.actual_kg > 0
          THEN 'stok ' || trim(to_char(r.actual_kg, 'FM999999990.##')) || ' kg (ditagih ' ||
               trim(to_char(r.billed_kg, 'FM999999990.##')) || ' kg x ' || r.rate || ')'
          ELSE 'tidak ada barang'
        END,
      r.billed_kg,
      r.rate,
      r.subtotal
    );

    IF r.actual_kg > 0 THEN
      v_total := v_total + r.subtotal;
      v_total_kg_day := v_total_kg_day + r.billed_kg;
      v_charged_days := v_charged_days + 1;
    END IF;
  END LOOP;

  UPDATE rental_billing
  SET total_amount = v_total, period_start = v_period_start, period_end = v_period_end
  WHERE id = v_billing_id;

  RETURN QUERY SELECT p_contract_id, v_invoice, v_total, v_charged_days, v_total_kg_day;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calculate_rental_billing(uuid) TO authenticated, service_role;

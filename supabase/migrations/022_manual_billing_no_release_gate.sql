-- ============================================================
-- ERP ASTADECA — Migration 022
-- Perubahan aturan sewa cold storage:
--   1) Hapus release gate "harus lunas" (barang bisa keluar kapan saja).
--   2) Hapus approval Director untuk pengeluaran barang (RENTAL_RELEASE).
--   3) Billing otomatis mengikuti perjanjian kontrak (tarif per kg/hari),
--      dihitung dari barang aktual di gudang, dengan MINIMUM 1 TON:
--        kg_ditagih = GREATEST(saldo_kg_aktual, 1000)
--      Berlaku bila kontrak mengaktifkan minimum 1 ton (default true).
-- ============================================================

-- ------------------------------------------------------------
-- 1) HAPUS RELEASE GATE
--    Sebelumnya: trg_guard_release_payment memblokir release belum lunas.
--    Sekarang: gate dihapus total.
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS guard_release_payment ON public.rental_releases;
DROP FUNCTION IF EXISTS public.trg_guard_release_payment();

-- ------------------------------------------------------------
-- 2) HAPUS NOTIFIKASI APPROVAL PENGELUARAN (RENTAL_RELEASE)
--    Tidak ada lagi approval Director untuk barang keluar.
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS notify_release_approval ON public.approval_requests;
DROP FUNCTION IF EXISTS public.trg_notify_release_approval();

-- ------------------------------------------------------------
-- 3) PERJANJIAN PENAGIHAN DI KONTRAK
--    minimum_1_ton: bila true, kg ditagih minimal 1000 kg per hari berisi stok.
-- ------------------------------------------------------------
ALTER TABLE public.rental_contracts
  ADD COLUMN IF NOT EXISTS minimum_1_ton BOOLEAN NOT NULL DEFAULT true;

-- ------------------------------------------------------------
-- 4) BILLING OTOMATIS MENGIKUTI PERJANJIAN KONTRAK + MINIMUM 1 TON
--    - kg_aktual per hari = SUM(masuk s/d hari) - SUM(keluar s/d hari)
--    - bila ada stok pada hari itu: kg_ditagih = GREATEST(kg_aktual, 1000)
--      (bila kontrak minimum_1_ton = true). Minimum diterapkan PER HARI
--      berisi stok, bukan per periode.
--    - periode tagih tetap mengikuti organization_settings
--      (rental.billing_period_days, default 7 = mingguan).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_rental_billing(p_contract_id uuid)
RETURNS TABLE(out_contract_id uuid, out_invoice_number text, out_total_amount numeric, out_total_days integer, out_total_kg_day numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contract RECORD;
  v_day DATE;
  v_period INTEGER := 7;
  v_rate NUMERIC;
  v_kg NUMERIC;
  v_billed_kg NUMERIC;
  v_total NUMERIC := 0;
  v_total_kg_day NUMERIC := 0;
  v_billing_id UUID;
  v_invoice TEXT;
  v_charged_days INTEGER := 0;
  v_period_start DATE;
  v_period_end DATE;
  v_min_kg NUMERIC;
BEGIN
  SELECT * INTO v_contract FROM rental_contracts WHERE id = p_contract_id;
  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'Contract % not found', p_contract_id;
  END IF;

  -- Baca periode tagih (mingguan default) dari pengaturan organisasi
  SELECT COALESCE(MAX(NULLIF(value, '')::integer), 7) INTO v_period
  FROM organization_settings
  WHERE key = 'rental.billing_period_days'
    AND organization_id = v_contract.organization_id;
  IF v_period IS NULL OR v_period < 1 THEN v_period := 7; END IF;

  v_rate := v_contract.price_per_kg_per_day;
  -- Minimum 1 ton (1000 kg) bila diaktifkan pada perjanjian kontrak
  v_min_kg := CASE WHEN v_contract.minimum_1_ton THEN 1000 ELSE 0 END;

  -- Periode berjalan: grid tetap berjangkar di start_date
  v_period_start := v_contract.start_date
    + (floor((current_date - v_contract.start_date)::numeric / v_period)::int * v_period);
  v_period_end := v_period_start + (v_period - 1);

  -- Cari invoice untuk periode berjalan ini (bila ada dan masih terbuka)
  SELECT rb.id INTO v_billing_id
  FROM rental_billing rb
  WHERE rb.contract_id = p_contract_id
    AND rb.period_start = v_period_start
    AND rb.period_end = v_period_end
    AND rb.status NOT IN ('PAID', 'CANCELLED')
  LIMIT 1;

  -- Batasi agar tidak melewati akhir kontrak
  IF v_contract.end_date IS NOT NULL AND v_period_end > v_contract.end_date THEN
    v_period_end := v_contract.end_date;
  END IF;

  -- Akumulasi per hari selama periode berjalan
  FOR v_day IN
    SELECT d::date FROM generate_series(v_period_start, v_period_end, '1 day'::interval) AS d
  LOOP
    SELECT GREATEST(
      (SELECT COALESCE(SUM(rr.received_kg), 0)
       FROM rental_receivings rr
       WHERE rr.contract_id = p_contract_id
         AND rr.received_at::date <= v_day)
      -
      (SELECT COALESCE(SUM(rel.released_kg), 0)
       FROM rental_releases rel
       WHERE rel.contract_id = p_contract_id
         AND rel.released_at::date <= v_day),
      0
    ) INTO v_kg;

    -- Hanya hari yang benar-benar ada barang yang dikenakan tarif.
    -- Minimum 1 ton diterapkan pada kg yang ditagih bila diaktifkan.
    IF v_kg > 0 THEN
      v_billed_kg := GREATEST(v_kg, v_min_kg);
      v_total := v_total + (v_billed_kg * v_rate);
      v_total_kg_day := v_total_kg_day + v_billed_kg;
    END IF;
    v_charged_days := v_charged_days + 1;
  END LOOP;

  IF v_billing_id IS NULL THEN
    INSERT INTO rental_billing (
      organization_id, contract_id, invoice_number,
      period_start, period_end, total_amount, status
    ) VALUES (
      v_contract.organization_id, p_contract_id,
      public.generate_number('INV'),
      v_period_start, v_period_end,
      v_total, 'SENT'
    ) RETURNING id, invoice_number INTO v_billing_id, v_invoice;
  ELSE
    UPDATE rental_billing rb
    SET total_amount = v_total,
        period_start = v_period_start,
        period_end = v_period_end
    WHERE rb.id = v_billing_id;
    SELECT invoice_number INTO v_invoice FROM rental_billing WHERE id = v_billing_id;
  END IF;

  DELETE FROM rental_billing_lines rbl WHERE rbl.billing_id = v_billing_id;
  INSERT INTO rental_billing_lines (billing_id, description, quantity_kg, price_per_kg, subtotal)
  VALUES (
    v_billing_id,
    CASE WHEN v_min_kg > 0
      THEN 'Penyimpanan ' || v_charged_days || ' hari x ' || v_rate || '/kg/hari (min 1 ton, periode ' ||
           v_period_start || ' s/d ' || v_period_end || ')'
      ELSE 'Penyimpanan ' || v_charged_days || ' hari x ' || v_rate || '/kg/hari (periode ' ||
           v_period_start || ' s/d ' || v_period_end || ')'
    END,
    v_total_kg_day,
    v_rate,
    v_total
  );

  RETURN QUERY SELECT p_contract_id, v_invoice, v_total, v_charged_days, v_total_kg_day;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calculate_rental_billing(uuid) TO authenticated, service_role;

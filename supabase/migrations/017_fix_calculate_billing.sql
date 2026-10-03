-- ============================================================
-- ERP ASTADECA — Migration 017
-- Perbaiki calculate_rental_billing: fungsi RETURNS TABLE harus
-- memakai RETURN QUERY / RETURN NEXT, bukan `RETURN;` biasa.
-- Bug: UI "Terbitkan Invoice" tampak tidak terjadi apa-apa
--      karena RPC mengembalikan 0 baris.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calculate_rental_billing(p_contract_id uuid)
RETURNS TABLE(out_contract_id uuid, out_invoice_number text, out_total_amount numeric, out_total_days integer, out_total_kg_day numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contract RECORD;
  v_day DATE;
  v_days INTEGER;
  v_rate NUMERIC;
  v_kg NUMERIC;
  v_total NUMERIC := 0;
  v_total_kg_day NUMERIC := 0;
  v_billing_id UUID;
  v_invoice TEXT;
  v_charged_days INTEGER := 0;
BEGIN
  SELECT * INTO v_contract FROM rental_contracts WHERE id = p_contract_id;
  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'Contract % not found', p_contract_id;
  END IF;

  v_rate := v_contract.price_per_kg_per_day;
  IF v_contract.end_date IS NOT NULL THEN
    v_days := LEAST(14, GREATEST(1, (v_contract.end_date - v_contract.start_date) + 1));
  ELSE
    v_days := 14;
  END IF;

  FOR v_day IN
    SELECT d::date FROM generate_series(v_contract.start_date, v_contract.start_date + (v_days - 1), '1 day'::interval) AS d
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

    IF v_kg > 0 THEN
      v_total := v_total + (v_kg * v_rate);
      v_total_kg_day := v_total_kg_day + v_kg;
    END IF;
    v_charged_days := v_charged_days + 1;
  END LOOP;

  SELECT rb.id INTO v_billing_id FROM rental_billing rb
  WHERE rb.contract_id = p_contract_id AND rb.status NOT IN ('PAID', 'CANCELLED')
  LIMIT 1;

  IF v_billing_id IS NULL THEN
    INSERT INTO rental_billing (
      organization_id, contract_id, invoice_number,
      period_start, period_end, total_amount, status
    ) VALUES (
      v_contract.organization_id, p_contract_id,
      public.generate_number('INV'),
      v_contract.start_date,
      v_contract.start_date + (v_days - 1),
      v_total, 'SENT'
    ) RETURNING id, invoice_number INTO v_billing_id, v_invoice;
  ELSE
    UPDATE rental_billing rb
    SET total_amount = v_total,
        period_start = v_contract.start_date,
        period_end = v_contract.start_date + (v_days - 1)
    WHERE rb.id = v_billing_id;
    SELECT invoice_number INTO v_invoice FROM rental_billing WHERE id = v_billing_id;
  END IF;

  DELETE FROM rental_billing_lines rbl WHERE rbl.billing_id = v_billing_id;
  INSERT INTO rental_billing_lines (billing_id, description, quantity_kg, price_per_kg, subtotal)
  VALUES (
    v_billing_id,
    'Penyimpanan ' || v_charged_days || ' hari x ' || v_rate || '/kg/hari (periode ' || v_days || ' hari)',
    v_total_kg_day,
    v_rate,
    v_total
  );

  -- Kembalikan baris hasil (wajib RETURN QUERY/NEXT untuk RETURNS TABLE)
  RETURN QUERY SELECT p_contract_id, v_invoice, v_total, v_charged_days, v_total_kg_day;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calculate_rental_billing(uuid) TO authenticated, service_role;

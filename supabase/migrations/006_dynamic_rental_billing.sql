-- ============================================================
-- ERP ASTADECA — Migration 006
-- Dynamic rental billing: per-kg-per-day calculation
-- ============================================================

-- RPC: calculate_rental_billing
-- For each day in [start_date, end_date], compute:
--   kg_on_day = SUM(received_kg WHERE received_at::date <= day)
--             - SUM(released_kg WHERE released_at::date <= day)
--   (floored at 0)
-- total = SUM(kg_on_day * price_per_kg_per_day)
-- Upserts the billing row for the contract.

CREATE OR REPLACE FUNCTION public.calculate_rental_billing(p_contract_id UUID)
RETURNS TABLE(
  out_contract_id UUID,
  out_invoice_number TEXT,
  out_total_amount NUMERIC,
  out_total_days INTEGER,
  out_total_kg_day NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  SELECT * INTO v_contract FROM rental_contracts WHERE id = p_contract_id;
  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'Contract % not found', p_contract_id;
  END IF;

  v_rate := v_contract.price_per_kg_per_day;
  v_days := (v_contract.end_date - v_contract.start_date) + 1;

  FOR v_day IN SELECT d FROM generate_series(v_contract.start_date, v_contract.end_date, '1 day'::interval) AS d
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

    v_total := v_total + (v_kg * v_rate);
    v_total_kg_day := v_total_kg_day + v_kg;
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
      v_contract.start_date, v_contract.end_date,
      v_total, 'DRAFT'
    ) RETURNING id, invoice_number INTO v_billing_id, v_invoice;
  ELSE
    UPDATE rental_billing rb
    SET total_amount = v_total,
        period_start = v_contract.start_date,
        period_end = v_contract.end_date
    WHERE rb.id = v_billing_id;
    SELECT invoice_number INTO v_invoice FROM rental_billing WHERE id = v_billing_id;
  END IF;

  DELETE FROM rental_billing_lines rbl WHERE rbl.billing_id = v_billing_id;
  INSERT INTO rental_billing_lines (billing_id, description, quantity_kg, price_per_kg, subtotal)
  VALUES (
    v_billing_id,
    'Penyimpanan ' || v_days || ' hari x ' || v_rate || '/kg/hari',
    v_total_kg_day,
    v_rate,
    v_total
  );

  out_contract_id := p_contract_id;
  out_invoice_number := v_invoice;
  out_total_amount := v_total;
  out_total_days := v_days;
  out_total_kg_day := v_total_kg_day;
  RETURN;
END;
$$;

-- Trigger: auto-recalculate billing when a receiving is added
CREATE OR REPLACE FUNCTION public.on_rental_receiving_inserted()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.calculate_rental_billing(NEW.contract_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_receiving_billing ON public.rental_receivings;
CREATE TRIGGER trg_receiving_billing
  AFTER INSERT ON public.rental_receivings
  FOR EACH ROW EXECUTE FUNCTION public.on_rental_receiving_inserted();

-- Trigger: auto-recalculate billing when a release is added
CREATE OR REPLACE FUNCTION public.on_rental_release_inserted()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.calculate_rental_billing(NEW.contract_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_release_billing ON public.rental_releases;
CREATE TRIGGER trg_release_billing
  AFTER INSERT ON public.rental_releases
  FOR EACH ROW EXECUTE FUNCTION public.on_rental_release_inserted();

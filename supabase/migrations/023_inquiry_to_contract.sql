-- ============================================================
-- ERP ASTADECA — Migration 023
-- Approve Rental Inquiry -> otomatis menjadi Kontrak sewa (ACTIVE).
--   Fungsi: rental_inquiry_to_contract(p_inquiry_id)
--   - Membuat rental_contracts dari data inquiry (penyewa, cold storage,
--     periode). Tarif diambil dari organization_settings.rental.tariff_per_kg_per_day
--     (default 100), minimum 1 ton aktif.
--   - Menandai inquiry CONVERTED.
--   - Idempoten: bila inquiry sudah punya kontrak, kembalikan kontrak tsb.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rental_inquiry_to_contract(p_inquiry_id uuid)
RETURNS TABLE(out_contract_id uuid, out_contract_number text, out_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_inq RECORD;
  v_rate NUMERIC := 100;
  v_number TEXT;
  v_contract_id UUID;
  v_created BOOLEAN := false;
BEGIN
  SELECT * INTO v_inq FROM public.rental_inquiries WHERE id = p_inquiry_id;
  IF v_inq IS NULL THEN
    RAISE EXCEPTION 'Inquiry % not found', p_inquiry_id;
  END IF;

  -- Bila inquiry ini sudah pernah dikonversi jadi kontrak, kembalikan yang ada.
  SELECT rc.id, rc.contract_number INTO v_contract_id, v_number
  FROM public.rental_contracts rc
  WHERE rc.organization_id = v_inq.organization_id
    AND rc.notes LIKE '%[inquiry:' || p_inquiry_id::text || ']%'
  LIMIT 1;

  IF v_contract_id IS NOT NULL THEN
    RETURN QUERY SELECT v_contract_id, v_number, false;
    RETURN;
  END IF;

  -- Tarif dari pengaturan organisasi (default 100)
  SELECT COALESCE(MAX(NULLIF(value, '')::numeric), 100) INTO v_rate
  FROM public.organization_settings
  WHERE key = 'rental.tariff_per_kg_per_day'
    AND organization_id = v_inq.organization_id;

  v_number := public.generate_number('KONTRAK');

  INSERT INTO public.rental_contracts (
    organization_id, customer_id, cold_storage_id, contract_number,
    start_date, end_date, price_per_kg_per_day, minimum_1_ton,
    notes, status, is_spot, created_by
  ) VALUES (
    v_inq.organization_id, v_inq.customer_id, v_inq.cold_storage_id, v_number,
    COALESCE(v_inq.start_date, current_date),
    v_inq.end_date,
    v_rate, true,
    COALESCE(v_inq.notes || E'\n', '') || '[inquiry:' || p_inquiry_id::text || ']',
    'ACTIVE', false, v_inq.created_by
  ) RETURNING id INTO v_contract_id;

  v_created := true;

  UPDATE public.rental_inquiries SET status = 'CONVERTED' WHERE id = p_inquiry_id;

  RETURN QUERY SELECT v_contract_id, v_number, v_created;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rental_inquiry_to_contract(uuid) TO authenticated, service_role;

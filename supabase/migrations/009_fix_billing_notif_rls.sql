-- ============================================================
-- ERP ASTADECA — Migration 009
-- P0 Fixes:
--   1) calculate_rental_billing: hitung hanya selama barang ada,
--      periode rolling 14 hari, tidak overcharge
--   2) Gabung trigger notifikasi delivery order (hilangkan dobel)
--   3) notify_user: dedupe berdasarkan event unread yang sama
--   4) RLS storage goods-photos: scoped ke organisasi
--   5) Stok: trigger inventory dari goods receipt & sales order
--   6) Payment: tandai invoice LUNAS otomatis
-- ============================================================

-- ------------------------------------------------------------
-- 1) BILLING: hanya hitung selagi barang ada (received..released)
--    Periode rolling 14 hari dari tanggal mulai kontrak.
--    Rumus: SUM(kg_harian) * rate, untuk hari yang punya stok > 0.
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
  -- Periode tagih: rolling 14 hari (dibatasi akhir kontrak)
  v_days := LEAST(14, GREATEST(1, (v_contract.end_date - v_contract.start_date) + 1));

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

    -- Hanya hari yang benar-benar ada barang yang dikenakan tarif
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

  out_contract_id := p_contract_id;
  out_invoice_number := v_invoice;
  out_total_amount := v_total;
  out_total_days := v_charged_days;
  out_total_kg_day := v_total_kg_day;
  RETURN;
END;
$function$;

-- ------------------------------------------------------------
-- 2) Hilangkan trigger notifikasi DO yang dobel.
--    Simpan SATU trigger AFTER INSERT OR UPDATE pada delivery_orders.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_delivery_order_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  -- Hanya saat status menjadi terbit (INSERT atau UPDATE ke PRINTED/RELEASED)
  IF NEW.status IN ('PRINTED', 'RELEASED')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    FOR r IN
      SELECT om.user_id
      FROM public.organization_memberships om
      JOIN public.roles ro ON ro.id = om.role_id
      WHERE om.organization_id = NEW.organization_id
        AND om.is_active = true
        AND ro.code IN ('WAREHOUSE', 'SYSTEM_ADMIN')
    LOOP
      PERFORM public.notify_user(
        NEW.organization_id,
        r.user_id,
        'Surat Jalan Terbit: ' || NEW.do_number,
        'Surat jalan ' || NEW.do_number || ' sudah dapat dicetak / diunduh.',
        'DELIVERY_ORDER',
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_delivery_order ON public.delivery_orders;
DROP TRIGGER IF EXISTS notify_delivery_order_insert ON public.delivery_orders;
DROP FUNCTION IF EXISTS public.trg_notify_delivery_order();

CREATE TRIGGER notify_delivery_order
  AFTER INSERT OR UPDATE ON public.delivery_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_delivery_order_issued();

-- ------------------------------------------------------------
-- 3) notify_user: jangan buat notif unread duplikat utk event sama
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_user(
  p_org uuid,
  p_recipient uuid,
  p_title text,
  p_message text,
  p_ref_type text DEFAULT NULL,
  p_ref_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_recipient IS NULL THEN RETURN; END IF;

  -- Dedupe: lewati bila sudah ada notifikasi unread dengan event yang sama
  IF p_ref_type IS NOT NULL AND p_ref_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.notifications
      WHERE recipient_user_id = p_recipient
        AND reference_type = p_ref_type
        AND reference_id = p_ref_id
        AND is_read = false
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.notifications (organization_id, recipient_user_id, title, message, reference_type, reference_id)
  VALUES (p_org, p_recipient, p_title, p_message, p_ref_type, p_ref_id);
END;
$function$;

-- ------------------------------------------------------------
-- 4) RLS storage: scoped ke organisasi via prefix folder
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "goods_photos_read" ON storage.objects;
DROP POLICY IF EXISTS "goods_photos_insert" ON storage.objects;
DROP POLICY IF EXISTS "goods_photos_update" ON storage.objects;
DROP POLICY IF EXISTS "goods_photos_delete" ON storage.objects;

CREATE POLICY "goods_photos_read" ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'goods-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.my_org_ids())
  );

CREATE POLICY "goods_photos_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'goods-photos'
    AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-'
    AND (storage.foldername(name))[1]::uuid IN (SELECT public.my_org_ids())
  );

CREATE POLICY "goods_photos_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'goods-photos'
    AND owner = auth.uid()
  )
  WITH CHECK (
    bucket_id = 'goods-photos'
    AND owner = auth.uid()
  );

CREATE POLICY "goods_photos_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'goods-photos'
    AND owner = auth.uid()
  );

-- ------------------------------------------------------------
-- 5) STOK: goods receipt (masuk) menambah inventory + movement
--    Unik per (organization, product, batch) supaya bisa upsert.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS inventory_org_product_batch_key
  ON public.inventory (organization_id, product_id, COALESCE(batch_number, ''));

CREATE OR REPLACE FUNCTION public.trg_goods_receipt_line_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_qty NUMERIC;
BEGIN
  SELECT organization_id INTO v_org FROM public.goods_receipts WHERE id = NEW.gr_id;
  v_qty := COALESCE(NULLIF(NEW.quantity_received, 0), NEW.quantity_kg, 0);
  IF v_qty <= 0 THEN RETURN NEW; END IF;

  INSERT INTO public.inventory (organization_id, product_id, batch_number, quantity_kg, status, received_at)
  VALUES (v_org, NEW.product_id, NEW.batch_number, v_qty, 'AVAILABLE', now())
  ON CONFLICT (organization_id, product_id, COALESCE(batch_number, ''))
  DO UPDATE SET quantity_kg = public.inventory.quantity_kg + EXCLUDED.quantity_kg;

  INSERT INTO public.inventory_movements (
    organization_id, movement_type, product_id, batch_number, quantity_kg,
    to_location, reference_type, reference_id, notes
  ) VALUES (
    v_org, 'IN', NEW.product_id, NEW.batch_number, v_qty,
    'WAREHOUSE', 'GOODS_RECEIPT', NEW.gr_id, 'Penerimaan barang dari supplier'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS goods_receipt_line_stock ON public.goods_receipt_lines;
CREATE TRIGGER goods_receipt_line_stock
  AFTER INSERT ON public.goods_receipt_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_goods_receipt_line_stock();

-- ------------------------------------------------------------
-- 6) STOK: sales order (terkirim) mengurangi inventory + movement
--    Dijalankan saat SO berstatus APPROVED.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sales_order_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l RECORD;
  v_remaining NUMERIC;
  v_take NUMERIC;
  inv RECORD;
BEGIN
  IF NEW.status = 'APPROVED' AND (OLD.status IS DISTINCT FROM 'APPROVED') THEN
    FOR l IN SELECT * FROM public.sales_order_lines WHERE so_id = NEW.id LOOP
      v_remaining := COALESCE(l.quantity_kg, 0);
      IF v_remaining <= 0 THEN CONTINUE; END IF;

      -- Kurangi stok per produk (batch terlama lebih dulu / FIFO)
      FOR inv IN
        SELECT id, quantity_kg FROM public.inventory
        WHERE organization_id = NEW.organization_id AND product_id = l.product_id
        ORDER BY COALESCE(received_at, now()) ASC
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_take := LEAST(inv.quantity_kg, v_remaining);
        UPDATE public.inventory SET quantity_kg = quantity_kg - v_take WHERE id = inv.id;
        v_remaining := v_remaining - v_take;
      END LOOP;

      INSERT INTO public.inventory_movements (
        organization_id, movement_type, product_id, quantity_kg,
        from_location, reference_type, reference_id, notes
      ) VALUES (
        NEW.organization_id, 'OUT', l.product_id, l.quantity_kg,
        'WAREHOUSE', 'SALES_ORDER', NEW.id, 'Pengeluaran untuk penjualan ' || NEW.so_number
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_order_stock ON public.sales_orders;
CREATE TRIGGER sales_order_stock
  AFTER UPDATE ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_sales_order_stock();

-- ------------------------------------------------------------
-- 7) PAYMENT: tandai invoice rental LUNAS bila pembayaran mencukupi
--    reference_type = 'RENTAL_BILLING'
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_payment_settle_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paid NUMERIC;
  v_total NUMERIC;
BEGIN
  IF NEW.reference_type = 'RENTAL_BILLING' AND NEW.reference_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.payments
    WHERE reference_type = 'RENTAL_BILLING' AND reference_id = NEW.reference_id;

    SELECT total_amount INTO v_total FROM public.rental_billing WHERE id = NEW.reference_id;

    IF v_total IS NOT NULL AND v_paid >= v_total THEN
      UPDATE public.rental_billing SET status = 'PAID' WHERE id = NEW.reference_id;
    ELSIF v_total IS NOT NULL AND v_paid > 0 THEN
      -- Pembayaran sebagian: tetap SENT (belum lunas)
      UPDATE public.rental_billing SET status = 'SENT' WHERE id = NEW.reference_id
        AND status NOT IN ('PAID', 'CANCELLED');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_settle_invoice ON public.payments;
CREATE TRIGGER payment_settle_invoice
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_payment_settle_invoice();


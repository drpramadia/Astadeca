-- ============================================================
-- ERP ASTADECA — Migration 029
-- Pengerasan hasil audit: race condition, integritas stok/hari,
-- RLS notifikasi & audit log, index FK.
-- Idempotent: aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- K1) Race penomoran RFQ: count(*) + 1 -> sequence per prefix
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_rfq_number(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_date TEXT := to_char(current_date, 'YYYYMMDD');
  v_seq  TEXT := 'seq_rfq_' || lower(regexp_replace(p_prefix, '[^a-zA-Z0-9]', '_', 'g')) || '_' || v_date;
  v_val  BIGINT;
BEGIN
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', v_seq);
  EXECUTE format('SELECT nextval(%L)', v_seq) INTO v_val;
  RETURN p_prefix || '/' || v_date || '/' || lpad(v_val::text, 4, '0');
END;
$function$;

-- ------------------------------------------------------------
-- K2) Billing: satu invoice terbuka per (contract, periode)
-- Guard dulu data lama, baru pasang constraint.
-- ------------------------------------------------------------
UPDATE public.rental_billing rb SET status = 'CANCELLED'
WHERE rb.status NOT IN ('PAID', 'CANCELLED')
  AND EXISTS (
    SELECT 1 FROM public.rental_billing x
    WHERE x.contract_id = rb.contract_id
      AND x.period_start = rb.period_start
      AND x.period_end = rb.period_end
      AND x.status NOT IN ('PAID', 'CANCELLED')
      AND x.id <> rb.id
      AND x.created_at < rb.created_at
  );

DROP INDEX IF EXISTS public.rental_billing_open_period_key;
CREATE UNIQUE INDEX rental_billing_open_period_key
  ON public.rental_billing (contract_id, period_start, period_end)
  WHERE status NOT IN ('PAID', 'CANCELLED');

-- ------------------------------------------------------------
-- K3) Stok tidak boleh negatif + lock baris sebelum FIFO
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_sales_order_stock_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  l RECORD;
  v_remaining NUMERIC;
  v_take NUMERIC;
  inv RECORD;
  v_available NUMERIC;
BEGIN
  IF NEW.status = 'APPROVED' AND (OLD.status IS DISTINCT FROM 'APPROVED') THEN
    -- Serialisasi pengurangan stok per organisasi+produk.
    PERFORM pg_advisory_xact_lock(hashtext(NEW.organization_id::text));

    FOR l IN SELECT * FROM public.sales_order_lines WHERE so_id = NEW.id LOOP
      v_remaining := COALESCE(l.quantity_kg, 0);
      IF v_remaining <= 0 THEN CONTINUE; END IF;

      SELECT COALESCE(SUM(quantity_kg), 0) INTO v_available
      FROM public.inventory
      WHERE organization_id = NEW.organization_id AND product_id = l.product_id;

      IF v_available < v_remaining THEN
        RAISE EXCEPTION 'Stok tidak cukup untuk produk % (tersedia %, butuh %)',
          l.product_id, v_available, v_remaining
          USING ERRCODE = 'check_violation';
      END IF;

      FOR inv IN
        SELECT id, quantity_kg FROM public.inventory
        WHERE organization_id = NEW.organization_id AND product_id = l.product_id
        ORDER BY COALESCE(received_at, now()) ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining <= 0;
        v_take := LEAST(inv.quantity_kg, v_remaining);
        CONTINUE WHEN v_take <= 0;
        UPDATE public.inventory
        SET quantity_kg = quantity_kg - v_take
        WHERE id = inv.id AND quantity_kg >= v_take;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Gagal mengurangi stok (baris % berubah bersamaan)', inv.id;
        END IF;
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
$function$;

-- Jaring terakhir: stok/lines tidak boleh negatif di DB.
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_quantity_nonneg;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_quantity_nonneg CHECK (quantity_kg >= 0);
ALTER TABLE public.sales_order_lines DROP CONSTRAINT IF EXISTS so_lines_quantity_nonneg;
ALTER TABLE public.sales_order_lines ADD CONSTRAINT so_lines_quantity_nonneg CHECK (quantity_kg >= 0);
ALTER TABLE public.purchase_order_lines DROP CONSTRAINT IF EXISTS po_lines_quantity_nonneg;
ALTER TABLE public.purchase_order_lines ADD CONSTRAINT po_lines_quantity_nonneg CHECK (quantity_kg >= 0);

-- ------------------------------------------------------------
-- K4) Hari sewa: tolak bila melebihi hari yang dibayar + lock
-- ------------------------------------------------------------
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

  -- Lock baris kontrak agar dua pemakaian bersamaan tidak saling tabrak.
  PERFORM 1 FROM public.rental_contracts WHERE id = p_contract_id FOR UPDATE;

  UPDATE public.rental_contracts
  SET days_used = days_used + p_days
  WHERE id = p_contract_id
    AND (days_paid - days_used) >= p_days
  RETURNING organization_id INTO v_org;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Saldo hari tidak cukup atau kontrak % tidak ditemukan', p_contract_id
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.rental_day_ledger (organization_id, contract_id, entry_type, days, notes, created_by)
  VALUES (v_org, p_contract_id, 'USE', p_days, COALESCE(p_note, 'Pemakaian hari'), p_user);

  RETURN QUERY
    SELECT rc.days_paid, rc.days_used, rc.days_paid - rc.days_used
    FROM public.rental_contracts rc WHERE rc.id = p_contract_id;
END;
$$;

ALTER TABLE public.rental_contracts DROP CONSTRAINT IF EXISTS rental_days_nonneg;
ALTER TABLE public.rental_contracts
  ADD CONSTRAINT rental_days_nonneg CHECK (days_paid >= 0 AND days_used >= 0 AND days_used <= days_paid);

-- ------------------------------------------------------------
-- T3) Notifikasi: hanya penerima (atau system admin) boleh baca/ubah
-- ------------------------------------------------------------
DROP POLICY IF EXISTS notifications_recipient ON public.notifications;
CREATE POLICY notifications_recipient ON public.notifications FOR ALL TO authenticated
  USING (public.is_system_admin() OR recipient_user_id = auth.uid())
  WITH CHECK (public.is_system_admin() OR recipient_user_id = auth.uid());

-- ------------------------------------------------------------
-- T7) Activity log: append-only, tulis atas nama sendiri
-- ------------------------------------------------------------
DROP POLICY IF EXISTS activity_logs_org_access ON public.activity_logs;
CREATE POLICY activity_logs_insert ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (
    public.is_system_admin()
    OR (organization_id IN (SELECT public.my_org_ids())
        AND (user_id IS NULL OR user_id = auth.uid()))
  );
CREATE POLICY activity_logs_read ON public.activity_logs FOR SELECT TO authenticated
  USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()));

-- ------------------------------------------------------------
-- S5) Update status bermakna bisnis: jangan diam bila 0 baris
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_row_updated(p_affected bigint, p_context text)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_affected = 0 THEN
    RAISE EXCEPTION 'Operasi gagal, 0 baris terpengaruh: %', p_context
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- T8) Index untuk kolom FK yang dipakai join/filter
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_rb_contract        ON public.rental_billing (contract_id);
CREATE INDEX IF NOT EXISTS idx_rbl_billing        ON public.rental_billing_lines (billing_id);
CREATE INDEX IF NOT EXISTS idx_inv_product        ON public.inventory (product_id);
CREATE INDEX IF NOT EXISTS idx_inv_org_product    ON public.inventory (organization_id, product_id);
CREATE INDEX IF NOT EXISTS idx_invmov_reference   ON public.inventory_movements (reference_id);
CREATE INDEX IF NOT EXISTS idx_po_lines_po        ON public.purchase_order_lines (po_id);
CREATE INDEX IF NOT EXISTS idx_so_lines_so        ON public.sales_order_lines (so_id);
CREATE INDEX IF NOT EXISTS idx_gr_lines_gr        ON public.goods_receipt_lines (gr_id);
CREATE INDEX IF NOT EXISTS idx_do_lines_do        ON public.delivery_order_lines (do_id);
CREATE INDEX IF NOT EXISTS idx_dr_lines_dr        ON public.delivery_request_lines (request_id);
CREATE INDEX IF NOT EXISTS idx_quo_lines_quo      ON public.quotation_lines (quotation_id);
CREATE INDEX IF NOT EXISTS idx_qc_lines_qc        ON public.qc_inspection_lines (inspection_id);
CREATE INDEX IF NOT EXISTS idx_crfq_lines_rfq     ON public.customer_rfq_lines (rfq_id);
CREATE INDEX IF NOT EXISTS idx_srfq_lines_rfq     ON public.supplier_rfq_lines (rfq_id);
CREATE INDEX IF NOT EXISTS idx_sq_lines_quote     ON public.supplier_quote_lines (quote_id);
CREATE INDEX IF NOT EXISTS idx_waste_records_org  ON public.waste_records (organization_id);
CREATE INDEX IF NOT EXISTS idx_inventory_basket   ON public.inventory (basket_id);
CREATE INDEX IF NOT EXISTS idx_rdu_contract_date  ON public.rental_daily_usage (contract_id, usage_date);
CREATE INDEX IF NOT EXISTS idx_ageing_org         ON public.activity_logs (organization_id);
CREATE INDEX IF NOT EXISTS idx_notif_recipient    ON public.notifications (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON public.payments (reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_tx_reference       ON public.transactions (reference_id);
CREATE INDEX IF NOT EXISTS idx_tx_org_date        ON public.transactions (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_org_date  ON public.activity_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_approval_org_state ON public.approval_requests (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_rr_contract        ON public.rental_receivings (contract_id);
CREATE INDEX IF NOT EXISTS idx_rel_contract       ON public.rental_releases (contract_id);
CREATE INDEX IF NOT EXISTS idx_movements_inv      ON public.inventory_movements (product_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_membership_user    ON public.organization_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_documents_ref      ON public.documents (reference_id);
CREATE INDEX IF NOT EXISTS idx_rfqc_org           ON public.customer_rfq (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rfqs_org           ON public.supplier_rfq (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waste_org          ON public.stock_waste (organization_id, created_at DESC);

-- ------------------------------------------------------------
-- S2) reference_type polimorfik: batasi nilai yang dikenal
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_allowed TEXT := '( ''SALES_ORDER'',''PURCHASE_ORDER'',''GOODS_RECEIPT'',''GOODS_ISSUE'',
    ''DELIVERY_ORDER'',''RENTAL_BILLING'',''RENTAL_CONTRACT'',''RENTAL_RECEIVING'',
    ''RENTAL_RELEASE'',''PAYMENT'',''TRANSACTION'',''QUOTATION'',''RFQ_CUSTOMER'',
    ''RFQ_SUPPLIER'',''SUPPLIER_QUOTE'',''STOCK_WASTE'',''ADJUSTMENT'',''APPROVAL_REQUEST'' )';
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, c.conname AS cname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'reference_type'
    WHERE c.contype = 'c' AND c.conname LIKE '%reference_type%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.cname);
  END LOOP;
END;
$$;

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inv_mov_reference_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inv_mov_reference_type_check
  CHECK (reference_type IS NULL OR reference_type IN (
    'SALES_ORDER','PURCHASE_ORDER','GOODS_RECEIPT','GOODS_ISSUE','DELIVERY_ORDER',
    'RENTAL_RECEIVING','RENTAL_RELEASE','STOCK_WASTE','ADJUSTMENT','MANUAL'));

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_reference_type_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_reference_type_check
  CHECK (reference_type IS NULL OR reference_type IN ('RENTAL_BILLING','PURCHASE_ORDER','SALES_ORDER','MANUAL'));

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS tx_reference_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT tx_reference_type_check
  CHECK (reference_type IS NULL OR reference_type IN ('PAYMENT','RENTAL_BILLING','RENTAL_SPOT','PURCHASE_ORDER','SALES_ORDER','MANUAL'));

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_reference_type_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_reference_type_check
  CHECK (reference_type IS NULL OR reference_type IN (
    'RENTAL_CONTRACT','RENTAL_BILLING','PURCHASE_ORDER','SALES_ORDER','DELIVERY_ORDER',
    'GOODS_RECEIPT','GOODS_ISSUE','QUOTATION','RFQ_CUSTOMER','RFQ_SUPPLIER','SUPPLIER_QUOTE'));

GRANT EXECUTE ON FUNCTION public.rental_use_days(uuid, integer, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_row_updated(bigint, text) TO authenticated, service_role;

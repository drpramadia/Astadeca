-- ============================================================
-- ERP ASTADECA — Migration 028
-- Sinkronisasi penjualan & pembelian dengan laporan keuangan.
--
-- Masalah sebelumnya:
--   1) total_amount pada purchase_orders/sales_orders tidak pernah diisi
--      (tetap 0), padahal lines punya subtotal -> laporan tampak 0.
--   2) Trigger finance hanya jalan saat status berubah ke APPROVED. Bila
--      dokumen dibuat langsung berstatus APPROVED (oleh Director), lines
--      belum ada saat trigger jalan -> transaksi TIDAK tercatat.
--
-- Perbaikan:
--   - Fungsi sync_po_finance()/sync_so_finance(): hitung total dari lines,
--     update header.total_amount, dan buat transaksi (idempoten, hapus dulu
--     transaksi lama utk dokumen bila sudah ada) ketika status APPROVED.
--   - Trigger pada header (after insert/update status) DAN pada lines
--     (after insert/update/delete) agar total & transaksi selalu konsisten.
-- ============================================================

-- ------------------------------------------------------------
-- PURCHASE ORDER
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_po_finance(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_po RECORD;
  v_total NUMERIC;
BEGIN
  SELECT * INTO v_po FROM public.purchase_orders WHERE id = p_po_id;
  IF v_po IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_total
  FROM public.purchase_order_lines WHERE po_id = p_po_id;

  -- Selalu selaraskan total header dengan rincian
  IF v_po.total_amount IS DISTINCT FROM v_total THEN
    UPDATE public.purchase_orders SET total_amount = v_total WHERE id = p_po_id;
  END IF;

  -- Buat transaksi hanya bila APPROVED dan ada nilai
  IF v_po.status = 'APPROVED' AND v_total > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE reference_type = 'PURCHASE_ORDER' AND reference_id = p_po_id
    ) THEN
      INSERT INTO public.transactions (organization_id, transaction_date, description, amount, type, reference_type, reference_id, created_by)
      VALUES (v_po.organization_id, current_date, 'Pembelian PO ' || v_po.po_number, v_total, 'DEBIT', 'PURCHASE_ORDER', p_po_id, v_po.created_by);
    ELSE
      UPDATE public.transactions SET amount = v_total
      WHERE reference_type = 'PURCHASE_ORDER' AND reference_id = p_po_id;
    END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_po_finance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.sync_po_finance(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS po_finance_sync ON public.purchase_orders;
CREATE TRIGGER po_finance_sync
  AFTER INSERT OR UPDATE OF status, total_amount ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_po_finance();

CREATE OR REPLACE FUNCTION public.trg_po_lines_finance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.sync_po_finance(COALESCE(NEW.po_id, OLD.po_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS po_lines_finance_sync ON public.purchase_order_lines;
CREATE TRIGGER po_lines_finance_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_po_lines_finance();

-- ------------------------------------------------------------
-- SALES ORDER
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_so_finance(p_so_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_so RECORD;
  v_total NUMERIC;
BEGIN
  SELECT * INTO v_so FROM public.sales_orders WHERE id = p_so_id;
  IF v_so IS NULL THEN RETURN; END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_total
  FROM public.sales_order_lines WHERE so_id = p_so_id;

  IF v_so.total_amount IS DISTINCT FROM v_total THEN
    UPDATE public.sales_orders SET total_amount = v_total WHERE id = p_so_id;
  END IF;

  IF v_so.status = 'APPROVED' AND v_total > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE reference_type = 'SALES_ORDER' AND reference_id = p_so_id
    ) THEN
      INSERT INTO public.transactions (organization_id, transaction_date, description, amount, type, reference_type, reference_id, created_by)
      VALUES (v_so.organization_id, current_date, 'Penjualan SO ' || v_so.so_number, v_total, 'CREDIT', 'SALES_ORDER', p_so_id, v_so.created_by);
    ELSE
      UPDATE public.transactions SET amount = v_total
      WHERE reference_type = 'SALES_ORDER' AND reference_id = p_so_id;
    END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_so_finance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.sync_so_finance(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS so_finance_sync ON public.sales_orders;
CREATE TRIGGER so_finance_sync
  AFTER INSERT OR UPDATE OF status, total_amount ON public.sales_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_so_finance();

CREATE OR REPLACE FUNCTION public.trg_so_lines_finance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.sync_so_finance(COALESCE(NEW.so_id, OLD.so_id));
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS so_lines_finance_sync ON public.sales_order_lines;
CREATE TRIGGER so_lines_finance_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_lines
  FOR EACH ROW EXECUTE FUNCTION public.trg_so_lines_finance();

GRANT EXECUTE ON FUNCTION public.sync_po_finance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_so_finance(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Backfill: selaraskan data yang sudah ada
-- ------------------------------------------------------------
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.purchase_orders LOOP
    PERFORM public.sync_po_finance(r.id);
  END LOOP;
  FOR r IN SELECT id FROM public.sales_orders LOOP
    PERFORM public.sync_so_finance(r.id);
  END LOOP;
END $$;

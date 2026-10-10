-- ============================================================
-- ERP ASTADECA — Migration 030
-- RPC transaksional untuk pengeluaran stok manual (APK Warehouse).
--
-- Masalah: klien (APK) melakukan PATCH stok lalu INSERT movement sebagai
-- dua request terpisah. Bila proses mati di antara keduanya, stok berkurang
-- tanpa jejak movement. Pindahkan ke satu fungsi = satu transaksi.
--
-- Idempotent: aman dijalankan ulang.
-- ============================================================

-- ------------------------------------------------------------
-- 1) issue_stock: kurangi stok + catat movement secara atomik.
--
--    - Verifikasi izin inventory.issue pada organisasi baris stok.
--    - Lock baris inventory (FOR UPDATE) supaya dua pengeluaran
--      bersamaan tidak menghasilkan stok negatif.
--    - Guard quantity_kg >= p_take.
--    - Kembalikan json: { success, quantity_kg } atau raise exception.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_stock(
  p_inventory_id uuid,
  p_take numeric,
  p_reference_type text DEFAULT 'MANUAL',
  p_reference_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_performed_by uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_inv       RECORD;
  v_new_qty   numeric;
  v_performer uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Tidak terautentikasi.' USING ERRCODE = '28000';
  END IF;

  IF p_take IS NULL OR p_take <= 0 THEN
    RAISE EXCEPTION 'Jumlah keluar harus lebih dari 0.' USING ERRCODE = '22023';
  END IF;

  -- Lock baris stok; cegah race dua pengeluaran bersamaan.
  SELECT id, organization_id, product_id, batch_number, quantity_kg
    INTO v_inv
  FROM public.inventory
  WHERE id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Baris stok tidak ditemukan.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_org_permission(v_inv.organization_id, 'inventory.issue') THEN
    RAISE EXCEPTION 'Tidak punya izin mengeluarkan stok.' USING ERRCODE = '42501';
  END IF;

  IF v_inv.quantity_kg < p_take THEN
    RAISE EXCEPTION 'Stok hanya % kg.', v_inv.quantity_kg USING ERRCODE = '22003';
  END IF;

  v_new_qty := v_inv.quantity_kg - p_take;

  UPDATE public.inventory
  SET quantity_kg = v_new_qty
  WHERE id = v_inv.id;

  -- performed_by: hormati nilai yang dikirim hanya bila sama dengan pemanggil,
  -- supaya tidak bisa memalsukan pelaku.
  v_performer := CASE WHEN p_performed_by = v_uid THEN p_performed_by ELSE v_uid END;

  INSERT INTO public.inventory_movements (
    organization_id, movement_type, product_id, batch_number, quantity_kg,
    from_location, reference_type, reference_id, notes, performed_by
  ) VALUES (
    v_inv.organization_id, 'OUT', v_inv.product_id, v_inv.batch_number, p_take,
    'WAREHOUSE', COALESCE(NULLIF(p_reference_type, ''), 'MANUAL'), p_reference_id,
    COALESCE(NULLIF(p_notes, ''), 'Pengeluaran manual'), v_performer
  );

  RETURN json_build_object('success', true, 'quantity_kg', v_new_qty);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.issue_stock(uuid, numeric, text, uuid, text, uuid) TO authenticated;

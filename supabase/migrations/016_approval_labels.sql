-- ============================================================
-- ERP ASTADECA — Migration 016
-- Tambah label notifikasi approval untuk tipe baru (inquiry, release)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_notify_approval_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_label TEXT;
BEGIN
  v_label := CASE NEW.request_type
    WHEN 'PURCHASE_ORDER' THEN 'Purchase Order'
    WHEN 'SALES_ORDER' THEN 'Sales Order'
    WHEN 'CONTRACT' THEN 'Kontrak Rental'
    WHEN 'QUOTATION' THEN 'Penawaran Harga'
    WHEN 'DELIVERY' THEN 'Delivery Order'
    WHEN 'RENTAL_INQUIRY' THEN 'Permintaan Sewa'
    WHEN 'RENTAL_RELEASE' THEN 'Pengeluaran Barang'
    ELSE NEW.request_type
  END;

  FOR r IN
    SELECT om.user_id
    FROM public.organization_memberships om
    JOIN public.roles ro ON ro.id = om.role_id
    WHERE om.organization_id = NEW.organization_id
      AND om.is_active = true
      AND ro.code IN ('DIRECTOR', 'SYSTEM_ADMIN')
      AND om.user_id <> NEW.requested_by
  LOOP
    PERFORM public.notify_user(
      NEW.organization_id,
      r.user_id,
      'Persetujuan Baru: ' || v_label,
      'Ada permintaan ' || v_label || ' yang menunggu persetujuan Anda. Klik untuk melihat detail.',
      'APPROVAL',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

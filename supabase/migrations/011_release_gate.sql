-- ============================================================
-- ERP ASTADECA — Migration 011
-- Gate "harus lunas" sebelum barang keluar + approval pengeluaran
-- ============================================================

-- 1) Status approval untuk pengeluaran barang
--    request_type baru: 'RENTAL_RELEASE'
--    (tidak perlu mengubah constraint; approval_requests.request_type bebas teks)

-- 2) Gerbang lunas: blokir release bila masih ada invoice rental
--    yang belum lunas (SENT / OVERDUE) untuk kontrak yang sama.
--    Bisa dilewati hanya oleh SYSTEM_ADMIN dengan menyalakan flag
--    session: set_config('app.allow_unpaid_release','on', true)
CREATE OR REPLACE FUNCTION public.trg_guard_release_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unpaid INTEGER;
  v_allow TEXT;
BEGIN
  -- Hanya berlaku untuk kontrak non-spot (spot sudah bayar di depan)
  IF EXISTS (SELECT 1 FROM public.rental_contracts WHERE id = NEW.contract_id AND is_spot = true) THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_unpaid
  FROM public.rental_billing
  WHERE contract_id = NEW.contract_id
    AND status IN ('SENT', 'OVERDUE');

  IF v_unpaid > 0 THEN
    v_allow := current_setting('app.allow_unpaid_release', true);
    IF v_allow IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Barang tidak dapat dikeluarkan: masih ada % tagihan belum lunas. Lunasi dulu.', v_unpaid
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_release_payment ON public.rental_releases;
CREATE TRIGGER guard_release_payment
  BEFORE INSERT ON public.rental_releases
  FOR EACH ROW EXECUTE FUNCTION public.trg_guard_release_payment();

-- 3) Approval pengeluaran: catat permintaan approval saat release besar.
--    UI akan membuat approval_requests dengan request_type='RENTAL_RELEASE'.
--    Trigger ini hanya memberi notifikasi ke director saat dibuat.
CREATE OR REPLACE FUNCTION public.trg_notify_release_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.request_type = 'RENTAL_RELEASE' AND NEW.status = 'PENDING' THEN
    FOR r IN
      SELECT om.user_id
      FROM public.organization_memberships om
      JOIN public.roles ro ON ro.id = om.role_id
      WHERE om.organization_id = NEW.organization_id
        AND om.is_active = true
        AND ro.code IN ('DIRECTOR', 'SYSTEM_ADMIN')
    LOOP
      PERFORM public.notify_user(
        NEW.organization_id,
        r.user_id,
        'Approval Pengeluaran Barang',
        'Ada permintaan pengeluaran barang yang menunggu persetujuan.',
        'APPROVAL',
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_release_approval ON public.approval_requests;
CREATE TRIGGER notify_release_approval
  AFTER INSERT ON public.approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_release_approval();

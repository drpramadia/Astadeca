-- ============================================================
-- ERP ASTADECA — Migration 026
-- Notifikasi penagihan agar tidak terlewat.
--   notify_rental_billing_due(p_organization_id) -> integer
--     Mengirim notifikasi ke ADMIN/DIRECTOR/SYSTEM_ADMIN atas:
--       a) invoice belum lunas (SENT) -> pengingat penagihan;
--       b) invoice jatuh tempo (OVERDUE) -> prioritas tinggi.
--     Dedupe per (recipient, invoice) di level notify_user.
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_rental_billing_due(p_organization_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bill RECORD;
  v_recipient RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR v_bill IN
    SELECT rb.id, rb.organization_id, rb.invoice_number, rb.total_amount,
           rb.status, rb.period_start, rb.period_end,
           rc.contract_number
    FROM public.rental_billing rb
    JOIN public.rental_contracts rc ON rc.id = rb.contract_id
    WHERE rb.status IN ('SENT', 'OVERDUE')
      AND (p_organization_id IS NULL OR rb.organization_id = p_organization_id)
  LOOP
    FOR v_recipient IN
      SELECT om.user_id
      FROM public.organization_memberships om
      JOIN public.roles r ON r.id = om.role_id
      WHERE om.organization_id = v_bill.organization_id
        AND om.is_active = true
        AND r.code IN ('ADMIN', 'DIRECTOR', 'SYSTEM_ADMIN')
    LOOP
      PERFORM public.notify_user(
        v_bill.organization_id,
        v_recipient.user_id,
        CASE WHEN v_bill.status = 'OVERDUE'
          THEN 'Tagihan JATUH TEMPO — ' || v_bill.invoice_number
          ELSE 'Pengingat Penagihan — ' || v_bill.invoice_number
        END,
        'Invoice ' || v_bill.invoice_number || ' (' || v_bill.contract_number || ') sebesar Rp ' ||
          to_char(v_bill.total_amount, 'FM999,999,999,990') || ' periode ' ||
          v_bill.period_start || ' s/d ' || v_bill.period_end || ' belum lunas. Segera tagih penyewa.',
        'RENTAL_BILLING',
        v_bill.id
      );
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_rental_billing_due(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Sinkronisasi status OVERDUE otomatis: invoice yang lewat periode
-- dan masih SENT ditandai OVERDUE agar ikut termonitor.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_overdue_rental_billing(p_organization_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.rental_billing
  SET status = 'OVERDUE'
  WHERE status = 'SENT'
    AND period_end < current_date
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_overdue_rental_billing(uuid) TO authenticated, service_role;

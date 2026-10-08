-- ============================================================
-- ERP ASTADECA — Migration 027
-- Fix trigger snapshot harian saat DELETE.
--   trg_refresh_daily_usage memakai NEW.contract_id; pada operasi DELETE
--   NEW bernilai NULL sehingga rebuild gagal ("Contract <NULL> not found").
--   Gunakan COALESCE(NEW, OLD) agar INSERT/UPDATE/DELETE sama-sama aman.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_refresh_daily_usage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contract_id uuid;
BEGIN
  v_contract_id := COALESCE(NEW.contract_id, OLD.contract_id);
  IF v_contract_id IS NOT NULL THEN
    PERFORM public.rebuild_rental_daily_usage(v_contract_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ============================================================
-- ERP ASTADECA — Migration 012
-- Perbaiki generate_number: jadikan SECURITY DEFINER + search_path aman.
-- Bug: fungsi berjalan sebagai SECURITY INVOKER sehingga user authenticated
--      tidak berhak CREATE SEQUENCE / nextval di schema public,
--      menyebabkan RPC gagal (403 / null) -> contract_number NULL.
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_number(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_seq_name TEXT;
  v_seq_val INT;
  v_result TEXT;
BEGIN
  v_seq_name := 'seq_' || lower(regexp_replace(p_prefix, '[^a-zA-Z]', '', 'g'));
  EXECUTE format('CREATE SEQUENCE IF NOT EXISTS %I', v_seq_name);
  EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_seq_val;
  v_result := p_prefix || '/' || to_char(now(), 'YYYY/MM/') || lpad(v_seq_val::TEXT, 4, '0');
  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.generate_number(text) TO anon, authenticated, service_role;

-- Simpan customer cold storage sekaligus ke master customers.
-- Kedua INSERT berjalan dalam satu transaksi RPC sehingga tidak meninggalkan
-- data parsial jika salah satunya ditolak oleh constraint atau RLS.
CREATE OR REPLACE FUNCTION public.create_rental_customer(
  p_organization_id uuid,
  p_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_customer_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Tidak terautentikasi.' USING ERRCODE = '28000';
  END IF;

  IF p_organization_id IS NULL OR NULLIF(BTRIM(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Organisasi dan nama customer wajib diisi.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.customers (organization_id, name, email, phone, address, customer_type)
  VALUES (p_organization_id, BTRIM(p_name), NULLIF(BTRIM(p_email), ''),
          NULLIF(BTRIM(p_phone), ''), NULLIF(BTRIM(p_address), ''), 'BOTH');

  INSERT INTO public.rental_customers (organization_id, name, email, phone, address)
  VALUES (p_organization_id, BTRIM(p_name), NULLIF(BTRIM(p_email), ''),
          NULLIF(BTRIM(p_phone), ''), NULLIF(BTRIM(p_address), ''))
  RETURNING id INTO v_customer_id;

  RETURN v_customer_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_rental_customer(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_rental_customer(uuid, text, text, text, text) TO authenticated;

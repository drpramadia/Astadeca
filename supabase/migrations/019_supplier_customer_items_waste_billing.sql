-- ============================================================
-- ERP ASTADECA — Migration 019
-- Fitur:
--   1) Supplier punya barang (produk) sendiri — many-to-many.
--   2) Customer punya kebutuhan barang — many-to-many.
--   3) Kontrak sewa cold storage: hapus estimasi berat & alokasi basket.
--      Estimasi berat hanya info kunjungan; barang diinput saat masuk/keluar.
--   4) Sistem waste: catat selisih masuk-keluar per batch + expiry,
--      dan picu notifikasi agar barang segera dikeluarkan sebelum expiry.
--   5) Periode tagih mingguan (default 7 hari) dikonfigurasi di master
--      organization_settings (rental.billing_period_days).
-- ============================================================

-- ============================================================
-- 1) SUPPLIER ITEMS (supplier <-> produk)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.supplier_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price_per_kg NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, product_id)
);

ALTER TABLE public.supplier_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supplier_items_org_access ON public.supplier_items;
CREATE POLICY supplier_items_org_access ON public.supplier_items FOR ALL TO authenticated
  USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()));

-- ============================================================
-- 2) CUSTOMER ITEMS (customer <-> produk yang dibutuhkan)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.customer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  target_price_per_kg NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, product_id)
);

ALTER TABLE public.customer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_items_org_access ON public.customer_items;
CREATE POLICY customer_items_org_access ON public.customer_items FOR ALL TO authenticated
  USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()));

-- ============================================================
-- 3) KONTRAK SEWA — hapus estimasi berat & alokasi basket
--    Data estimasi pada inquiry hanya informasi kunjungan;
--    berat riil dicatat di rental_receivings / rental_releases.
-- ============================================================
ALTER TABLE public.rental_contracts DROP COLUMN IF EXISTS total_estimated_kg;

-- Estimasi berat per-hari khusus titipan harian (spot) disimpan terpisah,
-- tidak dipakai untuk kontrak sewa reguler.
ALTER TABLE public.rental_contracts ADD COLUMN IF NOT EXISTS spot_kg NUMERIC NOT NULL DEFAULT 0;

DROP TABLE IF EXISTS public.rental_contract_allocations;

-- ============================================================
-- 4) WASTE — expiry per batch + catatan selisih
-- ============================================================
-- 4a) Expiry per batch (diisi saat barang masuk)
ALTER TABLE public.rental_receivings ADD COLUMN IF NOT EXISTS expiry_date DATE;
ALTER TABLE public.rental_receivings ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id);

-- 4b) Tabel waste
CREATE TABLE IF NOT EXISTS public.waste_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  contract_id UUID REFERENCES public.rental_contracts(id),
  product_id UUID REFERENCES public.products(id),
  batch_number TEXT,
  quantity_kg NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'SHRINKAGE'
    CHECK (reason IN ('SHRINKAGE', 'EXPIRY', 'DAMAGED', 'OTHER')),
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.waste_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS waste_records_org_access ON public.waste_records;
CREATE POLICY waste_records_org_access ON public.waste_records FOR ALL TO authenticated
  USING (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()))
  WITH CHECK (public.is_system_admin() OR organization_id IN (SELECT public.my_org_ids()));

-- 4c) Pengaturan ambang notifikasi expiry (default 3 hari)
INSERT INTO public.organization_settings (organization_id, key, value)
SELECT o.id, 'rental.expiry_alert_days', '3'
FROM public.organizations o
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5) FUNGSI: kirim notifikasi waste/expiry
--    Menghasilkan notifikasi ke DIRECTOR & ADMIN bila:
--      a) ada batch yang mendekati/melewati expiry, atau
--      b) ada selisih masuk-keluar (kandidat waste) yang belum dicatat.
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_waste_and_expiry(p_organization_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alert_days INTEGER := 3;
  v_org UUID;
  v_row RECORD;
  v_recipient RECORD;
  v_count INTEGER := 0;
BEGIN
  -- ambang hari (per organisasi bila tersedia)
  SELECT COALESCE(MAX(NULLIF(value, '')::integer), 3) INTO v_alert_days
  FROM organization_settings
  WHERE key = 'rental.expiry_alert_days'
    AND (p_organization_id IS NULL OR organization_id = p_organization_id);

  -- a) batch mendekati / melewati expiry dan masih ada stok
  FOR v_row IN
    SELECT rr.organization_id, rr.contract_id, rr.batch_number, rr.expiry_date,
           rr.received_kg,
           COALESCE((SELECT SUM(rel.released_kg) FROM rental_releases rel
                     WHERE rel.contract_id = rr.contract_id
                       AND COALESCE(rel.batch_number, '') = COALESCE(rr.batch_number, '')), 0) AS released
    FROM rental_receivings rr
    WHERE rr.expiry_date IS NOT NULL
      AND rr.expiry_date <= (current_date + (v_alert_days || ' days')::interval)
      AND (p_organization_id IS NULL OR rr.organization_id = p_organization_id)
  LOOP
    IF (v_row.received_kg - v_row.released) > 0 THEN
      FOR v_recipient IN
        SELECT om.user_id
        FROM organization_memberships om
        JOIN roles r ON r.id = om.role_id
        WHERE om.organization_id = v_row.organization_id
          AND om.is_active
          AND r.code IN ('DIRECTOR', 'ADMIN', 'SYSTEM_ADMIN')
      LOOP
        -- Lewati bila peringatan untuk batch ini sudah pernah dikirim
        -- (baik sudah dibaca maupun belum) agar tidak berulang tiap muat.
        IF EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.recipient_user_id = v_recipient.user_id
            AND n.reference_type = 'WASTE_EXPIRY'
            AND n.reference_id = v_row.contract_id
            AND n.title LIKE '%batch ' || COALESCE(v_row.batch_number, '-') || '%'
        ) THEN
          CONTINUE;
        END IF;

        PERFORM public.notify_user(
          v_row.organization_id,
          v_recipient.user_id,
          'Peringatan Expiry — batch ' || COALESCE(v_row.batch_number, '-'),
          'Batch ' || COALESCE(v_row.batch_number, '-') || ' (sisa ' ||
            ROUND(v_row.received_kg - v_row.released, 2) || ' kg) akan/sudah kedaluwarsa pada ' ||
            v_row.expiry_date || '. Segera keluarkan sebelum expiry.',
          'WASTE_EXPIRY',
          v_row.contract_id
        );
        v_count := v_count + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_waste_and_expiry(uuid) TO authenticated, service_role;

-- ============================================================
-- 6) FUNGSI: hitung selisih masuk-keluar (kandidat waste) untuk UI
-- ============================================================
CREATE OR REPLACE FUNCTION public.waste_candidates(p_organization_id uuid)
RETURNS TABLE(
  contract_id uuid, contract_number text, batch_number text,
  received_kg numeric, released_kg numeric, diff_kg numeric, expiry_date date
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.contract_number,
    rr.batch_number,
    SUM(rr.received_kg) AS received_kg,
    COALESCE((SELECT SUM(rel.released_kg) FROM rental_releases rel
              WHERE rel.contract_id = c.id
                AND COALESCE(rel.batch_number, '') = COALESCE(rr.batch_number, '')), 0) AS released_kg,
    SUM(rr.received_kg) - COALESCE((SELECT SUM(rel.released_kg) FROM rental_releases rel
              WHERE rel.contract_id = c.id
                AND COALESCE(rel.batch_number, '') = COALESCE(rr.batch_number, '')), 0) AS diff_kg,
    MAX(rr.expiry_date) AS expiry_date
  FROM rental_contracts c
  JOIN rental_receivings rr ON rr.contract_id = c.id
  WHERE c.organization_id = p_organization_id
  GROUP BY c.id, c.contract_number, rr.batch_number
  HAVING SUM(rr.received_kg)
       - COALESCE((SELECT SUM(rel.released_kg) FROM rental_releases rel
                   WHERE rel.contract_id = c.id
                     AND COALESCE(rel.batch_number, '') = COALESCE(rr.batch_number, '')), 0) > 0
  ORDER BY MAX(rr.expiry_date) NULLS LAST;
$function$;

GRANT EXECUTE ON FUNCTION public.waste_candidates(uuid) TO authenticated, service_role;

-- ============================================================
-- 7) Periode tagih default mingguan (7 hari) untuk organisasi baru.
--    Nilai dapat diubah oleh SYSTEM_ADMIN (drpramadia) di /settings/global.
-- ============================================================
INSERT INTO public.organization_settings (organization_id, key, value)
SELECT o.id, 'rental.billing_period_days', '7'
FROM public.organizations o
ON CONFLICT DO NOTHING;

-- Ubah default menjadi mingguan (7 hari) bila belum diatur / kosong.
-- Aturan periode ini dapat diubah oleh SYSTEM_ADMIN (drpramadia)
-- melalui halaman /settings/global (key rental.billing_period_days).
UPDATE public.organization_settings SET value = '7'
WHERE key = 'rental.billing_period_days' AND (value IS NULL OR value = '');

-- ============================================================
-- 8) TRIGGER: saat barang masuk dengan expiry, langsung beri tahu
--    DIRECTOR/ADMIN/SYSTEM_ADMIN agar dipantau sebelum kedaluwarsa.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_notify_receiving_expiry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_alert_days INTEGER := 3;
BEGIN
  IF NEW.expiry_date IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(MAX(NULLIF(value, '')::integer), 3) INTO v_alert_days
  FROM organization_settings
  WHERE key = 'rental.expiry_alert_days' AND organization_id = NEW.organization_id;

  -- Hanya beri tahu bila expiry sudah dekat (<= ambang hari)
  IF NEW.expiry_date > (current_date + (v_alert_days || ' days')::interval) THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT om.user_id
    FROM organization_memberships om
    JOIN roles ro ON ro.id = om.role_id
    WHERE om.organization_id = NEW.organization_id
      AND om.is_active
      AND ro.code IN ('DIRECTOR', 'ADMIN', 'SYSTEM_ADMIN')
  LOOP
    PERFORM public.notify_user(
      NEW.organization_id,
      r.user_id,
      'Barang masuk mendekati expiry — batch ' || COALESCE(NEW.batch_number, '-'),
      'Penerimaan ' || NEW.received_kg || ' kg batch ' || COALESCE(NEW.batch_number, '-') ||
        ' kedaluwarsa pada ' || NEW.expiry_date || '. Segera keluarkan sebelum expiry.',
      'WASTE_EXPIRY',
      NEW.contract_id
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notify_receiving_expiry ON public.rental_receivings;
CREATE TRIGGER notify_receiving_expiry
  AFTER INSERT ON public.rental_receivings
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_receiving_expiry();

-- ============================================================
-- 9) TRIGGER: saat barang keluar, bila menimbulkan selisih
--    (kandidat waste) beri notifikasi untuk segera dicatat.
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_notify_release_waste()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  v_received NUMERIC;
  v_released NUMERIC;
BEGIN
  SELECT COALESCE(SUM(received_kg), 0) INTO v_received
  FROM rental_receivings
  WHERE contract_id = NEW.contract_id
    AND COALESCE(batch_number, '') = COALESCE(NEW.batch_number, '');

  SELECT COALESCE(SUM(released_kg), 0) INTO v_released
  FROM rental_releases
  WHERE contract_id = NEW.contract_id
    AND COALESCE(batch_number, '') = COALESCE(NEW.batch_number, '');

  -- Selisih positif = ada sisa yang berpotensi waste
  IF (v_received - v_released) > 0 THEN
    FOR r IN
      SELECT om.user_id
      FROM organization_memberships om
      JOIN roles ro ON ro.id = om.role_id
      WHERE om.organization_id = NEW.organization_id
        AND om.is_active
        AND ro.code IN ('DIRECTOR', 'ADMIN', 'SYSTEM_ADMIN')
    LOOP
      -- Sekali per batch: lewati bila notifikasi potensi waste batch ini
      -- sudah pernah dibuat (baik terbaca maupun belum).
      IF EXISTS (
        SELECT 1 FROM notifications n
        WHERE n.recipient_user_id = r.user_id
          AND n.reference_type = 'WASTE_DIFF'
          AND n.reference_id = NEW.contract_id
          AND n.title LIKE '%batch ' || COALESCE(NEW.batch_number, '-') || '%'
      ) THEN
        CONTINUE;
      END IF;

      PERFORM public.notify_user(
        NEW.organization_id,
        r.user_id,
        'Potensi Waste — batch ' || COALESCE(NEW.batch_number, '-'),
        'Selisih masuk-keluar batch ' || COALESCE(NEW.batch_number, '-') || ' sebesar ' ||
          ROUND(v_received - v_released, 2) || ' kg. Catat sebagai waste bila barang susut/rusak.',
        'WASTE_DIFF',
        NEW.contract_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS notify_release_waste ON public.rental_releases;
CREATE TRIGGER notify_release_waste
  AFTER INSERT ON public.rental_releases
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_release_waste();

-- ============================================================
-- 10) BILLING: tagih per periode (default 7 hari / mingguan),
--     barang masuk diakumulasi per hari selama periode berjalan.
--     Periode dibaca dari organization_settings.rental.billing_period_days
--     (dapat diubah SYSTEM_ADMIN di /settings/global).
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_rental_billing(p_contract_id uuid)
RETURNS TABLE(out_contract_id uuid, out_invoice_number text, out_total_amount numeric, out_total_days integer, out_total_kg_day numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contract RECORD;
  v_day DATE;
  v_period INTEGER := 7;
  v_rate NUMERIC;
  v_kg NUMERIC;
  v_total NUMERIC := 0;
  v_total_kg_day NUMERIC := 0;
  v_billing_id UUID;
  v_invoice TEXT;
  v_charged_days INTEGER := 0;
  v_period_start DATE;
  v_period_end DATE;
BEGIN
  SELECT * INTO v_contract FROM rental_contracts WHERE id = p_contract_id;
  IF v_contract IS NULL THEN
    RAISE EXCEPTION 'Contract % not found', p_contract_id;
  END IF;

  -- Baca periode tagih (mingguan default) dari pengaturan organisasi
  SELECT COALESCE(MAX(NULLIF(value, '')::integer), 7) INTO v_period
  FROM organization_settings
  WHERE key = 'rental.billing_period_days'
    AND organization_id = v_contract.organization_id;
  IF v_period IS NULL OR v_period < 1 THEN v_period := 7; END IF;

  v_rate := v_contract.price_per_kg_per_day;

  -- Tentukan periode berjalan memakai grid tetap berjangkar di start_date:
  --   periode ke-n = [start_date + n*period, start_date + (n+1)*period - 1]
  -- Periode aktif adalah yang MEMUAT current_date. Ini:
  --   - mengakumulasi semua barang masuk/keluar dalam periode yang sama, dan
  --   - melompati periode kosong (kontrak idle) tanpa membuat invoice basi.
  v_period_start := v_contract.start_date
    + (floor((current_date - v_contract.start_date)::numeric / v_period)::int * v_period);
  v_period_end := v_period_start + (v_period - 1);

  -- Cari invoice untuk periode berjalan ini (bila ada dan masih terbuka).
  SELECT rb.id INTO v_billing_id
  FROM rental_billing rb
  WHERE rb.contract_id = p_contract_id
    AND rb.period_start = v_period_start
    AND rb.period_end = v_period_end
    AND rb.status NOT IN ('PAID', 'CANCELLED')
  LIMIT 1;

  -- Batasi agar tidak melewati akhir kontrak
  IF v_contract.end_date IS NOT NULL AND v_period_end > v_contract.end_date THEN
    v_period_end := v_contract.end_date;
  END IF;

  -- Akumulasi per hari selama periode berjalan
  FOR v_day IN
    SELECT d::date FROM generate_series(v_period_start, v_period_end, '1 day'::interval) AS d
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

    IF v_kg > 0 THEN
      v_total := v_total + (v_kg * v_rate);
      v_total_kg_day := v_total_kg_day + v_kg;
    END IF;
    v_charged_days := v_charged_days + 1;
  END LOOP;

  -- v_billing_id sudah diisi di atas bila periode berjalan punya invoice terbuka.
  -- Buat invoice baru hanya bila periode ini belum punya invoice.
  IF v_billing_id IS NULL THEN
    INSERT INTO rental_billing (
      organization_id, contract_id, invoice_number,
      period_start, period_end, total_amount, status
    ) VALUES (
      v_contract.organization_id, p_contract_id,
      public.generate_number('INV'),
      v_period_start, v_period_end,
      v_total, 'SENT'
    ) RETURNING id, invoice_number INTO v_billing_id, v_invoice;
  ELSE
    UPDATE rental_billing rb
    SET total_amount = v_total,
        period_start = v_period_start,
        period_end = v_period_end
    WHERE rb.id = v_billing_id;
    SELECT invoice_number INTO v_invoice FROM rental_billing WHERE id = v_billing_id;
  END IF;

  DELETE FROM rental_billing_lines rbl WHERE rbl.billing_id = v_billing_id;
  INSERT INTO rental_billing_lines (billing_id, description, quantity_kg, price_per_kg, subtotal)
  VALUES (
    v_billing_id,
    'Penyimpanan ' || v_charged_days || ' hari x ' || v_rate || '/kg/hari (periode ' ||
      v_period_start || ' s/d ' || v_period_end || ')',
    v_total_kg_day,
    v_rate,
    v_total
  );

  RETURN QUERY SELECT p_contract_id, v_invoice, v_total, v_charged_days, v_total_kg_day;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.calculate_rental_billing(uuid) TO authenticated, service_role;


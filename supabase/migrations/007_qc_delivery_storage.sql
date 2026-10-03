-- ============================================================
-- ERP ASTADECA — Migration 007
-- - Seed 2 cold storage units @ 3 ton
-- - QC inspection: barang masuk (IN) & barang keluar (OUT) + foto
-- - Delivery request -> approval -> surat jalan (delivery order)
-- - Storage bucket untuk foto barang
-- - Permission tambahan untuk warehouse (print / delivery)
-- ============================================================

-- ------------------------------------------------------------
-- 1) SEED: 2 COLD STORAGE (masing-masing kapasitas 3 ton)
-- ------------------------------------------------------------
INSERT INTO public.cold_storages (organization_id, name, code, capacity_kg, temperature_min_c, temperature_max_c, status) VALUES
  ('20000000-0000-0000-0000-000000000001', 'Cold Storage 1', 'CS-01', 3000, -20, -10, 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000001', 'Cold Storage 2', 'CS-02', 3000, -20, -10, 'ACTIVE')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 2) QC INSPECTIONS: tipe IN/OUT + foto + dukungan delivery order
-- ------------------------------------------------------------
ALTER TABLE public.qc_inspections
  ADD COLUMN IF NOT EXISTS inspection_type TEXT NOT NULL DEFAULT 'IN',
  ADD COLUMN IF NOT EXISTS delivery_order_id UUID REFERENCES public.delivery_orders(id),
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS inspector_name TEXT;

-- gr_id hanya wajib untuk inspeksi barang masuk
ALTER TABLE public.qc_inspections ALTER COLUMN gr_id DROP NOT NULL;

-- Constraint tipe inspeksi
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'qc_inspections_inspection_type_check'
  ) THEN
    ALTER TABLE public.qc_inspections
      ADD CONSTRAINT qc_inspections_inspection_type_check
      CHECK (inspection_type IN ('IN', 'OUT'));
  END IF;
END $$;

-- QC lines: dukung item bebas (barang keluar) + foto per item
ALTER TABLE public.qc_inspection_lines
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id),
  ADD COLUMN IF NOT EXISTS item_name TEXT,
  ADD COLUMN IF NOT EXISTS batch_number TEXT,
  ADD COLUMN IF NOT EXISTS quantity_kg NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

ALTER TABLE public.qc_inspection_lines ALTER COLUMN gr_line_id DROP NOT NULL;

-- ------------------------------------------------------------
-- 3) DELIVERY REQUESTS: data customer, tanggal, driver, kendaraan
-- ------------------------------------------------------------
ALTER TABLE public.delivery_requests
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id),
  ADD COLUMN IF NOT EXISTS so_id UUID REFERENCES public.sales_orders(id),
  ADD COLUMN IF NOT EXISTS delivery_date DATE,
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_number TEXT,
  ADD COLUMN IF NOT EXISTS destination TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id);

-- Nomor surat jalan pada delivery order (bila belum ada)
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS delivery_date DATE,
  ADD COLUMN IF NOT EXISTS destination TEXT,
  ADD COLUMN IF NOT EXISTS released_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- 4) PERMISSION TAMBAHAN
-- ------------------------------------------------------------
INSERT INTO public.permissions (id, code, name) VALUES
  ('10000000-0000-0000-0000-000000000028', 'delivery.view',  'View Delivery'),
  ('10000000-0000-0000-0000-000000000029', 'delivery.create', 'Create Delivery Request'),
  ('10000000-0000-0000-0000-000000000030', 'delivery.print', 'Print Surat Jalan'),
  ('10000000-0000-0000-0000-000000000031', 'qc.photo',       'Upload QC Photo')
ON CONFLICT (code) DO NOTHING;

-- DIRECTOR & ADMIN: semua permission baru
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('DIRECTOR', 'ADMIN')
  AND p.code IN ('delivery.view', 'delivery.create', 'delivery.print', 'qc.photo')
ON CONFLICT DO NOTHING;

-- WAREHOUSE: lihat & cetak surat jalan, upload foto QC
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000003', id FROM public.permissions
WHERE code IN ('delivery.view', 'delivery.print', 'qc.photo', 'documents.print')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 5) STORAGE BUCKET: foto barang (QC masuk/keluar)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'goods-photos',
  'goods-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: anggota organisasi boleh baca; user terautentikasi boleh upload
DROP POLICY IF EXISTS "goods_photos_read" ON storage.objects;
CREATE POLICY "goods_photos_read" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'goods-photos');

DROP POLICY IF EXISTS "goods_photos_insert" ON storage.objects;
CREATE POLICY "goods_photos_insert" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'goods-photos');

DROP POLICY IF EXISTS "goods_photos_update" ON storage.objects;
CREATE POLICY "goods_photos_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'goods-photos')
  WITH CHECK (bucket_id = 'goods-photos');

DROP POLICY IF EXISTS "goods_photos_delete" ON storage.objects;
CREATE POLICY "goods_photos_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'goods-photos');

-- ------------------------------------------------------------
-- 6) TRIGGER: notifikasi warehouse saat delivery request dibuat
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_delivery_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT om.user_id
    FROM public.organization_memberships om
    JOIN public.roles ro ON ro.id = om.role_id
    WHERE om.organization_id = NEW.organization_id
      AND om.is_active = true
      AND ro.code IN ('WAREHOUSE', 'SYSTEM_ADMIN')
  LOOP
    PERFORM public.notify_user(
      NEW.organization_id,
      r.user_id,
      'Permintaan Keluar Barang',
      'Admin meminta pengeluaran barang. Mohon siapkan barang untuk surat jalan.',
      'DELIVERY_REQUEST',
      NEW.id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_delivery_request ON public.delivery_requests;
CREATE TRIGGER notify_delivery_request
  AFTER INSERT ON public.delivery_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_delivery_request();

-- ------------------------------------------------------------
-- 7) TRIGGER: saat delivery order terbit, beri tahu warehouse
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notify_delivery_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.status IN ('PRINTED', 'RELEASED') AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    FOR r IN
      SELECT om.user_id
      FROM public.organization_memberships om
      JOIN public.roles ro ON ro.id = om.role_id
      WHERE om.organization_id = NEW.organization_id
        AND om.is_active = true
        AND ro.code IN ('WAREHOUSE', 'SYSTEM_ADMIN')
    LOOP
      PERFORM public.notify_user(
        NEW.organization_id,
        r.user_id,
        'Surat Jalan Terbit: ' || NEW.do_number,
        'Surat jalan ' || NEW.do_number || ' sudah dapat dicetak / diunduh.',
        'DELIVERY_ORDER',
        NEW.id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_delivery_order ON public.delivery_orders;
CREATE TRIGGER notify_delivery_order
  AFTER UPDATE ON public.delivery_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_delivery_order();

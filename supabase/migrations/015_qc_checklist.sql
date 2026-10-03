-- ============================================================
-- ERP ASTADECA — Migration 015
-- Checklist kualitas QC per-item: simpan hasil checklist + kategori barang
-- ============================================================

ALTER TABLE public.qc_inspection_lines
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_verdict TEXT;

-- auto_verdict: 'GOOD' | 'DAMAGED' | 'REJECTED' (hasil otomatis dari checklist)

// Runner migrasi 029 — dry-run (ROLLBACK) lalu apply, dengan verifikasi.
// Pakai: node scripts/apply-029.mjs            (dry-run saja)
//        node scripts/apply-029.mjs --apply    (commit)
import { readFileSync } from 'node:fs'
import { createClient, loadEnv } from './db-config.mjs'

loadEnv()

const sql = readFileSync(new URL('../supabase/migrations/029_audit_hardening.sql', import.meta.url), 'utf8')
const apply = process.argv.includes('--apply')

const client = createClient()
await client.connect()

let failed = false
try {
  await client.query('BEGIN')
  await client.query(sql)
  console.log('SQL dijalankan tanpa error.')

  const checks = [
    ['constraint inventory_quantity_nonneg', `SELECT 1 FROM pg_constraint WHERE conname='inventory_quantity_nonneg'`],
    ['constraint rental_days_nonneg', `SELECT 1 FROM pg_constraint WHERE conname='rental_days_nonneg'`],
    ['constraint payments_reference_type_check', `SELECT 1 FROM pg_constraint WHERE conname='payments_reference_type_check'`],
    ['index rental_billing_open_period_key', `SELECT 1 FROM pg_indexes WHERE indexname='rental_billing_open_period_key'`],
    ['index idx_notif_recipient', `SELECT 1 FROM pg_indexes WHERE indexname='idx_notif_recipient'`],
    ['policy notifications_recipient', `SELECT 1 FROM pg_policies WHERE tablename='notifications' AND policyname='notifications_recipient'`],
    ['policy activity_logs_insert', `SELECT 1 FROM pg_policies WHERE tablename='activity_logs' AND policyname='activity_logs_insert'`],
    ['fungsi ensure_row_updated', `SELECT 1 FROM pg_proc WHERE proname='ensure_row_updated'`],
    // Notifikasi orang lain harus tak terlihat bagi user biasa: dicek lewat test:auth, bukan di sini.
  ]
  for (const [label, q] of checks) {
    const r = await client.query(q)
    console.log(`${r.rowCount ? 'OK  ' : 'HILANG'} ${label}`)
    if (!r.rowCount) failed = true
  }

  // Sanity: stok negatif harus ditolak sekarang
  await client.query('SAVEPOINT s1')
  try {
    await client.query(`UPDATE public.inventory SET quantity_kg = -1 WHERE id = (SELECT id FROM public.inventory LIMIT 1)`)
    console.log('GAGAL: inventory negatif masih diterima')
    failed = true
  } catch {
    console.log('OK   inventory negatif ditolak')
  }
  await client.query('ROLLBACK TO SAVEPOINT s1')

  // Sanity: hari sewa negatif harus ditolak (baris sintetis; tabel bisa kosong)
  await client.query('SAVEPOINT s2')
  try {
    await client.query(`WITH org AS (SELECT id FROM public.organizations LIMIT 1),
      cust AS (
        INSERT INTO public.rental_customers (organization_id, name)
        SELECT id, 'TEST-CONSTRAINT-029' FROM org RETURNING id
      )
      INSERT INTO public.rental_contracts
        (organization_id, customer_id, contract_number, start_date, days_paid, days_used)
      SELECT org.id, cust.id, 'TEST-CONSTRAINT-029', current_date, 0, 5 FROM org, cust`)
    console.log('GAGAL: days_used > days_paid masih diterima')
    failed = true
  } catch (e) {
    console.log('OK   days_used > days_paid ditolak', e.code ? `(${e.code})` : '')
  }
  await client.query('ROLLBACK TO SAVEPOINT s2')

  if (apply && !failed) {
    await client.query('COMMIT')
    console.log('COMMIT — migrasi diterapkan.')
  } else {
    await client.query('ROLLBACK')
    console.log(failed ? 'ROLLBACK — ada pemeriksaan gagal, tidak diterapkan.' : 'ROLLBACK — dry-run sukses, tidak ada perubahan.')
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('ERROR migrasi:', e.message)
  process.exitCode = 1
} finally {
  await client.end()
}

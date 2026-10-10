// Runner migrasi 030 — dry-run (ROLLBACK) lalu apply, dengan verifikasi.
// Pakai: node scripts/apply-030.mjs            (dry-run saja)
//        node scripts/apply-030.mjs --apply    (commit)
import { readFileSync } from 'node:fs'
import { createClient, loadEnv } from './db-config.mjs'

loadEnv()

const sql = readFileSync(new URL('../supabase/migrations/030_stock_issue_rpc.sql', import.meta.url), 'utf8')
const apply = process.argv.includes('--apply')

const client = createClient()
await client.connect()

let failed = false
try {
  await client.query('BEGIN')
  await client.query(sql)
  console.log('SQL dijalankan tanpa error.')

  const checks = [
    ['fungsi issue_stock', `SELECT 1 FROM pg_proc WHERE proname='issue_stock'`],
    ['grant issue_stock ke authenticated', `SELECT 1 FROM information_schema.routine_privileges
       WHERE routine_name='issue_stock' AND grantee='authenticated'`],
  ]
  for (const [label, q] of checks) {
    const r = await client.query(q)
    console.log(`${r.rowCount ? 'OK  ' : 'HILANG'} ${label}`)
    if (!r.rowCount) failed = true
  }

  // Sanity: pengeluaran melebihi stok harus ditolak, stok tidak berubah.
  await client.query('SAVEPOINT s1')
  try {
    const inv = await client.query(
      `SELECT id, quantity_kg FROM public.inventory WHERE quantity_kg > 0 ORDER BY quantity_kg DESC LIMIT 1`)
    if (inv.rowCount) {
      const { id, quantity_kg } = inv.rows[0]
      await client.query(
        `SELECT public.issue_stock($1::uuid, $2::numeric, 'MANUAL', NULL, 'test-030', NULL)`,
        [id, Number(quantity_kg) + 1],
      )
      console.log('GAGAL: pengeluaran melebihi stok masih diterima')
      failed = true
    } else {
      console.log('SKIP  tidak ada baris stok untuk uji batas')
    }
  } catch (e) {
    console.log('OK   pengeluaran melebihi stok ditolak', e.code ? `(${e.code})` : '')
  }
  await client.query('ROLLBACK TO SAVEPOINT s1')

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

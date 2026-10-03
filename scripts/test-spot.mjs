/**
 * Uji flow spot upfront + carry-over hari. Semua di-rollback.
 */
import { connect } from './db-config.mjs'

const client = await connect()
const ORG = '20000000-0000-0000-0000-000000000001'
const results = []
function check(n, ok, d = '') { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' â€” ' + d : ''}`) }

try {
  await client.query('begin')
  const cust = (await client.query('select id from rental_customers where organization_id=$1 limit 1', [ORG])).rows[0]
  const cs = (await client.query('select id from cold_storages where organization_id=$1 limit 1', [ORG])).rows[0]
  const admin = (await client.query("select user_id from organization_memberships om join profiles p on p.id=om.user_id where p.username='gian' limit 1")).rows[0]?.user_id

  const num = (await client.query("select generate_number('SPOT') as n")).rows[0].n
  const c = (await client.query(
    `insert into rental_contracts (organization_id, customer_id, cold_storage_id, contract_number, start_date, price_per_kg_per_day, total_estimated_kg, status, is_spot, days_paid, days_used, created_by)
     values ($1,$2,$3,$4, current_date, 100, 1000, 'ACTIVE', true, 0, 0, $5) returning id`,
    [ORG, cust.id, cs.id, num, admin]
  )).rows[0]
  check('spot contract dibuat', !!c.id, num)

  // topup 30 hari
  const top = (await client.query('select * from rental_topup_days($1,$2,$3,$4)', [c.id, 30, 'awal', admin])).rows[0]
  check('topup 30 hari -> days_paid=30, saldo=30', top.out_days_paid === 30 && top.out_days_balance === 30, JSON.stringify(top))

  // pakai 10 hari (sewa 30, diambil hari ke-10)
  const use1 = (await client.query('select * from rental_use_days($1,$2,$3,$4)', [c.id, 10, 'pakai 10 hari', admin])).rows[0]
  check('pemakaian 10 hari -> saldo=20 (carry-over)', use1.out_days_used === 10 && use1.out_days_balance === 20, JSON.stringify(use1))

  // masuk lagi hari ke-12 -> pakai 12 hari, saldo 8
  const use2 = (await client.query('select * from rental_use_days($1,$2,$3,$4)', [c.id, 12, 'masuk lagi 12 hari', admin])).rows[0]
  check('pemakaian 12 hari lagi -> saldo=8', use2.out_days_balance === 8, JSON.stringify(use2))

  // ledger tercatat
  const ledger = (await client.query("select count(*)::int n from rental_day_ledger where contract_id=$1", [c.id])).rows[0]
  check('ledger hari tercatat (topup + 2 pemakaian = 3)', ledger.n === 3, `n=${ledger.n}`)

  // view saldo
  const bal = (await client.query('select days_balance from rental_day_balance where contract_id=$1', [c.id])).rows[0]
  check('view rental_day_balance benar', bal.days_balance === 8, `saldo=${bal.days_balance}`)

  // validasi: topup 0 harus gagal
  let threw = false
  try { await client.query('select rental_topup_days($1,$2)', [c.id, 0]) } catch { threw = true }
  check('topup 0 hari ditolak', threw)

  await client.query('rollback')
  console.log('\nROLLBACK — bersih.')
} catch (e) {
  await client.query('rollback').catch(() => {})
  console.error('ERROR:', e.message); process.exitCode = 1
} finally { await client.end().catch(() => {}) }

const failed = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) process.exitCode = 1

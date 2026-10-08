/**
 * Uji aturan baru sewa cold storage:
 *   - barang keluar TANPA gate "harus lunas" / approval (kapan saja).
 *   - billing mengikuti perjanjian kontrak (tarif per kg/hari) dengan
 *     minimum 1 ton: barang < 1.000 kg tetap ditagih 1.000 kg.
 * Rollback di akhir.
 */
import { connect } from './db-config.mjs'

const client = await connect()
const ORG = '20000000-0000-0000-0000-000000000001'
const results = []
function check(n, ok, d = '') { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`) }

try {
  await client.query('begin')
  // Self-contained: buat penyewa sendiri (DB bisa saja kosong dari data contoh).
  const cust = (await client.query(
    `insert into rental_customers (organization_id, name, phone) values ($1, 'Penyewa Gate (UJI)', '0800-0001') returning id`,
    [ORG]
  )).rows[0]
  const cs = (await client.query('select id from cold_storages where organization_id=$1 limit 1', [ORG])).rows[0]
  const wh = (await client.query("select user_id from organization_memberships om join profiles p on p.id=om.user_id where p.username='siswoko' limit 1")).rows[0]?.user_id

  // kontrak non-spot, minimum 1 ton aktif, barang masuk 600 kg (< 1 ton)
  const num = (await client.query("select generate_number('KONTRAK') as n")).rows[0].n
  const c = (await client.query(
    `insert into rental_contracts (organization_id, customer_id, cold_storage_id, contract_number, start_date, end_date, price_per_kg_per_day, status, is_spot, minimum_1_ton)
     values ($1,$2,$3,$4, current_date, current_date+29, 100, 'ACTIVE', false, true) returning id`,
    [ORG, cust.id, cs.id, num]
  )).rows[0]

  await client.query(`insert into rental_receivings (organization_id, contract_id, received_kg, received_at, received_by) values ($1,$2,600, now(), $3)`, [ORG, c.id, wh])

  // Invoice diterbitkan MANUAL (trigger auto-billing dihapus di migrasi 025)
  await client.query('select calculate_rental_billing($1)', [c.id])
  const bill = (await client.query('select id, status, total_amount from rental_billing where contract_id=$1', [c.id])).rows[0]
  check('billing terbit mengikuti perjanjian kontrak (manual)', !!bill, bill ? `status=${bill.status}` : '')
  // 600 kg aktual, minimum 1 ton -> 1 hari berisi stok x 1000 kg x Rp100 = Rp100.000 untuk hari berjalan
  check('minimum 1 ton diterapkan (kg ditagih = 1.000)', Number(bill?.total_amount) >= 100000, `total=${bill?.total_amount}`)

  // release TANPA gate: tidak perlu lunas / approval
  let okRelease = false
  let relErr = ''
  try {
    await client.query(`insert into rental_releases (organization_id, contract_id, released_kg, released_at, released_by) values ($1,$2,100, now(), $3)`, [ORG, c.id, wh])
    okRelease = true
  } catch (e) { relErr = e.message }
  check('release DIIZINKAN walau tagihan belum lunas (tanpa gate/approval)', okRelease, relErr.slice(0, 60))

  // tidak ada trigger approval pengeluaran yang tersisa
  const trg = (await client.query("select tgname from pg_trigger where tgname in ('guard_release_payment','notify_release_approval') and not tgisinternal")).rows
  check('trigger gate & approval pengeluaran sudah dihapus', trg.length === 0, trg.map((r) => r.tgname).join(','))

  await client.query('rollback')
  console.log('\nROLLBACK — bersih.')
} catch (e) {
  await client.query('rollback').catch(() => {})
  console.error('ERROR:', e.message); process.exitCode = 1
} finally { await client.end().catch(() => {}) }

const failed = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) process.exitCode = 1

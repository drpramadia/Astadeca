/**
 * Uji gate "harus lunas" sebelum barang keluar + approval. Rollback.
 */
import { connect } from './db-config.mjs'

const client = await connect()
const ORG = '20000000-0000-0000-0000-000000000001'
const results = []
function check(n, ok, d = '') { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`) }

try {
  await client.query('begin')
  const cust = (await client.query('select id from rental_customers where organization_id=$1 limit 1', [ORG])).rows[0]
  const cs = (await client.query('select id from cold_storages where organization_id=$1 limit 1', [ORG])).rows[0]
  const wh = (await client.query("select user_id from organization_memberships om join profiles p on p.id=om.user_id where p.username='siswoko' limit 1")).rows[0]?.user_id

  // kontrak non-spot + receiving -> billing SENT
  const num = (await client.query("select generate_number('KONTRAK') as n")).rows[0].n
  const c = (await client.query(
    `insert into rental_contracts (organization_id, customer_id, cold_storage_id, contract_number, start_date, end_date, price_per_kg_per_day, status, is_spot)
     values ($1,$2,$3,$4, current_date, current_date+29, 100, 'ACTIVE', false) returning id`,
    [ORG, cust.id, cs.id, num]
  )).rows[0]
  await client.query(`insert into rental_receivings (organization_id, contract_id, received_kg, received_at, received_by) values ($1,$2,1000, now(), $3)`, [ORG, c.id, wh])

  const status = (await client.query('select status from rental_billing where contract_id=$1', [c.id])).rows[0].status
  check('billing terbit dengan status SENT (belum lunas)', status === 'SENT', status)

  // coba release -> harus DITOLAK
  let blocked = false
  let msg = ''
  await client.query('savepoint sp1')
  try {
    await client.query(`insert into rental_releases (organization_id, contract_id, released_kg, released_at, released_by) values ($1,$2,100, now(), $3)`, [ORG, c.id, wh])
  } catch (e) { blocked = true; msg = e.message }
  await client.query('rollback to savepoint sp1')
  check('release DIBLOKIR saat tagihan belum lunas', blocked, msg.slice(0, 60))

  // bayar penuh -> billing PAID
  const bill = (await client.query('select id, total_amount from rental_billing where contract_id=$1', [c.id])).rows[0]
  await client.query(`insert into payments (organization_id, reference_type, reference_id, amount, payment_method) values ($1,'RENTAL_BILLING',$2,$3,'BANK_TRANSFER')`, [ORG, bill.id, bill.total_amount])
  const paidStatus = (await client.query('select status from rental_billing where id=$1', [bill.id])).rows[0].status
  check('setelah bayar penuh -> billing PAID', paidStatus === 'PAID', paidStatus)

  // release setelah lunas -> BOLEH
  let okRelease = false
  try {
    await client.query(`insert into rental_releases (organization_id, contract_id, released_kg, released_at, released_by) values ($1,$2,100, now(), $3)`, [ORG, c.id, wh])
    okRelease = true
  } catch (e) { okRelease = false }
  check('release DIIZINKAN setelah lunas', okRelease)

  // spot boleh keluar tanpa cek (sudah bayar di depan)
  const spotNum = (await client.query("select generate_number('SPOT') as n")).rows[0].n
  const spot = (await client.query(
    `insert into rental_contracts (organization_id, customer_id, cold_storage_id, contract_number, start_date, price_per_kg_per_day, spot_kg, status, is_spot, days_paid) values ($1,$2,$3,$4, current_date, 100, 100, 'ACTIVE', true, 5) returning id`,
    [ORG, cust.id, cs.id, spotNum]
  )).rows[0]
  let spotRelease = false
  try {
    await client.query(`insert into rental_releases (organization_id, contract_id, released_kg, released_at, released_by) values ($1,$2,50, now(), $3)`, [ORG, spot.id, wh])
    spotRelease = true
  } catch { spotRelease = false }
  check('spot boleh keluar tanpa gate lunas (bayar depan)', spotRelease)

  await client.query('rollback')
  console.log('\nROLLBACK — bersih.')
} catch (e) {
  await client.query('rollback').catch(() => {})
  console.error('ERROR:', e.message); process.exitCode = 1
} finally { await client.end().catch(() => {}) }

const failed = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) process.exitCode = 1

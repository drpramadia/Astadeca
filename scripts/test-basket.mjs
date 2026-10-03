/**
 * Uji flow basket: assign inventory ke basket, verifikasi join, lalu rollback.
 */
import { connect } from './db-config.mjs'

const client = await connect()
const ORG = '20000000-0000-0000-0000-000000000001'

const results = []
function check(n, ok, d = '') { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`) }

try {
  await client.query('begin')

  const basket = (await client.query('select b.id, b.code, z.cold_storage_id from cold_storage_baskets b join cold_storage_zones z on z.id=b.zone_id limit 1')).rows[0]
  check('basket tersedia (seed)', !!basket, basket?.code)

  const product = (await client.query('select id from products where organization_id=$1 limit 1', [ORG])).rows[0]
  // buat inventory row
  const inv = (await client.query(
    `insert into inventory (organization_id, product_id, batch_number, quantity_kg, status, basket_id, cold_storage_id)
     values ($1,$2,'BKT-TEST',250,'AVAILABLE',$3,$4) returning id`,
    [ORG, product.id, basket.id, basket.cold_storage_id]
  )).rows[0]

  const joined = (await client.query(
    `select i.id, b.code as basket_code, cs.name as storage
     from inventory i
     join cold_storage_baskets b on b.id=i.basket_id
     join cold_storages cs on cs.id=i.cold_storage_id
     where i.id=$1`, [inv.id]
  )).rows[0]
  check('inventory terhubung ke basket + cold storage', joined?.basket_code === basket.code, JSON.stringify(joined))

  const cnt = (await client.query('select count(*)::int n from inventory where basket_id=$1', [basket.id])).rows[0]
  check('query per-basket berfungsi', cnt.n >= 1, `n=${cnt.n}`)

  await client.query('rollback')
  console.log('\nROLLBACK — bersih.')
} catch (e) {
  await client.query('rollback').catch(() => {})
  console.error('ERROR:', e.message); process.exitCode = 1
} finally { await client.end().catch(() => {}) }

const failed = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) process.exitCode = 1

/**
 * Seed data demo yang lengkap dan idempoten (aman dijalankan berulang).
 * Menggunakan prefix 'E2E-SEED' agar mudah dihapus nanti.
 * Jalankan: node scripts/seed-demo.mjs
 */
import { connect } from './db-config.mjs'

const client = await connect()

const ORG = '20000000-0000-0000-0000-000000000001'

async function q(sql, params) { return (await client.query(sql, params)).rows }

try {
  await client.query('begin')

  const users = {}
  for (const [k, u] of Object.entries({ admin: 'gian', director: 'ratih.cinthia', warehouse: 'siswoko', sysadmin: 'drpramadia' })) {
    users[k] = (await q('select user_id from organization_memberships om join profiles p on p.id=om.user_id where p.username=$1 limit 1', [u]))[0]?.user_id
  }

  // Kategori (idempoten)
  for (const c of [
    { code: 'SAYUR', name: 'Sayuran Beku' },
    { code: 'DAGING', name: 'Daging' },
    { code: 'SEAFOOD', name: 'Seafood' },
    { code: 'BUAH', name: 'Buah Beku' },
  ]) {
    await q(
      `insert into product_categories (organization_id, name, code)
       select $1,$2,$3 where not exists (select 1 from product_categories where organization_id=$1 and code=$3)`,
      [ORG, c.name, c.code]
    )
  }

  // Produk demo
  const products = [
    { name: 'Ikan Kembung Beku', sku: 'IKB-01' },
    { name: 'Daging Sapi Beku', sku: 'DSB-01' },
    { name: 'Udang Vaname Beku', sku: 'UVB-01' },
    { name: 'Kacang Polong Beku', sku: 'KPB-01' },
  ]
  for (const p of products) {
    await q(
      `insert into products (organization_id, name, sku, is_active)
       select $1,$2,$3,true where not exists (select 1 from products where organization_id=$1 and sku=$3)`,
      [ORG, p.name, p.sku]
    )
  }

  // Supplier & customer demo
  await q(`insert into suppliers (organization_id, name) select $1,'PT Sumber Beku Nusantara' where not exists (select 1 from suppliers where organization_id=$1 and name='PT Sumber Beku Nusantara')`, [ORG])
  await q(`insert into customers (organization_id, name) select $1,'CV Pasar Segar Abadi' where not exists (select 1 from customers where organization_id=$1 and name='CV Pasar Segar Abadi')`, [ORG])
  await q(`insert into rental_customers (organization_id, name, phone) select $1,'UD Berkah Laut','0812-0000-1111' where not exists (select 1 from rental_customers where organization_id=$1 and name='UD Berkah Laut')`, [ORG])

  // Zona + basket untuk tiap cold storage (QR/lokasi)
  const css = await q('select id, code from cold_storages where organization_id=$1 order by code', [ORG])
  for (const cs of css) {
    for (const zone of ['A', 'B']) {
      await q(
        `insert into cold_storage_zones (cold_storage_id, name, code)
         select $1,$2,$3 where not exists (select 1 from cold_storage_zones where cold_storage_id=$1 and code=$3)`,
        [cs.id, `Zona ${zone}`, `${cs.code}-${zone}`]
      )
    }
    const zones = await q('select id, code from cold_storage_zones where cold_storage_id=$1', [cs.id])
    for (const z of zones) {
      for (const n of [1, 2, 3]) {
        await q(
          `insert into cold_storage_baskets (zone_id, code, capacity_kg, status)
           select $1,$2,500,'AVAILABLE' where not exists (select 1 from cold_storage_baskets where zone_id=$1 and code=$2)`,
          [z.id, `${z.code}-B${String(n).padStart(2, '0')}`]
        )
      }
    }
  }

  // Rate global 100/kg/hari
  await q(
    `insert into rental_rates (organization_id, cold_storage_id, price_per_kg_per_day, minimum_days, minimum_kg, status)
     select $1, null, 100, 1, 0, 'ACTIVE'
     where not exists (select 1 from rental_rates where organization_id=$1 and cold_storage_id is null and status='ACTIVE')`,
    [ORG]
  )

  // Setting global rental
  const settings = [
    ['rental.tariff_per_kg_per_day', '100'],
    ['rental.billing_period_days', '14'],
    ['rental.spot_mode', 'UPFRONT'],
    ['rental.minimum_days', '1'],
    ['rental.excess_policy', 'CARRY_OVER'],
    ['rental.require_paid_before_release', 'true'],
    ['rental.require_approval_release', 'true'],
  ]
  for (const [key, value] of settings) {
    await q(
      `insert into organization_settings (organization_id, key, value)
       select $1,$2,$3 where not exists (select 1 from organization_settings where organization_id=$1 and key=$2)`,
      [ORG, key, value]
    )
  }

  // Kontrak demo + receiving supaya billing hidup (jika belum ada kontrak di luar seed)
  const rc = (await q(`select id from rental_customers where organization_id=$1 and name='UD Berkah Laut'`, [ORG]))[0]
  const hasContract = (await q(`select count(*)::int n from rental_contracts where organization_id=$1`, [ORG]))[0].n
  if (hasContract === 0 && css[0] && rc) {
    const num = (await q("select generate_number('KONTRAK') as n"))[0].n
    const c = (await q(
      `insert into rental_contracts (organization_id, customer_id, cold_storage_id, contract_number, start_date, end_date, price_per_kg_per_day, status, created_by)
       values ($1,$2,$3,$4, current_date, current_date + 89, 100, 'ACTIVE', $5) returning id`,
      [ORG, rc.id, css[0].id, num, users.admin]
    ))[0]
    await q(
      `insert into rental_receivings (organization_id, contract_id, received_kg, received_at, received_by, batch_number)
       values ($1,$2,2000, now(), $3, 'RCV-SEED-01')`,
      [ORG, c.id, users.warehouse]
    )
  }

  await client.query('commit')
  console.log('SEED OK (idempoten).')
} catch (e) {
  await client.query('rollback').catch(() => {})
  console.error('SEED ERROR:', e.message)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}

/**
 * Uji sinkronisasi penjualan/pembelian -> laporan keuangan.
 * Memverifikasi:
 *   - total_amount PO/SO = jumlah subtotal lines.
 *   - dokumen APPROVED menghasilkan transaksi (DEBIT utk PO, CREDIT utk SO).
 *   - dokumen dibuat langsung APPROVED (Director) tetap tercatat (lines menyusul).
 *   - ubah lines -> total & transaksi ikut menyesuaikan (tanpa dobel).
 * Rollback di akhir.
 */
import { connect } from './db-config.mjs'

const client = await connect()
const ORG = '20000000-0000-0000-0000-000000000001'
const results = []
function check(n, ok, d = '') { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`) }

try {
  await client.query('begin')
  const prod = (await client.query('select id from products where organization_id=$1 limit 1', [ORG])).rows[0]
  const sup = (await client.query('select id from suppliers where organization_id=$1 limit 1', [ORG])).rows[0]
  const cust = (await client.query('select id from customers where organization_id=$1 limit 1', [ORG])).rows[0]
  const admin = (await client.query("select user_id from organization_memberships om join profiles p on p.id=om.user_id where p.username='gian' limit 1")).rows[0]?.user_id
  const num = async (p) => (await client.query('select generate_number($1) as n', [p])).rows[0].n

  // ---- PO dibuat langsung APPROVED (seperti Director), lines menyusul ----
  const po = (await client.query(
    `insert into purchase_orders (organization_id, supplier_id, po_number, status, created_by)
     values ($1,$2,$3,'APPROVED',$4) returning id`,
    [ORG, sup.id, await num('PO'), admin]
  )).rows[0]
  await client.query(
    `insert into purchase_order_lines (po_id, product_id, quantity_kg, price_per_kg, subtotal)
     values ($1,$2,100,15000,1500000)`, [po.id, prod.id]
  )
  const poRow = (await client.query('select total_amount from purchase_orders where id=$1', [po.id])).rows[0]
  check('PO APPROVED: total_amount = subtotal lines (1.500.000)', Number(poRow.total_amount) === 1500000, `total=${poRow.total_amount}`)
  const poTx = (await client.query("select amount, type from transactions where reference_type='PURCHASE_ORDER' and reference_id=$1", [po.id])).rows
  check('PO APPROVED: transaksi DEBIT tercipta (1.500.000)', poTx.length === 1 && poTx[0].type === 'DEBIT' && Number(poTx[0].amount) === 1500000, JSON.stringify(poTx))

  // tambah line -> total & transaksi ikut naik, tidak dobel
  await client.query(
    `insert into purchase_order_lines (po_id, product_id, quantity_kg, price_per_kg, subtotal)
     values ($1,$2,50,20000,1000000)`, [po.id, prod.id]
  )
  const poRow2 = (await client.query('select total_amount from purchase_orders where id=$1', [po.id])).rows[0]
  const poTx2 = (await client.query("select amount from transactions where reference_type='PURCHASE_ORDER' and reference_id=$1", [po.id])).rows
  check('PO tambah line: total jadi 2.500.000', Number(poRow2.total_amount) === 2500000, `total=${poRow2.total_amount}`)
  check('PO tambah line: transaksi tetap 1 (tidak dobel), amount 2.500.000', poTx2.length === 1 && Number(poTx2[0].amount) === 2500000, JSON.stringify(poTx2))

  // ---- SO PENDING -> APPROVED (alur approval normal) ----
  const so = (await client.query(
    `insert into sales_orders (organization_id, customer_id, so_number, status, created_by)
     values ($1,$2,$3,'PENDING_APPROVAL',$4) returning id`,
    [ORG, cust.id, await num('SO'), admin]
  )).rows[0]
  await client.query(
    `insert into sales_order_lines (so_id, product_id, quantity_kg, price_per_kg, subtotal)
     values ($1,$2,200,10000,2000000)`, [so.id, prod.id]
  )
  const soPend = Number((await client.query("select count(*) n from transactions where reference_type='SALES_ORDER' and reference_id=$1", [so.id])).rows[0].n)
  check('SO PENDING: belum ada transaksi', soPend === 0, `n=${soPend}`)

  await client.query("update sales_orders set status='APPROVED' where id=$1", [so.id])
  const soTx = (await client.query("select amount, type from transactions where reference_type='SALES_ORDER' and reference_id=$1", [so.id])).rows
  check('SO APPROVED: transaksi CREDIT tercipta (2.000.000)', soTx.length === 1 && soTx[0].type === 'CREDIT' && Number(soTx[0].amount) === 2000000, JSON.stringify(soTx))
  const soRow = (await client.query('select total_amount from sales_orders where id=$1', [so.id])).rows[0]
  check('SO APPROVED: total_amount = 2.000.000', Number(soRow.total_amount) === 2000000, `total=${soRow.total_amount}`)

  // ---- Sinkronisasi laporan: total transaksi == total dokumen APPROVED (dalam transaksi uji ini) ----
  const sumTx = (await client.query("select type, coalesce(sum(amount),0) s from transactions where reference_id in ($1,$2) group by type", [po.id, so.id])).rows
  const debit = Number(sumTx.find((r) => r.type === 'DEBIT')?.s || 0)
  const credit = Number(sumTx.find((r) => r.type === 'CREDIT')?.s || 0)
  check('Laporan: DEBIT = total PO (2.500.000)', debit === 2500000, `debit=${debit}`)
  check('Laporan: CREDIT = total SO (2.000.000)', credit === 2000000, `credit=${credit}`)

  await client.query('rollback')
  console.log('\nROLLBACK — bersih.')
} catch (e) {
  await client.query('rollback').catch(() => {})
  console.error('ERROR:', e.message); process.exitCode = 1
} finally { await client.end().catch(() => {}) }

const failed = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) { console.log('GAGAL:'); failed.forEach((f) => console.log('  - ' + f.n)); process.exitCode = 1 }

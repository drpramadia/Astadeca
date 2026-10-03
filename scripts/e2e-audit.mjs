/**
 * E2E audit: mengisi data di SEMUA flow (sewa, masuk, beli, jual, finance)
 * lalu memverifikasi integrasi antar tabel. Jalankan: node scripts/e2e-audit.mjs
 *
 * Semua operasi dibungkus satu transaksi dan DI-ROLLBACK di akhir,
 * jadi data produksi tidak berubah. Output = laporan PASS/FAIL.
 */
import { connect } from './db-config.mjs'

const client = await connect()

const ORG = '20000000-0000-0000-0000-000000000001'
const USER = '00000000-0000-0000-0000-000000000001'
const ADMIN = '00000000-0000-0000-0000-000000000002'
const DIRECTOR = '00000000-0000-0000-0000-000000000004'
const WAREHOUSE = '00000000-0000-0000-0000-000000000003'

const results = []
function check(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`)
}

try {
  await client.query('begin')

  // ---------- Resolve real IDs ----------
  const ids = {}
  for (const [k, uname] of Object.entries({
    admin: 'gian', director: 'ratih.cinthia', warehouse: 'siswoko', sysadmin: 'drpramadia',
  })) {
    const r = await client.query('select user_id from organization_memberships om join profiles p on p.id=om.user_id where p.username=$1 and om.organization_id=$2 limit 1', [uname, ORG])
    ids[k] = r.rows[0]?.user_id
  }
  check('resolve user ids (4 roles)', ids.admin && ids.director && ids.warehouse && ids.sysadmin)

  const cs = await client.query('select id, name, capacity_kg from cold_storages where organization_id=$1 order by code', [ORG])
  check('cold storage ada 2 unit @3000kg', cs.rows.length === 2 && Number(cs.rows[0].capacity_kg) === 3000)

  const prod = await client.query('select id, name from products where organization_id=$1 limit 1', [ORG])
  const productId = prod.rows[0]?.id
  check('produk master ada', !!productId)

  // ---------- FLOW BELI: PO -> approval -> GR -> stok -> finance ----------
  const poNum = (await client.query("select generate_number('PO') as n")).rows[0].n
  const po = await client.query(
    `insert into purchase_orders (organization_id, supplier_id, po_number, status, created_by)
     values ($1, (select id from suppliers where organization_id=$1 limit 1), $2, 'PENDING_APPROVAL', $3) returning id`,
    [ORG, poNum, ids.admin]
  )
  const poId = po.rows[0].id
  await client.query(
    `insert into purchase_order_lines (po_id, product_id, quantity_kg, price_per_kg, subtotal)
     values ($1, $2, 500, 12000, 6000000)`,
    [poId, productId]
  )
  const appr = await client.query(
    `insert into approval_requests (organization_id, request_type, reference_id, status, requested_by)
     values ($1, 'PURCHASE_ORDER', $2, 'PENDING', $3) returning id`,
    [ORG, poId, ids.admin]
  )
  await client.query('update purchase_orders set approval_request_id=$1 where id=$2', [appr.rows[0].id, poId])

  // Director approves PO -> trigger finance (DEBIT)
  await client.query("update purchase_orders set status='APPROVED' where id=$1", [poId])
  const poTx = await client.query("select count(*)::int n from transactions where reference_type='PURCHASE_ORDER' and reference_id=$1", [poId])
  check('PO APPROVED -> transaksi DEBIT otomatis', poTx.rows[0].n === 1, `n=${poTx.rows[0].n}`)

  // GR dari PO -> stok masuk
  const grNum = (await client.query("select generate_number('GR') as n")).rows[0].n
  const gr = await client.query(
    `insert into goods_receipts (organization_id, po_id, gr_number, received_by) values ($1,$2,$3,$4) returning id`,
    [ORG, poId, grNum, ids.warehouse]
  )
  await client.query(
    `insert into goods_receipt_lines (gr_id, product_id, batch_number, quantity_kg, quantity_received, condition)
     values ($1,$2,'B-E2E-1',500,500,'GOOD')`,
    [gr.rows[0].id, productId]
  )
  const inv = await client.query('select quantity_kg from inventory where organization_id=$1 and product_id=$2', [ORG, productId])
  check('GR -> inventory bertambah 500kg', inv.rows.length === 1 && Number(inv.rows[0].quantity_kg) === 500, `qty=${inv.rows[0]?.quantity_kg}`)
  const mvIn = await client.query("select count(*)::int n from inventory_movements where reference_type='GOODS_RECEIPT' and reference_id=$1", [gr.rows[0].id])
  check('GR -> inventory_movement IN tercatat', mvIn.rows[0].n === 1)

  // ---------- FLOW JUAL: SO -> approval -> stok keluar + finance ----------
  const cust = await client.query('select id from customers where organization_id=$1 limit 1', [ORG])
  const soNum = (await client.query("select generate_number('SO') as n")).rows[0].n
  const so = await client.query(
    `insert into sales_orders (organization_id, customer_id, so_number, status, created_by)
     values ($1,$2,$3,'DRAFT',$4) returning id`,
    [ORG, cust.rows[0].id, soNum, ids.admin]
  )
  await client.query(
    `insert into sales_order_lines (so_id, product_id, quantity_kg, price_per_kg, subtotal)
     values ($1,$2,200,20000,4000000)`,
    [so.rows[0].id, productId]
  )
  const soAppr = await client.query(
    `insert into approval_requests (organization_id, request_type, reference_id, status, requested_by)
     values ($1,'SALES_ORDER',$2,'PENDING',$3) returning id`,
    [ORG, so.rows[0].id, ids.admin]
  )
  await client.query('update sales_orders set approval_request_id=$1 where id=$2', [soAppr.rows[0].id, so.rows[0].id])
  await client.query("update sales_orders set status='APPROVED' where id=$1", [so.rows[0].id])

  const soTx = await client.query("select count(*)::int n from transactions where reference_type='SALES_ORDER' and reference_id=$1", [so.rows[0].id])
  check('SO APPROVED -> transaksi CREDIT otomatis', soTx.rows[0].n === 1)
  const inv2 = await client.query('select quantity_kg from inventory where organization_id=$1 and product_id=$2', [ORG, productId])
  check('SO APPROVED -> stok berkurang jadi 300kg', Number(inv2.rows[0]?.quantity_kg) === 300, `qty=${inv2.rows[0]?.quantity_kg}`)
  const mvOut = await client.query("select count(*)::int n from inventory_movements where reference_type='SALES_ORDER' and reference_id=$1", [so.rows[0].id])
  check('SO -> inventory_movement OUT tercatat', mvOut.rows[0].n === 1)

  // ---------- FLOW SEWA: kontrak -> receiving -> billing (14 hari, hari berisi) ----------
  const rc = await client.query('select id from rental_customers where organization_id=$1 limit 1', [ORG])
  const contractNum = (await client.query("select generate_number('KONTRAK') as n")).rows[0].n
  const contract = await client.query(
    `insert into rental_contracts (organization_id, customer_id, cold_storage_id, contract_number, start_date, end_date, price_per_kg_per_day, total_estimated_kg, status)
     values ($1,$2,$3,$4, current_date, current_date + 29, 100, 1000, 'ACTIVE') returning id`,
    [ORG, rc.rows[0].id, cs.rows[0].id, contractNum]
  )
  const contractId = contract.rows[0].id
  // masuk 1000 kg hari ini
  await client.query(
    `insert into rental_receivings (organization_id, contract_id, received_kg, received_at, received_by, batch_number)
     values ($1,$2,1000, now(), $3, 'RCV-E2E')`,
    [ORG, contractId, ids.warehouse]
  )
  const rb = await client.query('select invoice_number, total_amount, period_start, period_end, status from rental_billing where contract_id=$1', [contractId])
  const periodDays = Math.round((new Date(rb.rows[0].period_end) - new Date(rb.rows[0].period_start)) / 86400000) + 1
  check('Receiving -> rental_billing terbit', rb.rows.length === 1, rb.rows[0]?.invoice_number)
  check('Billing periode = 14 hari (rolling)', periodDays === 14, `days=${periodDays}`)
  check('Billing total = 1000kg x 100 x 14hari = 1.400.000', Number(rb.rows[0].total_amount) === 1400000, `total=${rb.rows[0].total_amount}`)
  check('Billing status awal SENT', rb.rows[0].status === 'SENT', rb.rows[0].status)

  // ---------- FINANCE: payment menutup invoice ----------
  const billingId = (await client.query('select id from rental_billing where contract_id=$1', [contractId])).rows[0].id
  await client.query(
    `insert into payments (organization_id, reference_type, reference_id, amount, payment_method, created_by)
     values ($1,'RENTAL_BILLING',$2, 1400000, 'BANK_TRANSFER', $3)`,
    [ORG, billingId, ids.admin]
  )
  const rbAfter = await client.query('select status from rental_billing where id=$1', [billingId])
  check('Payment penuh -> invoice PAID', rbAfter.rows[0].status === 'PAID', rbAfter.rows[0].status)

  // Partial payment test
  const contract2 = await client.query(
    `insert into rental_contracts (organization_id, customer_id, cold_storage_id, contract_number, start_date, end_date, price_per_kg_per_day, total_estimated_kg, status)
     values ($1,$2,$3,$4, current_date, current_date + 13, 100, 500, 'ACTIVE') returning id`,
    [ORG, rc.rows[0].id, cs.rows[1].id, (await client.query("select generate_number('KONTRAK') as n")).rows[0].n]
  )
  await client.query(
    `insert into rental_receivings (organization_id, contract_id, received_kg, received_at, received_by)
     values ($1,$2,500, now(), $3)`,
    [ORG, contract2.rows[0].id, ids.warehouse]
  )
  const rb2 = await client.query('select id, total_amount from rental_billing where contract_id=$1', [contract2.rows[0].id])
  await client.query(
    `insert into payments (organization_id, reference_type, reference_id, amount, payment_method, created_by)
     values ($1,'RENTAL_BILLING',$2, 100000, 'CASH', $3)`,
    [ORG, rb2.rows[0].id, ids.admin]
  )
  const rb2After = await client.query('select status from rental_billing where id=$1', [rb2.rows[0].id])
  check('Payment sebagian -> tetap SENT', rb2After.rows[0].status === 'SENT', rb2After.rows[0].status)

  // ---------- FLOW SURAT JALAN (delivery) ----------
  const dreq = await client.query(
    `insert into delivery_requests (organization_id, requested_by_user_id, customer_id, status, destination, created_by)
     values ($1,$2,$3,'PENDING','Gudang E2E',$2) returning id`,
    [ORG, ids.admin, cust.rows[0].id]
  )
  await client.query(
    `insert into delivery_request_lines (request_id, item_name, quantity_kg) values ($1,'Udang E2E',100)`,
    [dreq.rows[0].id]
  )
  await client.query("update delivery_requests set status='APPROVED' where id=$1", [dreq.rows[0].id])
  const doRow = await client.query('select id, do_number from delivery_orders where delivery_request_id=$1', [dreq.rows[0].id])
  check('Delivery request APPROVED -> surat jalan terbit', doRow.rows.length === 1, doRow.rows[0]?.do_number)
  const doLines = await client.query('select count(*)::int n from delivery_order_lines where do_id=$1', [doRow.rows[0].id])
  check('Surat jalan punya rincian', doLines.rows[0].n === 1)
  const docRow = await client.query("select count(*)::int n from documents where reference_type='DELIVERY_ORDER' and reference_id=$1", [doRow.rows[0].id])
  check('Surat jalan -> documents tercatat', docRow.rows[0].n >= 1)

  // ---------- NOTIFIKASI ----------
  const notifDelivery = await client.query("select count(*)::int n from notifications where reference_type='DELIVERY_ORDER' and reference_id=$1", [doRow.rows[0].id])
  // 2 warehouse + 1 sysadmin = 3, dan tidak boleh dobel (<=3)
  check('Notif surat jalan tidak dobel (<=3)', notifDelivery.rows[0].n <= 3 && notifDelivery.rows[0].n >= 1, `n=${notifDelivery.rows[0].n}`)
  const notifApproval = await client.query("select count(*)::int n from notifications where reference_type='APPROVAL'")
  check('Notif approval dibuat', notifApproval.rows[0].n >= 1, `n=${notifApproval.rows[0].n}`)

  // ---------- QC ----------
  const qc = await client.query(
    `insert into qc_inspections (organization_id, inspection_type, gr_id, inspector_user_id, inspector_name, status, inspected_at)
     values ($1,'IN',$2,$3,'Siswoko','PASSED', now()) returning id`,
    [ORG, gr.rows[0].id, ids.warehouse]
  )
  await client.query(
    `insert into qc_inspection_lines (inspection_id, item_name, quantity_kg, condition) values ($1,'Barang E2E',500,'GOOD')`,
    [qc.rows[0].id]
  )
  const qcLines = await client.query('select count(*)::int n from qc_inspection_lines where inspection_id=$1', [qc.rows[0].id])
  check('QC inspection + checklist tersimpan', qcLines.rows[0].n === 1)

  await client.query('rollback')
  console.log('\nROLLBACK — tidak ada data yang tersimpan.\n')
} catch (e) {
  await client.query('rollback').catch(() => {})
  console.error('E2E ERROR:', e.message)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== RINGKASAN: ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) {
  console.log('GAGAL:')
  failed.forEach((f) => console.log('  - ' + f.name + (f.detail ? ` (${f.detail})` : '')))
  process.exitCode = 1
}

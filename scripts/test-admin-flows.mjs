/**
 * Uji FLOW lengkap sebagai role ADMIN lewat Supabase REST (Auth API + JWT),
 * meniru setiap tombol/modal di UI. Data uji dibersihkan di akhir.
 *
 * Jalankan: node scripts/test-admin-flows.mjs
 * Butuh env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, TEST_PW_GIAN, SUPABASE_SERVICE_ROLE_KEY
 */
import fs from 'node:fs'

const raw = fs.readFileSync('.env.local', 'utf8')
const env = (k) => { const m = raw.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, 'm')); return m ? m[1].trim() : process.env[k] }
const URL = env('NEXT_PUBLIC_SUPABASE_URL')
const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const SVC = env('SUPABASE_SERVICE_ROLE_KEY')
const ORG = '20000000-0000-0000-0000-000000000001'

const results = []
function check(n, ok, d = '') { results.push({ n, ok: !!ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`) }

let TOKEN = ''
let TOKEN_DIR = ''
const authH = () => ({ apikey: ANON, Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

async function login() {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'adm.astadeca@gmail.com', password: env('TEST_PW_GIAN') }),
  })
  const j = await r.json()
  TOKEN = j.access_token
  return !!TOKEN
}
async function rpc(fn, args) {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: authH(), body: JSON.stringify(args) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
async function ins(table, rows) {
  const r = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: authH(), body: JSON.stringify(rows) })
  return { status: r.status, body: await r.json().catch(() => null) }
}
async function sel(table, q) {
  const r = await fetch(`${URL}/rest/v1/${table}?${q}`, { headers: authH() })
  return { status: r.status, body: await r.json().catch(() => null) }
}
async function patch(table, q, rows) {
  const r = await fetch(`${URL}/rest/v1/${table}?${q}`, { method: 'PATCH', headers: authH(), body: JSON.stringify(rows) })
  return { status: r.status, body: await r.json().catch(() => null) }
}

const cleanup = { rental_contracts: [], purchase_orders: [], sales_orders: [], delivery_requests: [] }

try {
  check('login sebagai ADMIN (gian)', await login())

  // Login DIRECTOR untuk uji halaman Approval
  {
    const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ratih.cinthia@gmail.com', password: env('TEST_PW_RATIH') }),
    })
    TOKEN_DIR = (await r.json()).access_token || ''
  }

  // Referensi
  const cust = (await sel('rental_customers', `select=id&organization_id=eq.${ORG}&limit=1`)).body?.[0]
  const cs = (await sel('cold_storages', `select=id&organization_id=eq.${ORG}&limit=1`)).body?.[0]
  const product = (await sel('products', `select=id&organization_id=eq.${ORG}&limit=1`)).body?.[0]
  const supplier = (await sel('suppliers', `select=id&organization_id=eq.${ORG}&limit=1`)).body?.[0]
  const customer = (await sel('customers', `select=id&organization_id=eq.${ORG}&limit=1`)).body?.[0]
  check('referensi tersedia (penyewa, cold storage, produk, supplier, customer)', cust && cs && product && supplier && customer)

  // ---- Modal 1: generate_number (dipakai kontrak baru & spot) ----
  const gen = await rpc('generate_number', { p_prefix: 'KONTRAK' })
  check('RPC generate_number (modal kontrak baru) berhasil', gen.status === 200 && typeof gen.body === 'string', `${gen.status} ${gen.body}`)

  // ---- Modal 2: Kontrak Baru ----
  const kNum = (await rpc('generate_number', { p_prefix: 'KONTRAK' })).body
  const kIns = await ins('rental_contracts', [{
    organization_id: ORG, customer_id: cust.id, cold_storage_id: cs.id, contract_number: kNum,
    start_date: new Date().toISOString().slice(0, 10), end_date: new Date(Date.now() + 29 * 864e5).toISOString().slice(0, 10),
    price_per_kg_per_day: 100, status: 'PENDING_APPROVAL',
  }])
  check('Kontrak Baru tersimpan (dengan nomor)', kIns.status === 201 && kIns.body?.[0]?.contract_number === kNum, `${kIns.status} ${kIns.body?.[0]?.contract_number || JSON.stringify(kIns.body)}`)
  if (kIns.body?.[0]?.id) cleanup.rental_contracts.push(kIns.body[0].id)

  // ---- Modal 3: Titipan Harian (Spot) ----
  const sNum = (await rpc('generate_number', { p_prefix: 'SPOT' })).body
  const sIns = await ins('rental_contracts', [{
    organization_id: ORG, customer_id: cust.id, cold_storage_id: cs.id, contract_number: sNum,
    start_date: new Date().toISOString().slice(0, 10), price_per_kg_per_day: 100, spot_kg: 500,
    status: 'ACTIVE', is_spot: true, days_paid: 0, days_used: 0,
  }])
  check('Titipan Harian (spot) tersimpan', sIns.status === 201 && !!sIns.body?.[0]?.id, `${sIns.status} ${sIns.body?.[0]?.contract_number || JSON.stringify(sIns.body)}`)
  const spotId = sIns.body?.[0]?.id
  if (spotId) cleanup.rental_contracts.push(spotId)

  if (spotId) {
    const top = await rpc('rental_topup_days', { p_contract_id: spotId, p_days: 3, p_note: 'test' })
    const row = Array.isArray(top.body) ? top.body[0] : top.body
    check('tombol Perpanjang / top-up hari berhasil', top.status === 200 && row?.out_days_paid === 3, JSON.stringify(row))
  }

  // ---- Modal 4: Purchase Order Baru ----
  const poNum = (await rpc('generate_number', { p_prefix: 'PO' })).body
  const poIns = await ins('purchase_orders', [{ organization_id: ORG, supplier_id: supplier.id, po_number: poNum, status: 'DRAFT' }])
  check('Purchase Order Baru tersimpan', poIns.status === 201 && !!poIns.body?.[0]?.id, `${poIns.status}`)
  const poId = poIns.body?.[0]?.id
  if (poId) {
    cleanup.purchase_orders.push(poId)
    const polLine = await ins('purchase_order_lines', [{ po_id: poId, product_id: product.id, quantity_kg: 100, price_per_kg: 10000, subtotal: 1000000 }])
    check('PO line tersimpan', polLine.status === 201, `${polLine.status}`)
  }

  // ---- Modal 5: Sales Order Baru ----
  const soNum = (await rpc('generate_number', { p_prefix: 'SO' })).body
  const soIns = await ins('sales_orders', [{ organization_id: ORG, customer_id: customer.id, so_number: soNum, status: 'DRAFT' }])
  check('Sales Order Baru tersimpan', soIns.status === 201 && !!soIns.body?.[0]?.id, `${soIns.status}`)
  const soId = soIns.body?.[0]?.id
  if (soId) cleanup.sales_orders.push(soId)

  // ---- Modal 6: Surat Jalan (permintaan keluar) ----
  const drIns = await ins('delivery_requests', [{
    organization_id: ORG, requested_by_user_id: (await sel('profiles', 'select=id&limit=1')).body?.[0]?.id,
    customer_id: customer.id, status: 'PENDING', destination: 'Test UI', driver_name: 'Budi', vehicle_number: 'B 1 XYZ',
  }])
  check('Permintaan Surat Jalan tersimpan', drIns.status === 201 && !!drIns.body?.[0]?.id, `${drIns.status}`)
  const drId = drIns.body?.[0]?.id
  if (drId) {
    cleanup.delivery_requests.push(drId)
    const drl = await ins('delivery_request_lines', [{ request_id: drId, item_name: 'Ikan Uji', quantity_kg: 50 }])
    check('Rincian surat jalan tersimpan', drl.status === 201, `${drl.status}`)
  }

  // ---- Modal 7: Payment (pilih invoice) ----
  const inv = (await sel('rental_billing', `select=id,total_amount&organization_id=eq.${ORG}&limit=1`)).body?.[0]
  if (inv) {
    const pay = await ins('payments', [{ organization_id: ORG, reference_type: 'RENTAL_BILLING', reference_id: inv.id, amount: 1000, payment_method: 'CASH' }])
    check('Pembayaran tersimpan (modal payment)', pay.status === 201, `${pay.status}`)
    if (pay.body?.[0]?.id) await fetch(`${URL}/rest/v1/payments?id=eq.${pay.body[0].id}`, { method: 'DELETE', headers: svcH })
  } else {
    console.log('SKIP  payment (tidak ada invoice)')
  }

  // ---- Modal 8: Basket Baru ----
  const zone = (await sel('cold_storage_zones', 'select=id&limit=1')).body?.[0]
  if (zone) {
    const b = await ins('cold_storage_baskets', [{ zone_id: zone.id, code: `UITEST-${Date.now()}`, capacity_kg: 500, status: 'AVAILABLE' }])
    check('Basket Baru tersimpan', b.status === 201, `${b.status}`)
    if (b.body?.[0]?.id) await fetch(`${URL}/rest/v1/cold_storage_baskets?id=eq.${b.body[0].id}`, { method: 'DELETE', headers: svcH })
  }

  // ---- Pengaturan Global (SYSTEM_ADMIN-only; ADMIN harus DITOLAK saat menulis) ----
  const setIns = await ins('organization_settings', [{ organization_id: ORG, key: 'ui.test.tmp', value: 'x' }])
  check('ADMIN tidak bisa menulis pengaturan global (RLS)', setIns.status === 401 || setIns.status === 403, `status=${setIns.status}`)

  // ---- Surat jalan terbit saat disetujui ----
  if (drId) {
    await patch('delivery_requests', `id=eq.${drId}`, { status: 'APPROVED' })
    const doRow = (await sel('delivery_orders', `select=id,do_number&delivery_request_id=eq.${drId}`)).body?.[0]
    check('approve surat jalan -> DO terbit otomatis', !!doRow, doRow?.do_number)
    if (doRow?.id) await fetch(`${URL}/rest/v1/delivery_orders?id=eq.${doRow.id}`, { method: 'DELETE', headers: svcH })
  }

  // ---- Halaman Approval (DIRECTOR): query yang sama persis dengan UI ----
  if (TOKEN_DIR) {
    const apr = await fetch(`${URL}/rest/v1/approval_requests?select=*,profiles!approval_requests_requested_by_fkey(full_name)&organization_id=eq.${ORG}&order=created_at.desc&limit=100`, { headers: { apikey: ANON, Authorization: `Bearer ${TOKEN_DIR}` } })
    const aprBody = await apr.json()
    check('halaman Approval: query director berhasil (tak error)', apr.status === 200 && Array.isArray(aprBody), `status=${apr.status}`)
  } else {
    console.log('SKIP  approval query (login director gagal)')
  }
} catch (e) {
  console.error('ERROR:', e.message); process.exitCode = 1
} finally {
  // Bersihkan data uji (tanpa mengganggu data lain)
  for (const id of cleanup.delivery_requests) await fetch(`${URL}/rest/v1/delivery_requests?id=eq.${id}`, { method: 'DELETE', headers: svcH })
  for (const id of cleanup.sales_orders) await fetch(`${URL}/rest/v1/sales_orders?id=eq.${id}`, { method: 'DELETE', headers: svcH })
  for (const id of cleanup.purchase_orders) await fetch(`${URL}/rest/v1/purchase_orders?id=eq.${id}`, { method: 'DELETE', headers: svcH })
  for (const id of cleanup.rental_contracts) await fetch(`${URL}/rest/v1/rental_contracts?id=eq.${id}`, { method: 'DELETE', headers: svcH })
  console.log('\nData uji dibersihkan.')
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) { console.log('GAGAL:'); failed.forEach((f) => console.log('  - ' + f.n + (f.d ? ` (${f.d})` : ''))); process.exitCode = 1 }

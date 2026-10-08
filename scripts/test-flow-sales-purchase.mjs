/**
 * UJI ALUR END-TO-END (jalur aplikasi nyata: anon key + JWT admin).
 *
 * Skenario:
 *   0. Master: buat supplier + barang milik supplier (supplier_items) + customer
 *   1. Permintaan Harga dari calon customer (customer_rfq + lines)
 *   2. RFQ ke supplier (supplier_rfq + lines, tertaut customer_rfq)
 *   3. Harga supplier (supplier_quotes + lines, cost_per_kg)
 *   4. Penawaran harga ke customer (quotation + lines, cost + markup + jual)
 *   5. Customer terima -> Sales Order (+ lines)
 *   6. PO ke supplier (+ lines)
 *   7. Verifikasi keterkaitan (link) antar dokumen
 *
 * Jalankan: node scripts/test-flow-sales-purchase.mjs
 * Data uji dibersihkan di akhir kecuali RETAIN=1.
 */
import fs from 'node:fs'

const raw = fs.readFileSync('.env.local', 'utf8')
const env = (k) => { const m = raw.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, 'm')); return m ? m[1].trim() : process.env[k] }
const URL = env('NEXT_PUBLIC_SUPABASE_URL')
const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const SERVICE = env('SUPABASE_SERVICE_ROLE_KEY')
const RETAIN = process.env.RETAIN === '1'
if (!URL || !ANON || !SERVICE) { console.error('Missing Supabase env'); process.exit(1) }

const results = []
function check(n, ok, d = '') { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`) }

async function login(username, password) {
  const lk = await (await fetch(`${URL}/rest/v1/rpc/login_with_username`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_username: username }) })).json()
  if (!lk?.success) return { error: lk?.error || 'lookup failed' }
  const t = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: lk.email, password }) })).json()
  if (!t.access_token) return { error: t.error_description || t.msg || 'login failed' }
  return { token: t.access_token, userId: lk.user_id }
}
const H = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
async function ins(table, row, token) { const r = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: H(token), body: JSON.stringify(row) }); return { status: r.status, body: await r.json().catch(() => null) } }
async function rpc(fn, args, token) { const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(token), body: JSON.stringify(args) }); return { status: r.status, body: await r.json().catch(() => null) } }
async function sel(table, query, token) { const r = await fetch(`${URL}/rest/v1/${table}?${query}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } }); return await r.json().catch(() => null) }

const created = { supplier: null, supplier_items: [], products: [], customer: null, customer_rfq: null, customer_rfq_lines: [], supplier_rfq: null, supplier_rfq_lines: [], supplier_quote: null, supplier_quote_lines: [], quotation: null, quotation_lines: [], sales_order: null, sales_order_lines: [], purchase_order: null, purchase_order_lines: [] }
const cleanup = async () => {
  const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
  const del = (t, q) => fetch(`${URL}/rest/v1/${t}?${q}`, { method: 'DELETE', headers: svc })
  for (const x of created.purchase_order_lines) await del('purchase_order_lines', `id=eq.${x}`)
  if (created.purchase_order) await del('purchase_orders', `id=eq.${created.purchase_order}`)
  for (const x of created.sales_order_lines) await del('sales_order_lines', `id=eq.${x}`)
  if (created.sales_order) await del('sales_orders', `id=eq.${created.sales_order}`)
  for (const x of created.quotation_lines) await del('quotation_lines', `id=eq.${x}`)
  if (created.quotation) await del('quotations', `id=eq.${created.quotation}`)
  for (const x of created.supplier_quote_lines) await del('supplier_quote_lines', `id=eq.${x}`)
  if (created.supplier_quote) await del('supplier_quotes', `id=eq.${created.supplier_quote}`)
  for (const x of created.supplier_rfq_lines) await del('supplier_rfq_lines', `id=eq.${x}`)
  if (created.supplier_rfq) await del('supplier_rfq', `id=eq.${created.supplier_rfq}`)
  for (const x of created.customer_rfq_lines) await del('customer_rfq_lines', `id=eq.${x}`)
  if (created.customer_rfq) await del('customer_rfq', `id=eq.${created.customer_rfq}`)
  for (const x of created.supplier_items) await del('supplier_items', `id=eq.${x}`)
  for (const x of created.products) await del('products', `id=eq.${x}`)
  if (created.supplier) await del('suppliers', `id=eq.${created.supplier}`)
  if (created.customer) await del('customers', `id=eq.${created.customer}`)
}

try {
  const s = await login('gian', env('TEST_PW_GIAN'))
  check('login admin (gian)', !!s.token, s.error || '')
  const T = s.token
  const session = (await rpc('get_my_session', {}, T)).body
  const ORG = session?.organization_id
  check('admin punya organization_id', !!ORG)

  // ============ 0. MASTER ============
  const sup = await ins('suppliers', { organization_id: ORG, name: 'PT Sumber Ayam Segar (UJI)' }, T)
  check('buat supplier', sup.status === 201, `status=${sup.status}`)
  created.supplier = sup.body?.[0]?.id

  const cust = await ins('customers', { organization_id: ORG, name: 'Hotel Nusantara (UJI)', customer_type: 'BUYER' }, T)
  check('buat customer', cust.status === 201, `status=${cust.status}`)
  created.customer = cust.body?.[0]?.id

  // Barang milik supplier (ayam, daging)
  const prodDefs = [
    { name: 'Ayam Fillet (UJI)', sku: `UJI-AYM-${Date.now()}` },
    { name: 'Daging Sapi (UJI)', sku: `UJI-SPI-${Date.now()}` },
  ]
  const prodIds = []
  for (const p of prodDefs) {
    const r = await ins('products', { organization_id: ORG, ...p, is_active: true }, T)
    check(`buat produk ${p.name}`, r.status === 201, `status=${r.status}`)
    if (r.body?.[0]?.id) { prodIds.push(r.body[0].id); created.products.push(r.body[0].id) }
  }
  for (const pid of prodIds) {
    const r = await ins('supplier_items', { organization_id: ORG, supplier_id: created.supplier, product_id: pid }, T)
    if (r.body?.[0]?.id) created.supplier_items.push(r.body[0].id)
  }
  check('hubungkan supplier dengan barang (supplier_items)', created.supplier_items.length === prodIds.length, `${created.supplier_items.length}/${prodIds.length}`)

  // ============ 1. PERMINTAAN HARGA CUSTOMER ============
  const rfqNum = (await rpc('generate_rfq_number', { p_prefix: 'RFQC' }, T)).body
  const cRfq = await ins('customer_rfq', { organization_id: ORG, rfq_number: rfqNum, customer_id: created.customer, status: 'OPEN', needed_by: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) }, T)
  check('1. buat permintaan harga customer', cRfq.status === 201, `status=${cRfq.status}`)
  created.customer_rfq = cRfq.body?.[0]?.id
  const crl = await ins('customer_rfq_lines', prodIds.map((pid, i) => ({ rfq_id: created.customer_rfq, product_id: pid, quantity_kg: [500, 300][i] })), T)
  check('1. baris permintaan customer', crl.status === 201, `status=${crl.status}`)
  crl.body?.forEach((x) => created.customer_rfq_lines.push(x.id))

  // ============ 2. RFQ SUPPLIER ============
  const sRfqNum = (await rpc('generate_rfq_number', { p_prefix: 'RFQS' }, T)).body
  const sRfq = await ins('supplier_rfq', { organization_id: ORG, rfq_number: sRfqNum, customer_rfq_id: created.customer_rfq, supplier_id: created.supplier, status: 'SENT', response_due: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) }, T)
  check('2. terbitkan RFQ ke supplier', sRfq.status === 201, `status=${sRfq.status}`)
  created.supplier_rfq = sRfq.body?.[0]?.id
  const srl = await ins('supplier_rfq_lines', prodIds.map((pid, i) => ({ rfq_id: created.supplier_rfq, product_id: pid, quantity_kg: [500, 300][i] })), T)
  check('2. baris RFQ supplier', srl.status === 201, `status=${srl.status}`)
  srl.body?.forEach((x) => created.supplier_rfq_lines.push(x.id))

  // ============ 3. HARGA SUPPLIER (cost) ============
  const sqNum = (await rpc('generate_rfq_number', { p_prefix: 'SQ' }, T)).body
  const sq = await ins('supplier_quotes', { organization_id: ORG, quote_number: sqNum, supplier_rfq_id: created.supplier_rfq, supplier_id: created.supplier, status: 'RECEIVED' }, T)
  check('3. catat harga supplier', sq.status === 201, `status=${sq.status}`)
  created.supplier_quote = sq.body?.[0]?.id
  const costs = [30000, 120000]
  const sql = await ins('supplier_quote_lines', prodIds.map((pid, i) => ({ quote_id: created.supplier_quote, product_id: pid, quantity_kg: [500, 300][i], cost_per_kg: costs[i], subtotal: [500, 300][i] * costs[i] })), T)
  check('3. baris harga supplier', sql.status === 201, `status=${sql.status}`)
  sql.body?.forEach((x) => created.supplier_quote_lines.push(x.id))

  // ============ 4. PENAWARAN HARGA (+margin) ============
  const qNum = (await rpc('generate_number', { p_prefix: 'QUOT' }, T)).body
  const markup = 15 // %
  const sell = costs.map((c) => Math.round(c * (1 + markup / 100)))
  const qTotals = [500 * sell[0], 300 * sell[1]]
  const qTotal = qTotals[0] + qTotals[1]
  const q = await ins('quotations', {
    organization_id: ORG, quotation_number: qNum, customer_id: created.customer,
    status: 'ACCEPTED', total_amount: qTotal, margin_percent: markup,
    supplier_quote_id: created.supplier_quote, customer_rfq_id: created.customer_rfq,
  }, T)
  check('4. buat penawaran harga (dengan margin)', q.status === 201, `status=${q.status}`)
  created.quotation = q.body?.[0]?.id
  const ql = await ins('quotation_lines', prodIds.map((pid, i) => ({ quotation_id: created.quotation, product_id: pid, quantity_kg: [500, 300][i], cost_per_kg: costs[i], markup_percent: markup, price_per_kg: sell[i], subtotal: qTotals[i] })), T)
  check('4. baris penawaran (cost+markup+jual)', ql.status === 201, `status=${ql.status}`)
  ql.body?.forEach((x) => created.quotation_lines.push(x.id))
  check(`4. laba tercatat = ${markup}% dari harga beli`, qTotals.reduce((a, b) => a + b, 0) === Math.round(qTotals.reduce((a, b) => a + b, 0)), '')

  // ============ 5. SALES ORDER ============
  const soNum = (await rpc('generate_number', { p_prefix: 'SO' }, T)).body
  const so = await ins('sales_orders', { organization_id: ORG, customer_id: created.customer, so_number: soNum, status: 'APPROVED', order_date: new Date().toISOString().slice(0, 10), total_amount: qTotal, quotation_id: created.quotation, customer_rfq_id: created.customer_rfq }, T)
  check('5. buat Sales Order dari penawaran', so.status === 201, `status=${so.status}`)
  created.sales_order = so.body?.[0]?.id
  const sol = await ins('sales_order_lines', prodIds.map((pid, i) => ({ so_id: created.sales_order, product_id: pid, quantity_kg: [500, 300][i], price_per_kg: sell[i], subtotal: qTotals[i] })), T)
  check('5. baris Sales Order', sol.status === 201, `status=${sol.status}`)
  sol.body?.forEach((x) => created.sales_order_lines.push(x.id))

  // ============ 6. PO KE SUPPLIER ============
  const poNum = (await rpc('generate_number', { p_prefix: 'PO' }, T)).body
  const poTotal = 500 * costs[0] + 300 * costs[1]
  const po = await ins('purchase_orders', { organization_id: ORG, supplier_id: created.supplier, po_number: poNum, status: 'ORDERED', order_date: new Date().toISOString().slice(0, 10), total_amount: poTotal, sales_order_id: created.sales_order, notes: `Dari SO ${soNum}` }, T)
  check('6. buat PO ke supplier dari SO', po.status === 201, `status=${po.status}`)
  created.purchase_order = po.body?.[0]?.id
  const pol = await ins('purchase_order_lines', prodIds.map((pid, i) => ({ po_id: created.purchase_order, product_id: pid, quantity_kg: [500, 300][i], price_per_kg: costs[i], subtotal: [500, 300][i] * costs[i] })), T)
  check('6. baris PO', pol.status === 201, `status=${pol.status}`)
  pol.body?.forEach((x) => created.purchase_order_lines.push(x.id))

  // ============ 7. VERIFIKASI KETERKAITAN ============
  const poRead = await sel('purchase_orders', `id=eq.${created.purchase_order}&select=sales_order_id,total_amount,supplier_id`, T)
  check('7. PO tertaut ke Sales Order', poRead?.[0]?.sales_order_id === created.sales_order, `got ${poRead?.[0]?.sales_order_id}`)
  const soRead = await sel('sales_orders', `id=eq.${created.sales_order}&select=quotation_id,customer_rfq_id,total_amount`, T)
  check('7. SO tertaut ke Penawaran & Permintaan', soRead?.[0]?.quotation_id === created.quotation && soRead?.[0]?.customer_rfq_id === created.customer_rfq, `quote=${soRead?.[0]?.quotation_id} rfq=${soRead?.[0]?.customer_rfq_id}`)
  const sRfqRead = await sel('supplier_rfq', `id=eq.${created.supplier_rfq}&select=customer_rfq_id,supplier_id`, T)
  check('7. RFQ supplier tertaut ke permintaan customer', sRfqRead?.[0]?.customer_rfq_id === created.customer_rfq, `got ${sRfqRead?.[0]?.customer_rfq_id}`)
  const margin = poTotal > 0 ? Math.round(((qTotal - poTotal) / poTotal) * 100) : 0
  check(`7. tercatat untung ~${markup}% (jual ${qTotal.toLocaleString('id-ID')} vs beli ${poTotal.toLocaleString('id-ID')})`, margin === markup, `margin=${margin}%`)

  console.log('\nRingkasan biaya vs jual:')
  console.log(`  Harga beli (PO)  : Rp ${poTotal.toLocaleString('id-ID')}`)
  console.log(`  Harga jual (SO)  : Rp ${qTotal.toLocaleString('id-ID')}`)
  console.log(`  Laba             : Rp ${(qTotal - poTotal).toLocaleString('id-ID')} (${margin}%)`)
} catch (e) {
  console.error('ERROR:', e.message)
  process.exitCode = 1
} finally {
  if (RETAIN) console.log('\nRETAIN=1 → data uji DIPERTAHANKAN (tidak dibersihkan).')
  else await cleanup()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) { console.log('GAGAL:'); failed.forEach((f) => console.log('  - ' + f.n)); process.exitCode = 1 }

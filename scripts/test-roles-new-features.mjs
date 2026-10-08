/**
 * Audit role untuk fitur baru (migration 019):
 *   - supplier_items / customer_items (master mapping)
 *   - waste_records + RPC notify_waste_and_expiry / waste_candidates
 *   - approval_requests memakai kolom `comment` (bukan `notes`)
 *   - rental_contracts: total_estimated_kg dihapus, spot_kg ada
 *
 * Menguji jalur aplikasi sebenarnya: anon key + JWT tiap role.
 * Data uji dibuat dengan service role lalu dibersihkan di akhir.
 *
 * Jalankan: node scripts/test-roles-new-features.mjs
 */
import fs from 'node:fs'

const raw = fs.readFileSync('.env.local', 'utf8')
function envVal(key) {
  const m = raw.match(new RegExp(`^${key}\\s*=\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : process.env[key]
}

const URL = envVal('NEXT_PUBLIC_SUPABASE_URL')
const ANON = envVal('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const SERVICE = envVal('SUPABASE_SERVICE_ROLE_KEY')
if (!URL || !ANON || !SERVICE) { console.error('Missing Supabase env'); process.exit(1) }

const PASSWORDS = {
  drpramadia: envVal('TEST_PW_DRPRAMADIA'),
  'ratih.cinthia': envVal('TEST_PW_RATIH'),
  gian: envVal('TEST_PW_GIAN'),
  siswoko: envVal('TEST_PW_SISWOKO'),
}

const results = []
function check(n, ok, d = '') { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`) }

async function login(username) {
  const password = PASSWORDS[username]
  if (!password) return { error: `no password for ${username}` }
  const rpcRes = await fetch(`${URL}/rest/v1/rpc/login_with_username`, {
    method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_username: username }),
  })
  const lookup = await rpcRes.json()
  if (!lookup?.success) return { error: lookup?.error || 'lookup failed' }
  const tokenRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: lookup.email, password }),
  })
  const token = await tokenRes.json()
  if (!token.access_token) return { error: token.error_description || token.msg || 'login failed' }
  return { accessToken: token.access_token, userId: lookup.user_id, email: lookup.email }
}

function authH(token) { return { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
async function q(table, select, token, extra = '') {
  const res = await fetch(`${URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${extra}`, { headers: authH(token) })
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function ins(table, rows, token) {
  const res = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: { ...authH(token), Prefer: 'return=representation' }, body: JSON.stringify(rows) })
  return { status: res.status, body: await res.json().catch(() => null) }
}
async function del(table, query, token) {
  const res = await fetch(`${URL}/rest/v1/${table}?${query}`, { method: 'DELETE', headers: authH(token) })
  return { status: res.status }
}
async function rpc(fn, args, token) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: authH(token), body: JSON.stringify(args) })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const created = { supplier_items: [], customer_items: [], waste_records: [], approval_requests: [], contracts: [], customer_rfq: [], customer_rfq_lines: [], supplier_rfq: [], stock_waste: [] }

try {
  const users = { sysadmin: 'drpramadia', director: 'ratih.cinthia', admin: 'gian', warehouse: 'siswoko' }
  const S = {}
  for (const [role, uname] of Object.entries(users)) {
    const s = await login(uname)
    S[role] = s
    check(`login ${role}`, !!s.accessToken, s.error || '')
  }

  const sysSession = (await rpc('get_my_session', {}, S.sysadmin.accessToken)).body
  const ORG = sysSession?.organization_id
  check('system admin punya organization_id', !!ORG, ORG || '')

  // Ambil id referensi (supplier, customer, produk) memakai service role
  const svcH = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
  const svcSel = async (t, query) => (await (await fetch(`${URL}/rest/v1/${t}?${query}`, { headers: svcH })).json())
  const suppliers = await svcSel('suppliers', `organization_id=eq.${ORG}&select=id&limit=1`)
  const customers = await svcSel('customers', `organization_id=eq.${ORG}&select=id&limit=1`)
  const products = await svcSel('products', `organization_id=eq.${ORG}&select=id&limit=2`)
  const supplierId = suppliers?.[0]?.id
  const customerId = customers?.[0]?.id
  const productIds = (products || []).map((p) => p.id)

  check('ada supplier/customer/produk untuk uji', !!supplierId && !!customerId && productIds.length >= 1,
    `sup=${!!supplierId} cus=${!!customerId} prod=${productIds.length}`)

  // ---------- supplier_items ----------
  if (supplierId && productIds[0]) {
    // WAREHOUSE dapat menulis? (kebijakan org-scope → ya). ADMIN seharusnya boleh.
    const insSup = await ins('supplier_items', [{ organization_id: ORG, supplier_id: supplierId, product_id: productIds[0] }], S.admin.accessToken)
    check('ADMIN bisa insert supplier_items', insSup.status === 201, `status=${insSup.status} ${JSON.stringify(insSup.body)?.slice(0, 120)}`)
    if (Array.isArray(insSup.body) && insSup.body[0]?.id) created.supplier_items.push(insSup.body[0].id)

    const admRead = await q('supplier_items', 'id', S.admin.accessToken, `&supplier_id=eq.${supplierId}`)
    check('ADMIN bisa baca supplier_items', Array.isArray(admRead.body), `status=${admRead.status}`)

    const whRead = await q('supplier_items', 'id', S.warehouse.accessToken, `&supplier_id=eq.${supplierId}`)
    check('WAREHOUSE bisa baca supplier_items (org-scoped)', Array.isArray(whRead.body), `status=${whRead.status}`)

    const anonRead = await q('supplier_items', 'id', ANON, `&supplier_id=eq.${supplierId}`)
    check('anon TIDAK bisa baca supplier_items', Array.isArray(anonRead.body) && anonRead.body.length === 0, `n=${anonRead.body?.length}`)
  }

  // ---------- customer_items ----------
  if (customerId && productIds[0]) {
    const insCus = await ins('customer_items', [{ organization_id: ORG, customer_id: customerId, product_id: productIds[0] }], S.admin.accessToken)
    check('ADMIN bisa insert customer_items', insCus.status === 201, `status=${insCus.status}`)
    if (Array.isArray(insCus.body) && insCus.body[0]?.id) created.customer_items.push(insCus.body[0].id)
    const dirRead = await q('customer_items', 'id', S.director.accessToken, `&customer_id=eq.${customerId}`)
    check('DIRECTOR bisa baca customer_items', Array.isArray(dirRead.body), `status=${dirRead.status}`)
  }

  // ---------- waste_records (perlu kontrak) ----------
  const contracts = await svcSel('rental_contracts', `organization_id=eq.${ORG}&select=id&limit=1`)
  const contractId = contracts?.[0]?.id
  check('ada kontrak untuk uji waste', !!contractId)

  if (contractId) {
    const insWasteAdmin = await ins('waste_records', [{ organization_id: ORG, contract_id: contractId, quantity_kg: 1, reason: 'SHRINKAGE' }], S.admin.accessToken)
    check('ADMIN bisa insert waste_records', insWasteAdmin.status === 201, `status=${insWasteAdmin.status} ${JSON.stringify(insWasteAdmin.body)?.slice(0, 120)}`)
    if (Array.isArray(insWasteAdmin.body) && insWasteAdmin.body[0]?.id) created.waste_records.push(insWasteAdmin.body[0].id)

    const insWasteWh = await ins('waste_records', [{ organization_id: ORG, contract_id: contractId, quantity_kg: 1, reason: 'DAMAGED' }], S.warehouse.accessToken)
    check('WAREHOUSE bisa insert waste_records (halaman kontrak izinkan)', insWasteWh.status === 201, `status=${insWasteWh.status}`)
    if (Array.isArray(insWasteWh.body) && insWasteWh.body[0]?.id) created.waste_records.push(insWasteWh.body[0].id)

    const anonRead = await q('waste_records', 'id', ANON, `&contract_id=eq.${contractId}`)
    check('anon TIDAK bisa baca waste_records', Array.isArray(anonRead.body) && anonRead.body.length === 0, `n=${anonRead.body?.length}`)
  }

  // ---------- RFQ FLOW (customer -> supplier) ----------
  const rfqNum = (await rpc('generate_rfq_number', { p_prefix: 'RFQC' }, S.admin.accessToken)).body
  check('ADMIN bisa generate_rfq_number', typeof rfqNum === 'string' && rfqNum.startsWith('RFQC/'), `got ${rfqNum}`)

  const insRfq = await ins('customer_rfq', [{ organization_id: ORG, rfq_number: rfqNum, customer_id: customerId, status: 'OPEN' }], S.admin.accessToken)
  check('ADMIN bisa insert customer_rfq', insRfq.status === 201, `status=${insRfq.status}`)
  let rfqId
  if (Array.isArray(insRfq.body) && insRfq.body[0]?.id) { rfqId = insRfq.body[0].id; created.customer_rfq.push(rfqId) }

  if (rfqId && productIds[0]) {
    const insLine = await ins('customer_rfq_lines', [{ rfq_id: rfqId, product_id: productIds[0], quantity_kg: 100 }], S.admin.accessToken)
    check('ADMIN bisa insert customer_rfq_lines', insLine.status === 201, `status=${insLine.status}`)
    if (Array.isArray(insLine.body) && insLine.body[0]?.id) created.customer_rfq_lines.push(insLine.body[0].id)
  }

  if (rfqId && supplierId) {
    const sRfqNum = (await rpc('generate_rfq_number', { p_prefix: 'RFQS' }, S.admin.accessToken)).body
    const insSRfq = await ins('supplier_rfq', [{ organization_id: ORG, rfq_number: sRfqNum, customer_rfq_id: rfqId, supplier_id: supplierId, status: 'SENT' }], S.admin.accessToken)
    check('ADMIN bisa insert supplier_rfq', insSRfq.status === 201, `status=${insSRfq.status}`)
    if (Array.isArray(insSRfq.body) && insSRfq.body[0]?.id) created.supplier_rfq.push(insSRfq.body[0].id)
  }

  const anonRfq = await q('customer_rfq', 'id', ANON)
  check('anon TIDAK bisa baca customer_rfq', Array.isArray(anonRfq.body) && anonRfq.body.length === 0, `n=${anonRfq.body?.length}`)

  // ---------- stock_waste (supply chain) ----------
  if (productIds[0]) {
    const insStockWaste = await ins('stock_waste', [{ organization_id: ORG, product_id: productIds[0], quantity_kg: 2, reason: 'EXPIRY' }], S.warehouse.accessToken)
    check('WAREHOUSE bisa insert stock_waste', insStockWaste.status === 201, `status=${insStockWaste.status}`)
    if (Array.isArray(insStockWaste.body) && insStockWaste.body[0]?.id) created.stock_waste.push(insStockWaste.body[0].id)
    const exp = await rpc('inventory_expiring', { p_organization_id: ORG, p_days: 30 }, S.admin.accessToken)
    check('ADMIN bisa panggil inventory_expiring', exp.status === 200 && Array.isArray(exp.body), `status=${exp.status}`)
    const notifExp = await rpc('notify_inventory_expiry', { p_organization_id: ORG }, S.admin.accessToken)
    check('ADMIN bisa panggil notify_inventory_expiry', notifExp.status === 200, `status=${notifExp.status}`)
  }

  // ---------- RPC waste_candidates & notify_waste_and_expiry ----------
  const candAdmin = await rpc('waste_candidates', { p_organization_id: ORG }, S.admin.accessToken)
  check('ADMIN bisa panggil waste_candidates', candAdmin.status === 200 && Array.isArray(candAdmin.body), `status=${candAdmin.status}`)
  const candWh = await rpc('waste_candidates', { p_organization_id: ORG }, S.warehouse.accessToken)
  check('WAREHOUSE bisa panggil waste_candidates', candWh.status === 200 && Array.isArray(candWh.body), `status=${candWh.status}`)
  const notifyAdmin = await rpc('notify_waste_and_expiry', { p_organization_id: ORG }, S.admin.accessToken)
  check('ADMIN bisa panggil notify_waste_and_expiry', notifyAdmin.status === 200, `status=${notifyAdmin.status} n=${notifyAdmin.body}`)

  // ---------- approval_requests memakai `comment`, bukan `notes` ----------
  const badCol = await q('approval_requests', 'notes', S.admin.accessToken)
  check('approval_requests TIDAK punya kolom notes (error 400)', badCol.status >= 400, `status=${badCol.status}`)
  const goodCol = await q('approval_requests', 'comment', S.admin.accessToken, `&limit=1`)
  check('approval_requests punya kolom comment', goodCol.status === 200, `status=${goodCol.status}`)

  // ---------- rental_contracts: total_estimated_kg dihapus, spot_kg ada ----------
  const oldCol = await q('rental_contracts', 'total_estimated_kg', S.admin.accessToken, `&limit=1`)
  check('rental_contracts.total_estimated_kg sudah dihapus', oldCol.status >= 400, `status=${oldCol.status}`)
  const newCol = await q('rental_contracts', 'spot_kg', S.admin.accessToken, `&limit=1`)
  check('rental_contracts.spot_kg ada', newCol.status === 200, `status=${newCol.status}`)

  // ---------- WAREHOUSE tidak boleh akses master admin-only lewat UI, tapi RLS org-scope mengizinkan tulis.
  // Dokumentasikan perilaku: cek apakah WAREHOUSE bisa insert suppliers (tabel master).
  const whInsSupplier = await ins('suppliers', [{ organization_id: ORG, name: 'ZZ Audit Role Supplier' }], S.warehouse.accessToken)
  check('INFO: WAREHOUSE dapat/tidak insert suppliers (RLS org-scope)', true, `status=${whInsSupplier.status}`)
  if (Array.isArray(whInsSupplier.body) && whInsSupplier.body[0]?.id) {
    await del('suppliers', `id=eq.${whInsSupplier.body[0].id}`, S.sysadmin.accessToken)
  }
} catch (e) {
  console.error('ERROR:', e.message)
  process.exitCode = 1
} finally {
  // Bersihkan data uji
  const svcH = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
  for (const id of created.waste_records) await fetch(`${URL}/rest/v1/waste_records?id=eq.${id}`, { method: 'DELETE', headers: svcH })
  for (const id of created.supplier_items) await fetch(`${URL}/rest/v1/supplier_items?id=eq.${id}`, { method: 'DELETE', headers: svcH })
  for (const id of created.customer_items) await fetch(`${URL}/rest/v1/customer_items?id=eq.${id}`, { method: 'DELETE', headers: svcH })
  for (const id of created.stock_waste) await fetch(`${URL}/rest/v1/stock_waste?id=eq.${id}`, { method: 'DELETE', headers: svcH })
  for (const id of created.supplier_rfq) await fetch(`${URL}/rest/v1/supplier_rfq?id=eq.${id}`, { method: 'DELETE', headers: svcH })
  for (const id of created.customer_rfq_lines) await fetch(`${URL}/rest/v1/customer_rfq_lines?id=eq.${id}`, { method: 'DELETE', headers: svcH })
  for (const id of created.customer_rfq) await fetch(`${URL}/rest/v1/customer_rfq?id=eq.${id}`, { method: 'DELETE', headers: svcH })
}

const failed = results.filter((r) => !r.ok && !r.n.startsWith('INFO'))
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) { console.log('GAGAL:'); failed.forEach((f) => console.log('  - ' + f.n)); process.exitCode = 1 }

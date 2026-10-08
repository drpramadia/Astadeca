/**
 * UJI ALUR RENTAL INQUIRY -> APPROVAL -> KONTRAK (jalur aplikasi nyata).
 *
 * Menguji bug status: approval Director atas inquiry sebelumnya menyetel
 * status 'APPROVED' yang TIDAK ada di CHECK constraint rental_inquiries
 * (hanya PENDING/CONVERTED/REJECTED) -> HTTP 400. Kini harus 'CONVERTED'.
 *
 * Jalankan: node scripts/test-inquiry-flow.mjs
 * Data dibersihkan di akhir kecuali RETAIN=1.
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
async function patch(table, q, row, token) { const r = await fetch(`${URL}/rest/v1/${table}?${q}`, { method: 'PATCH', headers: H(token), body: JSON.stringify(row) }); return { status: r.status, body: await r.json().catch(() => null) } }
async function rpc(fn, args, token) { const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(token), body: JSON.stringify(args) }); return { status: r.status, body: await r.json().catch(() => null) } }
async function sel(table, query, token) { const r = await fetch(`${URL}/rest/v1/${table}?${query}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } }); return await r.json().catch(() => null) }

const created = { customer: null, inquiry: null, contract: null }
const cleanup = async () => {
  const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
  const del = (t, q) => fetch(`${URL}/rest/v1/${t}?${q}`, { method: 'DELETE', headers: svc })
  if (created.contract) await del('rental_contracts', `id=eq.${created.contract}`)
  if (created.inquiry) {
    await del('approval_requests', `reference_id=eq.${created.inquiry}`)
    await del('rental_inquiries', `id=eq.${created.inquiry}`)
  }
  if (created.customer) await del('rental_customers', `id=eq.${created.customer}`)
}

try {
  const s = await login('gian', env('TEST_PW_GIAN'))
  check('login admin (gian)', !!s.token, s.error || '')
  const T = s.token
  const session = (await rpc('get_my_session', {}, T)).body
  const ORG = session?.organization_id
  check('admin punya organization_id', !!ORG)

  const store = (await sel('cold_storages', `organization_id=eq.${ORG}&select=id,name&limit=1`, T))?.[0]
  check('ada unit cold storage', !!store, store?.name ?? '')

  // 1. Buat penyewa + inquiry (status PENDING) + approval request
  const cust = await ins('rental_customers', { organization_id: ORG, name: 'CV Alur Inquiry (UJI)', phone: '0812-5555-6666' }, T)
  check('1. buat penyewa', cust.status === 201, `status=${cust.status}`)
  created.customer = cust.body?.[0]?.id

  const inq = await ins('rental_inquiries', {
    organization_id: ORG, customer_id: created.customer, cold_storage_id: store.id,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10),
    notes: 'Uji alur inquiry ke kontrak', status: 'PENDING', created_by: s.userId,
  }, T)
  check('1. buat inquiry (status PENDING)', inq.status === 201 && inq.body?.[0]?.status === 'PENDING', `status=${inq.body?.[0]?.status}`)
  created.inquiry = inq.body?.[0]?.id

  const ap = await ins('approval_requests', {
    organization_id: ORG, request_type: 'RENTAL_INQUIRY', reference_id: created.inquiry, status: 'PENDING', requested_by: s.userId,
  }, T)
  check('1. approval request inquiry dibuat', ap.status === 201, `status=${ap.status}`)

  // 2. Director menyetujui -> otomatis jadi kontrak + inquiry CONVERTED
  const badUpdate = await patch('rental_inquiries', `id=eq.${created.inquiry}`, { status: 'APPROVED' }, T)
  check('2. [bukti bug] status APPROVED ditolak constraint', badUpdate.status === 400, `HTTP ${badUpdate.status}`)

  const conv = await rpc('rental_inquiry_to_contract', { p_inquiry_id: created.inquiry }, T)
  const convRow = Array.isArray(conv.body) ? conv.body[0] : conv.body
  check('2. approve inquiry -> kontrak otomatis dibuat', conv.status === 200 && !!convRow?.out_contract_id, `contract=${convRow?.out_contract_number}`)
  created.contract = convRow?.out_contract_id
  const after = (await sel('rental_inquiries', `id=eq.${created.inquiry}&select=status`, T))?.[0]
  check('2. inquiry kini CONVERTED', after?.status === 'CONVERTED', `status=${after?.status}`)

  // 2b. Idempoten: approve ulang tidak membuat kontrak ganda
  const conv2 = await rpc('rental_inquiry_to_contract', { p_inquiry_id: created.inquiry }, T)
  const convRow2 = Array.isArray(conv2.body) ? conv2.body[0] : conv2.body
  check('2b. approve ulang tidak bikin kontrak ganda', convRow2?.out_contract_id === created.contract && convRow2?.out_created === false, `created=${convRow2?.out_created}`)

  // 3. Kontrak otomatis terhubung ke penyewa & cold storage inquiry + min 1 ton
  const ctrRead = (await sel('rental_contracts', `id=eq.${created.contract}&select=contract_number,customer_id,cold_storage_id,minimum_1_ton,status`, T))?.[0]
  check('3. kontrak terhubung ke penyewa & cold storage inquiry',
    ctrRead?.customer_id === created.customer && ctrRead?.cold_storage_id === store.id,
    `cust=${ctrRead?.customer_id === created.customer} cs=${ctrRead?.cold_storage_id === store.id}`)
  check('3. kontrak ACTIVE + perjanjian minimum 1 ton', ctrRead?.status === 'ACTIVE' && ctrRead?.minimum_1_ton === true, `status=${ctrRead?.status} min_1_ton=${ctrRead?.minimum_1_ton}`)

  console.log('\nRingkasan alur:')
  console.log(`  Inquiry    : ${created.inquiry} -> CONVERTED`)
  console.log(`  Kontrak    : ${ctrRead?.contract_number} (otomatis, ACTIVE, min 1 ton)`)
} catch (e) {
  console.error('ERROR:', e.message)
  process.exitCode = 1
} finally {
  if (RETAIN) console.log('\nRETAIN=1 -> data uji DIPERTAHANKAN.')
  else await cleanup()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) { console.log('GAGAL:'); failed.forEach((f) => console.log('  - ' + f.n)); process.exitCode = 1 }

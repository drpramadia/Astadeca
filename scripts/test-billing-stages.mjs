/**
 * UJI PENAGIHAN MULTI-TAHAP (jalur aplikasi nyata: anon key + JWT admin).
 *
 * Skenario (semua tanggal mundur dari hari ini agar masuk periode tagih berjalan):
 *   - Hari H-6 : barang MASUK 2.000 kg
 *   - Hari H-4 : barang KELUAR   500 kg  -> sisa 1.500 kg
 *   - Hari H-2 : barang KELUAR 1.000 kg  -> sisa   500 kg
 *
 * Penagihan per hari = GREATEST(sisa_kg, 1000) x tarif. Hari dengan stok di atas
 * 1 ton ditagih sesuai stok riil; hari dengan stok di bawah 1 ton ditagih 1 ton.
 *
 * Ekspektasi kg-hari = 2.000+2.000+1.500+1.500+1.000+1.000+1.000 = 10.000
 * Total = 10.000 x Rp100 = Rp1.000.000.
 *
 * Jalankan: node scripts/test-billing-stages.mjs
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
async function rpc(fn, args, token) { const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H(token), body: JSON.stringify(args) }); return { status: r.status, body: await r.json().catch(() => null) } }
async function sel(table, query, token) { const r = await fetch(`${URL}/rest/v1/${table}?${query}`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } }); return await r.json().catch(() => null) }

const dayISO = (offset) => new Date(Date.now() + offset * 864e5).toISOString()
const dayDate = (offset) => dayISO(offset).slice(0, 10)

const created = { customer: null, contract: null, receivings: [], releases: [] }
const cleanup = async () => {
  const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
  const del = (t, q) => fetch(`${URL}/rest/v1/${t}?${q}`, { method: 'DELETE', headers: svc })
  for (const x of created.releases) await del('rental_releases', `id=eq.${x}`)
  for (const x of created.receivings) await del('rental_receivings', `id=eq.${x}`)
  if (created.contract) {
    await del('rental_billing_lines', `billing_id=in.(select id from rental_billing where contract_id=eq.${created.contract})`)
    await del('rental_billing', `contract_id=eq.${created.contract}`)
    await del('rental_contracts', `id=eq.${created.contract}`)
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

  const cust = await ins('rental_customers', { organization_id: ORG, name: 'CV Bertahap (UJI BILLING)', phone: '0812-3333-4444' }, T)
  check('buat penyewa', cust.status === 201, `status=${cust.status}`)
  created.customer = cust.body?.[0]?.id

  // Kontrak: tarif Rp100/kg/hari, min 1 ton, mulai 6 hari lalu (agar semua di periode berjalan)
  const contractNumber = (await rpc('generate_number', { p_prefix: 'RC' }, T)).body || `RC/${Date.now()}`
  const ctr = await ins('rental_contracts', {
    organization_id: ORG, customer_id: created.customer, cold_storage_id: store.id,
    contract_number: contractNumber, start_date: dayDate(-6), end_date: dayDate(23),
    price_per_kg_per_day: 100, status: 'ACTIVE', is_spot: false, minimum_1_ton: true, created_by: s.userId,
  }, T)
  check('buat kontrak (tarif 100/kg/hari, min 1 ton)', ctr.status === 201, `status=${ctr.status}`)
  created.contract = ctr.body?.[0]?.id

  // Hari H-6: MASUK 2.000 kg
  const r1 = await ins('rental_receivings', { organization_id: ORG, contract_id: created.contract, received_kg: 2000, batch_number: 'B-01', received_at: dayISO(-6), received_by: s.userId }, T)
  check('masuk 2.000 kg (H-6)', r1.status === 201, `status=${r1.status}`)
  if (Array.isArray(r1.body)) r1.body.forEach((x) => created.receivings.push(x.id))

  // Hari H-4: KELUAR 500 kg -> sisa 1.500
  const rel1 = await ins('rental_releases', { organization_id: ORG, contract_id: created.contract, released_kg: 500, batch_number: 'B-01', released_at: dayISO(-4), notes: 'Pengeluaran tahap 1' }, T)
  check('keluar 500 kg (H-4)', rel1.status === 201, `status=${rel1.status}`)
  if (Array.isArray(rel1.body)) rel1.body.forEach((x) => created.releases.push(x.id))

  // Hari H-2: KELUAR 1.000 kg -> sisa 500
  const rel2 = await ins('rental_releases', { organization_id: ORG, contract_id: created.contract, released_kg: 1000, batch_number: 'B-01', released_at: dayISO(-2), notes: 'Pengeluaran tahap 2' }, T)
  check('keluar 1.000 kg (H-2)', rel2.status === 201, `status=${rel2.status}`)
  if (Array.isArray(rel2.body)) rel2.body.forEach((x) => created.releases.push(x.id))

  // Hitung ulang billing
  const bill = await rpc('calculate_rental_billing', { p_contract_id: created.contract }, T)
  const b = Array.isArray(bill.body) ? bill.body[0] : bill.body
  check('invoice terbit', bill.status === 200 && !!b?.out_invoice_number, `inv=${b?.out_invoice_number}`)

  const billing = (await sel('rental_billing', `contract_id=eq.${created.contract}&select=id,invoice_number,period_start,period_end,total_amount,status`, T))?.[0]
  const lines = billing?.id ? await sel('rental_billing_lines', `billing_id=eq.${billing.id}&select=description,quantity_kg,price_per_kg,subtotal&order=description`, T) : []

  console.log('\n--- Hasil penagihan ---')
  console.log(`  Invoice   : ${billing?.invoice_number}`)
  console.log(`  Periode   : ${billing?.period_start} s/d ${billing?.period_end}`)
  console.log(`  Baris     : ${lines.length} (1 baris per hari)`)
  const sumKgDay = (lines || []).reduce((s, l) => s + Number(l.quantity_kg || 0), 0)
  for (const l of lines || []) console.log(`    ${l.description}  =>  ${Number(l.subtotal).toLocaleString('id-ID')}`)
  console.log(`  kg-hari   : ${sumKgDay}`)
  console.log(`  TOTAL     : Rp ${Number(billing?.total_amount ?? 0).toLocaleString('id-ID')}`)

  // Ekspektasi kg-hari per hari (GREATEST(sisa,1000)):
  //   H-6 masuk 2000            -> 2000
  //   H-5                       -> 2000
  //   H-4 keluar 500 (sisa1500) -> 1500
  //   H-3                       -> 1500
  //   H-2 keluar1000 (sisa 500) -> 1000 (min 1 ton)
  //   H-1                       -> 1000 (min 1 ton)
  //   H   (sisa 500)            -> 1000 (min 1 ton)
  //   => kg-hari = 2000+2000+1500+1500+1000+1000+1000 = 10.000
  const daysInPeriod = Math.round((new Date(billing?.period_end) - new Date(billing?.period_start)) / 864e5) + 1
  const expectedKgDay = 10000
  const expectedTotal = expectedKgDay * 100
  check('rincian = 1 baris per hari dalam periode', lines.length === daysInPeriod, `baris=${lines.length} hari=${daysInPeriod}`)
  check('kg-hari = 10.000 (2000+2000+1500+1500 min1000x3)', sumKgDay === expectedKgDay, `kg-hari=${sumKgDay} expected=${expectedKgDay}`)

  // Snapshot harian tersimpan (jejak audit)
  const usage = await sel('rental_daily_usage', `contract_id=eq.${created.contract}&select=usage_date,actual_kg,billed_kg,subtotal&order=usage_date`, T)
  check('snapshot harian tersimpan (rental_daily_usage)', (usage || []).length === daysInPeriod, `baris snap=${(usage || []).length}`)
  const snapKg = (usage || []).reduce((s, u) => s + Number(u.billed_kg || 0), 0)
  check('akumulasi snapshot == kg-hari invoice', snapKg === sumKgDay, `snap=${snapKg} invoice=${sumKgDay}`)
  check('total penagihan = 10.000 x Rp100 = Rp1.000.000', Number(billing?.total_amount) === expectedTotal, `total=${billing?.total_amount} expected=${expectedTotal}`)
  check('periode mencakup hari berjalan', daysInPeriod >= 1, `${daysInPeriod} hari`)

  // Simulasi "penagihan tiap tahap": subtotal per hari berisi stok
  const stages = [
    { tahap: 'Setelah masuk 2.000 kg', detail: '2 hari x 2.000 kg', expected: 2 * 2000 * 100 },
    { tahap: 'Setelah keluar 500 kg', detail: '2 hari x 1.500 kg', expected: 2 * 1500 * 100 },
    { tahap: 'Setelah keluar 1.000 kg', detail: '3 hari x 1.000 kg (min 1 ton)', expected: 3 * 1000 * 100 },
  ]
  console.log('\n--- Rincian tagihan per tahap ---')
  let acc = 0
  for (const st of stages) {
    acc += st.expected
    console.log(`  ${st.tahap.padEnd(24)} + ${st.detail.padEnd(30)} = Rp ${st.expected.toLocaleString('id-ID')} (akumulasi Rp ${acc.toLocaleString('id-ID')})`)
  }
  check('akumulasi tahap == total invoice', acc === Number(billing?.total_amount), `acc=${acc} total=${billing?.total_amount}`)
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

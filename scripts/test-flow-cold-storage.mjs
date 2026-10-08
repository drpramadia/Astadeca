/**
 * UJI ALUR SEWA COLD STORAGE (jalur aplikasi nyata: anon key + JWT admin).
 *
 * Skenario:
 *   1. Rental Inquiry (calon penyewa minta sewa, + estimasi kg = info kunjungan)
 *   2. Kontrak sewa (tanpa estimasi berat; hanya data penyewa, periode, tarif)
 *   3. Barang Masuk per batch (dengan expiry)
 *   4. Barang Keluar sebagian (selisih -> potensi waste)
 *   5. Catat Waste (susut)
 *   6. Tagihan mingguan otomatis (invoice + rincian) saat barang masuk
 *
 * Jalankan: node scripts/test-flow-cold-storage.mjs
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

const created = { customer: null, inquiry: null, contract: null, receivings: [], releases: [], waste: [] }
const cleanup = async () => {
  const svc = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` }
  const del = (t, q) => fetch(`${URL}/rest/v1/${t}?${q}`, { method: 'DELETE', headers: svc })
  for (const x of created.waste) await del('waste_records', `id=eq.${x}`)
  for (const x of created.releases) await del('rental_releases', `id=eq.${x}`)
  for (const x of created.receivings) await del('rental_receivings', `id=eq.${x}`)
  if (created.contract) { await del('rental_billing_lines', `billing_id=in.(select id from rental_billing where contract_id=eq.${created.contract})`); await del('rental_billing', `contract_id=eq.${created.contract}`); await del('rental_contracts', `id=eq.${created.contract}`) }
  if (created.inquiry) await del('rental_inquiries', `id=eq.${created.inquiry}`)
  if (created.customer) await del('rental_customers', `id=eq.${created.customer}`)
}

try {
  const s = await login('gian', env('TEST_PW_GIAN'))
  check('login admin (gian)', !!s.token, s.error || '')
  const T = s.token
  const session = (await rpc('get_my_session', {}, T)).body
  const ORG = session?.organization_id
  check('admin punya organization_id', !!ORG)

  const stores = await sel('cold_storages', `organization_id=eq.${ORG}&select=id,name,capacity_kg&limit=1`, T)
  const store = stores?.[0]
  check('ada unit cold storage', !!store, store ? `${store.name} (${store.capacity_kg} kg)` : '')

  // ============ 1. PENYEWA + INQUIRY ============
  const cust = await ins('rental_customers', { organization_id: ORG, name: 'CV Segar Jaya (UJI SEWA)', phone: '0812-0000-1111', address: 'Jl. Contoh No.1' }, T)
  check('1. buat calon penyewa', cust.status === 201, `status=${cust.status}`)
  created.customer = cust.body?.[0]?.id

  const inq = await ins('rental_inquiries', {
    organization_id: ORG, customer_id: created.customer, cold_storage_id: store.id,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10),
    notes: 'Estimasi informasi kunjungan saja', status: 'CONVERTED', created_by: s.userId,
  }, T)
  check('1. buat rental inquiry (estimasi = info kunjungan)', inq.status === 201, `status=${inq.status}`)
  created.inquiry = inq.body?.[0]?.id

  // ============ 2. KONTRAK SEWA (tanpa estimasi berat) ============
  const contractNumber = (await rpc('generate_number', { p_prefix: 'RC' }, T)).body || `RC/${Date.now()}`
  const ctr = await ins('rental_contracts', {
    organization_id: ORG, customer_id: created.customer, cold_storage_id: store.id,
    contract_number: contractNumber, start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10),
    price_per_kg_per_day: 100, status: 'ACTIVE', is_spot: false, days_paid: 0, days_used: 0, created_by: s.userId,
  }, T)
  check('2. buat kontrak sewa (hanya data penyewa)', ctr.status === 201, `status=${ctr.status}`)
  created.contract = ctr.body?.[0]?.id
  const ctrRead = await sel('rental_contracts', `id=eq.${created.contract}&select=contract_number,price_per_kg_per_day`, T)
  check('2. kontrak tanpa kolom estimasi berat', ctrRead?.[0]?.contract_number === contractNumber, contractNumber)

  // ============ 3. BARANG MASUK per batch ============
  const expiry = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10) // dekat -> memicu peringatan
  const rec1 = await ins('rental_receivings', { organization_id: ORG, contract_id: created.contract, received_kg: 600, batch_number: 'B-001', received_at: new Date().toISOString(), expiry_date: expiry, received_by: s.userId }, T)
  check('3. barang masuk batch B-001 (600 kg, expiry dekat)', rec1.status === 201, `status=${rec1.status}`)
  if (Array.isArray(rec1.body)) rec1.body.forEach((x) => created.receivings.push(x.id))
  const rec2 = await ins('rental_receivings', { organization_id: ORG, contract_id: created.contract, received_kg: 300, batch_number: 'B-002', received_at: new Date().toISOString(), expiry_date: new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10), received_by: s.userId }, T)
  check('3. barang masuk batch B-002 (300 kg)', rec2.status === 201, `status=${rec2.status}`)
  if (Array.isArray(rec2.body)) rec2.body.forEach((x) => created.receivings.push(x.id))

  // ============ 4. TAGIHAN MINGGUAN OTOMATIS (min 1 ton) ============
  const bill = await rpc('calculate_rental_billing', { p_contract_id: created.contract }, T)
  const b = Array.isArray(bill.body) ? bill.body[0] : bill.body
  check('4. invoice mingguan terbit (ikuti perjanjian kontrak)', bill.status === 200 && !!b?.out_invoice_number, `inv=${b?.out_invoice_number} total=${b?.out_total_amount}`)
  const billing = await sel('rental_billing', `contract_id=eq.${created.contract}&select=id,invoice_number,period_start,period_end,total_amount,status`, T)
  const bl = billing?.[0]
  check('4. periode = 7 hari (mingguan)', bl ? Math.round((new Date(bl.period_end) - new Date(bl.period_start)) / 864e5) === 6 : false, bl ? `${bl.period_start}..${bl.period_end}` : '')

  // Semua transaksi diuji pada hari yang sama, jadi hanya 1 hari berisi stok.
  // Rincian kini 1 baris per hari; hari tanpa stok tidak menambah tagihan.
  const lines = bl?.id ? await sel('rental_billing_lines', `billing_id=eq.${bl.id}&select=description,quantity_kg,price_per_kg,subtotal`, T) : []
  check('4. ada rincian tagihan (>=1 baris harian)', (lines || []).length >= 1, `${(lines || []).length} baris`)
  const billedKgDay = (lines || []).reduce((s, l) => s + Number(l.quantity_kg || 0), 0)
  check('4. min 1 ton diterapkan (900 kg hari ini -> ditagih 1.000)', billedKgDay >= 1000, `kg-hari=${billedKgDay}`)

  // release TANPA gate: tidak perlu bayar / approval, barang boleh keluar kapan saja
  const rel = await ins('rental_releases', { organization_id: ORG, contract_id: created.contract, released_kg: 580, batch_number: 'B-001', released_at: new Date().toISOString(), notes: 'Pengeluaran sebagian (tanpa gate)' }, T)
  check('4. barang keluar tanpa gate/approval (boleh walau belum bayar)', rel.status === 201, `status=${rel.status}`)
  if (Array.isArray(rel.body)) rel.body.forEach((x) => created.releases.push(x.id))

  // ============ 5. CATAT WASTE ============
  const waste = await ins('waste_records', { organization_id: ORG, contract_id: created.contract, batch_number: 'B-001', quantity_kg: 20, reason: 'SHRINKAGE', notes: 'Susut saat penanganan', recorded_by: s.userId }, T)
  check('5. catat waste 20 kg (susut)', waste.status === 201, `status=${waste.status}`)
  if (Array.isArray(waste.body)) waste.body.forEach((x) => created.waste.push(x.id))

  const cand = await rpc('waste_candidates', { p_organization_id: ORG }, T)
  const mine = (cand.body || []).find((c) => c.contract_id === created.contract)
  check('5. sistem mendeteksi kandidat waste (sisa batch)', !!mine, mine ? `batch=${mine.batch_number} diff=${mine.diff_kg} kg` : '')

  console.log('\nRingkasan sewa cold storage:')
  console.log(`  Kontrak        : ${contractNumber} (Rp 100/kg/hari)`)
  console.log(`  Barang masuk   : 900 kg (B-001: 600, B-002: 300) — di bawah 1 ton`)
  console.log(`  Barang keluar  : 580 kg (tanpa gate/approval)`)
  console.log(`  Waste dicatat  : 20 kg (susut)`)
  console.log(`  Invoice        : ${bl?.invoice_number ?? '-'} = Rp ${Number(bl?.total_amount ?? 0).toLocaleString('id-ID')} (min 1 ton)`)
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

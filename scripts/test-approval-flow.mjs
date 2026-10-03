/**
 * Uji flow: notifikasi approval -> buka detail -> setuju / tolak dengan alasan.
 * Lewat Auth API (DIRECTOR) + RLS. Data uji dibersihkan.
 */
import fs from 'node:fs'
const raw = fs.readFileSync('.env.local', 'utf8')
const env = (k) => { const m = raw.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, 'm')); return m ? m[1].trim() : process.env[k] }
const URL = env('NEXT_PUBLIC_SUPABASE_URL'), ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), SVC = env('SUPABASE_SERVICE_ROLE_KEY')
const ORG = '20000000-0000-0000-0000-000000000001'
const results = []
const check = (n, ok, d = '') => { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`) }

async function tok(email, pw) { const j = await (await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) })).json(); return j.access_token }
const H = (t) => ({ apikey: ANON, Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }

let adminT, dirT, adminProfileId
try {
  adminT = await tok('adm.astadeca@gmail.com', env('TEST_PW_GIAN'))
  dirT = await tok('ratih.cinthia@gmail.com', env('TEST_PW_RATIH'))
  check('login admin + director', !!adminT && !!dirT)

  adminProfileId = (await (await fetch(`${URL}/rest/v1/rpc/get_my_session`, { method: 'POST', headers: H(adminT), body: '{}' })).json())?.user_id

  // Buat delivery request + line + approval
  const dr = (await (await fetch(`${URL}/rest/v1/delivery_requests`, { method: 'POST', headers: H(adminT), body: JSON.stringify([{ organization_id: ORG, requested_by_user_id: adminProfileId, status: 'PENDING', destination: 'Gudang Uji', driver_name: 'Adi', vehicle_number: 'B 99 X' }]) })).json())[0]
  await fetch(`${URL}/rest/v1/delivery_request_lines`, { method: 'POST', headers: H(adminT), body: JSON.stringify([{ request_id: dr.id, item_name: 'Udang Uji', quantity_kg: 75 }]) })
  const ap = (await (await fetch(`${URL}/rest/v1/approval_requests`, { method: 'POST', headers: H(adminT), body: JSON.stringify([{ organization_id: ORG, request_type: 'DELIVERY', reference_id: dr.id, status: 'PENDING', requested_by: adminProfileId }]) })).json())[0]
  check('approval delivery dibuat', !!ap?.id)

  // Notifikasi ke director harus ada & mengarah ke approval id
  const notif = (await (await fetch(`${URL}/rest/v1/notifications?select=id,reference_type,reference_id&recipient_user_id=eq.${(await (await fetch(`${URL}/rest/v1/rpc/get_my_session`, { method: 'POST', headers: H(dirT), body: '{}' })).json())?.user_id}&reference_type=eq.APPROVAL&order=created_at.desc&limit=1`, { headers: H(dirT) })).json())[0]
  check('notifikasi Director menunjuk ke approval id', notif?.reference_id === ap.id, `ref=${notif?.reference_id} vs ${ap.id}`)

  // Director "buka detail": baca approval + dokumennya
  const detail = (await (await fetch(`${URL}/rest/v1/approval_requests?select=*,profiles!approval_requests_requested_by_fkey(full_name)&id=eq.${ap.id}`, { headers: H(dirT) })).json())[0]
  check('Director bisa buka detail approval', !!detail?.id)
  const drDetail = (await (await fetch(`${URL}/rest/v1/delivery_requests?select=destination,driver_name,vehicle_number,delivery_request_lines(item_name,quantity_kg)&id=eq.${dr.id}`, { headers: H(dirT) })).json())[0]
  check('Isi dokumen tampil (destination + rincian)', drDetail?.destination === 'Gudang Uji' && drDetail?.delivery_request_lines?.length === 1, JSON.stringify(drDetail?.delivery_request_lines))

  // Tolak dengan alasan
  const rejectRes = await fetch(`${URL}/rest/v1/approval_requests?id=eq.${ap.id}`, { method: 'PATCH', headers: H(dirT), body: JSON.stringify({ status: 'REJECTED', comment: 'Stok belum cukup', decided_by: (await (await fetch(`${URL}/rest/v1/rpc/get_my_session`, { method: 'POST', headers: H(dirT), body: '{}' })).json())?.user_id, decided_at: new Date().toISOString() }) })
  check('Director bisa tolak dengan alasan', rejectRes.status === 200 || rejectRes.status === 204, `status=${rejectRes.status}`)
  const after = (await (await fetch(`${URL}/rest/v1/approval_requests?select=status,comment&id=eq.${ap.id}`, { headers: H(dirT) })).json())[0]
  check('Status REJECTED + alasan tersimpan', after?.status === 'REJECTED' && after?.comment === 'Stok belum cukup', JSON.stringify(after))

  // Cleanup
  await fetch(`${URL}/rest/v1/approval_requests?id=eq.${ap.id}`, { method: 'DELETE', headers: svcH })
  await fetch(`${URL}/rest/v1/delivery_request_lines?request_id=eq.${dr.id}`, { method: 'DELETE', headers: svcH })
  await fetch(`${URL}/rest/v1/delivery_requests?id=eq.${dr.id}`, { method: 'DELETE', headers: svcH })
} catch (e) { console.error('ERROR:', e.message); process.exitCode = 1 }

const failed = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) process.exitCode = 1

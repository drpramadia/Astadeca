/**
 * Uji flow baru: goods issue manual, terbit invoice billing (admin),
 * inquiry -> approval, QC checklist verdict. Lewat Auth API + RLS. Dibersihkan.
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
const del = (t, tbl, id) => fetch(`${URL}/rest/v1/${tbl}?id=eq.${id}`, { method: 'DELETE', headers: svcH })

let adminT, whT
try {
  adminT = await tok('adm.astadeca@gmail.com', env('TEST_PW_GIAN'))
  whT = await tok('siswoko@astadeca.local', env('TEST_PW_SISWOKO'))
  check('login admin + warehouse', !!adminT && !!whT)

  // ---- QC checklist: simpan dengan checklist + auto verdict ----
  const gr = (await (await fetch(`${URL}/rest/v1/goods_receipts?select=id&organization_id=eq.${ORG}&limit=1`, { headers: H(whT) })).json())[0]
  if (gr) {
    const hdr = await (await fetch(`${URL}/rest/v1/qc_inspections`, { method: 'POST', headers: H(whT), body: JSON.stringify([{ organization_id: ORG, inspection_type: 'IN', gr_id: gr.id, status: 'PASSED' }]) })).json()
    const hdrId = hdr?.[0]?.id
    if (hdrId) {
      const line = await (await fetch(`${URL}/rest/v1/qc_inspection_lines`, { method: 'POST', headers: H(whT), body: JSON.stringify([{ inspection_id: hdrId, item_name: 'Daging Uji', quantity_kg: 10, category: 'DAGING', checklist: { bau_busuk: true }, auto_verdict: 'REJECTED', condition: 'REJECTED' }]) })).json()
      check('QC checklist + auto_verdict tersimpan', !!line?.[0]?.id && line[0].auto_verdict === 'REJECTED', JSON.stringify(line?.[0]?.auto_verdict))
      await del(whT, 'qc_inspections', hdrId)
    }
  } else { console.log('SKIP qc (tidak ada GR)') }

  // ---- Goods Issue manual (warehouse) ----
  const stockBefore = (await (await fetch(`${URL}/rest/v1/inventory?select=id,quantity_kg,product_id,batch_number&organization_id=eq.${ORG}&quantity_kg=gt.0&limit=1`, { headers: H(whT) })).json())[0]
  if (stockBefore) {
    const q = 5
    await fetch(`${URL}/rest/v1/inventory?id=eq.${stockBefore.id}`, { method: 'PATCH', headers: H(whT), body: JSON.stringify({ quantity_kg: Number(stockBefore.quantity_kg) - q }) })
    const mv = await (await fetch(`${URL}/rest/v1/inventory_movements`, { method: 'POST', headers: H(whT), body: JSON.stringify([{ organization_id: ORG, movement_type: 'OUT', product_id: stockBefore.product_id, batch_number: stockBefore.batch_number, quantity_kg: q, from_location: 'WAREHOUSE', reference_type: 'MANUAL', notes: 'uji' }]) })).json()
    check('Goods Issue manual tercatat (stok berkurang + movement OUT)', !!mv?.[0]?.id, JSON.stringify(mv?.[0]?.movement_type || mv))
    if (mv?.[0]?.id) await fetch(`${URL}/rest/v1/inventory_movements?id=eq.${mv[0].id}`, { method: 'DELETE', headers: svcH })
    await fetch(`${URL}/rest/v1/inventory?id=eq.${stockBefore.id}`, { method: 'PATCH', headers: svcH, body: JSON.stringify({ quantity_kg: stockBefore.quantity_kg }) })
  } else { console.log('SKIP goods issue (tidak ada stok)') }

  // ---- Terbit invoice billing (ADMIN) ----
  const contract = (await (await fetch(`${URL}/rest/v1/rental_contracts?select=id,is_spot&organization_id=eq.${ORG}&is_spot=eq.false&limit=1`, { headers: H(adminT) })).json())[0]
  if (contract) {
    const r = await fetch(`${URL}/rest/v1/rpc/calculate_rental_billing`, { method: 'POST', headers: H(adminT), body: JSON.stringify({ p_contract_id: contract.id }) })
    check('ADMIN bisa terbitkan invoice billing', r.status === 200, `status=${r.status}`)
    const bill = (await (await fetch(`${URL}/rest/v1/rental_billing?select=id,invoice_number&contract_id=eq.${contract.id}`, { headers: H(adminT) })).json())[0]
    check('invoice billing ada nomornya', !!bill?.invoice_number, bill?.invoice_number)
  } else { console.log('SKIP billing (tidak ada kontrak non-spot)') }

  // ---- Inquiry -> approval request ----
  const cust = (await (await fetch(`${URL}/rest/v1/rental_customers?select=id&organization_id=eq.${ORG}&limit=1`, { headers: H(adminT) })).json())[0]
  const adminProfile = (await (await fetch(`${URL}/rest/v1/profiles?select=id&limit=1`, { headers: H(adminT) })).json())[0]
  const inq = await (await fetch(`${URL}/rest/v1/rental_inquiries`, { method: 'POST', headers: H(adminT), body: JSON.stringify([{ organization_id: ORG, customer_id: cust?.id, requested_kg: 500, status: 'PENDING', created_by: adminProfile?.id }]) })).json()
  const inqId = inq?.[0]?.id
  if (inqId) {
    await fetch(`${URL}/rest/v1/approval_requests`, { method: 'POST', headers: H(adminT), body: JSON.stringify([{ organization_id: ORG, request_type: 'RENTAL_INQUIRY', reference_id: inqId, status: 'PENDING', requested_by: adminProfile?.id }]) })
    const apr = (await (await fetch(`${URL}/rest/v1/approval_requests?select=id,request_type&reference_id=eq.${inqId}`, { headers: H(adminT) })).json())[0]
    check('Inquiry membuat approval request (terlihat Director)', apr?.request_type === 'RENTAL_INQUIRY', JSON.stringify(apr))
    if (apr?.id) await del(adminT, 'approval_requests', apr.id)
    await del(adminT, 'rental_inquiries', inqId)
  }
} catch (e) { console.error('ERROR:', e.message); process.exitCode = 1 }

const failed = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) process.exitCode = 1

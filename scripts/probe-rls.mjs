import fs from 'node:fs'

const env = {}
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('#') || !line.includes('=')) continue
  const i = line.indexOf('=')
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SVC = env.SUPABASE_SERVICE_ROLE_KEY

async function getToken(email, password) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const j = await res.json()
  return j.access_token
}

async function probe(token, label) {
  const h = { apikey: ANON, Authorization: `Bearer ${token}` }
  const tables = ['profiles','organization_memberships','roles','permissions','role_permissions','rental_contracts','purchase_orders','sales_orders','inventory','customers','cold_storages','approval_requests']
  const rpc = await fetch(`${URL}/rest/v1/rpc/get_my_session`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: '{}' })
  const sess = await rpc.json()
  console.log(`\n[${label}] role=${sess.role_code} perms=${sess.permissions?.length ?? 0}`)
  for (const t of tables) {
    const res = await fetch(`${URL}/rest/v1/${t}?select=*&limit=1`, { headers: h })
    const body = await res.text()
    console.log(`  ${t.padEnd(26)} ${res.status} ${res.ok ? `(${JSON.parse(body || '[]').length} row)` : body.slice(0, 80)}`)
  }
}

const tok = await getToken('diraprama1@gmail.com', '15@priL1990')
await probe(tok, 'SYSTEM_ADMIN drpramadia')

// Provisioning script for DIRECTOR and ADMIN users
// Usage: node scripts/create-roles-users.mjs

import fs from 'node:fs'

const env = {}
for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
}

const URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const ORG_ID = '20000000-0000-0000-0000-000000000001'
const DIRECTOR_ROLE_ID = '00000000-0000-0000-0000-000000000001'
const ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000002'

const H = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
}

async function req(path, options = {}) {
  const res = await fetch(`${URL}${path}`, { ...options, headers: { ...H, ...(options.headers || {}) } })
  const text = await res.text()
  let body
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  return { ok: res.ok, status: res.status, body }
}

async function createOrUpdateUser(user) {
  const { email, password, username, full_name, role_id, role_label } = user

  // 1) Find or create auth user
  let userId = null
  const list = await req('/auth/v1/admin/users?per_page=200')
  if (list.ok && Array.isArray(list.body?.users)) {
    const found = list.body.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) userId = found.id
  }

  if (!userId) {
    const created = await req('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: full_name || username } }),
    })
    if (!created.ok) {
      console.error(`create user ${email} failed:`, created.status, created.body)
      return false
    }
    userId = created.body.id
    console.log(`auth user ${email} created:`, userId)
  } else {
    const upd = await req(`/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ password, email_confirm: true, user_metadata: { full_name: full_name || username } }),
    })
    console.log(`auth user ${email} exists, updated:`, upd.ok, userId)
  }

  if (!userId) { console.error('no user id'); return false }

  // 2) Upsert profile
  const profile = await req('/rest/v1/profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([{ id: userId, username, full_name: full_name || username, is_active: true }]),
  })
  console.log(`profile upsert:`, profile.ok ? 'ok' : profile.status, profile.ok ? '' : profile.body)

  // 3) Upsert membership
  const mem = await req('/rest/v1/organization_memberships', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([{ user_id: userId, organization_id: ORG_ID, role_id, is_active: true }]),
  })
  console.log(`membership ${role_label}:`, mem.ok ? 'ok' : mem.status, mem.ok ? '' : mem.body)

  // 4) Verify login_with_username RPC
  const lookup = await req('/rest/v1/rpc/login_with_username', {
    method: 'POST',
    body: JSON.stringify({ p_username: username }),
  })
  console.log(`login_with_username ${username}:`, lookup.ok ? JSON.stringify(lookup.body) : `${lookup.status} ${JSON.stringify(lookup.body)}`)

  return true
}

async function main() {
  await createOrUpdateUser({
    email: 'ratih.cinthia@gmail.com',
    password: 'ciaastadeca',
    username: 'ratih.cinthia',
    full_name: 'Ratih Cinthia',
    role_id: '00000000-0000-0000-0000-000000000001', // DIRECTOR
    role_label: 'DIRECTOR',
  })

  await createOrUpdateUser({
    email: 'adm.astadeca@gmail.com',
    password: 'gianastadeca',
    username: 'gian',
    full_name: 'Gian',
    role_id: '00000000-0000-0000-0000-000000000002', // ADMIN
    role_label: 'ADMIN',
  })

  console.log('\n✅ Done provisioning users')
}

main().catch((e) => { console.error(e); process.exit(1) })
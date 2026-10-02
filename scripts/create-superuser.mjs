// One-off provisioning script for the super user.
// Usage: node scripts/create-superuser.mjs
// Reads Supabase URL + service role key from .env.local (never logs secrets).

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

const EMAIL = 'diraprama1@gmail.com'
const PASSWORD = '15@priL1990'
const USERNAME = 'drpramadia'
const ORG_ID = '20000000-0000-0000-0000-000000000001'
const DIRECTOR_ROLE_ID = '00000000-0000-0000-0000-000000000001'

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

// 1) Find or create the auth user
let userId = null
const list = await req('/auth/v1/admin/users?per_page=200')
if (list.ok && Array.isArray(list.body?.users)) {
  const found = list.body.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase())
  if (found) userId = found.id
}

if (!userId) {
  const created = await req('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, email_confirm: true, user_metadata: { full_name: USERNAME } }),
  })
  if (!created.ok) {
    console.error('create user failed:', created.status, created.body)
    process.exit(1)
  }
  userId = created.body.id
  console.log('auth user created:', userId)
} else {
  // ensure password + confirmation
  const upd = await req(`/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify({ password: PASSWORD, email_confirm: true, user_metadata: { full_name: USERNAME } }),
  })
  console.log('auth user exists, updated:', upd.ok, userId)
}

if (!userId) { console.error('no user id'); process.exit(1) }

// 2) Upsert profile
const profile = await req('/rest/v1/profiles', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify([{ id: userId, username: USERNAME, full_name: USERNAME, is_active: true }]),
})
console.log('profile upsert:', profile.ok ? 'ok' : profile.status, profile.ok ? '' : profile.body)

// 3) Upsert membership -> DIRECTOR
const mem = await req('/rest/v1/organization_memberships', {
  method: 'POST',
  headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
  body: JSON.stringify([{ user_id: userId, organization_id: ORG_ID, role_id: DIRECTOR_ROLE_ID, is_active: true }]),
})
console.log('membership upsert:', mem.ok ? 'ok' : mem.status, mem.ok ? '' : mem.body)

// 4) Verify login_with_username RPC resolves
const lookup = await req('/rest/v1/rpc/login_with_username', {
  method: 'POST',
  body: JSON.stringify({ p_username: USERNAME }),
})
console.log('login_with_username:', lookup.ok ? JSON.stringify(lookup.body) : `${lookup.status} ${JSON.stringify(lookup.body)}`)

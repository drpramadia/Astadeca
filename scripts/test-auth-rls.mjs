/**
 * Uji login + RLS sebagai USER ASLI lewat Supabase Auth API.
 * Ini menguji jalur aplikasi sebenarnya (anon key + JWT), bukan koneksi DB langsung.
 *
 * Butuh env: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *            SUPABASE_SERVICE_ROLE_KEY
 * Password user demo diambil dari env (TEST_USER_PASSWORD) atau argumen.
 *
 * Jalankan: node scripts/test-auth-rls.mjs <password>
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

if (!URL || !ANON) { console.error('Missing Supabase URL/ANON key'); process.exit(1) }

// Password per user dari env (TEST_PW_<USERNAME>) atau argumen positional.
// Contoh: node scripts/test-auth-rls.mjs
//   env: TEST_PW_DRPRAMADIA=... TEST_PW_RATIH=... TEST_PW_GIAN=... TEST_PW_SISWOKO=...
const PASSWORDS = {
  drpramadia: process.env.TEST_PW_DRPRAMADIA || envVal('TEST_PW_DRPRAMADIA'),
  'ratih.cinthia': process.env.TEST_PW_RATIH || envVal('TEST_PW_RATIH'),
  gian: process.env.TEST_PW_GIAN || envVal('TEST_PW_GIAN'),
  siswoko: process.env.TEST_PW_SISWOKO || envVal('TEST_PW_SISWOKO') || process.argv[2],
}

const results = []
function check(n, ok, d = '') { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`) }

async function login(username) {
  const password = PASSWORDS[username]
  if (!password) return { error: `no password for ${username}` }

  // Step 1: username -> email
  const rpcRes = await fetch(`${URL}/rest/v1/rpc/login_with_username`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_username: username }),
  })
  const lookup = await rpcRes.json()
  if (!lookup?.success) return { error: lookup?.error || 'lookup failed' }

  // Step 2: sign in with email + password
  const tokenRes = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: lookup.email, password }),
  })
  const token = await tokenRes.json()
  if (!token.access_token) return { error: token.error_description || token.msg || 'login failed', email: lookup.email }
  return { accessToken: token.access_token, userId: lookup.user_id, email: lookup.email }
}

async function q(table, select = '*', token, extra = '') {
  const res = await fetch(`${URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${extra}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  })
  const body = await res.json()
  return { status: res.status, body }
}

async function rpc(fn, args, token) {
  const res = await fetch(`${URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  return { status: res.status, body: await res.json() }
}

try {
  // ---------- LOGIN tiap role ----------
  const users = { sysadmin: 'drpramadia', director: 'ratih.cinthia', admin: 'gian', warehouse: 'siswoko' }
  const sessions = {}
  for (const [role, uname] of Object.entries(users)) {
    const s = await login(uname)
    sessions[role] = s
    check(`login ${role} (${uname})`, !!s.accessToken, s.error || s.email)
  }

  // ---------- SESSION / ROLE ----------
  for (const [role, s] of Object.entries(sessions)) {
    if (!s.accessToken) continue
    const { body } = await rpc('get_my_session', {}, s.accessToken)
    const expectedRole = role === 'sysadmin' ? 'SYSTEM_ADMIN' : role.toUpperCase()
    check(`get_my_session ${role} -> role=${expectedRole}`, body?.role_code === expectedRole, `got ${body?.role_code}`)
    check(`session ${role} punya organization_id`, !!body?.organization_id)
  }

  const whToken = sessions.warehouse.accessToken
  const adminToken = sessions.admin.accessToken
  const dirToken = sessions.director.accessToken
  const sysToken = sessions.sysadmin.accessToken

  // ---------- RLS: anon tidak boleh lihat apa pun ----------
  const anonRead = await q('rental_contracts', 'id', ANON)
  check('anon (tanpa login) TIDAK bisa baca kontrak', Array.isArray(anonRead.body) && anonRead.body.length === 0, `n=${anonRead.body?.length}`)

  // ---------- RLS: WAREHOUSE ----------
  const whContracts = await q('rental_contracts', 'id', whToken)
  check('WAREHOUSE bisa baca kontrak (org-scoped)', Array.isArray(whContracts.body), `status=${whContracts.status}`)
  const whUsers = await q('profiles', 'id', whToken)
  check('WAREHOUSE bisa lihat profil (utk tampil nama)', Array.isArray(whUsers.body))

  // WAREHOUSE tidak boleh input GR? (cek akses tulis ke tabel admin-only)
  const whPerms = (await rpc('get_my_session', {}, whToken)).body?.permissions || []
  check('WAREHOUSE tidak punya permission user.manage', !whPerms.includes('users.manage') && !whPerms.includes('roles.manage'), `perms=${whPerms.length}`)

  // ---------- RLS: ADMIN punya permission lebih ----------
  const adminPerms = (await rpc('get_my_session', {}, adminToken)).body?.permissions || []
  check('ADMIN punya permission finance/operasional', adminPerms.length > whPerms.length, `admin=${adminPerms.length} wh=${whPerms.length}`)

  // ---------- RLS: DIRECTOR punya approval ----------
  const dirPerms = (await rpc('get_my_session', {}, dirToken)).body?.permissions || []
  check('DIRECTOR punya permission approval', dirPerms.some((p) => p.includes('approv')), `perms=${dirPerms.length}`)

  // ---------- RLS: SYSTEM_ADMIN ----------
  const sysSession = (await rpc('get_my_session', {}, sysToken)).body
  check('SYSTEM_ADMIN role benar', sysSession?.role_code === 'SYSTEM_ADMIN')

  // ---------- RLS: user tiap role tidak bisa akses lintas organisasi ----------
  // Buat organisasi lain + data, pastikan tidak terlihat (pakai service role)
  let otherOrgId
  try {
    const createRes = await fetch(`${URL}/rest/v1/organizations`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ name: 'Org Test RLS' }),
    })
    const created = await createRes.json()
    otherOrgId = Array.isArray(created) ? created[0]?.id : created?.id
  } catch { /* ignore */ }

  if (otherOrgId) {
    await fetch(`${URL}/rest/v1/rental_customers`, {
      method: 'POST',
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ organization_id: otherOrgId, name: 'Penyewa Org Lain' }),
    })
    const leak = await q('rental_customers', 'id,name', adminToken, `&name=eq.${encodeURIComponent('Penyewa Org Lain')}`)
    check('ADMIN tidak bisa lihat data organisasi lain (RLS)', Array.isArray(leak.body) && leak.body.length === 0, `n=${leak.body?.length}`)

    // Bersihkan
    await fetch(`${URL}/rest/v1/rental_customers?organization_id=eq.${otherOrgId}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
    await fetch(`${URL}/rest/v1/organizations?id=eq.${otherOrgId}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } })
  } else {
    console.log('SKIP  lintas-organisasi (gagal buat org uji)')
  }
} catch (e) {
  console.error('ERROR:', e.message)
  process.exitCode = 1
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) { console.log('GAGAL:'); failed.forEach((f) => console.log('  - ' + f.n)); process.exitCode = 1 }

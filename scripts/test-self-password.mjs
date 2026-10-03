/**
 * Uji user bisa ganti password SENDIRI via Supabase Auth (jalur aplikasi asli).
 * Membuat user uji sementara (service role), login, ganti password, cek password baru
 * valid, lalu hapus user uji. Tidak menyentuh user produksi.
 *
 * Jalankan: node scripts/test-self-password.mjs
 */
import fs from 'node:fs'

const raw = fs.readFileSync('.env.local', 'utf8')
const env = (k) => { const m = raw.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, 'm')); return m ? m[1].trim() : process.env[k] }
const URL = env('NEXT_PUBLIC_SUPABASE_URL')
const ANON = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
const SVC = env('SUPABASE_SERVICE_ROLE_KEY')

const results = []
function check(n, ok, d = '') { results.push({ n, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`) }

const EMAIL = `selftest_${Date.now()}@astadeca.local`
const OLD_PW = 'oldpassword123'
const NEW_PW = 'newpassword456'

const svcH = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' }

async function signIn(password) {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password }),
  })
  return res.json()
}

let userId = null
try {
  // 1) Buat user uji
  const createRes = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST', headers: svcH,
    body: JSON.stringify({ email: EMAIL, password: OLD_PW, email_confirm: true }),
  })
  const created = await createRes.json()
  userId = created.id
  check('buat user uji', !!userId, created?.msg || userId)

  // 2) Login dengan password lama
  const login = await signIn(OLD_PW)
  check('login dengan password lama', !!login.access_token, login.error_description || '')

  // 3) Ganti password sebagai user sendiri (updateUser)
  const upd = await fetch(`${URL}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: ANON, Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: NEW_PW }),
  })
  const updBody = await upd.json()
  check('user ganti password sendiri (updateUser)', upd.ok && !updBody.error, updBody.error?.message || updBody.msg || '')

  // 4) Password lama harus GAGAL
  const oldLogin = await signIn(OLD_PW)
  check('password lama sudah tidak berlaku', !oldLogin.access_token, oldLogin.error_description || '')

  // 5) Password baru harus BERHASIL
  const newLogin = await signIn(NEW_PW)
  check('login dengan password baru', !!newLogin.access_token, newLogin.error_description || '')
} catch (e) {
  console.error('ERROR:', e.message); process.exitCode = 1
} finally {
  if (userId) {
    await fetch(`${URL}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: svcH })
    console.log('user uji dihapus.')
  }
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
if (failed.length) process.exitCode = 1

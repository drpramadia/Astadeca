/**
 * Backup lokal ERP Astadeca.
 *
 * Dua mode:
 *  1) SQL dump penuh (butuh pg_dump). Di Windows tanpa pg_dump, script memakai
 *     Docker image postgres:16 jika Docker tersedia.
 *  2) Fallback JSON (tanpa pg_dump) — mengekspor seluruh tabel public + auth users
 *     ke file .json. Cocok untuk paket gratis & lingkungan terbatas.
 *
 * Pemakaian:
 *   node scripts/backup.mjs              -> coba SQL dump, fallback ke JSON
 *   node scripts/backup.mjs --json       -> paksa mode JSON
 *   node scripts/backup.mjs --sql        -> paksa mode SQL (butuh pg_dump/docker)
 *
 * Hasil disimpan ke folder `backups/` dengan nama ber-timestamp.
 */
import { createClient, loadEnv } from './db-config.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

loadEnv()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const BACKUP_DIR = path.join(ROOT, 'backups')

const args = process.argv.slice(2)
const forceJson = args.includes('--json')
const forceSql = args.includes('--sql')

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
}

function ensureDir() {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

function hasCommand(cmd) {
  try {
    const check = process.platform === 'win32' ? 'where' : 'which'
    execFileSync(check, [cmd], { stdio: 'ignore' })
    return true
  } catch { return false }
}

function dbUrl() {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  if (!url) {
    console.error('DATABASE_URL tidak ditemukan di .env.local')
    process.exit(1)
  }
  return url
}

// ---------- Mode SQL ----------
function runSqlDump() {
  const url = dbUrl()
  const out = path.join(BACKUP_DIR, `erp-astadeca_${ts()}.sql`)

  if (hasCommand('pg_dump')) {
    console.log('Menggunakan pg_dump lokal...')
    execFileSync('pg_dump', ['--no-owner', '--no-privileges', '-f', out, url], { stdio: 'inherit' })
    return out
  }

  if (hasCommand('docker')) {
    console.log('pg_dump tidak ada, mencoba Docker (postgres:16)...')
    try {
      execFileSync('docker', [
        'run', '--rm', '-e', `PGURL=${url}`,
        '-v', `${path.dirname(out)}:/backup`,
        'postgres:16',
        'sh', '-c', 'pg_dump --no-owner --no-privileges -f "/backup/' + path.basename(out) + '" "$PGURL"',
      ], { stdio: ['ignore', 'inherit', 'pipe'] })
      return out
    } catch (e) {
      // Jangan tampilkan isi perintah (memuat kredensial)
      console.warn('Docker gagal (daemon tidak jalan?). Lanjut ke fallback JSON.')
      return null
    }
  }

  return null
}

// ---------- Mode JSON ----------
async function runJsonDump() {
  const client = createClient()
  await client.connect()
  const tablesRes = await client.query(
    `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`
  )
  const tables = tablesRes.rows.map((r) => r.table_name)
  const dump = { generated_at: new Date().toISOString(), schema: 'public', tables: {} }

  for (const t of tables) {
    try {
      const rows = (await client.query(`select * from public."${t}"`)).rows
      dump.tables[t] = rows
      console.log(`  - ${t}: ${rows.length} baris`)
    } catch (e) {
      console.warn(`  ! ${t}: gagal (${e.message})`)
    }
  }

  // Catatan: auth.users tidak diekspor lewat mode JSON (skema terproteksi).
  // Gunakan mode SQL (pg_dump) untuk dump lengkap termasuk auth.
  await client.end()

  const out = path.join(BACKUP_DIR, `erp-astadeca_${ts()}.json`)
  fs.writeFileSync(out, JSON.stringify(dump, null, 2), 'utf8')
  return out
}

// ---------- Eksekusi ----------
async function main() {
  ensureDir()
  const start = Date.now()
  let outFile = null

  if (forceJson) {
    console.log('Mode JSON dipaksa.')
    outFile = await runJsonDump()
  } else {
    outFile = runSqlDump()
    if (!outFile && !forceSql) {
      console.log('pg_dump & Docker tidak tersedia -> fallback ke mode JSON.')
      outFile = await runJsonDump()
    } else if (!outFile && forceSql) {
      console.error('Mode SQL dipaksa tapi pg_dump/Docker tidak tersedia.')
      process.exit(1)
    }
  }

  const size = fs.existsSync(outFile) ? fs.statSync(outFile).size : 0
  console.log(`\nBackup selesai: ${outFile} (${(size / 1024).toFixed(1)} KB) dalam ${Date.now() - start} ms`)
}

main().catch((e) => { console.error('BACKUP ERROR:', e.message); process.exit(1) })

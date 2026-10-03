import pg from 'pg'
import fs from 'node:fs'

/** Muat .env / .env.local ke process.env (tanpa menimpa yang sudah ada). */
export function loadEnv() {
  for (const file of ['.env', '.env.local']) {
    if (!fs.existsSync(file)) continue
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const i = line.indexOf('=')
      const key = line.slice(0, i).trim()
      const val = line.slice(i + 1).trim()
      if (!(key in process.env)) process.env[key] = val
    }
  }
}

/**
 * Buat koneksi Postgres dari DATABASE_URL.
 * Format: postgresql://postgres.<ref>:<password>@<host>:5432/postgres
 * Tidak ada kredensial yang di-hardcode di sini.
 */
export function createClient() {
  loadEnv()
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
  if (connectionString) {
    return new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } })
  }

  // Fallback: susun dari variabel terpisah bila DATABASE_URL tidak ada
  const host = process.env.PGHOST
  const user = process.env.PGUSER
  const password = process.env.PGPASSWORD
  const database = process.env.PGDATABASE || 'postgres'
  if (!host || !user || !password) {
    console.error('Missing DATABASE_URL (or PGHOST/PGUSER/PGPASSWORD) in environment / .env.local')
    process.exit(1)
  }
  return new pg.Client({ host, port: Number(process.env.PGPORT || 5432), user, password, database, ssl: { rejectUnauthorized: false } })
}

/** Koneksi singleton untuk script singkat. */
export async function connect() {
  const client = createClient()
  await client.connect()
  return client
}

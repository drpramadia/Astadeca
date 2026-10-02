import pg from 'pg'
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

// DB password stored as free-text annotation in .env.local
const raw = fs.readFileSync('.env.local', 'utf8')
const pwMatch = raw.match(/password database[^=]*=\s*(\S+)/i)
const password = pwMatch ? pwMatch[1] : process.env.PGPASSWORD
const host = `aws-0-ap-southeast-1.pooler.supabase.com`
const ref = 'huaggvlpknwzarpgjkso'

const client = new pg.Client({
  host,
  port: 5432,
  user: `postgres.${ref}`,
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

const sql = process.argv[2] || 'select current_database(), current_user, version()'

try {
  await client.connect()
  const res = await client.query(sql)
  console.log(JSON.stringify(res.rows, null, 2))
} catch (e) {
  console.error('DB ERROR:', e.message)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}

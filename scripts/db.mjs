import { createClient } from './db-config.mjs'

const client = createClient()
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

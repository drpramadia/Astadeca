import fs from 'node:fs'
import { createClient } from './db-config.mjs'

const client = createClient()
const sql = fs.readFileSync(process.argv[2], 'utf8')

try {
  await client.connect()
  await client.query(sql)
  console.log('OK')
} catch (e) {
  console.error('DB ERROR:', e.message)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}

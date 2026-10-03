/**
 * Restore dari backup JSON (hasil scripts/backup.mjs mode JSON).
 *
 * Pemakaian:
 *   node scripts/restore.mjs backups/erp-astadeca_....json
 *
 * PENTING: restore menimpa isi tabel (TRUNCATE lalu INSERT).
 * Script meminta konfirmasi kecuali dijalankan dengan --yes.
 */
import fs from 'node:fs'
import readline from 'node:readline'
import { createClient } from './db-config.mjs'

const file = process.argv[2]
const autoYes = process.argv.includes('--yes')

if (!file || !fs.existsSync(file)) {
  console.error('Pemakaian: node scripts/restore.mjs <file-backup.json> [--yes]')
  process.exit(1)
}

const dump = JSON.parse(fs.readFileSync(file, 'utf8'))
const tables = Object.keys(dump.tables || {})
if (tables.length === 0) { console.error('Tidak ada tabel di file backup.'); process.exit(1) }

async function confirm() {
  if (autoYes) return true
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ans = await new Promise((res) => rl.question(`Restore ${tables.length} tabel (MENIMPA data saat ini). Lanjut? (ketik "ya"): `, res))
  rl.close()
  return ans.trim().toLowerCase() === 'ya'
}

async function main() {
  if (!(await confirm())) { console.log('Dibatalkan.'); return }

  const client = createClient()
  await client.connect()

  // Urutan: hapus dulu (child -> parent) dengan TRUNCATE ... CASCADE aman
  console.log('\nMengosongkan tabel tujuan...')
  await client.query(`truncate table ${tables.map((t) => `public."${t}"`).join(', ')} cascade`)

  console.log('Memasukkan data...')
  for (const t of tables) {
    const rows = dump.tables[t] || []
    if (rows.length === 0) { console.log(`  - ${t}: 0 (skip)`); continue }
    const cols = Object.keys(rows[0])
    let inserted = 0
    for (const row of rows) {
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ')
      const values = cols.map((c) => (typeof row[c] === 'object' && row[c] !== null ? JSON.stringify(row[c]) : row[c]))
      try {
        await client.query(`insert into public."${t}" (${cols.map((c) => `"${c}"`).join(', ')}) values (${placeholders})`, values)
        inserted++
      } catch (e) {
        console.warn(`  ! ${t}: baris gagal (${e.message})`)
      }
    }
    console.log(`  - ${t}: ${inserted}/${rows.length} baris`)
  }

  await client.end()
  console.log('\nRestore selesai.')
}

main().catch((e) => { console.error('RESTORE ERROR:', e.message); process.exit(1) })

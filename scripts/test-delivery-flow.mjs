import pg from 'pg'
import fs from 'node:fs'

const raw = fs.readFileSync('.env.local', 'utf8')
const pwMatch = raw.match(/password database[^=]*=\s*(\S+)/i)
const password = pwMatch ? pwMatch[1] : process.env.PGPASSWORD
const client = new pg.Client({
  host: 'aws-0-ap-southeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.huaggvlpknwzarpgjkso',
  password,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
})

const ORG = '20000000-0000-0000-0000-000000000001'

await client.connect()
try {
  await client.query('begin')

  // 1) admin-esque flow: create a delivery request + line
  const req = await client.query(
    `insert into public.delivery_requests (organization_id, requested_by_user_id, status, notes, destination, driver_name, vehicle_number)
     values ($1, (select user_id from public.organization_memberships where organization_id=$1 and is_active limit 1), 'PENDING', 'IT test', 'Gudang Test', 'Budi', 'B 1234 XY')
     returning id`,
    [ORG]
  )
  const reqId = req.rows[0].id
  await client.query(
    `insert into public.delivery_request_lines (request_id, item_name, quantity_kg) values ($1, 'Ikan Beku', 100), ($1, 'Udang', 50)`,
    [reqId]
  )

  // 2) director approval -> should auto-issue DO via trigger
  await client.query(`update public.delivery_requests set status='APPROVED' where id=$1`, [reqId])

  const doRow = await client.query(
    `select id, do_number, status, destination, driver_name from public.delivery_orders where delivery_request_id=$1`,
    [reqId]
  )
  const lines = await client.query(
    `select item_name, quantity_kg from public.delivery_order_lines where do_id=$1 order by item_name`,
    [doRow.rows[0]?.id]
  )
  const docRow = await client.query(
    `select doc_type, doc_number from public.documents where reference_id=$1`,
    [doRow.rows[0]?.id]
  )
  const notif = await client.query(
    `select count(*)::int as n from public.notifications where reference_id=$1 and reference_type='DELIVERY_ORDER'`,
    [doRow.rows[0]?.id]
  )

  console.log('DO created :', doRow.rows[0])
  console.log('DO lines   :', lines.rows)
  console.log('Document   :', docRow.rows)
  console.log('Notifs     :', notif.rows[0].n)

  // 3) idempotency: approve again should NOT create a second DO
  await client.query(`update public.delivery_requests set notes='re-approve' where id=$1`, [reqId])
  await client.query(`update public.delivery_requests set status='APPROVED' where id=$1`, [reqId])
  const count = await client.query(`select count(*)::int as n from public.delivery_orders where delivery_request_id=$1`, [reqId])
  console.log('DO count after 2nd approve (expect 1):', count.rows[0].n)

  // 4) REJECTED must not create a DO
  const req2 = await client.query(
    `insert into public.delivery_requests (organization_id, requested_by_user_id, status) values ($1, (select user_id from public.organization_memberships where organization_id=$1 and is_active limit 1), 'PENDING') returning id`,
    [ORG]
  )
  await client.query(`update public.delivery_requests set status='REJECTED' where id=$1`, [req2.rows[0].id])
  const rejDo = await client.query(`select count(*)::int as n from public.delivery_orders where delivery_request_id=$1`, [req2.rows[0].id])
  console.log('DO created for REJECTED (expect 0):', rejDo.rows[0].n)

  await client.query('rollback')
  console.log('\nROLLED BACK (test data not persisted)')
} catch (e) {
  await client.query('rollback').catch(() => {})
  console.error('FLOW TEST ERROR:', e.message)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}

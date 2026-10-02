// Supabase Edge Function: admin-users
// System-administrator-only user & membership management.
// Deploy: supabase functions deploy admin-users
//
// Requires env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// (Supabase injects these automatically for deployed functions.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  // 1) Verify caller + that they are SYSTEM_ADMIN
  const asCaller = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: session, error: sessErr } = await asCaller.rpc('get_my_session')
  if (sessErr || !session?.authenticated || session.role_code !== 'SYSTEM_ADMIN') {
    return json({ error: 'Forbidden: SYSTEM_ADMIN only' }, 403)
  }

  const admin = createClient(SUPABASE_URL, SERVICE)
  let payload: any = {}
  try { payload = await req.json() } catch { /* ignore */ }
  const action = payload.action as string

  try {
    if (action === 'list') {
      const { data: users, error } = await admin.auth.admin.listUsers({ perPage: 200 })
      if (error) throw error
      const ids = users.users.map((u) => u.id)
      const { data: profiles } = await admin.from('profiles').select('id, username, full_name, is_active').in('id', ids)
      const { data: mems } = await admin
        .from('organization_memberships')
        .select('user_id, organization_id, role_id, is_active, roles(code, name)')
        .in('user_id', ids)

      const result = users.users.map((u) => {
        const p = profiles?.find((x: any) => x.id === u.id)
        const m = mems?.find((x: any) => x.user_id === u.id)
        return {
          id: u.id,
          email: u.email,
          username: p?.username ?? null,
          full_name: p?.full_name ?? u.user_metadata?.full_name ?? null,
          is_active: p?.is_active ?? true,
          organization_id: m?.organization_id ?? null,
          role_id: m?.role_id ?? null,
          role_code: (m as any)?.roles?.code ?? null,
          role_name: (m as any)?.roles?.name ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
        }
      })
      return json({ users: result })
    }

    if (action === 'create') {
      const { email, password, username, full_name, role_id, organization_id } = payload
      if (!email || !password || !username || !organization_id) {
        return json({ error: 'email, password, username, organization_id wajib' }, 400)
      }
      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: full_name || username },
      })
      if (cErr) throw cErr
      const uid = created.user.id

      await admin.from('profiles').upsert({ id: uid, username, full_name: full_name || username, is_active: true })
      if (role_id) {
        await admin.from('organization_memberships').upsert(
          { user_id: uid, organization_id, role_id, is_active: true },
          { onConflict: 'user_id,organization_id' },
        )
      }
      return json({ ok: true, user_id: uid })
    }

    if (action === 'set_role') {
      const { user_id, role_id, organization_id } = payload
      if (!user_id || !role_id || !organization_id) return json({ error: 'user_id, role_id, organization_id wajib' }, 400)
      const { error } = await admin
        .from('organization_memberships')
        .upsert({ user_id, organization_id, role_id, is_active: true }, { onConflict: 'user_id,organization_id' })
      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'set_password') {
      const { user_id, password } = payload
      if (!user_id || !password) return json({ error: 'user_id, password wajib' }, 400)
      const { error } = await admin.auth.admin.updateUserById(user_id, { password })
      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'set_active') {
      const { user_id, is_active } = payload
      if (!user_id) return json({ error: 'user_id wajib' }, 400)
      const { error } = await admin.from('profiles').update({ is_active: !!is_active }).eq('id', user_id)
      if (error) throw error
      return json({ ok: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (e) {
    return json({ error: (e as Error).message }, 400)
  }
})

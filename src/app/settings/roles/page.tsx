'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { ShieldCheck, Loader2, KeyRound, Users as UsersIcon } from 'lucide-react'

type Role = { id: string; name: string; code: string }
type Permission = { id: string; code: string; name: string }
type RolePerm = { role_id: string; permission_id: string }

export default function RolesPage() {
  const { isSystemAdmin, loaded } = useSession()
  const [roles, setRoles] = useState<Role[]>([])
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [rolePerms, setRolePerms] = useState<RolePerm[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!loaded || !isSystemAdmin) return
    load()
  }, [loaded, isSystemAdmin])

  async function load() {
    setLoading(true)
    const [r, p, rp, mem] = await Promise.all([
      supabase.from('roles').select('id, name, code').order('code'),
      supabase.from('permissions').select('id, code, name').order('code'),
      supabase.from('role_permissions').select('role_id, permission_id'),
      supabase.from('organization_memberships').select('role_id'),
    ])
    setRoles((r.data as Role[]) || [])
    setPermissions((p.data as Permission[]) || [])
    setRolePerms((rp.data as RolePerm[]) || [])
    const c: Record<string, number> = {}
    ;(mem.data as { role_id: string }[] || []).forEach((m) => { c[m.role_id] = (c[m.role_id] || 0) + 1 })
    setCounts(c)
    setLoading(false)
  }

  if (loaded && !isSystemAdmin) {
    return (
      <AppShell>
        <div className="p-6 text-center text-slate-500">Halaman ini hanya untuk System Administrator.</div>
      </AppShell>
    )
  }

  const permCodes = (roleId: string) =>
    rolePerms.filter((rp) => rp.role_id === roleId)
      .map((rp) => permissions.find((p) => p.id === rp.permission_id)?.code)
      .filter(Boolean) as string[]

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 font-display">Role & Hak Akses</h1>
          <p className="mt-1 text-sm text-slate-500">Daftar role beserta ID dan permission-nya</p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="space-y-4">
            {roles.map((role) => {
              const codes = permCodes(role.id)
              return (
                <div key={role.id} className="bg-white rounded-xl border border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary">
                        <ShieldCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">{role.name}</p>
                        <p className="text-xs font-mono text-slate-500">{role.code}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <UsersIcon className="w-3.5 h-3.5" /> {counts[role.id] || 0} pengguna
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-500">
                      <KeyRound className="w-3.5 h-3.5" />
                      <span className="font-mono">{role.id}</span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-medium text-slate-500 mb-2">
                      Permission ({codes.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {codes.length === 0 ? (
                        <span className="text-xs text-slate-400">Tidak ada permission</span>
                      ) : (
                        codes.map((c) => (
                          <span key={c} className="inline-flex px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 font-mono">
                            {c}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}

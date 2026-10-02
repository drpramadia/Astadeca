'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { StatusBadge } from '@/components/ui/status-badge'
import {
  Plus, Search, Loader2, UserPlus, ChevronDown, KeyRound, ShieldCheck, UserX, UserCheck,
} from 'lucide-react'

type Role = { id: string; name: string; code: string }

type ManagedUser = {
  id: string
  email: string | null
  username: string | null
  full_name: string | null
  is_active: boolean
  organization_id: string | null
  role_id: string | null
  role_code: string | null
  role_name: string | null
  last_sign_in_at: string | null
}

async function callAdmin(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/admin-users`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify(body),
    },
  )
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Request gagal')
  return json
}

export default function UsersPage() {
  const { isSystemAdmin, loaded, organizationId } = useSession()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ username: '', full_name: '', email: '', password: '', role_id: '' })

  useEffect(() => {
    if (!loaded || !isSystemAdmin) return
    loadAll()
  }, [loaded, isSystemAdmin])

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [{ data: rls }, adminRes] = await Promise.all([
        supabase.from('roles').select('id, name, code').order('code'),
        callAdmin({ action: 'list' }),
      ])
      setRoles((rls as Role[]) || [])
      setUsers(adminRes.users || [])
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await callAdmin({
        action: 'create',
        username: form.username.trim(),
        full_name: form.full_name.trim() || form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        role_id: form.role_id || null,
        organization_id: organizationId,
      })
      setShowForm(false)
      setForm({ username: '', full_name: '', email: '', password: '', role_id: '' })
      await loadAll()
    } catch (e) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  async function changeRole(u: ManagedUser, roleId: string) {
    setBusy(u.id)
    setError(null)
    try {
      await callAdmin({ action: 'set_role', user_id: u.id, role_id: roleId, organization_id: u.organization_id || organizationId })
      await loadAll()
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  async function toggleActive(u: ManagedUser) {
    setBusy(u.id)
    setError(null)
    try {
      await callAdmin({ action: 'set_active', user_id: u.id, is_active: !u.is_active })
      await loadAll()
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  async function resetPassword(u: ManagedUser) {
    const pw = window.prompt(`Password baru untuk ${u.username ?? u.email}:`)
    if (!pw) return
    setBusy(u.id)
    setError(null)
    try {
      await callAdmin({ action: 'set_password', user_id: u.id, password: pw })
      window.alert('Password diperbarui.')
    } catch (e) { setError((e as Error).message) }
    setBusy(null)
  }

  if (loaded && !isSystemAdmin) {
    return (
      <AppShell>
        <div className="p-6 text-center text-slate-500">Halaman ini hanya untuk System Administrator.</div>
      </AppShell>
    )
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    return [u.username, u.full_name, u.email, u.role_code].some((v) => v?.toLowerCase().includes(q))
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Manajemen Pengguna</h1>
            <p className="mt-1 text-sm text-slate-500">Kelola karyawan, role, dan hak akses</p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" /> <span>Tambah Pengguna</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>
        )}

        {showForm && (
          <form onSubmit={handleCreate} className="mb-6 bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username *</label>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Lengkap</label>
                <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password *</label>
                <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Role *</label>
                <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">-- Pilih Role --</option>
                  {roles.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.code})</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />} Simpan
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Batal</button>
            </div>
          </form>
        )}

        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari nama, username, email, atau role..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Nama</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Username</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Email</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Role</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">Belum ada pengguna</td></tr>
              ) : filtered.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{u.full_name ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600 font-mono text-xs">{u.username ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email ?? '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
                      <select
                        value={u.role_id ?? ''}
                        disabled={busy === u.id}
                        onChange={(e) => changeRole(u, e.target.value)}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                      >
                        <option value="">-</option>
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={u.is_active ? 'ACTIVE' : 'INACTIVE'} label={u.is_active ? 'Aktif' : 'Nonaktif'} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => resetPassword(u)} disabled={busy === u.id} title="Reset password"
                        className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 transition-colors disabled:opacity-50">
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleActive(u)} disabled={busy === u.id} title={u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 transition-colors disabled:opacity-50">
                        {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}

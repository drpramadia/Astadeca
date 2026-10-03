'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { ShieldCheck, KeyRound, Loader2, User, Mail, AtSign, CheckCircle2, AlertCircle } from 'lucide-react'

export default function AccountPage() {
  const { name, username, email, roleName, roleCode, loaded } = useSession()

  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function validate(): string | null {
    if (!newPw || !confirmPw) return 'Password baru dan konfirmasi wajib diisi.'
    if (newPw.length < 8) return 'Password minimal 8 karakter.'
    if (newPw !== confirmPw) return 'Konfirmasi password tidak cocok.'
    if (newPw === currentPw) return 'Password baru tidak boleh sama dengan yang lama.'
    return null
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    const v = validate()
    if (v) { setError(v); return }

    setSaving(true)

    // Verifikasi password lama dengan mencoba sign-in ulang
    if (currentPw && email) {
      const { error: reauthErr } = await supabase.auth.signInWithPassword({ email, password: currentPw })
      if (reauthErr) {
        setSaving(false)
        setError('Password saat ini salah.')
        return
      }
    }

    const { error: updateErr } = await supabase.auth.updateUser({ password: newPw })
    setSaving(false)
    if (updateErr) { setError(updateErr.message); return }

    setSuccess('Password berhasil diubah. Gunakan password baru saat login berikutnya.')
    setCurrentPw('')
    setNewPw('')
    setConfirmPw('')
  }

  const roleLabel = roleName || roleCode || '-'

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-display">Akun Saya</h1>
          <p className="mt-1 text-sm text-slate-500">Kelola informasi akun dan ganti password</p>
        </div>

        {/* Profil */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <User className="w-4 h-4 text-cyan-600" />
            <h2 className="text-sm font-semibold text-slate-700">Informasi Akun</h2>
          </div>
          <div className="divide-y divide-slate-100">
            <Row icon={User} label="Nama" value={name ?? '-'} />
            <Row icon={AtSign} label="Username" value={username ?? '-'} />
            <Row icon={Mail} label="Email" value={email ?? '-'} />
            <Row icon={ShieldCheck} label="Role" value={roleLabel} />
          </div>
        </div>

        {/* Ganti password */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-cyan-600" />
            <h2 className="text-sm font-semibold text-slate-700">Ganti Password</h2>
          </div>
          <form onSubmit={handleChangePassword} className="p-5 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}
            {success && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> {success}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password Saat Ini</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                autoComplete="current-password"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Masukkan password lama"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password Baru</label>
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Minimal 8 karakter"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Konfirmasi Password</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  autoComplete="new-password"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Ulangi password baru"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || !loaded}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {saving ? 'Menyimpan...' : 'Ganti Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </AppShell>
  )
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="px-5 py-3.5 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <p className="text-sm font-medium text-slate-800 truncate">{value}</p>
    </div>
  )
}

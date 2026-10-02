'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Search, CreditCard, Loader2, X, Plus, Trash2, Pencil, Calendar } from 'lucide-react'

type Payment = {
  id: string
  payment_date: string
  amount: number
  payment_method: string
  bank_account: string | null
  notes: string | null
  reference_type: string | null
  reference_id: string | null
  created_at: string
  profiles: { full_name: string } | null
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Tunai',
  BANK_TRANSFER: 'Transfer',
  CHEQUE: 'Cek',
  OTHER: 'Lainnya',
}

export default function PaymentsPage() {
  const { organizationId, loaded } = useSession()
  const [data, setData] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    amount: '',
    payment_method: 'BANK_TRANSFER',
    bank_account: '',
    notes: '',
    payment_date: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('payments')
      .select('*, profiles(full_name)')
      .eq('organization_id', organizationId)
      .order('payment_date', { ascending: false })
      .limit(500)
    setData((rows as Payment[]) || [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount) {
      alert('Jumlah wajib diisi')
      return
    }
    setSaving(true)
    setError(null)
    const { data: userData } = await supabase.auth.getUser()
    const payload = {
      organization_id: organizationId,
      payment_date: form.payment_date,
      amount: parseFloat(form.amount),
      payment_method: form.payment_method,
      bank_account: form.bank_account || null,
      notes: form.notes || null,
      created_by: userData.user?.id,
    }
    const { error: err } = await supabase.from('payments').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowForm(false)
    setForm({
      amount: '',
      payment_method: 'BANK_TRANSFER',
      bank_account: '',
      notes: '',
      payment_date: new Date().toISOString().split('T')[0],
    })
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus pembayaran ini?')) return
    const { error: err } = await supabase.from('payments').delete().eq('id', id)
    if (err) { alert(err.message); return }
    setData((prev) => prev.filter((p) => p.id !== id))
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.notes?.toLowerCase().includes(q) ||
      r.bank_account?.toLowerCase().includes(q) ||
      r.payment_method?.toLowerCase().includes(q)
    )
  })

  const totalAmount = data.reduce((sum, r) => sum + Number(r.amount), 0)

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => history.back()} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-slate-800 font-display">Payments</h1>
            </div>
            <p className="text-sm text-slate-500">Total: {formatCurrency(totalAmount)}</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> <span>Baru</span>
          </button>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">{error}</div>}

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 bg-white rounded-xl border border-cyan-200 p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jumlah (Rp) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Metode</label>
                <select
                  value={form.payment_method}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="BANK_TRANSFER">Transfer</option>
                  <option value="CASH">Tunai</option>
                  <option value="CHEQUE">Cek</option>
                  <option value="OTHER">Lainnya</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal</label>
                <input
                  type="date"
                  value={form.payment_date}
                  onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">Bank Account</label>
                <input
                  value={form.bank_account}
                  onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="sm:col-span-3">
                <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari metode, bank, atau catatan..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Tanggal</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Jumlah</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Metode</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Bank</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Catatan</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Oleh</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>Belum ada pembayaran</p>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(row.payment_date)}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-cyan-700">
                      {formatCurrency(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{PAYMENT_METHOD_LABELS[row.payment_method] ?? row.payment_method}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{row.bank_account ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{row.notes ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{row.profiles?.full_name ?? '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => handleDelete(row.id)}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}

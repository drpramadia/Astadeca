'use client'

import AppShell from '@/components/app-shell'
import { AccessDenied } from '@/components/access-denied'
import { Modal } from '@/components/ui/modal'
import { DocumentPrintView, type DocumentPrintData } from '@/components/document-print'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Search, DollarSign, Loader2, X, Plus, Trash2, Pencil, Printer } from 'lucide-react'

type Transaction = {
  id: string
  transaction_date: string
  description: string
  amount: number
  type: string
  reference_type: string | null
  reference_id: string | null
  created_at: string
  profiles: { full_name: string } | null
}

export default function FinanceTransactionsPage() {
  const { organizationId, loaded, roleCode } = useSession()
  const canAccess = roleCode === 'ADMIN' || roleCode === 'DIRECTOR' || roleCode === 'SYSTEM_ADMIN'
  const [data, setData] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [printData, setPrintData] = useState<DocumentPrintData | null>(null)
  const [loadingPrint, setLoadingPrint] = useState(false)
  const [form, setForm] = useState({
    description: '',
    amount: '',
    type: 'CREDIT',
    reference_type: '',
    reference_id: '',
    transaction_date: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    let q = supabase
      .from('transactions')
      .select('*, profiles(full_name)')
      .eq('organization_id', organizationId)
      .order('transaction_date', { ascending: false })
      .limit(500)
    if (typeFilter) q = q.eq('type', typeFilter)
    const { data: rows } = await q
    setData((rows as Transaction[]) || [])
    setLoading(false)
  }

  useEffect(() => { if (!loading) fetchData() }, [typeFilter])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.description.trim() || !form.amount) {
      alert('Deskripsi dan jumlah wajib diisi')
      return
    }
    setSaving(true)
    setError(null)
    const { data: userData } = await supabase.auth.getUser()
    const payload = {
      organization_id: organizationId,
      transaction_date: form.transaction_date || new Date().toISOString().split('T')[0],
      description: form.description.trim(),
      amount: parseFloat(form.amount),
      type: form.type,
      reference_type: form.reference_type || null,
      reference_id: form.reference_id || null,
      created_by: userData.user?.id,
    }
    const { error: err } = await supabase.from('transactions').insert(payload)
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowForm(false)
    setForm({
      description: '',
      amount: '',
      type: 'CREDIT',
      reference_type: '',
      reference_id: '',
      transaction_date: new Date().toISOString().split('T')[0],
    })
    fetchData()
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.description?.toLowerCase().includes(q) ||
      r.reference_type?.toLowerCase().includes(q)
    )
  })

  const totalDebit = data.filter((r) => r.type === 'DEBIT').reduce((sum, r) => sum + Number(r.amount), 0)
  const totalCredit = data.filter((r) => r.type === 'CREDIT').reduce((sum, r) => sum + Number(r.amount), 0)

  function openPrintReport() {
    const today = new Date().toISOString().split('T')[0]
    setLoadingPrint(true)
    setPrintData(null)
    setPrintData({
      docType: 'Laporan',
      docNumber: `LAP-TRX-${today}`,
      date: today,
      status: null,
      meta: [
        { label: 'Jumlah Data', value: String(filtered.length) },
        { label: 'Total Debit', value: formatCurrency(totalDebit) },
        { label: 'Total Kredit', value: formatCurrency(totalCredit) },
      ],
      lines: filtered.map((r) => ({
        name: `${formatDate(r.transaction_date)} — ${r.description} (${r.type === 'CREDIT' ? 'Kredit' : 'Debit'})`,
        quantity: r.amount,
        unit: 'Rp',
      })),
      totals: [
        { label: 'Total Debit', value: totalDebit },
        { label: 'Total Kredit', value: totalCredit },
      ],
      signatures: ['Dibuat Oleh', 'Disetujui'],
    })
    setLoadingPrint(false)
  }

  function openPrintRow(row: Transaction) {
    setLoadingPrint(true)
    setPrintData(null)
    setPrintData({
      docType: 'Bukti Transaksi',
      docNumber: `TRX-${row.id.slice(0, 8)}`,
      date: row.transaction_date,
      status: row.type === 'CREDIT' ? 'Kredit' : 'Debit',
      meta: [
        { label: 'Tipe', value: row.type === 'CREDIT' ? 'Kredit (Pemasukan)' : 'Debit (Pengeluaran)' },
        { label: 'Referensi', value: row.reference_type ? `${row.reference_type}#${row.reference_id?.slice(0, 8)}` : '-' },
        { label: 'Oleh', value: row.profiles?.full_name ?? '-' },
      ],
      lines: [
        {
          name: row.description,
          quantity: row.amount,
          unit: 'Rp',
        },
      ],
      totals: [{ label: 'Jumlah', value: row.amount }],
      signatures: ['Dibuat Oleh', 'Diterima Oleh'],
    })
    setLoadingPrint(false)
    }

    if (loaded && !canAccess) return <AccessDenied message="Data transaksi keuangan hanya untuk Admin, Director, atau System Administrator." />

    return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => history.back()} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-slate-800 font-display">Transaksi Keuangan</h1>
            </div>
            <p className="text-sm text-slate-500">
              Total Debit: {formatCurrency(totalDebit)} | Total Kredit: {formatCurrency(totalCredit)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openPrintReport}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-line text-ink text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Printer className="w-4 h-4" /> <span>Cetak Laporan</span>
            </button>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> <span>Baru</span>
            </button>
          </div>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">{error}</div>}

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 bg-white rounded-xl border border-cyan-200 p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Deskripsi *</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipe</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as 'DEBIT' | 'CREDIT' })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="CREDIT">Kredit (Pemasukan)</option>
                  <option value="DEBIT">Debit (Pengeluaran)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal</label>
                <input
                  type="date"
                  value={form.transaction_date}
                  onChange={(e) => setForm({ ...form, transaction_date: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
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

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari deskripsi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Semua Tipe</option>
            <option value="CREDIT">Kredit</option>
            <option value="DEBIT">Debit</option>
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Tanggal</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Deskripsi</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Tipe</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Jumlah</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Ref</th>
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
                    <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>Belum ada transaksi</p>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(row.transaction_date)}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.description}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.type === 'CREDIT'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {row.type === 'CREDIT' ? 'Kredit' : 'Debit'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold">
                      <span className={row.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(row.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {row.reference_type ? `${row.reference_type}#${row.reference_id?.slice(0, 8)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{row.profiles?.full_name ?? '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openPrintRow(row)}
                        className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors"
                        title="Cetak"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pratinjau / cetak laporan transaksi */}
      <Modal open={!!printData || loadingPrint} onClose={() => setPrintData(null)} title="Laporan" size="xl">
        {loadingPrint || !printData ? (
          <div className="py-16 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <DocumentPrintView data={printData} onClose={() => setPrintData(null)} />
        )}
      </Modal>
    </AppShell>
  )
}

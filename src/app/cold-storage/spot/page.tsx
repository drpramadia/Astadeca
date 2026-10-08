'use client'

import AppShell from '@/components/app-shell'
import { Modal } from '@/components/ui/modal'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDate, formatCurrency } from '@/lib/utils'
import { useRentalSettings } from '@/hooks/use-rental-settings'
import { Search, Loader2, X, Plus, CalendarClock, Wallet } from 'lucide-react'

type Spot = {
  id: string
  contract_number: string
  status: string
  start_date: string
  end_date: string | null
  price_per_kg_per_day: number
  spot_kg: number
  is_spot: boolean
  days_paid: number
  days_used: number
  rental_customers: { name: string } | null
  cold_storages: { name: string } | null
}

type Customer = { id: string; name: string }
type ColdStorage = { id: string; name: string }

export default function SpotPage() {
  const { roleCode, loaded, organizationId, userId } = useSession()
  const { settings } = useRentalSettings(organizationId)
  const RATE = settings.tariff_per_kg_per_day
  const [data, setData] = useState<Spot[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [customers, setCustomers] = useState<Customer[]>([])
  const [storages, setStorages] = useState<ColdStorage[]>([])

  const [showNew, setShowNew] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [storageId, setStorageId] = useState('')
  const [kg, setKg] = useState('')
  const [days, setDays] = useState('1')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [topupRow, setTopupRow] = useState<Spot | null>(null)
  const [topupDays, setTopupDays] = useState('1')
  const [topupSaving, setTopupSaving] = useState(false)

  const canManage = roleCode === 'ADMIN' || roleCode === 'DIRECTOR' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded) return
    fetchData()
    loadRefs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('rental_contracts')
      .select('*, rental_customers(name), cold_storages(name)')
      .eq('organization_id', organizationId)
      .eq('is_spot', true)
      .order('created_at', { ascending: false })
      .limit(200)
    setData((rows as unknown as Spot[]) || [])
    setLoading(false)
  }

  async function loadRefs() {
    const [cRes, sRes] = await Promise.all([
      supabase.from('rental_customers').select('id, name').eq('organization_id', organizationId).order('name'),
      supabase.from('cold_storages').select('id, name').eq('organization_id', organizationId).order('name'),
    ])
    setCustomers(cRes.data || [])
    setStorages(sRes.data || [])
  }

  const estimate = (parseFloat(kg) || 0) * RATE * (parseInt(days) || 0)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) { setError('Penyewa wajib dipilih.'); return }
    if (!kg || parseFloat(kg) <= 0) { setError('Berat barang wajib > 0.'); return }
    if (!days || parseInt(days) <= 0) { setError('Jumlah hari wajib > 0.'); return }

    setSaving(true)
    setError(null)

    const { data: numData } = await supabase.rpc('generate_number', { p_prefix: 'SPOT' })
    const contractNumber = numData as string

    // Spot: bayar di depan -> buat kontrak + catat hari dibayar lewat ledger
    const { data: inserted, error: insErr } = await supabase
      .from('rental_contracts')
      .insert({
        organization_id: organizationId,
        customer_id: customerId,
        cold_storage_id: storageId || null,
        contract_number: contractNumber,
        start_date: startDate,
        end_date: null,
        price_per_kg_per_day: RATE,
        spot_kg: parseFloat(kg),
        status: 'ACTIVE',
        is_spot: true,
        days_paid: 0,
        days_used: 0,
        notes: `Titipan harian (spot) — ${days} hari dibayar di depan`,
        created_by: userId,
      })
      .select()
      .single()

    if (insErr || !inserted) { setError(insErr?.message ?? 'Gagal membuat titipan'); setSaving(false); return }

    // Catat top-up hari
    const { error: topupErr } = await supabase.rpc('rental_topup_days', {
      p_contract_id: inserted.id,
      p_days: parseInt(days),
      p_note: 'Pembayaran awal (upfront)',
      p_user: userId,
    })
    if (topupErr) { setError(topupErr.message); setSaving(false); return }

    // Catat pemasukan keuangan (upfront)
    await supabase.from('transactions').insert({
      organization_id: organizationId,
      transaction_date: startDate,
      description: `Titipan harian ${contractNumber} — ${kg}kg x ${RATE} x ${days} hari`,
      amount: estimate,
      type: 'CREDIT',
      reference_type: 'RENTAL_SPOT',
      reference_id: inserted.id,
      created_by: userId,
    })

    setSaving(false)
    setShowNew(false)
    setCustomerId(''); setStorageId(''); setKg(''); setDays('1')
    fetchData()
  }

  async function handleTopup(e: React.FormEvent) {
    e.preventDefault()
    if (!topupRow) return
    setTopupSaving(true)
    const { error: err } = await supabase.rpc('rental_topup_days', {
      p_contract_id: topupRow.id,
      p_days: parseInt(topupDays),
      p_note: 'Perpanjangan hari',
      p_user: userId,
    })
    if (!err) {
      await supabase.from('transactions').insert({
        organization_id: organizationId,
        transaction_date: new Date().toISOString().split('T')[0],
        description: `Perpanjangan ${topupRow.contract_number} — ${topupDays} hari`,
        amount: Number(topupRow.spot_kg) * RATE * (parseInt(topupDays) || 0),
        type: 'CREDIT',
        reference_type: 'RENTAL_SPOT',
        reference_id: topupRow.id,
        created_by: userId,
      })
    }
    setTopupSaving(false)
    if (err) { alert(err.message); return }
    setTopupRow(null)
    setTopupDays('1')
    fetchData()
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return r.contract_number?.toLowerCase().includes(q) || r.rental_customers?.name?.toLowerCase().includes(q)
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Titipan Harian (Spot)</h1>
            <p className="mt-1 text-sm text-slate-500">Titip barang bayar di depan — per hari, bisa diperpanjang (saldo hari tersimpan)</p>
          </div>
          {canManage && (
            <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Titipan Baru
            </button>
          )}
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari nomor titipan atau penyewa..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. Titipan</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Penyewa</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Kg</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Hari Dibayar</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Terpakai</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Saldo Hari</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><CalendarClock className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada titipan harian</p></td></tr>
              ) : (
                filtered.map((row) => {
                  const balance = row.days_paid - row.days_used
                  return (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-cyan-700">{row.contract_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{row.rental_customers?.name ?? '-'}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">{Number(row.spot_kg).toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3 text-center font-mono">{row.days_paid}</td>
                      <td className="px-4 py-3 text-center font-mono">{row.days_used}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${balance > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          <CalendarClock className="w-3 h-3" /> {balance} hari
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {canManage ? (
                          <button onClick={() => setTopupRow(row)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                            <Plus className="w-3.5 h-3.5" /> Perpanjang
                          </button>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Form titipan baru */}
      <Modal open={showNew} onClose={() => setShowNew(false)} title="Titipan Harian Baru" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Penyewa</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">-- Pilih Penyewa --</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cold Storage</label>
            <select value={storageId} onChange={(e) => setStorageId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">-- Pilih Unit --</option>
              {storages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Berat (kg)</label>
              <input type="number" step="0.01" value={kg} onChange={(e) => setKg(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Hari</label>
              <input type="number" value={days} onChange={(e) => setDays(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mulai</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm text-cyan-800 flex items-center gap-2"><Wallet className="w-4 h-4" /> Bayar di depan (upfront)</span>
            <span className="font-mono font-semibold text-cyan-900">{formatCurrency(estimate)}</span>
          </div>
          <p className="text-xs text-slate-400">Rp {RATE}/kg/hari · minimal 1 hari · nitip beberapa jam tetap 1 hari</p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 inline mr-1" />Batal</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Simpan & Bayar
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal perpanjang */}
      <Modal open={!!topupRow} onClose={() => setTopupRow(null)} title="Perpanjang Hari" size="sm">
        <form onSubmit={handleTopup} className="space-y-4">
          <p className="text-sm text-slate-600">
            {topupRow?.contract_number} · saldo saat ini <span className="font-semibold">{(topupRow?.days_paid ?? 0) - (topupRow?.days_used ?? 0)} hari</span>
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tambah Hari</label>
            <input type="number" value={topupDays} onChange={(e) => setTopupDays(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div className="bg-cyan-50 border border-cyan-200 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm text-cyan-800">Biaya tambahan</span>
            <span className="font-mono font-semibold text-cyan-900">
              {formatCurrency(Number(topupRow?.spot_kg ?? 0) * RATE * (parseInt(topupDays) || 0))}
            </span>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setTopupRow(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" disabled={topupSaving} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {topupSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Tambah
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  )
}

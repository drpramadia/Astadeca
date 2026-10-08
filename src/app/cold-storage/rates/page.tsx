'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, DollarSign, Loader2, Pencil, Trash2 } from 'lucide-react'

type Rate = {
  id: string
  cold_storage_id: string | null
  price_per_kg_per_day: number
  minimum_days: number
  minimum_kg: number
  status: string
  created_at: string
  cold_storages: { name: string } | null
}

export default function RatesPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const [data, setData] = useState<Rate[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formData, setFormData] = useState({ cold_storage_id: '', price_per_kg_per_day: '', minimum_days: '1', minimum_kg: '0' })
  const [editId, setEditId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [coldStorages, setColdStorages] = useState<{ id: string; name: string }[]>([])
  

  const canEdit = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded) return
    fetchData()
    loadColdStorages()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('rental_rates')
      .select('*, cold_storages(name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)
    setData((rows as Rate[]) || [])
    setLoading(false)
  }

  async function loadColdStorages() {
    const { data } = await supabase.from('cold_storages').select('id, name').eq('organization_id', organizationId).order('name')
    setColdStorages(data || [])
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      organization_id: organizationId,
      cold_storage_id: formData.cold_storage_id || null,
      price_per_kg_per_day: parseFloat(formData.price_per_kg_per_day) || 0,
      minimum_days: parseInt(formData.minimum_days) || 1,
      minimum_kg: parseFloat(formData.minimum_kg) || 0,
      status: 'ACTIVE',
    }
    if (editId) {
      const { error: err } = await supabase.from('rental_rates').update(payload).eq('id', editId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('rental_rates').insert(payload)
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
    setShowForm(false)
    setEditId(null)
    setFormData({ cold_storage_id: '', price_per_kg_per_day: '', minimum_days: '1', minimum_kg: '0' })
    fetchData()
  }

  function startEdit(row: Rate) {
    setEditId(row.id)
    setFormData({
      cold_storage_id: row.cold_storage_id ?? '',
      price_per_kg_per_day: row.price_per_kg_per_day.toString(),
      minimum_days: row.minimum_days.toString(),
      minimum_kg: row.minimum_kg.toString(),
    })
    setShowForm(true)
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus rate ini?')) return
    await supabase.from('rental_rates').delete().eq('id', id)
    fetchData()
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Rental Rates</h1>
            <p className="mt-1 text-sm text-slate-500">Atur tarif sewa per kg/hari</p>
          </div>
          <div className="flex items-center gap-3">
            {canEdit && (
              <button onClick={() => { setShowForm(true); setEditId(null); setFormData({ cold_storage_id: '', price_per_kg_per_day: '', minimum_days: '1', minimum_kg: '0' }) }} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> <span>Baru</span>
              </button>
            )}
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleSave} className="mb-6 bg-white rounded-xl border border-cyan-200 p-5 space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cold Storage</label>
                <select value={formData.cold_storage_id} onChange={(e) => setFormData({ ...formData, cold_storage_id: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">Semua</option>
                  {coldStorages.map((cs) => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tarif/kg/hari (Rp) *</label>
                <input type="number" step="0.01" value={formData.price_per_kg_per_day} onChange={(e) => setFormData({ ...formData, price_per_kg_per_day: e.target.value })} required className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Min. Hari</label>
                <input type="number" value={formData.minimum_days} onChange={(e) => setFormData({ ...formData, minimum_days: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Min. Kg</label>
                <input type="number" step="0.01" value={formData.minimum_kg} onChange={(e) => setFormData({ ...formData, minimum_kg: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => { setShowForm(false); setEditId(null) }} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Batal</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Menyimpan...' : editId ? 'Update' : 'Simpan'}
              </button>
            </div>
          </form>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Cold Storage</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tarif/kg/hari</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Min. Hari</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Min. Kg</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                {canEdit && <th className="text-right px-4 py-3 font-semibold text-slate-600">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada rate</p></td></tr>
              ) : (
                data.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.cold_storages?.name ?? 'Umum'}</td>
                    <td className="px-4 py-3 text-right font-mono text-cyan-700">Rp {row.price_per_kg_per_day.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.minimum_days}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.minimum_kg.toLocaleString('id-ID')} kg</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={row.status} />
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => startEdit(row)} className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-slate-100 text-slate-400 hover:text-cyan-600 transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(row.id)} className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    )}
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

'use client'

import AppShell from '@/components/app-shell'
import { Modal } from '@/components/ui/modal'
import { QrCode } from '@/components/qr-code'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { printElement } from '@/lib/print'
import {
  Search,
  Loader2,
  Plus,
  Printer,
  Boxes,
  Warehouse,
  Trash2,
  X,
} from 'lucide-react'

type Basket = {
  id: string
  code: string
  capacity_kg: number
  status: string
  zone_id: string
  cold_storage_zones: { id: string; name: string; code: string; cold_storage_id: string; cold_storages: { id: string; name: string; code: string } | null } | null
}

type Zone = {
  id: string
  name: string
  code: string
  cold_storage_id: string
  cold_storages: { id: string; name: string; code: string } | null
}

type Storage = { id: string; name: string; code: string }

export default function BasketsPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const [baskets, setBaskets] = useState<Basket[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [storages, setStorages] = useState<Storage[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [storageFilter, setStorageFilter] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [formZone, setFormZone] = useState('')
  const [formCode, setFormCode] = useState('')
  const [formCapacity, setFormCapacity] = useState('500')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [printAll, setPrintAll] = useState(false)

  const canManage = roleCode === 'SYSTEM_ADMIN' || roleCode === 'ADMIN'

  useEffect(() => {
    if (!loaded) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const [bRes, zRes, sRes] = await Promise.all([
      supabase
        .from('cold_storage_baskets')
        .select('*, cold_storage_zones(id, name, code, cold_storage_id, cold_storages(id, name, code))')
        .order('code'),
      supabase.from('cold_storage_zones').select('*, cold_storages(id, name, code)').order('code'),
      supabase.from('cold_storages').select('id, name, code').eq('organization_id', organizationId).order('code'),
    ])
    setBaskets((bRes.data as unknown as Basket[]) || [])
    setZones((zRes.data as unknown as Zone[]) || [])
    setStorages((sRes.data as Storage[]) || [])
    setLoading(false)
  }

  function nextBasketCode(zoneId: string): string {
    const zone = zones.find((z) => z.id === zoneId)
    if (!zone) return ''
    const existing = baskets.filter((b) => b.zone_id === zoneId)
    const num = existing.length + 1
    return `${zone.code}-B${String(num).padStart(2, '0')}`
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!formZone) { setError('Pilih zona dulu.'); return }
    setSaving(true)
    setError(null)
    const code = formCode.trim() || nextBasketCode(formZone)
    const { error: err } = await supabase.from('cold_storage_baskets').insert({
      zone_id: formZone,
      code,
      capacity_kg: parseFloat(formCapacity) || 500,
      status: 'AVAILABLE',
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowForm(false)
    setFormCode('')
    setFormCapacity('500')
    fetchData()
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus basket ini?')) return
    const { error: err } = await supabase.from('cold_storage_baskets').delete().eq('id', id)
    if (err) { alert(err.message); return }
    setBaskets((prev) => prev.filter((b) => b.id !== id))
  }

  const filtered = baskets.filter((b) => {
    const q = search.toLowerCase()
    const matchSearch = b.code.toLowerCase().includes(q) || b.cold_storage_zones?.code?.toLowerCase().includes(q)
    const matchStorage = !storageFilter || b.cold_storage_zones?.cold_storage_id === storageFilter
    return matchSearch && matchStorage
  })

  const statusColor = (s: string) =>
    s === 'AVAILABLE' ? 'bg-green-100 text-green-700'
    : s === 'FULL' ? 'bg-red-100 text-red-700'
    : s === 'OCCUPIED' ? 'bg-amber-100 text-amber-700'
    : 'bg-slate-100 text-slate-600'

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Keranjang & Lokasi</h1>
            <p className="mt-1 text-sm text-slate-500">Kelola basket penyimpanan per zona cold storage + cetak label QR</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPrintAll(true)}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              <Printer className="w-4 h-4" /> Cetak Semua Label
            </button>
            {canManage && (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" /> Basket Baru
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Cari kode basket atau zona..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <select value={storageFilter} onChange={(e) => setStorageFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Semua Cold Storage</option>
            {storages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="text-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 text-center py-16 text-slate-400">
            <Boxes className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p>Belum ada basket</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((b) => (
              <div key={b.id} className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col items-center">
                <QrCode value={b.code} size={96} />
                <p className="mt-3 font-mono font-semibold text-slate-800 text-sm">{b.code}</p>
                <p className="text-xs text-slate-500">{b.cold_storage_zones?.cold_storages?.name ?? '-'} · {b.cold_storage_zones?.name ?? '-'}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusColor(b.status)}`}>{b.status}</span>
                  <span className="text-[11px] text-slate-400">{b.capacity_kg} kg</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  {canManage && (
                    <button onClick={() => handleDelete(b.id)} className="inline-flex items-center gap-1 text-xs text-red-500 hover:bg-red-50 rounded px-2 py-1">
                      <Trash2 className="w-3 h-3" /> Hapus
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form basket baru */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Basket Baru" size="md">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Zona</label>
            <select
              value={formZone}
              onChange={(e) => { setFormZone(e.target.value); setFormCode(nextBasketCode(e.target.value)) }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">-- Pilih Zona --</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.cold_storages?.name ?? '-'} · {z.name} ({z.code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kode Basket</label>
              <input type="text" value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="CS-01-A-B01" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kapasitas (kg)</label>
              <input type="number" value={formCapacity} onChange={(e) => setFormCapacity(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 inline mr-1" />Batal</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Simpan
            </button>
          </div>
        </form>
      </Modal>

      {/* Cetak label QR */}
      <Modal open={printAll} onClose={() => setPrintAll(false)} title="Cetak Label QR Basket" size="xl">
        <div className="no-print flex justify-end mb-4">
          <button
            onClick={() => printElement('print-labels', 'Label Basket')}
            className="inline-flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg"
          >
            <Printer className="w-4 h-4" /> Cetak / PDF
          </button>
        </div>
        <div id="print-labels" className="print-page bg-white">
          <div className="grid grid-cols-3 gap-3">
            {filtered.map((b) => (
              <div key={b.id} className="border border-slate-300 rounded-lg p-3 flex flex-col items-center text-center">
                <QrCode value={b.code} size={90} />
                <p className="mt-2 font-mono font-bold text-slate-800 text-xs">{b.code}</p>
                <p className="text-[10px] text-slate-500">{b.cold_storage_zones?.cold_storages?.name ?? ''}</p>
                <p className="text-[10px] text-slate-500">{b.capacity_kg} kg</p>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </AppShell>
  )
}

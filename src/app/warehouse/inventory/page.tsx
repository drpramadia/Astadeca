'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { Modal } from '@/components/ui/modal'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Search, Boxes, Loader2, MapPin, X } from 'lucide-react'

type Inv = {
  id: string
  quantity_kg: number
  batch_number: string | null
  status: string
  expiry_date: string | null
  received_at: string | null
  basket_id: string | null
  cold_storage_id: string | null
  products: { name: string; sku: string } | null
  cold_storages: { name: string } | null
  cold_storage_baskets: { code: string } | null
}

type Basket = { id: string; code: string; cold_storage_id: string | null; zone: string | null }

export default function InventoryPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const [data, setData] = useState<Inv[]>([])
  const [baskets, setBaskets] = useState<Basket[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [assignRow, setAssignRow] = useState<Inv | null>(null)
  const [assignBasket, setAssignBasket] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canAssign = roleCode === 'WAREHOUSE' || roleCode === 'SYSTEM_ADMIN' || roleCode === 'ADMIN'

  useEffect(() => {
    if (!loaded) return
    fetchData()
    loadBaskets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    let q = supabase
      .from('inventory')
      .select('*, products(name, sku), cold_storages(name), cold_storage_baskets(code)')
      .eq('organization_id', organizationId)
      .order('received_at', { ascending: false })
      .limit(200)
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data: rows } = await q
    setData((rows as unknown as Inv[]) || [])
    setLoading(false)
  }

  async function loadBaskets() {
    const { data: rows } = await supabase
      .from('cold_storage_baskets')
      .select('id, code, cold_storage_id, cold_storage_zones(cold_storage_id)')
      .order('code')
    const mapped = ((rows as unknown as { id: string; code: string; cold_storage_zones: { cold_storage_id: string } | null }[]) || []).map((b) => ({
      id: b.id,
      code: b.code,
      cold_storage_id: b.cold_storage_zones?.cold_storage_id ?? null,
      zone: null,
    }))
    setBaskets(mapped)
  }

  useEffect(() => { if (!loading) fetchData() }, [statusFilter])

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!assignRow) return
    setAssigning(true)
    setError(null)
    const basket = baskets.find((b) => b.id === assignBasket)
    const { error: err } = await supabase
      .from('inventory')
      .update({ basket_id: assignBasket || null, cold_storage_id: basket?.cold_storage_id ?? assignRow.cold_storage_id })
      .eq('id', assignRow.id)
    setAssigning(false)
    if (err) { setError(err.message); return }
    setAssignRow(null)
    setAssignBasket('')
    fetchData()
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.products?.name?.toLowerCase().includes(q) ||
      r.products?.sku?.toLowerCase().includes(q) ||
      r.batch_number?.toLowerCase().includes(q) ||
      r.cold_storage_baskets?.code?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Inventory</h1>
            <p className="mt-1 text-sm text-slate-500">Stok barang & penempatan keranjang</p>
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Cari produk, SKU, batch, atau basket..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Semua Status</option>
            <option value="AVAILABLE">Available</option>
            <option value="QUARANTINE">Quarantine</option>
            <option value="RESERVED">Reserved</option>
            <option value="USED">Used</option>
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Produk</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">SKU</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Batch</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Qty (kg)</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Basket / Lokasi</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Exp. Date</th>
                {canAssign && <th className="text-center px-4 py-3 font-semibold text-slate-600">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canAssign ? 8 : 7} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={canAssign ? 8 : 7} className="text-center py-12 text-slate-400"><Boxes className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada inventory</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.products?.name ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{row.products?.sku ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{row.batch_number ?? '-'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">{row.quantity_kg.toLocaleString('id-ID')} kg</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {row.cold_storage_baskets?.code
                        ? <span className="inline-flex items-center gap-1 font-mono text-cyan-700"><MapPin className="w-3 h-3" />{row.cold_storage_baskets.code}</span>
                        : (row.cold_storages?.name ?? '-')}
                    </td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">
                      {row.expiry_date ? new Date(row.expiry_date).toLocaleDateString('id-ID') : '-'}
                    </td>
                    {canAssign && (
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => { setAssignRow(row); setAssignBasket(row.basket_id ?? '') }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
                        >
                          <MapPin className="w-3.5 h-3.5" /> Atur Lokasi
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal atur lokasi basket */}
      <Modal open={!!assignRow} onClose={() => setAssignRow(null)} title="Atur Lokasi Basket" size="md">
        <form onSubmit={handleAssign} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div>
            <p className="text-sm text-slate-600 mb-2">
              <span className="font-medium">{assignRow?.products?.name}</span> · batch {assignRow?.batch_number ?? '-'} · {assignRow?.quantity_kg} kg
            </p>
            <label className="block text-sm font-medium text-slate-700 mb-1">Pilih Basket</label>
            <select value={assignBasket} onChange={(e) => setAssignBasket(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">-- Tanpa basket (hanya unit) --</option>
              {baskets.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setAssignRow(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 inline mr-1" />Batal</button>
            <button type="submit" disabled={assigning} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />} Simpan
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  )
}

'use client'

import AppShell from '@/components/app-shell'
import { AccessDenied } from '@/components/access-denied'
import { Modal } from '@/components/ui/modal'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Search, ArrowUpFromLine, Loader2, Package, Plus, X, AlertCircle } from 'lucide-react'

type Issue = {
  id: string
  movement_type: string
  quantity_kg: number
  batch_number: string | null
  reference_type: string | null
  performed_at: string
  products: { name: string; sku: string } | null
  profiles: { full_name: string } | null
}

type StockRow = {
  id: string
  quantity_kg: number
  batch_number: string | null
  product_id: string
  products: { name: string; sku: string } | null
  cold_storage_baskets: { code: string } | null
}

const TYPE_COLORS: Record<string, string> = {
  IN: 'bg-green-100 text-green-700',
  OUT: 'bg-amber-100 text-amber-700',
  TRANSFER: 'bg-blue-100 text-blue-700',
  ADJUST: 'bg-purple-100 text-purple-700',
}

export default function GoodsIssuesPage() {
  const { loaded, organizationId, userId, roleCode } = useSession()
  const canAccess = roleCode === 'WAREHOUSE' || roleCode === 'SYSTEM_ADMIN' || roleCode === 'ADMIN'

  const [data, setData] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [stock, setStock] = useState<StockRow[]>([])
  const [stockId, setStockId] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  useEffect(() => {
    if (showForm) loadStock()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('inventory_movements')
      .select('*, products(name, sku), profiles(full_name)')
      .eq('organization_id', organizationId)
      .eq('movement_type', 'OUT')
      .order('performed_at', { ascending: false })
      .limit(100)
    setData((rows as unknown as Issue[]) || [])
    setLoading(false)
  }

  async function loadStock() {
    const { data: rows } = await supabase
      .from('inventory')
      .select('id, quantity_kg, batch_number, product_id, products(name, sku), cold_storage_baskets(code)')
      .eq('organization_id', organizationId)
      .gt('quantity_kg', 0)
      .order('received_at', { ascending: true })
      .limit(200)
    setStock((rows as unknown as StockRow[]) || [])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const row = stock.find((s) => s.id === stockId)
    const q = parseFloat(qty)
    if (!row) { setError('Pilih barang dulu.'); return }
    if (!q || q <= 0) { setError('Jumlah harus lebih dari 0.'); return }
    if (q > Number(row.quantity_kg)) { setError(`Stok hanya ${row.quantity_kg} kg.`); return }

    setSaving(true)
    setError(null)

    // Kurangi stok
    const { error: updErr } = await supabase
      .from('inventory')
      .update({ quantity_kg: Number(row.quantity_kg) - q })
      .eq('id', row.id)
    if (updErr) { setError(updErr.message); setSaving(false); return }

    // Catat movement OUT
    const { error: mvErr } = await supabase.from('inventory_movements').insert({
      organization_id: organizationId,
      movement_type: 'OUT',
      product_id: row.product_id,
      batch_number: row.batch_number,
      quantity_kg: q,
      from_location: row.cold_storage_baskets?.code ?? 'WAREHOUSE',
      reference_type: 'MANUAL',
      notes: reason || 'Pengeluaran barang manual (warehouse)',
      performed_by: userId,
    })
    if (mvErr) { setError(mvErr.message); setSaving(false); return }

    setSaving(false)
    setShowForm(false)
    setStockId(''); setQty(''); setReason('')
    fetchData()
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.products?.name?.toLowerCase().includes(q) ||
      r.products?.sku?.toLowerCase().includes(q) ||
      r.batch_number?.toLowerCase().includes(q)
    )
  })

  const selected = stock.find((s) => s.id === stockId)

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Pengeluaran Barang</h1>
            <p className="mt-1 text-sm text-slate-500">Goods Issue — pelepasan stok barang dari gudang</p>
          </div>
          {(roleCode === 'WAREHOUSE' || roleCode === 'SYSTEM_ADMIN') && (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> Keluar Barang
            </button>
          )}
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari produk, SKU, atau batch..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Produk</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">SKU</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Batch</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Qty (kg)</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Tipe</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Oleh</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Package className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada pengeluaran</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.products?.name ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{row.products?.sku ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{row.batch_number ?? '-'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-amber-700">{row.quantity_kg.toLocaleString('id-ID')} kg</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[row.movement_type] ?? 'bg-slate-100 text-slate-600'}`}>{row.movement_type}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.profiles?.full_name ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">{new Date(row.performed_at).toLocaleDateString('id-ID')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal keluar barang manual */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Pengeluaran Barang" size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Barang (dari stok)</label>
            <select value={stockId} onChange={(e) => setStockId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">-- Pilih barang --</option>
              {stock.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.products?.name ?? '-'}{s.batch_number ? ` · ${s.batch_number}` : ''} — {Number(s.quantity_kg).toLocaleString('id-ID')} kg{s.cold_storage_baskets?.code ? ` @${s.cold_storage_baskets.code}` : ''}
                </option>
              ))}
            </select>
            {stock.length === 0 && <p className="text-xs text-slate-400 mt-1">Tidak ada stok tersedia.</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Jumlah Keluar (kg)</label>
              <input type="number" step="0.01" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder={selected ? `maks ${selected.quantity_kg}` : '0'} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sisa Stok</label>
              <div className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 text-slate-600">
                {selected ? `${Math.max(0, Number(selected.quantity_kg) - (parseFloat(qty) || 0)).toLocaleString('id-ID')} kg` : '-'}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Keterangan / Alasan</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="mis. penjualan, rusak, transfer" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 inline mr-1" />Batal</button>
            <button type="submit" disabled={saving || !stockId} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpFromLine className="w-4 h-4" />} Keluarkan
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  )
}

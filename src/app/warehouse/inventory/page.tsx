'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Search, Boxes, Loader2 } from 'lucide-react'

const ORG_ID = '20000000-0000-0000-0000-000000000001'

type Inv = {
  id: string
  quantity_kg: number
  batch_number: string | null
  status: string
  expiry_date: string | null
  received_at: string | null
  products: { name: string; sku: string } | null
  cold_storages: { name: string } | null
}

export default function InventoryPage() {
  const { roleCode, loaded } = useSession()
  const [data, setData] = useState<Inv[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  

  const isWarehouse = roleCode === 'WAREHOUSE'

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    let q = supabase
      .from('inventory')
      .select('*, products(name, sku), cold_storages(name)')
      .eq('organization_id', ORG_ID)
      .order('received_at', { ascending: false })
      .limit(200)
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data: rows } = await q
    setData((rows as Inv[]) || [])
    setLoading(false)
  }

  useEffect(() => { if (!loading) fetchData() }, [statusFilter])

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.products?.name?.toLowerCase().includes(q) ||
      r.products?.sku?.toLowerCase().includes(q) ||
      r.batch_number?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Inventory</h1>
            <p className="mt-1 text-sm text-slate-500">
              {isWarehouse ? 'Stok barang di gudang (Hanya lihat)' : 'Stok barang di gudang'}
            </p>
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Cari produk, SKU, atau batch..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
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
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Lokasi</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Exp. Date</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Boxes className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada inventory</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.products?.name ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{row.products?.sku ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{row.batch_number ?? '-'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">{row.quantity_kg.toLocaleString('id-ID')} kg</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{row.cold_storages?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">
                      {row.expiry_date ? new Date(row.expiry_date).toLocaleDateString('id-ID') : '-'}
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

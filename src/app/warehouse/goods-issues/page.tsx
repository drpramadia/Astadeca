'use client'

import AppShell from '@/components/app-shell'
import LogoutButton from '@/components/logout-button'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Search, ArrowUpFromLine, Loader2, Package } from 'lucide-react'

const ORG_ID = '20000000-0000-0000-0000-000000000001'

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

const TYPE_COLORS: Record<string, string> = {
  IN: 'bg-green-100 text-green-700',
  OUT: 'bg-amber-100 text-amber-700',
  TRANSFER: 'bg-blue-100 text-blue-700',
  ADJUST: 'bg-purple-100 text-purple-700',
}

export default function GoodsIssuesPage() {
  const { loaded } = useSession()
  const [data, setData] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('inventory_movements')
      .select('*, products(name, sku), profiles(full_name)')
      .eq('organization_id', ORG_ID)
      .eq('movement_type', 'OUT')
      .order('performed_at', { ascending: false })
      .limit(100)
    setData((rows as Issue[]) || [])
    setLoading(false)
  }

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
            <h1 className="text-2xl font-bold text-slate-800 font-display">Pengeluaran Barang</h1>
            <p className="mt-1 text-sm text-slate-500">Goods Issue — pelepasan stok barang</p>
          </div>
          <LogoutButton />
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari produk, SKU, atau batch..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
    </AppShell>
  )
}

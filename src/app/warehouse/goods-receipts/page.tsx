'use client'

import AppShell from '@/components/app-shell'
import LogoutButton from '@/components/logout-button'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Search, ArrowDownToLine, Loader2, Package } from 'lucide-react'

const ORG_ID = '20000000-0000-0000-0000-000000000001'

type GR = {
  id: string
  gr_number: string
  received_at: string
  notes: string | null
  purchase_orders: { po_number: string } | null
  profiles: { full_name: string } | null
}

export default function GoodsReceiptsPage() {
  const { roleName, loaded } = useSession()
  const [data, setData] = useState<GR[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('goods_receipts')
      .select('*, purchase_orders(po_number), profiles(full_name)')
      .eq('organization_id', ORG_ID)
      .order('received_at', { ascending: false })
      .limit(100)
    setData((rows as GR[]) || [])
    setLoading(false)
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.gr_number?.toLowerCase().includes(q) ||
      r.purchase_orders?.po_number?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Penerimaan Barang</h1>
            <p className="mt-1 text-sm text-slate-500">Goods Receipt — barang masuk dari supplier</p>
          </div>
          <LogoutButton />
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari GR number atau PO..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. GR</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">PO Ref.</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Diterima Oleh</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Catatan</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400"><Package className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada goods receipt</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-green-700">{row.gr_number}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{row.purchase_orders?.po_number ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.profiles?.full_name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{row.notes ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">{new Date(row.received_at).toLocaleDateString('id-ID')}</td>
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

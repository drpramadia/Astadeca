'use client'

import AppShell from '@/components/app-shell'
import LogoutButton from '@/components/logout-button'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, Search, ShoppingCart, Loader2 } from 'lucide-react'

const ORG_ID = '20000000-0000-0000-0000-000000000001'

type PO = {
  id: string
  po_number: string
  status: string
  notes: string | null
  created_at: string
  suppliers: { name: string } | null
  profiles: { full_name: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-100 text-red-700',
  ORDERED: 'bg-indigo-100 text-indigo-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

export default function PurchaseOrdersPage() {
  const { roleName, loaded } = useSession()
  const [data, setData] = useState<PO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  

  const canAccess = roleName === 'DIRECTOR' || roleName === 'ADMIN'

  useEffect(() => {
    if (!loaded || !canAccess) return
    fetchData()
  }, [loaded, canAccess])

  async function fetchData() {
    setLoading(true)
    let q = supabase
      .from('purchase_orders')
      .select('*, suppliers(name), profiles(full_name)')
      .eq('organization_id', ORG_ID)
      .order('created_at', { ascending: false })
      .limit(100)
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data: rows } = await q
    setData((rows as PO[]) || [])
    setLoading(false)
  }

  useEffect(() => { if (!loading) fetchData() }, [statusFilter])

  if (loaded && !canAccess) {
    return <AppShell><div className="p-6 text-center text-slate-500">Anda tidak memiliki akses.</div></AppShell>
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.po_number?.toLowerCase().includes(q) ||
      r.suppliers?.name?.toLowerCase().includes(q) ||
      r.notes?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Purchase Orders</h1>
            <p className="mt-1 text-sm text-slate-500">Kelola pesanan pembelian</p>
          </div>
          <div className="flex items-center gap-3">
            <LogoutButton />
            {canAccess && (
              <Link href="/operational/purchase-orders/new" className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> <span>PO Baru</span>
              </Link>
            )}
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Cari PO atau supplier..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="">Semua Status</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="ORDERED">Ordered</option>
            <option value="RECEIVED">Received</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. PO</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Supplier</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Dibuat Oleh</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400"><ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada Purchase Order</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-cyan-700">{row.po_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.suppliers?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.profiles?.full_name ?? '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] ?? 'bg-slate-100 text-slate-600'}`}>{row.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">{new Date(row.created_at).toLocaleDateString('id-ID')}</td>
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

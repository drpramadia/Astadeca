'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, Search, FileSignature, Loader2, ArrowRight } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Rfq = {
  id: string
  rfq_number: string
  customer_name: string | null
  request_date: string
  needed_by: string | null
  status: string
  notes: string | null
  customers: { name: string } | null
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Terbuka',
  QUOTED: 'Sudah Ditawar',
  WON: 'Menang',
  LOST: 'Kalah',
  CANCELLED: 'Dibatalkan',
}

export default function RfqCustomerPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const [data, setData] = useState<Rfq[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded || !canAccess) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, canAccess])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('customer_rfq')
      .select('*, customers(name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)
    setData((rows as Rfq[]) || [])
    setLoading(false)
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.rfq_number?.toLowerCase().includes(q) ||
      (r.customer_name ?? r.customers?.name ?? '').toLowerCase().includes(q)
    )
  })

  if (loaded && !canAccess) {
    return <AppShell><div className="p-6 text-center text-slate-500">Anda tidak memiliki akses.</div></AppShell>
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Permintaan Harga (Calon Customer)</h1>
            <p className="mt-1 text-sm text-slate-500">Input permintaan harga dari calon customer, lalu teruskan ke supplier</p>
          </div>
          <Link href="/operational/rfq-customer/new" className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> Permintaan Baru
          </Link>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari nomor atau customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. Permintaan</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Calon Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Tanggal</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Dibutuhkan</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><FileSignature className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada permintaan harga</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-cyan-700">
                      <Link href={`/operational/rfq-customer/${row.id}`} className="hover:underline">{row.rfq_number}</Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.customer_name ?? row.customers?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(row.request_date)}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{row.needed_by ? formatDate(row.needed_by) : '-'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/operational/rfq-customer/${row.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5">
                        Detail <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <p className="mt-3 text-xs text-slate-400">Status: {Object.entries(STATUS_LABEL).map(([k, v]) => `${k}=${v}`).join(' · ')}</p>
        )}
      </div>
    </AppShell>
  )
}

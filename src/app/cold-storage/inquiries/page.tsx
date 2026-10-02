'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, Search, FileText, Loader2 } from 'lucide-react'

const ORG_ID = '20000000-0000-0000-0000-000000000001'

type Inquiry = {
  id: string
  status: string
  requested_kg: number
  start_date: string | null
  end_date: string | null
  notes: string | null
  created_at: string
  rental_customers: { name: string } | null
  cold_storages: { name: string } | null
}

export default function InquiryPage() {
  const { roleCode, loaded } = useSession()
  const [data, setData] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN'

  useEffect(() => {
    if (!loaded) return
    if (!canAccess) return
    fetchData()
  }, [loaded, canAccess])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('rental_inquiries')
      .select('*, rental_customers(name), cold_storages(name)')
      .eq('organization_id', ORG_ID)
      .order('created_at', { ascending: false })
      .limit(50)
    setData((rows as Inquiry[]) || [])
    setLoading(false)
  }

  if (loaded && !canAccess) {
    return (
      <AppShell>
        <div className="p-6 text-center text-slate-500">Anda tidak memiliki akses ke halaman ini.</div>
      </AppShell>
    )
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.rental_customers?.name?.toLowerCase().includes(q) ||
      r.cold_storages?.name?.toLowerCase().includes(q) ||
      r.notes?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Rental Inquiry</h1>
            <p className="mt-1 text-sm text-slate-500">Kelola permintaan sewa cold storage</p>
          </div>
          <div className="flex items-center gap-3">
            {canAccess && (
              <Link
                href="/cold-storage/inquiries/new"
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Baru</span>
              </Link>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari customer atau cold storage..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Cold Storage</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Kg Diminta</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Periode</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>Belum ada inquiry</p>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.rental_customers?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.cold_storages?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.requested_kg.toLocaleString('id-ID')} kg</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {row.start_date ? `${new Date(row.start_date).toLocaleDateString('id-ID')} - ${row.end_date ? new Date(row.end_date).toLocaleDateString('id-ID') : '-'}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">
                      {new Date(row.created_at).toLocaleDateString('id-ID')}
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

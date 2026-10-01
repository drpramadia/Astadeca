'use client'

import AppShell from '@/components/app-shell'
import LogoutButton from '@/components/logout-button'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, Search, FileText, Loader2 } from 'lucide-react'

const ORG_ID = '20000000-0000-0000-0000-000000000001'

type Contract = {
  id: string
  contract_number: string
  status: string
  start_date: string
  end_date: string
  price_per_kg_per_day: number
  total_estimated_kg: number
  notes: string | null
  created_at: string
  rental_customers: { name: string } | null
  cold_storages: { name: string } | null
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-600',
}

export default function ContractsPage() {
  const { roleName, loaded } = useSession()
  const [data, setData] = useState<Contract[]>([])
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
      .from('rental_contracts')
      .select('*, rental_customers(name), cold_storages(name)')
      .eq('organization_id', ORG_ID)
      .order('created_at', { ascending: false })
      .limit(100)
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data: rows } = await q
    setData((rows as Contract[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!loading) fetchData()
  }, [statusFilter])

  if (loaded && !canAccess) {
    return (
      <AppShell>
        <div className="p-6 text-center text-slate-500">Anda tidak memiliki akses.</div>
      </AppShell>
    )
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.contract_number?.toLowerCase().includes(q) ||
      r.rental_customers?.name?.toLowerCase().includes(q) ||
      r.cold_storages?.name?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Kontrak Rental</h1>
            <p className="mt-1 text-sm text-slate-500">Daftar kontrak sewa cold storage</p>
          </div>
          <div className="flex items-center gap-3">
            <LogoutButton />
            {canAccess && (
              <Link href="/cold-storage/contracts/new" className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> <span>Baru</span>
              </Link>
            )}
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Cari nomor kontrak atau customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
            <option value="">Semua Status</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRED">Expired</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. Kontrak</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Cold Storage</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Kg Est.</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tarif/kg/hari</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Periode</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><FileText className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada kontrak</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-cyan-700">{row.contract_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.rental_customers?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.cold_storages?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.total_estimated_kg.toLocaleString('id-ID')} kg</td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">Rp {row.price_per_kg_per_day.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">
                      {new Date(row.start_date).toLocaleDateString('id-ID')} - {new Date(row.end_date).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[row.status] ?? 'bg-slate-100 text-slate-600'}`}>{row.status}</span>
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

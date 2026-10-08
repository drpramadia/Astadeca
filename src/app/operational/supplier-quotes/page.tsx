'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { Search, DollarSign, Loader2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Quote = {
  id: string
  quote_number: string
  quote_date: string
  valid_until: string | null
  status: string
  suppliers: { name: string } | null
  supplier_rfq: { rfq_number: string } | null
}

export default function SupplierQuotesPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const [data, setData] = useState<Quote[]>([])
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
      .from('supplier_quotes')
      .select('id, quote_number, quote_date, valid_until, status, suppliers(name), supplier_rfq(rfq_number)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)
    setData((rows as unknown as Quote[]) || [])
    setLoading(false)
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return r.quote_number?.toLowerCase().includes(q) || (r.suppliers?.name ?? '').toLowerCase().includes(q)
  })

  if (loaded && !canAccess) return <AppShell><div className="p-6 text-center text-slate-500">Anda tidak memiliki akses.</div></AppShell>

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 font-display">Harga Supplier</h1>
          <p className="mt-1 text-sm text-slate-500">Daftar harga beli yang diberikan supplier untuk setiap RFQ</p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari nomor atau supplier..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. Harga</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Supplier</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Dari RFQ</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Tanggal</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Berlaku s/d</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada harga supplier</p></td></tr>
              ) : filtered.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-cyan-700">
                    {row.supplier_rfq ? <Link href={`/operational/rfq-supplier/${row.id}`} className="hover:underline">{row.quote_number}</Link> : row.quote_number}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{row.suppliers?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs font-mono">{row.supplier_rfq?.rfq_number ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(row.quote_date)}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{row.valid_until ? formatDate(row.valid_until) : '-'}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={row.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}

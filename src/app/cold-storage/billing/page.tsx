'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Search, DollarSign, Loader2 } from 'lucide-react'

const ORG_ID = '20000000-0000-0000-0000-000000000001'

type Billing = {
  id: string
  invoice_number: string
  total_amount: number
  status: string
  period_start: string
  period_end: string
  created_at: string
  rental_contracts: { contract_number: string } | null
  rental_customers: { name: string } | null
}

export default function BillingPage() {
  const { roleName, loaded } = useSession()
  const [data, setData] = useState<Billing[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('rental_billing')
      .select('*, rental_contracts(contract_number), rental_contracts(rental_customers(name))')
      .eq('organization_id', ORG_ID)
      .order('created_at', { ascending: false })
      .limit(100)
    setData((rows as Billing[]) || [])
    setLoading(false)
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.invoice_number?.toLowerCase().includes(q) ||
      (r as any).rental_customers?.name?.toLowerCase().includes(q) ||
      r.rental_contracts?.contract_number?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Billing</h1>
            <p className="mt-1 text-sm text-slate-500">Tagihan dan invoice rental cold storage</p>
          </div>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari invoice atau customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. Invoice</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Kontrak</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Periode</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada billing</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-cyan-700">{row.invoice_number}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{row.rental_contracts?.contract_number ?? '-'}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{(row as any).rental_customers?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">Rp {row.total_amount.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(row.period_start).toLocaleDateString('id-ID')} - {new Date(row.period_end).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={row.status} />
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

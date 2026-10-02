'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { Search, FileText, Loader2, X, Download, ExternalLink } from 'lucide-react'

type Document = {
  id: string
  doc_type: string
  doc_number: string
  reference_type: string | null
  reference_id: string | null
  file_url: string | null
  created_at: string
  profiles: { full_name: string } | null
}

const DOC_TYPE_LABELS: Record<string, string> = {
  INVOICE: 'Invoice',
  DELIVERY_ORDER: 'Delivery Order',
  PURCHASE_ORDER: 'Purchase Order',
  SALES_ORDER: 'Sales Order',
  CONTRACT: 'Kontrak',
  BILLING: 'Billing',
  REPORT: 'Laporan',
}

export default function DocumentsPage() {
  const { organizationId, loaded, permissions } = useSession()
  const [data, setData] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    let q = supabase
      .from('documents')
      .select('*, profiles(full_name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (typeFilter) q = q.eq('doc_type', typeFilter)
    const { data: rows } = await q
    setData((rows as Document[]) || [])
    setLoading(false)
  }

  useEffect(() => { if (!loading) fetchData() }, [typeFilter])

  const canPrint = permissions.has('documents.print')

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.doc_number?.toLowerCase().includes(q) ||
      r.doc_type?.toLowerCase().includes(q) ||
      r.profiles?.full_name?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => history.back()} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-slate-800 font-display">Dokumen</h1>
            </div>
            <p className="text-sm text-slate-500">Kelola dokumen, faktur, dan cetakan sistem</p>
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nomor dokumen, tipe, atau pembuat..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Semua Tipe</option>
            {Object.entries(DOC_TYPE_LABELS).map(([code, label]) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. Dokumen</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Tipe</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Referensi</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Oleh</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tanggal</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Aksi</th>
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
                    <p>Belum ada dokumen</p>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-cyan-700">{row.doc_number}</td>
                    <td className="px-4 py-3 text-slate-600">{DOC_TYPE_LABELS[row.doc_type] ?? row.doc_type}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {row.reference_type ? `${row.reference_type} #${row.reference_id?.slice(0, 8)}` : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.profiles?.full_name ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">{formatDate(row.created_at)}</td>
                    <td className="px-4 py-3 text-center">
                      {row.file_url ? (
                        <a
                          href={row.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-slate-100 transition-colors"
                          title="Buka dokumen"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">—no file—</span>
                      )}
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

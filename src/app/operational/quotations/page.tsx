'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, Search, FileSignature, Loader2, Check, X, ArrowRight } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

type Quotation = {
  id: string
  quotation_number: string
  customer_name: string | null
  quotation_date: string
  valid_until: string | null
  status: string
  total_amount: number
  notes: string | null
  customers: { name: string } | null
  profiles: { full_name: string } | null
}

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING_APPROVAL', label: 'Menunggu Persetujuan' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'REJECTED', label: 'Ditolak' },
  { value: 'SENT', label: 'Terkirim' },
  { value: 'ACCEPTED', label: 'Diterima Customer' },
  { value: 'EXPIRED', label: 'Kedaluwarsa' },
]

export default function QuotationsPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const [data, setData] = useState<Quotation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [processing, setProcessing] = useState<string | null>(null)

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'
  const canApprove = roleCode === 'DIRECTOR' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded || !canAccess) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, canAccess, statusFilter])

  async function fetchData() {
    setLoading(true)
    let q = supabase
      .from('quotations')
      .select('*, customers(name), profiles(full_name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data: rows } = await q
    setData((rows as Quotation[]) || [])
    setLoading(false)
  }

  async function decide(row: Quotation, decision: 'APPROVED' | 'REJECTED') {
    if (!confirm(`Yakin ingin ${decision === 'APPROVED' ? 'menyetujui' : 'menolak'} penawaran ini?`)) return
    setProcessing(row.id)
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('quotations')
      .update({ status: decision })
      .eq('id', row.id)
    if (!error) {
      // Sync the linked approval request
      await supabase
        .from('approval_requests')
        .update({ status: decision, decided_by: userData.user?.id, decided_at: new Date().toISOString() })
        .eq('organization_id', organizationId)
        .eq('request_type', 'QUOTATION')
        .eq('reference_id', row.id)
        .eq('status', 'PENDING')
    }
    setProcessing(null)
    fetchData()
  }

  async function markSent(row: Quotation) {
    setProcessing(row.id)
    await supabase.from('quotations').update({ status: 'SENT' }).eq('id', row.id)
    setProcessing(null)
    fetchData()
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.quotation_number?.toLowerCase().includes(q) ||
      (r.customer_name ?? r.customers?.name ?? '').toLowerCase().includes(q)
    )
  })

  if (loaded && !canAccess) {
    return (
      <AppShell>
        <div className="p-6 text-center text-slate-500">Anda tidak memiliki akses.</div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Permintaan Harga</h1>
            <p className="mt-1 text-sm text-slate-500">Kelola penawaran harga / RFQ ke customer</p>
          </div>
          {canAccess && (
            <Link
              href="/operational/quotations/new"
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> <span>Penawaran Baru</span>
            </Link>
          )}
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari no. penawaran atau customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. Penawaran</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Berlaku s/d</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Aksi</th>
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
                    <FileSignature className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>Belum ada penawaran harga</p>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-cyan-700">{row.quotation_number}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {row.customer_name || row.customers?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">
                      {formatCurrency(row.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {row.valid_until ? formatDate(row.valid_until) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {canApprove && row.status === 'PENDING_APPROVAL' && (
                          <>
                            <button
                              onClick={() => decide(row, 'APPROVED')}
                              disabled={processing === row.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 text-xs font-medium transition-colors disabled:opacity-50"
                              title="Setujui"
                            >
                              <Check className="w-3.5 h-3.5" /> Setujui
                            </button>
                            <button
                              onClick={() => decide(row, 'REJECTED')}
                              disabled={processing === row.id}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 text-xs font-medium transition-colors disabled:opacity-50"
                              title="Tolak"
                            >
                              <X className="w-3.5 h-3.5" /> Tolak
                            </button>
                          </>
                        )}
                        {row.status === 'APPROVED' && (
                          <button
                            onClick={() => markSent(row)}
                            disabled={processing === row.id}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-100 text-cyan-700 hover:bg-cyan-200 text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            <ArrowRight className="w-3.5 h-3.5" /> Kirim
                          </button>
                        )}
                      </div>
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

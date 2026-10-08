'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { Modal } from '@/components/ui/modal'
import { DocumentPrintView, type DocumentPrintData } from '@/components/document-print'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, Search, FileText, Loader2, Printer } from 'lucide-react'

type SO = {
  id: string
  so_number: string
  status: string
  notes: string | null
  created_at: string
  customers: { name: string } | null
  profiles: { full_name: string } | null
}

type SOLine = {
  quantity_kg: number
  price_per_kg: number
  subtotal: number
  products: { name: string; sku: string | null } | null
}

export default function SalesOrdersPage() {
  const router = useRouter()
  const { roleCode, loaded, organizationId } = useSession()
  const [data, setData] = useState<SO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [printData, setPrintData] = useState<DocumentPrintData | null>(null)
  const [loadingPrint, setLoadingPrint] = useState(false)
  const [error, setError] = useState<string | null>(null)
  

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded || !canAccess) return
    fetchData()
  }, [loaded, canAccess])

  async function fetchData() {
    setLoading(true)
    let q = supabase
      .from('sales_orders')
      .select('*, customers(name), profiles(full_name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)
    if (statusFilter) q = q.eq('status', statusFilter)
    const { data: rows, error: qErr } = await q
    if (qErr) { setError(qErr.message); setData([]); setLoading(false); return }
    setError(null)
    setData((rows as SO[]) || [])
    setLoading(false)
  }

  useEffect(() => { if (!loading) fetchData() }, [statusFilter])

  async function openPrint(soId: string) {
    setLoadingPrint(true)
    setPrintData(null)
    const { data: soRow } = await supabase
      .from('sales_orders')
      .select('*, customers(name), profiles(full_name)')
      .eq('id', soId)
      .single()
    const { data: soLines } = await supabase
      .from('sales_order_lines')
      .select('quantity_kg, price_per_kg, subtotal, products(name, sku)')
      .eq('so_id', soId)

    if (soRow) {
      const row = soRow as unknown as SO
      const lines = (soLines as SOLine[] | null) || []
      const total = lines.reduce((sum, l) => sum + Number(l.subtotal || 0), 0)
      setPrintData({
        docType: 'Sales Order',
        docNumber: row.so_number,
        date: row.created_at,
        status: row.status,
        meta: [
          { label: 'Dibuat Oleh', value: row.profiles?.full_name ?? '-' },
          { label: 'Tanggal', value: new Date(row.created_at).toLocaleDateString('id-ID') },
        ],
        party: row.customers ? { title: 'Kepada:', lines: [row.customers.name] } : undefined,
        lines: lines.map((l) => ({
          name: l.products?.name ?? '-',
          sku: l.products?.sku,
          quantity: l.quantity_kg,
          unit: 'kg',
          price: l.price_per_kg,
          subtotal: l.subtotal,
        })),
        totals: [{ label: 'Total', value: total }],
        notes: row.notes,
        signatures: ['Dibuat Oleh', 'Disetujui'],
      })
    }
    setLoadingPrint(false)
  }

  if (loaded && !canAccess) {
    return <AppShell><div className="p-6 text-center text-slate-500">Anda tidak memiliki akses.</div></AppShell>
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.so_number?.toLowerCase().includes(q) ||
      r.customers?.name?.toLowerCase().includes(q) ||
      r.notes?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Sales Orders</h1>
            <p className="mt-1 text-sm text-slate-500">Kelola pesanan penjualan</p>
          </div>
          <div className="flex items-center gap-3">
            {canAccess && (
              <Link href="/operational/sales-orders/new" className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> <span>SO Baru</span>
              </Link>
            )}
          </div>
        </div>

        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Cari SO atau customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Semua Status</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="FULFILLED">Fulfilled</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. SO</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Dibuat Oleh</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tanggal</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><FileText className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada Sales Order</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} onClick={() => router.push(`/operational/sales-orders/${row.id}`)} className="border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="px-4 py-3 font-mono font-medium text-cyan-700">{row.so_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.customers?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.profiles?.full_name ?? '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">{new Date(row.created_at).toLocaleDateString('id-ID')}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={(e) => { e.stopPropagation(); openPrint(row.id) }} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                        <Printer className="w-3.5 h-3.5" /> Cetak
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pratinjau / cetak sales order */}
      <Modal open={!!printData || loadingPrint} onClose={() => setPrintData(null)} title="Sales Order" size="xl">
        {loadingPrint || !printData ? (
          <div className="py-16 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <DocumentPrintView data={printData} onClose={() => setPrintData(null)} />
        )}
      </Modal>
    </AppShell>
  )
}

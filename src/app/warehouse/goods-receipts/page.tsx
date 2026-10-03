'use client'

import AppShell from '@/components/app-shell'
import { Modal } from '@/components/ui/modal'
import { DocumentPrintView, type DocumentPrintData } from '@/components/document-print'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Search, ArrowDownToLine, Loader2, Package, Printer } from 'lucide-react'

type GR = {
  id: string
  gr_number: string
  received_at: string
  notes: string | null
  purchase_orders: { po_number: string } | null
  profiles: { full_name: string } | null
}

type GRLine = {
  batch_number: string | null
  quantity_kg: number
  quantity_received: number
  condition: string
  products: { name: string; sku: string | null } | null
}

export default function GoodsReceiptsPage() {
  const { roleName, loaded, organizationId } = useSession()
  const [data, setData] = useState<GR[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [printData, setPrintData] = useState<DocumentPrintData | null>(null)
  const [loadingPrint, setLoadingPrint] = useState(false)
  

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('goods_receipts')
      .select('*, purchase_orders(po_number), profiles(full_name)')
      .eq('organization_id', organizationId)
      .order('received_at', { ascending: false })
      .limit(100)
    setData((rows as GR[]) || [])
    setLoading(false)
  }

  async function openPrint(row: GR) {
    setLoadingPrint(true)
    setPrintData(null)
    const { data: lineRows } = await supabase
      .from('goods_receipt_lines')
      .select('batch_number, quantity_kg, quantity_received, condition, products(name, sku)')
      .eq('gr_id', row.id)
    const lines = (lineRows as GRLine[] | null) || []

    setPrintData({
      docType: 'Penerimaan Barang',
      docNumber: row.gr_number,
      date: row.received_at,
      status: null,
      meta: [
        { label: 'PO Ref.', value: row.purchase_orders?.po_number ?? '-' },
        { label: 'Diterima Oleh', value: row.profiles?.full_name ?? '-' },
        { label: 'Tanggal', value: new Date(row.received_at).toLocaleDateString('id-ID') },
      ],
      lines: lines.map((l) => ({
        name: l.products?.name ?? '-',
        sku: l.products?.sku,
        batch: l.batch_number,
        quantity: l.quantity_received || l.quantity_kg,
        unit: 'kg',
      })),
      notes: row.notes,
      signatures: ['Diterima Warehouse', 'Diserahkan Supplier'],
    })
    setLoadingPrint(false)
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
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari GR number atau PO..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. GR</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">PO Ref.</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Diterima Oleh</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Catatan</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tanggal</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><Package className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada goods receipt</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-green-700">{row.gr_number}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{row.purchase_orders?.po_number ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.profiles?.full_name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{row.notes ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">{new Date(row.received_at).toLocaleDateString('id-ID')}</td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => openPrint(row)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
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

      {/* Pratinjau / cetak goods receipt */}
      <Modal open={!!printData || loadingPrint} onClose={() => setPrintData(null)} title="Penerimaan Barang" size="xl">
        {loadingPrint || !printData ? (
          <div className="py-16 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <DocumentPrintView data={printData} onClose={() => setPrintData(null)} />
        )}
      </Modal>
    </AppShell>
  )
}

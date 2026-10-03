'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { DocumentPrintView, type DocumentPrintData } from '@/components/document-print'
import { AccessDenied } from '@/components/access-denied'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Loader2, ArrowLeft, Printer } from 'lucide-react'

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

export default function SalesOrderDetailPage() {
  const { roleCode, loaded } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'

  const [so, setSo] = useState<SO | null>(null)
  const [lines, setLines] = useState<SOLine[]>([])
  const [loading, setLoading] = useState(true)
  const [printData, setPrintData] = useState<DocumentPrintData | null>(null)

  useEffect(() => {
    if (!loaded || !id || !canAccess) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, id, canAccess])

  async function load() {
    setLoading(true)
    const { data: header } = await supabase
      .from('sales_orders')
      .select('*, customers(name), profiles(full_name)')
      .eq('id', id)
      .single()
    const { data: lineRows } = await supabase
      .from('sales_order_lines')
      .select('quantity_kg, price_per_kg, subtotal, products(name, sku)')
      .eq('so_id', id)
    setSo(header as unknown as SO)
    setLines((lineRows as unknown as SOLine[]) || [])
    setLoading(false)
  }

  function openPrint() {
    if (!so) return
    setPrintData({
      docType: 'Sales Order',
      docNumber: so.so_number,
      date: so.created_at,
      status: so.status,
      meta: [{ label: 'Dibuat Oleh', value: so.profiles?.full_name ?? '-' }],
      party: so.customers ? { title: 'Kepada:', lines: [so.customers.name] } : undefined,
      lines: lines.map((l) => ({
        name: l.products?.name ?? '-',
        sku: l.products?.sku,
        quantity: l.quantity_kg,
        unit: 'kg',
        price: l.price_per_kg,
        subtotal: l.subtotal,
      })),
      totals: [{ label: 'Total', value: lines.reduce((s, l) => s + Number(l.subtotal || 0), 0) }],
      notes: so.notes,
      signatures: ['Dibuat Oleh', 'Disetujui'],
    })
  }

  if (loaded && !canAccess) return <AccessDenied message="Halaman ini untuk Admin/Director." />

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <button onClick={() => router.push('/operational/sales-orders')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>

        {loading ? (
          <div className="text-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : !so ? (
          <div className="text-center py-16 text-slate-400">Sales Order tidak ditemukan.</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-800 font-display">Sales Order</h1>
                <p className="font-mono text-sm text-cyan-700">{so.so_number}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={so.status} />
                <button onClick={openPrint} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5">
                  <Printer className="w-3.5 h-3.5" /> Cetak
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500">Customer</p>
                  <p className="font-medium text-slate-800">{so.customers?.name ?? '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Dibuat Oleh</p>
                  <p className="font-medium text-slate-800">{so.profiles?.full_name ?? '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">Tanggal</p>
                  <p className="font-medium text-slate-800">{formatDate(so.created_at)}</p>
                </div>
                {so.notes && (
                  <div>
                    <p className="text-slate-500">Catatan</p>
                    <p className="font-medium text-slate-800">{so.notes}</p>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-2 font-semibold text-slate-600">Barang</th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-600">Qty</th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-600">Harga</th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-600">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2 text-slate-800">{l.products?.name ?? '-'}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">{Number(l.quantity_kg).toLocaleString('id-ID')} kg</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">{formatCurrency(l.price_per_kg)}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">{formatCurrency(l.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50">
                      <td colSpan={3} className="px-4 py-2 text-right font-semibold text-slate-600">Total</td>
                      <td className="px-4 py-2 text-right font-bold text-slate-800">{formatCurrency(lines.reduce((s, l) => s + Number(l.subtotal || 0), 0))}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {printData && (
        <div className="fixed inset-0 z-[60] bg-black/40 p-4 overflow-y-auto no-print">
          <div className="max-w-3xl mx-auto bg-white rounded-xl p-5">
            <DocumentPrintView data={printData} onClose={() => setPrintData(null)} />
          </div>
        </div>
      )}
    </AppShell>
  )
}

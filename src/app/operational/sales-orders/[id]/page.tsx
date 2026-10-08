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
import { Loader2, ArrowLeft, Printer, ShoppingCart, Plus } from 'lucide-react'
import { Modal } from '@/components/ui/modal'

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
  product_id: string | null
  quantity_kg: number
  price_per_kg: number
  subtotal: number
  products: { name: string; sku: string | null } | null
}

export default function SalesOrderDetailPage() {
  const { roleCode, loaded, organizationId, userId } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'

  const [so, setSo] = useState<SO | null>(null)
  const [lines, setLines] = useState<SOLine[]>([])
  const [loading, setLoading] = useState(true)
  const [printData, setPrintData] = useState<DocumentPrintData | null>(null)

  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [showPo, setShowPo] = useState(false)
  const [poSupplier, setPoSupplier] = useState('')
  const [poSaving, setPoSaving] = useState(false)
  const [poError, setPoError] = useState<string | null>(null)
  const [poDone, setPoDone] = useState<string | null>(null)

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
      .select('product_id, quantity_kg, price_per_kg, subtotal, products(name, sku)')
      .eq('so_id', id)
    const { data: supRows } = await supabase
      .from('suppliers').select('id, name').eq('organization_id', organizationId).order('name')
    setSo(header as unknown as SO)
    setLines((lineRows as unknown as SOLine[]) || [])
    setSuppliers((supRows as { id: string; name: string }[]) || [])
    setLoading(false)
  }

  async function createSupplierPo(e: React.FormEvent) {
    e.preventDefault()
    if (!poSupplier) { setPoError('Pilih supplier.'); return }
    if (!so) return
    setPoSaving(true)
    setPoError(null)

    const { data: numberData } = await supabase.rpc('generate_number', { p_prefix: 'PO' })
    const poNumber = (numberData as string) || `PO/${Date.now()}`
    const total = lines.reduce((s, l) => s + Number(l.subtotal || 0), 0)

    const { data: inserted, error: insErr } = await supabase.from('purchase_orders').insert({
      organization_id: organizationId,
      supplier_id: poSupplier,
      po_number: poNumber,
      status: 'ORDERED',
      order_date: new Date().toISOString().slice(0, 10),
      total_amount: total,
      sales_order_id: so.id,
      notes: `Dibuat dari Sales Order ${so.so_number}`,
      created_by: userId,
    }).select().single()

    if (insErr || !inserted) { setPoError(insErr?.message ?? 'Gagal membuat PO.'); setPoSaving(false); return }

    const { error: lineErr } = await supabase.from('purchase_order_lines').insert(
      lines.map((l) => ({
        po_id: inserted.id,
        product_id: l.product_id,
        quantity_kg: l.quantity_kg,
        price_per_kg: l.price_per_kg,
        subtotal: l.subtotal,
      }))
    )
    setPoSaving(false)
    if (lineErr) { setPoError(lineErr.message); return }
    setPoDone(poNumber)
    setShowPo(false)
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
                <button onClick={() => setShowPo(true)} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary/90 rounded-lg">
                  <ShoppingCart className="w-3.5 h-3.5" /> Buat PO ke Supplier
                </button>
                <button onClick={openPrint} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5">
                  <Printer className="w-3.5 h-3.5" /> Cetak
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {poDone && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center justify-between">
                  <span>PO ke supplier <span className="font-mono font-semibold">{poDone}</span> berhasil dibuat.</span>
                  <button onClick={() => router.push('/operational/purchase-orders')} className="text-xs font-medium underline">Lihat PO</button>
                </div>
              )}
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

      <Modal open={showPo} onClose={() => setShowPo(false)} title="Buat PO ke Supplier" size="md">
        <form onSubmit={createSupplierPo} className="space-y-4">
          {poError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{poError}</div>}
          <p className="text-sm text-slate-500">PO akan dibuat dari barang pada Sales Order <span className="font-mono">{so?.so_number}</span> untuk supplier yang dipilih.</p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Supplier</label>
            <select value={poSupplier} onChange={(e) => setPoSupplier(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">-- Pilih supplier --</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {suppliers.length === 0 && <p className="text-xs text-slate-400 mt-1">Belum ada supplier. Tambahkan di Data Master.</p>}
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowPo(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" disabled={poSaving || !poSupplier} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {poSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Buat PO
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  )
}

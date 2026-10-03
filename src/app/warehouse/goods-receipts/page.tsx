'use client'

import AppShell from '@/components/app-shell'
import { Modal } from '@/components/ui/modal'
import { DocumentPrintView, type DocumentPrintData } from '@/components/document-print'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Search, Loader2, Package, Printer, Plus, X } from 'lucide-react'

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

type ApprovedPO = {
  id: string
  po_number: string
  supplier_id: string
  suppliers: { name: string } | null
}

type POLine = {
  id: string
  product_id: string
  quantity_kg: number
  products: { name: string; sku: string | null } | null
}
type ReceiveLine = {
  product_id: string
  name: string
  batch_number: string
  quantity_kg: string
  condition: string
}

type RoleCode = 'SYSTEM_ADMIN' | 'DIRECTOR' | 'ADMIN' | 'WAREHOUSE' | null

export default function GoodsReceiptsPage() {
  const { roleCode, loaded, organizationId, userId } = useSession()
  const [data, setData] = useState<GR[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [printData, setPrintData] = useState<DocumentPrintData | null>(null)
  const [loadingPrint, setLoadingPrint] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [pos, setPos] = useState<ApprovedPO[]>([])
  const [poId, setPoId] = useState('')
  const [grNotes, setGrNotes] = useState('')
  const [recvLines, setRecvLines] = useState<ReceiveLine[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canReceive = (roleCode as RoleCode) === 'WAREHOUSE' || (roleCode as RoleCode) === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  useEffect(() => {
    if (showForm) loadApprovedPOs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm])

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

  async function loadApprovedPOs() {
    const { data: rows } = await supabase
      .from('purchase_orders')
      .select('id, po_number, supplier_id, suppliers(name)')
      .eq('organization_id', organizationId)
      .eq('status', 'APPROVED')
      .order('created_at', { ascending: false })
      .limit(100)

    // Sembunyikan PO yang sudah punya GR (agar tidak dobel terima)
    const { data: grs } = await supabase
      .from('goods_receipts')
      .select('po_id')
      .eq('organization_id', organizationId)
    const receivedPoIds = new Set((grs || []).map((g) => g.po_id))
    setPos(((rows as unknown as ApprovedPO[]) || []).filter((p) => !receivedPoIds.has(p.id)))
  }

  async function handleSelectPO(id: string) {
    setPoId(id)
    setError(null)
    if (!id) { setRecvLines([]); return }
    const { data: lines } = await supabase
      .from('purchase_order_lines')
      .select('id, product_id, quantity_kg, products(name, sku)')
      .eq('po_id', id)
    setRecvLines(
      ((lines as unknown as POLine[]) || []).map((l) => ({
        product_id: l.product_id,
        name: l.products?.name ?? '-',
        batch_number: '',
        quantity_kg: String(l.quantity_kg ?? ''),
        condition: 'GOOD',
      }))
    )
  }

  function updateLine(idx: number, patch: Partial<ReceiveLine>) {
    setRecvLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  async function handleReceive(e: React.FormEvent) {
    e.preventDefault()
    if (!poId) { setError('Pilih PO dulu.'); return }
    const valid = recvLines.filter((l) => parseFloat(l.quantity_kg) > 0)
    if (valid.length === 0) { setError('Minimal 1 item dengan jumlah > 0.'); return }

    setSaving(true)
    setError(null)

    const { data: numData } = await supabase.rpc('generate_number', { p_prefix: 'GR' })
    const grNumber = numData as string

    const { data: gr, error: grErr } = await supabase
      .from('goods_receipts')
      .insert({
        organization_id: organizationId,
        po_id: poId,
        gr_number: grNumber,
        received_by: userId,
        notes: grNotes || null,
      })
      .select()
      .single()

    if (grErr || !gr) { setError(grErr?.message ?? 'Gagal membuat GR'); setSaving(false); return }

    const { error: lineErr } = await supabase.from('goods_receipt_lines').insert(
      valid.map((l) => ({
        gr_id: gr.id,
        product_id: l.product_id,
        batch_number: l.batch_number || null,
        quantity_kg: parseFloat(l.quantity_kg),
        quantity_received: parseFloat(l.quantity_kg),
        condition: l.condition,
      }))
    )
    if (lineErr) {
      await supabase.from('goods_receipts').delete().eq('id', gr.id)
      setError(lineErr.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setShowForm(false)
    setPoId('')
    setGrNotes('')
    setRecvLines([])
    fetchData()
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
            <p className="mt-1 text-sm text-slate-500">Goods Receipt — barang masuk dari supplier (menambah stok)</p>
          </div>
          {canReceive && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Terima Barang
            </button>
          )}
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

      {/* Form terima barang dari PO */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Terima Barang (Goods Receipt)" size="xl">
        <form onSubmit={handleReceive} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Purchase Order (APPROVED)</label>
              <select value={poId} onChange={(e) => handleSelectPO(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">-- Pilih PO --</option>
                {pos.map((p) => (
                  <option key={p.id} value={p.id}>{p.po_number} — {p.suppliers?.name ?? '-'}</option>
                ))}
              </select>
              {pos.length === 0 && <p className="text-xs text-slate-400 mt-1">Tidak ada PO APPROVED yang belum diterima.</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
              <input type="text" value={grNotes} onChange={(e) => setGrNotes(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          {recvLines.length > 0 && (
            <div className="border-t border-slate-200 pt-4">
              <p className="text-sm font-semibold text-slate-700 mb-3">Item Diterima</p>
              <div className="space-y-2">
                {recvLines.map((l, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 rounded-lg p-3">
                    <span className="col-span-12 sm:col-span-4 text-sm text-slate-700">{l.name}</span>
                    <input className="col-span-6 sm:col-span-3 border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Batch" value={l.batch_number} onChange={(e) => updateLine(idx, { batch_number: e.target.value })} />
                    <input className="col-span-6 sm:col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm" type="number" step="0.01" placeholder="Qty kg" value={l.quantity_kg} onChange={(e) => updateLine(idx, { quantity_kg: e.target.value })} />
                    <select className="col-span-12 sm:col-span-3 border border-slate-200 rounded-lg px-3 py-2 text-sm" value={l.condition} onChange={(e) => updateLine(idx, { condition: e.target.value })}>
                      <option value="GOOD">Baik</option>
                      <option value="DAMAGED">Rusak</option>
                      <option value="REJECTED">Ditolak</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 inline mr-1" />Batal</button>
            <button type="submit" disabled={saving || !poId} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Menyimpan...' : 'Simpan Penerimaan'}
            </button>
          </div>
        </form>
      </Modal>

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

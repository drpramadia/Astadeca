'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Loader2, Check, X, ArrowLeft, AlertCircle } from 'lucide-react'

type Approval = {
  id: string
  request_type: string
  reference_id: string
  status: string
  comment: string | null
  created_at: string
  requested_by: string
  profiles: { full_name: string } | null
}

type Row = { label: string; value: string }
type ItemLine = { name: string; qty: string }

const TYPE_LABELS: Record<string, string> = {
  CONTRACT: 'Kontrak Rental',
  RENTAL_INQUIRY: 'Permintaan Sewa (Inquiry)',
  PURCHASE_ORDER: 'Purchase Order',
  SALES_ORDER: 'Sales Order',
  DELIVERY: 'Permintaan Surat Jalan',
  RENTAL_RELEASE: 'Pengeluaran Barang',
  QUOTATION: 'Penawaran Harga',
}

export default function ApprovalDetailPage() {
  const { roleCode, loaded } = useSession()
  const router = useRouter()
  const params = useParams()
  const id = params?.id as string

  const [row, setRow] = useState<Approval | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [items, setItems] = useState<ItemLine[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const canApprove = roleCode === 'DIRECTOR' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded || !id) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, id])

  async function load() {
    setLoading(true)
    setError(null)
    const { data: ap } = await supabase
      .from('approval_requests')
      .select('*, profiles!approval_requests_requested_by_fkey(full_name)')
      .eq('id', id)
      .single()

    if (!ap) { setLoading(false); setError('Approval tidak ditemukan.'); return }
    const a = ap as unknown as Approval
    setRow(a)

    const detail: Row[] = []
    const lines: ItemLine[] = []

    try {
      if (a.request_type === 'RENTAL_INQUIRY') {
        const { data } = await supabase.from('rental_inquiries')
          .select('requested_kg, start_date, end_date, notes, rental_customers(name), cold_storages(name)')
          .eq('id', a.reference_id).single()
        const q = data as unknown as { requested_kg: number; start_date: string | null; end_date: string | null; notes: string | null; rental_customers: { name: string } | null; cold_storages: { name: string } | null } | null
        if (q) detail.push(
          { label: 'Penyewa', value: q.rental_customers?.name ?? '-' },
          { label: 'Cold Storage', value: q.cold_storages?.name ?? '-' },
          { label: 'Jumlah Diminta', value: `${Number(q.requested_kg).toLocaleString('id-ID')} kg` },
          { label: 'Periode', value: `${q.start_date ?? '-'} s/d ${q.end_date ?? '-'}` },
          { label: 'Catatan', value: q.notes ?? '-' },
        )
      } else if (a.request_type === 'CONTRACT') {
        const { data } = await supabase.from('rental_contracts')
          .select('contract_number, start_date, end_date, price_per_kg_per_day, rental_customers(name), cold_storages(name)')
          .eq('id', a.reference_id).single()
        const k = data as unknown as { contract_number: string; start_date: string; end_date: string | null; price_per_kg_per_day: number; rental_customers: { name: string } | null; cold_storages: { name: string } | null } | null
        if (k) detail.push(
          { label: 'No. Kontrak', value: k.contract_number },
          { label: 'Penyewa', value: k.rental_customers?.name ?? '-' },
          { label: 'Cold Storage', value: k.cold_storages?.name ?? '-' },
          { label: 'Periode', value: `${formatDate(k.start_date)} s/d ${k.end_date ? formatDate(k.end_date) : '-'}` },
          { label: 'Tarif', value: `${formatCurrency(k.price_per_kg_per_day)}/kg/hari` },
        )
      } else if (a.request_type === 'PURCHASE_ORDER') {
        const { data } = await supabase.from('purchase_orders')
          .select('po_number, status, order_date, total_amount, suppliers(name), purchase_order_lines(quantity_kg, price_per_kg, subtotal, products(name))')
          .eq('id', a.reference_id).single()
        const p = data as unknown as { po_number: string; status: string; order_date: string | null; total_amount: number | null; suppliers: { name: string } | null; purchase_order_lines: { quantity_kg: number; price_per_kg: number; subtotal: number; products: { name: string } | null }[] } | null
        if (p) {
          detail.push(
            { label: 'No. PO', value: p.po_number },
            { label: 'Supplier', value: p.suppliers?.name ?? '-' },
            { label: 'Tanggal', value: p.order_date ? formatDate(p.order_date) : '-' },
            { label: 'Total', value: p.total_amount ? formatCurrency(p.total_amount) : '-' },
          )
          for (const l of p.purchase_order_lines ?? []) lines.push({ name: l.products?.name ?? '-', qty: `${Number(l.quantity_kg).toLocaleString('id-ID')} kg × ${formatCurrency(l.price_per_kg)}` })
        }
      } else if (a.request_type === 'SALES_ORDER') {
        const { data } = await supabase.from('sales_orders')
          .select('so_number, status, order_date, total_amount, customers(name), sales_order_lines(quantity_kg, price_per_kg, products(name))')
          .eq('id', a.reference_id).single()
        const s = data as unknown as { so_number: string; status: string; order_date: string | null; total_amount: number | null; customers: { name: string } | null; sales_order_lines: { quantity_kg: number; price_per_kg: number; products: { name: string } | null }[] } | null
        if (s) {
          detail.push(
            { label: 'No. SO', value: s.so_number },
            { label: 'Customer', value: s.customers?.name ?? '-' },
            { label: 'Tanggal', value: s.order_date ? formatDate(s.order_date) : '-' },
            { label: 'Total', value: s.total_amount ? formatCurrency(s.total_amount) : '-' },
          )
          for (const l of s.sales_order_lines ?? []) lines.push({ name: l.products?.name ?? '-', qty: `${Number(l.quantity_kg).toLocaleString('id-ID')} kg × ${formatCurrency(l.price_per_kg)}` })
        }
      } else if (a.request_type === 'DELIVERY') {
        const { data } = await supabase.from('delivery_requests')
          .select('status, destination, driver_name, vehicle_number, delivery_date, notes, customers(name), delivery_request_lines(item_name, quantity_kg)')
          .eq('id', a.reference_id).single()
        const d = data as unknown as { status: string; destination: string | null; driver_name: string | null; vehicle_number: string | null; delivery_date: string | null; notes: string | null; customers: { name: string } | null; delivery_request_lines: { item_name: string; quantity_kg: number }[] } | null
        if (d) {
          detail.push(
            { label: 'Customer', value: d.customers?.name ?? '-' },
            { label: 'Tujuan', value: d.destination ?? '-' },
            { label: 'Driver', value: d.driver_name ?? '-' },
            { label: 'No. Kendaraan', value: d.vehicle_number ?? '-' },
            { label: 'Rencana Kirim', value: d.delivery_date ? formatDate(d.delivery_date) : '-' },
            { label: 'Catatan', value: d.notes ?? '-' },
          )
          for (const l of d.delivery_request_lines ?? []) lines.push({ name: l.item_name, qty: `${Number(l.quantity_kg).toLocaleString('id-ID')} kg` })
        }
      } else if (a.request_type === 'QUOTATION') {
        const { data } = await supabase.from('quotations')
          .select('quotation_number, quotation_date, valid_until, total_amount, notes, customer_name, customers(name), quotation_lines(quantity_kg, price_per_kg, subtotal, description, products(name))')
          .eq('id', a.reference_id).single()
        const q = data as unknown as { quotation_number: string; quotation_date: string | null; valid_until: string | null; total_amount: number | null; notes: string | null; customer_name: string | null; customers: { name: string } | null; quotation_lines: { quantity_kg: number; price_per_kg: number; subtotal: number; description: string | null; products: { name: string } | null }[] } | null
        if (q) {
          detail.push(
            { label: 'No. Penawaran', value: q.quotation_number },
            { label: 'Customer', value: q.customers?.name ?? q.customer_name ?? '-' },
            { label: 'Tanggal', value: q.quotation_date ? formatDate(q.quotation_date) : '-' },
            { label: 'Berlaku s/d', value: q.valid_until ? formatDate(q.valid_until) : '-' },
            { label: 'Total', value: q.total_amount ? formatCurrency(q.total_amount) : '-' },
            { label: 'Catatan', value: q.notes ?? '-' },
          )
          for (const l of q.quotation_lines ?? []) lines.push({ name: l.products?.name ?? l.description ?? '-', qty: `${Number(l.quantity_kg).toLocaleString('id-ID')} kg × ${formatCurrency(l.price_per_kg)}` })
        }
      } else if (a.request_type === 'RENTAL_RELEASE') {
        const { data: c } = await supabase.from('rental_contracts')
          .select('contract_number, rental_customers(name), cold_storages(name)')
          .eq('id', a.reference_id).single()
        const k = c as unknown as { contract_number: string; rental_customers: { name: string } | null; cold_storages: { name: string } | null } | null
        const { data: rel } = await supabase.from('rental_releases')
          .select('released_kg, batch_number, released_at, notes')
          .eq('contract_id', a.reference_id)
          .order('released_at', { ascending: false })
        if (k) detail.push(
          { label: 'No. Kontrak', value: k.contract_number },
          { label: 'Penyewa', value: k.rental_customers?.name ?? '-' },
          { label: 'Cold Storage', value: k.cold_storages?.name ?? '-' },
        )
        for (const r of (rel as { released_kg: number; batch_number: string | null; released_at: string; notes: string | null }[] | null) ?? []) {
          lines.push({ name: `Pengeluaran${r.batch_number ? ` batch ${r.batch_number}` : ''}`, qty: `${Number(r.released_kg).toLocaleString('id-ID')} kg` })
        }
      }
    } catch { /* tetap tampilkan apa adanya */ }

    setRows(detail)
    setItems(lines)
    setLoading(false)
  }

  async function decide(decision: 'APPROVED' | 'REJECTED', reason?: string) {
    if (!row) return
    setProcessing(true)
    setError(null)
    const { data: userData } = await supabase.auth.getUser()
    const uid = userData.user?.id ?? null

    if (!uid) { setProcessing(false); setError('Sesi tidak ditemukan.'); return }

    const { error: updErr } = await supabase.from('approval_requests').update({
      status: decision,
      decided_by: uid,
      decided_at: new Date().toISOString(),
      comment: reason ?? row.comment,
    }).eq('id', row.id)

    if (updErr) { setProcessing(false); setError(updErr.message); return }

    // Update dokumen terkait
    const refId = row.reference_id
    const t = row.request_type
    if (decision === 'APPROVED') {
      if (t === 'PURCHASE_ORDER') await supabase.from('purchase_orders').update({ status: 'APPROVED' }).eq('id', refId)
      else if (t === 'SALES_ORDER') await supabase.from('sales_orders').update({ status: 'APPROVED' }).eq('id', refId)
      else if (t === 'CONTRACT') await supabase.from('rental_contracts').update({ status: 'ACTIVE' }).eq('id', refId)
      else if (t === 'DELIVERY') await supabase.from('delivery_requests').update({ status: 'APPROVED' }).eq('id', refId)
      else if (t === 'RENTAL_INQUIRY') await supabase.from('rental_inquiries').update({ status: 'CONVERTED' }).eq('id', refId)
    } else {
      if (t === 'PURCHASE_ORDER') await supabase.from('purchase_orders').update({ status: 'REJECTED' }).eq('id', refId)
      else if (t === 'SALES_ORDER') await supabase.from('sales_orders').update({ status: 'REJECTED' }).eq('id', refId)
      else if (t === 'CONTRACT') await supabase.from('rental_contracts').update({ status: 'CANCELLED' }).eq('id', refId)
      else if (t === 'DELIVERY') await supabase.from('delivery_requests').update({ status: 'REJECTED' }).eq('id', refId)
      else if (t === 'RENTAL_INQUIRY') await supabase.from('rental_inquiries').update({ status: 'REJECTED' }).eq('id', refId)
    }

    setProcessing(false)
    router.push('/approval/requests')
  }

  if (!loaded) return null
  if (!canApprove) {
    return (
      <AppShell>
        <div className="p-8 max-w-2xl mx-auto text-center py-20">
          <p className="text-slate-500">Halaman ini hanya untuk Director.</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <button onClick={() => router.push('/approval/requests')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Kembali ke daftar approval
        </button>

        {loading ? (
          <div className="text-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : !row ? (
          <div className="text-center py-16 text-slate-400"><AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />{error ?? 'Data tidak ditemukan.'}</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-800 font-display">{TYPE_LABELS[row.request_type] ?? row.request_type}</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Diminta oleh {row.profiles?.full_name ?? '-'} · {new Date(row.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <StatusBadge status={row.status} />
            </div>

            {/* Isi dokumen */}
            <div className="p-5 space-y-4">
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                {rows.length === 0 ? (
                  <p className="p-4 text-sm text-slate-400 text-center">Detail dokumen tidak tersedia.</p>
                ) : rows.map((r, i) => (
                  <div key={i} className="flex items-start justify-between gap-4 px-4 py-2.5">
                    <span className="text-sm text-slate-500">{r.label}</span>
                    <span className="text-sm font-medium text-slate-800 text-right">{r.value}</span>
                  </div>
                ))}
              </div>

              {items.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-slate-700 mb-2">Rincian Barang</p>
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="text-left px-4 py-2 font-semibold text-slate-600">Barang</th>
                          <th className="text-right px-4 py-2 font-semibold text-slate-600">Jumlah</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((l, i) => (
                          <tr key={i} className="border-b border-slate-100 last:border-0">
                            <td className="px-4 py-2 text-slate-800">{l.name}</td>
                            <td className="px-4 py-2 text-right font-mono text-slate-700">{l.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

              {/* Alasan penolakan */}
              {showReject && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg space-y-2">
                  <label className="block text-sm font-medium text-red-800">Alasan Penolakan (wajib)</label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder="Jelaskan alasan menolak permintaan ini..."
                    className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setShowReject(false); setRejectReason('') }} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-white rounded-lg">Batal</button>
                    <button
                      onClick={() => {
                        if (!rejectReason.trim()) { setError('Alasan penolakan wajib diisi.'); return }
                        decide('REJECTED', rejectReason.trim())
                      }}
                      disabled={processing}
                      className="flex items-center gap-1 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-60"
                    >
                      {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Tolak dengan Alasan
                    </button>
                  </div>
                </div>
              )}

              {/* Aksi */}
              {row.status === 'PENDING' && !showReject && (
                <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => { setError(null); setShowReject(true) }}
                    disabled={processing}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-red-300 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-60"
                  >
                    <X className="w-4 h-4" /> Tolak
                  </button>
                  <button
                    onClick={() => decide('APPROVED')}
                    disabled={processing}
                    className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-60"
                  >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Setujui
                  </button>
                </div>
              )}

              {row.status !== 'PENDING' && (
                <div className={`text-sm rounded-lg px-4 py-3 ${row.status === 'APPROVED' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {row.status === 'APPROVED' ? 'Permintaan ini telah disetujui.' : `Permintaan ini ditolak.${row.comment ? ` Alasan: ${row.comment}` : ''}`}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

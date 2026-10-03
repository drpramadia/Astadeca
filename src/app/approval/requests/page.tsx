'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { Modal } from '@/components/ui/modal'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { ClipboardCheck, Loader2, Check, X, Eye, FileText } from 'lucide-react'

type Approval = {
  id: string
  request_type: string
  reference_id: string
  status: string
  comment: string | null
  created_at: string
  profiles: { full_name: string } | null
}

type DetailLine = { label: string; value: string }

const TYPE_LABELS: Record<string, string> = {
  CONTRACT: 'Kontrak Rental',
  RENTAL_INQUIRY: 'Permintaan Sewa (Inquiry)',
  PURCHASE_ORDER: 'Purchase Order',
  SALES_ORDER: 'Sales Order',
  DELIVERY: 'Permintaan Surat Jalan',
  RENTAL_RELEASE: 'Pengeluaran Barang',
}

export default function ApprovalPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const [data, setData] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [detail, setDetail] = useState<Approval | null>(null)
  const [detailLines, setDetailLines] = useState<DetailLine[]>([])
  const [detailLoading, setDetailLoading] = useState(false)

  const canApprove = roleCode === 'DIRECTOR'

  useEffect(() => {
    if (!loaded) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('approval_requests')
      .select('*, profiles!approval_requests_requested_by_fkey(full_name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)
    setData((rows as unknown as Approval[]) || [])
    setLoading(false)
  }

  /** Ambil rincian dokumen terkait untuk ditampilkan sebelum approve/reject. */
  async function openDetail(row: Approval) {
    setDetail(row)
    setDetailLoading(true)
    setDetailLines([])
    const lines: DetailLine[] = []
    const refId = row.reference_id

    try {
      if (row.request_type === 'RENTAL_INQUIRY') {
        const { data: inq } = await supabase
          .from('rental_inquiries')
          .select('requested_kg, start_date, end_date, notes, status, rental_customers(name), cold_storages(name)')
          .eq('id', refId)
          .single()
        if (inq) {
          const q = inq as unknown as { requested_kg: number; start_date: string | null; end_date: string | null; notes: string | null; status: string; rental_customers: { name: string } | null; cold_storages: { name: string } | null }
          lines.push(
            { label: 'Penyewa', value: q.rental_customers?.name ?? '-' },
            { label: 'Cold Storage', value: q.cold_storages?.name ?? '-' },
            { label: 'Diminta', value: `${Number(q.requested_kg).toLocaleString('id-ID')} kg` },
            { label: 'Periode', value: `${q.start_date ?? '-'} s/d ${q.end_date ?? '-'}` },
            { label: 'Catatan', value: q.notes ?? '-' },
          )
        }
      } else if (row.request_type === 'CONTRACT') {
        const { data: c } = await supabase
          .from('rental_contracts')
          .select('contract_number, start_date, end_date, price_per_kg_per_day, total_estimated_kg, status, rental_customers(name), cold_storages(name)')
          .eq('id', refId)
          .single()
        if (c) {
          const k = c as unknown as { contract_number: string; start_date: string; end_date: string | null; price_per_kg_per_day: number; total_estimated_kg: number; status: string; rental_customers: { name: string } | null; cold_storages: { name: string } | null }
          lines.push(
            { label: 'No. Kontrak', value: k.contract_number },
            { label: 'Penyewa', value: k.rental_customers?.name ?? '-' },
            { label: 'Cold Storage', value: k.cold_storages?.name ?? '-' },
            { label: 'Periode', value: `${k.start_date} s/d ${k.end_date ?? '-'}` },
            { label: 'Tarif', value: `${formatCurrency(k.price_per_kg_per_day)}/kg/hari` },
            { label: 'Estimasi', value: `${Number(k.total_estimated_kg).toLocaleString('id-ID')} kg` },
          )
        }
      } else if (row.request_type === 'PURCHASE_ORDER') {
        const { data: po } = await supabase
          .from('purchase_orders')
          .select('po_number, status, total_amount, suppliers(name)')
          .eq('id', refId)
          .single()
        if (po) {
          const p = po as unknown as { po_number: string; status: string; total_amount: number | null; suppliers: { name: string } | null }
          lines.push(
            { label: 'No. PO', value: p.po_number },
            { label: 'Supplier', value: p.suppliers?.name ?? '-' },
            { label: 'Total', value: p.total_amount ? formatCurrency(p.total_amount) : '-' },
            { label: 'Status', value: p.status },
          )
        }
      } else if (row.request_type === 'SALES_ORDER') {
        const { data: so } = await supabase
          .from('sales_orders')
          .select('so_number, status, total_amount, customers(name)')
          .eq('id', refId)
          .single()
        if (so) {
          const s = so as unknown as { so_number: string; status: string; total_amount: number | null; customers: { name: string } | null }
          lines.push(
            { label: 'No. SO', value: s.so_number },
            { label: 'Customer', value: s.customers?.name ?? '-' },
            { label: 'Total', value: s.total_amount ? formatCurrency(s.total_amount) : '-' },
            { label: 'Status', value: s.status },
          )
        }
      } else if (row.request_type === 'DELIVERY') {
        const { data: dr } = await supabase
          .from('delivery_requests')
          .select('status, destination, driver_name, vehicle_number, delivery_date, customers(name), delivery_request_lines(item_name, quantity_kg)')
          .eq('id', refId)
          .single()
        if (dr) {
          const d = dr as unknown as { status: string; destination: string | null; driver_name: string | null; vehicle_number: string | null; delivery_date: string | null; customers: { name: string } | null; delivery_request_lines: { item_name: string; quantity_kg: number }[] }
          lines.push(
            { label: 'Customer', value: d.customers?.name ?? '-' },
            { label: 'Tujuan', value: d.destination ?? '-' },
            { label: 'Driver', value: d.driver_name ?? '-' },
            { label: 'Kendaraan', value: d.vehicle_number ?? '-' },
            { label: 'Rencana Kirim', value: d.delivery_date ?? '-' },
          )
          for (const l of d.delivery_request_lines ?? []) {
            lines.push({ label: 'Barang', value: `${l.item_name} — ${Number(l.quantity_kg).toLocaleString('id-ID')} kg` })
          }
        }
      }
    } catch {
      /* item mungkin tidak ada; tetap tampilkan detail kosong */
    }

    setDetailLines(lines)
    setDetailLoading(false)
  }

  async function handleDecision(id: string, decision: 'APPROVED' | 'REJECTED') {
    if (!confirm(`Yakin ingin ${decision === 'APPROVED' ? 'menyetujui' : 'menolak'} request ini?`)) return
    setProcessing(id)
    const { data: userData } = await supabase.auth.getUser()
    const row = data.find((r) => r.id === id)

    const { error } = await supabase.from('approval_requests').update({
      status: decision,
      decided_by: userData.user?.id,
      decided_at: new Date().toISOString(),
    }).eq('id', id)

    if (!error && row) {
      const refId = row.reference_id
      const refType = row.request_type
      if (decision === 'APPROVED') {
        if (refType === 'PURCHASE_ORDER') await supabase.from('purchase_orders').update({ status: 'APPROVED' }).eq('id', refId)
        else if (refType === 'SALES_ORDER') await supabase.from('sales_orders').update({ status: 'APPROVED' }).eq('id', refId)
        else if (refType === 'CONTRACT') await supabase.from('rental_contracts').update({ status: 'ACTIVE' }).eq('id', refId)
        else if (refType === 'DELIVERY') await supabase.from('delivery_requests').update({ status: 'APPROVED' }).eq('id', refId)
        else if (refType === 'RENTAL_INQUIRY') await supabase.from('rental_inquiries').update({ status: 'APPROVED' }).eq('id', refId)
      } else {
        if (refType === 'PURCHASE_ORDER') await supabase.from('purchase_orders').update({ status: 'REJECTED' }).eq('id', refId)
        else if (refType === 'SALES_ORDER') await supabase.from('sales_orders').update({ status: 'REJECTED' }).eq('id', refId)
        else if (refType === 'CONTRACT') await supabase.from('rental_contracts').update({ status: 'CANCELLED' }).eq('id', refId)
        else if (refType === 'DELIVERY') await supabase.from('delivery_requests').update({ status: 'REJECTED' }).eq('id', refId)
        else if (refType === 'RENTAL_INQUIRY') await supabase.from('rental_inquiries').update({ status: 'REJECTED' }).eq('id', refId)
      }
    }

    setProcessing(null)
    setDetail(null)
    if (!error) fetchData()
  }

  if (loaded && !canApprove) {
    return (
      <AppShell>
        <div className="p-6 text-center text-slate-500">Halaman ini hanya untuk Director.</div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Approval</h1>
            <p className="mt-1 text-sm text-slate-500">Tinjau detail terlebih dahulu, lalu setujui atau tolak</p>
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : data.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ClipboardCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Belum ada request yang perlu diapprove</p>
            </div>
          ) : (
            data.map((row) => (
              <div key={row.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${row.status === 'PENDING' ? 'bg-amber-100 text-amber-600' : row.status === 'APPROVED' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{TYPE_LABELS[row.request_type] ?? row.request_type}</p>
                      <p className="text-sm text-slate-500 mt-0.5">Diminta oleh: {row.profiles?.full_name ?? '-'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(row.created_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                      {row.comment && <p className="text-sm text-slate-600 mt-2 italic">&quot;{row.comment}&quot;</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <StatusBadge status={row.status} />
                    <div className="flex gap-2">
                      <button onClick={() => openDetail(row)} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors">
                        <Eye className="w-3 h-3" /> Lihat Detail
                      </button>
                      {row.status === 'PENDING' && canApprove && (
                        <>
                          <button onClick={() => handleDecision(row.id, 'APPROVED')} disabled={processing === row.id} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                            {processing === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Setuju
                          </button>
                          <button onClick={() => handleDecision(row.id, 'REJECTED')} disabled={processing === row.id} className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                            <X className="w-3 h-3" />
                            Tolak
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Modal detail sebelum approve/reject */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail ? (TYPE_LABELS[detail.request_type] ?? 'Detail Request') : 'Detail'} size="md">
        {detailLoading ? (
          <div className="py-12 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">Status</span>
              <StatusBadge status={detail?.status ?? ''} />
            </div>
            <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {detailLines.length === 0 ? (
                <p className="p-4 text-sm text-slate-400 text-center">Detail tidak tersedia.</p>
              ) : (
                detailLines.map((l, i) => (
                  <div key={i} className="flex items-start justify-between gap-4 px-4 py-2.5">
                    <span className="text-sm text-slate-500">{l.label}</span>
                    <span className="text-sm font-medium text-slate-800 text-right">{l.value}</span>
                  </div>
                ))
              )}
            </div>

            {detail?.status === 'PENDING' && canApprove && (
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => detail && handleDecision(detail.id, 'REJECTED')} disabled={processing === detail?.id} className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-60">
                  <X className="w-4 h-4" /> Tolak
                </button>
                <button onClick={() => detail && handleDecision(detail.id, 'APPROVED')} disabled={processing === detail?.id} className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg disabled:opacity-60">
                  <Check className="w-4 h-4" /> Setuju
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </AppShell>
  )
}

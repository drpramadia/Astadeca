'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { ClipboardCheck, Loader2, Eye, FileText, Check } from 'lucide-react'

type Approval = {
  id: string
  request_type: string
  reference_id: string
  status: string
  comment: string | null
  created_at: string
  profiles: { full_name: string } | null
}

const TYPE_LABELS: Record<string, string> = {
  CONTRACT: 'Kontrak Rental',
  RENTAL_INQUIRY: 'Permintaan Sewa (Inquiry)',
  PURCHASE_ORDER: 'Purchase Order',
  SALES_ORDER: 'Sales Order',
  DELIVERY: 'Permintaan Surat Jalan',
  RENTAL_RELEASE: 'Pengeluaran Barang',
  QUOTATION: 'Penawaran Harga',
}

export default function ApprovalPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const router = useRouter()
  const [data, setData] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const canApprove = roleCode === 'DIRECTOR' || roleCode === 'SYSTEM_ADMIN'

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

  async function quickApprove(id: string) {
    if (!confirm('Setujui permintaan ini?')) return
    setProcessing(id)
    const { data: userData } = await supabase.auth.getUser()
    const row = data.find((r) => r.id === id)
    if (row) {
      // Update dokumen terkait dulu; jangan tandai approval bila dokumen gagal.
      const refId = row.reference_id
      const t = row.request_type
      let docErr: { message: string } | null = null
      if (t === 'PURCHASE_ORDER') ({ error: docErr } = await supabase.from('purchase_orders').update({ status: 'APPROVED' }).eq('id', refId))
      else if (t === 'SALES_ORDER') ({ error: docErr } = await supabase.from('sales_orders').update({ status: 'APPROVED' }).eq('id', refId))
      else if (t === 'CONTRACT') ({ error: docErr } = await supabase.from('rental_contracts').update({ status: 'ACTIVE' }).eq('id', refId))
      else if (t === 'DELIVERY') ({ error: docErr } = await supabase.from('delivery_requests').update({ status: 'APPROVED' }).eq('id', refId))
      else if (t === 'RENTAL_INQUIRY') ({ error: docErr } = await supabase.from('rental_inquiries').update({ status: 'CONVERTED' }).eq('id', refId))
      else if (t === 'QUOTATION') ({ error: docErr } = await supabase.from('quotations').update({ status: 'APPROVED' }).eq('id', refId))
      if (docErr) { alert(`Gagal memperbarui dokumen: ${docErr.message}`); setProcessing(null); return }
    }
    await supabase.from('approval_requests').update({
      status: 'APPROVED',
      decided_by: userData.user?.id,
      decided_at: new Date().toISOString(),
    }).eq('id', id)
    setProcessing(null)
    fetchData()
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
            <p className="mt-1 text-sm text-slate-500">Klik permintaan untuk melihat isi dokumen, lalu setujui atau tolak</p>
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
              <button
                key={row.id}
                onClick={() => router.push(`/approval/requests/${row.id}`)}
                className="w-full text-left bg-white rounded-xl border border-slate-200 p-5 hover:border-cyan-300 hover:shadow-sm transition-all"
              >
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
                      <span className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg">
                        <Eye className="w-3 h-3" /> Lihat / Proses
                      </span>
                      {row.status === 'PENDING' && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => { e.stopPropagation(); quickApprove(row.id) }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); quickApprove(row.id) } }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                        >
                          {processing === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Setuju Cepat
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </AppShell>
  )
}

'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { ClipboardCheck, Loader2, Check, X, FileText } from 'lucide-react'

const ORG_ID = '20000000-0000-0000-0000-000000000001'

type Approval = {
  id: string
  request_type: string
  status: string
  comment: string | null
  created_at: string
  profiles_requested: { full_name: string } | null
}

const TYPE_LABELS: Record<string, string> = {
  CONTRACT: 'Kontrak Rental',
  PURCHASE_ORDER: 'Purchase Order',
  SALES_ORDER: 'Sales Order',
  DELIVERY: 'Delivery Request',
}

export default function ApprovalPage() {
  const { roleCode, loaded } = useSession()
  const [data, setData] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  

  const canApprove = roleCode === 'DIRECTOR'

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('approval_requests')
      .select('*, profiles!approval_requests_requested_by_fkey(full_name)')
      .eq('organization_id', ORG_ID)
      .order('created_at', { ascending: false })
      .limit(100)
    setData((rows as Approval[]) || [])
    setLoading(false)
  }

  async function handleDecision(id: string, decision: 'APPROVED' | 'REJECTED') {
    if (!confirm(`Yakin ingin ${decision === 'APPROVED' ? 'menyetujui' : 'menolak'} request ini?`)) return
    setProcessing(id)
    const { data: userData } = await supabase.auth.getUser()
    const { error } = await supabase.from('approval_requests').update({
      status: decision,
      decided_by: userData.user?.id,
      decided_at: new Date().toISOString(),
    }).eq('id', id)
    setProcessing(null)
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
            <p className="mt-1 text-sm text-slate-500">Setujui atau tolak request yang pending</p>
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
                      <p className="text-sm text-slate-500 mt-0.5">Diminta oleh: {row.profiles_requested?.full_name ?? '-'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{new Date(row.created_at).toLocaleDateString('id-ID HH:mm')}</p>
                      {row.comment && <p className="text-sm text-slate-600 mt-2 italic">"{row.comment}"</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <StatusBadge status={row.status} />
                    {row.status === 'PENDING' && canApprove && (
                      <div className="flex gap-2">
                        <button onClick={() => handleDecision(row.id, 'APPROVED')} disabled={processing === row.id} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                          {processing === row.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Setuju
                        </button>
                        <button onClick={() => handleDecision(row.id, 'REJECTED')} disabled={processing === row.id} className="flex items-center gap-1 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60">
                          <X className="w-3 h-3" />
                          Tolak
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  )
}

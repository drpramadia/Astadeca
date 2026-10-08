'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { Modal } from '@/components/ui/modal'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, PackageSearch, Plus, Send } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Rfq = {
  id: string
  rfq_number: string
  customer_name: string | null
  request_date: string
  needed_by: string | null
  status: string
  notes: string | null
  customers: { name: string } | null
}

type RfqLine = { id: string; product_id: string | null; description: string | null; quantity_kg: number; products: { name: string; sku: string } | null }

type SupplierRfq = {
  id: string
  rfq_number: string
  status: string
  request_date: string
  suppliers: { name: string } | null
}

export default function RfqCustomerDetailPage() {
  const { roleCode, loaded, organizationId, userId } = useSession()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const rfqId = params.id

  const [rfq, setRfq] = useState<Rfq | null>(null)
  const [lines, setLines] = useState<RfqLine[]>([])
  const [supplierRfqs, setSupplierRfqs] = useState<SupplierRfq[]>([])
  const [loading, setLoading] = useState(true)

  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [showIssue, setShowIssue] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [responseDue, setResponseDue] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'

  const fetchData = useCallback(async () => {
    if (!rfqId || !organizationId) return
    setLoading(true)
    const [rRes, lRes, sRes, supRes] = await Promise.all([
      supabase.from('customer_rfq').select('*, customers(name)').eq('id', rfqId).single(),
      supabase.from('customer_rfq_lines').select('*, products(name, sku)').eq('rfq_id', rfqId),
      supabase.from('supplier_rfq').select('id, rfq_number, status, request_date, suppliers(name)').eq('customer_rfq_id', rfqId).order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name').eq('organization_id', organizationId).order('name'),
    ])
    setRfq((rRes.data as unknown as Rfq) || null)
    setLines((lRes.data as unknown as RfqLine[]) || [])
    setSupplierRfqs((sRes.data as unknown as SupplierRfq[]) || [])
    setSuppliers((supRes.data as { id: string; name: string }[]) || [])
    setLoading(false)
  }, [rfqId, organizationId])

  useEffect(() => {
    if (!loaded || !canAccess) return
    fetchData()
  }, [loaded, canAccess, fetchData])

  async function issueSupplierRfq(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) { setError('Pilih supplier.'); return }
    setIssuing(true)
    setError(null)
    const { data: numberData } = await supabase.rpc('generate_rfq_number', { p_prefix: 'RFQS' })
    const rfqNumber = (numberData as string) || `RFQS/${Date.now()}`

    const { data: inserted, error: insErr } = await supabase.from('supplier_rfq').insert({
      organization_id: organizationId,
      rfq_number: rfqNumber,
      customer_rfq_id: rfqId,
      supplier_id: supplierId,
      request_date: new Date().toISOString().slice(0, 10),
      response_due: responseDue || null,
      status: 'SENT',
      created_by: userId,
    }).select().single()

    if (insErr || !inserted) { setError(insErr?.message ?? 'Gagal.'); setIssuing(false); return }

    const { error: lineErr } = await supabase.from('supplier_rfq_lines').insert(
      lines.map((l) => ({ rfq_id: inserted.id, product_id: l.product_id, description: l.description, quantity_kg: l.quantity_kg }))
    )
    setIssuing(false)
    if (lineErr) { setError(lineErr.message); return }
    setShowIssue(false)
    setSupplierId('')
    setResponseDue('')
    fetchData()
  }

  if (loaded && !canAccess) return <AppShell><div className="p-6 text-center text-slate-500">Anda tidak memiliki akses.</div></AppShell>

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <button onClick={() => router.push('/operational/rfq-customer')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>

        {loading ? (
          <div className="text-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : !rfq ? (
          <div className="text-center py-16 text-slate-400">Permintaan tidak ditemukan.</div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-bold text-slate-800 font-display">{rfq.rfq_number}</h1>
                  <p className="text-xs text-slate-400 mt-0.5">Calon customer: {rfq.customer_name ?? rfq.customers?.name ?? '-'}</p>
                </div>
                <StatusBadge status={rfq.status} />
              </div>
              <div className="p-5 space-y-4">
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-slate-500">Tanggal</span><span className="text-sm font-medium text-slate-800">{formatDate(rfq.request_date)}</span></div>
                  <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-slate-500">Dibutuhkan</span><span className="text-sm font-medium text-slate-800">{rfq.needed_by ? formatDate(rfq.needed_by) : '-'}</span></div>
                  <div className="flex items-center justify-between px-4 py-2.5"><span className="text-sm text-slate-500">Catatan</span><span className="text-sm font-medium text-slate-800 text-right">{rfq.notes ?? '-'}</span></div>
                </div>

                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="bg-slate-50 border-b border-slate-200"><th className="text-left px-4 py-2 font-semibold text-slate-600">Barang</th><th className="text-right px-4 py-2 font-semibold text-slate-600">Jumlah (kg)</th></tr></thead>
                    <tbody>
                      {lines.length === 0 ? <tr><td colSpan={2} className="text-center py-4 text-slate-400">Tidak ada barang.</td></tr> : lines.map((l) => (
                        <tr key={l.id} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2 text-slate-800">{l.products?.name ?? l.description ?? '-'}</td>
                          <td className="px-4 py-2 text-right font-mono text-slate-700">{Number(l.quantity_kg).toLocaleString('id-ID')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button onClick={() => setShowIssue(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg">
                    <Send className="w-4 h-4" /> Terbitkan RFQ ke Supplier
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4 flex items-center gap-2">
                <PackageSearch className="w-4 h-4 text-primary" /> RFQ ke Supplier
              </h2>
              {supplierRfqs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Belum ada RFQ ke supplier.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {supplierRfqs.map((s) => (
                    <div key={s.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <Link href={`/operational/rfq-supplier/${s.id}`} className="text-sm font-medium text-cyan-700 hover:underline">{s.rfq_number}</Link>
                        <p className="text-xs text-slate-500">{s.suppliers?.name ?? '-'} · {formatDate(s.request_date)}</p>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal open={showIssue} onClose={() => setShowIssue(false)} title="Terbitkan RFQ ke Supplier" size="md">
        <form onSubmit={issueSupplierRfq} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Supplier</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">-- Pilih supplier --</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {suppliers.length === 0 && <p className="text-xs text-slate-400 mt-1">Belum ada supplier. Tambahkan di Data Master.</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Batas Jawaban (opsional)</label>
            <input type="date" value={responseDue} onChange={(e) => setResponseDue(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <p className="text-xs text-slate-400">Barang dari permintaan customer akan disalin otomatis ke RFQ supplier ini.</p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowIssue(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" disabled={issuing || !supplierId} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Terbitkan
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  )
}

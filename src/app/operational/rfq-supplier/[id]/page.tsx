'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Save, DollarSign } from 'lucide-react'
import { formatDate, formatCurrency } from '@/lib/utils'

type SupplierRfq = {
  id: string
  rfq_number: string
  request_date: string
  response_due: string | null
  status: string
  notes: string | null
  supplier_id: string
  customer_rfq_id: string | null
  suppliers: { name: string } | null
  customer_rfq: { rfq_number: string } | null
}

type RfqLine = { id: string; product_id: string | null; description: string | null; quantity_kg: number; products: { name: string; sku: string } | null }

type QuoteRow = { product_id: string | null; description: string | null; quantity_kg: number; cost_per_kg: string }

export default function RfqSupplierDetailPage() {
  const { roleCode, loaded, organizationId, userId } = useSession()
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const rfqId = params.id

  const [rfq, setRfq] = useState<SupplierRfq | null>(null)
  const [lines, setLines] = useState<RfqLine[]>([])
  const [quotes, setQuotes] = useState<{ id: string; quote_number: string; status: string; quote_date: string }[]>([])
  const [rows, setRows] = useState<QuoteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'

  const fetchData = useCallback(async () => {
    if (!rfqId || !organizationId) return
    setLoading(true)
    const [rRes, lRes, qRes] = await Promise.all([
      supabase.from('supplier_rfq').select('*, suppliers(name), customer_rfq(rfq_number)').eq('id', rfqId).single(),
      supabase.from('supplier_rfq_lines').select('*, products(name, sku)').eq('rfq_id', rfqId),
      supabase.from('supplier_quotes').select('id, quote_number, status, quote_date').eq('supplier_rfq_id', rfqId).order('created_at', { ascending: false }),
    ])
    const rfqData = rRes.data as unknown as SupplierRfq | null
    const lineData = (lRes.data as unknown as RfqLine[]) || []
    setRfq(rfqData)
    setLines(lineData)
    setQuotes((qRes.data as { id: string; quote_number: string; status: string; quote_date: string }[]) || [])
    setRows(lineData.map((l) => ({ product_id: l.product_id, description: l.description, quantity_kg: l.quantity_kg, cost_per_kg: '' })))
    setLoading(false)
  }, [rfqId, organizationId])

  useEffect(() => {
    if (!loaded || !canAccess) return
    fetchData()
  }, [loaded, canAccess, fetchData])

  function updateCost(i: number, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, cost_per_kg: value } : r)))
  }

  async function saveQuote(e: React.FormEvent) {
    e.preventDefault()
    setError(null); setFlash(null)
    const valid = rows.filter((r) => parseFloat(r.cost_per_kg) > 0)
    if (valid.length === 0) { setError('Isi minimal 1 harga beli dari supplier.'); return }
    setSaving(true)
    const { data: numberData } = await supabase.rpc('generate_rfq_number', { p_prefix: 'SQ' })
    const quoteNumber = (numberData as string) || `SQ/${Date.now()}`

    const { data: inserted, error: insErr } = await supabase.from('supplier_quotes').insert({
      organization_id: organizationId,
      quote_number: quoteNumber,
      supplier_rfq_id: rfqId,
      supplier_id: rfq?.supplier_id,
      quote_date: new Date().toISOString().slice(0, 10),
      status: 'RECEIVED',
      created_by: userId,
    }).select().single()

    if (insErr || !inserted) { setError(insErr?.message ?? 'Gagal.'); setSaving(false); return }

    const { error: lineErr } = await supabase.from('supplier_quote_lines').insert(
      valid.map((r) => ({
        quote_id: inserted.id,
        product_id: r.product_id,
        description: r.description,
        quantity_kg: r.quantity_kg,
        cost_per_kg: parseFloat(r.cost_per_kg),
        subtotal: r.quantity_kg * parseFloat(r.cost_per_kg),
      }))
    )
    if (lineErr) { setError(lineErr.message); setSaving(false); return }

    await supabase.from('supplier_rfq').update({ status: 'ANSWERED' }).eq('id', rfqId)
    setSaving(false)
    setFlash(`Harga supplier ${quoteNumber} tersimpan. Lanjutkan ke Penawaran Harga ke customer.`)
    fetchData()
  }

  const total = rows.reduce((sum, r) => sum + r.quantity_kg * (parseFloat(r.cost_per_kg) || 0), 0)

  if (loaded && !canAccess) return <AppShell><div className="p-6 text-center text-slate-500">Anda tidak memiliki akses.</div></AppShell>

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <button onClick={() => router.push('/operational/rfq-supplier')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Kembali
        </button>

        {loading ? (
          <div className="text-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : !rfq ? (
          <div className="text-center py-16 text-slate-400">RFQ tidak ditemukan.</div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h1 className="text-lg font-bold text-slate-800 font-display">{rfq.rfq_number}</h1>
                  <p className="text-xs text-slate-400 mt-0.5">Supplier: {rfq.suppliers?.name ?? '-'}{rfq.customer_rfq ? ` · Dari ${rfq.customer_rfq.rfq_number}` : ''}</p>
                </div>
                <StatusBadge status={rfq.status} />
              </div>
              <form onSubmit={saveQuote} className="p-5 space-y-4">
                {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
                {flash && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{flash}</div>}

                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-2 font-semibold text-slate-600">Barang</th>
                        <th className="text-right px-4 py-2 font-semibold text-slate-600">Jumlah (kg)</th>
                        <th className="text-right px-4 py-2 font-semibold text-slate-600">Harga Beli /kg</th>
                        <th className="text-right px-4 py-2 font-semibold text-slate-600">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? <tr><td colSpan={4} className="text-center py-4 text-slate-400">Tidak ada barang.</td></tr> : rows.map((r, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-0">
                          <td className="px-4 py-2 text-slate-800">{lines[i]?.products?.name ?? r.description ?? '-'}</td>
                          <td className="px-4 py-2 text-right font-mono text-slate-700">{Number(r.quantity_kg).toLocaleString('id-ID')}</td>
                          <td className="px-4 py-2 text-right">
                            <input type="number" step="0.01" value={r.cost_per_kg} onChange={(e) => updateCost(i, e.target.value)} placeholder="0" className="w-32 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary" />
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-slate-700">{formatCurrency(r.quantity_kg * (parseFloat(r.cost_per_kg) || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t border-slate-200">
                        <td colSpan={3} className="px-4 py-2.5 text-right font-semibold text-slate-600">Total Harga Beli</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">{formatCurrency(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="flex justify-end gap-3">
                  {rfq.customer_rfq_id && (
                    <Link href={`/operational/quotations/new?customerRfq=${rfq.customer_rfq_id}`} className="flex items-center gap-2 px-4 py-2 border border-primary/30 text-primary text-sm font-medium rounded-lg hover:bg-primary/5">
                      Buat Penawaran ke Customer
                    </Link>
                  )}
                  <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Simpan Harga Supplier
                  </button>
                </div>
              </form>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" /> Riwayat Harga Supplier
              </h2>
              {quotes.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Belum ada harga tersimpan.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {quotes.map((q) => (
                    <div key={q.id} className="py-2.5 flex items-center justify-between">
                      <span className="text-sm font-medium text-cyan-700 font-mono">{q.quote_number}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">{formatDate(q.quote_date)}</span>
                        <StatusBadge status={q.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

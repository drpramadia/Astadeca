'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { Modal } from '@/components/ui/modal'
import { DocumentPrintView, type DocumentPrintData } from '@/components/document-print'
import { useSession } from '@/hooks/use-session'
import { useRoleGuard } from '@/hooks/use-role-guard'
import { AccessDenied } from '@/components/access-denied'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Printer, Loader2, FileText } from 'lucide-react'

type Billing = {
  id: string
  invoice_number: string
  status: string
  total_amount: number
  period_start: string
  period_end: string
  created_at: string
  contract_id: string
  rental_contracts: { contract_number: string; rental_customers: { name: string } | null; cold_storages: { name: string } | null } | null
}

type BillingLine = {
  description: string
  quantity_kg: number
  price_per_kg: number
  subtotal: number
}

export default function BillingDetailPage() {
  const { loaded, organizationId } = useSession()
  const { denied } = useRoleGuard(['ADMIN', 'DIRECTOR'])
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const billingId = params.id

  const [row, setRow] = useState<Billing | null>(null)
  const [lines, setLines] = useState<BillingLine[]>([])
  const [loading, setLoading] = useState(true)
  const [printData, setPrintData] = useState<DocumentPrintData | null>(null)

  const fetchData = useCallback(async () => {
    if (!billingId || !organizationId) return
    setLoading(true)
    const { data } = await supabase
      .from('rental_billing')
      .select('*, rental_contracts(contract_number, rental_customers(name), cold_storages(name))')
      .eq('id', billingId)
      .single()
    const { data: lineRows } = await supabase
      .from('rental_billing_lines')
      .select('description, quantity_kg, price_per_kg, subtotal')
      .eq('billing_id', billingId)
    setRow((data as unknown as Billing) || null)
    setLines((lineRows as BillingLine[]) || [])
    setLoading(false)
  }, [billingId, organizationId])

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded, fetchData])

  function buildPrintData(r: Billing, l: BillingLine[]): DocumentPrintData {
    return {
      docType: 'Invoice',
      docNumber: r.invoice_number,
      date: r.created_at,
      status: r.status,
      meta: [
        { label: 'No. Kontrak', value: r.rental_contracts?.contract_number ?? '-' },
        { label: 'Cold Storage', value: r.rental_contracts?.cold_storages?.name ?? '-' },
        { label: 'Periode', value: `${new Date(r.period_start).toLocaleDateString('id-ID')} - ${new Date(r.period_end).toLocaleDateString('id-ID')}` },
      ],
      party: r.rental_contracts?.rental_customers ? { title: 'Kepada:', lines: [r.rental_contracts.rental_customers.name] } : undefined,
      lines: l.map((x) => ({ name: x.description, quantity: x.quantity_kg, unit: 'kg', price: x.price_per_kg, subtotal: x.subtotal })),
      totals: [{ label: 'Total Tagihan', value: r.total_amount }],
      signatures: ['Dibuat Oleh', 'Diterima Oleh'],
    }
  }

  if (denied) return <AccessDenied message="Halaman invoice hanya untuk Admin atau Director." />

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <button onClick={() => router.push('/cold-storage/billing')} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft className="w-4 h-4" /> Kembali ke Billing
        </button>

        {loading ? (
          <div className="text-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : !row ? (
          <div className="text-center py-16 text-slate-400"><FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />Invoice tidak ditemukan.</div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold text-slate-800 font-display">Invoice {row.invoice_number}</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  {row.rental_contracts?.rental_customers?.name ?? '-'} · Kontrak {row.rental_contracts?.contract_number ?? '-'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={row.status} />
                <button onClick={() => setPrintData(buildPrintData(row, lines))} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors">
                  <Printer className="w-4 h-4" /> Cetak
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-slate-500">Periode Tagih</span>
                  <span className="text-sm font-medium text-slate-800">
                    {new Date(row.period_start).toLocaleDateString('id-ID')} - {new Date(row.period_end).toLocaleDateString('id-ID')}
                  </span>
                </div>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-slate-500">Cold Storage</span>
                  <span className="text-sm font-medium text-slate-800">{row.rental_contracts?.cold_storages?.name ?? '-'}</span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="text-left px-4 py-2 font-semibold text-slate-600">Deskripsi</th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-600">Qty (kg-hari)</th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-600">Tarif</th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-600">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-6 text-slate-400">Belum ada rincian tagihan.</td></tr>
                    ) : lines.map((l, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2 text-slate-800">{l.description}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">{Number(l.quantity_kg).toLocaleString('id-ID')}</td>
                        <td className="px-4 py-2 text-right font-mono text-slate-700">Rp {Number(l.price_per_kg).toLocaleString('id-ID')}</td>
                        <td className="px-4 py-2 text-right font-mono font-semibold text-slate-800">Rp {Number(l.subtotal).toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200">
                      <td colSpan={3} className="px-4 py-2.5 text-right font-semibold text-slate-600">Total Tagihan</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">Rp {Number(row.total_amount).toLocaleString('id-ID')}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal open={!!printData} onClose={() => setPrintData(null)} title="Invoice" size="xl">
        {printData && <DocumentPrintView data={printData} onClose={() => setPrintData(null)} />}
      </Modal>
    </AppShell>
  )
}

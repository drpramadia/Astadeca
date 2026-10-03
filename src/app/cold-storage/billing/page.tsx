'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { Modal } from '@/components/ui/modal'
import { DocumentPrintView, type DocumentPrintData } from '@/components/document-print'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Search, DollarSign, Loader2, Printer, Plus, X } from 'lucide-react'

type Billing = {
  id: string
  invoice_number: string
  total_amount: number
  status: string
  period_start: string
  period_end: string
  created_at: string
  rental_contracts: { contract_number: string } | null
  rental_customers: { name: string } | null
}

type BillingLine = {
  description: string
  quantity_kg: number
  price_per_kg: number
  subtotal: number
}

export default function BillingPage() {
  const { roleName, roleCode, loaded, organizationId } = useSession()
  const [data, setData] = useState<Billing[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [printData, setPrintData] = useState<DocumentPrintData | null>(null)
  const [loadingPrint, setLoadingPrint] = useState(false)

  const canIssue = roleCode === 'ADMIN' || roleCode === 'DIRECTOR' || roleCode === 'SYSTEM_ADMIN'
  const [showIssue, setShowIssue] = useState(false)
  const [contracts, setContracts] = useState<{ id: string; contract_number: string; customer: string | null }[]>([])
  const [contractId, setContractId] = useState('')
  const [issuing, setIssuing] = useState(false)
  const [issueError, setIssueError] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded])

  async function loadContracts() {
    const { data: rows } = await supabase
      .from('rental_contracts')
      .select('id, contract_number, is_spot, rental_customers(name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(200)
    setContracts(
      ((rows as unknown as { id: string; contract_number: string; is_spot: boolean; rental_customers: { name: string } | null }[]) || [])
        .filter((c) => !c.is_spot)
        .map((c) => ({ id: c.id, contract_number: c.contract_number, customer: c.rental_customers?.name ?? null }))
    )
  }

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault()
    if (!contractId) { setIssueError('Pilih kontrak dulu.'); return }
    setIssuing(true)
    setIssueError(null)
    const { data, error } = await supabase.rpc('calculate_rental_billing', { p_contract_id: contractId })
    setIssuing(false)
    if (error) { setIssueError(error.message); return }
    const row = Array.isArray(data) ? data[0] : data
    const invNum = (row as { out_invoice_number?: string } | null)?.out_invoice_number
    setShowIssue(false)
    setContractId('')
    await fetchData()
    if (invNum) alert(`Invoice ${invNum} berhasil diterbitkan.`)
  }

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('rental_billing')
      .select('*, rental_contracts(contract_number), rental_contracts(rental_customers(name))')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)
    setData((rows as Billing[]) || [])
    setLoading(false)
  }

  async function openPrint(row: Billing) {
    setLoadingPrint(true)
    setPrintData(null)
    const { data: lineRows } = await supabase
      .from('rental_billing_lines')
      .select('description, quantity_kg, price_per_kg, subtotal')
      .eq('billing_id', row.id)
    const lines = (lineRows as BillingLine[] | null) || []
    const customer = (row as Billing & { rental_customers?: { name: string } | null }).rental_customers

    setPrintData({
      docType: 'Invoice',
      docNumber: row.invoice_number,
      date: row.created_at,
      status: row.status,
      meta: [
        { label: 'No. Kontrak', value: row.rental_contracts?.contract_number ?? '-' },
        { label: 'Periode', value: `${new Date(row.period_start).toLocaleDateString('id-ID')} - ${new Date(row.period_end).toLocaleDateString('id-ID')}` },
      ],
      party: customer ? { title: 'Kepada:', lines: [customer.name] } : undefined,
      lines: lines.map((l) => ({
        name: l.description,
        quantity: l.quantity_kg,
        unit: 'kg',
        price: l.price_per_kg,
        subtotal: l.subtotal,
      })),
      totals: [{ label: 'Total Tagihan', value: row.total_amount }],
      signatures: ['Dibuat Oleh', 'Diterima Oleh'],
    })
    setLoadingPrint(false)
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.invoice_number?.toLowerCase().includes(q) ||
      (r as any).rental_customers?.name?.toLowerCase().includes(q) ||
      r.rental_contracts?.contract_number?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Billing</h1>
            <p className="mt-1 text-sm text-slate-500">Tagihan dan invoice rental cold storage</p>
          </div>
          {canIssue && (
            <button
              onClick={() => { setShowIssue(true); loadContracts() }}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Terbitkan Invoice
            </button>
          )}
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari invoice atau customer..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. Invoice</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Kontrak</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Total</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Periode</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tanggal</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400"><DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada billing</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-cyan-700">{row.invoice_number}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{row.rental_contracts?.contract_number ?? '-'}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{(row as any).rental_customers?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold text-slate-800">Rp {row.total_amount.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(row.period_start).toLocaleDateString('id-ID')} - {new Date(row.period_end).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">{new Date(row.created_at).toLocaleDateString('id-ID')}</td>
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

      {/* Pratinjau / cetak invoice */}
      <Modal open={!!printData || loadingPrint} onClose={() => setPrintData(null)} title="Invoice" size="xl">
        {loadingPrint || !printData ? (
          <div className="py-16 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <DocumentPrintView data={printData} onClose={() => setPrintData(null)} />
        )}
      </Modal>

      {/* Terbitkan invoice */}
      <Modal open={showIssue} onClose={() => setShowIssue(false)} title="Terbitkan Invoice Billing" size="md">
        <form onSubmit={handleIssue} className="space-y-4">
          {issueError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{issueError}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Pilih Kontrak</label>
            <select value={contractId} onChange={(e) => setContractId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">-- Pilih kontrak --</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>{c.contract_number}{c.customer ? ` — ${c.customer}` : ''}</option>
              ))}
            </select>
            {contracts.length === 0 && <p className="text-xs text-slate-400 mt-1">Tidak ada kontrak rental.</p>}
          </div>
          <p className="text-xs text-slate-400">
            Invoice dihitung otomatis dari berat barang &amp; lama penyimpanan (per kg/hari) untuk periode tagih berjalan.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowIssue(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 inline mr-1" />Batal</button>
            <button type="submit" disabled={issuing || !contractId} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Terbitkan
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  )
}

'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { Modal } from '@/components/ui/modal'
import { DocumentPrintView, type DocumentPrintData } from '@/components/document-print'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Plus, RefreshCw, Package, PackageMinus, FileText, Loader2, AlertTriangle, Printer } from 'lucide-react'

type Contract = {
  id: string
  contract_number: string
  status: string
  start_date: string
  end_date: string
  price_per_kg_per_day: number
  total_estimated_kg: number
  notes: string | null
  created_at: string
  rental_customers: { name: string } | null
  cold_storages: { name: string } | null
}

type Receiving = {
  id: string
  received_kg: number
  batch_number: string | null
  received_at: string
  notes: string | null
}

type Release = {
  id: string
  released_kg: number
  batch_number: string | null
  released_at: string
  notes: string | null
}

type Billing = {
  id: string
  invoice_number: string
  total_amount: number
  status: string
  period_start: string
  period_end: string
  rental_billing_lines: { description: string; quantity_kg: number; price_per_kg: number; subtotal: number }[]
}

export default function ContractDetailPage() {
  const { loaded, organizationId, userId } = useSession()
  const params = useParams<{ id: string }>()
  const contractId = params.id

  const [contract, setContract] = useState<Contract | null>(null)
  const [receivings, setReceivings] = useState<Receiving[]>([])
  const [releases, setReleases] = useState<Release[]>([])
  const [billing, setBilling] = useState<Billing | null>(null)
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)

  const [printData, setPrintData] = useState<DocumentPrintData | null>(null)
  const [loadingPrint, setLoadingPrint] = useState(false)

  const [recvKg, setRecvKg] = useState('')
  const [recvBatch, setRecvBatch] = useState('')
  const [recvDate, setRecvDate] = useState('')
  const [recvNotes, setRecvNotes] = useState('')
  const [recvSaving, setRecvSaving] = useState(false)

  const [relKg, setRelKg] = useState('')
  const [relBatch, setRelBatch] = useState('')
  const [relDate, setRelDate] = useState('')
  const [relNotes, setRelNotes] = useState('')
  const [relSaving, setRelSaving] = useState(false)

  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!contractId) return
    setLoading(true)

    const [cRes, rRes, relRes, bRes] = await Promise.all([
      supabase.from('rental_contracts')
        .select('*, rental_customers(name), cold_storages(name)')
        .eq('id', contractId)
        .single(),
      supabase.from('rental_receivings')
        .select('*')
        .eq('contract_id', contractId)
        .order('received_at', { ascending: true }),
      supabase.from('rental_releases')
        .select('*')
        .eq('contract_id', contractId)
        .order('released_at', { ascending: true }),
      supabase.from('rental_billing')
        .select('*, rental_billing_lines(*)')
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    setContract((cRes.data as Contract) || null)
    setReceivings((rRes.data as Receiving[]) || [])
    setReleases((relRes.data as Release[]) || [])
    setBilling((bRes.data as Billing) || null)
    setLoading(false)
  }, [contractId])

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded, fetchData])

  async function addReceiving() {
    if (!contractId || !userId) return
    const kg = parseFloat(recvKg)
    if (!kg || kg <= 0) { setError('Masukkan jumlah kg yang valid'); return }

    setRecvSaving(true)
    setError(null)

    const { error: insErr } = await supabase.from('rental_receivings').insert({
      organization_id: organizationId,
      contract_id: contractId,
      received_kg: kg,
      batch_number: recvBatch || null,
      received_at: recvDate ? `${recvDate}T00:00:00` : new Date().toISOString(),
      received_by: userId,
      notes: recvNotes || null,
    })

    if (insErr) {
      setError(`Gagal menyimpan: ${insErr.message}`)
      setRecvSaving(false)
      return
    }

    setRecvKg('')
    setRecvBatch('')
    setRecvDate('')
    setRecvNotes('')
    setRecvSaving(false)
    await fetchData()
  }

  async function addRelease() {
    if (!contractId || !userId) return
    const kg = parseFloat(relKg)
    if (!kg || kg <= 0) { setError('Masukkan jumlah kg yang valid'); return }

    setRelSaving(true)
    setError(null)

    const { error: insErr } = await supabase.from('rental_releases').insert({
      organization_id: organizationId,
      contract_id: contractId,
      released_kg: kg,
      batch_number: relBatch || null,
      released_at: relDate ? `${relDate}T00:00:00` : new Date().toISOString(),
      released_by: userId,
      notes: relNotes || null,
    })

    if (insErr) {
      setError(`Gagal menyimpan: ${insErr.message}`)
      setRelSaving(false)
      return
    }

    setRelKg('')
    setRelBatch('')
    setRelDate('')
    setRelNotes('')
    setRelSaving(false)
    await fetchData()
  }

  async function recalculateBilling() {
    if (!contractId) return
    setRecalculating(true)
    setError(null)

    const { error: rpcErr } = await supabase.rpc('calculate_rental_billing', { p_contract_id: contractId })

    if (rpcErr) {
      setError(`Gagal hitung ulang: ${rpcErr.message}`)
    }

    setRecalculating(false)
    await fetchData()
  }

  function openPrint() {
    if (!contract) return
    setLoadingPrint(true)
    setPrintData(null)
    setPrintData({
      docType: 'Kontrak Rental',
      docNumber: contract.contract_number,
      date: contract.start_date,
      status: contract.status,
      meta: [
        { label: 'Customer', value: contract.rental_customers?.name ?? '-' },
        { label: 'Cold Storage', value: contract.cold_storages?.name ?? '-' },
        { label: 'Periode', value: `${new Date(contract.start_date).toLocaleDateString('id-ID')} - ${new Date(contract.end_date).toLocaleDateString('id-ID')}` },
        { label: 'Tarif per Kg/Hari', value: `Rp ${Number(contract.price_per_kg_per_day).toLocaleString('id-ID')}` },
      ],
      lines: [
        {
          name: 'Estimasi Kapasitas Rental',
          quantity: contract.total_estimated_kg,
          unit: 'kg',
          price: contract.price_per_kg_per_day,
        },
      ],
      totals: [{ label: 'Total Estimasi Kg', value: `${Number(contract.total_estimated_kg).toLocaleString('id-ID')} kg` }],
      notes: contract.notes,
      signatures: ['Pihak Penyewa', 'Pihak Cold Storage'],
    })
    setLoadingPrint(false)
  }

  if (loading) {
    return (
      <AppShell>
        <div className="p-6 text-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-600 mx-auto" />
        </div>
      </AppShell>
    )
  }

  if (!contract) {
    return (
      <AppShell>
        <div className="p-6 text-center py-20 text-slate-500">Kontrak tidak ditemukan.</div>
      </AppShell>
    )
  }

  const totalReceived = receivings.reduce((s, r) => s + Number(r.received_kg), 0)
  const totalReleased = releases.reduce((s, r) => s + Number(r.released_kg), 0)
  const currentKg = totalReceived - totalReleased

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Link href="/cold-storage/contracts" className="text-slate-400 hover:text-slate-600">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-slate-800 font-display">{contract.contract_number}</h1>
              <p className="text-sm text-slate-500">Detail kontrak rental cold storage</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openPrint}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-line text-ink text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Kontrak</span>
            </button>
            <button
              onClick={recalculateBilling}
              disabled={recalculating}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              {recalculating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>Hitung Ulang</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard label="Customer" value={contract.rental_customers?.name ?? '-'} />
          <SummaryCard label="Cold Storage" value={contract.cold_storages?.name ?? '-'} />
          <SummaryCard label="Tarif" value={`Rp ${Number(contract.price_per_kg_per_day).toLocaleString('id-ID')}/kg/hari`} />
          <SummaryCard label="Periode" value={`${new Date(contract.start_date).toLocaleDateString('id-ID')} - ${new Date(contract.end_date).toLocaleDateString('id-ID')}`} />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Masuk</p>
            <p className="text-xl font-bold text-emerald-600 font-mono">{totalReceived.toLocaleString('id-ID')} kg</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Keluar</p>
            <p className="text-xl font-bold text-red-600 font-mono">{totalReleased.toLocaleString('id-ID')} kg</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Stok Saat Ini</p>
            <p className="text-xl font-bold text-cyan-600 font-mono">{currentKg.toLocaleString('id-ID')} kg</p>
          </div>
        </div>

        {billing && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-600" /> Billing
              </h2>
              <StatusBadge status={billing.status} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500">No. Invoice</p>
                <p className="font-mono text-sm font-medium text-cyan-700">{billing.invoice_number}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total Tagihan</p>
                <p className="font-mono text-lg font-bold text-slate-800">Rp {Number(billing.total_amount).toLocaleString('id-ID')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Periode</p>
                <p className="text-sm text-slate-700">{new Date(billing.period_start).toLocaleDateString('id-ID')} - {new Date(billing.period_end).toLocaleDateString('id-ID')}</p>
              </div>
            </div>
            {billing.rental_billing_lines?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                {billing.rental_billing_lines.map((line, i) => (
                  <div key={i} className="flex justify-between text-sm py-1">
                    <span className="text-slate-600">{line.description}</span>
                    <span className="font-mono text-slate-800">Rp {Number(line.subtotal).toLocaleString('id-ID')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2 mb-4">
              <Package className="w-4 h-4 text-emerald-600" /> Barang Masuk
            </h2>

            <div className="space-y-3 mb-5">
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Jumlah (kg)" value={recvKg} onChange={(e) => setRecvKg(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <input type="text" placeholder="Batch no." value={recvBatch} onChange={(e) => setRecvBatch(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={recvDate} onChange={(e) => setRecvDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <input type="text" placeholder="Catatan" value={recvNotes} onChange={(e) => setRecvNotes(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <button onClick={addReceiving} disabled={recvSaving} className="flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 w-full justify-center">
                {recvSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>Tambah Barang Masuk</span>
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {receivings.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Belum ada barang masuk</p>
              ) : (
                receivings.map((r) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{Number(r.received_kg).toLocaleString('id-ID')} kg</p>
                      <p className="text-xs text-slate-500">{r.batch_number ? `Batch: ${r.batch_number}` : ''} {r.notes ? `· ${r.notes}` : ''}</p>
                    </div>
                    <p className="text-xs text-slate-400">{new Date(r.received_at).toLocaleDateString('id-ID')}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2 mb-4">
              <PackageMinus className="w-4 h-4 text-red-600" /> Barang Keluar
            </h2>

            <div className="space-y-3 mb-5">
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Jumlah (kg)" value={relKg} onChange={(e) => setRelKg(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <input type="text" placeholder="Batch no." value={relBatch} onChange={(e) => setRelBatch(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={relDate} onChange={(e) => setRelDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <input type="text" placeholder="Catatan" value={relNotes} onChange={(e) => setRelNotes(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <button onClick={addRelease} disabled={relSaving} className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 w-full justify-center">
                {relSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>Tambah Barang Keluar</span>
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {releases.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Belum ada barang keluar</p>
              ) : (
                releases.map((r) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{Number(r.released_kg).toLocaleString('id-ID')} kg</p>
                      <p className="text-xs text-slate-500">{r.batch_number ? `Batch: ${r.batch_number}` : ''} {r.notes ? `· ${r.notes}` : ''}</p>
                    </div>
                    <p className="text-xs text-slate-400">{new Date(r.released_at).toLocaleDateString('id-ID')}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Pratinjau / cetak kontrak */}
      <Modal open={!!printData || loadingPrint} onClose={() => setPrintData(null)} title="Kontrak Rental" size="xl">
        {loadingPrint || !printData ? (
          <div className="py-16 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <DocumentPrintView data={printData} onClose={() => setPrintData(null)} />
        )}
      </Modal>
    </AppShell>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  )
}

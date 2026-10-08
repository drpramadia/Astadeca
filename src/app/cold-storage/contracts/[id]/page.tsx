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
  expiry_date: string | null
  product_id: string | null
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

type WasteRecord = {
  id: string
  batch_number: string | null
  quantity_kg: number
  reason: string
  notes: string | null
  recorded_at: string
}

type WasteCandidate = {
  contract_id: string
  contract_number: string
  batch_number: string | null
  received_kg: number
  released_kg: number
  diff_kg: number
  expiry_date: string | null
}

const WASTE_REASONS: Record<string, string> = {
  SHRINKAGE: 'Susut (selisih)',
  EXPIRY: 'Kedaluwarsa',
  DAMAGED: 'Rusak',
  OTHER: 'Lainnya',
}

export default function ContractDetailPage() {
  const { loaded, organizationId, userId } = useSession()
  const { denied } = useRoleGuard(['ADMIN', 'DIRECTOR', 'WAREHOUSE'])
  const params = useParams<{ id: string }>()
  const contractId = params.id

  const [contract, setContract] = useState<Contract | null>(null)
  const [receivings, setReceivings] = useState<Receiving[]>([])
  const [releases, setReleases] = useState<Release[]>([])
  const [waste, setWaste] = useState<WasteRecord[]>([])
  const [wasteCandidates, setWasteCandidates] = useState<WasteCandidate[]>([])
  const [billing, setBilling] = useState<Billing | null>(null)
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)

  const [wasteKg, setWasteKg] = useState('')
  const [wasteBatch, setWasteBatch] = useState('')
  const [wasteReason, setWasteReason] = useState('SHRINKAGE')
  const [wasteNotes, setWasteNotes] = useState('')
  const [wasteSaving, setWasteSaving] = useState(false)

  const [printData, setPrintData] = useState<DocumentPrintData | null>(null)
  const [loadingPrint, setLoadingPrint] = useState(false)

  const [recvKg, setRecvKg] = useState('')
  const [recvBatch, setRecvBatch] = useState('')
  const [recvDate, setRecvDate] = useState('')
  const [recvExpiry, setRecvExpiry] = useState('')
  const [recvProduct, setRecvProduct] = useState('')
  const [recvNotes, setRecvNotes] = useState('')
  const [recvSaving, setRecvSaving] = useState(false)
  const [products, setProducts] = useState<{ id: string; name: string; sku: string }[]>([])

  const [wasteProduct, setWasteProduct] = useState('')

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

    const { data: wasteRows } = await supabase
      .from('waste_records')
      .select('*')
      .eq('contract_id', contractId)
      .order('recorded_at', { ascending: false })

    const { data: candRows } = await supabase.rpc('waste_candidates', { p_organization_id: organizationId })
    const cand = ((candRows as WasteCandidate[]) || []).filter((c) => c.contract_id === contractId)

    setContract((cRes.data as Contract) || null)
    setReceivings((rRes.data as Receiving[]) || [])
    setReleases((relRes.data as Release[]) || [])
    setWaste((wasteRows as WasteRecord[]) || [])
    setWasteCandidates(cand)
    setBilling((bRes.data as Billing) || null)
    setLoading(false)
  }, [contractId, organizationId])

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded, fetchData])

  useEffect(() => {
    if (!loaded || !organizationId) return
    supabase
      .from('products')
      .select('id, name, sku')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name')
      .limit(1000)
      .then(({ data }) => setProducts((data as { id: string; name: string; sku: string }[]) || []))
  }, [loaded, organizationId])

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
      expiry_date: recvExpiry || null,
      product_id: recvProduct || null,
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
    setRecvExpiry('')
    setRecvProduct('')
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

    // Gate: barang tidak boleh keluar bila masih ada tagihan belum lunas
    if (billing && ['SENT', 'OVERDUE'].includes(billing.status)) {
      setRelSaving(false)
      setError('Barang tidak dapat dikeluarkan: tagihan belum lunas. Lunasi dulu atau ajukan approval pengeluaran.')
      return
    }

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

  async function requestReleaseApproval() {
    if (!contractId || !userId) return
    setRelSaving(true)
    setError(null)
    const { error: apprErr } = await supabase.from('approval_requests').insert({
      organization_id: organizationId,
      request_type: 'RENTAL_RELEASE',
      reference_id: contractId,
      status: 'PENDING',
      requested_by: userId,
      comment: `Permintaan pengeluaran barang untuk kontrak ${contract?.contract_number ?? contractId}`,
    })
    setRelSaving(false)
    if (apprErr) { setError(apprErr.message); return }
    alert('Permintaan approval pengeluaran terkirim ke Director.')
  }

  async function recordWaste() {
    if (!contractId || !userId) return
    const kg = parseFloat(wasteKg)
    if (!kg || kg <= 0) { setError('Masukkan jumlah waste (kg) yang valid'); return }
    setWasteSaving(true)
    setError(null)
    const { error: insErr } = await supabase.from('waste_records').insert({
      organization_id: organizationId,
      contract_id: contractId,
      product_id: wasteProduct || null,
      batch_number: wasteBatch || null,
      quantity_kg: kg,
      reason: wasteReason,
      notes: wasteNotes || null,
      recorded_by: userId,
    })
    setWasteSaving(false)
    if (insErr) { setError(`Gagal menyimpan waste: ${insErr.message}`); return }
    setWasteKg(''); setWasteBatch(''); setWasteReason('SHRINKAGE'); setWasteNotes(''); setWasteProduct('')
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
          name: 'Tarif Sewa Penyimpanan',
          quantity: 1,
          unit: 'layanan',
          price: contract.price_per_kg_per_day,
        },
      ],
      totals: [{ label: 'Tarif per Kg/Hari', value: `Rp ${Number(contract.price_per_kg_per_day).toLocaleString('id-ID')}` }],
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

  if (denied) return <AccessDenied message="Detail kontrak hanya untuk Admin, Director, atau Warehouse." />

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
              <select value={recvProduct} onChange={(e) => setRecvProduct(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">-- Barang / Produk (opsional) --</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  Tgl masuk
                  <input type="date" value={recvDate} onChange={(e) => setRecvDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-slate-500">
                  Tgl expiry
                  <input type="date" value={recvExpiry} onChange={(e) => setRecvExpiry(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </label>
              </div>
              <input type="text" placeholder="Catatan" value={recvNotes} onChange={(e) => setRecvNotes(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
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
                      {r.expiry_date && (
                        <p className={`text-xs mt-0.5 ${new Date(r.expiry_date) <= new Date(Date.now() + 3 * 86400000) ? 'text-red-600 font-medium' : 'text-slate-400'}`}>
                          Expiry: {new Date(r.expiry_date).toLocaleDateString('id-ID')}
                        </p>
                      )}
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

            {billing && ['SENT', 'OVERDUE'].includes(billing.status) && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <p className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Tagihan belum lunas</p>
                <p className="mt-1 text-xs">Barang tidak dapat dikeluarkan sebelum tagihan dilunasi.</p>
                <button onClick={requestReleaseApproval} disabled={relSaving} className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-900 border border-amber-300 rounded-lg hover:bg-amber-100 disabled:opacity-60">
                  Ajukan Approval Pengeluaran
                </button>
              </div>
            )}

            <div className="space-y-3 mb-5">
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Jumlah (kg)" value={relKg} onChange={(e) => setRelKg(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <input type="text" placeholder="Batch no." value={relBatch} onChange={(e) => setRelBatch(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={relDate} onChange={(e) => setRelDate(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <input type="text" placeholder="Catatan" value={relNotes} onChange={(e) => setRelNotes(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <button
                onClick={addRelease}
                disabled={relSaving || (!!billing && ['SENT', 'OVERDUE'].includes(billing.status))}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 w-full justify-center"
              >
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

        {/* Waste / susut */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-600" /> Waste / Susut
          </h2>
          <p className="text-xs text-slate-500 mb-4">
            Catat selisih barang yang tidak keluar (susut/rusak/kedaluwarsa). Sistem juga mengirim notifikasi
            otomatis saat barang mendekati expiry.
          </p>

          <div className="space-y-3 mb-5">
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="Jumlah waste (kg)" value={wasteKg} onChange={(e) => setWasteKg(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <input type="text" placeholder="Batch no." value={wasteBatch} onChange={(e) => setWasteBatch(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <select value={wasteProduct} onChange={(e) => setWasteProduct(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">-- Barang / Produk (opsional) --</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select value={wasteReason} onChange={(e) => setWasteReason(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {Object.entries(WASTE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="text" placeholder="Catatan" value={wasteNotes} onChange={(e) => setWasteNotes(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <button onClick={recordWaste} disabled={wasteSaving} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 w-full justify-center">
              {wasteSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>Catat Waste</span>
            </button>
          </div>

          {wasteCandidates.length > 0 && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sisa per Batch (belum keluar)</p>
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg">
                {wasteCandidates.map((c, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                    <span className="text-slate-600">
                      Batch {c.batch_number || '-'} · masuk {Number(c.received_kg).toLocaleString('id-ID')} / keluar {Number(c.released_kg).toLocaleString('id-ID')} kg
                    </span>
                    <span className="font-mono text-amber-700">{Number(c.diff_kg).toLocaleString('id-ID')} kg</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {waste.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Belum ada catatan waste</p>
            ) : (
              waste.map((w) => (                <div key={w.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{Number(w.quantity_kg).toLocaleString('id-ID')} kg — {WASTE_REASONS[w.reason] ?? w.reason}</p>
                    <p className="text-xs text-slate-500">{w.batch_number ? `Batch: ${w.batch_number}` : ''} {w.notes ? `· ${w.notes}` : ''}</p>
                  </div>
                  <p className="text-xs text-slate-400">{new Date(w.recorded_at).toLocaleDateString('id-ID')}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
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

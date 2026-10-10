'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { Modal } from '@/components/ui/modal'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { Search, PackageSearch, Loader2, ArrowRight, Plus, Trash2 } from 'lucide-react'
import { formatDate, parseNum } from '@/lib/utils'

type SupplierRfq = {
  id: string
  rfq_number: string
  request_date: string
  response_due: string | null
  status: string
  suppliers: { name: string } | null
  customer_rfq: { rfq_number: string } | null
}

type Line = { product_id: string; description: string; quantity_kg: string }

export default function RfqSupplierPage() {
  const { roleCode, loaded, organizationId, userId } = useSession()
  const [data, setData] = useState<SupplierRfq[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'

  // Form RFQ baru
  const [showNew, setShowNew] = useState(false)
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [products, setProducts] = useState<{ id: string; name: string; sku: string }[]>([])
  const [customerRfqs, setCustomerRfqs] = useState<{ id: string; rfq_number: string }[]>([])
  const [supplierId, setSupplierId] = useState('')
  const [customerRfqId, setCustomerRfqId] = useState('')
  const [responseDue, setResponseDue] = useState('')
  const [lines, setLines] = useState<Line[]>([{ product_id: '', description: '', quantity_kg: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded || !canAccess) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, canAccess])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('supplier_rfq')
      .select('id, rfq_number, request_date, response_due, status, suppliers(name), customer_rfq(rfq_number)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)
    setData((rows as unknown as SupplierRfq[]) || [])
    setLoading(false)
  }

  async function openNew() {
    setShowNew(true)
    setError(null)
    const [sRes, pRes, cRes] = await Promise.all([
      supabase.from('suppliers').select('id, name').eq('organization_id', organizationId).order('name'),
      supabase.from('products').select('id, name, sku').eq('organization_id', organizationId).eq('is_active', true).order('name'),
      supabase.from('customer_rfq').select('id, rfq_number').eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(100),
    ])
    setSuppliers((sRes.data as { id: string; name: string }[]) || [])
    setProducts((pRes.data as { id: string; name: string; sku: string }[]) || [])
    setCustomerRfqs((cRes.data as { id: string; rfq_number: string }[]) || [])
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function saveNew(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) { setError('Pilih supplier.'); return }
    const valid = lines.filter((l) => l.product_id && parseFloat(l.quantity_kg) > 0)
    if (valid.length === 0) { setError('Minimal 1 barang dengan kuantitas wajib diisi.'); return }
    setSaving(true); setError(null)

    const { data: numberData } = await supabase.rpc('generate_rfq_number', { p_prefix: 'RFQS' })
    const rfqNumber = (numberData as string) || `RFQS/${Date.now()}`

    const { data: inserted, error: insErr } = await supabase.from('supplier_rfq').insert({
      organization_id: organizationId,
      rfq_number: rfqNumber,
      supplier_id: supplierId,
      customer_rfq_id: customerRfqId || null,
      request_date: new Date().toISOString().slice(0, 10),
      response_due: responseDue || null,
      status: 'SENT',
      created_by: userId,
    }).select().single()

    if (insErr || !inserted) { setError(insErr?.message ?? 'Gagal.'); setSaving(false); return }

    const { error: lineErr } = await supabase.from('supplier_rfq_lines').insert(
      valid.map((l) => ({ rfq_id: inserted.id, product_id: l.product_id, description: l.description || null, quantity_kg: parseNum(l.quantity_kg) }))
    )
    setSaving(false)
    if (lineErr) {
      await supabase.from('supplier_rfq').delete().eq('id', inserted.id)
      setError(lineErr.message); return
    }
    setShowNew(false)
    setSupplierId(''); setCustomerRfqId(''); setResponseDue('')
    setLines([{ product_id: '', description: '', quantity_kg: '' }])
    fetchData()
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return r.rfq_number?.toLowerCase().includes(q) || (r.suppliers?.name ?? '').toLowerCase().includes(q)
  })

  if (loaded && !canAccess) return <AppShell><div className="p-6 text-center text-slate-500">Anda tidak memiliki akses.</div></AppShell>

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">RFQ Supplier</h1>
            <p className="mt-1 text-sm text-slate-500">Permintaan harga yang dikirim ke supplier. Buka untuk input harga balasan.</p>
          </div>
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> RFQ Baru
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari nomor atau supplier..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. RFQ</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Supplier</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Dari Permintaan</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Tanggal</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Batas Jawab</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    <PackageSearch className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>Belum ada RFQ supplier.</p>
                    <p className="text-xs mt-1">Klik <span className="font-medium text-primary">RFQ Baru</span> untuk membuat, atau terbitkan dari detail Permintaan Harga (customer).</p>
                  </td>
                </tr>
              ) : filtered.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono font-medium text-cyan-700"><Link href={`/operational/rfq-supplier/${row.id}`} className="hover:underline">{row.rfq_number}</Link></td>
                  <td className="px-4 py-3 font-medium text-slate-800">{row.suppliers?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs font-mono">{row.customer_rfq?.rfq_number ?? '-'}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{formatDate(row.request_date)}</td>
                  <td className="px-4 py-3 text-slate-600 text-xs">{row.response_due ? formatDate(row.response_due) : '-'}</td>
                  <td className="px-4 py-3 text-center"><StatusBadge status={row.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/operational/rfq-supplier/${row.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5">
                      Input Harga <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showNew} onClose={() => setShowNew(false)} title="RFQ Supplier Baru" size="lg">
        <form onSubmit={saveNew} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
              <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">-- Pilih supplier --</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {suppliers.length === 0 && <p className="text-xs text-slate-400 mt-1">Belum ada supplier. Tambahkan di Data Master.</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Terkait Permintaan Customer (opsional)</label>
              <select value={customerRfqId} onChange={(e) => setCustomerRfqId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">-- Tanpa keterkaitan --</option>
                {customerRfqs.map((r) => <option key={r.id} value={r.id}>{r.rfq_number}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Batas Jawaban (opsional)</label>
            <input type="date" value={responseDue} onChange={(e) => setResponseDue(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-700">Barang yang Diminta</label>
              <button type="button" onClick={() => setLines((p) => [...p, { product_id: '', description: '', quantity_kg: '' }])} className="text-xs font-medium text-primary hover:text-primary/80 inline-flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Tambah baris
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <select value={l.product_id} onChange={(e) => updateLine(i, { product_id: e.target.value })} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                    <option value="">-- Pilih barang --</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                  </select>
                  <input type="number" placeholder="Jumlah (kg)" value={l.quantity_kg} onChange={(e) => updateLine(i, { quantity_kg: e.target.value })} className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  <button type="button" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} disabled={lines.length === 1} className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-30" title="Hapus">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" disabled={saving || !supplierId} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Simpan & Kirim
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  )
}

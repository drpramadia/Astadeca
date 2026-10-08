'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Loader2, Trash2, Plus } from 'lucide-react'
import { QuickAddSelect } from '@/components/quick-add-select'

type Customer = { id: string; name: string }
type Product = { id: string; name: string; sku: string }
type Line = { product_id: string; description: string; quantity_kg: string }

export default function NewRfqCustomerPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const router = useRouter()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [customerId, setCustomerId] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [requestDate, setRequestDate] = useState(new Date().toISOString().slice(0, 10))
  const [neededBy, setNeededBy] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Line[]>([{ product_id: '', description: '', quantity_kg: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded) return
    if (!canAccess) { router.push('/operational/rfq-customer'); return }
    loadRefs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, canAccess])

  async function loadRefs() {
    const [cRes, pRes] = await Promise.all([
      supabase.from('customers').select('id, name').eq('organization_id', organizationId).order('name'),
      supabase.from('products').select('id, name, sku').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    ])
    setCustomers((cRes.data as Customer[]) || [])
    setProducts((pRes.data as Product[]) || [])
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!customerId && !customerName.trim()) { setError('Pilih customer atau isi nama calon customer.'); return }
    const valid = lines.filter((l) => l.product_id && parseFloat(l.quantity_kg) > 0)
    if (valid.length === 0) { setError('Minimal 1 barang dengan kuantitas wajib diisi.'); return }

    setSaving(true)
    const { data: userData } = await supabase.auth.getUser()
    const { data: numberData } = await supabase.rpc('generate_rfq_number', { p_prefix: 'RFQC' })
    const rfqNumber = (numberData as string) || `RFQC/${Date.now()}`

    const { data: inserted, error: insErr } = await supabase.from('customer_rfq').insert({
      organization_id: organizationId,
      rfq_number: rfqNumber,
      customer_id: customerId || null,
      customer_name: customerId ? null : customerName.trim(),
      request_date: requestDate,
      needed_by: neededBy || null,
      notes: notes || null,
      status: 'OPEN',
      created_by: userData.user?.id,
    }).select().single()

    if (insErr || !inserted) { setError(insErr?.message ?? 'Gagal menyimpan.'); setSaving(false); return }

    const { error: lineErr } = await supabase.from('customer_rfq_lines').insert(
      valid.map((l) => ({
        rfq_id: inserted.id,
        product_id: l.product_id,
        description: l.description || null,
        quantity_kg: parseFloat(l.quantity_kg),
      }))
    )
    setSaving(false)
    if (lineErr) { setError(lineErr.message); return }
    router.push(`/operational/rfq-customer/${inserted.id}`)
  }

  if (loaded && !canAccess) return null

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-800 font-display mb-1">Permintaan Harga Baru</h1>
        <p className="text-sm text-slate-500 mb-6">Catat permintaan harga dari calon customer. Setelah tersimpan, lanjut terbitkan RFQ ke supplier.</p>

        <form onSubmit={onSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <QuickAddSelect
              table="customers"
              organizationId={organizationId}
              value={customerId}
              onChange={(id) => setCustomerId(id)}
              options={customers}
              onAdded={(row) => setCustomers((prev) => [...prev, row])}
              label="Calon Customer"
            />
            {!customerId && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Atau Nama Manual</label>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nama calon customer" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Permintaan</label>
              <input type="date" value={requestDate} onChange={(e) => setRequestDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Dibutuhkan Sebelum</label>
              <input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
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

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => router.push('/operational/rfq-customer')} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Batal</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Simpan Permintaan
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}

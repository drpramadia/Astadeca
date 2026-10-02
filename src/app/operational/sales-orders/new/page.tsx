'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, X, Plus, Trash2 } from 'lucide-react'

type Customer = { id: string; name: string }
type Product = { id: string; name: string; sku: string }

type LineItem = { product_id: string; quantity_kg: string; price_per_kg: string }

export default function NewSOPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const router = useRouter()
  
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<LineItem[]>([{ product_id: '', quantity_kg: '', price_per_kg: '' }])
  const [customerId, setCustomerId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN'

  useEffect(() => {
    if (!loaded) return
    if (!canAccess) { router.push('/operational/sales-orders'); return }
    loadRefs()
  }, [loaded, canAccess])

  async function loadRefs() {
    setLoadingRefs(true)
    const [cRes, pRes] = await Promise.all([
      supabase.from('customers').select('id, name').eq('organization_id', organizationId).order('name'),
      supabase.from('products').select('id, name, sku').eq('organization_id', organizationId).eq('is_active', true).order('name'),
    ])
    setCustomers(cRes.data || [])
    setProducts(pRes.data || [])
    setLoadingRefs(false)
  }

  function updateItem(idx: number, field: keyof LineItem, val: string) {
    setItems((prev) => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) { setError('Customer wajib dipilih.'); return }
    const validItems = items.filter((i) => i.product_id && i.quantity_kg && i.price_per_kg)
    if (validItems.length === 0) { setError('Minimal harus ada 1 item.'); return }

    setSaving(true)
    setError(null)
    const { data: userData } = await supabase.auth.getUser()
    const { data: numData } = await supabase.rpc('generate_number', { p_prefix: 'SO' })
    const soNumber = numData as string

    const { data: so, error: soErr } = await supabase.from('sales_orders').insert({
      organization_id: organizationId,
      customer_id: customerId,
      so_number: soNumber,
      notes: notes || null,
      status: roleCode === 'DIRECTOR' ? 'APPROVED' : 'PENDING_APPROVAL',
      created_by: userData.user?.id,
    }).select().single()

    if (soErr || !so) { setError(soErr?.message ?? 'Gagal membuat SO'); setSaving(false); return }

    const lines = validItems.map((item) => ({
      so_id: so.id,
      product_id: item.product_id,
      quantity_kg: parseFloat(item.quantity_kg),
      price_per_kg: parseFloat(item.price_per_kg),
      subtotal: parseFloat(item.quantity_kg) * parseFloat(item.price_per_kg),
    }))

    const { error: lineErr } = await supabase.from('sales_order_lines').insert(lines)
    if (lineErr) { setError(lineErr.message); setSaving(false); return }

    // Create approval request for non-director users
    if (roleCode !== 'DIRECTOR') {
      const { data: apprData, error: apprErr } = await supabase.from('approval_requests').insert({
        organization_id: organizationId,
        request_type: 'SALES_ORDER',
        reference_id: so.id,
        status: 'PENDING',
        requested_by: userData.user?.id,
      }).select().single()
      if (apprErr) { setError(apprErr.message); setSaving(false); return }
      if (apprData?.id) {
        await supabase.from('sales_orders').update({ approval_request_id: apprData.id }).eq('id', so.id)
      }
    }

    setSaving(false)
    router.push('/operational/sales-orders')
  }

  if (loaded && !canAccess) return null

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/operational/sales-orders" className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></Link>
              <h1 className="text-2xl font-bold text-slate-800 font-display">SO Baru</h1>
            </div>
            <p className="text-sm text-slate-500">Buat sales order baru</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          {loadingRefs && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
              <span className="ml-2 text-sm text-slate-500">Memuat data...</span>
            </div>
          )}

          <div className={loadingRefs ? "bg-white rounded-xl border border-slate-200 p-6 space-y-5 opacity-50 pointer-events-none" : "bg-white rounded-xl border border-slate-200 p-6 space-y-5"}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer *</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">-- Pilih Customer --</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Item SO</h2>
              <button type="button" onClick={() => setItems((prev) => [...prev, { product_id: '', quantity_kg: '', price_per_kg: '' }])} className="flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 font-medium">
                <Plus className="w-4 h-4" /> Tambah Item
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={idx} className="flex gap-3 items-start">
                  <div className="flex-1">
                    <select value={item.product_id} onChange={(e) => updateItem(idx, 'product_id', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                      <option value="">-- Pilih Produk --</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                  </div>
                  <div className="w-32">
                    <input type="number" step="0.01" placeholder="Qty (kg)" value={item.quantity_kg} onChange={(e) => updateItem(idx, 'quantity_kg', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className="w-36">
                    <input type="number" step="0.01" placeholder="Harga/kg (Rp)" value={item.price_per_kg} onChange={(e) => updateItem(idx, 'price_per_kg', e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                  </div>
                  <div className="w-32 pt-2.5 text-sm font-mono text-slate-500 text-right">
                    {item.quantity_kg && item.price_per_kg ? `Rp ${(parseFloat(item.quantity_kg) * parseFloat(item.price_per_kg)).toLocaleString('id-ID')}` : 'Rp 0'}
                  </div>
                  <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} className="w-8 h-10 flex items-center justify-center rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/operational/sales-orders" className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Batal</Link>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Menyimpan...' : 'Simpan SO'}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}

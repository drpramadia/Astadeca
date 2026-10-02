'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, X, Plus, Trash2, Calendar } from 'lucide-react'
import { useForm, useFieldArray } from 'react-hook-form'
import { formatNumber } from '@/lib/utils'

type Customer = { id: string; name: string }
type Product = { id: string; name: string; sku: string }

interface QuotationFormData {
  customer_id: string
  customer_name: string
  quotation_date: string
  valid_until: string
  notes: string
  items: { product_id: string; quantity_kg: string; price_per_kg: string; description: string }[]
}

export default function NewQuotationPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const router = useRouter()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, control, formState: { errors } } = useForm<QuotationFormData>({
    defaultValues: {
      customer_id: '',
      customer_name: '',
      quotation_date: new Date().toISOString().split('T')[0],
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: '',
      items: [{ product_id: '', quantity_kg: '', price_per_kg: '', description: '' }]
    }
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded) return
    if (!canAccess) { router.push('/operational/quotations'); return }
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

  async function onSubmit(form: QuotationFormData) {
    setSaving(true)
    setError(null)
    const { data: userData } = await supabase.auth.getUser()

    const validItems = form.items.filter(i => i.product_id && i.quantity_kg && i.price_per_kg)
    if (validItems.length === 0) { setError('Minimal 1 item wajib diisi'); setSaving(false); return }
    if (!form.customer_id && !form.customer_name.trim()) { setError('Customer wajib dipilih atau nama customer wajib diisi'); setSaving(false); return }

    const { data: numData } = await supabase.rpc('generate_number', { p_prefix: 'QUOT' })
    const quotationNumber = numData as string

    const lines = validItems.map((item) => ({
      product_id: item.product_id,
      quantity_kg: parseFloat(item.quantity_kg),
      price_per_kg: parseFloat(item.price_per_kg),
      subtotal: parseFloat(item.quantity_kg) * parseFloat(item.price_per_kg),
      description: item.description,
    }))
    const totalAmount = lines.reduce((sum, l) => sum + l.subtotal, 0)

    const { data: inserted, error: insErr } = await supabase.from('quotations').insert({
      organization_id: organizationId,
      quotation_number: quotationNumber,
      customer_id: form.customer_id || null,
      customer_name: form.customer_id ? null : form.customer_name.trim(),
      quotation_date: form.quotation_date,
      valid_until: form.valid_until || null,
      notes: form.notes || null,
      status: roleCode === 'DIRECTOR' ? 'APPROVED' : 'PENDING_APPROVAL',
      total_amount: totalAmount,
      created_by: userData.user?.id,
    }).select().single()

    setSaving(false)
    if (insErr) { setError(insErr.message); return }

    const { error: lineErr } = await supabase.from('quotation_lines').insert(
      lines.map(l => ({ ...l, quotation_id: inserted.id }))
    )
    if (lineErr) { setError(lineErr.message); return }

    // Create approval request for non-director
    if (roleCode !== 'DIRECTOR') {
      await supabase.from('approval_requests').insert({
        organization_id: organizationId,
        request_type: 'QUOTATION',
        reference_id: inserted.id,
        status: 'PENDING',
        requested_by: userData.user?.id,
      })
    }

    router.push('/operational/quotations')
  }

  if (loaded && !canAccess) return null

  const total = watch('items').reduce((sum, item) => sum + (parseFloat(item.quantity_kg || '0') * parseFloat(item.price_per_kg || '0')), 0)

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/operational/quotations" className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></Link>
              <h1 className="text-2xl font-bold text-slate-800 font-display">Penawaran Harga Baru</h1>
            </div>
            <p className="text-sm text-slate-500">Buat permintaan harga / penawaran harga baru</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {loadingRefs && (
            <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
              <span className="ml-2 text-sm text-slate-500">Memuat data...</span>
            </div>
          )}

          <div className={loadingRefs ? "bg-white rounded-xl border border-slate-200 p-6 space-y-5 opacity-50 pointer-events-none" : "bg-white rounded-xl border border-slate-200 p-6 space-y-5"}>
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Data Penawaran</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer (Existing)</label>
                <select {...register('customer_id')} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">-- Pilih Customer --</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer Baru (Nama)</label>
                <input
                  {...register('customer_name')}
                  placeholder="Jika customer belum terdaftar"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tgl Penawaran *</label>
                <input type="date" {...register('quotation_date', { required: 'Wajib diisi' })} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                {errors.quotation_date && <p className="text-xs text-red-500 mt-1">{errors.quotation_date.message as string}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Berlaku s/d *</label>
                <input type="date" {...register('valid_until', { required: 'Wajib diisi' })} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                {errors.valid_until && <p className="text-xs text-red-500 mt-1">{errors.valid_until.message as string}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
              <textarea {...register('notes')} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Item Penawaran</h2>
              <button type="button" onClick={() => append({ product_id: '', quantity_kg: '', price_per_kg: '', description: '' })} className="flex items-center gap-1 text-sm text-cyan-600 hover:text-cyan-700 font-medium">
                <Plus className="w-4 h-4" /> Tambah Item
              </button>
            </div>
            <div className="space-y-3">
              {fields.map((field, idx) => (
                <div key={field.id} className="flex gap-3 items-start">
                  <div className="flex-1">
                    <select
                      {...register(`items.${idx}.product_id`, { required: idx === 0 ? 'Pilih produk' : undefined })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">-- Pilih Produk --</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                    {errors.items?.[idx]?.product_id && <p className="text-xs text-red-500 mt-1">{errors.items[idx].product_id.message as string}</p>}
                  </div>
                  <div className="w-32">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Qty (kg)"
                      {...register(`items.${idx}.quantity_kg`, { required: idx === 0 ? 'Wajib' : undefined, pattern: /^\d+(\.\d+)?$/ })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {errors.items?.[idx]?.quantity_kg && <p className="text-xs text-red-500 mt-1">{errors.items[idx].quantity_kg.message as string}</p>}
                  </div>
                  <div className="w-36">
                    <input
                      type="number"
                      step="0.01"
                      placeholder="Harga/kg (Rp)"
                      {...register(`items.${idx}.price_per_kg`, { required: idx === 0 ? 'Wajib' : undefined, pattern: /^\d+(\.\d+)?$/ })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    {errors.items?.[idx]?.price_per_kg && <p className="text-xs text-red-500 mt-1">{errors.items[idx].price_per_kg.message as string}</p>}
                  </div>
                  <div className="w-40 pt-2.5 text-sm font-mono text-slate-500 text-right">
                    {watch(`items.${idx}.quantity_kg`) && watch(`items.${idx}.price_per_kg`)
                      ? `Rp ${formatNumber(parseFloat(watch(`items.${idx}.quantity_kg`)) * parseFloat(watch(`items.${idx}.price_per_kg`)))}`
                      : 'Rp 0'}
                  </div>
                  <div className="w-32">
                    <input
                      placeholder="Deskripsi (opsional)"
                      {...register(`items.${idx}.description`)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <button type="button" onClick={() => remove(idx)} className="w-8 h-10 flex items-center justify-center rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="mt-4 text-right text-lg font-semibold text-slate-800">
              Total: <span className="text-cyan-700">Rp {formatNumber(total)}</span>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/operational/quotations" className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors">Batal</Link>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>{saving ? 'Menyimpan...' : 'Simpan'}</span>
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}
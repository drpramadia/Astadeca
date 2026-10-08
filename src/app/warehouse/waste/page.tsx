'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { AlertTriangle, Loader2, Plus, Boxes, Clock } from 'lucide-react'

type Product = { id: string; name: string; sku: string }

type ExpiringRow = {
  inventory_id: string
  product_id: string | null
  product_name: string | null
  batch_number: string | null
  quantity_kg: number
  expiry_date: string
  days_left: number
  status: string
}

type WasteRow = {
  id: string
  batch_number: string | null
  quantity_kg: number
  reason: string
  notes: string | null
  recorded_at: string
  products: { name: string } | null
}

const WASTE_REASONS: Record<string, string> = {
  SHRINKAGE: 'Susut (selisih)',
  EXPIRY: 'Kedaluwarsa',
  DAMAGED: 'Rusak',
  OTHER: 'Lainnya',
}

export default function WastePage() {
  const { loaded, organizationId, userId } = useSession()

  const [products, setProducts] = useState<Product[]>([])
  const [expiring, setExpiring] = useState<ExpiringRow[]>([])
  const [waste, setWaste] = useState<WasteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [alertDays, setAlertDays] = useState(3)

  const [form, setForm] = useState({ productId: '', batch: '', kg: '', reason: 'SHRINKAGE', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!organizationId) return
    setLoading(true)
    const [prodRes, expRes, wasteRes, settingRes] = await Promise.all([
      supabase.from('products').select('id, name, sku').eq('organization_id', organizationId).eq('is_active', true).order('name').limit(1000),
      supabase.rpc('inventory_expiring', { p_organization_id: organizationId, p_days: 30 }),
      supabase.from('stock_waste').select('*, products(name)').eq('organization_id', organizationId).order('recorded_at', { ascending: false }).limit(100),
      supabase.from('organization_settings').select('value').eq('organization_id', organizationId).eq('key', 'inventory.expiry_alert_days').maybeSingle(),
    ])
    setProducts((prodRes.data as Product[]) || [])
    setExpiring((expRes.data as ExpiringRow[]) || [])
    setWaste((wasteRes.data as unknown as WasteRow[]) || [])
    const d = Number((settingRes.data as { value?: string } | null)?.value ?? 3)
    setAlertDays(Number.isFinite(d) ? d : 3)
    setLoading(false)
  }, [organizationId])

  useEffect(() => {
    if (!loaded) return
    fetchData()
    // Pindai & kirim notifikasi expiry sekali per sesi
    if (organizationId && typeof window !== 'undefined') {
      const key = `stock-expiry-scan:${organizationId}`
      if (!window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, '1')
        void supabase.rpc('notify_inventory_expiry', { p_organization_id: organizationId })
      }
    }
  }, [loaded, organizationId, fetchData])

  async function recordWaste(e: React.FormEvent) {
    e.preventDefault()
    const kg = parseFloat(form.kg)
    if (!kg || kg <= 0) { setError('Masukkan jumlah waste (kg) yang valid.'); return }
    setSaving(true)
    setError(null)
    const { error: insErr } = await supabase.from('stock_waste').insert({
      organization_id: organizationId,
      product_id: form.productId || null,
      batch_number: form.batch || null,
      quantity_kg: kg,
      reason: form.reason,
      notes: form.notes || null,
      recorded_by: userId,
    })
    setSaving(false)
    if (insErr) { setError(insErr.message); return }
    setForm({ productId: '', batch: '', kg: '', reason: 'SHRINKAGE', notes: '' })
    setFlash(`Waste ${kg} kg tercatat.`)
    fetchData()
  }

  const urgent = expiring.filter((r) => r.days_left <= alertDays).length

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-6xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display flex items-center gap-2">
              <AlertTriangle className="w-6 h-6 text-amber-500" /> Waste &amp; Expiry
            </h1>
            <p className="mt-1 text-sm text-slate-500">Monitoring susut dan kedaluwarsa stok gudang (rantai pasok)</p>
          </div>
          {urgent > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              <Clock className="w-4 h-4" /> {urgent} batch harus segera keluar
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form catat waste */}
          <div className="lg:col-span-1 bg-white rounded-xl border border-slate-200 p-5 h-fit">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">Catat Waste</h2>
            <form onSubmit={recordWaste} className="space-y-3">
              {error && <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>}
              {flash && <div className="p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">{flash}</div>}
              <select value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">-- Barang (opsional) --</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="Jumlah (kg)" value={form.kg} onChange={(e) => setForm({ ...form, kg: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                <input type="text" placeholder="Batch no." value={form.batch} onChange={(e) => setForm({ ...form, batch: e.target.value })} className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                {Object.entries(WASTE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="text" placeholder="Catatan" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 w-full justify-center">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Catat Waste
              </button>
            </form>
          </div>

          {/* Monitoring expiry + riwayat */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Clock className="w-4 h-4 text-red-500" /> Stok Mendekati / Lewat Expiry
              </h2>
              {loading ? (
                <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
              ) : expiring.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Tidak ada stok yang mendekati kedaluwarsa (30 hari).</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600">
                        <th className="text-left py-2 font-semibold">Barang</th>
                        <th className="text-left py-2 font-semibold">Batch</th>
                        <th className="text-right py-2 font-semibold">Sisa (kg)</th>
                        <th className="text-center py-2 font-semibold">Expiry</th>
                        <th className="text-right py-2 font-semibold">Sisa Hari</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expiring.map((r) => {
                        const danger = r.days_left <= alertDays
                        return (
                          <tr key={r.inventory_id} className={`border-b border-slate-100 last:border-0 ${danger ? 'bg-red-50/50' : ''}`}>
                            <td className="py-2 text-slate-800">{r.product_name ?? '-'}</td>
                            <td className="py-2 font-mono text-slate-600 text-xs">{r.batch_number ?? '-'}</td>
                            <td className="py-2 text-right font-mono text-slate-700">{Number(r.quantity_kg).toLocaleString('id-ID')}</td>
                            <td className="py-2 text-center text-slate-600 text-xs">{new Date(r.expiry_date).toLocaleDateString('id-ID')}</td>
                            <td className={`py-2 text-right font-semibold ${danger ? 'text-red-600' : 'text-slate-500'}`}>{r.days_left}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-amber-500" /> Riwayat Waste
              </h2>
              {waste.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Belum ada catatan waste.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {waste.map((w) => (
                    <div key={w.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-800">
                          {Number(w.quantity_kg).toLocaleString('id-ID')} kg — {WASTE_REASONS[w.reason] ?? w.reason}
                        </p>
                        <p className="text-xs text-slate-500">
                          {w.products?.name ?? 'Tanpa produk'}{w.batch_number ? ` · Batch ${w.batch_number}` : ''}{w.notes ? ` · ${w.notes}` : ''}
                        </p>
                      </div>
                      <p className="text-xs text-slate-400">{new Date(w.recorded_at).toLocaleDateString('id-ID')}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}

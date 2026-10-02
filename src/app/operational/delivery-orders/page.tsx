'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { Plus, Search, Truck, Loader2, X, ArrowDownToLine } from 'lucide-react'

type DO = {
  id: string
  do_number: string
  status: string
  driver_name: string | null
  vehicle_number: string | null
  notes: string | null
  created_at: string
  customers: { name: string } | null
}

export default function DeliveryOrdersPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const [data, setData] = useState<DO[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  

  const canCreate = roleCode === 'DIRECTOR' || roleCode === 'ADMIN'

  useEffect(() => {
    if (!loaded) return
    fetchData()
    loadCustomers()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('delivery_orders')
      .select('*, customers(name)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)
    setData((rows as DO[]) || [])
    setLoading(false)
  }

  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('id, name').eq('organization_id', organizationId).order('name')
    setCustomers(data || [])
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const fd = new FormData(form)
    setSaving(true)
    setError(null)
    const { data: userData } = await supabase.auth.getUser()
    const { data: numData } = await supabase.rpc('generate_number', { p_prefix: 'DO' })
    const doNumber = numData as string

    const { error: err } = await supabase.from('delivery_orders').insert({
      organization_id: organizationId,
      do_number: doNumber,
      customer_id: fd.get('customer_id') as string || null,
      driver_name: fd.get('driver_name') as string || null,
      vehicle_number: fd.get('vehicle_number') as string || null,
      notes: fd.get('notes') as string || null,
      status: 'DRAFT',
      created_by: userData.user?.id,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowForm(false)
    form.reset()
    fetchData()
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.do_number?.toLowerCase().includes(q) ||
      r.customers?.name?.toLowerCase().includes(q) ||
      r.driver_name?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Delivery Orders</h1>
            <p className="mt-1 text-sm text-slate-500">Kelola surat jalan</p>
          </div>
          <div className="flex items-center gap-3">
            {canCreate && (
              <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors">
                <Plus className="w-4 h-4" /> <span>DO Baru</span>
              </button>
            )}
          </div>
        </div>

        {showForm && (
          <form onSubmit={handleCreate} className="mb-6 bg-white rounded-xl border border-cyan-200 p-5 space-y-4">
            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
                <select name="customer_id" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">-- Pilih Customer --</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Driver</label>
                <input type="text" name="driver_name" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">No. Kendaraan</label>
                <input type="text" name="vehicle_number" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
                <input type="text" name="notes" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 inline mr-1" />Batal</button>
              <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari DO, customer, atau driver..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. Surat Jalan</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Driver</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">No. Kendaraan</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><Truck className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada delivery order</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-cyan-700">{row.do_number}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{row.customers?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.driver_name ?? '-'}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{row.vehicle_number ?? '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">{new Date(row.created_at).toLocaleDateString('id-ID')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  )
}

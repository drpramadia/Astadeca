'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { Modal } from '@/components/ui/modal'
import { DocumentPrintView, type DocumentPrintData } from '@/components/document-print'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import {
  Plus,
  Search,
  Truck,
  Loader2,
  X,
  Trash2,
  Printer,
  ClipboardList,
  PackageCheck,
} from 'lucide-react'

type DO = {
  id: string
  do_number: string
  status: string
  driver_name: string | null
  vehicle_number: string | null
  destination: string | null
  delivery_date: string | null
  notes: string | null
  created_at: string
  customers: { name: string } | null
}

type DORequest = {
  id: string
  status: string
  notes: string | null
  created_at: string
  delivery_date: string | null
  driver_name: string | null
  vehicle_number: string | null
  destination: string | null
  customers: { name: string } | null
  profiles: { full_name: string } | null
}

type RequestLine = { item_name: string; quantity_kg: string; notes: string }

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu',
  PREPARED: 'Disiapkan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  DRAFT: 'Draft',
  PRINTED: 'Terbit',
  RELEASED: 'Dirilis',
  CANCELLED: 'Dibatalkan',
}

function emptyLine(): RequestLine {
  return { item_name: '', quantity_kg: '', notes: '' }
}

export default function DeliveryOrdersPage() {
  const { roleCode, loaded, organizationId, userId, name } = useSession()
  const [tab, setTab] = useState<'orders' | 'requests'>('orders')

  const [data, setData] = useState<DO[]>([])
  const [requests, setRequests] = useState<DORequest[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [preparing, setPreparing] = useState<string | null>(null)

  const [printData, setPrintData] = useState<DocumentPrintData | null>(null)
  const [loadingPrint, setLoadingPrint] = useState(false)

  // request form
  const [customerId, setCustomerId] = useState('')
  const [driverName, setDriverName] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [destination, setDestination] = useState('')
  const [deliveryDate, setDeliveryDate] = useState('')
  const [reqNotes, setReqNotes] = useState('')
  const [lines, setLines] = useState<RequestLine[]>([emptyLine()])

  const canCreateRequest = roleCode === 'ADMIN' || roleCode === 'DIRECTOR' || roleCode === 'SYSTEM_ADMIN'
  const canPrepare = roleCode === 'WAREHOUSE' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded) return
    fetchAll()
    loadCustomers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  async function fetchAll() {
    setLoading(true)
    const [doRes, reqRes] = await Promise.all([
      supabase
        .from('delivery_orders')
        .select('*, customers(name)')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('delivery_requests')
        .select('*, customers(name), profiles!delivery_requests_requested_by_user_id_fkey(full_name)')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(200),
    ])
    setData((doRes.data as DO[]) || [])
    setRequests((reqRes.data as DORequest[]) || [])
    setLoading(false)
  }

  async function loadCustomers() {
    const { data: rows } = await supabase.from('customers').select('id, name').eq('organization_id', organizationId).order('name')
    setCustomers(rows || [])
  }

  function updateLine(idx: number, patch: Partial<RequestLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault()
    const validLines = lines.filter((l) => l.item_name.trim() && l.quantity_kg)
    if (!customerId) { setError('Customer wajib dipilih.'); return }
    if (validLines.length === 0) { setError('Minimal 1 item barang.'); return }

    setSaving(true)
    setError(null)

    const { data: req, error: reqErr } = await supabase
      .from('delivery_requests')
      .insert({
        organization_id: organizationId,
        requested_by_user_id: userId,
        status: 'PENDING',
        notes: reqNotes || null,
        customer_id: customerId,
        delivery_date: deliveryDate || null,
        driver_name: driverName || null,
        vehicle_number: vehicle || null,
        destination: destination || null,
        created_by: userId,
      })
      .select()
      .single()

    if (reqErr || !req) { setError(reqErr?.message ?? 'Gagal membuat permintaan'); setSaving(false); return }

    const { error: lineErr } = await supabase.from('delivery_request_lines').insert(
      validLines.map((l) => ({
        request_id: req.id,
        item_name: l.item_name.trim(),
        quantity_kg: parseFloat(l.quantity_kg) || 0,
        notes: l.notes || null,
      }))
    )
    if (lineErr) { setError(lineErr.message); setSaving(false); return }

    // Approval oleh DIRECTOR
    const { error: apprErr } = await supabase.from('approval_requests').insert({
      organization_id: organizationId,
      request_type: 'DELIVERY',
      reference_id: req.id,
      status: 'PENDING',
      requested_by: userId,
    })
    if (apprErr) { setError(apprErr.message); setSaving(false); return }

    setSaving(false)
    setShowForm(false)
    setLines([emptyLine()])
    setCustomerId(''); setDriverName(''); setVehicle(''); setDestination(''); setDeliveryDate(''); setReqNotes('')
    setTab('requests')
    fetchAll()
  }

  async function handlePrepare(reqId: string) {
    setPreparing(reqId)
    await supabase
      .from('delivery_requests')
      .update({ status: 'PREPARED', prepared_at: new Date().toISOString(), prepared_by: userId })
      .eq('id', reqId)
    setPreparing(null)
    fetchAll()
  }

  async function openSuratJalan(doId: string) {
    setLoadingPrint(true)
    setPrintData(null)
    const { data: doRow } = await supabase
      .from('delivery_orders')
      .select('*, customers(name, address, phone)')
      .eq('id', doId)
      .single()
    const { data: doLines } = await supabase
      .from('delivery_order_lines')
      .select('*, products(name, sku)')
      .eq('do_id', doId)

    if (doRow) {
      const row = doRow as unknown as DO & { customers: { name: string; address: string | null; phone: string | null } | null }
      setPrintData({
        docType: 'Surat Jalan',
        docNumber: row.do_number,
        date: row.delivery_date ?? row.created_at,
        status: STATUS_LABELS[row.status] ?? row.status,
        meta: [
          { label: 'No. Kendaraan', value: row.vehicle_number },
          { label: 'Driver', value: row.driver_name },
          { label: 'Tujuan', value: row.destination },
        ],
        party: row.customers
          ? { title: 'Kepada:', lines: [row.customers.name, row.customers.address, row.customers.phone] }
          : undefined,
        lines: (doLines || []).map((l) => ({
          name: l.product_name ?? l.item_name ?? l.products?.name ?? '-',
          sku: l.products?.sku,
          batch: l.batch_number,
          quantity: l.quantity_kg,
          unit: l.unit ?? 'kg',
        })),
        notes: row.notes,
        signatures: ['Disiapkan Warehouse', 'Diterima Customer'],
      })
    }
    setLoadingPrint(false)
  }

  const filteredOrders = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.do_number?.toLowerCase().includes(q) ||
      r.customers?.name?.toLowerCase().includes(q) ||
      r.driver_name?.toLowerCase().includes(q)
    )
  })

  const filteredRequests = requests.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.customers?.name?.toLowerCase().includes(q) ||
      r.notes?.toLowerCase().includes(q) ||
      r.profiles?.full_name?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Surat Jalan</h1>
            <p className="mt-1 text-sm text-slate-500">Permintaan keluar barang, approval director, dan cetak surat jalan</p>
          </div>
          {canCreateRequest && (
            <button onClick={() => setShowForm(true)} className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors">
              <Plus className="w-4 h-4" /> <span>Permintaan Keluar</span>
            </button>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('requests')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'requests' ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <ClipboardList className="w-4 h-4" /> Permintaan Keluar
          </button>
          <button
            onClick={() => setTab('orders')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'orders' ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <Truck className="w-4 h-4" /> Surat Jalan Terbit
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari nomor, customer, atau driver..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          {tab === 'orders' ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">No. Surat Jalan</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Driver</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">No. Kendaraan</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Tanggal</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
                ) : filteredOrders.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-12 text-slate-400"><Truck className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada surat jalan terbit</p></td></tr>
                ) : (
                  filteredOrders.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-cyan-700">{row.do_number}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{row.customers?.name ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.driver_name ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.vehicle_number ?? '-'}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={row.status} label={STATUS_LABELS[row.status] ?? row.status} /></td>
                      <td className="px-4 py-3 text-right text-slate-500 text-xs">{formatDate(row.delivery_date ?? row.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => openSuratJalan(row.id)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                          <Printer className="w-3.5 h-3.5" /> Cetak
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Customer</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Diminta Oleh</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Tujuan</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Tanggal Kirim</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
                ) : filteredRequests.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-400"><ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada permintaan keluar barang</p></td></tr>
                ) : (
                  filteredRequests.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-800">{row.customers?.name ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.profiles?.full_name ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{row.destination ?? '-'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{row.delivery_date ? formatDate(row.delivery_date) : '-'}</td>
                      <td className="px-4 py-3 text-center"><StatusBadge status={row.status} label={STATUS_LABELS[row.status] ?? row.status} /></td>
                      <td className="px-4 py-3 text-center">
                        {canPrepare && row.status === 'PENDING' ? (
                          <button onClick={() => handlePrepare(row.id)} disabled={preparing === row.id} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-60">
                            {preparing === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5" />} Siapkan
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Form permintaan keluar barang */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Permintaan Keluar Barang" size="xl">
        <form onSubmit={handleCreateRequest} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">-- Pilih Customer --</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Kirim</label>
              <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama Driver</label>
              <input type="text" value={driverName} onChange={(e) => setDriverName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">No. Kendaraan</label>
              <input type="text" value={vehicle} onChange={(e) => setVehicle(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tujuan</label>
              <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
              <input type="text" value={reqNotes} onChange={(e) => setReqNotes(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700">Barang yang Diminta</p>
              <button type="button" onClick={() => setLines((p) => [...p, emptyLine()])} className="flex items-center gap-1 text-sm text-primary hover:underline">
                <Plus className="w-4 h-4" /> Tambah Item
              </button>
            </div>
            <div className="space-y-2">
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input className="col-span-12 sm:col-span-6 border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Nama barang" value={l.item_name} onChange={(e) => updateLine(idx, { item_name: e.target.value })} />
                  <input className="col-span-6 sm:col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Qty (kg)" type="number" step="0.01" value={l.quantity_kg} onChange={(e) => updateLine(idx, { quantity_kg: e.target.value })} />
                  <input className="col-span-4 sm:col-span-3 border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Catatan" value={l.notes} onChange={(e) => updateLine(idx, { notes: e.target.value })} />
                  <button type="button" onClick={() => setLines((p) => p.filter((_, i) => i !== idx))} disabled={lines.length === 1} className="col-span-2 sm:col-span-1 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg py-2 disabled:opacity-30">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 inline mr-1" />Batal</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Menyimpan...' : 'Ajukan Permintaan'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Pratinjau / cetak surat jalan */}
      <Modal open={!!printData || loadingPrint} onClose={() => setPrintData(null)} title="Surat Jalan" size="xl">
        {loadingPrint || !printData ? (
          <div className="py-16 text-center text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <DocumentPrintView data={printData} onClose={() => setPrintData(null)} />
        )}
      </Modal>
    </AppShell>
  )
}

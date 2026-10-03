'use client'

import AppShell from '@/components/app-shell'
import { StatusBadge } from '@/components/ui/status-badge'
import { Modal } from '@/components/ui/modal'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { uploadGoodsPhoto } from '@/lib/storage'
import {
  Search,
  Loader2,
  AlertCircle,
  Plus,
  Trash2,
  ImagePlus,
  Camera,
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react'

type InspectionType = 'IN' | 'OUT'
type Condition = 'GOOD' | 'DAMAGED' | 'REJECTED'

type QC = {
  id: string
  inspection_type: InspectionType | null
  status: string
  notes: string | null
  inspected_at: string | null
  inspector_name: string | null
  photo_url: string | null
  goods_receipts: { gr_number: string } | null
  delivery_orders: { do_number: string } | null
  profiles: { full_name: string } | null
}

type QCRef = { id: string; label: string }

type LineDraft = {
  item_name: string
  quantity_kg: string
  condition: Condition
  notes: string
  photo: File | null
}

const CONDITION_LABELS: Record<Condition, string> = {
  GOOD: 'Baik',
  DAMAGED: 'Rusak',
  REJECTED: 'Ditolak',
}

function emptyLine(): LineDraft {
  return { item_name: '', quantity_kg: '', condition: 'GOOD', notes: '', photo: null }
}

export default function QCPage() {
  const { loaded, organizationId, userId, name } = useSession()
  const [data, setData] = useState<QC[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<InspectionType>('IN')

  const [showForm, setShowForm] = useState(false)
  const [refs, setRefs] = useState<QCRef[]>([])
  const [refId, setRefId] = useState('')
  const [status, setStatus] = useState<'PASSED' | 'FAILED'>('PASSED')
  const [inspector, setInspector] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])

  useEffect(() => {
    if (name && !inspector) setInspector(name)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  useEffect(() => {
    if (!showForm) return
    loadRefs(activeTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, activeTab])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('qc_inspections')
      .select('*, goods_receipts(gr_number), delivery_orders(do_number), profiles(full_name)')
      .eq('organization_id', organizationId)
      .order('inspected_at', { ascending: false })
      .limit(200)
    setData((rows as QC[]) || [])
    setLoading(false)
  }

  async function loadRefs(type: InspectionType) {
    setRefId('')
    if (type === 'IN') {
      const { data: grs } = await supabase
        .from('goods_receipts')
        .select('id, gr_number')
        .eq('organization_id', organizationId)
        .order('received_at', { ascending: false })
        .limit(100)
      setRefs((grs || []).map((g) => ({ id: g.id, label: g.gr_number })))
    } else {
      const { data: dos } = await supabase
        .from('delivery_orders')
        .select('id, do_number')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(100)
      setRefs((dos || []).map((d) => ({ id: d.id, label: d.do_number })))
    }
  }

  function updateLine(idx: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const validLines = lines.filter((l) => l.item_name.trim() && l.quantity_kg)
    if (validLines.length === 0) {
      setError('Minimal 1 item checklist dengan nama dan jumlah.')
      return
    }
    if (activeTab === 'IN' && validLines.some((l) => !l.photo)) {
      setError('Barang masuk wajib menyertakan foto setiap item.')
      return
    }

    setSaving(true)
    setError(null)

    const { data: header, error: headerErr } = await supabase
      .from('qc_inspections')
      .insert({
        organization_id: organizationId,
        inspection_type: activeTab,
        gr_id: activeTab === 'IN' ? refId || null : null,
        delivery_order_id: activeTab === 'OUT' ? refId || null : null,
        inspector_user_id: userId,
        inspector_name: inspector || name || null,
        status,
        notes: notes || null,
        inspected_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (headerErr || !header) {
      setError(headerErr?.message ?? 'Gagal menyimpan inspeksi')
      setSaving(false)
      return
    }

    const prepared: Record<string, unknown>[] = []
    for (const l of validLines) {
      let photoUrl: string | null = null
      if (l.photo && organizationId) {
        const up = await uploadGoodsPhoto(l.photo, organizationId, activeTab.toLowerCase())
        if (up.error) {
          setError(`Upload foto gagal: ${up.error}`)
          setSaving(false)
          return
        }
        photoUrl = up.url
      }
      prepared.push({
        inspection_id: header.id,
        item_name: l.item_name.trim(),
        quantity_kg: parseFloat(l.quantity_kg) || 0,
        condition: l.condition,
        notes: l.notes || null,
        photo_url: photoUrl,
      })
    }

    const { error: lineErr } = await supabase.from('qc_inspection_lines').insert(prepared)
    if (lineErr) {
      setError(lineErr.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setShowForm(false)
    setLines([emptyLine()])
    setNotes('')
    setRefId('')
    setStatus('PASSED')
    fetchData()
  }

  const tabData = data.filter((r) => (r.inspection_type ?? 'IN') === activeTab)
  const filtered = tabData.filter((r) => {
    const q = search.toLowerCase()
    return (
      (r.inspection_type === 'IN'
        ? r.goods_receipts?.gr_number
        : r.delivery_orders?.do_number
      )?.toLowerCase().includes(q) ||
      r.inspector_name?.toLowerCase().includes(q) ||
      r.profiles?.full_name?.toLowerCase().includes(q) ||
      r.notes?.toLowerCase().includes(q)
    )
  })

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">QC Inspection</h1>
            <p className="mt-1 text-sm text-slate-500">
              Checklist kualitas barang masuk & keluar (barang masuk wajib berfoto)
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Inspeksi Baru
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('IN')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'IN' ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ArrowDownToLine className="w-4 h-4" /> Barang Masuk
          </button>
          <button
            onClick={() => setActiveTab('OUT')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'OUT' ? 'bg-primary text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ArrowUpFromLine className="w-4 h-4" /> Barang Keluar
          </button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Cari nomor referensi atau inspektor..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Referensi</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Inspektor</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Foto</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Catatan</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Tanggal</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400"><AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-30" /><p>Belum ada inspeksi QC {activeTab === 'IN' ? 'barang masuk' : 'barang keluar'}</p></td></tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-slate-800">
                      {(row.inspection_type === 'OUT' ? row.delivery_orders?.do_number : row.goods_receipts?.gr_number) ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.inspector_name ?? row.profiles?.full_name ?? '-'}</td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3 text-center">
                      {row.photo_url ? (
                        <a href={row.photo_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-cyan-600 hover:underline text-xs">
                          <Camera className="w-3.5 h-3.5" /> Lihat
                        </a>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{row.notes ?? '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-500 text-xs">
                      {row.inspected_at ? new Date(row.inspected_at).toLocaleDateString('id-ID') : '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={`Inspeksi QC — ${activeTab === 'IN' ? 'Barang Masuk' : 'Barang Keluar'}`}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Referensi {activeTab === 'IN' ? 'Goods Receipt' : 'Surat Jalan'}
              </label>
              <select value={refId} onChange={(e) => setRefId(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">-- Pilih Referensi --</option>
                {refs.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nama Inspektor</label>
              <input type="text" value={inspector} onChange={(e) => setInspector(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Hasil Inspeksi</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as 'PASSED' | 'FAILED')} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="PASSED">PASSED (Lolos)</option>
                <option value="FAILED">FAILED (Gagal)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700">Checklist Barang</p>
              <button type="button" onClick={() => setLines((p) => [...p, emptyLine()])} className="flex items-center gap-1 text-sm text-primary hover:underline">
                <Plus className="w-4 h-4" /> Tambah Item
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-slate-50 rounded-lg p-3">
                  <input
                    className="col-span-12 sm:col-span-4 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Nama barang"
                    value={l.item_name}
                    onChange={(e) => updateLine(idx, { item_name: e.target.value })}
                  />
                  <input
                    className="col-span-6 sm:col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Qty (kg)"
                    type="number"
                    step="0.01"
                    value={l.quantity_kg}
                    onChange={(e) => updateLine(idx, { quantity_kg: e.target.value })}
                  />
                  <select
                    className="col-span-6 sm:col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    value={l.condition}
                    onChange={(e) => updateLine(idx, { condition: e.target.value as Condition })}
                  >
                    {Object.entries(CONDITION_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                  <label className={`col-span-10 sm:col-span-3 flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer bg-white ${activeTab === 'IN' && !l.photo ? 'border-amber-300 text-amber-700' : 'border-slate-200 text-slate-500'}`}>
                    <ImagePlus className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{l.photo ? l.photo.name : (activeTab === 'IN' ? 'Foto (wajib)' : 'Foto (opsional)')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => updateLine(idx, { photo: e.target.files?.[0] ?? null })}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setLines((p) => p.filter((_, i) => i !== idx))}
                    disabled={lines.length === 1}
                    className="col-span-2 sm:col-span-1 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg py-2 disabled:opacity-30"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <input
                    className="col-span-12 border border-slate-200 rounded-lg px-3 py-2 text-xs"
                    placeholder="Catatan item (opsional)"
                    value={l.notes}
                    onChange={(e) => updateLine(idx, { notes: e.target.value })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              <X className="w-4 h-4 inline mr-1" /> Batal
            </button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? 'Menyimpan...' : 'Simpan Inspeksi'}
            </button>
          </div>
        </form>
      </Modal>
    </AppShell>
  )
}

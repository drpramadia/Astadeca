'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { exportToCsv, parseCsv } from '@/lib/csv'
import { Plus, Search, Tag, Loader2, X, Upload, Download, Trash2, Pencil } from 'lucide-react'

type Product = {
  id: string
  name: string
  sku: string
  product_categories: { name: string } | null
  units: { name: string; abbreviation: string } | null
  is_active: boolean
  created_at: string
}

type Category = { id: string; name: string }
type Unit = { id: string; name: string; abbreviation: string }

const CSV_COLUMNS = [
  { key: 'name', label: 'Nama Produk' },
  { key: 'sku', label: 'SKU' },
  { key: 'category', label: 'Kategori' },
  { key: 'unit', label: 'Satuan' },
  { key: 'is_active', label: 'Aktif' },
]

export default function ProductsPage() {
  const { organizationId, loaded } = useSession()
  const [data, setData] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [form, setForm] = useState({ name: '', sku: '', category_id: '', unit_id: '', is_active: true })
  const [editId, setEditId] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded) return
    fetchData()
    loadRefs()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('products')
      .select('*, product_categories(name), units(name, abbreviation)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(500)
    setData((rows as Product[]) || [])
    setLoading(false)
  }

  async function loadRefs() {
    const [cRes, uRes] = await Promise.all([
      supabase.from('product_categories').select('id, name').eq('organization_id', organizationId).order('name'),
      supabase.from('units').select('id, name, abbreviation').order('name'),
    ])
    setCategories(cRes.data || [])
    setUnits(uRes.data || [])
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.name?.toLowerCase().includes(q) ||
      r.sku?.toLowerCase().includes(q) ||
      r.product_categories?.name?.toLowerCase().includes(q)
    )
  })

  function startEdit(row: Product) {
    setEditId(row.id)
    setForm({
      name: row.name,
      sku: row.sku,
      category_id: '',
      unit_id: '',
      is_active: row.is_active,
    })
    setShowForm(true)
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus produk ini?')) return
    const { error: err } = await supabase.from('products').delete().eq('id', id)
    if (err) { alert(err.message); return }
    setData((prev) => prev.filter((r) => r.id !== id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.sku.trim()) {
      alert('Nama dan SKU wajib diisi')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim(),
      category_id: form.category_id || null,
      unit_id: form.unit_id || null,
      is_active: form.is_active,
    }
    if (editId) {
      const { error: err } = await supabase.from('products').update(payload).eq('id', editId)
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      const { error: err } = await supabase.from('products').insert({
        ...payload,
        organization_id: organizationId,
      })
      if (err) { setError(err.message); setSaving(false); return }
    }
    setSaving(false)
    setShowForm(false)
    setEditId(null)
    setForm({ name: '', sku: '', category_id: '', unit_id: '', is_active: true })
    fetchData()
  }

  function handleExport() {
    exportToCsv(
      'products.csv',
      CSV_COLUMNS,
      data.map((p) => ({
        name: p.name,
        sku: p.sku,
        category: p.product_categories?.name ?? '',
        unit: p.units ? `${p.units.name} (${p.units.abbreviation})` : '',
        is_active: p.is_active ? 'Ya' : 'Tidak',
      }))
    )
  }

  function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const text = ev.target?.result as string
      const rows = parseCsv(text)
      const headers = rows[0]?.map((h) => h.trim()) ?? []
      const nameIdx = headers.indexOf('Nama Produk')
      const skuIdx = headers.indexOf('SKU')
      const catIdx = headers.indexOf('Kategori')
      const unitIdx = headers.indexOf('Satuan')
      if (nameIdx < 0 || skuIdx < 0) {
        alert('Format CSV tidak valid. Kolom "Nama Produk" dan "SKU" diperlukan.')
        return
      }
      const imported: { name: string; sku: string; category_name?: string; unit_name?: string }[] = []
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row[nameIdx]?.trim()) continue
        imported.push({
          name: row[nameIdx].trim(),
          sku: row[skuIdx].trim(),
          category_name: row[catIdx]?.trim(),
          unit_name: row[unitIdx]?.trim(),
        })
      }
      setSaving(true)
      setError(null)
      for (const item of imported) {
        const cat = categories.find((c) => c.name === item.category_name)
        const un = units.find((u) => u.name === item.unit_name)
        const { error: err } = await supabase.from('products').insert({
          organization_id: organizationId,
          name: item.name,
          sku: item.sku,
          category_id: cat?.id ?? null,
          unit_id: un?.id ?? null,
          is_active: true,
        })
        if (err) { setError(err.message); break }
      }
      setSaving(false)
      e.target.value = ''
      fetchData()
    }
    reader.readAsText(file, 'UTF-8')
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => history.back()} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-slate-800 font-display">Products</h1>
            </div>
            <p className="text-sm text-slate-500">Kelola produk dan SKU</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExport}
              disabled={data.length === 0}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> <span>Export CSV</span>
            </button>
            <label className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer transition-colors">
              <Upload className="w-4 h-4" /> <span>Import CSV</span>
              <input type="file" accept=".csv" onChange={handleImport} className="hidden" />
            </label>
            <button
              onClick={() => {
                setShowForm(true)
                setEditId(null)
                setForm({ name: '', sku: '', category_id: '', unit_id: '', is_active: true })
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> <span>Baru</span>
            </button>
          </div>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">{error}</div>}

        {showForm && (
          <form onSubmit={handleSubmit} className="mb-6 bg-white rounded-xl border border-cyan-200 p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Produk *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">SKU *</label>
                <input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kategori</label>
                <select
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">-- Pilih --</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Satuan</label>
                <select
                  value={form.unit_id}
                  onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">-- Pilih --</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                    className="rounded border-slate-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-slate-700">Aktif</span>
                </label>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditId(null) }}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Menyimpan...' : editId ? 'Update' : 'Simpan'}
              </button>
            </div>
          </form>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari nama produk, SKU, atau kategori..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Nama</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">SKU</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Kategori</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Satuan</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <Tag className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>Belum ada produk</p>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs">{row.sku}</td>
                    <td className="px-4 py-3 text-slate-600">{row.product_categories?.name ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.units ? `${row.units.name} (${row.units.abbreviation})` : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {row.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => startEdit(row)}
                          className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-slate-100 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
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

'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useRoleGuard } from '@/hooks/use-role-guard'
import { AccessDenied } from '@/components/access-denied'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { exportToCsv, parseCsv } from '@/lib/csv'
import { Plus, Search, Truck, Loader2, X, Upload, Download, Trash2, Pencil } from 'lucide-react'

type Supplier = {
  id: string
  name: string
  email: string | null
  phone: string | null
  address: string | null
  created_at: string
  supplier_items?: { product_id: string }[]
}

const CSV_COLUMNS = [
  { key: 'name', label: 'Nama Supplier' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Telepon' },
  { key: 'address', label: 'Alamat' },
]

export default function SuppliersPage() {
  const { organizationId, loaded } = useSession()
  const { denied } = useRoleGuard(['ADMIN', 'DIRECTOR'])
  const [data, setData] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '' })
  const [editId, setEditId] = useState<string | null>(null)
  const [products, setProducts] = useState<{ id: string; name: string; sku: string }[]>([])
  const [itemIds, setItemIds] = useState<string[]>([])
  const [newProduct, setNewProduct] = useState({ open: false, name: '', sku: '', saving: false, error: null as string | null })

  useEffect(() => {
    if (!loaded) return
    fetchData()
    loadProducts()
  }, [loaded])

  async function loadProducts() {
    const { data: rows } = await supabase
      .from('products')
      .select('id, name, sku')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name')
      .limit(1000)
    setProducts((rows as { id: string; name: string; sku: string }[]) || [])
  }

  async function createProduct() {
    const name = newProduct.name.trim()
    const sku = newProduct.sku.trim()
    if (!name || !sku) { setNewProduct((s) => ({ ...s, error: 'Nama dan SKU wajib diisi.' })); return }
    setNewProduct((s) => ({ ...s, saving: true, error: null }))
    const { data: inserted, error } = await supabase
      .from('products')
      .insert({ organization_id: organizationId, name, sku, is_active: true })
      .select('id, name, sku')
      .single()
    if (error || !inserted) {
      setNewProduct((s) => ({ ...s, saving: false, error: error?.message ?? 'Gagal menambah barang.' }))
      return
    }
    const p = inserted as { id: string; name: string; sku: string }
    setProducts((prev) => [...prev, p].sort((a, b) => a.name.localeCompare(b.name)))
    setItemIds((prev) => [...prev, p.id])
    setNewProduct({ open: false, name: '', sku: '', saving: false, error: null })
  }

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('suppliers')
      .select('*, supplier_items(product_id)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(500)
    setData((rows as Supplier[]) || [])
    setLoading(false)
  }

  const filtered = data.filter((r) => {
    const q = search.toLowerCase()
    return (
      r.name?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q) ||
      r.phone?.toLowerCase().includes(q)
    )
  })

  function startEdit(row: Supplier) {
    setEditId(row.id)
    setForm({
      name: row.name,
      email: row.email ?? '',
      phone: row.phone ?? '',
      address: row.address ?? '',
    })
    setItemIds((row.supplier_items ?? []).map((i) => i.product_id))
    setShowForm(true)
  }

  function toggleItem(productId: string) {
    setItemIds((prev) => prev.includes(productId) ? prev.filter((x) => x !== productId) : [...prev, productId])
  }

  async function saveItems(supplierId: string) {
    const { error: delErr } = await supabase.from('supplier_items').delete().eq('supplier_id', supplierId)
    if (delErr) { setError(delErr.message); return false }
    if (itemIds.length > 0) {
      const { error: insErr } = await supabase.from('supplier_items').insert(
        itemIds.map((pid) => ({ organization_id: organizationId, supplier_id: supplierId, product_id: pid }))
      )
      if (insErr) { setError(insErr.message); return false }
    }
    return true
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus supplier ini?')) return
    const { error: err } = await supabase.from('suppliers').delete().eq('id', id)
    if (err) { alert(err.message); return }
    setData((prev) => prev.filter((r) => r.id !== id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) {
      alert('Nama supplier wajib diisi')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
    }
    if (editId) {
      const { error: err } = await supabase.from('suppliers').update(payload).eq('id', editId)
      if (err) { setError(err.message); setSaving(false); return }
      const ok = await saveItems(editId)
      if (!ok) { setSaving(false); return }
    } else {
      const { data: inserted, error: err } = await supabase.from('suppliers').insert({
        ...payload,
        organization_id: organizationId,
      }).select().single()
      if (err || !inserted) { setError(err?.message ?? 'Gagal menyimpan'); setSaving(false); return }
      const ok = await saveItems(inserted.id)
      if (!ok) { setSaving(false); return }
    }
    setSaving(false)
    setShowForm(false)
    setEditId(null)
    setForm({ name: '', email: '', phone: '', address: '' })
    setItemIds([])
    fetchData()
  }

  function handleExport() {
    exportToCsv(
      'suppliers.csv',
      CSV_COLUMNS,
      data.map((s) => ({
        name: s.name,
        email: s.email ?? '',
        phone: s.phone ?? '',
        address: s.address ?? '',
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
      const nameIdx = headers.indexOf('Nama Supplier')
      if (nameIdx < 0) {
        alert('Format CSV tidak valid. Kolom "Nama Supplier" diperlukan.')
        return
      }
      setSaving(true)
      setError(null)
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row[nameIdx]?.trim()) continue
        const { error: err } = await supabase.from('suppliers').insert({
          organization_id: organizationId,
          name: row[nameIdx].trim(),
          email: row[headers.indexOf('Email')]?.trim() || null,
          phone: row[headers.indexOf('Telepon')]?.trim() || null,
          address: row[headers.indexOf('Alamat')]?.trim() || null,
        })
        if (err) { setError(err.message); break }
      }
      setSaving(false)
      e.target.value = ''
      fetchData()
    }
    reader.readAsText(file, 'UTF-8')
  }

  if (denied) return <AccessDenied message="Data master hanya untuk Admin atau Director." />

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => history.back()} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-slate-800 font-display">Suppliers</h1>
            </div>
            <p className="text-sm text-slate-500">Kelola data supplier</p>
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
                setForm({ name: '', email: '', phone: '', address: '' })
                setItemIds([])
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
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Supplier *</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Telepon</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Alamat</label>
              <textarea
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={2}
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-slate-700">
                  Barang yang Dijual {itemIds.length > 0 && <span className="text-primary">({itemIds.length} dipilih)</span>}
                </label>
                <button
                  type="button"
                  onClick={() => setNewProduct((s) => ({ ...s, open: !s.open, error: null }))}
                  className="text-xs font-medium text-primary hover:text-primary/80"
                >
                  + Tambah barang baru
                </button>
              </div>
              {newProduct.open && (
                <div className="mb-2 p-3 bg-cyan-50 border border-cyan-200 rounded-lg space-y-2">
                  {newProduct.error && <p className="text-xs text-red-600">{newProduct.error}</p>}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      autoFocus
                      value={newProduct.name}
                      onChange={(e) => setNewProduct((s) => ({ ...s, name: e.target.value }))}
                      placeholder="Nama barang (mis. Ayam Fillet)"
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <input
                      value={newProduct.sku}
                      onChange={(e) => setNewProduct((s) => ({ ...s, sku: e.target.value }))}
                      placeholder="SKU (unik, mis. AYM-001)"
                      className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setNewProduct({ open: false, name: '', sku: '', saving: false, error: null })} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-white rounded-lg">Batal</button>
                    <button type="button" onClick={createProduct} disabled={newProduct.saving} className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg disabled:opacity-60">
                      {newProduct.saving ? 'Menyimpan...' : 'Simpan & Pilih'}
                    </button>
                  </div>
                </div>
              )}
              <div className="border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
                {products.length === 0 ? (
                  <p className="text-xs text-slate-400 col-span-full">Belum ada produk. Tambahkan di Master Produk.</p>
                ) : products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={itemIds.includes(p.id)}
                      onChange={() => toggleItem(p.id)}
                      className="rounded border-slate-300"
                    />
                    <span className="truncate" title={`${p.name} (${p.sku})`}>{p.name}</span>
                  </label>
                ))}
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
            placeholder="Cari nama, email, atau telepon..."
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
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Email</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Telepon</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Barang</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Alamat</th>
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
                    <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>Belum ada supplier</p>
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{row.name}</td>
                    <td className="px-4 py-3 text-slate-600">{row.email ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600">{row.phone ?? '-'}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">
                      {(row.supplier_items?.length ?? 0) > 0 ? `${row.supplier_items!.length} barang` : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{row.address ?? '-'}</td>
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

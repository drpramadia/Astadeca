'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export type QuickAddTable = 'products' | 'suppliers' | 'customers' | 'rental_customers'

type Props = {
  table: QuickAddTable
  organizationId: string | null
  value: string
  onChange: (id: string, name: string) => void
  options: { id: string; name: string }[]
  onAdded: (row: { id: string; name: string }) => void
  label?: string
  placeholder?: string
  className?: string
  /** Kolom tambahan yang diisi otomatis (mis. sku untuk produk). */
  extraFields?: { key: string; label: string; placeholder?: string }[]
}

/**
 * Select yang memiliki opsi "+ Tambah baru..." untuk membuat master data
 * langsung dari modal tanpa berpindah halaman.
 */
export function QuickAddSelect({
  table, organizationId, value, onChange, options, onAdded,
  label, placeholder = '-- Pilih --', className, extraFields = [],
}: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [extra, setExtra] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name.trim()) { setError('Nama wajib diisi.'); return }
    setSaving(true)
    setError(null)
    const payload: Record<string, unknown> = { organization_id: organizationId, name: name.trim() }
    for (const f of extraFields) {
      if (extra[f.key]?.trim()) payload[f.key] = extra[f.key].trim()
    }
    const { data, error: err } = await supabase.from(table).insert(payload).select('id, name').single()
    setSaving(false)
    if (err || !data) { setError(err?.message ?? 'Gagal menyimpan'); return }
    onAdded({ id: data.id, name: data.name })
    onChange(data.id, data.name)
    setAdding(false)
    setName('')
    setExtra({})
  }

  return (
    <div>
      {label && <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>}
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => {
            if (e.target.value === '__add__') { setAdding(true); return }
            const opt = options.find((o) => o.id === e.target.value)
            onChange(e.target.value, opt?.name ?? '')
          }}
          className={className ?? 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary'}
        >
          <option value="">{placeholder}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          <option value="__add__">➕ Tambah baru...</option>
        </select>
      </div>

      {adding && (
        <div className="mt-2 p-3 bg-cyan-50 border border-cyan-200 rounded-lg space-y-2">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama baru"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {extraFields.map((f) => (
            <input
              key={f.key}
              value={extra[f.key] ?? ''}
              onChange={(e) => setExtra((prev) => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.placeholder ?? f.label}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          ))}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { setAdding(false); setError(null) }} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-white rounded-lg">Batal</button>
            <button type="button" onClick={save} disabled={saving} className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg disabled:opacity-60">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

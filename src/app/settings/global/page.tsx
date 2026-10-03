'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Settings, Loader2, Save, ShieldAlert, SlidersHorizontal, Wallet, CalendarClock, PackageCheck } from 'lucide-react'

type Setting = { id: string; key: string; value: string | null }

type FieldDef = {
  key: string
  label: string
  description: string
  type: 'number' | 'text' | 'select'
  options?: { value: string; label: string }[]
}

const FIELDS: { group: string; icon: React.ElementType; items: FieldDef[] }[] = [
  {
    group: 'Tarif & Billing',
    icon: Wallet,
    items: [
      { key: 'rental.tariff_per_kg_per_day', label: 'Tarif per Kg / Hari', description: 'Tarif dasar rental (Rp). Kontrak baru memakai nilai ini.', type: 'number' },
      { key: 'rental.billing_period_days', label: 'Periode Tagih (hari)', description: 'Interval penagihan kontrak (mis. 14 = 2 minggu).', type: 'number' },
      { key: 'rental.minimum_days', label: 'Minimum Hari', description: 'Minimal hari yang ditagih (nitip beberapa jam tetap dihitung).', type: 'number' },
    ],
  },
  {
    group: 'Mode & Kebijakan',
    icon: CalendarClock,
    items: [
      {
        key: 'rental.spot_mode', label: 'Mode Titipan Harian', description: 'Cara bayar titipan harian (spot).', type: 'select',
        options: [{ value: 'UPFRONT', label: 'Bayar di depan (upfront)' }, { value: 'DP', label: 'Boleh DP sebagian' }],
      },
      {
        key: 'rental.excess_policy', label: 'Kelebihan Hari', description: 'Perlakuan sisa hari yang belum terpakai.', type: 'select',
        options: [{ value: 'CARRY_OVER', label: 'Simpan sebagai saldo (bisa dipakai lagi)' }, { value: 'REFUND', label: 'Dikembalikan' }, { value: 'FORFEIT', label: 'Hangus' }],
      },
    ],
  },
  {
    group: 'Kontrol Pengeluaran',
    icon: PackageCheck,
    items: [
      {
        key: 'rental.require_paid_before_release', label: 'Harus Lunas dulu', description: 'Barang tidak bisa keluar sebelum tagihan lunas.', type: 'select',
        options: [{ value: 'true', label: 'Ya' }, { value: 'false', label: 'Tidak' }],
      },
      {
        key: 'rental.require_approval_release', label: 'Approval Pengeluaran', description: 'Pengeluaran barang wajib approval director.', type: 'select',
        options: [{ value: 'true', label: 'Ya' }, { value: 'false', label: 'Tidak' }],
      },
    ],
  },
]

export default function SettingsPage() {
  const { isSystemAdmin, loaded, organizationId, userId } = useSession()
  const [values, setValues] = useState<Record<string, string>>({})
  const [ids, setIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loaded || !isSystemAdmin) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, isSystemAdmin])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('organization_settings')
      .select('id, key, value')
      .eq('organization_id', organizationId)
    const v: Record<string, string> = {}
    const i: Record<string, string> = {}
    ;((data as Setting[]) || []).forEach((s) => { v[s.key] = s.value ?? ''; i[s.key] = s.id })
    setValues(v)
    setIds(i)
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    for (const group of FIELDS) {
      for (const f of group.items) {
        const value = values[f.key] ?? ''
        if (ids[f.key]) {
          const { error: err } = await supabase.from('organization_settings').update({ value }).eq('id', ids[f.key])
          if (err) { setError(err.message); setSaving(false); return }
        } else {
          const { data, error: err } = await supabase
            .from('organization_settings')
            .insert({ organization_id: organizationId, key: f.key, value })
            .select()
            .single()
          if (err) { setError(err.message); setSaving(false); return }
          if (data) setIds((prev) => ({ ...prev, [f.key]: data.id }))
        }
      }
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (!loaded) return null
  if (!isSystemAdmin) {
    return (
      <AppShell>
        <div className="p-8 max-w-2xl mx-auto text-center py-20">
          <ShieldAlert className="w-10 h-10 mx-auto text-amber-500 mb-3" />
          <h1 className="text-lg font-semibold text-slate-800">Akses Terbatas</h1>
          <p className="text-sm text-slate-500 mt-1">Hanya SYSTEM_ADMIN yang dapat mengubah pengaturan global.</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display flex items-center gap-2">
              <Settings className="w-6 h-6 text-primary" /> Pengaturan Global
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Atur tarif, periode tagih, dan kebijakan rental. Nilai ini menjadi default kontrak baru.
            </p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">{error}</div>}
        {saved && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 mb-4">Pengaturan tersimpan.</div>}

        {loading ? (
          <div className="text-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="space-y-6">
            {FIELDS.map((group) => {
              const Icon = group.icon
              return (
                <div key={group.group} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
                    <Icon className="w-4 h-4 text-cyan-600" />
                    <h2 className="text-sm font-semibold text-slate-700">{group.group}</h2>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {group.items.map((f) => (
                      <div key={f.key} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-slate-800">{f.label}</label>
                          <p className="text-xs text-slate-500 mt-0.5">{f.description}</p>
                          <p className="text-[10px] text-slate-300 font-mono mt-0.5">{f.key}</p>
                        </div>
                        <div className="sm:w-64">
                          {f.type === 'select' ? (
                            <select
                              value={values[f.key] ?? ''}
                              onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            >
                              <option value="">-- Pilih --</option>
                              {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : (
                            <input
                              type={f.type === 'number' ? 'number' : 'text'}
                              value={values[f.key] ?? ''}
                              onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Perubahan berlaku untuk kontrak baru. Kontrak lama tetap memakai tarif saat dibuat.
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, X, Plus } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { useRentalSettings } from '@/hooks/use-rental-settings'
import { computeEndDate } from '@/lib/rental-dates'

type Customer = { id: string; name: string }
type ColdStorage = { id: string; name: string }
type Rate = { id: string; price_per_kg_per_day: number }

interface ContractFormData {
  customer_id: string
  cold_storage_id: string
  start_date: string
  duration_days: string
  price_per_kg_per_day: string
  minimum_1_ton: boolean
  notes: string
}

export default function NewContractPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const router = useRouter()
  const { settings } = useRentalSettings(organizationId)
  
  const [customers, setCustomers] = useState<Customer[]>([])
  const [coldStorages, setColdStorages] = useState<ColdStorage[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ContractFormData>({
    defaultValues: {
      customer_id: '', cold_storage_id: '',
      start_date: new Date().toISOString().slice(0, 10),
      duration_days: '90',
      price_per_kg_per_day: '', minimum_1_ton: true, notes: ''
    }
  })

  // Tanggal selesai otomatis dari tanggal mulai + jangka waktu
  const startDate = watch('start_date')
  const durationDays = watch('duration_days')
  const endDate = computeEndDate(startDate, parseInt(durationDays) || 0)

  // Isi tarif default dari pengaturan global
  useEffect(() => {
    if (settings.tariff_per_kg_per_day) {
      setValue('price_per_kg_per_day', String(settings.tariff_per_kg_per_day))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.tariff_per_kg_per_day])

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded) return
    if (!canAccess) { router.push('/cold-storage/contracts'); return }
    loadRefs()
  }, [loaded, canAccess])

  async function loadRefs() {
    setLoadingRefs(true)
    const [cRes, csRes] = await Promise.all([
      supabase.from('rental_customers').select('id, name').eq('organization_id', organizationId).order('name'),
      supabase.from('cold_storages').select('id, name').eq('organization_id', organizationId).order('name'),
    ])
    setCustomers(cRes.data || [])
    setColdStorages(csRes.data || [])
    setLoadingRefs(false)
  }

  async function onSubmit(form: any) {
    setSaving(true)
    setError(null)
    const { data: userData } = await supabase.auth.getUser()

    // Generate contract number
    const { data: numData } = await supabase.rpc('generate_number', { p_prefix: 'KONTRAK' })
    const contractNumber = numData as string

    const { data: inserted, error: insErr } = await supabase.from('rental_contracts').insert({
      organization_id: organizationId,
      customer_id: form.customer_id,
      cold_storage_id: form.cold_storage_id || null,
      contract_number: contractNumber,
      start_date: form.start_date,
      end_date: computeEndDate(form.start_date, parseInt(form.duration_days) || 0) || null,
      price_per_kg_per_day: parseFloat(form.price_per_kg_per_day) || 0,
      minimum_1_ton: !!form.minimum_1_ton,
      notes: form.notes || null,
      status: (roleCode === 'DIRECTOR' || roleCode === 'SYSTEM_ADMIN') ? 'ACTIVE' : 'PENDING_APPROVAL',
      created_by: userData.user?.id,
    }).select().single()

    if (insErr) { setError(insErr.message); setSaving(false); return }

    // Create approval request for non-director users
    if (roleCode !== 'DIRECTOR' && roleCode !== 'SYSTEM_ADMIN') {
      const { data: apprData, error: apprErr } = await supabase.from('approval_requests').insert({
        organization_id: organizationId,
        request_type: 'CONTRACT',
        reference_id: inserted.id,
        status: 'PENDING',
        requested_by: userData.user?.id,
      }).select().single()
      if (apprErr) { setError(apprErr.message); setSaving(false); return }
      if (apprData?.id) {
        await supabase.from('rental_contracts').update({ approval_request_id: apprData.id }).eq('id', inserted.id)
      }
    }

    setSaving(false)
    router.push('/cold-storage/contracts')
  }

  if (loaded && !canAccess) return null

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/cold-storage/contracts" className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></Link>
              <h1 className="text-2xl font-bold text-slate-800 font-display">Kontrak Baru</h1>
            </div>
            <p className="text-sm text-slate-500">Buat kontrak sewa cold storage baru</p>
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

          <div className={"bg-white rounded-xl border border-slate-200 p-6 space-y-5" + (loadingRefs ? " opacity-50 pointer-events-none" : "")}>
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Data Kontrak</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Customer *</label>
                <select {...register('customer_id', { required: 'Wajib dipilih' })} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">-- Pilih Customer --</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {errors.customer_id && <p className="text-xs text-red-500 mt-1">{errors.customer_id.message as string}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cold Storage</label>
                <select {...register('cold_storage_id')} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="">-- Pilih --</option>
                  {coldStorages.map((cs) => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tgl Mulai *</label>
                <input type="date" {...register('start_date', { required: 'Wajib diisi' })} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                {errors.start_date && <p className="text-xs text-red-500 mt-1">{errors.start_date.message as string}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Jangka Waktu (hari) *</label>
                <input type="number" min={1} {...register('duration_days', { required: 'Wajib diisi', min: { value: 1, message: 'Minimal 1 hari' } })} placeholder="mis. 90" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                {errors.duration_days && <p className="text-xs text-red-500 mt-1">{errors.duration_days.message as string}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tgl Selesai (otomatis)</label>
                <div className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 text-slate-600">
                  {endDate ? formatDate(endDate) : '—'}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tarif per Kg/Hari (Rp)</label>
                <input type="number" step="0.01" {...register('price_per_kg_per_day')} placeholder="0" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-slate-700 pb-2.5">
                  <input type="checkbox" {...register('minimum_1_ton')} defaultChecked className="rounded border-slate-300 text-primary focus:ring-primary" />
                  Tagih minimum 1 ton (1.000 kg) bila barang di bawah 1 ton
                </label>
              </div>
            </div>

            <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              Perjanjian penagihan: tagihan dihitung otomatis dari barang aktual di gudang x tarif per kg/hari.
              Bila barang di bawah 1 ton, tetap ditagih 1 ton. Barang dapat dikeluarkan kapan saja tanpa approval.
            </p>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
              <textarea {...register('notes')} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link href="/cold-storage/contracts" className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors">Batal</Link>
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

'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, FileText, ArrowRight, Loader2, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { computeEndDate } from '@/lib/rental-dates'
import { formatDate } from '@/lib/utils'

type Customer = { id: string; name: string }
type ColdStorage = { id: string; name: string }

export default function NewInquiryPage() {
  const { roleCode, loaded, organizationId } = useSession()
  const router = useRouter()
  
  const [customers, setCustomers] = useState<Customer[]>([])
  const [coldStorages, setColdStorages] = useState<ColdStorage[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      customer_id: '', cold_storage_id: '', notes: '',
      start_date: new Date().toISOString().slice(0, 10),
      duration_days: '90',
    },
  })

  const startDate = watch('start_date')
  const durationDays = watch('duration_days')
  const endDate = computeEndDate(startDate, parseInt(durationDays) || 0)

  const canAccess = roleCode === 'DIRECTOR' || roleCode === 'ADMIN' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded) return
    if (!canAccess) { router.push('/cold-storage/inquiries'); return }
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
    const uid = userData.user?.id ?? null
    if (!uid) { setSaving(false); setError('Sesi tidak ditemukan. Silakan login ulang.'); return }
    const { data: inserted, error: err } = await supabase
      .from('rental_inquiries')
      .insert({
        organization_id: organizationId,
        customer_id: form.customer_id || null,
        cold_storage_id: form.cold_storage_id || null,
        start_date: form.start_date || null,
        end_date: computeEndDate(form.start_date, parseInt(form.duration_days) || 0) || null,
        notes: form.notes || null,
        status: 'PENDING',
        created_by: uid,
      })
      .select()
      .single()
    if (err || !inserted) { setSaving(false); setError(err?.message ?? 'Gagal menyimpan inquiry'); return }

    // Buat approval request agar muncul di halaman Approval (Director)
    const { error: apprErr } = await supabase.from('approval_requests').insert({
      organization_id: organizationId,
      request_type: 'RENTAL_INQUIRY',
      reference_id: inserted.id,
      status: 'PENDING',
      requested_by: uid,
      comment: 'Permintaan sewa cold storage, menunggu persetujuan.',
    })
    if (apprErr) {
      await supabase.from('rental_inquiries').delete().eq('id', inserted.id)
      setSaving(false); setError(apprErr.message); return
    }

    setSaving(false)
    router.push('/cold-storage/inquiries')
  }

  if (loaded && !canAccess) return null

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-3xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/cold-storage/inquiries" className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></Link>
              <h1 className="text-2xl font-bold text-slate-800 font-display">Inquiry Baru</h1>
            </div>
            <p className="text-sm text-slate-500">Ajukan permintaan sewa cold storage</p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {loadingRefs && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-600" />
              <span className="ml-2 text-sm text-slate-500">Memuat data...</span>
            </div>
          )}

          <div className={loadingRefs ? "opacity-50 pointer-events-none" : ""}>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Customer</label>
              <select {...register('customer_id')} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">-- Pilih Customer --</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cold Storage</label>
              <select {...register('cold_storage_id')} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="">-- Pilih Cold Storage --</option>
                {coldStorages.map((cs) => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Mulai</label>
              <input type="date" {...register('start_date')} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Jangka Waktu (hari)</label>
              <input type="number" min={1} {...register('duration_days', { min: { value: 1, message: 'Minimal 1 hari' } })} placeholder="mis. 90" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              {errors.duration_days && <p className="text-xs text-red-500 mt-1">{errors.duration_days.message as string}</p>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Selesai (otomatis)</label>
            <div className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-slate-50 text-slate-600">
              {endDate ? formatDate(endDate) : '—'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
            <textarea {...register('notes')} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" placeholder="Catatan tambahan..." />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Link href="/cold-storage/inquiries" className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors">Batal</Link>
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

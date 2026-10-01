'use client'

import AppShell from '@/components/app-shell'
import LogoutButton from '@/components/logout-button'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, FileText, ArrowRight, Loader2, X } from 'lucide-react'
import { useForm } from 'react-hook-form'

const ORG_ID = '20000000-0000-0000-0000-000000000001'

type Customer = { id: string; name: string }
type ColdStorage = { id: string; name: string }

export default function NewInquiryPage() {
  const { roleName, loaded } = useSession()
  const router = useRouter()
  
  const [customers, setCustomers] = useState<Customer[]>([])
  const [coldStorages, setColdStorages] = useState<ColdStorage[]>([])
  const [saving, setSaving] = useState(false)
  const [loadingRefs, setLoadingRefs] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm()

  const canAccess = roleName === 'DIRECTOR' || roleName === 'ADMIN'

  useEffect(() => {
    if (!loaded) return
    if (!canAccess) { router.push('/cold-storage/inquiries'); return }
    loadRefs()
  }, [loaded, canAccess])

  async function loadRefs() {
    setLoadingRefs(true)
    const [cRes, csRes] = await Promise.all([
      supabase.from('rental_customers').select('id, name').eq('organization_id', ORG_ID).order('name'),
      supabase.from('cold_storages').select('id, name').eq('organization_id', ORG_ID).order('name'),
    ])
    setCustomers(cRes.data || [])
    setColdStorages(csRes.data || [])
    setLoadingRefs(false)
  }

  async function onSubmit(form: any) {
    setSaving(true)
    setError(null)
    const { data: userData } = await supabase.auth.getUser()
    const { error: err } = await supabase.from('rental_inquiries').insert({
      organization_id: ORG_ID,
      customer_id: form.customer_id || null,
      cold_storage_id: form.cold_storage_id || null,
      requested_kg: parseFloat(form.requested_kg) || 0,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      notes: form.notes || null,
      status: 'PENDING',
      created_by: userData.user?.id,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
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
          <LogoutButton />
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
              <select {...register('customer_id')} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                <option value="">-- Pilih Customer --</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cold Storage</label>
              <select {...register('cold_storage_id')} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                <option value="">-- Pilih Cold Storage --</option>
                {coldStorages.map((cs) => <option key={cs.id} value={cs.id}>{cs.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Kg Diminta *</label>
              <input type="number" step="0.01" {...register('requested_kg', { required: 'Wajib diisi' })} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              {errors.requested_kg && <p className="text-xs text-red-500 mt-1">{errors.requested_kg.message as string}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Mulai</label>
              <input type="date" {...register('start_date')} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tanggal Selesai</label>
            <input type="date" {...register('end_date')} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Catatan</label>
            <textarea {...register('notes')} rows={3} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none" placeholder="Catatan tambahan..." />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Link href="/cold-storage/inquiries" className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 rounded-lg hover:bg-slate-100 transition-colors">Batal</Link>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>{saving ? 'Menyimpan...' : 'Simpan'}</span>
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  )
}

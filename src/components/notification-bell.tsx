'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useSession } from '@/hooks/use-session'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDate } from '@/lib/utils'
import { notificationHref } from '@/lib/notification-route'
import {
  Bell,
  Check,
  ClipboardCheck,
  Loader2,
  BellOff,
  X,
  Eye,
} from 'lucide-react'

type Notification = {
  id: string
  title: string
  message: string | null
  is_read: boolean
  reference_type: string | null
  reference_id: string | null
  created_at: string
}

type Approval = {
  id: string
  request_type: string
  reference_id: string
  status: string
  comment: string | null
  created_at: string
  profiles_requested: { full_name: string } | null
}

const TYPE_LABELS: Record<string, string> = {
  CONTRACT: 'Kontrak Rental',
  PURCHASE_ORDER: 'Purchase Order',
  SALES_ORDER: 'Sales Order',
  QUOTATION: 'Penawaran Harga',
  DELIVERY: 'Delivery Order',
}

export default function NotificationBell() {
  const { userId, organizationId, roleCode, loaded } = useSession()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'notifications' | 'approvals'>('notifications')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const canApprove = roleCode === 'DIRECTOR' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded || !userId) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, userId])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function scanWasteExpiry() {
    // Jalankan pemindaian expiry/waste maksimal sekali per sesi browser dan
    // hanya bila ada organization_id, agar tidak memicu full-scan tiap navigasi.
    if (!organizationId) return
    if (typeof window === 'undefined') return
    const key = `waste-expiry-scan:${organizationId}`
    try {
      if (window.sessionStorage.getItem(key)) return
      window.sessionStorage.setItem(key, '1')
    } catch { /* ignore (private mode) */ }
    // Tidak di-await: jangan menunda pemuatan daftar notifikasi.
    await supabase.rpc('notify_waste_and_expiry', { p_organization_id: organizationId })
  }

  async function load() {
    if (!userId) return
    setLoading(true)
    void scanWasteExpiry()
    const [nRes, aRes] = await Promise.all([
      supabase
        .from('notifications')
        .select('*')
        .eq('recipient_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30),
      canApprove
        ? supabase
            .from('approval_requests')
            .select('*, profiles!approval_requests_requested_by_fkey(full_name)')
            .eq('organization_id', organizationId)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] as Approval[] }),
    ])
    setNotifications((nRes.data as Notification[]) || [])
    setApprovals((aRes.data as Approval[]) || [])
    setLoading(false)
  }

  const unread = notifications.filter((n) => !n.is_read).length
  const pending = approvals.length
  const badge = unread + pending

  async function markAllRead() {
    const ids = notifications.filter((n) => !n.is_read).map((n) => n.id)
    if (ids.length === 0) return
    await supabase.from('notifications').update({ is_read: true }).in('id', ids)
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  async function openNotification(n: Notification) {
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
    }
    setOpen(false)

    // Semua notifikasi dokumen -> buka dokumen/approval terkait
    const href = notificationHref(n.reference_type, n.reference_id, { canApprove })
    router.push(href)
  }

  async function decide(id: string, decision: 'APPROVED' | 'REJECTED') {
    const ok = confirm(
      decision === 'APPROVED'
        ? 'Setujui permintaan ini? Pastikan Anda sudah membuka & memeriksa dokumennya (tombol "Lihat Dokumen").'
        : 'Tolak permintaan ini?'
    )
    if (!ok) return
    setProcessing(id)
    setError(null)
    const { data: userData } = await supabase.auth.getUser()
    const row = approvals.find((a) => a.id === id)
    const { error: updErr } = await supabase
      .from('approval_requests')
      .update({
        status: decision,
        decided_by: userData.user?.id,
        decided_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (!updErr && row) {
      const refId = row.reference_id
      const nextStatus = decision === 'APPROVED' ? 'APPROVED' : 'REJECTED'
      let docErr: { message: string } | null = null
      if (row.request_type === 'PURCHASE_ORDER') {
        ({ error: docErr } = await supabase.from('purchase_orders').update({ status: nextStatus }).eq('id', refId))
      } else if (row.request_type === 'SALES_ORDER') {
        ({ error: docErr } = await supabase.from('sales_orders').update({ status: nextStatus }).eq('id', refId))
      } else if (row.request_type === 'CONTRACT') {
        ({ error: docErr } = await supabase.from('rental_contracts').update({ status: decision === 'APPROVED' ? 'ACTIVE' : 'CANCELLED' }).eq('id', refId))
      } else if (row.request_type === 'QUOTATION') {
        ({ error: docErr } = await supabase.from('quotations').update({ status: nextStatus }).eq('id', refId))
      } else if (row.request_type === 'DELIVERY') {
        ({ error: docErr } = await supabase.from('delivery_requests').update({ status: decision }).eq('id', refId))
      }
      if (docErr) {
        // Balikkan status approval agar tidak ada dokumen yang tidak sinkron
        await supabase.from('approval_requests')
          .update({ status: 'PENDING', decided_by: null, decided_at: null })
          .eq('id', id)
        setError(`Gagal memperbarui dokumen: ${docErr.message}`)
      }
    } else if (updErr) {
      setError(updErr.message)
    }
    setProcessing(null)
    load()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen((o) => !o); if (!open) load() }}
        className="relative flex items-center justify-center w-10 h-10 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
        aria-label="Notifikasi"
      >
        <Bell className="w-5 h-5" />
        {badge > 0 && (
          <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-danger text-white text-[10px] font-bold">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setTab('notifications')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                tab === 'notifications' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Notifikasi {unread > 0 && <span className="ml-1 text-xs text-danger">({unread})</span>}
            </button>
            {canApprove && (
              <button
                onClick={() => setTab('approvals')}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  tab === 'approvals' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Persetujuan {pending > 0 && <span className="ml-1 text-xs text-danger">({pending})</span>}
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="py-12 text-center text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              </div>
            ) : tab === 'notifications' ? (
              notifications.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <BellOff className="w-7 h-7 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Tidak ada notifikasi</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {notifications.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => openNotification(n)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-cyan-50/50' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.is_read ? 'bg-slate-200' : 'bg-cyan-500'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{n.title}</p>
                          {n.message && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>}
                          <p className="text-[11px] text-slate-400 mt-1">{formatDate(n.created_at)}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : approvals.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <ClipboardCheck className="w-7 h-7 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Tidak ada permintaan pending</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {approvals.map((a) => (
                  <div key={a.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{TYPE_LABELS[a.request_type] ?? a.request_type}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {a.profiles_requested?.full_name ?? '-'} · {formatDate(a.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => { setOpen(false); router.push(`/approval/requests/${a.id}`) }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Lihat Dokumen
                      </button>
                      <button
                        onClick={() => decide(a.id, 'APPROVED')}
                        disabled={processing === a.id}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-100 text-green-700 hover:bg-green-200 transition-colors disabled:opacity-50"
                        title="Setujui langsung"
                      >
                        {processing === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Setujui
                      </button>
                      <button
                        onClick={() => decide(a.id, 'REJECTED')}
                        disabled={processing === a.id}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
                        title="Tolak langsung"
                      >
                        <X className="w-3.5 h-3.5" /> Tolak
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="px-4 py-2 border-t border-red-200 bg-red-50 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 bg-slate-50">
            <button
              onClick={markAllRead}
              disabled={unread === 0}
              className="text-xs font-medium text-slate-500 hover:text-primary disabled:opacity-40"
            >
              Tandai semua dibaca
            </button>
            {canApprove && pending > 0 && (
              <button
                onClick={() => { setTab('approvals'); router.push('/approval/requests'); setOpen(false) }}
                className="text-xs font-medium text-primary hover:underline"
              >
                Lihat semua →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatDate } from '@/lib/utils'
import { notificationHref } from '@/lib/notification-route'
import { Bell, Loader2, X, Check, Trash2, ChevronRight } from 'lucide-react'

type Notification = {
  id: string
  title: string
  message: string | null
  is_read: boolean
  reference_type: string | null
  reference_id: string | null
  created_at: string
}

export default function NotificationsPage() {
  const { organizationId, loaded, roleCode } = useSession()
  const router = useRouter()
  const [data, setData] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  const canApprove = roleCode === 'DIRECTOR' || roleCode === 'SYSTEM_ADMIN'

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    const { data: rows } = await supabase
      .from('notifications')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(100)
    setData((rows as Notification[]) || [])
    setLoading(false)
  }

  async function markAsRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setData((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
  }

  async function markAllAsRead() {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('organization_id', organizationId)
      .eq('is_read', false)
    setData((prev) => prev.map((n) => ({ ...n, is_read: true })))
  }

  async function handleDelete(id: string) {
    if (!confirm('Hapus notifikasi ini?')) return
    await supabase.from('notifications').delete().eq('id', id)
    setData((prev) => prev.filter((n) => n.id !== id))
  }

  async function openNotification(row: Notification) {
    if (!row.is_read) await markAsRead(row.id)
    router.push(notificationHref(row.reference_type, row.reference_id, { canApprove }))
  }

  const unreadCount = data.filter((n) => !n.is_read).length

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => history.back()} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-slate-800 font-display">Notifikasi</h1>
            </div>
            <p className="text-sm text-slate-500">
              {unreadCount > 0 ? `${unreadCount} belum dibaca` : 'Semua notifikasi telah dibaca'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
            >
              <Check className="w-4 h-4" /> <span>Mark All Read</span>
            </button>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            </div>
          ) : data.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Tidak ada notifikasi</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.map((row) => (
                <div
                  key={row.id}
                  onClick={() => openNotification(row)}
                  className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer ${
                    !row.is_read ? 'bg-cyan-50/50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Bell className={`w-5 h-5 flex-shrink-0 ${
                      row.is_read ? 'text-slate-400' : 'text-cyan-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        row.is_read ? 'text-slate-700' : 'text-slate-900'
                      }`}>
                        {row.title}
                      </p>
                      {row.message && (
                        <p className="text-sm text-slate-500 mt-1">{row.message}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        {formatDate(row.created_at, {
                          weekday: 'short',
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(row.id) }}
                        className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

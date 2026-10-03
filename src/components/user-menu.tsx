'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useSession } from '@/hooks/use-session'
import { ChevronDown, LogOut, ShieldCheck, User, KeyRound } from 'lucide-react'

function initials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function UserMenu() {
  const { name, username, email, roleName, roleCode, loaded } = useSession()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const displayName = name || email || 'Pengguna'
  const roleLabel = roleName || roleCode || '-'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-3 pl-2 pr-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-primary text-white text-sm font-semibold flex-shrink-0">
          {initials(displayName)}
        </div>
        <div className="hidden md:block text-left leading-tight max-w-[160px]">
          <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
          <p className="text-xs text-slate-500 truncate">
            {username ? `@${username}` : email}
          </p>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl border border-slate-200 shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-white text-sm font-semibold flex-shrink-0">
                {initials(displayName)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
                {username && <p className="text-xs text-slate-500 truncate">@{username}</p>}
              </div>
            </div>
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <User className="w-3.5 h-3.5" />
                <span className="truncate">{email ?? '-'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{roleLabel}</span>
              </div>
            </div>
          </div>
          <button
            onClick={() => { setOpen(false); router.push('/account') }}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors border-t border-slate-100"
          >
            <KeyRound className="w-4 h-4" />
            <span>Akun Saya</span>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors border-t border-slate-100"
          >
            <LogOut className="w-4 h-4" />
            <span>Keluar</span>
          </button>
        </div>
      )}
    </div>
  )
}

'use client'

import AppShell from '@/components/app-shell'
import { ShieldAlert } from 'lucide-react'

/** Layar "akses terbatas" untuk role yang tidak berhak membuka halaman. */
export function AccessDenied({ message = 'Anda tidak memiliki akses ke halaman ini.' }: { message?: string }) {
  return (
    <AppShell>
      <div className="p-8 max-w-2xl mx-auto text-center py-20">
        <ShieldAlert className="w-10 h-10 mx-auto text-amber-500 mb-3" />
        <h1 className="text-lg font-semibold text-slate-800">Akses Terbatas</h1>
        <p className="text-sm text-slate-500 mt-1">{message}</p>
      </div>
    </AppShell>
  )
}

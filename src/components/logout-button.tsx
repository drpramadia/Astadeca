'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { LogOut } from 'lucide-react'

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors
        text-red-400 hover:text-red-300 hover:bg-red-500/10"
    >
      <LogOut className="w-4 h-4" />
      <span>Keluar</span>
    </button>
  )
}

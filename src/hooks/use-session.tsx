'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

interface SessionContextValue {
  userId: string | null
  loaded: boolean
  permissions: Set<string>
  isDirector: boolean
  isAdmin: boolean
  isWarehouse: boolean
  isSystemAdmin: boolean
  roleCode: string | null
  roleName: string | null
  name: string | null
  email: string | null
  username: string | null
  organizationId: string | null
  organizationName: string | null
}

const SessionContext = createContext<SessionContextValue>({
  userId: null,
  loaded: false,
  permissions: new Set(),
  isDirector: false,
  isAdmin: false,
  isWarehouse: false,
  isSystemAdmin: false,
  roleCode: null,
  roleName: null,
  name: null,
  email: null,
  username: null,
  organizationId: null,
  organizationName: null,
})

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<SessionContextValue>({
    userId: null,
    loaded: false,
    permissions: new Set(),
    isDirector: false,
    isAdmin: false,
    isWarehouse: false,
    isSystemAdmin: false,
    roleCode: null,
    roleName: null,
    name: null,
    email: null,
    username: null,
    organizationId: null,
    organizationName: null,
  })

  useEffect(() => {
    async function loadSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) {
          setValue((prev) => ({ ...prev, loaded: true }))
          return
        }

        const user = session.user

        const { data, error } = await supabase.rpc('get_my_session')
        if (error || !data?.authenticated) {
          const userId = user.id ?? null
          setValue((prev) => ({
            ...prev,
            userId,
            loaded: true,
            name: user.user_metadata?.full_name ?? user.email ?? null,
            email: user.email ?? null,
          }))
          return
        }

        const permissions = new Set<string>(data.permissions ?? [])
        const roleCode: string | null = data.role_code ?? null

        setValue({
          userId: data.user_id ?? user.id ?? null,
          loaded: true,
          permissions,
          isDirector: roleCode === 'DIRECTOR',
          isAdmin: roleCode === 'ADMIN',
          isWarehouse: roleCode === 'WAREHOUSE',
          isSystemAdmin: roleCode === 'SYSTEM_ADMIN',
          roleCode,
          roleName: data.role_name ?? null,
          name: data.name ?? user.email ?? null,
          email: data.email ?? user.email ?? null,
          username: data.username ?? null,
          organizationId: data.organization_id ?? null,
          organizationName: data.organization_name ?? null,
        })
      } catch {
        setValue((prev) => ({ ...prev, loaded: true }))
      }
    }

    loadSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setValue((prev) => ({ ...prev, userId: null, loaded: true, roleName: null, permissions: new Set(), isDirector: false, isAdmin: false, isWarehouse: false, isSystemAdmin: false }))
        return
      }
      loadSession()
    })

    return () => { subscription.unsubscribe() }
  }, [])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}

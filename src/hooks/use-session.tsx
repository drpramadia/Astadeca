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
  roleCode: string | null
  roleName: string | null
  name: string | null
  email: string | null
  organizationName: string | null
}

const SessionContext = createContext<SessionContextValue>({
  userId: null,
  loaded: false,
  permissions: new Set(),
  isDirector: false,
  isAdmin: false,
  isWarehouse: false,
  roleCode: null,
  roleName: null,
  name: null,
  email: null,
  organizationName: null,
})

const ORG_ID = '20000000-0000-0000-0000-000000000001'

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<SessionContextValue>({
    userId: null,
    loaded: false,
    permissions: new Set(),
    isDirector: false,
    isAdmin: false,
    isWarehouse: false,
    roleCode: null,
    roleName: null,
    name: null,
    email: null,
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
        const userId = user.id ?? null

        const { data: profile } = await supabase
          .from('profiles')
          .select('id, name, email, organization_id')
          .eq('id', userId)
          .single()

        const { data: membership } = await supabase
          .from('organization_memberships')
          .select('role_id, roles(code, name, permissions:role_permissions(permission_code))')
          .eq('user_id', userId)
          .eq('organization_id', ORG_ID)
          .single()

        const roleObj = Array.isArray(membership) ? membership[0] : membership
        const roleCode = roleObj?.roles?.code ?? null
        const roleName = roleObj?.roles?.name ?? null
        const permissions = new Set<string>(
          roleObj?.roles?.permissions?.map((p: any) => p.permission_code) ?? []
        )

        setValue({
          userId,
          loaded: true,
          permissions,
          isDirector: roleCode === 'DIRECTOR',
          isAdmin: roleCode === 'ADMIN',
          isWarehouse: roleCode === 'WAREHOUSE',
          roleCode,
          roleName: roleName ?? null,
          name: profile?.name ?? user.user_metadata?.full_name ?? user.email,
          email: user.email ?? null,
          organizationName: profile?.organization_id ?? null,
        })
      } catch {
        setValue((prev) => ({ ...prev, loaded: true }))
      }
    }

    loadSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setValue((prev) => ({ ...prev, userId: null, loaded: true, roleName: null, permissions: new Set(), isDirector: false, isAdmin: false, isWarehouse: false }))
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

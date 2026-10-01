'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

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
    // WRAPPER SKELETON — real session logic will be implemented later
    // Reads from localStorage/sessionStorage for cached session
    // Loads profile + membership from Supabase on mount
    // Sets: userId, loaded, permissions (Set), isDirector, isAdmin, isWarehouse, roleCode, roleName, name, email, organizationName
    setValue((prev) => ({ ...prev, loaded: true }))
  }, [])

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession() {
  return useContext(SessionContext)
}

'use client'

import { useSession } from '@/hooks/use-session'

/**
 * Hook guard role. Mengembalikan { loaded, allowed, denied }.
 * - denied = true bila sudah loaded dan role tidak diizinkan.
 * Pemakaian: `if (denied) return <AccessDenied ... />`
 */
export function useRoleGuard(allowed: string[]) {
  const { roleCode, isSystemAdmin, loaded } = useSession()
  const effective = isSystemAdmin ? 'SYSTEM_ADMIN' : roleCode
  const allowedRoles = isSystemAdmin ? [...allowed, 'SYSTEM_ADMIN'] : allowed
  const denied = loaded && (!effective || !allowedRoles.includes(effective))
  return { loaded, denied, roleCode: effective }
}

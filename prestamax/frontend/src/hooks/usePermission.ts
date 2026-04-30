// ─── usePermission hook ───────────────────────────────────────────────────────
// Usage:
//   const { can, canAny, isOwner } = usePermission()
//   if (can('loans.approve')) { ... }
//   if (canAny(['loans.approve', 'loans.reject'])) { ... }
// ─────────────────────────────────────────────────────────────────────────────
import { useContext, useMemo } from 'react'
import { TenantContext } from '@/contexts/TenantContext'
import { PermKey } from '@/lib/permissions'

export function usePermission() {
  const { state: tenantState } = useContext(TenantContext)

  const currentTenant = tenantState.currentTenant as any

  const effectivePermissions: string[] = useMemo(() => {
    if (!currentTenant) return []
    // effectivePermissions is sent by the backend on login/me
    return currentTenant.effectivePermissions || []
  }, [currentTenant])

  const roles: string[] = useMemo(() => {
    if (!currentTenant) return []
    return currentTenant.roles || []
  }, [currentTenant])

  const isOwner = useMemo(() => roles.includes('tenant_owner'), [roles])
  const isAdmin = useMemo(() => roles.includes('admin') || isOwner, [roles, isOwner])

  /** Check if current user has a specific permission */
  const can = (key: PermKey): boolean => {
    // tenant_owner always has full access (defensive check in case server didn't send effectivePermissions)
    if (isOwner) return true
    return effectivePermissions.includes(key)
  }

  /** Check if current user has ANY of the listed permissions */
  const canAny = (keys: PermKey[]): boolean => keys.some(k => can(k))

  /** Check if current user has ALL of the listed permissions */
  const canAll = (keys: PermKey[]): boolean => keys.every(k => can(k))

  return { can, canAny, canAll, isOwner, isAdmin, effectivePermissions, roles }
}

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
    // FIX P2 (Jun 2026): respetar SIEMPRE effectivePermissions cuando el backend
    // los envió — ya incluyen el techo del plan (computePermissions aplica el
    // ceiling incluso al owner). Antes el owner recibía `true` para todo, así
    // que veía en el menú módulos que su plan no incluye y recibía 403 al entrar.
    // El bypass por rol queda SOLO como fallback defensivo si la sesión no trae
    // permisos calculados (p.ej. token viejo previo a este cambio).
    if (effectivePermissions.length > 0) return effectivePermissions.includes(key)
    return isAdmin
  }

  /** Check if current user has ANY of the listed permissions */
  const canAny = (keys: PermKey[]): boolean => keys.some(k => can(k))

  /** Check if current user has ALL of the listed permissions */
  const canAll = (keys: PermKey[]): boolean => keys.every(k => can(k))

  return { can, canAny, canAll, isOwner, isAdmin, effectivePermissions, roles }
}

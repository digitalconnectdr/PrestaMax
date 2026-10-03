// Decisión de enrutamiento por rol (fuente única de la regla).
// Un usuario cuyo ÚNICO rol en la empresa es 'investor' entra al portal del
// inversionista (/portal) y no al sistema de gestión. Los roles salen de
// TenantContext (vía usePermission().roles); nunca de state.user.
export function isInvestorOnly(roles: readonly string[] | null | undefined): boolean {
  return !!roles && roles.length > 0 && roles.every(r => r === 'investor')
}

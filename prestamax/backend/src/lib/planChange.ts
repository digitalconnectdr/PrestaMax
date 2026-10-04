// applyPlanChange — efecto de un cambio de plan sobre los permisos explícitos
// (tenant_memberships.permissions).
//
// Política (NO destructiva):
//  - Los grants históricos (true) que el nuevo plan no incluye NO se borran: quedan
//    almacenados pero INEFECTIVOS, porque computePermissions aplica el techo del plan.
//  - Si el tenant vuelve a un plan que los incluye, vuelven a ser efectivos.
//  - Las revocaciones explícitas (false) se conservan siempre.
//  - No se pueden AÑADIR grants nuevos fuera del plan vigente: eso lo rechazan las rutas
//    de usuarios/membresías con findExplicitOutsidePlan (PERMISSION_OUTSIDE_PLAN).
//
// Esta función ya no escribe en la base: solo informa cuántos grants quedaron fuera del
// plan (útil para auditoría/avisos). Vive en lib/ para que admin.ts y billing.ts la
// importen de forma estática (sin require circular) y para poder probarla.
export function applyPlanChange(db: any, tenantId: string, newPlanId: string | null): { inactiveGrants: number } {
  const result = { inactiveGrants: 0 };
  if (!newPlanId) return result;
  const plan = db.prepare('SELECT features FROM plans WHERE id=?').get(newPlanId) as any;
  if (!plan) return result;
  let features: string[] = [];
  try { features = JSON.parse(plan.features || '[]'); } catch (_) { features = []; }
  // Si el plan no tiene features definidas, no hay techo (backward compat)
  if (features.length === 0) return result;
  const featureSet = new Set(features);

  const memberships = db.prepare('SELECT permissions FROM tenant_memberships WHERE tenant_id=?').all(tenantId) as any[];
  for (const m of memberships) {
    let explicit: Record<string, boolean> = {};
    try { explicit = JSON.parse(m.permissions || '{}'); } catch (_) { continue; }
    for (const [key, allowed] of Object.entries(explicit)) {
      if (allowed && !featureSet.has(key)) result.inactiveGrants++;
    }
  }
  return result;
}

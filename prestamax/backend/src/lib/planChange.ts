// applyPlanChange — actualiza el efecto de un cambio de plan sobre los permisos
// explicitos (tenant_memberships.permissions): LIMPIA los grants positivos que ya no
// esten incluidos en el nuevo plan. Evita que upgrades posteriores reactiven permisos
// viejos que el usuario perdio en un downgrade. (Las revocaciones, false, se conservan.)
//
// Vive en lib/ (y no en routes/billing.ts) para que admin.ts y billing.ts lo importen
// de forma estatica, sin require() circular, y para poder probarlo.
export function applyPlanChange(db: any, tenantId: string, newPlanId: string | null) {
  if (!newPlanId) return;
  const plan = db.prepare('SELECT features FROM plans WHERE id=?').get(newPlanId) as any;
  if (!plan) return;
  let features: string[] = [];
  try { features = JSON.parse(plan.features || '[]'); } catch (_) { features = []; }
  // Si el plan no tiene features definidas, no aplicamos ceiling (backward compat)
  if (features.length === 0) return;
  const featureSet = new Set(features);

  const memberships = db.prepare('SELECT id, permissions FROM tenant_memberships WHERE tenant_id=?').all(tenantId) as any[];
  for (const m of memberships) {
    let explicit: Record<string, boolean> = {};
    try { explicit = JSON.parse(m.permissions || '{}'); } catch (_) { continue; }
    let changed = false;
    for (const key of Object.keys(explicit)) {
      // Solo limpiar grants positivos (allowed=true) que el plan ya no permite
      if (explicit[key] && !featureSet.has(key)) {
        delete explicit[key];
        changed = true;
      }
    }
    if (changed) {
      db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?')
        .run(JSON.stringify(explicit), m.id);
    }
  }
}

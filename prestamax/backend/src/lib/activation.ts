// activation — definición de "cuenta activada" (Fase 3): al menos 1 cliente,
// 1 préstamo y 1 pago reales. Se marca UNA sola vez por tenant (tenants.activated_at)
// para que activation_completed sea idempotente incluso si el frontend llama
// a este chequeo más de una vez o desde distintas pestañas.
export function checkAndMarkActivation(db: any, tenantId: string): boolean {
  const tenant = db.prepare('SELECT activated_at FROM tenants WHERE id=?').get(tenantId) as any;
  if (!tenant || tenant.activated_at) return false; // ya activado (o tenant inexistente) — no duplicar

  const hasClient  = (db.prepare('SELECT COUNT(*) as c FROM clients WHERE tenant_id=?').get(tenantId) as any).c > 0;
  const hasLoan    = (db.prepare('SELECT COUNT(*) as c FROM loans WHERE tenant_id=?').get(tenantId) as any).c > 0;
  const hasPayment = (db.prepare('SELECT COUNT(*) as c FROM payments WHERE tenant_id=?').get(tenantId) as any).c > 0;
  if (!(hasClient && hasLoan && hasPayment)) return false;

  // UPDATE condicionado a activated_at IS NULL: si dos requests concurrentes
  // llegan a la vez, solo una de ellas ve changes>0 y dispara el evento.
  const result = db.prepare(`UPDATE tenants SET activated_at=datetime('now') WHERE id=? AND activated_at IS NULL`).run(tenantId);
  return Number(result?.changes || 0) > 0;
}

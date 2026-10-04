// Validacion unica del destinatario de una tarea de cobranza (POST y PUT).
// El usuario debe existir, estar activo, tener membership activa EN ESTE tenant y
// ser elegible por el RBAC vigente (plan AND rol: collections.tasks). Un UUID de
// otro tenant (o inexistente) recibe exactamente el mismo error: no se revela su
// existencia.
import { computePermissions } from './permissions';
import { getPlanFeatures } from './access';

export const TASK_ASSIGNEE_ERROR = 'El cobrador seleccionado no pertenece a esta empresa o no está disponible.';

export function validateTaskAssignee(
  db: any, tenantId: string, userId: unknown,
): { ok: boolean; error: string } {
  if (typeof userId !== 'string' || !userId) return { ok: false, error: TASK_ASSIGNEE_ERROR };
  const row = db.prepare(`
    SELECT tm.roles, tm.permissions
    FROM tenant_memberships tm JOIN users u ON u.id = tm.user_id
    WHERE tm.tenant_id = ? AND tm.user_id = ? AND tm.is_active = 1 AND u.is_active = 1
  `).get(tenantId, userId) as any;
  if (!row) return { ok: false, error: TASK_ASSIGNEE_ERROR };
  let roles: string[] = []; let explicit: Record<string, boolean> = {};
  try { roles = JSON.parse(row.roles || '[]'); } catch (_) { /* roles invalidos => sin permisos */ }
  try { explicit = JSON.parse(row.permissions || '{}'); } catch (_) { /* sin explicitos */ }
  if (!computePermissions(roles, explicit, getPlanFeatures(db, tenantId)).has('collections.tasks')) {
    return { ok: false, error: 'El usuario seleccionado no puede recibir tareas de cobranza (sin permiso en su rol o plan).' };
  }
  return { ok: true, error: '' };
}

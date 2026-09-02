// notify — helper compartido para crear notificaciones in-app.
// Antes cada modulo insertaba en `notifications` a mano y con criterios
// distintos; esto centraliza el patron y agrega "notificar a los admins del
// tenant", que no existia (los unicos triggers eran tareas de cobranza y
// leads hacia la plataforma, nada hacia el dueño del negocio).
import { uuid } from '../db/database';

export function notifyUser(db: any, tenantId: string, userId: string, type: string, title: string, message: string, entityType?: string, entityId?: string) {
  try {
    db.prepare(`INSERT INTO notifications (id,tenant_id,user_id,type,title,message,entity_type,entity_id) VALUES (?,?,?,?,?,?,?,?)`)
      .run(uuid(), tenantId, userId, type, title, message, entityType || null, entityId || null);
  } catch (_) { /* non-critical */ }
}

// Notifica a todos los usuarios con rol de dueño/admin del tenant (los que
// realmente quieren enterarse de "entró un pago" o "un cliente pidió un
// préstamo" sin tener que estar viendo la pantalla en ese momento).
export function notifyTenantAdmins(db: any, tenantId: string, type: string, title: string, message: string, entityType?: string, entityId?: string) {
  try {
    const admins = db.prepare(`
      SELECT DISTINCT tm.user_id FROM tenant_memberships tm
      WHERE tm.tenant_id=? AND tm.is_active=1 AND (tm.roles LIKE '%"tenant_owner"%' OR tm.roles LIKE '%"admin"%')
    `).all(tenantId) as any[];
    for (const a of admins) notifyUser(db, tenantId, a.user_id, type, title, message, entityType, entityId);
  } catch (_) { /* non-critical */ }
}

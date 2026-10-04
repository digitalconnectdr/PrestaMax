// notify — via estandar para crear notificaciones in-app.
//
//  - Siempre dentro de un tenant; ignora usuarios y memberships inactivos.
//  - Destinatarios por AUTORIZACION REAL (plan AND rol/permisos) o por rol
//    administrativo (tenant_owner/admin) segun el evento.
//  - dedupe_key: idempotencia (indice unico parcial tenant+usuario+clave): el mismo
//    evento repetido (retry, webhook duplicado, cron) no genera filas nuevas.
//  - required_permission: al LISTAR, la notificacion solo se muestra si el usuario
//    conserva ese permiso efectivo (downgrade / cambio de rol no filtra datos).
//  - Nunca lanza: una falla de notificacion no rompe la operacion principal, pero
//    se registra (mensaje tecnico seguro, sin datos de negocio).
import { uuid } from '../db/database';
import { computePermissions } from './permissions';
import { getPlanFeatures } from './access';

export interface NotifyOpts {
  entityType?: string | null;
  entityId?: string | null;
  /** Permiso efectivo necesario para VER la notificacion (null = siempre visible al destinatario). */
  requiredPermission?: string | null;
  /** Clave de idempotencia (unica por tenant+usuario). */
  dedupeKey?: string | null;
  /** Actor que produjo el evento: no se notifica a si mismo. */
  excludeUserId?: string | null;
}

export interface PermissionNotifyOpts extends NotifyOpts {
  /** Usuarios adicionales (p. ej. cobrador asignado), sin duplicar destinatarios. */
  alsoUserIds?: Array<string | null | undefined>;
  /** Incluir owner/admin aunque no cumplan la regla (por defecto no). */
  includeAdmins?: boolean;
}

function logNotifyError(ctx: string, e: any) {
  // Solo codigo/mensaje tecnico recortado: nunca payload ni datos de clientes.
  console.error(`[notify] ${ctx} fallo: ${String(e?.code || '')} ${String(e?.message || e).slice(0, 160)}`.trim());
}

function parseJson<T>(raw: any, fallback: T): T {
  try { const v = JSON.parse(raw); return (v ?? fallback) as T; } catch (_) { return fallback; }
}

interface Member { userId: string; roles: string[]; explicit: Record<string, boolean> }

/** Memberships activas de usuarios activos del tenant. */
function activeMembers(db: any, tenantId: string): Member[] {
  const rows = db.prepare(`
    SELECT tm.user_id, tm.roles, tm.permissions
    FROM tenant_memberships tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.tenant_id = ? AND tm.is_active = 1 AND u.is_active = 1
  `).all(tenantId) as any[];
  return rows.map(r => ({
    userId: r.user_id,
    roles: parseJson<string[]>(r.roles, []),
    explicit: parseJson<Record<string, boolean>>(r.permissions, {}),
  }));
}

const isAdminRole = (roles: string[]) => roles.includes('tenant_owner') || roles.includes('admin');

/** INSERT idempotente. Devuelve true si se creo una fila nueva. */
export function insertNotification(
  db: any, tenantId: string, userId: string, type: string, title: string, message: string, opts: NotifyOpts = {},
): boolean {
  const res = db.prepare(`
    INSERT OR IGNORE INTO notifications
      (id, tenant_id, user_id, type, title, message, entity_type, entity_id, required_permission, dedupe_key)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    uuid(), tenantId, userId, type, title, message,
    opts.entityType || null, opts.entityId || null,
    opts.requiredPermission || null, opts.dedupeKey || null,
  ) as any;
  return Number(res?.changes || 0) > 0;
}

/** Notifica a UN usuario si tiene membership activa en el tenant. */
export function notifyUser(
  db: any, tenantId: string, userId: string | null | undefined, type: string, title: string, message: string, opts: NotifyOpts = {},
): boolean {
  try {
    if (!userId || userId === opts.excludeUserId) return false;
    const ok = db.prepare(`
      SELECT 1 FROM tenant_memberships tm JOIN users u ON u.id = tm.user_id
      WHERE tm.tenant_id = ? AND tm.user_id = ? AND tm.is_active = 1 AND u.is_active = 1
    `).get(tenantId, userId);
    if (!ok) return false;
    return insertNotification(db, tenantId, userId, type, title, message, opts);
  } catch (e) { logNotifyError(`notifyUser(${type})`, e); return false; }
}

/**
 * Owner/admin activos del tenant (alertas de cuenta/billing/operacion): rol, no
 * feature — reciben el aviso sin importar el packaging del plan.
 */
export function notifyTenantAdmins(
  db: any, tenantId: string, type: string, title: string, message: string, opts: NotifyOpts = {},
): number {
  try {
    let n = 0;
    for (const m of activeMembers(db, tenantId)) {
      if (!isAdminRole(m.roles) || m.userId === opts.excludeUserId) continue;
      if (insertNotification(db, tenantId, m.userId, type, title, message, opts)) n++;
    }
    return n;
  } catch (e) { logNotifyError(`notifyTenantAdmins(${type})`, e); return 0; }
}

/**
 * Usuarios con el permiso EFECTIVO (plan AND rol/permisos explicitos), mas
 * `alsoUserIds` (p. ej. cobrador asignado) sin duplicar. required_permission queda
 * por defecto en el mismo permiso.
 */
export function notifyUsersWithPermission(
  db: any, tenantId: string, permission: string, type: string, title: string, message: string,
  opts: PermissionNotifyOpts = {},
): number {
  try {
    const planFeatures = getPlanFeatures(db, tenantId);
    const also = new Set((opts.alsoUserIds || []).filter(Boolean) as string[]);
    const finalOpts: NotifyOpts = { ...opts, requiredPermission: opts.requiredPermission ?? permission };
    let n = 0;
    for (const m of activeMembers(db, tenantId)) {
      if (m.userId === opts.excludeUserId) continue;
      const has = computePermissions(m.roles, m.explicit, planFeatures).has(permission);
      const include = has || also.has(m.userId) || (opts.includeAdmins && isAdminRole(m.roles));
      if (!include) continue;
      if (insertNotification(db, tenantId, m.userId, type, title, message, finalOpts)) n++;
    }
    return n;
  } catch (e) { logNotifyError(`notifyUsersWithPermission(${type})`, e); return 0; }
}

/** Owner de la plataforma (OWNER_USER_EMAIL). */
export function ownerEmail(): string {
  return (process.env.OWNER_USER_EMAIL || 'jcpenalo@gmail.com').toLowerCase();
}

/**
 * Alerta operativa al owner de la plataforma. Una fila por cada tenant donde el owner
 * tiene membership (asi el badge aparece en cualquier empresa que este viendo); si no
 * tiene ninguna, se ancla al tenant del evento (el staff de plataforma puede leerla
 * con ese X-Tenant-Id). dedupeKey evita ruido por eventos repetidos.
 */
export function notifyPlatformOwner(
  db: any, type: string, title: string, message: string,
  opts: NotifyOpts & { fallbackTenantId?: string | null } = {},
): number {
  try {
    const owners = db.prepare(`SELECT id FROM users WHERE lower(email)=? AND is_active=1`).all(ownerEmail()) as any[];
    let n = 0;
    for (const o of owners) {
      let tenants = (db.prepare(`SELECT tenant_id FROM tenant_memberships WHERE user_id=? AND is_active=1`).all(o.id) as any[]).map(r => r.tenant_id);
      if (tenants.length === 0 && opts.fallbackTenantId) tenants = [opts.fallbackTenantId];
      for (const tid of tenants) {
        if (insertNotification(db, tid, o.id, type, title, message, { ...opts, requiredPermission: null })) n++;
      }
    }
    return n;
  } catch (e) { logNotifyError(`notifyPlatformOwner(${type})`, e); return 0; }
}

/**
 * Mantenimiento ACOTADO de notificaciones huérfanas legadas (su recurso ya no existe).
 * Reemplaza la limpieza global que antes corría en cada GET/poll: ahora la ejecuta el
 * scheduler una vez al día, borra como máximo `limitPerType` filas por tipo de recurso
 * (no bloquea el event loop) y solo considera recursos DEL MISMO tenant.
 */
export function cleanOrphanNotificationsBounded(db: any, limitPerType = 500): number {
  const targets: Array<{ type: string; table: string; tenantScoped: boolean }> = [
    { type: 'loan', table: 'loans', tenantScoped: true },
    { type: 'payment', table: 'payments', tenantScoped: true },
    { type: 'loan_request', table: 'loan_requests', tenantScoped: true },
    { type: 'collection_task', table: 'collection_tasks', tenantScoped: true },
    { type: 'plan_inquiry', table: 'plan_inquiries', tenantScoped: false },
  ];
  let removed = 0;
  for (const t of targets) {
    try {
      const exists = t.tenantScoped
        ? `SELECT 1 FROM ${t.table} r WHERE r.id = n.entity_id AND r.tenant_id = n.tenant_id`
        : `SELECT 1 FROM ${t.table} r WHERE r.id = n.entity_id`;
      const r = db.prepare(`
        DELETE FROM notifications WHERE id IN (
          SELECT n.id FROM notifications n
          WHERE n.entity_type = ? AND n.entity_id IS NOT NULL AND NOT EXISTS (${exists})
          LIMIT ?
        )`).run(t.type, limitPerType) as any;
      removed += Number(r?.changes || 0);
    } catch (e) { logNotifyError(`cleanOrphan(${t.type})`, e); }
  }
  return removed;
}

/** Borra las notificaciones de un recurso (al eliminarlo). Siempre acotado por tenant. */
export function deleteNotificationsForEntity(db: any, tenantId: string, entityType: string, entityId: string) {
  try {
    db.prepare(`DELETE FROM notifications WHERE tenant_id=? AND entity_type=? AND entity_id=?`).run(tenantId, entityType, entityId);
  } catch (e) { logNotifyError('deleteNotificationsForEntity', e); }
}

// ─── Límites comerciales del plan (préstamos activos, usuarios, cobradores) ──
// UN SOLO lugar donde se define y se cuenta qué es "préstamo activo" y qué es
// un "usuario/cobrador activo", para que ningún endpoint dispersen SQL propio.
//
// Política (downgrade / exceso de uso): NUNCA se borra ni se desactiva nada
// automáticamente. Si un tenant ya excede el límite de su plan (p. ej. bajó de
// plan), todo lo existente sigue funcionando; solo se BLOQUEA lo nuevo que
// aumentaría el exceso. Operaciones que reducen o mantienen el conteo
// (delta <= 0) nunca se bloquean.
//
// Convención de límites: -1 (o NULL / sin plan) = ilimitado.

/** Estados que cuentan como "préstamo activo" para el límite comercial.
 *  'disbursed' es solo compatibilidad legacy (puede existir en datos viejos).
 *  NO cuentan: draft, under_review, approved, rejected, paid, cancelled,
 *  voided, written_off, restructured. */
export const ACTIVE_LOAN_STATUSES = ['active', 'in_mora', 'disbursed'] as const;

export const PLAN_LIMIT_ACTIVE_LOANS = 'PLAN_LIMIT_ACTIVE_LOANS';
export const PLAN_LIMIT_USERS = 'PLAN_LIMIT_USERS';
export const PLAN_LIMIT_COLLECTORS = 'PLAN_LIMIT_COLLECTORS';

export interface TenantPlanLimits {
  planId: string | null;
  maxActiveLoans: number | null;
  maxUsers: number | null;
  maxCollectors: number | null;
  maxClients: number | null;
}

export interface LimitViolation {
  code: string;
  error: string;
  limit: number;
  current: number;
}

/** true si el valor representa "sin límite" (-1, NULL o undefined). */
export function isUnlimited(max: number | null | undefined): boolean {
  return max === null || max === undefined || max < 0;
}

/** Límites del plan vigente del tenant. Tenant sin plan => todo null (ilimitado). */
export function getTenantPlanLimits(db: any, tenantId: string): TenantPlanLimits {
  const row = db.prepare(`
    SELECT p.id AS plan_id, p.max_active_loans, p.max_users, p.max_collectors, p.max_clients
    FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id
    WHERE t.id = ?`).get(tenantId) as any;
  return {
    planId: row?.plan_id ?? null,
    maxActiveLoans: row?.max_active_loans ?? null,
    maxUsers: row?.max_users ?? null,
    maxCollectors: row?.max_collectors ?? null,
    maxClients: row?.max_clients ?? null,
  };
}

// ── Préstamos activos ────────────────────────────────────────────────────────

/** Conteo ÚNICO de préstamos activos de un tenant (usa idx_loans_tenant_status). */
export function countActiveLoans(db: any, tenantId: string): number {
  const ph = ACTIVE_LOAN_STATUSES.map(() => '?').join(',');
  const row = db.prepare(
    `SELECT COUNT(*) AS c FROM loans WHERE tenant_id = ? AND status IN (${ph})`
  ).get(tenantId, ...ACTIVE_LOAN_STATUSES) as any;
  return row?.c ?? 0;
}

/**
 * ¿Puede el tenant sumar `delta` préstamos activos? Devuelve null si sí, o el
 * detalle de la violación si no. delta <= 0 nunca bloquea (no aumenta el
 * conjunto activo), aun si el tenant ya está por encima del límite.
 */
export function checkActiveLoanLimit(db: any, tenantId: string, delta = 1): LimitViolation | null {
  if (delta <= 0) return null;
  const { maxActiveLoans } = getTenantPlanLimits(db, tenantId);
  if (isUnlimited(maxActiveLoans)) return null;
  const current = countActiveLoans(db, tenantId);
  if (current + delta <= (maxActiveLoans as number)) return null;
  return {
    code: PLAN_LIMIT_ACTIVE_LOANS,
    limit: maxActiveLoans as number,
    current,
    error: `Tu plan permite un máximo de ${maxActiveLoans} préstamos activos (tienes ${current}). `
      + 'Tus préstamos existentes no se tocan; para activar más, liquida préstamos o mejora tu plan.',
  };
}

// ── Entitlement de features (mismo criterio que requirePermission, capa 1) ──

/**
 * ¿El plan del tenant incluye la PermKey? Sin plan, o plan con features vacío
 * o en formato legacy (sin puntos), no hay techo => true. Mismo criterio que
 * middleware/auth.ts requirePermission, para uso en rutas SIN sesión (p. ej.
 * el enlace público de solicitudes), donde no se puede usar el middleware.
 */
export function tenantPlanIncludes(db: any, tenantId: string, permKey: string): boolean {
  const row = db.prepare(
    'SELECT p.features FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id WHERE t.id = ?'
  ).get(tenantId) as any;
  let features: string[] = [];
  try { features = JSON.parse(row?.features || '[]'); } catch (_) { features = []; }
  if (!Array.isArray(features) || features.length === 0) return true;
  if (features.every(f => !String(f).includes('.'))) return true; // formato legacy
  return features.includes(permKey);
}

/**
 * ¿La suscripción/trial del tenant está vigente? Mismo criterio que
 * requireTenant: 'pending' y 'expired' no son vigentes, ni lo es una
 * subscription_end ya pasada.
 */
export function tenantSubscriptionIsValid(tenant: { subscription_status?: string | null; subscription_end?: string | null }): boolean {
  const status = tenant.subscription_status || 'trial';
  if (status === 'pending' || status === 'expired') return false;
  if (tenant.subscription_end && new Date(tenant.subscription_end) < new Date()) return false;
  return true;
}

// ── Usuarios y cobradores ────────────────────────────────────────────────────

export function rolesHaveCollector(roles: string[] | null | undefined): boolean {
  return !!roles && (roles.includes('cobrador') || roles.includes('collector'));
}

function parseRoles(raw: any): string[] {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch (_) { return []; }
}

/** Usuarios activos del tenant (todos los roles; incluye cobradores e inversionistas). */
export function countActiveMembers(db: any, tenantId: string): number {
  const row = db.prepare(
    'SELECT COUNT(*) AS c FROM tenant_memberships WHERE tenant_id = ? AND is_active = 1'
  ).get(tenantId) as any;
  return row?.c ?? 0;
}

/** Cobradores activos (subconjunto de los usuarios activos). */
export function countActiveCollectors(db: any, tenantId: string): number {
  const rows = db.prepare(
    'SELECT roles FROM tenant_memberships WHERE tenant_id = ? AND is_active = 1'
  ).all(tenantId) as any[];
  return rows.filter(r => rolesHaveCollector(parseRoles(r.roles))).length;
}

/**
 * Valida una alta/reactivación/cambio de rol. Parámetros:
 *  - addsUser:      true si la operación suma un usuario activo nuevo (alta o reactivación).
 *  - addsCollector: true si la operación suma un cobrador activo nuevo
 *                   (alta/reactivación con rol cobrador, o un activo que pasa a cobrador).
 * Los cobradores son parte del total de usuarios: un cobrador consume un asiento
 * de usuario Y un cupo de cobrador.
 */
export function checkMembershipLimits(
  db: any,
  tenantId: string,
  opts: { addsUser: boolean; addsCollector: boolean },
): LimitViolation | null {
  const limits = getTenantPlanLimits(db, tenantId);
  if (opts.addsUser && !isUnlimited(limits.maxUsers)) {
    const current = countActiveMembers(db, tenantId);
    if (current >= (limits.maxUsers as number)) {
      return {
        code: PLAN_LIMIT_USERS,
        limit: limits.maxUsers as number,
        current,
        error: `Tu plan permite un máximo de ${limits.maxUsers} usuario(s) en total (los cobradores cuentan dentro de ese total). Actualiza tu plan para agregar más.`,
      };
    }
  }
  if (opts.addsCollector && !isUnlimited(limits.maxCollectors)) {
    const current = countActiveCollectors(db, tenantId);
    if (current >= (limits.maxCollectors as number)) {
      return {
        code: PLAN_LIMIT_COLLECTORS,
        limit: limits.maxCollectors as number,
        current,
        error: `Tu plan permite un máximo de ${limits.maxCollectors} cobrador(es). Actualiza tu plan para agregar más.`,
      };
    }
  }
  return null;
}

/**
 * Qué suma exactamente un cambio sobre una membresía existente (PUT /users/:id,
 * grant-portal-access). `before` es null si la membresía no existe todavía.
 */
export function membershipDelta(
  before: { isActive: boolean; roles: string[] } | null,
  after: { isActive: boolean; roles: string[] },
): { addsUser: boolean; addsCollector: boolean } {
  const wasActive = !!before?.isActive;
  const wasCollector = wasActive && rolesHaveCollector(before?.roles);
  const nowCollector = after.isActive && rolesHaveCollector(after.roles);
  return {
    addsUser: after.isActive && !wasActive,
    addsCollector: nowCollector && !wasCollector,
  };
}

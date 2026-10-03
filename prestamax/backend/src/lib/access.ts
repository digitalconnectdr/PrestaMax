// ─── Autorización efectiva: PLAN ∧ ROL/PERMISO (para uso dentro de handlers) ──
// requirePermission() cubre las rutas con middleware. Estas funciones cubren los
// casos donde la decisión se toma DENTRO del handler (p. ej. /search, que
// devuelve varias categorías, o la aprobación por monto).
//
// Modelo de autoridad (ver planLimits.ts para límites numéricos):
//   PLATFORM SUPER ADMIN  → bypass técnico (soporte/administración)
//   TENANT PLAN           → techo (plans.features)
//   TENANT ROLE / USER    → roles + permisos explícitos, SIEMPRE dentro del techo
import { computePermissions, PermKey } from './permissions';
import { isPlatformStaff } from '../middleware/auth';

/** Features del plan del tenant, o null si no hay techo (sin plan / vacío / formato legacy). */
export function getPlanFeatures(db: any, tenantId: string): string[] | null {
  const row = db.prepare(
    'SELECT p.features FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id WHERE t.id = ?'
  ).get(tenantId) as any;
  let features: string[] = [];
  try { features = JSON.parse(row?.features || '[]'); } catch (_) { features = []; }
  if (!Array.isArray(features) || features.length === 0) return null;
  if (features.every(f => !String(f).includes('.'))) return null; // formato legacy
  return features;
}

/** Permisos efectivos (plan ∧ rol/explícitos) de la membresía del request. */
export function effectivePermissionSet(req: any, db: any): Set<string> {
  const membership = req.membership;
  if (!membership) return new Set();
  const roles: string[] = (() => { try { return JSON.parse(membership.roles || '[]'); } catch (_) { return []; } })();
  const explicit: Record<string, boolean> = (() => { try { return JSON.parse(membership.permissions || '{}'); } catch (_) { return {}; } })();
  return computePermissions(roles, explicit, getPlanFeatures(db, req.tenant.id));
}

/** ¿El solicitante tiene el permiso efectivo? El staff de plataforma siempre (soporte). */
export function requesterCan(req: any, db: any, key: PermKey): boolean {
  if (isPlatformStaff(req.user)) return true;
  return effectivePermissionSet(req, db).has(key);
}

/** ¿El plan del tenant incluye la clave? (sin mirar roles). Sin techo => true. */
export function planAllows(db: any, tenantId: string, key: string): boolean {
  const features = getPlanFeatures(db, tenantId);
  return features === null || features.includes(key);
}

/**
 * Valida un mapa de permisos explícitos contra el techo del plan.
 *  - Rechaza CONCESIONES nuevas (true) fuera del plan.
 *  - Conserva las concesiones históricas ya guardadas (p. ej. tras un downgrade):
 *    no se borran; quedan inactivas porque el techo se aplica al calcular
 *    permisos, y reaparecen si el plan vuelve a incluirlas.
 *  - Las revocaciones (false) siempre se permiten.
 */
export function findExplicitOutsidePlan(
  requested: Record<string, boolean>,
  existing: Record<string, boolean>,
  planFeatures: string[] | null,
): string[] {
  if (!planFeatures) return [];
  const set = new Set(planFeatures);
  return Object.entries(requested)
    .filter(([k, v]) => v === true && existing[k] !== true && !set.has(k))
    .map(([k]) => k);
}

export const PERMISSION_OUTSIDE_PLAN = 'PERMISSION_OUTSIDE_PLAN';

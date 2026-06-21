import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getDb } from "../db/database";
import { PermKey, computePermissions } from "../lib/permissions";

export interface AuthRequest extends Request {
  user?: any;
  tenant?: any;
  membership?: any;
}

// ── Acceso de plataforma (panel /admin) ──────────────────────────────────────
// SOLO el owner de la plataforma (por email) y, opcionalmente, staff con un
// platform_role EXPLÍCITO de plataforma. OJO: 'admin' es el rol del dueño de
// cada empresa (tenant), NO un rol de plataforma — por eso NO se incluye aquí.
// Así, ningún cliente que adquiera el servicio obtiene acceso al panel global.
const PLATFORM_ROLES = ['platform_owner', 'platform_admin', 'platform_support'];
export function isPlatformStaff(user: any): boolean {
  if (!user) return false;
  const ownerEmail = (process.env.OWNER_USER_EMAIL || 'jcpenalo@gmail.com').toLowerCase();
  if ((user.email || '').toLowerCase() === ownerEmail) return true;
  return PLATFORM_ROLES.includes(user.platform_role || user.platformRole);
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Token requerido" });
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) return res.status(500).json({ error: "JWT_SECRET not configured" });
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
    const db = getDb();
    const user = db.prepare("SELECT * FROM users WHERE id = ? AND is_active = 1").get(decoded.userId) as any;
    if (!user) return res.status(401).json({ error: "Usuario invalido" });
    req.user = user;
    next();
  } catch { return res.status(401).json({ error: "Token invalido" }); }
};

export const requireTenant = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.headers["x-tenant-id"] as string;
    if (!tenantId) return res.status(400).json({ error: "Tenant ID requerido" });
    const db = getDb();
    const tenant = db.prepare("SELECT * FROM tenants WHERE id = ? AND is_active = 1").get(tenantId) as any;
    if (!tenant) return res.status(404).json({ error: "Empresa no encontrada" });
    const isPlatform = isPlatformStaff(req.user);
    const membership = db.prepare("SELECT * FROM tenant_memberships WHERE user_id=? AND tenant_id=? AND is_active=1").get(req.user?.id, tenantId) as any;
    if (!membership && !isPlatform) return res.status(403).json({ error: "Sin acceso a esta empresa" });
    // Check subscription status (platform admins bypass)
    if (!isPlatform) {
      const subStatus = tenant.subscription_status || 'trial';
      const subEnd    = tenant.subscription_end ? new Date(tenant.subscription_end) : null;
      // FIX P0 (Jun 2026): 'pending' (registro con plan pago pero checkout NO
      // completado) tenia subscription_end=NULL y nunca expiraba -> acceso
      // completo gratis e indefinido, ademas de evadir el anti-reuso de trial.
      // Ahora 'pending' se trata como no-activo: solo billing/auth/notifications
      // accesibles hasta que el webhook de Stripe lo marque 'active'.
      const isPending = subStatus === 'pending';
      const isExpired = subStatus === 'expired' || isPending || (subEnd && subEnd < new Date());
      if (isExpired) {
        // Whitelist: endpoints de billing y notificaciones SIEMPRE accesibles
        // aunque la suscripcion este expirada/pendiente, sino es imposible pagar.
        // Tambien /auth/* para que el user pueda revisar su estado y cerrar sesion.
        const url = req.originalUrl || req.url || '';
        const allowedWhenExpired = [
          '/api/billing/',
          '/api/auth/',
          '/api/notifications/',
        ];
        const isAllowed = allowedWhenExpired.some(p => url.startsWith(p));
        if (!isAllowed) {
          return res.status(402).json({
            error: isPending
              ? 'Completa el pago de tu suscripción para activar tu cuenta.'
              : 'Tu suscripción ha expirado. Contacta al administrador para renovarla.',
            code: isPending ? 'SUBSCRIPTION_PENDING' : 'SUBSCRIPTION_EXPIRED'
          });
        }
        // Marca para que el endpoint sepa que esta operando con suscripcion expirada/pendiente
        (req as any).subscriptionExpired = true;
      }
    }
    req.tenant = tenant;
    req.membership = membership;
    next();
  } catch (e) { next(e); }
};

export const requirePlatformAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!isPlatformStaff(req.user)) {
    return res.status(403).json({ error: "Requiere rol de administrador de plataforma" });
  }
  next();
};

// requirePermission checks TWO layers:
//   1. Plan feature gate: does the tenant's plan include the feature for this perm?
//   2. Role-based permissions: does the user's role grant this perm?
// Platform owners/admins bypass ALL checks.
export const requirePermission = (permKey: PermKey) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // Layer 0: Platform-level staff (owner por email) bypass everything.
    // 'admin' (rol de tenant) NO entra aquí: los dueños de empresa obtienen sus
    // permisos por sus roles de tenant (Layer 1/2), no por bypass de plataforma.
    if (isPlatformStaff(req.user)) return next();

    const membership = req.membership;
    if (!membership) return res.status(403).json({ error: "Sin membresia activa" });

    // Layer 1: Plan feature gate
    const db = getDb();
    const planRow = db.prepare(
      "SELECT p.features FROM tenants t LEFT JOIN plans p ON p.id = t.plan_id WHERE t.id = ?"
    ).get(req.tenant.id) as any;

    const planFeatures: string[] = (() => {
      try { return JSON.parse(planRow?.features || "[]"); } catch(_) { return []; }
    })();

    // Detect legacy format: if all features lack a dot, it's the old "loans"/"whatsapp" format
    const isLegacyFormat = planFeatures.length > 0 && planFeatures.every(f => !f.includes("."));
    
    // For legacy format or empty (no restrictions), allow. For new format, check exact match.
    if (planFeatures.length > 0 && !isLegacyFormat && !planFeatures.includes(permKey)) {
      return res.status(403).json({
        error: "Tu plan no incluye esta funcion. Actualiza tu plan para acceder.",
        code: "PLAN_FEATURE_REQUIRED",
        required_perm: permKey,
      });
    }

    // Layer 2: Role-based permission check
    const roles: string[] = (() => { try { return JSON.parse(membership.roles || "[]") } catch(_) { return [] } })();
    const explicit: Record<string,boolean> = (() => { try { return JSON.parse(membership.permissions || "{}") } catch(_) { return {} } })();

    const granted = computePermissions(roles, explicit, isLegacyFormat ? null : planFeatures);
    if (!granted.has(permKey)) {
      return res.status(403).json({
        error: "No tienes permiso para realizar esta accion",
        required: permKey
      });
    }
    next();
  };
};
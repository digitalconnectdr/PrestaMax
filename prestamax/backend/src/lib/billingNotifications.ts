// Avisos in-app persistentes de suscripcion/trial para owner/admin del tenant (y,
// en los eventos criticos, para el owner de la plataforma). Idempotentes: la clave
// de dedupe incluye el id de evento del proveedor (webhook-id de Whop) o, si no
// existe, una clave determinista; ademas cada punto de llamada emite SOLO en la
// transicion real de estado.
import { notifyTenantAdmins, notifyPlatformOwner } from './notify';

export type BillingEventKind =
  | 'subscription_activated'
  | 'subscription_renewed'
  | 'plan_changed'
  | 'payment_failed'
  | 'subscription_cancelled'
  | 'trial_expiring'
  | 'trial_expired';

interface Ctx {
  /** Id de evento del proveedor o clave determinista (obligatoria para dedupe). */
  key: string;
  planName?: string | null;
  daysLeft?: number;
  graceDays?: number;
}

const TENANT_TEXT: Record<BillingEventKind, (c: Ctx) => { title: string; msg: string }> = {
  subscription_activated: c => ({
    title: 'Suscripción activada',
    msg: `Tu suscripción${c.planName ? ` al plan ${c.planName}` : ''} está activa. Gracias por confiar en CredyTek.`,
  }),
  subscription_renewed: c => ({
    title: 'Suscripción renovada',
    msg: `Tu suscripción${c.planName ? ` al plan ${c.planName}` : ''} fue renovada.`,
  }),
  plan_changed: c => ({
    title: 'Tu plan cambió',
    msg: `Tu empresa ahora está en el plan ${c.planName || 'nuevo'}. Algunas funciones pueden haber cambiado; revisa Suscripción para ver el detalle.`,
  }),
  payment_failed: c => ({
    title: 'No pudimos procesar tu pago',
    msg: `El último cobro de tu suscripción falló. Tienes ${c.graceDays ?? 7} días de gracia para actualizar tu método de pago antes de que se bloquee el acceso.`,
  }),
  subscription_cancelled: () => ({
    title: 'Suscripción cancelada',
    msg: 'Tu suscripción fue cancelada. Puedes reactivarla en cualquier momento desde Suscripción.',
  }),
  trial_expiring: c => ({
    title: c.daysLeft === 0 ? 'Tu prueba gratis vence hoy'
      : c.daysLeft === 1 ? 'Tu prueba gratis vence mañana'
      : `Tu prueba gratis vence en ${c.daysLeft} días`,
    msg: 'Elige un plan antes de que termine para no perder el acceso a tus clientes, préstamos y pagos.',
  }),
  trial_expired: () => ({
    title: 'Tu prueba gratis terminó',
    msg: 'Tu acceso está en pausa. Elige un plan en Suscripción para reactivar tu cuenta; tus datos se conservan.',
  }),
};

/** Aviso persistente a owner/admin del tenant. Devuelve filas creadas. */
export function notifyTenantBilling(db: any, tenantId: string, kind: BillingEventKind, ctx: Ctx): number {
  const t = TENANT_TEXT[kind](ctx);
  return notifyTenantAdmins(db, tenantId, kind, t.title, t.msg, {
    entityType: 'subscription',
    dedupeKey: `billing:${kind}:${tenantId}:${ctx.key}`,
  });
}

const PLATFORM_KINDS: Partial<Record<BillingEventKind, string>> = {
  subscription_activated: 'Suscripción activada',
  payment_failed: 'Pago de suscripción fallido',
  subscription_cancelled: 'Suscripción cancelada',
};

/** Aviso al owner de la plataforma (solo activacion, pago fallido y cancelacion). */
export function notifyPlatformBilling(db: any, tenantId: string, kind: BillingEventKind, ctx: Ctx): number {
  const label = PLATFORM_KINDS[kind];
  if (!label) return 0;
  const row = db.prepare('SELECT name FROM tenants WHERE id=?').get(tenantId) as any;
  return notifyPlatformOwner(
    db, kind, `${label}: ${row?.name || 'empresa'}`,
    `${label}${ctx.planName ? ` (plan ${ctx.planName})` : ''} en la empresa ${row?.name || tenantId}.`,
    { entityType: 'subscription', entityId: tenantId, dedupeKey: `billing:${kind}:${tenantId}:${ctx.key}`, fallbackTenantId: tenantId },
  );
}

/** Tenant + plataforma (para eventos criticos). */
export function notifyBillingEvent(db: any, tenantId: string, kind: BillingEventKind, ctx: Ctx) {
  notifyTenantBilling(db, tenantId, kind, ctx);
  notifyPlatformBilling(db, tenantId, kind, ctx);
}

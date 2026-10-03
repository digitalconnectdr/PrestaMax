// whopService — integración de pagos con Whop (paralelo a stripeService).
// Cobro de suscripciones de CredyTek vía Whop Checkout + webhooks.
//
// Env vars (en Render):
//   WHOP_API_KEY          — clave API (Bearer) para crear checkout configurations
//   WHOP_WEBHOOK_SECRET   — secreto para verificar la firma de los webhooks
//
//   Plan_id de Whop por plan comercial (MENSUAL / ANUAL). Cada uno apunta a un
//   plan de Whop con el precio vigente de CredyTek:
//     WHOP_PLAN_STARTER        WHOP_PLAN_STARTER_ANNUAL
//     WHOP_PLAN_BASIC          WHOP_PLAN_BASIC_ANNUAL
//     WHOP_PLAN_PROFESSIONAL   WHOP_PLAN_PROFESSIONAL_ANNUAL
//     WHOP_PLAN_ENTERPRISE     WHOP_PLAN_ENTERPRISE_ANNUAL
//
// SIN fallbacks hardcodeados: si falta una env var, ese plan/periodo simplemente
// NO está disponible y el checkout falla de forma explícita. Nunca se usa otro
// plan_id ni se cobra un precio viejo por omisión. Las variables se leen al
// momento de usarse (no al importar el módulo).
import crypto from 'crypto';

export type BillingPeriod = 'monthly' | 'annual';

const WHOP_API_BASE = 'https://api.whop.com/api/v1';

// Slugs comerciales internos de CredyTek → nombre de las env vars de Whop.
export const WHOP_PLAN_ENV: Record<string, { monthly: string; annual: string }> = {
  starter:     { monthly: 'WHOP_PLAN_STARTER',      annual: 'WHOP_PLAN_STARTER_ANNUAL' },
  basico:      { monthly: 'WHOP_PLAN_BASIC',        annual: 'WHOP_PLAN_BASIC_ANNUAL' },
  profesional: { monthly: 'WHOP_PLAN_PROFESSIONAL', annual: 'WHOP_PLAN_PROFESSIONAL_ANNUAL' },
  enterprise:  { monthly: 'WHOP_PLAN_ENTERPRISE',   annual: 'WHOP_PLAN_ENTERPRISE_ANNUAL' },
};
export const WHOP_PLAN_SLUGS = Object.keys(WHOP_PLAN_ENV);

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

export function isWhopConfigured(): boolean {
  return !!(readEnv('WHOP_API_KEY') && readEnv('WHOP_WEBHOOK_SECRET'));
}

/** Nombre de la env var que debe contener el plan_id de Whop para ese plan/periodo. */
export function whopPlanEnvName(slug: string, billingPeriod: BillingPeriod = 'monthly'): string | null {
  const entry = WHOP_PLAN_ENV[slug?.toLowerCase()];
  return entry ? entry[billingPeriod] : null;
}

/** plan_id de Whop para el plan/periodo, o null si no está configurado (sin fallback). */
export function getWhopPlanIdForSlug(slug: string, billingPeriod: BillingPeriod = 'monthly'): string | null {
  const envName = whopPlanEnvName(slug, billingPeriod);
  return envName ? readEnv(envName) || null : null;
}

export function isWhopPlanConfigured(slug: string, billingPeriod: BillingPeriod = 'monthly'): boolean {
  return !!getWhopPlanIdForSlug(slug, billingPeriod);
}

export function isWhopAnnualConfigured(slug: string): boolean {
  return isWhopPlanConfigured(slug, 'annual');
}

export function getSlugForWhopPlanId(planId: string): { slug: string; billingPeriod: BillingPeriod } | null {
  if (!planId) return null;
  for (const slug of WHOP_PLAN_SLUGS) {
    if (getWhopPlanIdForSlug(slug, 'monthly') === planId) return { slug, billingPeriod: 'monthly' };
    if (getWhopPlanIdForSlug(slug, 'annual') === planId) return { slug, billingPeriod: 'annual' };
  }
  return null;
}

// Duración de respaldo cuando el evento de Whop NO trae la fecha real de
// renovación. Siempre se prefiere la fecha real de Whop. Mensual: duración
// mensual existente (31 días). Anual: ~12 meses (365 días); NUNCA +31 días.
export const FALLBACK_MONTHLY_DAYS = 31;
export const FALLBACK_ANNUAL_DAYS = 365;

/**
 * Fin de suscripción (ISO). `renewalTs` es la fecha real de Whop (epoch en
 * segundos, o fecha ISO/string). Si falta o es inválida, se usa el respaldo
 * según el periodo facturado.
 */
export function computeSubscriptionEnd(
  renewalTs: number | string | null | undefined,
  billingPeriod: BillingPeriod,
  nowMs: number = Date.now(),
): string {
  if (renewalTs !== null && renewalTs !== undefined && renewalTs !== '') {
    const d = new Date(typeof renewalTs === 'number' ? renewalTs * 1000 : renewalTs);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const days = billingPeriod === 'annual' ? FALLBACK_ANNUAL_DAYS : FALLBACK_MONTHLY_DAYS;
  return new Date(nowMs + days * 86400000).toISOString();
}

// Crea una "checkout configuration" en Whop con metadata (para vincular el pago
// al tenant correcto) y devuelve la purchase_url embebible / redirigible.
export async function createWhopCheckout(
  planId: string,
  metadata: Record<string, string>,
  redirectUrl: string,
): Promise<{ id: string; purchase_url: string }> {
  const resp = await fetch(`${WHOP_API_BASE}/checkout_configurations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${readEnv('WHOP_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    // company_id NO se envía: Whop lo infiere de la API key. Enviarlo devuelve
    // 400 "Cannot provide company_id for this configuration".
    body: JSON.stringify({
      plan_id: planId,
      metadata,
      redirect_url: redirectUrl,
      mode: 'payment',
    }),
  });
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Whop checkout error ${resp.status}: ${txt}`);
  }
  const data: any = await resp.json();
  return { id: data.id, purchase_url: data.purchase_url };
}

// Verifica la firma de un webhook de Whop (estándar Standard Webhooks) y
// devuelve el payload parseado. Lanza si la firma es inválida.
export function verifyWhopWebhook(rawBody: Buffer | string, headers: Record<string, any>): any {
  const id        = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const sigHeader = headers['webhook-signature'];
  if (!id || !timestamp || !sigHeader) throw new Error('Faltan headers de firma del webhook');

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const signedContent = `${id}.${timestamp}.${body}`;

  // El secret sigue el formato Standard Webhooks: "whsec_<base64>".
  let secret = readEnv('WHOP_WEBHOOK_SECRET') as string;
  if (!secret) throw new Error('WHOP_WEBHOOK_SECRET no configurado');
  if (secret.startsWith('whsec_')) secret = secret.slice(6);
  const secretBytes = Buffer.from(secret, 'base64');

  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  // El header puede traer varias firmas separadas por espacio: "v1,xxx v1,yyy".
  const provided = String(sigHeader).split(' ').map(s => s.split(',').pop() || '');
  const ok = provided.some(sig => {
    try {
      const a = Buffer.from(sig);
      const b = Buffer.from(expected);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch { return false; }
  });
  if (!ok) throw new Error('Firma de webhook inválida');

  return JSON.parse(body);
}

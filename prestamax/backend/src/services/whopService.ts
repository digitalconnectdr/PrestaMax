// whopService — integración de pagos con Whop (paralelo a stripeService).
// Cobro de suscripciones de CredyTek vía Whop Checkout + webhooks.
//
// Env vars (en Render):
//   WHOP_API_KEY          — clave API (Bearer) para crear checkout configurations
//   WHOP_WEBHOOK_SECRET   — secreto para verificar la firma de los webhooks
//   WHOP_COMPANY_ID       — id de la empresa en Whop (biz_...); default abajo
//   WHOP_PLAN_<SLUG>      — (opcional) override del plan_id por slug
import crypto from 'crypto';

const WHOP_API_KEY        = process.env.WHOP_API_KEY;
const WHOP_WEBHOOK_SECRET = process.env.WHOP_WEBHOOK_SECRET;
const WHOP_COMPANY_ID     = process.env.WHOP_COMPANY_ID || 'biz_o8VurTpfNIYuaT';
const WHOP_API_BASE       = 'https://api.whop.com/api/v1';

// Mapeo slug interno de CredyTek → plan_id de Whop. Overridable por env var.
const PLAN_IDS: Record<string, string> = {
  starter:     process.env.WHOP_PLAN_STARTER     || 'plan_2Cmi04mvXzWnL',
  basico:      process.env.WHOP_PLAN_BASICO      || 'plan_JObxA3GAZB29W',
  profesional: process.env.WHOP_PLAN_PROFESIONAL || 'plan_HMecfKZm5mPWT',
  enterprise:  process.env.WHOP_PLAN_ENTERPRISE  || 'plan_gXXCe0NicU98h',
};

export function isWhopConfigured(): boolean {
  return !!(WHOP_API_KEY && WHOP_WEBHOOK_SECRET);
}

export function getWhopPlanIdForSlug(slug: string): string | null {
  return PLAN_IDS[slug] || null;
}

export function getSlugForWhopPlanId(planId: string): string | null {
  for (const [slug, id] of Object.entries(PLAN_IDS)) {
    if (id === planId) return slug;
  }
  return null;
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
      Authorization: `Bearer ${WHOP_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      company_id: WHOP_COMPANY_ID,
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
  let secret = WHOP_WEBHOOK_SECRET as string;
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

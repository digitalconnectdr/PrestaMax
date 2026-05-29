// lemonSqueezyService — STUB / esqueleto para pasarela Lemon Squeezy.
//
// Estado: NO ACTIVO todavia. Se activa cuando:
//   1. Juan tenga su cuenta de LS configurada (ver LEMON_SQUEEZY_SETUP.md)
//   2. Esten todas las env vars LEMON_* en Render
//   3. Se complete la implementacion de las funciones marcadas con TODO
//
// Mientras tanto: el sistema usa el flujo manual de leads (plan_inquiries +
// activacion manual de tenant desde /admin).
//
// Una vez activo:
//   - createCheckout() devuelve URL de pago LS para que el prospecto pague
//   - handleWebhook() procesa eventos LS y activa/cancela subscripciones
//   - getSubscription() consulta estado actual via API LS
//
// Patron de import dinamico — no crashea si LEMON_API_KEY no esta configurada.

interface LemonConfig {
  apiKey: string;
  storeId: string;
  webhookSecret: string;
  variants: Record<string, string>;  // slug → variant_id
}

function getConfig(): LemonConfig | null {
  const apiKey = process.env.LEMON_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    storeId:      process.env.LEMON_STORE_ID || '',
    webhookSecret: process.env.LEMON_WEBHOOK_SECRET || '',
    variants: {
      starter:     process.env.LEMON_VARIANT_STARTER     || '',
      basico:      process.env.LEMON_VARIANT_BASICO      || '',
      profesional: process.env.LEMON_VARIANT_PROFESIONAL || '',
      enterprise:  process.env.LEMON_VARIANT_ENTERPRISE  || '',
    },
  };
}

export const LEMON_ENABLED = !!process.env.LEMON_API_KEY;

/**
 * TODO: crear un checkout session via API de Lemon Squeezy.
 *
 * Endpoint: POST https://api.lemonsqueezy.com/v1/checkouts
 * Docs: https://docs.lemonsqueezy.com/api/checkouts/create-checkout
 *
 * Devuelve la URL donde el prospecto completa el pago. Tras pagar,
 * Lemon hace POST a nuestro /api/billing/lemon-webhook con event=subscription_created.
 */
export async function createCheckout(params: {
  planSlug: string;          // 'starter' | 'basico' | 'profesional' | 'enterprise'
  tenantId?: string;         // si existe, vincula la suscripcion al tenant
  email: string;
  name: string;
}): Promise<{ url: string } | { error: string }> {
  const cfg = getConfig();
  if (!cfg) return { error: 'Lemon Squeezy no configurado (LEMON_API_KEY ausente)' };

  const variantId = cfg.variants[params.planSlug];
  if (!variantId) return { error: `Plan ${params.planSlug} no tiene variant ID configurada` };

  // TODO implementar:
  /*
  const resp = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email: params.email,
            name:  params.name,
            custom: { tenant_id: params.tenantId || '' },
          },
          product_options: {
            redirect_url: `${process.env.FRONTEND_URL}/billing?success=1`,
          },
        },
        relationships: {
          store:   { data: { type: 'stores',           id: cfg.storeId  } },
          variant: { data: { type: 'variants',         id: variantId    } },
        },
      },
    }),
  });
  const json = await resp.json();
  if (!resp.ok) return { error: json.errors?.[0]?.detail || 'LS API error' };
  return { url: json.data.attributes.url };
  */

  return { error: 'createCheckout no implementado todavia — ver LEMON_SQUEEZY_SETUP.md' };
}

/**
 * TODO: verificar firma HMAC del webhook y procesar el evento.
 *
 * Lemon envia POST con header 'X-Signature' = HMAC-SHA256(body, webhookSecret).
 * Eventos relevantes:
 *   - subscription_created          → activar tenant
 *   - subscription_updated          → actualizar plan
 *   - subscription_cancelled        → marcar tenant como cancelled
 *   - subscription_payment_success  → renovar subscription_end
 *   - subscription_payment_failed   → marcar past_due
 */
export async function handleWebhook(params: {
  rawBody: Buffer;
  signature: string;
}): Promise<{ ok: boolean; event?: string; error?: string }> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, error: 'no configurado' };

  // TODO: verificar firma
  /*
  const crypto = require('crypto');
  const expected = crypto.createHmac('sha256', cfg.webhookSecret)
    .update(params.rawBody)
    .digest('hex');
  if (expected !== params.signature) {
    return { ok: false, error: 'signature mismatch' };
  }

  const payload = JSON.parse(params.rawBody.toString('utf-8'));
  const event = payload.meta?.event_name;

  switch (event) {
    case 'subscription_created':
      // TODO: extraer email + custom.tenant_id + variant slug
      // TODO: activar tenant: UPDATE tenants SET subscription_status='active', plan_id=...
      break;
    case 'subscription_cancelled':
      // TODO: UPDATE tenants SET subscription_status='cancelled'
      break;
    // ... etc
  }
  return { ok: true, event };
  */

  return { ok: false, error: 'handleWebhook no implementado todavia' };
}

/**
 * TODO: consulta estado actual de una subscripcion via API LS.
 */
export async function getSubscription(subscriptionId: string): Promise<any> {
  const cfg = getConfig();
  if (!cfg) return null;
  // TODO: GET https://api.lemonsqueezy.com/v1/subscriptions/{id}
  return null;
}

/**
 * TODO: cancelar subscripcion.
 */
export async function cancelSubscription(subscriptionId: string): Promise<boolean> {
  const cfg = getConfig();
  if (!cfg) return false;
  // TODO: DELETE https://api.lemonsqueezy.com/v1/subscriptions/{id}
  return false;
}

export const LEMON_CONFIG_STATUS = {
  enabled: LEMON_ENABLED,
  storeConfigured: !!process.env.LEMON_STORE_ID,
  webhookConfigured: !!process.env.LEMON_WEBHOOK_SECRET,
  variantsConfigured: ['starter','basico','profesional','enterprise']
    .filter(s => !!process.env[`LEMON_VARIANT_${s.toUpperCase()}`])
    .length,
};

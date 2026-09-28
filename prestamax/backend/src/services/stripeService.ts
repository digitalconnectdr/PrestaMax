import Stripe from 'stripe';

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

export const stripe = STRIPE_KEY
  ? new Stripe(STRIPE_KEY, { apiVersion: '2024-12-18.acacia' as any })
  : (null as unknown as Stripe);

export function isStripeConfigured(): boolean {
  return !!STRIPE_KEY;
}

export type BillingPeriod = 'monthly' | 'annual';

const PRICE_ENV_BY_SLUG: Record<string, string> = {
  starter:      'STRIPE_PRICE_STARTER',
  basico:       'STRIPE_PRICE_BASICO',
  profesional:  'STRIPE_PRICE_PROFESIONAL',
  enterprise:   'STRIPE_PRICE_ENTERPRISE',
};

// Anuales (Fase 3): env var propia por plan, sin fallback — si no está
// configurada, esa anual simplemente no está disponible para checkout.
const PRICE_ENV_BY_SLUG_ANNUAL: Record<string, string> = {
  starter:      'STRIPE_PRICE_STARTER_ANNUAL',
  basico:       'STRIPE_PRICE_BASICO_ANNUAL',
  profesional:  'STRIPE_PRICE_PROFESIONAL_ANNUAL',
  enterprise:   'STRIPE_PRICE_ENTERPRISE_ANNUAL',
};

export function getPriceIdForPlanSlug(slug: string, billingPeriod: BillingPeriod = 'monthly'): string | null {
  const map = billingPeriod === 'annual' ? PRICE_ENV_BY_SLUG_ANNUAL : PRICE_ENV_BY_SLUG;
  const envName = map[slug?.toLowerCase()];
  if (!envName) return null;
  return process.env[envName] || null;
}

export function isStripeAnnualConfigured(slug: string): boolean {
  return !!getPriceIdForPlanSlug(slug, 'annual');
}

export function getSlugForPriceId(priceId: string): { slug: string; billingPeriod: BillingPeriod } | null {
  for (const [slug, envName] of Object.entries(PRICE_ENV_BY_SLUG)) {
    if (process.env[envName] === priceId) return { slug, billingPeriod: 'monthly' };
  }
  for (const [slug, envName] of Object.entries(PRICE_ENV_BY_SLUG_ANNUAL)) {
    if (process.env[envName] === priceId) return { slug, billingPeriod: 'annual' };
  }
  return null;
}

export interface CreateCheckoutInput {
  customerId?: string | null;
  customerEmail: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  tenantId: string;
  metadata?: Record<string, string>;
}

export async function createCheckoutSession(input: CreateCheckoutInput) {
  if (!stripe) throw new Error('Stripe no esta configurado en el servidor');
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: input.priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.tenantId,
    metadata: { tenant_id: input.tenantId, ...(input.metadata || {}) },
    subscription_data: {
      metadata: { tenant_id: input.tenantId },
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
  };
  if (input.customerId) {
    params.customer = input.customerId;
  } else {
    // En mode='subscription' Stripe crea el Customer automaticamente.
    // customer_creation solo aplica a mode='payment'.
    params.customer_email = input.customerEmail;
  }
  return stripe.checkout.sessions.create(params);
}

export async function createPortalSession(customerId: string, returnUrl: string) {
  if (!stripe) throw new Error('Stripe no esta configurado en el servidor');
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

export function constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
  if (!stripe) throw new Error('Stripe no esta configurado');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET no esta configurado');
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}

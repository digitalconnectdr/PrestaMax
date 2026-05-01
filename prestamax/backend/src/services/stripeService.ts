import Stripe from 'stripe';

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;

export const stripe = STRIPE_KEY
  ? new Stripe(STRIPE_KEY, { apiVersion: '2024-12-18.acacia' as any })
  : (null as unknown as Stripe);

export function isStripeConfigured(): boolean {
  return !!STRIPE_KEY;
}

// Mapping plan slug -> env var with the Stripe Price ID
const PRICE_ENV_BY_SLUG: Record<string, string> = {
  starter:      'STRIPE_PRICE_STARTER',
  basico:       'STRIPE_PRICE_BASICO',
  profesional:  'STRIPE_PRICE_PROFESIONAL',
  enterprise:   'STRIPE_PRICE_ENTERPRISE',
};

export function getPriceIdForPlanSlug(slug: string): string | null {
  const envName = PRICE_ENV_BY_SLUG[slug?.toLowerCase()];
  if (!envName) return null;
  return process.env[envName] || null;
}

export function getSlugForPriceId(priceId: string): string | null {
  for (const [slug, envName] of Object.entries(PRICE_ENV_BY_SLUG)) {
    if (process.env[envName] === priceId) return slug;
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
    params.customer_email = input.customerEmail;
    params.customer_creation = 'always';
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

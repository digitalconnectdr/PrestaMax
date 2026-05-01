import { Router, Request, Response } from 'express';
import express from 'express';
import { getDb } from '../db/database';
import { authenticate, AuthRequest, requireTenant } from '../middleware/auth';
import {
  stripe,
  isStripeConfigured,
  getPriceIdForPlanSlug,
  getSlugForPriceId,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
} from '../services/stripeService';

const router = Router();

const FRONTEND = () => process.env.FRONTEND_URL || 'http://localhost:5173';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing/plans — listado publico de planes con sus Price IDs de Stripe
// (Solo retorna planes que tienen Price ID configurado en env vars)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plans', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const plans = db.prepare(`
      SELECT id, name, slug, price_monthly, max_collectors, max_clients, max_users, trial_days, features, description
      FROM plans WHERE is_active=1 AND is_trial_default=0 ORDER BY price_monthly ASC
    `).all() as any[];
    const enriched = plans.map(p => ({
      ...p,
      stripe_price_id: getPriceIdForPlanSlug(p.slug),
      features: p.features ? JSON.parse(p.features) : [],
    })).filter(p => p.stripe_price_id); // solo los que tienen precio Stripe
    res.json(enriched);
  } catch (e) {
    console.error('billing/plans error:', e);
    res.status(500).json({ error: 'No se pudo cargar planes' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/checkout — crea Stripe Checkout Session, devuelve URL
// Body: { plan_slug: 'starter' | 'basico' | 'profesional' | 'enterprise' }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/checkout', authenticate, requireTenant, async (req: AuthRequest, res: Response) => {
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'Pagos no estan disponibles en este momento' });
  }
  try {
    const { plan_slug } = req.body;
    if (!plan_slug) return res.status(400).json({ error: 'plan_slug es requerido' });

    const priceId = getPriceIdForPlanSlug(plan_slug);
    if (!priceId) return res.status(400).json({ error: `Plan "${plan_slug}" no esta disponible para suscripcion` });

    const tenantId = req.tenant.id;
    const customerEmail = req.user!.email;

    const session = await createCheckoutSession({
      customerId: req.tenant.stripe_customer_id || null,
      customerEmail,
      priceId,
      tenantId,
      successUrl: `${FRONTEND()}/settings?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl:  `${FRONTEND()}/settings?stripe=cancel`,
      metadata: { plan_slug },
    });
    res.json({ url: session.url });
  } catch (e: any) {
    console.error('billing/checkout error:', e);
    res.status(500).json({ error: e.message || 'No se pudo iniciar el checkout' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/portal — crea Customer Portal Session, devuelve URL
// ─────────────────────────────────────────────────────────────────────────────
router.post('/portal', authenticate, requireTenant, async (req: AuthRequest, res: Response) => {
  if (!isStripeConfigured()) {
    return res.status(503).json({ error: 'Pagos no estan disponibles en este momento' });
  }
  try {
    const customerId = req.tenant.stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({ error: 'No tienes una suscripcion activa todavia. Suscribete primero.' });
    }
    const session = await createPortalSession(customerId, `${FRONTEND()}/settings?stripe=portal-return`);
    res.json({ url: session.url });
  } catch (e: any) {
    console.error('billing/portal error:', e);
    res.status(500).json({ error: e.message || 'No se pudo abrir el portal' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/billing/subscription — info de la suscripcion actual del tenant
// ─────────────────────────────────────────────────────────────────────────────
router.get('/subscription', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const t = db.prepare(`
      SELECT t.id, t.name, t.subscription_status, t.subscription_start, t.subscription_end,
             t.stripe_customer_id, t.stripe_subscription_id,
             p.id as plan_id, p.name as plan_name, p.slug as plan_slug, p.price_monthly
      FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.id=?
    `).get(req.tenant.id) as any;
    if (!t) return res.status(404).json({ error: 'No encontrado' });
    const trialDaysLeft = t.subscription_end
      ? Math.max(0, Math.ceil((new Date(t.subscription_end).getTime() - Date.now()) / 86400000))
      : null;
    res.json({
      ...t,
      has_payment_method: !!t.stripe_customer_id && !!t.stripe_subscription_id,
      trial_days_left: trialDaysLeft,
      is_trial: t.subscription_status === 'trial',
    });
  } catch (e) {
    res.status(500).json({ error: 'Error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/billing/webhook — endpoint que recibe eventos de Stripe
// IMPORTANTE: este endpoint usa raw body (mounted con express.raw)
// ─────────────────────────────────────────────────────────────────────────────
const webhookHandler = async (req: Request, res: Response) => {
  if (!isStripeConfigured()) return res.status(503).send('Stripe no configurado');

  const sig = req.headers['stripe-signature'] as string;
  if (!sig) return res.status(400).send('Falta firma de Stripe');

  let event;
  try {
    event = constructWebhookEvent(req.body, sig);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const db = getDb();

  try {
    switch (event.type) {
      // ── Pago exitoso del checkout: activar suscripcion ─────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        const tenantId = session.client_reference_id || session.metadata?.tenant_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        if (tenantId) {
          db.prepare(`UPDATE tenants
            SET stripe_customer_id=?, stripe_subscription_id=?, subscription_status='active',
                subscription_start=datetime('now'), updated_at=datetime('now')
            WHERE id=?`)
            .run(customerId, subscriptionId, tenantId);
          console.log(`[Stripe] Tenant ${tenantId} suscripcion activada (sub: ${subscriptionId})`);
        }
        break;
      }

      // ── Suscripcion actualizada (cambio de plan, renovacion, etc) ─────────
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as any;
        const tenantId = sub.metadata?.tenant_id;
        const status = sub.status; // active, past_due, canceled, unpaid, trialing
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
        const priceId = sub.items?.data?.[0]?.price?.id;
        const planSlug = priceId ? getSlugForPriceId(priceId) : null;
        let newPlanId: string | null = null;
        if (planSlug) {
          const planRow = db.prepare('SELECT id FROM plans WHERE slug=?').get(planSlug) as any;
          newPlanId = planRow?.id || null;
        }
        if (tenantId) {
          const localStatus = ['active', 'trialing'].includes(status) ? 'active'
            : status === 'past_due' ? 'expired'
            : status === 'canceled' ? 'cancelled'
            : 'expired';
          if (newPlanId) {
            db.prepare(`UPDATE tenants SET subscription_status=?, subscription_end=?, plan_id=?, updated_at=datetime('now') WHERE id=?`)
              .run(localStatus, periodEnd, newPlanId, tenantId);
          } else {
            db.prepare(`UPDATE tenants SET subscription_status=?, subscription_end=?, updated_at=datetime('now') WHERE id=?`)
              .run(localStatus, periodEnd, tenantId);
          }
          console.log(`[Stripe] Tenant ${tenantId} estado=${localStatus} hasta=${periodEnd}`);
        }
        break;
      }

      // ── Suscripcion cancelada o terminada ──────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;
        const tenantId = sub.metadata?.tenant_id;
        if (tenantId) {
          db.prepare(`UPDATE tenants SET subscription_status='cancelled', updated_at=datetime('now') WHERE id=?`)
            .run(tenantId);
          console.log(`[Stripe] Tenant ${tenantId} suscripcion cancelada`);
        }
        break;
      }

      // ── Pago fallido (tarjeta declinada) ──────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const customerId = invoice.customer as string;
        const tenant = db.prepare('SELECT id FROM tenants WHERE stripe_customer_id=?').get(customerId) as any;
        if (tenant) {
          db.prepare(`UPDATE tenants SET subscription_status='expired', updated_at=datetime('now') WHERE id=?`)
            .run(tenant.id);
          console.log(`[Stripe] Tenant ${tenant.id} pago fallido, suscripcion suspendida`);
        }
        break;
      }

      default:
        console.log(`[Stripe] Evento no manejado: ${event.type}`);
    }
    res.json({ received: true });
  } catch (e: any) {
    console.error('Error procesando webhook:', e);
    res.status(500).json({ error: 'Error interno' });
  }
};

// Exportamos el handler por separado para montarlo con raw body en index.ts
export { webhookHandler };
export default router;

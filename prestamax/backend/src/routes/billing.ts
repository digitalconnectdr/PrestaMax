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
// applyPlanChange — actualiza plan_id de un tenant y LIMPIA los permisos
// explicitos (tenant_memberships.permissions) que ya no esten incluidos en el
// nuevo plan. Esto previene que upgrades posteriores reactiven permisos viejos
// que el usuario perdio cuando hubo un downgrade.
// ─────────────────────────────────────────────────────────────────────────────
export function applyPlanChange(db: any, tenantId: string, newPlanId: string | null) {
  if (!newPlanId) return;
  const plan = db.prepare('SELECT features FROM plans WHERE id=?').get(newPlanId) as any;
  if (!plan) return;
  let features: string[] = [];
  try { features = JSON.parse(plan.features || '[]'); } catch (_) { features = []; }
  // Si el plan no tiene features definidas, no aplicamos ceiling (backward compat)
  if (features.length === 0) return;
  const featureSet = new Set(features);

  const memberships = db.prepare('SELECT id, permissions FROM tenant_memberships WHERE tenant_id=?').all(tenantId) as any[];
  for (const m of memberships) {
    let explicit: Record<string, boolean> = {};
    try { explicit = JSON.parse(m.permissions || '{}'); } catch (_) { continue; }
    let changed = false;
    for (const key of Object.keys(explicit)) {
      // Solo limpiar grants positivos (allowed=true) que el plan ya no permite
      if (explicit[key] && !featureSet.has(key)) {
        delete explicit[key];
        changed = true;
      }
    }
    if (changed) {
      db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?')
        .run(JSON.stringify(explicit), m.id);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Periodo de gracia tras un pago fallido. Stripe reintenta el cobro durante
// ~2 semanas (smart retries) antes de cancelar. NO suspendemos al primer fallo:
// damos GRACE_DAYS de margen para que el cliente arregle la tarjeta. Pasado ese
// plazo, requireTenant bloquea por fecha (subscription_end < hoy).
// FIX P2 (Jun 2026): antes invoice.payment_failed marcaba 'expired' al instante.
const PAST_DUE_GRACE_DAYS = 7;
function applyPastDueGrace(db: any, tenantId: string) {
  const t = db.prepare('SELECT subscription_end FROM tenants WHERE id=?').get(tenantId) as any;
  const graceEnd = new Date(Date.now() + PAST_DUE_GRACE_DAYS * 86400000).toISOString();
  // Conservar la fecha más lejana: si el cliente aún tiene periodo pagado vigente,
  // no la acortamos; si ya venció (o es null), aplicamos la gracia desde hoy.
  const existing = t?.subscription_end || null;
  const newEnd = existing && existing > graceEnd ? existing : graceEnd;
  db.prepare(`UPDATE tenants SET subscription_status='past_due', subscription_end=?, updated_at=datetime('now') WHERE id=?`)
    .run(newEnd, tenantId);
}

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
    // Devolver TODOS los planes activos. Si no hay Stripe configurado, el
    // frontend usa el flujo manual de solicitud (POST /billing/request-plan-change).
    const enriched = plans.map(p => ({
      ...p,
      stripe_price_id: getPriceIdForPlanSlug(p.slug),
      features: p.features ? JSON.parse(p.features) : [],
    }));
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
    const db = getDb();

    // ── Anti-doble-cobro: si el tenant ya tiene una suscripcion activa,
    //    no permitir crear un nuevo checkout. Para cambiar de plan debe usar
    //    el portal de Stripe (POST /api/billing/portal) que maneja prorateo
    //    automatico y NO cobra el plan completo dos veces.
    const tenantRow = db.prepare(`SELECT t.subscription_status, t.stripe_subscription_id, p.slug as current_plan_slug
      FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.id=?`).get(tenantId) as any;
    const hasActiveSubscription = tenantRow?.subscription_status === 'active' && !!tenantRow?.stripe_subscription_id;
    if (hasActiveSubscription) {
      // Si pide el mismo plan que ya tiene, no le dejamos pagar dos veces
      if (tenantRow.current_plan_slug === plan_slug) {
        return res.status(409).json({
          error: 'Ya tienes una suscripcion activa con este plan. No puedes pagarlo dos veces.',
          code: 'ALREADY_SUBSCRIBED',
          current_plan: tenantRow.current_plan_slug,
        });
      }
      // Si pide un plan distinto, redirigirlo al Customer Portal de Stripe
      return res.status(409).json({
        error: 'Ya tienes una suscripcion activa. Para cambiar de plan usa el Portal de Cliente para evitar cobros duplicados.',
        code: 'USE_CUSTOMER_PORTAL',
        current_plan: tenantRow.current_plan_slug,
        requested_plan: plan_slug,
      });
    }

    // Idempotency key: previene que un click duplicado (red lenta, doble tap)
    // cree dos sesiones de Stripe distintas para el mismo intento.
    // Stripe no creara una sesion duplicada con la misma key dentro de 24h.
    const idempotencyKey = `checkout-${tenantId}-${plan_slug}-${Math.floor(Date.now() / 60000)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND()}/settings?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${FRONTEND()}/settings?stripe=cancel`,
      client_reference_id: tenantId,
      metadata: { tenant_id: tenantId, plan_slug },
      subscription_data: { metadata: { tenant_id: tenantId, plan_slug } },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      ...(req.tenant.stripe_customer_id
        ? { customer: req.tenant.stripe_customer_id }
        : { customer_email: customerEmail }),
    }, { idempotencyKey });

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
          // Resolver el plan a partir del subscription line item (priceId)
          let newPlanId: string | null = null;
          try {
            if (subscriptionId && stripe) {
              const sub = await stripe.subscriptions.retrieve(subscriptionId);
              const priceId = sub.items?.data?.[0]?.price?.id;
              const planSlug = priceId ? getSlugForPriceId(priceId) : null;
              if (planSlug) {
                const planRow = db.prepare('SELECT id FROM plans WHERE slug=?').get(planSlug) as any;
                newPlanId = planRow?.id || null;
              }
            }
          } catch (e) { console.error('[Stripe] No se pudo resolver plan_id en checkout.completed:', e); }

          if (newPlanId) {
            db.prepare(`UPDATE tenants
              SET stripe_customer_id=?, stripe_subscription_id=?, subscription_status='active',
                  plan_id=?, subscription_start=datetime('now'), updated_at=datetime('now')
              WHERE id=?`)
              .run(customerId, subscriptionId, newPlanId, tenantId);
            // Limpiar permisos explicitos que el nuevo plan no permite
            applyPlanChange(db, tenantId, newPlanId);
          } else {
            db.prepare(`UPDATE tenants
              SET stripe_customer_id=?, stripe_subscription_id=?, subscription_status='active',
                  subscription_start=datetime('now'), updated_at=datetime('now')
              WHERE id=?`)
              .run(customerId, subscriptionId, tenantId);
          }
          console.log(`[Stripe] Tenant ${tenantId} suscripcion activada (sub: ${subscriptionId}, plan: ${newPlanId || 'unchanged'})`);
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
          // FIX P2 (Jun 2026): past_due NO suspende de inmediato — periodo de
          // gracia (Stripe reintenta ~2 semanas). El plan no cambia en este caso.
          if (status === 'past_due') {
            applyPastDueGrace(db, tenantId);
            console.log(`[Stripe] Tenant ${tenantId} pago atrasado (past_due) -> periodo de gracia ${PAST_DUE_GRACE_DAYS}d`);
            break;
          }
          const localStatus = ['active', 'trialing'].includes(status) ? 'active'
            : status === 'canceled' ? 'cancelled'
            : 'expired'; // unpaid / incomplete_expired / etc — Stripe ya agotó reintentos
          if (newPlanId) {
            // Verificar si es un cambio real de plan (upgrade o downgrade)
            const current = db.prepare('SELECT plan_id FROM tenants WHERE id=?').get(tenantId) as any;
            const planChanged = current?.plan_id !== newPlanId;

            db.prepare(`UPDATE tenants SET subscription_status=?, subscription_end=?, plan_id=?, updated_at=datetime('now') WHERE id=?`)
              .run(localStatus, periodEnd, newPlanId, tenantId);

            // Si hubo cambio de plan, limpiar permisos explicitos que el nuevo plan no permite
            if (planChanged) {
              applyPlanChange(db, tenantId, newPlanId);
              console.log(`[Stripe] Tenant ${tenantId} cambio plan ${current?.plan_id} -> ${newPlanId}, permisos limpiados`);
            }
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
          // Bajar al plan trial (mas restrictivo) para que el tenant no quede
          // con permisos de un plan pago al que ya no se le esta cobrando.
          const trialPlan = db.prepare('SELECT id FROM plans WHERE is_trial_default=1 LIMIT 1').get() as any;
          if (trialPlan?.id) {
            db.prepare(`UPDATE tenants SET subscription_status='cancelled', plan_id=?, updated_at=datetime('now') WHERE id=?`)
              .run(trialPlan.id, tenantId);
            applyPlanChange(db, tenantId, trialPlan.id);
          } else {
            db.prepare(`UPDATE tenants SET subscription_status='cancelled', updated_at=datetime('now') WHERE id=?`)
              .run(tenantId);
          }
          console.log(`[Stripe] Tenant ${tenantId} suscripcion cancelada -> plan trial`);
        }
        break;
      }

      // ── Pago fallido (tarjeta declinada) ──────────────────────────────────
      // FIX P2 (Jun 2026): NO suspender al primer fallo. Damos un periodo de
      // gracia (Stripe reintenta el cobro durante ~2 semanas). El bloqueo real
      // ocurre cuando vence la gracia (requireTenant) o cuando Stripe cancela
      // definitivamente (customer.subscription.deleted/updated -> unpaid/canceled).
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const customerId = invoice.customer as string;
        const tenant = db.prepare('SELECT id FROM tenants WHERE stripe_customer_id=?').get(customerId) as any;
        if (tenant) {
          applyPastDueGrace(db, tenant.id);
          console.log(`[Stripe] Tenant ${tenant.id} pago fallido -> periodo de gracia ${PAST_DUE_GRACE_DAYS}d (no suspendido aún)`);
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

// ─── POST /billing/request-plan-change ──────────────────────────────────────
// Tenant logueado solicita cambio/renovacion de plan. Crea un plan_inquiry
// con source='internal_renewal' para que aparezca en Admin Panel > Solicitudes.
// El owner de la app es notificado por la campanita (mismo flujo que landing).
router.post('/request-plan-change', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const { plan_slug, message } = req.body || {};
    if (!plan_slug || typeof plan_slug !== 'string') {
      return res.status(400).json({ error: 'Selecciona el plan que quieres solicitar.' });
    }
    const db = getDb();

    // Validar plan existe
    const plan = db.prepare('SELECT id, name, slug FROM plans WHERE slug=? AND is_active=1').get(plan_slug) as any;
    if (!plan) return res.status(400).json({ error: 'El plan seleccionado no existe o no esta disponible.' });

    // Datos del tenant y user para llenar el inquiry
    const tenant = db.prepare('SELECT id, name, phone, email, plan_id FROM tenants WHERE id=?').get(req.tenant!.id) as any;
    const user   = db.prepare('SELECT email, full_name, phone FROM users WHERE id=?').get((req as any).user.id) as any;
    const currentPlan = tenant?.plan_id
      ? (db.prepare('SELECT name FROM plans WHERE id=?').get(tenant.plan_id) as any)?.name || '-'
      : 'sin plan';

    const inqId = require('../db/database').uuid();
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket?.remoteAddress || '';
    const fullName = user?.full_name || user?.email || 'Usuario logueado';
    const whatsapp = user?.phone || tenant?.phone || '';
    const email    = user?.email || tenant?.email || '';
    const business = tenant?.name || '';
    const msg = `[SOLICITUD INTERNA] Plan actual: ${currentPlan}. Quiere cambiar a: ${plan.name}.${message ? '\nNota del cliente: ' + message : ''}`;

    db.prepare(`
      INSERT INTO plan_inquiries
        (id, full_name, business_name, whatsapp, email, country, plan_interest,
         portfolio_size, source, message, status, ip_address, user_agent,
         created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'new',?,?,datetime('now'),datetime('now'))
    `).run(
      inqId, fullName, business, whatsapp, email, 'DO', plan.slug,
      null, 'internal_renewal', msg, ip,
      (req.headers['user-agent'] as string || '').slice(0, 500),
    );

    // Notificacion campanita al owner (mismo patron que /public/plan-inquiry)
    try {
      const ownerEmail = (process.env.OWNER_USER_EMAIL || 'jcpenalo@gmail.com').toLowerCase();
      const platformAdmins = db.prepare(`
        SELECT u.id as user_id, tm.tenant_id
        FROM users u
        JOIN tenant_memberships tm ON tm.user_id = u.id AND tm.is_active = 1
        WHERE lower(u.email) = ? AND u.is_active = 1
      `).all(ownerEmail) as any[];
      const notifTitle = `Cambio de plan solicitado: ${business || fullName}`;
      const notifMsg = `${fullName} (${email}) quiere cambiar al plan ${plan.name}. Plan actual: ${currentPlan}.`;
      // Columnas reales de notifications: id, tenant_id, user_id, type, title,
      // message, entity_type, entity_id, is_read, created_at (NO existe 'link').
      const insertNotif = db.prepare(`
        INSERT INTO notifications (id, tenant_id, user_id, type, title, message, entity_type, entity_id, is_read, created_at)
        VALUES (?,?,?,?,?,?,?,?,0,datetime('now'))
      `);
      for (const a of platformAdmins) {
        try {
          insertNotif.run(
            require('../db/database').uuid(),
            a.tenant_id, a.user_id,
            'plan_inquiry', notifTitle, notifMsg,
            'plan_inquiry', inqId
          );
        } catch (notifErr: any) {
          console.error('[billing] notif insert fallo:', notifErr?.message || notifErr);
        }
      }
    } catch(_) {}

    try {
      db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description) VALUES (?,?,?,?,?,?,?,?)').run(
        require('../db/database').uuid(), req.tenant!.id, (req as any).user.id,
        (req as any).user.full_name || (req as any).user.email,
        'plan_change_requested', 'plan_inquiry', inqId,
        `Solicito cambio al plan ${plan.name}`
      );
    } catch(_) {}

    res.status(201).json({
      success: true,
      message: 'Solicitud enviada. Te contactaremos pronto para procesarla.',
      inquiry_id: inqId,
    });
  } catch (e: any) {
    console.error('POST /billing/request-plan-change error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── GET /billing/my-pending-request ─────────────────────────────────────────
// Indica si el tenant tiene una solicitud de cambio de plan pendiente
// (status='new' o 'contacted'). Para que el frontend muestre estado.
router.get('/my-pending-request', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const tenant = db.prepare('SELECT name FROM tenants WHERE id=?').get(req.tenant!.id) as any;
    if (!tenant) return res.json({ pending: null });
    const pending = db.prepare(`
      SELECT id, plan_interest, status, created_at, message
      FROM plan_inquiries
      WHERE source='internal_renewal' AND business_name=? AND status IN ('new','contacted')
      ORDER BY created_at DESC LIMIT 1
    `).get(tenant.name) as any;
    res.json({ pending: pending || null });
  } catch (e: any) {
    res.json({ pending: null });
  }
});

// Exportamos el handler por separado para montarlo con raw body en index.ts
export { webhookHandler };
export default router;

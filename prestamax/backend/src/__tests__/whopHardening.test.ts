// Hardening de Whop: validación del plan, doble suscripción, webhook de
// desactivación con membresía obsoleta, fechas de renovación (anual ≠ +31d),
// y env vars explícitas SIN fallbacks hardcodeados. NO llama a Whop real:
// api.whop.com se intercepta con un fetch simulado.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { bootTestApp, signWhopWebhook, TestApp } from './helpers/testApp';
import {
  WHOP_PLAN_ENV, getWhopPlanIdForSlug, getSlugForWhopPlanId, whopPlanEnvName,
  isWhopAnnualConfigured, computeSubscriptionEnd, FALLBACK_ANNUAL_DAYS, FALLBACK_MONTHLY_DAYS,
} from '../services/whopService';

const SECRET = 'whsec_' + Buffer.from('test-whop-webhook-secret').toString('base64');
const PLAN_ENVS = Object.values(WHOP_PLAN_ENV).flatMap(e => [e.monthly, e.annual]);
const setPlanEnvs = (vals: Record<string, string | undefined>) => {
  for (const k of PLAN_ENVS) delete process.env[k];
  for (const [k, v] of Object.entries(vals)) if (v) process.env[k] = v;
};

let app: TestApp;
const realFetch = globalThis.fetch;
const whopCalls: { url: string; body: any }[] = [];

beforeAll(async () => {
  process.env.WHOP_API_KEY = 'test-api-key';
  process.env.WHOP_WEBHOOK_SECRET = SECRET;
  app = await bootTestApp();
  // Intercepta SOLO api.whop.com; el resto (nuestra propia API local) pasa al fetch real.
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url || input);
    if (url.startsWith('https://api.whop.com')) {
      whopCalls.push({ url, body: JSON.parse(init?.body || '{}') });
      return new Response(JSON.stringify({ id: 'cfg_1', purchase_url: 'https://whop.test/checkout/abc' }), { status: 200 });
    }
    return realFetch(input, init);
  }) as any;
});
afterAll(async () => { globalThis.fetch = realFetch; await app.close(); });
afterEach(() => { setPlanEnvs({}); whopCalls.length = 0; });

const checkout = (t: { token: string; tenantId: string }, body: any) =>
  app.req('POST', '/api/billing/whop-checkout', { token: t.token, tenantId: t.tenantId, body });

const webhook = async (payload: any) => {
  const raw = JSON.stringify(payload);
  return app.req('POST', '/api/billing/whop-webhook', { body: Buffer.from(raw), headers: signWhopWebhook(raw, SECRET) });
};
const tenantRow = (id: string) => app.db.prepare('SELECT * FROM tenants WHERE id=?').get(id) as any;
const planSlugOf = (tenantId: string) => (app.db.prepare('SELECT p.slug FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.id=?').get(tenantId) as any)?.slug;

describe('env vars de planes de Whop: explícitas y SIN fallbacks', () => {
  it('usa exactamente los nombres de env solicitados', () => {
    expect(WHOP_PLAN_ENV).toEqual({
      starter:     { monthly: 'WHOP_PLAN_STARTER',      annual: 'WHOP_PLAN_STARTER_ANNUAL' },
      basico:      { monthly: 'WHOP_PLAN_BASIC',        annual: 'WHOP_PLAN_BASIC_ANNUAL' },
      profesional: { monthly: 'WHOP_PLAN_PROFESSIONAL', annual: 'WHOP_PLAN_PROFESSIONAL_ANNUAL' },
      enterprise:  { monthly: 'WHOP_PLAN_ENTERPRISE',   annual: 'WHOP_PLAN_ENTERPRISE_ANNUAL' },
    });
    expect(whopPlanEnvName('basico', 'annual')).toBe('WHOP_PLAN_BASIC_ANNUAL');
  });

  it('sin env var NO hay plan_id (no existe fallback a IDs viejos)', () => {
    setPlanEnvs({});
    for (const s of Object.keys(WHOP_PLAN_ENV)) {
      expect(getWhopPlanIdForSlug(s, 'monthly')).toBeNull();
      expect(isWhopAnnualConfigured(s)).toBe(false);
    }
    expect(getSlugForWhopPlanId('plan_2Cmi04mvXzWnL')).toBeNull();     // ID viejo hardcodeado: ya no se reconoce
  });

  it('los nombres viejos (WHOP_PLAN_BASICO / WHOP_PLAN_PROFESIONAL) NO se leen', () => {
    setPlanEnvs({});
    process.env.WHOP_PLAN_BASICO = 'plan_old_basico';
    process.env.WHOP_PLAN_PROFESIONAL = 'plan_old_pro';
    expect(getWhopPlanIdForSlug('basico')).toBeNull();
    expect(getWhopPlanIdForSlug('profesional')).toBeNull();
    delete process.env.WHOP_PLAN_BASICO; delete process.env.WHOP_PLAN_PROFESIONAL;
  });

  it('resuelve slug y periodo desde el plan_id configurado', () => {
    setPlanEnvs({ WHOP_PLAN_BASIC: 'plan_b_m', WHOP_PLAN_BASIC_ANNUAL: 'plan_b_a', WHOP_PLAN_ENTERPRISE: 'plan_e_m' });
    expect(getSlugForWhopPlanId('plan_b_m')).toEqual({ slug: 'basico', billingPeriod: 'monthly' });
    expect(getSlugForWhopPlanId('plan_b_a')).toEqual({ slug: 'basico', billingPeriod: 'annual' });
    expect(getSlugForWhopPlanId('plan_e_m')).toEqual({ slug: 'enterprise', billingPeriod: 'monthly' });
    expect(getSlugForWhopPlanId('desconocido')).toBeNull();
  });
});

describe('POST /billing/whop-checkout', () => {
  it('plan inexistente o no comercial → 400 PLAN_NOT_AVAILABLE (sin llamar a Whop)', async () => {
    setPlanEnvs({ WHOP_PLAN_STARTER: 'plan_s_m' });
    const t = app.createTenant({ planSlug: 'starter', status: 'trial' });
    for (const slug of ['no-existe', 'trial', 'premium', '']) {
      const r = await checkout(t, { plan_slug: slug, billing_period: 'monthly' });
      expect(r.status, slug).toBe(400);
      if (slug) expect(r.body.code).toBe('PLAN_NOT_AVAILABLE');
    }
    expect(whopCalls).toHaveLength(0);
  });

  it('plan inactivo → 400 PLAN_NOT_AVAILABLE aunque exista la env var', async () => {
    setPlanEnvs({ WHOP_PLAN_BASIC: 'plan_b_m' });
    const t = app.createTenant({ planSlug: 'starter', status: 'trial' });
    app.db.prepare("UPDATE plans SET is_active=0 WHERE slug='basico'").run();
    const r = await checkout(t, { plan_slug: 'basico', billing_period: 'monthly' });
    app.db.prepare("UPDATE plans SET is_active=1 WHERE slug='basico'").run();
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('PLAN_NOT_AVAILABLE');
    expect(whopCalls).toHaveLength(0);
  });

  it('el slug se normaliza (mayúsculas/espacios) pero no se confía en el cliente', async () => {
    setPlanEnvs({ WHOP_PLAN_BASIC: 'plan_b_m' });
    const t = app.createTenant({ planSlug: 'starter', status: 'trial' });
    const r = await checkout(t, { plan_slug: '  BASICO ', billing_period: 'monthly' });
    expect(r.status).toBe(200);
    expect(whopCalls[0].body.plan_id).toBe('plan_b_m');
    expect(whopCalls[0].body.metadata.plan_slug).toBe('basico');
  });

  it('anual sin env var falla explícitamente (ANNUAL_NOT_CONFIGURED) y NO cae al mensual', async () => {
    setPlanEnvs({ WHOP_PLAN_BASIC: 'plan_b_m' });                       // mensual SÍ, anual NO
    const t = app.createTenant({ planSlug: 'starter', status: 'trial' });
    const r = await checkout(t, { plan_slug: 'basico', billing_period: 'annual' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('ANNUAL_NOT_CONFIGURED');
    expect(whopCalls).toHaveLength(0);
  });

  it('mensual sin env var falla de forma segura (PLAN_NOT_CONFIGURED), sin usar otro plan ni ID viejo', async () => {
    setPlanEnvs({});
    const t = app.createTenant({ planSlug: 'starter', status: 'trial' });
    const r = await checkout(t, { plan_slug: 'profesional', billing_period: 'monthly' });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('PLAN_NOT_CONFIGURED');
    expect(whopCalls).toHaveLength(0);
  });

  it('con env configurada crea el checkout con el plan_id correcto y el periodo anual', async () => {
    setPlanEnvs({ WHOP_PLAN_PROFESSIONAL: 'plan_p_m', WHOP_PLAN_PROFESSIONAL_ANNUAL: 'plan_p_a' });
    const t = app.createTenant({ planSlug: 'starter', status: 'trial' });
    const r = await checkout(t, { plan_slug: 'profesional', billing_period: 'annual' });
    expect(r.status).toBe(200);
    expect(r.body.url).toBe('https://whop.test/checkout/abc');
    expect(whopCalls[0].body.plan_id).toBe('plan_p_a');
    expect(whopCalls[0].body.metadata).toMatchObject({ tenant_id: t.tenantId, plan_slug: 'profesional', billing_period: 'annual' });
  });

  it('doble suscripción: con una suscripción Whop vigente responde 409 ACTIVE_SUBSCRIPTION y no crea otra compra', async () => {
    setPlanEnvs({ WHOP_PLAN_PROFESSIONAL: 'plan_p_m' });
    const t = app.createTenant({ planSlug: 'basico', status: 'active', whopMembershipId: 'mem_current' });
    const r = await checkout(t, { plan_slug: 'profesional', billing_period: 'monthly' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('ACTIVE_SUBSCRIPTION');
    expect(whopCalls).toHaveLength(0);
    // también en gracia (past_due) con membresía y periodo vigente
    app.db.prepare("UPDATE tenants SET subscription_status='past_due' WHERE id=?").run(t.tenantId);
    expect((await checkout(t, { plan_slug: 'profesional', billing_period: 'monthly' })).body.code).toBe('ACTIVE_SUBSCRIPTION');
  });

  it('si la suscripción ya venció (o no hay membresía) SÍ permite volver a comprar', async () => {
    setPlanEnvs({ WHOP_PLAN_PROFESSIONAL: 'plan_p_m' });
    const expired = app.createTenant({ planSlug: 'basico', status: 'active', whopMembershipId: 'mem_old', subscriptionEnd: new Date(Date.now() - 86400000).toISOString() });
    // vencida por fecha → requireTenant la deja pasar por /api/billing/
    expect((await checkout(expired, { plan_slug: 'profesional', billing_period: 'monthly' })).status).toBe(200);
    const manual = app.createTenant({ planSlug: 'basico', status: 'active', whopMembershipId: null });
    expect((await checkout(manual, { plan_slug: 'profesional', billing_period: 'monthly' })).status).toBe(200);
  });
});

describe('webhook de Whop', () => {
  it('rechaza firmas inválidas', async () => {
    const raw = JSON.stringify({ type: 'membership.went_valid', data: {} });
    const r = await app.req('POST', '/api/billing/whop-webhook', { body: Buffer.from(raw), headers: signWhopWebhook(raw, 'whsec_' + Buffer.from('otro').toString('base64')) });
    expect(r.status).toBe(400);
  });

  it('activación: usa el plan_id REAL de Whop sobre la metadata y registra la membresía', async () => {
    setPlanEnvs({ WHOP_PLAN_BASIC: 'plan_b_m', WHOP_PLAN_PROFESSIONAL: 'plan_p_m' });
    const t = app.createTenant({ planSlug: 'starter', status: 'pending', subscriptionEnd: null });
    const renewal = Math.floor((Date.now() + 28 * 86400000) / 1000);
    await webhook({ type: 'membership.went_valid', data: {
      id: 'mem_A', plan_id: 'plan_p_m', renewal_period_end: renewal,
      metadata: { tenant_id: t.tenantId, plan_slug: 'basico', billing_period: 'monthly' },
    } });
    const row = tenantRow(t.tenantId);
    expect(planSlugOf(t.tenantId)).toBe('profesional');                  // manda el plan_id, no la metadata
    expect(row.subscription_status).toBe('active');
    expect(row.whop_membership_id).toBe('mem_A');
    expect(new Date(row.subscription_end).getTime()).toBe(renewal * 1000); // fecha REAL de Whop
  });

  it('desactivación de una membresía VIEJA no cancela la suscripción actual', async () => {
    const t = app.createTenant({ planSlug: 'profesional', status: 'active', whopMembershipId: 'mem_new' });
    await webhook({ type: 'membership.went_invalid', data: { id: 'mem_old', metadata: { tenant_id: t.tenantId } } });
    const row = tenantRow(t.tenantId);
    expect(row.subscription_status).toBe('active');
    expect(planSlugOf(t.tenantId)).toBe('profesional');
    expect(row.whop_membership_id).toBe('mem_new');
  });

  it('desactivación de la membresía ACTUAL sí cancela y baja al plan trial', async () => {
    const t = app.createTenant({ planSlug: 'profesional', status: 'active', whopMembershipId: 'mem_cur' });
    await webhook({ type: 'membership.deactivated', data: { id: 'mem_cur', metadata: { tenant_id: t.tenantId } } });
    expect(tenantRow(t.tenantId).subscription_status).toBe('cancelled');
    expect(planSlugOf(t.tenantId)).toBe('trial');
  });

  it('desactivación sin id de membresía, o sin membresía registrada, no cancela', async () => {
    const a = app.createTenant({ planSlug: 'basico', status: 'active', whopMembershipId: 'mem_x' });
    await webhook({ type: 'membership.went_invalid', data: { metadata: { tenant_id: a.tenantId } } });
    expect(tenantRow(a.tenantId).subscription_status).toBe('active');
    const b = app.createTenant({ planSlug: 'basico', status: 'active', whopMembershipId: null });
    await webhook({ type: 'membership.went_invalid', data: { id: 'mem_unknown', metadata: { tenant_id: b.tenantId } } });
    expect(tenantRow(b.tenantId).subscription_status).toBe('active');
  });

  it('desactivación localizando el tenant por whop_membership_id (sin metadata) funciona', async () => {
    const t = app.createTenant({ planSlug: 'basico', status: 'active', whopMembershipId: 'mem_by_id' });
    await webhook({ type: 'membership.went_invalid', data: { id: 'mem_by_id' } });
    expect(tenantRow(t.tenantId).subscription_status).toBe('cancelled');
  });

  it('pago fallido de una membresía distinta de la actual NO pone la suscripción vigente en gracia', async () => {
    const t = app.createTenant({ planSlug: 'basico', status: 'active', whopMembershipId: 'mem_cur2' });
    await webhook({ type: 'payment.failed', data: { membership: { id: 'mem_old2' }, metadata: { tenant_id: t.tenantId } } });
    expect(tenantRow(t.tenantId).subscription_status).toBe('active');
    await webhook({ type: 'payment.failed', data: { membership: { id: 'mem_cur2' }, metadata: { tenant_id: t.tenantId } } });
    expect(tenantRow(t.tenantId).subscription_status).toBe('past_due');
  });

  it('payment_succeeded guarda el id de la MEMBRESÍA anidada, no el id del pago', async () => {
    const t = app.createTenant({ planSlug: 'starter', status: 'pending', subscriptionEnd: null });
    await webhook({ type: 'payment.succeeded', data: {
      id: 'pay_123', membership: { id: 'mem_nested' }, metadata: { tenant_id: t.tenantId, plan_slug: 'basico', billing_period: 'monthly' },
    } });
    expect(tenantRow(t.tenantId).whop_membership_id).toBe('mem_nested');
    // un pago posterior sin membresía no borra el id registrado
    await webhook({ type: 'payment.succeeded', data: { id: 'pay_124', metadata: { tenant_id: t.tenantId, plan_slug: 'basico', billing_period: 'monthly' } } });
    expect(tenantRow(t.tenantId).whop_membership_id).toBe('mem_nested');
  });

  it('fallback de fecha: anual ≈ 365 días (NUNCA 31); mensual ≈ 31 días', async () => {
    const annual = app.createTenant({ planSlug: 'starter', status: 'pending', subscriptionEnd: null });
    const monthly = app.createTenant({ planSlug: 'starter', status: 'pending', subscriptionEnd: null });
    const t0 = Date.now();
    await webhook({ type: 'membership.went_valid', data: { id: 'mem_ann', metadata: { tenant_id: annual.tenantId, plan_slug: 'basico', billing_period: 'annual' } } });
    await webhook({ type: 'membership.went_valid', data: { id: 'mem_mon', metadata: { tenant_id: monthly.tenantId, plan_slug: 'basico', billing_period: 'monthly' } } });
    const days = (id: string) => (new Date(tenantRow(id).subscription_end).getTime() - t0) / 86400000;
    expect(days(annual.tenantId)).toBeGreaterThan(364);
    expect(days(annual.tenantId)).toBeLessThan(366);
    expect(days(monthly.tenantId)).toBeGreaterThan(30);
    expect(days(monthly.tenantId)).toBeLessThan(32);
    expect(tenantRow(annual.tenantId).billing_cycle).toBe('annual');
  });

  it('prefiere SIEMPRE la fecha real de Whop también en anual', async () => {
    const t = app.createTenant({ planSlug: 'starter', status: 'pending', subscriptionEnd: null });
    const real = '2027-09-15T12:00:00.000Z';
    await webhook({ type: 'membership.went_valid', data: { id: 'mem_real', renewal_period_end: real, metadata: { tenant_id: t.tenantId, plan_slug: 'basico', billing_period: 'annual' } } });
    expect(tenantRow(t.tenantId).subscription_end).toBe(real);
  });

  it('ignora slugs que no son planes comerciales (p. ej. trial) en la metadata', async () => {
    const t = app.createTenant({ planSlug: 'starter', status: 'pending', subscriptionEnd: null });
    await webhook({ type: 'membership.went_valid', data: { id: 'mem_t', metadata: { tenant_id: t.tenantId, plan_slug: 'trial', billing_period: 'monthly' } } });
    expect(planSlugOf(t.tenantId)).toBe('starter');                      // el plan no cambió a 'trial'
  });
});

describe('computeSubscriptionEnd (unitario)', () => {
  const NOW = Date.UTC(2026, 0, 1);
  it('usa la fecha real (epoch en segundos o ISO)', () => {
    expect(computeSubscriptionEnd(1800000000, 'annual', NOW)).toBe(new Date(1800000000 * 1000).toISOString());
    expect(computeSubscriptionEnd('2027-01-01T00:00:00Z', 'monthly', NOW)).toBe('2027-01-01T00:00:00.000Z');
  });
  it('respaldo por periodo', () => {
    expect(computeSubscriptionEnd(null, 'monthly', NOW)).toBe(new Date(NOW + FALLBACK_MONTHLY_DAYS * 86400000).toISOString());
    expect(computeSubscriptionEnd(undefined, 'annual', NOW)).toBe(new Date(NOW + FALLBACK_ANNUAL_DAYS * 86400000).toISOString());
    expect(computeSubscriptionEnd('fecha-invalida', 'annual', NOW)).toBe(new Date(NOW + 365 * 86400000).toISOString());
    expect(FALLBACK_ANNUAL_DAYS).toBe(365);
    expect(FALLBACK_MONTHLY_DAYS).toBe(31);
  });
});

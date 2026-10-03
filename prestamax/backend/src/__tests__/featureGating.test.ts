// Gating REAL por plan (techo sobre los permisos del rol) a través de la API,
// solicitudes públicas con entitlement + suscripción vigente, y Admin → Planes
// (max_active_loans y límites en 0).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootTestApp, TestApp } from './helpers/testApp';
import crypto from 'crypto';

let app: TestApp;
beforeAll(async () => {
  process.env.OWNER_USER_EMAIL = 'platform-owner@test.local';
  app = await bootTestApp();
});
afterAll(async () => { await app.close(); });

const get = (t: { token: string; tenantId: string }, url: string) => app.req('GET', url, { token: t.token, tenantId: t.tenantId });
const blockedByPlan = (r: { status: number; body: any }) => r.status === 403 && r.body?.code === 'PLAN_FEATURE_REQUIRED';

describe('gating por plan vía API', () => {
  it('Starter: sin promesas, tareas, contratos, WhatsApp, sucursales, solicitudes, inversionistas ni reportes avanzados', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    for (const url of [
      '/api/collections/promises', '/api/collection-tasks', '/api/settings/branches',
      '/api/loan-requests', '/api/investors', '/api/reports/advanced', '/api/reports/datacredito',
    ]) expect(blockedByPlan(await get(t, url)), url).toBe(true);
    expect(blockedByPlan(await app.req('POST', '/api/loans/bulk-import', { token: t.token, tenantId: t.tenantId, body: { loans: [] } }))).toBe(true);
  });

  it('Starter conserva cobranza básica, préstamos, pagos y reportes básicos', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    for (const url of ['/api/collections/loans', '/api/loans', '/api/clients', '/api/payments']) {
      const r = await get(t, url);
      expect(blockedByPlan(r), url).toBe(false);
      expect(r.status, url).toBe(200);
    }
  });

  it('Básico: SÍ promesas, tareas, CSV y reportes avanzados; NO sucursales, solicitudes ni inversionistas', async () => {
    const t = app.createTenant({ planSlug: 'basico' });
    for (const url of ['/api/collections/promises', '/api/collection-tasks', '/api/reports/advanced']) {
      expect(blockedByPlan(await get(t, url)), url).toBe(false);
    }
    // CSV: el endpoint pasa el gate de plan (400 por lote vacío, no 403 de plan).
    const csv = await app.req('POST', '/api/loans/bulk-import', { token: t.token, tenantId: t.tenantId, body: { loans: [] } });
    expect(blockedByPlan(csv)).toBe(false);
    expect(csv.status).toBe(400);
    for (const url of ['/api/settings/branches', '/api/loan-requests', '/api/investors', '/api/reports/datacredito'])
      expect(blockedByPlan(await get(t, url)), url).toBe(true);
  });

  it('Profesional: sucursales, solicitudes e inversionistas disponibles; sin DataCrédito', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    for (const url of ['/api/settings/branches', '/api/loan-requests', '/api/investors', '/api/reports/advanced'])
      expect(blockedByPlan(await get(t, url)), url).toBe(false);
    expect(blockedByPlan(await get(t, '/api/reports/datacredito'))).toBe(true);
  });

  it('Enterprise conserva DataCrédito', async () => {
    const t = app.createTenant({ planSlug: 'enterprise' });
    expect(blockedByPlan(await get(t, '/api/reports/datacredito'))).toBe(false);
  });

  it('el tenant en Trial tiene features de Starter (sin solicitudes ni promesas)', async () => {
    const trialPlan = app.db.prepare("SELECT id FROM plans WHERE id='plan-trial'").get() as any;
    const t = app.createTenant({ planId: trialPlan.id, status: 'trial' });
    expect(blockedByPlan(await get(t, '/api/loan-requests'))).toBe(true);
    expect(blockedByPlan(await get(t, '/api/collections/promises'))).toBe(true);
    expect((await get(t, '/api/loans')).status).toBe(200);
  });
});

describe('solicitudes públicas — POST /public/apply/:token', () => {
  const IMG = 'data:image/png;base64,' + 'A'.repeat(200);
  const body = { clientName: 'Cliente Público', clientPhone: '809-555-1234', idFrontImage: IMG, idBackImage: IMG };
  const withToken = (tenantId: string) => {
    const token = crypto.randomUUID();
    app.db.prepare('UPDATE tenants SET public_token=? WHERE id=?').run(token, tenantId);
    return token;
  };
  const apply = (token: string) => app.req('POST', `/api/public/apply/${token}`, { body });
  const requestsCount = (tenantId: string) => (app.db.prepare('SELECT COUNT(*) c FROM loan_requests WHERE tenant_id=?').get(tenantId) as any).c;

  it('Profesional con suscripción vigente: acepta la solicitud', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    const r = await apply(withToken(t.tenantId));
    expect(r.status).toBe(201);
    expect(requestsCount(t.tenantId)).toBe(1);
  });

  it('un enlace viejo de un plan SIN entitlement requests.* no permite saltarse el plan (Starter, Básico, Trial)', async () => {
    for (const slug of ['starter', 'basico']) {
      const t = app.createTenant({ planSlug: slug });
      const tok = withToken(t.tenantId);
      const r = await apply(tok);
      expect(r.status, slug).toBe(403);
      expect(r.body.code).toBe('PUBLIC_REQUESTS_UNAVAILABLE');
      expect(requestsCount(t.tenantId)).toBe(0);
      expect((await app.req('GET', `/api/public/apply/${tok}`)).status).toBe(403);
    }
    const trial = app.createTenant({ planId: 'plan-trial', status: 'trial' });
    expect((await apply(withToken(trial.tenantId))).status).toBe(403);
  });

  it('suscripción vencida, pendiente o expirada: bloqueado aunque el plan tenga el entitlement', async () => {
    const expired = app.createTenant({ planSlug: 'profesional', subscriptionEnd: new Date(Date.now() - 86400000).toISOString() });
    const pending = app.createTenant({ planSlug: 'profesional', status: 'pending', subscriptionEnd: null });
    const statusExpired = app.createTenant({ planSlug: 'profesional', status: 'expired' });
    for (const t of [expired, pending, statusExpired]) {
      const r = await apply(withToken(t.tenantId));
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('PUBLIC_REQUESTS_UNAVAILABLE');
      expect(requestsCount(t.tenantId)).toBe(0);
    }
  });

  it('token inexistente sigue siendo 404', async () => {
    expect((await apply('no-existe')).status).toBe(404);
  });
});

describe('Admin → Planes: max_active_loans y límites en 0', () => {
  const platformToken = () => {
    let id = (app.db.prepare("SELECT id FROM users WHERE email='platform-owner@test.local'").get() as any)?.id;
    if (!id) {
      id = crypto.randomUUID();
      app.db.prepare(`INSERT INTO users (id,email,password_hash,full_name,is_active,platform_role) VALUES (?,?,?,?,1,'none')`)
        .run(id, 'platform-owner@test.local', 'x', 'Platform Owner');
    }
    return app.tokenFor(id);
  };
  const row = (id: string) => app.db.prepare('SELECT * FROM plans WHERE id=?').get(id) as any;

  it('crear: 0 se guarda como 0 (NO ilimitado) y -1/omitido = ilimitado; incluye max_active_loans', async () => {
    const r = await app.req('POST', '/api/admin/plans', { token: platformToken(), body: {
      name: 'Cero', slug: 'cero', price_monthly: 5, max_collectors: 0, max_clients: 0, max_users: 0, max_active_loans: 0, features: '[]',
    } });
    expect(r.status).toBe(201);
    const p = row(r.body.id);
    expect([p.max_collectors, p.max_clients, p.max_users, p.max_active_loans]).toEqual([0, 0, 0, 0]);

    const r2 = await app.req('POST', '/api/admin/plans', { token: platformToken(), body: { name: 'Libre', slug: 'libre', price_monthly: 5, features: '[]' } });
    const p2 = row(r2.body.id);
    expect([p2.max_collectors, p2.max_clients, p2.max_users, p2.max_active_loans]).toEqual([-1, -1, -1, -1]);
  });

  it('actualizar: edita max_active_loans, 0 es válido y -1 = ilimitado; sin el campo = sin cambio', async () => {
    const starter = app.db.prepare("SELECT id FROM plans WHERE slug='starter'").get() as any;
    const tk = platformToken();
    let r = await app.req('PUT', `/api/admin/plans/${starter.id}`, { token: tk, body: { max_active_loans: 150 } });
    expect(r.status).toBe(200);
    expect(row(starter.id).max_active_loans).toBe(150);
    await app.req('PUT', `/api/admin/plans/${starter.id}`, { token: tk, body: { max_active_loans: 0 } });
    expect(row(starter.id).max_active_loans).toBe(0);
    await app.req('PUT', `/api/admin/plans/${starter.id}`, { token: tk, body: { price_monthly: 9.99 } });
    expect(row(starter.id).max_active_loans).toBe(0);                 // omitido: sin cambio
    await app.req('PUT', `/api/admin/plans/${starter.id}`, { token: tk, body: { max_active_loans: -1 } });
    expect(row(starter.id).max_active_loans).toBe(-1);
    r = await app.req('PUT', `/api/admin/plans/${starter.id}`, { token: tk, body: { max_users: 'abc' } });
    expect(r.status).toBe(400);
    await app.req('PUT', `/api/admin/plans/${starter.id}`, { token: tk, body: { max_active_loans: 100 } });
    expect(row(starter.id).max_active_loans).toBe(100);
  });

  it('un plan con límite 0 bloquea de verdad (0 no es ilimitado)', async () => {
    const r = await app.req('POST', '/api/admin/plans', { token: platformToken(), body: {
      name: 'Cero2', slug: 'cero2', price_monthly: 5, max_active_loans: 0, features: '[]',
    } });
    const t = app.createTenant({ planId: r.body.id });
    const [pending] = app.fillLoans(t.tenantId, 1, 'approved');
    const d = await app.req('POST', `/api/loans/${pending}/disburse`, { token: t.token, tenantId: t.tenantId, body: {} });
    expect(d.status).toBe(403);
    expect(d.body.code).toBe('PLAN_LIMIT_ACTIVE_LOANS');
  });

  it('GET /billing/plans y /public/plans exponen max_active_loans', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    const b = await app.req('GET', '/api/billing/plans');
    expect(b.body.find((p: any) => p.slug === 'starter').max_active_loans).toBe(100);
    const pub = await app.req('GET', '/api/public/plans');
    expect(pub.body.find((p: any) => p.slug === 'enterprise').max_active_loans).toBe(-1);
    expect(t.tenantId).toBeTruthy();
  });
});

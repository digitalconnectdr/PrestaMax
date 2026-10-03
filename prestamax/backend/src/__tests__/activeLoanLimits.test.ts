// Límite comercial de préstamos activos: definición única, enforcement en los
// 4 puntos de entrada (disburse, consolidate, bulk-import, convert de solicitud
// pública) y política de downgrade (nunca borrar; solo bloquear lo nuevo).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootTestApp, insertTestPlan, TestApp } from './helpers/testApp';
import { PROFESIONAL_FEATURES } from '../db/planCatalog';
import { countActiveLoans, checkActiveLoanLimit, ACTIVE_LOAN_STATUSES } from '../lib/planLimits';
import crypto from 'crypto';

let app: TestApp;
beforeAll(async () => { app = await bootTestApp(); });
afterAll(async () => { await app.close(); });

const disburse = (t: { token: string; tenantId: string }, loanId: string) =>
  app.req('POST', `/api/loans/${loanId}/disburse`, { token: t.token, tenantId: t.tenantId, body: {} });
const status = (id: string) => (app.db.prepare('SELECT status FROM loans WHERE id=?').get(id) as any).status;

describe('definición única de préstamo activo', () => {
  it('cuentan active, in_mora y disbursed (legacy); NO cuentan los demás estados', () => {
    expect([...ACTIVE_LOAN_STATUSES].sort()).toEqual(['active', 'disbursed', 'in_mora']);
    const t = app.createTenant({ planSlug: 'starter' });
    for (const st of ['active', 'in_mora', 'disbursed']) app.fillLoans(t.tenantId, 2, st);
    for (const st of ['draft', 'under_review', 'approved', 'rejected', 'paid', 'cancelled', 'voided', 'written_off', 'restructured'])
      app.fillLoans(t.tenantId, 3, st);
    expect(countActiveLoans(app.db, t.tenantId)).toBe(6);
  });

  it('aísla por tenant', () => {
    const a = app.createTenant({ planSlug: 'starter' });
    const b = app.createTenant({ planSlug: 'starter' });
    app.fillLoans(a.tenantId, 5, 'active');
    expect(countActiveLoans(app.db, b.tenantId)).toBe(0);
  });

  it('delta <= 0 nunca bloquea y un tenant sin plan es ilimitado', () => {
    const t = app.createTenant({ planSlug: 'starter' });
    app.fillLoans(t.tenantId, 150, 'active');                    // ya excede el límite de 100
    expect(checkActiveLoanLimit(app.db, t.tenantId, 0)).toBeNull();
    expect(checkActiveLoanLimit(app.db, t.tenantId, -1)).toBeNull();
    expect(checkActiveLoanLimit(app.db, t.tenantId, 1)?.code).toBe('PLAN_LIMIT_ACTIVE_LOANS');
    app.db.prepare('UPDATE tenants SET plan_id=NULL WHERE id=?').run(t.tenantId);
    expect(checkActiveLoanLimit(app.db, t.tenantId, 1)).toBeNull();
  });
});

describe('disburse — Starter (límite 100)', () => {
  it('99 → 100 permitido; 100 → 101 bloqueado con PLAN_LIMIT_ACTIVE_LOANS', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    app.fillLoans(t.tenantId, 99, 'active');
    const [l100, l101] = app.fillLoans(t.tenantId, 2, 'approved');

    const ok = await disburse(t, l100);
    expect(ok.status).toBe(200);
    expect(status(l100)).toBe('active');
    expect(countActiveLoans(app.db, t.tenantId)).toBe(100);

    const blocked = await disburse(t, l101);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PLAN_LIMIT_ACTIVE_LOANS');
    expect(blocked.body.limit).toBe(100);
    expect(status(l101)).toBe('approved');                       // no se tocó
    expect(countActiveLoans(app.db, t.tenantId)).toBe(100);
  });

  it('in_mora cuenta para el límite', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    app.fillLoans(t.tenantId, 60, 'active');
    app.fillLoans(t.tenantId, 40, 'in_mora');                    // 100 entre active + in_mora
    const [pending] = app.fillLoans(t.tenantId, 1, 'approved');
    const r = await disburse(t, pending);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PLAN_LIMIT_ACTIVE_LOANS');
  });

  it('paid, approved y cancelled NO cuentan: se puede desembolsar con 99 activos aunque haya cientos de otros estados', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    app.fillLoans(t.tenantId, 99, 'active');
    app.fillLoans(t.tenantId, 150, 'paid');
    app.fillLoans(t.tenantId, 150, 'cancelled');
    app.fillLoans(t.tenantId, 150, 'approved');
    const [pending] = app.fillLoans(t.tenantId, 1, 'approved');
    expect((await disburse(t, pending)).status).toBe(200);
  });

  it('crear/aprobar préstamos (draft/approved) NO se bloquea aunque el tenant esté al límite', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    app.fillLoans(t.tenantId, 100, 'active');
    const clientId = app.createClient(t.tenantId);
    const productId = app.createProduct(t.tenantId);
    const r = await app.req('POST', '/api/loans', { token: t.token, tenantId: t.tenantId, body: {
      client_id: clientId, product_id: productId, requested_amount: 5000, term: 6,
    } });
    expect(r.status).toBe(201);
  });
});

describe('disburse — Enterprise (-1) nunca bloquea', () => {
  it('desembolsa con 150 activos', async () => {
    const t = app.createTenant({ planSlug: 'enterprise' });
    app.fillLoans(t.tenantId, 150, 'active');
    const [pending] = app.fillLoans(t.tenantId, 1, 'approved');
    expect((await disburse(t, pending)).status).toBe(200);
  });
});

describe('consolidate', () => {
  it('es neutro/reductor (N activos → 1 activo): permitido incluso estando al límite o por encima', async () => {
    const planId = insertTestPlan(app.db, { slug: 'pro-cap3', features: PROFESIONAL_FEATURES, maxActiveLoans: 3 });
    const t = app.createTenant({ planId });
    const clientId = app.createClient(t.tenantId);
    const [a, b, c] = app.fillLoans(t.tenantId, 3, 'active', clientId);   // al límite (3/3)
    for (const id of [a, b, c]) app.db.prepare('UPDATE loans SET principal_balance=1000, total_balance=1000 WHERE id=?').run(id);
    const productId = app.createProduct(t.tenantId);
    const r = await app.req('POST', '/api/loans/consolidate', { token: t.token, tenantId: t.tenantId, body: {
      loan_ids: [a, b], product_id: productId, rate: 5, term: 6,
    } });
    expect(r.status).toBe(201);
    expect(status(a)).toBe('restructured');
    expect(status(b)).toBe('restructured');
    expect(countActiveLoans(app.db, t.tenantId)).toBe(2);                 // c + el consolidado
  });

  it('el delta de consolidar se evalúa con la regla única (1 nuevo - N que salen)', () => {
    const planId = insertTestPlan(app.db, { slug: 'pro-cap1', features: PROFESIONAL_FEATURES, maxActiveLoans: 1 });
    const t = app.createTenant({ planId });
    app.fillLoans(t.tenantId, 1, 'active');
    expect(checkActiveLoanLimit(app.db, t.tenantId, 1)?.code).toBe('PLAN_LIMIT_ACTIVE_LOANS');   // alta neta +1: bloquea
    expect(checkActiveLoanLimit(app.db, t.tenantId, 1 - 2)).toBeNull();                          // consolidar 2 → 1: no bloquea
  });
});

describe('bulk-import (CSV)', () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({
    client_name: `Importado ${i + 1} Apellido`, client_phone: `809-555-${1000 + i}`, client_id_number: `IMP-${crypto.randomUUID().slice(0, 8)}`,
    loan_amount: '1000', interest_rate: '5', term_months: '6', payment_frequency: 'monthly',
  }));

  it('corta el lote exactamente en el límite: importa lo que cabe y reporta el resto', async () => {
    const planId = insertTestPlan(app.db, { slug: 'basic-cap5', features: PROFESIONAL_FEATURES, maxActiveLoans: 5 });
    const t = app.createTenant({ planId });
    app.fillLoans(t.tenantId, 3, 'active');                              // quedan 2 cupos
    const r = await app.req('POST', '/api/loans/bulk-import', { token: t.token, tenantId: t.tenantId, body: { loans: rows(4) } });
    expect(r.status).toBe(200);
    expect(r.body.summary.created).toBe(2);
    expect(r.body.summary.limit_reached).toBe(true);
    const blocked = r.body.results.filter((x: any) => x.code === 'PLAN_LIMIT_ACTIVE_LOANS');
    expect(blocked).toHaveLength(2);
    expect(countActiveLoans(app.db, t.tenantId)).toBe(5);
    // lo existente permanece
    expect((app.db.prepare("SELECT COUNT(*) c FROM loans WHERE tenant_id=?").get(t.tenantId) as any).c).toBe(5);
  });

  it('si el lote completo queda bloqueado responde 403 PLAN_LIMIT_ACTIVE_LOANS y no importa nada', async () => {
    const planId = insertTestPlan(app.db, { slug: 'basic-cap2', features: PROFESIONAL_FEATURES, maxActiveLoans: 2 });
    const t = app.createTenant({ planId });
    app.fillLoans(t.tenantId, 2, 'active');
    const r = await app.req('POST', '/api/loans/bulk-import', { token: t.token, tenantId: t.tenantId, body: { loans: rows(3) } });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PLAN_LIMIT_ACTIVE_LOANS');
    expect(countActiveLoans(app.db, t.tenantId)).toBe(2);
  });

  it('Enterprise importa sin bloqueo', async () => {
    const t = app.createTenant({ planSlug: 'enterprise' });
    app.fillLoans(t.tenantId, 120, 'active');
    const r = await app.req('POST', '/api/loans/bulk-import', { token: t.token, tenantId: t.tenantId, body: { loans: rows(3) } });
    expect(r.status).toBe(200);
    expect(r.body.summary.created).toBe(3);
    expect(r.body.summary.limit_reached).toBe(false);
  });
});

describe('convert de solicitud pública', () => {
  const makeRequest = (tenantId: string, idNumber: string) => {
    const id = crypto.randomUUID();
    app.db.prepare(`INSERT INTO loan_requests (id,tenant_id,client_name,client_phone,id_number,loan_amount,loan_term,status)
      VALUES (?,?,?,?,?,?,?, 'approved')`).run(id, tenantId, 'Solicitante Prueba', '809-555-0000', idNumber, 3000, 6);
    return id;
  };

  it('bloquea cuando crearía un activo por encima del límite, SIN crear el cliente', async () => {
    const planId = insertTestPlan(app.db, { slug: 'pro-cap2', features: PROFESIONAL_FEATURES, maxActiveLoans: 2 });
    const t = app.createTenant({ planId });
    app.fillLoans(t.tenantId, 2, 'active');
    const productId = app.createProduct(t.tenantId);
    const reqId = makeRequest(t.tenantId, 'REQ-LIMIT-1');
    const clientsBefore = (app.db.prepare('SELECT COUNT(*) c FROM clients WHERE tenant_id=?').get(t.tenantId) as any).c;
    const r = await app.req('PUT', `/api/loan-requests/${reqId}/convert`, { token: t.token, tenantId: t.tenantId, body: { product_id: productId, rate: 5, term: 6 } });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PLAN_LIMIT_ACTIVE_LOANS');
    expect((app.db.prepare('SELECT COUNT(*) c FROM clients WHERE tenant_id=?').get(t.tenantId) as any).c).toBe(clientsBefore);
    expect(countActiveLoans(app.db, t.tenantId)).toBe(2);
  });

  it('permite convertir con cupo disponible', async () => {
    const planId = insertTestPlan(app.db, { slug: 'pro-cap3b', features: PROFESIONAL_FEATURES, maxActiveLoans: 3 });
    const t = app.createTenant({ planId });
    app.fillLoans(t.tenantId, 2, 'active');
    const productId = app.createProduct(t.tenantId);
    const reqId = makeRequest(t.tenantId, 'REQ-LIMIT-2');
    const r = await app.req('PUT', `/api/loan-requests/${reqId}/convert`, { token: t.token, tenantId: t.tenantId, body: { product_id: productId, rate: 5, term: 6 } });
    expect(r.status).toBeLessThan(300);
    expect(countActiveLoans(app.db, t.tenantId)).toBe(3);
  });
});

describe('downgrade con exceso de préstamos activos (1,200 → límite 500)', () => {
  it('conserva todo, sigue operando lo existente y solo bloquea nuevas activaciones', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    const clientId = app.createClient(t.tenantId);
    // Un préstamo real, desembolsado por la API (con cuotas), + 1,199 de relleno = 1,200 activos.
    const [real] = app.fillLoans(t.tenantId, 1, 'approved', clientId);
    expect((await disburse(t, real)).status).toBe(200);
    const filler = app.fillLoans(t.tenantId, 1199, 'active', clientId);
    expect(countActiveLoans(app.db, t.tenantId)).toBe(1200);
    const total = (app.db.prepare('SELECT COUNT(*) c FROM loans WHERE tenant_id=?').get(t.tenantId) as any).c;

    // Downgrade a Básico (500).
    app.setPlan(t.tenantId, 'basico');

    // Nada se borra ni se desactiva.
    expect(countActiveLoans(app.db, t.tenantId)).toBe(1200);
    expect((app.db.prepare('SELECT COUNT(*) c FROM loans WHERE tenant_id=?').get(t.tenantId) as any).c).toBe(total);

    // Lo existente sigue visible y operable.
    const list = await app.req('GET', '/api/loans?status=active&limit=5', { token: t.token, tenantId: t.tenantId });
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1200);
    const detail = await app.req('GET', `/api/loans/${real}`, { token: t.token, tenantId: t.tenantId });
    expect(detail.status).toBe(200);
    const pay = await app.req('POST', '/api/payments', { token: t.token, tenantId: t.tenantId, body: { loan_id: real, amount: 100, payment_method: 'cash' } });
    expect(pay.status).toBeLessThan(300);

    // Nuevas activaciones bloqueadas.
    const [next] = app.fillLoans(t.tenantId, 1, 'approved', clientId);
    const blocked = await disburse(t, next);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PLAN_LIMIT_ACTIVE_LOANS');
    expect(status(next)).toBe('approved');

    // Aún con 501 activos (<= 500 no se cumple) sigue bloqueado: se libera cerrando préstamos.
    app.db.prepare(`UPDATE loans SET status='paid' WHERE id IN (${filler.slice(0, 700).map(() => '?').join(',')})`).run(...filler.slice(0, 700));
    expect(countActiveLoans(app.db, t.tenantId)).toBe(500);
    expect((await disburse(t, next)).status).toBe(403);                  // 500 + 1 > 500
    app.db.prepare('UPDATE loans SET status=? WHERE id=?').run('paid', filler[700]);
    expect(countActiveLoans(app.db, t.tenantId)).toBe(499);
    expect((await disburse(t, next)).status).toBe(200);                  // 499 + 1 = 500 permitido
    expect(countActiveLoans(app.db, t.tenantId)).toBe(500);
  });

  it('upgrade vuelve a permitir activaciones', async () => {
    const t = app.createTenant({ planSlug: 'basico' });
    app.fillLoans(t.tenantId, 500, 'active');
    const [next] = app.fillLoans(t.tenantId, 1, 'approved');
    expect((await disburse(t, next)).status).toBe(403);
    app.setPlan(t.tenantId, 'profesional');
    expect((await disburse(t, next)).status).toBe(200);
  });
});

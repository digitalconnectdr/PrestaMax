// Flujo administrativo de cambio de plan y renovación manual, con applyPlanChange REAL
// (ya sin require() circular): notificaciones al tenant correcto, sin duplicados, sin
// tocar otros tenants, y entitlements/permisos coherentes con el plan. BD temporal.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { bootTestApp, TestApp } from './helpers/testApp';

const uid = () => crypto.randomUUID();
let app: TestApp;
let platform: { id: string; token: string };

beforeAll(async () => {
  process.env.OWNER_USER_EMAIL = 'platform-owner@test.local';
  app = await bootTestApp();
  const pid = uid();
  app.db.prepare(`INSERT INTO users (id,email,password_hash,full_name,is_active,platform_role) VALUES (?,?,?,?,1,'none')`)
    .run(pid, 'platform-owner@test.local', 'x', 'Platform Owner');
  platform = { id: pid, token: app.tokenFor(pid) };
});
afterAll(async () => { await app.close(); });

const planId = (slug: string) => (app.db.prepare('SELECT id FROM plans WHERE slug=?').get(slug) as any).id as string;
const planName = (slug: string) => (app.db.prepare('SELECT name FROM plans WHERE slug=?').get(slug) as any).name as string;
const changePlan = (tenantId: string, slug: string) =>
  app.req('PUT', `/api/admin/tenants/${tenantId}`, { token: platform.token, body: { plan_id: planId(slug) } });
const rows = (userId: string, type: string) =>
  app.db.prepare('SELECT * FROM notifications WHERE user_id=? AND type=?').all(userId, type) as any[];
const permsOf = (membershipId: string) =>
  JSON.parse((app.db.prepare('SELECT permissions FROM tenant_memberships WHERE id=?').get(membershipId) as any).permissions || '{}');
const effective = async (token: string) =>
  ((await app.req('GET', '/api/auth/me', { token })).body.tenants[0].effectivePermissions as string[]);

// Permisos explícitos históricos: dos concesiones (una Profesional+, otra Básico+) y una revocación.
const HISTORIC = { 'payments.edit': true, 'reports.scheduled': true, 'clients.view': false };

function world() {
  const A = app.createTenant({ planSlug: 'starter' });
  const B = app.createTenant({ planSlug: 'starter' });
  const adminA = app.addMember(A.tenantId, ['admin']);
  const cobradorA = app.addMember(A.tenantId, ['cobrador']);
  const adminB = app.addMember(B.tenantId, ['admin']);
  return { A, B, adminA, cobradorA, adminB };
}

describe('applyPlanChange ya es importable y testeable', () => {
  it('vive en lib/planChange (sin require circular en admin.ts); billing lo re-exporta sin duplicar lógica', async () => {
    const SRC = path.resolve(__dirname, '..');
    expect(fs.readFileSync(path.join(SRC, 'routes/admin.ts'), 'utf8')).not.toMatch(/require\(['"]\.\/billing['"]\)/);
    expect(fs.readFileSync(path.join(SRC, 'routes/admin.ts'), 'utf8')).toMatch(/from '\.\.\/lib\/planChange'/);
    const pc = await import('../lib/planChange');
    const billing = await import('../routes/billing');
    expect(billing.applyPlanChange).toBe(pc.applyPlanChange);
    // sin plan nuevo o con plan inexistente: no hace nada ni lanza
    const w = world();
    expect(() => pc.applyPlanChange(app.db, w.A.tenantId, null)).not.toThrow();
    expect(() => pc.applyPlanChange(app.db, w.A.tenantId, 'plan-que-no-existe')).not.toThrow();
  });
});

describe('cambios de plan desde el panel de administración', () => {
  it('Starter → Básico → Profesional → downgrade a Starter: notificaciones, entitlements y permisos explícitos', async () => {
    const { A, B, adminA, cobradorA, adminB } = world();
    const loansBefore = app.fillLoans(A.tenantId, 2, 'active').length;
    // permisos explícitos históricos del cobrador: uno fuera del plan Starter y una revocación
    const cobMembership = cobradorA.membershipId;
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run(JSON.stringify(HISTORIC), cobMembership);
    expect((await effective(A.token)).length).toBe(27);
    expect((await app.req('GET', '/api/whatsapp', { token: A.token, tenantId: A.tenantId })).body.code).toBe('PLAN_FEATURE_REQUIRED');

    // 1) Starter → Básico
    expect((await changePlan(A.tenantId, 'basico')).status).toBe(200);
    expect((app.db.prepare('SELECT plan_id FROM tenants WHERE id=?').get(A.tenantId) as any).plan_id).toBe(planId('basico'));
    expect((await effective(A.token)).length).toBe(50);
    expect((await app.req('GET', '/api/whatsapp', { token: A.token, tenantId: A.tenantId })).status).toBe(200);
    // Los grants NO se borran: payments.edit (fuera de Básico) queda almacenado pero inefectivo;
    // reports.scheduled es efectivo en Básico; la revocación de clients.view se conserva.
    expect(permsOf(cobMembership)).toEqual(HISTORIC);
    const inBasic = await effective(cobradorA.token);
    expect(inBasic).not.toContain('payments.edit');
    expect(inBasic).toContain('reports.scheduled');
    expect(inBasic).not.toContain('clients.view');
    for (const u of [A.ownerId, adminA.userId]) {
      const n = rows(u, 'plan_changed');
      expect(n).toHaveLength(1);
      expect(n[0].message).toContain(planName('basico'));
      expect(n[0].entity_type).toBe('subscription');
      expect(n[0].required_permission).toBeNull();
    }
    expect(rows(cobradorA.userId, 'plan_changed')).toHaveLength(0);

    // 2) Básico → Profesional
    expect((await changePlan(A.tenantId, 'profesional')).status).toBe(200);
    expect((await effective(A.token)).length).toBe(68);
    expect(rows(A.ownerId, 'plan_changed')).toHaveLength(2);
    expect(rows(adminA.userId, 'plan_changed').map(r => r.message).some(m => m.includes(planName('profesional')))).toBe(true);
    // al volver a un plan que lo incluye, el grant histórico vuelve a ser EFECTIVO (sin reasignarlo)
    expect(permsOf(cobMembership)).toEqual(HISTORIC);
    const inPro = await effective(cobradorA.token);
    expect(inPro).toContain('payments.edit');
    expect(inPro).toContain('reports.scheduled');
    expect(inPro).not.toContain('clients.view');   // la revocación explícita sigue vigente

    // repetir el MISMO plan no produce otro aviso ni cambia nada
    expect((await changePlan(A.tenantId, 'profesional')).status).toBe(200);
    expect(rows(A.ownerId, 'plan_changed')).toHaveLength(2);

    // 3) downgrade Profesional → Starter
    expect((await changePlan(A.tenantId, 'starter')).status).toBe(200);
    expect((await effective(A.token)).length).toBe(27);
    expect((await app.req('GET', '/api/whatsapp', { token: A.token, tenantId: A.tenantId })).body.code).toBe('PLAN_FEATURE_REQUIRED');
    // downgrade: NADA se borra; los grants fuera de Starter quedan almacenados pero inefectivos
    expect(permsOf(cobMembership)).toEqual(HISTORIC);
    const inStarter = await effective(cobradorA.token);
    expect(inStarter).not.toContain('payments.edit');
    expect(inStarter).not.toContain('reports.scheduled');
    expect(inStarter).not.toContain('clients.view');
    // y vuelven a ser efectivos si el tenant regresa a Profesional (sin tocar nada más)
    expect((await changePlan(A.tenantId, 'profesional')).status).toBe(200);
    const backInPro = await effective(cobradorA.token);
    expect(backInPro).toContain('payments.edit');
    expect(backInPro).toContain('reports.scheduled');
    expect(backInPro).not.toContain('clients.view');
    expect((await changePlan(A.tenantId, 'starter')).status).toBe(200);
    expect(permsOf(cobMembership)).toEqual(HISTORIC); // tras todo el ida y vuelta, el histórico sigue intacto
    expect(rows(A.ownerId, 'plan_changed')).toHaveLength(5); // basico, profesional, starter, profesional, starter
    expect(rows(adminA.userId, 'plan_changed')).toHaveLength(5);
    expect(new Set(rows(A.ownerId, 'plan_changed').map(r => r.dedupe_key)).size).toBe(5); // claves distintas, sin duplicados
    expect(rows(A.ownerId, 'plan_changed')[0].message).toBeTruthy();

    // los datos del tenant no se tocaron: miembros, préstamos, suscripción
    expect((app.db.prepare('SELECT COUNT(*) c FROM tenant_memberships WHERE tenant_id=?').get(A.tenantId) as any).c).toBe(3);
    expect((app.db.prepare('SELECT COUNT(*) c FROM loans WHERE tenant_id=?').get(A.tenantId) as any).c).toBe(loansBefore);
    expect((app.db.prepare('SELECT subscription_status FROM tenants WHERE id=?').get(A.tenantId) as any).subscription_status).toBe('active');

    // ninguna notificación del tenant B (ni plan ni permisos de B alterados)
    expect(app.db.prepare('SELECT COUNT(*) c FROM notifications WHERE tenant_id=?').get(B.tenantId)).toMatchObject({ c: 0 });
    expect(rows(adminB.userId, 'plan_changed')).toHaveLength(0);
    expect((app.db.prepare('SELECT plan_id FROM tenants WHERE id=?').get(B.tenantId) as any).plan_id).toBe(planId('starter'));
    expect((await effective(B.token)).length).toBe(27);
  });

  it('los permisos explícitos de OTRO tenant no se tocan al cambiar el plan de este', async () => {
    const { A, B, adminB } = world();
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run(JSON.stringify({ 'payments.edit': true }), adminB.membershipId);
    await changePlan(A.tenantId, 'basico');
    expect(permsOf(adminB.membershipId)).toEqual({ 'payments.edit': true });
    expect(B.tenantId).not.toBe(A.tenantId);
  });

  it('no se pueden AÑADIR grants nuevos fuera del plan vigente; los históricos y las revocaciones se conservan al guardar', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    const m = app.addMember(t.tenantId, ['cashier']);
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run(JSON.stringify(HISTORIC), m.membershipId);
    const url = `/api/admin/users/${m.userId}/memberships/${t.tenantId}/permissions`;
    // grant NUEVO fuera de Starter: rechazado y sin guardado parcial
    const bad = await app.req('PUT', url, { token: platform.token, body: { explicit: { ...HISTORIC, 'investors.view': true } } });
    expect(bad.status).toBe(403);
    expect(bad.body.code).toBe('PERMISSION_OUTSIDE_PLAN');
    expect(bad.body.permissions).toEqual(['investors.view']);
    expect(permsOf(m.membershipId)).toEqual(HISTORIC);
    // reenviar los históricos (ya almacenados, fuera del plan) + la revocación: permitido y se conservan
    const keep = await app.req('PUT', url, { token: platform.token, body: { explicit: HISTORIC } });
    expect(keep.status).toBe(200);
    expect(permsOf(m.membershipId)).toEqual(HISTORIC);
    // con un plan que SÍ lo incluye, el mismo grant ya se puede añadir (el techo es el plan vigente)
    app.setPlan(t.tenantId, 'profesional');
    const ok = await app.req('PUT', url, { token: platform.token, body: { explicit: { ...HISTORIC, 'investors.view': true } } });
    expect(ok.status).toBe(200);
    expect(permsOf(m.membershipId)).toEqual({ ...HISTORIC, 'investors.view': true });
  });

  it('applyPlanChange no escribe en la base: informa cuántos grants quedaron fuera del plan', async () => {
    const { applyPlanChange } = await import('../lib/planChange');
    const t = app.createTenant({ planSlug: 'profesional' });
    const m = app.addMember(t.tenantId, ['cashier']);
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run(JSON.stringify(HISTORIC), m.membershipId);
    expect(applyPlanChange(app.db, t.tenantId, planId('starter'))).toEqual({ inactiveGrants: 2 });
    expect(applyPlanChange(app.db, t.tenantId, planId('profesional'))).toEqual({ inactiveGrants: 0 });
    expect(permsOf(m.membershipId)).toEqual(HISTORIC);
  });
});

describe('renovación manual desde el panel', () => {
  it('activa, avisa a owner/admin del tenant una sola vez y no altera plan ni entitlements', async () => {
    const { A, B, adminA, cobradorA, adminB } = world();
    app.setPlan(A.tenantId, 'basico');
    app.db.prepare(`UPDATE tenants SET subscription_status='expired', subscription_end='2020-01-01' WHERE id=?`).run(A.tenantId);
    const renew = () => app.req('POST', `/api/admin/tenants/${A.tenantId}/renew`, { token: platform.token, body: { months: 1 } });
    const r = await renew();
    expect(r.status).toBe(200);
    expect(r.body.subscription_status).toBe('active');
    expect(r.body.plan_id).toBe(planId('basico'));
    for (const u of [A.ownerId, adminA.userId]) {
      const n = rows(u, 'subscription_renewed');
      expect(n).toHaveLength(1);
      expect(n[0].message).toContain(planName('basico'));
    }
    expect(rows(cobradorA.userId, 'subscription_renewed')).toHaveLength(0);
    // repetir la renovación el mismo día (misma fecha de fin): sin duplicado
    expect((await renew()).status).toBe(200);
    expect(rows(A.ownerId, 'subscription_renewed')).toHaveLength(1);
    // entitlements intactos y tenant ya sin bloqueo
    expect((await effective(A.token)).length).toBe(50);
    expect((await app.req('GET', '/api/loans', { token: A.token, tenantId: A.tenantId })).status).toBe(200);
    // sin avisos en otro tenant
    expect(app.db.prepare('SELECT COUNT(*) c FROM notifications WHERE tenant_id=?').get(B.tenantId)).toMatchObject({ c: 0 });
    expect(rows(adminB.userId, 'subscription_renewed')).toHaveLength(0);
  });

  it('solo el staff de plataforma puede cambiar planes o renovar', async () => {
    const { A, adminA } = world();
    expect((await app.req('PUT', `/api/admin/tenants/${A.tenantId}`, { token: adminA.token, body: { plan_id: planId('basico') } })).status).toBe(403);
    expect((await app.req('POST', `/api/admin/tenants/${A.tenantId}/renew`, { token: adminA.token, body: { months: 1 } })).status).toBe(403);
    expect(rows(A.ownerId, 'plan_changed')).toHaveLength(0);
  });
});

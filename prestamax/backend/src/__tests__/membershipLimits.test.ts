// Límites de usuarios y cobradores (los cobradores cuentan DENTRO del total de
// usuarios) y cierre de los bypass: invitación, reactivación, cambio de rol a
// cobrador, inversionistas, y rol por Admin de plataforma.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootTestApp, insertTestPlan, TestApp } from './helpers/testApp';
import { PROFESIONAL_FEATURES } from '../db/planCatalog';
import { countActiveMembers, countActiveCollectors } from '../lib/planLimits';
import crypto from 'crypto';

let app: TestApp;
beforeAll(async () => {
  process.env.OWNER_USER_EMAIL = 'platform-owner@test.local';
  app = await bootTestApp();
});
afterAll(async () => { await app.close(); });

const invite = (t: { token: string; tenantId: string }, roles: string[], n = crypto.randomUUID().slice(0, 6)) =>
  app.req('POST', '/api/settings/users/invite', { token: t.token, tenantId: t.tenantId, body: {
    email: `inv-${n}@test.local`, fullName: `Invitado ${n}`, roles,
  } });
const putMember = (t: { token: string; tenantId: string }, membershipId: string, body: any) =>
  app.req('PUT', `/api/settings/users/${membershipId}`, { token: t.token, tenantId: t.tenantId, body });

describe('invitación — Starter (3 usuarios, 1 cobrador)', () => {
  it('3 usuarios en total: dueño + 2 invitados OK, el 4.º bloqueado con PLAN_LIMIT_USERS', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    expect((await invite(t, ['cashier'])).status).toBe(201);
    expect((await invite(t, ['cashier'])).status).toBe(201);
    expect(countActiveMembers(app.db, t.tenantId)).toBe(3);
    const r = await invite(t, ['cashier']);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PLAN_LIMIT_USERS');
    expect(countActiveMembers(app.db, t.tenantId)).toBe(3);
  });

  it('el cobrador consume un asiento de usuario Y un cupo de cobrador: "3 usuarios + 1 cobrador" son 3 personas', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    expect((await invite(t, ['cobrador'])).status).toBe(201);        // 2 usuarios (dueño + cobrador)
    const second = await invite(t, ['collector']);                    // alias del mismo rol
    expect(second.status).toBe(403);
    expect(second.body.code).toBe('PLAN_LIMIT_COLLECTORS');
    expect((await invite(t, ['cashier'])).status).toBe(201);         // 3 usuarios en total
    expect(countActiveMembers(app.db, t.tenantId)).toBe(3);          // nunca 4 personas
    expect(countActiveCollectors(app.db, t.tenantId)).toBe(1);
  });
});

describe('reactivación sobre el límite', () => {
  it('reactivar una membresía inactiva con el plan lleno devuelve PLAN_LIMIT_USERS y no la activa', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    app.addMember(t.tenantId, ['cashier']);
    app.addMember(t.tenantId, ['cashier']);                            // 3/3
    const inactive = app.addMember(t.tenantId, ['cashier'], { active: false });
    const r = await putMember(t, inactive.membershipId, { is_active: true });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PLAN_LIMIT_USERS');
    expect((app.db.prepare('SELECT is_active FROM tenant_memberships WHERE id=?').get(inactive.membershipId) as any).is_active).toBe(0);
  });

  it('reactivar un cobrador con cupo de usuarios pero sin cupo de cobradores devuelve PLAN_LIMIT_COLLECTORS', async () => {
    const t = app.createTenant({ planSlug: 'basico' });                 // 8 usuarios / 3 cobradores
    for (let i = 0; i < 3; i++) app.addMember(t.tenantId, ['cobrador']);
    const inactive = app.addMember(t.tenantId, ['cobrador'], { active: false });
    const r = await putMember(t, inactive.membershipId, { is_active: true });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PLAN_LIMIT_COLLECTORS');
  });

  it('desactivar nunca se bloquea y libera el asiento; luego se puede reactivar', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    const a = app.addMember(t.tenantId, ['cashier']);
    app.addMember(t.tenantId, ['cashier']);                            // 3/3
    expect((await putMember(t, a.membershipId, { is_active: false })).status).toBe(200);
    expect(countActiveMembers(app.db, t.tenantId)).toBe(2);
    expect((await putMember(t, a.membershipId, { is_active: true })).status).toBe(200);
    expect(countActiveMembers(app.db, t.tenantId)).toBe(3);
  });
});

describe('cambio de rol hacia cobrador sobre el límite', () => {
  it('convertir un usuario activo en cobrador con el cupo lleno devuelve PLAN_LIMIT_COLLECTORS y no cambia el rol', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    app.addMember(t.tenantId, ['cobrador']);                           // 1/1 cobradores
    const cashier = app.addMember(t.tenantId, ['cashier']);
    const r = await putMember(t, cashier.membershipId, { roles: ['collector'] });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PLAN_LIMIT_COLLECTORS');
    expect(JSON.parse((app.db.prepare('SELECT roles FROM tenant_memberships WHERE id=?').get(cashier.membershipId) as any).roles)).toEqual(['cashier']);
  });

  it('con cupo disponible sí permite el cambio, y cobrador→cobrador (alias) no suma', async () => {
    const t = app.createTenant({ planSlug: 'basico' });
    const m = app.addMember(t.tenantId, ['cashier']);
    expect((await putMember(t, m.membershipId, { roles: ['cobrador'] })).status).toBe(200);
    expect((await putMember(t, m.membershipId, { roles: ['collector'] })).status).toBe(200);
    expect(countActiveCollectors(app.db, t.tenantId)).toBe(1);
  });

  it('el Admin de plataforma tampoco puede saltarse el límite de cobradores por /admin/users/.../role', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    app.addMember(t.tenantId, ['cobrador']);
    const cashier = app.addMember(t.tenantId, ['cashier']);
    const platformId = crypto.randomUUID();
    app.db.prepare(`INSERT INTO users (id,email,password_hash,full_name,is_active,platform_role) VALUES (?,?,?,?,1,'none')`)
      .run(platformId, 'platform-owner@test.local', 'x', 'Platform Owner');
    const r = await app.req('PUT', `/api/admin/users/${cashier.userId}/memberships/${t.tenantId}/role`, {
      token: app.tokenFor(platformId), body: { roles: 'cobrador' },
    });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PLAN_LIMIT_COLLECTORS');
  });
});

describe('inversionistas consumen asiento de usuario', () => {
  const makeInvestor = (tenantId: string, email: string) => {
    const id = crypto.randomUUID();
    app.db.prepare('INSERT INTO investors (id,tenant_id,full_name,email) VALUES (?,?,?,?)').run(id, tenantId, 'Inversionista ' + email, email);
    return id;
  };

  it('el portal del inversionista falla con PLAN_LIMIT_USERS cuando no queda asiento', async () => {
    const planId = insertTestPlan(app.db, { slug: 'pro-2users', features: PROFESIONAL_FEATURES, maxUsers: 2, maxCollectors: 1 });
    const t = app.createTenant({ planId });
    app.addMember(t.tenantId, ['cashier']);                            // 2/2
    const inv = makeInvestor(t.tenantId, 'inv-full@test.local');
    const r = await app.req('POST', `/api/investors/${inv}/grant-portal-access`, { token: t.token, tenantId: t.tenantId, body: {} });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PLAN_LIMIT_USERS');
    expect(countActiveMembers(app.db, t.tenantId)).toBe(2);
  });

  it('con asiento disponible lo crea y ocupa un usuario; repetir el acceso no suma otro', async () => {
    const planId = insertTestPlan(app.db, { slug: 'pro-3users', features: PROFESIONAL_FEATURES, maxUsers: 3, maxCollectors: 1 });
    const t = app.createTenant({ planId });
    app.addMember(t.tenantId, ['cashier']);                            // 2/3
    const inv = makeInvestor(t.tenantId, 'inv-ok@test.local');
    expect((await app.req('POST', `/api/investors/${inv}/grant-portal-access`, { token: t.token, tenantId: t.tenantId, body: {} })).status).toBe(200);
    expect(countActiveMembers(app.db, t.tenantId)).toBe(3);
    expect((await app.req('POST', `/api/investors/${inv}/grant-portal-access`, { token: t.token, tenantId: t.tenantId, body: {} })).status).toBe(200);
    expect(countActiveMembers(app.db, t.tenantId)).toBe(3);
  });
});

describe('Enterprise ilimitado', () => {
  it('invita 6 usuarios y 5 cobradores sin bloqueo', async () => {
    const t = app.createTenant({ planSlug: 'enterprise' });
    for (let i = 0; i < 5; i++) expect((await invite(t, ['cobrador'])).status).toBe(201);
    expect((await invite(t, ['cashier'])).status).toBe(201);
    expect(countActiveMembers(app.db, t.tenantId)).toBe(7);
    expect(countActiveCollectors(app.db, t.tenantId)).toBe(5);
  });
});

describe('downgrade con exceso de usuarios/cobradores', () => {
  it('no desactiva nada; bloquea altas y reactivaciones hasta volver al límite o hacer upgrade', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });           // 20 usuarios / 10 cobradores
    const members = [];
    for (let i = 0; i < 6; i++) members.push(app.addMember(t.tenantId, ['cobrador']));
    for (let i = 0; i < 2; i++) members.push(app.addMember(t.tenantId, ['cashier']));
    expect(countActiveMembers(app.db, t.tenantId)).toBe(9);           // 9 > 3 de Starter
    app.setPlan(t.tenantId, 'starter');                                // 3 usuarios / 1 cobrador

    // Nada cambia automáticamente.
    expect(countActiveMembers(app.db, t.tenantId)).toBe(9);
    expect(countActiveCollectors(app.db, t.tenantId)).toBe(6);

    // Todos siguen pudiendo operar (sus tokens funcionan).
    const r = await app.req('GET', '/api/loans', { token: members[0].token, tenantId: t.tenantId });
    expect(r.status).toBe(200);

    // Las altas nuevas se bloquean.
    expect((await invite(t, ['cashier'])).body.code).toBe('PLAN_LIMIT_USERS');

    // Desactivar a varios (acción manual): sigue bloqueado hasta bajar de 3.
    for (const m of members.slice(0, 6)) await putMember(t, m.membershipId, { is_active: false });
    expect(countActiveMembers(app.db, t.tenantId)).toBe(3);
    expect((await invite(t, ['cashier'])).body.code).toBe('PLAN_LIMIT_USERS');
    const dropped = app.addMember(t.tenantId, ['cashier'], { active: false });
    expect((await putMember(t, dropped.membershipId, { is_active: true })).body.code).toBe('PLAN_LIMIT_USERS');

    // Upgrade: vuelve a permitir.
    app.setPlan(t.tenantId, 'profesional');
    expect((await invite(t, ['cashier'])).status).toBe(201);
    expect((await putMember(t, dropped.membershipId, { is_active: true })).status).toBe(200);
  });
});

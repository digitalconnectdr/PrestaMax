// Corrección final de entitlements: modelo PLATFORM > PLAN > ROL/permiso.
//   efectivo = PLAN permite ∧ ROL/permiso permite; ningún permiso individual supera
//   el techo del plan (tampoco si lo guarda el Super Admin).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { bootTestApp, signWhopWebhook, TestApp } from './helpers/testApp';
import {
  STARTER_FEATURES, BASICO_FEATURES, PROFESIONAL_FEATURES, ENTERPRISE_FEATURES, TRIAL_PLAN,
} from '../db/planCatalog';
import { PERM_DEFS } from '../lib/permissions';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FRONT = path.join(ROOT, 'frontend', 'src');
const read = (p: string) => fs.readFileSync(p, 'utf8');

let app: TestApp;
const PLATFORM_EMAIL = 'platform-owner@test.local';
let platformToken = '';
beforeAll(async () => {
  process.env.OWNER_USER_EMAIL = PLATFORM_EMAIL;
  process.env.WHOP_API_KEY = 'k';
  process.env.WHOP_WEBHOOK_SECRET = 'whsec_' + Buffer.from('s').toString('base64');
  app = await bootTestApp();
  const pid = crypto.randomUUID();
  app.db.prepare(`INSERT INTO users (id,email,password_hash,full_name,is_active,platform_role) VALUES (?,?,?,?,1,'none')`)
    .run(pid, PLATFORM_EMAIL, 'x', 'Platform Owner');
  platformToken = app.tokenFor(pid);
});
afterAll(async () => { await app.close(); });

type T = { token: string; tenantId: string };
const call = (m: string, u: string, who: { token: string; tenantId?: string }, body?: any) =>
  app.req(m, u, { token: who.token, tenantId: who.tenantId, body });
const codeOf = (r: { status: number; body: any }) => (r.status === 403 ? (r.body?.code || 'ROLE403') : r.status);
const planBlocked = (r: { status: number; body: any }) => r.status === 403 && r.body?.code === 'PLAN_FEATURE_REQUIRED';
const memberPerms = (membershipId: string) =>
  JSON.parse((app.db.prepare('SELECT permissions FROM tenant_memberships WHERE id=?').get(membershipId) as any).permissions || '{}');

describe('conteos finales de features (27 / 27 / 50 / 68 / 69)', () => {
  it('catálogo, BD, Admin y /auth/me coinciden', async () => {
    expect([STARTER_FEATURES.length, TRIAL_PLAN.features.length, BASICO_FEATURES.length, PROFESIONAL_FEATURES.length, ENTERPRISE_FEATURES.length])
      .toEqual([27, 27, 50, 68, 69]);
    expect(PERM_DEFS.length).toBe(69);
    const count = (where: string) => JSON.parse((app.db.prepare(`SELECT features FROM plans WHERE ${where}`).get() as any).features).length;
    expect([count("id='plan-trial'"), count("slug='starter'"), count("slug='basico'"), count("slug='profesional'"), count("slug='enterprise'")])
      .toEqual([27, 27, 50, 68, 69]);
    // Admin → Planes lee plans.features
    const admin = await app.req('GET', '/api/admin/plans', { token: platformToken });
    const bySlug = Object.fromEntries(admin.body.map((p: any) => [p.slug, JSON.parse(p.features).length]));
    expect([bySlug.trial, bySlug.starter, bySlug.basico, bySlug.profesional, bySlug.enterprise]).toEqual([27, 27, 50, 68, 69]);
    // Runtime: /auth/me
    const eff = async (planId: string) => {
      const t = app.createTenant({ planId });
      const me = await app.req('GET', '/api/auth/me', { token: t.token });
      const row = (me.body.tenants || [])[0] || {};
      return (row.effectivePermissions || row.effective_permissions || []).slice().sort();
    };
    const trial = await eff('plan-trial'); const starter = await eff('plan-starter');
    expect(trial).toEqual(starter);
    expect(starter.length).toBe(27);
    expect((await eff('plan-basico')).length).toBe(50);
    expect((await eff('plan-profesional')).length).toBe(68);
    expect((await eff('plan-enterprise')).length).toBe(69);
    expect([...STARTER_FEATURES].sort()).toEqual([...TRIAL_PLAN.features].sort());
  });

  it('descripción del Plan Trial actualizada una sola vez (sin "Configurable desde Admin")', () => {
    const d = (app.db.prepare("SELECT description FROM plans WHERE id='plan-trial'").get() as any).description;
    expect(d).not.toMatch(/Configurable desde Admin/);
    expect(d).toMatch(/Starter/);
  });
});

describe('Super Admin de plataforma', () => {
  it('administra empresas y accede técnicamente a módulos del tenant (soporte)', async () => {
    const starter = app.createTenant({ planSlug: 'starter' });
    expect((await app.req('GET', '/api/admin/tenants', { token: platformToken })).status).toBe(200);
    // bypass técnico: módulos fuera del plan del tenant, solo para soporte
    expect((await app.req('GET', '/api/investors', { token: platformToken, tenantId: starter.tenantId })).status).toBe(200);
    expect((await app.req('GET', '/api/settings/branches', { token: platformToken, tenantId: starter.tenantId })).status).toBe(200);
  });

  it('NO puede guardar a un usuario del tenant un permiso fuera del plan (PERMISSION_OUTSIDE_PLAN), y no hay guardado parcial', async () => {
    const basic = app.createTenant({ planSlug: 'basico' });
    const m = app.addMember(basic.tenantId, ['cashier']);
    const url = `/api/admin/users/${m.userId}/memberships/${basic.tenantId}/permissions`;
    const bad = await app.req('PUT', url, { token: platformToken, body: { explicit: { 'collections.promises': true, 'investors.view': true } } });
    expect(bad.status).toBe(403);
    expect(bad.body.code).toBe('PERMISSION_OUTSIDE_PLAN');
    expect(bad.body.permissions).toEqual(['investors.view']);
    expect(memberPerms(m.membershipId)).toEqual({});                       // nada se guardó (ni la parte válida)
    const ok = await app.req('PUT', url, { token: platformToken, body: { explicit: { 'collections.promises': true } } });
    expect(ok.status).toBe(200);
    expect(memberPerms(m.membershipId)).toEqual({ 'collections.promises': true });
    // claves inexistentes / valores no booleanos
    expect((await app.req('PUT', url, { token: platformToken, body: { explicit: { 'x.y': true } } })).status).toBe(400);
    expect((await app.req('PUT', url, { token: platformToken, body: { explicit: { 'loans.view': 'si' } } })).status).toBe(400);
  });

  it('vía el endpoint de empresa tampoco: el bypass técnico no permite persistir fuera del plan', async () => {
    // Super Admin con rol de plataforma explícito (nivel 99 en settings): aun así rige el techo.
    app.db.prepare("UPDATE users SET platform_role='platform_admin' WHERE email=?").run(PLATFORM_EMAIL);
    const basic = app.createTenant({ planSlug: 'basico' });
    const m = app.addMember(basic.tenantId, ['cashier']);
    const r = await app.req('PUT', `/api/settings/users/${m.membershipId}/permissions`,
      { token: platformToken, tenantId: basic.tenantId, body: { explicit: { 'investors.view': true } } });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PERMISSION_OUTSIDE_PLAN');
  });

  it('cambiar el plan del tenant actualiza el techo efectivo', async () => {
    const t = app.createTenant({ planSlug: 'basico' });
    const m = app.addMember(t.tenantId, ['cashier']);
    const url = `/api/admin/users/${m.userId}/memberships/${t.tenantId}/permissions`;
    expect((await app.req('PUT', url, { token: platformToken, body: { explicit: { 'investors.view': true } } })).status).toBe(403);
    const planId = (app.db.prepare("SELECT id FROM plans WHERE slug='profesional'").get() as any).id;
    expect((await app.req('PUT', `/api/admin/tenants/${t.tenantId}`, { token: platformToken, body: { plan_id: planId } })).status).toBe(200);
    expect((await app.req('PUT', url, { token: platformToken, body: { explicit: { 'investors.view': true } } })).status).toBe(200);
    expect((await call('GET', '/api/investors', { token: m.token, tenantId: t.tenantId })).status).toBe(200);
  });

  it('la lista de membresías del Admin entrega el techo del plan de cada empresa', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    const m = app.addMember(t.tenantId, ['cashier']);
    const r = await app.req('GET', `/api/admin/users/${m.userId}/memberships`, { token: platformToken });
    expect(r.status).toBe(200);
    const row = r.body.memberships.find((x: any) => x.tenantId === t.tenantId);
    expect(row.planFeatures.length).toBe(27);
    expect(row.planFeatures).not.toContain('investors.view');
  });
});

describe('gestión de usuarios por la empresa', () => {
  const invite = (t: T, roles: string[], n = crypto.randomUUID().slice(0, 6)) =>
    call('POST', '/api/settings/users/invite', t, { email: `u-${n}@test.local`, fullName: `U ${n}`, roles });

  it('owner invita, edita, desactiva, reactiva, cambia rol y asigna cobrador en SU tenant', async () => {
    const t = app.createTenant({ planSlug: 'basico' });
    const r = await invite(t, ['cashier']);
    expect(r.status).toBe(201);
    const mid = r.body.membership.id;
    expect((await call('PUT', `/api/settings/users/${mid}`, t, { roles: ['oficial'] })).status).toBe(200);
    expect((await call('PUT', `/api/settings/users/${mid}`, t, { is_active: false })).status).toBe(200);
    expect((await call('PUT', `/api/settings/users/${mid}`, t, { is_active: true })).status).toBe(200);
    expect((await call('PUT', `/api/settings/users/${mid}`, t, { roles: ['cobrador'] })).status).toBe(200);   // asignar cobrador
    expect(JSON.parse((app.db.prepare('SELECT roles FROM tenant_memberships WHERE id=?').get(mid) as any).roles)).toEqual(['cobrador']);
  });

  it('un admin de empresa gestiona usuarios pero no puede escalar a otro a admin', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    const admin = app.addMember(t.tenantId, ['admin']);
    const cashier = app.addMember(t.tenantId, ['cashier']);
    const asAdmin = { token: admin.token, tenantId: t.tenantId };
    expect((await call('PUT', `/api/settings/users/${cashier.membershipId}`, asAdmin, { roles: ['cobrador'] })).status).toBe(200);
    const up = await call('PUT', `/api/settings/users/${cashier.membershipId}`, asAdmin, { roles: ['admin'] });
    expect(up.status).toBe(403);
    expect((await invite(asAdmin, ['admin'])).status).toBe(403);
  });

  it('NO cruza tenants: ni editar, ni leer/ajustar permisos de membresías de otra empresa', async () => {
    const a = app.createTenant({ planSlug: 'profesional' });
    const b = app.createTenant({ planSlug: 'profesional' });
    const victim = app.addMember(b.tenantId, ['cashier']);
    const ownA = { token: a.token, tenantId: a.tenantId };
    expect((await call('PUT', `/api/settings/users/${victim.membershipId}`, ownA, { is_active: false })).status).toBe(404);
    expect((await call('PUT', `/api/settings/users/${victim.membershipId}/permissions`, ownA, { explicit: { 'loans.view': true } })).status).toBe(404);
    expect((await call('GET', `/api/settings/users/${victim.membershipId}/permissions`, ownA)).status).toBe(404);
    expect((app.db.prepare('SELECT is_active FROM tenant_memberships WHERE id=?').get(victim.membershipId) as any).is_active).toBe(1);
    // y un usuario de A no puede operar con el X-Tenant-Id de B
    expect((await call('GET', '/api/loans', { token: a.token, tenantId: b.tenantId })).status).toBe(403);
  });

  it('NO se puede crear/asignar Platform Admin desde las herramientas de la empresa', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    for (const role of ['platform_admin', 'platform_owner', 'platform_support', 'admin_plataforma']) {
      const r = await invite(t, [role]);
      expect(r.status, role).toBe(400);
    }
    const m = app.addMember(t.tenantId, ['cashier']);
    const put = await call('PUT', `/api/settings/users/${m.membershipId}`, t, { roles: ['platform_admin'] });
    expect(put.status).toBe(400);
    expect(put.body.code).toBe('INVALID_ROLE');
    expect((await call('PUT', `/api/settings/users/${m.membershipId}`, t, { roles: ['tenant_owner'] })).status).toBe(403);
    expect((app.db.prepare('SELECT platform_role FROM users WHERE id=?').get(m.userId) as any).platform_role).toBe('none');
    // y la herramienta de roles de plataforma es solo para el staff
    expect((await call('PUT', `/api/admin/users/${m.userId}/platform-role`, { token: t.token }, { platform_role: 'admin' })).status).toBe(403);
    expect((app.db.prepare('SELECT platform_role FROM users WHERE id=?').get(m.userId) as any).platform_role).toBe('none');
  });

  it('respeta el límite de usuarios y de cobradores (el cobrador consume un asiento)', async () => {
    const t = app.createTenant({ planSlug: 'starter' });                   // 3 usuarios / 1 cobrador
    expect((await invite(t, ['cobrador'])).status).toBe(201);
    expect((await invite(t, ['collector'])).body.code).toBe('PLAN_LIMIT_COLLECTORS');
    expect((await invite(t, ['cashier'])).status).toBe(201);
    expect((await invite(t, ['cashier'])).body.code).toBe('PLAN_LIMIT_USERS');
  });
});

describe('permisos explícitos y techo del plan (RBAC + plan)', () => {
  it('dentro del plan funcionan; fuera del plan se rechazan sin guardado parcial', async () => {
    const t = app.createTenant({ planSlug: 'basico' });
    const cashier = app.addMember(t.tenantId, ['cashier']);                // el rol cajero NO trae promesas
    const asCashier = { token: cashier.token, tenantId: t.tenantId };
    expect(codeOf(await call('GET', '/api/collections/promises', asCashier))).toBe('ROLE403');
    const ok = await call('PUT', `/api/settings/users/${cashier.membershipId}/permissions`, t, { explicit: { 'collections.promises': true } });
    expect(ok.status).toBe(200);
    expect((await call('GET', '/api/collections/promises', asCashier)).status).toBe(200);          // plan ✓ ∧ permiso ✓

    const bad = await call('PUT', `/api/settings/users/${cashier.membershipId}/permissions`, t,
      { explicit: { 'collections.promises': true, 'contracts.view': true, 'investors.view': true } });
    expect(bad.status).toBe(403);
    expect(bad.body.code).toBe('PERMISSION_OUTSIDE_PLAN');
    expect(bad.body.permissions).toEqual(['investors.view']);                                      // contracts.view SÍ está en Básico
    expect(memberPerms(cashier.membershipId)).toEqual({ 'collections.promises': true });           // sin cambios
  });

  it('plan permite + rol no = denegado; rol permite + plan no = denegado', async () => {
    const pro = app.createTenant({ planSlug: 'profesional' });
    const cashierPro = app.addMember(pro.tenantId, ['cashier']);
    expect(codeOf(await call('GET', '/api/investors', { token: cashierPro.token, tenantId: pro.tenantId }))).toBe('ROLE403');   // plan sí, rol no
    const starter = app.createTenant({ planSlug: 'starter' });
    const adminStarter = app.addMember(starter.tenantId, ['admin']);
    expect(codeOf(await call('GET', '/api/investors', { token: adminStarter.token, tenantId: starter.tenantId }))).toBe('PLAN_FEATURE_REQUIRED'); // rol sí, plan no
    // el rol no se salta el plan ni con permisos explícitos guardados a mano en BD
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run(JSON.stringify({ 'investors.view': true }), adminStarter.membershipId);
    expect(codeOf(await call('GET', '/api/investors', { token: adminStarter.token, tenantId: starter.tenantId }))).toBe('PLAN_FEATURE_REQUIRED');
  });

  it('downgrade: permisos históricos se conservan pero quedan INEFECTIVOS; reaparecen al volver al plan', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    const cashier = app.addMember(t.tenantId, ['cashier']);
    const asCashier = { token: cashier.token, tenantId: t.tenantId };
    expect((await call('PUT', `/api/settings/users/${cashier.membershipId}/permissions`, t, { explicit: { 'investors.view': true } })).status).toBe(200);
    expect((await call('GET', '/api/investors', asCashier)).status).toBe(200);
    app.setPlan(t.tenantId, 'basico');
    expect(memberPerms(cashier.membershipId)).toEqual({ 'investors.view': true });                 // no se borra
    expect(codeOf(await call('GET', '/api/investors', asCashier))).toBe('PLAN_FEATURE_REQUIRED');  // inefectivo
    const eff = await call('GET', `/api/settings/users/${cashier.membershipId}/permissions`, t);
    expect(eff.body.effective).not.toContain('investors.view');
    // guardar sin tocar lo histórico NO falla; añadir uno nuevo fuera del plan sí
    expect((await call('PUT', `/api/settings/users/${cashier.membershipId}/permissions`, t, { explicit: { 'investors.view': true, 'collections.promises': true } })).status).toBe(200);
    expect((await call('PUT', `/api/settings/users/${cashier.membershipId}/permissions`, t, { explicit: { 'investors.view': true, 'investors.create': true } })).status).toBe(403);
    app.setPlan(t.tenantId, 'profesional');
    expect((await call('GET', '/api/investors', asCashier)).status).toBe(200);
  });
});

describe('/search respeta PLAN + ROL', () => {
  it('investor no obtiene datos globales; el resto solo las categorías permitidas', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    const cid = app.createClient(t.tenantId);
    app.db.prepare("UPDATE clients SET full_name='Zulema Busqueda' WHERE id=?").run(cid);
    app.fillLoans(t.tenantId, 1, 'active', cid);
    const search = (who: { token: string }) => app.req('GET', '/api/search?q=Zulema', { token: who.token, tenantId: t.tenantId });

    const investor = app.addMember(t.tenantId, ['investor']);
    const inv = await search(investor);
    expect(inv.status).toBe(403);
    expect(JSON.stringify(inv.body)).not.toMatch(/Zulema/);

    const owner = await search(t);
    expect(owner.status).toBe(200);
    expect(owner.body.clients.length).toBe(1);
    expect(owner.body.loans.length).toBe(1);

    // cobrador sin payments.view ni clients.view (explícitos en false): solo préstamos
    const cob = app.addMember(t.tenantId, ['cobrador']);
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run(JSON.stringify({ 'clients.view': false, 'payments.view': false }), cob.membershipId);
    const c = await search(cob);
    expect(c.status).toBe(200);
    expect(c.body.clients).toEqual([]);
    expect(c.body.payments).toEqual([]);
    expect(c.body.loans.length).toBe(1);

    // sin ninguna de las tres -> 403
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run(JSON.stringify({ 'clients.view': false, 'payments.view': false, 'loans.view': false }), cob.membershipId);
    expect((await search(cob)).status).toBe(403);
    // el Super Admin conserva acceso técnico
    expect((await app.req('GET', '/api/search?q=Zulema', { token: platformToken, tenantId: t.tenantId })).status).toBe(200);
  });
});

describe('portal del inversionista', () => {
  const investorUser = (tenantId: string) => {
    const m = app.addMember(tenantId, ['investor']);
    const invId = crypto.randomUUID();
    app.db.prepare('INSERT INTO investors (id,tenant_id,full_name,email,user_id) VALUES (?,?,?,?,?)').run(invId, tenantId, 'Inv', `i-${invId.slice(0, 6)}@t.test`, m.userId);
    return { ...m, invId };
  };

  it('Profesional y Enterprise: 200', async () => {
    for (const plan of ['profesional', 'enterprise']) {
      const t = app.createTenant({ planSlug: plan });
      const inv = investorUser(t.tenantId);
      expect((await call('GET', '/api/portal/investor/summary', { token: inv.token, tenantId: t.tenantId })).status, plan).toBe(200);
    }
  });

  it('Trial, Starter y Básico: 403 PLAN_FEATURE_REQUIRED (investors.portal)', async () => {
    const trial = app.createTenant({ planId: 'plan-trial', status: 'trial' });
    for (const t of [trial, app.createTenant({ planSlug: 'starter' }), app.createTenant({ planSlug: 'basico' })]) {
      const inv = investorUser(t.tenantId);
      const r = await call('GET', '/api/portal/investor/summary', { token: inv.token, tenantId: t.tenantId });
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('PLAN_FEATURE_REQUIRED');
      expect(r.body.required_perm).toBe('investors.portal');
    }
  });

  it('downgrade cierra el portal SIN borrar datos del inversionista ni sus asignaciones', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    const inv = investorUser(t.tenantId);
    const [loanId] = app.fillLoans(t.tenantId, 1, 'active');
    app.db.prepare('UPDATE loans SET investor_id=? WHERE id=?').run(inv.invId, loanId);
    const who = { token: inv.token, tenantId: t.tenantId };
    expect((await call('GET', '/api/portal/investor/loans', who)).status).toBe(200);
    app.setPlan(t.tenantId, 'basico');
    expect((await call('GET', '/api/portal/investor/loans', who)).status).toBe(403);
    expect((app.db.prepare('SELECT COUNT(*) c FROM investors WHERE id=?').get(inv.invId) as any).c).toBe(1);
    expect((app.db.prepare('SELECT investor_id FROM loans WHERE id=?').get(loanId) as any).investor_id).toBe(inv.invId);
    expect((app.db.prepare('SELECT is_active FROM tenant_memberships WHERE id=?').get(inv.membershipId) as any).is_active).toBe(1);
    app.setPlan(t.tenantId, 'profesional');
    expect((await call('GET', '/api/portal/investor/loans', who)).status).toBe(200);
  });

  it('suscripción vencida: el portal tampoco responde datos', async () => {
    const t = app.createTenant({ planSlug: 'profesional', subscriptionEnd: new Date(Date.now() - 864e5).toISOString() });
    const inv = investorUser(t.tenantId);
    expect((await call('GET', '/api/portal/investor/summary', { token: inv.token, tenantId: t.tenantId })).status).toBe(402);
  });
});

describe('aprobación por monto (loans.approve_high_value, Profesional+)', () => {
  const setThreshold = (t: T, v: number | null) => call('PUT', '/api/settings/approvals', t, { approval_threshold_amount: v });
  it('Starter, Básico y Trial no pueden activarla; Profesional y Enterprise sí', async () => {
    for (const planId of ['plan-trial', 'plan-starter', 'plan-basico']) {
      const t = app.createTenant({ planId });
      const r = await setThreshold(t, 1000);
      expect(r.status, planId).toBe(403);
      expect(r.body.code).toBe('PLAN_FEATURE_REQUIRED');
      expect((await setThreshold(t, null)).status).toBe(200);          // desactivar siempre se permite
      expect((await setThreshold(t, 0)).status).toBe(200);
    }
    for (const plan of ['profesional', 'enterprise']) {
      const t = app.createTenant({ planSlug: plan });
      expect((await setThreshold(t, 1000)).status, plan).toBe(200);
    }
  });

  it('un umbral heredado NO atasca préstamos en Starter/Básico (se ignora y se resuelven los pendientes)', async () => {
    for (const plan of ['starter', 'basico']) {
      const t = app.createTenant({ planSlug: plan });
      app.db.prepare('INSERT OR IGNORE INTO tenant_settings (id,tenant_id) VALUES (?,?)').run(crypto.randomUUID(), t.tenantId);
      app.db.prepare('UPDATE tenant_settings SET approval_threshold_amount=1000 WHERE tenant_id=?').run(t.tenantId);
      const [fresh, stuck] = app.fillLoans(t.tenantId, 2, 'under_review');
      app.db.prepare('UPDATE loans SET requested_amount=5000 WHERE id IN (?,?)').run(fresh, stuck);
      app.db.prepare("UPDATE loans SET status='pending_manager_approval' WHERE id=?").run(stuck);
      expect((await call('POST', `/api/loans/${fresh}/approve`, t, {})).status).toBe(200);
      expect((await call('POST', `/api/loans/${stuck}/approve`, t, {})).status).toBe(200);
      const st = (id: string) => (app.db.prepare('SELECT status FROM loans WHERE id=?').get(id) as any).status;
      expect([st(fresh), st(stuck)], plan).toEqual(['approved', 'approved']);
    }
  });

  it('Profesional/Enterprise conservan la 2.ª aprobación', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    await setThreshold(t, 1000);
    const lo = app.addMember(t.tenantId, ['loan_officer']);                // sin loans.approve_high_value
    const [l] = app.fillLoans(t.tenantId, 1, 'under_review');
    app.db.prepare('UPDATE loans SET requested_amount=5000 WHERE id=?').run(l);
    expect((await call('POST', `/api/loans/${l}/approve`, { token: lo.token, tenantId: t.tenantId }, {})).status).toBe(200);
    expect((app.db.prepare('SELECT status FROM loans WHERE id=?').get(l) as any).status).toBe('pending_manager_approval');
    expect((await call('POST', `/api/loans/${l}/approve`, t, {})).status).toBe(200);     // el owner sí tiene la clave
    expect((app.db.prepare('SELECT status FROM loans WHERE id=?').get(l) as any).status).toBe('approved');
  });
});

describe('WhatsApp tras downgrade', () => {
  it('Starter no genera automatizaciones nuevas; se conservan configuraciones; al volver a Básico+ retoman', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    const cid = app.createClient(t.tenantId);
    app.db.prepare("UPDATE clients SET phone_personal='8095550000', whatsapp='8095550000' WHERE id=?").run(cid);
    const tplId = crypto.randomUUID();
    app.db.prepare("INSERT INTO whatsapp_templates (id,tenant_id,name,event,body,is_active) VALUES (?,?,?,?,?,1)").run(tplId, t.tenantId, 'tpl', 'loan_created', 'Hola {{cliente}}');
    app.db.prepare("INSERT INTO whatsapp_event_settings (id,tenant_id,event,enabled,template_id) VALUES (?,?,?,1,?)").run(crypto.randomUUID(), t.tenantId, 'loan_created', tplId);
    const drafts = () => (app.db.prepare('SELECT COUNT(*) c FROM whatsapp_messages WHERE tenant_id=?').get(t.tenantId) as any).c;
    const disburse = async () => { const [l] = app.fillLoans(t.tenantId, 1, 'approved', cid); return call('POST', `/api/loans/${l}/disburse`, t, {}); };

    expect((await disburse()).status).toBe(200);
    const withPlan = drafts();
    expect(withPlan).toBeGreaterThan(0);                                       // Profesional genera borrador

    app.setPlan(t.tenantId, 'starter');
    expect((await disburse()).status).toBe(200);
    expect(drafts()).toBe(withPlan);                                           // Starter: ningún borrador nuevo
    expect((app.db.prepare('SELECT COUNT(*) c FROM whatsapp_event_settings WHERE tenant_id=? AND enabled=1').get(t.tenantId) as any).c).toBe(1);   // config intacta
    expect((app.db.prepare('SELECT COUNT(*) c FROM whatsapp_templates WHERE tenant_id=?').get(t.tenantId) as any).c).toBe(1);

    app.setPlan(t.tenantId, 'basico');
    expect((await disburse()).status).toBe(200);
    expect(drafts()).toBeGreaterThan(withPlan);                                // Básico: vuelve a operar
  });
});

describe('reportes programados, exportación contable y plantillas (Básico+)', () => {
  it('Starter/Trial: no; Básico, Profesional y Enterprise: sí (API)', async () => {
    const urls = ['/api/reports/subscriptions', '/api/accounting/summary', '/api/settings/templates'];
    for (const planId of ['plan-trial', 'plan-starter']) {
      const t = app.createTenant({ planId });
      for (const u of urls) expect(planBlocked(await call('GET', u, t)), `${planId} ${u}`).toBe(true);
      expect(planBlocked(await call('POST', '/api/reports/subscriptions', t, { frequency: 'weekly' }))).toBe(true);
      // reportes básicos intactos
      expect((await call('GET', '/api/reports/dashboard', t)).status).toBe(200);
    }
    for (const plan of ['basico', 'profesional', 'enterprise']) {
      const t = app.createTenant({ planSlug: plan });
      for (const u of urls) expect(planBlocked(await call('GET', u, t)), `${plan} ${u}`).toBe(false);
    }
  });

  it('PermKeys propias: reports.dashboard ya no abre esas funciones', () => {
    for (const k of ['reports.scheduled', 'reports.accounting_export', 'templates.view']) {
      expect(STARTER_FEATURES).not.toContain(k);
      expect(BASICO_FEATURES).toContain(k);
    }
    expect(STARTER_FEATURES).toContain('reports.dashboard');
  });

  it('el cron de reportes programados no envía a Starter y sí a Básico+ (suscripción conservada)', async () => {
    const mk = (slug: string) => {
      const t = app.createTenant({ planSlug: slug });
      app.db.prepare("INSERT INTO report_subscriptions (id,tenant_id,user_id,frequency,recipients,is_active) VALUES (?,?,?,?,?,1)")
        .run(crypto.randomUUID(), t.tenantId, t.ownerId, 'daily', 'owner@t.test');
      return t.tenantId;
    };
    const starter = mk('starter'); const basic = mk('basico');
    // import dinámico: el servicio carga db/database y debe hacerlo DESPUÉS de bootTestApp()
    const { runScheduledReportsCron } = await import('../services/reportSubscriptionService');
    // Notifications v2: last_sent_at solo se marca si el email salio de verdad -> se
    // simula un Resend que responde OK (sin red real) y un reloj fijo (11:00 hora local).
    const prevKey = process.env.RESEND_API_KEY; const prevFetch = globalThis.fetch;
    process.env.RESEND_API_KEY = 're_test';
    (globalThis as any).fetch = async () => ({ ok: true, status: 200, text: async () => '' });
    try {
      await runScheduledReportsCron(app.db, new Date('2030-03-05T15:00:00Z'));
    } finally {
      globalThis.fetch = prevFetch;
      if (prevKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = prevKey;
    }
    const last = (id: string) => (app.db.prepare('SELECT last_sent_at FROM report_subscriptions WHERE tenant_id=?').get(id) as any).last_sent_at;
    expect(last(starter)).toBeNull();
    expect(last(basic)).not.toBeNull();
    expect((app.db.prepare('SELECT COUNT(*) c FROM report_subscriptions WHERE tenant_id=?').get(starter) as any).c).toBe(1);
  });

  it('frontend: menú, ruta y UI usan las claves nuevas', () => {
    expect(read(path.join(FRONT, 'components/layout/Sidebar.tsx'))).toMatch(/reports\/accounting[\s\S]{0,60}can\('reports\.accounting_export'\)/);
    expect(read(path.join(FRONT, 'App.tsx'))).toMatch(/\/reports\/accounting"[^\n]*perm="reports\.accounting_export"/);
    expect(read(path.join(FRONT, 'pages/reports/ReportsPage.tsx'))).toMatch(/can\('reports\.scheduled'\)/);
  });
});

describe('editar pagos (payments.edit, Profesional+)', () => {
  it('API: Starter/Básico PLAN403; Profesional/Enterprise pasan el gate', async () => {
    for (const plan of ['starter', 'basico']) {
      const t = app.createTenant({ planSlug: plan });
      expect(planBlocked(await call('PUT', '/api/payments/x', t, {})), plan).toBe(true);
    }
    for (const plan of ['profesional', 'enterprise']) {
      const t = app.createTenant({ planSlug: plan });
      expect(planBlocked(await call('PUT', '/api/payments/x', t, {})), plan).toBe(false);
    }
  });
  it('UI: el botón de editar solo se muestra con can(payments.edit)', () => {
    const src = read(path.join(FRONT, 'pages/payments/PaymentsPage.tsx'));
    expect(src).toMatch(/can\('payments\.edit'\)[\s\S]{0,120}openEditPayment\(payment\)/);
  });
});

describe('Mi Suscripción y claims', () => {
  const i18n = read(path.join(FRONT, 'lib/i18n.ts'));
  const esOf = (key: string) => {
    const m = i18n.match(new RegExp(`'${key.replace(/\./g, '\\.')}'\\s*:\\s*\\{\\s*es:\\s*'((?:[^'\\\\]|\\\\.)*)'`));
    return m ? m[1] : null;
  };
  const { PLAN_FEATURE_KEYS } = require('../../../frontend/src/lib/planFeatures.ts');

  it('muestra beneficios comerciales por plan, sin PermKeys técnicas', () => {
    const permKeyRe = /\b(clients|loans|payments|receipts|contracts|collections|requests|reports|whatsapp|income|settings|templates|calculator|investors)\.[a-z_.]+/;
    for (const slug of ['starter', 'basico', 'profesional', 'enterprise']) {
      expect(PLAN_FEATURE_KEYS[slug].length).toBeGreaterThan(0);
      for (const k of PLAN_FEATURE_KEYS[slug]) {
        const es = esOf(k);
        expect(es, `${slug}:${k} sin traducción`).toBeTruthy();
        expect(es).not.toMatch(permKeyRe);
      }
    }
    const billing = read(path.join(FRONT, 'pages/billing/BillingPage.tsx'));
    expect(billing).toMatch(/planFeatureKeys\(plan\.slug\)/);
    expect(billing).not.toMatch(/plan\.features\.slice/);
    // bloque duplicado de SettingsPage eliminado
    expect(read(path.join(FRONT, 'pages/settings/SettingsPage.tsx'))).not.toMatch(/FEATURE_LABELS/);
  });

  it('contenido por plan según lo acordado', () => {
    const es = (slug: string) => PLAN_FEATURE_KEYS[slug].map((k: string) => esOf(k));
    expect(es('starter')).toEqual(expect.arrayContaining(['Gestión de clientes', 'Gestión de préstamos', 'Pagos y recibos', 'Cobranza básica', 'Calculadora de préstamos', 'Dashboard y reportes básicos']));
    expect(es('basico')).toEqual(expect.arrayContaining(['Todo lo del plan Starter', 'Cobranza avanzada', 'Promesas de pago', 'Gestión de tareas de cobranza', 'Contratos digitales', 'WhatsApp integrado', 'Reportes avanzados', 'Gestión de ingresos', 'Importación de cartera (CSV)', 'Reportes programados', 'Exportación contable']));
    expect(es('profesional')).toEqual(expect.arrayContaining(['Todo lo del plan Básico', 'Múltiples sucursales', 'Solicitudes públicas de préstamo', 'Gestión de inversionistas', 'Proyecciones de cartera', 'Consolidación y gestión avanzada de cartera']));
    expect(es('enterprise')).toEqual(expect.arrayContaining(['Todo lo del plan Profesional', 'Reporte DataCrédito']));
  });

  it('no reaparecen claims sin respaldo en Landing, i18n, JSON-LD, noscript ni llms.txt', () => {
    const banned = /SLA garantizado|Guaranteed SLA|Soporte 24\/7|24\/7 support|Soporte prioritario|Priority support|Onboarding personalizado|Personalized onboarding|Migración asistida|Assisted portfolio migration|API de integración|Integration API/i;
    const files = [
      path.join(FRONT, 'lib/i18n.ts'), path.join(FRONT, 'pages/public/LandingPage.tsx'), path.join(FRONT, 'lib/planFeatures.ts'),
      path.join(FRONT, 'lib/seoContent.ts'), path.join(FRONT, 'lib/resources.ts'),
      path.join(ROOT, 'frontend', 'index.html'), path.join(ROOT, 'frontend', 'public', 'llms.txt'),
    ];
    for (const f of files) expect(read(f), f).not.toMatch(banned);
    expect(esOf('lp.pf.email_support')).toBe('Soporte por correo');
    expect(esOf('lp.faq.a5')).toMatch(/14 días con las funciones del plan Starter, sin tarjeta/);
    expect(read(path.join(ROOT, 'frontend', 'index.html'))).not.toMatch(/14 días de acceso completo/);
  });
});

describe('registro público: siempre trial server-side', () => {
  const reg = (extra: any = {}) => app.req('POST', '/api/auth/register-tenant', { body: {
    company_name: 'Empresa ' + crypto.randomUUID().slice(0, 6), admin_name: 'Dueño', admin_email: `reg-${crypto.randomUUID().slice(0, 8)}@test.local`,
    admin_password: 'Passw0rd!x', ...extra,
  } });
  const tenantOf = (email: string) => app.db.prepare('SELECT t.plan_id, t.subscription_status FROM tenants t WHERE t.email=?').get(email.toLowerCase()) as any;

  it('ignora plan_id enviado por el cliente (comercial, trial, inexistente)', async () => {
    for (const planId of ['plan-enterprise', 'plan-profesional', 'plan-que-no-existe', 'plan-trial']) {
      const email = `reg-${crypto.randomUUID().slice(0, 8)}@test.local`;
      const r = await reg({ admin_email: email, plan_id: planId });
      expect(r.status, planId).toBe(201);
      expect(r.body.trialUsed).toBe(false);
      expect(tenantOf(email)).toMatchObject({ plan_id: 'plan-trial', subscription_status: 'trial' });
    }
  });

  it('email que ya usó el trial: cuenta pending con plan trial (sin acceso hasta pagar), no 400 ni plan comercial', async () => {
    const email = `used-${crypto.randomUUID().slice(0, 8)}@test.local`;
    app.db.prepare('INSERT INTO trial_history (id,email,first_tenant_id) VALUES (?,?,?)').run(crypto.randomUUID(), email, 'x');
    const r = await reg({ admin_email: email, plan_id: 'plan-enterprise' });
    expect(r.status).toBe(201);
    expect(r.body.trialUsed).toBe(true);
    expect(tenantOf(email)).toMatchObject({ plan_id: 'plan-trial', subscription_status: 'pending' });
  });

  it('RegisterPage no permite elegir ni enviar un plan', () => {
    const src = read(path.join(FRONT, 'pages/auth/RegisterPage.tsx'));
    expect(src).not.toMatch(/plan_id|planId/);
    expect(src).not.toMatch(/\/public\/plans/);
  });
});

describe('B1 — anular un pago puede reabrir un préstamo por encima del límite (excepción intencional)', () => {
  it('la corrección financiera NO se bloquea, y solo se bloquean nuevas activaciones', async () => {
    const t = app.createTenant({ planSlug: 'starter' });                    // límite 100
    const cid = app.createClient(t.tenantId);
    const [real] = app.fillLoans(t.tenantId, 1, 'approved', cid);
    expect((await call('POST', `/api/loans/${real}/disburse`, t, {})).status).toBe(200);
    const loan = app.db.prepare('SELECT total_balance FROM loans WHERE id=?').get(real) as any;
    const pay = await call('POST', '/api/payments', t, { loan_id: real, amount: loan.total_balance, payment_method: 'cash', payment_type: 'full_payoff' });
    expect(pay.status).toBeLessThan(300);
    expect((app.db.prepare('SELECT status FROM loans WHERE id=?').get(real) as any).status).toBe('liquidated');
    app.fillLoans(t.tenantId, 100, 'active', cid);                           // el tenant llena el límite
    const payId = (app.db.prepare('SELECT id FROM payments WHERE loan_id=?').get(real) as any).id;
    const voided = await call('POST', `/api/payments/${payId}/void`, t, { void_reason: 'corrección' });
    expect(voided.status).toBe(200);                                         // NO se bloquea
    expect((app.db.prepare('SELECT status FROM loans WHERE id=?').get(real) as any).status).toBe('active');
    expect((app.db.prepare("SELECT COUNT(*) c FROM loans WHERE tenant_id=? AND status IN ('active','in_mora')").get(t.tenantId) as any).c).toBe(101);   // excede, a propósito
    const [next] = app.fillLoans(t.tenantId, 1, 'approved', cid);
    expect((await call('POST', `/api/loans/${next}/disburse`, t, {})).body.code).toBe('PLAN_LIMIT_ACTIVE_LOANS');
    expect(read(path.join(ROOT, 'backend', 'src', 'routes', 'payments.ts'))).toMatch(/EXCEPCION INTENCIONAL al limite/);
  });
});

describe('mensual y anual: mismos entitlements (la periodicidad solo cambia billing)', () => {
  it('los 8 mapeos de Whop asignan el mismo plan interno y las mismas features', async () => {
    const SECRET = process.env.WHOP_WEBHOOK_SECRET as string;
    const envs: Record<string, [string, string]> = {
      starter: ['WHOP_PLAN_STARTER', 'WHOP_PLAN_STARTER_ANNUAL'], basico: ['WHOP_PLAN_BASIC', 'WHOP_PLAN_BASIC_ANNUAL'],
      profesional: ['WHOP_PLAN_PROFESSIONAL', 'WHOP_PLAN_PROFESSIONAL_ANNUAL'], enterprise: ['WHOP_PLAN_ENTERPRISE', 'WHOP_PLAN_ENTERPRISE_ANNUAL'],
    };
    for (const [slug, [m, a]] of Object.entries(envs)) { process.env[m] = `fx_${slug}_m`; process.env[a] = `fx_${slug}_a`; }
    const result: Record<string, any> = {};
    for (const slug of Object.keys(envs)) {
      for (const period of ['m', 'a']) {
        const t = app.createTenant({ planSlug: 'starter', status: 'pending', subscriptionEnd: null });
        const raw = JSON.stringify({ type: 'membership.went_valid', data: { id: `mem_${slug}_${period}`, plan_id: `fx_${slug}_${period}`, metadata: { tenant_id: t.tenantId } } });
        await app.req('POST', '/api/billing/whop-webhook', { body: Buffer.from(raw), headers: signWhopWebhook(raw, SECRET) });
        const row = app.db.prepare('SELECT t.billing_cycle bc, p.slug slug, p.features f FROM tenants t JOIN plans p ON p.id=t.plan_id WHERE t.id=?').get(t.tenantId) as any;
        result[`${slug}_${period}`] = row;
      }
    }
    for (const slug of Object.keys(envs)) {
      expect(result[`${slug}_m`].slug).toBe(slug);
      expect(result[`${slug}_a`].slug).toBe(slug);
      expect(result[`${slug}_m`].f).toBe(result[`${slug}_a`].f);
      expect([result[`${slug}_m`].bc, result[`${slug}_a`].bc]).toEqual(['monthly', 'annual']);
    }
  });
});

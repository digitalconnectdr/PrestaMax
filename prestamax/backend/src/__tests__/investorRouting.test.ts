// Redirect del usuario investor al portal (fuente real de roles = TenantContext)
// y botón "Enviar por WhatsApp" de Pagos solo con el permiso efectivo.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { bootTestApp, TestApp } from './helpers/testApp';
import { isInvestorOnly } from '../../../frontend/src/lib/roles';

const FRONT = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src');
const read = (p: string) => fs.readFileSync(path.join(FRONT, p), 'utf8');

let app: TestApp;
beforeAll(async () => { app = await bootTestApp(); });
afterAll(async () => { await app.close(); });

const investorIn = (tenantId: string) => {
  const m = app.addMember(tenantId, ['investor']);
  const invId = crypto.randomUUID();
  app.db.prepare('INSERT INTO investors (id,tenant_id,full_name,email,user_id) VALUES (?,?,?,?,?)')
    .run(invId, tenantId, 'Inv', `i-${invId.slice(0, 6)}@t.test`, m.userId);
  return m;
};
const portal = (m: { token: string }, tenantId: string) =>
  app.req('GET', '/api/portal/investor/summary', { token: m.token, tenantId });
const rolesFromMe = async (token: string): Promise<string[]> => {
  const me = await app.req('GET', '/api/auth/me', { token });
  return (me.body.tenants || [])[0]?.roles || [];
};
const effectiveFromMe = async (token: string): Promise<string[]> => {
  const me = await app.req('GET', '/api/auth/me', { token });
  return (me.body.tenants || [])[0]?.effectivePermissions || [];
};

describe('redirect del investor al portal', () => {
  it('regla: solo quien tiene ÚNICAMENTE el rol investor va al portal; el usuario normal NO', () => {
    expect(isInvestorOnly(['investor'])).toBe(true);
    expect(isInvestorOnly(['investor', 'investor'])).toBe(true);
    for (const roles of [['tenant_owner', 'admin'], ['admin'], ['cobrador'], ['cashier'], ['loan_officer'], ['investor', 'admin'], [], null, undefined]) {
      expect(isInvestorOnly(roles as any), JSON.stringify(roles)).toBe(false);
    }
  });

  it('App.tsx toma los roles de TenantContext (usePermission), no de state.user.currentTenant', () => {
    const app_ = read('App.tsx');
    expect(app_).toMatch(/const \{ roles: userRoles \} = usePermission\(\)/);
    expect(app_).toMatch(/isInvestorOnly\(userRoles\)/);
    expect(app_).not.toMatch(/state\.user as any\)\?\.currentTenant/);
    // y usePermission lee del TenantContext
    expect(read('hooks/usePermission.ts')).toMatch(/tenantState\.currentTenant/);
  });

  it('la fuente de datos existe: /auth/me entrega roles=[investor] en la membresía (lo que carga TenantContext)', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    const inv = investorIn(t.tenantId);
    const roles = await rolesFromMe(inv.token);
    expect(roles).toEqual(['investor']);
    expect(isInvestorOnly(roles)).toBe(true);
    // un usuario normal del mismo tenant NO se enruta al portal
    expect(isInvestorOnly(await rolesFromMe(t.token))).toBe(false);
    const cob = app.addMember(t.tenantId, ['cobrador']);
    expect(isInvestorOnly(await rolesFromMe(cob.token))).toBe(false);
  });

  it('investor + Profesional/Enterprise: el portal responde (llega al portal)', async () => {
    for (const plan of ['profesional', 'enterprise']) {
      const t = app.createTenant({ planSlug: plan });
      const inv = investorIn(t.tenantId);
      expect(isInvestorOnly(await rolesFromMe(inv.token)), plan).toBe(true);
      expect((await portal(inv, t.tenantId)).status, plan).toBe(200);
    }
  });

  it('investor + Trial/Starter/Básico: el backend sigue devolviendo 403 PLAN_FEATURE_REQUIRED (portal bloqueado)', async () => {
    const trial = app.createTenant({ planId: 'plan-trial', status: 'trial' });
    for (const t of [trial, app.createTenant({ planSlug: 'starter' }), app.createTenant({ planSlug: 'basico' })]) {
      const inv = investorIn(t.tenantId);
      expect(isInvestorOnly(await rolesFromMe(inv.token))).toBe(true);     // sigue yendo al portal...
      const r = await portal(inv, t.tenantId);                             // ...donde el backend lo bloquea
      expect(r.status).toBe(403);
      expect(r.body.code).toBe('PLAN_FEATURE_REQUIRED');
      expect(r.body.required_perm).toBe('investors.portal');
    }
  });

  it('el investor tampoco gana acceso al sistema de gestión (403 por rol o plan)', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    const inv = investorIn(t.tenantId);
    for (const u of ['/api/loans', '/api/clients', '/api/payments', '/api/investors', '/api/settings/users']) {
      expect((await app.req('GET', u, { token: inv.token, tenantId: t.tenantId })).status, u).toBe(403);
    }
    expect((await app.req('GET', '/api/search?q=ab', { token: inv.token, tenantId: t.tenantId })).status).toBe(403);
  });

  it('el portal muestra el mensaje amigable cuando el plan no lo incluye', () => {
    const page = read('pages/portal_investor/PortalInvestorPage.tsx');
    expect(page).toMatch(/PLAN_FEATURE_REQUIRED/);
    expect(page).toMatch(/pinv\.plan_blocked_title/);
    const i18n = read('lib/i18n.ts');
    expect(i18n).toMatch(/'pinv\.plan_blocked_title':\s*\{\s*es:\s*'Esta función no está incluida en tu plan'/);
  });
});

describe('botón "Enviar por WhatsApp" en Pagos', () => {
  it('UI: solo se renderiza con can(whatsapp.send)', () => {
    const src = read('pages/payments/PaymentsPage.tsx');
    expect(src).toMatch(/can\('whatsapp\.send'\) && !payment\.isVoided && payment\.clientPhone[\s\S]{0,200}sendWhatsApp\(payment/);
  });

  it('permiso efectivo: Trial/Starter NO tienen whatsapp.send; Básico/Profesional/Enterprise sí (para el rol que lo trae)', async () => {
    const trial = app.createTenant({ planId: 'plan-trial', status: 'trial' });
    const starter = app.createTenant({ planSlug: 'starter' });
    expect(await effectiveFromMe(trial.token)).not.toContain('whatsapp.send');
    expect(await effectiveFromMe(starter.token)).not.toContain('whatsapp.send');
    // aunque el rol lo traiga por defecto (cobrador / cajero), el plan lo recorta
    const cobStarter = app.addMember(starter.tenantId, ['cobrador']);
    expect(await effectiveFromMe(cobStarter.token)).not.toContain('whatsapp.send');
    for (const plan of ['basico', 'profesional', 'enterprise']) {
      const t = app.createTenant({ planSlug: plan });
      expect(await effectiveFromMe(t.token), plan).toContain('whatsapp.send');
      const cob = app.addMember(t.tenantId, ['cobrador']);            // RBAC: el cobrador la trae por rol
      expect(await effectiveFromMe(cob.token), plan).toContain('whatsapp.send');
    }
  });

  it('RBAC existente: Básico+ pero rol sin whatsapp.send (p. ej. un cobrador con la clave revocada) no la ve', async () => {
    const t = app.createTenant({ planSlug: 'basico' });
    const cob = app.addMember(t.tenantId, ['cobrador']);
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run(JSON.stringify({ 'whatsapp.send': false }), cob.membershipId);
    expect(await effectiveFromMe(cob.token)).not.toContain('whatsapp.send');
  });

  it('el módulo de WhatsApp no cambió: sigue protegido por plan (Starter 403, Básico 200)', async () => {
    const s = app.createTenant({ planSlug: 'starter' });
    const b = app.createTenant({ planSlug: 'basico' });
    expect((await app.req('GET', '/api/whatsapp', { token: s.token, tenantId: s.tenantId })).body.code).toBe('PLAN_FEATURE_REQUIRED');
    expect((await app.req('GET', '/api/whatsapp', { token: b.token, tenantId: b.tenantId })).status).toBe(200);
  });
});

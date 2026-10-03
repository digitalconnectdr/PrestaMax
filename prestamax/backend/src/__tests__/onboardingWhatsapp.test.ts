// /onboarding/status protegido con el permiso administrativo existente
// (settings.general) y botones de WhatsApp de la UI solo con can('whatsapp.send').
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { bootTestApp, TestApp } from './helpers/testApp';

const FRONT = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src');
const read = (p: string) => fs.readFileSync(path.join(FRONT, p), 'utf8');

let app: TestApp;
let platformToken = '';
beforeAll(async () => {
  process.env.OWNER_USER_EMAIL = 'platform-owner@test.local';
  app = await bootTestApp();
  const pid = crypto.randomUUID();
  app.db.prepare(`INSERT INTO users (id,email,password_hash,full_name,is_active,platform_role) VALUES (?,?,?,?,1,'none')`)
    .run(pid, 'platform-owner@test.local', 'x', 'Platform Owner');
  platformToken = app.tokenFor(pid);
});
afterAll(async () => { await app.close(); });

const status = (token: string, tenantId: string) => app.req('GET', '/api/onboarding/status', { token, tenantId });
const effective = async (token: string): Promise<string[]> => {
  const me = await app.req('GET', '/api/auth/me', { token });
  return (me.body.tenants || [])[0]?.effectivePermissions || [];
};

describe('/onboarding/status — permiso administrativo (settings.general)', () => {
  it('owner y admin de empresa: acceso, en todos los planes', async () => {
    for (const planId of ['plan-trial', 'plan-starter', 'plan-basico', 'plan-profesional', 'plan-enterprise']) {
      const t = app.createTenant({ planId, status: planId === 'plan-trial' ? 'trial' : 'active' });
      const owner = await status(t.token, t.tenantId);
      expect(owner.status, planId).toBe(200);
      expect(owner.body).toHaveProperty('bankAccount');
      const admin = app.addMember(t.tenantId, ['admin']);
      expect((await status(admin.token, t.tenantId)).status, `${planId} admin`).toBe(200);
    }
  });

  it('cobrador, investor, cajero y oficial (sin permiso administrativo): denegado', async () => {
    const t = app.createTenant({ planSlug: 'profesional' });
    for (const role of ['cobrador', 'collector', 'investor', 'cashier', 'loan_officer', 'oficial']) {
      const m = app.addMember(t.tenantId, [role]);
      const r = await status(m.token, t.tenantId);
      expect(r.status, role).toBe(403);
      expect(JSON.stringify(r.body), role).not.toMatch(/bankAccount|publicRequest/);
    }
    // también denegado en Starter (la ruta no depende de que el rol sea redirigido al portal)
    const s = app.createTenant({ planSlug: 'starter' });
    const cob = app.addMember(s.tenantId, ['cobrador']);
    expect((await status(cob.token, s.tenantId)).status).toBe(403);
  });

  it('un permiso explícito revocado quita el acceso incluso a un admin; el plan sigue siendo techo', async () => {
    const t = app.createTenant({ planSlug: 'basico' });
    const admin = app.addMember(t.tenantId, ['admin']);
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run(JSON.stringify({ 'settings.general': false }), admin.membershipId);
    expect((await status(admin.token, t.tenantId)).status).toBe(403);
  });

  it('Platform Admin conserva su bypass técnico', async () => {
    const t = app.createTenant({ planSlug: 'starter' });
    expect((await status(platformToken, t.tenantId)).status).toBe(200);
  });

  it('aislamiento por tenant: cada empresa ve solo su estado y no puede consultar otra', async () => {
    const a = app.createTenant({ planSlug: 'basico' });
    const b = app.createTenant({ planSlug: 'basico' });
    app.createClient(a.tenantId);
    app.fillLoans(a.tenantId, 1, 'active');
    const ra = await status(a.token, a.tenantId);
    const rb = await status(b.token, b.tenantId);
    expect(ra.body.client).toBe(true);
    expect(ra.body.loan).toBe(true);
    expect(rb.body.client).toBe(false);
    expect(rb.body.loan).toBe(false);
    // el owner de A no puede usar el X-Tenant-Id de B
    expect((await status(a.token, b.tenantId)).status).toBe(403);
  });

  it('UI: "Primeros pasos" solo con settings.general (misma autorización que el backend)', () => {
    const dash = read('pages/dashboard/DashboardPage.tsx');
    expect(dash).toMatch(/can\('settings\.general'\) && <OnboardingChecklist \/>/);
    expect(dash).toMatch(/import \{ usePermission \} from '@\/hooks\/usePermission'/);
  });
});

describe('WhatsApp en Mi Cartera y demás botones visibles', () => {
  it('permiso efectivo: Trial/Starter ocultan; Básico+ muestran según RBAC (cobrador sí, con la clave revocada no)', async () => {
    const trial = app.createTenant({ planId: 'plan-trial', status: 'trial' });
    const starter = app.createTenant({ planSlug: 'starter' });
    expect(await effective(trial.token)).not.toContain('whatsapp.send');
    expect(await effective(starter.token)).not.toContain('whatsapp.send');
    expect(await effective(app.addMember(starter.tenantId, ['cobrador']).token)).not.toContain('whatsapp.send');
    for (const plan of ['basico', 'profesional', 'enterprise']) {
      const t = app.createTenant({ planSlug: plan });
      expect(await effective(t.token), plan).toContain('whatsapp.send');
      expect(await effective(app.addMember(t.tenantId, ['cobrador']).token), plan).toContain('whatsapp.send');
    }
    const b = app.createTenant({ planSlug: 'basico' });
    const revoked = app.addMember(b.tenantId, ['cobrador']);
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run(JSON.stringify({ 'whatsapp.send': false }), revoked.membershipId);
    expect(await effective(revoked.token)).not.toContain('whatsapp.send');
  });

  it('UI Mi Cartera: el enlace de WhatsApp de cada préstamo y el de "después del pago" requieren can(whatsapp.send)', () => {
    const src = read('pages/collections/CollectionsPage.tsx');
    expect(src).toMatch(/can\('whatsapp\.send'\) && \(loan\.whatsapp \|\| loan\.phonePersonal\)[\s\S]{0,120}https:\/\/wa\.me\//);
    expect(src).toMatch(/can\('whatsapp\.send'\) && \(\s*<button type="button" onClick=\{\(\) => \{[^\n]*sendReceiptByWhatsApp/);
  });

  it('UI: todos los botones de WhatsApp del tenant están protegidos (Pagos, Préstamo, Calculadora)', () => {
    expect(read('pages/payments/PaymentsPage.tsx')).toMatch(/can\('whatsapp\.send'\) && !payment\.isVoided && payment\.clientPhone/);
    expect(read('pages/payments/PaymentsPage.tsx')).toMatch(/can\('whatsapp\.send'\) && \(\s*<button type="button" onClick=\{\(\) => \{[^\n]*sendReceiptByWhatsApp/);
    expect(read('pages/loans/LoanDetailPage.tsx')).toMatch(/can\('whatsapp\.send'\) && loan\.clientWhatsapp/);
    expect(read('pages/loans/LoanDetailPage.tsx')).toMatch(/can\('whatsapp\.send'\) && \(\s*<button\s+type="button"[\s\S]{0,400}sendReceiptByWhatsApp/);
    expect(read('pages/calculator/LoanCalculatorPage.tsx')).toMatch(/can\('whatsapp\.send'\) && \(\s*<button[\s\S]{0,1800}Compartir por WhatsApp/);
  });

  it('el módulo de WhatsApp no cambió: Starter 403 por plan, Básico 200', async () => {
    const s = app.createTenant({ planSlug: 'starter' });
    const b = app.createTenant({ planSlug: 'basico' });
    expect((await app.req('GET', '/api/whatsapp', { token: s.token, tenantId: s.tenantId })).body.code).toBe('PLAN_FEATURE_REQUIRED');
    expect((await app.req('GET', '/api/whatsapp', { token: b.token, tenantId: b.tenantId })).status).toBe(200);
  });
});

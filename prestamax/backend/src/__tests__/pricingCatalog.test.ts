// Pricing v2: catálogo comercial, migración idempotente y matriz de features.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootTestApp, TestApp } from './helpers/testApp';
import { validatePlanFeatures } from '../lib/permissions';
import {
  PLAN_CATALOG, STARTER_FEATURES, BASICO_FEATURES, PROFESIONAL_FEATURES, ENTERPRISE_FEATURES,
  TRIAL_PLAN, PRICING_V2_MIGRATION_KEY,
} from '../db/planCatalog';
import { computeAnnualPricing } from '../../../frontend/src/lib/pricing';

const feats = (row: any): string[] => JSON.parse(row.features);
const plan = (app: TestApp, slug: string) => app.db.prepare('SELECT * FROM plans WHERE slug=?').get(slug) as any;

let app: TestApp;
beforeAll(async () => { app = await bootTestApp(); });
afterAll(async () => { await app.close(); });

describe('pricing v2 — precios y límites sembrados', () => {

  it('precios mensuales definitivos', () => {
    expect(plan(app, 'starter').price_monthly).toBe(9.99);
    expect(plan(app, 'basico').price_monthly).toBe(24.99);
    expect(plan(app, 'profesional').price_monthly).toBe(49.99);
    expect(plan(app, 'enterprise').price_monthly).toBe(99.99);
  });

  it('clientes ilimitados (-1) en los cuatro planes', () => {
    for (const s of ['starter', 'basico', 'profesional', 'enterprise']) expect(plan(app, s).max_clients).toBe(-1);
  });

  it('préstamos activos: 100 / 500 / 2000 / ilimitado', () => {
    expect(plan(app, 'starter').max_active_loans).toBe(100);
    expect(plan(app, 'basico').max_active_loans).toBe(500);
    expect(plan(app, 'profesional').max_active_loans).toBe(2000);
    expect(plan(app, 'enterprise').max_active_loans).toBe(-1);
  });

  it('usuarios totales y cobradores (los cobradores van DENTRO de los usuarios)', () => {
    const lim = (s: string) => { const p = plan(app, s); return [p.max_users, p.max_collectors]; };
    expect(lim('starter')).toEqual([3, 1]);
    expect(lim('basico')).toEqual([8, 3]);
    expect(lim('profesional')).toEqual([20, 10]);
    expect(lim('enterprise')).toEqual([-1, -1]);
    for (const s of ['starter', 'basico', 'profesional']) {
      const p = plan(app, s);
      expect(p.max_collectors).toBeLessThan(p.max_users);
    }
  });

  it('el trial refleja Starter: clientes ilimitados, 100 préstamos, 3 usuarios, 1 cobrador, features Starter', () => {
    const t = app.db.prepare("SELECT * FROM plans WHERE id='plan-trial'").get() as any;
    expect([t.max_clients, t.max_active_loans, t.max_users, t.max_collectors]).toEqual([-1, 100, 3, 1]);
    expect(feats(t).sort()).toEqual([...STARTER_FEATURES].sort());
    expect(t.trial_days).toBe(14);
    expect(t.is_trial_default).toBe(1);
  });

  it('existe el índice loans(tenant_id,status)', () => {
    const idx = app.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_loans_tenant_status'").get();
    expect(idx).toBeTruthy();
  });

  it('el catálogo en código coincide con lo sembrado', () => {
    for (const c of PLAN_CATALOG) {
      const p = plan(app, c.slug);
      expect([p.price_monthly, p.max_clients, p.max_active_loans, p.max_users, p.max_collectors])
        .toEqual([c.price, c.maxClients, c.maxActiveLoans, c.maxUsers, c.maxCollectors]);
      expect(feats(p).sort()).toEqual([...c.features].sort());
    }
  });
});

describe('pricing v2 — anual = 9 mensualidades', () => {
  it('montos anuales exactos y equivalentes mensuales', () => {
    const exp: Record<string, [number, number]> = {
      '9.99': [89.91, 7.49], '24.99': [224.91, 18.74], '49.99': [449.91, 37.49], '99.99': [899.91, 74.99],
    };
    for (const c of PLAN_CATALOG) {
      const a = computeAnnualPricing(c.price);
      expect([a.annual, a.monthlyEquivalent]).toEqual(exp[String(c.price)]);
      expect(a.annual).toBeCloseTo(c.price * 9, 2);
    }
  });
});

describe('pricing v2 — matriz de features', () => {
  const set = (a: string[]) => new Set(a);

  it('todas las claves son PermKeys válidas', () => {
    for (const c of PLAN_CATALOG) expect(validatePlanFeatures(c.features).invalid).toEqual([]);
    expect(validatePlanFeatures(TRIAL_PLAN.features).invalid).toEqual([]);
  });

  it('cada plan incluye al anterior (Starter ⊂ Básico ⊂ Profesional ⊂ Enterprise)', () => {
    const [s, b, p, e] = [STARTER_FEATURES, BASICO_FEATURES, PROFESIONAL_FEATURES, ENTERPRISE_FEATURES];
    for (const k of s) expect(set(b).has(k)).toBe(true);
    for (const k of b) expect(set(p).has(k)).toBe(true);
    for (const k of p) expect(set(e).has(k)).toBe(true);
  });

  it('Starter NO tiene promesas ni tareas de cobranza, pero sí cobranza básica', () => {
    const s = set(STARTER_FEATURES);
    for (const k of ['collections.promises', 'collections.tasks', 'collections.tasks.manage']) expect(s.has(k)).toBe(false);
    for (const k of ['collections.view', 'collections.notes', 'collections.manage', 'payments.create', 'receipts.view', 'calculator.use', 'reports.dashboard']) expect(s.has(k)).toBe(true);
  });

  it('Starter NO tiene contratos, WhatsApp, CSV, ingresos ni reportes avanzados', () => {
    const s = set(STARTER_FEATURES);
    for (const k of ['contracts.view', 'whatsapp.send', 'loans.import', 'income.view', 'reports.advanced', 'reports.collections', 'settings.branches', 'requests.view', 'investors.view']) expect(s.has(k)).toBe(false);
  });

  it('Básico SÍ tiene cobranza avanzada, contratos, WhatsApp, CSV, ingresos y reportes avanzados', () => {
    const b = set(BASICO_FEATURES);
    for (const k of ['collections.promises', 'collections.tasks', 'collections.tasks.manage', 'contracts.create', 'whatsapp.send', 'loans.import', 'income.create', 'reports.collections', 'reports.advanced']) expect(b.has(k)).toBe(true);
  });

  it('Básico NO tiene sucursales, solicitudes públicas ni inversionistas ni proyecciones', () => {
    const b = set(BASICO_FEATURES);
    for (const k of ['settings.branches', 'requests.view', 'requests.approve', 'requests.reject', 'requests.convert', 'investors.view', 'investors.portal', 'reports.projection', 'reports.income', 'loans.write_off', 'payments.edit', 'loans.consolidate', 'loans.approve_high_value']) expect(b.has(k)).toBe(false);
  });

  it('Profesional SÍ tiene sucursales, solicitudes, inversionistas, proyecciones y extras; NO DataCrédito', () => {
    const p = set(PROFESIONAL_FEATURES);
    for (const k of ['settings.branches', 'requests.view', 'requests.convert', 'investors.view', 'investors.portal', 'reports.projection', 'reports.income', 'loans.write_off', 'payments.edit', 'loans.approve_high_value', 'loans.consolidate']) expect(p.has(k)).toBe(true);
    expect(p.has('reports.datacredito')).toBe(false);
  });

  it('Enterprise conserva DataCrédito', () => {
    expect(set(ENTERPRISE_FEATURES).has('reports.datacredito')).toBe(true);
  });
});

describe('pricing v2 — migración única e idempotente', () => {

  it('no se repite y respeta ediciones posteriores del Admin', async () => {
    const { applyPricingV2Migration } = await import('../db/database');
    // Ya aplicada al arrancar (base nueva): quedó registrada.
    expect(app.db.prepare('SELECT 1 FROM app_migrations WHERE key=?').get(PRICING_V2_MIGRATION_KEY)).toBeTruthy();
    // El Admin cambia el precio después...
    app.db.prepare("UPDATE plans SET price_monthly=12.5 WHERE slug='starter'").run();
    // ...y volver a correr la migración NO lo pisa.
    expect(applyPricingV2Migration(app.db).applied).toBe(false);
    expect(plan(app, 'starter').price_monthly).toBe(12.5);
    app.db.prepare("UPDATE plans SET price_monthly=9.99 WHERE slug='starter'").run();
  });

  it('actualiza planes LEGACY por slug aunque su id sea distinto, sin tocar tenants', async () => {
    const { applyPricingV2Migration } = await import('../db/database');
    // Simula una BD vieja: 'basico' con id UUID, valores viejos y migración sin registrar.
    app.db.prepare("UPDATE plans SET id='legacy-uuid-basico', price_monthly=59.99, max_clients=500, max_users=8, max_collectors=3, max_active_loans=-1, features='[\"clients.view\"]' WHERE slug='basico'").run();
    app.db.prepare("UPDATE plans SET price_monthly=249.99, max_clients=-1 WHERE slug='enterprise'").run();
    app.db.prepare("UPDATE plans SET max_clients=50, max_active_loans=-1, max_users=2, max_collectors=1 WHERE id='plan-trial'").run();
    const legacyTenant = app.createTenant({ planId: 'legacy-uuid-basico' });
    const orphan = app.createTenant({ planSlug: 'starter' });
    app.db.prepare('UPDATE tenants SET plan_id=NULL WHERE id=?').run(orphan.tenantId);
    const beforeTenants = app.db.prepare('SELECT id,plan_id,subscription_status,subscription_end,whop_membership_id FROM tenants ORDER BY id').all();
    app.db.prepare('DELETE FROM app_migrations WHERE key=?').run(PRICING_V2_MIGRATION_KEY);

    expect(applyPricingV2Migration(app.db).applied).toBe(true);

    const b = plan(app, 'basico');
    expect(b.id).toBe('legacy-uuid-basico');            // id legacy intacto
    expect([b.price_monthly, b.max_clients, b.max_active_loans]).toEqual([24.99, -1, 500]);
    expect(feats(b).sort()).toEqual([...BASICO_FEATURES].sort());
    expect(plan(app, 'enterprise').price_monthly).toBe(99.99);
    const t = app.db.prepare("SELECT * FROM plans WHERE id='plan-trial'").get() as any;
    expect([t.max_clients, t.max_active_loans, t.max_users, t.max_collectors]).toEqual([-1, 100, 3, 1]);
    // Tenants y suscripciones intactos; el tenant sin plan sigue sin plan.
    expect(app.db.prepare('SELECT id,plan_id,subscription_status,subscription_end,whop_membership_id FROM tenants ORDER BY id').all()).toEqual(beforeTenants);
    expect((app.db.prepare('SELECT plan_id FROM tenants WHERE id=?').get(orphan.tenantId) as any).plan_id).toBeNull();
    expect((app.db.prepare('SELECT plan_id FROM tenants WHERE id=?').get(legacyTenant.tenantId) as any).plan_id).toBe('legacy-uuid-basico');
  });
});

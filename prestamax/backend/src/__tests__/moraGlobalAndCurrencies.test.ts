// Mora global -> instantánea por préstamo, y unificación de monedas de operación.
//  - La mora global (tenant_settings) es el default de préstamos NUEVOS; cada préstamo
//    guarda su propia instantánea y los cambios posteriores en la global no la afectan.
//  - Aplica a los 4 caminos de creación: manual, solicitud convertida, consolidación y CSV.
//  - Monedas: DOP siempre; multimoneda derivada; el backend valida la moneda de préstamos
//    NUEVOS; los históricos en moneda deshabilitada siguen operando.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { bootTestApp, TestApp } from './helpers/testApp';
import { resolveMoraConfig, validateMoraInput, SYSTEM_MORA_DEFAULTS } from '../lib/moraConfig';
import { normalizeEnabledCurrencies, CURRENCY_CATALOG, getEnabledCurrencies } from '../lib/currencies';
import { calcMoraDetails } from '../lib/calculations';
import { parseGeneralSection, isLegacySectionAlias, GENERAL_SECTION_IDS } from '../../../frontend/src/lib/generalSections';
import { normalizeSelection, toggleSelection, summarizeSelection, deriveMultiCurrency, parseStoredCurrencies } from '../../../frontend/src/lib/currencyOptions';

let app: TestApp;
beforeAll(async () => { app = await bootTestApp(); });
afterAll(async () => { await app.close(); });

type T = { token: string; tenantId: string };
const newTenant = (): T => app.createTenant({ planSlug: 'enterprise' });
const call = (t: T, method: string, url: string, body?: any) => app.req(method, url, { token: t.token, tenantId: t.tenantId, body });
const setMora = (t: T, body: any) => call(t, 'PUT', '/api/settings/mora', body);
const loanRow = (id: string) => app.db.prepare('SELECT * FROM loans WHERE id=?').get(id) as any;
const moraOf = (r: any) => ({ rate: r.mora_rate_daily, grace: r.mora_grace_days, base: r.mora_base, fixed: r.mora_fixed_enabled, amt: r.mora_fixed_amount });

const GLOBAL = { mora_rate_daily: 0.005, mora_grace_days: 7, mora_base: 'capital_pendiente', mora_fixed_enabled: 1, mora_fixed_amount: 250 };
const GLOBAL_EXPECTED = { rate: 0.005, grace: 7, base: 'capital_pendiente', fixed: 1, amt: 250 };
const DEFAULTS = { rate: 0.001, grace: 3, base: 'cuota_vencida', fixed: 0, amt: 0 };

async function createManualLoan(t: T, extra: any = {}) {
  const clientId = app.createClient(t.tenantId);
  const productId = app.createProduct(t.tenantId);
  return call(t, 'POST', '/api/loans', { client_id: clientId, product_id: productId, requested_amount: 5000, term: 6, ...extra });
}
async function importLoan(t: T, extra: any = {}) {
  const r = await call(t, 'POST', '/api/loans/bulk-import', { loans: [{
    client_name: 'Importado Prueba', client_phone: '809-555-' + (1000 + Math.floor(Math.random() * 8999)),
    client_id_number: 'IMP-' + crypto.randomUUID().slice(0, 8), loan_amount: '1000', interest_rate: '5', term_months: '6',
    payment_frequency: 'monthly', ...extra,
  }] });
  return r;
}
function convertRequest(t: T, productId: string) {
  const reqId = crypto.randomUUID();
  app.db.prepare(`INSERT INTO loan_requests (id,tenant_id,client_name,client_phone,id_number,loan_amount,loan_term,status)
    VALUES (?,?,?,?,?,?,?, 'approved')`).run(reqId, t.tenantId, 'Solicitante', '809-555-0000', 'REQ-' + crypto.randomUUID().slice(0, 8), 3000, 6);
  return call(t, 'PUT', `/api/loan-requests/${reqId}/convert`, { product_id: productId, rate: 5, term: 6 });
}
function consolidate(t: T) {
  const clientId = app.createClient(t.tenantId);
  const [a, b] = app.fillLoans(t.tenantId, 2, 'active', clientId);
  for (const id of [a, b]) app.db.prepare('UPDATE loans SET principal_balance=1000, total_balance=1000 WHERE id=?').run(id);
  const productId = app.createProduct(t.tenantId);
  return { ids: [a, b], run: () => call(t, 'POST', '/api/loans/consolidate', { loan_ids: [a, b], product_id: productId, rate: 5, term: 6 }) };
}

describe('mora: resolvedor (precedencia explícito > global > sistema)', () => {
  it('sin configuración: constantes del sistema; tenant sin fila de settings también', () => {
    const t = newTenant();
    expect(moraOf(resolveMoraConfig(app.db, t.tenantId) as any)).toEqual({ rate: 0.001, grace: 3, base: 'cuota_vencida', fixed: 0, amt: 0 });
    app.db.prepare('DELETE FROM tenant_settings WHERE tenant_id=?').run(t.tenantId);
    const r = resolveMoraConfig(app.db, t.tenantId);
    expect(r.mora_rate_daily).toBe(SYSTEM_MORA_DEFAULTS.mora_rate_daily);
    expect(r.mora_grace_days).toBe(SYSTEM_MORA_DEFAULTS.mora_grace_days);
    expect(r.sources.mora_rate_daily).toBe('system');
  });

  it('global válida > sistema; explícito > global; cada campo se resuelve por separado', async () => {
    const t = newTenant();
    expect((await setMora(t, GLOBAL)).status).toBe(200);
    const g = resolveMoraConfig(app.db, t.tenantId);
    expect(g.sources.mora_rate_daily).toBe('tenant');
    const e = resolveMoraConfig(app.db, t.tenantId, { mora_rate_daily: 0.02 });
    expect(e.mora_rate_daily).toBe(0.02);
    expect(e.sources.mora_rate_daily).toBe('loan');
    expect(e.mora_grace_days).toBe(7);                       // el resto sigue viniendo de la global
    expect(e.sources.mora_grace_days).toBe('tenant');
  });

  it('valores globales inválidos guardados (negativo, base desconocida) se ignoran y caen al sistema', () => {
    const t = newTenant();
    app.db.prepare("UPDATE tenant_settings SET mora_rate_daily=-0.002, mora_grace_days=5, mora_base='raro', mora_fixed_amount=-1 WHERE tenant_id=?").run(t.tenantId);
    const r = resolveMoraConfig(app.db, t.tenantId);
    expect(r.mora_rate_daily).toBe(0.001);                   // inválida -> sistema
    expect(r.mora_grace_days).toBe(5);                       // válida -> global
    expect(r.mora_base).toBe('cuota_vencida');
    expect(r.mora_fixed_amount).toBe(0);
  });

  it('valida entradas: tasa fuera de rango, gracia no entera, base desconocida, monto negativo', () => {
    expect(validateMoraInput({ mora_rate_daily: -0.1 })).toBeTruthy();
    expect(validateMoraInput({ mora_rate_daily: 5 })).toBeTruthy();
    expect(validateMoraInput({ mora_grace_days: 1.5 })).toBeTruthy();
    expect(validateMoraInput({ mora_grace_days: -1 })).toBeTruthy();
    expect(validateMoraInput({ mora_base: 'xyz' })).toBeTruthy();
    expect(validateMoraInput({ mora_fixed_amount: -5 })).toBeTruthy();
    expect(validateMoraInput({ mora_rate_daily: 0, mora_grace_days: 0, mora_base: 'cuota', mora_fixed_enabled: false, mora_fixed_amount: 0 })).toBeNull();
    expect(validateMoraInput({})).toBeNull();
  });

  it('PUT /settings/mora rechaza valores inválidos con 400 y no modifica nada', async () => {
    const t = newTenant();
    await setMora(t, GLOBAL);
    for (const bad of [{ mora_rate_daily: -1 }, { mora_grace_days: 2.5 }, { mora_base: 'zzz' }, { mora_fixed_amount: -3 }]) {
      expect((await setMora(t, bad)).status).toBe(400);
    }
    const row = app.db.prepare('SELECT * FROM tenant_settings WHERE tenant_id=?').get(t.tenantId) as any;
    expect({ rate: row.mora_rate_daily, grace: row.mora_grace_days, base: row.mora_base, fixed: row.mora_fixed_enabled, amt: row.mora_fixed_amount }).toEqual(GLOBAL_EXPECTED);
  });
});

describe('mora: creación manual', () => {
  it('sin configuración global: usa las constantes del sistema (comportamiento actual)', async () => {
    const t = newTenant();
    const r = await createManualLoan(t);
    expect(r.status).toBe(201);
    expect(moraOf(loanRow(r.body.id))).toEqual(DEFAULTS);
  });

  it('el préstamo nuevo recibe la mora global (tasa, gracia, base, cargo fijo)', async () => {
    const t = newTenant();
    await setMora(t, GLOBAL);
    const r = await createManualLoan(t);
    expect(r.status).toBe(201);
    expect(moraOf(loanRow(r.body.id))).toEqual(GLOBAL_EXPECTED);
  });

  it('el override explícito del préstamo prevalece; lo no indicado viene de la global; gracia 0 es válida', async () => {
    const t = newTenant();
    await setMora(t, GLOBAL);
    const r = await createManualLoan(t, { mora_rate_daily: 0.002, mora_grace_days: 0 });
    expect(r.status).toBe(201);
    expect(moraOf(loanRow(r.body.id))).toEqual({ ...GLOBAL_EXPECTED, rate: 0.002, grace: 0 });
  });

  it('override inválido en la creación -> 400 y no se crea el préstamo', async () => {
    const t = newTenant();
    const before = (app.db.prepare('SELECT COUNT(*) c FROM loans WHERE tenant_id=?').get(t.tenantId) as any).c;
    const r = await createManualLoan(t, { mora_rate_daily: -1 });
    expect(r.status).toBe(400);
    expect((app.db.prepare('SELECT COUNT(*) c FROM loans WHERE tenant_id=?').get(t.tenantId) as any).c).toBe(before);
  });

  it('un cambio posterior en la global NO modifica préstamos existentes; los nuevos sí lo reciben', async () => {
    const t = newTenant();
    await setMora(t, GLOBAL);
    const first = await createManualLoan(t);
    await setMora(t, { mora_rate_daily: 0.01, mora_grace_days: 1, mora_base: 'capital_vencido', mora_fixed_enabled: 0, mora_fixed_amount: 0 });
    expect(moraOf(loanRow(first.body.id))).toEqual(GLOBAL_EXPECTED);          // intacto
    const second = await createManualLoan(t);
    expect(moraOf(loanRow(second.body.id))).toEqual({ rate: 0.01, grace: 1, base: 'capital_vencido', fixed: 0, amt: 0 });
  });

  it('editar la mora de un préstamo afecta solo a ese préstamo (no a otros ni a la global)', async () => {
    const t = newTenant();
    await setMora(t, GLOBAL);
    const a = await createManualLoan(t);
    const b = await createManualLoan(t);
    const edit = await call(t, 'PUT', `/api/loans/${a.body.id}`, { mora_rate_daily: 0.02, mora_grace_days: 0, mora_base: 'cuota_vencida', mora_fixed_enabled: 0, mora_fixed_amount: 0 });
    expect(edit.status).toBe(200);
    expect(moraOf(loanRow(a.body.id))).toEqual({ rate: 0.02, grace: 0, base: 'cuota_vencida', fixed: 0, amt: 0 });
    expect(moraOf(loanRow(b.body.id))).toEqual(GLOBAL_EXPECTED);
    const row = app.db.prepare('SELECT mora_rate_daily r, mora_grace_days g FROM tenant_settings WHERE tenant_id=?').get(t.tenantId) as any;
    expect(row).toEqual({ r: 0.005, g: 7 });
  });

  it('valores legacy loan_products.mora_* SIN el flag de personalización no cuentan (la global manda)', async () => {
    const t = newTenant();
    await setMora(t, GLOBAL);
    const productId = app.createProduct(t.tenantId);
    app.db.prepare('UPDATE loan_products SET mora_rate_daily=0.009, mora_grace_days=9 WHERE id=?').run(productId);
    const clientId = app.createClient(t.tenantId);
    const r = await call(t, 'POST', '/api/loans', { client_id: clientId, product_id: productId, requested_amount: 5000, term: 6 });
    expect(moraOf(loanRow(r.body.id))).toEqual(GLOBAL_EXPECTED);
  });
});

describe('mora: tasa 0, cargo fijo y base se respetan en el cálculo', () => {
  it('tasa global 0 y gracia 0 son válidas: el préstamo guarda 0/0 (no 0.001/3)', async () => {
    const t = newTenant();
    expect((await setMora(t, { mora_rate_daily: 0, mora_grace_days: 0 })).status).toBe(200);
    const r = await createManualLoan(t);
    const m = moraOf(loanRow(r.body.id));
    expect(m.rate).toBe(0);
    expect(m.grace).toBe(0);
  });

  const inst = [{ id: 'i1', status: 'overdue', due_date: '2030-01-01', principal_amount: 800, interest_amount: 200, paid_total: 0, paid_principal: 0 }];
  const asOf = new Date('2030-01-11T12:00:00Z');   // 10 días de atraso

  it('calcMoraDetails: tasa 0 produce mora 0 (antes caía a 0.001)', () => {
    const d = calcMoraDetails({ mora_rate_daily: 0, mora_grace_days: 0, mora_base: 'cuota_vencida' }, inst, asOf);
    expect(d.i1.days).toBe(10);
    expect(d.i1.amount).toBe(0);
  });
  it('calcMoraDetails: gracia 0 cuenta desde el primer día; con gracia 3 descuenta 3', () => {
    expect(calcMoraDetails({ mora_rate_daily: 0.01, mora_grace_days: 0, mora_base: 'cuota_vencida' }, inst, asOf).i1.days).toBe(10);
    expect(calcMoraDetails({ mora_rate_daily: 0.01, mora_grace_days: 3, mora_base: 'cuota_vencida' }, inst, asOf).i1.days).toBe(7);
  });
  it('calcMoraDetails: cargo fijo reemplaza la tasa; base capital_pendiente usa solo capital', () => {
    expect(calcMoraDetails({ mora_rate_daily: 0.01, mora_grace_days: 0, mora_fixed_enabled: 1, mora_fixed_amount: 250 }, inst, asOf).i1.amount).toBe(250);
    expect(calcMoraDetails({ mora_rate_daily: 0.01, mora_grace_days: 0, mora_base: 'cuota_vencida' }, inst, asOf).i1.amount).toBe(100);      // 1000 * 1% * 10
    expect(calcMoraDetails({ mora_rate_daily: 0.01, mora_grace_days: 0, mora_base: 'capital_pendiente' }, inst, asOf).i1.amount).toBe(80);    // 800 * 1% * 10
  });
  it('lo guardado por la global (cargo fijo + base) llega al préstamo y el cálculo lo usa', async () => {
    const t = newTenant();
    await setMora(t, GLOBAL);
    const r = await createManualLoan(t);
    const l = loanRow(r.body.id);
    expect(calcMoraDetails(l, inst, asOf).i1.amount).toBe(250);
  });
});

describe('mora: los otros tres caminos de creación aplican el mismo resolvedor', () => {
  it('solicitud convertida', async () => {
    const t = newTenant();
    await setMora(t, GLOBAL);
    const productId = app.createProduct(t.tenantId);
    const r = await convertRequest(t, productId);
    expect(r.status).toBeLessThan(300);
    const loan = app.db.prepare('SELECT * FROM loans WHERE tenant_id=? ORDER BY created_at DESC LIMIT 1').get(t.tenantId) as any;
    expect(moraOf(loan)).toEqual(GLOBAL_EXPECTED);
  });

  it('solicitud convertida sin global: constantes del sistema (sin regresión)', async () => {
    const t = newTenant();
    const productId = app.createProduct(t.tenantId);
    const r = await convertRequest(t, productId);
    expect(r.status).toBeLessThan(300);
    const loan = app.db.prepare('SELECT * FROM loans WHERE tenant_id=?').get(t.tenantId) as any;
    expect(moraOf(loan)).toEqual(DEFAULTS);
  });

  it('consolidación', async () => {
    const t = newTenant();
    await setMora(t, GLOBAL);
    const c = consolidate(t);
    const r = await c.run();
    expect(r.status).toBe(201);
    expect(moraOf(loanRow(r.body.id))).toEqual(GLOBAL_EXPECTED);
  });

  it('importación CSV', async () => {
    const t = newTenant();
    await setMora(t, GLOBAL);
    const r = await importLoan(t);
    expect(r.status).toBe(200);
    expect(r.body.summary.created).toBe(1);
    const loan = app.db.prepare('SELECT * FROM loans WHERE tenant_id=?').get(t.tenantId) as any;
    expect(moraOf(loan)).toEqual(GLOBAL_EXPECTED);
  });

  it('importación CSV: tasa 0 y gracia 0 globales se conservan', async () => {
    const t = newTenant();
    await setMora(t, { mora_rate_daily: 0, mora_grace_days: 0 });
    await importLoan(t);
    const loan = app.db.prepare('SELECT * FROM loans WHERE tenant_id=?').get(t.tenantId) as any;
    expect(loan.mora_rate_daily).toBe(0);
    expect(loan.mora_grace_days).toBe(0);
  });

  it('ningún camino de creación usa 0.001 / 3 literales (todos usan el resolvedor)', () => {
    const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', 'routes', p), 'utf8');
    const loans = read('loans.ts');
    const requests = read('loanRequests.ts');
    expect(loans).not.toMatch(/mora_rate_daily\s*\|\|\s*0\.001/);
    expect(loans).not.toMatch(/mora_grace_days\s*\|\|\s*3/);
    expect(requests).not.toMatch(/mora_rate_daily\s*\|\|\s*0\.001/);
    expect(requests).not.toMatch(/mora_grace_days\s*\|\|\s*3/);
    expect(loans).not.toMatch(/0\.001,\s*3,\s*\?/);                    // el literal del INSERT de CSV
    expect((loans.match(/resolveMoraConfig\(/g) || []).length).toBe(3);   // manual, consolidación, CSV
    expect((requests.match(/resolveMoraConfig\(/g) || []).length).toBe(1);
  });
});

describe('monedas: catálogo y reglas de DOP / multimoneda', () => {
  it('catálogo de 12 monedas, DOP primera', () => {
    expect(CURRENCY_CATALOG).toHaveLength(12);
    expect(CURRENCY_CATALOG[0]).toBe('DOP');
  });

  it('DOP siempre disponible; solo catálogo; sin duplicados', () => {
    expect(normalizeEnabledCurrencies([])).toEqual(['DOP']);
    expect(normalizeEnabledCurrencies(['usd', 'USD', 'XXX'])).toEqual(['DOP', 'USD']);
    expect(normalizeEnabledCurrencies(undefined)).toEqual(['DOP']);
  });

  it('una moneda adicional activa multimoneda; quitar todas la desactiva (vía PUT /settings/tenant)', async () => {
    const t = newTenant();
    const on = await call(t, 'PUT', '/api/settings/tenant', { enabled_currencies: ['USD'] });
    expect(on.status).toBe(200);
    expect(on.body.enabled_currencies).toEqual(['DOP', 'USD']);
    let row = app.db.prepare('SELECT multi_currency_enabled m, enabled_currencies e FROM tenant_settings WHERE tenant_id=?').get(t.tenantId) as any;
    expect(row.m).toBe(1);
    expect(JSON.parse(row.e)).toEqual(['DOP', 'USD']);
    expect(getEnabledCurrencies(app.db, t.tenantId)).toEqual(['DOP', 'USD']);

    const off = await call(t, 'PUT', '/api/settings/tenant', { enabled_currencies: [] });
    expect(off.status).toBe(200);
    row = app.db.prepare('SELECT multi_currency_enabled m, enabled_currencies e FROM tenant_settings WHERE tenant_id=?').get(t.tenantId) as any;
    expect(row.m).toBe(0);
    expect(JSON.parse(row.e)).toEqual(['DOP']);
    expect(getEnabledCurrencies(app.db, t.tenantId)).toEqual(['DOP']);
  });

  it('DOP no se puede quitar: enviar solo USD deja DOP + USD', async () => {
    const t = newTenant();
    await call(t, 'PUT', '/api/settings/tenant', { enabled_currencies: ['EUR'] });
    expect(getEnabledCurrencies(app.db, t.tenantId)).toEqual(['DOP', 'EUR']);
  });

  it('moneda fuera del catálogo -> 400 y NO se guarda nada (ni los datos de empresa)', async () => {
    const t = newTenant();
    const before = (app.db.prepare('SELECT name FROM tenants WHERE id=?').get(t.tenantId) as any).name;
    const r = await call(t, 'PUT', '/api/settings/tenant', { name: 'Nombre Nuevo', enabled_currencies: ['USD', 'ZZZ'] });
    expect(r.status).toBe(400);
    expect((app.db.prepare('SELECT name FROM tenants WHERE id=?').get(t.tenantId) as any).name).toBe(before);
    expect(getEnabledCurrencies(app.db, t.tenantId)).toEqual(['DOP']);
  });

  it('guardar datos de empresa y monedas es UNA operación: ambos cambios quedan aplicados', async () => {
    const t = newTenant();
    const r = await call(t, 'PUT', '/api/settings/tenant', { name: 'Empresa Renombrada', enabled_currencies: ['USD', 'EUR'] });
    expect(r.status).toBe(200);
    expect((app.db.prepare('SELECT name FROM tenants WHERE id=?').get(t.tenantId) as any).name).toBe('Empresa Renombrada');
    expect(getEnabledCurrencies(app.db, t.tenantId)).toEqual(['DOP', 'USD', 'EUR']);
  });

  it('PUT /settings/tenant sin campos de monedas no toca la configuración de monedas', async () => {
    const t = newTenant();
    await call(t, 'PUT', '/api/settings/tenant', { enabled_currencies: ['USD'] });
    await call(t, 'PUT', '/api/settings/tenant', { phone: '809-000-0000' });
    expect(getEnabledCurrencies(app.db, t.tenantId)).toEqual(['DOP', 'USD']);
  });

  it('compat: /settings/currencies sigue funcionando; multi_currency_enabled=false colapsa a DOP', async () => {
    const t = newTenant();
    expect((await call(t, 'PUT', '/api/settings/currencies', { multi_currency_enabled: true, enabled_currencies: ['DOP', 'USD'] })).status).toBe(200);
    expect(getEnabledCurrencies(app.db, t.tenantId)).toEqual(['DOP', 'USD']);
    expect((await call(t, 'PUT', '/api/settings/currencies', { multi_currency_enabled: false, enabled_currencies: ['DOP', 'USD'] })).status).toBe(200);
    expect(getEnabledCurrencies(app.db, t.tenantId)).toEqual(['DOP']);
    expect((await call(t, 'PUT', '/api/settings/currencies', { enabled_currencies: ['QQQ'] })).status).toBe(400);
  });

  it('datos heredados: multimoneda apagada pero lista con USD -> efectivo solo DOP', () => {
    const t = newTenant();
    app.db.prepare("UPDATE tenant_settings SET multi_currency_enabled=0, enabled_currencies='[\"DOP\",\"USD\"]' WHERE tenant_id=?").run(t.tenantId);
    expect(getEnabledCurrencies(app.db, t.tenantId)).toEqual(['DOP']);
  });
});

describe('monedas: validación en el backend para préstamos nuevos', () => {
  it('manual: moneda no habilitada -> 400 CURRENCY_NOT_ENABLED; DOP siempre pasa; habilitada pasa', async () => {
    const t = newTenant();
    const blocked = await createManualLoan(t, { currency: 'USD' });
    expect(blocked.status).toBe(400);
    expect(blocked.body.code).toBe('CURRENCY_NOT_ENABLED');
    expect((await createManualLoan(t, { currency: 'DOP' })).status).toBe(201);
    expect((await createManualLoan(t)).status).toBe(201);                    // sin moneda = DOP

    await call(t, 'PUT', '/api/settings/tenant', { enabled_currencies: ['USD'] });
    const ok = await createManualLoan(t, { currency: 'usd', exchange_rate_to_dop: 60 });
    expect(ok.status).toBe(201);
    expect(loanRow(ok.body.id).currency).toBe('USD');
  });

  it('CSV: fila con moneda no habilitada se rechaza (CURRENCY_NOT_ENABLED); vacía = DOP; habilitada se importa', async () => {
    const t = newTenant();
    const usd = await importLoan(t, { currency: 'USD' });
    expect(usd.body.summary.created).toBe(0);
    expect(usd.body.results[0].code).toBe('CURRENCY_NOT_ENABLED');
    const unknown = await importLoan(t, { currency: 'XXX' });
    expect(unknown.body.results[0].code).toBe('CURRENCY_NOT_ENABLED');
    const blank = await importLoan(t, { currency: '' });
    expect(blank.body.summary.created).toBe(1);
    await call(t, 'PUT', '/api/settings/tenant', { enabled_currencies: ['USD'] });
    const enabled = await importLoan(t, { currency: 'USD', exchange_rate_to_dop: '60' });
    expect(enabled.body.summary.created).toBe(1);
    const currencies = (app.db.prepare('SELECT currency FROM loans WHERE tenant_id=? ORDER BY created_at').all(t.tenantId) as any[]).map(r => r.currency).sort();
    expect(currencies).toEqual(['DOP', 'USD']);
  });

  it('solicitud convertida: el préstamo nace en DOP (siempre habilitada)', async () => {
    const t = newTenant();
    const r = await convertRequest(t, app.createProduct(t.tenantId));
    expect(r.status).toBeLessThan(300);
    expect((app.db.prepare('SELECT currency FROM loans WHERE tenant_id=?').get(t.tenantId) as any).currency).toBe('DOP');
  });
});

describe('monedas: préstamos históricos en una moneda deshabilitada siguen operando', () => {
  it('conserva moneda, se puede editar y recibe pagos tras deshabilitar USD', async () => {
    const t = newTenant();
    await call(t, 'PUT', '/api/settings/tenant', { enabled_currencies: ['USD'] });
    const created = await createManualLoan(t, { currency: 'USD', exchange_rate_to_dop: 60 });
    expect(created.status).toBe(201);
    const id = created.body.id;
    app.db.prepare("UPDATE loans SET status='approved' WHERE id=?").run(id);
    expect((await call(t, 'POST', `/api/loans/${id}/disburse`, {})).status).toBe(200);

    // Se deshabilita USD: solo afecta a préstamos futuros.
    expect((await call(t, 'PUT', '/api/settings/tenant', { enabled_currencies: [] })).status).toBe(200);
    expect(getEnabledCurrencies(app.db, t.tenantId)).toEqual(['DOP']);
    expect((await createManualLoan(t, { currency: 'USD' })).status).toBe(400);   // nuevos: bloqueados

    // Histórico: intacto y operativo.
    expect(loanRow(id).currency).toBe('USD');
    expect((await call(t, 'GET', `/api/loans/${id}`)).status).toBe(200);
    expect((await call(t, 'PUT', `/api/loans/${id}`, { notes: 'editable aunque la moneda esté deshabilitada' })).status).toBe(200);   // operativo: permitido
    expect((await call(t, 'PUT', `/api/loans/${id}`, { mora_grace_days: 1 })).status).toBe(409);                                  // mora: fijada tras el desembolso
    const bankId = crypto.randomUUID();
    app.db.prepare("INSERT INTO bank_accounts (id,tenant_id,bank_name,currency) VALUES (?,?,?,?)").run(bankId, t.tenantId, 'Banco USD', 'USD');
    const pay = await call(t, 'POST', '/api/payments', { loan_id: id, amount: 100, payment_method: 'transfer', bank_account_id: bankId });
    expect(pay.status).toBeLessThan(300);
    expect(loanRow(id).currency).toBe('USD');
  });

  it('consolidar préstamos en una moneda deshabilitada no se bloquea y conserva la moneda (flujo histórico)', async () => {
    const t = newTenant();
    const c = consolidate(t);
    for (const id of c.ids) app.db.prepare("UPDATE loans SET currency='USD', exchange_rate_to_dop=60 WHERE id=?").run(id);
    const r = await c.run();
    expect(r.status).toBe(201);
    expect(loanRow(r.body.id).currency).toBe('USD');
    expect(getEnabledCurrencies(app.db, t.tenantId)).toEqual(['DOP']);
  });
});

describe('frontend: lógica pura de monedas de operación', () => {
  const CAT = [...CURRENCY_CATALOG] as string[];
  it('DOP siempre seleccionada y no se puede quitar', () => {
    expect(normalizeSelection([], CAT)).toEqual(['DOP']);
    expect(toggleSelection(['DOP'], 'DOP', CAT)).toEqual(['DOP']);
    expect(toggleSelection(['DOP', 'USD'], 'DOP', CAT)).toEqual(['DOP', 'USD']);
  });
  it('alternar agrega/quita y mantiene el orden del catálogo', () => {
    expect(toggleSelection(['DOP'], 'EUR', CAT)).toEqual(['DOP', 'EUR']);
    expect(toggleSelection(['DOP', 'EUR'], 'USD', CAT)).toEqual(['DOP', 'USD', 'EUR']);
    expect(toggleSelection(['DOP', 'USD'], 'USD', CAT)).toEqual(['DOP']);
  });
  it('resumen: "DOP, USD" y "DOP, USD, EUR +2"', () => {
    expect(summarizeSelection(['DOP'])).toBe('DOP');
    expect(summarizeSelection(['DOP', 'USD'])).toBe('DOP, USD');
    expect(summarizeSelection(['DOP', 'USD', 'EUR'])).toBe('DOP, USD, EUR');
    expect(summarizeSelection(['DOP', 'USD', 'EUR', 'HTG', 'MXN'])).toBe('DOP, USD, EUR +2');
  });
  it('multimoneda derivada de la selección', () => {
    expect(deriveMultiCurrency(['DOP'])).toBe(false);
    expect(deriveMultiCurrency([])).toBe(false);
    expect(deriveMultiCurrency(['DOP', 'USD'])).toBe(true);
    expect(deriveMultiCurrency(['usd'])).toBe(true);
  });
  it('parseStoredCurrencies acepta string JSON o arreglo y tolera basura', () => {
    expect(parseStoredCurrencies('["DOP","usd"]')).toEqual(['DOP', 'USD']);
    expect(parseStoredCurrencies(['DOP'])).toEqual(['DOP']);
    expect(parseStoredCurrencies('{no json')).toEqual([]);
    expect(parseStoredCurrencies(undefined)).toEqual([]);
  });
});

describe('frontend: navegación de General y compatibilidad de ?section=currencies', () => {
  it('cinco secciones, sin "currencies"', () => {
    expect(GENERAL_SECTION_IDS).toEqual(['company', 'operation', 'legal', 'mora', 'account']);
  });
  it('el enlace antiguo ?section=currencies abre Operación y se marca para normalizar', () => {
    expect(parseGeneralSection('currencies')).toBe('operation');
    expect(isLegacySectionAlias('currencies')).toBe(true);
    expect(isLegacySectionAlias('operation')).toBe(false);
  });
  it('secciones válidas, inválidas y vacías', () => {
    for (const id of GENERAL_SECTION_IDS) expect(parseGeneralSection(id)).toBe(id);
    expect(parseGeneralSection('INVALID')).toBe('company');
    expect(parseGeneralSection('')).toBe('company');
    expect(parseGeneralSection(null)).toBe('company');
    expect(parseGeneralSection('toString')).toBe('company');           // sin colisiones con Object.prototype
  });
});

describe('frontend: cableado de SettingsPage y Guía (verificación sobre la fuente)', () => {
  const FRONT = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src');
  const settings = fs.readFileSync(path.join(FRONT, 'pages', 'settings', 'SettingsPage.tsx'), 'utf8');
  const help = fs.readFileSync(path.join(FRONT, 'pages', 'help', 'HelpPage.tsx'), 'utf8');
  const i18n = fs.readFileSync(path.join(FRONT, 'lib', 'i18n.ts'), 'utf8');
  const operationPanel = settings.slice(settings.indexOf('id="general-panel-operation"'), settings.indexOf('id="general-panel-legal"'));

  it('no existe la sección/panel independiente de Monedas ni "Guardar Monedas"', () => {
    expect(settings).not.toContain('general-panel-currencies');
    expect(settings).not.toContain('handleSaveCurrencies');
    expect(settings).not.toContain('isSavingCurrencies');
    expect(i18n).not.toContain("'set.save_currencies'");
    expect((settings.match(/api\.put\('\/settings\/currencies'/g) || []).length).toBe(0);
  });
  it('Operación contiene el multiselect "Monedas de operación" y conserva Modo de Score y Tipo de Firma', () => {
    expect(operationPanel).toContain('<CurrencyMultiSelect');
    expect(operationPanel).toContain("set.op_currencies'");
    expect(operationPanel).toContain("set.score_mode");
    expect(operationPanel).toContain('value="global"');
    expect(operationPanel).toContain('value="per_tenant"');
    expect(operationPanel).toContain("set.sig_mode");
  });
  it('sigue disponible el campo de imagen de firma (Legal) y el logo (Empresa)', () => {
    expect(settings).toContain("set.signature_img");
    expect(settings).toContain("set.company_logo");
  });
  it('las monedas viajan en el mismo PUT /settings/tenant (no hay un cuarto PUT) y ya no se edita tenants.currency', () => {
    const save = settings.slice(settings.indexOf('const handleSaveGeneral'), settings.indexOf('// ─── SEGURIDAD DE LA CUENTA'));
    expect((save.match(/api\.put\(/g) || []).length).toBe(3);                 // tenant, mora, approvals
    expect(save).toContain('enabledCurrencies: currencySettings.enabledCurrencies');
    expect(save).toContain('multiCurrencyEnabled: deriveMultiCurrency(');
    expect(save).not.toMatch(/\bcurrency: tenant\.currency/);
  });
  it('la tasa de mora se edita en % y se guarda como fracción (÷100)', () => {
    expect(settings).toContain('moraRateText');
    expect(settings).toMatch(/ratePct \/ 100/);
  });
  it('tooltip accesible del multiselect (mouse, teclado/foco, role="tooltip")', () => {
    const cmp = fs.readFileSync(path.join(FRONT, 'components', 'shared', 'CurrencyMultiSelect.tsx'), 'utf8');
    expect(cmp).toContain('role="tooltip"');
    expect(cmp).toContain('onMouseEnter');
    expect(cmp).toContain('onFocus');
    expect(cmp).toContain('aria-describedby');
    expect(cmp).toContain('role="listbox"');
    expect(cmp).toContain('aria-multiselectable');
    expect(cmp).toContain("e.key === 'Escape'");
    expect(cmp).toContain('onToggle');            // el padre alterna con el estado más reciente (sin cierres obsoletos)
  });
  it('i18n ES/EN/PT para las claves nuevas y el texto de precedencia del modal', () => {
    for (const k of ['set.op_currencies', 'set.op_currencies_help', 'set.op_currencies_info_aria', 'set.op_currencies_base', 'set.op_currencies_list_aria', 'set.mora_scope_note', 'set.mora_rate_invalid', 'elm.precedence', 'elm.prec1_d', 'elm.prec2_d', 'elm.prec3_d']) {
      const i = i18n.indexOf(`'${k}'`);
      expect(i, k).toBeGreaterThan(-1);
      const line = i18n.slice(i, i18n.indexOf('\n', i));
      expect(line, k + ' es').toMatch(/es:\s*'/);
      expect(line, k + ' en').toMatch(/en:\s*'/);
      expect(line, k + ' pt').toMatch(/pt:\s*'/);
    }
    expect(i18n).toContain('no modifican préstamos existentes');
  });
  it('la Guía: ya no describe Monedas como sección; explica monedas dentro de Operación y la mora global/por préstamo', () => {
    const g = help.slice(help.indexOf("id: 'configuracion-general'"), help.indexOf("id: 'crear-usuario'"));
    expect(g).not.toContain("title: 'Monedas'");
    expect(g).not.toContain('Guardar Monedas');
    expect(g).not.toContain('seis secciones');
    expect(g).toContain('Monedas de operación');
    expect(g).toContain('política estándar de tu empresa');
    expect(g).toContain('NO modifica los préstamos que ya existen');
    expect(g).toContain('Editar préstamo');
  });
});

describe('regresión: Score y DataCrédito', () => {
  it('score_mode sigue persistiéndose (global / per_tenant) y no se toca clients.score', async () => {
    const t = newTenant();
    const clientId = app.createClient(t.tenantId);
    app.db.prepare('UPDATE clients SET score=77 WHERE id=?').run(clientId);
    expect((await call(t, 'PUT', '/api/settings/tenant', { score_mode: 'per_tenant' })).status).toBe(200);
    expect((app.db.prepare('SELECT score_mode FROM tenants WHERE id=?').get(t.tenantId) as any).score_mode).toBe('per_tenant');
    expect((await call(t, 'PUT', '/api/settings/tenant', { score_mode: 'global' })).status).toBe(200);
    expect((app.db.prepare('SELECT score_mode FROM tenants WHERE id=?').get(t.tenantId) as any).score_mode).toBe('global');
    expect((app.db.prepare('SELECT score FROM clients WHERE id=?').get(clientId) as any).score).toBe(77);
  });
  it('el reporte DataCrédito sigue respondiendo con un préstamo creado con la mora global', async () => {
    const t = newTenant();
    await setMora(t, GLOBAL);
    expect((await createManualLoan(t)).status).toBe(201);
    const r = await app.req('GET', '/api/reports/datacredito?periodMonth=2030-01', { token: t.token, tenantId: t.tenantId });
    expect(r.status).toBe(200);
  });
});

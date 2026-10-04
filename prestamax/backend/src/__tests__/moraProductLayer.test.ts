// Mora: GLOBAL -> PRODUCTO -> PRÉSTAMO.
//  - Un producto "hereda" la configuración general (mora_inherit_tenant = 1, valor por defecto y el de
//    los productos ya existentes) o la "personaliza" (mora_inherit_tenant = 0 + valores propios).
//  - Los valores históricos 0.001 / 3 de loan_products NO cuentan como personalización.
//  - Al crear el préstamo el resultado se guarda como instantánea en loans.mora_*; cambios posteriores
//    en General o en el Producto no tocan préstamos existentes.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { bootTestApp, TestApp } from './helpers/testApp';
import { resolveMoraConfig, productHasCustomMora, parseInheritFlag, normalizeProductMoraFields } from '../lib/moraConfig';
import {
  formForProduct, formFromValues, validateMoraForm, moraFormPayload, shouldSendMora, productIsCustom, pctFromFraction, SYSTEM_MORA_VALUES,
} from '../../../frontend/src/lib/productMora';

let app: TestApp;
beforeAll(async () => { app = await bootTestApp(); });
afterAll(async () => { await app.close(); });

type T = { token: string; tenantId: string };
const newTenant = (): T => app.createTenant({ planSlug: 'enterprise' });
const call = (t: T, method: string, url: string, body?: any) => app.req(method, url, { token: t.token, tenantId: t.tenantId, body });
const setGlobal = (t: T, body: any) => call(t, 'PUT', '/api/settings/mora', body);
const loanRow = (id: string) => app.db.prepare('SELECT * FROM loans WHERE id=?').get(id) as any;
const moraOf = (r: any) => ({ rate: r.mora_rate_daily, grace: r.mora_grace_days, base: r.mora_base, fixed: r.mora_fixed_enabled, amt: r.mora_fixed_amount });

const GLOBAL = { mora_rate_daily: 0.005, mora_grace_days: 7, mora_base: 'capital_pendiente', mora_fixed_enabled: 0, mora_fixed_amount: 0 };
const G = { rate: 0.005, grace: 7, base: 'capital_pendiente', fixed: 0, amt: 0 };
const CUSTOM = { mora_inherit_tenant: false, mora_rate_daily: 0.02, mora_grace_days: 1, mora_base: 'capital_vencido', mora_fixed_enabled: 1, mora_fixed_amount: 400 };
const C = { rate: 0.02, grace: 1, base: 'capital_vencido', fixed: 1, amt: 400 };

let n = 0;
const productBody = (extra: any = {}) => ({
  name: `Producto ${++n}`, code: `P${n}`, type: 'personal', min_amount: 1000, max_amount: 90000, rate: 10, rate_type: 'monthly',
  min_term: 1, max_term: 24, ...extra,
});
async function makeProduct(t: T, extra: any = {}) {
  const r = await call(t, 'POST', '/api/products', productBody(extra));
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}
async function loanFor(t: T, productId: string, extra: any = {}) {
  const clientId = app.createClient(t.tenantId);
  const r = await call(t, 'POST', '/api/loans', { client_id: clientId, product_id: productId, requested_amount: 5000, term: 6, ...extra });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
}
function convertRequest(t: T, productId: string) {
  const reqId = crypto.randomUUID();
  app.db.prepare(`INSERT INTO loan_requests (id,tenant_id,client_name,client_phone,id_number,loan_amount,loan_term,status)
    VALUES (?,?,?,?,?,?,?, 'approved')`).run(reqId, t.tenantId, 'Solicitante', '809-555-0000', 'REQ-' + crypto.randomUUID().slice(0, 8), 3000, 6);
  return call(t, 'PUT', `/api/loan-requests/${reqId}/convert`, { product_id: productId, rate: 5, term: 6 });
}
function consolidateWith(t: T, productId: string) {
  const clientId = app.createClient(t.tenantId);
  const [a, b] = app.fillLoans(t.tenantId, 2, 'active', clientId);
  for (const id of [a, b]) app.db.prepare('UPDATE loans SET principal_balance=1000, total_balance=1000 WHERE id=?').run(id);
  return call(t, 'POST', '/api/loans/consolidate', { loan_ids: [a, b], product_id: productId, rate: 5, term: 6 });
}
const importRow = (extra: any = {}) => ({
  client_name: 'Importado Prueba', client_phone: '809-555-' + (1000 + Math.floor(Math.random() * 8999)),
  client_id_number: 'IMP-' + crypto.randomUUID().slice(0, 8), loan_amount: '1000', interest_rate: '5', term_months: '6',
  payment_frequency: 'monthly', ...extra,
});

describe('esquema y migración aditiva de loan_products', () => {
  it('columnas de mora del producto: flag + las 5 de valores', () => {
    const cols = (app.db.prepare('PRAGMA table_info(loan_products)').all() as any[]).map(c => c.name);
    for (const c of ['mora_inherit_tenant', 'mora_rate_daily', 'mora_grace_days', 'mora_base', 'mora_fixed_enabled', 'mora_fixed_amount']) expect(cols).toContain(c);
    const flag = (app.db.prepare('PRAGMA table_info(loan_products)').all() as any[]).find(c => c.name === 'mora_inherit_tenant');
    expect(flag.dflt_value).toBe('1');
    expect(flag.notnull).toBe(1);
  });

  it('BD legacy (sin las columnas nuevas, con productos 0.001/3): la migración es aditiva y TODOS heredan; los datos no se reescriben', async () => {
    const t = newTenant();
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    // Se simula el esquema anterior: se quitan las 4 columnas nuevas y se insertan productos como los de producción.
    for (const c of ['mora_inherit_tenant', 'mora_base', 'mora_fixed_enabled', 'mora_fixed_amount']) app.db.exec(`ALTER TABLE loan_products DROP COLUMN ${c}`);
    const ins = app.db.prepare(`INSERT INTO loan_products (id,tenant_id,name,type,min_amount,max_amount,rate,min_term,max_term,mora_rate_daily,mora_grace_days) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    ins.run(ids[0], t.tenantId, 'Legacy 0.001/3', 'personal', 1, 100, 5, 1, 12, 0.001, 3);
    ins.run(ids[1], t.tenantId, 'Legacy NULL', 'personal', 1, 100, 5, 1, 12, null, null);
    const before = app.db.prepare('SELECT COUNT(*) c FROM loan_products').get() as any;

    const dbMod = await import('../db/database');
    dbMod.initializeDatabase();                                              // vuelve a correr las migraciones

    const after = app.db.prepare('SELECT COUNT(*) c FROM loan_products').get() as any;
    expect(after.c).toBeGreaterThanOrEqual(before.c);                        // ningún producto borrado (el arranque puede sembrar productos de ejemplo faltantes)
    const rows = app.db.prepare('SELECT * FROM loan_products WHERE id IN (?,?) ORDER BY name').all(...ids) as any[];
    for (const r of rows) {
      expect(r.mora_inherit_tenant).toBe(1);                                 // todos heredan General
      expect(r.mora_base).toBeNull(); expect(r.mora_fixed_enabled).toBeNull(); expect(r.mora_fixed_amount).toBeNull();
    }
    expect(rows[0].mora_rate_daily).toBe(0.001);                             // el valor histórico sigue ahí, intacto...
    expect(rows[0].mora_grace_days).toBe(3);
    // ...pero NO es una personalización: el préstamo toma la global.
    await setGlobal(t, GLOBAL);
    expect(moraOf(resolveMoraConfig(app.db, t.tenantId, undefined, rows[0]) as any)).toEqual(G);
    expect(resolveMoraConfig(app.db, t.tenantId, undefined, ids[0]).sources.mora_rate_daily).toBe('tenant');
    // Una segunda corrida es idempotente.
    dbMod.initializeDatabase();
    expect((app.db.prepare('SELECT mora_inherit_tenant f FROM loan_products WHERE id=?').get(ids[0]) as any).f).toBe(1);
  });
});

describe('producto: heredar vs personalizar', () => {
  it('producto existente legacy (0.001/3 sin flag) -> hereda General', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    const productId = app.createProduct(t.tenantId);
    app.db.prepare('UPDATE loan_products SET mora_rate_daily=0.001, mora_grace_days=3 WHERE id=?').run(productId);
    expect(moraOf(loanRow(await loanFor(t, productId)))).toEqual(G);
  });

  it('producto nuevo por defecto hereda General (y no guarda valores propios)', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    const p = await makeProduct(t);
    expect(p.mora_inherit_tenant).toBe(1);
    expect(p.mora_rate_daily).toBeNull();
    expect(p.effective_mora.source).toBe('tenant');
    expect(p.effective_mora.mora_rate_daily).toBe(0.005);
    const row = app.db.prepare('SELECT * FROM loan_products WHERE id=?').get(p.id) as any;
    expect(row.mora_inherit_tenant).toBe(1);
    expect(row.mora_rate_daily).toBeNull();
    expect(moraOf(loanRow(await loanFor(t, p.id)))).toEqual(G);
  });

  it('producto personalizado prevalece sobre General; base y cargo fijo del producto llegan al préstamo', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    const p = await makeProduct(t, CUSTOM);
    expect(p.mora_inherit_tenant).toBe(0);
    expect(p.effective_mora.source).toBe('product');
    expect(moraOf(loanRow(await loanFor(t, p.id)))).toEqual(C);
  });

  it('tasa 0 y gracia 0 en el producto son válidas (no caen a la global)', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    const p = await makeProduct(t, { mora_inherit_tenant: false, mora_rate_daily: 0, mora_grace_days: 0, mora_base: 'cuota_vencida', mora_fixed_enabled: 0, mora_fixed_amount: 0 });
    const m = moraOf(loanRow(await loanFor(t, p.id)));
    expect(m.rate).toBe(0);
    expect(m.grace).toBe(0);
    expect(m.base).toBe('cuota_vencida');
  });

  it('un campo no definido en un producto personalizado cae a la global (campo por campo)', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    const p = await makeProduct(t, { mora_inherit_tenant: false, mora_rate_daily: 0.03 });
    expect(moraOf(loanRow(await loanFor(t, p.id)))).toEqual({ ...G, rate: 0.03 });
    expect(resolveMoraConfig(app.db, t.tenantId, undefined, p.id).sources.mora_grace_days).toBe('tenant');
  });

  it('cambio de General: afecta futuros préstamos de producto heredado, NO a producto personalizado, NO a préstamos existentes', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    const inh = await makeProduct(t);
    const cus = await makeProduct(t, CUSTOM);
    const oldInh = await loanFor(t, inh.id);
    const oldCus = await loanFor(t, cus.id);
    await setGlobal(t, { mora_rate_daily: 0.01, mora_grace_days: 2, mora_base: 'cuota_vencida', mora_fixed_enabled: 1, mora_fixed_amount: 99 });
    expect(moraOf(loanRow(oldInh))).toEqual(G);                              // préstamos existentes intactos
    expect(moraOf(loanRow(oldCus))).toEqual(C);
    expect(moraOf(loanRow(await loanFor(t, inh.id)))).toEqual({ rate: 0.01, grace: 2, base: 'cuota_vencida', fixed: 1, amt: 99 });   // heredado: toma lo nuevo
    expect(moraOf(loanRow(await loanFor(t, cus.id)))).toEqual(C);            // personalizado: no cambia
  });

  it('cambio de Producto: afecta solo a préstamos futuros', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    const p = await makeProduct(t, CUSTOM);
    const before = await loanFor(t, p.id);
    const upd = await call(t, 'PUT', `/api/products/${p.id}`, { mora_inherit_tenant: false, mora_rate_daily: 0.04, mora_grace_days: 9, mora_base: 'cuota_vencida', mora_fixed_enabled: 0, mora_fixed_amount: 0 });
    expect(upd.status).toBe(200);
    expect(moraOf(loanRow(before))).toEqual(C);
    expect(moraOf(loanRow(await loanFor(t, p.id)))).toEqual({ rate: 0.04, grace: 9, base: 'cuota_vencida', fixed: 0, amt: 0 });
  });

  it('volver a "usar configuración general" limpia los valores propios y vuelve a heredar', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    const p = await makeProduct(t, CUSTOM);
    const upd = await call(t, 'PUT', `/api/products/${p.id}`, { mora_inherit_tenant: true });
    expect(upd.status).toBe(200);
    expect(upd.body.mora_inherit_tenant).toBe(1);
    const row = app.db.prepare('SELECT * FROM loan_products WHERE id=?').get(p.id) as any;
    expect([row.mora_rate_daily, row.mora_grace_days, row.mora_base, row.mora_fixed_enabled, row.mora_fixed_amount]).toEqual([null, null, null, null, null]);
    expect(moraOf(loanRow(await loanFor(t, p.id)))).toEqual(G);
  });

  it('editar un producto SIN tocar la mora no cambia su mora (ni su flag)', async () => {
    const t = newTenant();
    const p = await makeProduct(t, CUSTOM);
    expect((await call(t, 'PUT', `/api/products/${p.id}`, { name: 'Renombrado' })).status).toBe(200);
    const row = app.db.prepare('SELECT * FROM loan_products WHERE id=?').get(p.id) as any;
    expect(row.mora_inherit_tenant).toBe(0);
    expect(row.mora_rate_daily).toBe(0.02);
    expect(row.name).toBe('Renombrado');
    // un producto legacy que hereda tampoco se reescribe al editar otros campos
    const t2 = newTenant();
    const legacy = app.createProduct(t2.tenantId);
    app.db.prepare('UPDATE loan_products SET mora_rate_daily=0.001, mora_grace_days=3 WHERE id=?').run(legacy);
    await call(t2, 'PUT', `/api/products/${legacy}`, { description: 'x' });
    const lrow = app.db.prepare('SELECT * FROM loan_products WHERE id=?').get(legacy) as any;
    expect([lrow.mora_inherit_tenant, lrow.mora_rate_daily, lrow.mora_grace_days]).toEqual([1, 0.001, 3]);
  });

  it('el override del préstamo prevalece sobre el producto personalizado; no modifica producto, General ni otros préstamos', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    const p = await makeProduct(t, CUSTOM);
    const other = await loanFor(t, p.id);
    const mine = await loanFor(t, p.id, { mora_rate_daily: 0.0001, mora_grace_days: 0 });
    expect(moraOf(loanRow(mine))).toEqual({ ...C, rate: 0.0001, grace: 0 });
    expect(moraOf(loanRow(other))).toEqual(C);
    const prod = app.db.prepare('SELECT mora_rate_daily r, mora_inherit_tenant f FROM loan_products WHERE id=?').get(p.id) as any;
    expect(prod).toEqual({ r: 0.02, f: 0 });
    const g = app.db.prepare('SELECT mora_rate_daily r FROM tenant_settings WHERE tenant_id=?').get(t.tenantId) as any;
    expect(g.r).toBe(0.005);
  });

  it('validación: producto personalizado con tasa/gracia/cargo/base inválidos -> 400 y no se crea ni cambia nada', async () => {
    const t = newTenant();
    for (const bad of [{ mora_rate_daily: -0.1 }, { mora_rate_daily: 5 }, { mora_grace_days: -1 }, { mora_grace_days: 1.5 }, { mora_fixed_amount: -1 }, { mora_base: 'zzz' }]) {
      const r = await call(t, 'POST', '/api/products', productBody({ mora_inherit_tenant: false, ...bad }));
      expect(r.status, JSON.stringify(bad)).toBe(400);
    }
    expect((app.db.prepare('SELECT COUNT(*) c FROM loan_products WHERE tenant_id=? AND name LIKE ?').get(t.tenantId, 'Producto %') as any).c).toBe(0);
    const p = await makeProduct(t, CUSTOM);
    const r = await call(t, 'PUT', `/api/products/${p.id}`, { name: 'No debe cambiar', mora_inherit_tenant: false, mora_rate_daily: -5 });
    expect(r.status).toBe(400);
    const row = app.db.prepare('SELECT name, mora_rate_daily r FROM loan_products WHERE id=?').get(p.id) as any;
    expect(row.name).not.toBe('No debe cambiar');
    expect(row.r).toBe(0.02);
  });

  it('GET /products expone el flag y la mora efectiva; un producto que hereda no muestra el 0.001/3 histórico', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    const legacy = app.createProduct(t.tenantId);
    app.db.prepare('UPDATE loan_products SET mora_rate_daily=0.001, mora_grace_days=3 WHERE id=?').run(legacy);
    const cus = await makeProduct(t, CUSTOM);
    const list = await call(t, 'GET', '/api/products');
    expect(list.status).toBe(200);
    const l = list.body.find((p: any) => p.id === legacy);
    expect(l.mora_inherit_tenant).toBe(1);
    expect(l.mora_rate_daily).toBeNull();
    expect(l.effective_mora).toMatchObject({ mora_rate_daily: 0.005, mora_grace_days: 7, source: 'tenant' });
    const c = list.body.find((p: any) => p.id === cus.id);
    expect(c.mora_inherit_tenant).toBe(0);
    expect(c.effective_mora).toMatchObject({ mora_rate_daily: 0.02, mora_fixed_amount: 400, source: 'product' });
  });

  it('GET /products/mora-defaults devuelve la mora general vigente (o las constantes si no hay)', async () => {
    const t = newTenant();
    const none = await call(t, 'GET', '/api/products/mora-defaults');
    expect(none.status).toBe(200);
    expect(none.body).toMatchObject({ mora_rate_daily: 0.001, mora_grace_days: 3, mora_base: 'cuota_vencida', mora_fixed_enabled: 0 });
    await setGlobal(t, GLOBAL);
    expect((await call(t, 'GET', '/api/products/mora-defaults')).body).toMatchObject({ mora_rate_daily: 0.005, mora_grace_days: 7, mora_base: 'capital_pendiente' });
  });

  it('aislamiento: un producto de OTRO tenant nunca aporta mora', async () => {
    const a = newTenant(); const b = newTenant();
    await setGlobal(b, GLOBAL);
    const foreign = await makeProduct(a, CUSTOM);
    const r = resolveMoraConfig(app.db, b.tenantId, undefined, foreign.id);          // por id: no se encuentra en el tenant b
    expect(moraOf(r as any)).toEqual(G);
    const row = app.db.prepare('SELECT * FROM loan_products WHERE id=?').get(foreign.id);
    expect(moraOf(resolveMoraConfig(app.db, b.tenantId, undefined, row) as any)).toEqual(G);   // por fila: se descarta por tenant_id
  });

  it('sin producto (flujo técnico): General > constantes', async () => {
    const t = newTenant();
    expect(moraOf(resolveMoraConfig(app.db, t.tenantId) as any)).toEqual({ rate: 0.001, grace: 3, base: 'cuota_vencida', fixed: 0, amt: 0 });
    await setGlobal(t, GLOBAL);
    expect(moraOf(resolveMoraConfig(app.db, t.tenantId, undefined, null) as any)).toEqual(G);
  });
});

describe('los cuatro flujos de creación respetan Producto -> General -> constante', () => {
  it('creación manual: producto personalizado y producto heredado', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    expect(moraOf(loanRow(await loanFor(t, (await makeProduct(t, CUSTOM)).id)))).toEqual(C);
    expect(moraOf(loanRow(await loanFor(t, (await makeProduct(t)).id)))).toEqual(G);
  });

  it('solicitud convertida: producto personalizado, producto heredado y sin global', async () => {
    const t = newTenant();
    const noGlobal = await convertRequest(t, (await makeProduct(t)).id);
    expect(noGlobal.status).toBeLessThan(300);
    expect(moraOf(app.db.prepare('SELECT * FROM loans WHERE tenant_id=?').get(t.tenantId) as any)).toEqual({ rate: 0.001, grace: 3, base: 'cuota_vencida', fixed: 0, amt: 0 });
    await setGlobal(t, GLOBAL);
    const inh = await makeProduct(t);
    await convertRequest(t, inh.id);
    const cus = await makeProduct(t, CUSTOM);
    await convertRequest(t, cus.id);
    const rows = app.db.prepare('SELECT * FROM loans WHERE tenant_id=? ORDER BY created_at, rowid').all(t.tenantId) as any[];
    expect(moraOf(rows[1])).toEqual(G);
    expect(moraOf(rows[2])).toEqual(C);
  });

  it('consolidación: usa la mora del producto elegido (personalizado) o la general (heredado)', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    const rc = await consolidateWith(t, (await makeProduct(t, CUSTOM)).id);
    expect(rc.status).toBe(201);
    expect(moraOf(loanRow(rc.body.id))).toEqual(C);
    const ri = await consolidateWith(t, (await makeProduct(t)).id);
    expect(ri.status).toBe(201);
    expect(moraOf(loanRow(ri.body.id))).toEqual(G);
  });

  it('CSV: el producto "Migración" hereda General; si el tenant lo personaliza, prevalece; la mora queda en cada préstamo', async () => {
    const t = newTenant();
    await setGlobal(t, GLOBAL);
    const first = await call(t, 'POST', '/api/loans/bulk-import', { loans: [importRow()] });
    expect(first.body.summary.created).toBe(1);
    const mig = app.db.prepare("SELECT * FROM loan_products WHERE tenant_id=? AND name LIKE 'Migraci%'").get(t.tenantId) as any;
    expect(mig.mora_inherit_tenant).toBe(1);                                  // soporte de importación: hereda
    expect(mig.mora_rate_daily).toBeNull();                                   // sin escribir 0.001/3 legacy
    expect(mig.mora_grace_days).toBeNull();
    const l1 = app.db.prepare('SELECT * FROM loans WHERE tenant_id=?').get(t.tenantId) as any;
    expect(moraOf(l1)).toEqual(G);
    // el tenant personaliza el producto Migración -> los siguientes importes lo usan
    expect((await call(t, 'PUT', `/api/products/${mig.id}`, CUSTOM)).status).toBe(200);
    const second = await call(t, 'POST', '/api/loans/bulk-import', { loans: [importRow()] });
    expect(second.body.summary.created).toBe(1);
    const rows = app.db.prepare('SELECT * FROM loans WHERE tenant_id=? ORDER BY created_at, rowid').all(t.tenantId) as any[];
    expect(moraOf(rows[0])).toEqual(G);                                       // el primero, intacto
    expect(moraOf(rows[1])).toEqual(C);
  });

  it('CSV sin global: constantes del sistema', async () => {
    const t = newTenant();
    await call(t, 'POST', '/api/loans/bulk-import', { loans: [importRow()] });
    expect(moraOf(app.db.prepare('SELECT * FROM loans WHERE tenant_id=?').get(t.tenantId) as any)).toEqual({ rate: 0.001, grace: 3, base: 'cuota_vencida', fixed: 0, amt: 0 });
  });
});

describe('helpers puros del backend', () => {
  it('productHasCustomMora / parseInheritFlag / normalizeProductMoraFields', () => {
    expect(productHasCustomMora({ mora_inherit_tenant: 0 })).toBe(true);
    expect(productHasCustomMora({ mora_inherit_tenant: 1 })).toBe(false);
    expect(productHasCustomMora({})).toBe(false);                             // sin flag -> hereda
    expect(productHasCustomMora(null)).toBe(false);
    expect(parseInheritFlag(true)).toBe(true);
    expect(parseInheritFlag(false)).toBe(false);
    expect(parseInheritFlag(0)).toBe(false);
    expect(parseInheritFlag(undefined)).toBeNull();
    expect(normalizeProductMoraFields({ mora_rate_daily: '0', mora_grace_days: 0, mora_base: 'cuota', mora_fixed_enabled: true, mora_fixed_amount: '12.5' }))
      .toEqual({ mora_rate_daily: 0, mora_grace_days: 0, mora_base: 'cuota_vencida', mora_fixed_enabled: 1, mora_fixed_amount: 12.5 });
    expect(normalizeProductMoraFields({})).toEqual({ mora_rate_daily: null, mora_grace_days: null, mora_base: null, mora_fixed_enabled: null, mora_fixed_amount: null });
  });
});

describe('frontend: formulario de mora del producto (lógica pura)', () => {
  const GLOBALS = { moraRateDaily: 0.005, moraGraceDays: 7, moraBase: 'capital_pendiente', moraFixedEnabled: 0, moraFixedAmount: 0 };
  it('por defecto (producto nuevo o existente/legacy) hereda y no duplica valores como propios', () => {
    expect(formForProduct(null, GLOBALS).inherit).toBe(true);
    expect(formForProduct({ moraInheritTenant: 1 }, GLOBALS).inherit).toBe(true);
    expect(formForProduct({}, GLOBALS).inherit).toBe(true);
    expect(productIsCustom({ moraInheritTenant: 1 })).toBe(false);
    expect(productIsCustom({ moraInheritTenant: 0 })).toBe(true);
    expect(productIsCustom(null)).toBe(false);
  });
  it('un producto personalizado se edita con sus propios valores efectivos', () => {
    const f = formForProduct({ moraInheritTenant: 0, effectiveMora: { moraRateDaily: 0.02, moraGraceDays: 1, moraBase: 'capital_vencido', moraFixedEnabled: 1, moraFixedAmount: 400 } }, GLOBALS);
    expect(f).toMatchObject({ inherit: false, ratePct: '2', graceDays: '1', base: 'capital_vencido', fixedEnabled: 1, fixedAmount: '400' });
  });
  it('"Personalizar" precarga los valores generales vigentes (porcentaje visible: 0.5 %)', () => {
    expect(formFromValues(false, GLOBALS)).toMatchObject({ inherit: false, ratePct: '0.5', graceDays: '7', base: 'capital_pendiente', fixedEnabled: 0 });
    expect(pctFromFraction(0.001)).toBe('0.1');
    expect(pctFromFraction(0)).toBe('0');
    expect(formForProduct(null, null).ratePct).toBe(pctFromFraction(SYSTEM_MORA_VALUES.moraRateDaily));
  });
  it('payload: heredar envía solo el flag; personalizar envía fracción (0.1 % -> 0.001)', () => {
    expect(moraFormPayload(formFromValues(true, GLOBALS))).toEqual({ moraInheritTenant: true });
    expect(moraFormPayload({ inherit: false, ratePct: '0.1', graceDays: '3', base: 'cuota_vencida', fixedEnabled: 0, fixedAmount: '0' }))
      .toEqual({ moraInheritTenant: false, moraRateDaily: 0.001, moraGraceDays: 3, moraBase: 'cuota_vencida', moraFixedEnabled: 0, moraFixedAmount: 0 });
    expect((moraFormPayload({ inherit: false, ratePct: '0', graceDays: '0', base: 'cuota_vencida', fixedEnabled: 0, fixedAmount: '' }) as any).moraRateDaily).toBe(0);
  });
  it('validación: tasa >= 0 (<= 100), días >= 0 enteros, cargo >= 0, base válida; heredar siempre es válido', () => {
    const ok = { inherit: false, ratePct: '0', graceDays: '0', base: 'cuota_vencida', fixedEnabled: 1, fixedAmount: '0' };
    expect(validateMoraForm(ok)).toBeNull();                                    // 0 y 0 son válidos
    expect(validateMoraForm({ ...ok, ratePct: '-1' })).toBeTruthy();
    expect(validateMoraForm({ ...ok, ratePct: '101' })).toBeTruthy();
    expect(validateMoraForm({ ...ok, ratePct: '' })).toBeTruthy();
    expect(validateMoraForm({ ...ok, graceDays: '-1' })).toBeTruthy();
    expect(validateMoraForm({ ...ok, graceDays: '1.5' })).toBeTruthy();
    expect(validateMoraForm({ ...ok, fixedAmount: '-3' })).toBeTruthy();
    expect(validateMoraForm({ ...ok, base: 'xx' })).toBeTruthy();
    expect(validateMoraForm({ ...ok, ratePct: '-5', inherit: true })).toBeNull();
  });
  it('no se reescribe la mora de un producto que ya heredaba y sigue heredando', () => {
    expect(shouldSendMora(false, formFromValues(true, GLOBALS))).toBe(false);
    expect(shouldSendMora(true, formFromValues(true, GLOBALS))).toBe(true);     // custom -> heredar: sí se envía
    expect(shouldSendMora(false, formFromValues(false, GLOBALS))).toBe(true);   // heredar -> personalizar
    expect(shouldSendMora(true, formFromValues(false, GLOBALS))).toBe(true);
  });
});

describe('frontend: cableado (fuente) de Productos, nuevo préstamo, guía e i18n', () => {
  const FRONT = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src');
  const read = (p: string) => fs.readFileSync(path.join(FRONT, p), 'utf8');
  const settings = read('pages/settings/SettingsPage.tsx');
  const section = read('components/shared/ProductMoraSection.tsx');
  const create = read('pages/loans/LoanCreatePage.tsx');
  const help = read('pages/help/HelpPage.tsx');
  const i18n = read('lib/i18n.ts');

  it('el formulario de producto incluye la sección de mora (hereda por defecto) y carga la mora general', () => {
    expect(settings).toContain('<ProductMoraSection');
    expect(settings).toContain("/products/mora-defaults");
    expect(settings).toContain('shouldSendMora(wasCustom, productMora)');
    expect(settings).toContain('validateMoraForm(productMora)');
    expect(section).toContain('type="radio"');
    expect(section).toContain("set.prod_mora_inherit'");
    expect(section).toContain("set.prod_mora_custom'");
    expect(section).toContain('<dl');                                          // vista informativa de los valores generales
  });
  it('nuevo préstamo muestra la mora inicial del producto elegido y no envía mora (la resuelve el backend)', () => {
    expect(create).toContain('effectiveMora');
    expect(create).toContain("lc.c_mora");
    expect(create).not.toMatch(/mora_rate_daily|moraRateDaily:\s*parseFloat/);  // el wizard no manda valores de mora
  });
  it('i18n ES/EN/PT de todas las claves nuevas', () => {
    for (const k of ['set.prod_mora_title', 'set.prod_mora_inherit', 'set.prod_mora_inherit_note', 'set.prod_mora_custom', 'set.prod_mora_custom_note',
      'set.prod_mora_current_global', 'set.prod_mora_invalid', 'lc.c_mora', 'lc.c_mora_pct', 'lc.c_mora_fixed', 'lc.c_mora_note', 'set.mora_scope_note', 'elm.prec1_d', 'elm.prec3']) {
      const i = i18n.indexOf(`'${k}'`);
      expect(i, k).toBeGreaterThan(-1);
      const line = i18n.slice(i, i18n.indexOf('\n', i));
      expect(line, k + ' es').toMatch(/es:\s*'/);
      expect(line, k + ' en').toMatch(/en:\s*'/);
      expect(line, k + ' pt').toMatch(/pt:\s*'/);
    }
  });
  it('la Guía explica General -> Producto -> Préstamo', () => {
    expect(help).toContain('Configuración de mora del producto');
    expect(help).toContain('Personalizar para este producto');
    expect(help).toContain('configuración general → producto');
    expect(help).toContain('nunca los existentes');
  });
});

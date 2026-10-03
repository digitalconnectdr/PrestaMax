// Harness de integración para los tests de pricing/límites/Whop.
// Levanta la API REAL (routers de producción) sobre una base SQLite TEMPORAL y
// aislada por archivo de test, escuchando en un puerto efímero. Se usa con
// fetch (Node 22+). NO toca prestamax.db ni ninguna base real.
//
// IMPORTANTE: DATABASE_PATH / JWT_SECRET deben fijarse ANTES de importar
// db/database (DB_PATH se evalúa al cargar el módulo), por eso todo se importa
// dinámicamente dentro de bootTestApp().
import http from 'http';
import os from 'os';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import type { AddressInfo } from 'net';

export interface TestApp {
  baseUrl: string;
  db: any;
  dbFile: string;
  close: () => Promise<void>;
  /** Crea un tenant con plan (por slug) y un dueño; devuelve ids y token. */
  createTenant: (opts: {
    planSlug?: string; planId?: string; name?: string;
    status?: string; subscriptionEnd?: string | null;
    whopMembershipId?: string | null; roles?: string[];
  }) => { tenantId: string; ownerId: string; token: string; ownerMembershipId: string };
  tokenFor: (userId: string) => string;
  /** Crea un usuario + membresía en un tenant. */
  addMember: (tenantId: string, roles: string[], opts?: { active?: boolean; email?: string }) => { userId: string; membershipId: string; token: string };
  /** Inserta N préstamos con el estado dado (SQL directo, para llenar el conteo). */
  fillLoans: (tenantId: string, count: number, status: string, clientId?: string) => string[];
  createClient: (tenantId: string) => string;
  createProduct: (tenantId: string) => string;
  req: (method: string, url: string, opts?: { token?: string; tenantId?: string; body?: any; headers?: Record<string, string> }) => Promise<{ status: number; body: any }>;
  setPlan: (tenantId: string, slug: string) => void;
}

export async function bootTestApp(): Promise<TestApp> {
  const dbFile = path.join(os.tmpdir(), `credytek-test-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.db`);
  process.env.DATABASE_PATH = dbFile;
  process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret-123456';
  process.env.NODE_ENV = 'test';

  const dbMod = await import('../../db/database');
  // GUARDA DE AISLAMIENTO: DB_PATH se fija al importar db/database. Si algún import
  // ESTÁTICO del archivo de test cargó ese módulo antes de bootTestApp() (p. ej. un
  // servicio que lo importa), los tests escribirían en la BD local de desarrollo.
  // Mejor fallar ruidosamente que ensuciar una base real.
  if (path.resolve(dbMod.DB_PATH) !== path.resolve(dbFile)) {
    throw new Error(`bootTestApp: la BD no está aislada (DB_PATH=${dbMod.DB_PATH}). Importa servicios/rutas con import() DINÁMICO después de bootTestApp().`);
  }
  dbMod.initializeDatabase();
  const db: any = dbMod.getDb();

  const express = (await import('express')).default;
  const jwt = (await import('jsonwebtoken')).default;
  const { router } = await import('../../routes');
  const { whopWebhookHandler } = await import('../../routes/billing');

  const app = express();
  app.post('/api/billing/whop-webhook', express.raw({ type: '*/*' }), whopWebhookHandler);
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', router);

  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  let seq = 0;
  const uid = () => crypto.randomUUID();
  const tokenFor = (userId: string) =>
    jwt.sign({ userId, tokenVersion: 0 }, process.env.JWT_SECRET as string, { algorithm: 'HS256', expiresIn: '1h' });

  const createTenant: TestApp['createTenant'] = (o) => {
    const tenantId = uid();
    const ownerId = uid();
    const ownerMembershipId = uid();
    const plan = o.planId
      ? db.prepare('SELECT id FROM plans WHERE id=?').get(o.planId)
      : db.prepare('SELECT id FROM plans WHERE slug=?').get(o.planSlug || 'starter');
    if (!plan) throw new Error(`Plan no encontrado: ${o.planId || o.planSlug}`);
    const n = ++seq;
    db.prepare(`INSERT INTO tenants (id,name,slug,email,currency,plan_id,subscription_status,subscription_end,whop_membership_id,is_active)
      VALUES (?,?,?,?,?,?,?,?,?,1)`).run(
      tenantId, o.name || `Tenant ${n}`, `tenant-${n}-${tenantId.slice(0, 6)}`, `t${n}@test.local`, 'DOP', plan.id,
      o.status || 'active',
      o.subscriptionEnd === undefined ? new Date(Date.now() + 30 * 86400000).toISOString() : o.subscriptionEnd,
      o.whopMembershipId ?? null,
    );
    db.prepare('INSERT OR IGNORE INTO tenant_settings (id,tenant_id) VALUES (?,?)').run(uid(), tenantId);
    db.prepare(`INSERT INTO users (id,email,password_hash,full_name,is_active,platform_role) VALUES (?,?,?,?,1,'none')`)
      .run(ownerId, `owner${n}-${ownerId.slice(0, 6)}@test.local`, 'x', `Owner ${n}`);
    db.prepare(`INSERT INTO tenant_memberships (id,user_id,tenant_id,roles,is_active) VALUES (?,?,?,?,1)`)
      .run(ownerMembershipId, ownerId, tenantId, JSON.stringify(o.roles || ['tenant_owner']));
    return { tenantId, ownerId, token: tokenFor(ownerId), ownerMembershipId };
  };

  const addMember: TestApp['addMember'] = (tenantId, roles, opts = {}) => {
    const userId = uid();
    const membershipId = uid();
    db.prepare(`INSERT INTO users (id,email,password_hash,full_name,is_active,platform_role) VALUES (?,?,?,?,1,'none')`)
      .run(userId, opts.email || `m-${userId.slice(0, 8)}@test.local`, 'x', `Member ${userId.slice(0, 4)}`);
    db.prepare(`INSERT INTO tenant_memberships (id,user_id,tenant_id,roles,is_active) VALUES (?,?,?,?,?)`)
      .run(membershipId, userId, tenantId, JSON.stringify(roles), opts.active === false ? 0 : 1);
    return { userId, membershipId, token: tokenFor(userId) };
  };

  const createClient = (tenantId: string) => {
    const id = uid();
    const n = ++seq;
    db.prepare(`INSERT INTO clients (id,tenant_id,client_number,full_name,first_name,last_name,id_number) VALUES (?,?,?,?,?,?,?)`)
      .run(id, tenantId, `CLI-${n}`, `Cliente ${n}`, 'Cliente', String(n), `ID-${n}-${id.slice(0, 6)}`);
    return id;
  };

  const createProduct = (tenantId: string) => {
    dbMod.seedDefaultLoanProducts(db, tenantId);
    return (db.prepare('SELECT id FROM loan_products WHERE tenant_id=? LIMIT 1').get(tenantId) as any).id;
  };

  const fillLoans: TestApp['fillLoans'] = (tenantId, count, status, clientId) => {
    const cid = clientId || createClient(tenantId);
    const pid = createProduct(tenantId);
    const ids: string[] = [];
    const ins = db.prepare(`INSERT INTO loans (id,tenant_id,client_id,product_id,loan_number,status,requested_amount,approved_amount,disbursed_amount,rate,term)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
    db.exec('BEGIN');
    try {
      for (let i = 0; i < count; i++) {
        const id = uid();
        ins.run(id, tenantId, cid, pid, `T-${++seq}-${id.slice(0, 6)}`, status, 1000, 1000, 1000, 5, 6);
        ids.push(id);
      }
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    return ids;
  };

  const req: TestApp['req'] = async (method, url, opts = {}) => {
    const headers: Record<string, string> = { ...(opts.headers || {}) };
    if (opts.body !== undefined && !(opts.body instanceof Buffer) && typeof opts.body !== 'string') headers['Content-Type'] = 'application/json';
    if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
    if (opts.tenantId) headers['X-Tenant-Id'] = opts.tenantId;
    const res = await fetch(baseUrl + url, {
      method, headers,
      body: opts.body === undefined ? undefined
        : (opts.body instanceof Buffer || typeof opts.body === 'string') ? opts.body : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch (_) { /* no JSON */ }
    return { status: res.status, body };
  };

  const setPlan = (tenantId: string, slug: string) => {
    const p = db.prepare('SELECT id FROM plans WHERE slug=?').get(slug) as any;
    if (!p) throw new Error('plan ' + slug);
    db.prepare('UPDATE tenants SET plan_id=? WHERE id=?').run(p.id, tenantId);
  };

  const close = async () => {
    await new Promise<void>(r => server.close(() => r()));
    try { db.close(); } catch (_) { /* noop */ }
    for (const ext of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbFile + ext); } catch (_) { /* noop */ } }
  };

  return { baseUrl, db, dbFile, close, createTenant, tokenFor, addMember, fillLoans, createClient, createProduct, req, setPlan };
}

/** Inserta un plan de prueba (p. ej. con un límite chico para probar el bloqueo). */
export function insertTestPlan(db: any, o: {
  slug: string; features: string[]; maxActiveLoans?: number; maxUsers?: number; maxCollectors?: number; maxClients?: number;
}): string {
  const id = 'plan-test-' + o.slug;
  db.prepare(`INSERT INTO plans (id,name,slug,price_monthly,max_collectors,max_clients,max_users,max_active_loans,trial_days,features,description)
    VALUES (?,?,?,?,?,?,?,?,14,?,?)`).run(
    id, o.slug, o.slug, 1, o.maxCollectors ?? -1, o.maxClients ?? -1, o.maxUsers ?? -1, o.maxActiveLoans ?? -1,
    JSON.stringify(o.features), 'test plan');
  return id;
}

/** Firma un webhook de Whop (Standard Webhooks) con el secreto dado. */
export function signWhopWebhook(body: string, secret: string, id = 'msg_' + crypto.randomBytes(4).toString('hex'), ts = String(Math.floor(Date.now() / 1000))) {
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const sig = crypto.createHmac('sha256', Buffer.from(raw, 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  return { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `v1,${sig}`, 'Content-Type': 'application/json' };
}

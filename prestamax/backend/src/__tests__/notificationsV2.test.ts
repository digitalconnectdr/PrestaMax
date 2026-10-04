// Notifications V2 — aislamiento, destinatarios por autorizacion real, idempotencia,
// API/paginacion, visibilidad por RBAC/plan y tenant expirado. Toda la suite usa una
// BD temporal (bootTestApp); no se envia ningun email ni WhatsApp.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'crypto';
import { bootTestApp, signWhopWebhook, TestApp } from './helpers/testApp';

const SECRET = 'whsec_' + Buffer.from('test-whop-webhook-secret').toString('base64');
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const uid = () => crypto.randomUUID();

let app: TestApp;
let platform: { id: string; token: string };
let notify: typeof import('../lib/notify');

beforeAll(async () => {
  process.env.OWNER_USER_EMAIL = 'platform-owner@test.local';
  process.env.WHOP_API_KEY = 'test-api-key';
  process.env.WHOP_WEBHOOK_SECRET = SECRET;
  app = await bootTestApp();
  notify = await import('../lib/notify');
  const pid = uid();
  app.db.prepare(`INSERT INTO users (id,email,password_hash,full_name,is_active,platform_role) VALUES (?,?,?,?,1,'none')`)
    .run(pid, 'platform-owner@test.local', 'x', 'Platform Owner');
  platform = { id: pid, token: app.tokenFor(pid) };
});
afterAll(async () => { await app.close(); });

type U = { userId?: string; ownerId?: string; token: string };
const idOf = (u: U) => (u.userId || u.ownerId) as string;
const list = (u: { token: string }, tenantId: string, q = '') => app.req('GET', '/api/notifications' + q, { token: u.token, tenantId });
const unread = async (u: { token: string }, tenantId: string) => (await app.req('GET', '/api/notifications/unread-count', { token: u.token, tenantId })).body.count as number;
const rows = (userId: string, type?: string) =>
  (app.db.prepare(`SELECT * FROM notifications WHERE user_id=?${type ? ' AND type=?' : ''}`).all(...(type ? [userId, type] : [userId]))) as any[];

/** Tenant con owner + admin + oficial + cobrador + cajero + investor. */
function team(planSlug = 'profesional') {
  const t = app.createTenant({ planSlug });
  return {
    ...t,
    owner: { ownerId: t.ownerId, token: t.token },
    admin: app.addMember(t.tenantId, ['admin']),
    officer: app.addMember(t.tenantId, ['loan_officer']),
    cobrador: app.addMember(t.tenantId, ['cobrador']),
    cashier: app.addMember(t.tenantId, ['cashier']),
    investor: app.addMember(t.tenantId, ['investor']),
  };
}

/** Préstamo con saldo y una cuota para registrar pagos reales por la API. */
function payableLoan(tenantId: string, opts: { collectorId?: string | null; due?: string; status?: string } = {}) {
  const [loanId] = app.fillLoans(tenantId, 1, opts.status || 'active');
  app.db.prepare(`UPDATE loans SET principal_balance=1000, interest_balance=100, total_balance=1100, mora_grace_days=0, collector_id=? WHERE id=?`)
    .run(opts.collectorId ?? null, loanId);
  app.db.prepare(`INSERT INTO installments (id,loan_id,installment_number,due_date,principal_amount,interest_amount,total_amount,status)
    VALUES (?,?,?,?,?,?,?,'pending')`).run(uid(), loanId, 1, opts.due || '2099-01-01', 1000, 100, 1100);
  return loanId;
}

describe('1. Seguridad — tareas cross-tenant', () => {
  it('PUT con assigned_to de OTRO tenant: 400 uniforme (no revela existencia), sin notificación ni cambio', async () => {
    const A = team(); const B = team();
    const task = await app.req('POST', '/api/collection-tasks', { token: A.token, tenantId: A.tenantId, body: { title: 'Visita', assigned_to: A.cobrador.userId, due_date: '2030-01-01' } });
    expect(task.status).toBe(201);
    const foreign = await app.req('PUT', `/api/collection-tasks/${task.body.id}`, { token: A.token, tenantId: A.tenantId, body: { assigned_to: B.admin.userId } });
    const ghost = await app.req('PUT', `/api/collection-tasks/${task.body.id}`, { token: A.token, tenantId: A.tenantId, body: { assigned_to: uid() } });
    expect(foreign.status).toBe(400);
    expect(foreign.body.code).toBe('INVALID_ASSIGNEE');
    expect(foreign.body).toEqual(ghost.body); // mismo mensaje para UUID de otra empresa y para uno inexistente
    expect(rows(B.admin.userId)).toHaveLength(0);
    expect((app.db.prepare('SELECT assigned_to FROM collection_tasks WHERE id=?').get(task.body.id) as any).assigned_to).toBe(A.cobrador.userId);
  });

  it('POST aplica la MISMA validación (lógica compartida): otro tenant, inexistente, inactivo y sin permiso', async () => {
    const A = team(); const B = team();
    const post = (assigned_to: string) => app.req('POST', '/api/collection-tasks', { token: A.token, tenantId: A.tenantId, body: { title: 'T', assigned_to, due_date: '2030-01-01' } });
    const inactiveMember = app.addMember(A.tenantId, ['cobrador'], { active: false });
    const inactiveUser = app.addMember(A.tenantId, ['cobrador']);
    app.db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(inactiveUser.userId);
    for (const bad of [B.cobrador.userId, uid(), inactiveMember.userId, inactiveUser.userId]) {
      const r = await post(bad);
      expect(r.status, bad).toBe(400);
      expect(r.body.code).toBe('INVALID_ASSIGNEE');
    }
    // member activo del mismo tenant pero SIN collections.tasks (investor): no elegible
    expect((await post(A.investor.userId)).status).toBe(400);
    // elegibles: cobrador y cajero (collections.tasks en sus defaults)
    expect((await post(A.cobrador.userId)).status).toBe(201);
    expect((await post(A.cashier.userId)).status).toBe(201);
    expect(rows(B.cobrador.userId)).toHaveLength(0);
  });

  it('un usuario de A elegible solo por membership activa: si se desactiva, ya no se le puede asignar', async () => {
    const A = team();
    const c = app.addMember(A.tenantId, ['cobrador']);
    expect((await app.req('POST', '/api/collection-tasks', { token: A.token, tenantId: A.tenantId, body: { title: 'x', assigned_to: c.userId, due_date: '2030-01-01' } })).status).toBe(201);
    app.db.prepare('UPDATE tenant_memberships SET is_active=0 WHERE id=?').run(c.membershipId);
    expect((await app.req('POST', '/api/collection-tasks', { token: A.token, tenantId: A.tenantId, body: { title: 'x', assigned_to: c.userId, due_date: '2030-01-01' } })).status).toBe(400);
  });
});

describe('Aislamiento de lectura/marcado entre empresas', () => {
  it('B no lee ni marca notificaciones de A (404 uniforme / 403 con header ajeno)', async () => {
    const A = team(); const B = team();
    notify.notifyUser(app.db, A.tenantId, A.admin.userId, 'x_test', 'Secreto de A', 'detalle', { dedupeKey: 'iso-1' });
    const nid = (rows(A.admin.userId, 'x_test')[0]).id;
    expect(JSON.stringify((await list(B.admin, B.tenantId)).body)).not.toContain('Secreto de A');
    expect((await app.req('PATCH', `/api/notifications/${nid}/read`, { token: B.admin.token, tenantId: B.tenantId })).status).toBe(404);
    expect((await app.req('PATCH', `/api/notifications/${nid}/read`, { token: B.admin.token, tenantId: A.tenantId })).status).toBe(403);
    expect((await list(B.admin, A.tenantId)).status).toBe(403);
    expect((app.db.prepare('SELECT is_read FROM notifications WHERE id=?').get(nid) as any).is_read).toBe(0);
    // el staff de plataforma solo ve SUS propias notificaciones, no las de A
    expect((await list(platform, A.tenantId)).body.notifications).toHaveLength(0);
  });

  it('helpers: un usuario de otro tenant nunca recibe (notifyUser exige membership activa EN el tenant)', () => {
    const A = team(); const B = team();
    expect(notify.notifyUser(app.db, A.tenantId, B.admin.userId, 'x_test', 't', 'm')).toBe(false);
    expect(rows(B.admin.userId)).toHaveLength(0);
  });
});

describe('Leído / no leído por usuario', () => {
  it('A lee y B permanece sin leer; read-all solo afecta lo propio', async () => {
    const A = team();
    const other = team();
    notify.notifyTenantAdmins(app.db, A.tenantId, 'x_test', 'Aviso', 'm', { dedupeKey: 'ru-1' });
    notify.notifyTenantAdmins(app.db, other.tenantId, 'x_test', 'Aviso', 'm', { dedupeKey: 'ru-1' });
    expect(await unread(A.owner, A.tenantId)).toBe(1);
    expect(await unread(A.admin, A.tenantId)).toBe(1);
    const first = (await list(A.owner, A.tenantId)).body.notifications[0];
    expect((await app.req('PATCH', `/api/notifications/${first.id}/read`, { token: A.token, tenantId: A.tenantId })).status).toBe(200);
    expect(await unread(A.owner, A.tenantId)).toBe(0);
    expect(await unread(A.admin, A.tenantId)).toBe(1);
    // read-all del admin de A: no toca al owner ni a otra empresa
    notify.notifyTenantAdmins(app.db, A.tenantId, 'x_test', 'Otro', 'm', { dedupeKey: 'ru-2' });
    await app.req('PATCH', '/api/notifications/read-all', { token: A.admin.token, tenantId: A.tenantId });
    expect(await unread(A.admin, A.tenantId)).toBe(0);
    expect(await unread(A.owner, A.tenantId)).toBe(1);
    expect(await unread(other.owner, other.tenantId)).toBe(1);
  });
});

describe('API de notificaciones: paginación y validación', () => {
  it('parámetros inválidos → 400 (nunca 500)', async () => {
    const A = team();
    for (const q of ['?limit=abc', '?limit=0', '?limit=-1', '?limit=1.5', '?offset=-1', '?offset=x', '?limit=']) {
      const r = await list(A.owner, A.tenantId, q);
      expect(r.status, q).toBe(q === '?limit=' ? 200 : 400);
      if (r.status === 400) expect(r.body.code).toBe('INVALID_PAGINATION');
    }
  });

  it('default 20, máximo 50 y respuesta {notifications, unread, total}', async () => {
    const A = team();
    for (let i = 0; i < 60; i++) notify.notifyUser(app.db, A.tenantId, A.admin.userId, 'x_test', `n${i}`, 'm', { dedupeKey: `pg-${i}` });
    const def = await list(A.admin, A.tenantId);
    expect(Object.keys(def.body).sort()).toEqual(['notifications', 'total', 'unread']);
    expect(def.body.notifications).toHaveLength(20);
    expect(def.body.total).toBe(60);
    expect(def.body.unread).toBe(60);
    expect((await list(A.admin, A.tenantId, '?limit=1000')).body.notifications).toHaveLength(50);
    expect((await list(A.admin, A.tenantId, '?limit=1')).body.notifications).toHaveLength(1);
  });

  it('orden estable (created_at DESC, id DESC): páginas sin duplicados ni saltos aun con el mismo segundo', async () => {
    const A = team();
    const ins = app.db.prepare(`INSERT INTO notifications (id,tenant_id,user_id,type,title,message,created_at) VALUES (?,?,?,?,?,?,'2030-01-01 10:00:00')`);
    for (let i = 0; i < 25; i++) ins.run(uid(), A.tenantId, A.admin.userId, 'x_test', `t${i}`, 'm');
    const ids: string[] = [];
    for (const off of [0, 10, 20]) ids.push(...(await list(A.admin, A.tenantId, `?limit=10&offset=${off}`)).body.notifications.map((n: any) => n.id));
    expect(ids).toHaveLength(25);
    expect(new Set(ids).size).toBe(25);
    expect(ids).toEqual([...ids].sort().reverse()); // mismo created_at => id DESC
  });

  it('PATCH de una notificación inexistente o ajena → 404 (no "success" engañoso)', async () => {
    const A = team();
    expect((await app.req('PATCH', `/api/notifications/${uid()}/read`, { token: A.token, tenantId: A.tenantId })).status).toBe(404);
    notify.notifyUser(app.db, A.tenantId, A.admin.userId, 'x_test', 't', 'm', { dedupeKey: 'own-1' });
    const nid = rows(A.admin.userId, 'x_test')[0].id;
    const r = await app.req('PATCH', `/api/notifications/${nid}/read`, { token: A.cobrador.token, tenantId: A.tenantId });
    expect(r.status).toBe(404);
    expect((app.db.prepare('SELECT is_read FROM notifications WHERE id=?').get(nid) as any).is_read).toBe(0);
  });

  it('el GET ya no ejecuta limpieza global de huérfanas (no borra filas)', async () => {
    const A = team();
    notify.notifyUser(app.db, A.tenantId, A.admin.userId, 'loan_overdue', 'Mora', 'm', { entityType: 'loan', entityId: 'no-existe', dedupeKey: 'orph-1' });
    const r = await list(A.admin, A.tenantId);
    expect(r.body.total).toBe(1);
    expect(rows(A.admin.userId, 'loan_overdue')).toHaveLength(1);
  });
});

describe('Tenant expirado: la API de notificaciones sigue disponible', () => {
  it('lista (con query string), unread-count y marcar leída responden 200; el resto sigue en 402', async () => {
    const t = app.createTenant({ planSlug: 'starter', status: 'trial', subscriptionEnd: new Date(Date.now() - 86400000).toISOString() });
    const { notifyTenantBilling } = await import('../lib/billingNotifications');
    notifyTenantBilling(app.db, t.tenantId, 'trial_expired', { key: 'exp' });
    expect((await app.req('GET', '/api/loans', { token: t.token, tenantId: t.tenantId })).status).toBe(402);
    const l = await list(t, t.tenantId, '?limit=5');
    expect(l.status).toBe(200);
    expect(l.body.notifications[0].type).toBe('trial_expired');
    expect((await list(t, t.tenantId)).status).toBe(200);
    expect(await unread(t, t.tenantId)).toBe(1);
    expect((await app.req('PATCH', `/api/notifications/${l.body.notifications[0].id}/read`, { token: t.token, tenantId: t.tenantId })).status).toBe(200);
    expect((await app.req('PATCH', '/api/notifications/read-all', { token: t.token, tenantId: t.tenantId })).status).toBe(200);
    expect(await unread(t, t.tenantId)).toBe(0);
  });
});

describe('Helpers de notificación', () => {
  it('ignora memberships/usuarios inactivos, excluye al actor y respeta dedupe_key', () => {
    const A = team();
    const inactiveAdmin = app.addMember(A.tenantId, ['admin'], { active: false });
    const inactiveUser = app.addMember(A.tenantId, ['admin']);
    app.db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(inactiveUser.userId);
    const n1 = notify.notifyTenantAdmins(app.db, A.tenantId, 'x_test', 't', 'm', { dedupeKey: 'h-1', excludeUserId: A.ownerId });
    expect(n1).toBe(1); // solo el admin activo (owner excluido como actor)
    expect(rows(A.ownerId, 'x_test')).toHaveLength(0);
    expect(rows(inactiveAdmin.userId)).toHaveLength(0);
    expect(rows(inactiveUser.userId)).toHaveLength(0);
    expect(notify.notifyTenantAdmins(app.db, A.tenantId, 'x_test', 't', 'm', { dedupeKey: 'h-1', excludeUserId: A.ownerId })).toBe(0); // repetido
    expect(rows(A.admin.userId, 'x_test')).toHaveLength(1);
  });

  it('notifyUsersWithPermission usa el permiso EFECTIVO (plan AND rol) y suma usuarios extra sin duplicar', () => {
    const A = team();
    const n = notify.notifyUsersWithPermission(app.db, A.tenantId, 'requests.view', 'x_test', 't', 'm', { dedupeKey: 'p-1' });
    const got = (u: U) => rows(idOf(u), 'x_test').length;
    expect([got(A.owner), got(A.admin), got(A.officer)]).toEqual([1, 1, 1]);
    expect([got(A.cobrador), got(A.cashier), got(A.investor)]).toEqual([0, 0, 0]);
    expect(n).toBe(3);
    // permiso revocado explícitamente al oficial: ya no es destinatario
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run(JSON.stringify({ 'requests.view': false }), A.officer.membershipId);
    notify.notifyUsersWithPermission(app.db, A.tenantId, 'requests.view', 'x_test', 't', 'm', { dedupeKey: 'p-2' });
    expect(got(A.officer)).toBe(1);
    // alsoUserIds: el cobrador entra una sola vez aunque se repita
    notify.notifyUsersWithPermission(app.db, A.tenantId, 'requests.view', 'x_test', 't', 'm', { dedupeKey: 'p-3', alsoUserIds: [A.cobrador.userId, A.cobrador.userId] });
    expect(got(A.cobrador)).toBe(1);
  });

  it('una falla interna NO lanza y queda registrada (sin tragarla en silencio)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = { prepare: () => { throw Object.assign(new Error('boom'), { code: 'ERR_X' }); } };
    expect(() => notify.notifyUser(broken, 't', 'u', 'x', 't', 'm')).not.toThrow();
    expect(() => notify.notifyTenantAdmins(broken, 't', 'x', 't', 'm')).not.toThrow();
    expect(() => notify.notifyUsersWithPermission(broken, 't', 'loans.view', 'x', 't', 'm')).not.toThrow();
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0][0])).toContain('[notify]');
    spy.mockRestore();
  });

  it('migración: columnas, índice único parcial y de lectura existen; backfill idempotente', async () => {
    const idx = app.db.prepare(`PRAGMA index_list('notifications')`).all() as any[];
    const uniq = idx.find(i => i.name === 'uniq_notifs_dedupe');
    expect(uniq && uniq.unique === 1 && uniq.partial === 1).toBe(true);
    expect(idx.some(i => i.name === 'idx_notifs_user_read')).toBe(true);
    const cols = (app.db.prepare(`PRAGMA table_info('notifications')`).all() as any[]).map(c => c.name);
    expect(cols).toEqual(expect.arrayContaining(['dedupe_key', 'required_permission']));
    // legado sin permiso etiquetado -> la migración (idempotente) lo etiqueta sin borrar nada
    const A = team();
    app.db.prepare(`INSERT INTO notifications (id,tenant_id,user_id,type,title,message) VALUES (?,?,?,?,?,?)`).run(uid(), A.tenantId, A.admin.userId, 'loan_request', 'viejo', 'm');
    const dbMod = await import('../db/database');
    dbMod.initializeDatabase();
    dbMod.initializeDatabase();
    const legacy = rows(A.admin.userId, 'loan_request');
    expect(legacy).toHaveLength(1);
    expect(legacy[0].required_permission).toBe('requests.view');
  });
});

describe('Eventos y destinatarios', () => {
  const apply = async (tenantId: string, token: string, name = 'Juan Perez') =>
    app.req('POST', `/api/public/apply/${token}`, { body: { clientName: name, clientPhone: '8095551111', idFrontImage: IMG, idBackImage: IMG, loanAmount: 50000 } });

  it('solicitud pública: owner/admin/oficial con requests.view; no cobrador/cajero/investor; dedupe por solicitud', async () => {
    const A = team();
    const tok = 'tok-' + uid();
    app.db.prepare('UPDATE tenants SET public_token=? WHERE id=?').run(tok, A.tenantId);
    const r = await apply(A.tenantId, tok);
    expect(r.status).toBe(201);
    const count = (u: U) => rows(idOf(u), 'loan_request').length;
    expect([count(A.owner), count(A.admin), count(A.officer)]).toEqual([1, 1, 1]);
    expect([count(A.cobrador), count(A.cashier), count(A.investor)]).toEqual([0, 0, 0]);
    expect(rows(A.admin.userId, 'loan_request')[0].dedupe_key).toBe(`loan_request:${r.body.requestId}`);
    expect(rows(A.admin.userId, 'loan_request')[0].required_permission).toBe('requests.view');
    // doble envío = 2 solicitudes reales distintas (cada una su aviso), pero el mismo id nunca duplica
    await apply(A.tenantId, tok, 'Otra Persona');
    expect(count(A.admin)).toBe(2);
    notify.notifyUsersWithPermission(app.db, A.tenantId, 'requests.view', 'loan_request', 't', 'm', { dedupeKey: `loan_request:${r.body.requestId}` });
    expect(count(A.admin)).toBe(2);
  });

  it('pago registrado: owner/admin SIN el actor; dedupe por payment_id; anulación avisa al resto sin el actor', async () => {
    const A = team();
    const loanId = payableLoan(A.tenantId);
    // el ADMIN registra el pago → se avisa al owner, no al propio admin
    const pay = await app.req('POST', '/api/payments', { token: A.admin.token, tenantId: A.tenantId, body: { loan_id: loanId, amount: 100 } });
    expect(pay.status).toBe(201);
    const payId = pay.body.payment.id;
    expect(rows(A.ownerId, 'payment_received')).toHaveLength(1);
    expect(rows(A.admin.userId, 'payment_received')).toHaveLength(0);
    expect(rows(A.ownerId, 'payment_received')[0].dedupe_key).toBe(`payment:${payId}`);
    expect(rows(A.ownerId, 'payment_received')[0].required_permission).toBe('payments.view');
    // mismo evento otra vez (retry del helper): sin duplicado
    notify.notifyTenantAdmins(app.db, A.tenantId, 'payment_received', 't', 'm', { dedupeKey: `payment:${payId}`, entityType: 'payment', entityId: payId });
    expect(rows(A.ownerId, 'payment_received')).toHaveLength(1);
    // el OWNER anula (solo el owner puede) → se avisa al admin, no al owner (actor)
    const voided = await app.req('POST', `/api/payments/${payId}/void`, { token: A.token, tenantId: A.tenantId, body: { void_reason: 'error de captura' } });
    expect(voided.status).toBe(200);
    expect(rows(A.admin.userId, 'payment_voided')).toHaveLength(1);
    expect(rows(A.ownerId, 'payment_voided')).toHaveLength(0);
    expect(rows(A.admin.userId, 'payment_voided')[0].dedupe_key).toBe(`payment_void:${payId}`);
    expect(rows(A.cobrador.userId, 'payment_voided')).toHaveLength(0);
  });

  it('tarea: asignada solo cuando CAMBIA el responsable; completada una sola vez (repetir no duplica); A→B→A vuelve a avisar', async () => {
    const A = team();
    const c2 = app.addMember(A.tenantId, ['cobrador']);
    const mk = await app.req('POST', '/api/collection-tasks', { token: A.token, tenantId: A.tenantId, body: { title: 'Visita', assigned_to: A.cobrador.userId, due_date: '2030-01-01' } });
    const id = mk.body.id;
    const put = (body: any) => app.req('PUT', `/api/collection-tasks/${id}`, { token: A.token, tenantId: A.tenantId, body });
    expect(rows(A.cobrador.userId, 'task_assigned')).toHaveLength(1);
    await put({ assigned_to: A.cobrador.userId, priority: 'high' }); // mismo responsable
    expect(rows(A.cobrador.userId, 'task_assigned')).toHaveLength(1);
    await put({ assigned_to: c2.userId });
    expect(rows(c2.userId, 'task_assigned')).toHaveLength(1);
    await put({ assigned_to: c2.userId });                           // repetido: ya no cambia nada
    expect(rows(c2.userId, 'task_assigned')).toHaveLength(1);
    await put({ assigned_to: A.cobrador.userId });                    // A→B→A
    expect(rows(A.cobrador.userId, 'task_assigned')).toHaveLength(2);
    // completar dos veces → una notificación al creador
    const done = () => app.req('PATCH', `/api/collection-tasks/${id}/status`, { token: A.cobrador.token, tenantId: A.tenantId, body: { status: 'completed' } });
    expect((await done()).status).toBe(200);
    expect((await done()).status).toBe(200);
    expect(rows(A.ownerId, 'task_completed')).toHaveLength(1);
  });

  it('eliminar una tarea elimina sus notificaciones (acotado a su tenant)', async () => {
    const A = team(); const B = team();
    const mk = await app.req('POST', '/api/collection-tasks', { token: A.token, tenantId: A.tenantId, body: { title: 'x', assigned_to: A.cobrador.userId, due_date: '2030-01-01' } });
    notify.notifyUser(app.db, B.tenantId, B.admin.userId, 'task_assigned', 't', 'm', { entityType: 'collection_task', entityId: mk.body.id, dedupeKey: 'del-b' });
    expect(rows(A.cobrador.userId, 'task_assigned')).toHaveLength(1);
    await app.req('DELETE', `/api/collection-tasks/${mk.body.id}`, { token: A.token, tenantId: A.tenantId });
    expect(rows(A.cobrador.userId, 'task_assigned')).toHaveLength(0);
    expect(rows(B.admin.userId, 'task_assigned')).toHaveLength(1); // otro tenant intacto
  });

  it('mora: owner/admin + cobrador asignado activo; no duplica en el mismo episodio y sí en uno legítimo nuevo', async () => {
    const { syncLoanStatuses } = await import('../services/loanStatusSync');
    const A = team();
    const assigned = app.addMember(A.tenantId, ['cobrador']);
    const inactiveCollector = app.addMember(A.tenantId, ['cobrador'], { active: false });
    const loanA = payableLoan(A.tenantId, { collectorId: assigned.userId, due: '2030-03-01' });
    const loanB = payableLoan(A.tenantId, { collectorId: inactiveCollector.userId, due: '2030-03-01' });
    const at = new Date('2030-03-10T15:00:00Z'); // 11:00 local: 9 días de atraso
    syncLoanStatuses(app.db, at);
    const moraRows = (u: U) => rows(idOf(u), 'loan_overdue');
    expect(moraRows(A.owner)).toHaveLength(2);          // A y B
    expect(moraRows(A.admin)).toHaveLength(2);
    expect(moraRows(assigned)).toHaveLength(1);          // solo su préstamo
    expect(moraRows(assigned)[0].entity_id).toBe(loanA);
    expect(moraRows(inactiveCollector)).toHaveLength(0); // membership inactiva
    expect(moraRows(A.cobrador)).toHaveLength(0);        // cobrador NO asignado
    expect(moraRows(A.owner)[0].required_permission).toBe('loans.view');
    // mismo episodio (repetir el job): sin duplicados
    syncLoanStatuses(app.db, at); syncLoanStatuses(app.db, new Date('2030-03-11T15:00:00Z'));
    expect(moraRows(A.owner)).toHaveLength(2);
    // sale de mora (paga) y luego cae por OTRA cuota: episodio nuevo => avisa de nuevo
    app.db.prepare(`UPDATE installments SET status='paid' WHERE loan_id=?`).run(loanA);
    syncLoanStatuses(app.db, new Date('2030-03-12T15:00:00Z'));
    expect((app.db.prepare('SELECT status FROM loans WHERE id=?').get(loanA) as any).status).toBe('active');
    app.db.prepare(`INSERT INTO installments (id,loan_id,installment_number,due_date,principal_amount,interest_amount,total_amount,status) VALUES (?,?,?,?,?,?,?,'pending')`)
      .run(uid(), loanA, 2, '2030-03-20', 100, 10, 110);
    syncLoanStatuses(app.db, new Date('2030-03-25T15:00:00Z'));
    expect(moraRows(assigned)).toHaveLength(2);
    expect(moraRows(A.owner)).toHaveLength(3);
  });

  it('promesa vencida: cobrador de la promesa + owner/admin, sin duplicar y con ventana de 7 días', async () => {
    const { runPromiseOverdueAlerts } = await import('../services/promiseAlerts');
    const A = team();
    const loanId = payableLoan(A.tenantId);
    const mkPromise = (days: number) => {
      const id = uid();
      const d = new Date(Date.UTC(2030, 5, 15) - days * 86400000).toISOString().slice(0, 10);
      app.db.prepare(`INSERT INTO payment_promises (id,loan_id,collector_id,promised_date,promised_amount,status) VALUES (?,?,?,?,?,'pending')`)
        .run(id, loanId, A.cobrador.userId, d, 500);
      return id;
    };
    const fresh = mkPromise(2); mkPromise(30);
    const at = new Date('2030-06-15T16:00:00Z');
    expect(runPromiseOverdueAlerts(app.db, A.tenantId, 'America/Santo_Domingo', at)).toBe(3); // cobrador + owner + admin
    runPromiseOverdueAlerts(app.db, A.tenantId, 'America/Santo_Domingo', at);
    expect(rows(A.cobrador.userId, 'promise_overdue')).toHaveLength(1);
    expect(rows(A.cobrador.userId, 'promise_overdue')[0].dedupe_key).toBe(`promise_overdue:${fresh}`);
    expect(rows(A.admin.userId, 'promise_overdue')).toHaveLength(1);
    expect(rows(A.cashier.userId, 'promise_overdue')).toHaveLength(0);
    expect(rows(A.officer.userId, 'promise_overdue')).toHaveLength(0);
  });

  it('aprobación gerencial pendiente: solo quienes tienen loans.approve_high_value; dedupe por episodio', async () => {
    const A = team();
    app.db.prepare('UPDATE tenant_settings SET approval_threshold_amount=100 WHERE tenant_id=?').run(A.tenantId);
    const [loanId] = app.fillLoans(A.tenantId, 1, 'under_review');
    const approve = () => app.req('POST', `/api/loans/${loanId}/approve`, { token: A.officer.token, tenantId: A.tenantId, body: { approved_amount: 1000 } });
    const r = await approve();
    expect(r.status).toBe(200);
    expect((app.db.prepare('SELECT status FROM loans WHERE id=?').get(loanId) as any).status).toBe('pending_manager_approval');
    const got = (u: U) => rows(idOf(u), 'manager_approval_pending');
    expect([got(A.owner).length, got(A.admin).length]).toEqual([1, 1]);
    expect([got(A.officer).length, got(A.cobrador).length, got(A.cashier).length]).toEqual([0, 0, 0]);
    expect(got(A.owner)[0].required_permission).toBe('loans.approve_high_value');
    expect((await approve()).status).toBe(403); // reintento: sigue pendiente, no vuelve a notificar
    expect(got(A.owner)).toHaveLength(1);
  });

  it('inactivos: ni usuario desactivado ni membership revocada reciben avisos de mora/pago', async () => {
    const { syncLoanStatuses } = await import('../services/loanStatusSync');
    const A = team();
    const offUser = app.addMember(A.tenantId, ['admin']);
    app.db.prepare('UPDATE users SET is_active=0 WHERE id=?').run(offUser.userId);
    const offMember = app.addMember(A.tenantId, ['admin'], { active: false });
    payableLoan(A.tenantId, { due: '2030-03-01' });
    syncLoanStatuses(app.db, new Date('2030-03-10T15:00:00Z'));
    expect(rows(offUser.userId)).toHaveLength(0);
    expect(rows(offMember.userId)).toHaveLength(0);
    expect(rows(A.admin.userId, 'loan_overdue')).toHaveLength(1);
  });
});

describe('Visibilidad por RBAC / plan (required_permission)', () => {
  it('desaparece al perder el permiso (explícito) y vuelve al recuperarlo — sin borrar el histórico', async () => {
    const A = team();
    notify.notifyUsersWithPermission(app.db, A.tenantId, 'requests.view', 'loan_request', 'Solicitud', 'm', { dedupeKey: 'v-1', entityType: 'loan_request', entityId: 'x' });
    notify.notifyUser(app.db, A.tenantId, A.officer.userId, 'plan_changed', 'Cuenta', 'sin permiso requerido', { dedupeKey: 'v-2' });
    expect(await unread(A.officer, A.tenantId)).toBe(2);
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run(JSON.stringify({ 'requests.view': false }), A.officer.membershipId);
    const l = await list(A.officer, A.tenantId);
    expect(l.body.notifications.map((n: any) => n.type)).toEqual(['plan_changed']); // la de cuenta sigue visible
    expect(l.body.total).toBe(1);
    expect(await unread(A.officer, A.tenantId)).toBe(1);
    const hidden = rows(A.officer.userId, 'loan_request')[0];
    expect((await app.req('PATCH', `/api/notifications/${hidden.id}/read`, { token: A.officer.token, tenantId: A.tenantId })).status).toBe(404);
    expect(rows(A.officer.userId, 'loan_request')).toHaveLength(1); // histórico intacto
    app.db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?').run('{}', A.officer.membershipId);
    expect((await list(A.officer, A.tenantId)).body.total).toBe(2);
  });

  it('downgrade de plan: oculta lo de features que el plan ya no incluye y lo restaura al volver a subir', async () => {
    const A = team('profesional');
    app.db.prepare('UPDATE tenant_settings SET approval_threshold_amount=100 WHERE tenant_id=?').run(A.tenantId);
    notify.notifyUsersWithPermission(app.db, A.tenantId, 'requests.view', 'loan_request', 'Solicitud', 'm', { dedupeKey: 'dg-1' });
    notify.notifyUsersWithPermission(app.db, A.tenantId, 'loans.approve_high_value', 'manager_approval_pending', 'Aprobación', 'm', { dedupeKey: 'dg-2' });
    const { notifyTenantBilling } = await import('../lib/billingNotifications');
    notifyTenantBilling(app.db, A.tenantId, 'plan_changed', { key: 'dg', planName: 'Starter' });
    const types = async () => (await list(A.admin, A.tenantId)).body.notifications.map((n: any) => n.type).sort();
    expect(await types()).toEqual(['loan_request', 'manager_approval_pending', 'plan_changed']);
    app.setPlan(A.tenantId, 'starter');
    expect(await types()).toEqual(['plan_changed']);          // billing/cuenta siguen visibles
    expect(await unread(A.admin, A.tenantId)).toBe(1);
    expect(rows(A.admin.userId)).toHaveLength(3);              // nada se borró
    app.setPlan(A.tenantId, 'profesional');
    expect(await types()).toEqual(['loan_request', 'manager_approval_pending', 'plan_changed']);
  });
});

describe('Billing / webhooks (idempotencia)', () => {
  const hook = (payload: any, id: string) => {
    const raw = JSON.stringify(payload);
    return app.req('POST', '/api/billing/whop-webhook', { body: Buffer.from(raw), headers: signWhopWebhook(raw, SECRET, id) });
  };

  it('activación repetida (mismo webhook-id, y además went_valid + payment_succeeded) → una sola fila; owner de plataforma avisado una vez', async () => {
    const A = team('starter');
    app.db.prepare(`UPDATE tenants SET subscription_status='trial' WHERE id=?`).run(A.tenantId);
    const ev = { type: 'membership.went_valid', data: { id: 'mem_' + A.tenantId.slice(0, 6), metadata: { tenant_id: A.tenantId, plan_slug: 'basico', billing_period: 'monthly' } } };
    expect((await hook(ev, 'msg_act_1')).status).toBe(200);
    expect((await hook(ev, 'msg_act_1')).status).toBe(200);                  // reentrega idéntica
    const pay = { type: 'payment.succeeded', data: { id: 'pay_1', membership_id: ev.data.id, metadata: ev.data.metadata } };
    expect((await hook(pay, 'msg_act_2')).status).toBe(200);                 // evento distinto de la misma compra
    expect(rows(A.ownerId, 'subscription_activated')).toHaveLength(1);
    expect(rows(A.admin.userId, 'subscription_activated')).toHaveLength(1);
    expect(rows(A.cobrador.userId, 'subscription_activated')).toHaveLength(0); // solo owner/admin
    const platformRows = rows(platform.id, 'subscription_activated').filter(r => r.entity_id === A.tenantId);
    expect(platformRows).toHaveLength(1);
  });

  it('pago fallido y cancelación: una fila por evento aunque el webhook se repita', async () => {
    const A = team('basico');
    const mem = 'mem_' + A.tenantId.slice(0, 6);
    app.db.prepare(`UPDATE tenants SET subscription_status='active', whop_membership_id=? WHERE id=?`).run(mem, A.tenantId);
    const failed = { type: 'payment.failed', data: { id: 'pay_f', membership_id: mem, metadata: { tenant_id: A.tenantId } } };
    await hook(failed, 'msg_fail_1'); await hook(failed, 'msg_fail_1'); await hook({ ...failed, data: { ...failed.data, id: 'pay_f2' } }, 'msg_fail_2');
    expect((app.db.prepare('SELECT subscription_status FROM tenants WHERE id=?').get(A.tenantId) as any).subscription_status).toBe('past_due');
    expect(rows(A.admin.userId, 'payment_failed')).toHaveLength(1); // 2.º fallo ya en past_due: sin ruido
    const cancel = { type: 'membership.went_invalid', data: { id: mem, metadata: { tenant_id: A.tenantId } } };
    await hook(cancel, 'msg_cancel_1'); await hook(cancel, 'msg_cancel_1');
    expect(rows(A.admin.userId, 'subscription_cancelled')).toHaveLength(1);
    expect(rows(platform.id, 'subscription_cancelled').filter(r => r.entity_id === A.tenantId)).toHaveLength(1);
  });

  it('cambio de plan por el panel avisa a owner/admin del tenant', async () => {
    const A = team('starter');
    const admin = app.addMember(A.tenantId, ['admin']);
    // el staff de plataforma cambia el plan por el endpoint real del Admin
    const pro = app.db.prepare(`SELECT id FROM plans WHERE slug='profesional'`).get() as any;
    const r = await app.req('PUT', `/api/admin/tenants/${A.tenantId}`, { token: platform.token, body: { plan_id: pro.id } });
    expect(r.status).toBe(200);
    expect(rows(admin.userId, 'plan_changed')).toHaveLength(1);
    expect(rows(A.ownerId, 'plan_changed')).toHaveLength(1);
    expect(rows(A.cobrador.userId, 'plan_changed')).toHaveLength(0);
  });
});

describe('Mantenimiento acotado de huérfanas (fuera del poll)', () => {
  it('borra solo huérfanas, como máximo `limit` por tipo y respetando el tenant; el poll no borra nada', async () => {
    const A = team(); const B = team();
    notify.cleanOrphanNotificationsBounded(app.db, 100000); // parte de cero: huérfanas de tests previos de este archivo
    const [liveLoan] = app.fillLoans(A.tenantId, 1, 'active');
    const ins = app.db.prepare(`INSERT INTO notifications (id,tenant_id,user_id,type,title,message,entity_type,entity_id) VALUES (?,?,?,?,?,?,?,?)`);
    app.db.exec('BEGIN');
    for (let i = 0; i < 1200; i++) ins.run(uid(), A.tenantId, A.admin.userId, 'loan_overdue', 'huerfana', 'm', 'loan', 'gone-' + i);
    app.db.exec('COMMIT');
    ins.run(uid(), A.tenantId, A.admin.userId, 'loan_overdue', 'viva', 'm', 'loan', liveLoan);
    await list(A.admin, A.tenantId); await unread(A.admin, A.tenantId); // el poll no toca nada
    const orphans = () => (app.db.prepare(`SELECT COUNT(*) c FROM notifications WHERE title='huerfana'`).get() as any).c;
    expect(orphans()).toBe(1200);
    expect(notify.cleanOrphanNotificationsBounded(app.db, 500)).toBeGreaterThanOrEqual(500); // acotado por tipo
    expect(orphans()).toBe(700);
    // la notificación de B apunta a un préstamo de A: en B NO existe -> huérfana para B (acotado por tenant)
    ins.run(uid(), B.tenantId, B.admin.userId, 'loan_overdue', 'ajena', 'm', 'loan', liveLoan);
    notify.cleanOrphanNotificationsBounded(app.db, 5000);
    expect(orphans()).toBe(0);
    expect(rows(A.admin.userId).some(r => r.title === 'viva')).toBe(true);   // recurso existente: se conserva
    expect(rows(B.admin.userId).some(r => r.title === 'ajena')).toBe(false); // no pertenece a su tenant
  });
});

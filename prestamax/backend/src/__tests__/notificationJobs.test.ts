// Notifications V2 — jobs programados: recordatorios de trial, resumen programado,
// WhatsApp de mora (recuperación), timezone del tenant y scheduler resiliente.
// BD temporal; Resend/WhatsApp se simulan (no se envía nada real).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'crypto';
import { bootTestApp, TestApp } from './helpers/testApp';
import { localParts, safeTz, asOfForTz, addDaysStr, daysBetweenStr, DEFAULT_TZ } from '../lib/tz';

const uid = () => crypto.randomUUID();
let app: TestApp;
const realFetch = globalThis.fetch;
let resendStatus = 200;
const resendCalls: { subject: string; to: string[] }[] = [];

beforeAll(async () => {
  process.env.OWNER_USER_EMAIL = 'platform-owner@test.local';
  process.env.RESEND_API_KEY = 're_test';
  app = await bootTestApp();
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input?.url || input);
    if (url.startsWith('https://api.resend.com')) {
      const body = JSON.parse(init?.body || '{}');
      resendCalls.push({ subject: body.subject, to: body.to });
      return new Response(resendStatus === 200 ? '{"id":"e_1"}' : '{"message":"fail"}', { status: resendStatus });
    }
    return realFetch(input, init);
  }) as any;
});
afterAll(async () => { globalThis.fetch = realFetch; delete process.env.RESEND_API_KEY; await app.close(); });
beforeEach(() => { resendStatus = 200; resendCalls.length = 0; });

const rows = (userId: string, type?: string) =>
  (app.db.prepare(`SELECT * FROM notifications WHERE user_id=?${type ? ' AND type=?' : ''}`).all(...(type ? [userId, type] : [userId]))) as any[];

function trialTenant(end: string, opts: { tz?: string } = {}) {
  const t = app.createTenant({ planSlug: 'starter', status: 'trial', subscriptionEnd: end });
  const admin = app.addMember(t.tenantId, ['admin']);
  if (opts.tz) app.db.prepare('UPDATE tenants SET timezone=? WHERE id=?').run(opts.tz, t.tenantId);
  return { ...t, admin };
}
const marks = (tenantId: string) =>
  (app.db.prepare('SELECT days_left FROM trial_reminders_sent WHERE tenant_id=? ORDER BY days_left DESC').all(tenantId) as any[]).map(r => r.days_left);

describe('helper de zona horaria', () => {
  it('fecha/hora local por zona (UTC-4) y DST (America/New_York)', () => {
    expect(localParts(new Date('2030-03-06T01:30:00Z'), 'America/Santo_Domingo')).toEqual({ date: '2030-03-05', hour: 21 });
    expect(localParts(new Date('2030-03-06T01:30:00Z'), 'UTC')).toEqual({ date: '2030-03-06', hour: 1 });
    // salto de DST en Nueva York: 06:59Z = 01:59 EST; 07:30Z = 03:30 EDT (la hora 2 no existe)
    expect(localParts(new Date('2030-03-10T06:59:00Z'), 'America/New_York')).toEqual({ date: '2030-03-10', hour: 1 });
    expect(localParts(new Date('2030-03-10T07:30:00Z'), 'America/New_York')).toEqual({ date: '2030-03-10', hour: 3 });
  });

  it('zona inválida o vacía cae al default del modelo; asOf y aritmética de fechas', () => {
    expect(safeTz('No/Existe')).toBe(DEFAULT_TZ);
    expect(safeTz('')).toBe(DEFAULT_TZ);
    expect(safeTz(null)).toBe(DEFAULT_TZ);
    expect(DEFAULT_TZ).toBe('America/Santo_Domingo');
    expect(asOfForTz(new Date('2030-03-06T01:30:00Z'), 'America/Santo_Domingo').toISOString()).toBe('2030-03-05T12:00:00.000Z');
    expect(addDaysStr('2030-03-31', 1)).toBe('2030-04-01');
    expect(daysBetweenStr('2030-03-05', '2030-03-12')).toBe(7);
  });
});

describe('mora y timezone del tenant', () => {
  const mkOverdue = (tz: string) => {
    const t = app.createTenant({ planSlug: 'profesional' });
    app.db.prepare('UPDATE tenants SET timezone=? WHERE id=?').run(tz, t.tenantId);
    const [loanId] = app.fillLoans(t.tenantId, 1, 'active');
    app.db.prepare(`UPDATE loans SET principal_balance=1000, interest_balance=100, total_balance=1100, mora_grace_days=0 WHERE id=?`).run(loanId);
    app.db.prepare(`INSERT INTO installments (id,loan_id,installment_number,due_date,principal_amount,interest_amount,total_amount,status) VALUES (?,?,?,?,?,?,?,'pending')`)
      .run(uid(), loanId, 1, '2030-03-05', 1000, 100, 1100);
    return { ...t, loanId };
  };

  it('tenant UTC-4: NO entra en mora a las 21:30 locales del día de vencimiento; sí pasada la medianoche local', async () => {
    const { syncLoanStatuses } = await import('../services/loanStatusSync');
    const t = mkOverdue('America/Santo_Domingo');
    syncLoanStatuses(app.db, new Date('2030-03-06T01:30:00Z')); // 21:30 del 5 de marzo (hora local)
    let loan = app.db.prepare('SELECT status, days_overdue FROM loans WHERE id=?').get(t.loanId) as any;
    expect(loan).toMatchObject({ status: 'active', days_overdue: 0 });
    expect(rows(t.ownerId, 'loan_overdue')).toHaveLength(0);
    syncLoanStatuses(app.db, new Date('2030-03-06T05:00:00Z')); // 01:00 del 6 (local)
    loan = app.db.prepare('SELECT status, days_overdue FROM loans WHERE id=?').get(t.loanId) as any;
    expect(loan).toMatchObject({ status: 'in_mora', days_overdue: 1 });
    expect(rows(t.ownerId, 'loan_overdue')).toHaveLength(1);
  });

  it('control: un tenant en UTC sí entra en mora a esa misma hora (la zona del tenant manda)', async () => {
    const { syncLoanStatuses } = await import('../services/loanStatusSync');
    const t = mkOverdue('UTC');
    syncLoanStatuses(app.db, new Date('2030-03-06T01:30:00Z'));
    expect((app.db.prepare('SELECT status FROM loans WHERE id=?').get(t.loanId) as any).status).toBe('in_mora');
  });
});

describe('recordatorios de trial', () => {
  it('email fallido NO marca el hito; el reintento posterior lo envía; in-app idempotente', async () => {
    const { runTrialReminderCron } = await import('../services/trialReminderService');
    const t = trialTenant('2030-03-12T20:00:00Z'); // 16:00 local del 12
    const now = new Date('2030-03-10T15:00:00Z');  // 11:00 local del 10 -> faltan 2 días => hito 3
    resendStatus = 400;
    const r1 = await runTrialReminderCron(app.db, now);
    expect(r1.sent).toBe(0);
    expect(marks(t.tenantId)).toEqual([]);                          // no marcado: habrá reintento
    expect(resendCalls.length).toBeGreaterThan(0);
    expect(rows(t.admin.userId, 'trial_expiring')).toHaveLength(1); // in-app creado igual
    resendStatus = 200; resendCalls.length = 0;
    const r2 = await runTrialReminderCron(app.db, now);
    expect(r2.sent).toBe(1);
    expect(marks(t.tenantId)).toEqual([3]);
    expect(resendCalls.some(c => c.subject.includes('vence en'))).toBe(true);
    resendCalls.length = 0;
    const r3 = await runTrialReminderCron(app.db, now);              // tercer tick: nada nuevo
    expect(r3.sent).toBe(0);
    expect(resendCalls).toHaveLength(0);
    expect(rows(t.admin.userId, 'trial_expiring')).toHaveLength(1);
    expect(rows(t.ownerId, 'trial_expiring')).toHaveLength(1);
  });

  it('un trial activo recibe UN solo hito (nunca 3/1/0 juntos) y el texto refleja el día local', async () => {
    const { runTrialReminderCron } = await import('../services/trialReminderService');
    const t = trialTenant('2030-03-11T20:00:00Z');   // mañana a las 16:00 local
    await runTrialReminderCron(app.db, new Date('2030-03-10T15:00:00Z'));
    expect(marks(t.tenantId)).toEqual([1]);
    const n = rows(t.admin.userId, 'trial_expiring');
    expect(n).toHaveLength(1);
    expect(n[0].title).toBe('Tu prueba gratis vence mañana');
    // el día del vencimiento (aún vigente): "vence hoy"
    await runTrialReminderCron(app.db, new Date('2030-03-11T15:00:00Z'));
    expect(marks(t.tenantId)).toEqual([1, 0]);
    expect(rows(t.admin.userId, 'trial_expiring').map(r => r.title).sort()).toEqual(['Tu prueba gratis vence hoy', 'Tu prueba gratis vence mañana']);
    expect(rows(t.admin.userId, 'trial_expiring').every(r => r.required_permission === null)).toBe(true);
  });

  it('el día se calcula en la zona del tenant (mismo instante, distinto "hoy")', async () => {
    const { runTrialReminderCron } = await import('../services/trialReminderService');
    // vence 02:00Z del 11 = 22:00 local del 10. "ahora" 15:00Z del 10 = 11:00 local del 10.
    const dr = trialTenant('2030-03-11T02:00:00Z', { tz: 'America/Santo_Domingo' });
    const utc = trialTenant('2030-03-11T02:00:00Z', { tz: 'UTC' });
    await runTrialReminderCron(app.db, new Date('2030-03-10T15:00:00Z'));
    expect(rows(dr.admin.userId, 'trial_expiring')[0].title).toBe('Tu prueba gratis vence hoy');
    expect(rows(utc.admin.userId, 'trial_expiring')[0].title).toBe('Tu prueba gratis vence mañana');
  });

  it('trial vencido: aviso in-app persistente y UN solo email "terminó" (no 3/1/0 juntos); nada si venció hace > 14 días', async () => {
    const { runTrialReminderCron } = await import('../services/trialReminderService');
    const expired = trialTenant('2030-03-08T20:00:00Z');
    const ancient = trialTenant('2030-01-01T20:00:00Z');
    const now = new Date('2030-03-10T15:00:00Z');
    await runTrialReminderCron(app.db, now);
    expect(rows(expired.admin.userId, 'trial_expired')).toHaveLength(1);
    expect(rows(expired.admin.userId, 'trial_expired')[0].title).toBe('Tu prueba gratis terminó');
    expect(rows(expired.admin.userId, 'trial_expiring')).toHaveLength(0);
    expect(marks(expired.tenantId)).toEqual([-1]);
    expect(resendCalls.filter(c => c.subject === 'Tu prueba de CredyTek terminó')).toHaveLength(1);
    expect(rows(ancient.admin.userId)).toHaveLength(0);
    expect(marks(ancient.tenantId)).toEqual([]);
    // el aviso es legible desde la API de notificaciones (el 402 real está cubierto en notificationsV2.test.ts)
    expect((await app.req('GET', '/api/notifications', { token: expired.admin.token, tenantId: expired.tenantId })).body.notifications[0].type).toBe('trial_expired');
  });

  it('antes de las 9:00 locales no se envía email (sí el in-app); sin Resend no se marca nada', async () => {
    const { runTrialReminderCron } = await import('../services/trialReminderService');
    const t = trialTenant('2030-03-12T20:00:00Z');
    await runTrialReminderCron(app.db, new Date('2030-03-10T12:00:00Z')); // 08:00 local
    expect(rows(t.admin.userId, 'trial_expiring')).toHaveLength(1);
    expect(resendCalls).toHaveLength(0);
    const key = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
    try {
      await runTrialReminderCron(app.db, new Date('2030-03-10T15:00:00Z'));
      expect(marks(t.tenantId)).toEqual([]);
    } finally { process.env.RESEND_API_KEY = key; }
  });
});

describe('trial: backfill histórico vs. funcionamiento normal (sin emails retroactivos)', () => {
  const KEY = 'notifications_v2_2026_10';
  const deployedAt = () => (app.db.prepare('SELECT applied_at FROM app_migrations WHERE key=?').get(KEY) as any).applied_at as string;
  let original = '';
  beforeAll(() => { original = deployedAt(); });
  afterAll(() => { app.db.prepare('UPDATE app_migrations SET applied_at=? WHERE key=?').run(original, KEY); });
  // aislar: los trials creados por otros tests de este archivo no participan
  beforeEach(() => { app.db.prepare(`UPDATE tenants SET subscription_status='active' WHERE subscription_status='trial'`).run(); });
  const deployOn = (iso: string) => app.db.prepare('UPDATE app_migrations SET applied_at=? WHERE key=?').run(iso, KEY);

  it('el marcador de despliegue de V2 existe y es idempotente (no se reescribe en reinicios)', async () => {
    expect(original).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const dbMod = await import('../db/database');
    dbMod.initializeDatabase();
    expect(deployedAt()).toBe(original);
  });

  it('trial YA vencido antes de V2: solo in-app idempotente; ningún email, ninguna marca; restarts posteriores tampoco envían', async () => {
    const { runTrialReminderCron } = await import('../services/trialReminderService');
    deployOn('2030-03-09T00:00:00.000Z');
    const t = trialTenant('2030-03-08T20:00:00Z');                 // venció ANTES del despliegue
    const now = new Date('2030-03-10T15:00:00Z');                   // 11:00 locales
    for (let restart = 0; restart < 3; restart++) {                 // primer arranque + 2 reinicios/ticks
      const r = await runTrialReminderCron(app.db, now);
      expect(r.sent).toBe(0);
    }
    expect(rows(t.admin.userId, 'trial_expired')).toHaveLength(1);  // in-app sí, una sola vez
    expect(rows(t.ownerId, 'trial_expired')).toHaveLength(1);
    expect(resendCalls).toHaveLength(0);                            // nada de email retroactivo
    expect(marks(t.tenantId)).toEqual([]);                          // y no se marca algo que nunca correspondió enviar
    // un día después y con Resend sano: sigue sin enviarse nada
    await runTrialReminderCron(app.db, new Date('2030-03-11T15:00:00Z'));
    expect(resendCalls).toHaveLength(0);
    expect(marks(t.tenantId)).toEqual([]);
  });

  it('trial que vence DESPUÉS de V2: reminders normales, vence hoy, y transición real a vencido con email una sola vez', async () => {
    const { runTrialReminderCron } = await import('../services/trialReminderService');
    deployOn('2030-03-09T00:00:00.000Z');
    const t = trialTenant('2030-03-10T20:00:00Z');                  // vence 16:00 locales del 10 (posterior al despliegue)
    // 1 día antes -> reminder normal
    expect((await runTrialReminderCron(app.db, new Date('2030-03-09T15:00:00Z'))).sent).toBe(1);
    expect(marks(t.tenantId)).toEqual([1]);
    expect(resendCalls.at(-1)!.subject).toBe('Tu prueba de CredyTek vence mañana');
    // día del vencimiento -> mensaje "vence hoy"
    expect((await runTrialReminderCron(app.db, new Date('2030-03-10T15:00:00Z'))).sent).toBe(1);
    expect(resendCalls.at(-1)!.subject).toBe('Tu prueba de CredyTek vence hoy');
    expect(marks(t.tenantId)).toEqual([1, 0]);
    // transición real a vencido -> in-app persistente + email "terminó" (una vez)
    expect((await runTrialReminderCron(app.db, new Date('2030-03-11T15:00:00Z'))).sent).toBe(1);
    expect(resendCalls.at(-1)!.subject).toBe('Tu prueba de CredyTek terminó');
    expect(marks(t.tenantId)).toEqual([1, 0, -1]);
    expect(rows(t.admin.userId, 'trial_expired')).toHaveLength(1);
    // reinicios/ticks posteriores: no vuelven a enviar nada
    const callsAfter = resendCalls.length;
    for (let i = 0; i < 3; i++) await runTrialReminderCron(app.db, new Date('2030-03-11T16:00:00Z'));
    await runTrialReminderCron(app.db, new Date('2030-03-12T15:00:00Z'));
    expect(resendCalls).toHaveLength(callsAfter);
    expect(rows(t.admin.userId, 'trial_expired')).toHaveLength(1);
  });

  it('el email del vencido solo se marca si Resend confirma; si falla, reintenta (trial posterior a V2)', async () => {
    const { runTrialReminderCron } = await import('../services/trialReminderService');
    deployOn('2030-03-09T00:00:00.000Z');
    const t = trialTenant('2030-03-10T20:00:00Z');
    const now = new Date('2030-03-11T15:00:00Z');
    resendStatus = 400;
    expect((await runTrialReminderCron(app.db, now)).sent).toBe(0);
    expect(marks(t.tenantId)).toEqual([]);
    resendStatus = 200;
    expect((await runTrialReminderCron(app.db, now)).sent).toBe(1);
    expect(marks(t.tenantId)).toEqual([-1]);
  });

  it('en una misma corrida, histórico y posterior se tratan distinto: solo el posterior envía email', async () => {
    const { runTrialReminderCron } = await import('../services/trialReminderService');
    deployOn('2030-03-09T00:00:00.000Z');
    const historic = trialTenant('2030-03-08T20:00:00Z');
    const later = trialTenant('2030-03-10T20:00:00Z');
    resendCalls.length = 0;
    const r = await runTrialReminderCron(app.db, new Date('2030-03-11T15:00:00Z'));
    expect(r.sent).toBe(1);
    expect(marks(historic.tenantId)).toEqual([]);
    expect(marks(later.tenantId)).toEqual([-1]);
    expect(rows(historic.admin.userId, 'trial_expired')).toHaveLength(1);
    expect(rows(later.admin.userId, 'trial_expired')).toHaveLength(1);
  });
});

describe('resumen programado (digest)', () => {
  it('isDigestDue: diario/semanal/mensual por días de calendario, estable ante la latencia del envío anterior', async () => {
    const { isDigestDue } = await import('../services/reportSubscriptionService');
    const tz = 'America/Santo_Domingo';
    // el envío anterior terminó 5 s DESPUÉS del tick; el siguiente tick llega 5 s ANTES de las 24 h
    expect(isDigestDue({ frequency: 'daily', last_sent_at: '2030-03-05T11:00:05.000Z' }, new Date('2030-03-06T11:00:00Z'), tz)).toBe(true);
    expect(isDigestDue({ frequency: 'daily', last_sent_at: '2030-03-06T11:00:05.000Z' }, new Date('2030-03-06T15:00:00Z'), tz)).toBe(false); // mismo día local
    expect(isDigestDue({ frequency: 'weekly', last_sent_at: '2030-03-01T11:00:05.000Z' }, new Date('2030-03-08T11:00:00Z'), tz)).toBe(true);
    expect(isDigestDue({ frequency: 'weekly', last_sent_at: '2030-03-01T11:00:05.000Z' }, new Date('2030-03-07T11:00:00Z'), tz)).toBe(false);
    expect(isDigestDue({ frequency: 'monthly', last_sent_at: '2030-03-01T11:00:05.000Z' }, new Date('2030-03-29T11:00:00Z'), tz)).toBe(true);
    expect(isDigestDue({ frequency: 'monthly', last_sent_at: '2030-03-01T11:00:05.000Z' }, new Date('2030-03-28T11:00:00Z'), tz)).toBe(false);
    expect(isDigestDue({ frequency: 'daily', last_sent_at: null }, new Date('2030-03-06T11:00:00Z'), tz)).toBe(true);
    // formato SQLite sin zona = UTC
    expect(isDigestDue({ frequency: 'daily', last_sent_at: '2030-03-05 11:00:05' }, new Date('2030-03-06T11:00:00Z'), tz)).toBe(true);
  });

  beforeEach(() => { app.db.prepare('UPDATE report_subscriptions SET is_active=0').run(); }); // aislar cada test
  const sub = (planSlug: string, frequency: string) => {
    const t = app.createTenant({ planSlug });
    const id = uid();
    app.db.prepare('INSERT INTO report_subscriptions (id,tenant_id,user_id,frequency,recipients,is_active) VALUES (?,?,?,?,?,1)').run(id, t.tenantId, t.ownerId, frequency, 'o@t.test');
    const last = () => (app.db.prepare('SELECT last_sent_at FROM report_subscriptions WHERE id=?').get(id) as any).last_sent_at as string | null;
    return { t, id, last };
  };

  it('diario realmente diario durante varios días; semanal cada 7; mensual cada 28', async () => {
    const { runScheduledReportsCron } = await import('../services/reportSubscriptionService');
    const d = sub('basico', 'daily'); const w = sub('basico', 'weekly'); const m = sub('basico', 'monthly');
    const sentOn: Record<string, string[]> = { d: [], w: [], m: [] };
    const base = Date.UTC(2030, 2, 1, 12, 0, 0); // 08:00 locales
    for (let day = 0; day < 30; day++) {
      const now = new Date(base + day * 86400000 - 4000); // cada tick llega unos segundos antes del anterior+24h
      const before = { d: d.last(), w: w.last(), m: m.last() };
      await runScheduledReportsCron(app.db, now);
      const date = now.toISOString().slice(0, 10);
      if (d.last() !== before.d) sentOn.d.push(date);
      if (w.last() !== before.w) sentOn.w.push(date);
      if (m.last() !== before.m) sentOn.m.push(date);
    }
    expect(sentOn.d).toHaveLength(30);                     // todos los días
    expect(sentOn.w.length).toBeGreaterThanOrEqual(4);     // cada 7 días (días 0,7,14,21,28)
    expect(sentOn.w.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < sentOn.w.length; i++) expect(daysBetweenStr(sentOn.w[i - 1], sentOn.w[i])).toBe(7);
    expect(sentOn.m).toHaveLength(2);                      // día 0 y día 28
    expect(daysBetweenStr(sentOn.m[0], sentOn.m[1])).toBe(28);
  });

  it('un fallo NO actualiza last_sent_at y permite reintento; no duplica si corre dos veces el mismo día', async () => {
    const { runScheduledReportsCron } = await import('../services/reportSubscriptionService');
    const s = sub('basico', 'daily');
    const now = new Date('2030-04-02T15:00:00Z'); // 11:00 locales
    resendStatus = 400;
    expect((await runScheduledReportsCron(app.db, now)).sent).toBe(0);
    expect(s.last()).toBeNull();
    resendStatus = 200; resendCalls.length = 0;
    expect((await runScheduledReportsCron(app.db, now)).sent).toBe(1);
    expect(s.last()).toBe(now.toISOString());
    expect(resendCalls).toHaveLength(1);
    await runScheduledReportsCron(app.db, new Date('2030-04-02T16:00:00Z')); // otro tick el mismo día local
    expect(resendCalls).toHaveLength(1);
  });

  it('respeta la hora local (no antes de las 7:00) y el plan (Starter conserva la suscripción sin enviar)', async () => {
    const { runScheduledReportsCron } = await import('../services/reportSubscriptionService');
    const early = sub('basico', 'daily'); const starter = sub('starter', 'daily');
    await runScheduledReportsCron(app.db, new Date('2030-04-03T10:00:00Z')); // 06:00 locales
    expect(early.last()).toBeNull();
    await runScheduledReportsCron(app.db, new Date('2030-04-03T15:00:00Z'));
    expect(early.last()).not.toBeNull();
    expect(starter.last()).toBeNull();
  });
});

describe('WhatsApp de mora: hitos con recuperación (solo borradores)', () => {
  function setup(planSlug = 'basico') {
    const t = app.createTenant({ planSlug });
    const clientId = app.createClient(t.tenantId);
    app.db.prepare('UPDATE clients SET whatsapp=?, phone_personal=? WHERE id=?').run('8095550000', '8095550000', clientId);
    const ins = app.db.prepare(`INSERT OR REPLACE INTO whatsapp_event_settings (id,tenant_id,event,enabled) VALUES (?,?,?,1)`);
    for (const ev of ['pre_due_3', 'overdue_1', 'overdue_7', 'overdue_15']) ins.run(uid(), t.tenantId, ev);
    const [loanId] = app.fillLoans(t.tenantId, 1, 'active', clientId);
    const inst = (due: string) => {
      const id = uid();
      app.db.prepare(`INSERT INTO installments (id,loan_id,installment_number,due_date,principal_amount,interest_amount,total_amount,status) VALUES (?,?,?,?,?,?,?,'pending')`)
        .run(id, loanId, Math.floor(Math.random() * 1e6), due, 100, 10, 110);
      return id;
    };
    const drafts = () => (app.db.prepare(`SELECT installment_id, event FROM whatsapp_messages WHERE tenant_id=?`).all(t.tenantId) as any[]);
    return { t, inst, drafts };
  }

  it('crea SOLO el hito correspondiente (incluido el recuperado de un día perdido), nunca dos, y es idempotente', async () => {
    const { runOverdueCron } = await import('../services/whatsappService');
    const { t, inst, drafts } = setup();
    const now = new Date('2030-06-15T16:00:00Z'); // 12:00 locales del 15 de junio
    const i1 = inst('2030-06-14');   // 1 día
    const i2 = inst('2030-06-13');   // 2 días (el job de ayer se perdió)
    const i7 = inst('2030-06-08');   // 7 días
    const i15 = inst('2030-05-31');  // 15 días
    const old = inst('2030-05-20');  // 26 días: fuera de la ventana de recuperación
    const pre = inst('2030-06-17');  // faltan 2 días
    const far = inst('2030-06-25');  // aún lejos
    runOverdueCron(app.db, now);
    const byInst = Object.fromEntries(drafts().map(d => [d.installment_id, d.event]));
    expect(byInst[i1]).toBe('overdue_1');
    expect(byInst[i2]).toBe('overdue_1');
    expect(byInst[i7]).toBe('overdue_7');   // no se crea además overdue_1
    expect(byInst[i15]).toBe('overdue_15'); // ni 1 ni 7
    expect(byInst[old]).toBeUndefined();
    expect(byInst[pre]).toBe('pre_due_3');
    expect(byInst[far]).toBeUndefined();
    expect(drafts()).toHaveLength(5);
    runOverdueCron(app.db, now); runOverdueCron(app.db, new Date('2030-06-15T20:00:00Z'));
    expect(drafts()).toHaveLength(5);       // nunca duplica
    // 6 días después i1 llega a 7 días: ahora SÍ toca su siguiente hito (overdue_7), sin repetir overdue_1
    runOverdueCron(app.db, new Date('2030-06-21T16:00:00Z'));
    expect(drafts().filter(d => d.installment_id === i1).map(d => d.event).sort()).toEqual(['overdue_1', 'overdue_7']);
    // no hay envío automático: todo queda como borrador
    expect((app.db.prepare(`SELECT COUNT(*) c FROM whatsapp_messages WHERE tenant_id=? AND status!='draft'`).get(t.tenantId) as any).c).toBe(0);
  });

  it('el día es el LOCAL del tenant: a las 21:00 locales aún no hay "1 día de atraso"', async () => {
    const { runOverdueCron } = await import('../services/whatsappService');
    const { inst, drafts } = setup();
    inst('2030-06-14');
    runOverdueCron(app.db, new Date('2030-06-15T01:00:00Z')); // 21:00 del 14 (local): vence hoy
    expect(drafts()).toHaveLength(0);
    runOverdueCron(app.db, new Date('2030-06-15T13:00:00Z')); // 09:00 del 15 (local): 1 día
    expect(drafts().map(d => d.event)).toEqual(['overdue_1']);
  });

  it('plan sin WhatsApp (Starter): no se generan borradores', async () => {
    const { runOverdueCron } = await import('../services/whatsappService');
    const { inst, drafts } = setup('starter');
    inst('2030-06-14');
    runOverdueCron(app.db, new Date('2030-06-15T16:00:00Z'));
    expect(drafts()).toHaveLength(0);
  });
});

describe('scheduler resiliente', () => {
  it('es seguro repetirlo: el sync de mora corre una vez por día local y el arranque lo recupera sin duplicar avisos', async () => {
    const { runSchedulerTick, jobRan } = await import('../services/scheduler');
    const t = app.createTenant({ planSlug: 'profesional' });
    const [loanId] = app.fillLoans(t.tenantId, 1, 'active');
    app.db.prepare(`UPDATE loans SET principal_balance=1000, total_balance=1100, mora_grace_days=0 WHERE id=?`).run(loanId);
    app.db.prepare(`INSERT INTO installments (id,loan_id,installment_number,due_date,principal_amount,interest_amount,total_amount,status) VALUES (?,?,?,?,?,?,?,'pending')`)
      .run(uid(), loanId, 1, '2030-07-01', 1000, 100, 1100);
    const now = new Date('2030-07-05T16:00:00Z');
    const s1 = await runSchedulerTick(app.db, now, { startup: true });     // "reinicio": recupera el trabajo del día
    expect(s1.loanSync).toBeGreaterThanOrEqual(1);
    expect((app.db.prepare('SELECT status FROM loans WHERE id=?').get(loanId) as any).status).toBe('in_mora');
    expect(rows(t.ownerId, 'loan_overdue')).toHaveLength(1);
    const s2 = await runSchedulerTick(app.db, now);                          // tick repetido: sin trabajo nuevo
    expect(s2.loanSync).toBe(0);
    await runSchedulerTick(app.db, now, { startup: true });                  // otro "reinicio" el mismo día
    expect(rows(t.ownerId, 'loan_overdue')).toHaveLength(1);
    expect(jobRan(app.db, 'loan_sync', t.tenantId, '2030-07-05')).toBe(true);
    // al día local siguiente vuelve a correr
    expect(jobRan(app.db, 'loan_sync', t.tenantId, '2030-07-06')).toBe(false);
    await runSchedulerTick(app.db, new Date('2030-07-06T16:00:00Z'));
    expect(jobRan(app.db, 'loan_sync', t.tenantId, '2030-07-06')).toBe(true);
  });

  it('WhatsApp y alertas de promesas corren a partir de las 8:00 locales, una vez al día; el backup una vez por día UTC', async () => {
    const { runSchedulerTick, jobRan } = await import('../services/scheduler');
    const t = app.createTenant({ planSlug: 'basico' });
    let backups = 0;
    const backup = async () => { backups++; };
    const day = (h: number, d = 8) => new Date(Date.UTC(2030, 7, d, h, 0, 0));
    await runSchedulerTick(app.db, day(11), { backup });                     // 07:00 locales: aún no
    expect(jobRan(app.db, 'wa_overdue', t.tenantId, '2030-08-08')).toBe(false);
    expect(jobRan(app.db, 'promise_alerts', t.tenantId, '2030-08-08')).toBe(false);
    expect(backups).toBe(1);                                                  // 11:00 UTC >= 03:00 UTC
    await runSchedulerTick(app.db, day(13), { backup });                      // 09:00 locales: toca
    expect(jobRan(app.db, 'wa_overdue', t.tenantId, '2030-08-08')).toBe(true);
    expect(jobRan(app.db, 'promise_alerts', t.tenantId, '2030-08-08')).toBe(true);
    await runSchedulerTick(app.db, day(14), { backup });                      // otro tick el mismo día
    expect(backups).toBe(1);
    await runSchedulerTick(app.db, day(2, 9), { backup });                    // 02:00 UTC del día siguiente: aún no
    expect(backups).toBe(1);
    await runSchedulerTick(app.db, day(4, 9), { backup });
    expect(backups).toBe(2);
  });

  it('no usa banderas en memoria: el estado vive en job_runs (sobrevive a un reinicio)', async () => {
    const src = (await import('fs')).readFileSync(new URL('../services/scheduler.ts', import.meta.url), 'utf8');
    const index = (await import('fs')).readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    expect(src).toMatch(/job_runs/);
    expect(index).not.toMatch(/lastCronDate|lastStatusSyncDate|lastTrialReminderDate|lastReportDigestDate/);
    expect(index).toMatch(/startScheduler\(/);
  });
});

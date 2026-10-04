// PUT /loans/:id — edición DELTA-BASED y segura.
// Reproduce los defectos auditados (editar notas/mora regeneraba el calendario, borraba deferred_due_date y,
// en estados cerrados, dejaba las cuotas pagadas como pendientes) y verifica que ya no ocurren.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { bootTestApp, TestApp } from './helpers/testApp';
import { loanEditPhase, diffLoanEdit, checkLoanEditAllowed, changesSchedule } from '../lib/loanEdit';
import {
  buildLoanEditPayload, loanEditLocks, installmentsHavePayments, loanEditPhase as fePhase, LoanEditForm,
} from '../../../frontend/src/lib/loanEdit';

let app: TestApp;
afterAll(async () => { await app.close(); });

type T = { token: string; tenantId: string };
let tenant: T;
let productId: string;
beforeAll(async () => { app = await bootTestApp(); tenant = app.createTenant({ planSlug: 'enterprise' }); productId = app.createProduct(tenant.tenantId); });
const call = (method: string, url: string, body?: any, t: T = tenant) => app.req(method, url, { token: t.token, tenantId: t.tenantId, body });

const loanRow = (id: string) => app.db.prepare('SELECT * FROM loans WHERE id=?').get(id) as any;
const snap = (id: string) => app.db.prepare('SELECT id, installment_number n, due_date d, principal_amount p, interest_amount i, status s, deferred_due_date dd FROM installments WHERE loan_id=? ORDER BY installment_number').all(id) as any[];
const ids = (id: string) => snap(id).map(x => x.id).join(',');
const audits = (id: string) => app.db.prepare('SELECT * FROM audit_logs WHERE entity_id=? ORDER BY rowid').all(id) as any[];
const actions = (id: string) => audits(id).map(a => a.action);
const setStatus = (id: string, st: string) => app.db.prepare('UPDATE loans SET status=? WHERE id=?').run(st, id);

/** Payload "como el modal viejo": TODOS los campos con su valor actual, más los cambios indicados. */
const fullPayload = (id: string, over: any = {}) => {
  const l = loanRow(id);
  return {
    requested_amount: l.requested_amount, approved_amount: l.approved_amount, rate: l.rate, rate_type: l.rate_type, term: l.term, term_unit: l.term_unit,
    payment_frequency: l.payment_frequency, amortization_type: l.amortization_type,
    application_date: l.application_date, approval_date: l.approval_date, disbursement_date: l.disbursement_date, first_payment_date: l.first_payment_date, maturity_date: l.maturity_date,
    mora_rate_daily: l.mora_rate_daily, mora_grace_days: l.mora_grace_days, mora_base: l.mora_base, mora_fixed_enabled: l.mora_fixed_enabled, mora_fixed_amount: l.mora_fixed_amount, mora_start_date: l.mora_start_date,
    collector_id: l.collector_id, purpose: l.purpose, notes: l.notes, prorroga_fee: l.prorroga_fee, ...over,
  };
};

async function newLoan(): Promise<string> {
  const clientId = app.createClient(tenant.tenantId);
  const r = await call('POST', '/api/loans', { client_id: clientId, product_id: productId, requested_amount: 6000, term: 6, first_payment_date: '2030-02-01' });
  expect(r.status).toBe(201);
  return r.body.id;
}
/** Préstamo pre-desembolso CON calendario generado (cambiando la tasa una vez). */
async function preLoanWithSchedule(): Promise<string> {
  const id = await newLoan();
  const r = await call('PUT', `/api/loans/${id}`, { rate: 12 });
  expect(r.status).toBe(200);
  expect(snap(id)).toHaveLength(6);
  return id;
}
/** Préstamo desembolsado (active) con un pago aplicado a la primera cuota. */
async function activeLoanWithPayment(): Promise<string> {
  const id = await newLoan();
  setStatus(id, 'approved');
  expect((await call('POST', `/api/loans/${id}/disburse`, {})).status).toBe(200);
  const first = snap(id)[0];
  const pay = await call('POST', '/api/payments', { loan_id: id, amount: first.p + first.i + 5, payment_method: 'cash' });
  expect(pay.status).toBe(201);
  return id;
}
async function closedLoan(status: string): Promise<string> {
  const id = await newLoan();
  setStatus(id, 'approved');
  await call('POST', `/api/loans/${id}/disburse`, {});
  app.db.prepare("UPDATE installments SET status='paid', paid_total=principal_amount+interest_amount, paid_at=datetime('now') WHERE loan_id=?").run(id);
  setStatus(id, status);
  return id;
}

describe('clasificación de estados y campos (lib)', () => {
  it('estados: pre-desembolso / post-desembolso / cerrados', () => {
    for (const s of ['draft', 'under_review', 'pending_manager_approval', 'approved']) expect(loanEditPhase(s)).toBe('pre');
    for (const s of ['disbursed', 'active', 'in_mora', 'restructured', 'algo_desconocido']) expect(loanEditPhase(s)).toBe('post');
    for (const s of ['rejected', 'cancelled', 'voided', 'written_off', 'liquidated', 'paid']) expect(loanEditPhase(s)).toBe('terminal');
  });
  it('solo los campos que definen el calendario lo regeneran', () => {
    for (const f of ['requested_amount', 'approved_amount', 'rate', 'rate_type', 'term', 'term_unit', 'payment_frequency', 'amortization_type', 'first_payment_date'])
      expect(changesSchedule([f]), f).toBe(true);
    for (const f of ['notes', 'purpose', 'collector_id', 'mora_rate_daily', 'mora_grace_days', 'mora_base', 'mora_fixed_enabled', 'mora_fixed_amount', 'mora_start_date', 'prorroga_fee', 'application_date', 'approval_date'])
      expect(changesSchedule([f]), f).toBe(false);
  });
  it('diff: valores idénticos (aunque cambie el formato) no son cambios; fechas se comparan por día', () => {
    const loan = { rate: 12, term: 6, notes: null, first_payment_date: '2030-02-01T00:00:00.000Z', mora_rate_daily: 0.001, mora_fixed_enabled: 0, collector_id: null, requested_amount: 6000 };
    const d = diffLoanEdit(loan, { rate: '12.0', term: '6', notes: '', first_payment_date: '2030-02-01', mora_rate_daily: 0.001, mora_fixed_enabled: false, collector_id: '', requested_amount: '6000' });
    expect(d.changedFields).toEqual([]);
    const d2 = diffLoanEdit(loan, { rate: 13, notes: 'hola', first_payment_date: '2030-03-01' });
    expect(d2.changedFields.sort()).toEqual(['first_payment_date', 'notes', 'rate']);
    expect(d2.previous.rate).toBe(12);
  });
  it('guards: terminal solo notas/propósito; post bloquea estructurales; pre con historial bloquea estructurales', () => {
    expect(checkLoanEditAllowed('terminal', ['notes'], true)).toBeNull();
    expect(checkLoanEditAllowed('terminal', ['notes', 'purpose'], true)?.code).toBe('LOAN_CLOSED_LOCKED');
    expect(checkLoanEditAllowed('terminal', ['notes', 'mora_base'], true)?.code).toBe('LOAN_CLOSED_LOCKED');
    expect(checkLoanEditAllowed('post', ['collector_id', 'purpose', 'notes'], true)).toBeNull();
    for (const f of ['mora_base', 'mora_start_date', 'prorroga_fee', 'application_date', 'approval_date', 'disbursement_date', 'first_payment_date'])
      expect(checkLoanEditAllowed('post', [f], false)?.code, f).toBe('LOAN_TERMS_LOCKED');
    for (const ph of ['pre', 'post', 'terminal'] as const) expect(checkLoanEditAllowed(ph, ['maturity_date'], false)?.code, ph).toBe('LOAN_MATURITY_DERIVED');
    expect(checkLoanEditAllowed('pre', ['mora_base', 'application_date', 'prorroga_fee'], true)).toBeNull();
    expect(checkLoanEditAllowed('post', ['rate'], true)?.code).toBe('LOAN_TERMS_LOCKED');
    expect(checkLoanEditAllowed('pre', ['rate'], false)).toBeNull();
    expect(checkLoanEditAllowed('pre', ['rate'], true)?.code).toBe('LOAN_TERMS_LOCKED');
    expect(checkLoanEditAllowed('pre', ['notes'], true)).toBeNull();
  });
});

describe('pre-desembolso: regenera solo cuando algo del calendario REALMENTE cambia', () => {
  it('cambiar realmente la tasa regenera; cambiar el plazo también (y cambia el número de cuotas)', async () => {
    const id = await newLoan();
    expect(snap(id)).toHaveLength(0);
    const r1 = await call('PUT', `/api/loans/${id}`, { rate: 12 });
    expect(r1.status).toBe(200);
    expect(r1.body.schedule_regenerated).toBe(true);
    const a = snap(id);
    expect(a).toHaveLength(6);
    const r2 = await call('PUT', `/api/loans/${id}`, { rate: 18 });
    expect(r2.body.schedule_regenerated).toBe(true);
    const b = snap(id);
    expect(b.map(x => x.id)).not.toEqual(a.map(x => x.id));
    expect(b[0].i).toBeGreaterThan(a[0].i);                         // más interés con tasa mayor
    const r3 = await call('PUT', `/api/loans/${id}`, { term: 8 });
    expect(r3.body.schedule_regenerated).toBe(true);
    expect(snap(id)).toHaveLength(8);
  });
  it('cambiar la fecha del primer pago regenera (las cuotas cambian de fecha)', async () => {
    const id = await preLoanWithSchedule();
    const before = snap(id)[0].d;
    const r = await call('PUT', `/api/loans/${id}`, { first_payment_date: '2030-03-15' });
    expect(r.body.schedule_regenerated).toBe(true);
    expect(snap(id)[0].d).not.toBe(before);
  });
  it('enviar la tasa idéntica (o el formulario completo sin cambios) -> 0 regeneración, 0 escrituras, 0 audit', async () => {
    const id = await preLoanWithSchedule();
    const idsBefore = ids(id); const updatedAt = loanRow(id).updated_at; const nAudit = audits(id).length;
    const r1 = await call('PUT', `/api/loans/${id}`, { rate: 12 });
    const r2 = await call('PUT', `/api/loans/${id}`, { rate: '12.00' });
    const r3 = await call('PUT', `/api/loans/${id}`, fullPayload(id));
    for (const r of [r1, r2, r3]) { expect(r.status).toBe(200); expect(r.body.changed_fields).toEqual([]); }
    expect(ids(id)).toBe(idsBefore);
    expect(loanRow(id).updated_at).toBe(updatedAt);
    expect(audits(id)).toHaveLength(nAudit);
  });
  it('solo notas / cobrador / mora / propósito -> 0 regeneración (ids de cuotas intactos), también con el payload completo del modal viejo', async () => {
    const id = await preLoanWithSchedule();
    const idsBefore = ids(id);
    const collector = app.addMember(tenant.tenantId, ['cobrador']).userId;
    const cases: Array<[string, any]> = [
      ['notas', { notes: 'una nota' }], ['cobrador', { collector_id: collector }],
      ['mora', { mora_rate_daily: 0.004, mora_grace_days: 2, mora_base: 'capital_pendiente', mora_fixed_enabled: 1, mora_fixed_amount: 75 }],
      ['propósito', { purpose: 'capital de trabajo' }],
    ];
    for (const [name, body] of cases) {
      const r = await call('PUT', `/api/loans/${id}`, body);
      expect(r.status, name).toBe(200);
      expect(r.body.schedule_regenerated, name).toBe(false);
      expect(ids(id), name).toBe(idsBefore);
    }
    const r = await call('PUT', `/api/loans/${id}`, fullPayload(id, { notes: 'otra nota, payload completo' }));
    expect(r.status).toBe(200);
    expect(r.body.changed_fields).toEqual(['notes']);
    expect(ids(id)).toBe(idsBefore);
    expect(loanRow(id).notes).toBe('otra nota, payload completo');
    expect(actions(id).filter(a => a === 'loan_schedule_regenerated')).toHaveLength(1);   // solo la del cambio real de tasa (preLoanWithSchedule)
    expect(actions(id)).not.toContain('loan_restructured');
  });
});

describe('post-desembolso y préstamos con pagos', () => {
  it('REPRO 1 — activo con pagos + editar solo una nota: cuotas, ids, estados y saldos intactos', async () => {
    const id = await activeLoanWithPayment();
    const before = snap(id); const lBefore = loanRow(id);
    const r = await call('PUT', `/api/loans/${id}`, fullPayload(id, { notes: 'solo nota' }));      // payload completo, como el modal viejo
    expect(r.status).toBe(200);
    expect(snap(id)).toEqual(before);                                                                // mismos ids / estados / fechas
    const lAfter = loanRow(id);
    for (const k of ['principal_balance', 'interest_balance', 'total_balance', 'total_interest', 'status', 'rate', 'term', 'maturity_date']) expect(lAfter[k], k).toBe(lBefore[k]);
    expect(lAfter.notes).toBe('solo nota');
    expect(actions(id)).not.toContain('loan_restructured');
  });
  it('REPRO 2 — activo con prórroga + editar cobrador/propósito/notas (la mora ya no se edita): deferred_due_date sobrevive y no cambian los ids', async () => {
    const id = await activeLoanWithPayment();
    app.db.prepare("UPDATE installments SET deferred_due_date='2031-01-01' WHERE loan_id=? AND installment_number=3").run(id);
    const before = snap(id);
    const collector = app.addMember(tenant.tenantId, ['cobrador']).userId;
    for (const body of [{ purpose: 'p0' }, { collector_id: collector }, { notes: 'x' }, fullPayload(id, { purpose: 'p' })]) {
      const r = await call('PUT', `/api/loans/${id}`, body);
      expect(r.status).toBe(200);
      expect(snap(id)).toEqual(before);
      expect(snap(id).find(x => x.n === 3)?.dd).toBe('2031-01-01');
    }
    // la mora ya no se edita tras el desembolso: se rechaza y la prórroga sigue intacta
    expect((await call('PUT', `/api/loans/${id}`, { mora_rate_daily: 0.002, mora_grace_days: 1 })).status).toBe(409);
    expect(snap(id)).toEqual(before);
    expect(actions(id)).not.toContain('loan_restructured');
    expect(actions(id)).not.toContain('loan_schedule_regenerated');
  });
  it('activo: cambiar monto/tasa/plazo/frecuencia/amortización/fechas estructurales -> 409 LOAN_TERMS_LOCKED y nada cambia', async () => {
    const id = await activeLoanWithPayment();
    const before = snap(id); const l0 = loanRow(id);
    const attempts: any[] = [
      { rate: 25 }, { term: 10 }, { requested_amount: 9000 }, { approved_amount: 9000 }, { payment_frequency: 'weekly' }, { amortization_type: 'interest_only' },
      { first_payment_date: '2031-05-01' }, { disbursement_date: '2029-01-01' }, { rate_type: 'annual' }, { term_unit: 'weeks' },
    ];
    for (const body of attempts) {
      const r = await call('PUT', `/api/loans/${id}`, body);
      expect(r.status, JSON.stringify(body)).toBe(409);
      expect(r.body.code).toBe('LOAN_TERMS_LOCKED');
      expect(r.body.locked_fields.length).toBeGreaterThan(0);
    }
    // un cambio mixto (operativo + estructural) se rechaza completo: no se aplica nada parcial
    const mixed = await call('PUT', `/api/loans/${id}`, { notes: 'no debe guardarse', rate: 30 });
    expect(mixed.status).toBe(409);
    expect(snap(id)).toEqual(before);
    const l1 = loanRow(id);
    for (const k of ['rate', 'term', 'requested_amount', 'notes', 'updated_at', 'maturity_date']) expect(l1[k], k).toBe(l0[k]);
  });
  it('in_mora / disbursed / restructured también bloquean términos y mora, y permiten notas/propósito', async () => {
    for (const st of ['in_mora', 'disbursed', 'restructured']) {
      const id = await activeLoanWithPayment();
      setStatus(id, st);
      expect((await call('PUT', `/api/loans/${id}`, { term: 12 })).status, st).toBe(409);
      expect((await call('PUT', `/api/loans/${id}`, { notes: 'ok', purpose: 'p' })).status, st).toBe(200);
      expect((await call('PUT', `/api/loans/${id}`, { mora_grace_days: 5 })).status, st).toBe(409);
    }
  });
  it('REPRO 5 — préstamo con pagos + intentar cambiar el plazo -> LOAN_TERMS_LOCKED (error de dominio, no 500)', async () => {
    const id = await activeLoanWithPayment();
    const before = snap(id);
    const r = await call('PUT', `/api/loans/${id}`, { term: 12 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('LOAN_TERMS_LOCKED');
    expect(typeof r.body.error).toBe('string');
    expect(snap(id)).toEqual(before);
  });
  it('pre-desembolso CON historial de pagos o cuotas pagadas: términos bloqueados; notas/cobrador/mora siguen editables', async () => {
    const id = await preLoanWithSchedule();
    app.db.prepare("UPDATE installments SET status='partial', paid_total=50 WHERE loan_id=? AND installment_number=1").run(id);
    const before = snap(id);
    const r = await call('PUT', `/api/loans/${id}`, { rate: 30 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('LOAN_TERMS_LOCKED');
    expect(snap(id)).toEqual(before);
    expect((await call('PUT', `/api/loans/${id}`, { notes: 'n', mora_grace_days: 4 })).status).toBe(200);
    expect(snap(id)).toEqual(before);
  });
  it('pre-desembolso con un pago registrado (aunque las cuotas no estén marcadas): términos bloqueados', async () => {
    const id = await preLoanWithSchedule();
    const uid = (app.db.prepare('SELECT user_id u FROM tenant_memberships WHERE tenant_id=? LIMIT 1').get(tenant.tenantId) as any).u;
    app.db.prepare(`INSERT INTO payments (id,tenant_id,loan_id,registered_by,payment_number,payment_date,amount,payment_method,type) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run('pay-x-' + id.slice(0, 6), tenant.tenantId, id, uid, 'PAG-X-' + id.slice(0, 6), new Date().toISOString(), 100, 'cash', 'regular');
    const r = await call('PUT', `/api/loans/${id}`, { term: 3 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('LOAN_TERMS_LOCKED');
  });
});

describe('estados cerrados: protegidos', () => {
  it('REPRO 3 — liquidado + editar nota: las cuotas siguen pagadas (mismos ids), saldo y estado intactos', async () => {
    const id = await closedLoan('liquidated');
    const before = snap(id);
    expect(before.every(x => x.s === 'paid')).toBe(true);
    const r = await call('PUT', `/api/loans/${id}`, fullPayload(id, { notes: 'nota en préstamo pagado' }));   // payload completo
    expect(r.status).toBe(200);
    expect(snap(id)).toEqual(before);
    expect(snap(id).every(x => x.s === 'paid')).toBe(true);
    expect(loanRow(id).status).toBe('liquidated');
    expect(loanRow(id).notes).toBe('nota en préstamo pagado');
  });
  it('written_off / cancelled / voided / rejected / paid: solo notas editables, sin recrear cuotas', async () => {
    for (const st of ['written_off', 'cancelled', 'voided', 'rejected', 'paid']) {
      const id = await closedLoan(st);
      const before = snap(id);
      const r = await call('PUT', `/api/loans/${id}`, fullPayload(id, { notes: 'n-' + st }));
      expect(r.status, st).toBe(200);
      expect(snap(id), st).toEqual(before);
      expect(loanRow(id).status, st).toBe(st);
    }
  });
  it('cerrados: cualquier cambio financiero / mora / cobrador -> 409 LOAN_CLOSED_LOCKED sin tocar nada', async () => {
    for (const st of ['liquidated', 'written_off', 'cancelled', 'voided', 'rejected']) {
      const id = await closedLoan(st);
      const before = snap(id);
      for (const body of [{ rate: 40 }, { term: 2 }, { requested_amount: 1 }, { mora_rate_daily: 0.01 }, { collector_id: 'otro' }, { first_payment_date: '2035-01-01' }]) {
        const r = await call('PUT', `/api/loans/${id}`, body);
        expect(r.status, st + JSON.stringify(body)).toBe(409);
        expect(r.body.code).toBe('LOAN_CLOSED_LOCKED');
      }
      expect(snap(id), st).toEqual(before);
    }
  });
  it('draft / under_review / pending_manager_approval / approved: editables (pre-desembolso)', async () => {
    for (const st of ['draft', 'under_review', 'pending_manager_approval', 'approved']) {
      const id = await newLoan();
      setStatus(id, st);
      expect((await call('PUT', `/api/loans/${id}`, { rate: 14 })).status, st).toBe(200);
      expect(snap(id)).toHaveLength(6);
    }
  });
});

describe('auditoría y validación', () => {
  it('loan_edited guarda SOLO el diff real (old/new/changes), no el formulario completo', async () => {
    const id = await activeLoanWithPayment();
    const collector = app.addMember(tenant.tenantId, ['cobrador']).userId;
    await call('PUT', `/api/loans/${id}`, fullPayload(id, { notes: 'diff', collector_id: collector }));
    const a = audits(id).filter(x => x.action === 'loan_edited').pop();
    expect(JSON.parse(a.changes).sort()).toEqual(['collector_id', 'notes']);
    expect(Object.keys(JSON.parse(a.old_values)).sort()).toEqual(['collector_id', 'notes']);
    expect(Object.keys(JSON.parse(a.new_values)).sort()).toEqual(['collector_id', 'notes']);
    expect(JSON.parse(a.new_values).notes).toBe('diff');
    expect(JSON.parse(a.new_values).collector_id).toBe(collector);
    expect(a.description).toContain('notes');
    expect(a.new_values).not.toContain('"rate"');
  });
  it('una regeneración legítima del calendario se registra explícitamente (loan_schedule_regenerated)', async () => {
    const id = await newLoan();
    await call('PUT', `/api/loans/${id}`, { rate: 15, notes: 'x' });
    const acts = actions(id);
    expect(acts).toContain('loan_edited');
    expect(acts).toContain('loan_schedule_regenerated');
    const reg = audits(id).find(x => x.action === 'loan_schedule_regenerated');
    expect(JSON.parse(reg.changes)).toEqual(['rate']);                          // solo lo que define el calendario
    expect(JSON.parse(reg.new_values).installments).toBe(6);
    const edited = audits(id).find(x => x.action === 'loan_edited');
    expect(JSON.parse(edited.changes).sort()).toEqual(['notes', 'rate']);
  });
  it('notas muy largas se acotan en el audit', async () => {
    const id = await newLoan();
    await call('PUT', `/api/loans/${id}`, { notes: 'a'.repeat(2000) });
    const a = audits(id).find(x => x.action === 'loan_edited');
    expect(JSON.parse(a.new_values).notes.length).toBeLessThanOrEqual(501);
    expect(loanRow(id).notes.length).toBe(2000);
  });
  it('valores inválidos -> 400 con código de dominio (no 500) y sin escrituras', async () => {
    const id = await preLoanWithSchedule();
    const before = snap(id); const l0 = loanRow(id);
    for (const body of [{ rate: 'abc' }, { term: -3 }, { requested_amount: 0 }, { mora_rate_daily: -1 }, { mora_rate_daily: 5 }, { mora_grace_days: 1.5 }, { mora_base: 'zzz' }, { first_payment_date: 'mañana' }]) {
      const r = await call('PUT', `/api/loans/${id}`, body);
      expect(r.status, JSON.stringify(body)).toBe(400);
    }
    expect(snap(id)).toEqual(before);
    expect(loanRow(id).updated_at).toBe(l0.updated_at);
  });
  it('RBAC sin cambios: el backend sigue permitiendo solo propietario/plataforma (admin -> 403)', async () => {
    const id = await newLoan();
    const admin = app.addMember(tenant.tenantId, ['admin']);
    const r = await app.req('PUT', `/api/loans/${id}`, { token: admin.token, tenantId: tenant.tenantId, body: { notes: 'x' } });
    expect(r.status).toBe(403);
    const oficial = app.addMember(tenant.tenantId, ['prestamista']);
    expect((await app.req('PUT', `/api/loans/${id}`, { token: oficial.token, tenantId: tenant.tenantId, body: { notes: 'x' } })).status).toBe(403);
    expect(loanRow(id).notes).toBeNull();
  });
  it('otro tenant no puede editar el préstamo (404)', async () => {
    const id = await newLoan();
    const other = app.createTenant({ planSlug: 'enterprise' });
    const r = await app.req('PUT', `/api/loans/${id}`, { token: other.token, tenantId: other.tenantId, body: { notes: 'x' } });
    expect(r.status).toBe(404);
  });
});

describe('lifecycle: el contrato queda fijado después del desembolso', () => {
  const MORA_FIELDS: Array<[string, any]> = [
    ['mora_rate_daily', 0.009], ['mora_grace_days', 9], ['mora_base', 'capital_vencido'], ['mora_fixed_enabled', 1],
    ['mora_fixed_amount', 333], ['mora_start_date', '2030-01-01'],
  ];

  it('PRE-desembolso (draft / under_review / pending_manager_approval / approved): mora, cargo de prórroga y fechas históricas editables', async () => {
    for (const st of ['draft', 'under_review', 'pending_manager_approval', 'approved']) {
      const id = await newLoan();
      setStatus(id, st);
      const body: any = { prorroga_fee: 25, application_date: '2029-12-01', approval_date: '2029-12-05' };
      for (const [k, v] of MORA_FIELDS) body[k] = v;
      const r = await call('PUT', `/api/loans/${id}`, body);
      expect(r.status, st).toBe(200);
      const l = loanRow(id);
      expect([l.mora_rate_daily, l.mora_grace_days, l.mora_base, l.mora_fixed_enabled, l.mora_fixed_amount, l.prorroga_fee]).toEqual([0.009, 9, 'capital_vencido', 1, 333, 25]);
    }
  });
  it('approved -> modificar mora = permitido y no toca el calendario', async () => {
    const id = await preLoanWithSchedule();
    const idsBefore = ids(id);
    const r = await call('PUT', `/api/loans/${id}`, { mora_rate_daily: 0.004, mora_grace_days: 1 });
    expect(r.status).toBe(200);
    expect(r.body.schedule_regenerated).toBe(false);
    expect(ids(id)).toBe(idsBefore);
  });

  it('active / in_mora / restructured / disbursed -> modificar CUALQUIER campo de mora = 409 LOAN_TERMS_LOCKED, sin cambios', async () => {
    for (const st of ['active', 'in_mora', 'restructured', 'disbursed']) {
      const id = await activeLoanWithPayment();
      setStatus(id, st);
      const before = snap(id); const l0 = loanRow(id);
      for (const [k, v] of MORA_FIELDS) {
        const r = await call('PUT', `/api/loans/${id}`, { [k]: v });
        expect(r.status, st + ' ' + k).toBe(409);
        expect(r.body.code).toBe('LOAN_TERMS_LOCKED');
        expect(r.body.locked_fields).toContain(k);
      }
      // el payload completo del modal viejo con la mora cambiada también se rechaza
      expect((await call('PUT', `/api/loans/${id}`, fullPayload(id, { mora_grace_days: 8, notes: 'no debe guardarse' }))).status, st).toBe(409);
      expect(snap(id), st).toEqual(before);
      const l1 = loanRow(id);
      for (const k of ['mora_rate_daily', 'mora_grace_days', 'mora_base', 'mora_fixed_enabled', 'mora_fixed_amount', 'mora_start_date', 'notes', 'updated_at']) expect(l1[k], st + ' ' + k).toBe(l0[k]);
    }
  });
  it('active -> cargo de prórroga (prorroga_fee) = 409: es una condición económica acordada', async () => {
    const id = await activeLoanWithPayment();
    const r = await call('PUT', `/api/loans/${id}`, { prorroga_fee: 500 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('LOAN_TERMS_LOCKED');
    expect(loanRow(id).prorroga_fee).toBe(0);
  });
  it('active -> application_date / approval_date / disbursement_date / first_payment_date = 409', async () => {
    const id = await activeLoanWithPayment();
    const before = snap(id); const l0 = loanRow(id);
    for (const body of [{ application_date: '2020-01-01' }, { approval_date: '2020-01-02' }, { disbursement_date: '2020-01-03' }, { first_payment_date: '2031-06-01' }]) {
      const r = await call('PUT', `/api/loans/${id}`, body);
      expect(r.status, JSON.stringify(body)).toBe(409);
      expect(r.body.code).toBe('LOAN_TERMS_LOCKED');
    }
    expect(snap(id)).toEqual(before);
    for (const k of ['application_date', 'approval_date', 'disbursement_date', 'first_payment_date']) expect(loanRow(id)[k], k).toBe(l0[k]);
  });
  it('active -> notes / collector / purpose = 200 sin tocar cuotas (ids, estados, deferred_due_date)', async () => {
    const id = await activeLoanWithPayment();
    app.db.prepare("UPDATE installments SET deferred_due_date='2031-02-02' WHERE loan_id=? AND installment_number=4").run(id);
    const before = snap(id);
    const collector = app.addMember(tenant.tenantId, ['cobrador']).userId;
    for (const body of [{ notes: 'nota activa' }, { collector_id: collector }, { purpose: 'capital de trabajo' }]) {
      const r = await call('PUT', `/api/loans/${id}`, body);
      expect(r.status, JSON.stringify(body).slice(0, 60)).toBe(200);
      expect(snap(id)).toEqual(before);
    }
    const rFull = await call('PUT', `/api/loans/${id}`, fullPayload(id, { notes: 'otra nota' }));      // payload completo, calculado con los valores YA guardados
    expect(rFull.status).toBe(200);
    expect(snap(id)).toEqual(before);
    const l = loanRow(id);
    expect([l.notes, l.collector_id, l.purpose]).toEqual(['otra nota', collector, 'capital de trabajo']);
    expect(actions(id)).not.toContain('loan_restructured');
    expect(actions(id)).not.toContain('loan_schedule_regenerated');
  });
});

describe('estados cerrados: solo notas', () => {
  it('liquidated -> notes = 200 sin tocar cuotas; purpose = 409 (finalidad original congelada)', async () => {
    const id = await closedLoan('liquidated');
    const before = snap(id);
    expect((await call('PUT', `/api/loans/${id}`, { notes: 'solo nota' })).status).toBe(200);
    expect(snap(id)).toEqual(before);
    const p = await call('PUT', `/api/loans/${id}`, { purpose: 'cambiar finalidad' });
    expect(p.status).toBe(409);
    expect(p.body.code).toBe('LOAN_CLOSED_LOCKED');
    expect(loanRow(id).purpose).toBeNull();
    expect(snap(id)).toEqual(before);
  });
  it('cerrados -> mora y fechas históricas = 409', async () => {
    for (const st of ['liquidated', 'written_off', 'cancelled', 'voided', 'rejected', 'paid']) {
      const id = await closedLoan(st);
      for (const body of [{ mora_grace_days: 9 }, { prorroga_fee: 5 }, { application_date: '2020-01-01' }, { disbursement_date: '2020-01-02' }, { collector_id: 'x' }]) {
        const r = await call('PUT', `/api/loans/${id}`, body);
        expect(r.status, st + JSON.stringify(body)).toBe(409);
        expect(r.body.code).toBe('LOAN_CLOSED_LOCKED');
      }
    }
  });
});

describe('maturity_date: derivada del calendario', () => {
  const lastDue = (id: string) => String(snap(id)[snap(id).length - 1].d).slice(0, 10);
  const mat = (id: string) => String(loanRow(id).maturity_date).slice(0, 10);

  it('al desembolsar, maturity_date = último vencimiento del calendario', async () => {
    const id = await newLoan();
    setStatus(id, 'approved');
    expect((await call('POST', `/api/loans/${id}/disburse`, {})).status).toBe(200);
    expect(mat(id)).toBe(lastDue(id));
  });
  it('pre-desembolso: al regenerar el calendario (tasa / plazo / primer pago) maturity_date lo sigue', async () => {
    const id = await preLoanWithSchedule();
    expect(mat(id)).toBe(lastDue(id));
    await call('PUT', `/api/loans/${id}`, { term: 9 });
    expect(snap(id)).toHaveLength(9);
    expect(mat(id)).toBe(lastDue(id));
    await call('PUT', `/api/loans/${id}`, { first_payment_date: '2030-05-10' });
    expect(mat(id)).toBe(lastDue(id));
  });
  it('editarla de forma independiente se rechaza en TODOS los estados (LOAN_MATURITY_DERIVED) y no crea inconsistencias', async () => {
    const pre = await preLoanWithSchedule();
    const active = await activeLoanWithPayment();
    const closed = await closedLoan('liquidated');
    for (const id of [pre, active, closed]) {
      const before = mat(id);
      const r = await call('PUT', `/api/loans/${id}`, { maturity_date: '2040-01-01' });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('LOAN_MATURITY_DERIVED');
      expect(mat(id)).toBe(before);
      expect(mat(id)).toBe(lastDue(id));                       // sigue consistente con el calendario
    }
  });
  it('reenviar el MISMO maturity_date (payload completo del modal viejo) no es un cambio ni un error; el calendario queda consistente', async () => {
    const id = await activeLoanWithPayment();
    const r = await call('PUT', `/api/loans/${id}`, fullPayload(id, { notes: 'x' }));
    expect(r.status).toBe(200);
    expect(mat(id)).toBe(lastDue(id));
  });
  it('editar campos no estructurales no altera maturity_date', async () => {
    const id = await preLoanWithSchedule();
    const m = mat(id);
    await call('PUT', `/api/loans/${id}`, { notes: 'n', mora_grace_days: 2, collector_id: null });
    expect(mat(id)).toBe(m);
  });
});

describe('frontend: el modal envía solo campos modificados', () => {
  const initial: LoanEditForm = {
    requestedAmount: '6000', approvedAmount: '6000', rate: '12', rateType: 'monthly', term: '6', termUnit: 'months', paymentFrequency: 'monthly', amortizationType: 'fixed_installment',
    applicationDate: '2030-01-01', approvalDate: '2030-01-02', disbursementDate: '2030-01-03', firstPaymentDate: '2030-02-01', maturityDate: '2030-07-01',
    moraRateDaily: '0.1000', moraGraceDays: '3', moraBase: 'cuota_vencida', moraFixedEnabled: '0', moraFixedAmount: '0', moraStartDate: '',
    collectorId: '', purpose: '', notes: '', prorrogaFee: '0',
  };
  it('solo notas -> { notes }; solo propósito, solo cobrador, solo mora -> únicamente esos campos', () => {
    expect(buildLoanEditPayload(initial, { ...initial, notes: 'hola' }).payload).toEqual({ notes: 'hola' });
    expect(buildLoanEditPayload(initial, { ...initial, purpose: 'capital' }).payload).toEqual({ purpose: 'capital' });
    expect(buildLoanEditPayload(initial, { ...initial, collectorId: 'abc' }).payload).toEqual({ collectorId: 'abc' });
    expect(buildLoanEditPayload(initial, { ...initial, moraRateDaily: '0.5000', moraGraceDays: '1' }).payload).toEqual({ moraRateDaily: 0.005, moraGraceDays: 1 });
    expect(buildLoanEditPayload(initial, { ...initial, moraFixedEnabled: '1', moraFixedAmount: '250' }).payload).toEqual({ moraFixedEnabled: 1, moraFixedAmount: 250 });
  });
  it('sin cambios -> payload vacío (el modal no llama a la API)', () => {
    const r = buildLoanEditPayload(initial, { ...initial });
    expect(r.payload).toEqual({});
    expect(r.changed).toEqual([]);
  });
  it('un campo vuelto a su valor original no se envía; fechas vacías -> null; numéricos inválidos se reportan', () => {
    const r = buildLoanEditPayload(initial, { ...initial, notes: 'a', rate: '12' });
    expect(Object.keys(r.payload)).toEqual(['notes']);
    expect(buildLoanEditPayload({ ...initial, moraStartDate: '2030-01-01' }, { ...initial, moraStartDate: '' }).payload).toEqual({ moraStartDate: null });
    expect(buildLoanEditPayload(initial, { ...initial, term: 'abc' }).invalid).toEqual(['term']);
  });
  it('los campos bloqueados por estado nunca se envían', () => {
    const { locked } = loanEditLocks('active', true);
    const r = buildLoanEditPayload(initial, { ...initial, rate: '30', term: '12', notes: 'ok' }, locked);
    expect(r.payload).toEqual({ notes: 'ok' });
    const closed = loanEditLocks('liquidated', true).locked;
    expect(buildLoanEditPayload(initial, { ...initial, moraGraceDays: '9', collectorId: 'z', notes: 'n', purpose: 'p' }, closed).payload).toEqual({ notes: 'n' });
  });
  it('bloqueos: pre editable; pre con pagos / post bloquean estructurales; cerrados solo notas y propósito', () => {
    expect(loanEditLocks('approved', false)).toMatchObject({ reason: 'none' });
    expect([...loanEditLocks('approved', false).locked]).toEqual(['maturityDate']);          // única bloqueada en pre: derivada del calendario
    expect(loanEditLocks('approved', true).reason).toBe('has_payments');
    expect(loanEditLocks('active', false).reason).toBe('disbursed');
    expect(loanEditLocks('active', false).locked.has('rate')).toBe(true);
    for (const f of ['moraRateDaily', 'moraGraceDays', 'moraBase', 'moraFixedEnabled', 'moraFixedAmount', 'moraStartDate', 'prorrogaFee', 'applicationDate', 'approvalDate', 'disbursementDate', 'firstPaymentDate', 'maturityDate'])
      expect(loanEditLocks('active', false).locked.has(f as any), f).toBe(true);
    expect(loanEditLocks('active', false).locked.has('collectorId')).toBe(false);
    expect(loanEditLocks('active', false).locked.has('purpose')).toBe(false);
    expect(loanEditLocks('active', false).locked.has('notes')).toBe(false);
    expect(loanEditLocks('written_off', false).reason).toBe('closed');
    expect(loanEditLocks('written_off', false).locked.has('notes')).toBe(false);
    expect(loanEditLocks('written_off', false).locked.has('purpose')).toBe(true);
    expect(loanEditLocks('written_off', false).locked.has('collectorId')).toBe(true);
    for (const s of ['draft', 'under_review', 'pending_manager_approval', 'approved', 'active', 'in_mora', 'liquidated', 'cancelled', 'x']) expect(fePhase(s)).toBe(loanEditPhase(s));   // front y back clasifican igual
  });
  it('installmentsHavePayments detecta cuotas pagadas/parciales o con monto pagado', () => {
    expect(installmentsHavePayments([{ status: 'pending' }])).toBe(false);
    expect(installmentsHavePayments([{ status: 'pending' }, { status: 'partial' }])).toBe(true);
    expect(installmentsHavePayments([{ status: 'pending', paid_total: 10 }])).toBe(true);
    expect(installmentsHavePayments(undefined)).toBe(false);
  });
  it('cableado (fuente): el modal usa el payload delta y el botón solo aparece para quien puede guardar', () => {
    const FRONT = path.resolve(__dirname, '..', '..', '..', 'frontend', 'src');
    const modal = fs.readFileSync(path.join(FRONT, 'pages', 'loans', 'EditLoanModal.tsx'), 'utf8');
    const detail = fs.readFileSync(path.join(FRONT, 'pages', 'loans', 'LoanDetailPage.tsx'), 'utf8');
    expect(modal).toContain('buildLoanEditPayload(initialForm, form, locked)');
    expect(modal).toContain('api.put(`/loans/${loan.id}`, payload)');
    expect(modal).not.toContain('scheduleFieldsChanged');
    expect(modal).not.toContain('elm.restructure_confirm');
    expect(modal).not.toMatch(/requestedAmount:\s*parseFloat\(form\.requestedAmount\)/);       // ya no arma el payload completo
    expect(detail).toContain("can('loans.edit') && canEditLoan");
    expect(modal).toContain("disabled={ro('purpose')}");
    expect(modal).toContain("disabled={ro('maturityDate')}");
    expect(modal).toContain("elm.mora_locked");
    expect(detail).toContain('const canEditLoan = isPlatformAdmin || isOwner');            // roles como ARRAY (usePermission), no JSON.parse
    expect(detail).not.toContain("JSON.parse((tenantState.currentTenant as any)?.roles");  // el cálculo anterior daba siempre false
  });
});

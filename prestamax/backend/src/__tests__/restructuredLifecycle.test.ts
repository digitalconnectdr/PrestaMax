// Ciclo de vida de un préstamo 'restructured' (sustituido por una consolidación, consolidated_into_loan_id).
// Regla: su obligación pasó al préstamo nuevo, así que (a) NO recibe pagos, (b) NO está en cobranza activa,
// (c) NO cuenta en cartera/capital/KPIs activos ni en el capital del inversionista, (d) NO consume el límite de
// préstamos activos y (e) se reporta cerrado (sin saldo ni atraso) en DataCrédito. Sus saldos, cuotas, pagos y
// auditoría históricos NO se tocan. Cada consumidor se clasificó HISTÓRICO (incluye) o ACTIVO (excluye).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootTestApp, insertTestPlan, TestApp } from './helpers/testApp';
import { PROFESIONAL_FEATURES } from '../db/planCatalog';
import { countActiveLoans } from '../lib/planLimits';

let app: TestApp;
beforeAll(async () => { app = await bootTestApp(); });
afterAll(async () => { await app.close(); });

type T = { token: string; tenantId: string };
const call = (method: string, url: string, tt: T, body?: any) => app.req(method, url, { token: tt.token, tenantId: tt.tenantId, body });

const loanRow = (id: string) => app.db.prepare('SELECT * FROM loans WHERE id=?').get(id) as any;
const instSnap = (id: string) => app.db.prepare('SELECT id, installment_number n, due_date d, principal_amount p, interest_amount i, status s, paid_total pt FROM installments WHERE loan_id=? ORDER BY installment_number').all(id) as any[];
const paySnap = (id: string) => app.db.prepare('SELECT id, amount, is_voided v, payment_date d FROM payments WHERE loan_id=? ORDER BY created_at, id').all(id) as any[];
const mentions = (body: any, text: string) => JSON.stringify(body).includes(text);
// El préstamo consolidado cita los números de los viejos en sus notas: para 'aparece en la lista' se busca el id.
const hasLoan = (body: any, id: string) => JSON.stringify(body).includes(`\"${id}\"`);

/** Escenario: A(60,000) + B(40,000) -> N(100,000), con un inversionista asignado a A y B. */
async function scenario() {
  const ten = app.createTenant({ planSlug: 'enterprise' });
  const tt: T = { token: ten.token, tenantId: ten.tenantId };
  const productId = app.createProduct(ten.tenantId);
  const clientId = app.createClient(ten.tenantId);
  const mk = async (amount: number) => {
    const r = await call('POST', '/api/loans', tt, { client_id: clientId, product_id: productId, requested_amount: amount, term: 6, first_payment_date: '2030-02-01' });
    expect(r.status).toBe(201);
    const id = r.body.id;
    app.db.prepare("UPDATE loans SET status='approved' WHERE id=?").run(id);
    expect((await call('POST', `/api/loans/${id}/disburse`, tt, {})).status).toBe(200);
    const first = instSnap(id)[0];
    expect((await call('POST', '/api/payments', tt, { loan_id: id, amount: first.p + first.i, payment_method: 'cash' })).status).toBe(201);
    // saldo exacto del escenario y cuotas restantes vencidas (para que aparezcan en cobranza antes de consolidar)
    app.db.prepare('UPDATE loans SET principal_balance=?, interest_balance=0, mora_balance=0, total_balance=? WHERE id=?').run(amount, amount, id);
    app.db.prepare("UPDATE installments SET due_date=date('now','-20 days') WHERE loan_id=? AND status!='paid'").run(id);
    return id as string;
  };
  const A = await mk(60000);
  const B = await mk(40000);
  const inv = await call('POST', '/api/investors', tt, { full_name: 'Inversionista Uno', model_type: 'equity', commission_percent: 10, capital_contributed: 100000 });
  expect(inv.status).toBe(201);
  for (const id of [A, B]) app.db.prepare('UPDATE loans SET investor_id=? WHERE id=?').run(inv.body.id, id);
  const collector = app.addMember(ten.tenantId, ['cobrador']).userId;
  return { tt, A, B, clientId, productId, investorId: inv.body.id as string, collector, ten };
}
type S = Awaited<ReturnType<typeof scenario>>;
const consolidate = async (s: S) => {
  const r = await call('POST', '/api/loans/consolidate', s.tt, { loan_ids: [s.A, s.B], product_id: s.productId, rate: 5, term: 6 });
  expect(r.status).toBe(201);
  return r.body.id as string;
};

describe('consolidación A(60,000) + B(40,000) -> N(100,000): antes y después', () => {
  it('A/B pasan a restructured conservando saldos, cuotas, pagos y enlace; N queda activo con 100,000', async () => {
    const s = await scenario();
    const before = { A: loanRow(s.A), B: loanRow(s.B), iA: instSnap(s.A), iB: instSnap(s.B), pA: paySnap(s.A), pB: paySnap(s.B) };
    expect(before.A.status).toBe('active');
    const N = await consolidate(s);

    const n = loanRow(N);
    expect(n.status).toBe('active');
    expect(n.principal_balance).toBe(100000);
    const cases: Array<[string, any, any[], any[]]> = [[s.A, before.A, before.iA, before.pA], [s.B, before.B, before.iB, before.pB]];
    for (const [id, snapLoan, i, p] of cases) {
      const l = loanRow(id);
      expect(l.status).toBe('restructured');
      expect(l.consolidated_into_loan_id).toBe(N);
      // saldos históricos intactos (NO se ponen en cero)
      for (const k of ['principal_balance', 'interest_balance', 'mora_balance', 'total_balance', 'total_paid', 'disbursed_amount']) expect(l[k], k).toBe(snapLoan[k]);
      expect(instSnap(id)).toEqual(i);
      expect(paySnap(id)).toEqual(p);
      expect(paySnap(id).length).toBeGreaterThan(0);
    }
    // la API de detalle sigue entregando el historial y el enlace al préstamo nuevo
    const d = await call('GET', `/api/loans/${s.A}`, s.tt);
    expect(d.status).toBe(200);
    expect(d.body.consolidated_into_loan_id).toBe(N);
    expect(d.body.payments.length).toBe(1);
    expect(d.body.installments.length).toBeGreaterThan(0);
  });
});

describe('pagos', () => {
  it('POST /payments y /payments/preview sobre restructured = 409 LOAN_RESTRUCTURED (no se modifica nada); sobre el consolidado sí se permite', async () => {
    const s = await scenario();
    const N = await consolidate(s);
    const before = { A: loanRow(s.A), iA: instSnap(s.A), pA: paySnap(s.A), cnt: (app.db.prepare('SELECT COUNT(*) c FROM payments WHERE tenant_id=?').get(s.tt.tenantId) as any).c };
    for (const id of [s.A, s.B]) {
      const r = await call('POST', '/api/payments', s.tt, { loan_id: id, amount: 500, payment_method: 'cash' });
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('LOAN_RESTRUCTURED');
      expect(r.body.consolidated_into_loan_id).toBe(N);
      const pv = await call('POST', '/api/payments/preview', s.tt, { loan_id: id, amount: 500 });
      expect(pv.status).toBe(409);
      expect(pv.body.code).toBe('LOAN_RESTRUCTURED');
      // también los tipos especiales
      for (const payment_type of ['prorroga', 'interest_only', 'capital_only', 'full_payoff']) {
        expect((await call('POST', '/api/payments', s.tt, { loan_id: id, amount: 500, payment_type })).status, payment_type).toBe(409);
      }
    }
    expect(loanRow(s.A)).toEqual(before.A);
    expect(instSnap(s.A)).toEqual(before.iA);
    expect(paySnap(s.A)).toEqual(before.pA);
    expect((app.db.prepare('SELECT COUNT(*) c FROM payments WHERE tenant_id=?').get(s.tt.tenantId) as any).c).toBe(before.cnt);

    expect((await call('POST', '/api/payments', s.tt, { loan_id: N, amount: 500, payment_method: 'cash' })).status).toBe(201);
    expect((await call('POST', '/api/payments/preview', s.tt, { loan_id: N, amount: 500 })).status).toBe(200);
  });

  it('anular un pago histórico de un restructured se rechaza: no reabre el préstamo ni reaplica cuotas ni toca el pago', async () => {
    const s = await scenario();
    await consolidate(s);
    const pay = paySnap(s.A)[0];
    const before = { l: loanRow(s.A), i: instSnap(s.A) };
    const v = await call('POST', `/api/payments/${pay.id}/void`, s.tt, { void_reason: 'prueba' });
    expect(v.status).toBe(409);
    expect(v.body.code).toBe('LOAN_RESTRUCTURED');
    expect(loanRow(s.A)).toEqual(before.l);
    expect(loanRow(s.A).status).toBe('restructured');
    expect(instSnap(s.A)).toEqual(before.i);
    expect(paySnap(s.A)[0].v).toBe(0);
  });
});

describe('cobranza', () => {
  it('antes de consolidar A/B aparecen; después NO están en Mi Cartera, vencidos, próximos ni cola de cobranza, y N sí', async () => {
    const s = await scenario();
    const numA = loanRow(s.A).loan_number;
    const routes =['/api/collections/loans', '/api/collections/portfolio', '/api/collections/overdue'];
    app.db.prepare('UPDATE loans SET collector_id=? WHERE id IN (?,?)').run(s.ten.ownerId, s.A, s.B);
    for (const u of routes) {                                                             // control: antes SÍ están
      const r = await call('GET', u, s.tt);
      expect(r.status, u).toBe(200);
      expect(hasLoan(r.body, s.A) || mentions(r.body, numA), `${u} antes`).toBe(true);
    }
    const N = await consolidate(s);
    for (const u of [...routes, '/api/collections/upcoming?days=400']) {
      const r = await call('GET', u, s.tt);
      expect(r.status, u).toBe(200);
      expect(hasLoan(r.body, s.A), `${u} A`).toBe(false);
      expect(hasLoan(r.body, s.B), `${u} B`).toBe(false);
    }
    expect(hasLoan((await call('GET', '/api/collections/loans', s.tt)).body, N)).toBe(true);
  });

  it('crear promesa de pago o tarea de cobranza sobre un restructured = 409 LOAN_RESTRUCTURED; sobre el consolidado sí', async () => {
    const s = await scenario();
    const N = await consolidate(s);
    for (const id of [s.A, s.B]) {
      const p = await call('POST', '/api/collections/promises', s.tt, { loan_id: id, promised_date: '2030-01-01', promised_amount: 100 });
      expect(p.status).toBe(409);
      expect(p.body.code).toBe('LOAN_RESTRUCTURED');
      const task = await call('POST', '/api/collection-tasks', s.tt, { title: 'Visita', assigned_to: s.collector, due_date: '2030-01-01', loan_id: id });
      expect(task.status).toBe(409);
      expect(task.body.code).toBe('LOAN_RESTRUCTURED');
    }
    expect((app.db.prepare('SELECT COUNT(*) c FROM payment_promises WHERE loan_id IN (?,?)').get(s.A, s.B) as any).c).toBe(0);
    expect((app.db.prepare('SELECT COUNT(*) c FROM collection_tasks WHERE loan_id IN (?,?)').get(s.A, s.B) as any).c).toBe(0);

    expect((await call('POST', '/api/collections/promises', s.tt, { loan_id: N, promised_date: '2030-01-01', promised_amount: 100 })).status).toBe(201);
    const okTask = await call('POST', '/api/collection-tasks', s.tt, { title: 'Visita', assigned_to: s.collector, due_date: '2030-01-01', loan_id: N });
    expect(okTask.status).toBe(201);
    // y una tarea existente no se puede re-vincular a un restructured
    const free = await call('POST', '/api/collection-tasks', s.tt, { title: 'Libre', assigned_to: s.collector, due_date: '2030-01-01' });
    expect(free.status).toBe(201);
    expect((await call('PUT', `/api/collection-tasks/${free.body.id}`, s.tt, { loan_id: s.A })).status).toBe(409);
    expect((await call('PUT', `/api/collection-tasks/${free.body.id}`, s.tt, { loan_id: N })).status).toBe(200);
  });

  it('el selector de préstamos de la pestaña de tareas ya no ofrece restructured (frontend)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(path.join(__dirname, '../../../frontend/src/pages/collections/CollectionTasksTab.tsx'), 'utf8');
    const line = src.split('\n').find(l => l.includes("'in_mora'") && l.includes('.includes(l.status)')) || '';
    expect(line).toContain("'active'");
    expect(line).not.toContain('restructured');
  });
});

describe('cartera y reportes (ACTIVO excluye, HISTÓRICO incluye)', () => {
  it('KPIs del dashboard: capital activo 100,000 (no 200,000); por moneda excluye el saldo y la mora de restructured; el estado sigue visible en la distribución', async () => {
    const s = await scenario();
    app.db.prepare('UPDATE loans SET mora_balance=500 WHERE id=?').run(s.A);                      // mora histórica de A
    const dBefore = await call('GET', '/api/reports/dashboard', s.tt);
    expect(dBefore.status).toBe(200);
    expect(dBefore.body.kpis.active_portfolio).toBe(100000);
    const N = await consolidate(s);
    const d = await call('GET', '/api/reports/dashboard', s.tt);
    const nTotal = loanRow(N).total_balance;                                                      // capital 100,000 + intereses del nuevo plan
    expect(nTotal).toBeGreaterThanOrEqual(100000);
    expect(loanRow(N).principal_balance).toBe(100000);
    expect(d.body.kpis.active_portfolio).toBe(nTotal);                                            // solo N; con A/B contados serían 100,000 + N
    expect(d.body.kpis.active_loans).toBe(1);
    expect(d.body.kpis.overdue_loans).toBe(0);
    expect(d.body.kpis.mora_balance).toBe(0);
    const dop = d.body.portfolio_by_currency.find((x: any) => x.currency === 'DOP');
    expect(dop.active_balance).toBe(nTotal);
    expect(dop.portfolio_balance).toBe(nTotal);
    expect(dop.mora_balance).toBe(0);
    expect(d.body.status_distribution.find((x: any) => x.status === 'restructured')?.count).toBe(2);   // histórico visible
    // reporte de cartera y proyección de cobros: ACTIVO
    const pf = await call('GET', '/api/reports/portfolio', s.tt);
    expect(pf.status).toBe(200);
    expect(hasLoan(pf.body, s.A)).toBe(false);
    expect(hasLoan(pf.body, N)).toBe(true);
    const pj = await call('GET', '/api/reports/projection?from=2000-01-01&to=2100-01-01', s.tt);
    expect(pj.status).toBe(200);
    expect(mentions(pj.body, '"totalLoans":1')).toBe(true);                                       // solo N entra en la proyección de cobros
    expect(hasLoan(pj.body, s.A)).toBe(false);
    expect(hasLoan(pj.body, s.B)).toBe(false);
  });

  it('listado de préstamos: A/B se ven como historial (status restructured, saldos intactos) pero sin saldo vencido cobrable', async () => {
    const s = await scenario();
    const before = await call('GET', '/api/loans?status=all&limit=50', s.tt);
    expect(before.body.data.find((l: any) => l.id === s.A).overdue_balance).toBeGreaterThan(0);
    await consolidate(s);
    const r = await call('GET', '/api/loans?status=all&limit=50', s.tt);
    const a = r.body.data.find((l: any) => l.id === s.A);
    expect(a.status).toBe('restructured');
    expect(a.principal_balance).toBe(60000);
    expect(a.overdue_balance).toBe(0);
    const only = await call('GET', '/api/loans?status=restructured', s.tt);
    expect(only.body.data.map((l: any) => l.id).sort()).toEqual([s.A, s.B].sort());
  });
});

describe('inversionistas', () => {
  it('capital activo: antes 100,000; tras consolidar A/B no cuentan (sin doble conteo); al asignar N vuelve a 100,000, nunca 200,000', async () => {
    const s = await scenario();
    const cap = async () => (await call('GET', '/api/investors', s.tt)).body.find((i: any) => i.id === s.investorId).active_capital;
    expect(await cap()).toBe(100000);
    const N = await consolidate(s);
    expect(await cap()).toBe(0);                                                                  // A/B ya no son capital colocado activo
    expect((await call('POST', `/api/investors/${s.investorId}/assign-loan`, s.tt, { loan_id: N })).status).toBe(200);
    expect(await cap()).toBe(100000);
    // liquidación: préstamos activos y saldo
    const lr = await call('GET', `/api/investors/${s.investorId}/liquidation-report?from=2000-01-01&to=2100-01-01&includeLiquidated=1`, s.tt);
    expect(lr.status).toBe(200);
    expect(lr.body.active_loans.count).toBe(1);
    expect(lr.body.active_loans.outstanding_principal).toBe(100000);
    // los pagos históricos de A/B siguen en la liquidación (HISTÓRICO)
    expect(lr.body.payments_count).toBe(2);
    // el detalle del inversionista conserva A/B como historial
    const det = await call('GET', `/api/investors/${s.investorId}`, s.tt);
    expect(det.body.loans.map((l: any) => l.id).sort()).toEqual([s.A, s.B, N].sort());
    expect(det.body.loans.filter((l: any) => l.status === 'restructured').length).toBe(2);
  });

  it('portal del inversionista: capital activo y conteo excluyen restructured', async () => {
    const s = await scenario();
    const member = app.addMember(s.ten.tenantId, ['investor']);
    app.db.prepare('UPDATE investors SET user_id=? WHERE id=?').run(member.userId, s.investorId);
    const portal = (u: string) => call('GET', u, { token: member.token, tenantId: s.ten.tenantId });
    const before = await portal('/api/portal/investor/summary');
    expect(before.status).toBe(200);
    expect(before.body.capital.active_balance).toBe(100000);
    expect(before.body.capital.active_loans).toBe(2);
    const N = await consolidate(s);
    const mid = await portal('/api/portal/investor/summary');
    expect(mid.body.capital.active_balance).toBe(0);
    expect(mid.body.capital.active_loans).toBe(0);
    app.db.prepare('UPDATE loans SET investor_id=? WHERE id=?').run(s.investorId, N);
    const after = await portal('/api/portal/investor/summary');
    expect(after.body.capital.active_balance).toBe(100000);
    expect(after.body.capital.active_loans).toBe(1);
    // pagos históricos (interés cobrado) siguen contando en el acumulado: HISTÓRICO
    expect(after.body.lifetime.payments_count).toBe(2);
  });
});

describe('límite de préstamos activos', () => {
  it('restructured no consume el límite: consolidar libera cupo', async () => {
    const planId = insertTestPlan(app.db, { slug: 'restruct-cap2', features: PROFESIONAL_FEATURES, maxActiveLoans: 2 });
    const ten = app.createTenant({ planId });
    const tt: T = { token: ten.token, tenantId: ten.tenantId };
    const clientId = app.createClient(ten.tenantId);
    const [a, b] = app.fillLoans(ten.tenantId, 2, 'active', clientId);
    for (const id of [a, b]) app.db.prepare('UPDATE loans SET principal_balance=1000, total_balance=1000 WHERE id=?').run(id);
    const pid = app.createProduct(ten.tenantId);
    expect(countActiveLoans(app.db, ten.tenantId)).toBe(2);                                       // al límite (2/2)
    const r = await call('POST', '/api/loans/consolidate', tt, { loan_ids: [a, b], product_id: pid, rate: 5, term: 6 });
    expect(r.status).toBe(201);
    expect((app.db.prepare('SELECT status FROM loans WHERE id=?').get(a) as any).status).toBe('restructured');
    expect(countActiveLoans(app.db, ten.tenantId)).toBe(1);                                       // solo el consolidado
    // hay cupo para 1 desembolso más, y el siguiente se bloquea con el límite real
    const [p1, p2] = app.fillLoans(ten.tenantId, 2, 'approved');
    expect((await call('POST', `/api/loans/${p1}/disburse`, tt, {})).status).toBe(200);
    const blocked = await call('POST', `/api/loans/${p2}/disburse`, tt, {});
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PLAN_LIMIT_ACTIVE_LOANS');
    expect(countActiveLoans(app.db, ten.tenantId)).toBe(2);
  });
});

describe('DataCrédito', () => {
  it('restructured se reporta con la categoría existente C (cerrado) y sin saldo ni atraso; el consolidado vigente (V) lleva toda la deuda', async () => {
    const s = await scenario();
    const dc0 = await call('GET', '/api/reports/datacredito', s.tt);
    expect(dc0.status).toBe(200);
    const rowOf = (body: any, num: string) => body.rows.find((r: any) => r['NUMERO CUENTA'] === num);
    const numA = loanRow(s.A).loan_number, numB = loanRow(s.B).loan_number;
    expect(rowOf(dc0.body, numA)['ESTATUS']).toBe('V');                                           // control: antes vigente
    expect(rowOf(dc0.body, numA)['MONTO ADEUDADO']).toBe(60000);
    expect(rowOf(dc0.body, numA)['TOTAL DE ATRASO']).toBeGreaterThan(0);

    const N = await consolidate(s);
    const numN = loanRow(N).loan_number;
    const dc = await call('GET', '/api/reports/datacredito', s.tt);
    expect(dc.status).toBe(200);
    for (const num of [numA, numB]) {
      const row = rowOf(dc.body, num);
      expect(row, num).toBeTruthy();                                                              // la cuenta sigue reportada (no se borra el historial)
      expect(row['ESTATUS']).toBe('C');
      expect(row['MONTO ADEUDADO']).toBe(0);
      expect(row['TOTAL DE ATRASO']).toBe(0);
      for (const k of ['ATRASO 1 A 30 DIAS', 'ATRASO 31 A 60 DIAS', 'ATRASO 61 A 90 DIAS', 'ATRASO 91 A 120 DIAS', 'ATRASO 121 A 150 DIAS', 'ATRASO 151 A 180 DIAS', 'ATRASO 181 DIAS O MAS']) expect(row[k], k).toBe(0);
      expect(row['CASTIGADO']).toBe('N');
    }
    expect(rowOf(dc.body, numN)['ESTATUS']).toBe('V');
    expect(rowOf(dc.body, numN)['MONTO ADEUDADO']).toBe(loanRow(N).total_balance);
    // la deuda total reportada como adeudada no se duplica: solo la del consolidado
    const owed = dc.body.rows.reduce((sum: number, r: any) => sum + r['MONTO ADEUDADO'], 0);
    expect(owed).toBe(loanRow(N).total_balance);
    // los saldos en BD NO se pusieron en cero para lograrlo
    expect(loanRow(s.A).total_balance).toBe(60000);
  });
});

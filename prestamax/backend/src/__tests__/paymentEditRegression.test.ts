// Regresión: PUT /payments/:id respondía 500 ("no such column: updated_at") porque payments no tiene esa columna.
// El endpoint edita SOLO metadatos (fecha, método, cuenta, referencia, notas): no toca importe, aplicación, cuotas,
// saldos, score, bancos ni el estado del préstamo. BD temporal.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import { bootTestApp, TestApp } from './helpers/testApp';

let app: TestApp;
beforeAll(async () => { app = await bootTestApp(); });
afterAll(async () => { await app.close(); });

type Ctx = { tenantId: string; token: string; clientId: string; loanId: string; paymentId: string; bankId: string };
async function setup(): Promise<Ctx> {
  const t = app.createTenant({ planSlug: 'enterprise' });
  const call = (m: string, u: string, body?: any) => app.req(m, u, { token: t.token, tenantId: t.tenantId, body });
  const productId = app.createProduct(t.tenantId);
  const clientId = app.createClient(t.tenantId);
  const r = await call('POST', '/api/loans', { client_id: clientId, product_id: productId, requested_amount: 6000, term: 6, first_payment_date: '2030-02-01' });
  expect(r.status).toBe(201);
  const loanId = r.body.id;
  app.db.prepare("UPDATE loans SET status='approved' WHERE id=?").run(loanId);
  expect((await call('POST', `/api/loans/${loanId}/disburse`, {})).status).toBe(200);
  const first = app.db.prepare('SELECT principal_amount p, interest_amount i FROM installments WHERE loan_id=? ORDER BY installment_number LIMIT 1').get(loanId) as any;
  expect((await call('POST', '/api/payments', { loan_id: loanId, amount: first.p + first.i, payment_method: 'cash' })).status).toBe(201);
  const paymentId = (app.db.prepare('SELECT id FROM payments WHERE loan_id=?').get(loanId) as any).id;
  const bankId = crypto.randomUUID();
  app.db.prepare('INSERT INTO bank_accounts (id,tenant_id,bank_name,account_number,current_balance,loaned_balance) VALUES (?,?,?,?,?,?)').run(bankId, t.tenantId, 'Banco Prueba', '123', 5000, 1000);
  return { tenantId: t.tenantId, token: t.token, clientId, loanId, paymentId, bankId };
}
const put = (c: { token: string; tenantId: string }, id: string, body: any) => app.req('PUT', `/api/payments/${id}`, { token: c.token, tenantId: c.tenantId, body });

/** Todo lo que la edición NO debe tocar. */
function financialSnapshot(c: Ctx) {
  const q = (sql: string, ...p: any[]) => app.db.prepare(sql).all(...p);
  return {
    payment: q('SELECT id, loan_id, amount, applied_mora, applied_charges, applied_interest, applied_capital, type, is_voided, rebate_amount, created_at, registered_by FROM payments WHERE id=?', c.paymentId),
    installments: q('SELECT id, installment_number, status, paid_principal, paid_interest, paid_mora, paid_total, deferred_due_date, due_date FROM installments WHERE loan_id=? ORDER BY installment_number', c.loanId),
    loan: q('SELECT status, principal_balance, interest_balance, mora_balance, total_balance, total_paid, total_paid_principal, total_paid_interest, total_paid_mora, days_overdue FROM loans WHERE id=?', c.loanId),
    clientScore: q('SELECT score FROM clients WHERE id=?', c.clientId),
    banks: q('SELECT id, current_balance, loaned_balance FROM bank_accounts WHERE tenant_id=?', c.tenantId),
    paymentCount: q('SELECT COUNT(*) c FROM payments WHERE tenant_id=?', c.tenantId),
  };
}

describe('PUT /payments/:id — Editar Pago', () => {
  it('editar campos permitidos (cuerpo como lo envía la UI, snake_case) → 200; metadatos cambian y nada financiero se toca', async () => {
    const c = await setup();
    const before = financialSnapshot(c);
    const r = await put(c, c.paymentId, { payment_date: '2026-01-15', payment_method: 'transfer', bank_account_id: c.bankId, reference: 'REF-123', notes: 'pago corregido' });
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(c.paymentId);
    expect(String(r.body.payment_date).slice(0, 10)).toBe('2026-01-15');
    expect(r.body.payment_method).toBe('transfer');
    expect(r.body.reference).toBe('REF-123');
    expect(r.body.notes).toBe('pago corregido');
    expect(financialSnapshot(c)).toEqual(before);           // importe, aplicación, cuotas, saldos, score, bancos, estado: idénticos
  });

  it('también acepta camelCase y deja intactos importe y distribución', async () => {
    const c = await setup();
    const before = financialSnapshot(c);
    const r = await put(c, c.paymentId, { paymentDate: '2026-02-01', paymentMethod: 'check', bankAccountId: c.bankId, reference: 'CHQ-9', notes: 'x', amount: 999999, appliedCapital: 1, applied_interest: 1 });
    expect(r.status).toBe(200);
    expect(r.body.payment_method).toBe('check');
    expect(String(r.body.payment_date).slice(0, 10)).toBe('2026-02-01');
    // intentar mandar importe/aplicación NO los modifica: no son editables
    expect(financialSnapshot(c)).toEqual(before);
  });

  it('sin campos (cuerpo vacío) conserva todo y no falla', async () => {
    const c = await setup();
    await put(c, c.paymentId, { reference: 'R', notes: 'N' });
    const before = financialSnapshot(c);
    const empty = await put(c, c.paymentId, {});
    expect(empty.status).toBe(200);
    expect(empty.body.reference).toBe('R');
    expect(empty.body.notes).toBe('N');
    expect(financialSnapshot(c)).toEqual(before);
  });

  it('deja el audit payment_updated con los valores anteriores', async () => {
    const c = await setup();
    const prev = app.db.prepare('SELECT payment_method FROM payments WHERE id=?').get(c.paymentId) as any;
    expect((await put(c, c.paymentId, { payment_method: 'transfer', payment_date: '2026-03-03' })).status).toBe(200);
    const a = app.db.prepare("SELECT * FROM audit_logs WHERE entity_id=? AND action='payment_updated'").all(c.paymentId) as any[];
    expect(a).toHaveLength(1);
    expect(a[0].entity_type).toBe('payment');
    expect(a[0].tenant_id).toBe(c.tenantId);
    const ch = JSON.parse(a[0].changes);
    expect(ch.old.payment_method).toBe(prev.payment_method);
    expect(ch.new.payment_method).toBe('transfer');
    expect(ch.new.payment_date).toBe('2026-03-03');
  });

  it('pago inexistente → 404; pago anulado → 400 sin cambios', async () => {
    const c = await setup();
    const missing = await put(c, crypto.randomUUID(), { notes: 'x' });
    expect(missing.status).toBe(404);
    app.db.prepare('UPDATE payments SET is_voided=1 WHERE id=?').run(c.paymentId);
    const voided = await put(c, c.paymentId, { notes: 'x' });
    expect(voided.status).toBe(400);
    expect((app.db.prepare('SELECT notes FROM payments WHERE id=?').get(c.paymentId) as any).notes).toBeNull();
  });

  it('pago de OTRO tenant → inaccesible: 404 igual que inexistente y el pago ajeno queda intacto', async () => {
    const a = await setup();
    const b = await setup();
    const beforeB = app.db.prepare('SELECT * FROM payments WHERE id=?').get(b.paymentId);
    const foreign = await put(a, b.paymentId, { notes: 'intruso', payment_method: 'check' });
    const missing = await put(a, crypto.randomUUID(), { notes: 'intruso' });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(app.db.prepare('SELECT * FROM payments WHERE id=?').get(b.paymentId)).toEqual(beforeB);
    expect((app.db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE entity_id=? AND action='payment_updated'").get(b.paymentId) as any).c).toBe(0);
  });

  it('sin permiso de propietario/plataforma → 403 y no cambia nada', async () => {
    const c = await setup();
    const officer = app.addMember(c.tenantId, ['loan_officer']);
    const r = await app.req('PUT', `/api/payments/${c.paymentId}`, { token: officer.token, tenantId: c.tenantId, body: { notes: 'x' } });
    expect([401, 403]).toContain(r.status);
    expect((app.db.prepare('SELECT notes FROM payments WHERE id=?').get(c.paymentId) as any).notes).toBeNull();
  });
});

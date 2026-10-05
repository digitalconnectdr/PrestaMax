// PUT /payments/:id (Editar Pago).
//  - Regresión: respondía 500 ("no such column: updated_at") porque payments no tiene esa columna.
//  - Solo edita metadatos: fecha, método, referencia y notas. NO toca importe, aplicación, cuotas, saldos, score, bancos
//    ni el estado del préstamo.
//  - reference / notes: ausente → se conserva; "" o null → se limpian.
//  - La cuenta bancaria no se puede cambiar (el saldo de la cuenta ya se acreditó al registrar el pago); el método no puede
//    pasar a uno que exige cuenta si el pago no la tiene. BD temporal.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { bootTestApp, TestApp } from './helpers/testApp';

let app: TestApp;
beforeAll(async () => { app = await bootTestApp(); });
afterAll(async () => { await app.close(); });

type Ctx = { tenantId: string; token: string; clientId: string; loanId: string; bankId: string; bank2Id: string; paymentId: string; cashPaymentId: string };
/** Pago A: transferencia CON cuenta bancaria. Pago B: efectivo SIN cuenta. */
async function setup(): Promise<Ctx> {
  const t = app.createTenant({ planSlug: 'enterprise' });
  const call = (m: string, u: string, body?: any) => app.req(m, u, { token: t.token, tenantId: t.tenantId, body });
  const productId = app.createProduct(t.tenantId);
  const clientId = app.createClient(t.tenantId);
  const mkBank = (name: string) => {
    const id = crypto.randomUUID();
    app.db.prepare('INSERT INTO bank_accounts (id,tenant_id,bank_name,account_number,current_balance,loaned_balance,is_active) VALUES (?,?,?,?,?,?,1)').run(id, t.tenantId, name, '123-' + name, 5000, 20000);
    return id;
  };
  const bankId = mkBank('Banco A'), bank2Id = mkBank('Banco B');
  const r = await call('POST', '/api/loans', { client_id: clientId, product_id: productId, requested_amount: 6000, term: 6, first_payment_date: '2030-02-01' });
  expect(r.status).toBe(201);
  const loanId = r.body.id;
  app.db.prepare("UPDATE loans SET status='approved' WHERE id=?").run(loanId);
  expect((await call('POST', `/api/loans/${loanId}/disburse`, {})).status).toBe(200);
  const insts = app.db.prepare('SELECT principal_amount p, interest_amount i FROM installments WHERE loan_id=? ORDER BY installment_number LIMIT 2').all(loanId) as any[];
  expect((await call('POST', '/api/payments', { loan_id: loanId, amount: insts[0].p + insts[0].i, payment_method: 'transfer', bank_account_id: bankId, reference: 'REF-ORIG', notes: 'nota original' })).status).toBe(201);
  expect((await call('POST', '/api/payments', { loan_id: loanId, amount: insts[1].p + insts[1].i, payment_method: 'cash' })).status).toBe(201);
  const rows = app.db.prepare('SELECT id, payment_method FROM payments WHERE loan_id=?').all(loanId) as any[];
  const paymentId = rows.find(x => x.payment_method === 'transfer').id;
  const cashPaymentId = rows.find(x => x.payment_method === 'cash').id;
  return { tenantId: t.tenantId, token: t.token, clientId, loanId, bankId, bank2Id, paymentId, cashPaymentId };
}
const put = (c: { token: string; tenantId: string }, id: string, body: any) => app.req('PUT', `/api/payments/${id}`, { token: c.token, tenantId: c.tenantId, body });
const payRow = (id: string) => app.db.prepare('SELECT * FROM payments WHERE id=?').get(id) as any;

/** Todo lo que la edición NO debe tocar. */
function financialSnapshot(c: Ctx) {
  const q = (sql: string, ...p: any[]) => app.db.prepare(sql).all(...p);
  return {
    payments: q('SELECT id, loan_id, amount, applied_mora, applied_charges, applied_interest, applied_capital, type, is_voided, rebate_amount, created_at, registered_by FROM payments WHERE loan_id=? ORDER BY id', c.loanId),
    installments: q('SELECT id, installment_number, status, paid_principal, paid_interest, paid_mora, paid_total, deferred_due_date, due_date FROM installments WHERE loan_id=? ORDER BY installment_number', c.loanId),
    loan: q('SELECT status, principal_balance, interest_balance, mora_balance, total_balance, total_paid, total_paid_principal, total_paid_interest, total_paid_mora, days_overdue FROM loans WHERE id=?', c.loanId),
    clientScore: q('SELECT score FROM clients WHERE id=?', c.clientId),
    banks: q('SELECT id, current_balance, loaned_balance FROM bank_accounts WHERE tenant_id=? ORDER BY id', c.tenantId),
  };
}

describe('PUT /payments/:id — Editar Pago', () => {
  it('editar campos permitidos (cuerpo de la UI, snake_case) → 200; metadatos cambian y nada financiero se toca', async () => {
    const c = await setup();
    const before = financialSnapshot(c);
    const r = await put(c, c.paymentId, { payment_date: '2026-01-15', payment_method: 'check', bank_account_id: c.bankId, reference: 'REF-123', notes: 'pago corregido' });
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(c.paymentId);
    expect(String(r.body.payment_date).slice(0, 10)).toBe('2026-01-15');
    expect(r.body.payment_method).toBe('check');
    expect(r.body.reference).toBe('REF-123');
    expect(r.body.notes).toBe('pago corregido');
    expect(r.body.bank_account_id).toBe(c.bankId);            // la cuenta (igual a la actual) se conserva
    expect(financialSnapshot(c)).toEqual(before);             // importe, aplicación, cuotas, saldos, score, bancos, estado: idénticos
  });

  it('también acepta camelCase e ignora importe/aplicación si se envían', async () => {
    const c = await setup();
    const before = financialSnapshot(c);
    const r = await put(c, c.paymentId, { paymentDate: '2026-02-01', paymentMethod: 'card', reference: 'CARD-9', amount: 999999, appliedCapital: 1, applied_interest: 1 });
    expect(r.status).toBe(200);
    expect(r.body.payment_method).toBe('card');
    expect(String(r.body.payment_date).slice(0, 10)).toBe('2026-02-01');
    expect(financialSnapshot(c)).toEqual(before);
  });

  describe('reference / notes: ausente conserva, "" o null limpian', () => {
    it('propiedad ausente → se conserva el valor actual (cuerpo vacío o con otros campos)', async () => {
      const c = await setup();
      expect(payRow(c.paymentId).reference).toBe('REF-ORIG');
      expect(payRow(c.paymentId).notes).toBe('nota original');
      const before = financialSnapshot(c);
      const empty = await put(c, c.paymentId, {});
      expect(empty.status).toBe(200);
      expect(empty.body.reference).toBe('REF-ORIG');
      expect(empty.body.notes).toBe('nota original');
      const other = await put(c, c.paymentId, { payment_method: 'card' });
      expect(other.body.reference).toBe('REF-ORIG');
      expect(other.body.notes).toBe('nota original');
      const onlyRef = await put(c, c.paymentId, { reference: 'NUEVA' });
      expect(onlyRef.body.reference).toBe('NUEVA');
      expect(onlyRef.body.notes).toBe('nota original');          // notes ausente → intacta
      expect(financialSnapshot(c)).toEqual(before);
    });

    it('notes existente + notes="" → se limpia (NULL); el resto se conserva', async () => {
      const c = await setup();
      const r = await put(c, c.paymentId, { notes: '' });
      expect(r.status).toBe(200);
      expect(r.body.notes).toBeNull();
      expect(r.body.reference).toBe('REF-ORIG');
    });

    it('reference existente + reference=null → se limpia; notes ausente se conserva', async () => {
      const c = await setup();
      const r = await put(c, c.paymentId, { reference: null });
      expect(r.status).toBe(200);
      expect(r.body.reference).toBeNull();
      expect(r.body.notes).toBe('nota original');
    });

    it('ambos a la vez, solo espacios y la forma de la UI (""), todo se limpia; luego se puede volver a escribir', async () => {
      const c = await setup();
      const r = await put(c, c.paymentId, { reference: '   ', notes: null, bank_account_id: c.bankId });
      expect(r.status).toBe(200);
      expect(r.body.reference).toBeNull();
      expect(r.body.notes).toBeNull();
      const again = await put(c, c.paymentId, { reference: 'otra', notes: 'otra nota' });
      expect(again.body.reference).toBe('otra');
      expect(again.body.notes).toBe('otra nota');
    });
  });

  describe('cuenta bancaria: no editable', () => {
    it('por qué: el alta acreditó el saldo de esa cuenta, y anular el pago lo revierte sobre la cuenta guardada en el pago', async () => {
      const c = await setup();
      const bal = (id: string) => (app.db.prepare('SELECT current_balance b, loaned_balance l FROM bank_accounts WHERE id=?').get(id) as any);
      const amount = payRow(c.paymentId).amount;
      expect(bal(c.bankId).b).toBeCloseTo(5000 + amount, 2);          // acreditada al registrar
      expect(bal(c.bank2Id).b).toBe(5000);                            // la otra cuenta ni se tocó
      const afterCreate = bal(c.bankId);
      const v = await app.req('POST', `/api/payments/${c.paymentId}/void`, { token: c.token, tenantId: c.tenantId, body: { void_reason: 'prueba' } });
      expect(v.status).toBe(200);
      expect(bal(c.bankId).b).toBeCloseTo(afterCreate.b - amount, 2); // revertida sobre la cuenta del pago
      expect(bal(c.bank2Id).b).toBe(5000);
    });

    it('intento de cambiar bank_account_id (snake o camel) → 409 PAYMENT_BANK_ACCOUNT_LOCKED; no altera el pago ni los saldos', async () => {
      const c = await setup();
      const rowBefore = payRow(c.paymentId);
      const before = financialSnapshot(c);
      for (const body of [{ bank_account_id: c.bank2Id }, { bankAccountId: c.bank2Id }, { bank_account_id: c.bank2Id, notes: 'colado' }]) {
        const r = await put(c, c.paymentId, body);
        expect(r.status, JSON.stringify(body)).toBe(409);
        expect(r.body.code).toBe('PAYMENT_BANK_ACCOUNT_LOCKED');
      }
      expect(payRow(c.paymentId)).toEqual(rowBefore);          // ni siquiera se aplicó 'notes: colado': se rechaza completo
      expect(financialSnapshot(c)).toEqual(before);
    });

    it('quitar la cuenta (null / "") o ponerla en un pago de efectivo sin cuenta también se rechaza', async () => {
      const c = await setup();
      const rowA = payRow(c.paymentId), rowB = payRow(c.cashPaymentId);
      const before = financialSnapshot(c);
      expect((await put(c, c.paymentId, { bank_account_id: null })).status).toBe(409);
      expect((await put(c, c.paymentId, { bankAccountId: '' })).status).toBe(409);
      const add = await put(c, c.cashPaymentId, { bank_account_id: c.bankId });
      expect(add.status).toBe(409);
      expect(add.body.code).toBe('PAYMENT_BANK_ACCOUNT_LOCKED');
      expect(payRow(c.paymentId)).toEqual(rowA);
      expect(payRow(c.cashPaymentId)).toEqual(rowB);
      expect(financialSnapshot(c)).toEqual(before);
    });

    it('enviar la cuenta actual (lo que manda la UI sin cambiarla) es válido; en efectivo sin cuenta, null/"" también', async () => {
      const c = await setup();
      expect((await put(c, c.paymentId, { bank_account_id: c.bankId, notes: 'ok' })).status).toBe(200);
      expect((await put(c, c.cashPaymentId, { bank_account_id: null, notes: 'ok' })).status).toBe(200);
      expect((await put(c, c.cashPaymentId, { bankAccountId: '', notes: 'ok2' })).status).toBe(200);
    });
  });

  describe('método de pago: solo se bloquea pasar a un método que exige cuenta en un pago sin cuenta', () => {
    it('efectivo SIN cuenta → transferencia/cheque/tarjeta = 409 PAYMENT_METHOD_REQUIRES_ACCOUNT y no cambia nada', async () => {
      const c = await setup();
      const rowB = payRow(c.cashPaymentId);
      const before = financialSnapshot(c);
      for (const m of ['transfer', 'check', 'card']) {
        const r = await put(c, c.cashPaymentId, { payment_method: m, notes: 'colado' });
        expect(r.status, m).toBe(409);
        expect(r.body.code).toBe('PAYMENT_METHOD_REQUIRES_ACCOUNT');
      }
      expect(payRow(c.cashPaymentId)).toEqual(rowB);
      expect(financialSnapshot(c)).toEqual(before);
      expect((await put(c, c.cashPaymentId, { payment_method: 'cash', notes: 'sigue siendo efectivo' })).status).toBe(200);
    });

    it('pago CON cuenta: transferencia ↔ cheque ↔ tarjeta y a efectivo (efectivo con cuenta es un estado válido) se permiten; saldos intactos', async () => {
      const c = await setup();
      const before = financialSnapshot(c);
      for (const m of ['check', 'card', 'cash', 'transfer']) {
        const r = await put(c, c.paymentId, { payment_method: m });
        expect(r.status, m).toBe(200);
        expect(r.body.payment_method).toBe(m);
        expect(r.body.bank_account_id).toBe(c.bankId);
      }
      expect(financialSnapshot(c)).toEqual(before);
    });
  });

  it('deja el audit payment_updated con valores anteriores y nuevos (incluye reference/notes)', async () => {
    const c = await setup();
    expect((await put(c, c.paymentId, { payment_method: 'check', payment_date: '2026-03-03', reference: null, notes: 'n2' })).status).toBe(200);
    const a = app.db.prepare("SELECT * FROM audit_logs WHERE entity_id=? AND action='payment_updated'").all(c.paymentId) as any[];
    expect(a).toHaveLength(1);
    expect(a[0].entity_type).toBe('payment');
    expect(a[0].tenant_id).toBe(c.tenantId);
    const ch = JSON.parse(a[0].changes);
    expect(ch.old.payment_method).toBe('transfer');
    expect(ch.old.reference).toBe('REF-ORIG');
    expect(ch.old.bank_account_id).toBe(c.bankId);
    expect(ch.new.payment_method).toBe('check');
    expect(ch.new.payment_date).toBe('2026-03-03');
    expect(ch.new.reference).toBeNull();
    expect(ch.new.notes).toBe('n2');
  });

  it('un rechazo (cuenta bloqueada / método) no deja audit ni cambios', async () => {
    const c = await setup();
    await put(c, c.paymentId, { bank_account_id: c.bank2Id });
    await put(c, c.cashPaymentId, { payment_method: 'transfer' });
    expect((app.db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE action='payment_updated' AND tenant_id=?").get(c.tenantId) as any).c).toBe(0);
  });

  it('pago inexistente → 404; pago anulado → 400 sin cambios', async () => {
    const c = await setup();
    expect((await put(c, crypto.randomUUID(), { notes: 'x' })).status).toBe(404);
    app.db.prepare('UPDATE payments SET is_voided=1 WHERE id=?').run(c.paymentId);
    const voided = await put(c, c.paymentId, { notes: 'x' });
    expect(voided.status).toBe(400);
    expect(payRow(c.paymentId).notes).toBe('nota original');
  });

  it('pago de OTRO tenant → inaccesible: 404 igual que inexistente y el pago ajeno queda intacto', async () => {
    const a = await setup();
    const b = await setup();
    const beforeB = payRow(b.paymentId);
    const foreign = await put(a, b.paymentId, { notes: 'intruso', payment_method: 'check', bank_account_id: a.bankId });
    const missing = await put(a, crypto.randomUUID(), { notes: 'intruso' });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
    expect(payRow(b.paymentId)).toEqual(beforeB);
    expect((app.db.prepare("SELECT COUNT(*) c FROM audit_logs WHERE entity_id=? AND action='payment_updated'").get(b.paymentId) as any).c).toBe(0);
  });

  it('sin permiso de propietario/plataforma → 403/401 y no cambia nada', async () => {
    const c = await setup();
    const officer = app.addMember(c.tenantId, ['loan_officer']);
    const r = await app.req('PUT', `/api/payments/${c.paymentId}`, { token: officer.token, tenantId: c.tenantId, body: { notes: 'x' } });
    expect([401, 403]).toContain(r.status);
    expect(payRow(c.paymentId).notes).toBe('nota original');
  });
});

describe('frontend: Editar Pago deja la cuenta bancaria como solo lectura', () => {
  const FE = path.join(__dirname, '../../../frontend/src');
  const page = fs.readFileSync(path.join(FE, 'pages/payments/PaymentsPage.tsx'), 'utf8');
  const modal = page.slice(page.indexOf('{/* ── Edit Payment Modal ── */}'), page.indexOf('{/* ── Void Confirmation Modal ── */}'));
  it('el formulario ya no tiene selector de cuenta, la muestra de solo lectura y explica por qué', () => {
    expect(modal).toContain('data-testid="edit-payment-bank-readonly"');
    expect(modal).toContain("t('pay.edit_account_locked')");
    expect(modal).not.toMatch(/bankAccounts\.map/);
    expect(modal).not.toContain('editForm.bankAccountId');
    const line = fs.readFileSync(path.join(FE, 'lib/i18n.ts'), 'utf8').split('\n').find(l => l.trimStart().startsWith("'pay.edit_account_locked':"))!;
    for (const lang of ['es', 'en', 'pt']) expect(line).toMatch(new RegExp(`${lang}: '[^']{10,}`));
  });
  it('la petición PUT no envía la cuenta bancaria y sí reference/notes (""= limpiar)', () => {
    const put = page.slice(page.indexOf('api.put(`/payments/${editingPayment.id}`'), page.indexOf('toast.success(t(\'pay.updated\'))'));
    expect(put).not.toMatch(/bankAccount/i);
    for (const k of ['paymentDate', 'paymentMethod', 'reference: editForm.reference', 'notes: editForm.notes']) expect(put, k).toContain(k);
  });
  it('sin cuenta, los métodos que la exigen quedan deshabilitados en el selector', () => {
    expect(modal).toContain('disabled={!editingPayment.bankAccountId && editingPayment.paymentMethod !== v}');
  });
});

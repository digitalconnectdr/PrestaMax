import { describe, it, expect } from 'vitest';
import { allocatePayment, agingBuckets, moraRate, r2 } from '../lib/calculations';

// ─── allocatePayment ─────────────────────────────────────────────────────────
describe('allocatePayment — flujo regular', () => {
  const baseInst = (id: string, due: string, principal: number, interest: number, paid_p = 0, paid_i = 0, status = 'pending') => ({
    id, status, due_date: due,
    principal_amount: principal, interest_amount: interest,
    paid_principal: paid_p, paid_interest: paid_i,
  });

  it('paga interés y capital de la primera cuota en orden', () => {
    const inst = [
      baseInst('a', '2026-05-01', 1000, 200),
      baseInst('b', '2026-06-01', 1000, 200),
    ];
    // Pago 800: cubre 200 interés A + 600 capital A
    const r = allocatePayment(inst, 800, 'regular', 'apply_to_next_installment', 0);
    expect(r.totalInterest).toBe(200);
    expect(r.totalPrincipal).toBe(600);
    expect(r.totalMora).toBe(0);
    expect(r.remaining).toBe(0);
  });

  it('si el pago excede una cuota, sigue con la siguiente', () => {
    const inst = [
      baseInst('a', '2026-05-01', 500, 100),
      baseInst('b', '2026-06-01', 500, 100),
    ];
    // Pago 800: cubre A completa (600) + interés B (100) + 100 capital B
    const r = allocatePayment(inst, 800, 'regular', 'apply_to_next_installment', 0);
    expect(r.totalInterest).toBe(200);   // 100 + 100
    expect(r.totalPrincipal).toBe(600);  // 500 A + 100 B
    expect(r.remaining).toBe(0);
  });

  it('overpayment apply_to_capital deja excesoToCapital', () => {
    const inst = [
      baseInst('a', '2026-05-01', 500, 100),
    ];
    // Pago 1000: cubre 600 + sobran 400 al capital
    const r = allocatePayment(inst, 1000, 'regular', 'apply_to_capital', 0);
    expect(r.totalInterest).toBe(100);
    expect(r.totalPrincipal).toBe(500);
    expect(r.excessToCapital).toBe(400);
  });

  it('overpayment apply_to_next_installment deja remaining=0 sin exceso', () => {
    const inst = [
      baseInst('a', '2026-05-01', 500, 100),
    ];
    const r = allocatePayment(inst, 1000, 'regular', 'apply_to_next_installment', 0);
    expect(r.excessToCapital).toBe(0);
    // El sobrante (400) NO se asigna porque no hay siguiente cuota pendiente
    // (en este test). En un escenario real iría a la próxima cuota.
    expect(r.remaining).toBeGreaterThan(0);
  });
});

describe('allocatePayment — mora', () => {
  const baseInst = (id: string, due: string, principal: number, interest: number) => ({
    id, status: 'pending', due_date: due,
    principal_amount: principal, interest_amount: interest,
    paid_principal: 0, paid_interest: 0,
  });

  it('mora se cobra antes que interés y capital', () => {
    const inst = [baseInst('a', '2026-05-01', 500, 100)];
    const r = allocatePayment(inst, 800, 'regular', 'apply_to_next_installment', 150);
    expect(r.totalMora).toBe(150);
    expect(r.totalInterest).toBe(100);
    expect(r.totalPrincipal).toBe(500);
    expect(r.remaining).toBe(50);
  });

  it('si el pago solo alcanza para mora, no aplica nada más', () => {
    const inst = [baseInst('a', '2026-05-01', 500, 100)];
    const r = allocatePayment(inst, 100, 'regular', 'apply_to_next_installment', 150);
    expect(r.totalMora).toBe(100);
    expect(r.totalInterest).toBe(0);
    expect(r.totalPrincipal).toBe(0);
    expect(r.remaining).toBe(0);
  });

  it('capital_only ignora la mora cobrada', () => {
    const inst = [baseInst('a', '2026-05-01', 500, 100)];
    const r = allocatePayment(inst, 500, 'capital_only', 'apply_to_next_installment', 200);
    expect(r.totalMora).toBe(0); // capital_only no cobra mora
    expect(r.totalInterest).toBe(0);
    expect(r.totalPrincipal).toBe(500);
  });
});

describe('allocatePayment — interest_only', () => {
  it('solo cubre interés, NO toca capital', () => {
    const inst = [{
      id: 'a', status: 'pending', due_date: '2026-05-01',
      principal_amount: 1000, interest_amount: 200,
      paid_principal: 0, paid_interest: 0,
    }];
    const r = allocatePayment(inst, 500, 'interest_only', 'apply_to_next_installment', 0);
    expect(r.totalInterest).toBe(200);
    expect(r.totalPrincipal).toBe(0); // NO toca capital
    expect(r.remaining).toBe(300); // sobrante NO se asigna porque NO hay 2nd cuota
  });
});

// ─── agingBuckets ────────────────────────────────────────────────────────────
describe('agingBuckets', () => {
  it('distribuye préstamos por edad de mora', () => {
    const loans = [
      { days_overdue: 0,  total_balance: 1000, mora_balance: 0 },
      { days_overdue: 5,  total_balance: 1000, mora_balance: 50 },
      { days_overdue: 12, total_balance: 1000, mora_balance: 100 },
      { days_overdue: 25, total_balance: 1000, mora_balance: 200 },
      { days_overdue: 60, total_balance: 1000, mora_balance: 500 },
      { days_overdue: 90, total_balance: 1000, mora_balance: 700 },
    ];
    const r = agingBuckets(loans);
    expect(r.current).toBe(1);
    expect(r.d1_7).toBe(1);
    expect(r.d8_15).toBe(1);
    expect(r.d16_30).toBe(1);
    expect(r.over30).toBe(2);
    expect(r.amounts.current).toBe(1000); // total_balance
    expect(r.amounts.d1_7).toBe(50);       // mora_balance
    expect(r.amounts.over30).toBe(1200);   // 500 + 700
  });

  it('lista vacía da ceros', () => {
    const r = agingBuckets([]);
    expect(r.current + r.d1_7 + r.d8_15 + r.d16_30 + r.over30).toBe(0);
  });
});

// ─── moraRate ────────────────────────────────────────────────────────────────
describe('moraRate', () => {
  it('calcula el porcentaje correcto', () => {
    expect(moraRate(100000, 15000)).toBe(15);
    expect(moraRate(100000, 0)).toBe(0);
  });
  it('activeBalance 0 retorna 0 (sin división)', () => {
    expect(moraRate(0, 1000)).toBe(0);
  });
  it('100% mora si todo está en mora', () => {
    expect(moraRate(50000, 50000)).toBe(100);
  });
});

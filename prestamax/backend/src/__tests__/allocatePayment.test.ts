// allocatePayment — tests de distribución de pagos
//
// Cubre escenarios reales que ocurren en producción:
//   - pago parcial (no alcanza ni para la primera cuota)
//   - pago de una cuota completa
//   - pago de varias cuotas con o sin mora
//   - pago en exceso (overpayment) → a capital vs a próxima cuota
//   - pago tipo 'interest_only' (solo intereses, capital queda intacto)
//   - pago tipo 'capital_only' (a capital tras saldar interés vencido)
//   - cuotas ya parcialmente pagadas
//   - pago con redondeo (centavos)

import { describe, it, expect } from 'vitest';
import { allocatePayment, type AllocInstallment } from '../lib/calculations';

// Helper para crear cuotas de prueba con defaults razonables
function mkInst(partial: Partial<AllocInstallment>): AllocInstallment {
  return {
    id: 'c1',
    status: 'pending',
    due_date: '2026-01-15T00:00:00Z',
    principal_amount: 5000,
    interest_amount: 500,
    paid_principal: 0,
    paid_interest: 0,
    paid_mora: 0,
    paid_total: 0,
    ...partial,
  };
}

describe('allocatePayment — regular (interes -> capital -> excess)', () => {
  it('pago exacto de 1 cuota: aplica interes completo + capital completo', () => {
    const ins = [mkInst({ id: 'c1', principal_amount: 5000, interest_amount: 500 })];
    const r = allocatePayment(ins, 5500, 'regular', 'apply_to_capital', 0);
    expect(r.totalInterest).toBe(500);
    expect(r.totalPrincipal).toBe(5000);
    expect(r.totalMora).toBe(0);
    expect(r.excessToCapital).toBe(0);
    expect(r.remaining).toBe(0);
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0]).toEqual({ id: 'c1', addPrincipal: 5000, addInterest: 500, addMora: 0 });
  });

  it('pago parcial: solo alcanza para parte del interes', () => {
    const ins = [mkInst({ id: 'c1', principal_amount: 5000, interest_amount: 500 })];
    const r = allocatePayment(ins, 200, 'regular', 'apply_to_capital', 0);
    expect(r.totalInterest).toBe(200);
    expect(r.totalPrincipal).toBe(0);
    expect(r.remaining).toBe(0);
  });

  it('pago de 2 cuotas + mora', () => {
    const ins = [
      mkInst({ id: 'c1', principal_amount: 5000, interest_amount: 500 }),
      mkInst({ id: 'c2', principal_amount: 5000, interest_amount: 500, due_date: '2026-02-15T00:00:00Z' }),
    ];
    const r = allocatePayment(ins, 11200, 'regular', 'apply_to_capital', 200);
    expect(r.totalMora).toBe(200);
    expect(r.totalInterest).toBe(1000);
    expect(r.totalPrincipal).toBe(10000);
    expect(r.remaining).toBe(0);
  });

  it('overpayment con apply_to_capital: el exceso va a excessToCapital', () => {
    const ins = [mkInst({ id: 'c1', principal_amount: 5000, interest_amount: 500 })];
    const r = allocatePayment(ins, 7000, 'regular', 'apply_to_capital', 0);
    expect(r.totalInterest).toBe(500);
    expect(r.totalPrincipal).toBe(5000);
    expect(r.excessToCapital).toBe(1500);
    expect(r.remaining).toBe(0);
  });

  it('overpayment con apply_to_next_installment: remaining queda > 0', () => {
    const ins = [mkInst({ id: 'c1', principal_amount: 5000, interest_amount: 500 })];
    const r = allocatePayment(ins, 7000, 'regular', 'apply_to_next_installment', 0);
    expect(r.totalInterest).toBe(500);
    expect(r.totalPrincipal).toBe(5000);
    expect(r.excessToCapital).toBe(0);
    expect(r.remaining).toBe(1500);
  });

  it('cuotas pagadas/waived se ignoran', () => {
    const ins = [
      mkInst({ id: 'c1', status: 'paid', principal_amount: 5000, interest_amount: 500 }),
      mkInst({ id: 'c2', principal_amount: 5000, interest_amount: 500, due_date: '2026-02-15T00:00:00Z' }),
    ];
    const r = allocatePayment(ins, 5500, 'regular', 'apply_to_capital', 0);
    expect(r.updates).toHaveLength(1);
    expect(r.updates[0].id).toBe('c2');
  });

  it('cuota parcialmente pagada: solo aplica el restante', () => {
    const ins = [mkInst({
      id: 'c1', principal_amount: 5000, interest_amount: 500,
      paid_principal: 2000, paid_interest: 500, paid_total: 2500
    })];
    const r = allocatePayment(ins, 3000, 'regular', 'apply_to_capital', 0);
    expect(r.totalInterest).toBe(0);  // ya estaba pagado
    expect(r.totalPrincipal).toBe(3000); // resta 3000 de capital
    expect(r.remaining).toBe(0);
  });
});

describe('allocatePayment — interest_only', () => {
  it('solo aplica a interes de las cuotas, capital intacto', () => {
    const ins = [
      mkInst({ id: 'c1', principal_amount: 5000, interest_amount: 500 }),
      mkInst({ id: 'c2', principal_amount: 5000, interest_amount: 500, due_date: '2026-02-15T00:00:00Z' }),
    ];
    const r = allocatePayment(ins, 1000, 'interest_only', 'apply_to_capital', 0);
    expect(r.totalInterest).toBe(1000);
    expect(r.totalPrincipal).toBe(0);
    expect(r.totalMora).toBe(0);  // interest_only ignora mora
  });

  it('si excede el interes total disponible, no aplica a capital (queda remaining)', () => {
    const ins = [mkInst({ id: 'c1', principal_amount: 5000, interest_amount: 500 })];
    const r = allocatePayment(ins, 1000, 'interest_only', 'apply_to_capital', 0);
    expect(r.totalInterest).toBe(500);
    expect(r.totalPrincipal).toBe(0);
    expect(r.remaining).toBe(500);
  });
});

describe('allocatePayment — capital_only', () => {
  it('aplica todo a capital, ignora interes', () => {
    const ins = [
      mkInst({ id: 'c1', principal_amount: 5000, interest_amount: 500 }),
    ];
    const r = allocatePayment(ins, 3000, 'capital_only', 'apply_to_capital', 0);
    // capital_only en lib/calculations.ts skip interes completamente
    expect(r.totalInterest).toBe(0);
    expect(r.totalPrincipal).toBe(3000);
  });

  it('overpayment con capital_only va a excessToCapital', () => {
    const ins = [mkInst({ id: 'c1', principal_amount: 2000, interest_amount: 200 })];
    const r = allocatePayment(ins, 3000, 'capital_only', 'apply_to_capital', 0);
    expect(r.totalPrincipal).toBe(2000);
    expect(r.excessToCapital).toBe(1000);
    expect(r.remaining).toBe(0);
  });
});

describe('allocatePayment — redondeo de centavos', () => {
  it('maneja decimales sin perder centavos', () => {
    const ins = [mkInst({ id: 'c1', principal_amount: 1666.67, interest_amount: 166.67 })];
    const r = allocatePayment(ins, 1833.34, 'regular', 'apply_to_capital', 0);
    expect(r.totalInterest).toBe(166.67);
    expect(r.totalPrincipal).toBe(1666.67);
    expect(r.remaining).toBe(0);
  });
});

describe('allocatePayment — ordenamiento por fecha', () => {
  it('aplica primero la cuota mas antigua', () => {
    const ins = [
      mkInst({ id: 'cZ', principal_amount: 5000, interest_amount: 500, due_date: '2026-03-15T00:00:00Z' }),
      mkInst({ id: 'cA', principal_amount: 5000, interest_amount: 500, due_date: '2026-01-15T00:00:00Z' }),
    ];
    const r = allocatePayment(ins, 5500, 'regular', 'apply_to_capital', 0);
    expect(r.updates[0].id).toBe('cA');  // cuota mas antigua primero
  });

  it('respeta deferred_due_date sobre due_date', () => {
    const ins = [
      mkInst({ id: 'cA', principal_amount: 5000, interest_amount: 500, due_date: '2026-01-15T00:00:00Z', deferred_due_date: '2026-04-15T00:00:00Z' }),
      mkInst({ id: 'cB', principal_amount: 5000, interest_amount: 500, due_date: '2026-02-15T00:00:00Z' }),
    ];
    const r = allocatePayment(ins, 5500, 'regular', 'apply_to_capital', 0);
    expect(r.updates[0].id).toBe('cB');  // cB tiene due efectiva mas temprana
  });
});

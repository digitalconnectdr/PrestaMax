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

  it('overpayment con apply_to_capital: el exceso va a excessToCapital y a totalPrincipal', () => {
    // NOTA: totalPrincipal INCLUYE el excess (alineado con produccion: applied_capital
    // que se guarda en BD ya incluye el sobrante para que loan.principal_balance baje).
    const ins = [mkInst({ id: 'c1', principal_amount: 5000, interest_amount: 500 })];
    const r = allocatePayment(ins, 7000, 'regular', 'apply_to_capital', 0);
    expect(r.totalInterest).toBe(500);
    expect(r.totalPrincipal).toBe(6500);   // 5000 cap + 1500 excess
    expect(r.excessToCapital).toBe(1500);  // tracking separado del excess
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
  // NOTA (May 2026): capital_only ahora cobra interes pendiente PRIMERO antes de
  // capital — alineado con produccion y estandar bancario (no se puede tocar
  // capital sin saldar interes vencido). Antes la version "lib" lo ignoraba; ahora
  // ambas versiones coinciden.
  it('cobra interes pendiente primero, luego capital', () => {
    const ins = [
      mkInst({ id: 'c1', principal_amount: 5000, interest_amount: 500 }),
    ];
    const r = allocatePayment(ins, 3000, 'capital_only', 'apply_to_capital', 0);
    expect(r.totalInterest).toBe(500);   // saldó el interés primero
    expect(r.totalPrincipal).toBe(2500); // resto al capital
    expect(r.totalMora).toBe(0);          // capital_only NO cobra mora
  });

  it('overpayment con capital_only va a excessToCapital y a totalPrincipal', () => {
    const ins = [mkInst({ id: 'c1', principal_amount: 2000, interest_amount: 200 })];
    const r = allocatePayment(ins, 3000, 'capital_only', 'apply_to_capital', 0);
    expect(r.totalInterest).toBe(200);     // saldó el interés
    expect(r.totalPrincipal).toBe(2800);   // 2000 cap + 800 excess
    expect(r.excessToCapital).toBe(800);   // tracking separado
    expect(r.remaining).toBe(0);
  });
});

describe('allocatePayment — WATERFALL POR CUOTA (mora por cuota)', () => {
  // Estos tests cubren la nueva logica: mora se aplica POR cuota, no globalmente.
  // Cuando una cuota se liquida completamente (mora + interes + capital), se pasa
  // a la siguiente. Esto permite que cuotas viejas queden COMPLETAS en vez de
  // todas en "parcial".

  it('caso Lucía simplificado: pago liquida cuota#1 completa + parte mora cuota#2', () => {
    const ins = [
      mkInst({ id: 'L1', principal_amount: 6652.78, interest_amount: 2708.35, due_date: '2026-03-27' }),
      mkInst({ id: 'L2', principal_amount: 6985.42, interest_amount: 2375.71, due_date: '2026-04-27' }),
      mkInst({ id: 'L3', principal_amount: 7334.69, interest_amount: 2026.44, due_date: '2026-05-27' }),
    ];
    const moraPerInst = { L1: 535.47, L2: 290.20, L3: 26.19 };
    const r = allocatePayment(ins, 9941.52, 'regular', 'apply_to_next_installment', moraPerInst);
    // L1 debe quedar PAGADA: 535.47 + 2708.35 + 6652.78 = 9896.60
    // Sobran 9941.52 - 9896.60 = 44.92 que van a la mora de L2
    expect(r.totalMora).toBe(580.39);      // 535.47 (L1) + 44.92 (L2)
    expect(r.totalInterest).toBe(2708.35); // L1 interés completo
    expect(r.totalPrincipal).toBe(6652.78);// L1 capital completo
    expect(r.remaining).toBe(0);
    // Invariante: amount = mora + int + cap + excess + remaining
    expect(r.totalMora + r.totalInterest + r.totalPrincipal + r.excessToCapital + r.remaining)
      .toBeCloseTo(9941.52, 1);
    // Verificar que L1 tiene los 3 componentes y L2 solo mora parcial
    const u1 = r.updates.find(u => u.id === 'L1');
    const u2 = r.updates.find(u => u.id === 'L2');
    expect(u1).toEqual({ id: 'L1', addPrincipal: 6652.78, addInterest: 2708.35, addMora: 535.47 });
    expect(u2).toEqual({ id: 'L2', addPrincipal: 0, addInterest: 0, addMora: 44.92 });
  });

  it('pago exacto de cuota#1 (mora + interes + capital) la liquida sin tocar otras', () => {
    const ins = [
      mkInst({ id: 'A', principal_amount: 7781.29, interest_amount: 2371.53, due_date: '2025-06-29' }),
      mkInst({ id: 'B', principal_amount: 8014.73, interest_amount: 2138.09, due_date: '2025-07-29' }),
    ];
    const moraPerInst = { A: 3380.89, B: 3076.30 };
    // 3380.89 + 2371.53 + 7781.29 = 13533.71
    const r = allocatePayment(ins, 13533.71, 'regular', 'apply_to_next_installment', moraPerInst);
    expect(r.totalMora).toBe(3380.89);
    expect(r.totalInterest).toBe(2371.53);
    expect(r.totalPrincipal).toBe(7781.29);
    expect(r.remaining).toBe(0);
    expect(r.updates).toHaveLength(1); // solo A recibió pago
  });

  it('mora ya parcialmente pagada: solo aplica el restante', () => {
    const ins = [mkInst({
      id: 'X', principal_amount: 1000, interest_amount: 100,
      paid_mora: 50,
    })];
    const moraPerInst = { X: 200 }; // mora total 200, ya pagados 50 → faltan 150
    const r = allocatePayment(ins, 1250, 'regular', 'apply_to_next_installment', moraPerInst);
    expect(r.totalMora).toBe(150);
    expect(r.totalInterest).toBe(100);
    expect(r.totalPrincipal).toBe(1000);
    expect(r.remaining).toBe(0);
  });

  it('overpayment con apply_to_capital y mora por cuota', () => {
    const ins = [mkInst({ id: 'C', principal_amount: 500, interest_amount: 100 })];
    const moraPerInst = { C: 50 };
    // Cuota total = 650 + sobran 350. totalPrincipal incluye el excess.
    const r = allocatePayment(ins, 1000, 'regular', 'apply_to_capital', moraPerInst);
    expect(r.totalMora).toBe(50);
    expect(r.totalInterest).toBe(100);
    expect(r.totalPrincipal).toBe(850);   // 500 cap + 350 excess
    expect(r.excessToCapital).toBe(350);
    expect(r.remaining).toBe(0);
  });

  it('interest_only NO cobra mora aunque haya mora pendiente', () => {
    const ins = [mkInst({ id: 'D', principal_amount: 1000, interest_amount: 200 })];
    const moraPerInst = { D: 500 };
    const r = allocatePayment(ins, 300, 'interest_only', 'apply_to_next_installment', moraPerInst);
    expect(r.totalMora).toBe(0);     // interest_only NO cobra mora
    expect(r.totalInterest).toBe(200);// cubre todo el interés
    expect(r.totalPrincipal).toBe(0); // no toca capital
    expect(r.remaining).toBe(100);
  });

  it('compatibilidad: acepta mora como numero (caso legacy)', () => {
    // Si se pasa un numero, se asigna a la primera cuota pendiente.
    // Con una sola cuota: 150 mora + 100 int + 500 cap = 750. remaining = 50.
    const ins = [mkInst({ id: 'P', principal_amount: 500, interest_amount: 100 })];
    const r = allocatePayment(ins, 800, 'regular', 'apply_to_next_installment', 150);
    expect(r.totalMora).toBe(150);
    expect(r.totalInterest).toBe(100);
    expect(r.totalPrincipal).toBe(500);
    expect(r.remaining).toBe(50);
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

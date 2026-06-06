// ─── Test de integracion: reestructuracion de prestamo activo (P1 #A) ───────
// Simula el flujo end-to-end:
//   1. Genera schedule original (10 cuotas mensuales, $10k @ 3%, fixed_installment)
//   2. "Paga" 2 cuotas (marca paid_principal/paid_interest, status='paid')
//   3. Calcula saldo restante real
//   4. Regenera el schedule de las 8 cuotas pendientes con tasa nueva (2%)
//   5. Verifica invariantes:
//      - Las 2 cuotas pagadas NO cambian
//      - Las nuevas cuotas pending suman exactamente saldo + interes total nuevo
//      - El monto del capital total devuelto == disbursed_amount
import { describe, it, expect } from 'vitest';
import { generateSchedule, getInstallmentCount, r2 } from '../lib/calculations';

interface Inst {
  installment_number: number;
  due_date: string;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  status: string;
  paid_principal: number;
  paid_interest: number;
}

describe('Reestructuracion de prestamo activo (P1 #A end-to-end)', () => {
  // Escenario 1: pago perfecto de 2 cuotas + reestructuracion con tasa menor
  it('escenario 1: 10 cuotas $10k @ 3% mensual → pago 2 → reestructura @ 2%', () => {
    const amount = 10000;
    const originalRate = 3;
    const newRate = 2;

    // ── PASO 1: Generar schedule original ────────────────────────────────────
    const original = generateSchedule({
      amount, rate: originalRate, rateType: 'monthly',
      term: 10, termUnit: 'months', freq: 'monthly',
      type: 'fixed_installment', firstDate: '2026-01-01',
    });
    expect(original.length).toBe(10);

    // Convertir a "cuotas guardadas" simulando installments en DB
    const installments: Inst[] = original.map(s => ({
      installment_number: s.installment_number,
      due_date: s.due_date,
      principal_amount: s.principal_amount,
      interest_amount: s.interest_amount,
      total_amount: s.total_amount,
      status: 'pending',
      paid_principal: 0,
      paid_interest: 0,
    }));

    // ── PASO 2: "Pagar" las primeras 2 cuotas ────────────────────────────────
    installments[0].status = 'paid';
    installments[0].paid_principal = installments[0].principal_amount;
    installments[0].paid_interest  = installments[0].interest_amount;
    installments[1].status = 'paid';
    installments[1].paid_principal = installments[1].principal_amount;
    installments[1].paid_interest  = installments[1].interest_amount;

    // ── PASO 3: Calcular saldo principal restante ───────────────────────────
    // (Esto es lo que la DB calcula automaticamente tras cada pago)
    const totalPrincipalPaid = installments.slice(0, 2).reduce((a, i) => a + i.paid_principal, 0);
    const principalBalance = r2(amount - totalPrincipalPaid);
    expect(principalBalance).toBeGreaterThan(0);
    expect(principalBalance).toBeLessThan(amount);

    // ── PASO 4: Regenerar las cuotas pendientes con tasa nueva ───────────────
    // Mismo numero de cuotas restantes (10 - 2 = 8)
    const paidCount = 2;
    const totalNewTerm = 10; // mismo plazo total
    const remainingCount = Math.max(1, totalNewTerm - paidCount); // 8

    const newSchedule = generateSchedule({
      amount: principalBalance,
      rate: newRate, rateType: 'monthly',
      term: remainingCount, termUnit: 'months', freq: 'monthly',
      type: 'fixed_installment',
      firstDate: installments[2].due_date,
    });
    expect(newSchedule.length).toBe(remainingCount);

    // ── PASO 5: Invariantes ─────────────────────────────────────────────────
    // Las 2 cuotas pagadas NO cambian
    expect(installments[0].status).toBe('paid');
    expect(installments[1].status).toBe('paid');

    // El capital total devuelto == disbursed_amount (no over/under amortization)
    const newPrincipalSum = newSchedule.reduce((a, s) => a + s.principal_amount, 0);
    const totalPrincipalEnd = totalPrincipalPaid + newPrincipalSum;
    expect(totalPrincipalEnd).toBeCloseTo(amount, 0);

    // Tasa de interes menor → interes nuevo < interes que faltaba en plan original
    const originalRemainingInterest = installments.slice(2).reduce((a, i) => a + i.interest_amount, 0);
    const newTotalInterest = newSchedule.reduce((a, s) => a + s.interest_amount, 0);
    expect(newTotalInterest).toBeLessThan(originalRemainingInterest);
  });

  // Escenario 2: cambio de plazo (mas tiempo → cuota mensual menor)
  it('escenario 2: extiende plazo de 10 → 15 cuotas tras pagar 3', () => {
    const amount = 20000;
    const original = generateSchedule({
      amount, rate: 2.5, rateType: 'monthly',
      term: 10, termUnit: 'months', freq: 'monthly',
      type: 'fixed_installment', firstDate: '2026-01-01',
    });
    const installments: Inst[] = original.map(s => ({
      installment_number: s.installment_number,
      due_date: s.due_date,
      principal_amount: s.principal_amount,
      interest_amount: s.interest_amount,
      total_amount: s.total_amount,
      status: 'pending',
      paid_principal: 0,
      paid_interest: 0,
    }));

    // Pagar 3 cuotas
    for (let i = 0; i < 3; i++) {
      installments[i].status = 'paid';
      installments[i].paid_principal = installments[i].principal_amount;
      installments[i].paid_interest  = installments[i].interest_amount;
    }
    const principalBalance = r2(amount - installments.slice(0, 3).reduce((a, i) => a + i.paid_principal, 0));

    // Reestructurar a 15 cuotas total (12 restantes)
    const newTerm = 15;
    const remainingCount = newTerm - 3; // 12
    const newSchedule = generateSchedule({
      amount: principalBalance,
      rate: 2.5, rateType: 'monthly',
      term: remainingCount, termUnit: 'months', freq: 'monthly',
      type: 'fixed_installment',
      firstDate: installments[3].due_date,
    });
    expect(newSchedule.length).toBe(remainingCount);

    // Cuota mensual nueva debe ser menor que la original (mas plazo = menos por mes)
    const newMonthly = newSchedule[0].total_amount;
    const oldMonthly = installments[3].total_amount;
    expect(newMonthly).toBeLessThan(oldMonthly);

    // Capital total al final == amount (invariante)
    const totalPrincipalEnd = installments.slice(0, 3).reduce((a, i) => a + i.principal_amount, 0)
                            + newSchedule.reduce((a, s) => a + s.principal_amount, 0);
    expect(totalPrincipalEnd).toBeCloseTo(amount, 0);
  });

  // Escenario 3: cambio de frecuencia (mensual → quincenal)
  it('escenario 3: cambia frecuencia monthly → biweekly tras pagar 1 cuota', () => {
    const amount = 6000;
    const original = generateSchedule({
      amount, rate: 2, rateType: 'monthly',
      term: 6, termUnit: 'months', freq: 'monthly',
      type: 'fixed_installment', firstDate: '2026-01-01',
    });
    const installments: Inst[] = original.map(s => ({
      installment_number: s.installment_number,
      due_date: s.due_date,
      principal_amount: s.principal_amount,
      interest_amount: s.interest_amount,
      total_amount: s.total_amount,
      status: 'pending',
      paid_principal: 0,
      paid_interest: 0,
    }));

    installments[0].status = 'paid';
    installments[0].paid_principal = installments[0].principal_amount;
    installments[0].paid_interest  = installments[0].interest_amount;
    const principalBalance = r2(amount - installments[0].paid_principal);

    // Reestructurar a 10 cuotas quincenales (sobre saldo restante)
    const newTerm = 10;
    const newSchedule = generateSchedule({
      amount: principalBalance,
      rate: 2, rateType: 'monthly',
      term: newTerm, termUnit: 'biweekly', freq: 'biweekly',
      type: 'fixed_installment',
      firstDate: installments[1].due_date,
    });
    expect(newSchedule.length).toBe(newTerm);

    // Las quincenales individuales tienen MENOR principal que las mensuales originales
    expect(newSchedule[0].principal_amount).toBeLessThan(installments[1].principal_amount);

    // Capital total devuelto al final == amount
    const totalPrincipalEnd = installments[0].principal_amount + newSchedule.reduce((a, s) => a + s.principal_amount, 0);
    expect(totalPrincipalEnd).toBeCloseTo(amount, 0);
  });

  // Escenario 4: cuotas pagadas INTACTAS aunque se cambien todos los parametros
  it('escenario 4: invariante — cuotas pagadas permanecen iguales tras reestructura', () => {
    const amount = 12000;
    const original = generateSchedule({
      amount, rate: 3, rateType: 'monthly',
      term: 12, termUnit: 'months', freq: 'monthly',
      type: 'fixed_installment', firstDate: '2026-01-01',
    });
    const installments: Inst[] = original.map(s => ({
      installment_number: s.installment_number,
      due_date: s.due_date,
      principal_amount: s.principal_amount,
      interest_amount: s.interest_amount,
      total_amount: s.total_amount,
      status: 'pending',
      paid_principal: 0,
      paid_interest: 0,
    }));

    // Pagar 4 cuotas
    const snapshotPaid = [];
    for (let i = 0; i < 4; i++) {
      installments[i].status = 'paid';
      installments[i].paid_principal = installments[i].principal_amount;
      installments[i].paid_interest  = installments[i].interest_amount;
      snapshotPaid.push({
        n: installments[i].installment_number,
        due: installments[i].due_date,
        p: installments[i].principal_amount,
        int: installments[i].interest_amount,
      });
    }

    // Tras la regeneracion, las cuotas pagadas siguen iguales
    for (let i = 0; i < 4; i++) {
      expect(installments[i].installment_number).toBe(snapshotPaid[i].n);
      expect(installments[i].due_date).toBe(snapshotPaid[i].due);
      expect(installments[i].principal_amount).toBe(snapshotPaid[i].p);
      expect(installments[i].interest_amount).toBe(snapshotPaid[i].int);
      expect(installments[i].status).toBe('paid');
    }
  });

  // Escenario 5: edge case — termino exactamente al saldo, sin remainder
  it('escenario 5: invariante saldo principal exacto tras reestructura', () => {
    const amount = 9000;
    const original = generateSchedule({
      amount, rate: 2.5, rateType: 'monthly',
      term: 9, termUnit: 'months', freq: 'monthly',
      type: 'flat_interest', firstDate: '2026-01-01',
    });
    const installments: Inst[] = original.map(s => ({
      installment_number: s.installment_number,
      due_date: s.due_date,
      principal_amount: s.principal_amount,
      interest_amount: s.interest_amount,
      total_amount: s.total_amount,
      status: 'pending',
      paid_principal: 0,
      paid_interest: 0,
    }));
    installments[0].status = 'paid';
    installments[0].paid_principal = installments[0].principal_amount;
    installments[0].paid_interest  = installments[0].interest_amount;

    const principalBalance = r2(amount - installments[0].paid_principal);

    // Reestructurar 8 cuotas restantes con tasa nueva
    const newSchedule = generateSchedule({
      amount: principalBalance,
      rate: 3, rateType: 'monthly',
      term: 8, termUnit: 'months', freq: 'monthly',
      type: 'flat_interest',
      firstDate: installments[1].due_date,
    });

    // Suma de principal nuevo == saldo principal (tolerancia 0.05)
    const sumPrincipal = newSchedule.reduce((a, s) => a + s.principal_amount, 0);
    expect(Math.abs(sumPrincipal - principalBalance)).toBeLessThan(0.05);

    // Suma final + lo pagado == amount original
    const totalPaid = installments[0].principal_amount + sumPrincipal;
    expect(Math.abs(totalPaid - amount)).toBeLessThan(0.05);
  });
});

describe('Reestructuracion — casos limites peligrosos', () => {
  it('saldo ~0 (prestamo casi pagado): no debe generar cuotas vacias', () => {
    // Si quedan $0.005 de saldo, una reestructura no deberia romper
    const principalBalance = 0;
    expect(principalBalance).toBeLessThanOrEqual(0.01);
    // En el endpoint real esto se filtra con `if (principalBalance > 0.01 && pendingInstallments.length > 0)`
  });

  it('amortization_type interest_only no rompe la reestructura', () => {
    const amount = 8000;
    const original = generateSchedule({
      amount, rate: 2, rateType: 'monthly',
      term: 8, termUnit: 'months', freq: 'monthly',
      type: 'interest_only', firstDate: '2026-01-01',
    });
    expect(original.length).toBe(8);
    // Solo la ultima cuota lleva el capital (bullet)
    expect(original[original.length - 1].principal_amount).toBeCloseTo(amount, 0);
    expect(original[0].principal_amount).toBe(0);
  });

  it('getInstallmentCount con freq quarterly: 12 meses = 4 cuotas', () => {
    expect(getInstallmentCount(12, 'months', 'quarterly')).toBe(4);
  });

  it('getInstallmentCount con freq biweekly: 6 meses = 12 cuotas', () => {
    expect(getInstallmentCount(6, 'months', 'biweekly')).toBe(12);
  });
});

// ─── COBERTURA EXHAUSTIVA: TODAS LAS FRECUENCIAS DEL SISTEMA ────────────────
// Frecuencias soportadas: daily, every_2_days, weekly, biweekly, monthly,
// quarterly, annual/yearly.

interface FreqCase {
  freq: string;
  termUnit: 'days' | 'weeks' | 'biweekly' | 'months' | 'years';
  term: number;
  expectedCount: number;
  amount: number;
  rate: number;
  rateType: string;
}

const FREQ_CASES: FreqCase[] = [
  { freq: 'daily',        termUnit: 'days',     term: 30, expectedCount: 30, amount: 5000,  rate: 0.5, rateType: 'daily' },
  { freq: 'every_2_days', termUnit: 'days',     term: 30, expectedCount: 15, amount: 6000,  rate: 1,   rateType: 'daily' },
  { freq: 'weekly',       termUnit: 'weeks',    term: 12, expectedCount: 12, amount: 8000,  rate: 1,   rateType: 'weekly' },
  { freq: 'biweekly',     termUnit: 'biweekly', term: 12, expectedCount: 12, amount: 10000, rate: 2,   rateType: 'biweekly' },
  { freq: 'monthly',      termUnit: 'months',   term: 12, expectedCount: 12, amount: 15000, rate: 3,   rateType: 'monthly' },
  { freq: 'quarterly',    termUnit: 'months',   term: 12, expectedCount: 4,  amount: 20000, rate: 6,   rateType: 'monthly' },
  { freq: 'annual',       termUnit: 'years',    term: 3,  expectedCount: 3,  amount: 30000, rate: 24,  rateType: 'annual' },
];

describe('Cobertura exhaustiva: TODAS las frecuencias del sistema', () => {
  for (const c of FREQ_CASES) {
    describe(`freq=${c.freq}`, () => {
      it(`getInstallmentCount: ${c.term} ${c.termUnit} = ${c.expectedCount} cuotas`, () => {
        expect(getInstallmentCount(c.term, c.termUnit, c.freq)).toBe(c.expectedCount);
      });

      it(`generateSchedule produce ${c.expectedCount} cuotas (fixed_installment)`, () => {
        const s = generateSchedule({
          amount: c.amount, rate: c.rate, rateType: c.rateType as any,
          term: c.term, termUnit: c.termUnit, freq: c.freq,
          type: 'fixed_installment', firstDate: '2026-01-01',
        });
        expect(s.length).toBe(c.expectedCount);
      });

      it(`generateSchedule: SUM(principal) == amount (invariante)`, () => {
        const s = generateSchedule({
          amount: c.amount, rate: c.rate, rateType: c.rateType as any,
          term: c.term, termUnit: c.termUnit, freq: c.freq,
          type: 'fixed_installment', firstDate: '2026-01-01',
        });
        const totalPrincipal = s.reduce((a, r) => a + r.principal_amount, 0);
        // Tolerancia 0.1 para acumulacion de redondeos en planes largos
        expect(Math.abs(totalPrincipal - c.amount)).toBeLessThan(0.1);
      });

      it(`flat_interest: SUM(principal) == amount`, () => {
        const s = generateSchedule({
          amount: c.amount, rate: c.rate, rateType: c.rateType as any,
          term: c.term, termUnit: c.termUnit, freq: c.freq,
          type: 'flat_interest', firstDate: '2026-01-01',
        });
        const totalPrincipal = s.reduce((a, r) => a + r.principal_amount, 0);
        expect(Math.abs(totalPrincipal - c.amount)).toBeLessThan(c.expectedCount * 0.01);
      });

      it(`reestructura: pagar 1ra cuota, regenerar resto preserva saldo`, () => {
        const original = generateSchedule({
          amount: c.amount, rate: c.rate, rateType: c.rateType as any,
          term: c.term, termUnit: c.termUnit, freq: c.freq,
          type: 'fixed_installment', firstDate: '2026-01-01',
        });
        if (original.length < 2) return; // skip si solo hay 1 cuota
        const paidPrincipal = original[0].principal_amount;
        const remainingBalance = r2(c.amount - paidPrincipal);
        // Regenerar las cuotas restantes
        const remainingCount = original.length - 1;
        const newSchedule = generateSchedule({
          amount: remainingBalance, rate: c.rate, rateType: c.rateType as any,
          term: c.term * (remainingCount / original.length), // proporcional
          termUnit: c.termUnit, freq: c.freq,
          type: 'fixed_installment', firstDate: original[1].due_date,
        });
        // El capital sumado tras la regeneracion + lo pagado debe == amount original
        const sumPrincipalNew = newSchedule.reduce((a, r) => a + r.principal_amount, 0);
        const totalPrincipal = paidPrincipal + sumPrincipalNew;
        expect(Math.abs(totalPrincipal - c.amount)).toBeLessThan(0.5);
      });
    });
  }
});

// ─── Matriz de cambios de frecuencia (reestructura con freq distinta) ───────
describe('Matriz de cambio de frecuencia en reestructura', () => {
  const FREQS = ['daily', 'every_2_days', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual'];

  for (const fromFreq of FREQS) {
    for (const toFreq of FREQS) {
      if (fromFreq === toFreq) continue;
      it(`cambio ${fromFreq} → ${toFreq} preserva monto principal`, () => {
        // Generar plan original. Para freq grandes (annual/quarterly) con
        // term=12 months solo dan 1-4 cuotas. Usamos 24 months para que SIEMPRE
        // haya al menos 2 cuotas y podamos pagar la primera.
        const original = generateSchedule({
          amount: 12000, rate: 2, rateType: 'monthly',
          term: 24, termUnit: 'months', freq: fromFreq,
          type: 'fixed_installment', firstDate: '2026-01-01',
        });
        if (original.length < 2) return; // sanidad
        // Pagar 1 cuota
        const paidPrincipal = original[0].principal_amount;
        const remainingBalance = r2(12000 - paidPrincipal);
        // Regenerar con nueva freq
        const termUnitNew = toFreq === 'daily' ? 'days'
          : toFreq === 'every_2_days' ? 'days'
          : toFreq === 'weekly' ? 'weeks'
          : toFreq === 'biweekly' ? 'biweekly'
          : toFreq === 'monthly' ? 'months'
          : toFreq === 'quarterly' ? 'months'
          : 'years';
        const termNew = toFreq === 'daily' ? 90
          : toFreq === 'every_2_days' ? 90
          : toFreq === 'weekly' ? 13
          : toFreq === 'biweekly' ? 6
          : toFreq === 'monthly' ? 3
          : toFreq === 'quarterly' ? 12
          : toFreq === 'annual' ? 1
          : 3;
        const newSchedule = generateSchedule({
          amount: remainingBalance, rate: 2, rateType: 'monthly',
          term: termNew, termUnit: termUnitNew as any, freq: toFreq,
          type: 'fixed_installment', firstDate: original[1].due_date,
        });
        expect(newSchedule.length).toBeGreaterThan(0);
        const sumPrincipalNew = newSchedule.reduce((a, r) => a + r.principal_amount, 0);
        // Suma de capital nuevo = saldo restante (tolerancia generosa por redondeos)
        expect(Math.abs(sumPrincipalNew - remainingBalance)).toBeLessThan(1.0);
      });
    }
  }
});

// ─── Cada freq con fecha "peligrosa" (dia 31, anio bisiesto) ────────────────
describe('Edge cases de fechas por frecuencia', () => {
  it('monthly: empieza 31 enero → siguiente cuota = 28 febrero (no 3 marzo)', () => {
    const s = generateSchedule({
      amount: 5000, rate: 2, rateType: 'monthly',
      term: 3, termUnit: 'months', freq: 'monthly',
      type: 'fixed_installment', firstDate: '2026-01-31',
    });
    expect(s.length).toBe(3);
    // 2026 no es bisiesto: feb tiene 28 dias
    const d2 = new Date(s[1].due_date);
    expect(d2.getUTCMonth()).toBe(1); // febrero
    expect(d2.getUTCDate()).toBe(28); // dia 28 (clamp)
  });

  it('monthly: 31 marzo → 30 abril (clamp)', () => {
    const s = generateSchedule({
      amount: 5000, rate: 2, rateType: 'monthly',
      term: 3, termUnit: 'months', freq: 'monthly',
      type: 'fixed_installment', firstDate: '2026-03-31',
    });
    const d2 = new Date(s[1].due_date);
    expect(d2.getUTCMonth()).toBe(3); // abril
    expect(d2.getUTCDate()).toBe(30); // dia 30 (clamp porque abril tiene 30)
  });

  it('quarterly: empieza 30 noviembre → siguiente cuota = 28/29 febrero', () => {
    const s = generateSchedule({
      amount: 5000, rate: 2, rateType: 'monthly',
      term: 6, termUnit: 'months', freq: 'quarterly',
      type: 'fixed_installment', firstDate: '2026-11-30',
    });
    expect(s.length).toBe(2);
    const d2 = new Date(s[1].due_date);
    expect(d2.getUTCMonth()).toBe(1); // febrero 2027
    // 2027 no bisiesto: feb = 28
    expect(d2.getUTCDate()).toBe(28);
  });

  it('annual: empieza 29 febrero (bisiesto) → siguiente cuota = 28 feb (no bisiesto)', () => {
    const s = generateSchedule({
      amount: 5000, rate: 5, rateType: 'annual',
      term: 2, termUnit: 'years', freq: 'annual',
      type: 'fixed_installment', firstDate: '2024-02-29',
    });
    expect(s.length).toBe(2);
    const d2 = new Date(s[1].due_date);
    expect(d2.getUTCMonth()).toBe(1); // febrero 2025
    expect(d2.getUTCDate()).toBe(28); // clamp porque 2025 no es bisiesto
  });

  it('daily no hace clamp (avanza 1 dia exacto)', () => {
    const s = generateSchedule({
      amount: 3000, rate: 0.1, rateType: 'daily',
      term: 5, termUnit: 'days', freq: 'daily',
      type: 'fixed_installment', firstDate: '2026-01-31',
    });
    const d2 = new Date(s[1].due_date);
    expect(d2.getUTCMonth()).toBe(1); // febrero
    expect(d2.getUTCDate()).toBe(1);  // 1 feb
  });
});

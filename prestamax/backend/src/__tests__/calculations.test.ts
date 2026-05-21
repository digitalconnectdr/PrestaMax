import { describe, it, expect } from 'vitest';
import {
  r2,
  getNextDate,
  getInstallmentCount,
  generateSchedule,
  calcMora,
  calcInvestorLiquidation,
} from '../lib/calculations';

// ─── r2 (round to 2 decimals) ────────────────────────────────────────────────
describe('r2', () => {
  it('redondea a 2 decimales', () => {
    expect(r2(123.456)).toBe(123.46);
    expect(r2(123.454)).toBe(123.45);
    expect(r2(0.005)).toBe(0.01);
    expect(r2(0)).toBe(0);
  });
});

// ─── getNextDate ─────────────────────────────────────────────────────────────
describe('getNextDate', () => {
  const base = new Date('2026-01-15T00:00:00Z');
  it('monthly (default) suma 1 mes', () => {
    const next = getNextDate(base, 'monthly');
    expect(next.getUTCMonth()).toBe(1); // feb (0-indexed)
  });
  it('biweekly suma 15 días', () => {
    const next = getNextDate(base, 'biweekly');
    expect(next.getUTCDate()).toBe(30);
  });
  it('weekly suma 7 días', () => {
    const next = getNextDate(base, 'weekly');
    expect(next.getUTCDate()).toBe(22);
  });
  it('daily suma 1 día', () => {
    const next = getNextDate(base, 'daily');
    expect(next.getUTCDate()).toBe(16);
  });
  it('annual suma 1 año', () => {
    const next = getNextDate(base, 'annual');
    expect(next.getUTCFullYear()).toBe(2027);
  });
});

// ─── getInstallmentCount ─────────────────────────────────────────────────────
describe('getInstallmentCount', () => {
  it('caso directo: 12 meses con freq monthly = 12 cuotas', () => {
    expect(getInstallmentCount(12, 'months', 'monthly')).toBe(12);
  });
  it('caso directo: 6 quincenas con freq biweekly = 6 cuotas', () => {
    expect(getInstallmentCount(6, 'biweekly', 'biweekly')).toBe(6);
  });
  it('12 meses con freq biweekly = 24 cuotas', () => {
    expect(getInstallmentCount(12, 'months', 'biweekly')).toBe(24);
  });
  it('1 año con freq weekly ≈ 52 cuotas', () => {
    const n = getInstallmentCount(1, 'years', 'weekly');
    expect(n).toBeGreaterThanOrEqual(51);
    expect(n).toBeLessThanOrEqual(53);
  });
  it('mínimo siempre 1 cuota', () => {
    expect(getInstallmentCount(0, 'months', 'monthly')).toBe(1);
  });
});

// ─── generateSchedule ────────────────────────────────────────────────────────
describe('generateSchedule — fixed_installment (cuota fija/francés)', () => {
  it('préstamo 10000 a 12 cuotas monthly @ 2% mensual', () => {
    const schedule = generateSchedule({
      amount: 10000,
      rate: 2,
      rateType: 'monthly',
      term: 12,
      termUnit: 'months',
      freq: 'monthly',
      type: 'fixed_installment',
      firstDate: '2026-02-15',
    });
    expect(schedule).toHaveLength(12);
    // En sistema francés, cada cuota total es aprox la misma
    const totals = schedule.map(s => s.total_amount);
    const first  = totals[0];
    const middle = totals[5];
    expect(Math.abs(first - middle)).toBeLessThan(0.5); // cuota constante salvo redondeo
    // Suma de principals debe ser ~= monto del préstamo
    const sumPrincipal = schedule.reduce((s, r) => s + r.principal_amount, 0);
    expect(r2(sumPrincipal)).toBe(10000);
  });
});

describe('generateSchedule — flat_interest (interés simple)', () => {
  it('préstamo 12000 a 12 cuotas monthly @ 1% mensual', () => {
    const schedule = generateSchedule({
      amount: 12000,
      rate: 1,
      rateType: 'monthly',
      term: 12,
      termUnit: 'months',
      freq: 'monthly',
      type: 'flat_interest',
      firstDate: '2026-02-15',
    });
    expect(schedule).toHaveLength(12);
    // Interés constante (1% sobre 12000 cada mes = 120)
    schedule.forEach(s => expect(s.interest_amount).toBe(120));
    // Principal constante (12000/12 = 1000)
    schedule.forEach(s => expect(s.principal_amount).toBe(1000));
  });
});

describe('generateSchedule — interest_only (solo interés con bullet final)', () => {
  it('cuotas intermedias solo interés, última paga capital completo', () => {
    const schedule = generateSchedule({
      amount: 50000,
      rate: 2,
      rateType: 'monthly',
      term: 6,
      termUnit: 'months',
      freq: 'monthly',
      type: 'interest_only',
      firstDate: '2026-02-15',
    });
    expect(schedule).toHaveLength(6);
    // Primeras 5 cuotas: principal=0, interés=50000*0.02=1000
    for (let i = 0; i < 5; i++) {
      expect(schedule[i].principal_amount).toBe(0);
      expect(schedule[i].interest_amount).toBe(1000);
    }
    // Última cuota: principal=50000
    expect(schedule[5].principal_amount).toBe(50000);
  });
});

// ─── calcMora ────────────────────────────────────────────────────────────────
describe('calcMora — porcentaje diario', () => {
  it('sin cuotas vencidas devuelve 0', () => {
    const loan = { mora_rate_daily: 0.001, mora_grace_days: 0 };
    const inst = [
      { status: 'pending', due_date: '2026-12-31', principal_amount: 1000, interest_amount: 50 }
    ];
    expect(calcMora(loan, inst, new Date('2026-06-01'))).toBe(0);
  });

  it('cuota vencida 10 días con base cuota_vencida', () => {
    // Base = 1050 (cuota_vencida), 10 días, 0.001 = 0.1% diario => 1050 × 0.001 × 10 = 10.50
    const loan = { mora_rate_daily: 0.001, mora_grace_days: 0, mora_base: 'cuota_vencida' };
    const inst = [
      { status: 'pending', due_date: '2026-05-01', principal_amount: 1000, interest_amount: 50 }
    ];
    expect(calcMora(loan, inst, new Date('2026-05-11'))).toBe(10.5);
  });

  it('aplica grace_days correctamente', () => {
    // 10 días vencido, 3 días de gracia → solo 7 días penalizan
    const loan = { mora_rate_daily: 0.001, mora_grace_days: 3, mora_base: 'cuota_vencida' };
    const inst = [
      { status: 'pending', due_date: '2026-05-01', principal_amount: 1000, interest_amount: 50 }
    ];
    expect(calcMora(loan, inst, new Date('2026-05-11'))).toBe(7.35); // 1050 * 0.001 * 7
  });

  it('cuota pagada NO genera mora', () => {
    const loan = { mora_rate_daily: 0.001, mora_grace_days: 0 };
    const inst = [
      { status: 'paid', due_date: '2026-05-01', principal_amount: 1000, interest_amount: 50 }
    ];
    expect(calcMora(loan, inst, new Date('2026-05-30'))).toBe(0);
  });

  it('modo fixed: cargo fijo por cuota vencida', () => {
    const loan = { mora_fixed_enabled: true, mora_fixed_amount: 500, mora_grace_days: 0 };
    const inst = [
      { status: 'pending', due_date: '2026-05-01', principal_amount: 1000, interest_amount: 50 },
      { status: 'pending', due_date: '2026-05-15', principal_amount: 1000, interest_amount: 50 },
    ];
    // 2 cuotas vencidas × $500 = $1000
    expect(calcMora(loan, inst, new Date('2026-05-30'))).toBe(1000);
  });
});

// ─── calcInvestorLiquidation ─────────────────────────────────────────────────
describe('calcInvestorLiquidation — equity model', () => {
  it('cobra el % comisión del bruto', () => {
    const r = calcInvestorLiquidation({
      modelType: 'equity',
      grossInterest: 5000,
      grossMora: 200,
      commissionPercent: 10,
    });
    expect(r.grossTotal).toBe(5200);
    expect(r.commissionAmount).toBe(520);
    expect(r.netToInvestor).toBe(4680);
  });

  it('sin pagos cobrados, neto es 0', () => {
    const r = calcInvestorLiquidation({
      modelType: 'equity',
      grossInterest: 0,
      grossMora: 0,
      commissionPercent: 10,
    });
    expect(r.netToInvestor).toBe(0);
  });

  it('comisión 0% → neto = bruto', () => {
    const r = calcInvestorLiquidation({
      modelType: 'equity',
      grossInterest: 1000,
      grossMora: 0,
      commissionPercent: 0,
    });
    expect(r.netToInvestor).toBe(1000);
  });
});

describe('calcInvestorLiquidation — fixed_rate model', () => {
  it('100000 capital × 3% mensual × 30 días = ~3000', () => {
    const r = calcInvestorLiquidation({
      modelType: 'fixed_rate',
      capitalContributed: 100000,
      fixedRateMonthly: 3,
      fromDate: '2026-04-15',
      toDate: '2026-05-15',
    });
    // 30 días / 30.44 días/mes ≈ 0.985 meses
    // 100000 * 0.03 * 0.985 ≈ 2956
    expect(r.netToInvestor).toBeGreaterThan(2900);
    expect(r.netToInvestor).toBeLessThan(3010);
    expect(r.commissionAmount).toBe(0); // sin comisión en fixed_rate
  });

  it('60 días ≈ 2 meses, así que ~6000', () => {
    const r = calcInvestorLiquidation({
      modelType: 'fixed_rate',
      capitalContributed: 100000,
      fixedRateMonthly: 3,
      fromDate: '2026-03-15',
      toDate: '2026-05-14', // 60 días
    });
    expect(r.netToInvestor).toBeGreaterThan(5800);
    expect(r.netToInvestor).toBeLessThan(6100);
  });

  it('fixed_rate IGNORA gross_interest/gross_mora del periodo', () => {
    const r = calcInvestorLiquidation({
      modelType: 'fixed_rate',
      grossInterest: 99999, // se ignora
      grossMora: 99999,     // se ignora
      capitalContributed: 50000,
      fixedRateMonthly: 2,
      fromDate: '2026-04-15',
      toDate: '2026-05-15',
    });
    // Solo depende del capital × tasa × tiempo, no de gross
    expect(r.netToInvestor).toBeGreaterThan(900);
    expect(r.netToInvestor).toBeLessThan(1100);
  });

  it('capital 0 → neto 0', () => {
    const r = calcInvestorLiquidation({
      modelType: 'fixed_rate',
      capitalContributed: 0,
      fixedRateMonthly: 10,
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    });
    expect(r.netToInvestor).toBe(0);
  });
});

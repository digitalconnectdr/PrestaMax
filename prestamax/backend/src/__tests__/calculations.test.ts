import { describe, it, expect } from 'vitest';
import {
  r2,
  getNextDate,
  getInstallmentCount,
  generateSchedule,
  calcMora,
  calcInvestorLiquidation,
  getRatePerInstallment,
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


// ─── getRatePerInstallment (NUEVO HELPER) ────────────────────────────────────
describe('getRatePerInstallment', () => {
  it('mensual + mensual: tasa directa', () => {
    expect(getRatePerInstallment(5, 'monthly', 'monthly')).toBeCloseTo(0.05, 5);
  });
  it('annual + mensual: divide entre 12', () => {
    expect(getRatePerInstallment(60, 'annual', 'monthly')).toBeCloseTo(0.05, 5);
  });
  it('daily + daily: tasa directa', () => {
    expect(getRatePerInstallment(1, 'daily', 'daily')).toBeCloseTo(0.01, 5);
  });
  it('weekly + weekly: tasa directa', () => {
    expect(getRatePerInstallment(2, 'weekly', 'weekly')).toBeCloseTo(0.02, 5);
  });
  it('mensual + diario: convierte', () => {
    // 5% mensual -> 60% anual -> /365 = 0.164% por dia
    expect(getRatePerInstallment(5, 'monthly', 'daily')).toBeCloseTo(0.001644, 4);
  });
});

// ─── generateSchedule con frecuencia NO mensual ──────────────────────────────
describe('generateSchedule — frecuencia DIARIA', () => {
  it('1% diario, 30 cuotas diarias, flat_interest: 130 pesos interes por dia (en 10k)', () => {
    const s = generateSchedule({
      amount: 10000, rate: 1, rateType: 'daily', term: 30, termUnit: 'days',
      freq: 'daily', type: 'flat_interest', firstDate: '2026-01-01',
    });
    expect(s.length).toBe(30);
    // Cada cuota: capital 333.33 + interes 100 = 433.33
    expect(s[0].interest_amount).toBeCloseTo(100, 1);
    expect(s[0].principal_amount).toBeCloseTo(333.33, 1);
  });

  it('1% diario, 30 dias, fixed_installment (amortizable): ~387/cuota', () => {
    const s = generateSchedule({
      amount: 10000, rate: 1, rateType: 'daily', term: 30, termUnit: 'days',
      freq: 'daily', type: 'fixed_installment', firstDate: '2026-01-01',
    });
    expect(s.length).toBe(30);
    // PMT(10000, 0.01, 30) ≈ 387.48
    expect(s[0].total_amount).toBeCloseTo(387.48, 0);
  });
});

describe('generateSchedule — frecuencia QUINCENAL', () => {
  it('2.5% quincenal, 24 quincenas, flat_interest: 250 interes por cuota (en 10k)', () => {
    const s = generateSchedule({
      amount: 10000, rate: 2.5, rateType: 'biweekly', term: 24, termUnit: 'biweekly',
      freq: 'biweekly', type: 'flat_interest', firstDate: '2026-01-01',
    });
    expect(s.length).toBe(24);
    // Cada cuota: 416.67 capital + 250 interes
    expect(s[0].interest_amount).toBeCloseTo(250, 1);
    expect(s[0].principal_amount).toBeCloseTo(416.67, 1);
  });
});

describe('generateSchedule — frecuencia SEMANAL', () => {
  it('1% semanal, 12 semanas, flat_interest', () => {
    const s = generateSchedule({
      amount: 10000, rate: 1, rateType: 'weekly', term: 12, termUnit: 'weeks',
      freq: 'weekly', type: 'flat_interest', firstDate: '2026-01-01',
    });
    expect(s.length).toBe(12);
    expect(s[0].interest_amount).toBeCloseTo(100, 1);
  });
});

describe('generateSchedule — frecuencia ANUAL', () => {
  it('20% anual, 1 ano, 1 cuota: pago total = principal + interest', () => {
    const s = generateSchedule({
      amount: 10000, rate: 20, rateType: 'annual', term: 1, termUnit: 'years',
      freq: 'annual', type: 'flat_interest', firstDate: '2026-01-01',
    });
    expect(s.length).toBe(1);
    // 20% anual sobre 10k = 2000 interes total
    expect(s[0].interest_amount).toBeCloseTo(2000, 1);
    expect(s[0].principal_amount).toBeCloseTo(10000, 1);
  });
});


// ─── TESTS NUEVOS (Jun 2026) — escenarios reales que causaron bugs ───────────

describe('generateSchedule — rateType DISTINTO de freq (escenarios reales)', () => {
  it('tasa MENSUAL 5% con freq DIARIA, 30 cuotas — bug previo daba ~650/cuota', () => {
    // Bug previo: disburse usaba inline schedule que ignoraba freq y trataba
    // rate como simple porcentaje, generando cuotas casi 2x demasiado caras.
    const s = generateSchedule({
      amount: 10000, rate: 5, rateType: 'monthly', term: 30, termUnit: 'days',
      freq: 'daily', type: 'fixed_installment', firstDate: '2026-01-01',
    });
    expect(s.length).toBe(30);
    // Suma total ~ 10342 (10k + ~342 interés total con tasa diaria efectiva ≈ 0.164%)
    const total = s.reduce((a, r) => a + r.principal_amount + r.interest_amount, 0);
    // No debe pasar de ~10500 (caso de bug daba ~19500)
    expect(total).toBeLessThan(10600);
    expect(total).toBeGreaterThan(10100);
  });

  it('tasa ANUAL 24% con freq MENSUAL = tasa efectiva 2%/cuota', () => {
    const s = generateSchedule({
      amount: 12000, rate: 24, rateType: 'annual', term: 12, termUnit: 'months',
      freq: 'monthly', type: 'flat_interest', firstDate: '2026-01-01',
    });
    expect(s.length).toBe(12);
    // 24% anual -> 2% mensual. 12000 * 0.02 = 240/mes interés
    expect(s[0].interest_amount).toBeCloseTo(240, 0);
  });

  it('tasa DIARIA 0.5% con freq SEMANAL = tasa efectiva 3.5%/semana aprox', () => {
    const s = generateSchedule({
      amount: 5000, rate: 0.5, rateType: 'daily', term: 8, termUnit: 'weeks',
      freq: 'weekly', type: 'flat_interest', firstDate: '2026-01-01',
    });
    expect(s.length).toBe(8);
    // 0.5% diario ~ 3.5% semanal (7 días). 5000 * 0.035 = 175
    expect(s[0].interest_amount).toBeGreaterThan(150);
    expect(s[0].interest_amount).toBeLessThan(200);
  });
});

describe('calcMora — mora_start_date', () => {
  it('si mora_start_date > due_date, mora se cuenta desde mora_start_date', () => {
    // Cuota vencida hace 60 días, pero el cliente acordó empezar mora hace solo 10
    const dueDate = new Date('2026-04-01').toISOString().slice(0,10);
    const moraStart = new Date('2026-05-25').toISOString().slice(0,10);
    const asOf = new Date('2026-06-05');
    const loan = {
      mora_base: 'cuota_vencida' as const,
      mora_rate_daily: 0.001, // 0.1%/día
      mora_grace_days: 0,
      mora_start_date: moraStart,
    };
    const installments = [{
      status: 'overdue',
      due_date: dueDate,
      principal_amount: 1000,
      interest_amount: 0,
      paid_total: 0,
    }];
    const mora = calcMora(loan, installments, asOf);
    // Días desde moraStart hasta asOf: 11 días (25 may al 5 jun)
    // 1000 * 0.001 * 11 = 11
    expect(mora).toBeCloseTo(11, 0);
  });

  it('si mora_start_date < due_date, mora se cuenta desde due_date (no antes)', () => {
    const dueDate = '2026-05-15';
    const moraStart = '2026-01-01'; // muy temprano
    const asOf = new Date('2026-05-25');
    const loan = {
      mora_base: 'cuota_vencida' as const,
      mora_rate_daily: 0.001,
      mora_grace_days: 0,
      mora_start_date: moraStart,
    };
    const installments = [{
      status: 'overdue',
      due_date: dueDate,
      principal_amount: 1000,
      interest_amount: 0,
      paid_total: 0,
    }];
    const mora = calcMora(loan, installments, asOf);
    // Solo 10 días vencidos: 1000 * 0.001 * 10 = 10
    expect(mora).toBeCloseTo(10, 0);
  });

  it('mora_start_date null: comportamiento clásico (desde due_date)', () => {
    const loan = {
      mora_base: 'cuota_vencida' as const,
      mora_rate_daily: 0.001,
      mora_grace_days: 0,
      mora_start_date: null,
    };
    const installments = [{
      status: 'overdue',
      due_date: '2026-05-15',
      principal_amount: 2000,
      interest_amount: 0,
      paid_total: 0,
    }];
    const mora = calcMora(loan, installments, new Date('2026-06-04'));
    // 20 días * 0.001 * 2000 = 40
    expect(mora).toBeCloseTo(40, 0);
  });

  it('cuota PAGADA no genera mora aunque mora_start_date sea reciente', () => {
    const loan = {
      mora_base: 'cuota_vencida' as const,
      mora_rate_daily: 0.001,
      mora_grace_days: 0,
      mora_start_date: '2026-05-01',
    };
    const installments = [{
      status: 'paid',
      due_date: '2026-04-15',
      principal_amount: 1000,
      interest_amount: 50,
      paid_total: 1050,
    }];
    const mora = calcMora(loan, installments, new Date('2026-06-05'));
    expect(mora).toBe(0);
  });

  it('mora respeta días de gracia incluso con mora_start_date', () => {
    const loan = {
      mora_base: 'cuota_vencida' as const,
      mora_rate_daily: 0.001,
      mora_grace_days: 5, // 5 días gracia
      mora_start_date: '2026-05-01',
    };
    const installments = [{
      status: 'overdue',
      due_date: '2026-04-15',
      principal_amount: 1000,
      interest_amount: 0,
      paid_total: 0,
    }];
    // asOf = 2026-05-03 → 2 días desde moraStart → con gracia 5 = 0 días de mora
    const m1 = calcMora(loan, installments, new Date('2026-05-03'));
    expect(m1).toBe(0);
    // asOf = 2026-05-10 → 9 días desde moraStart → con gracia 5 = 4 días de mora
    const m2 = calcMora(loan, installments, new Date('2026-05-10'));
    expect(m2).toBeCloseTo(1000 * 0.001 * 4, 1);
  });
});

describe('getRatePerInstallment — conversiones cruzadas adicionales', () => {
  it('mensual 30% -> diaria (cuotas diarias) ≈ 0.986%/día', () => {
    // 30%/mes / 30.4375 días/mes ≈ 0.986%
    const r = getRatePerInstallment(30, 'monthly', 'daily');
    expect(r).toBeCloseTo(0.00986, 4);
  });
  it('anual 12% -> mensual = 1%/mes', () => {
    const r = getRatePerInstallment(12, 'annual', 'monthly');
    expect(r).toBeCloseTo(0.01, 5);
  });
  it('diaria 0.1% -> mensual = ~3.04%', () => {
    const r = getRatePerInstallment(0.1, 'daily', 'monthly');
    expect(r).toBeCloseTo(0.001 * 30.4375, 4);
  });
  it('semanal 2% -> quincenal = 4% (via anualizacion 52->26)', () => {
    const r = getRatePerInstallment(2, 'weekly', 'biweekly');
    // 2%/semana * 52 semanas/ano = 104% anual / 26 quincenas = 4%/quincena
    expect(r).toBeCloseTo(0.04, 5);
  });
});

describe('Invariantes de generateSchedule — fixed_installment cuotas constantes', () => {
  it('todas las cuotas tienen el mismo total (cuota fija)', () => {
    const s = generateSchedule({
      amount: 50000, rate: 2, rateType: 'monthly', term: 24, termUnit: 'months',
      freq: 'monthly', type: 'fixed_installment', firstDate: '2026-01-01',
    });
    expect(s.length).toBe(24);
    const totales = s.map(r => r2(r.principal_amount + r.interest_amount));
    // Todas las cuotas excepto quizás la última deben ser iguales (±0.05)
    for (let i = 1; i < s.length - 1; i++) {
      expect(Math.abs(totales[i] - totales[0])).toBeLessThan(0.05);
    }
  });

  it('suma de principal == amount (no over/under amortization)', () => {
    const amount = 75000;
    const s = generateSchedule({
      amount, rate: 1.5, rateType: 'monthly', term: 18, termUnit: 'months',
      freq: 'monthly', type: 'fixed_installment', firstDate: '2026-01-01',
    });
    const totalPrincipal = s.reduce((a, r) => a + r.principal_amount, 0);
    expect(totalPrincipal).toBeCloseTo(amount, 0);
  });
});

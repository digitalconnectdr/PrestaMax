// ─── PrestaMax — funciones financieras puras (testables) ─────────────────────
// Exporta los cálculos clave en un único lugar para que sean reutilizables
// desde routes y testeables sin levantar el servidor.

export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Date helper: siguiente fecha según frecuencia de pago ───────────────────
export function getNextDate(d: Date, freq: string): Date {
  const nd = new Date(d);
  if (freq === 'daily')             nd.setDate(nd.getDate() + 1);
  else if (freq === 'every_2_days') nd.setDate(nd.getDate() + 2);
  else if (freq === 'weekly')       nd.setDate(nd.getDate() + 7);
  else if (freq === 'biweekly')     nd.setDate(nd.getDate() + 15);
  else if (freq === 'quarterly')    nd.setMonth(nd.getMonth() + 3);
  else if (freq === 'annual' || freq === 'yearly') nd.setFullYear(nd.getFullYear() + 1);
  else                              nd.setMonth(nd.getMonth() + 1); // monthly
  return nd;
}

// ─── Conversión de plazo a número de cuotas ──────────────────────────────────
// term puede venir en months/weeks/biweekly/days/years; freq es la cadencia.
export function getInstallmentCount(term: number, termUnit: string, freq: string): number {
  // Caso directo: mismas unidades
  if (
    (termUnit === 'months'   && freq === 'monthly')  ||
    (termUnit === 'biweekly' && freq === 'biweekly') ||
    (termUnit === 'weeks'    && freq === 'weekly')   ||
    (termUnit === 'days'     && freq === 'daily')
  ) return Math.max(1, Math.round(term));

  // Convertir term a meses
  let months: number;
  if      (termUnit === 'months')   months = term;
  else if (termUnit === 'years')    months = term * 12;
  else if (termUnit === 'biweekly') months = term / 2;
  else if (termUnit === 'weeks')    months = term / 4.33;
  else if (termUnit === 'days')     months = term / 30;
  else                              months = term;

  // Convertir meses a cuotas según freq
  let n: number;
  if      (freq === 'daily')        n = months * 30;
  else if (freq === 'every_2_days') n = months * 15;
  else if (freq === 'weekly')       n = months * 4.33;
  else if (freq === 'biweekly')     n = months * 2;
  else if (freq === 'quarterly')    n = months / 3;
  else if (freq === 'annual' || freq === 'yearly') n = months / 12;
  else                              n = months;

  return Math.max(1, Math.round(n));
}

// ─── Plan de pagos (schedule) ────────────────────────────────────────────────
export interface ScheduleParams {
  amount: number;
  rate: number;
  rateType: 'monthly' | 'daily' | 'weekly' | 'biweekly' | 'annual';
  term: number;
  termUnit: 'months' | 'biweekly' | 'weeks' | 'days' | 'years';
  freq: string;
  type: 'fixed_installment' | 'flat_interest' | 'interest_only' | string;
  firstDate: string | Date;
}

export interface ScheduleRow {
  installment_number: number;
  due_date: string;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  status: string;
}

export function generateSchedule(params: ScheduleParams): ScheduleRow[] {
  const { amount, rate, rateType, term, termUnit, freq, type, firstDate } = params;
  // Convertir tasa a tasa por periodo del schedule
  const mRate =
    rateType === 'daily'    ? (rate / 100) * 30
    : rateType === 'weekly' ? (rate / 100) * 4.33
    : rateType === 'biweekly' ? (rate / 100) * 2
    : rateType === 'annual' ? (rate / 100) / 12
    : (rate / 100);

  const n = getInstallmentCount(term, termUnit, freq);
  const schedule: ScheduleRow[] = [];
  let balance = amount;
  let currentDate = new Date(firstDate);
  const fixedPayment = mRate > 0
    ? amount * (mRate * Math.pow(1 + mRate, n)) / (Math.pow(1 + mRate, n) - 1)
    : amount / n;

  for (let i = 1; i <= n; i++) {
    let principal = 0, interest = 0;
    if (type === 'fixed_installment') {
      interest  = r2(balance * mRate);
      principal = i === n ? r2(balance) : r2(fixedPayment - interest);
    } else if (type === 'flat_interest') {
      interest  = r2(amount * mRate);
      principal = r2(amount / n);
    } else if (type === 'interest_only') {
      interest  = r2(balance * mRate);
      principal = i === n ? r2(balance) : 0;
    } else {
      interest  = r2(balance * mRate);
      principal = r2(amount / n);
    }
    principal = Math.max(0, Math.min(principal, balance));
    balance   = r2(balance - principal);
    schedule.push({
      installment_number: i,
      due_date: currentDate.toISOString(),
      principal_amount: principal,
      interest_amount: interest,
      total_amount: r2(principal + interest),
      status: 'pending',
    });
    currentDate = getNextDate(currentDate, freq);
    if (Math.abs(balance) < 0.01) break;
  }
  return schedule;
}

// ─── Cálculo de mora ─────────────────────────────────────────────────────────
export interface MoraLoanConfig {
  mora_base?: string;            // 'cuota_vencida' | 'capital_pendiente' | 'capital_vencido'
  mora_fixed_enabled?: boolean | number;
  mora_fixed_amount?: number;
  mora_rate_daily?: number;       // default 0.001 (0.1%)
  mora_grace_days?: number;
}

export interface MoraInstallment {
  status: string;
  due_date: string;
  deferred_due_date?: string | null;
  principal_amount: number;
  interest_amount: number;
  paid_total?: number;
  paid_principal?: number;
}

export function calcMora(loan: MoraLoanConfig, installments: MoraInstallment[], asOf: Date): number {
  const base     = loan.mora_base || 'cuota_vencida';
  const useFixed = !!loan.mora_fixed_enabled;
  const fixedAmt = loan.mora_fixed_amount || 0;
  let total = 0;
  for (const inst of installments) {
    if (inst.status === 'paid' || inst.status === 'waived') continue;
    const effectiveDue = inst.deferred_due_date
      ? new Date(inst.deferred_due_date)
      : new Date(inst.due_date);
    const days     = Math.max(0, Math.floor((asOf.getTime() - effectiveDue.getTime()) / 86400000));
    const moraDays = Math.max(0, days - (loan.mora_grace_days || 0));
    if (moraDays > 0) {
      if (useFixed) {
        total += fixedAmt;
      } else {
        let baseAmount = 0;
        if (base === 'cuota_vencida') {
          baseAmount = r2((inst.principal_amount + inst.interest_amount) - (inst.paid_total || 0));
        } else {
          baseAmount = r2((inst.principal_amount || 0) - (inst.paid_principal || 0));
        }
        total += Math.max(0, baseAmount) * (loan.mora_rate_daily || 0.001) * moraDays;
      }
    }
  }
  return r2(total);
}

// ─── Liquidación al inversionista (dual: fixed_rate vs equity) ───────────────
export interface InvestorLiquidationParams {
  modelType: 'fixed_rate' | 'equity';
  // equity:
  grossInterest?: number;
  grossMora?: number;
  commissionPercent?: number;
  // fixed_rate:
  capitalContributed?: number;
  fixedRateMonthly?: number;
  fromDate?: string;
  toDate?: string;
}

export interface InvestorLiquidationResult {
  grossTotal: number;
  commissionAmount: number;
  netToInvestor: number;
  monthsInPeriod: number;
}

export function calcInvestorLiquidation(params: InvestorLiquidationParams): InvestorLiquidationResult {
  const grossInterest = params.grossInterest || 0;
  const grossMora     = params.grossMora || 0;
  const grossTotal    = r2(grossInterest + grossMora);
  let monthsInPeriod  = 0;

  if (params.modelType === 'fixed_rate') {
    const cap   = params.capitalContributed || 0;
    const rate  = params.fixedRateMonthly || 0;
    if (params.fromDate && params.toDate) {
      const msDiff = new Date(params.toDate).getTime() - new Date(params.fromDate).getTime();
      monthsInPeriod = Math.max(0, msDiff / (1000 * 60 * 60 * 24 * 30.44));
    }
    const net = r2(cap * (rate / 100) * monthsInPeriod);
    return { grossTotal, commissionAmount: 0, netToInvestor: net, monthsInPeriod };
  }

  // equity (default)
  const commPct = params.commissionPercent || 0;
  const comm    = r2(grossTotal * (commPct / 100));
  const net     = r2(grossTotal - comm);
  return { grossTotal, commissionAmount: comm, netToInvestor: net, monthsInPeriod: 0 };
}

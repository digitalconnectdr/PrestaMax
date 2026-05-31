import { addDays, addWeeks, addMonths, differenceInDays } from 'date-fns';

export function generateInstallmentSchedule(params: {
  disbursedAmount: number;
  rate: number;
  rateType: string;
  term: number;
  termUnit: string;
  frequency: string;
  amortizationType: string;
  firstPaymentDate: Date;
  disbursementFee?: number;
}) {
  const { disbursedAmount, rate, frequency, term, amortizationType, firstPaymentDate } = params;
  // Tasa correcta POR PERIODO de cuota (depende de rateType + frequency)
  const ratePerInstallment = getRatePerInstallment(rate, params.rateType, frequency);
  const installments = [];
  let balance = disbursedAmount;
  let currentDate = new Date(firstPaymentDate);
  const numInstallments = getInstallmentCount(term, params.termUnit, frequency);

  for (let i = 1; i <= numInstallments; i++) {
    let principal = 0;
    let interest = 0;

    if (amortizationType === 'fixed_installment') {
      const payment = calculateFixedPayment(disbursedAmount, ratePerInstallment, numInstallments);
      interest = balance * ratePerInstallment;
      principal = payment - interest;
      if (i === numInstallments) principal = balance;
    } else if (amortizationType === 'flat_interest') {
      const totalInterest = disbursedAmount * ratePerInstallment * numInstallments;
      principal = disbursedAmount / numInstallments;
      interest = totalInterest / numInstallments;
    } else if (amortizationType === 'interest_only') {
      interest = balance * ratePerInstallment;
      principal = i === numInstallments ? balance : 0;
    } else {
      interest = balance * ratePerInstallment;
      principal = disbursedAmount / numInstallments;
    }

    principal = Math.max(0, Math.min(principal, balance));
    balance -= principal;

    installments.push({
      installment_number: i,
      due_date: new Date(currentDate),
      principal_amount: round2(principal),
      interest_amount: round2(interest),
      total_amount: round2(principal + interest),
      status: 'pending'
    });

    currentDate = getNextDate(currentDate, frequency);
    if (Math.abs(balance) < 0.01) break;
  }

  return installments;
}

function calculateFixedPayment(principal: number, rate: number, n: number): number {
  if (rate === 0) return principal / n;
  return principal * (rate * Math.pow(1 + rate, n)) / (Math.pow(1 + rate, n) - 1);
}

// Convierte tasa input a tasa POR PERIODO de cuota.
// Esta es la unica forma matematicamente correcta cuando rateType y frequency difieren.
function getRatePerInstallment(rate: number, rateType: string, frequency: string): number {
  const yearly =
    rateType === 'daily'    ? rate * 365
    : rateType === 'weekly' ? rate * 52
    : rateType === 'biweekly' ? rate * 26
    : rateType === 'monthly' ? rate * 12
    : rateType === 'annual' ? rate
    : rate * 12;
  const installmentsPerYear =
    frequency === 'daily'     ? 365
    : frequency === 'weekly'  ? 52
    : frequency === 'biweekly' ? 26
    : frequency === 'monthly' ? 12
    : frequency === 'quarterly' ? 4
    : frequency === 'annual' || frequency === 'yearly' ? 1
    : 12;
  return (yearly / 100) / installmentsPerYear;
}

// LEGACY: mantengo getMonthlyRate por si lo usa alguna otra parte (no en uso interno).
function getMonthlyRate(rate: number, rateType: string): number {
  const r = rate / 100;
  switch (rateType) {
    case 'daily': return r * 30;
    case 'weekly': return r * 4.33;
    case 'biweekly': return r * 2;
    case 'monthly': return r;
    case 'annual': return r / 12;
    default: return r;
  }
}

function getInstallmentCount(term: number, termUnit: string, frequency: string): number {
  if (
    (termUnit === 'months'   && frequency === 'monthly')  ||
    (termUnit === 'biweekly' && frequency === 'biweekly') ||
    (termUnit === 'weeks'    && frequency === 'weekly')   ||
    (termUnit === 'days'     && frequency === 'daily')
  ) return Math.max(1, Math.round(term));

  let termInMonths: number;
  if      (termUnit === 'months')   termInMonths = term;
  else if (termUnit === 'years')    termInMonths = term * 12;
  else if (termUnit === 'biweekly') termInMonths = term / 2;
  else if (termUnit === 'weeks')    termInMonths = term / 4.33;
  else if (termUnit === 'days')     termInMonths = term / 30;
  else                              termInMonths = term;

  switch (frequency) {
    case 'daily':        return Math.max(1, Math.round(termInMonths * 30));
    case 'every_2_days': return Math.max(1, Math.round(termInMonths * 15));
    case 'weekly':       return Math.max(1, Math.round(termInMonths * 4.33));
    case 'biweekly':     return Math.max(1, Math.round(termInMonths * 2));
    case 'quarterly':    return Math.max(1, Math.round(termInMonths / 3));
    case 'annual':
    case 'yearly':       return Math.max(1, Math.round(termInMonths / 12));
    case 'monthly':      return Math.max(1, Math.round(termInMonths));
    default:             return Math.max(1, Math.round(termInMonths));
  }
}

function getNextDate(date: Date, frequency: string): Date {
  switch (frequency) {
    case 'daily': return addDays(date, 1);
    case 'every_2_days': return addDays(date, 2);
    case 'weekly': return addWeeks(date, 1);
    case 'biweekly': return addDays(date, 15);
    case 'monthly': return addMonths(date, 1);
    case 'quarterly': return addMonths(date, 3);
    case 'annual':
    case 'yearly': return addMonths(date, 12);
    default: return addMonths(date, 1);
  }
}

export function calculateMora(
  principalBalance: number,
  dueDate: Date,
  currentDate: Date,
  moraRateDaily: number,
  graceDays: number
): { moraAmount: number; moraDays: number } {
  const daysPast = differenceInDays(currentDate, dueDate);
  const moraDays = Math.max(0, daysPast - graceDays);
  const moraAmount = moraDays > 0 ? principalBalance * moraRateDaily * moraDays : 0;
  return { moraAmount: round2(moraAmount), moraDays };
}

export function calculateEarlyLiquidation(
  principalBalance: number,
  remainingInterest: number,
  rebatePolicy: string,
  rebateRate: number
): { rebateAmount: number; totalToPay: number } {
  let rebateAmount = 0;
  if (rebatePolicy === 'proportional') {
    rebateAmount = round2(remainingInterest);
  } else if (rebatePolicy === 'partial') {
    rebateAmount = round2(remainingInterest * 0.5);
  } else if (rebatePolicy === 'fixed_rate' && rebateRate > 0) {
    rebateAmount = round2(remainingInterest * rebateRate);
  }
  return { rebateAmount, totalToPay: round2(principalBalance - rebateAmount) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

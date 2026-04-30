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
  const monthlyRate = getMonthlyRate(rate, params.rateType);
  const installments = [];
  let balance = disbursedAmount;
  let currentDate = new Date(firstPaymentDate);
  const numInstallments = getInstallmentCount(term, params.termUnit, frequency);

  for (let i = 1; i <= numInstallments; i++) {
    let principal = 0;
    let interest = 0;

    if (amortizationType === 'fixed_installment') {
      const payment = calculateFixedPayment(disbursedAmount, monthlyRate, numInstallments);
      interest = balance * monthlyRate;
      principal = payment - interest;
      if (i === numInstallments) principal = balance; // final adjustment
    } else if (amortizationType === 'flat_interest') {
      const totalInterest = disbursedAmount * monthlyRate * numInstallments;
      principal = disbursedAmount / numInstallments;
      interest = totalInterest / numInstallments;
    } else if (amortizationType === 'interest_only') {
      interest = balance * monthlyRate;
      principal = i === numInstallments ? balance : 0;
    } else {
      // declining balance
      interest = balance * monthlyRate;
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
  const termInMonths = termUnit === 'months' ? term : termUnit === 'weeks' ? term / 4.33 : term / 30;
  switch (frequency) {
    case 'daily': return Math.round(termInMonths * 30);
    case 'weekly': return Math.round(termInMonths * 4.33);
    case 'biweekly': return Math.round(termInMonths * 2);
    case 'monthly': return Math.round(termInMonths);
    default: return Math.round(termInMonths);
  }
}

function getNextDate(date: Date, frequency: string): Date {
  switch (frequency) {
    case 'daily': return addDays(date, 1);
    case 'every_2_days': return addDays(date, 2);
    case 'weekly': return addWeeks(date, 1);
    case 'biweekly': return addDays(date, 15);
    case 'monthly': return addMonths(date, 1);
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
    // Proportional: rebate 100% of remaining unearned interest (full benefit to early payer)
    rebateAmount = round2(remainingInterest);
  } else if (rebatePolicy === 'partial') {
    // Partial: rebate 50% of remaining interest (shared benefit)
    rebateAmount = round2(remainingInterest * 0.5);
  } else if (rebatePolicy === 'fixed_rate' && rebateRate > 0) {
    // Fixed rate: rebate a configured percentage of remaining interest
    rebateAmount = round2(remainingInterest * rebateRate);
  }
  // 'none' or unknown: no rebate
  return { rebateAmount, totalToPay: round2(principalBalance - rebateAmount) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

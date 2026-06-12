// ─── PrestaMax — funciones financieras puras (testables) ─────────────────────
// Exporta los cálculos clave en un único lugar para que sean reutilizables
// desde routes y testeables sin levantar el servidor.

export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Date helper: siguiente fecha según frecuencia de pago ───────────────────
// FIX P1 (Jun 2026): Date.setMonth con dia 31 hace rollover (ene 31 -> mar 3
// en lugar de feb 28). Para freq mensual/trimestral/anual, clampear al
// ultimo dia del mes destino cuando el dia origen sea > dias del mes destino.
// FIX P0 (Jun 2026): operar SIEMPRE en componentes UTC. Las fechas 'YYYY-MM-DD'
// se parsean como medianoche UTC; usar setDate/setMonth (componentes locales)
// hacia que el resultado dependiera de la zona horaria del servidor (en UTC-4
// el dia retrocedia 1 y el clamp de fin de mes caia en el mes equivocado).
function addMonthsClamped(d: Date, months: number): Date {
  const nd = new Date(d);
  const origDay = nd.getUTCDate();
  nd.setUTCDate(1);
  nd.setUTCMonth(nd.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth() + 1, 0)).getUTCDate();
  nd.setUTCDate(Math.min(origDay, lastDay));
  return nd;
}

export function getNextDate(d: Date, freq: string): Date {
  const nd = new Date(d);
  if (freq === 'daily')             { nd.setUTCDate(nd.getUTCDate() + 1); return nd; }
  else if (freq === 'every_2_days') { nd.setUTCDate(nd.getUTCDate() + 2); return nd; }
  else if (freq === 'weekly')       { nd.setUTCDate(nd.getUTCDate() + 7); return nd; }
  else if (freq === 'biweekly')     { nd.setUTCDate(nd.getUTCDate() + 15); return nd; }
  else if (freq === 'quarterly')    return addMonthsClamped(d, 3);
  else if (freq === 'annual' || freq === 'yearly') return addMonthsClamped(d, 12);
  else                              return addMonthsClamped(d, 1); // monthly
}

// ─── Helpers de calendario UTC ───────────────────────────────────────────────
// Toda la aritmetica de "dias de atraso" se hace comparando FECHAS DE
// CALENDARIO en UTC, no timestamps. Asi el resultado es deterministico e
// independiente de la zona horaria del servidor.
/** Medianoche UTC (ms) de la fecha contenida en un string 'YYYY-MM-DD' o ISO. */
export function utcDateOnlyMs(s: string): number {
  return Date.parse(s.slice(0, 10) + 'T00:00:00Z');
}

/** Dias de calendario (UTC) transcurridos desde `fromMs` (medianoche UTC) hasta `asOf`. */
export function calendarDaysSince(asOf: Date, fromMs: number): number {
  const asOfMs = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  return Math.floor((asOfMs - fromMs) / 86400000);
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

// Convierte la tasa a "por periodo de cuota" — la unica forma matematicamente
// correcta cuando rateType y freq pueden diferir.
//
// Paso 1: convertir la tasa input a una tasa anual equivalente (simple, no compound)
// Paso 2: dividir entre cantidad de cuotas/año segun la frecuencia
//
// Asi: si tasa=1% Diario y freq=Diaria -> 1% × 365 / 365 = 1% por cuota ✓
//      si tasa=2.5% Quincenal y freq=Quincenal -> 2.5%×26 / 26 = 2.5% por cuota ✓
//      si tasa=60% Anual y freq=Mensual -> 60% / 12 = 5% por cuota ✓
export function getRatePerInstallment(rate: number, rateType: string, freq: string): number {
  const yearly =
    rateType === 'daily'    ? rate * 365
    : rateType === 'weekly' ? rate * 52
    : rateType === 'biweekly' ? rate * 26
    : rateType === 'monthly' ? rate * 12
    : rateType === 'annual' ? rate
    : rate * 12;
  const installmentsPerYear =
    freq === 'daily'     ? 365
    : freq === 'weekly'  ? 52
    : freq === 'biweekly' ? 26
    : freq === 'monthly' ? 12
    : freq === 'quarterly' ? 4
    : freq === 'annual' || freq === 'yearly' ? 1
    : 12;
  return (yearly / 100) / installmentsPerYear;
}

export function generateSchedule(params: ScheduleParams): ScheduleRow[] {
  const { amount, rate, rateType, term, termUnit, freq, type, firstDate } = params;
  // Tasa correcta POR PERIODO de cuota (no "equivalente mensual")
  const mRate = getRatePerInstallment(rate, rateType, freq);

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
  mora_start_date?: string | null; // si seteada, mora solo cuenta desde esa fecha
}

export interface MoraInstallment {
  id?: string;
  status: string;
  due_date: string;
  deferred_due_date?: string | null;
  principal_amount: number;
  interest_amount: number;
  paid_total?: number;
  paid_principal?: number;
}

export interface MoraDetail {
  days: number;    // dias en mora (ya descontados los dias de gracia)
  amount: number;  // monto de mora de esa cuota
}

/** Mora individual por cuota (dias + monto), as-of una fecha dada.
 *  FIX P0 (Jun 2026): los dias se cuentan comparando fechas de CALENDARIO en
 *  UTC (utcDateOnlyMs / calendarDaysSince), no timestamps locales — el conteo
 *  ya no varia ±1 dia segun la zona horaria del servidor. */
export function calcMoraDetails(
  loan: MoraLoanConfig,
  installments: MoraInstallment[],
  asOf: Date,
): Record<string, MoraDetail> {
  const base     = loan.mora_base || 'cuota_vencida';
  const useFixed = !!loan.mora_fixed_enabled;
  const fixedAmt = loan.mora_fixed_amount || 0;
  // mora_start_date: si seteada, dias en mora se cuentan desde max(due_date, mora_start_date)
  const moraStartMs = loan.mora_start_date ? utcDateOnlyMs(loan.mora_start_date) : null;
  const out: Record<string, MoraDetail> = {};
  for (let idx = 0; idx < installments.length; idx++) {
    const inst = installments[idx];
    const key = inst.id || String(idx);
    if (inst.status === 'paid' || inst.status === 'waived') { out[key] = { days: 0, amount: 0 }; continue; }
    const effectiveDueMs = utcDateOnlyMs(inst.deferred_due_date || inst.due_date);
    const startFromMs = moraStartMs !== null && moraStartMs > effectiveDueMs ? moraStartMs : effectiveDueMs;
    const days     = Math.max(0, calendarDaysSince(asOf, startFromMs));
    const moraDays = Math.max(0, days - (loan.mora_grace_days || 0));
    if (moraDays <= 0) { out[key] = { days: 0, amount: 0 }; continue; }
    if (useFixed) {
      out[key] = { days: moraDays, amount: r2(fixedAmt) };
    } else {
      let baseAmount = 0;
      if (base === 'cuota_vencida') {
        baseAmount = r2((inst.principal_amount + inst.interest_amount) - (inst.paid_total || 0));
      } else {
        baseAmount = r2((inst.principal_amount || 0) - (inst.paid_principal || 0));
      }
      out[key] = { days: moraDays, amount: r2(Math.max(0, baseAmount) * (loan.mora_rate_daily || 0.001) * moraDays) };
    }
  }
  return out;
}

/** Mora por cuota — solo montos { installment_id -> mora }. Base del waterfall. */
export function calcMoraPerInstallment(
  loan: MoraLoanConfig,
  installments: MoraInstallment[],
  asOf: Date,
): Record<string, number> {
  const details = calcMoraDetails(loan, installments, asOf);
  const out: Record<string, number> = {};
  for (const k in details) out[k] = details[k].amount;
  return out;
}

/** Mora total del prestamo. Garantiza SUM(calcMoraPerInstallment) === calcMora. */
export function calcMora(loan: MoraLoanConfig, installments: MoraInstallment[], asOf: Date): number {
  const details = calcMoraDetails(loan, installments, asOf);
  let total = 0;
  for (const k in details) total += details[k].amount;
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


// ─── allocatePayment — WATERFALL POR CUOTA (May 2026) ────────────────────────
// Cambio de logica importante: antes se cobraba TODA la mora vigente del prestamo
// antes de tocar cuotas. Ahora se itera cuota por cuota: mora-de-esa-cuota ->
// interes -> capital. El sobrante pasa a la siguiente cuota.
//
// Motivacion: que cuotas se liquiden ordenadamente en vez de quedar todas en
// "parcial" porque la mora global absorbio el pago.
//
// Acepta el parametro `mora` como:
//   - number  : monto total (se reparte proporcionalmente a la mora de cada cuota)
//   - Record  : mapa { installment_id -> mora_de_esa_cuota } (preferido)
//
// La forma Record es la usada por producción (calcMoraPerInstallment); la forma
// number es para compatibilidad con tests viejos — internamente se reparte.
export interface AllocInstallment {
  id: string;
  status: string;
  due_date: string;
  deferred_due_date?: string | null;
  principal_amount: number;
  interest_amount: number;
  paid_principal?: number;
  paid_interest?: number;
  paid_mora?: number;
  paid_total?: number;
}

export interface AllocUpdate {
  id: string;
  addPrincipal: number;
  addInterest: number;
  addMora: number;
}

export interface AllocResult {
  updates: AllocUpdate[];
  totalInterest: number;
  totalPrincipal: number;
  totalMora: number;
  excessToCapital: number;
  remaining: number;
}

export function allocatePayment(
  installments: AllocInstallment[],
  amount: number,
  paymentType: string,        // 'regular' | 'interest_only' | 'capital_only' | 'full_payoff'
  overpaymentAction: string,  // 'apply_to_capital' | 'apply_to_next_installment'
  mora: number | Record<string, number>,
): AllocResult {
  let remaining = r2(amount);
  const updates: AllocUpdate[] = [];
  let totalInterest = 0, totalPrincipal = 0, totalMora = 0, excessToCapital = 0;

  // Cuotas pendientes ordenadas por fecha efectiva
  const pending = installments
    .filter(i => !['paid', 'waived'].includes(i.status))
    .sort((a, b) => {
      const dA = a.deferred_due_date || a.due_date;
      const dB = b.deferred_due_date || b.due_date;
      return new Date(dA).getTime() - new Date(dB).getTime();
    });

  // Normalizar mora a un mapa por cuota. Si vino como numero, asignar todo a la
  // primera cuota pendiente (comportamiento equivalente al anterior).
  const moraMap: Record<string, number> = {};
  if (typeof mora === 'number') {
    if (mora > 0 && pending.length > 0) moraMap[pending[0].id] = r2(mora);
  } else if (mora && typeof mora === 'object') {
    for (const k in mora) moraMap[k] = r2(mora[k] || 0);
  }

  // Reglas por tipo de pago (alineadas con routes/payments.ts):
  //   regular / full_payoff -> mora + interes + capital, en ese orden, por cuota
  //   interest_only         -> NO mora, NO capital, solo interes
  //   capital_only          -> NO mora, INTERES pendiente PRIMERO, luego CAPITAL
  const chargesMora    = paymentType !== 'interest_only' && paymentType !== 'capital_only';
  const chargesCapital = paymentType !== 'interest_only';

  for (const inst of pending) {
    if (remaining <= 0.001) break;
    let addM = 0, addI = 0, addP = 0;

    // 1) MORA de esta cuota
    if (chargesMora) {
      const moraOfInst = r2(moraMap[inst.id] || 0);
      const moraPend = Math.max(0, r2(moraOfInst - (inst.paid_mora || 0)));
      if (moraPend > 0 && remaining > 0) {
        addM = r2(Math.min(remaining, moraPend));
        totalMora += addM;
        remaining = r2(remaining - addM);
      }
    }

    // 2) INTERES de esta cuota (todos los tipos cobran interes pendiente)
    const pendInterest = Math.max(0, r2(inst.interest_amount - (inst.paid_interest || 0)));
    if (pendInterest > 0 && remaining > 0) {
      addI = r2(Math.min(remaining, pendInterest));
      totalInterest += addI;
      remaining = r2(remaining - addI);
    }

    // 3) CAPITAL de esta cuota (todos excepto interest_only)
    if (chargesCapital) {
      const pendPrincipal = Math.max(0, r2(inst.principal_amount - (inst.paid_principal || 0)));
      if (pendPrincipal > 0 && remaining > 0) {
        addP = r2(Math.min(remaining, pendPrincipal));
        totalPrincipal += addP;
        remaining = r2(remaining - addP);
      }
    }

    if (addM > 0 || addI > 0 || addP > 0) {
      updates.push({ id: inst.id, addPrincipal: addP, addInterest: addI, addMora: addM });
    }
  }

  // 4. Overpayment despues de cubrir todas las cuotas pendientes
  // NOTA: igual que routes/payments.ts — totalPrincipal incluye el excess.
  // El caller (POST /payments) usa excessToCapital para tracking separado y
  // para creditar el banco, pero applied_capital persiste = totalPrincipal.
  if (remaining > 0.01 && overpaymentAction === 'apply_to_capital' && paymentType !== 'interest_only') {
    excessToCapital = r2(remaining);
    totalPrincipal += remaining;
    remaining = 0;
  }

  return {
    updates,
    totalInterest: r2(totalInterest),
    totalPrincipal: r2(totalPrincipal),
    totalMora: r2(totalMora),
    excessToCapital,
    remaining: r2(Math.max(0, remaining)),
  };
}

// ─── agingBuckets — distribución de mora por edad ────────────────────────────
export interface AgingLoan {
  days_overdue?: number;
  total_balance?: number;
  mora_balance?: number;
}

export interface AgingResult {
  current: number;
  d1_7: number;
  d8_15: number;
  d16_30: number;
  over30: number;
  amounts: { current: number; d1_7: number; d8_15: number; d16_30: number; over30: number };
}

export function agingBuckets(loans: AgingLoan[]): AgingResult {
  // FIX P1 (Jun 2026): unificar metrica. Antes el bucket "current" sumaba
  // total_balance mientras los demas sumaban mora_balance, dando totales
  // inconsistentes entre filas. Ahora todos usan total_balance.
  const aging: AgingResult = {
    current: 0, d1_7: 0, d8_15: 0, d16_30: 0, over30: 0,
    amounts: { current: 0, d1_7: 0, d8_15: 0, d16_30: 0, over30: 0 },
  };
  for (const l of loans) {
    const d = l.days_overdue || 0;
    const amount = l.total_balance || 0;
    if (d === 0)      { aging.current++; aging.amounts.current += amount; }
    else if (d <= 7)  { aging.d1_7++;    aging.amounts.d1_7    += amount; }
    else if (d <= 15) { aging.d8_15++;   aging.amounts.d8_15   += amount; }
    else if (d <= 30) { aging.d16_30++;  aging.amounts.d16_30  += amount; }
    else              { aging.over30++;  aging.amounts.over30  += amount; }
  }
  return aging;
}

// moraRate — calcula la tasa de mora sobre cartera activa
export function moraRate(activeBalance: number, moraBalance: number): number {
  if (activeBalance <= 0) return 0;
  return (moraBalance / activeBalance) * 100;
}

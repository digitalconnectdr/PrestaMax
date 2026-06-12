// ─── PrestaMax — motor de calculo de prestamos (FRONTEND) ────────────────────
// FIX P2 (Jun 2026): port EXACTO de backend/src/lib/calculations.ts.
// Antes el preview de LoanCreatePage y la calculadora tenian su propia
// aritmetica (sin conversion plazo→cuotas segun frecuencia, sin clamp de fin
// de mes, factores 4 vs 4.33) y lo que el usuario veia no coincidia con el
// plan real que generaba el backend al desembolsar.
//
// REGLA: si cambias una formula aqui, cambiala tambien en
// backend/src/lib/calculations.ts (y viceversa).

export function r2(n: number): number {
  return Math.round(n * 100) / 100
}

// ─── Fechas (calendario UTC, identico al backend) ────────────────────────────
function addMonthsClamped(d: Date, months: number): Date {
  const nd = new Date(d)
  const origDay = nd.getUTCDate()
  nd.setUTCDate(1)
  nd.setUTCMonth(nd.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(nd.getUTCFullYear(), nd.getUTCMonth() + 1, 0)).getUTCDate()
  nd.setUTCDate(Math.min(origDay, lastDay))
  return nd
}

export function getNextDate(d: Date, freq: string): Date {
  const nd = new Date(d)
  if (freq === 'daily')             { nd.setUTCDate(nd.getUTCDate() + 1); return nd }
  else if (freq === 'every_2_days') { nd.setUTCDate(nd.getUTCDate() + 2); return nd }
  else if (freq === 'weekly')       { nd.setUTCDate(nd.getUTCDate() + 7); return nd }
  else if (freq === 'biweekly')     { nd.setUTCDate(nd.getUTCDate() + 15); return nd }
  else if (freq === 'quarterly')    return addMonthsClamped(d, 3)
  else if (freq === 'annual' || freq === 'yearly') return addMonthsClamped(d, 12)
  else                              return addMonthsClamped(d, 1) // monthly
}

// ─── Conversion de plazo a numero de cuotas ──────────────────────────────────
export function getInstallmentCount(term: number, termUnit: string, freq: string): number {
  if (
    (termUnit === 'months'   && freq === 'monthly')  ||
    (termUnit === 'biweekly' && freq === 'biweekly') ||
    (termUnit === 'weeks'    && freq === 'weekly')   ||
    (termUnit === 'days'     && freq === 'daily')
  ) return Math.max(1, Math.round(term))

  let months: number
  if      (termUnit === 'months')   months = term
  else if (termUnit === 'years')    months = term * 12
  else if (termUnit === 'biweekly') months = term / 2
  else if (termUnit === 'weeks')    months = term / 4.33
  else if (termUnit === 'days')     months = term / 30
  else                              months = term

  let n: number
  if      (freq === 'daily')        n = months * 30
  else if (freq === 'every_2_days') n = months * 15
  else if (freq === 'weekly')       n = months * 4.33
  else if (freq === 'biweekly')     n = months * 2
  else if (freq === 'quarterly')    n = months / 3
  else if (freq === 'annual' || freq === 'yearly') n = months / 12
  else                              n = months

  return Math.max(1, Math.round(n))
}

// ─── Conversion de tasa a "por periodo de cuota" ─────────────────────────────
export function getRatePerInstallment(rate: number, rateType: string, freq: string): number {
  const yearly =
    rateType === 'daily'    ? rate * 365
    : rateType === 'weekly' ? rate * 52
    : rateType === 'biweekly' ? rate * 26
    : rateType === 'monthly' ? rate * 12
    : rateType === 'annual' ? rate
    : rate * 12
  const installmentsPerYear =
    freq === 'daily'     ? 365
    : freq === 'weekly'  ? 52
    : freq === 'biweekly' ? 26
    : freq === 'monthly' ? 12
    : freq === 'quarterly' ? 4
    : freq === 'annual' || freq === 'yearly' ? 1
    : 12
  return (yearly / 100) / installmentsPerYear
}

/** Cuotas por año segun frecuencia — util para conversiones inversas. */
export function installmentsPerYear(freq: string): number {
  return freq === 'daily' ? 365
    : freq === 'weekly' ? 52
    : freq === 'biweekly' ? 26
    : freq === 'monthly' ? 12
    : freq === 'quarterly' ? 4
    : freq === 'annual' || freq === 'yearly' ? 1
    : 12
}

// ─── Plan de pagos (identico al backend + balance corrido para la UI) ────────
export interface ScheduleParams {
  amount: number
  rate: number
  rateType: string
  term: number
  termUnit: string
  freq: string
  type: string
  firstDate: string | Date
}

export interface ScheduleRow {
  installment_number: number
  due_date: string          // ISO
  principal_amount: number
  interest_amount: number
  total_amount: number
  balance: number           // saldo de capital despues de esta cuota (solo UI)
}

export function generateSchedule(params: ScheduleParams): ScheduleRow[] {
  const { amount, rate, rateType, term, termUnit, freq, type, firstDate } = params
  const mRate = getRatePerInstallment(rate, rateType, freq)
  const n = getInstallmentCount(term, termUnit, freq)
  const schedule: ScheduleRow[] = []
  let balance = amount
  let currentDate = new Date(firstDate)
  const fixedPayment = mRate > 0
    ? amount * (mRate * Math.pow(1 + mRate, n)) / (Math.pow(1 + mRate, n) - 1)
    : amount / n

  for (let i = 1; i <= n; i++) {
    let principal = 0, interest = 0
    if (type === 'fixed_installment') {
      interest  = r2(balance * mRate)
      principal = i === n ? r2(balance) : r2(fixedPayment - interest)
    } else if (type === 'flat_interest') {
      interest  = r2(amount * mRate)
      principal = r2(amount / n)
    } else if (type === 'interest_only') {
      interest  = r2(balance * mRate)
      principal = i === n ? r2(balance) : 0
    } else {
      interest  = r2(balance * mRate)
      principal = r2(amount / n)
    }
    principal = Math.max(0, Math.min(principal, balance))
    balance   = r2(balance - principal)
    schedule.push({
      installment_number: i,
      due_date: currentDate.toISOString(),
      principal_amount: principal,
      interest_amount: interest,
      total_amount: r2(principal + interest),
      balance,
    })
    currentDate = getNextDate(currentDate, freq)
    if (Math.abs(balance) < 0.01) break
  }
  return schedule
}

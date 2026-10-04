// Editar préstamo: payload DELTA (solo campos realmente modificados) y bloqueos por estado.
// Módulo puro (sin React). Espeja las reglas del backend (backend/src/lib/loanEdit.ts), que es quien decide:
// el frontend solo evita enviar de más y deshabilita lo que el servidor rechazaría.

export interface LoanEditForm {
  requestedAmount: string; approvedAmount: string; rate: string; rateType: string; term: string; termUnit: string
  paymentFrequency: string; amortizationType: string
  applicationDate: string; approvalDate: string; disbursementDate: string; firstPaymentDate: string; maturityDate: string
  moraRateDaily: string      // % diario (texto); la API recibe fracción
  moraGraceDays: string; moraBase: string; moraFixedEnabled: string; moraFixedAmount: string; moraStartDate: string
  collectorId: string; purpose: string; notes: string; prorrogaFee: string
}
export type LoanEditField = keyof LoanEditForm

export const PRE_DISBURSEMENT_STATUSES = ['draft', 'under_review', 'pending_manager_approval', 'approved']
export const TERMINAL_STATUSES = ['rejected', 'cancelled', 'voided', 'written_off', 'liquidated', 'paid']
export type LoanEditPhase = 'pre' | 'post' | 'terminal'

export function loanEditPhase(status: string): LoanEditPhase {
  if (PRE_DISBURSEMENT_STATUSES.includes(status)) return 'pre'
  if (TERMINAL_STATUSES.includes(status)) return 'terminal'
  return 'post'
}

/** Condiciones financieras y fechas estructurales (bloqueadas tras el desembolso, con pagos y en estados cerrados). */
export const STRUCTURAL_FIELDS: LoanEditField[] = [
  'requestedAmount', 'approvedAmount', 'rate', 'rateType', 'term', 'termUnit', 'paymentFrequency', 'amortizationType',
  'disbursementDate', 'firstPaymentDate', 'maturityDate',
]
const TERMINAL_EDITABLE: LoanEditField[] = ['notes', 'purpose']
const ALL_FIELDS: LoanEditField[] = [
  ...STRUCTURAL_FIELDS, 'applicationDate', 'approvalDate', 'moraRateDaily', 'moraGraceDays', 'moraBase', 'moraFixedEnabled',
  'moraFixedAmount', 'moraStartDate', 'collectorId', 'purpose', 'notes', 'prorrogaFee',
]

export type LoanLockReason = 'none' | 'closed' | 'disbursed' | 'has_payments'

/** Qué campos quedan deshabilitados y por qué. */
export function loanEditLocks(status: string, hasPaymentHistory: boolean): { locked: Set<LoanEditField>; reason: LoanLockReason } {
  const phase = loanEditPhase(status)
  if (phase === 'terminal') return { locked: new Set(ALL_FIELDS.filter(f => !TERMINAL_EDITABLE.includes(f))), reason: 'closed' }
  if (phase === 'post') return { locked: new Set(STRUCTURAL_FIELDS), reason: 'disbursed' }
  if (hasPaymentHistory) return { locked: new Set(STRUCTURAL_FIELDS), reason: 'has_payments' }
  return { locked: new Set(), reason: 'none' }
}

/** ¿Alguna cuota tiene pagos aplicados? (el backend también lo comprueba con los pagos registrados) */
export function installmentsHavePayments(installments: Array<{ status?: string; paidTotal?: number; paid_total?: number }> | undefined | null): boolean {
  return !!installments && installments.some(i => ['paid', 'partial', 'interest_paid'].includes(String(i.status)) || Number(i.paidTotal ?? i.paid_total ?? 0) > 0)
}

/** Conversión de cada campo del formulario al valor de la API (camelCase; el cliente HTTP lo pasa a snake_case). */
const CONVERT: Record<LoanEditField, (v: string) => unknown> = {
  requestedAmount: v => parseFloat(v), approvedAmount: v => parseFloat(v), rate: v => parseFloat(v), rateType: v => v,
  term: v => parseInt(v, 10), termUnit: v => v, paymentFrequency: v => v, amortizationType: v => v,
  applicationDate: v => v || null, approvalDate: v => v || null, disbursementDate: v => v || null,
  firstPaymentDate: v => v || null, maturityDate: v => v || null,
  moraRateDaily: v => parseFloat(v) / 100, moraGraceDays: v => parseInt(v, 10), moraBase: v => v,
  moraFixedEnabled: v => parseInt(v, 10), moraFixedAmount: v => parseFloat(v) || 0, moraStartDate: v => v || null,
  collectorId: v => v || null, purpose: v => v, notes: v => v, prorrogaFee: v => parseFloat(v) || 0,
}
const NUMERIC: LoanEditField[] = ['requestedAmount', 'approvedAmount', 'rate', 'term', 'moraRateDaily', 'moraGraceDays', 'moraFixedEnabled']

/**
 * Solo los campos que el usuario realmente cambió (formulario actual vs. formulario inicial).
 * Los campos bloqueados nunca se envían. `invalid` lista campos numéricos cambiados con un valor no numérico.
 */
export function buildLoanEditPayload(
  initial: LoanEditForm, form: LoanEditForm, locked: Set<LoanEditField> = new Set(),
): { payload: Record<string, unknown>; changed: LoanEditField[]; invalid: LoanEditField[] } {
  const payload: Record<string, unknown> = {}
  const changed: LoanEditField[] = []
  const invalid: LoanEditField[] = []
  for (const f of ALL_FIELDS) {
    if (locked.has(f)) continue
    if (String(form[f] ?? '') === String(initial[f] ?? '')) continue
    const value = CONVERT[f](String(form[f] ?? ''))
    if (NUMERIC.includes(f) && (typeof value !== 'number' || Number.isNaN(value))) { invalid.push(f); continue }
    payload[f] = value
    changed.push(f)
  }
  return { payload, changed, invalid }
}

// Edición segura de préstamos (PUT /loans/:id): DELTA-BASED + guards por estado.
//
// Causa raíz del defecto anterior: el modal enviaba el formulario COMPLETO y el backend regeneraba el calendario
// con solo ver campos de términos en el payload (aunque no hubieran cambiado), sin ninguna validación por estado.
// Resultado: editar notas o mora recreaba cuotas (ids nuevos, se perdía deferred_due_date) y, en estados no
// desembolsados (incluidos liquidated / written_off / voided...), borraba TODAS las cuotas y las dejaba 'pending'.
//
// Ahora: (1) solo cuentan los campos cuyo valor REALMENTE cambia; (2) los campos operativos nunca tocan el
// calendario; (3) los campos estructurales solo se aceptan en estados pre-desembolso y sin historial de pagos;
// (4) el calendario se regenera únicamente cuando cambió un campo que lo define.
import { validateMoraInput, normalizeMoraBase } from './moraConfig';

/** Estados previos al desembolso: aún se pueden modificar las condiciones (y regenerar el calendario). */
export const PRE_DISBURSEMENT_STATUSES = ['draft', 'under_review', 'pending_manager_approval', 'approved'] as const;
/** Estados cerrados: protegidos contra cualquier cambio financiero; solo notas y propósito. */
export const TERMINAL_STATUSES = ['rejected', 'cancelled', 'voided', 'written_off', 'liquidated', 'paid'] as const;
/** Cualquier otro estado (disbursed, active, in_mora, restructured, o desconocido) = post-desembolso. */
export type LoanEditPhase = 'pre' | 'post' | 'terminal';

export function loanEditPhase(status: string): LoanEditPhase {
  if ((PRE_DISBURSEMENT_STATUSES as readonly string[]).includes(status)) return 'pre';
  if ((TERMINAL_STATUSES as readonly string[]).includes(status)) return 'terminal';
  return 'post';
}

/** Campos que DEFINEN el calendario: si cambian (pre-desembolso) se regenera. */
export const SCHEDULE_FIELDS = [
  'requested_amount', 'approved_amount', 'rate', 'rate_type', 'term', 'term_unit',
  'payment_frequency', 'amortization_type', 'first_payment_date',
] as const;
/** Condiciones financieras / fechas estructurales: bloqueadas tras el desembolso, con pagos y en estados cerrados. */
export const STRUCTURAL_FIELDS = [...SCHEDULE_FIELDS, 'disbursement_date', 'maturity_date'] as const;
/** Campos operativos: nunca borran ni regeneran cuotas. */
export const OPERATIONAL_FIELDS = [
  'purpose', 'notes', 'collector_id', 'mora_rate_daily', 'mora_grace_days', 'mora_base', 'mora_fixed_enabled',
  'mora_fixed_amount', 'mora_start_date', 'prorroga_fee', 'application_date', 'approval_date',
] as const;
/** En estados cerrados solo se admiten notas y propósito. */
export const TERMINAL_EDITABLE_FIELDS = ['notes', 'purpose'] as const;

type Kind = 'money' | 'rate' | 'int' | 'flag' | 'amount0' | 'text' | 'nulltext' | 'date' | 'moraBase';
const KIND: Record<string, Kind> = {
  requested_amount: 'money', approved_amount: 'money', rate: 'rate', term: 'int',
  rate_type: 'text', term_unit: 'text', payment_frequency: 'text', amortization_type: 'text',
  application_date: 'date', approval_date: 'date', disbursement_date: 'date', first_payment_date: 'date', maturity_date: 'date',
  mora_rate_daily: 'rate', mora_grace_days: 'int', mora_base: 'moraBase', mora_fixed_enabled: 'flag', mora_fixed_amount: 'amount0',
  mora_start_date: 'date', collector_id: 'nulltext', purpose: 'nulltext', notes: 'nulltext', prorroga_fee: 'amount0',
};
export const EDITABLE_FIELDS = Object.keys(KIND);

const isBlank = (v: any) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** Valor normalizado de un campo (o { invalid } si no es válido). null = vacío. */
function normalize(field: string, v: any): { value: any } | { invalid: true } {
  const kind = KIND[field];
  switch (kind) {
    case 'money': { if (isBlank(v)) return { value: null }; const n = Number(v); return Number.isFinite(n) && n > 0 ? { value: n } : { invalid: true }; }
    case 'rate': { if (isBlank(v)) return { value: null }; const n = Number(v); return Number.isFinite(n) && n >= 0 ? { value: n } : { invalid: true }; }
    case 'amount0': { if (isBlank(v)) return { value: 0 }; const n = Number(v); return Number.isFinite(n) && n >= 0 ? { value: n } : { invalid: true }; }
    case 'int': { if (isBlank(v)) return { value: null }; const n = Number(v); return Number.isInteger(n) && (field === 'term' ? n > 0 : n >= 0) ? { value: n } : { invalid: true }; }
    case 'flag': { if (isBlank(v)) return { value: 0 }; if (v === true || v === 1 || v === '1' || v === 'true') return { value: 1 }; if (v === false || v === 0 || v === '0' || v === 'false') return { value: 0 }; return { invalid: true }; }
    case 'moraBase': { if (isBlank(v)) return { value: null }; const b = normalizeMoraBase(v); return b ? { value: b } : { invalid: true }; }
    case 'text': { if (isBlank(v)) return { value: null }; return { value: String(v) }; }
    case 'nulltext': { if (isBlank(v)) return { value: null }; return { value: String(v) }; }
    case 'date': { if (isBlank(v)) return { value: null }; const s = String(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? { value: s } : { invalid: true }; }
    default: return { invalid: true };
  }
}

/** Comparable canónico de un valor ya normalizado (las fechas se comparan por el día). */
function comparable(field: string, v: any): string {
  if (v === null || v === undefined) return '∅';
  if (KIND[field] === 'date') return String(v).slice(0, 10);
  if (typeof v === 'number') return String(Math.round(v * 1e9) / 1e9);
  return String(v);
}

/** Valor actual del préstamo, normalizado igual que el entrante, para comparar. */
function currentValue(field: string, loan: any): any {
  const raw = loan[field];
  if (isBlank(raw)) return KIND[field] === 'amount0' || KIND[field] === 'flag' ? 0 : null;
  const n = normalize(field, raw);
  return 'value' in n ? n.value : raw;
}

export interface LoanEditDiff {
  /** Campo -> valor nuevo normalizado, SOLO de los que realmente cambian. */
  changes: Record<string, any>;
  /** Campo -> valor anterior, solo de los que cambian. */
  previous: Record<string, any>;
  changedFields: string[];
  /** Mensaje si algún campo enviado trae un valor inválido. */
  error: string | null;
}

/** Calcula el delta real entre el préstamo actual y el payload (ignora campos no editables y valores idénticos). */
export function diffLoanEdit(loan: any, body: any): LoanEditDiff {
  const out: LoanEditDiff = { changes: {}, previous: {}, changedFields: [], error: null };
  const d = body || {};
  for (const field of EDITABLE_FIELDS) {
    if (d[field] === undefined) continue;
    const n = normalize(field, d[field]);
    if ('invalid' in n) { out.error = `Valor inválido para "${field}"`; return out; }
    const cur = currentValue(field, loan);
    if (comparable(field, n.value) === comparable(field, cur)) continue;        // idéntico: no es un cambio
    out.changes[field] = n.value;
    out.previous[field] = loan[field] ?? null;
    out.changedFields.push(field);
  }
  // Validación de mora solo sobre lo que cambia (los valores guardados no se re-validan).
  if (!out.error) {
    const mora: Record<string, any> = {};
    for (const k of out.changedFields) if (k.startsWith('mora_')) mora[k] = out.changes[k];
    out.error = validateMoraInput(mora);
  }
  return out;
}

export interface LoanEditViolation { code: 'LOAN_TERMS_LOCKED' | 'LOAN_CLOSED_LOCKED'; error: string; locked_fields: string[] }

/** Guards por estado / historial. null = permitido. */
export function checkLoanEditAllowed(phase: LoanEditPhase, changedFields: string[], hasPaymentHistory: boolean): LoanEditViolation | null {
  if (phase === 'terminal') {
    const blocked = changedFields.filter(f => !(TERMINAL_EDITABLE_FIELDS as readonly string[]).includes(f));
    if (blocked.length) return {
      code: 'LOAN_CLOSED_LOCKED', locked_fields: blocked,
      error: 'Este préstamo está cerrado: solo se pueden editar las notas y el propósito.',
    };
    return null;
  }
  const structural = changedFields.filter(f => (STRUCTURAL_FIELDS as readonly string[]).includes(f));
  if (!structural.length) return null;
  if (phase === 'post') return {
    code: 'LOAN_TERMS_LOCKED', locked_fields: structural,
    error: 'Las condiciones financieras de un préstamo desembolsado no se pueden editar directamente (monto, tasa, plazo, frecuencia, amortización y fechas estructurales). Usa la reestructuración o la consolidación de préstamos.',
  };
  if (hasPaymentHistory) return {
    code: 'LOAN_TERMS_LOCKED', locked_fields: structural,
    error: 'Este préstamo ya tiene pagos o cuotas pagadas: sus condiciones financieras no se pueden modificar con la edición ordinaria. Usa la reestructuración o la consolidación de préstamos.',
  };
  return null;
}

/** ¿El préstamo tiene historial que el calendario no puede reescribir (pagos vigentes o cuotas pagadas/parciales)? */
export function loanHasPaymentHistory(db: any, loanId: string): boolean {
  const pay = db.prepare('SELECT 1 FROM payments WHERE loan_id=? AND COALESCE(is_voided,0)=0 LIMIT 1').get(loanId);
  if (pay) return true;
  const inst = db.prepare(
    `SELECT 1 FROM installments WHERE loan_id=? AND (status IN ('paid','partial','interest_paid') OR COALESCE(paid_total,0) > 0) LIMIT 1`
  ).get(loanId);
  return !!inst;
}

/** ¿Algún campo cambiado define el calendario? (solo entonces se regenera, y solo pre-desembolso) */
export function changesSchedule(changedFields: string[]): boolean {
  return changedFields.some(f => (SCHEDULE_FIELDS as readonly string[]).includes(f));
}

/** Texto acotado para el audit log (evita volcar notas largas completas). */
export function auditSafe(values: Record<string, any>): Record<string, any> {
  const o: Record<string, any> = {};
  for (const [k, v] of Object.entries(values)) o[k] = typeof v === 'string' && v.length > 500 ? v.slice(0, 500) + '…' : v;
  return o;
}

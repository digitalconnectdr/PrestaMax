// amortization — catalogo unico de tipos de amortizacion del sistema
//
// Esto reemplaza la inconsistencia previa donde cada pagina tenia sus
// propios labels y orden. Usar SIEMPRE estos labels y descripciones para
// mantener consistencia con el usuario.
//
// Eliminado: 'declining_balance' (Saldo Decreciente) — aparecia en algunos
// dropdowns pero NO estaba implementado en el motor de calculo. Si en el
// futuro se implementa, agregar aqui y propagara automaticamente.

import { t as tg } from '@/lib/i18n';

export type AmortizationType = 'flat_interest' | 'fixed_installment' | 'interest_only';

// Las propiedades label/shortDesc/longDesc/example son GETTERS que resuelven
// la traducción del idioma actual vía tg() (no-hook). Así un mismo objeto
// devuelve el texto correcto en ES/EN/PT sin tener que rehacer el array.
export interface AmortizationInfo {
  value: AmortizationType;
  readonly label: string;       // Texto corto para selects y badges
  readonly shortDesc: string;   // 1 linea para resumir
  readonly longDesc: string;    // Explicacion completa (modal)
  readonly example: string;     // Ejemplo concreto
}

const AMORT_KEY_BASE: Record<AmortizationType, string> = {
  flat_interest: 'amort.flat',
  fixed_installment: 'amort.fixed',
  interest_only: 'amort.io',
};

const makeInfo = (value: AmortizationType, base: string): AmortizationInfo => ({
  value,
  get label() { return tg(`${base}.label`) },
  get shortDesc() { return tg(`${base}.short`) },
  get longDesc() { return tg(`${base}.long`) },
  get example() { return tg(`${base}.example`) },
});

export const AMORTIZATION_TYPES: AmortizationInfo[] = [
  makeInfo('flat_interest', 'amort.flat'),
  makeInfo('fixed_installment', 'amort.fixed'),
  makeInfo('interest_only', 'amort.io'),
];

// Default sugerido cuando se crea un nuevo prestamo o se abre la calculadora
export const DEFAULT_AMORTIZATION: AmortizationType = 'flat_interest';

// Helper para obtener label seguro (acepta strings legacy como declining_balance)
export function getAmortLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const base = AMORT_KEY_BASE[value as AmortizationType];
  return base ? tg(`${base}.label`) : value;
}

// Lookup tipo objeto por compatibilidad: AMORT_LABELS[value] devuelve el label traducido
export const AMORT_LABELS: Record<string, string> = new Proxy({}, {
  get: (_target, prop: string) => getAmortLabel(prop),
}) as Record<string, string>;

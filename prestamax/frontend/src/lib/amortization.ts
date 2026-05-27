// amortization — catalogo unico de tipos de amortizacion del sistema
//
// Esto reemplaza la inconsistencia previa donde cada pagina tenia sus
// propios labels y orden. Usar SIEMPRE estos labels y descripciones para
// mantener consistencia con el usuario.
//
// Eliminado: 'declining_balance' (Saldo Decreciente) — aparecia en algunos
// dropdowns pero NO estaba implementado en el motor de calculo. Si en el
// futuro se implementa, agregar aqui y propagara automaticamente.

export type AmortizationType = 'flat_interest' | 'fixed_installment' | 'interest_only';

export interface AmortizationInfo {
  value: AmortizationType;
  label: string;       // Texto corto para selects y badges
  shortDesc: string;   // 1 linea para resumir
  longDesc: string;    // Explicacion completa (modal)
  example: string;     // Ejemplo concreto
}

export const AMORTIZATION_TYPES: AmortizationInfo[] = [
  {
    value: 'flat_interest',
    label: 'Interés',
    shortDesc: 'Cuota fija sobre el monto inicial. La más común para préstamos personales pequeños.',
    longDesc: 'El interés se calcula UNA SOLA VEZ sobre el monto inicial del préstamo y se reparte por igual en todas las cuotas. La cuota es siempre la misma. Es el método más simple y popular en préstamos personales informales y comerciales pequeños.',
    example: 'Préstamo RD$ 10,000 al 5% mensual a 12 meses:\n• Interés total: 10,000 × 5% × 12 = RD$ 6,000\n• Total a pagar: 16,000\n• Cuota mensual: 16,000 / 12 = RD$ 1,333.33\n\nLa misma cuota durante los 12 meses.',
  },
  {
    value: 'fixed_installment',
    label: 'Cuota Fija',
    shortDesc: 'Método francés/bancario. Interés sobre saldo, cuota fija. Usado por bancos.',
    longDesc: 'Conocido como "amortización francesa" o "sistema bancario". La cuota es fija pero internamente cambia la proporción: al inicio se paga más interés y menos capital; al final se paga más capital y menos interés. Es lo que usan los bancos en préstamos hipotecarios y vehículos.',
    example: 'Préstamo RD$ 10,000 al 5% mensual a 12 meses:\n• Cuota mensual fija: ~RD$ 1,128.25\n• Cuota 1: interés RD$ 500.00 + capital RD$ 628.25\n• Cuota 6: interés RD$ 296.97 + capital RD$ 831.28\n• Cuota 12: interés RD$ 53.72 + capital RD$ 1,074.53\n\nTotal pagado: RD$ 13,539 (interés total RD$ 3,539).',
  },
  {
    value: 'interest_only',
    label: 'Solo Interés',
    shortDesc: 'Pagas solo intereses mensuales. El capital se paga completo al final.',
    longDesc: 'También conocido como "préstamo con bullet" o "Réditos". Durante el plazo el cliente solo paga el interés cada mes. El capital prestado se devuelve completo en la última cuota. Útil para préstamos puente o cuando el cliente espera un ingreso grande al final.',
    example: 'Préstamo RD$ 10,000 al 5% mensual a 12 meses:\n• Cuotas 1 a 11: solo RD$ 500.00 (interés mensual)\n• Cuota 12: RD$ 500.00 (interés) + RD$ 10,000 (capital) = RD$ 10,500\n\nTotal pagado: RD$ 16,000 (interés total RD$ 6,000).',
  },
];

// Lookup rapido por value
export const AMORT_LABELS: Record<AmortizationType, string> = AMORTIZATION_TYPES.reduce(
  (acc, t) => ({ ...acc, [t.value]: t.label }),
  {} as Record<AmortizationType, string>
);

// Default sugerido cuando se crea un nuevo prestamo o se abre la calculadora
export const DEFAULT_AMORTIZATION: AmortizationType = 'flat_interest';

// Helper para obtener label seguro (acepta strings legacy como declining_balance)
export function getAmortLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return (AMORT_LABELS as Record<string, string>)[value] || value;
}

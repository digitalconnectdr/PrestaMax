// Mora: configuración global del tenant -> instantánea por préstamo.
//
// Modelo (dos niveles):
//   1. Mora GLOBAL del tenant (Configuración > General > Mora y pagos, tabla
//      tenant_settings): es el valor INICIAL de los préstamos NUEVOS.
//   2. Mora del PRÉSTAMO (columnas mora_* de loans): instantánea tomada al crear
//      el préstamo; editable por préstamo. Es lo ÚNICO que leen los cálculos,
//      pagos, anulaciones, sync de estado y reportes. La mora global NO se
//      consulta dinámicamente para préstamos existentes.
//
// Precedencia al CREAR un préstamo (por campo):
//   valor explícito del préstamo > mora global válida del tenant > constante del sistema.
//
// Las columnas loan_products.mora_* ya NO participan en la precedencia (el
// formulario de productos nunca las expuso; el nivel de producto queda como dato
// heredado sin efecto).

export const SYSTEM_MORA_DEFAULTS = {
  mora_rate_daily: 0.001,        // fracción diaria (0.001 = 0.1 %)
  mora_grace_days: 3,
  mora_base: 'cuota_vencida',
  mora_fixed_enabled: 0,
  mora_fixed_amount: 0,
} as const;

export const MORA_BASES = ['cuota_vencida', 'capital_pendiente', 'capital_vencido'] as const;
export const MORA_RATE_DAILY_MAX = 1;      // 100 % diario como tope de cordura (fracción)
export const MORA_GRACE_DAYS_MAX = 365;

export interface MoraSnapshot {
  mora_rate_daily: number;
  mora_grace_days: number;
  mora_base: string;
  mora_fixed_enabled: 0 | 1;
  mora_fixed_amount: number;
}

export type MoraSource = 'loan' | 'tenant' | 'system';
export interface ResolvedMora extends MoraSnapshot {
  sources: Record<keyof MoraSnapshot, MoraSource>;
}

const absent = (v: any) => v === undefined || v === null || v === '';

// ─── Parsers: devuelven null si el valor no es válido (NO usan || : 0 es válido) ──
function parseRate(v: any): number | null {
  if (absent(v) || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= MORA_RATE_DAILY_MAX ? n : null;
}
function parseGrace(v: any): number | null {
  if (absent(v) || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MORA_GRACE_DAYS_MAX ? n : null;
}
export function normalizeMoraBase(v: any): string | null {
  if (absent(v)) return null;
  const s = String(v);
  if (s === 'cuota') return 'cuota_vencida';   // valor heredado
  return (MORA_BASES as readonly string[]).includes(s) ? s : null;
}
function parseFlag(v: any): 0 | 1 | null {
  if (absent(v)) return null;
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  if (v === false || v === 0 || v === '0' || v === 'false') return 0;
  return null;
}
function parseAmount(v: any): number | null {
  if (absent(v) || typeof v === 'boolean') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Devuelve un mensaje de error si algún campo de mora PRESENTE en `input` es inválido; null si todo está bien. */
export function validateMoraInput(input: any): string | null {
  if (!input || typeof input !== 'object') return null;
  if (!absent(input.mora_rate_daily) && parseRate(input.mora_rate_daily) === null)
    return `La tasa de mora diaria debe ser un número entre 0 y ${MORA_RATE_DAILY_MAX} (fracción diaria, p. ej. 0.001 = 0.1%)`;
  if (!absent(input.mora_grace_days) && parseGrace(input.mora_grace_days) === null)
    return `Los días de gracia deben ser un entero entre 0 y ${MORA_GRACE_DAYS_MAX}`;
  if (!absent(input.mora_base) && normalizeMoraBase(input.mora_base) === null)
    return 'La base de cálculo de mora no es válida';
  if (!absent(input.mora_fixed_enabled) && parseFlag(input.mora_fixed_enabled) === null)
    return 'El cargo fijo de mora debe ser verdadero o falso';
  if (!absent(input.mora_fixed_amount) && parseAmount(input.mora_fixed_amount) === null)
    return 'El monto fijo de mora debe ser un número mayor o igual a 0';
  return null;
}

/**
 * Resuelve la mora de un préstamo NUEVO: explícito > global del tenant > sistema.
 * Cada campo se resuelve por separado; un valor global inválido (p. ej. negativo)
 * se ignora y cae a la constante del sistema. El resultado se guarda tal cual en
 * `loans` (instantánea) -- cambios posteriores en la mora global no lo afectan.
 */
export function resolveMoraConfig(db: any, tenantId: string, explicit?: any): ResolvedMora {
  const row = db.prepare(
    'SELECT mora_rate_daily, mora_grace_days, mora_base, mora_fixed_enabled, mora_fixed_amount FROM tenant_settings WHERE tenant_id=?'
  ).get(tenantId) as any;
  const ex = explicit || {};
  const sources = {} as Record<keyof MoraSnapshot, MoraSource>;
  const pick = <T>(key: keyof MoraSnapshot, parse: (v: any) => T | null): T => {
    const e = parse(ex[key]);
    if (e !== null) { sources[key] = 'loan'; return e; }
    const t = row ? parse(row[key]) : null;
    if (t !== null) { sources[key] = 'tenant'; return t; }
    sources[key] = 'system';
    return SYSTEM_MORA_DEFAULTS[key] as unknown as T;
  };
  return {
    mora_rate_daily: pick('mora_rate_daily', parseRate),
    mora_grace_days: pick('mora_grace_days', parseGrace),
    mora_base: pick('mora_base', normalizeMoraBase),
    mora_fixed_enabled: pick('mora_fixed_enabled', parseFlag),
    mora_fixed_amount: pick('mora_fixed_amount', parseAmount),
    sources,
  };
}

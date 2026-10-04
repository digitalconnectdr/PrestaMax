// Mora por producto (Global -> Producto -> Préstamo). Módulo puro (sin React) para el formulario de
// Productos y la pantalla de nuevo préstamo.
//
// - Un producto "Usa la configuración general" (inherit) o está "Personalizado para este producto".
// - La tasa se muestra en % (0.1) y la API la guarda como fracción diaria (0.001).
// - Al personalizar se precargan los valores generales vigentes.

export const MORA_BASE_OPTIONS = ['cuota_vencida', 'capital_pendiente', 'capital_vencido'] as const

/** Valores de mora tal como llegan de la API (ya en camelCase; la tasa es una fracción diaria). */
export interface MoraValues {
  moraRateDaily: number
  moraGraceDays: number
  moraBase: string
  moraFixedEnabled: number
  moraFixedAmount: number
}

/** Mismos valores por defecto del sistema que el backend (solo como respaldo mientras cargan los reales). */
export const SYSTEM_MORA_VALUES: MoraValues = {
  moraRateDaily: 0.001, moraGraceDays: 3, moraBase: 'cuota_vencida', moraFixedEnabled: 0, moraFixedAmount: 0,
}

export interface ProductMoraForm {
  inherit: boolean
  ratePct: string      // % diario (texto, para poder teclear decimales)
  graceDays: string
  base: string
  fixedEnabled: number
  fixedAmount: string
}

/** 0.001 -> "0.1" */
export const pctFromFraction = (fraction: number): string => String(Number((fraction * 100).toFixed(6)))

export function formFromValues(inherit: boolean, v: MoraValues): ProductMoraForm {
  return {
    inherit,
    ratePct: pctFromFraction(v.moraRateDaily),
    graceDays: String(v.moraGraceDays),
    base: v.moraBase,
    fixedEnabled: v.moraFixedEnabled ? 1 : 0,
    fixedAmount: String(v.moraFixedAmount ?? 0),
  }
}

/** Producto personalizado = mora_inherit_tenant = 0 (el valor por defecto y el de productos existentes es 1). */
export function productIsCustom(p: { moraInheritTenant?: number | boolean | null } | null | undefined): boolean {
  return !!p && p.moraInheritTenant !== undefined && p.moraInheritTenant !== null && Number(p.moraInheritTenant) === 0
}

/** Estado inicial del formulario: producto nuevo (hereda) o el producto que se edita. */
export function formForProduct(
  p: ({ moraInheritTenant?: number | boolean | null; effectiveMora?: Partial<MoraValues> | null }) | null,
  globals: MoraValues | null,
): ProductMoraForm {
  const g = globals ?? SYSTEM_MORA_VALUES
  if (p && productIsCustom(p)) return formFromValues(false, { ...g, ...(p.effectiveMora || {}) } as MoraValues)
  return formFromValues(true, g)
}

/** Devuelve la clave de error de i18n si hay algo inválido; null si el formulario es válido. Solo valida si es personalizado. */
export function validateMoraForm(f: ProductMoraForm): string | null {
  if (f.inherit) return null
  const rate = Number(f.ratePct)
  const grace = Number(f.graceDays)
  const amt = Number(f.fixedAmount === '' ? 0 : f.fixedAmount)
  if (f.ratePct.trim() === '' || !Number.isFinite(rate) || rate < 0 || rate > 100) return 'set.prod_mora_invalid'
  if (f.graceDays.trim() === '' || !Number.isInteger(grace) || grace < 0) return 'set.prod_mora_invalid'
  if (!(MORA_BASE_OPTIONS as readonly string[]).includes(f.base)) return 'set.prod_mora_invalid'
  if (!Number.isFinite(amt) || amt < 0) return 'set.prod_mora_invalid'
  return null
}

/** Campos de mora para enviar al guardar el producto (camelCase; el cliente HTTP los convierte a snake_case). */
export function moraFormPayload(f: ProductMoraForm): Record<string, unknown> {
  if (f.inherit) return { moraInheritTenant: true }
  return {
    moraInheritTenant: false,
    moraRateDaily: Number((Number(f.ratePct) / 100).toFixed(8)),
    moraGraceDays: Number(f.graceDays),
    moraBase: f.base,
    moraFixedEnabled: f.fixedEnabled ? 1 : 0,
    moraFixedAmount: Number(f.fixedAmount === '' ? 0 : f.fixedAmount),
  }
}

/** Un producto que ya heredaba y sigue heredando no necesita reenviar (ni reescribir) nada de mora. */
export function shouldSendMora(wasCustom: boolean, f: ProductMoraForm): boolean {
  return !(!wasCustom && f.inherit)
}

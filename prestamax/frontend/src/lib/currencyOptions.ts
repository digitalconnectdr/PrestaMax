// Selección de "Monedas de operación" (Configuración → General → Operación).
// Módulo puro (sin React) para poder probar las reglas de DOP / multimoneda.
//
// - DOP es la moneda base interna del sistema: siempre seleccionada y no se puede quitar.
// - El flag multimoneda NO lo elige el usuario: se deriva (hay al menos una moneda además de DOP).

export const BASE_CURRENCY = 'DOP'

/** Normaliza una selección: solo códigos del catálogo, sin duplicados, DOP siempre incluida y en orden de catálogo. */
export function normalizeSelection(codes: unknown, catalog: string[]): string[] {
  const wanted = new Set<string>([BASE_CURRENCY])
  if (Array.isArray(codes)) for (const c of codes) wanted.add(String(c).trim().toUpperCase())
  return catalog.filter(c => wanted.has(c))
}

/** Alterna una moneda. DOP no se puede quitar (devuelve la misma selección). */
export function toggleSelection(current: string[], code: string, catalog: string[]): string[] {
  if (code === BASE_CURRENCY) return normalizeSelection(current, catalog)
  const next = current.includes(code) ? current.filter(c => c !== code) : [...current, code]
  return normalizeSelection(next, catalog)
}

/** Texto resumido: "DOP, USD" o "DOP, USD, EUR +2". */
export function summarizeSelection(codes: string[], maxShown = 3): string {
  if (codes.length <= maxShown) return codes.join(', ')
  return `${codes.slice(0, maxShown).join(', ')} +${codes.length - maxShown}`
}

/** multi_currency_enabled derivado de la selección. */
export function deriveMultiCurrency(codes: string[]): boolean {
  return new Set([BASE_CURRENCY, ...codes.map(c => String(c).trim().toUpperCase())]).size > 1
}

/** enabled_currencies viene de la API como string JSON ("[\"DOP\",\"USD\"]") o ya como arreglo. */
export function parseStoredCurrencies(raw: unknown): string[] {
  let v: unknown = raw
  if (typeof raw === 'string') { try { v = JSON.parse(raw) } catch { v = [] } }
  return Array.isArray(v) ? v.map(c => String(c).toUpperCase()) : []
}

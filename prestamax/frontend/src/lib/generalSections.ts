// Secciones de Configuración → General y su deep link (?section=<id>).
// Módulo puro: sin React ni dependencias, para poder probar la compatibilidad de URLs.

export type GeneralSectionId = 'company' | 'operation' | 'legal' | 'mora' | 'account'

export const GENERAL_SECTION_IDS: GeneralSectionId[] = ['company', 'operation', 'legal', 'mora', 'account']

// Enlaces antiguos que siguen funcionando. La sección "Monedas" se unificó en "Operación".
export const LEGACY_SECTION_ALIASES: Record<string, GeneralSectionId> = {
  currencies: 'operation',
}

/** Valor de ?section= -> sección visible. Alias antiguos se respetan; un valor inválido cae a 'company'. */
export function parseGeneralSection(raw: string | null | undefined): GeneralSectionId {
  if (raw && Object.prototype.hasOwnProperty.call(LEGACY_SECTION_ALIASES, raw)) return LEGACY_SECTION_ALIASES[raw]
  return (GENERAL_SECTION_IDS as string[]).includes(raw ?? '') ? (raw as GeneralSectionId) : 'company'
}

/** true si el query trae un alias antiguo y conviene reescribirlo (replace) al valor vigente. */
export function isLegacySectionAlias(raw: string | null | undefined): boolean {
  return !!raw && Object.prototype.hasOwnProperty.call(LEGACY_SECTION_ALIASES, raw)
}

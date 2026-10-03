// ─── Beneficios comerciales por plan (FUENTE ÚNICA) ────────────────────────────
// Usada por la Landing (tarjetas de precios) y por "Mi Suscripción" (Billing) para
// que nunca diverjan. Son CLAVES de i18n (lp.pf.*), nunca PermKeys técnicas
// ("clients.view"...), que son identificadores internos y solo se muestran en
// Admin → Planes / diagnóstico.
//
// Cada plan lista únicamente lo que AÑADE respecto al anterior ("Todo ...").
// Solo claims verificables de software + "Soporte por correo" (sin promesas de
// tiempos de respuesta ni servicios humanos que no estén documentados).
// Mantener alineado con backend/src/db/planCatalog.ts.
export const PLAN_FEATURE_KEYS: Record<string, string[]> = {
  starter: [
    'lp.pf.clients_mgmt', 'lp.pf.loans_mgmt', 'lp.pf.payments_receipts',
    'lp.pf.collections_basic', 'lp.pf.calc', 'lp.pf.dash_basic', 'lp.pf.email_support',
  ],
  basico: [
    'lp.pf.all_starter', 'lp.pf.collections', 'lp.pf.promises', 'lp.pf.tasks',
    'lp.pf.contracts', 'lp.pf.whatsapp', 'lp.pf.templates', 'lp.pf.adv_reports',
    'lp.pf.income_mgmt', 'lp.pf.csv_import', 'lp.pf.migration_tools',
    'lp.pf.scheduled_reports', 'lp.pf.accounting_export',
  ],
  profesional: [
    'lp.pf.all_basico', 'lp.pf.branches', 'lp.pf.public_req', 'lp.pf.investors',
    'lp.pf.projections', 'lp.pf.advanced_portfolio',
  ],
  enterprise: [
    'lp.pf.all_pro', 'lp.pf.datacredito', 'lp.pf.unlimited_commercial',
  ],
}

/** Claves i18n de los beneficios de un plan (vacío si el slug no es comercial). */
export function planFeatureKeys(slug?: string | null): string[] {
  return (slug && PLAN_FEATURE_KEYS[slug]) || []
}

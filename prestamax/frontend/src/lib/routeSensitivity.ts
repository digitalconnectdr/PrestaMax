// ─────────────────────────────────────────────────────────────────────────────
// routeSensitivity.ts — lista unica de rutas que NUNCA deben ser vistas por
// Clarity (ni instrumentadas con el funnel de adquisicion de PostHog). Se
// consulta desde App.tsx en cada cambio de ruta.
//
// Enfoque: TODA ruta autenticada (dashboard y todo lo que cuelga de ella) es
// sensible por definicion — ademas de /apply/:token, que aunque es publica
// (sin login) recolecta PII real de un prospecto de un tenant (cedula, fotos
// de identificacion, telefono, direccion, ingresos): no es trafico de
// adquisicion de CredyTek, es una funcionalidad operativa del producto para
// clientes de nuestros clientes, y grabarla en Clarity seria un riesgo de
// privacidad de terceros, no solo nuestro.
//
// Las rutas que pidio el usuario originalmente en español (/admin, /dashboard,
// /clientes, /prestamos, /pagos, /cobranzas, /reportes) se mapean a los path
// reales en ingles del router (ver App.tsx): /admin, /dashboard, /clients,
// /loans, /payments, /collections, /reports — mas TODAS las demas rutas
// autenticadas equivalentes (settings, billing, whatsapp, income, requests,
// calculator, help, investors, portal, contracts, receipts, templates), que
// tambien exponen datos operativos/financieros y deben excluirse igual.
// ─────────────────────────────────────────────────────────────────────────────
const SENSITIVE_ROUTE_PREFIXES = [
  '/dashboard', '/clients', '/loans', '/payments', '/receipts', '/contracts',
  '/collections', '/reports', '/settings', '/templates', '/billing',
  '/whatsapp', '/income', '/requests', '/calculator', '/help', '/admin',
  '/investors', '/portal',
  '/apply', // publica pero con PII real de terceros — ver comentario arriba
];

export function isSensitiveRoute(pathname: string): boolean {
  return SENSITIVE_ROUTE_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

/** Rutas donde SI corresponde correr el funnel de adquisicion (PostHog) y Clarity. */
export function isAcquisitionRoute(pathname: string, isAuthenticated: boolean): boolean {
  if (isAuthenticated) return false;
  return !isSensitiveRoute(pathname);
}

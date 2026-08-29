// Mapeo ruta actual → id de guía en la "Guía del Sistema" (HelpPage).
// Lo usa el botón de ayuda "?" del Header para abrir la guía de la sección
// donde está el usuario. Rutas más específicas primero.
export const HELP_MAP: { prefix: string; guide: string }[] = [
  { prefix: '/clients',              guide: 'crear-cliente' },
  { prefix: '/loans',                guide: 'crear-prestamo' },
  { prefix: '/payments',             guide: 'registrar-pago' },
  { prefix: '/receipts',             guide: 'registrar-pago' },
  { prefix: '/collections/promises', guide: 'agenda-cobranza' },
  { prefix: '/collections',          guide: 'cartera-cobranza' },
  { prefix: '/requests',             guide: 'solicitudes-publicas' },
  { prefix: '/investors',            guide: 'inversionistas-overview' },
  { prefix: '/contracts',            guide: 'contratos' },
  { prefix: '/income',               guide: 'ingresos-gastos' },
  { prefix: '/calculator',           guide: 'calculadora' },
  { prefix: '/reports/accounting',   guide: 'exportar-contabilidad' },
  { prefix: '/reports',              guide: 'reportes' },
  { prefix: '/settings/bank-accounts', guide: 'crear-cuenta-bancaria' },
  { prefix: '/settings/products',    guide: 'crear-producto' },
  { prefix: '/settings/users',       guide: 'crear-usuario' },
  { prefix: '/settings/subscription', guide: 'cambiar-renovar-plan' },
  { prefix: '/billing',              guide: 'cambiar-renovar-plan' },
  { prefix: '/templates',            guide: 'contratos' },
  { prefix: '/whatsapp',             guide: 'activar-whatsapp' },
]

// Devuelve el id de guía para una ruta, o null si no hay una específica.
export function guideForPath(pathname: string): string | null {
  const hit = HELP_MAP.find(m => pathname === m.prefix || pathname.startsWith(m.prefix + '/') || pathname.startsWith(m.prefix))
  return hit ? hit.guide : null
}

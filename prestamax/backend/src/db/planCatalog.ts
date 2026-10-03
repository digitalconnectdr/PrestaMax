// ─── Catálogo comercial de planes (fuente ÚNICA de precios/límites/features) ──
// Usado por: database.ts (seed + migración), admin.ts (seed-defaults) y tests.
// Los precios reales cobrados viven en Whop; price_monthly es el precio
// mostrado/informativo y debe coincidir con el plan de Whop.
//
// Convención de límites: -1 = ilimitado.
// Packaging por PermKeys existentes (cada plan = el anterior + extras).

// STARTER: clientes, préstamos, pagos, recibos, calculadora, dashboard/reportes
// básicos y cobranza BÁSICA (ver cartera completa + notas). collections.manage
// ("ver todos los préstamos del tenant") se mantiene porque sin él el dueño solo
// vería la cobranza de los préstamos que tiene asignados. Promesas de pago y
// tareas de cobranza NO están en Starter.
export const STARTER_FEATURES: string[] = [
  'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
  'loans.view', 'loans.create', 'loans.edit', 'loans.approve', 'loans.reject', 'loans.disburse', 'loans.void',
  'payments.view', 'payments.create', 'payments.void',
  'receipts.view', 'receipts.reprint',
  'reports.dashboard', 'reports.portfolio', 'reports.mora',
  'calculator.use',
  'collections.view', 'collections.notes', 'collections.manage',
  'templates.view',
  'settings.general', 'settings.users', 'settings.products', 'settings.bank_accounts',
];

// BÁSICO: Starter + cobranza avanzada (promesas, tareas), contratos, WhatsApp,
// plantillas editables, reportes de cobranza y avanzados, ingresos (income.*) e
// importación CSV de préstamos. SIN sucursales, solicitudes públicas, inversionistas.
export const BASICO_FEATURES: string[] = [
  ...STARTER_FEATURES,
  'collections.promises', 'collections.tasks', 'collections.tasks.manage',
  'templates.create', 'templates.edit', 'templates.delete',
  'contracts.view', 'contracts.create', 'contracts.sign', 'contracts.delete',
  'whatsapp.view', 'whatsapp.send', 'whatsapp.templates',
  'income.view', 'income.create', 'income.edit', 'income.delete',
  'reports.collections', 'reports.advanced',
  'loans.import',
];

// PROFESIONAL: Básico + multi-sucursal, solicitudes públicas, inversionistas,
// proyecciones e ingresos avanzados, castigo de cartera, edición de pagos,
// aprobación de montos altos y consolidación de préstamos.
export const PROFESIONAL_FEATURES: string[] = [
  ...BASICO_FEATURES,
  'settings.branches',
  'requests.view', 'requests.approve', 'requests.reject', 'requests.convert',
  'investors.view', 'investors.create', 'investors.edit', 'investors.delete',
  'investors.assign', 'investors.payouts', 'investors.portal',
  'reports.income', 'reports.projection',
  'loans.write_off', 'payments.edit', 'loans.approve_high_value', 'loans.consolidate',
];

// ENTERPRISE: Profesional + DataCrédito. Límites comerciales ilimitados.
export const ENTERPRISE_FEATURES: string[] = [
  ...PROFESIONAL_FEATURES,
  'reports.datacredito',
];

export interface PlanCatalogEntry {
  id: string;
  name: string;
  slug: string;
  price: number;           // USD / mes
  maxClients: number;      // -1 = ilimitado
  maxActiveLoans: number;  // -1 = ilimitado
  maxUsers: number;        // total de usuarios (incluye cobradores)
  maxCollectors: number;   // dentro de maxUsers
  features: string[];
  description: string;
}

export const PLAN_CATALOG: PlanCatalogEntry[] = [
  { id: 'plan-starter', name: 'Starter', slug: 'starter', price: 9.99,
    maxClients: -1, maxActiveLoans: 100, maxUsers: 3, maxCollectors: 1,
    features: STARTER_FEATURES,
    description: 'Ideal para iniciar. Clientes ilimitados, hasta 100 préstamos activos y cobranza básica.' },
  { id: 'plan-basico', name: 'Básico', slug: 'basico', price: 24.99,
    maxClients: -1, maxActiveLoans: 500, maxUsers: 8, maxCollectors: 3,
    features: BASICO_FEATURES,
    description: 'Para prestamistas en crecimiento: cobranza avanzada, contratos, WhatsApp, reportes avanzados e importación CSV.' },
  { id: 'plan-profesional', name: 'Profesional', slug: 'profesional', price: 49.99,
    maxClients: -1, maxActiveLoans: 2000, maxUsers: 20, maxCollectors: 10,
    features: PROFESIONAL_FEATURES,
    description: 'Para equipos medianos: sucursales, solicitudes públicas, inversionistas y proyecciones.' },
  { id: 'plan-enterprise', name: 'Enterprise', slug: 'enterprise', price: 99.99,
    maxClients: -1, maxActiveLoans: -1, maxUsers: -1, maxCollectors: -1,
    features: ENTERPRISE_FEATURES,
    description: 'Sin límites de préstamos activos, usuarios ni cobradores. Todas las funciones, incluido DataCrédito.' },
];

// El Plan Trial refleja Starter: clientes ilimitados, 100 préstamos activos,
// 3 usuarios, 1 cobrador, features = Starter.
export const TRIAL_PLAN = {
  id: 'plan-trial',
  maxClients: -1, maxActiveLoans: 100, maxUsers: 3, maxCollectors: 1,
  features: STARTER_FEATURES,
};

// Identificador de la migración de precios/límites/packaging (se aplica UNA vez
// por base de datos; después el Admin puede seguir editando los planes).
export const PRICING_V2_MIGRATION_KEY = 'pricing_v2_2026_10';

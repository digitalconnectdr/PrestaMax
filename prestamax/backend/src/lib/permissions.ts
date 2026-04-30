// ─── PrestaMax Permission System ────────────────────────────────────────────
// All permission keys are dot-namespaced: "module.action"
// This file is the single source of truth for all permissions.
// Supabase note: permissions are stored as JSON text in tenant_memberships.permissions
// ─────────────────────────────────────────────────────────────────────────────

export type PermKey =
  // Clients
  | 'clients.view' | 'clients.create' | 'clients.edit' | 'clients.delete'
  // Loans
  | 'loans.view' | 'loans.create' | 'loans.edit'
  | 'loans.approve' | 'loans.reject' | 'loans.disburse'
  | 'loans.write_off' | 'loans.void' | 'loans.import'
  // Payments
  | 'payments.view' | 'payments.create' | 'payments.void' | 'payments.edit'
  // Receipts
  | 'receipts.view' | 'receipts.reprint'
  // Contracts
  | 'contracts.view' | 'contracts.create' | 'contracts.sign' | 'contracts.delete'
  // Collections
  | 'collections.view' | 'collections.notes' | 'collections.promises' | 'collections.manage'
  | 'collections.tasks' | 'collections.tasks.manage'
  // Loan Requests
  | 'requests.view' | 'requests.approve' | 'requests.reject' | 'requests.convert'
  // Reports
  | 'reports.dashboard' | 'reports.portfolio' | 'reports.mora'
  | 'reports.collections' | 'reports.advanced' | 'reports.income' | 'reports.projection'
  | 'reports.datacredito'
  // WhatsApp
  | 'whatsapp.view' | 'whatsapp.send' | 'whatsapp.templates'
  // Income / Expenses
  | 'income.view' | 'income.create' | 'income.edit' | 'income.delete'
  // Settings (restricted)
  | 'settings.general' | 'settings.users' | 'settings.branches'
  | 'settings.products' | 'settings.bank_accounts'
  // Templates (independent module)
  | 'templates.view' | 'templates.create' | 'templates.edit' | 'templates.delete'
  // Calculator
  | 'calculator.use'

export interface PermDef {
  key: PermKey
  label: string
  description: string
  module: string
  moduleLabel: string
}

export const PERM_DEFS: PermDef[] = [
  // ── Clientes ──────────────────────────────────────────────────────
  { key:'clients.view',     module:'clients',    moduleLabel:'Clientes',      label:'Ver clientes',          description:'Acceder al listado y detalle de clientes' },
  { key:'clients.create',   module:'clients',    moduleLabel:'Clientes',      label:'Crear clientes',        description:'Registrar nuevos clientes en el sistema' },
  { key:'clients.edit',     module:'clients',    moduleLabel:'Clientes',      label:'Editar clientes',       description:'Modificar información de clientes existentes' },
  { key:'clients.delete',   module:'clients',    moduleLabel:'Clientes',      label:'Desactivar clientes',   description:'Desactivar clientes del sistema' },
  // ── Préstamos ─────────────────────────────────────────────────────
  { key:'loans.view',       module:'loans',      moduleLabel:'Préstamos',     label:'Ver préstamos',         description:'Acceder al listado y detalle de préstamos' },
  { key:'loans.create',     module:'loans',      moduleLabel:'Préstamos',     label:'Crear préstamos',       description:'Registrar nuevos préstamos' },
  { key:'loans.edit',       module:'loans',      moduleLabel:'Préstamos',     label:'Editar préstamos',      description:'Modificar condiciones de préstamos existentes' },
  { key:'loans.approve',    module:'loans',      moduleLabel:'Préstamos',     label:'Aprobar préstamos',     description:'Aprobar solicitudes de préstamo pendientes' },
  { key:'loans.reject',     module:'loans',      moduleLabel:'Préstamos',     label:'Rechazar préstamos',    description:'Rechazar solicitudes de préstamo' },
  { key:'loans.disburse',   module:'loans',      moduleLabel:'Préstamos',     label:'Desembolsar préstamos', description:'Marcar préstamos como desembolsados y generar cuotas' },
  { key:'loans.write_off',  module:'loans',      moduleLabel:'Préstamos',     label:'Marcar incobrable',     description:'Marcar un préstamo como incobrable (write-off)' },
  { key:'loans.void',       module:'loans',      moduleLabel:'Préstamos',     label:'Anular préstamos',      description:'Anular/cancelar préstamos activos' },
  { key:'loans.import',     module:'loans',      moduleLabel:'Préstamos',     label:'Importar CSV',          description:'Importar préstamos desde archivo CSV' },
  // ── Pagos ─────────────────────────────────────────────────────────
  { key:'payments.view',    module:'payments',   moduleLabel:'Pagos',         label:'Ver pagos',             description:'Acceder al historial de pagos' },
  { key:'payments.create',  module:'payments',   moduleLabel:'Pagos',         label:'Registrar pagos',       description:'Registrar nuevos pagos de clientes' },
  { key:'payments.void',    module:'payments',   moduleLabel:'Pagos',         label:'Anular pagos',          description:'Anular pagos registrados' },
  { key:'payments.edit',    module:'payments',   moduleLabel:'Pagos',         label:'Editar pagos',          description:'Modificar metadatos de pagos (fecha, método, notas)' },
  // ── Recibos ───────────────────────────────────────────────────────
  { key:'receipts.view',    module:'receipts',   moduleLabel:'Recibos',       label:'Ver recibos',           description:'Acceder al listado de recibos' },
  { key:'receipts.reprint', module:'receipts',   moduleLabel:'Recibos',       label:'Reimprimir recibos',    description:'Marcar recibos como reimpresos' },
  // ── Contratos ─────────────────────────────────────────────────────
  { key:'contracts.view',   module:'contracts',  moduleLabel:'Contratos',     label:'Ver contratos',         description:'Acceder al listado de contratos' },
  { key:'contracts.create', module:'contracts',  moduleLabel:'Contratos',     label:'Generar contratos',     description:'Generar contratos de préstamo' },
  { key:'contracts.sign',   module:'contracts',  moduleLabel:'Contratos',     label:'Firmar contratos',      description:'Marcar contratos como firmados' },
  { key:'contracts.delete', module:'contracts',  moduleLabel:'Contratos',     label:'Eliminar contratos',    description:'Eliminar/anular contratos' },
  // ── Cobros ────────────────────────────────────────────────────────
  { key:'collections.view',     module:'collections', moduleLabel:'Cobros',   label:'Ver cartera de cobros', description:'Acceder a la cartera y préstamos vencidos' },
  { key:'collections.notes',    module:'collections', moduleLabel:'Cobros',   label:'Notas de cobro',        description:'Agregar notas de gestión de cobro a préstamos' },
  { key:'collections.promises', module:'collections', moduleLabel:'Cobros',   label:'Promesas de pago',      description:'Gestionar promesas de pago y visitas' },
  { key:'collections.manage',       module:'collections', moduleLabel:'Cobros',   label:'Ver todos los préstamos',    description:'Ver toda la cartera del tenant (no solo préstamos asignados)' },
  { key:'collections.tasks',        module:'collections', moduleLabel:'Cobros',   label:'Ver tareas asignadas',       description:'Ver y actualizar el estado de las tareas de cobranza asignadas al usuario' },
  { key:'collections.tasks.manage', module:'collections', moduleLabel:'Cobros',   label:'Administrar agenda de cobros', description:'Crear, asignar, editar y eliminar tareas de cobranza para todos los cobradores' },
  // ── Solicitudes ───────────────────────────────────────────────────
  { key:'requests.view',    module:'requests',   moduleLabel:'Solicitudes',   label:'Ver solicitudes',       description:'Acceder al listado de solicitudes de préstamo' },
  { key:'requests.approve', module:'requests',   moduleLabel:'Solicitudes',   label:'Aprobar solicitudes',   description:'Aprobar solicitudes de préstamo' },
  { key:'requests.reject',  module:'requests',   moduleLabel:'Solicitudes',   label:'Rechazar solicitudes',  description:'Rechazar solicitudes de préstamo' },
  { key:'requests.convert', module:'requests',   moduleLabel:'Solicitudes',   label:'Convertir solicitudes', description:'Convertir solicitudes aprobadas en préstamos activos' },
  // ── Reportes ──────────────────────────────────────────────────────
  { key:'reports.dashboard',   module:'reports', moduleLabel:'Reportes',      label:'Dashboard',             description:'Ver el panel principal con KPIs' },
  { key:'reports.portfolio',   module:'reports', moduleLabel:'Reportes',      label:'Reporte de cartera',    description:'Ver el reporte de cartera con envejecimiento' },
  { key:'reports.mora',        module:'reports', moduleLabel:'Reportes',      label:'Reporte de mora',       description:'Ver préstamos en mora' },
  { key:'reports.collections', module:'reports', moduleLabel:'Reportes',      label:'Reporte de cobros',     description:'Ver cobros por cobrador' },
  { key:'reports.advanced',    module:'reports', moduleLabel:'Reportes',      label:'Analítica avanzada',    description:'Ver reportes avanzados y tendencias' },
  { key:'reports.income',      module:'reports', moduleLabel:'Reportes',      label:'Ingresos y gastos',     description:'Ver reporte de ingresos y gastos' },
  { key:'reports.projection',  module:'reports', moduleLabel:'Reportes',      label:'Proyección de cobros',  description:'Ver proyección de ingresos a cobrar por fecha o rango' },
  { key:'reports.datacredito', module:'reports', moduleLabel:'Reportes',      label:'Reporte DataCrédito',   description:'Generar y descargar el reporte mensual para DataCrédito' },
  // ── WhatsApp ──────────────────────────────────────────────────────
  { key:'whatsapp.view',      module:'whatsapp', moduleLabel:'WhatsApp',      label:'Ver mensajes',          description:'Ver historial de mensajes de WhatsApp' },
  { key:'whatsapp.send',      module:'whatsapp', moduleLabel:'WhatsApp',      label:'Enviar mensajes',       description:'Enviar mensajes por WhatsApp a clientes' },
  { key:'whatsapp.templates', module:'whatsapp', moduleLabel:'WhatsApp',      label:'Gestionar plantillas',  description:'Crear, editar y eliminar plantillas de WhatsApp' },
  // ── Ingresos/Gastos ───────────────────────────────────────────────
  { key:'income.view',   module:'income', moduleLabel:'Ingresos/Gastos',      label:'Ver entradas',          description:'Ver el registro de ingresos y gastos' },
  { key:'income.create', module:'income', moduleLabel:'Ingresos/Gastos',      label:'Crear entradas',        description:'Registrar nuevas entradas de ingreso o gasto' },
  { key:'income.edit',   module:'income', moduleLabel:'Ingresos/Gastos',      label:'Editar entradas',       description:'Modificar entradas de ingreso/gasto existentes' },
  { key:'income.delete', module:'income', moduleLabel:'Ingresos/Gastos',      label:'Eliminar entradas',     description:'Eliminar entradas de ingreso/gasto' },
  // ── Configuración ─────────────────────────────────────────────────
  { key:'settings.general',      module:'settings', moduleLabel:'Configuración', label:'Configuración general', description:'Ver y editar datos de la empresa, mora y firma' },
  { key:'settings.users',        module:'settings', moduleLabel:'Configuración', label:'Gestionar usuarios',    description:'Invitar, editar y gestionar usuarios del tenant' },
  { key:'settings.branches',     module:'settings', moduleLabel:'Configuración', label:'Gestionar sucursales',  description:'Crear y editar sucursales' },
  { key:'settings.products',     module:'settings', moduleLabel:'Configuración', label:'Gestionar productos',   description:'Crear y editar productos de préstamo' },
  { key:'settings.bank_accounts',module:'settings', moduleLabel:'Configuración', label:'Cuentas bancarias',     description:'Gestionar cuentas bancarias y transferencias' },
  // ─── Plantillas ──────────────────────────────────────────────
  { key:'templates.view',   module:'templates',  moduleLabel:'Plantillas',     label:'Ver plantillas',       description:'Ver plantillas de contrato disponibles' },
  { key:'templates.create', module:'templates',  moduleLabel:'Plantillas',     label:'Crear plantillas',     description:'Crear nuevas plantillas de contrato' },
  { key:'templates.edit',   module:'templates',  moduleLabel:'Plantillas',     label:'Editar plantillas',    description:'Modificar plantillas de contrato existentes' },
  { key:'templates.delete', module:'templates',  moduleLabel:'Plantillas',     label:'Eliminar plantillas',  description:'Eliminar plantillas de contrato' },
  // ── Calculadora ───────────────────────────────────────────────────
  { key:'calculator.use', module:'calculator', moduleLabel:'Calculadora',     label:'Usar calculadora',      description:'Usar la calculadora de préstamos' },
]

// ─── Default permissions per role ────────────────────────────────────────────
// tenant_owner gets ALL permissions (enforced in middleware, not stored)
// Platform owners/admins bypass all permission checks entirely

const ALL_KEYS = PERM_DEFS.map(p => p.key)

const ADMIN_DEFAULTS: PermKey[] = [...ALL_KEYS] as PermKey[]

const OFICIAL_DEFAULTS: PermKey[] = [
  'clients.view','clients.create','clients.edit',
  'loans.view','loans.create','loans.edit','loans.approve','loans.reject','loans.disburse','loans.void','loans.import',
  'payments.view','payments.create','payments.void','payments.edit',
  'receipts.view','receipts.reprint',
  'contracts.view','contracts.create','contracts.sign',
  'collections.view','collections.notes','collections.promises','collections.manage',
  'collections.tasks','collections.tasks.manage',
  'requests.view','requests.approve','requests.reject','requests.convert',
  'reports.dashboard','reports.portfolio','reports.mora','reports.collections',
  'reports.datacredito',
  'whatsapp.view','whatsapp.send',
  'templates.view','templates.create',
  'income.view',
  'calculator.use',
]

const CASHIER_DEFAULTS: PermKey[] = [
  'clients.view',
  'loans.view',
  'payments.view','payments.create','payments.void','payments.edit',
  'receipts.view','receipts.reprint',
  'collections.view','collections.manage',
  'collections.tasks',
  'reports.dashboard',
  'whatsapp.send',
  'templates.view',
  'income.view',
  'calculator.use',
]

const COBRADOR_DEFAULTS: PermKey[] = [
  'clients.view',
  'loans.view',
  'payments.view','payments.create',
  'receipts.view',
  'collections.view','collections.notes','collections.promises',
  'collections.tasks',
  'reports.dashboard',
  'whatsapp.send',
  'calculator.use',
]

export const ROLE_DEFAULTS: Record<string, PermKey[]> = {
  tenant_owner: ALL_KEYS as PermKey[], // all
  admin: ADMIN_DEFAULTS,
  prestamista: OFICIAL_DEFAULTS,
  oficial: OFICIAL_DEFAULTS,
  loan_officer: OFICIAL_DEFAULTS,
  cashier: CASHIER_DEFAULTS,
  cobrador: COBRADOR_DEFAULTS,
  collector: COBRADOR_DEFAULTS,
}

// ─── Compute effective permissions ───────────────────────────────────────────
// roles: array of role strings from tenant_membership.roles
// explicit: JSON-parsed permissions object from tenant_membership.permissions
//           { "loans.approve": true, "loans.void": false, ... }
// Returns: Set<PermKey> of all GRANTED permissions
export function computePermissions(
  roles: string[],
  explicit: Record<string, boolean>,
  planFeatures?: string[] | null
): Set<string> {
  // Plan ceiling: if the plan has features defined, they act as the maximum allowed set.
  // An empty planFeatures array means "no restrictions" (backward compat).
  const planSet = (planFeatures && planFeatures.length > 0) ? new Set(planFeatures) : null

  // Privileged roles (tenant_owner, admin) get all plan features.
  // If no plan is set, they get every permission key.
  const isPrivileged = roles.includes('tenant_owner') || roles.includes('admin')
  if (isPrivileged) {
    const base: Set<string> = planSet ? new Set(planFeatures as string[]) : new Set(ALL_KEYS)
    // Explicit overrides can still add/remove within what the plan allows
    for (const [key, allowed] of Object.entries(explicit)) {
      if (allowed && (!planSet || planSet.has(key))) base.add(key)
      else if (!allowed) base.delete(key)
    }
    return base
  }

  // Non-privileged roles: start from role defaults
  const granted = new Set<string>()
  for (const role of roles) {
    const defaults = ROLE_DEFAULTS[role] || []
    for (const p of defaults) granted.add(p)
  }

  // Apply explicit grants/revocations
  for (const [key, allowed] of Object.entries(explicit)) {
    if (allowed) granted.add(key)
    else granted.delete(key)
  }

  // Apply plan ceiling: remove anything the plan does not allow
  if (planSet) {
    for (const perm of [...granted]) {
      if (!planSet.has(perm)) granted.delete(perm)
    }
  }

  return granted
}

// ─── Check single permission ──────────────────────────────────────────────────
export function hasPermission(
  roles: string[],
  explicit: Record<string, boolean>,
  key: PermKey,
  planFeatures?: string[] | null
): boolean {
  return computePermissions(roles, explicit, planFeatures).has(key)
}

// Plan Feature Gates
export const PERM_REQUIRES_FEATURE: Partial<Record<PermKey, string[]>> = {
  'clients.view': ['clients'],
  'clients.create': ['clients'],
  'clients.edit': ['clients'],
  'clients.delete': ['clients'],
  'loans.view': ['loans'],
  'loans.create': ['loans'],
  'loans.edit': ['loans'],
  'loans.approve': ['loans'],
  'loans.reject': ['loans'],
  'loans.disburse': ['loans'],
  'loans.write_off': ['loans'],
  'loans.void': ['loans'],
  'loans.import': ['export_data'],
  'payments.view': ['payments'],
  'payments.create': ['payments'],
  'payments.void': ['payments'],
  'payments.edit': ['payments'],
  'receipts.view': ['receipts'],
  'receipts.reprint': ['receipts'],
  'contracts.view': ['contracts'],
  'contracts.create': ['contracts'],
  'contracts.sign': ['contracts', 'digital_signature'],
  'contracts.delete': ['contracts'],
  'reports.dashboard': ['reports_basic', 'reports_advanced'],
  'reports.portfolio': ['reports_basic', 'reports_advanced'],
  'reports.mora': ['reports_basic', 'reports_advanced'],
  'reports.collections': ['reports_basic', 'reports_advanced'],
  'reports.advanced': ['reports_advanced'],
  'reports.income': ['reports_advanced'],
  'reports.projection': ['reports_advanced'],
  'reports.datacredito': ['reports_advanced'],
  'whatsapp.view': ['whatsapp'],
  'whatsapp.send': ['whatsapp'],
  'whatsapp.templates': ['whatsapp'],
  'settings.branches': ['branches'],
}

export function planAllowsPermission(planFeatures: string[], permKey: PermKey): boolean {
  // Plans now store PermKeys directly instead of generic features.
  // If plan has no restrictions (empty array), allow all. Otherwise check for exact PermKey match.
  if (!planFeatures || planFeatures.length === 0) return true;
  return planFeatures.includes(permKey);
}

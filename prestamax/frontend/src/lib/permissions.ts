// ─── PrestaMax Permission System — Frontend ────────────────────────────────────
// Mirror of backend/src/lib/permissions.ts
// Keep in sync when adding new permissions.
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
  // Settings
  | 'settings.general' | 'settings.users' | 'settings.branches'
  | 'settings.products' | 'settings.bank_accounts'
  // Templates (independent module)
  | 'templates.view' | 'templates.create' | 'templates.edit' | 'templates.delete'
  // Calculator
  | 'calculator.use'
  // Investors (Pro/Enterprise)
  | 'investors.view' | 'investors.create' | 'investors.edit' | 'investors.delete'
  | 'investors.assign' | 'investors.payouts' | 'investors.portal'

import { t as tg } from '@/lib/i18n'

export interface PermDef {
  key: PermKey
  readonly label: string         // getter → traducción del idioma actual
  readonly description: string   // getter → traducción del idioma actual
  module: string
  readonly moduleLabel: string   // getter → traducción del idioma actual
}

// Pares (key, module). Los textos viven en i18n (perm.<key>, perm.<key>_d, pmod.<module>).
const PERM_PAIRS: { key: PermKey; module: string }[] = [
  { key:'clients.view', module:'clients' }, { key:'clients.create', module:'clients' },
  { key:'clients.edit', module:'clients' }, { key:'clients.delete', module:'clients' },
  { key:'loans.view', module:'loans' }, { key:'loans.create', module:'loans' },
  { key:'loans.edit', module:'loans' }, { key:'loans.approve', module:'loans' },
  { key:'loans.reject', module:'loans' }, { key:'loans.disburse', module:'loans' },
  { key:'loans.write_off', module:'loans' }, { key:'loans.void', module:'loans' },
  { key:'loans.import', module:'loans' },
  { key:'payments.view', module:'payments' }, { key:'payments.create', module:'payments' },
  { key:'payments.void', module:'payments' }, { key:'payments.edit', module:'payments' },
  { key:'receipts.view', module:'receipts' }, { key:'receipts.reprint', module:'receipts' },
  { key:'contracts.view', module:'contracts' }, { key:'contracts.create', module:'contracts' },
  { key:'contracts.sign', module:'contracts' }, { key:'contracts.delete', module:'contracts' },
  { key:'collections.view', module:'collections' }, { key:'collections.notes', module:'collections' },
  { key:'collections.promises', module:'collections' }, { key:'collections.manage', module:'collections' },
  { key:'collections.tasks', module:'collections' }, { key:'collections.tasks.manage', module:'collections' },
  { key:'requests.view', module:'requests' }, { key:'requests.approve', module:'requests' },
  { key:'requests.reject', module:'requests' }, { key:'requests.convert', module:'requests' },
  { key:'reports.dashboard', module:'reports' }, { key:'reports.portfolio', module:'reports' },
  { key:'reports.mora', module:'reports' }, { key:'reports.collections', module:'reports' },
  { key:'reports.advanced', module:'reports' }, { key:'reports.income', module:'reports' },
  { key:'reports.projection', module:'reports' }, { key:'reports.datacredito', module:'reports' },
  { key:'whatsapp.view', module:'whatsapp' }, { key:'whatsapp.send', module:'whatsapp' },
  { key:'whatsapp.templates', module:'whatsapp' },
  { key:'income.view', module:'income' }, { key:'income.create', module:'income' },
  { key:'income.edit', module:'income' }, { key:'income.delete', module:'income' },
  { key:'settings.general', module:'settings' }, { key:'settings.users', module:'settings' },
  { key:'settings.branches', module:'settings' }, { key:'settings.products', module:'settings' },
  { key:'settings.bank_accounts', module:'settings' },
  { key:'templates.view', module:'templates' }, { key:'templates.create', module:'templates' },
  { key:'templates.edit', module:'templates' }, { key:'templates.delete', module:'templates' },
  { key:'calculator.use', module:'calculator' },
  { key:'investors.view', module:'investors' }, { key:'investors.create', module:'investors' },
  { key:'investors.edit', module:'investors' }, { key:'investors.delete', module:'investors' },
  { key:'investors.assign', module:'investors' }, { key:'investors.payouts', module:'investors' },
  { key:'investors.portal', module:'investors' },
]

const makePermDef = (key: PermKey, module: string): PermDef => ({
  key,
  module,
  get label() { return tg(`perm.${key}`) },
  get description() { return tg(`perm.${key}_d`) },
  get moduleLabel() { return tg(`pmod.${module}`) },
})

export const PERM_DEFS: PermDef[] = PERM_PAIRS.map(p => makePermDef(p.key, p.module))

// Group definitions by module for UI rendering. `label` es getter para seguir el idioma.
export const PERM_BY_MODULE = PERM_DEFS.reduce<Record<string, { label: string; perms: PermDef[] }>>(
  (acc, p) => {
    const mod = p.module
    if (!acc[mod]) acc[mod] = { get label() { return tg(`pmod.${mod}`) }, perms: [] }
    acc[mod].perms.push(p)
    return acc
  },
  {}
)

// Check if a permission is in the effective set
export const hasPerm = (effectivePermissions: string[], key: PermKey): boolean =>
  effectivePermissions.includes(key)

// NOTA (Jun 2026): PERM_REQUIRES_FEATURE y planAllowsPermission se eliminaron.
// Mapeaban a "features genéricas" (clients/loans/whatsapp) que ya no existen —
// los planes almacenan PermKeys directamente. El editor de permisos ahora
// comprueba el techo del plan con `planFeatures.includes(permKey)` directo.

export const LOAN_STATUSES = [
  { value: 'draft', label: 'Borrador' },
  { value: 'under_review', label: 'En revisión' },
  { value: 'pending_docs', label: 'Pendiente documentos' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'rejected', label: 'Rechazado' },
  { value: 'disbursed', label: 'Desembolsado' },
  { value: 'active', label: 'Activo' },
  { value: 'current', label: 'Al día' },
  { value: 'overdue', label: 'Vencido' },
  { value: 'in_mora', label: 'En mora' },
  { value: 'restructured', label: 'Reestructurado' },
  { value: 'liquidated', label: 'Liquidado' },
  { value: 'written_off', label: 'Castigado' },
  { value: 'cancelled', label: 'Anulado' },
]

export const CLIENT_STATUSES = [
  { value: 'active', label: 'Activo' },
  { value: 'inactive', label: 'Inactivo' },
  { value: 'blocked', label: 'Bloqueado' },
]

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'check', label: 'Cheque' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'other', label: 'Otro' },
]

export const PAYMENT_FREQUENCIES = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'biweekly', label: 'Quincenal' },
  { value: 'monthly', label: 'Mensual' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'annual', label: 'Anual' },
]

export const USER_ROLES = [
  { value: 'super_admin', label: 'Super Administrador' },
  { value: 'tenant_admin', label: 'Administrador' },
  { value: 'manager', label: 'Gerente' },
  { value: 'officer', label: 'Oficial de Crédito' },
  { value: 'collector', label: 'Cobrador' },
  { value: 'viewer', label: 'Visualizador' },
]

export const MARITAL_STATUSES = [
  { value: 'single', label: 'Soltero' },
  { value: 'married', label: 'Casado' },
  { value: 'divorced', label: 'Divorciado' },
  { value: 'widowed', label: 'Viudo' },
  { value: 'separated', label: 'Separado' },
  { value: 'domestic_partnership', label: 'Pareja de hecho' },
]

export const DOCUMENT_TYPES = [
  { value: 'cedula', label: 'Cédula' },
  { value: 'pasaporte', label: 'Pasaporte' },
  { value: 'licencia', label: 'Licencia de Conducir' },
  { value: 'otro', label: 'Otro' },
]

export const GUARANTOR_RELATIONSHIPS = [
  { value: 'family', label: 'Familia' },
  { value: 'friend', label: 'Amigo' },
  { value: 'business', label: 'Socio de negocios' },
  { value: 'employer', label: 'Empleador' },
]

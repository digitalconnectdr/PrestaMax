// audit — helper centralizado para escribir a audit_logs.
//
// Uso:
//   import { logAudit } from '../lib/audit';
//   logAudit(db, {
//     tenant_id: req.tenant.id,
//     user_id: req.user.id,
//     user_name: req.user.full_name,
//     action: 'voided',           // verbo en pasado
//     entity_type: 'payment',     // payment | loan | investor | tenant | etc
//     entity_id: paymentId,
//     description: `Anulo el pago ${payment.payment_number}`,
//     old_values: { status: 'valid' },   // opcional
//     new_values: { status: 'voided', void_reason: reason },  // opcional
//     ip_address: req.ip,         // opcional
//   });
//
// Diseno:
// - Lazy: si la inserción falla, se loguea por console pero NO crashea el endpoint.
//   Auditoría debe ser "best effort", no debe bloquear la operación principal.
// - Helper acepta objetos y los serializa a JSON automáticamente para
//   old_values/new_values/metadata (que son TEXT en la DB).

import { uuid } from '../db/database';

export interface AuditLogParams {
  tenant_id?: string | null;
  user_id?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  description: string;
  old_values?: any;
  new_values?: any;
  ip_address?: string | null;
  notes?: string | null;
  metadata?: any;
}

function toJson(v: any): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); }
  catch { return String(v); }
}

export function logAudit(db: any, p: AuditLogParams): void {
  try {
    db.prepare(`
      INSERT INTO audit_logs
        (id, tenant_id, user_id, user_name, user_email,
         action, entity_type, entity_id, description,
         old_values, new_values, ip_address, notes, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid(),
      p.tenant_id || null,
      p.user_id || null,
      p.user_name || 'Sistema',
      p.user_email || null,
      p.action,
      p.entity_type,
      p.entity_id || null,
      p.description,
      toJson(p.old_values),
      toJson(p.new_values),
      p.ip_address || null,
      p.notes || null,
      toJson(p.metadata),
    );
  } catch (e: any) {
    // Auditoria debe ser best-effort, no debe romper el endpoint principal
    console.error('[audit] failed to write log:', e?.message || e, '| params:', JSON.stringify({ action: p.action, entity: p.entity_type }));
  }
}

/**
 * Conveniencia: extrae req.user + req.tenant + ip del Request typeado.
 * Devuelve null si no hay user (e.g. cron jobs deben pasar nulls manualmente).
 */
export function auditFromReq(req: any): {
  tenant_id: string | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  ip_address: string;
} {
  return {
    tenant_id: req?.tenant?.id || null,
    user_id:   req?.user?.id || null,
    user_name: req?.user?.full_name || req?.user?.fullName || 'Sistema',
    user_email: req?.user?.email || null,
    ip_address: (req?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim()
              || req?.socket?.remoteAddress
              || '',
  };
}

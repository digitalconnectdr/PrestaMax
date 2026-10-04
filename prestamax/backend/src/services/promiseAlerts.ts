// Alertas de promesa de pago vencida (in-app).
// Destinatarios: el cobrador de la promesa (membership activa) + owner/admin activos,
// sin duplicar a nadie. Idempotente por promesa (dedupe_key). El "hoy" es el dia
// local del tenant. Ventana de 7 dias: no se inunda el historial viejo.
import { notifyTenantAdmins, notifyUser } from '../lib/notify';
import { localDate, addDaysStr, safeTz } from '../lib/tz';

const WINDOW_DAYS = 7;

export function runPromiseOverdueAlerts(db: any, tenantId: string, tz: string | null | undefined, now: Date = new Date()): number {
  const today = localDate(now, safeTz(tz));
  const from = addDaysStr(today, -WINDOW_DAYS);
  const rows = db.prepare(`
    SELECT pp.id, pp.collector_id, pp.promised_date, pp.promised_amount, l.id AS loan_id, l.loan_number, l.currency
    FROM payment_promises pp
    JOIN loans l ON l.id = pp.loan_id
    WHERE l.tenant_id = ? AND pp.status = 'pending'
      AND date(pp.promised_date) < ? AND date(pp.promised_date) >= ?
      AND l.is_voided = 0 AND l.status IN ('active','in_mora','overdue','disbursed')
  `).all(tenantId, today, from) as any[];

  let created = 0;
  for (const p of rows) {
    const title = 'Promesa de pago vencida';
    const msg = `La promesa de pago del préstamo ${p.loan_number} (${p.currency || 'DOP'} ${Number(p.promised_amount || 0).toLocaleString()}) venció el ${String(p.promised_date).slice(0, 10)} sin cumplirse.`;
    const o = {
      entityType: 'loan', entityId: p.loan_id, requiredPermission: 'collections.promises',
      dedupeKey: `promise_overdue:${p.id}`,
    };
    if (notifyUser(db, tenantId, p.collector_id, 'promise_overdue', title, msg, o)) created++;
    created += notifyTenantAdmins(db, tenantId, 'promise_overdue', title, msg, o);
  }
  return created;
}

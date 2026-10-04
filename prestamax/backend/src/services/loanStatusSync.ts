// ─── Sincronizacion diaria de estados de prestamos ───────────────────────────
// FIX P2 (Jun 2026): antes el status persistido ('active' vs 'in_mora'),
// days_overdue y mora_balance solo se actualizaban al abrir el detalle del
// prestamo o registrar un pago. Las listas y dashboards (que filtran por el
// status guardado) mostraban prestamos atrasados como "activos" en verde hasta
// que alguien los abriera. Este job mantiene los campos persistidos alineados.
//
// Notifications v2: "hoy" es el dia LOCAL del tenant (tenants.timezone), no el dia
// UTC del servidor — un tenant en UTC-4 ya no entra en mora entre las 20:00 y las
// 24:00 locales del propio dia de vencimiento. Idempotente (ver dedupe_key).
//
// NOTA: NO toca el status de las cuotas (otros queries filtran por
// 'pending'/'partial'); solo actualiza los campos derivados del prestamo.

import { r2, now as dbNow } from '../db/database';
import { calcMora, utcDateOnlyMs, calendarDaysSince } from '../lib/calculations';
import { notifyTenantAdmins, notifyUser } from '../lib/notify';
import { safeTz, asOfForTz } from '../lib/tz';

export function syncLoanStatuses(
  db: any, at: Date = new Date(), opts: { tenantId?: string } = {},
): { checked: number; updated: number } {
  const loans = (opts.tenantId
    ? db.prepare(`SELECT l.*, t.timezone AS tenant_timezone FROM loans l JOIN tenants t ON t.id=l.tenant_id
                  WHERE l.status IN ('active','in_mora') AND l.tenant_id=?`).all(opts.tenantId)
    : db.prepare(`SELECT l.*, t.timezone AS tenant_timezone FROM loans l JOIN tenants t ON t.id=l.tenant_id
                  WHERE l.status IN ('active','in_mora')`).all()) as any[];
  let updated = 0;

  for (const loan of loans) {
    try {
      const asOf = asOfForTz(at, safeTz(loan.tenant_timezone));
      const installments = db.prepare('SELECT * FROM installments WHERE loan_id=?').all(loan.id) as any[];

      // Dias de atraso = maximo sobre cuotas impagas ya vencidas (fecha efectiva).
      // overdueSince = fecha efectiva de esa cuota: identifica el "episodio" de mora.
      let daysOverdue = 0;
      let overdueSince = '';
      for (const inst of installments) {
        if (['paid', 'waived', 'cancelled'].includes(inst.status)) continue;
        const effective = String(inst.deferred_due_date || inst.due_date);
        const d = calendarDaysSince(asOf, utcDateOnlyMs(effective));
        if (d > daysOverdue) { daysOverdue = d; overdueSince = effective.slice(0, 10); }
      }

      const moraBalance = r2(calcMora(loan, installments, asOf));
      const newStatus = daysOverdue > (loan.mora_grace_days || 0) ? 'in_mora' : 'active';
      const totalBalance = r2(
        (loan.principal_balance || 0) + (loan.interest_balance || 0) + moraBalance + (loan.charges_balance || 0)
      );

      const changed =
        newStatus !== loan.status ||
        daysOverdue !== (loan.days_overdue || 0) ||
        Math.abs(moraBalance - (loan.mora_balance || 0)) > 0.01;

      if (changed) {
        db.prepare(
          `UPDATE loans SET status=?, days_overdue=?, mora_balance=?, total_balance=?, updated_at=? WHERE id=?`
        ).run(newStatus, daysOverdue, moraBalance, totalBalance, dbNow(), loan.id);
        updated++;

        // Una vez por episodio: en la transicion active -> in_mora. La clave usa la
        // fecha de vencimiento mas antigua impaga: si el prestamo sale de mora y mas
        // tarde vuelve a caer por OTRA cuota, es un episodio nuevo y SI vuelve a avisar.
        if (newStatus === 'in_mora' && loan.status !== 'in_mora') {
          const title = 'Préstamo en mora';
          const msg = `El préstamo ${loan.loan_number} entró en mora (${daysOverdue} día${daysOverdue === 1 ? '' : 's'} de atraso).`;
          const o = {
            entityType: 'loan', entityId: loan.id, requiredPermission: 'loans.view',
            dedupeKey: `loan_overdue:${loan.id}:${overdueSince}`,
          };
          notifyTenantAdmins(db, loan.tenant_id, 'loan_overdue', title, msg, o);
          // Cobrador asignado (membership activa; notifyUser lo valida y no duplica al admin).
          notifyUser(db, loan.tenant_id, loan.collector_id, 'loan_overdue', title, msg, o);
        }
      }
    } catch (e: any) {
      console.error(`[loan-status-sync] error en prestamo ${loan.id}:`, e?.message || e);
    }
  }
  return { checked: loans.length, updated };
}

// ─── Sincronizacion diaria de estados de prestamos ───────────────────────────
// FIX P2 (Jun 2026): antes el status persistido ('active' vs 'in_mora'),
// days_overdue y mora_balance solo se actualizaban al abrir el detalle del
// prestamo o registrar un pago. Las listas y dashboards (que filtran por el
// status guardado) mostraban prestamos atrasados como "activos" en verde hasta
// que alguien los abriera. Este job corre al arrancar el servidor y una vez
// al dia, manteniendo los campos persistidos alineados con la realidad.
//
// NOTA: NO toca el status de las cuotas (otros queries filtran por
// 'pending'/'partial'); solo actualiza los campos derivados del prestamo.

import { r2, now } from '../db/database';
import { calcMora, utcDateOnlyMs, calendarDaysSince } from '../lib/calculations';

export function syncLoanStatuses(db: any): { checked: number; updated: number } {
  const loans = db.prepare(`SELECT * FROM loans WHERE status IN ('active','in_mora')`).all() as any[];
  const asOf = new Date();
  let updated = 0;

  for (const loan of loans) {
    try {
      const installments = db.prepare('SELECT * FROM installments WHERE loan_id=?').all(loan.id) as any[];

      // Dias de atraso = maximo sobre cuotas impagas ya vencidas (fecha efectiva)
      let daysOverdue = 0;
      for (const inst of installments) {
        if (['paid', 'waived', 'cancelled'].includes(inst.status)) continue;
        const dueMs = utcDateOnlyMs(String(inst.deferred_due_date || inst.due_date));
        const d = calendarDaysSince(asOf, dueMs);
        if (d > daysOverdue) daysOverdue = d;
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
        ).run(newStatus, daysOverdue, moraBalance, totalBalance, now(), loan.id);
        updated++;
      }
    } catch (e: any) {
      console.error(`[loan-status-sync] error en prestamo ${loan.id}:`, e?.message || e);
    }
  }
  return { checked: loans.length, updated };
}

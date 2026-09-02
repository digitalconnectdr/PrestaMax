// reportSubscriptionService — envia el resumen de dashboard programado
// (diario/semanal/mensual) a quien lo haya activado. Antes ningun reporte
// se enviaba automaticamente; el dueño tenia que entrar al sistema cada vez.
import { now } from '../db/database';
import { sendDashboardDigestEmail } from './emailService';

function isDue(sub: any, today: Date): boolean {
  if (!sub.last_sent_at) return true;
  const last = new Date(sub.last_sent_at);
  const diffDays = Math.floor((today.getTime() - last.getTime()) / 86400000);
  if (sub.frequency === 'daily') return diffDays >= 1;
  if (sub.frequency === 'weekly') return diffDays >= 7;
  if (sub.frequency === 'monthly') return diffDays >= 28;
  return false;
}

export async function runScheduledReportsCron(db: any): Promise<{ sent: number; checked: number }> {
  const subs = db.prepare(`SELECT * FROM report_subscriptions WHERE is_active=1`).all() as any[];
  const today = new Date();
  let sent = 0;

  for (const sub of subs) {
    if (!isDue(sub, today)) continue;
    try {
      const tenant = db.prepare('SELECT name FROM tenants WHERE id=?').get(sub.tenant_id) as any;
      if (!tenant) continue;
      const tid = sub.tenant_id;
      const RATE = 'COALESCE(exchange_rate_to_dop, 1)';
      const kpis = {
        totalPortfolio: (db.prepare(`SELECT COALESCE(SUM(disbursed_amount * ${RATE}),0) as v FROM loans WHERE tenant_id=? AND is_voided=0`).get(tid) as any).v,
        activePortfolio: (db.prepare(`SELECT COALESCE(SUM(total_balance * ${RATE}),0) as v FROM loans WHERE tenant_id=? AND is_voided=0 AND status IN ('active','current','overdue','in_mora')`).get(tid) as any).v,
        activeLoans: (db.prepare(`SELECT COUNT(*) as c FROM loans WHERE tenant_id=? AND is_voided=0 AND status IN ('active','current','overdue','in_mora')`).get(tid) as any).c,
        overdueLoans: (db.prepare(`SELECT COUNT(*) as c FROM loans WHERE tenant_id=? AND is_voided=0 AND status IN ('overdue','in_mora')`).get(tid) as any).c,
        moraBalance: (db.prepare(`SELECT COALESCE(SUM(mora_balance * ${RATE}),0) as v FROM loans WHERE tenant_id=? AND is_voided=0 AND status IN ('in_mora','overdue')`).get(tid) as any).v,
        todayPayments: (db.prepare(`SELECT COALESCE(SUM(p.amount * COALESCE(l.exchange_rate_to_dop,1)),0) as v FROM payments p JOIN loans l ON l.id=p.loan_id WHERE p.tenant_id=? AND p.is_voided=0 AND l.is_voided=0 AND date(p.payment_date)=date('now')`).get(tid) as any).v,
        totalClients: (db.prepare(`SELECT COUNT(*) as c FROM clients WHERE tenant_id=? AND is_active=1`).get(tid) as any).c,
      };
      const recipients = String(sub.recipients || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      let anyOk = false;
      for (const email of recipients) {
        const ok = await sendDashboardDigestEmail({ toEmail: email, tenantName: tenant.name, frequency: sub.frequency, kpis });
        if (ok) anyOk = true;
      }
      db.prepare('UPDATE report_subscriptions SET last_sent_at=? WHERE id=?').run(now(), sub.id);
      if (anyOk) sent++;
    } catch (e: any) {
      console.error(`[report-subscriptions] error en subscripcion ${sub.id}:`, e?.message || e);
    }
  }
  return { sent, checked: subs.length };
}

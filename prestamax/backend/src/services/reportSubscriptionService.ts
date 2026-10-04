// reportSubscriptionService — envia el resumen de dashboard programado
// (diario/semanal/mensual) a quien lo haya activado.
//
// Notifications v2:
//  - "Toca enviar" se decide por DIAS DE CALENDARIO en la zona del tenant (no por
//    diferencia de milisegundos): el diario sale cada dia, el semanal cada 7 dias y
//    el mensual cada 28 dias (frecuencia vigente), sin correrse por la latencia del
//    envio anterior.
//  - last_sent_at SOLO se actualiza si el email realmente salio; un fallo (o Resend sin
//    configurar) deja la suscripcion pendiente para el siguiente tick.
//  - Idempotente: dos ejecuciones el mismo dia local no duplican (la segunda ve
//    last_sent_at de hoy) y una guarda de reentrada evita solapes en el mismo proceso.
import { sendDashboardDigestEmail } from './emailService';
import { planAllows } from '../lib/access';
import { localParts, daysBetweenStr, safeTz } from '../lib/tz';

const DIGEST_LOCAL_HOUR = 7;
const FREQ_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 28 };

function parseStored(ts: string): Date {
  // 'YYYY-MM-DD HH:MM:SS' (SQLite, UTC sin zona) se lee como UTC.
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts) ? ts.replace(' ', 'T') + 'Z' : ts;
  return new Date(iso);
}

/** ¿Toca enviar? Compara fechas locales del tenant (estable ante la latencia del envio). */
export function isDigestDue(sub: { frequency: string; last_sent_at?: string | null }, now: Date, tz: string): boolean {
  const need = FREQ_DAYS[sub.frequency];
  if (!need) return false;
  if (!sub.last_sent_at) return true;
  const last = parseStored(sub.last_sent_at);
  if (isNaN(last.getTime())) return true;
  return daysBetweenStr(localParts(last, tz).date, localParts(now, tz).date) >= need;
}

let running = false;

export async function runScheduledReportsCron(db: any, now: Date = new Date()): Promise<{ sent: number; checked: number }> {
  if (running) return { sent: 0, checked: 0 };
  running = true;
  try {
    const subs = db.prepare(`SELECT s.*, t.timezone AS tenant_timezone FROM report_subscriptions s
                             JOIN tenants t ON t.id = s.tenant_id WHERE s.is_active=1`).all() as any[];
    let sent = 0;
    const emailConfigured = !!process.env.RESEND_API_KEY;

    for (const sub of subs) {
      const tz = safeTz(sub.tenant_timezone);
      if (localParts(now, tz).hour < DIGEST_LOCAL_HOUR) continue;
      if (!isDigestDue(sub, now, tz)) continue;
      // Entitlement: los reportes programados son Básico+ (reports.scheduled). Tras un
      // downgrade a Starter la suscripción se CONSERVA pero deja de enviarse.
      if (!planAllows(db, sub.tenant_id, 'reports.scheduled')) continue;
      if (!emailConfigured) continue; // sin proveedor: no se intenta ni se marca como enviado
      try {
        const tenant = db.prepare('SELECT name FROM tenants WHERE id=?').get(sub.tenant_id) as any;
        if (!tenant) continue;
        const tid = sub.tenant_id;
        const RATE = 'COALESCE(exchange_rate_to_dop, 1)';
        // "Cobros de hoy" = dia local del tenant (no el dia UTC del servidor).
        const today = localParts(now, tz).date;
        const kpis = {
          totalPortfolio: (db.prepare(`SELECT COALESCE(SUM(disbursed_amount * ${RATE}),0) as v FROM loans WHERE tenant_id=? AND is_voided=0`).get(tid) as any).v,
          activePortfolio: (db.prepare(`SELECT COALESCE(SUM(total_balance * ${RATE}),0) as v FROM loans WHERE tenant_id=? AND is_voided=0 AND status IN ('active','current','overdue','in_mora')`).get(tid) as any).v,
          activeLoans: (db.prepare(`SELECT COUNT(*) as c FROM loans WHERE tenant_id=? AND is_voided=0 AND status IN ('active','current','overdue','in_mora')`).get(tid) as any).c,
          overdueLoans: (db.prepare(`SELECT COUNT(*) as c FROM loans WHERE tenant_id=? AND is_voided=0 AND status IN ('overdue','in_mora')`).get(tid) as any).c,
          moraBalance: (db.prepare(`SELECT COALESCE(SUM(mora_balance * ${RATE}),0) as v FROM loans WHERE tenant_id=? AND is_voided=0 AND status IN ('in_mora','overdue')`).get(tid) as any).v,
          todayPayments: (db.prepare(`SELECT COALESCE(SUM(p.amount * COALESCE(l.exchange_rate_to_dop,1)),0) as v FROM payments p JOIN loans l ON l.id=p.loan_id WHERE p.tenant_id=? AND p.is_voided=0 AND l.is_voided=0 AND date(p.payment_date)=?`).get(tid, today) as any).v,
          totalClients: (db.prepare(`SELECT COUNT(*) as c FROM clients WHERE tenant_id=? AND is_active=1`).get(tid) as any).c,
        };
        const recipients = String(sub.recipients || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        let anyOk = false;
        for (const email of recipients) {
          const ok = await sendDashboardDigestEmail({ toEmail: email, tenantName: tenant.name, frequency: sub.frequency, kpis });
          if (ok) anyOk = true;
        }
        // last_sent_at solo si salio al menos un envio; si TODO fallo, queda para reintento.
        if (anyOk) {
          db.prepare('UPDATE report_subscriptions SET last_sent_at=? WHERE id=?').run(now.toISOString(), sub.id);
          sent++;
        }
      } catch (e: any) {
        console.error(`[report-subscriptions] error en subscripcion ${sub.id}:`, String(e?.message || e).slice(0, 160));
      }
    }
    return { sent, checked: subs.length };
  } finally {
    running = false;
  }
}

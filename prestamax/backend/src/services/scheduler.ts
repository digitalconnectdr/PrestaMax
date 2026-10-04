// Scheduler de jobs diarios — resiliente a reinicios y repeticiones.
//
// Antes: un setInterval horario con banderas EN MEMORIA y compuertas de hora UTC del
// servidor. Un deploy/reinicio dentro de la hora del job lo saltaba ese dia, y el
// "dia" era el UTC del servidor, no el del tenant.
//
// Ahora:
//  - Cada tick (arranque + cada 30 min) evalua que esta pendiente; los jobs son
//    IDEMPOTENTES, asi que repetir un tick es seguro (sin banderas en memoria).
//  - "Una vez por dia local" se registra en la tabla job_runs (persistente): un
//    reinicio retoma el trabajo del dia en vez de perderlo.
//  - La hora local de cada tenant (tenants.timezone) decide cuando le toca.
//  - Sin infraestructura externa ni colas nuevas.
import { syncLoanStatuses } from './loanStatusSync';
import { runOverdueCronForTenant } from './whatsappService';
import { runTrialReminderCron } from './trialReminderService';
import { runScheduledReportsCron } from './reportSubscriptionService';
import { runPromiseOverdueAlerts } from './promiseAlerts';
import { localParts, safeTz } from '../lib/tz';
import { cleanOrphanNotificationsBounded } from '../lib/notify';

export const TICK_MS = 30 * 60 * 1000;
const DAILY_LOCAL_HOUR = 8; // WhatsApp de mora y alertas de promesas: 8:00 locales del tenant

export function jobRan(db: any, job: string, scope: string, key: string): boolean {
  return !!db.prepare('SELECT 1 FROM job_runs WHERE job=? AND scope=? AND run_key=?').get(job, scope, key);
}
export function markJobRan(db: any, job: string, scope: string, key: string) {
  db.prepare('INSERT OR IGNORE INTO job_runs (job, scope, run_key, ran_at) VALUES (?,?,?,?)').run(job, scope, key, new Date().toISOString());
}

export interface TickSummary {
  loanSync: number; whatsapp: number; promiseAlerts: number;
  trial: { sent: number; inApp: number }; digest: number; backup: boolean;
}

let tickRunning = false;

/**
 * Un tick del scheduler. `now` es inyectable (tests). `startup: true` fuerza el
 * sync de mora aunque ya se haya hecho hoy (recuperacion tras deploy/reinicio).
 */
export async function runSchedulerTick(
  db: any, now: Date = new Date(), opts: { startup?: boolean; backup?: () => Promise<unknown> } = {},
): Promise<TickSummary> {
  const summary: TickSummary = { loanSync: 0, whatsapp: 0, promiseAlerts: 0, trial: { sent: 0, inApp: 0 }, digest: 0, backup: false };
  if (tickRunning) return summary;
  tickRunning = true;
  try {
    const tenants = db.prepare('SELECT id, timezone FROM tenants WHERE is_active = 1').all() as any[];

    for (const t of tenants) {
      const tz = safeTz(t.timezone);
      const { date, hour } = localParts(now, tz);
      try {
        // Mora: una vez por dia local (al cambiar el dia en el tenant) + al arrancar.
        if (opts.startup || !jobRan(db, 'loan_sync', t.id, date)) {
          summary.loanSync += syncLoanStatuses(db, now, { tenantId: t.id }).updated;
          markJobRan(db, 'loan_sync', t.id, date);
        }
        if (hour >= DAILY_LOCAL_HOUR) {
          if (!jobRan(db, 'wa_overdue', t.id, date)) {
            summary.whatsapp += runOverdueCronForTenant(db, t.id, tz, now).generated;
            markJobRan(db, 'wa_overdue', t.id, date);
          }
          if (!jobRan(db, 'promise_alerts', t.id, date)) {
            summary.promiseAlerts += runPromiseOverdueAlerts(db, t.id, tz, now);
            markJobRan(db, 'promise_alerts', t.id, date);
          }
        }
      } catch (e: any) {
        console.error(`[scheduler] tenant ${t.id} fallo:`, String(e?.message || e).slice(0, 160));
      }
    }

    // Trial y digest: se evaluan en cada tick (idempotentes; reintentan si el email fallo).
    try {
      const r = await runTrialReminderCron(db, now);
      summary.trial = { sent: r.sent, inApp: r.inApp };
    } catch (e: any) { console.error('[scheduler] trial fallo:', String(e?.message || e).slice(0, 160)); }
    try {
      summary.digest = (await runScheduledReportsCron(db, now)).sent;
    } catch (e: any) { console.error('[scheduler] digest fallo:', String(e?.message || e).slice(0, 160)); }

    // Mantenimiento acotado de notificaciones huerfanas legadas (1 vez por dia UTC).
    try {
      const utcDay = now.toISOString().slice(0, 10);
      if (!jobRan(db, 'notif_maintenance', 'global', utcDay)) {
        cleanOrphanNotificationsBounded(db);
        markJobRan(db, 'notif_maintenance', 'global', utcDay);
      }
    } catch (e: any) { console.error('[scheduler] mantenimiento fallo:', String(e?.message || e).slice(0, 160)); }

    // Backup: una vez por dia UTC, a partir de las 03:00 UTC (recupera si se perdio la hora).
    if (opts.backup) {
      const utcDate = now.toISOString().slice(0, 10);
      if (now.getUTCHours() >= 3 && !jobRan(db, 'backup', 'global', utcDate)) {
        try {
          await opts.backup();
          markJobRan(db, 'backup', 'global', utcDate);
          summary.backup = true;
        } catch (e: any) { console.error('[scheduler] backup fallo:', String(e?.message || e).slice(0, 160)); }
      }
    }
    return summary;
  } finally {
    tickRunning = false;
  }
}

/** Arranca el scheduler: tick de recuperacion a los 5 s y luego cada TICK_MS. */
export function startScheduler(getDb: () => any, backup?: () => Promise<unknown>) {
  const run = (startup: boolean) => {
    runSchedulerTick(getDb(), new Date(), { startup, backup })
      .then(s => console.log(`[scheduler] tick ${startup ? '(arranque) ' : ''}OK`, JSON.stringify(s)))
      .catch(e => console.error('[scheduler] tick fallo:', String(e?.message || e).slice(0, 160)));
  };
  setTimeout(() => run(true), 5000);
  setInterval(() => run(false), TICK_MS);
}

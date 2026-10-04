// trialReminderService — avisos de trial por vencer / vencido.
//
// Notifications v2:
//  - IN-APP persistente (owner/admin del tenant), idempotente por hito (dedupe_key).
//  - EMAIL por hito (3/1/0 dias y -1 = vencido), marcado en trial_reminders_sent SOLO
//    si se envio de verdad: un fallo (Resend caido/no configurado) permite reintento.
//  - El dia se calcula en la zona del tenant (tenants.timezone).
//  - Para un trial activo se emite UN solo hito (el que corresponde hoy), nunca 3/1/0
//    juntos; un trial ya terminado produce un unico aviso "vencido" (ventana de 14 dias).
import { uuid } from '../db/database';
import { sendTrialReminderEmail } from './emailService';
import { notifyTenantBilling } from '../lib/billingNotifications';
import { localParts, daysBetweenStr, safeTz } from '../lib/tz';

const EMAIL_LOCAL_HOUR = 9;      // el email sale a partir de las 9:00 locales del tenant
const EXPIRED_WINDOW_DAYS = 14;  // no avisar de trials vencidos hace mas de 2 semanas
export const EXPIRED_MILESTONE = -1;

/** Hito de un trial ACTIVO segun los dias locales que faltan (null = aun no toca). */
export function milestoneForDaysLeft(daysLeft: number): number | null {
  if (daysLeft <= 0) return 0;
  if (daysLeft <= 1) return 1;
  if (daysLeft <= 3) return 3;
  return null;
}

export async function runTrialReminderCron(
  db: any, now: Date = new Date(),
): Promise<{ sent: number; checked: number; inApp: number }> {
  const tenants = db.prepare(`
    SELECT id, name, email, timezone, subscription_end
    FROM tenants
    WHERE subscription_status = 'trial' AND is_active = 1 AND subscription_end IS NOT NULL
  `).all() as any[];

  let sent = 0;
  let inApp = 0;
  const emailConfigured = !!process.env.RESEND_API_KEY;

  for (const t of tenants) {
    const end = new Date(t.subscription_end);
    if (isNaN(end.getTime())) continue;
    const tz = safeTz(t.timezone);
    const local = localParts(now, tz);
    const endLocal = localParts(end, tz).date;
    const expired = end.getTime() < now.getTime();
    const daysLeft = daysBetweenStr(local.date, endLocal);

    let milestone: number | null;
    if (expired) {
      if (daysBetweenStr(endLocal, local.date) > EXPIRED_WINDOW_DAYS) continue;
      milestone = EXPIRED_MILESTONE;
    } else {
      milestone = milestoneForDaysLeft(daysLeft);
    }
    if (milestone === null) continue;

    // In-app: idempotente por hito, sin depender de que el email salga.
    inApp += notifyTenantBilling(db, t.id, expired ? 'trial_expired' : 'trial_expiring', {
      key: `m${milestone}`, daysLeft: Math.max(0, daysLeft),
    });

    // Email: solo a partir de la hora local indicada y si el hito no se envio aun.
    if (!emailConfigured || local.hour < EMAIL_LOCAL_HOUR) continue;
    const already = db.prepare('SELECT 1 FROM trial_reminders_sent WHERE tenant_id=? AND days_left=?').get(t.id, milestone);
    if (already) continue;

    let to: string | null = t.email || null;
    if (!to) {
      const owner = db.prepare(`SELECT u.email FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id
        WHERE tm.tenant_id=? AND tm.is_active=1 AND u.is_active=1 AND tm.roles LIKE '%"tenant_owner"%' LIMIT 1`).get(t.id) as any;
      to = owner?.email || null;
    }
    if (!to) continue;

    let ok = false;
    try {
      ok = await sendTrialReminderEmail({
        tenantId: t.id, tenantName: t.name, toEmail: to,
        daysLeft: Math.max(0, daysLeft), expired,
      });
    } catch (e: any) {
      console.error('[trial-reminder] envio fallo:', String(e?.message || e).slice(0, 160));
    }
    // Se marca como enviado SOLO si el email realmente salio; si falla, el proximo tick reintenta.
    if (ok) {
      try {
        db.prepare('INSERT OR IGNORE INTO trial_reminders_sent (id, tenant_id, days_left) VALUES (?,?,?)').run(uuid(), t.id, milestone);
      } catch (_) { /* ya marcado */ }
      sent++;
    }
  }

  return { sent, checked: tenants.length, inApp };
}

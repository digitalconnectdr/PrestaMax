// trialReminderService — recordatorios por email a tenants en trial que
// estan por vencer. Antes no existia NINGUN aviso hacia el tenant (solo se
// enteraba al chocar con el bloqueo de pago). Se dispara a los 3, 1 y 0 dias
// restantes; usa trial_reminders_sent para no reenviar el mismo hito dos veces.
import { uuid } from '../db/database';
import { sendTrialReminderEmail } from './emailService';

// Descendente: 3 dias antes, 1 dia antes, el mismo dia que vence.
const MILESTONES = [3, 1, 0];

export async function runTrialReminderCron(db: any): Promise<{ sent: number; checked: number }> {
  const tenants = db.prepare(`
    SELECT id, name, email, subscription_end
    FROM tenants
    WHERE subscription_status = 'trial' AND is_active = 1 AND subscription_end IS NOT NULL
  `).all() as any[];

  let sent = 0;
  const today = new Date();

  for (const t of tenants) {
    if (!t.email) continue;
    const end = new Date(t.subscription_end);
    const daysLeft = Math.floor((end.getTime() - today.getTime()) / 86400000);

    // No usamos igualdad exacta (daysLeft === 3): el trial se crea a una hora
    // arbitraria del dia, asi que el floor() casi nunca cae justo en 3/1/0 el
    // dia que el cron corre (9am) -- normalmente cae en 2, 0, -1, etc. En vez
    // de eso: se dispara el hito mas grande "vencido" (daysLeft <= hito) que
    // aun no se haya enviado. Con cron diario, en la practica dispara un solo
        // email por dia relevante; si el cron se salto dias, hace catch-up de los
    // hitos pendientes en una sola corrida (mejor eso que nunca avisar).
    for (const milestone of MILESTONES) {
      if (daysLeft > milestone) continue;
      const already = db.prepare('SELECT 1 FROM trial_reminders_sent WHERE tenant_id=? AND days_left=?').get(t.id, milestone);
      if (already) continue;

      const ok = await sendTrialReminderEmail({ tenantId: t.id, tenantName: t.name, toEmail: t.email, daysLeft });
      // Se marca como enviado incluso si el email fallo (ej. Resend no
      // configurado) para no reintentar en cada tick del cron durante el
      // mismo dia -- el proximo hito es la siguiente oportunidad real.
      try {
        db.prepare('INSERT OR IGNORE INTO trial_reminders_sent (id, tenant_id, days_left) VALUES (?,?,?)').run(uuid(), t.id, milestone);
      } catch (_) {}
      if (ok) sent++;
    }
  }

  return { sent, checked: tenants.length };
}

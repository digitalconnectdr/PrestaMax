// analyticsEvents — inserción SERVER-SIDE directa en analytics_events.
// Distinto de POST /public/analytics-event (que es la vía normal, disparada
// por el cliente): esto es para eventos que solo el backend puede confirmar
// con certeza, como subscription_started (la fuente de verdad es el webhook
// de Whop/Stripe, no una redirección del navegador que podría no completarse).
// Reutiliza visitor_id/session_id que el frontend adjuntó como metadata al
// crear el checkout, para que el evento siga correlacionado al mismo visitante
// del funnel de adquisición aunque la confirmación llegue minutos/horas después
// por un webhook sin sesión HTTP del usuario.
import { uuid } from '../db/database';
import { ALLOWED_EVENT_NAMES } from './analyticsHelpers';

export interface ServerAnalyticsEvent {
  eventName: string;
  visitorId?: string | null;
  sessionId?: string | null;
  plan?: string | null;
  billingPeriod?: string | null;
}

export function insertServerAnalyticsEvent(db: any, evt: ServerAnalyticsEvent): void {
  if (!ALLOWED_EVENT_NAMES.has(evt.eventName)) return;
  try {
    db.prepare(`INSERT INTO analytics_events (
        id, event_name, visitor_id, session_id, plan, billing_period, is_bot, properties, created_at
      ) VALUES (?,?,?,?,?,?,0,?,datetime('now'))`)
      .run(
        uuid(), evt.eventName, evt.visitorId || null, evt.sessionId || null,
        evt.plan || null, evt.billingPeriod || null,
        JSON.stringify({ plan: evt.plan || undefined, billing_period: evt.billingPeriod || undefined }),
      );
  } catch (e) {
    console.error(`[analytics] No se pudo registrar evento server-side ${evt.eventName}:`, e);
  }
}

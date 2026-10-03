// ─────────────────────────────────────────────────────────────────────────────
// analyticsServer — contexto de tracking e INSERT de analytics_events del lado
// servidor, compartido por la ingesta publica (/public/analytics-event) y por
// eventos que el backend emite por si mismo (signup_completed/trial_activated
// tras un registro exitoso, ver auth.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { Request } from 'express';
import { uuid } from '../db/database';
import { getClientIp, geolocateIp } from '../services/geoService';
import {
  classifyBot, detectDeviceType, categorizeTrafficSource, stripPotentialPii,
  ONCE_PER_SESSION_EVENTS,
} from './analyticsHelpers';

// Campos comunes de contexto que /track-visit, /analytics-event y el registro
// aceptan del cliente (document.referrer y UTM se capturan en el navegador
// porque el servidor nunca ve el referrer original de una llamada fetch).
// Todo opcional y de solo texto.
export function readTrackingContext(body: any, req: Request) {
  const str = (v: any, max = 300) => (typeof v === 'string' ? v.slice(0, max) : null);
  const userAgent = (req.headers['user-agent'] as string) || '';
  const webdriverFlag = body?.webdriver === true;
  const bot = classifyBot(userAgent, webdriverFlag);
  const referrer = str(body?.referrer, 500);
  const utmSource = str(body?.utm_source);
  const utmMedium = str(body?.utm_medium);
  let currentHost: string | null = null;
  try { currentHost = body?.page_url ? new URL(body.page_url).hostname : null; } catch { currentHost = null; }
  return {
    visitorId: str(body?.visitor_id, 100),
    sessionId: str(body?.session_id, 100),
    referrer,
    utmSource,
    utmMedium,
    utmCampaign: str(body?.utm_campaign),
    utmTerm: str(body?.utm_term),
    utmContent: str(body?.utm_content),
    deviceType: detectDeviceType(userAgent),
    trafficSource: categorizeTrafficSource({ referrer, utmSource, utmMedium, currentHost }),
    userAgent: userAgent.slice(0, 300),
    isBot: bot.isBot ? 1 : 0,
  };
}

/**
 * Inserta una fila en analytics_events. Devuelve false si se omitio (evento
 * "una vez por sesion" que ya existia). Nunca lanza: un fallo de tracking no
 * debe romper la operacion que lo origino.
 */
export function insertAnalyticsEvent(
  db: any,
  req: Request,
  eventName: string,
  ctx: ReturnType<typeof readTrackingContext>,
  opts: { path?: string | null; properties?: Record<string, any> | null } = {},
): boolean {
  try {
    if (ONCE_PER_SESSION_EVENTS.has(eventName) && ctx.sessionId) {
      const dup = db.prepare(`SELECT 1 FROM analytics_events WHERE event_name=? AND session_id=? LIMIT 1`).get(eventName, ctx.sessionId);
      if (dup) return false;
    }
    const geo = geolocateIp(getClientIp(req));
    const cleanProps = stripPotentialPii(opts.properties);
    db.prepare(`INSERT INTO analytics_events (
        id, event_name, visitor_id, session_id, path, cta_location, plan, billing_period,
        scroll_depth, section_name, country, city, device_type, traffic_source,
        referrer, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        user_agent, is_bot, properties, created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))`)
      .run(
        uuid(), eventName, ctx.visitorId, ctx.sessionId, opts.path ?? null,
        typeof cleanProps.cta_location === 'string' ? cleanProps.cta_location.slice(0, 50) : null,
        typeof cleanProps.plan === 'string' ? cleanProps.plan.slice(0, 50) : null,
        typeof cleanProps.billing_period === 'string' ? cleanProps.billing_period.slice(0, 20) : null,
        typeof cleanProps.scroll_depth === 'number' ? cleanProps.scroll_depth : null,
        typeof cleanProps.section === 'string' ? cleanProps.section.slice(0, 50) : null,
        geo?.country || null, geo?.city || null, ctx.deviceType, ctx.trafficSource,
        ctx.referrer, ctx.utmSource, ctx.utmMedium, ctx.utmCampaign, ctx.utmTerm, ctx.utmContent,
        ctx.userAgent, ctx.isBot, JSON.stringify(cleanProps),
      );
    return true;
  } catch {
    return false;
  }
}

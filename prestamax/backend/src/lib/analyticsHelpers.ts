// ─────────────────────────────────────────────────────────────────────────────
// analyticsHelpers — funciones puras usadas por /public/track-visit y
// /public/analytics-event para clasificar trafico ANTES de guardarlo:
// bot/no-bot, tipo de dispositivo, fuente (organic/direct/referral/social/
// paid/unknown) y limpieza defensiva de propiedades que pudieran contener PII.
//
// Deliberadamente sin dependencias de Express/DB: son funciones puras para que
// se puedan probar con vitest sin levantar servidor ni base de datos.
// ─────────────────────────────────────────────────────────────────────────────
import { BOT_UA_PATTERNS as SECURITY_BOT_UA_PATTERNS } from '../middleware/securityMiddleware';

// ── 1. Deteccion de bots para ANALYTICS (distinto del bloqueo de seguridad) ──
// securityMiddleware.BOT_UA_PATTERNS bloquea escaners maliciosos (sqlmap, nikto,
// nmap...). Aqui el objetivo es otro: identificar trafico AUTOMATIZADO pero
// legitimo (buscadores, previsualizadores de redes sociales, crawlers de IA,
// monitores de uptime, navegadores headless) que NO debe contarse como visita
// humana real, sin bloquear su acceso al sitio.
const ANALYTICS_BOT_UA_PATTERNS: RegExp[] = [
  // Buscadores
  /googlebot/i, /bingbot/i, /yandexbot/i, /baiduspider/i, /duckduckbot/i,
  /applebot/i, /sogou/i, /exabot/i, /ia_archiver/i,
  // Previsualizadores de enlaces (redes sociales / mensajeria)
  /facebookexternalhit/i, /slackbot/i, /twitterbot/i, /linkedinbot/i,
  /whatsapp/i, /telegrambot/i, /discordbot/i, /skypeuripreview/i, /pinterest/i,
  // Crawlers de IA / LLM
  /gptbot/i, /chatgpt-user/i, /oai-searchbot/i, /ccbot/i, /claudebot/i,
  /anthropic-ai/i, /claude-web/i, /perplexitybot/i, /google-extended/i,
  /bytespider/i, /meta-externalagent/i, /diffbot/i, /cohere-ai/i,
  // Monitoreo / uptime / performance
  /pingdom/i, /uptimerobot/i, /statuscake/i, /site24x7/i, /newrelic/i,
  /gtmetrix/i, /lighthouse/i, /pagespeed/i, /chrome-lighthouse/i,
  // Automatizacion / navegadores headless / capturas de despliegue
  /headlesschrome/i, /phantomjs/i, /puppeteer/i, /playwright/i, /selenium/i,
  /vercel-screenshot/i, /vercel-favicon/i, /electron/i,
  // Genericos
  /\bbot\b/i, /crawler/i, /spider/i, /crawling/i, /monitor/i, /probe/i,
];

export interface BotClassification {
  isBot: boolean;
  reason: 'user_agent_pattern' | 'missing_user_agent' | 'webdriver_flag' | null;
}

/**
 * Clasifica una solicitud como bot/crawler a partir del User-Agent (y,
 * opcionalmente, la senal navigator.webdriver que el cliente puede reportar).
 *
 * LIMITACION CONOCIDA (documentada, no oculta): esto es deteccion por firma de
 * User-Agent. Un bot que falsifique un User-Agent de navegador real (y no
 * exponga navigator.webdriver) NO sera detectado. No existe una forma 100%
 * confiable de distinguir humano de automatizacion solo con estas señales;
 * esta clasificacion reduce el ruido conocido, no lo elimina.
 */
export function classifyBot(userAgent: string | null | undefined, webdriverFlag?: boolean): BotClassification {
  if (webdriverFlag === true) return { isBot: true, reason: 'webdriver_flag' };
  const ua = (userAgent || '').trim();
  if (!ua) return { isBot: true, reason: 'missing_user_agent' };
  const allPatterns = [...SECURITY_BOT_UA_PATTERNS, ...ANALYTICS_BOT_UA_PATTERNS];
  if (allPatterns.some(p => p.test(ua))) return { isBot: true, reason: 'user_agent_pattern' };
  return { isBot: false, reason: null };
}

// ── 2. Tipo de dispositivo ───────────────────────────────────────────────────
export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

export function detectDeviceType(userAgent: string | null | undefined): DeviceType {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return 'unknown';
  if (/ipad|tablet|kindle|playbook|nexus (7|9|10)|sm-t\d/.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android.*mobile|blackberry|windows phone|opera mini/.test(ua)) return 'mobile';
  return 'desktop';
}

// ── 3. Fuente de trafico (organic / direct / referral / social / paid) ──────
export type TrafficSource = 'organic' | 'direct' | 'referral' | 'social' | 'paid' | 'unknown';

const SEARCH_ENGINE_HOSTS = ['google', 'bing', 'yahoo', 'duckduckgo', 'baidu', 'yandex', 'ecosia', 'brave'];
const SOCIAL_HOSTS = [
  'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 't.co', 'linkedin.com',
  'tiktok.com', 'youtube.com', 'wa.me', 'whatsapp.com', 'pinterest.com', 'reddit.com',
  'threads.net',
];
const PAID_MEDIUM_PATTERN = /^(cpc|ppc|paid|paidsocial|paid-social|display|ads?)$/i;
// Coincidencia EXACTA (no substring) para evitar falsos positivos como
// "newsletter" contra el host "t.co" -> 't'. Solo valores reales de utm_source
// usados en campañas reales de estas plataformas.
const KNOWN_SOCIAL_UTM_SOURCES = new Set([
  'facebook', 'fb', 'instagram', 'ig', 'twitter', 'x', 'tiktok', 'linkedin',
  'youtube', 'pinterest', 'reddit', 'threads', 'whatsapp',
]);

function safeHostname(url: string | null | undefined): string {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

export function categorizeTrafficSource(input: {
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  currentHost?: string | null; // para descartar "referrer" que en realidad es navegacion interna del propio sitio
}): TrafficSource {
  const utmSource = (input.utmSource || '').trim();
  const utmMedium = (input.utmMedium || '').trim();
  const referrerHost = safeHostname(input.referrer);
  const currentHost = (input.currentHost || '').replace(/^www\./, '').toLowerCase();

  if (utmSource) {
    if (PAID_MEDIUM_PATTERN.test(utmMedium)) return 'paid';
    if (KNOWN_SOCIAL_UTM_SOURCES.has(utmSource.toLowerCase())) return 'social';
    return 'referral';
  }

  // Referrer que apunta al propio dominio (navegacion interna) no cuenta como fuente externa.
  if (referrerHost && currentHost && referrerHost === currentHost) return 'direct';

  if (!referrerHost) return 'direct';
  if (SEARCH_ENGINE_HOSTS.some(h => referrerHost.includes(h))) return 'organic';
  if (SOCIAL_HOSTS.some(h => referrerHost === h || referrerHost.endsWith('.' + h))) return 'social';
  return 'referral';
}

// ── 4. Limpieza defensiva de propiedades de eventos (defensa en profundidad) ─
// El cliente NUNCA deberia enviar PII, pero esto es una red de seguridad
// server-side: si una propiedad llega con un nombre sugestivo de dato sensible,
// o un valor con forma de email/telefono, se redacta en vez de guardarse o de
// tirar el evento completo (asi un bug queda visible, no oculto).
// FIX (Fase 4): "name" a secas hacía falso-positivo con "tool_name" (una
// propiedad legítima y no sensible de calculator_used, ver ALLOWED_EVENT_NAMES)
// — cualquier clave que contuviera la subcadena "name" se redactaba, sin
// importar el contexto. El lookbehind excluye ese caso puntual sin debilitar
// la detección real de nombres de persona (full_name, client_name, etc.).
const SENSITIVE_KEY_PATTERN = /email|correo|phone|tel[eé]fono|celular|nombre|(?<!tool_)name|apellido|cedula|c[eé]dula|dni|ssn|rnc|passport|pasaporte|address|direcci[oó]n|monto|amount|contract|contrato|salario|salary|income|ingreso|document|documento/i;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PHONE_LIKE_PATTERN = /(?:\d[\s\-.()]*){7,}\d/;

export function stripPotentialPii<T extends Record<string, any>>(properties: T | null | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  if (!properties || typeof properties !== 'object') return out;
  for (const [key, value] of Object.entries(properties)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) { out[key] = '[redacted:key]'; continue; }
    if (typeof value === 'string') {
      if (EMAIL_PATTERN.test(value)) { out[key] = '[redacted:email]'; continue; }
      if (PHONE_LIKE_PATTERN.test(value)) { out[key] = '[redacted:phone-like]'; continue; }
      out[key] = value.slice(0, 300); // limite de longitud defensivo
      continue;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) { out[key] = value; continue; }
    // objetos/arrays anidados: fuera de alcance para eventos de analytics (deben ser planos)
  }
  return out;
}

// ── 5. Lista blanca de eventos aceptados por /public/analytics-event ────────
// Cualquier nombre fuera de esta lista se rechaza (evita spam/typos silenciosos
// que ensucien el funnel con nombres de evento arbitrarios).
export const ALLOWED_EVENT_NAMES = new Set([
  'landing_view',
  'pricing_view',
  'trial_cta_click',
  'signup_started',
  'signup_completed',
  'trial_activated',
  'billing_toggle_changed',
  'plan_selected',
  'whatsapp_click',
  'section_view',
  'scroll_25',
  'scroll_50',
  'scroll_75',
  'scroll_90',
  'scroll_100',
  // ── Fase 3: activación + checkout/suscripción ──────────────────────────────
  'onboarding_started',
  'first_client_created',
  'first_loan_created',
  'first_payment_created',
  'activation_completed',
  'checkout_started',
  'subscription_started',
  // ── Fase 4: SEO / Centro de Recursos / calculadora pública ─────────────────
  'resource_view',
  'seo_cta_click',
  'calculator_used',
]);

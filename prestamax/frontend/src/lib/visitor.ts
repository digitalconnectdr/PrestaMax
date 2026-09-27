// ─────────────────────────────────────────────────────────────────────────────
// visitor.ts — identidad de visitante/sesion de PRIMERA PARTE, independiente
// de PostHog/Clarity. Si un bloqueador de anuncios impide que PostHog cargue,
// nuestro propio /track-visit y /analytics-event (mismo dominio que la API)
// siguen recibiendo un visitor_id/session_id consistente para el Admin Panel.
//
// DEFINICIONES (documentadas explicitamente, ver reporte de Fase 1):
//   Visitante unico = un UUID anonimo guardado en localStorage. Persiste hasta
//     que el usuario borre datos del sitio. No usa PII de ningun tipo.
//   Sesion = actividad del mismo visitor_id con una ventana de inactividad de
//     30 minutos (mismo criterio que GA4/Universal Analytics). Se renueva en
//     cada evento. Termina si: (a) pasan 30+ min sin actividad, o (b) se
//     cierra la pestaña/navegador y no se vuelve a abrir dentro de esos 30 min
//     (sessionStorage se limpia al cerrar la pestaña).
//   Pageview = una carga real de pagina (fetch a /track-visit desde el mount
//     de LandingPage). Un refresh o volver a abrir la pestaña SI cuenta como
//     una pageview nueva (es una carga real), pero seguira asociado al MISMO
//     visitor_id y, si esta dentro de la ventana de 30 min, a la MISMA sesion.
// ─────────────────────────────────────────────────────────────────────────────

const VISITOR_KEY = 'credytek_visitor_id';
const SESSION_KEY = 'credytek_session_id';
const SESSION_LAST_ACTIVITY_KEY = 'credytek_session_last_activity';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos, estandar de la industria

function safeUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* noop */ }
  // Fallback para entornos sin crypto.randomUUID (no criptograficamente fuerte,
  // pero suficiente para un identificador anonimo no sensible).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function safeStorageGet(storage: Storage, key: string): string | null {
  try { return storage.getItem(key); } catch { return null; }
}
function safeStorageSet(storage: Storage, key: string, value: string): void {
  try { storage.setItem(key, value); } catch { /* noop: storage bloqueado (modo privado, cuotas, etc.) */ }
}

/** UUID anonimo persistente (localStorage). No usa PII. */
export function getVisitorId(): string {
  try {
    let id = safeStorageGet(localStorage, VISITOR_KEY);
    if (!id) {
      id = safeUuid();
      safeStorageSet(localStorage, VISITOR_KEY, id);
    }
    return id;
  } catch {
    // localStorage inaccesible (modo privado estricto, etc.): degradar a un id
    // de solo-esta-carga-de-pagina en vez de romper el tracking.
    return safeUuid();
  }
}

/**
 * Devuelve el session_id activo, rotandolo si pasaron 30+ min desde la ultima
 * actividad registrada. Debe llamarse en CADA evento/pageview (actualiza el
 * timestamp de actividad como efecto secundario).
 */
export function getOrRotateSessionId(nowMs: number = Date.now()): string {
  try {
    const lastActivityRaw = safeStorageGet(sessionStorage, SESSION_LAST_ACTIVITY_KEY);
    const existingId = safeStorageGet(sessionStorage, SESSION_KEY);
    const lastActivity = lastActivityRaw ? parseInt(lastActivityRaw, 10) : NaN;
    const expired = !existingId || Number.isNaN(lastActivity) || (nowMs - lastActivity) > SESSION_TIMEOUT_MS;
    const id = expired ? safeUuid() : existingId!;
    safeStorageSet(sessionStorage, SESSION_KEY, id);
    safeStorageSet(sessionStorage, SESSION_LAST_ACTIVITY_KEY, String(nowMs));
    return id;
  } catch {
    return safeUuid();
  }
}

// ── UTM + referrer: se capturan UNA VEZ por sesion de navegador (sessionStorage)
// en el primer evento, para preservarlos aunque el usuario navegue dentro del
// SPA y la URL/referrer originales ya no esten disponibles en window.location.
export interface AcquisitionContext {
  referrer: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
}

const ACQUISITION_KEY = 'credytek_acquisition_ctx';

function captureAcquisitionContextNow(): AcquisitionContext {
  let params: URLSearchParams;
  try { params = new URLSearchParams(window.location.search); } catch { params = new URLSearchParams(); }
  return {
    referrer: (typeof document !== 'undefined' && document.referrer) || '',
    utm_source: params.get('utm_source'),
    utm_medium: params.get('utm_medium'),
    utm_campaign: params.get('utm_campaign'),
    utm_term: params.get('utm_term'),
    utm_content: params.get('utm_content'),
  };
}

/**
 * Devuelve el contexto de adquisicion (referrer + UTM) de la PRIMERA carga de
 * esta sesion de navegador. Si la URL actual trae UTMs nuevos, se actualizan
 * (permite que un mismo visitante recurrente traiga una campaña distinta),
 * pero el referrer original de la sesion se conserva si ya existia.
 */
export function getAcquisitionContext(): AcquisitionContext {
  const current = captureAcquisitionContextNow();
  try {
    const storedRaw = safeStorageGet(sessionStorage, ACQUISITION_KEY);
    const stored: AcquisitionContext | null = storedRaw ? JSON.parse(storedRaw) : null;
    const hasNewUtm = !!(current.utm_source || current.utm_medium || current.utm_campaign);
    const merged: AcquisitionContext = stored && !hasNewUtm
      ? { ...stored }
      : { ...current, referrer: stored?.referrer || current.referrer };
    safeStorageSet(sessionStorage, ACQUISITION_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return current;
  }
}

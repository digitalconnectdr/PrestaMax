// Zona horaria del tenant para decisiones de "hoy" (mora, recordatorios, crons).
// El servidor corre en UTC; sin esto un tenant en UTC-4 "cambia de dia" a las
// 20:00 locales. Se usa tenants.timezone (default del modelo: America/Santo_Domingo).
export const DEFAULT_TZ = 'America/Santo_Domingo';

const fmtCache = new Map<string, Intl.DateTimeFormat>();

/** Devuelve la zona si es una IANA valida; si no, el default del modelo. */
export function safeTz(tz?: string | null): string {
  const candidate = (tz || '').trim() || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate });
    return candidate;
  } catch (_) {
    return DEFAULT_TZ;
  }
}

function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Fecha (YYYY-MM-DD) y hora (0-23) locales de `now` en la zona dada. */
export function localParts(now: Date, tz?: string | null): { date: string; hour: number } {
  const parts = formatter(safeTz(tz)).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}

/** YYYY-MM-DD local de un instante. */
export function localDate(now: Date, tz?: string | null): string {
  return localParts(now, tz).date;
}

/**
 * Instante "as of" para el motor de mora (que cuenta dias de calendario UTC):
 * mediodia UTC de la fecha LOCAL del tenant. Asi el dia UTC del resultado == dia
 * local, sin importar la hora del servidor.
 */
export function asOfForTz(now: Date, tz?: string | null): Date {
  return new Date(localDate(now, tz) + 'T12:00:00Z');
}

/** Suma `n` dias a una fecha YYYY-MM-DD (calendario, sin DST). */
export function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(dateStr.slice(0, 10) + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dias de calendario de `a` a `b` (b - a), ambos YYYY-MM-DD. */
export function daysBetweenStr(a: string, b: string): number {
  const ma = Date.parse(a.slice(0, 10) + 'T00:00:00Z');
  const mb = Date.parse(b.slice(0, 10) + 'T00:00:00Z');
  return Math.round((mb - ma) / 86400000);
}

/** Zona del tenant (con fallback al default del modelo). */
export function tenantTz(db: any, tenantId: string): string {
  try {
    const row = db.prepare('SELECT timezone FROM tenants WHERE id=?').get(tenantId) as any;
    return safeTz(row?.timezone);
  } catch (_) {
    return DEFAULT_TZ;
  }
}

/** asOf de mora para un tenant (ver asOfForTz). */
export function tenantAsOf(db: any, tenantId: string, now: Date = new Date()): Date {
  return asOfForTz(now, tenantTz(db, tenantId));
}

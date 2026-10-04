// Monedas de operación del tenant.
//
// - DOP es la moneda base INTERNA del sistema (consolidación y reportes se
//   normalizan a DOP con exchange_rate_to_dop): siempre está habilitada y no se
//   puede quitar.
// - tenant_settings.enabled_currencies es la fuente de verdad de las monedas
//   permitidas para préstamos NUEVOS. multi_currency_enabled es DERIVADO
//   (true <=> hay al menos una moneda adicional a DOP); se mantiene por compat.
// - tenants.currency es solo un dato heredado: no gobierna monedas.
// - Los préstamos existentes conservan su moneda aunque luego se deshabilite.

import { randomUUID } from 'crypto';

export const BASE_CURRENCY = 'DOP';
// Catálogo oficial (mismo orden que frontend/src/lib/utils.ts SUPPORTED_CURRENCIES).
export const CURRENCY_CATALOG = ['DOP', 'USD', 'EUR', 'HTG', 'MXN', 'COP', 'PEN', 'CLP', 'BOB', 'UYU', 'BRL', 'GTQ'] as const;

const upper = (v: any) => String(v ?? '').trim().toUpperCase();

/** Error si la lista trae algo que no sea un código del catálogo; null si es válida. */
export function validateCurrencyInput(list: unknown): string | null {
  if (list === undefined) return null;
  if (!Array.isArray(list)) return 'La lista de monedas debe ser un arreglo de códigos';
  const bad = list.map(upper).filter(c => !(CURRENCY_CATALOG as readonly string[]).includes(c));
  return bad.length ? `Moneda no soportada: ${bad.join(', ')}` : null;
}

/** Lista final: sin duplicados, solo catálogo, DOP siempre presente y primero. */
export function normalizeEnabledCurrencies(list: unknown): string[] {
  const set = new Set<string>([BASE_CURRENCY]);
  if (Array.isArray(list)) {
    for (const c of list.map(upper)) if ((CURRENCY_CATALOG as readonly string[]).includes(c)) set.add(c);
  }
  return (CURRENCY_CATALOG as readonly string[]).filter(c => set.has(c));
}

/** Monedas con las que el tenant puede crear préstamos NUEVOS. */
export function getEnabledCurrencies(db: any, tenantId: string): string[] {
  const row = db.prepare('SELECT multi_currency_enabled, enabled_currencies FROM tenant_settings WHERE tenant_id=?').get(tenantId) as any;
  if (!row || !row.multi_currency_enabled) return [BASE_CURRENCY];
  let parsed: unknown = [];
  try { parsed = JSON.parse(row.enabled_currencies || '[]'); } catch (_) { parsed = []; }
  return normalizeEnabledCurrencies(parsed);
}

export function isCurrencyEnabled(db: any, tenantId: string, code: string): boolean {
  return getEnabledCurrencies(db, tenantId).includes(upper(code));
}

/** Mensaje y código estándar cuando se intenta crear un préstamo en una moneda no habilitada. */
export function currencyNotEnabledError(code: string) {
  return {
    error: `La moneda ${upper(code)} no está habilitada para esta empresa. Habilítala en Configuración → General → Operación.`,
    code: 'CURRENCY_NOT_ENABLED',
  };
}

/**
 * Persiste las monedas de operación. Reglas:
 *  - DOP siempre incluida.
 *  - multi_currency_enabled se DERIVA de la lista (más de una moneda).
 *  - Compat: si llega multi_currency_enabled === false, la lista colapsa a ['DOP'].
 *  - Si llega solo multi_currency_enabled (API antigua) sin lista, se conserva la lista guardada.
 * No toca préstamos ni cuentas existentes. Debe llamarse con la lista ya validada.
 * Devuelve la lista efectiva y el flag derivado.
 */
export function applyCurrencySettings(
  db: any, tenantId: string, body: { enabled_currencies?: unknown; multi_currency_enabled?: unknown },
  nowIso: string,
): { enabled_currencies: string[]; multi_currency_enabled: boolean } {
  const existing = db.prepare('SELECT id, enabled_currencies FROM tenant_settings WHERE tenant_id=?').get(tenantId) as any;
  let source: unknown = body.enabled_currencies;
  if (source === undefined) {
    try { source = existing ? JSON.parse(existing.enabled_currencies || '[]') : []; } catch (_) { source = []; }
  }
  let enabled = normalizeEnabledCurrencies(source);
  if (body.multi_currency_enabled === false || body.multi_currency_enabled === 0) enabled = [BASE_CURRENCY];
  const multi = enabled.length > 1;
  if (existing) {
    db.prepare('UPDATE tenant_settings SET multi_currency_enabled=?, enabled_currencies=?, updated_at=? WHERE tenant_id=?')
      .run(multi ? 1 : 0, JSON.stringify(enabled), nowIso, tenantId);
  } else {
    db.prepare('INSERT INTO tenant_settings (id,tenant_id,multi_currency_enabled,enabled_currencies) VALUES (?,?,?,?)')
      .run(randomUUID(), tenantId, multi ? 1 : 0, JSON.stringify(enabled));
  }
  return { enabled_currencies: enabled, multi_currency_enabled: multi };
}

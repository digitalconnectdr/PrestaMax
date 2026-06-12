/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PrestaMax — Validación de entorno al arranque (fail-fast)
 * Evita desplegar en producción con secretos faltantes, débiles o de demo.
 * Se ejecuta una sola vez en index.ts antes de levantar el servidor.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const IS_PROD = process.env.NODE_ENV === 'production';

// Secretos conocidos de desarrollo / ejemplo que JAMÁS deben usarse en producción.
const KNOWN_WEAK_SECRETS = new Set([
  '4ea31d44dbb8cf736f430ce669893f4e6efc8ad347f9930a45b2e1a6c56dca3e39da8fae10ecf411a2c09e6fb65a828f',
  'changeme', 'secret', 'jwt_secret', 'your-secret-key', 'dev', 'development',
  'supersecret', 'prestamax', 'test',
]);

/**
 * Valida las variables de entorno críticas. En producción aborta el proceso si
 * algo esencial falta o es inseguro. En desarrollo solo emite advertencias.
 */
export function validateEnv(): void {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ── JWT_SECRET: es el secreto que firma TODAS las sesiones ──────────────────
  const jwt = process.env.JWT_SECRET || '';
  if (!jwt) {
    errors.push('JWT_SECRET no está configurado. Es obligatorio para firmar sesiones.');
  } else {
    if (jwt.length < 32) {
      errors.push(`JWT_SECRET es demasiado corto (${jwt.length} caracteres). Usa al menos 32 caracteres aleatorios.`);
    }
    if (KNOWN_WEAK_SECRETS.has(jwt.toLowerCase())) {
      errors.push('JWT_SECRET es un valor de demo/ejemplo conocido. Genera uno nuevo: openssl rand -hex 48');
    }
  }

  // ── Stripe (opcional, pero si hay una clave debe estar completa) ────────────
  const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;
  const hasStripeWebhook = !!process.env.STRIPE_WEBHOOK_SECRET;
  if (hasStripeKey && !hasStripeWebhook) {
    warnings.push('STRIPE_SECRET_KEY está configurada pero falta STRIPE_WEBHOOK_SECRET: los webhooks no podrán verificar firma.');
  }
  if (IS_PROD && process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    warnings.push('Estás usando una clave de Stripe de PRUEBA (sk_test_) en producción.');
  }

  // ── FRONTEND_URL en producción debe ser https ───────────────────────────────
  const frontend = process.env.FRONTEND_URL || '';
  if (IS_PROD && frontend && !frontend.startsWith('https://')) {
    warnings.push(`FRONTEND_URL no usa HTTPS en producción: "${frontend}".`);
  }

  // ── Reportar ────────────────────────────────────────────────────────────────
  for (const w of warnings) console.warn(`[env][WARN] ${w}`);

  if (errors.length > 0) {
    console.error('\n[env][FATAL] Configuración de seguridad inválida:');
    for (const e of errors) console.error(`  ✗ ${e}`);
    if (IS_PROD) {
      console.error('\nEl servidor NO arrancará en producción hasta corregir lo anterior.\n');
      process.exit(1);
    } else {
      console.error('  (En desarrollo se permite continuar, pero corrige esto antes de desplegar.)\n');
    }
  } else {
    console.log('[env] Validación de entorno OK.');
  }
}

# Guía: Activar Sentry (logs estructurados + tracking de errores)

La integración de Sentry está **lista en el código pero opt-in**: solo se activa cuando defines las variables de entorno. Sin estas vars, todo funciona normal y Sentry no se inicia.

## ¿Qué te da Sentry?

- **Errores 500 del backend** con stack trace completo, query DB que falló, etc.
- **Errores no-manejados del frontend** (JS exceptions, render crashes)
- **Tag por tenant_id y user_id** — sabes a quién le falló
- **Performance traces** (opcional, 10% sampling por defecto)
- **Alertas por email/Slack** cuando hay un pico de errores

Tier gratuito: 5K errores/mes, 10K spans/mes. Más que suficiente para empezar.

---

## Paso 1 — Crear cuenta y proyecto

1. Ve a https://sentry.io/signup/
2. Crea organización ("PrestaMax")
3. Crea proyecto Backend: plataforma **Node.js / Express** → copia el DSN
4. Crea proyecto Frontend: plataforma **React** → copia el DSN

Cada proyecto tiene su propio DSN. Esto es importante para separar errores de backend vs frontend.

---

## Paso 2 — Instalar dependencias

### Backend (Render):

```bash
cd prestamax/backend
npm install @sentry/node
```

### Frontend (Vercel):

```bash
cd prestamax/frontend
npm install @sentry/react
```

Commit + push estos `package.json` updates.

---

## Paso 3 — Configurar variables de entorno

### Backend en Render:

| Variable | Valor |
|----------|-------|
| `SENTRY_DSN` | `https://abc...@xxx.ingest.sentry.io/1234567` (el del proyecto Backend) |
| `SENTRY_TRACES` | `0.1` (10% de muestreo de performance, opcional) |

### Frontend en Vercel:

| Variable | Valor |
|----------|-------|
| `VITE_SENTRY_DSN` | `https://xyz...@xxx.ingest.sentry.io/9876543` (el del proyecto Frontend) |

> ⚠️ El frontend necesita el prefijo `VITE_` para que Vite lo exponga al cliente.

---

## Paso 4 — Re-deploy

Tras agregar las env vars:
- **Render** reinicia el backend automáticamente
- **Vercel** necesita un nuevo push (o "Redeploy" manual) porque las env vars `VITE_*` se compilan en el bundle

En los logs de Render verás: `[sentry] inicializado para entorno: production`
En la consola del navegador (modo dev) verás: `[sentry] inicializado`

---

## Paso 5 — Probar que funciona

1. Provoca un error 500 a propósito (ej: con DevTools llama un endpoint que no exista)
2. Ve a tu dashboard de Sentry (Issues) — debería aparecer el error en <30 segundos
3. Verifica que el error tenga tags `tenant_id` y `user_id`

---

## Datos sensibles — qué NO se envía

Por configuración:
- `sendDefaultPii: false` — Sentry no envía IPs ni headers PII por defecto
- `beforeSend` filtra errores 4xx (no nos interesan, son problemas del cliente)
- Datos de tarjetas de crédito no llegan al backend (van directo a Stripe), así que nunca podrían filtrarse

Si quieres ser más estricto, agrega `denyUrls` o `ignoreErrors` adicionales en `prestamax/backend/src/lib/sentry.ts`.

---

## Costo

| Plan | Eventos/mes | Precio |
|------|-------------|--------|
| Developer (gratis) | 5K | $0 |
| Team | 50K | $26/mes |
| Business | 100K+ | $80/mes |

Para PrestaMax con pocos tenants, el plan Developer gratis sobra hasta tener varias decenas de clientes activos.

---

## Desactivar Sentry temporalmente

Solo borra `SENTRY_DSN` (Render) y `VITE_SENTRY_DSN` (Vercel) → re-deploy. El código sigue ahí pero el módulo es no-op.

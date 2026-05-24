# Guía: Activar Stripe en Modo Live (Producción)

**Fecha:** 24 de mayo de 2026
**Estado actual:** Stripe está en Test Mode (`sk_test_...`)
**Meta:** Migrar a Live Mode para cobrar suscripciones reales

---

## TL;DR — Resumen rápido

El **código de PrestaMax no necesita cambios** para Live. Stripe se controla por variables de entorno. Para pasar a Live solo hay que:

1. Verificar tu cuenta Stripe (identidad + cuenta bancaria) — esto lo hace Stripe, no nosotros.
2. Crear los 4 Productos y Precios en el **Dashboard de Stripe en Live Mode**.
3. Configurar el endpoint de **Webhook Live**.
4. Cambiar **5 variables de entorno en Render** (backend).
5. Probar con una tarjeta real (puedes hacerte un cobro de RD$50 a ti mismo).

Tiempo estimado: **1–2 horas** (excluyendo la verificación de Stripe que puede tardar 1–3 días hábiles).

---

## Paso 1 — Verificar tu cuenta Stripe

Antes de poder recibir pagos reales, Stripe necesita verificar tu identidad y tu empresa.

1. Entra a https://dashboard.stripe.com y arriba a la izquierda asegúrate que dice "Test mode" — eso significa que estás viendo el modo prueba.
2. Haz clic en el toggle **"Test mode"** para apagarlo. Te llevará al **Live mode**.
3. Si es la primera vez, Stripe te pedirá completar tu perfil de negocio:
   - **Tipo de empresa**: Individual / Empresa
   - **Información fiscal**: RNC (si es empresa) o cédula (si es individual)
   - **Domicilio comercial** (dirección física)
   - **Información del representante** (nombre, fecha de nacimiento, cédula)
   - **Industria**: "Software / SaaS" o "Financial services"
4. **Conectar cuenta bancaria** para recibir los depósitos:
   - Stripe procesa en USD pero deposita en DOP (RD$) si tu cuenta es dominicana.
   - Necesitarás: número de cuenta, banco (Popular, BHD, Reservas, etc.) y nombre del titular.
5. **Activar la cuenta**: Stripe revisará y aprobará tu cuenta. Puede tardar de unas horas a 1–3 días hábiles.

> ⚠️ **Sin verificación no puedes ir Live.** Stripe te rechazará los pagos automáticamente hasta que la cuenta esté aprobada.

---

## Paso 2 — Crear Productos y Precios en Live Mode

Una vez que estás en el modo Live del dashboard de Stripe:

1. Ve a **Productos** → **Catálogo de productos**.
2. Crea estos 4 productos (uno por cada plan de PrestaMax):

| Producto       | Precio        | Recurrencia | Slug interno   |
|----------------|---------------|-------------|----------------|
| PrestaMax Starter      | $29.99 USD  | Mensual | `starter`     |
| PrestaMax Básico       | $59.99 USD  | Mensual | `basico`      |
| PrestaMax Profesional  | $119.99 USD | Mensual | `profesional` |
| PrestaMax Enterprise   | $249.99 USD | Mensual | `enterprise`  |

**Para cada producto:**
- Nombre: el que aparece en la tabla
- Descripción opcional: la que viste en el landing
- Precio recurrente: ese monto, mensual
- Moneda: **USD**

3. Al guardar cada uno, copia el **Price ID** que empieza con `price_` (por ejemplo `price_1Q4abcXYZ123...`). Guárdalos para el paso 4.

> 💡 **Tip:** Tus Price IDs de Test (`price_1OAB...test`) **no funcionan en Live**. Tienes que crear precios nuevos en Live.

---

## Paso 3 — Configurar el Webhook de Stripe (Live)

El webhook es lo que avisa a PrestaMax cuando alguien paga, renueva o cancela.

1. En el dashboard de Stripe (en Live mode), ve a **Desarrolladores** → **Webhooks** → **+ Agregar endpoint**.
2. **URL del endpoint**: `https://prestamax-backend.onrender.com/api/billing/webhook` (sustituye con la URL real de tu backend en Render).
3. **Eventos a escuchar** (selecciona estos 4):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Guarda. Stripe te mostrará el **Signing secret** (comienza con `whsec_`). Cópialo, lo necesitarás en el siguiente paso.

> ⚠️ El webhook de Test y el de Live tienen **secrets distintos**. No mezcles.

---

## Paso 4 — Actualizar variables de entorno en Render

1. Entra a https://dashboard.render.com y selecciona tu servicio del backend de PrestaMax.
2. Ve a la pestaña **Environment**.
3. Reemplaza estas 6 variables (todas deben pasar de `_test` a `_live` / sus valores Live):

| Variable                       | Valor Test (actual)            | Valor Live (nuevo)                |
|--------------------------------|--------------------------------|-----------------------------------|
| `STRIPE_SECRET_KEY`            | `sk_test_...`                  | `sk_live_...`                     |
| `STRIPE_WEBHOOK_SECRET`        | `whsec_...` (del webhook Test) | `whsec_...` (del webhook Live)    |
| `STRIPE_PRICE_STARTER`         | `price_test_starter...`        | `price_live_starter...`           |
| `STRIPE_PRICE_BASICO`          | `price_test_basico...`         | `price_live_basico...`            |
| `STRIPE_PRICE_PROFESIONAL`     | `price_test_profesional...`    | `price_live_profesional...`       |
| `STRIPE_PRICE_ENTERPRISE`      | `price_test_enterprise...`     | `price_live_enterprise...`        |

**Dónde encontrar `sk_live_...`:**
- Stripe Dashboard (Live mode) → **Desarrolladores** → **Claves API** → "Clave secreta estándar" → "Revelar clave Live".

4. Guarda los cambios. Render reiniciará el backend automáticamente (~2–3 minutos).

> ⚠️ Nada de esto se cambia en Vercel — el frontend no usa claves de Stripe, solo el backend.

---

## Paso 5 — Probar con un pago real

Antes de anunciar nada, prueba con tu propia tarjeta:

1. Crea un usuario nuevo o usa tu cuenta de prueba.
2. Ve a **Configuración → Suscripción** y selecciona el plan **Starter** ($29.99).
3. Te llevará al checkout de Stripe. **Esta vez no aceptará 4242 4242 4242 4242** — esos son test cards. Tendrás que usar una tarjeta real.
4. Completa el pago. Verás el cargo real en tu tarjeta.
5. **Verifica que:**
   - El tenant pasa de `trial` a `active` (en la BD o en la UI).
   - El badge "Día 1/30" desaparece y muestra el plan correcto.
   - En el Stripe Dashboard (Live), aparece el pago en **Pagos**.
6. **Inmediatamente cancela la suscripción** desde el Customer Portal o desde el dashboard de Stripe para no seguir pagándote a ti mismo.
7. Pide reembolso desde el Stripe Dashboard si lo deseas (no hay penalidad).

---

## Paso 6 — Checklist final antes de anunciar

- [ ] Cuenta Stripe aprobada y cuenta bancaria conectada.
- [ ] 4 productos creados en Stripe Live con sus Price IDs guardados.
- [ ] Webhook Live configurado en `https://[backend]/api/billing/webhook`.
- [ ] 6 variables de entorno en Render actualizadas a valores Live.
- [ ] Test con tarjeta real exitoso (cobro + activación de suscripción + webhook recibido).
- [ ] Cancelación / refund probada también desde el Customer Portal.
- [ ] **Backup de la base de datos antes de ir Live** (por si acaso).
- [ ] Mover los logs del backend a algo persistente si no lo tienes ya (LogTail, Better Stack, etc.) — para investigar disputas futuras.

---

## ¿Y si algo falla?

**Síntoma**: El checkout abre pero da error "Stripe no está configurado".
→ Revisa que `STRIPE_SECRET_KEY` esté en Render y que el backend haya reiniciado.

**Síntoma**: El pago se hace pero el tenant no se activa.
→ Revisa los logs del webhook en Stripe Dashboard → **Desarrolladores → Webhooks → tu endpoint → Intentos recientes**. Si falla con 400 "signature verification", el `STRIPE_WEBHOOK_SECRET` está mal.

**Síntoma**: El usuario ve "Plan no disponible para suscripción".
→ Falta el `STRIPE_PRICE_*` correspondiente en las env vars.

**Síntoma**: Stripe rechaza pagos con "Your account isn't activated".
→ Tu cuenta Stripe aún no está aprobada para Live. Espera o contacta soporte de Stripe.

---

## Notas adicionales

- **El código no cambia entre Test y Live.** Todo se controla por env vars. Esto es intencional.
- **Mantén las claves Test funcionando en local.** Tu `backend/.env` de desarrollo puede seguir con `sk_test_...` para que las pruebas locales no cobren dinero real.
- **No commitees `sk_live_...` a Git nunca.** Vive solo en Render.
- Stripe cobra ~2.9% + $0.30 USD por transacción. Para una suscripción de $29.99 te quedan ~$28.83.
- En República Dominicana hay también un **0.15% adicional por conversión** cuando se deposita en DOP.

---

**Una vez aprobada la cuenta y completados los pasos 2–5, PrestaMax está cobrando suscripciones reales.** 🎉

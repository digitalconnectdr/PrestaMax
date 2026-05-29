# Guía: Activar Lemon Squeezy como pasarela de pago

**Cuándo usar esta guía:** cuando tengas 3-5 clientes pagando manualmente y quieras
ofrecerle a nuevos prospectos pagar self-service por tarjeta de crédito.

Mientras tanto, el flujo manual de leads vía landing → WhatsApp → cobro manual
funciona perfectamente bien y NO requiere Lemon Squeezy.

---

## ¿Por qué Lemon Squeezy?

Lemon Squeezy actúa como **"Merchant of Record"** (vendedor oficial):
ellos venden el producto en su nombre, manejan el cumplimiento legal
(IVA en cada país, refunds, chargebacks, facturas fiscales), y te depositan
las ganancias en tu cuenta bancaria personal.

Para vos esto significa:
- **NO necesitas LLC ni C-Corp** — basta con tu cédula dominicana
- **NO necesitas cuenta bancaria empresarial** — basta con cuenta personal
- **NO tienes que pagar IVA de cada país** — lo hace Lemon
- El fee es ~5% + $0.50 por transacción (comparado con Stripe ~2.9% + $0.30)

El extra ~2% lo pagas tranquilamente a cambio de saltarte toda la fricción legal/contable
internacional. Cuando tu MRR sea grande (>$5K/mes), tiene sentido evaluar migrar a Stripe
con LLC propia para ahorrar ese ~2%.

---

## Paso 1: Crear cuenta en Lemon Squeezy

1. Entra a https://www.lemonsqueezy.com
2. Clic en **"Get started for free"** (arriba a la derecha)
3. Regístrate con tu email (`jcpenalo@digitalconnectdr.com`)
4. Confirma el correo de verificación

## Paso 2: Configurar tu tienda

1. Al primer login te pide crear una **store**
2. Datos:
   - **Store name**: `PrestaMax`
   - **Store URL**: `prestamax` (será `prestamax.lemonsqueezy.com`)
   - **Currency**: `USD`
   - **Industry**: `Software`
3. Save

## Paso 3: Información fiscal y bancaria

Esta es la parte sensible. En **Settings → Profile and tax**:

- **Country**: República Dominicana
- **Tax ID type**: Personal ID (cédula)
- **Tax ID**: tu cédula
- **Address**: tu dirección personal

En **Settings → Payouts**:

- **Payout method**: Wire transfer a banco internacional, PayPal, o Wise (este último
  es el que recomiendo — Wise te da una "cuenta USD" virtual con número de cuenta y routing
  que aceptan Lemon, y te convierte a DOP a buena tasa cuando lo retiras)
- Si eliges PayPal: tu PayPal personal funciona (asegúrate de que esté verificado)

## Paso 4: Crear los productos (Subscription)

En **Products → New Product**:

Para cada plan (Starter, Básico, Profesional, Enterprise) crea un producto:

**Producto 1: Starter**
- Name: `PrestaMax Starter`
- Type: **Subscription**
- Price: `$29.99 USD`
- Billing interval: `Monthly`
- Trial: 14 days
- Description: copia del que tienes en la landing
- Repite para Básico ($59.99), Profesional ($119.99), Enterprise ($249.99)

Anota el **Variant ID** de cada producto — los vas a necesitar para configurar Render.

## Paso 5: Obtener API key y configurar webhook

En **Settings → API**:

1. Clic en **"Create API key"**
2. Name: `prestamax-backend`
3. Scopes: marca todos (read/write subscriptions, products, customers)
4. **Copia el API key** — solo se muestra una vez (empieza con `lsq_...`)

En **Settings → Webhooks**:

1. Clic **"Add webhook"**
2. URL: `https://prestamax-api.onrender.com/api/billing/lemon-webhook`
3. Signing secret: genera uno aleatorio (Lemon te lo muestra) — anótalo
4. Events: marca al menos:
   - `subscription_created`
   - `subscription_updated`
   - `subscription_cancelled`
   - `subscription_payment_success`
   - `subscription_payment_failed`

## Paso 6: Variables de entorno en Render

En el dashboard de Render → Backend → Environment:

```
LEMON_API_KEY=lsq_...
LEMON_STORE_ID=12345        # lo ves en Settings → Stores
LEMON_WEBHOOK_SECRET=...     # el que generaste en paso 5

# Variant IDs de cada plan (los obtuviste en paso 4)
LEMON_VARIANT_STARTER=...
LEMON_VARIANT_BASICO=...
LEMON_VARIANT_PROFESIONAL=...
LEMON_VARIANT_ENTERPRISE=...
```

## Paso 7: Activar el código

El backend ya tiene el esqueleto del servicio en
`backend/src/services/lemonSqueezyService.ts`. En la próxima sesión completaremos
la implementación:

1. `createCheckout(planSlug, tenantId)` → genera URL de Lemon que el cliente paga
2. `handleWebhook(event)` → procesa los webhooks (activar/cancelar subscripción)
3. UI: agregar botón "Pagar ahora" en `/billing` que llama a `createCheckout`

---

## Pruebas

Lemon te da una herramienta de **test mode** donde puedes hacer compras con
tarjetas de prueba (ej `4242 4242 4242 4242`). Prueba un ciclo completo antes
de pasar a producción.

---

## Costos comparados

| Procesador  | Setup       | Fee transacción     | Manejo IVA       | LLC requerida |
|-------------|-------------|--------------------|----- -------------|---------------|
| **Lemon Squeezy** | $0 + 30 min | ~5% + $0.50         | Lemon lo hace    | NO            |
| Paddle      | $0 + 1 hora | ~5% + $0.50         | Paddle lo hace   | NO            |
| Stripe      | $500 (Atlas) | 2.9% + $0.30        | Tú lo haces     | SÍ            |
| Mercado Pago | $0          | ~3.5-4.5%           | Mercado lo hace  | NO (en algunos países) |

Ejemplo: con 50 clientes pagando $60/mes ($3,000 MRR):
- Lemon Squeezy fee: ~$175/mes
- Stripe fee:       ~$90/mes  (pero $500+ una vez + setup LLC + contador)

Punto de equilibrio: a partir de ~$10K MRR ya vale la pena evaluar Stripe.

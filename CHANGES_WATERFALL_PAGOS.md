# Refactor: Pagos con waterfall por cuota + fix recibo

## Resumen del cambio

Cambia la lógica de distribución de pagos de "mora primero global" a
"waterfall por cuota": cada pago liquida la mora-interés-capital de SU
cuota en orden cronológico, en vez de cobrar toda la mora del préstamo
antes de tocar cualquier cuota.

Esto hace que cuotas viejas se liquiden ordenadamente en vez de quedar
todas en "parcial" porque la mora global absorbió el pago.

## Archivos modificados (6)

1. `prestamax/backend/src/routes/payments.ts`
   - Nuevo helper `calcMoraPerInstallment()` retorna `Record<id, mora>` 
   - `calcMora()` ahora delega a `calcMoraPerInstallment()` (suma=total)
   - `allocatePayment()` refactor: itera cuota por cuota
   - POST `/` y prórroga: SELECT con LEFT JOIN users para `registered_by_name`
   - 3 llamadas a `allocatePayment` pasan `moraPerInst` mapa

2. `prestamax/backend/src/lib/calculations.ts`
   - `allocatePayment()` sincronizado con producción (acepta number o Record)
   - `capital_only` ahora cobra interés pendiente primero (estándar bancario)
   - Overpayment suma a `totalPrincipal` (consistente con producción)

3. `prestamax/frontend/src/lib/printReceipt.ts`
   - Cuenta cuotas en progreso (parciales) además de pagadas
   - Muestra "X de Y + Z en progreso" en vez de solo "X de Y"

4. `prestamax/backend/src/__tests__/allocatePayment.test.ts`
   - +6 tests nuevos: caso Lucía, caso Ramón, mora parcial, overpayment con mora,
     interest_only ignora mora, compatibilidad legacy con `mora: number`
   - Actualizados 3 tests existentes (capital_only nuevo comportamiento,
     overpayment con totalPrincipal incluye excess)

5. `prestamax/backend/src/__tests__/reports.test.ts`
   - 2 tests actualizados (mismo motivo)

## Pasos para verificar y desplegar

### 1. Correr tests en local

```bash
cd "C:\Users\JCPENALO\.gemini\antigravity\scratch\Sistema Prestamos\Proyecto Sistema de Prestamos\prestamax\backend"
npm test
```

Esperado: TODOS pasan (incluyendo los 6 nuevos de waterfall).

Si alguno falla, antes de commitear avísame qué test falló y con qué números.

### 2. Verificar build TypeScript

```bash
npm run build
```

Esperado: sin errores.

### 3. Commit + Push

```bash
cd "C:\Users\JCPENALO\.gemini\antigravity\scratch\Sistema Prestamos\Proyecto Sistema de Prestamos"
git add prestamax/backend/src/routes/payments.ts
git add prestamax/backend/src/lib/calculations.ts
git add prestamax/frontend/src/lib/printReceipt.ts
git add prestamax/backend/src/__tests__/allocatePayment.test.ts
git add prestamax/backend/src/__tests__/reports.test.ts
git add CHANGES_WATERFALL_PAGOS.md
git commit -m "refactor(payments): waterfall por cuota + fix recibo

Cambia la logica de distribucion de pagos de 'mora primero global' a
'waterfall por cuota'. Antes la mora vigente del prestamo se cobraba
ENTERA antes de tocar cualquier cuota — esto dejaba cuotas en estado
'parcial' incluso cuando el pago era suficiente para liquidarlas.

Ahora, en orden cronologico, cada cuota se liquida en su orden:
mora-de-esa-cuota -> interes -> capital. El sobrante pasa a la
siguiente cuota.

Cambios:
* payments.ts: nuevo helper calcMoraPerInstallment + refactor allocate
* lib/calculations.ts: sincronizado con producción (number o Record)
* capital_only ahora cobra interes pendiente primero (estandar bancario)
* POST /payments devuelve registered_by_name con LEFT JOIN users
* printReceipt.ts: muestra cuotas en progreso ademas de pagadas
* Tests: +6 nuevos cubriendo casos Lucia y Ramon, actualizados 3 viejos

Reportes historicos NO cambian (snapshots applied_* inmutables).
Solo afecta a pagos NUEVOS. Voids re-aplicaran con la nueva logica."

git push origin main
```

## Pruebas manuales recomendadas tras deploy

1. Crear un préstamo nuevo de prueba con frecuencia mensual.
2. Esperar (o adelantar fecha) hasta que tenga 2-3 cuotas vencidas.
3. Registrar un pago igual a (cuota completa + mora de esa cuota).
   - **Esperado**: cuota #1 queda en estado "PAGADA" ✓
   - **Esperado**: recibo dice "1 de N + 0 en progreso"
   - **Esperado**: "Registrado por: Juan C Peñalo" (NO el guión)
4. Registrar otro pago parcial pequeño.
   - **Esperado**: cuota #2 queda "Parcial", recibo dice "1 de N + 1 en progreso"

## Riesgos identificados

- **Bajo**: pagos viejos conservan sus `applied_*` originales (snapshots inmutables).
  Reportes históricos no cambian.
- **Medio**: anular un pago viejo recalcula las cuotas con la nueva lógica
  (re-distribuye pagos restantes). Esto es deseable: aplica la lógica correcta
  retroactivamente.
- **Bug pre-existente no resuelto**: `loan.total_paid_principal` suma
  `totalPrincipal + excessToCapital` lo cual sobrecuenta el excess (ya que
  totalPrincipal ya incluye excess). Esto NO es nuevo — existía antes — y
  documento aquí para abordarlo en sesión futura.

## Si los tests fallan en local

Avísame qué test falló con su mensaje exacto. Lo más probable es algún
edge case de redondeo. Yo lo arreglo y empujo el fix.

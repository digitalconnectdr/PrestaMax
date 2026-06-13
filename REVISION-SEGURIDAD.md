# Revisión de seguridad — PrestaMax

Fecha: 9 de junio de 2026
Alcance: backend (Express + node:sqlite), frontend (React/Vite), configuración de despliegue.

---

## Resumen ejecutivo

El sistema está **bien construido a nivel de seguridad**. Las bases están sólidas:
aislamiento multi-tenant consistente, consultas parametrizadas en todo el código,
hashing de contraseñas robusto, verificación de firma en webhooks de Stripe y una
capa de middlewares defensivos. No se encontraron vulnerabilidades críticas
explotables en el código revisado.

Apliqué 3 mejoras de endurecimiento y dejo una lista priorizada de recomendaciones
para reforzar aún más antes y después de salir a producción.

---

## Lo que ya está bien (no tocar)

- **Aislamiento multi-tenant correcto.** Cada consulta filtra por `tenant_id`. El
  JWT solo contiene `userId`; los roles y permisos se cargan **frescos desde la BD**
  en cada request (`middleware/auth.ts`). Esto hace imposible falsificar roles
  manipulando el token.
- **Contraseñas:** bcrypt con coste 12. Política de complejidad en registro y cambio
  (mínimo 8, mayúscula, número, símbolo).
- **JWT:** se verifica con algoritmo fijo `HS256` (evita el ataque `alg:none`).
- **SQL:** 100% sentencias preparadas (`db.prepare(...).run/get/all`). Sin
  concatenación de strings en queries. No hay inyección SQL.
- **Stripe webhook:** valida la firma HMAC con el raw body antes de procesar.
- **Path traversal:** la descarga/borrado de backups valida el nombre con regex y
  confirma que la ruta resuelta sigue dentro del directorio de backups.
- **Cabeceras:** Helmet con CSP, HSTS, frameguard `deny`, noSniff, etc. en producción.
- **CORS:** lista blanca de orígenes en producción.
- **Rate limiting:** límites diferenciados (login 15/15min, registro 5/h, formularios
  públicos 10/h, global 300/15min).
- **Defensa en profundidad:** middlewares de sanitización de entrada, bloqueo de
  prototype pollution, detección de bots/escáneres y de payloads sospechosos.
- **Manejo de errores:** el `errorHandler` central oculta detalles internos en
  producción (5xx → mensaje genérico).
- **Secretos:** `.env` está en `.gitignore` y no hay repositorio git con secretos
  comprometidos. El `JWT_SECRET` visible en el `.env` local es solo de desarrollo.

---

## Mejoras aplicadas en esta revisión

### 1. Validación de entorno al arranque (fail-fast) — `src/lib/validateEnv.ts`
Antes de levantar el servidor se valida la configuración crítica. **En producción
el servidor se niega a arrancar** si:
- `JWT_SECRET` falta, tiene menos de 32 caracteres, o es un valor de demo conocido.

Además advierte (sin abortar) si: hay clave de Stripe pero falta el webhook secret,
se usa una clave `sk_test_` en producción, o `FRONTEND_URL` no es HTTPS.
Esto evita el peor escenario: desplegar con un secreto débil o de ejemplo, lo que
permitiría a un atacante forjar sesiones válidas de cualquier usuario.

### 2. Mitigación de enumeración de usuarios por timing — `src/routes/auth.ts`
El login ahora ejecuta **siempre** un `bcrypt.compare` (contra un hash señuelo
cuando el email no existe). Antes, un email inexistente respondía sin comparar,
y la diferencia de tiempo permitía a un atacante distinguir qué emails están
registrados. También se valida que email/password sean strings.

### 3. Endurecimiento del endpoint público de solicitudes — `src/routes/public.ts`
`POST /api/public/apply/:token` es público (sin auth) y guarda fotos de cédula en
base64. Ahora valida que sean data-URLs de imagen reales (JPG/PNG/WEBP) y limita
el tamaño por imagen, para evitar abuso de almacenamiento / DoS con payloads enormes.

> Verificación: `tsc --noEmit` pasa sin errores y los 174 tests existentes siguen
> en verde tras los cambios.

---

## Recomendaciones pendientes (priorizadas)

### Alta prioridad

1. **Fuga de detalles de error (138 puntos).** La mayoría de rutas hacen
   `catch (e) { res.status(500).json({ error: e.message }) }`, devolviendo el
   mensaje interno al cliente y saltándose el `errorHandler` central que sí oculta.
   En producción esto puede revelar estructura de tablas, rutas de archivos, etc.
   **Acción:** reemplazar por un mensaje genérico (`'Error interno'`) y dejar el
   detalle solo en `console.error`/Sentry. Se puede hacer con un helper compartido.

2. **Contraseña de admin por defecto.** El seed (`db/seed.ts`, `seed.js`) crea
   `admin@prestamax.com` / `Admin123!` como `platform_owner`. Hoy el auto-seed está
   bloqueado en producción (`autoSeedIfEmpty` retorna si `NODE_ENV=production`),
   pero los scripts `seed.js` / `seed_demo` podrían ejecutarse por error.
   **Acción:** nunca correr seeds de demo en la BD de producción; si se necesita un
   admin inicial, crearlo con el endpoint `/api/admin/bootstrap` (ya existe y solo
   funciona una vez) y forzar cambio de contraseña.

3. **Verificar variables de entorno en Render.** Confirmar que `JWT_SECRET` en
   producción es un valor fuerte y único (distinto al del `.env` de desarrollo),
   y que `NODE_ENV=production` está realmente activo (de lo contrario se desactivan
   CSP/HSTS y se podría auto-sembrar la BD).

### Media prioridad

4. **Vida útil del JWT (7 días) sin revocación.** Si se roba un token es válido una
   semana y no se puede invalidar. **Acción:** reducir a 24h con refresh token, o
   añadir un campo `token_version` por usuario que se incremente al cambiar
   contraseña / cerrar sesión, y verificarlo en `authenticate`.

5. **Almacenamiento del token en `localStorage`.** Es vulnerable a robo vía XSS.
   El riesgo está mitigado por la CSP, pero la opción más segura es cookie
   `httpOnly` + `Secure` + `SameSite`. Es un cambio mayor; evaluar a futuro.

6. **Imágenes de cédula sin cifrar en la BD.** Son datos personales sensibles
   guardados como base64 en SQLite. **Acción (al migrar a Supabase/Postgres):**
   guardarlas en almacenamiento de objetos con acceso firmado, no en la tabla.

### Baja prioridad / al migrar a Supabase

7. **Falsos positivos del detector de payloads.** Los patrones SQL/XSS sobre el
   body pueden bloquear texto legítimo (una nota que diga "select… from", o
   direcciones con ciertos caracteres). Monitorear y afinar.

8. **Row Level Security en Supabase.** Cuando migren de SQLite a Postgres/Supabase,
   activar RLS por `tenant_id` como segunda barrera, además del filtrado en la app.

9. **Backups:** confirmar que el directorio de backups y los `.gz` no son servidos
   públicamente y que el cifrado en reposo está activo en el proveedor.

---

## Cómo generar un buen `JWT_SECRET`

```bash
openssl rand -hex 48
```
Configurarlo como variable de entorno en Render (no en el código ni en `.env`
versionado).

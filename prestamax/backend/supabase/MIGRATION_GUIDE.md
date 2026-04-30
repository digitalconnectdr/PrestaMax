# Guía de Migración SQLite a PostgreSQL (Supabase)

**Fecha**: 2026-04-17  
**Proyecto**: PrestaMax  
**Destino**: Supabase (PostgreSQL 15+)  
**Estado**: Auditoría completada, listo para migración

---

## 1. Resumen Ejecutivo

El sistema PrestaMax usa SQLite (`node:sqlite`) con 29 tablas y relaciones multi-tenant. La migración a PostgreSQL/Supabase requiere:

- Cambios de tipos de datos (INTEGER booleanos → BOOLEAN, REAL → NUMERIC)
- Cambios de funciones SQL (datetime → NOW, strftime → TO_CHAR)
- Cambios de parámetros (? → $1, $2, ...)
- Cambios en métodos de ejecución (.prepare().all/get/run → pool.query)

**Sin cambios requeridos en:**
- Lógica de aplicación (el patrón raw SQL se mantiene)
- Middleware (auth, tenant, permissions)
- Modelos de datos (mismas columnas y relaciones)

---

## 2. Equivalencias SQLite ↔ PostgreSQL

### Tipos de Datos

| SQLite | PostgreSQL | Ejemplo |
|--------|-----------|---------|
| `TEXT` | `TEXT` o `VARCHAR(n)` | email, names, descriptions |
| `INTEGER` | `INTEGER` o `BIGINT` | counts, days, numbers |
| `REAL` | `NUMERIC(15,4)` | amounts, rates, percentages |
| `INTEGER NOT NULL DEFAULT 0` (bool) | `BOOLEAN NOT NULL DEFAULT FALSE` | is_active, is_voided |
| `INTEGER NOT NULL DEFAULT 1` (bool) | `BOOLEAN NOT NULL DEFAULT TRUE` | is_active |

### Funciones SQL

| SQLite | PostgreSQL | Caso de uso |
|--------|-----------|-----------|
| `datetime('now')` | `NOW()` | Timestamps actuales |
| `(datetime('now'))` en DEFAULT | `DEFAULT NOW()` | Defaults de timestamp |
| `date('now')` | `CURRENT_DATE` | Solo fecha |
| `date(column)` | `DATE(column)` o `column::date` | Conversión a date |
| `strftime('%Y-%m', column)` | `TO_CHAR(column::date, 'YYYY-MM')` | Formato mes-año |
| `strftime('%Y-%m-%d', column)` | `TO_CHAR(column::date, 'YYYY-MM-DD')` | Formato fecha |
| `julianday(b) - julianday(a)` | `EXTRACT(EPOCH FROM (b::timestamp - a::timestamp))/86400` | Diferencia en días |
| `LIKE` | `ILIKE` o `~*` | Búsqueda case-insensitive |
| `column1 \|\| column2` | `column1 \|\| column2` | Concatenación (igual) |

### Parámetros y Ejecución

| SQLite | PostgreSQL |
|--------|-----------|
| `.prepare(sql)` | `pool.query(sql, params)` |
| `.prepare(sql).all(params)` | `const result = await pool.query(sql, params); result.rows` |
| `.prepare(sql).get(params)` | `const result = await pool.query(sql, params); result.rows[0]` |
| `.prepare(sql).run(params)` | `await pool.query(sql, params); // void or rowCount` |
| `?` placeholders | `$1, $2, $3...` numbered placeholders |

### Booleanos

SQLite usa `0`/`1`, PostgreSQL usa `true`/`false`.

- En queries: PostgreSQL acepta `0`/`1` automáticamente, pero mejor usar `true`/`false`
- En columnas: cambiar de `INTEGER` a `BOOLEAN`

---

## 3. Archivos de Routes que Necesitan Adaptación

### A. `loans.ts` — 180+ queries

**Cambios necesarios:**

1. **datetime('now') → NOW()**
   ```ts
   // BEFORE (SQLite)
   db.prepare(`UPDATE loans SET updated_at=datetime('now') WHERE id=?`).run(id);
   
   // AFTER (PostgreSQL)
   await query(`UPDATE loans SET updated_at=NOW() WHERE id=$1`, [id]);
   ```

2. **Parámetros: ? → $1, $2, ...**
   ```ts
   // BEFORE
   db.prepare('SELECT * FROM loans WHERE id=? AND tenant_id=?').get(id, tenantId);
   
   // AFTER
   await queryOne('SELECT * FROM loans WHERE id=$1 AND tenant_id=$2', [id, tenantId]);
   ```

3. **.prepare().get() → await queryOne()**
   ```ts
   // BEFORE
   const loan = db.prepare('SELECT * FROM loans WHERE id=?').get(id);
   
   // AFTER
   const loan = await queryOne('SELECT * FROM loans WHERE id=$1', [id]);
   ```

4. **.prepare().all() → await query()**
   ```ts
   // BEFORE
   const loans = db.prepare('SELECT * FROM loans WHERE tenant_id=?').all(tenantId);
   
   // AFTER
   const loans = await query('SELECT * FROM loans WHERE tenant_id=$1', [tenantId]);
   ```

5. **LIKE (case-insensitive) → ILIKE**
   ```ts
   // BEFORE (SQLite is case-insensitive by default)
   where+=' AND (l.loan_number LIKE ? OR c.full_name LIKE ?)';
   
   // AFTER (PostgreSQL requires ILIKE for case-insensitive)
   where+=' AND (l.loan_number ILIKE $' + (params.length+1) + ' OR c.full_name ILIKE $' + (params.length+2) + ')';
   ```

**Queries con funciones SQLite específicas:**
- Línea ~38: `score_updated_at=datetime('now')` → `NOW()`
- Línea ~195: `approval_date=now()` → `NOW()`
- Múltiples: Buscar todos los `.prepare(...).get/all/run` y convertir

---

### B. `payments.ts` — 150+ queries

**Cambios principales:**

1. **Async/await wrapper**
   ```ts
   // BEFORE
   db.prepare(sql).run(...params);
   
   // AFTER
   await execute(sql, params);
   // or
   await query(sql, params);
   ```

2. **score_updated_at=datetime('now')**
   ```ts
   // BEFORE (línea ~38)
   db.prepare(`UPDATE clients SET score=?, score_updated_at=datetime('now') WHERE id=?`).run(score, clientId);
   
   // AFTER
   await execute(`UPDATE clients SET score=$1, score_updated_at=NOW() WHERE id=$2`, [score, clientId]);
   ```

3. **Queries con IN clause dinámico**
   ```ts
   // BEFORE (línea ~27)
   db.prepare(`SELECT * FROM installments WHERE loan_id IN (${loanIds.map(() => '?').join(',')})`).all(...loanIds);
   
   // AFTER — usar construcción dinámica de $N
   const placeholders = loanIds.map((_, i) => `$${i+1}`).join(',');
   const sql = `SELECT * FROM installments WHERE loan_id IN (${placeholders})`;
   await query(sql, loanIds);
   ```

---

### C. `reports.ts` — 25+ queries con strftime

**Cambios específicos:**

1. **strftime('%Y-%m', payment_date) → TO_CHAR(payment_date::date, 'YYYY-MM')**
   ```ts
   // BEFORE (línea ~94)
   SELECT strftime('%Y-%m', payment_date) as month, ...
   
   // AFTER
   SELECT TO_CHAR(payment_date::date, 'YYYY-MM') as month, ...
   ```

2. **date(column) → column::date**
   ```ts
   // BEFORE (línea ~16)
   AND date(payment_date)=?
   
   // AFTER
   AND payment_date::date = $1
   ```

3. **date('now', '-30 days') → CURRENT_DATE - INTERVAL '30 days'**
   ```ts
   // BEFORE (línea ~23)
   AND payment_date >= date('now','-30 days')
   
   // AFTER
   AND payment_date >= (CURRENT_DATE - INTERVAL '30 days')
   ```

---

### D. `collections.ts` — 10+ queries

**Cambios principales:**

1. **datetime('now') → NOW()**
   ```ts
   // BEFORE
   INSERT INTO ... values (..., datetime('now'))
   
   // AFTER
   INSERT INTO ... values (..., NOW())
   ```

2. **Parámetros y async/await**
   - Todas las queries necesitan conversión a `$1, $2, ...`
   - Todos los `.prepare().run/get/all` → `await query/queryOne/execute`

---

### E. `clients.ts`, `loanProducts.ts`, `settings.ts`, etc.

**Cambios genéricos:**

Todos los archivos necesitan estas transformaciones:

1. `datetime('now')` → `NOW()`
2. `?` → `$1, $2, ...` (numerados secuencialmente)
3. `.prepare(sql)` → `await query/queryOne/execute(sql, params)`
4. `.run(params)` → `await execute(params)` o `await query(params)`
5. `.get(params)` → `await queryOne(params)`
6. `.all(params)` → `await query(params)`
7. `date('column')` → `column::date`
8. `LIKE` en búsquedas → `ILIKE`

---

### F. `auth.ts` — 5-10 queries

**Cambios principales:**

1. **Conversión de parámetros**
   ```ts
   // BEFORE
   db.prepare('SELECT * FROM users WHERE email=?').get(email);
   
   // AFTER
   await queryOne('SELECT * FROM users WHERE email=$1', [email]);
   ```

2. **INSERT con defaults**
   ```ts
   // BEFORE
   db.prepare(`INSERT INTO users (id,email,...) VALUES (?,?,...)`)
     .run(id, email, ...);
   
   // AFTER
   await execute(`INSERT INTO users (id,email,...) VALUES ($1,$2,...)`, [id, email, ...]);
   ```

---

### G. `admin.ts`, `platform.ts`, `public.ts`, etc.

**Cambios menores pero sistemáticos:**

- Conversión de todos los `.prepare()` a `await query/queryOne`
- Cambio de `?` a `$1, $2, ...`
- Cambio de `datetime('now')` a `NOW()`

---

## 4. Tabla de Conversión Rápida

Para búsqueda y reemplazo, usar estos patrones:

### Regex para búsqueda (buscar en todos los archivos .ts)

```
# datetime('now') → NOW()
Buscar: datetime\('now'\)
Reemplazar: NOW()

# date() conversiones
Buscar: date\(([^)]+)\)
Reemplazar: ${1}::date

# strftime patterns
Buscar: strftime\('%Y-%m',\s*([^)]+)\)
Reemplazar: TO_CHAR(${1}::date, 'YYYY-MM')

# Parámetros ? → $N (manual, requiere verificación)
Buscar: \?
(Verificar contexto y reemplazar manualmente por $1, $2, etc.)
```

---

## 5. Cambios de Tipos de Datos en Schema

### Booleanos (INTEGER → BOOLEAN)

Todas las columnas que almacenan booleanos deben convertirse:

```sql
-- BEFORE
is_active INTEGER NOT NULL DEFAULT 1
is_voided INTEGER NOT NULL DEFAULT 0
requires_guarantee INTEGER NOT NULL DEFAULT 0

-- AFTER
is_active BOOLEAN NOT NULL DEFAULT TRUE
is_voided BOOLEAN NOT NULL DEFAULT FALSE
requires_guarantee BOOLEAN NOT NULL DEFAULT FALSE
```

Columnas afectadas por tabla:

- `plans.is_active`
- `users.is_active`
- `tenants.is_active`
- `tenant_settings.rebate_enabled`, `whatsapp_enabled`, `multi_currency_enabled`
- `tenant_memberships.is_active`
- `branches.is_active`
- `clients.is_active`, `consent_data_processing`, `consent_whatsapp`
- `loan_products.*_enabled`, `is_san_type`, `is_reditos`, `is_active`
- `loans.is_restructured`, `mora_fixed_enabled`, `is_voided`
- `payments.is_voided`
- `receipt_series.is_default`
- `receipts.is_reprinted`
- `contract_templates.is_default`
- `contracts` — ninguna columna booleana
- `whatsapp_templates.is_active`
- `bank_accounts.is_active`
- `payment_promises.requires_visit`

### Números decimales (REAL → NUMERIC)

```sql
-- BEFORE
price_monthly REAL NOT NULL
disbursement_fee REAL NOT NULL DEFAULT 0

-- AFTER
price_monthly NUMERIC(15,4) NOT NULL
disbursement_fee NUMERIC(15,4) NOT NULL DEFAULT 0
```

Todas las columnas de tipo REAL deben convertirse a NUMERIC(15,4):
- `plans.price_monthly`
- `tenant_settings.*_rate`, `score_w_*`
- `loan_products.*_amount`, `rate`, `mora_rate_daily`
- `loans.*_balance`, `*_amount`, `*_paid`, `rate`, `mora_rate_daily`, `exchange_rate_to_dop`
- `installments.*_amount`
- `payments.*_amount`, `rebate_amount`
- `receipt_series` — ninguna
- `income_expenses.amount`
- `payment_promises.promised_amount`
- `loan_requests.loan_amount`, `monthly_income`, `rate`
- `bank_accounts.*_balance`
- `account_transfers.amount`

---

## 6. Cambios en db.ts

No modificar `database.ts` del proyecto actual. En su lugar:

1. Crear `db-postgres.ts` con pool de conexiones (ya creado)
2. En los routes, cambiar:
   ```ts
   import { getDb } from '../db/database';  // SQLite (actual)
   ```
   a:
   ```ts
   import { query, queryOne, execute } from '../db/db-postgres';  // PostgreSQL (futuro)
   ```

3. Reemplazar todas las llamadas de `.prepare()` por `await query()`, `await queryOne()`, etc.

---

## 7. Instrucciones de Ejecución

### Paso 1: Preparar Supabase

1. Crear proyecto en Supabase.co
2. Obtener `DATABASE_URL` del SQL Editor:
   ```
   postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
3. Guardar en `.env`:
   ```env
   DATABASE_URL=postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   NODE_ENV=production
   ```

### Paso 2: Ejecutar Migraciones

1. Abrir SQL Editor en Supabase
2. Copiar el contenido de `supabase/migrations/001_initial_schema.sql`
3. Ejecutar (crea todas las tablas)

### Paso 3: Actualizar Dependencias

```bash
npm install pg @types/pg
```

En `backend/package.json`:
```json
{
  "dependencies": {
    "pg": "^8.11.0",
    "@types/pg": "^8.11.0"
  }
}
```

### Paso 4: Migrar Code (iterativo)

Para cada archivo de route:

1. Importar helpers de `db-postgres.ts`
2. Reemplazar `.prepare()` por `await query/queryOne/execute`
3. Cambiar `?` por `$1, $2, ...`
4. Cambiar `datetime('now')` por `NOW()`
5. Cambiar `date()` por `::date`
6. Cambiar `strftime()` por `TO_CHAR()`
7. Cambiar `LIKE` por `ILIKE` (opcional pero recomendado)
8. Probar cada endpoint

### Paso 5: Testing

1. Ejecutar suite de tests
2. Probar cada endpoint manualmente
3. Validar que los datos se persisten correctamente
4. Validar que las relaciones FK funcionan

---

## 8. Orden Recomendado de Migración

1. **`auth.ts`** (5-10 queries, crítico para login)
2. **`clients.ts`** (20-30 queries, lectura/escritura básicas)
3. **`loanProducts.ts`** (10-15 queries)
4. **`loans.ts`** (180+ queries, más complejas)
5. **`payments.ts`** (150+ queries, muy complejas)
6. **`reports.ts`** (25+ queries con strftime)
7. **`collections.ts`** (10-15 queries)
8. **Resto**: admin.ts, platform.ts, settings.ts, etc.

---

## 9. Estimación de Esfuerzo

| Fase | Tareas | Horas |
|------|--------|-------|
| Preparación | Setup Supabase, ejecutar schema SQL | 1-2 |
| Migración auth | Convertir auth.ts (5 queries) | 0.5 |
| Migración clientes | Convertir clients.ts (30 queries) | 1 |
| Migración productos | Convertir loanProducts.ts (15 queries) | 1 |
| Migración préstamos | Convertir loans.ts (180 queries, complejas) | 4-5 |
| Migración pagos | Convertir payments.ts (150 queries, MUY complejas) | 5-6 |
| Migración reportes | Convertir reports.ts (25 queries con strftime) | 2-3 |
| Migración resto | Admin, platform, settings, etc. (100+ queries) | 4-5 |
| Testing & validation | QA, test de datos, rollback plan | 2-3 |
| **TOTAL** | | **~20-25 horas** |

---

## 10. Validación Post-Migración

Checklist de validación:

- [ ] Todas las tablas creadas en Supabase
- [ ] Todos los indexes creados
- [ ] Foreign keys funcionando
- [ ] Auth login funciona
- [ ] CRUD de clientes funciona
- [ ] CRUD de préstamos funciona
- [ ] Pagos se guardan correctamente
- [ ] Reportes generan datos correctos
- [ ] Las fechas se guardan en UTC
- [ ] Los booleanos se convierten correctamente (0→false, 1→true)
- [ ] Las búsquedas ILIKE funcionan
- [ ] Las transacciones funcionan (payments + audit logs)
- [ ] RLS no interfiere (está deshabilitado por ahora)
- [ ] Dump de datos SQLite → Supabase (data migration)

---

## 11. Notas Importantes

### Row Level Security (RLS)

Por ahora, **NO implementar RLS en Supabase**. El backend ya filtra por `tenant_id` en middleware.

Si en futuro se necesita RLS:
```sql
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenants can view their own loans" ON loans
  FOR SELECT USING (tenant_id = current_user_id::text);
```

### Transacciones

PostgreSQL maneja transacciones diferente. Usar:
```ts
import { transaction } from '../db/db-postgres';

await transaction(async (client) => {
  await client.query('UPDATE loans SET status=$1 WHERE id=$2', ['approved', id]);
  await client.query('INSERT INTO audit_logs (...) VALUES (...)', [...]);
});
```

### Backups

Supabase crea backups automáticos. Configurar:
1. Backups diarios en Supabase Dashboard
2. Exportar data antes de migración en SQLite
3. Verificar en Supabase después de migración

---

## 12. Rollback Plan

Si algo falla:

1. **Durante schema creation**: Simplemente no correr el SQL en Supabase (no hay daño)
2. **Durante code migration**: Mantener SQLite activo como fallback
3. **Durante production**: 
   - Mantener réplica en SQLite
   - Uscar en paralelo durante 1-2 semanas
   - Si hay issues, rollback a SQLite

---

## Conclusión

La migración es mecánica: buscar/reemplazar de patrones SQLite → PostgreSQL. No hay cambios lógicos ni de dominio. El esfuerzo principal está en:

1. **Cambio de parámetros**: ? → $1, $2, ... (tedioso pero sencillo)
2. **Funciones SQL**: datetime/strftime → NOW/TO_CHAR (búsqueda/reemplazo)
3. **Async/await**: Todas las queries ahora son async (refactor estructural)
4. **Testing**: Validar cada cambio antes de pasar al siguiente archivo

**Timeline estimado: 3-4 semanas con un developer trabajando media jornada.**

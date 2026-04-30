# PestaMax 🏦
### Sistema Profesional de Gestión de Préstamos

**Stack:** Node.js + Express + SQLite (nativo) + React + Vite + Tailwind CSS

---

## 🚀 Inicio Rápido

```bash
# Opción 1: Script automático
cd prestamax
bash start.sh

# Opción 2: Manual

# Terminal 1 - Backend
cd backend
npx ts-node --transpile-only src/db/seed.ts   # Solo primera vez
npx ts-node-dev --transpile-only src/index.ts

# Terminal 2 - Frontend  
cd frontend
npm run dev
```

## 🌐 URLs

| Servicio | URL |
|---------|-----|
| **Aplicación** | http://localhost:5173 |
| **API** | http://localhost:3001 |
| **Health** | http://localhost:3001/health |

## 🔑 Credenciales de Prueba

| Usuario | Email | Contraseña | Rol |
|---------|-------|-----------|-----|
| Administrador | admin@prestamax.com | Admin123! | Platform Owner |
| Oficial de Crédito | oficial@garcia.com | Demo123! | Loan Officer + Cashier |
| Cobrador | cobrador@garcia.com | Demo123! | Collector |

## 📦 Módulos Implementados

### Backend (42 endpoints REST)
- ✅ **Auth** - Login JWT, perfil, cambio de contraseña
- ✅ **Clientes** - CRUD completo, score crediticio, garantes, referencias
- ✅ **Productos de Préstamo** - 4 tipos (Personal, SAN, Réditos, Garantía)
- ✅ **Préstamos** - Ciclo completo (Solicitud → Aprobación → Desembolso → Pagos → Liquidación)
- ✅ **Pagos** - Registro, anulación, aplicación configurable (mora → interés → capital)
- ✅ **Recibos** - Generación automática con numeración por serie
- ✅ **Contratos** - Plantillas con variables dinámicas
- ✅ **Cobranzas** - Portfolio de cobrador, notas, promesas de pago
- ✅ **WhatsApp** - Plantillas y log de mensajes
- ✅ **Reportes** - Dashboard KPIs, cartera, mora, cobranzas
- ✅ **Configuración** - Sucursales, usuarios, plantillas, políticas de mora
- ✅ **Auditoría** - Log completo de acciones

### Frontend (React + Tailwind)
- ✅ Login page (responsive, mobile-first)
- ✅ Dashboard con KPIs y gráficos (Recharts)
- ✅ Gestión de Clientes
- ✅ Gestión de Préstamos
- ✅ Registro de Pagos
- ✅ Recibos y Contratos
- ✅ Módulo de Cobranzas (optimizado para móvil)
- ✅ Reportes y Analytics
- ✅ Configuración del Tenant
- ✅ Módulo WhatsApp

## 🔐 Multi-Tenant

Cada prestamista tiene datos completamente separados mediante `tenant_id`.
Un usuario puede pertenecer a múltiples prestamistas con diferentes roles.

## 💰 Cálculos Financieros

- **Mora**: `capital_pendiente × tasa_diaria × días_mora` (después de días de gracia)
- **Recargo por exceso**: cuando el préstamo supera la fecha de vencimiento
- **Rebaja anticipada**: devolución proporcional de intereses no causados
- **Score 1-5**: basado en puntualidad (40%), préstamos pagados (30%), antigüedad (20%), sin mora (10%)

## 🗃️ Base de Datos

SQLite nativo Node.js 22. Para migrar a Supabase (PostgreSQL):
1. Cambiar `node:sqlite` por `pg` (node-postgres)
2. Ajustar sintaxis SQL (principalmente `TEXT` → tipos PostgreSQL, `datetime('now')` → `NOW()`)
3. Configurar `DATABASE_URL` con la URL de Supabase
4. Habilitar Row Level Security (RLS) en Supabase

## 📋 Roles del Sistema

| Rol | Descripción |
|-----|-------------|
| `platform_owner` | Dueño del SaaS |
| `platform_admin` | Admin global |
| `tenant_owner` | Dueño del prestamista |
| `tenant_admin` | Administrador general |
| `loan_officer` | Crea y gestiona préstamos |
| `cashier` | Registra pagos y recibos |
| `collector` | Cobrador |
| `viewer_auditor` | Solo lectura |

Un usuario puede tener múltiples roles: `["loan_officer","cashier"]`

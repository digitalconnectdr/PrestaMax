// HelpPage — guia interactiva paso a paso para usuarios nuevos.
// Las guias se filtran segun los permisos del usuario en su plan actual:
// si no tienes acceso al modulo, la guia no aparece.

import React, { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import Card from '@/components/ui/Card'
import {
  HelpCircle, ChevronDown, ChevronUp, Users, Building2, FileText,
  DollarSign, UserPlus, MessageCircle, Settings, Lightbulb, ArrowRight,
  Package, Truck, Inbox, FileCheck, TrendingUp, Calculator, BarChart3,
  FileSpreadsheet, ClipboardList, Briefcase, Calendar
} from 'lucide-react'
import { usePermission } from '@/hooks/usePermission'
import type { PermKey } from '@/lib/permissions'

interface Step { title: string; description: string; tip?: string }
interface Guide {
  id: string
  icon: React.ReactNode
  title: string
  subtitle: string
  shortcutPath?: string
  shortcutLabel?: string
  /** Si esta presente, la guia solo se muestra si el usuario tiene este permiso */
  requiredPermission?: PermKey
  /** Si esta presente, debe tener al menos uno de estos permisos */
  requiredAnyPermission?: PermKey[]
  steps: Step[]
}

const GUIDES: { section: string; items: Guide[] }[] = [
  // ═══════════════════════════════════════════════════════
  {
    section: 'EMPEZAR (orden recomendado)',
    items: [
      {
        id: 'crear-cuenta-bancaria',
        icon: <Building2 className="w-5 h-5" />,
        title: '1. Crear una cuenta bancaria',
        subtitle: 'De dónde sale el dinero y a dónde entran los pagos',
        shortcutPath: '/settings/bank-accounts',
        shortcutLabel: 'Ir a Cuentas Bancarias',
        requiredPermission: 'settings.bank_accounts',
        steps: [
          { title: 'Abre Configuración → Cuentas Bancarias', description: 'En el menú lateral: "Configuración" → "Cuentas Bancarias" → botón "+ Nueva Cuenta".' },
          { title: 'Selecciona el banco', description: 'Elige uno de la lista o escribe el nombre si no aparece. Funciona para BHD, Popular, Reservas, Cooperativas, etc.' },
          { title: 'Completa los datos de la cuenta', description: 'Tipo (Ahorros / Corriente), número de cuenta, moneda (DOP/USD/EUR/etc), y titular.' },
          { title: 'Define el saldo inicial', description: 'El monto con el que arranca esta cuenta. Es tu capital disponible para prestar. El sistema lleva el balance: descuenta al desembolsar, aumenta al recibir pagos.', tip: 'Si tienes varios bancos para distintas operaciones (capital propio vs capital de inversionistas), crea una cuenta por cada uno. Así no se mezclan los fondos.' },
          { title: 'Guarda', description: 'La cuenta aparece en el dropdown "Cuenta de Desembolso" al crear un préstamo, y en "Cuenta de Cobro" al registrar un pago.' },
        ],
      },
      {
        id: 'crear-producto',
        icon: <Package className="w-5 h-5" />,
        title: '2. Crear productos de préstamo',
        subtitle: 'Plantillas predefinidas con tasa, plazo y tipo (te ahorra tiempo al crear préstamos)',
        shortcutPath: '/settings/products',
        shortcutLabel: 'Ir a Productos',
        requiredPermission: 'settings.products',
        steps: [
          { title: 'Abre Configuración → Productos', description: 'En el menú lateral: "Configuración" → "Productos" → botón "+ Nuevo Producto".' },
          { title: 'Pon un nombre y código identificable', description: 'Ej: "Personal 3 Meses" (código P3M), "Comercial 12 Meses" (código C12). El código aparece luego en el número de préstamo.' },
          { title: 'Define tasa y plazo sugeridos', description: 'Tasa de interés (%), tipo (mensual/anual), plazo en cantidad y unidad (días/semanas/meses), frecuencia de pago.', tip: 'Estos son valores SUGERIDOS. Al crear un préstamo individual los puedes ajustar para ese caso específico.' },
          { title: 'Selecciona tipo de amortización', description: 'Interés (la más simple), Cuota Fija (método bancario) o Solo Interés (bullet). Si no estás seguro hay un botón "¿Qué significa?" con ejemplos.' },
          { title: 'Configura mora y cargos opcionales', description: 'Tasa de mora si una cuota se vence, tasa de prórroga si renegocian, cargo de desembolso (comisión inicial).' },
          { title: 'Guarda', description: 'El producto aparece en el dropdown "Producto" al crear un préstamo. Puedes crear tantos productos como necesites.' },
        ],
      },
      {
        id: 'crear-cliente',
        icon: <Users className="w-5 h-5" />,
        title: '3. Crear un cliente nuevo',
        subtitle: 'Registra una persona o empresa a quien podrás prestarle',
        shortcutPath: '/clients/new',
        shortcutLabel: 'Ir a Nuevo Cliente',
        requiredPermission: 'clients.create',
        steps: [
          { title: 'Abre el módulo de Clientes', description: 'En el menú lateral, haz clic en "Clientes" → botón "+ Nuevo Cliente" arriba a la derecha.' },
          { title: 'Completa los datos personales', description: 'Nombre completo, cédula/RNC, fecha de nacimiento, género y estado civil. La cédula NO debe repetirse — el sistema te avisará si ya existe.' },
          { title: 'Agrega información de contacto', description: 'Teléfono personal y WhatsApp (importante si quieres enviarle mensajes automáticos). Email es opcional.', tip: 'El campo WhatsApp se usa para los mensajes transaccionales. Si lo dejas vacío, el cliente no recibirá notificaciones automáticas.' },
          { title: 'Completa dirección y datos laborales', description: 'Dirección de residencia, ciudad, provincia. Si trabaja: empleo, ingresos declarados y dirección laboral.' },
          { title: 'Agrega referencias (opcional pero recomendado)', description: 'Mínimo 1-2 referencias personales o comerciales con teléfono. Te ayuda en caso de cobranza.' },
          { title: 'Guarda y listo', description: 'El cliente queda disponible inmediatamente para crearle préstamos. Su Score Crediticio empieza neutral (50/100) y se ajusta con su historial.' },
        ],
      },
      {
        id: 'crear-prestamo',
        icon: <FileText className="w-5 h-5" />,
        title: '4. Crear un préstamo nuevo',
        subtitle: 'Aprueba y desembolsa dinero a un cliente con plan de pagos automático',
        shortcutPath: '/loans/new',
        shortcutLabel: 'Ir a Nuevo Préstamo',
        requiredPermission: 'loans.create',
        steps: [
          { title: 'Selecciona el cliente', description: 'En "Préstamos" → botón "+ Nuevo Préstamo". Busca por nombre o cédula. Si no existe, crea el cliente primero.' },
          { title: 'Elige el producto', description: 'Selecciona uno de los productos que creaste antes. El sistema autocompleta tasa, plazo y tipo. Puedes ajustarlos si quieres.' },
          { title: 'Define las condiciones', description: 'Monto, tasa de interés (%), plazo, unidad y frecuencia de pago.', tip: 'Si no estás seguro qué tipo de amortización usar, haz clic en "¿Qué significa?" al lado del selector — verás la explicación con ejemplo concreto.' },
          { title: 'Selecciona cuenta de desembolso', description: 'De qué cuenta bancaria sale el dinero. Si el monto excede el saldo, el sistema te bloqueará para que no quedes en negativo.' },
          { title: 'Revisa el resumen y desembolsa', description: 'El sistema muestra el plan de pagos con todas las cuotas, fechas e intereses. Confirma para desembolsar. El dinero se descuenta del banco y el préstamo queda "Activo".', tip: 'Si tienes WhatsApp transaccional activado, se genera automáticamente un draft de bienvenida en la Bandeja.' },
        ],
      },
      {
        id: 'registrar-pago',
        icon: <DollarSign className="w-5 h-5" />,
        title: '5. Registrar un pago',
        subtitle: 'Aplica el dinero que el cliente paga a su préstamo',
        shortcutPath: '/payments',
        shortcutLabel: 'Ir a Pagos',
        requiredPermission: 'payments.create',
        steps: [
          { title: 'Abre el módulo de Pagos', description: 'En el menú lateral: "Pagos" → botón "+ Registrar Pago". También puedes registrar pagos desde el detalle de un préstamo específico.' },
          { title: 'Selecciona el préstamo', description: 'Busca por nombre del cliente o número de préstamo. El sistema muestra las cuotas pendientes y el balance.' },
          { title: 'Ingresa monto y forma de pago', description: 'Monto recibido (completo, parcial o adelantado), método (efectivo, transferencia, cheque) y la cuenta bancaria que recibe el dinero.', tip: 'Si el cliente tiene cuotas vencidas, el sistema aplica primero a mora, luego intereses, luego capital. Puedes ver el desglose antes de confirmar.' },
          { title: 'Confirma y se genera recibo automático', description: 'Se descuenta el balance del préstamo, suma al banco que recibe, recalcula el score del cliente y genera un recibo PDF para imprimir o enviar.' },
          { title: '(Opcional) Envía confirmación por WhatsApp', description: 'Si tienes WhatsApp transaccional activado, en la Bandeja aparecerá un draft de "Pago recibido" listo para enviar.' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════
  {
    section: 'COBRANZAS Y SEGUIMIENTO',
    items: [
      {
        id: 'cartera-cobranza',
        icon: <Truck className="w-5 h-5" />,
        title: 'Cartera de Cobranza',
        subtitle: 'Vista de cuotas vencidas y por vencer asignadas a cada cobrador',
        shortcutPath: '/collections',
        shortcutLabel: 'Ir a Mi Cartera',
        requiredPermission: 'collections.view',
        steps: [
          { title: 'Abre Cobranzas → Mi Cartera', description: 'Verás la lista de cuotas vencidas y por vencer. Si eres cobrador, solo ves las asignadas a ti. Si tienes permiso "Ver toda la cartera", ves todo lo del tenant.' },
          { title: 'Filtra por días de mora o cliente', description: 'Usa los filtros arriba para enfocarte en mora alta primero, o buscar un cliente específico.' },
          { title: 'Marca una visita o llamada', description: 'Haz clic en una fila → botón "Registrar nota" para guardar la gestión (qué dijo el cliente, próxima acción, etc).' },
          { title: 'Crea una Promesa de Pago', description: 'Si el cliente promete pagar en una fecha, registra una promesa: monto y fecha prometida. Aparecerá en "Promesas de Pago" para hacer seguimiento.', tip: 'Cuando hay una promesa activa, el sistema NO genera mensajes automáticos de mora a ese cliente hasta que pase la fecha prometida + 1 día. Así no lo molestas mientras está al día con su compromiso.' },
          { title: 'Marca la promesa como cumplida o incumplida', description: 'En "Cobranzas → Promesas de Pago" puedes marcar cada promesa según lo que pasó. Esto ajusta el score del cliente automáticamente.' },
          { title: 'Vista mobile-friendly', description: 'En el celular cada cuota se muestra como tarjeta con los datos clave: cliente, monto, días de mora, teléfono. Tap directo para llamar/abrir WhatsApp.' },
        ],
      },
      {
        id: 'agenda-cobranza',
        icon: <Calendar className="w-5 h-5" />,
        title: 'Agenda de Cobranza',
        subtitle: 'Asigna tareas de cobranza (visitas, llamadas) a cobradores con fecha límite',
        shortcutPath: '/collections',
        shortcutLabel: 'Ir a Agenda',
        requiredAnyPermission: ['collections.tasks', 'collections.tasks.manage'],
        steps: [
          { title: 'Abre Cobranzas → tab "Agenda"', description: 'Verás las tareas pendientes con su fecha objetivo. Si eres cobrador, solo ves las asignadas a ti.' },
          { title: 'Crear una tarea nueva (solo admin/manager)', description: 'Botón "+ Nueva Tarea": elige cliente o préstamo, asigna a un cobrador, fecha límite, tipo (visita, llamada, recordatorio, otro), prioridad y descripción.', tip: 'Si tienes el permiso "Administrar agenda de cobros", puedes asignar a cualquier cobrador. Si no, solo creas tareas para ti mismo.' },
          { title: 'Filtra por cobrador o estado', description: 'Filtros: "Mías", "Hoy", "Vencidas", "Esta semana". Útil para que cada cobrador planee su jornada por la mañana.' },
          { title: 'Marca una tarea completada', description: 'Cuando termines la visita o llamada, clic "Completar" → opcionalmente agrega notas del resultado (ej. "Cliente promete pagar el viernes", "No respondió, dejé volante").' },
          { title: 'Tareas vencidas', description: 'Una tarea no completada en su fecha límite queda marcada como "Vencida" en rojo. Útil para revisión de productividad.', tip: 'La diferencia con "Mi Cartera": la Cartera muestra CUOTAS vencidas de préstamos. La Agenda muestra TAREAS ASIGNADAS (que pueden o no estar vinculadas a un préstamo).' },
          { title: 'Métricas por cobrador', description: 'En Reportes → "Productividad de cobradores" verás tareas completadas vs vencidas por cada uno. Útil para evaluar desempeño.' },
        ],
      },
      {
        id: 'solicitudes-publicas',
        icon: <Inbox className="w-5 h-5" />,
        title: 'Solicitudes públicas de préstamo',
        subtitle: 'Genera un enlace para que clientes potenciales apliquen desde su teléfono',
        shortcutPath: '/requests',
        shortcutLabel: 'Ir a Solicitudes',
        requiredPermission: 'requests.view',
        steps: [
          { title: 'Activa el módulo en Configuración General', description: 'Configuración → General → "Solicitudes Públicas" activa el switch. Esto genera un enlace único de tu empresa (ej. https://prestamax-umber.vercel.app/apply/abc123).' },
          { title: 'Comparte el enlace', description: 'Por WhatsApp, en tu Instagram bio, código QR en tu local, etc. Cualquier persona puede llenar la solicitud desde el celular sin estar registrada en tu sistema.' },
          { title: 'Revisa solicitudes entrantes', description: 'En "Solicitudes" verás todas las solicitudes nuevas. Cada una con datos del solicitante: nombre, cédula, teléfono, monto solicitado, plazo deseado.' },
          { title: 'Aprueba o rechaza', description: 'Revisa la solicitud y decide. Si apruebas, puedes convertirla directamente en préstamo: rellena los campos faltantes (cuenta de desembolso, fecha primer pago) y al guardar se crea cliente + préstamo en un solo paso.', tip: 'Si rechazas, puedes agregar una nota explicando por qué (sirve para auditoría interna).' },
          { title: 'Comparte el enlace público estratégicamente', description: 'Imprime el enlace o un código QR y pégalo en lugares visibles. Es publicidad gratis 24/7.' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════
  {
    section: 'GESTIÓN DE INVERSIONISTAS',
    items: [
      {
        id: 'inversionistas-overview',
        icon: <Briefcase className="w-5 h-5" />,
        title: 'Qué son y cómo funcionan los Inversionistas',
        subtitle: 'Modela el capital de terceros que te financia préstamos',
        shortcutPath: '/investors',
        shortcutLabel: 'Ir a Inversionistas',
        requiredPermission: 'investors.view',
        steps: [
          { title: 'Concepto general', description: 'Un inversionista es una persona/empresa que APORTA dinero para que tú lo prestes. Tú gestionas los cobros y le pagas su parte. CredyTek soporta 2 modelos de relación: tasa fija (le pagas % mensual del capital) y participación en interés (le pagas % del interés generado por sus préstamos asignados).' },
          { title: 'Crear un inversionista', description: 'Click "+ Nuevo Inversionista". Datos: nombre completo, email (único por empresa), teléfono, cédula, modelo de relación, % o tasa, comisión que TÚ cobras (en el modelo de participación), capital aportado.', tip: 'El email debe ser único dentro de tu empresa. Si intentas crear otro con el mismo email, el sistema te avisa y te muestra cuál ya existe — útil para evitar duplicados.' },
          { title: 'Asignar préstamos al inversionista', description: 'Desde el detalle del inversionista → "+ Asignar préstamo". Selecciona préstamos no asignados a otro inversionista. Su interés generado se irá contabilizando como deuda contigo hacia él.' },
          { title: 'Ver capital activo y por liquidar', description: 'El detalle del inversionista muestra: capital aportado, capital activo (en préstamos no liquidados), interés ganado, comisión retenida por ti, y balance pendiente de pagar.' },
          { title: 'Liquidar al inversionista', description: 'Cuando le vas a pagar lo acumulado, abre el "Reporte de Liquidación" en el detalle → confirma el monto y el método de pago. El sistema descuenta de tu banco, registra el payout en su historial, y marca los pagos involucrados como "ya liquidados" para no contarlos dos veces.', tip: 'El payout queda registrado como gasto en tu P&L (categoría "investor_payout") para que tu utilidad real refleje el costo del capital de terceros.' },
        ],
      },
      {
        id: 'inversionistas-portal',
        icon: <Briefcase className="w-5 h-5" />,
        title: 'Dar acceso al portal del Inversionista',
        subtitle: 'El inversionista entra con su email y ve solo sus préstamos y pagos',
        shortcutPath: '/investors',
        shortcutLabel: 'Ir a Inversionistas',
        requiredPermission: 'investors.portal',
        steps: [
          { title: 'Abre el detalle del inversionista', description: 'Click sobre cualquier inversionista en la lista. Verás un botón "Crear acceso al portal" si aún no tiene cuenta.' },
          { title: 'Click "Crear acceso al portal"', description: 'El sistema crea un usuario en su email con rol "investor". Te muestra una contraseña temporal UNA SOLA VEZ — compártela con el inversionista (WhatsApp, llamada). No la guardamos visible después.' },
          { title: 'El inversionista inicia sesión', description: 'Va a la URL pública del sistema → login → entra con su email y la temp password. La primera vez puede cambiarla.' },
          { title: 'Qué ve el inversionista', description: 'Su propio dashboard mostrando: capital aportado, total de préstamos asignados, interés ganado, pagos recibidos, próximo payout estimado. Solo ve LOS DATOS DE ÉL — no ve clientes ni préstamos de otros inversionistas (muralla china).' },
          { title: 'Resetear contraseña', description: 'Si pierde el acceso, vuelve al detalle del inversionista → "Resetear contraseña" → te muestra una nueva temp password para entregarle.' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════
  {
    section: 'HERRAMIENTAS COMPLEMENTARIAS',
    items: [
      {
        id: 'contratos',
        icon: <FileCheck className="w-5 h-5" />,
        title: 'Generar contratos',
        subtitle: 'Crea plantillas de contrato y genera documentos firmados',
        shortcutPath: '/contracts',
        shortcutLabel: 'Ir a Contratos',
        requiredPermission: 'contracts.view',
        steps: [
          { title: 'Crea una plantilla en Plantillas → Contratos', description: 'En el menú: "Plantillas" → tab "Contratos" → "+ Nueva Plantilla". Pega el texto de tu contrato con variables como {{cliente.nombre}}, {{prestamo.monto}}, {{prestamo.cuotas}}.' },
          { title: 'Define qué variables vas a usar', description: 'Variables disponibles: {{cliente.nombre}}, {{cliente.cedula}}, {{cliente.direccion}}, {{prestamo.numero}}, {{prestamo.monto}}, {{prestamo.tasa}}, {{prestamo.cuotas}}, {{empresa.nombre}}, {{empresa.rnc}}, fecha actual, etc.' },
          { title: 'Genera un contrato para un préstamo específico', description: 'Ve a Contratos → "+ Nuevo" → selecciona plantilla y préstamo. El sistema interpola las variables con los datos reales.', tip: 'El contrato generado se guarda como PDF y queda asociado al préstamo. Puedes regenerarlo si actualizas la plantilla.' },
          { title: 'Imprime o comparte', description: 'Descarga el PDF, imprime para firma física, o envía por WhatsApp/email. La firma digital queda pendiente (rama futura del producto).' },
        ],
      },
      {
        id: 'ingresos-gastos',
        icon: <TrendingUp className="w-5 h-5" />,
        title: 'Registrar ingresos y gastos operativos',
        subtitle: 'Captura los gastos del negocio (renta, salarios, etc) para una P&L real',
        shortcutPath: '/income',
        shortcutLabel: 'Ir a Ingresos y Gastos',
        requiredPermission: 'income.view',
        steps: [
          { title: 'Abre Ingresos y Gastos', description: 'En el menú lateral: "Ingresos y Gastos". Verás dos tabs: Ingresos (entradas extra fuera de pagos de préstamos) y Gastos (salidas del negocio).' },
          { title: 'Registra un gasto', description: 'Botón "+ Nuevo Gasto" → categoría (alquiler, salario, papelería, transporte, marketing, etc), monto, fecha, cuenta bancaria de la que sale el dinero, y nota opcional.' },
          { title: 'Registra un ingreso adicional', description: 'Si entró dinero que no es pago de préstamo (ej. intereses bancarios, comisión por un servicio, capital nuevo de un socio), regístralo aquí para no confundir tu flujo de caja.' },
          { title: 'Revisa el resumen mensual', description: 'En la parte superior verás el total de ingresos vs gastos del mes y la utilidad neta (combinada con los pagos de préstamos).', tip: 'Si usas Inversionistas, los payouts de capital a inversionistas aparecen como gastos categorizados — para que tu P&L refleje el costo real del capital.' },
          { title: 'Anula o edita una entrada', description: 'Si te equivocaste, puedes anular un movimiento (queda registrado pero no afecta los totales). El sistema mantiene el historial completo por auditoría.' },
        ],
      },
      {
        id: 'calculadora',
        icon: <Calculator className="w-5 h-5" />,
        title: 'Usar la Calculadora',
        subtitle: 'Simula un préstamo sin crearlo en el sistema — ideal para mostrar al cliente',
        shortcutPath: '/calculator',
        shortcutLabel: 'Ir a Calculadora',
        requiredPermission: 'calculator.use',
        steps: [
          { title: 'Abre la Calculadora', description: 'En el menú lateral: "Calculadora". Sirve para simular cualquier escenario sin afectar tus datos reales.' },
          { title: 'Elige Por Tasa o Por Ganancia', description: 'Por Tasa: conoces la tasa y quieres ver la cuota. Por Ganancia: conoces cuánto quieres ganar y el sistema calcula qué tasa cobrar.' },
          { title: 'Ingresa los parámetros', description: 'Monto, plazo, unidad (días/semanas/meses), frecuencia y tipo de amortización (Interés por defecto).' },
          { title: 'Calcula y revisa', description: 'El sistema muestra el plan de pagos completo con todas las cuotas, totales de interés y resumen.', tip: 'Botón "Enviar por WhatsApp" → genera un mensaje con la propuesta lista para enviar al cliente.' },
          { title: 'Compara escenarios', description: 'Cambia los parámetros y recalcula para mostrar al cliente varias opciones (más plazo y cuota menor vs menos plazo y cuota mayor).' },
        ],
      },
      {
        id: 'reportes',
        icon: <BarChart3 className="w-5 h-5" />,
        title: 'Leer Reportes y Proyección',
        subtitle: 'Interpreta las métricas para tomar decisiones',
        shortcutPath: '/reports',
        shortcutLabel: 'Ir a Reportes',
        requiredPermission: 'reports.dashboard',
        steps: [
          { title: 'Dashboard (página principal)', description: 'KPIs en tiempo real: Cartera Total (capital prestado), Cartera Activa (lo que aún te deben), Mora Pendiente (lo vencido), Cobros del Día, total de clientes y préstamos activos.' },
          { title: 'Reportes detallados', description: 'En "Reportes" verás: distribución por estado de préstamos, top clientes por monto, cartera vencida con días de mora, productividad de cobradores, etc.' },
          { title: 'Filtra por fechas', description: 'En cada reporte puedes filtrar por mes, trimestre, año o rango custom. Por defecto muestra el mes actual.' },
          { title: 'Proyección de Cobros', description: 'En "Reportes → Proyección de Cobros" eliges un período y el sistema te muestra qué cuotas vencen y cuánto deberías cobrar (capital + interés + mora + prórroga).', tip: 'Útil para planear flujo de caja: "este mes deberían entrarme RD$ X, ¿alcanza para pagar mis gastos fijos?"' },
          { title: 'Exporta a Excel o PDF', description: 'Botón "Exportar" en cada reporte. Útil para presentaciones, auditorías o backup externo.' },
        ],
      },
      {
        id: 'exportar-contabilidad',
        icon: <FileSpreadsheet className="w-5 h-5" />,
        title: 'Exportar a Contabilidad (CSV)',
        subtitle: 'Genera 3 reportes contables listos para Excel o tu contador',
        shortcutPath: '/reports/accounting',
        shortcutLabel: 'Ir a Exportar Contabilidad',
        requiredPermission: 'reports.dashboard',
        steps: [
          { title: 'Abre Reportes → Exportar Contabilidad', description: 'En el menú lateral: "Análisis" → "Exportar Contabilidad". Elige el período: mes actual, mes anterior, año actual o rango custom.' },
          { title: 'Libro Diario', description: 'CSV con TODOS los movimientos del período: desembolsos, pagos recibidos, ingresos extra y gastos. Cada línea con fecha, hora, tipo, concepto, cliente, préstamo, debe/haber y cuenta bancaria.', tip: 'Las columnas Fecha y Hora vienen separadas — útil para ordenar por hora del día y buscar transacciones específicas.' },
          { title: 'Mayor por Cuenta Bancaria', description: 'CSV con resumen por cada cuenta bancaria: entradas totales (pagos recibidos + ingresos), salidas (desembolsos + gastos), neto del período y cantidad de movimientos.' },
          { title: 'Resumen Financiero (P&L)', description: 'Estado de resultados del período: ingresos por interés y mora cobrados, gastos por categoría, utilidad neta y margen. Incluye también capital desembolsado y capital recuperado.' },
          { title: 'Compatible con Excel y contadores', description: 'Los CSVs incluyen BOM UTF-8 para que Excel detecte los acentos correctamente. Si tu contador usa Quickbooks/Sage/Visma, los CSVs son drop-in.', tip: 'Recomendamos descargar los 3 al cierre de cada mes y enviárselos al contador junto con los recibos.' },
        ],
      },
    ],
  },

  // ═══════════════════════════════════════════════════════
  {
    section: 'CONFIGURACIÓN AVANZADA',
    items: [
      {
        id: 'crear-usuario',
        icon: <UserPlus className="w-5 h-5" />,
        title: 'Crear un usuario (cobrador / administrador)',
        subtitle: 'Agrega personas de tu equipo con permisos limitados',
        shortcutPath: '/settings/users',
        shortcutLabel: 'Ir a Usuarios',
        requiredPermission: 'settings.users',
        steps: [
          { title: 'Abre Configuración → Usuarios', description: 'En el menú lateral: "Configuración" → "Usuarios" → botón "+ Nuevo Usuario".' },
          { title: 'Completa los datos', description: 'Nombre completo, correo electrónico (será su login) y contraseña inicial. El usuario podrá cambiarla después.' },
          { title: 'Asigna un rol', description: 'Los roles definen qué puede hacer: "Cobrador" (cobra y consulta), "Administrador" (gestión completa), "Visualizador" (solo lectura).', tip: 'El rol da permisos base. Después puedes ajustar permisos específicos (ej: "este cobrador SI puede crear clientes pero NO puede anular préstamos") en la pestaña de Permisos del usuario.' },
          { title: 'Asigna sucursal (opcional)', description: 'Si tienes varias sucursales, asigna a cuál pertenece. Solo verá clientes y préstamos de su sucursal.' },
          { title: 'Guarda', description: 'El usuario recibe sus credenciales y puede iniciar sesión inmediatamente. Si necesitas desactivarlo en el futuro, hazlo desde la lista (no se elimina, solo se inactiva).', tip: 'Cada plan tiene un límite de usuarios. Si te quedas sin cupo, haz upgrade del plan en Configuración → Suscripción.' },
        ],
      },
      {
        id: 'activar-whatsapp',
        icon: <MessageCircle className="w-5 h-5" />,
        title: 'Activar mensajes automáticos de WhatsApp',
        subtitle: 'Configura para que el sistema te prepare drafts cuando ocurren eventos',
        shortcutPath: '/whatsapp',
        shortcutLabel: 'Ir a WhatsApp',
        requiredPermission: 'whatsapp.view',
        steps: [
          { title: 'Abre WhatsApp → tab "Configuración"', description: 'Verás 6 eventos: Préstamo creado, Pago recibido, Por vencer (3 días), Mora 1/7/15 días.' },
          { title: 'Activa los eventos que quieras', description: 'Cada switch activa la generación automática de drafts. Recomendamos empezar con "Préstamo creado" y "Pago recibido", agregar los de mora después.' },
          { title: '(Opcional) Personaliza la plantilla', description: 'En el tab "Plantillas" puedes crear tus propias con tu estilo. Variables: {{cliente.nombre}}, {{prestamo.monto}}, {{prestamo.proxima_cuota}}, etc.' },
          { title: 'Revisa la Bandeja periódicamente', description: 'Cuando ocurra un evento, aparece un draft en el tab "Bandeja". Lo revisas, opcionalmente lo editas, y clicas "Enviar por WhatsApp".', tip: 'Los mensajes se envían desde TU cuenta de WhatsApp (no es el sistema enviando). El cliente recibe el mensaje del número del cobrador que clica Enviar.' },
          { title: 'Silenciar un cliente específico', description: 'Si un cliente pide no recibir mensajes (o hizo una promesa de pago y no quieres molestarlo), ve a su ficha y activa "Silenciar mensajes automáticos".' },
        ],
      },
      {
        id: 'cambiar-renovar-plan',
        icon: <Package className="w-5 h-5" />,
        title: 'Cambiar o renovar tu plan de suscripción',
        subtitle: 'Cómo solicitar un upgrade, downgrade o renovación del plan actual',
        shortcutPath: '/settings/subscription',
        shortcutLabel: 'Ir a Mi Suscripción',
        steps: [
          { title: 'Abre Configuración → Mi Suscripción', description: 'Verás el estado de tu plan actual (Activa, Periodo de prueba, Expirada) y la lista de todos los planes disponibles con sus características y precio.' },
          { title: 'Elige el plan que quieres', description: 'Compara las características de cada plan: cantidad de cobradores, clientes, usuarios y funciones incluidas. Tu plan actual aparece marcado en verde con "PLAN ACTUAL".' },
          { title: 'Click en "Solicitar este plan"', description: 'Se abrirá un cuadro para confirmar. Puedes agregar una nota opcional con detalles (ej: "Quiero activarlo el 15 de este mes", "prefiero pago trimestral", etc).', tip: 'No te cobramos automáticamente — la solicitud va al equipo de soporte de CredyTek para procesarla manualmente.' },
          { title: 'Espera el contacto de soporte', description: 'Tu solicitud queda visible en la página con un banner azul "Solicitud en proceso". El equipo de CredyTek te contactará por WhatsApp o email para coordinar el pago y activación.' },
          { title: 'Pago y activación', description: 'Una vez procesado el pago manualmente con nuestro equipo, soporte activa tu plan en el sistema y verás el nuevo límite de usuarios/clientes/cobradores disponible inmediatamente.', tip: 'Si ya tienes una solicitud pendiente, el sistema no te dejará enviar otra hasta que la primera se resuelva. Esto evita duplicados. Si necesitas cancelarla, contacta a soporte por WhatsApp.' },
          { title: 'Renovar antes de que expire', description: 'El sistema te avisa con 3, 7 y 14 días de antelación cuando tu plan está por vencer. Aprovecha para solicitar la renovación con tiempo y evitar cortes de servicio.' },
        ],
      },
    ],
  },
]

const HelpPage: React.FC = () => {
  const { can } = usePermission()
  const [openId, setOpenId] = useState<string | null>(null)

  // Filtrar guias por permisos del usuario
  const visibleGroups = useMemo(() => {
    return GUIDES.map(group => ({
      section: group.section,
      items: group.items.filter(g => {
        if (g.requiredPermission && !can(g.requiredPermission)) return false
        if (g.requiredAnyPermission && !g.requiredAnyPermission.some(p => can(p))) return false
        return true
      }),
    })).filter(group => group.items.length > 0)
  }, [can])

  // Abrir el primer item visible por defecto
  React.useEffect(() => {
    if (openId === null && visibleGroups.length > 0 && visibleGroups[0].items.length > 0) {
      setOpenId(visibleGroups[0].items[0].id)
    }
  }, [visibleGroups, openId])

  const totalVisible = visibleGroups.reduce((sum, g) => sum + g.items.length, 0)
  const totalHidden = GUIDES.reduce((sum, g) => sum + g.items.length, 0) - totalVisible

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <HelpCircle className="w-6 h-6 text-[#1e3a5f]" />
          Guía del Sistema
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Aprende a usar CredyTek paso a paso. Si tienes dudas, vuelve a esta sección.
        </p>
      </div>

      <Card className="bg-amber-50 border-amber-200 p-4">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-semibold mb-1">Orden recomendado para tu primer préstamo</p>
            <p className="leading-relaxed">
              <strong>1) Cuenta bancaria</strong> (de dónde sale el dinero) →{' '}
              <strong>2) Producto</strong> (plantilla de préstamo — obligatorio antes de poder crear un préstamo) →{' '}
              <strong>3) Cliente</strong> →{' '}
              <strong>4) Préstamo</strong> →{' '}
              <strong>5) Pago</strong> (cuando el cliente abone).
              Después explora <strong>Cobranzas</strong> y las <strong>Herramientas Complementarias</strong>.
            </p>
          </div>
        </div>
      </Card>

      {totalHidden > 0 && (
        <Card className="bg-blue-50 border-blue-200 p-3">
          <p className="text-xs text-blue-900">
            <strong>{totalVisible}</strong> guías visibles según tu plan y permisos.{' '}
            <strong>{totalHidden}</strong> guías ocultas (requieren funciones de planes superiores o permisos que no tienes).{' '}
            <Link to="/billing" className="font-semibold hover:underline">Ver planes →</Link>
          </p>
        </Card>
      )}

      {visibleGroups.map((group, gi) => (
        <div key={gi} className="space-y-3">
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wide mt-6 mb-2">
            {group.section}
          </h2>
          {group.items.map((g) => {
            const isOpen = openId === g.id
            return (
              <Card key={g.id} className="overflow-hidden p-0">
                <button
                  onClick={() => setOpenId(isOpen ? null : g.id)}
                  className="w-full flex items-center justify-between gap-3 p-4 hover:bg-slate-50 transition text-left"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#1e3a5f]/10 flex items-center justify-center text-[#1e3a5f] flex-shrink-0">
                      {g.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900">{g.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{g.subtitle}</p>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />}
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 p-5 bg-slate-50/50">
                    <ol className="space-y-4">
                      {g.steps.map((s, i) => (
                        <li key={i} className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-[#1e3a5f] text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-900 text-sm">{s.title}</p>
                            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{s.description}</p>
                            {s.tip && (
                              <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                                <Lightbulb className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-900 leading-relaxed">
                                  <strong>Tip:</strong> {s.tip}
                                </p>
                              </div>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>

                    {g.shortcutPath && (
                      <div className="mt-5 pt-4 border-t border-slate-200">
                        <Link
                          to={g.shortcutPath}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-[#1e3a5f] text-white text-sm font-medium rounded-lg hover:bg-[#152a45] transition"
                        >
                          {g.shortcutLabel || 'Ir ahora'}
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      ))}

      <Card className="text-center p-5">
        <Settings className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm text-slate-600">
          ¿Necesitas más ayuda? Escribe a{' '}
          <a href="mailto:soporte@prestamax.com" className="text-[#1e3a5f] font-medium hover:underline">
            soporte@prestamax.com
          </a>
        </p>
      </Card>
    </div>
  )
}

export default HelpPage

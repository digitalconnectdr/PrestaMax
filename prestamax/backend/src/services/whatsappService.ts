// whatsappService — generacion automatica de drafts transaccionales
//
// Cuando ocurre un evento (loan_created, payment_received, overdue), este
// service crea un row en whatsapp_messages con status='draft' que el usuario
// puede revisar y enviar manualmente desde la Bandeja de Envios.
//
// Decisiones de diseno:
// - Generacion best-effort: cualquier error se loguea pero NO interrumpe
//   la transaccion principal (crear prestamo o registrar pago).
// - Multi-tenant: cada draft tiene tenant_id obligatorio.
// - Configurabilidad: si el evento no esta enabled para el tenant en
//   whatsapp_event_settings, no se genera nada (default OFF).
// - Templates: se usa la template configurada en event_settings.template_id.
//   Si no hay, se busca la primera plantilla active del tenant para ese event.
//   Si tampoco hay, se usa un fallback en codigo.

import { uuid, now } from '../db/database';

export type WhatsAppEvent =
  | 'loan_created'
  | 'payment_received'
  | 'overdue_1'
  | 'overdue_7'
  | 'overdue_15';

export const WA_EVENTS: WhatsAppEvent[] = [
  'loan_created',
  'payment_received',
  'overdue_1',
  'overdue_7',
  'overdue_15',
];

export const WA_EVENT_LABELS: Record<WhatsAppEvent, string> = {
  loan_created:      'Prestamo creado (bienvenida)',
  payment_received:  'Pago recibido (confirmacion)',
  overdue_1:         'Mora 1 dia',
  overdue_7:         'Mora 7 dias',
  overdue_15:        'Mora 15 dias',
};

// Fallback templates si el tenant no ha creado ninguna para el evento
const FALLBACK_TEMPLATES: Record<WhatsAppEvent, string> = {
  loan_created:
    'Hola {{cliente.nombre}}, te confirmamos que tu prestamo #{{prestamo.numero}} por {{moneda}} {{prestamo.monto}} ha sido aprobado. Tu primera cuota vence el {{prestamo.primera_cuota}}. Cualquier consulta estamos a tus ordenes. — {{empresa.nombre}}',
  payment_received:
    'Hola {{cliente.nombre}}, recibimos tu pago de {{moneda}} {{pago.monto}} aplicado a tu prestamo #{{prestamo.numero}}. Tu balance restante es {{moneda}} {{prestamo.balance}}. Tu proxima cuota vence el {{prestamo.proxima_cuota}}. Gracias por tu puntualidad. — {{empresa.nombre}}',
  overdue_1:
    'Hola {{cliente.nombre}}, te recordamos que la cuota de tu prestamo #{{prestamo.numero}} venció ayer. Monto pendiente: {{moneda}} {{prestamo.mora}}. Ponte al dia para evitar cargos por mora. — {{empresa.nombre}}',
  overdue_7:
    'Hola {{cliente.nombre}}, tu prestamo #{{prestamo.numero}} tiene 7 dias de atraso. Saldo vencido: {{moneda}} {{prestamo.mora}}. Por favor comunicate con nosotros para coordinar el pago. — {{empresa.nombre}}',
  overdue_15:
    'Hola {{cliente.nombre}}, tu prestamo #{{prestamo.numero}} tiene 15 dias de atraso. Saldo vencido: {{moneda}} {{prestamo.mora}}. Es importante regularizar la situacion para evitar acciones de cobranza. — {{empresa.nombre}}',
};

// Interpolar variables {{ruta.campo}} en un body de template
export function interpolate(body: string, vars: Record<string, any>): string {
  if (!body) return '';
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const parts = String(path).split('.');
    let v: any = vars;
    for (const p of parts) {
      if (v == null) return `{{${path}}}`;
      v = v[p];
    }
    if (v == null) return `{{${path}}}`;
    return String(v);
  });
}

// Formatear numero como moneda (sin simbolo, ej "12,500.00")
function fmtAmount(n: any): string {
  const v = typeof n === 'number' ? n : parseFloat(n) || 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Formatear fecha ISO a "DD/MM/YYYY"
function fmtDate(iso: any): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  } catch (_) { return ''; }
}

// Build context para una plantilla. Devuelve undefined si datos insuficientes
function buildContext(
  db: any,
  tenant_id: string,
  event: WhatsAppEvent,
  data: { client_id?: string; loan_id?: string; payment_id?: string }
): { vars: Record<string, any>; client: any; loan?: any; payment?: any } | undefined {
  const tenant = db.prepare('SELECT id, name, phone, currency FROM tenants WHERE id=?').get(tenant_id) as any;
  if (!tenant) return undefined;

  let client: any = null;
  let loan: any = null;
  let payment: any = null;

  if (data.loan_id) {
    loan = db.prepare('SELECT * FROM loans WHERE id=? AND tenant_id=?').get(data.loan_id, tenant_id);
    if (loan && !data.client_id) data.client_id = loan.client_id;
  }
  if (data.payment_id) {
    payment = db.prepare('SELECT * FROM payments WHERE id=? AND tenant_id=?').get(data.payment_id, tenant_id);
    if (payment && !data.loan_id && payment.loan_id) {
      loan = db.prepare('SELECT * FROM loans WHERE id=? AND tenant_id=?').get(payment.loan_id, tenant_id);
      if (loan && !data.client_id) data.client_id = loan.client_id;
    }
  }
  if (data.client_id) {
    client = db.prepare('SELECT * FROM clients WHERE id=? AND tenant_id=?').get(data.client_id, tenant_id);
  }
  if (!client) return undefined;

  // Proxima cuota pendiente (si hay loan)
  let proxima_cuota = '';
  if (loan?.id) {
    const next = db.prepare(`SELECT due_date FROM installments
      WHERE loan_id=? AND status IN ('pending','partial','overdue')
      ORDER BY due_date ASC LIMIT 1`).get(loan.id) as any;
    proxima_cuota = next?.due_date ? fmtDate(next.due_date) : '';
  }

  const moneda = loan?.currency || tenant.currency || 'DOP';
  const monedaSimbolo =
    moneda === 'DOP' ? 'RD$' :
    moneda === 'USD' ? 'US$' :
    moneda === 'EUR' ? '€'  :
    `${moneda} `;

  const vars: Record<string, any> = {
    moneda: monedaSimbolo.trim(),
    empresa: {
      nombre: tenant.name || '',
      telefono: tenant.phone || '',
    },
    cliente: {
      nombre: client.first_name || client.full_name || '',
      nombre_completo: client.full_name || '',
      whatsapp: client.whatsapp || client.phone_personal || '',
    },
    prestamo: loan ? {
      numero: loan.loan_number || '',
      monto: fmtAmount(loan.disbursed_amount || loan.approved_amount || loan.requested_amount),
      balance: fmtAmount(loan.total_balance),
      mora: fmtAmount(loan.mora_balance),
      cuotas: loan.term || '',
      primera_cuota: fmtDate(loan.first_payment_date),
      proxima_cuota,
    } : undefined,
    pago: payment ? {
      monto: fmtAmount(payment.amount),
      fecha: fmtDate(payment.payment_date || payment.created_at),
      metodo: payment.payment_method || '',
    } : undefined,
  };

  return { vars, client, loan, payment };
}

// Genera un draft. Best-effort: nunca tira excepcion al caller.
export function generateDraft(
  db: any,
  tenant_id: string,
  event: WhatsAppEvent,
  data: { client_id?: string; loan_id?: string; payment_id?: string; user_id?: string }
): string | undefined {
  try {
    // 1. Esta el evento habilitado?
    const cfg = db.prepare(
      `SELECT enabled, template_id FROM whatsapp_event_settings WHERE tenant_id=? AND event=?`
    ).get(tenant_id, event) as any;
    if (!cfg || !cfg.enabled) return undefined;

    // 2. Buscar template (configurada o cualquiera del evento)
    let tpl: any = null;
    if (cfg.template_id) {
      tpl = db.prepare(
        `SELECT * FROM whatsapp_templates WHERE id=? AND tenant_id=? AND is_active=1`
      ).get(cfg.template_id, tenant_id);
    }
    if (!tpl) {
      tpl = db.prepare(
        `SELECT * FROM whatsapp_templates WHERE tenant_id=? AND event=? AND is_active=1 ORDER BY name LIMIT 1`
      ).get(tenant_id, event);
    }
    const body = tpl?.body || FALLBACK_TEMPLATES[event];

    // 3. Build context con datos del cliente/prestamo/pago
    const ctx = buildContext(db, tenant_id, event, data);
    if (!ctx) return undefined;

    // 4. Validar que tengamos un telefono
    const phone = ctx.client.whatsapp || ctx.client.phone_personal || '';
    if (!phone) return undefined;

    // 5. Interpolar y guardar
    const interpolated = interpolate(body, ctx.vars);
    const id = uuid();
    db.prepare(
      `INSERT INTO whatsapp_messages
       (id, tenant_id, user_id, client_id, loan_id, payment_id, client_phone, event, body, status, is_draft, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?)`
    ).run(
      id,
      tenant_id,
      data.user_id || null,
      ctx.client.id,
      ctx.loan?.id || null,
      ctx.payment?.id || null,
      phone,
      event,
      interpolated,
      now()
    );
    return id;
  } catch (e: any) {
    // No interrumpir el flujo principal — solo loguear
    console.error(`[whatsappService.generateDraft ${event}] error:`, e?.message || e);
    return undefined;
  }
}

// Helper para verificar si un evento esta enabled (usado por hooks)
export function isEventEnabled(db: any, tenant_id: string, event: WhatsAppEvent): boolean {
  try {
    const cfg = db.prepare(
      `SELECT enabled FROM whatsapp_event_settings WHERE tenant_id=? AND event=?`
    ).get(tenant_id, event) as any;
    return !!cfg?.enabled;
  } catch (_) {
    return false;
  }
}

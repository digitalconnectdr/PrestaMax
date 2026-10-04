// emailService — notificaciones email al admin de la plataforma.
//
// Estrategia:
//   - Lazy: si no hay RESEND_API_KEY configurada, NO se envia (log y sigue).
//     Asi el sistema funciona sin email durante desarrollo o si no se
//     ha configurado todavia.
//   - Usa fetch nativo (Node 18+) contra la API de Resend — no requiere
//     instalar SDK. Lo mantenemos sin dependencia para que sea drop-in.
//   - Reintentos: 1 reintento tras 2s si el primer call falla con 5xx.
//
// Setup en Render (cuando quieras activar):
//   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
//   ADMIN_EMAIL=jcpenalo@gmail.com           — destinatario(s), separados por coma
//   ADMIN_WHATSAPP=18095551234               — solo digitos, para wa.me link
//   FROM_EMAIL=CredyTek <noreply@prestamax.com>   — opcional, default usa onboarding@resend.dev
//   FRONTEND_URL=https://credytek.vercel.app — para link al admin

// Escapa texto que puede venir de formularios publicos o de usuarios antes de
// interpolarlo en HTML de email (evita inyeccion de enlaces/markup en el buzon).
export function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const esc = escapeHtml;

interface InquiryPayload {
  id: string;
  full_name: string;
  business_name?: string | null;
  whatsapp: string;
  email: string;
  country: string;
  plan_interest?: string | null;
  portfolio_size?: string | null;
  source?: string | null;
  message?: string | null;
}

const PLAN_LABELS: Record<string, string> = {
  trial:        'Trial (14 dias gratis)',
  starter:      'Starter ($9.99/mes)',
  basico:       'Basico ($24.99/mes)',
  profesional:  'Profesional ($49.99/mes)',
  enterprise:   'Enterprise ($99.99/mes)',
  unsure:       'No esta seguro - quiere asesoramiento',
};

const SIZE_LABELS: Record<string, string> = {
  '<50':     'Menos de 50 prestamos',
  '50-200':  '50 - 200 prestamos',
  '200-500': '200 - 500 prestamos',
  '500+':    'Mas de 500 prestamos',
  'unsure':  'No esta seguro',
};

const SOURCE_LABELS: Record<string, string> = {
  google:     'Busqueda en Google',
  facebook:   'Facebook',
  instagram:  'Instagram',
  whatsapp:   'WhatsApp',
  referral:   'Referido por alguien',
  youtube:    'YouTube',
  other:      'Otro',
};

const COUNTRY_LABELS: Record<string, string> = {
  DO:'Republica Dominicana', MX:'Mexico', CO:'Colombia', PE:'Peru',
  CL:'Chile', AR:'Argentina', VE:'Venezuela', EC:'Ecuador', BO:'Bolivia',
  PY:'Paraguay', UY:'Uruguay', CR:'Costa Rica', PA:'Panama', GT:'Guatemala',
  SV:'El Salvador', HN:'Honduras', NI:'Nicaragua', HT:'Haiti',
  US:'Estados Unidos', ES:'Espana', OTHER:'Otro',
};

function buildWaLink(whatsapp: string, name: string, plan: string | null | undefined): string {
  const digits = (whatsapp || '').replace(/\D/g, '');
  const firstName = (name || '').split(' ')[0] || '';
  const planTxt = plan && plan !== 'unsure' ? `el plan ${PLAN_LABELS[plan] || plan}` : 'CredyTek';
  const body = `Hola ${firstName}, soy Juan de CredyTek. Vi tu solicitud sobre ${planTxt}. ¿Tienes 10 minutos para conversar y ayudarte a evaluar si nuestra solución es lo que necesitas?`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}

function buildHtml(p: InquiryPayload): string {
  const planLbl    = PLAN_LABELS[p.plan_interest || ''] || p.plan_interest || '—';
  const sizeLbl    = SIZE_LABELS[p.portfolio_size || ''] || p.portfolio_size || '—';
  const sourceLbl  = SOURCE_LABELS[p.source || ''] || p.source || '—';
  const countryLbl = COUNTRY_LABELS[p.country] || p.country;
  const frontUrl   = process.env.FRONTEND_URL || 'https://credytek.vercel.app';
  const waLink     = buildWaLink(p.whatsapp, p.full_name, p.plan_interest);

  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1e3a5f;color:white;padding:20px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;">🎯 Nuevo lead de CredyTek</h1>
    <p style="margin:4px 0 0;opacity:0.85;font-size:14px;">${esc(planLbl)}</p>
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Nombre</td><td style="padding:8px 0;font-weight:600;">${esc(p.full_name)}</td></tr>
      ${p.business_name ? `<tr><td style="padding:8px 0;color:#6b7280;">Empresa</td><td style="padding:8px 0;">${p.business_name}</td></tr>` : ''}
      <tr><td style="padding:8px 0;color:#6b7280;">WhatsApp</td><td style="padding:8px 0;font-family:monospace;">${esc(p.whatsapp)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Email</td><td style="padding:8px 0;"><a href="mailto:${esc(p.email)}" style="color:#1e3a5f;">${esc(p.email)}</a></td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Pais</td><td style="padding:8px 0;">${esc(countryLbl)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Plan</td><td style="padding:8px 0;">${esc(planLbl)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Cartera</td><td style="padding:8px 0;">${esc(sizeLbl)}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Fuente</td><td style="padding:8px 0;">${esc(sourceLbl)}</td></tr>
      ${p.message ? `<tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;">Mensaje</td><td style="padding:8px 0;white-space:pre-wrap;">${esc(p.message)}</td></tr>` : ''}
    </table>
    <div style="margin-top:20px;display:flex;gap:8px;">
      <a href="${esc(waLink)}" style="background:#25D366;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">💬 Abrir WhatsApp</a>
      <a href="${frontUrl}/admin?tab=inquiries" style="background:#1e3a5f;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">📋 Ver en Admin</a>
    </div>
    <p style="margin-top:20px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px;">ID: ${esc(p.id)} · Sistema CredyTek · Notificacion automatica</p>
  </div>
</body></html>`.trim();
}

function buildText(p: InquiryPayload): string {
  const planLbl    = PLAN_LABELS[p.plan_interest || ''] || p.plan_interest || '—';
  const sizeLbl    = SIZE_LABELS[p.portfolio_size || ''] || p.portfolio_size || '—';
  const sourceLbl  = SOURCE_LABELS[p.source || ''] || p.source || '—';
  const countryLbl = COUNTRY_LABELS[p.country] || p.country;
  const waLink     = buildWaLink(p.whatsapp, p.full_name, p.plan_interest);

  return [
    '🎯 NUEVO LEAD DE PRESTAMAX',
    '',
    `Nombre:    ${p.full_name}`,
    p.business_name ? `Empresa:   ${p.business_name}` : null,
    `WhatsApp:  ${p.whatsapp}`,
    `Email:     ${p.email}`,
    `Pais:      ${countryLbl}`,
    `Plan:      ${planLbl}`,
    `Cartera:   ${sizeLbl}`,
    `Fuente:    ${sourceLbl}`,
    p.message ? `\nMensaje:\n${p.message}` : null,
    '',
    `Abrir WhatsApp: ${waLink}`,
    '',
    `ID: ${p.id}`,
  ].filter(Boolean).join('\n');
}

// Envio generico via Resend, con el mismo manejo de lazy-off + reintento que
// ya usaba sendInquiryNotification. Compartido por todos los emails salientes.
let warnedNoFrom = false;
async function sendViaResend(to: string[], subject: string, html: string, text: string, logLabel: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email] RESEND_API_KEY no configurada — skip ${logLabel}`);
    return false;
  }
  const from = process.env.FROM_EMAIL || 'CredyTek <onboarding@resend.dev>';
  if (!process.env.FROM_EMAIL && !warnedNoFrom) {
    warnedNoFrom = true;
    console.warn('[email] FROM_EMAIL no configurada: se usa onboarding@resend.dev (Resend solo entrega a la cuenta titular). Configura un remitente de dominio verificado.');
  }
  const payload = { from, to, subject, html, text };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        console.log(`[email] ${logLabel} enviado (${to.length} destinatario${to.length === 1 ? '' : 's'})`);
        return true;
      }
      const err = await resp.text();
      console.error(`[email] Resend ${resp.status} (${logLabel}): ${err.slice(0, 200)}`);
      // 5xx → reintento; 4xx → no
      if (resp.status < 500) return false;
      await new Promise(r => setTimeout(r, 2000));
    } catch (e: any) {
      console.error(`[email] fetch fallo (${logLabel}):`, e?.message || e);
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    }
  }
  return false;
}

export async function sendInquiryNotification(p: InquiryPayload): Promise<boolean> {
  const to = process.env.ADMIN_EMAIL;
  if (!to) {
    console.log('[email] ADMIN_EMAIL no configurada — skip notificacion');
    return false;
  }
  const recipients = to.split(',').map(s => s.trim()).filter(Boolean);
  const subject = `[CredyTek] Lead nuevo: ${p.full_name}${p.business_name ? ' (' + p.business_name + ')' : ''}`;
  return sendViaResend(recipients, subject, buildHtml(p), buildText(p), `lead ${p.id}`);
}

// ─── Bienvenida al registrarse (al tenant nuevo) ────────────────────────────
// FIX (onboarding audit, Sep 2026): un tenant que se registraba y no
// terminaba el primer recorrido en esa misma sesion no recibia NINGUN correo
// hasta el aviso de trial por vencer (3 dias antes) -- cero forma de traerlo
// de vuelta si se distrajo. Este correo sale una sola vez, al momento del
// registro, con los mismos 3 pasos del checklist "Primeros pasos".
interface WelcomePayload {
  tenantId: string;
  tenantName: string;
  adminName: string;
  toEmail: string;
  trialDays: number;
}

function buildWelcomeHtml(p: WelcomePayload): string {
  const frontUrl = process.env.FRONTEND_URL || 'https://credytek.vercel.app';
  const firstName = esc((p.adminName || '').trim().split(/\s+/)[0] || p.adminName);
  const intro = p.trialDays > 0
    ? `Tu cuenta de <strong>${esc(p.tenantName)}</strong> ya está activa, con ${p.trialDays} días de prueba gratis y sin tarjeta de crédito.`
    : `Tu cuenta de <strong>${esc(p.tenantName)}</strong> ya está activa.`;
  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1e3a5f;color:white;padding:20px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;">¡Bienvenido a CredyTek, ${firstName}!</h1>
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
    <p>${intro}</p>
    <p>En menos de 5 minutos puedes tener tu primer préstamo funcionando:</p>
    <ol style="padding-left:20px;line-height:1.8;">
      <li><strong>Agrega tu cuenta bancaria</strong> — de ahí sale el dinero que prestas y ahí entran los pagos.</li>
      <li><strong>Registra tu primer cliente</strong> — nombre, cédula y teléfono bastan para empezar.</li>
      <li><strong>Crea tu primer préstamo</strong> — ya tienes un producto de ejemplo listo, solo elige monto y plazo.</li>
    </ol>
    <div style="margin-top:20px;">
      <a href="${frontUrl}/dashboard" style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Entrar a CredyTek</a>
    </div>
    <p style="margin-top:20px;color:#6b7280;font-size:13px;">¿Alguna duda para empezar? Responde este correo o escríbenos a credytek@digitalconnectdr.com — con gusto te ayudamos directamente.</p>
    <p style="margin-top:20px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px;">CredyTek · Notificación automática de tu cuenta</p>
  </div>
</body></html>`.trim();
}

function buildWelcomeText(p: WelcomePayload): string {
  const frontUrl = process.env.FRONTEND_URL || 'https://credytek.vercel.app';
  const firstName = (p.adminName || '').trim().split(/\s+/)[0] || p.adminName;
  const intro = p.trialDays > 0
    ? `Tu cuenta de ${p.tenantName} ya esta activa, con ${p.trialDays} dias de prueba gratis y sin tarjeta de credito.`
    : `Tu cuenta de ${p.tenantName} ya esta activa.`;
  return [
    `¡BIENVENIDO A CREDYTEK, ${firstName.toUpperCase()}!`,
    '',
    intro,
    'En menos de 5 minutos puedes tener tu primer prestamo funcionando:',
    '',
    '1) Agrega tu cuenta bancaria - de ahi sale el dinero que prestas y ahi entran los pagos.',
    '2) Registra tu primer cliente - nombre, cedula y telefono bastan para empezar.',
    '3) Crea tu primer prestamo - ya tienes un producto de ejemplo listo, solo elige monto y plazo.',
    '',
    `Entrar a CredyTek: ${frontUrl}/dashboard`,
    '',
    'Dudas: credytek@digitalconnectdr.com',
  ].join('\n');
}

export async function sendWelcomeEmail(p: WelcomePayload): Promise<boolean> {
  if (!p.toEmail) return false;
  return sendViaResend([p.toEmail], `Bienvenido a CredyTek — así empiezas`, buildWelcomeHtml(p), buildWelcomeText(p), `welcome ${p.tenantId}`);
}

// ─── Recordatorio de trial por vencer (al tenant, no al admin) ──────────────
// Antes NINGUN email salia hacia el tenant -- se enteraba de que su prueba
// terminaba solo al chocar con el bloqueo de pago. Se dispara a los 3, 1 y 0
// dias restantes (ver trialReminderService.ts + cron en index.ts).
interface TrialReminderPayload {
  tenantId: string;
  tenantName: string;
  toEmail: string;
  daysLeft: number;
  /** true = el trial ya termino (hito 'vencido'). */
  expired?: boolean;
}

function trialHeadline(p: TrialReminderPayload, plain: boolean): string {
  if (p.expired) return 'Tu prueba gratis de CredyTek terminó';
  if (p.daysLeft <= 0) return 'Tu prueba gratis de CredyTek vence hoy';
  if (p.daysLeft === 1) return 'Tu prueba gratis de CredyTek vence mañana';
  return `Tu prueba gratis de CredyTek vence en ${p.daysLeft} ${plain ? 'dias' : 'días'}`;
}

function buildTrialReminderHtml(p: TrialReminderPayload): string {
  const frontUrl = process.env.FRONTEND_URL || 'https://credytek.vercel.app';
  const headline = trialHeadline(p, false);
  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1e3a5f;color:white;padding:20px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;">⏱️ ${headline}</h1>
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
    <p>Hola,</p>
    <p><strong>${esc(p.tenantName)}</strong> ha estado usando CredyTek durante tu período de prueba. ${p.expired ? 'Tu acceso está en pausa; elige un plan para reactivarlo (tus datos se conservan).' : 'Para no perder acceso a tus clientes, préstamos y pagos ya cargados, elige un plan antes de que termine.'}</p>
    <div style="margin-top:20px;">
      <a href="${frontUrl}/settings/subscription" style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Ver planes y continuar</a>
    </div>
    <p style="margin-top:20px;color:#6b7280;font-size:13px;">¿Dudas sobre qué plan te conviene? Responde este correo o escríbenos a credytek@digitalconnectdr.com.</p>
    <p style="margin-top:20px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px;">CredyTek · Notificación automática de tu cuenta</p>
  </div>
</body></html>`.trim();
}

function buildTrialReminderText(p: TrialReminderPayload): string {
  const frontUrl = process.env.FRONTEND_URL || 'https://credytek.vercel.app';
  const headline = trialHeadline(p, true);
  return [
    headline.toUpperCase(),
    '',
    `${p.tenantName} ha estado usando CredyTek durante tu periodo de prueba.`,
    p.expired
      ? 'Tu acceso esta en pausa; elige un plan para reactivarlo (tus datos se conservan).'
      : 'Para no perder acceso a tus clientes, prestamos y pagos ya cargados, elige un plan antes de que termine.',
    '',
    `Ver planes: ${frontUrl}/settings/subscription`,
    '',
    'Dudas: credytek@digitalconnectdr.com',
  ].join('\n');
}

export async function sendTrialReminderEmail(p: TrialReminderPayload): Promise<boolean> {
  if (!p.toEmail) return false;
  const subject = p.expired
    ? 'Tu prueba de CredyTek terminó'
    : p.daysLeft <= 0
    ? 'Tu prueba de CredyTek vence hoy'
    : p.daysLeft === 1
    ? 'Tu prueba de CredyTek vence mañana'
    : `Tu prueba de CredyTek vence en ${p.daysLeft} días`;
  return sendViaResend([p.toEmail], subject, buildTrialReminderHtml(p), buildTrialReminderText(p), `trial-reminder ${p.tenantId}/${p.expired ? 'expired' : p.daysLeft + 'd'}`);
}

// ─── Recuperacion de contraseña ──────────────────────────────────────────
export async function sendPasswordResetEmail(p: { toEmail: string; fullName: string; resetUrl: string }): Promise<boolean> {
  if (!p.toEmail) return false;
  const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1e3a5f;color:white;padding:20px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;">🔑 Restablece tu contraseña</h1>
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
    <p>Hola ${esc(p.fullName || '')},</p>
    <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta de CredyTek. Este enlace expira en 2 horas.</p>
    <div style="margin-top:20px;">
      <a href="${esc(p.resetUrl)}" style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Restablecer contraseña</a>
    </div>
    <p style="margin-top:20px;color:#6b7280;font-size:13px;">Si no solicitaste esto, ignora este correo — tu contraseña actual sigue siendo válida.</p>
    <p style="margin-top:20px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px;">CredyTek · Notificación automática de seguridad</p>
  </div>
</body></html>`.trim();
  const text = `Restablece tu contraseña de CredyTek\n\nEnlace (expira en 2 horas): ${p.resetUrl}\n\nSi no solicitaste esto, ignora este correo.`;
  return sendViaResend([p.toEmail], 'Restablece tu contraseña de CredyTek', html, text, 'password-reset');
}

// ─── Alerta de inicio de sesion desde ubicacion nueva ────────────────────
export async function sendNewLoginAlertEmail(p: { toEmail: string; fullName: string; city: string | null; country: string | null; ip: string | null }): Promise<boolean> {
  if (!p.toEmail) return false;
  const frontUrl = process.env.FRONTEND_URL || 'https://credytek.vercel.app';
  const where = [p.city, p.country].filter(Boolean).join(', ') || 'una ubicación desconocida';
  const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1e3a5f;color:white;padding:20px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;">🛡️ Nuevo inicio de sesión</h1>
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
    <p>Hola ${esc(p.fullName || '')},</p>
    <p>Detectamos un inicio de sesión en tu cuenta de CredyTek desde <strong>${esc(where)}</strong>${p.ip ? ` (IP ${esc(p.ip)})` : ''}.</p>
    <p>Si fuiste tú, no necesitas hacer nada. Si no reconoces este acceso, cambia tu contraseña de inmediato.</p>
    <div style="margin-top:20px;">
      <a href="${frontUrl}/settings" style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Ir a mi cuenta</a>
    </div>
    <p style="margin-top:20px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px;">CredyTek · Notificación automática de seguridad</p>
  </div>
</body></html>`.trim();
  const text = `Nuevo inicio de sesión en CredyTek desde ${where}${p.ip ? ` (IP ${p.ip})` : ''}.\n\nSi no fuiste tú, cambia tu contraseña de inmediato: ${frontUrl}/settings`;
  return sendViaResend([p.toEmail], 'Nuevo inicio de sesión en tu cuenta de CredyTek', html, text, 'new-login-alert');
}

// ─── Reporte de dashboard programado (digest) ────────────────────────────
// Antes ningun reporte se enviaba automaticamente por email -- el dueño
// tenia que entrar al sistema a revisarlo cada vez.
interface DashboardDigestPayload {
  toEmail: string;
  tenantName: string;
  frequency: string;
  kpis: {
    totalPortfolio: number;
    activePortfolio: number;
    activeLoans: number;
    overdueLoans: number;
    moraBalance: number;
    todayPayments: number;
    totalClients: number;
  };
}

function buildDigestRow(label: string, value: string): string {
  return `<tr><td style="padding:8px 0;color:#6b7280;">${label}</td><td style="padding:8px 0;text-align:right;font-weight:600;">${value}</td></tr>`;
}

export async function sendDashboardDigestEmail(p: DashboardDigestPayload): Promise<boolean> {
  if (!p.toEmail) return false;
  const frontUrl = process.env.FRONTEND_URL || 'https://credytek.vercel.app';
  const freqLabel: Record<string, string> = { daily: 'diario', weekly: 'semanal', monthly: 'mensual' };
  const fmt = (n: number) => `RD$${(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const subject = `Tu resumen ${freqLabel[p.frequency] || ''} de CredyTek — ${p.tenantName}`;
  const html = `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1e3a5f;color:white;padding:20px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;">📊 Resumen ${freqLabel[p.frequency] || ''} — ${esc(p.tenantName)}</h1>
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      ${buildDigestRow('Cartera total', fmt(p.kpis.totalPortfolio))}
      ${buildDigestRow('Cartera activa', fmt(p.kpis.activePortfolio))}
      ${buildDigestRow('Préstamos activos', String(p.kpis.activeLoans))}
      ${buildDigestRow('Préstamos en mora', String(p.kpis.overdueLoans))}
      ${buildDigestRow('Saldo en mora', fmt(p.kpis.moraBalance))}
      ${buildDigestRow('Cobros de hoy', fmt(p.kpis.todayPayments))}
      ${buildDigestRow('Clientes activos', String(p.kpis.totalClients))}
    </table>
    <div style="margin-top:20px;">
      <a href="${frontUrl}/dashboard" style="background:#1e3a5f;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Ver dashboard completo</a>
    </div>
    <p style="margin-top:20px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px;">CredyTek · Puedes desactivar este resumen desde Reportes → Resumen programado.</p>
  </div>
</body></html>`.trim();
  const text = `Resumen ${freqLabel[p.frequency] || ''} de ${p.tenantName}\n\nCartera total: ${fmt(p.kpis.totalPortfolio)}\nCartera activa: ${fmt(p.kpis.activePortfolio)}\nPréstamos activos: ${p.kpis.activeLoans}\nPréstamos en mora: ${p.kpis.overdueLoans}\nSaldo en mora: ${fmt(p.kpis.moraBalance)}\nCobros de hoy: ${fmt(p.kpis.todayPayments)}\nClientes activos: ${p.kpis.totalClients}\n\nVer dashboard: ${frontUrl}/dashboard`;
  return sendViaResend([p.toEmail], subject, html, text, 'dashboard-digest');
}

export const EMAIL_CONFIG = {
  enabled: !!(process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL),
  to: process.env.ADMIN_EMAIL || null,
  from: process.env.FROM_EMAIL || 'CredyTek <onboarding@resend.dev>',
};

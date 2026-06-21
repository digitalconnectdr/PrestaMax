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
//   FRONTEND_URL=https://prestamax-umber.vercel.app — para link al admin

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
  starter:      'Starter ($29.99/mes)',
  basico:       'Basico ($59.99/mes)',
  profesional:  'Profesional ($119.99/mes)',
  enterprise:   'Enterprise ($249.99/mes)',
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
  const frontUrl   = process.env.FRONTEND_URL || 'https://prestamax-umber.vercel.app';
  const waLink     = buildWaLink(p.whatsapp, p.full_name, p.plan_interest);

  return `
<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:#1e3a5f;color:white;padding:20px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;">🎯 Nuevo lead de CredyTek</h1>
    <p style="margin:4px 0 0;opacity:0.85;font-size:14px;">${planLbl}</p>
  </div>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Nombre</td><td style="padding:8px 0;font-weight:600;">${p.full_name}</td></tr>
      ${p.business_name ? `<tr><td style="padding:8px 0;color:#6b7280;">Empresa</td><td style="padding:8px 0;">${p.business_name}</td></tr>` : ''}
      <tr><td style="padding:8px 0;color:#6b7280;">WhatsApp</td><td style="padding:8px 0;font-family:monospace;">${p.whatsapp}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Email</td><td style="padding:8px 0;"><a href="mailto:${p.email}" style="color:#1e3a5f;">${p.email}</a></td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Pais</td><td style="padding:8px 0;">${countryLbl}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Plan</td><td style="padding:8px 0;">${planLbl}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Cartera</td><td style="padding:8px 0;">${sizeLbl}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280;">Fuente</td><td style="padding:8px 0;">${sourceLbl}</td></tr>
      ${p.message ? `<tr><td style="padding:8px 0;color:#6b7280;vertical-align:top;">Mensaje</td><td style="padding:8px 0;white-space:pre-wrap;">${p.message}</td></tr>` : ''}
    </table>
    <div style="margin-top:20px;display:flex;gap:8px;">
      <a href="${waLink}" style="background:#25D366;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">💬 Abrir WhatsApp</a>
      <a href="${frontUrl}/admin?tab=inquiries" style="background:#1e3a5f;color:white;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">📋 Ver en Admin</a>
    </div>
    <p style="margin-top:20px;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px;">ID: ${p.id} · Sistema CredyTek · Notificacion automatica</p>
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

export async function sendInquiryNotification(p: InquiryPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = process.env.ADMIN_EMAIL;

  if (!apiKey) {
    console.log('[email] RESEND_API_KEY no configurada — skip notificacion');
    return false;
  }
  if (!to) {
    console.log('[email] ADMIN_EMAIL no configurada — skip notificacion');
    return false;
  }

  const from = process.env.FROM_EMAIL || 'CredyTek <onboarding@resend.dev>';
  const recipients = to.split(',').map(s => s.trim()).filter(Boolean);
  const subject = `[CredyTek] Lead nuevo: ${p.full_name}${p.business_name ? ' (' + p.business_name + ')' : ''}`;

  const payload = {
    from,
    to: recipients,
    subject,
    html: buildHtml(p),
    text: buildText(p),
  };

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
        console.log(`[email] notificacion enviada a ${recipients.join(',')} (id=${p.id})`);
        return true;
      }
      const err = await resp.text();
      console.error(`[email] Resend ${resp.status}: ${err.slice(0, 200)}`);
      // 5xx → reintento; 4xx → no
      if (resp.status < 500) return false;
      await new Promise(r => setTimeout(r, 2000));
    } catch (e: any) {
      console.error('[email] fetch fallo:', e?.message || e);
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    }
  }
  return false;
}

export const EMAIL_CONFIG = {
  enabled: !!(process.env.RESEND_API_KEY && process.env.ADMIN_EMAIL),
  to: process.env.ADMIN_EMAIL || null,
  from: process.env.FROM_EMAIL || 'CredyTek <onboarding@resend.dev>',
};

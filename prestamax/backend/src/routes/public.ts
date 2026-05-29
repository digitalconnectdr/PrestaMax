import { Router, Request, Response } from 'express';
import { getDb, uuid, now } from '../db/database';
import { sendInquiryNotification } from '../services/emailService';

const router = Router();

// GET tenant info by public token (for the loan request form page header)
router.get('/apply/:token', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const tenant = db.prepare(`
      SELECT t.id, t.name, t.email, t.phone, t.address, t.public_token,
        p.name as plan_name, p.features
      FROM tenants t
      LEFT JOIN plans p ON p.id = t.plan_id
      WHERE t.public_token = ? AND t.is_active = 1
    `).get(req.params.token) as any;
    if (!tenant) return res.status(404).json({ error: 'Enlace no válido o empresa inactiva' });
    res.json({
      id: tenant.id,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
    });
  } catch (e: any) { res.status(500).json({ error: e.message || 'Error del servidor' }); }
});

// POST submit a loan request (public — no auth required)
router.post('/apply/:token', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const tenant = db.prepare(`SELECT id, is_active FROM tenants WHERE public_token=? AND is_active=1`).get(req.params.token) as any;
    if (!tenant) return res.status(404).json({ error: 'Enlace no válido o empresa inactiva' });

    const {
      clientName, clientEmail, clientPhone, clientAddress, idNumber,
      loanAmount, loanPurpose, loanTerm, idFrontImage, idBackImage,
      // Extended client fields
      dateOfBirth, gender, maritalStatus, nationality, whatsapp,
      city, province, phoneWork, phoneFamily,
      familyContactName, familyRelationship,
      occupation, employer, workAddress, monthlyIncome, economicActivity,
    } = req.body;

    if (!clientName || !clientPhone) {
      return res.status(400).json({ error: 'Nombre y teléfono son obligatorios' });
    }
    if (!idFrontImage || !idBackImage) {
      return res.status(400).json({ error: 'Las fotos de la cédula (frente y reverso) son obligatorias' });
    }

    const id = uuid();
    db.prepare(`
      INSERT INTO loan_requests
        (id, tenant_id, client_name, client_email, client_phone, client_address,
         id_number, loan_amount, loan_purpose, loan_term, id_front_image, id_back_image,
         date_of_birth, gender, marital_status, nationality, whatsapp,
         city, province, phone_work, phone_family,
         family_contact_name, family_relationship,
         occupation, employer, work_address, monthly_income, economic_activity,
         status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')
    `).run(
      id, tenant.id, clientName, clientEmail || null, clientPhone,
      clientAddress || null, idNumber || null, loanAmount || null,
      loanPurpose || null, loanTerm || null, idFrontImage, idBackImage,
      dateOfBirth || null, gender || null, maritalStatus || null, nationality || null, whatsapp || null,
      city || null, province || null, phoneWork || null, phoneFamily || null,
      familyContactName || null, familyRelationship || null,
      occupation || null, employer || null, workAddress || null, monthlyIncome || null, economicActivity || null,
    );

    res.status(201).json({
      success: true,
      requestId: id,
      message: 'Tu solicitud ha sido enviada. El prestamista la revisará en breve.',
    });
  } catch (e: any) { res.status(500).json({ error: e.message || 'Error al procesar solicitud' }); }
});


// GET public plans list — used by the registration page (no auth required)
router.get('/plans', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const plans = db.prepare(
      `SELECT id, name, slug, price_monthly, trial_days, max_clients,
              max_users, max_collectors, description
       FROM plans
       WHERE is_active = 1 AND is_trial_default = 0
       ORDER BY price_monthly ASC`
    ).all();
    res.json(plans);
  } catch (e: any) { res.status(500).json({ error: e.message || 'Error del servidor' }); }
});


// POST /api/public/plan-inquiry — captura un lead desde la landing publica
const PLAN_VALID    = ['trial','starter','basico','profesional','enterprise','unsure'];
const SIZE_VALID    = ['<50','50-200','200-500','500+','unsure'];
const SOURCE_VALID  = ['google','facebook','instagram','whatsapp','referral','youtube','other'];
const COUNTRY_VALID = ['DO','MX','CO','PE','CL','AR','VE','EC','BO','PY','UY','CR','PA','GT','SV','HN','NI','HT','US','ES','OTHER'];

function cleanInq(v: any, max = 500): string {
  if (v === null || v === undefined) return '';
  return String(v).trim().slice(0, max);
}

router.post('/plan-inquiry', async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const full_name      = cleanInq(b.full_name, 120);
    const business_name  = cleanInq(b.business_name, 120);
    const whatsapp       = cleanInq(b.whatsapp, 30);
    const email          = cleanInq(b.email, 200).toLowerCase();
    const country        = (cleanInq(b.country, 5).toUpperCase() || 'DO');
    const plan_interest  = cleanInq(b.plan_interest, 30);
    const portfolio_size = cleanInq(b.portfolio_size, 20);
    const source         = cleanInq(b.source, 30);
    const message        = cleanInq(b.message, 1500);

    if (!full_name)  return res.status(400).json({ error: 'Nombre completo es requerido' });
    if (!whatsapp)   return res.status(400).json({ error: 'WhatsApp es requerido' });
    if (!email)      return res.status(400).json({ error: 'Email es requerido' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email no es valido' });

    if (plan_interest  && !PLAN_VALID.includes(plan_interest))   return res.status(400).json({ error: 'Plan invalido' });
    if (portfolio_size && !SIZE_VALID.includes(portfolio_size))  return res.status(400).json({ error: 'Tamano de cartera invalido' });
    if (source         && !SOURCE_VALID.includes(source))         return res.status(400).json({ error: 'Fuente invalida' });
    if (country        && !COUNTRY_VALID.includes(country))       return res.status(400).json({ error: 'Pais invalido' });

    const db = getDb();
    const id = uuid();
    const ip_address = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                     || req.socket?.remoteAddress || '';
    const user_agent = cleanInq(req.headers['user-agent'] as string || '', 500);

    db.prepare(`
      INSERT INTO plan_inquiries
        (id, full_name, business_name, whatsapp, email, country, plan_interest,
         portfolio_size, source, message, status, ip_address, user_agent,
         created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,'new',?,?,?,?)
    `).run(
      id, full_name, business_name || null, whatsapp, email, country,
      plan_interest || null, portfolio_size || null, source || null,
      message || null, ip_address, user_agent, now(), now()
    );

    sendInquiryNotification({
      id, full_name, business_name, whatsapp, email, country,
      plan_interest, portfolio_size, source, message,
    }).catch(e => console.error('[plan-inquiry] email notif fallo:', e?.message || e));

    res.json({
      success: true,
      id,
      message: 'Solicitud recibida. Te contactaremos por WhatsApp en las proximas 24 horas.',
    });
  } catch (e: any) {
    console.error('POST /plan-inquiry error:', e);
    res.status(500).json({ error: 'No se pudo procesar la solicitud' });
  }
});

export default router;

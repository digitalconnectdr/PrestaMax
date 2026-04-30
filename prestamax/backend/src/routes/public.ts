import { Router, Request, Response } from 'express';
import { getDb, uuid } from '../db/database';

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
      occupation, employer, monthlyIncome, economicActivity,
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
         occupation, employer, monthly_income, economic_activity,
         status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')
    `).run(
      id, tenant.id, clientName, clientEmail || null, clientPhone,
      clientAddress || null, idNumber || null, loanAmount || null,
      loanPurpose || null, loanTerm || null, idFrontImage, idBackImage,
      dateOfBirth || null, gender || null, maritalStatus || null, nationality || null, whatsapp || null,
      city || null, province || null, phoneWork || null, phoneFamily || null,
      familyContactName || null, familyRelationship || null,
      occupation || null, employer || null, monthlyIncome || null, economicActivity || null,
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

export default router;

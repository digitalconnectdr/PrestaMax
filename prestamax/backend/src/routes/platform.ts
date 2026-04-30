import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, uuid, now } from '../db/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// ── Middleware: require platform admin role ──────────────────────────────────
function requirePlatformAdmin(req: AuthRequest, res: Response, next: Function) {
  const role = req.user?.platform_role || req.user?.platformRole || '';
  if (!['platform_owner', 'platform_admin', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Requiere rol de administrador de plataforma' });
  }
  next();
}

// ── Helper: seed default contract templates for a new tenant ──────────────────
function seedDefaultTemplates(db: any, tenantId: string) {
  const pagareBody = `                    PAGARÉ

{{company_name}}
{{company_address}}
Tel: {{company_phone}}   Email: {{company_email}}

Préstamo No.: {{loan_number}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Yo, {{client_name}}, portador de la cédula {{client_id}},
domiciliado en {{client_address}}, {{client_city}},
debo y pagaré a {{company_name}} la suma de RD$ {{amount}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DETALLE DE CUOTAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{payment_plan}}

Firma del deudor:  ______________________________________
Nombre:            {{client_name}}
Fecha:             {{print_date}}`;

  try {
    db.prepare('INSERT OR IGNORE INTO contract_templates (id,tenant_id,name,type,body,is_default) VALUES (?,?,?,?,?,?)')
      .run(uuid(), tenantId, 'Pagaré Estándar', 'general', pagareBody, 1);
  } catch (_) {}
}

// ── GET /plans ─────────────────────────────────────────────────────────────────
router.get('/plans', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const plans = db.prepare('SELECT * FROM plans ORDER BY price_monthly ASC').all();
    res.json(plans);
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ── POST /plans ────────────────────────────────────────────────────────────────
router.post('/plans', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { name, slug, price_monthly, max_clients, max_users, max_collectors } = req.body;
    const db = getDb();
    const id = uuid();
    db.prepare(`INSERT INTO plans (id,name,slug,price_monthly,max_clients,max_users,max_collectors,is_active,created_at)
      VALUES (?,?,?,?,?,?,?,1,datetime('now'))`)
      .run(id, name, slug.toLowerCase(), parseFloat(price_monthly), max_clients || -1, max_users || -1, max_collectors || -1);
    res.status(201).json(db.prepare('SELECT * FROM plans WHERE id=?').get(id));
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

// ── GET /tenants ───────────────────────────────────────────────────────────────
router.get('/tenants', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const tenants = db.prepare(`
      SELECT t.*, p.name as plan_name FROM tenants t
      LEFT JOIN plans p ON p.id=t.plan_id
      ORDER BY t.created_at DESC
    `).all();
    res.json(tenants);
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

export default router;

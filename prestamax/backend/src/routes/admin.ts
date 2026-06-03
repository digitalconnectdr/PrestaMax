import { Router, Response, Request } from 'express';
import bcrypt from 'bcryptjs';
import { getDb, uuid, now } from '../db/database';
import { logAudit } from '../lib/audit';
import { authenticate, AuthRequest } from '../middleware/auth';
import path from 'path';
import fs from 'fs';
import { seedDemo } from '../db/seed_demo';

const router = Router();

// ── Helper: seed default contract templates for a new tenant ──────────────────
function seedDefaultTemplates(db: any, tenantId: string) {
  const pagareBody = [
    '                    PAGARÉ',
    '',
    '{{company_name}}',
    '{{company_address}}',
    'Tel: {{company_phone}}   Email: {{company_email}}',
    '',
    'Préstamo No.: {{loan_number}}',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    'Yo, {{client_name}}, portador de la cédula {{client_id}},',
    'domiciliado en {{client_address}}, {{client_city}},',
    'debo y pagaré a {{company_name}} la suma de RD$ {{amount}}',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'DETALLE DE CUOTAS',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '{{payment_plan}}',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'DATOS DEL PRÉSTAMO',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'Fecha de inicio:           {{start_date}}',
    'Fecha de vencimiento:      {{end_date}}',
    'Plazo:                     {{term}}',
    'Monto desembolsado:        {{amount}}',
    'Frecuencia de pago:        {{monthly_payment}}',
    'Tasa de interés:           {{rate}}',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'DECLARACIÓN DE INCUMPLIMIENTO',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'En caso de incumplimiento con el presente préstamo, quedan',
    'afectados todos mis bienes habidos y por haber para el pago',
    'inmediato de esta deuda sin ninguna formalidad judicial.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    'FIRMAS',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    'Firma del deudor:  ______________________________________',
    'Nombre:            {{client_name}}',
    'Cédula:            {{client_id}}',
    '',
    'Firma del prestamista: __________________________________',
    'Empresa:           {{company_name}}',
    '',
    'Fecha de impresión: {{print_date}}',
  ].join('\n');

  const contractBody = [
    'CONTRATO DE PRÉSTAMO PERSONAL',
    '',
    'Entre {{company_name}} y el cliente {{client_name}},',
    'portador de la cédula {{client_id}}, domiciliado en',
    '{{client_address}}, {{client_city}}.',
    '',
    'MONTO:  {{amount}}',
    'TASA:   {{rate}}',
    'PLAZO:  {{term}}',
    'FECHA:  {{print_date}}',
    '',
    'El deudor se compromete a realizar los pagos según el plan',
    'de cuotas. En mora se aplica recargo diario.',
    '',
    '_______________________   _______________________',
    'Firma del Deudor          Firma del Prestamista',
    '{{client_name}}           {{company_name}}',
    'C.I.: {{client_id}}',
  ].join('\n');

  try {
    db.prepare('INSERT OR IGNORE INTO contract_templates (id,tenant_id,name,type,body,is_default) VALUES (?,?,?,?,?,?)')
      .run(uuid(), tenantId, 'Pagaré Estándar', 'general', pagareBody, 1);
    db.prepare('INSERT OR IGNORE INTO contract_templates (id,tenant_id,name,type,body,is_default) VALUES (?,?,?,?,?,?)')
      .run(uuid(), tenantId, 'Contrato General de Préstamo', 'general', contractBody, 0);
  } catch (_) {}
}

// Middleware to require platform admin role
function requirePlatformAdmin(req: AuthRequest, res: Response, next: Function) {
  const role = req.user?.platformRole || req.user?.platform_role || ''
  const allowed = ['admin', 'platform_owner', 'platform_admin']
  if (!allowed.includes(role)) {
    return res.status(403).json({ error: 'Acceso restringido a administradores de plataforma' });
  }
  next();
}

// Middleware para bootstrap: solo permite si NO hay admins aún; bloquea si ya existe uno
function requireFirstBootstrap(req: AuthRequest, res: Response, next: Function) {
  try {
    const db = getDb();
    const adminCount = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE platform_role='admin'`).get() as any).c;
    if (adminCount > 0) {
      // Ya hay un admin: solo otro admin puede llamar este endpoint (ej. para agregar otro)
      const role = req.user?.platformRole || req.user?.platform_role || ''
      const allowed = ['admin', 'platform_owner', 'platform_admin']
      if (!allowed.includes(role)) {
        return res.status(403).json({ error: 'El sistema ya está inicializado. Solo administradores de plataforma pueden usar este endpoint.' });
      }
    }
    next();
  } catch(e: any) { res.status(500).json({ error: e.message || 'Failed bootstrap check' }); }
}

// POST create new tenant (with optional admin user)
router.post('/tenants', authenticate, requirePlatformAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { name, email, phone, currency = 'DOP', plan_id,
            admin_name, admin_email, admin_password } = req.body;
    if (!name) return res.status(400).json({ error: 'Nombre de empresa es requerido' });
    if (admin_email && !admin_password) return res.status(400).json({ error: 'Contraseña del administrador es requerida' });
    if (admin_email && !admin_name) return res.status(400).json({ error: 'Nombre del administrador es requerido' });

    const tenantId = uuid();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // 1. Create tenant
    db.prepare(`INSERT INTO tenants (id,name,slug,email,phone,currency,plan_id,subscription_status,is_active,created_at)
      VALUES (?,?,?,?,?,?,?,'trial',1,datetime('now'))`
    ).run(tenantId, name, slug, email || null, phone || null, currency, plan_id || null);

    // 2. Create tenant_settings
    db.prepare('INSERT OR IGNORE INTO tenant_settings (id,tenant_id) VALUES (?,?)').run(uuid(), tenantId);

    // 3. Seed default templates
    seedDefaultTemplates(db, tenantId);

    // 4. Create admin user (if provided)
    let adminUser: any = null;
    if (admin_email && admin_password) {
      const normalizedEmail = admin_email.toLowerCase().trim();
      // Check if user already exists
      let user = db.prepare('SELECT * FROM users WHERE email=?').get(normalizedEmail) as any;
      if (!user) {
        const hash = await bcrypt.hash(admin_password, 12);
        const userId = uuid();
        db.prepare(`INSERT INTO users (id,email,password_hash,full_name,is_active,created_at) VALUES (?,?,?,?,1,datetime('now'))`)
          .run(userId, normalizedEmail, hash, admin_name);
        user = db.prepare('SELECT * FROM users WHERE id=?').get(userId) as any;
      }
      // Assign as tenant_owner
      const existing = db.prepare('SELECT id FROM tenant_memberships WHERE user_id=? AND tenant_id=?').get(user.id, tenantId) as any;
      if (!existing) {
        db.prepare('INSERT INTO tenant_memberships (id,user_id,tenant_id,roles,is_active,created_at) VALUES (?,?,?,?,1,datetime(\'now\'))')
          .run(uuid(), user.id, tenantId, JSON.stringify(['tenant_owner', 'admin']));
      }
      const { password_hash, ...safe } = user;
      adminUser = safe;
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(tenantId);
    res.status(201).json({ tenant, adminUser, message: `Empresa "${name}" creada exitosamente` });
  } catch(e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Ya existe una empresa con ese nombre o slug' });
    console.error(e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// GET all tenants with subscription info
router.get('/tenants', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().slice(0,10);
    const tenants = db.prepare(`
      SELECT t.*,
        p.name as plan_name, p.price_monthly,
        p.max_collectors, p.max_clients, p.max_users,
        COUNT(DISTINCT tm.user_id) as member_count,
        COUNT(DISTINCT l.id) as loan_count,
        COUNT(DISTINCT c.id) as client_count
      FROM tenants t
      LEFT JOIN plans p ON p.id=t.plan_id
      LEFT JOIN tenant_memberships tm ON tm.tenant_id=t.id AND tm.is_active=1
      LEFT JOIN loans l ON l.tenant_id=t.id
      LEFT JOIN clients c ON c.tenant_id=t.id
      GROUP BY t.id ORDER BY t.created_at DESC
    `).all();
    // Calculate days remaining for each subscription AND trial countdown
    const enriched = (tenants as any[]).map(t => {
      let daysRemaining: number | null = null;
      let subscriptionStatus = t.subscription_status || 'trial';
      const todayDate = new Date(today);

      if (t.subscription_end) {
        const endDate = new Date(t.subscription_end);
        daysRemaining = Math.ceil((endDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysRemaining < 0 && subscriptionStatus === 'active') subscriptionStatus = 'expired';
      }

      // Trial countdown: based on created_at + plan trial_days
      let trialDaysRemaining: number | null = null;
      let trialEndDate: string | null = null;
      if (subscriptionStatus === 'trial') {
        const trialDays = t.trial_days ?? 10;
        const startDate = new Date(t.subscription_start || t.created_at);
        const trialEnd = new Date(startDate.getTime() + trialDays * 24 * 60 * 60 * 1000);
        trialEndDate = trialEnd.toISOString().slice(0, 10);
        trialDaysRemaining = Math.ceil((trialEnd.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      return { ...t, daysRemaining, subscriptionStatus, trialDaysRemaining, trialEndDate };
    });
    res.json(enriched);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET tenant detail
router.get('/tenants/:id', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(req.params.id);
    if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' });
    const members = db.prepare('SELECT tm.*,u.full_name,u.email FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id WHERE tm.tenant_id=?').all(req.params.id);
    const stats = db.prepare(`SELECT
      COUNT(DISTINCT c.id) as clients,
      COUNT(DISTINCT l.id) as loans,
      COALESCE(SUM(l.total_balance),0) as portfolio
      FROM tenants t
      LEFT JOIN clients c ON c.tenant_id=t.id
      LEFT JOIN loans l ON l.tenant_id=t.id AND l.status='active'
      WHERE t.id=?`).get(req.params.id);
    res.json({ tenant, members, stats });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PUT update tenant plan / access / subscription
router.put('/tenants/:id', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const d = req.body;

    // Detectar si hubo cambio de plan para limpiar permisos huerfanos
    const before = db.prepare('SELECT plan_id FROM tenants WHERE id=?').get(req.params.id) as any;
    const planChanged = d.plan_id && before && before.plan_id !== d.plan_id;

    db.prepare(`UPDATE tenants SET
      plan_id=COALESCE(?,plan_id),
      is_active=COALESCE(?,is_active),
      subscription_status=COALESCE(?,subscription_status),
      subscription_start=COALESCE(?,subscription_start),
      subscription_end=COALESCE(?,subscription_end),
      billing_cycle=COALESCE(?,billing_cycle),
      stripe_customer_id=COALESCE(?,stripe_customer_id),
      stripe_subscription_id=COALESCE(?,stripe_subscription_id),
      subscription_notes=COALESCE(?,subscription_notes),
      updated_at=?
    WHERE id=?`).run(
      d.plan_id||null,
      d.is_active!==undefined?(d.is_active?1:0):null,
      d.subscription_status||null,
      d.subscription_start||null,
      d.subscription_end||null,
      d.billing_cycle||null,
      d.stripe_customer_id||null,
      d.stripe_subscription_id||null,
      d.subscription_notes||null,
      now(), req.params.id
    );

    // Si hubo cambio de plan, limpiar permisos explicitos que el nuevo plan no permite.
    // Esto evita que un downgrade deje permisos huerfanos que se reactivarian
    // automaticamente en un upgrade posterior.
    if (planChanged) {
      try {
        const { applyPlanChange } = require('./billing');
        applyPlanChange(db, req.params.id, d.plan_id);
      } catch (e) { console.error('Error limpiando permisos al cambiar plan:', e); }
    }

    res.json(db.prepare('SELECT * FROM tenants WHERE id=?').get(req.params.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// POST renew subscription (shorthand: sets status=active, start=today, end=today+N months)
router.post('/tenants/:id/renew', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { months = 1, billing_cycle = 'monthly', notes } = req.body;
    const today = new Date();
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + parseInt(months));
    const start = today.toISOString().slice(0,10);
    const end = endDate.toISOString().slice(0,10);
    db.prepare(`UPDATE tenants SET
      subscription_status='active', subscription_start=?, subscription_end=?,
      billing_cycle=?, subscription_notes=COALESCE(?,subscription_notes), updated_at=?
    WHERE id=?`).run(start, end, billing_cycle, notes||null, now(), req.params.id);
    res.json(db.prepare('SELECT * FROM tenants WHERE id=?').get(req.params.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET all plans
router.get('/plans', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM plans ORDER BY price_monthly').all());
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// POST seed default plans
router.post('/plans/seed-defaults', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const defaultPlans = [
      { id: 'plan-starter', name: 'Starter', slug: 'starter', price: 29.99, collectors: 1, clients: 100, users: 3 },
      { id: 'plan-basico', name: 'Básico', slug: 'basico', price: 59.99, collectors: 3, clients: 500, users: 8 },
      { id: 'plan-profesional', name: 'Profesional', slug: 'profesional', price: 119.99, collectors: 10, clients: 2000, users: 20 },
      { id: 'plan-enterprise', name: 'Enterprise', slug: 'enterprise', price: 249.99, collectors: -1, clients: -1, users: -1 },
    ];
    const insertPlan = db.prepare(`INSERT OR IGNORE INTO plans (id, name, slug, price_monthly, max_collectors, max_clients, max_users, trial_days) VALUES (?,?,?,?,?,?,?,?)`);
    for (const p of defaultPlans) {
      insertPlan.run(p.id, p.name, p.slug, p.price, p.collectors, p.clients, p.users, 10);
    }
    // Ensure trial_days = 10 for these plans even if they already existed
    db.prepare(`UPDATE plans SET trial_days = 10 WHERE id IN ('plan-starter','plan-basico','plan-profesional','plan-enterprise')`).run();
    res.json({ success: true, plans: db.prepare('SELECT * FROM plans ORDER BY price_monthly').all() });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// POST create plan
router.post('/plans', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const id = uuid(); const d = req.body;
    if (!d.name || !d.slug) return res.status(400).json({ error: 'Nombre y slug son requeridos' });
    // If marking as trial default, first clear any existing trial default
    if (d.is_trial_default) {
      db.prepare('UPDATE plans SET is_trial_default=0 WHERE is_trial_default=1').run();
    }
    db.prepare(`INSERT INTO plans (id,name,slug,price_monthly,max_collectors,max_clients,max_users,trial_days,features,description,is_active,is_trial_default)
      VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`).run(
        id, d.name, d.slug, d.price_monthly||0, d.max_collectors||-1, d.max_clients||-1, d.max_users||-1,
        d.trial_days||10, d.features||'[]', d.description||null, d.is_trial_default?1:0
      );
    res.status(201).json(db.prepare('SELECT * FROM plans WHERE id=?').get(id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PUT update plan
router.put('/plans/:id', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const d = req.body;
    // If marking as trial default, first clear any existing trial default (except this plan)
    if (d.is_trial_default) {
      db.prepare('UPDATE plans SET is_trial_default=0 WHERE is_trial_default=1 AND id!=?').run(req.params.id);
    }
    db.prepare(`UPDATE plans SET
      name=COALESCE(?,name), price_monthly=COALESCE(?,price_monthly),
      max_collectors=COALESCE(?,max_collectors), max_clients=COALESCE(?,max_clients),
      max_users=COALESCE(?,max_users), is_active=COALESCE(?,is_active),
      trial_days=COALESCE(?,trial_days), features=COALESCE(?,features), description=COALESCE(?,description),
      is_trial_default=COALESCE(?,is_trial_default)
    WHERE id=?`).run(
      d.name||null, d.price_monthly??null, d.max_collectors??null, d.max_clients??null,
      d.max_users??null, d.is_active!==undefined?(d.is_active?1:0):null,
      d.trial_days??null, d.features||null, d.description||null,
      d.is_trial_default!==undefined?(d.is_trial_default?1:0):null, req.params.id
    );
    res.json(db.prepare('SELECT * FROM plans WHERE id=?').get(req.params.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// DELETE plan (soft delete — cannot delete if tenants are using it)
router.delete('/plans/:id', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const planToDelete = db.prepare('SELECT is_trial_default FROM plans WHERE id=?').get(req.params.id) as any;
    if (planToDelete?.is_trial_default) {
      return res.status(400).json({ error: 'No se puede eliminar el Plan Trial. Es el plan por defecto para nuevos registros. Asigna otro plan como trial default primero.' });
    }
    const usageCount = (db.prepare(`SELECT COUNT(*) as c FROM tenants WHERE plan_id=? AND is_active=1`).get(req.params.id) as any).c;
    if (usageCount > 0) {
      return res.status(400).json({ error: `No se puede eliminar: ${usageCount} empresa(s) usan este plan. Desactívalo primero.` });
    }
    db.prepare(`DELETE FROM plans WHERE id=?`).run(req.params.id);
    res.json({ success: true });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET platform-wide stats
router.get('/stats', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const tenantCount = (db.prepare('SELECT COUNT(*) as c FROM tenants WHERE is_active=1').get() as any).c;
    const userCount = (db.prepare('SELECT COUNT(*) as c FROM users WHERE is_active=1').get() as any).c;
    const loanCount = (db.prepare('SELECT COUNT(*) as c FROM loans').get() as any).c;
    const totalPortfolio = (db.prepare("SELECT COALESCE(SUM(total_balance),0) as s FROM loans WHERE status='active'").get() as any).s;
    const recentTenants = db.prepare('SELECT * FROM tenants ORDER BY created_at DESC LIMIT 5').all();
    const activeLoans = (db.prepare("SELECT COUNT(*) as c FROM loans WHERE status='active'").get() as any).c;
    const paymentCount = (db.prepare("SELECT COUNT(*) as c FROM payments").get() as any).c;
    const clientCount = (db.prepare("SELECT COUNT(*) as c FROM clients WHERE is_active=1").get() as any).c;
    const expiringSoon = (db.prepare(`SELECT COUNT(*) as c FROM tenants WHERE subscription_end IS NOT NULL AND subscription_end <= date('now','+7 days') AND subscription_status='active'`).get() as any).c;
    const trialCount = (db.prepare(`SELECT COUNT(*) as c FROM tenants WHERE subscription_status='trial'`).get() as any).c;

    // ── Subscription / revenue stats ─────────────────────────────────────────
    const activeSubscriptions = (db.prepare(`SELECT COUNT(*) as c FROM tenants WHERE subscription_status='active' AND is_active=1`).get() as any).c;
    const expiredSubscriptions = (db.prepare(`SELECT COUNT(*) as c FROM tenants WHERE subscription_status='expired' AND is_active=1`).get() as any).c;
    // Revenue estimate: join with plans to get monthly price
    const revenueByPlan = db.prepare(`
      SELECT p.name as plan_name, p.price_monthly, p.slug,
             COUNT(t.id) as tenant_count,
             COUNT(t.id) * p.price_monthly as monthly_revenue
      FROM plans p
      LEFT JOIN tenants t ON t.plan_id=p.id AND t.subscription_status='active' AND t.is_active=1
      GROUP BY p.id ORDER BY monthly_revenue DESC
    `).all() as any[];
    const estimatedMonthlyRevenue = revenueByPlan.reduce((s: number, r: any) => s + (r.monthly_revenue || 0), 0);
    const subscriptionsByStatus = db.prepare(`
      SELECT COALESCE(subscription_status,'trial') as status, COUNT(*) as count
      FROM tenants WHERE is_active=1
      GROUP BY subscription_status
    `).all() as any[];
    // Recent subscriptions (last 10 activations)
    const recentSubscriptions = db.prepare(`
      SELECT t.id, t.name, t.slug, t.subscription_status, t.subscription_start,
             t.subscription_end, t.billing_cycle, p.name as plan_name, p.price_monthly
      FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id
      WHERE t.is_active=1
      ORDER BY t.subscription_start DESC LIMIT 10
    `).all();

    // Database file size
    const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '..', '..', '..', 'prestamax.db');
    let dbSizeBytes = 0;
    let dbSizeMB = '0';
    try { dbSizeBytes = fs.statSync(DB_PATH).size; dbSizeMB = (dbSizeBytes / 1024 / 1024).toFixed(2); } catch(_) {}

    // Recent audit logs
    const recentLogs = db.prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 20`).all();

    res.json({
      tenantCount, userCount, loanCount, totalPortfolio, recentTenants,
      activeLoans, paymentCount, clientCount, expiringSoon, trialCount,
      dbSizeBytes, dbSizeMB, recentLogs,
      // subscription/revenue
      activeSubscriptions, expiredSubscriptions, estimatedMonthlyRevenue,
      revenueByPlan, subscriptionsByStatus, recentSubscriptions,
    });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// ── Backups: VACUUM INTO atomico + gzip + retencion automatica ───────────────
// Implementacion en services/backupService.ts (compartido con el cron diario).
import { createBackup as svcCreateBackup, listBackups as svcListBackups,
         deleteBackup as svcDeleteBackup, getBackupPath as svcGetBackupPath,
         BACKUP_CONFIG } from '../services/backupService';

// POST create database backup (admin only)
router.post('/backup', authenticate, requirePlatformAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const info = await svcCreateBackup();
    const backups = svcListBackups();
    logAudit(getDb(), {
      user_id: req.user.id, user_name: req.user.full_name,
      action: 'created', entity_type: 'backup', entity_id: info.filename,
      description: `Creo backup manual de la DB: ${info.filename} (${(info.size/1024).toFixed(1)} KB)`,
      new_values: { filename: info.filename, size: info.size },
    });
    res.json({ success: true, filename: info.filename, info, backups, config: BACKUP_CONFIG });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET list backups
router.get('/backups', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    res.json({ backups: svcListBackups(), config: BACKUP_CONFIG });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET download a specific backup file (stream)
router.get('/backup/:filename/download', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const { filename } = req.params;
    const full = svcGetBackupPath(filename);
    if (!full || !fs.existsSync(full)) return res.status(404).json({ error: 'Backup no encontrado.' });
    const stat = fs.statSync(full);
    res.setHeader('Content-Type', filename.endsWith('.gz') ? 'application/gzip' : 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(full).pipe(res);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// DELETE a specific backup file (admin only)
router.delete('/backup/:filename', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const ok = svcDeleteBackup(req.params.filename);
    if (!ok) return res.status(404).json({ error: 'Backup no encontrado o nombre no valido.' });
    logAudit(getDb(), {
      user_id: req.user.id, user_name: req.user.full_name,
      action: 'deleted', entity_type: 'backup', entity_id: req.params.filename,
      description: `Borro backup ${req.params.filename}`,
    });
    res.json({ success: true, message: `Backup "${req.params.filename}" eliminado.` });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET platform users list
router.get('/users', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const users = db.prepare(`
      SELECT u.id, u.email, u.full_name, u.is_active, u.platform_role, u.last_login, u.created_at,
        COUNT(DISTINCT tm.tenant_id) as tenant_count
      FROM users u
      LEFT JOIN tenant_memberships tm ON tm.user_id=u.id AND tm.is_active=1
      GROUP BY u.id ORDER BY u.created_at DESC
    `).all();
    res.json(users);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PUT update user platform role (platform admin only)
router.put('/users/:id/platform-role', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { platform_role } = req.body;
    const validRoles = ['none', 'admin', 'support'];
    if (!validRoles.includes(platform_role)) return res.status(400).json({ error: 'Rol no válido. Use: none, admin, support' });
    const user = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    db.prepare('UPDATE users SET platform_role=? WHERE id=?').run(platform_role, req.params.id);
    res.json({ success: true, message: `Rol actualizado a ${platform_role}` });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// POST bootstrap: create first platform admin (only works if NO admins exist; blocked after that)
router.post('/bootstrap', authenticate, requireFirstBootstrap, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const adminCount = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE platform_role='admin'`).get() as any).c;
    if (adminCount > 0) return res.status(403).json({ error: 'Ya existe un administrador de plataforma' });
    db.prepare(`UPDATE users SET platform_role='admin' WHERE id=?`).run(req.user.id);
    res.json({ success: true, message: '¡Ahora eres administrador de la plataforma! Vuelve a iniciar sesión.' });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET audit logs (platform admin)
router.get('/audit-logs', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { tenant_id, action, from, to, limit: lim } = req.query as any;
    // JOIN users as fallback for legacy rows that have no user_name stored
    let sql = `
      SELECT al.id, al.tenant_id, al.user_id,
        COALESCE(NULLIF(al.user_name,'Sistema'), u.full_name, 'Sistema') as user_name,
        COALESCE(al.user_email, u.email) as user_email,
        al.action, al.entity_type, al.entity_id,
        al.description, al.old_values, al.new_values,
        al.metadata, al.ip_address, al.notes, al.created_at
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.user_id
      WHERE 1=1`;
    const params: any[] = [];
    if (tenant_id) { sql += ` AND al.tenant_id=?`; params.push(tenant_id); }
    if (action) { sql += ` AND al.action=?`; params.push(action); }
    if (from) { sql += ` AND date(al.created_at) >= date(?)`; params.push(from); }
    if (to) { sql += ` AND date(al.created_at) <= date(?)`; params.push(to); }
    sql += ` ORDER BY al.created_at DESC LIMIT ?`;
    params.push(parseInt(lim || '100'));
    const logs = db.prepare(sql).all(...params);
    res.json(logs);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// POST tenant subscription view for tenants themselves
router.get('/my-subscription', authenticate, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID requerido' });
    // Security: verify the authenticated user actually belongs to this tenant
    // (Platform admins bypass this check)
    const platformRole = (req.user as any)?.platform_role || (req.user as any)?.platformRole;
    const isPlatformAdmin = ['platform_owner', 'platform_admin', 'admin'].includes(platformRole);
    if (!isPlatformAdmin) {
      const membership = db.prepare(
        'SELECT id FROM tenant_memberships WHERE user_id=? AND tenant_id=? AND is_active=1'
      ).get((req.user as any).id, tenantId);
      if (!membership) return res.status(403).json({ error: 'No tienes acceso a esta empresa' });
    }
    const tenant = db.prepare(`
      SELECT t.*, p.name as plan_name, p.slug as plan_slug, p.price_monthly, p.max_collectors,
        p.max_clients, p.max_users, p.trial_days, p.features, p.description as plan_description
      FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id
      WHERE t.id=?
    `).get(tenantId) as any;
    if (!tenant) return res.status(404).json({ error: 'Empresa no encontrada' });
    const todayDate = new Date(); todayDate.setHours(0,0,0,0);
    let daysRemaining: number | null = null;
    if (tenant.subscription_end) {
      const endDate = new Date(tenant.subscription_end);
      daysRemaining = Math.ceil((endDate.getTime() - todayDate.getTime()) / (1000*60*60*24));
    }
    const memberCount = (db.prepare(`SELECT COUNT(*) as c FROM tenant_memberships WHERE tenant_id=? AND is_active=1`).get(tenantId) as any).c;
    const clientCount = (db.prepare(`SELECT COUNT(*) as c FROM clients WHERE tenant_id=? AND is_active=1`).get(tenantId) as any).c;
    const collectorCount = (db.prepare(`SELECT COUNT(*) as c FROM tenant_memberships tm WHERE tm.tenant_id=? AND tm.is_active=1 AND JSON_EXTRACT(tm.roles,'$') LIKE '%collector%'`).get(tenantId) as any).c;

    // Trial countdown
    const subscriptionStatus = tenant.subscription_status || 'trial';
    let trialDaysRemaining: number | null = null;
    let trialEndDate = tenant.trial_end ? new Date(tenant.trial_end) : null;
    if (trialEndDate) {
      trialDaysRemaining = Math.max(0, Math.ceil((trialEndDate.getTime() - todayDate.getTime()) / (1000*60*60*24)));
    }

    let features: string[] = [];
    try { features = JSON.parse(tenant.features || '[]'); } catch(_) {}

    res.json({
      ...tenant,
      daysRemaining,
      trialDaysRemaining,
      subscriptionStatus,
      memberCount,
      clientCount,
      collectorCount,
      features,
      planLimits: {
        maxUsers: tenant.max_users ?? -1,
        maxCollectors: tenant.max_collectors ?? -1,
        maxClients: tenant.max_clients ?? -1,
      }
    });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PUT toggle user active/inactive (platform admin)
router.put('/users/:id/toggle-active', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, is_active, platform_role FROM users WHERE id=?').get(req.params.id) as any;
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    // Prevent blocking yourself or other platform admins
    if (user.id === req.user.id) return res.status(400).json({ error: 'No puedes bloquearte a ti mismo' });
    if (user.platform_role === 'admin') return res.status(400).json({ error: 'No puedes bloquear a otro administrador de plataforma' });
    const newActive = user.is_active ? 0 : 1;
    db.prepare('UPDATE users SET is_active=? WHERE id=?').run(newActive, req.params.id);
    res.json({ success: true, is_active: newActive });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET user memberships with tenant info (platform admin)
router.get('/users/:id/memberships', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, full_name, email, is_active FROM users WHERE id=?').get(req.params.id) as any;
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const rawMemberships = db.prepare(`
      SELECT tm.id as membership_id, tm.roles, tm.permissions,
             tm.is_active as membership_active,
             t.id as tenant_id, t.name as tenant_name, t.is_active as tenant_active
      FROM tenant_memberships tm
      JOIN tenants t ON t.id = tm.tenant_id
      WHERE tm.user_id = ?
      ORDER BY t.name ASC
    `).all(req.params.id) as any[];
    // Normalize roles + map SQL snake_case columns to camelCase for frontend
    const memberships = rawMemberships.map((m: any) => {
      let role = 'collector';
      try {
        const parsed = JSON.parse(m.roles || '[]');
        role = Array.isArray(parsed) ? (parsed[0] || 'collector') : parsed;
      } catch(_) { role = m.roles || 'collector'; }
      let explicit: Record<string, boolean> = {};
      try { explicit = JSON.parse(m.permissions || '{}'); } catch(_) {}
      return {
        membershipId:       m.membership_id,
        membershipActive:   m.membership_active,
        tenantId:           m.tenant_id,
        tenantName:         m.tenant_name,
        tenantActive:       m.tenant_active,
        roles:              role,
        explicitPermissions: JSON.stringify(explicit),
      };
    });
    res.json({ user, memberships });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PUT update user permissions within a specific tenant (platform admin)
router.put('/users/:id/memberships/:tenantId/permissions', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { explicit } = req.body;
    const membership = db.prepare(
      'SELECT id FROM tenant_memberships WHERE user_id=? AND tenant_id=?'
    ).get(req.params.id, req.params.tenantId) as any;
    if (!membership) return res.status(404).json({ error: 'Membresia no encontrada' });
    db.prepare('UPDATE tenant_memberships SET permissions=? WHERE id=?')
      .run(JSON.stringify(explicit || {}), membership.id);
    res.json({ success: true });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PUT update user role within a specific tenant (platform admin)
router.put('/users/:id/memberships/:tenantId/role', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { roles } = req.body;
    const validRoles = ['tenant_owner', 'admin', 'official', 'loan_officer', 'prestamista', 'cashier', 'cobrador', 'collector'];
    if (!validRoles.includes(roles)) return res.status(400).json({ error: 'Rol no valido' });
    const membership = db.prepare(
      'SELECT id FROM tenant_memberships WHERE user_id=? AND tenant_id=?'
    ).get(req.params.id, req.params.tenantId) as any;
    if (!membership) return res.status(404).json({ error: 'Membresia no encontrada' });
    db.prepare('UPDATE tenant_memberships SET roles=? WHERE id=?').run(JSON.stringify([roles]), membership.id);
    res.json({ success: true });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// POST reset password for any user (platform admin)
router.post('/users/:id/reset-password', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { new_password } = req.body;
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }
    if (!/[A-Z]/.test(new_password)) return res.status(400).json({ error: 'La contraseña debe contener al menos una letra mayúscula' });
    if (!/[0-9]/.test(new_password)) return res.status(400).json({ error: 'La contraseña debe contener al menos un número' });
    if (!/[^A-Za-z0-9]/.test(new_password)) return res.status(400).json({ error: 'La contraseña debe contener al menos un carácter especial (!@#$%^&*)' });
    const user = db.prepare('SELECT id, platform_role FROM users WHERE id=?').get(req.params.id) as any;
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    // Prevent resetting another platform admin password
    if (user.id !== (req.user as any).id && ['platform_owner','platform_admin','admin'].includes(user.platform_role)) {
      return res.status(403).json({ error: 'No puedes restablecer la contraseña de otro administrador de plataforma' });
    }
    const hash = bcrypt.hashSync(new_password, 12);
    db.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').run(hash, now(), req.params.id);
    res.json({ success: true, message: 'Contrasena restablecida exitosamente' });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// ── DELETE: Purge all operational data for a tenant (platform_owner only) ────
// Deletes loans, clients, payments, etc. but preserves tenant record + settings + plan
router.delete('/tenants/:id/purge-data', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();

    // Only platform_owner can purge — not platform_admin or support
    if (req.user?.platform_role !== 'platform_owner') {
      return res.status(403).json({ error: 'Solo el propietario de la plataforma puede borrar datos de empresas' });
    }

    const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(req.params.id) as any;
    if (!tenant) return res.status(404).json({ error: 'Empresa no encontrada' });

    // Require confirmation text in body
    const { confirm_name } = req.body;
    if (!confirm_name || confirm_name.trim().toLowerCase() !== tenant.name.trim().toLowerCase()) {
      return res.status(400).json({ error: 'El nombre de la empresa no coincide. Escribe el nombre exacto para confirmar.' });
    }

    const tid = req.params.id;

    // Turn off FK constraints temporarily for bulk delete
    db.exec('PRAGMA foreign_keys = OFF');

    // Tables to purge (all tenant operational data)
    const tables = [
      'account_transfers', 'audit_logs', 'bank_accounts', 'branches',
      'client_documents', 'client_references', 'collection_notes',
      'collection_tasks', 'contract_templates', 'contracts',
      'guarantee_categories', 'guarantors', 'income_expenses', 'installments',
      'loan_guarantees', 'loan_guarantors', 'loan_products', 'loan_requests',
      'loans', 'notifications', 'payment_items', 'payment_promises', 'payments',
      'receipt_series', 'receipts', 'whatsapp_messages', 'whatsapp_templates',
    ];

    // Client table has tenant_id
    tables.push('clients');

    const counts: Record<string, number> = {};
    for (const table of tables) {
      try {
        const before = (db.prepare(`SELECT COUNT(*) as c FROM ${table} WHERE tenant_id=?`).get(tid) as any)?.c ?? 0;
        db.prepare(`DELETE FROM ${table} WHERE tenant_id=?`).run(tid);
        if (before > 0) counts[table] = before;
      } catch(_) {
        // Some tables may not have tenant_id — skip silently
      }
    }

    // Memberships
    const membersBefore = (db.prepare('SELECT COUNT(*) as c FROM tenant_memberships WHERE tenant_id=?').get(tid) as any).c;
    db.prepare('DELETE FROM tenant_memberships WHERE tenant_id=?').run(tid);
    if (membersBefore > 0) counts['tenant_memberships'] = membersBefore;

    // Reset tenant settings
    db.prepare('DELETE FROM tenant_settings WHERE tenant_id=?').run(tid);
    db.prepare('INSERT OR IGNORE INTO tenant_settings (id,tenant_id) VALUES (?,?)').run(uuid(), tid);

    db.exec('PRAGMA foreign_keys = ON');

    // Log this action
    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description,new_values) VALUES (?,?,?,?,?,?,?,?,?)').run(
      uuid(), tid, req.user.id, req.user.full_name,
      'tenant_data_purged', 'tenant', tid,
      `Datos de la empresa "${tenant.name}" eliminados por el propietario de la plataforma`,
      JSON.stringify({ purged_by: req.user.email, counts, timestamp: new Date().toISOString() })
    );

    res.json({
      success: true,
      message: `Datos de la empresa "${tenant.name}" eliminados correctamente.`,
      deleted_counts: counts
    });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed to purge tenant data' }); }
});



// ── POST: Seed demo data on a tenant (platform_owner only) ───────────────────
// Genera 50 clientes, 10 inversionistas, 100 prestamos, ~200 pagos y 3 payouts
// para el tenant especificado. Util para demos en vivo sin contaminar el tenant
// de operacion real. Idempotente parcial: agrega encima de lo existente.
router.post('/tenants/:id/seed-demo', authenticate, requirePlatformAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (req.user?.platform_role !== 'platform_owner') {
      return res.status(403).json({ error: 'Solo el propietario de la plataforma puede poblar datos demo' });
    }
    const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(req.params.id) as any;
    if (!tenant) return res.status(404).json({ error: 'Empresa no encontrada' });

    // Verificar dependencias del seed (product, branch, owner)
    const product = db.prepare("SELECT id FROM loan_products WHERE tenant_id=? LIMIT 1").get(tenant.id) as any;
    const branch  = db.prepare("SELECT id FROM branches WHERE tenant_id=? LIMIT 1").get(tenant.id) as any;
    const owner   = db.prepare("SELECT user_id FROM tenant_memberships WHERE tenant_id=? AND roles LIKE '%tenant_owner%' LIMIT 1").get(tenant.id) as any;
    const coll    = db.prepare("SELECT user_id FROM tenant_memberships WHERE tenant_id=? AND roles LIKE '%cobrador%' LIMIT 1").get(tenant.id) as any;
    if (!product) return res.status(400).json({ error: 'El tenant no tiene productos de prestamo configurados. Crea al menos uno primero.' });
    if (!branch)  return res.status(400).json({ error: 'El tenant no tiene sucursales. Crea al menos una primero.' });
    if (!owner)   return res.status(400).json({ error: 'El tenant no tiene un usuario owner.' });

    // Capturar contadores ANTES del seed para reportar diferencia
    const before = {
      clients:    (db.prepare('SELECT COUNT(*) as c FROM clients WHERE tenant_id=?').get(tenant.id) as any).c,
      loans:      (db.prepare('SELECT COUNT(*) as c FROM loans WHERE tenant_id=?').get(tenant.id) as any).c,
      payments:   (db.prepare('SELECT COUNT(*) as c FROM payments WHERE tenant_id=?').get(tenant.id) as any).c,
      investors:  (db.prepare('SELECT COUNT(*) as c FROM investors WHERE tenant_id=?').get(tenant.id) as any).c,
      payouts:    (db.prepare('SELECT COUNT(*) as c FROM investor_payouts WHERE tenant_id=?').get(tenant.id) as any).c,
    };

    await seedDemo({
      tenantId: tenant.id,
      productId: product.id,
      branchId: branch.id,
      officerId: owner.user_id,
      collectorId: coll?.user_id || owner.user_id,
    });

    const after = {
      clients:    (db.prepare('SELECT COUNT(*) as c FROM clients WHERE tenant_id=?').get(tenant.id) as any).c,
      loans:      (db.prepare('SELECT COUNT(*) as c FROM loans WHERE tenant_id=?').get(tenant.id) as any).c,
      payments:   (db.prepare('SELECT COUNT(*) as c FROM payments WHERE tenant_id=?').get(tenant.id) as any).c,
      investors:  (db.prepare('SELECT COUNT(*) as c FROM investors WHERE tenant_id=?').get(tenant.id) as any).c,
      payouts:    (db.prepare('SELECT COUNT(*) as c FROM investor_payouts WHERE tenant_id=?').get(tenant.id) as any).c,
    };

    const added = {
      clients:   after.clients   - before.clients,
      loans:     after.loans     - before.loans,
      payments:  after.payments  - before.payments,
      investors: after.investors - before.investors,
      payouts:   after.payouts   - before.payouts,
    };

    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description) VALUES (?,?,?,?,?,?,?,?)').run(
      uuid(), tenant.id, req.user.id, req.user.full_name,
      'seed_demo', 'tenant', tenant.id,
      `Poblo datos demo: +${added.clients} clientes, +${added.loans} prestamos, +${added.investors} inversionistas, +${added.payments} pagos, +${added.payouts} payouts`
    );

    res.json({ success: true, tenant: { id: tenant.id, name: tenant.name }, before, after, added });
  } catch (e: any) {
    console.error('POST /admin/tenants/:id/seed-demo error:', e);
    res.status(500).json({ error: e.message || 'Failed to seed demo' });
  }
});


// POST /api/admin/cleanup-duplicate-investors — borra duplicados generados por
// la migracion de email-unique (sufijo +dupN) que NO tengan prestamos asignados
// ni acceso al portal vinculado. Util para limpiar data demo despues de varias
// ejecuciones del seed.
router.post('/cleanup-duplicate-investors', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const tenantFilter = req.body?.tenant_id ? 'AND tenant_id=?' : '';
    const params: any[] = tenantFilter ? [req.body.tenant_id] : [];

    // Buscar investors con email que tenga sufijo +dup (generados por la migracion)
    // O bien con email LIKE '%+dup%@%'
    const sql = `
      SELECT id, tenant_id, full_name, email
      FROM investors
      WHERE email LIKE '%+dup%@%'
        AND user_id IS NULL
        AND (SELECT COUNT(*) FROM loans WHERE investor_id = investors.id) = 0
        ${tenantFilter}
    `;
    const candidates = db.prepare(sql).all(...params) as any[];

    if (candidates.length === 0) {
      return res.json({
        success: true,
        deleted: 0,
        message: 'No hay duplicados seguros para borrar (sin prestamos y sin portal).',
        candidates: [],
      });
    }

    const ids = candidates.map(c => c.id);
    const placeholders = ids.map(() => '?').join(',');
    const result = db.prepare(`DELETE FROM investors WHERE id IN (${placeholders})`).run(...ids);

    // Agrupar por tenant para reporte
    const byTenant: Record<string, number> = {};
    for (const c of candidates) {
      byTenant[c.tenant_id] = (byTenant[c.tenant_id] || 0) + 1;
    }

    logAudit(db, {
      tenant_id: req.body?.tenant_id || null,
      user_id: req.user.id, user_name: req.user.full_name,
      action: 'cleanup_duplicates', entity_type: 'investor',
      description: `Limpieza de duplicados de inversionistas: ${result.changes} borrados`,
      new_values: { deleted: result.changes, byTenant },
      metadata: { sample: candidates.slice(0, 10).map(c => ({ id: c.id, email: c.email })) },
    });
    res.json({
      success: true,
      deleted: result.changes,
      message: `Borrados ${result.changes} investor(s) duplicados sin prestamos ni acceso al portal.`,
      byTenant,
      sample: candidates.slice(0, 10).map(c => ({ id: c.id, name: c.full_name, email: c.email })),
    });
  } catch(e:any) {
    console.error('POST /admin/cleanup-duplicate-investors error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── POST /admin/clean-all-tenants-data ─────────────────────────────────────
// Borra TODA la data transaccional de TODOS los tenants. MANTIENE users,
// tenant_memberships, tenants, tenant_settings, loan_products, bank_accounts,
// contract_templates, receipt_series, whatsapp_event_settings.
// Solo platform_owner. Confirmation: { confirm: 'BORRAR TODO' }.
router.post('/clean-all-tenants-data', authenticate, requirePlatformAdmin, (req: AuthRequest, res: Response) => {
  try {
    if (req.body?.confirm !== 'BORRAR TODO') {
      return res.status(400).json({ error: 'Falta confirmacion. Envia { confirm: "BORRAR TODO" } en el body.' });
    }
    const db = getDb();
    const counts: Record<string, number> = {};
    const wipe = (table: string) => {
      try {
        const before = (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as any)?.c || 0;
        db.prepare(`DELETE FROM ${table}`).run();
        counts[table] = before;
      } catch (_) { counts[table] = -1; }
    };
    db.exec('BEGIN');
    try {
      wipe('payment_items');
      wipe('receipts');
      wipe('payments');
      wipe('installments');
      wipe('payment_promises');
      wipe('collection_notes');
      wipe('collection_tasks');
      wipe('loan_guarantors');
      wipe('loan_guarantees');
      wipe('contracts');
      wipe('loan_requests');
      wipe('investor_payouts');
      wipe('investors');
      wipe('loans');
      wipe('clients');
      wipe('income_expenses');
      wipe('whatsapp_drafts');
      wipe('leads');
      try { db.prepare('UPDATE bank_accounts SET current_balance=initial_balance, loaned_balance=0').run(); } catch (_) {}
      wipe('audit_logs');
      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }
    try {
      db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description,new_values) VALUES (?,?,?,?,?,?,?,?,?)').run(
        uuid(), req.tenant?.id || 'platform', req.user.id, req.user.full_name,
        'clean_all_tenants_data', 'system', 'all',
        `Limpio toda la data transaccional de todos los tenants`,
        JSON.stringify(counts)
      );
    } catch (_) {}
    res.json({
      success: true,
      message: 'Data transaccional borrada de todos los tenants. Usuarios, productos, cuentas bancarias y settings preservados.',
      deleted: counts,
    });
  } catch (e: any) {
    console.error('POST /admin/clean-all-tenants-data error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

export { router };

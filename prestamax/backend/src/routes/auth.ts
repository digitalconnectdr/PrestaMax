import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb, uuid, now } from '../db/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { computePermissions } from '../lib/permissions';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase()) as any;
    if (!user) return res.status(401).json({ error: 'Credenciales invalidas' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Credenciales invalidas' });
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now(), user.id);
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const memberships = db.prepare(`
      SELECT tm.*, t.name as t_name, t.slug as t_slug, t.logo_url as t_logo, t.currency as t_currency, p.features as plan_features
      FROM tenant_memberships tm JOIN tenants t ON t.id = tm.tenant_id
      LEFT JOIN plans p ON p.id = t.plan_id
      WHERE tm.user_id = ? AND tm.is_active = 1
    `).all(user.id) as any[];
    const tenants = memberships.map((m: any) => {
      const roles = JSON.parse(m.roles||'[]');
      const explicit = JSON.parse(m.permissions||'{}');
      let planFeatures: string[] | null = null;
      try { planFeatures = m.plan_features ? JSON.parse(m.plan_features) : null; } catch(_) {}
      const effectivePermissions = Array.from(computePermissions(roles, explicit, planFeatures));
      return {
        ...m, roles, permissions: explicit, effectivePermissions,
        tenant: { id: m.tenant_id, name: m.t_name, slug: m.t_slug, logo_url: m.t_logo, currency: m.t_currency }
      };
    });
    const { password_hash, ...userSafe } = user;
    res.json({ user: userSafe, token, tenants });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Login failed' }); }
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const memberships = db.prepare(`
      SELECT tm.*, t.name as t_name, t.slug as t_slug, t.logo_url as t_logo, t.currency as t_currency, p.features as plan_features
      FROM tenant_memberships tm JOIN tenants t ON t.id = tm.tenant_id
      LEFT JOIN plans p ON p.id = t.plan_id
      WHERE tm.user_id = ? AND tm.is_active = 1
    `).all(req.user.id) as any[];
    const tenants = memberships.map((m: any) => {
      const roles = JSON.parse(m.roles||'[]');
      const explicit = JSON.parse(m.permissions||'{}');
      let planFeatures: string[] | null = null;
      try { planFeatures = m.plan_features ? JSON.parse(m.plan_features) : null; } catch(_) {}
      const effectivePermissions = Array.from(computePermissions(roles, explicit, planFeatures));
      return {
        ...m, roles, permissions: explicit, effectivePermissions,
        tenant: { id: m.tenant_id, name: m.t_name, slug: m.t_slug, logo_url: m.t_logo, currency: m.t_currency }
      };
    });
    const { password_hash, ...userSafe } = req.user;
    res.json({ user: userSafe, tenants });
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

router.put('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { full_name, phone } = req.body;
    const db = getDb();
    db.prepare('UPDATE users SET full_name=?, phone=?, updated_at=? WHERE id=?').run(full_name, phone, now(), req.user.id);
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id) as any;
    const { password_hash, ...safe } = u;
    res.json(safe);
  } catch (e) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/register-tenant', async (req: Request, res: Response) => {
  try {
    const { company_name, admin_name, admin_email, admin_password, phone, currency = 'DOP', plan_id } = req.body;
    if (!company_name?.trim()) return res.status(400).json({ error: 'Nombre de empresa es requerido' });
    if (!admin_name?.trim()) return res.status(400).json({ error: 'Tu nombre es requerido' });
    if (!admin_email?.trim()) return res.status(400).json({ error: 'Email es requerido' });
    if (!admin_password || admin_password.length < 8) return res.status(400).json({ error: 'La contrasena debe tener al menos 8 caracteres' });
    if (!/[A-Z]/.test(admin_password)) return res.status(400).json({ error: 'La contrasena debe contener al menos una letra mayuscula' });
    if (!/[0-9]/.test(admin_password)) return res.status(400).json({ error: 'La contrasena debe contener al menos un numero' });
    if (!/[^A-Za-z0-9]/.test(admin_password)) return res.status(400).json({ error: 'La contrasena debe contener al menos un caracter especial (!@#$%^&*)' });

    const db = getDb();
    const normalizedEmail = admin_email.toLowerCase().trim();

    const existingUser = db.prepare('SELECT id FROM users WHERE email=?').get(normalizedEmail);
    if (existingUser) return res.status(400).json({ error: 'Ya existe una cuenta con este email. Inicia sesion en su lugar.' });

    const baseSlug = company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const existingSlug = db.prepare('SELECT id FROM tenants WHERE slug=?').get(baseSlug);
    const slug = existingSlug ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;

    // 1. Crear tenant en estado trial (10 dias)
    const trialPlan = plan_id ? null : (db.prepare('SELECT id FROM plans WHERE is_trial_default=1 LIMIT 1').get() as any);
    const effectivePlanId = plan_id || trialPlan?.id || null;
    const tenantId = uuid();
    const trialEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO tenants (id,name,slug,email,phone,currency,plan_id,subscription_status,subscription_start,subscription_end,is_active,created_at)
      VALUES (?,?,?,?,?,?,?,'trial',datetime('now'),?,1,datetime('now'))`)
      .run(tenantId, company_name.trim(), slug, normalizedEmail, phone || null, currency, effectivePlanId, trialEnd);

    // 2. Tenant settings
    db.prepare('INSERT OR IGNORE INTO tenant_settings (id,tenant_id) VALUES (?,?)').run(uuid(), tenantId);

    // 3. Plantillas por defecto
    const pagareBody = `                    PAGARE\n\n{{company_name}}\n{{company_address}}\nTel: {{company_phone}}   Email: {{company_email}}\n\nPrestamo No.: {{loan_number}}\n--------------------------------------------------\n\nYo, {{client_name}}, portador de la cedula {{client_id}},\ndomiciliado en {{client_address}}, {{client_city}},\ndebo y pagare a {{company_name}} la suma de RD$ {{amount}}\n\n--------------------------------------------------\nDETALLE DE CUOTAS\n--------------------------------------------------\n{{payment_plan}}\n\nFirma del deudor:  ______________________________________\nNombre:            {{client_name}}\nFecha:             {{print_date}}`;
    const contractBody = `CONTRATO DE PRESTAMO PERSONAL\n\nEntre {{company_name}} y el cliente {{client_name}},\nportador de la cedula {{client_id}}.\n\nMONTO:  {{amount}}\nTASA:   {{rate}}\nPLAZO:  {{term}}\nFECHA:  {{print_date}}\n\n_______________________   _______________________\nFirma del Deudor          Firma del Prestamista`;
    try {
      db.prepare('INSERT OR IGNORE INTO contract_templates (id,tenant_id,name,type,body,is_default) VALUES (?,?,?,?,?,?)')
        .run(uuid(), tenantId, 'Pagare Estandar', 'general', pagareBody, 1);
      db.prepare('INSERT OR IGNORE INTO contract_templates (id,tenant_id,name,type,body,is_default) VALUES (?,?,?,?,?,?)')
        .run(uuid(), tenantId, 'Contrato General de Prestamo', 'general', contractBody, 0);
    } catch (_) {}

    // 4. Crear usuario admin
    const hash = await bcrypt.hash(admin_password, 12);
    const userId = uuid();
    db.prepare(`INSERT INTO users (id,email,password_hash,full_name,is_active,created_at) VALUES (?,?,?,?,1,datetime('now'))`)
      .run(userId, normalizedEmail, hash, admin_name.trim());

    // 5. Membership
    db.prepare(`INSERT INTO tenant_memberships (id,user_id,tenant_id,roles,is_active,created_at) VALUES (?,?,?,?,1,datetime('now'))`)
      .run(uuid(), userId, tenantId, JSON.stringify(['tenant_owner', 'admin']));

    // 6. Auto-login
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(userId) as any;
    db.prepare('UPDATE users SET last_login=? WHERE id=?').run(now(), userId);
    const JWT_SECRET_REG = process.env.JWT_SECRET;
    if (!JWT_SECRET_REG) throw new Error('JWT_SECRET environment variable is required');
    const token = jwt.sign({ userId }, JWT_SECRET_REG, { expiresIn: '7d' });
    const membership = db.prepare(`
      SELECT tm.*, t.name as t_name, t.slug as t_slug, t.logo_url as t_logo, t.currency as t_currency
      FROM tenant_memberships tm JOIN tenants t ON t.id=tm.tenant_id
      WHERE tm.user_id=? AND tm.is_active=1
    `).all(userId) as any[];
    const tenants = membership.map((m: any) => ({
      ...m, roles: JSON.parse(m.roles || '[]'), permissions: JSON.parse(m.permissions || '{}'),
      tenant: { id: m.tenant_id, name: m.t_name, slug: m.t_slug, logo_url: m.t_logo, currency: m.t_currency }
    }));
    const { password_hash, ...userSafe } = user;
    res.status(201).json({ user: userSafe, token, tenants, message: 'Cuenta creada exitosamente! Bienvenido a PrestaMax.' });
  } catch (e: any) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Ya existe una cuenta con ese email o nombre de empresa.' });
    console.error(e);
    res.status(500).json({ error: 'Error al crear la cuenta. Intenta nuevamente.' });
  }
});

router.post('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { current_password, new_password } = req.body;
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id) as any;
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Contrasena actual incorrecta' });
    if (!new_password || new_password.length < 8) return res.status(400).json({ error: 'La nueva contrasena debe tener al menos 8 caracteres' });
    if (!/[A-Z]/.test(new_password)) return res.status(400).json({ error: 'La nueva contrasena debe contener al menos una letra mayuscula' });
    if (!/[0-9]/.test(new_password)) return res.status(400).json({ error: 'La nueva contrasena debe contener al menos un numero' });
    if (!/[^A-Za-z0-9]/.test(new_password)) return res.status(400).json({ error: 'La nueva contrasena debe contener al menos un caracter especial (!@#$%^&*)' });
    const hash = await bcrypt.hash(new_password, 12);
    db.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').run(hash, now(), req.user.id);
    res.json({ success: true, message: 'Contrasena actualizada correctamente' });
  } catch(e: any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

export { router };

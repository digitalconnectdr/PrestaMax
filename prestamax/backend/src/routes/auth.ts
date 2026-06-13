import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDb, uuid, now } from '../db/database';
import { authenticate, AuthRequest } from '../middleware/auth';
import { computePermissions } from '../lib/permissions';

const router = Router();

// Hash "señuelo" (de una contraseña aleatoria) para igualar el tiempo de cómputo
// cuando el email NO existe. Evita la enumeración de usuarios por timing:
// con o sin usuario, siempre se ejecuta un bcrypt.compare de costo equivalente.
const DUMMY_HASH = bcrypt.hashSync('prestamax-timing-guard-' + Math.random().toString(36), 12);

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Credenciales invalidas' });
    }
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase()) as any;
    // Siempre comparamos contra un hash (real o señuelo) para no filtrar por timing
    // si el email existe o no.
    const valid = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
    if (!user || !valid) return res.status(401).json({ error: 'Credenciales invalidas' });
    db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(now(), user.id);
    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    const memberships = db.prepare(`
      SELECT tm.*, t.name as t_name, t.slug as t_slug, t.logo_url as t_logo, t.currency as t_currency, t.phone as t_phone, t.email as t_email, t.address as t_address, t.is_active as t_active, p.features as plan_features
      FROM tenant_memberships tm JOIN tenants t ON t.id = tm.tenant_id
      LEFT JOIN plans p ON p.id = t.plan_id
      WHERE tm.user_id = ? AND tm.is_active = 1 AND t.is_active = 1
    `).all(user.id) as any[];

    // Si no tiene ninguna membresia activa y NO es platform admin, rechazar.
    // Esto evita que un usuario bloqueado por su admin (membership.is_active=0
    // o tenant.is_active=0) pueda iniciar sesion y navegar.
    const isPlatformAdmin = ['platform_owner','platform_admin','admin'].includes(user.platform_role);
    if (memberships.length === 0 && !isPlatformAdmin) {
      return res.status(403).json({
        error: 'Tu cuenta esta desactivada o no tiene acceso a ninguna empresa. Contacta a tu administrador.',
        code: 'ACCESS_REVOKED',
      });
    }

    const tenants = memberships.map((m: any) => {
      const roles = JSON.parse(m.roles||'[]');
      const explicit = JSON.parse(m.permissions||'{}');
      let planFeatures: string[] | null = null;
      try { planFeatures = m.plan_features ? JSON.parse(m.plan_features) : null; } catch(_) {}
      const effectivePermissions = Array.from(computePermissions(roles, explicit, planFeatures));
      return {
        ...m, roles, permissions: explicit, effectivePermissions,
        tenant: { id: m.tenant_id, name: m.t_name, slug: m.t_slug, logo_url: m.t_logo, currency: m.t_currency, phone: m.t_phone, email: m.t_email, address: m.t_address }
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
      WHERE tm.user_id = ? AND tm.is_active = 1 AND t.is_active = 1
    `).all(req.user.id) as any[];

    // Rechazar acceso si no hay memberships activas y no es platform admin
    const isPlatformAdmin = ['platform_owner','platform_admin','admin'].includes(req.user.platform_role);
    if (memberships.length === 0 && !isPlatformAdmin) {
      return res.status(403).json({
        error: 'Tu cuenta esta desactivada o no tiene acceso a ninguna empresa. Contacta a tu administrador.',
        code: 'ACCESS_REVOKED',
      });
    }

    const tenants = memberships.map((m: any) => {
      const roles = JSON.parse(m.roles||'[]');
      const explicit = JSON.parse(m.permissions||'{}');
      let planFeatures: string[] | null = null;
      try { planFeatures = m.plan_features ? JSON.parse(m.plan_features) : null; } catch(_) {}
      const effectivePermissions = Array.from(computePermissions(roles, explicit, planFeatures));
      return {
        ...m, roles, permissions: explicit, effectivePermissions,
        tenant: { id: m.tenant_id, name: m.t_name, slug: m.t_slug, logo_url: m.t_logo, currency: m.t_currency, phone: m.t_phone, email: m.t_email, address: m.t_address }
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

// GET /auth/subscription-status — devuelve el estado de suscripcion SIN bloquear
// si esta expirado. Usa authenticate + header X-Tenant-Id manual. Util para
// que el banner de "suscripcion expirada" sepa si debe seguir mostrando o no.
router.get('/subscription-status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.json({ expired: false, status: 'none', requiresTenantHeader: true });
    const tenant = db.prepare('SELECT id, subscription_status, subscription_end, plan_id FROM tenants WHERE id=? AND is_active=1').get(tenantId) as any;
    if (!tenant) return res.json({ expired: false, status: 'none', notFound: true });
    const plan = tenant.plan_id ? db.prepare('SELECT name FROM plans WHERE id=?').get(tenant.plan_id) as any : null;
    const subEnd = tenant.subscription_end ? new Date(tenant.subscription_end) : null;
    const today  = new Date();
    const isExpired = tenant.subscription_status === 'expired' || (subEnd != null && subEnd < today);
    const msLeft = subEnd ? (subEnd.getTime() - today.getTime()) : null;
    const daysLeft = msLeft != null ? Math.floor(msLeft / 86400000) : null;
    res.json({
      expired: isExpired,
      status: tenant.subscription_status || 'unknown',
      expiresAt: tenant.subscription_end || null,
      daysLeft,
      planName: plan?.name || null,
    });
  } catch (e: any) {
    res.json({ expired: false, status: 'error', error: e.message });
  }
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

    // 1. Verificar si este email ya uso el trial antes (anti-reutilizacion)
    const trialUsedRow = db.prepare('SELECT email, first_tenant_id, first_used_at FROM trial_history WHERE email=?').get(normalizedEmail) as any;
    const trialAlreadyUsed = !!trialUsedRow;

    // Si el usuario ya uso trial, debe seleccionar un plan pago de entrada
    // (no se le otorga trial nuevamente).
    if (trialAlreadyUsed && !plan_id) {
      return res.status(400).json({
        error: 'Este email ya uso el periodo de prueba anteriormente. Para crear una nueva cuenta debes seleccionar un plan pago.',
        code: 'TRIAL_ALREADY_USED',
        first_used_at: trialUsedRow.first_used_at,
      });
    }

    // 2. Crear tenant
    const trialPlan = plan_id ? null : (db.prepare('SELECT id FROM plans WHERE is_trial_default=1 LIMIT 1').get() as any);
    const effectivePlanId = plan_id || trialPlan?.id || null;
    const tenantId = uuid();
    // Si el usuario selecciono un plan pago, NO le damos trial - se cobra desde el inicio
    const isStartingWithPaidPlan = !!plan_id;
    const initialStatus = isStartingWithPaidPlan ? 'pending' : 'trial';
    const trialEnd = isStartingWithPaidPlan
      ? null
      : new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`INSERT INTO tenants (id,name,slug,email,phone,currency,plan_id,subscription_status,subscription_start,subscription_end,is_active,created_at)
      VALUES (?,?,?,?,?,?,?,?,datetime('now'),?,1,datetime('now'))`)
      .run(tenantId, company_name.trim(), slug, normalizedEmail, phone || null, currency, effectivePlanId, initialStatus, trialEnd);

    // Marcar email como ya-uso-trial (solo si realmente esta usando trial)
    if (!trialAlreadyUsed && !isStartingWithPaidPlan) {
      try {
        db.prepare(`INSERT OR IGNORE INTO trial_history (id, email, first_tenant_id, first_used_at)
          VALUES (?, ?, ?, datetime('now'))`)
          .run(uuid(), normalizedEmail, tenantId);
      } catch(_) {}
    }

    // 2. Tenant settings
    db.prepare('INSERT OR IGNORE INTO tenant_settings (id,tenant_id) VALUES (?,?)').run(uuid(), tenantId);

    // 3. Plantillas por defecto: las maneja database.ts (Contrato General de
    //    Prestamo o Pagare + Pagare Notarial). Aqui ya no insertamos las viejas.

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
      SELECT tm.*, t.name as t_name, t.slug as t_slug, t.logo_url as t_logo, t.currency as t_currency, p.features as plan_features
      FROM tenant_memberships tm JOIN tenants t ON t.id=tm.tenant_id
      LEFT JOIN plans p ON p.id = t.plan_id
      WHERE tm.user_id=? AND tm.is_active=1
    `).all(userId) as any[];
    // FIX P2 (Jun 2026): incluir effectivePermissions (igual que /login y /me)
    // para que el frontend respete el techo del plan desde el primer login.
    const tenants = membership.map((m: any) => {
      const roles = JSON.parse(m.roles || '[]');
      const explicit = JSON.parse(m.permissions || '{}');
      let planFeatures: string[] | null = null;
      try { planFeatures = m.plan_features ? JSON.parse(m.plan_features) : null; } catch(_) {}
      const effectivePermissions = Array.from(computePermissions(roles, explicit, planFeatures));
      return {
        ...m, roles, permissions: explicit, effectivePermissions,
        tenant: { id: m.tenant_id, name: m.t_name, slug: m.t_slug, logo_url: m.t_logo, currency: m.t_currency }
      };
    });
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

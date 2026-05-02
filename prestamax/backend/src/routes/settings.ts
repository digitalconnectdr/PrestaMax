import { Router, Response } from 'express';
import { getDb, uuid, now } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';
import { PERM_DEFS, ROLE_DEFAULTS, computePermissions } from '../lib/permissions';
const router = Router();

// ─── Role hierarchy helpers ─────────────────────────────────────────────────
const ROLE_LEVELS: Record<string, number> = {
  tenant_owner: 4,
  admin: 3,
  prestamista: 2, oficial: 2, cashier: 2, loan_officer: 2,
  cobrador: 1, collector: 1,
}
function maxRoleLevel(roles: string[]): number {
  if (!roles.length) return 0;
  return Math.max(0, ...roles.map(r => ROLE_LEVELS[r] ?? 0));
}
function getRequesterRoleLevel(db: any, userId: string, tenantId: string): number {
  const user = db.prepare('SELECT platform_role FROM users WHERE id=?').get(userId) as any;
  if (['platform_owner','platform_admin','admin'].includes(user?.platform_role)) return 99;
  const mem = db.prepare('SELECT roles FROM tenant_memberships WHERE user_id=? AND tenant_id=? AND is_active=1').get(userId, tenantId) as any;
  if (!mem) return 0;
  const roles = (() => { try { return JSON.parse(mem.roles || '[]') } catch(_) { return [] } })();
  return maxRoleLevel(roles);
}

// GET all settings for tenant
router.get('/', authenticate, requireTenant, requirePermission('settings.general'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const tid = req.tenant.id;
    const tenant = db.prepare('SELECT * FROM tenants WHERE id=?').get(tid);
    const settings = db.prepare('SELECT * FROM tenant_settings WHERE tenant_id=?').get(tid);
    const branches = db.prepare('SELECT * FROM branches WHERE tenant_id=? AND is_active=1').all(tid);
    const series = db.prepare('SELECT * FROM receipt_series WHERE tenant_id=?').all(tid);
    const templates = db.prepare('SELECT * FROM contract_templates WHERE tenant_id=?').all(tid);
    const wTemplates = db.prepare('SELECT * FROM whatsapp_templates WHERE tenant_id=?').all(tid);
    const members = db.prepare('SELECT tm.*,u.full_name,u.email,u.is_active as user_active,u.last_login FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id WHERE tm.tenant_id=?').all(tid);
    const guaranteeCategories = db.prepare('SELECT * FROM guarantee_categories WHERE tenant_id=?').all(tid);
    const bankAccounts = db.prepare('SELECT * FROM bank_accounts WHERE tenant_id=? AND is_active=1').all(tid);
    res.json({ tenant, settings, branches, series, templates, wTemplates, members, guaranteeCategories, bankAccounts });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PUT update tenant info
router.put('/tenant', authenticate, requireTenant, requirePermission('settings.general'), (req: AuthRequest, res: Response) => {
  try {
    const d = req.body; const db = getDb();
    const signatureMode = d.signature_mode || d.signatureMode || undefined;
    // Helper: return value if defined, else null (never undefined — SQLite can't bind undefined)
    const col = (v: any) => v !== undefined ? (v || null) : null;
    db.prepare(`UPDATE tenants SET
      name=COALESCE(?,name),
      email=COALESCE(?,email),
      phone=COALESCE(?,phone),
      address=COALESCE(?,address),
      currency=COALESCE(?,currency),
      score_mode=COALESCE(?,score_mode),
      signature_mode=COALESCE(?,signature_mode),
      payment_order=COALESCE(?,payment_order),
      rnc=COALESCE(?,rnc),
      representative_name=COALESCE(?,representative_name),
      signature_url=COALESCE(?,signature_url),
      city=COALESCE(?,city),
      notary_name=COALESCE(?,notary_name),
      notary_collegiate_number=COALESCE(?,notary_collegiate_number),
      notary_office_address=COALESCE(?,notary_office_address),
      acreedor_id_number=COALESCE(?,acreedor_id_number),
      testigo1_nombre=COALESCE(?,testigo1_nombre),
      testigo1_id=COALESCE(?,testigo1_id),
      testigo1_domicilio=COALESCE(?,testigo1_domicilio),
      testigo2_nombre=COALESCE(?,testigo2_nombre),
      testigo2_id=COALESCE(?,testigo2_id),
      testigo2_domicilio=COALESCE(?,testigo2_domicilio),
      updated_at=?
    WHERE id=?`).run(
      d.name||null, d.email||null, d.phone||null, d.address||null, d.currency||null,
      d.score_mode||null, signatureMode||null,
      d.payment_order ? JSON.stringify(d.payment_order) : null,
      col(d.rnc),
      col(d.representative_name),
      col(d.signature_url),
      col(d.city),
      col(d.notary_name),
      col(d.notary_collegiate_number),
      col(d.notary_office_address),
      col(d.acreedor_id_number),
      col(d.testigo1_nombre),
      col(d.testigo1_id),
      col(d.testigo1_domicilio),
      col(d.testigo2_nombre),
      col(d.testigo2_id),
      col(d.testigo2_domicilio),
      now(), req.tenant.id
    );
    res.json(db.prepare('SELECT * FROM tenants WHERE id=?').get(req.tenant.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PUT update mora settings
router.put('/mora', authenticate, requireTenant, requirePermission('settings.general'), (req: AuthRequest, res: Response) => {
  try {
    const d = req.body; const db = getDb();
    const existing = db.prepare('SELECT id FROM tenant_settings WHERE tenant_id=?').get(req.tenant.id) as any;
    if (existing) {
      db.prepare(`UPDATE tenant_settings SET
        mora_rate_daily=COALESCE(?,mora_rate_daily),
        mora_grace_days=COALESCE(?,mora_grace_days),
        rebate_enabled=COALESCE(?,rebate_enabled),
        rebate_type=COALESCE(?,rebate_type),
        mora_base=COALESCE(?,mora_base),
        mora_fixed_enabled=COALESCE(?,mora_fixed_enabled),
        mora_fixed_amount=COALESCE(?,mora_fixed_amount),
        updated_at=?
      WHERE tenant_id=?`).run(
        d.mora_rate_daily ?? null, d.mora_grace_days ?? null,
        d.rebate_enabled ?? null, d.rebate_type ?? null,
        d.mora_base ?? null,
        d.mora_fixed_enabled ?? null,
        d.mora_fixed_amount ?? null,
        now(), req.tenant.id
      );
    } else {
      db.prepare('INSERT INTO tenant_settings (id,tenant_id,mora_rate_daily,mora_grace_days,mora_base,mora_fixed_enabled,mora_fixed_amount) VALUES (?,?,?,?,?,?,?)').run(
        uuid(), req.tenant.id, d.mora_rate_daily ?? 0.001, d.mora_grace_days ?? 3,
        d.mora_base ?? 'cuota', d.mora_fixed_enabled ?? 0, d.mora_fixed_amount ?? 0
      );
    }
    res.json(db.prepare('SELECT * FROM tenant_settings WHERE tenant_id=?').get(req.tenant.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PUT multi-currency settings
router.put('/currencies', authenticate, requireTenant, requirePermission('settings.general'), (req: AuthRequest, res: Response) => {
  try {
    const d = req.body; const db = getDb();
    const multiCurrencyEnabled = d.multi_currency_enabled !== undefined ? (d.multi_currency_enabled ? 1 : 0) : null;
    // Always ensure DOP is included in enabled currencies
    let enabledCurrencies: string[] = Array.isArray(d.enabled_currencies) ? d.enabled_currencies : ['DOP'];
    if (!enabledCurrencies.includes('DOP')) enabledCurrencies = ['DOP', ...enabledCurrencies];
    enabledCurrencies = [...new Set(enabledCurrencies.map((c: string) => c.toUpperCase()))];

    const existing = db.prepare('SELECT id FROM tenant_settings WHERE tenant_id=?').get(req.tenant.id) as any;
    if (existing) {
      db.prepare(`UPDATE tenant_settings SET
        multi_currency_enabled=COALESCE(?,multi_currency_enabled),
        enabled_currencies=?,
        updated_at=?
      WHERE tenant_id=?`).run(
        multiCurrencyEnabled,
        JSON.stringify(enabledCurrencies),
        now(), req.tenant.id
      );
    } else {
      db.prepare('INSERT INTO tenant_settings (id,tenant_id,multi_currency_enabled,enabled_currencies) VALUES (?,?,?,?)').run(
        uuid(), req.tenant.id, multiCurrencyEnabled ?? 0, JSON.stringify(enabledCurrencies)
      );
    }
    res.json(db.prepare('SELECT * FROM tenant_settings WHERE tenant_id=?').get(req.tenant.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET users for tenant
router.get('/users', authenticate, requireTenant, requirePermission('settings.users'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    // Exclude platform-level owners/admins from the tenant user list unless the requester is a tenant_owner
    const requesterMembership = db.prepare('SELECT roles FROM tenant_memberships WHERE tenant_id=? AND user_id=?').get(req.tenant.id, req.user.id) as any;
    const isTenantOwner = requesterMembership && (requesterMembership.roles || '').includes('tenant_owner');
    let users;
    if (isTenantOwner) {
      users = db.prepare(`SELECT tm.id, tm.user_id, tm.roles, tm.is_active, tm.branch_id, tm.created_at,
        u.full_name, u.email, u.phone, u.is_active as user_active, u.last_login
      FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id
      WHERE tm.tenant_id=? ORDER BY u.full_name`).all(req.tenant.id);
    } else {
      // Non-owners cannot see platform admins/owners
      users = db.prepare(`SELECT tm.id, tm.user_id, tm.roles, tm.is_active, tm.branch_id, tm.created_at,
        u.full_name, u.email, u.phone, u.is_active as user_active, u.last_login
      FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id
      WHERE tm.tenant_id=? AND (u.platform_role IS NULL OR u.platform_role NOT IN ('platform_owner','platform_admin','admin'))
      AND tm.user_id != ?
      ORDER BY u.full_name`).all(req.tenant.id, req.user.id);
      // Add the requester themselves back at the top
      const self = db.prepare(`SELECT tm.id, tm.user_id, tm.roles, tm.is_active, tm.branch_id, tm.created_at,
        u.full_name, u.email, u.phone, u.is_active as user_active, u.last_login
      FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id
      WHERE tm.tenant_id=? AND tm.user_id=?`).get(req.tenant.id, req.user.id);
      if (self) (users as any[]).unshift(self);
    }
    res.json(users);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// PUT update user membership (role, active, branch)
router.put('/users/:membershipId', authenticate, requireTenant, requirePermission('settings.users'), (req: AuthRequest, res: Response) => {
  try {
    // Accept both snake_case (from API interceptor) and camelCase
    const roles = req.body.roles;
    const is_active = req.body.is_active ?? req.body.isActive;
    const branch_id = req.body.branch_id ?? req.body.branchId;
    const db = getDb();
    // Protect: tenant_owner role can never be assigned via API
    if (roles && Array.isArray(roles) && roles.includes('tenant_owner')) {
      return res.status(403).json({ error: 'El rol tenant_owner no puede ser asignado manualmente' });
    }
    // Also protect the owner membership from being deactivated by others
    const membership = db.prepare('SELECT * FROM tenant_memberships WHERE id=? AND tenant_id=?').get(req.params.membershipId, req.tenant.id) as any;
    if (!membership) return res.status(404).json({ error: 'Membresía no encontrada' });
    const currentRoles = (() => { try { return JSON.parse(membership.roles || '[]') } catch(_) { return [] } })();
    if (currentRoles.includes('tenant_owner') && req.user.id !== membership.user_id) {
      return res.status(403).json({ error: 'No puedes modificar al propietario del tenant' });
    }
    // Role hierarchy: requester must have strictly higher level than target
    if (req.user.id !== membership.user_id) {
      const requesterLevel = getRequesterRoleLevel(db, req.user.id, req.tenant.id);
      const targetLevel = maxRoleLevel(currentRoles);
      if (requesterLevel <= targetLevel) {
        return res.status(403).json({ error: 'No tienes permisos para modificar a un usuario con rol igual o superior al tuyo' });
      }
    }
    db.prepare(`UPDATE tenant_memberships SET
      roles=COALESCE(?,roles),
      is_active=COALESCE(?,is_active),
      branch_id=COALESCE(?,branch_id),
      updated_at=?
    WHERE id=? AND tenant_id=?`).run(
      roles ? JSON.stringify(roles) : null,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      branch_id ?? null, now(),
      req.params.membershipId, req.tenant.id
    );
    const targetMember = db.prepare('SELECT u.full_name FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id WHERE tm.id=?').get(req.params.membershipId) as any;
    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description) VALUES (?,?,?,?,?,?,?,?)').run(
      uuid(), req.tenant.id, req.user.id, req.user.full_name, 'permission_changed', 'membership', req.params.membershipId,
      `Modificó permisos/rol del usuario: ${targetMember?.full_name||'desconocido'}`
    );
    res.json(db.prepare('SELECT * FROM tenant_memberships WHERE id=?').get(req.params.membershipId));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// POST reset password for a tenant user
router.post('/users/:membershipId/reset-password', authenticate, requireTenant, requirePermission('settings.users'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const membership = db.prepare('SELECT * FROM tenant_memberships WHERE id=? AND tenant_id=?').get(req.params.membershipId, req.tenant.id) as any;
    if (!membership) return res.status(404).json({ error: 'Membresía no encontrada' });
    // Cannot reset password of tenant_owner (unless they are themselves)
    const currentRoles = (() => { try { return JSON.parse(membership.roles || '[]') } catch(_) { return [] } })();
    if (currentRoles.includes('tenant_owner') && req.user.id !== membership.user_id) {
      return res.status(403).json({ error: 'No puedes restablecer la contraseña del propietario' });
    }
    // Role hierarchy: requester must have strictly higher level than target
    if (req.user.id !== membership.user_id) {
      const requesterLevel = getRequesterRoleLevel(db, req.user.id, req.tenant.id);
      const targetLevel = maxRoleLevel(currentRoles);
      if (requesterLevel <= targetLevel) {
        return res.status(403).json({ error: 'No tienes permisos para restablecer la contraseña de un usuario con rol igual o superior al tuyo' });
      }
    }
    const bcrypt = require('bcryptjs');
    // Generate readable temp password: 3 words pattern
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let tempPassword = '';
    for (let i = 0; i < 10; i++) tempPassword += chars[Math.floor(Math.random() * chars.length)];
    const hash = bcrypt.hashSync(tempPassword, 10);
    db.prepare('UPDATE users SET password_hash=?, updated_at=? WHERE id=?').run(hash, now(), membership.user_id);
    const resetUser = db.prepare('SELECT full_name FROM users WHERE id=?').get(membership.user_id) as any;
    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description) VALUES (?,?,?,?,?,?,?,?)').run(
      uuid(), req.tenant.id, req.user.id, req.user.full_name, 'password_reset', 'user', membership.user_id,
      `Restableció la contraseña del usuario: ${resetUser?.full_name||'desconocido'}`
    );
    res.json({ success: true, tempPassword, message: 'Contraseña restablecida exitosamente' });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// POST invite/create user in tenant
router.post('/users/invite', authenticate, requireTenant, requirePermission('settings.users'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    // Accept both camelCase (fullName) and snake_case (full_name) — the API interceptor converts outgoing camelCase to snake_case
    const email = req.body.email;
    const fullName = req.body.fullName || req.body.full_name;
    const roles: string[] = req.body.roles || ['cobrador'];
    const branchId = req.body.branchId || req.body.branch_id;
    if (!email || !fullName) return res.status(400).json({ error: 'Email y nombre son requeridos' });

    // ── Plan limit check ──────────────────────────────────────────────────────
    const plan = db.prepare(`
      SELECT p.max_users, p.max_collectors
      FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id
      WHERE t.id=?`).get(req.tenant.id) as any;

    const currentMembers = (db.prepare(
      'SELECT COUNT(*) as c FROM tenant_memberships WHERE tenant_id=? AND is_active=1'
    ).get(req.tenant.id) as any).c;

    if (plan?.max_users !== -1 && plan?.max_users != null && currentMembers >= plan.max_users) {
      return res.status(403).json({
        error: `Tu plan permite un máximo de ${plan.max_users} usuario(s). Actualiza tu plan para agregar más.`,
        code: 'PLAN_LIMIT_USERS'
      });
    }

    const isCollector = roles.includes('cobrador');
    if (isCollector) {
      const currentCollectors = (db.prepare(`
        SELECT COUNT(*) as c FROM tenant_memberships
        WHERE tenant_id=? AND is_active=1 AND roles LIKE '%cobrador%'
      `).get(req.tenant.id) as any).c;

      if (plan?.max_collectors !== -1 && plan?.max_collectors != null && currentCollectors >= plan.max_collectors) {
        return res.status(403).json({
          error: `Tu plan permite un máximo de ${plan.max_collectors} cobrador(es). Actualiza tu plan para agregar más.`,
          code: 'PLAN_LIMIT_COLLECTORS'
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Check if user already exists
    let user = db.prepare('SELECT * FROM users WHERE email=?').get(email) as any;
    if (!user) {
      // Create user with temp password (they should reset)
      const bcrypt = require('bcryptjs');
      const tempPassword = Math.random().toString(36).slice(-8);
      const hash = bcrypt.hashSync(tempPassword, 10);
      const uid = uuid();
      db.prepare(`INSERT INTO users (id,email,password_hash,full_name,is_active,platform_role,created_at,updated_at)
        VALUES (?,?,?,?,1,'none',?,?)`).run(uid, email, hash, fullName, now(), now());
      user = db.prepare('SELECT * FROM users WHERE id=?').get(uid);
    }

    // Check if already a member
    const existing = db.prepare('SELECT id FROM tenant_memberships WHERE user_id=? AND tenant_id=?').get(user.id, req.tenant.id);
    if (existing) return res.status(409).json({ error: 'El usuario ya pertenece a este tenant' });

    const memId = uuid();
    db.prepare(`INSERT INTO tenant_memberships (id,user_id,tenant_id,branch_id,roles,is_active,created_at,updated_at)
      VALUES (?,?,?,?,?,1,?,?)`).run(
      memId, user.id, req.tenant.id, branchId || null,
      JSON.stringify(roles), now(), now()
    );
    res.status(201).json({ membership: db.prepare('SELECT * FROM tenant_memberships WHERE id=?').get(memId), user });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET branches for tenant
router.get('/branches', authenticate, requireTenant, requirePermission('settings.branches'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM branches WHERE tenant_id=? AND is_active=1 ORDER BY name').all(req.tenant.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// POST create branch
router.post('/branches', authenticate, requireTenant, requirePermission('settings.branches'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const id = uuid(); const d = req.body;
    db.prepare('INSERT INTO branches (id,tenant_id,name,address,phone) VALUES (?,?,?,?,?)').run(id, req.tenant.id, d.name, d.address||null, d.phone||null);
    res.status(201).json(db.prepare('SELECT * FROM branches WHERE id=?').get(id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// --- BANK ACCOUNTS ---
router.get('/bank-accounts', authenticate, requireTenant, requirePermission('settings.bank_accounts'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM bank_accounts WHERE tenant_id=? AND is_active=1 ORDER BY bank_name').all(req.tenant.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.post('/bank-accounts', authenticate, requireTenant, requirePermission('settings.bank_accounts'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const id = uuid(); const d = req.body;
    if (!d.bank_name) return res.status(400).json({ error: 'Nombre del banco es requerido' });
    const initialBalance = parseFloat(d.initial_balance || '0') || 0;
    db.prepare(`INSERT INTO bank_accounts (id,tenant_id,bank_name,account_number,account_type,account_holder,currency,is_active,initial_balance,current_balance,loaned_balance)
      VALUES (?,?,?,?,?,?,?,1,?,?,0)`).run(id, req.tenant.id, d.bank_name, d.account_number||null, d.account_type||'checking', d.account_holder||null, d.currency||'DOP', initialBalance, initialBalance);
    res.status(201).json(db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.put('/bank-accounts/:id', authenticate, requireTenant, requirePermission('settings.bank_accounts'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const d = req.body;
    const acc = db.prepare('SELECT * FROM bank_accounts WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!acc) return res.status(404).json({ error: 'Cuenta no encontrada' });
    // If initial_balance changed, adjust current_balance by the difference
    let newInitial = d.initial_balance !== undefined ? parseFloat(d.initial_balance) : acc.initial_balance;
    if (isNaN(newInitial)) newInitial = acc.initial_balance;
    const diff = newInitial - acc.initial_balance;
    const newCurrent = acc.current_balance + diff;
    db.prepare(`UPDATE bank_accounts SET bank_name=COALESCE(?,bank_name), account_number=COALESCE(?,account_number),
      account_type=COALESCE(?,account_type), account_holder=COALESCE(?,account_holder),
      currency=COALESCE(?,currency), is_active=COALESCE(?,is_active),
      initial_balance=?, current_balance=? WHERE id=?`).run(
      d.bank_name||null, d.account_number||null, d.account_type||null, d.account_holder||null,
      d.currency||null, d.is_active !== undefined ? (d.is_active ? 1 : 0) : null,
      newInitial, newCurrent, req.params.id
    );
    res.json(db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(req.params.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.delete('/bank-accounts/:id', authenticate, requireTenant, requirePermission('settings.bank_accounts'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    db.prepare('UPDATE bank_accounts SET is_active=0 WHERE id=? AND tenant_id=?').run(req.params.id, req.tenant.id);
    res.json({ success: true });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// --- BANK ACCOUNT TRANSFERS ---
router.get('/bank-accounts/transfers', authenticate, requireTenant, requirePermission('settings.bank_accounts'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    // Optional filter by account_id (shows both incoming and outgoing)
    const accountId = req.query.account_id as string | undefined;
    let query = `
      SELECT at.*,
        fa.bank_name as from_bank_name, fa.account_number as from_account_number, fa.currency as from_currency_label,
        ta.bank_name as to_bank_name,   ta.account_number as to_account_number,   ta.currency as to_currency_label
      FROM account_transfers at
      LEFT JOIN bank_accounts fa ON fa.id = at.from_account_id
      LEFT JOIN bank_accounts ta ON ta.id = at.to_account_id
      WHERE at.tenant_id=?`;
    const params: any[] = [req.tenant.id];
    if (accountId) {
      query += ` AND (at.from_account_id=? OR at.to_account_id=?)`;
      params.push(accountId, accountId);
    }
    query += ` ORDER BY at.transferred_at DESC LIMIT 200`;
    const transfers = db.prepare(query).all(...params);
    res.json(transfers);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.post('/bank-accounts/transfer', authenticate, requireTenant, requirePermission('settings.bank_accounts'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const d = req.body;
    const amount = parseFloat(d.amount);
    if (!d.from_account_id || !d.to_account_id) return res.status(400).json({ error: 'Cuentas de origen y destino son requeridas' });
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Monto inválido' });
    if (d.from_account_id === d.to_account_id) return res.status(400).json({ error: 'Las cuentas no pueden ser iguales' });

    const fromAcc = db.prepare('SELECT * FROM bank_accounts WHERE id=? AND tenant_id=? AND is_active=1').get(d.from_account_id, req.tenant.id) as any;
    const toAcc   = db.prepare('SELECT * FROM bank_accounts WHERE id=? AND tenant_id=? AND is_active=1').get(d.to_account_id,   req.tenant.id) as any;
    if (!fromAcc) return res.status(404).json({ error: 'Cuenta de origen no encontrada' });
    if (!toAcc)   return res.status(404).json({ error: 'Cuenta de destino no encontrada' });
    if (fromAcc.current_balance < amount) return res.status(400).json({ error: `Fondos insuficientes. Balance disponible: ${fromAcc.current_balance.toFixed(2)} ${fromAcc.currency}` });

    // ── Multi-currency handling ─────────────────────────────────────
    const currenciesDiffer = fromAcc.currency !== toAcc.currency;
    let exchangeRate = 1.0;
    if (currenciesDiffer) {
      exchangeRate = parseFloat(d.exchange_rate);
      if (!exchangeRate || exchangeRate <= 0) {
        return res.status(400).json({
          error: `Las cuentas tienen divisas diferentes (${fromAcc.currency} → ${toAcc.currency}). Debes indicar el tipo de cambio.`,
          requires_exchange_rate: true,
          from_currency: fromAcc.currency,
          to_currency: toAcc.currency,
        });
      }
    }
    // Amount to credit in destination account currency.
    // TC convention: "1 {strong_currency} = {TC} {local_currency}" (e.g. 1 USD = 58.5 DOP)
    // If sending FROM local (DOP) TO strong (USD): destination = amount / TC
    // If sending FROM strong (USD) TO local (DOP): destination = amount * TC
    // If same strength category: destination = amount * TC (original behaviour)
    const STRONG_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'AUD'];
    const fromIsStrong = STRONG_CURRENCIES.includes(fromAcc.currency);
    const toIsStrong   = STRONG_CURRENCIES.includes(toAcc.currency);
    const crossingStrength = fromIsStrong !== toIsStrong;
    const amountDestination = crossingStrength && !fromIsStrong
      ? parseFloat((amount / exchangeRate).toFixed(2))   // DOP→USD: divide by TC
      : parseFloat((amount * exchangeRate).toFixed(2));  // USD→DOP or same: multiply

    // Ensure transfer tables have the new columns (idempotent migrations)
    try { db.exec(`ALTER TABLE account_transfers ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1.0`); } catch(_) {}
    try { db.exec(`ALTER TABLE account_transfers ADD COLUMN from_currency TEXT NOT NULL DEFAULT 'DOP'`); } catch(_) {}
    try { db.exec(`ALTER TABLE account_transfers ADD COLUMN to_currency TEXT NOT NULL DEFAULT 'DOP'`); } catch(_) {}
    try { db.exec(`ALTER TABLE account_transfers ADD COLUMN amount_destination REAL NOT NULL DEFAULT 0`); } catch(_) {}

    const transferId = uuid();
    db.prepare('UPDATE bank_accounts SET current_balance=current_balance-? WHERE id=?').run(amount, d.from_account_id);
    db.prepare('UPDATE bank_accounts SET current_balance=current_balance+? WHERE id=?').run(amountDestination, d.to_account_id);
    db.prepare(`INSERT INTO account_transfers
      (id,tenant_id,from_account_id,to_account_id,amount,amount_destination,exchange_rate,from_currency,to_currency,notes,transferred_by,transferred_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(transferId, req.tenant.id, d.from_account_id, d.to_account_id,
      amount, amountDestination, exchangeRate,
      fromAcc.currency, toAcc.currency,
      d.notes||null, req.user.id, now()
    );

    res.status(201).json({
      transfer: db.prepare('SELECT * FROM account_transfers WHERE id=?').get(transferId),
      from_account: db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(d.from_account_id),
      to_account:   db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(d.to_account_id),
    });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// --- TEMPLATES ---
router.get('/templates', authenticate, requireTenant, requirePermission('templates.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const templates = db.prepare('SELECT * FROM contract_templates WHERE tenant_id=? ORDER BY is_default DESC, name ASC').all(req.tenant.id);
    res.json(templates);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.post('/templates', authenticate, requireTenant, requirePermission('templates.create'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const id = uuid(); const d = req.body;
    if (d.is_default) db.prepare('UPDATE contract_templates SET is_default=0 WHERE tenant_id=?').run(req.tenant.id);
    db.prepare('INSERT INTO contract_templates (id,tenant_id,name,type,body,is_default) VALUES (?,?,?,?,?,?)').run(id, req.tenant.id, d.name, d.type||'general', d.body||'', d.is_default?1:0);
    res.status(201).json(db.prepare('SELECT * FROM contract_templates WHERE id=?').get(id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.put('/templates/:id', authenticate, requireTenant, requirePermission('templates.edit'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const d = req.body;
    const tpl = db.prepare('SELECT id FROM contract_templates WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id);
    if (!tpl) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (d.is_default) db.prepare('UPDATE contract_templates SET is_default=0 WHERE tenant_id=?').run(req.tenant.id);
    db.prepare(`UPDATE contract_templates SET name=COALESCE(?,name), type=COALESCE(?,type), body=COALESCE(?,body),
      is_default=COALESCE(?,is_default), version=version+1 WHERE id=?`).run(
      d.name||null, d.type||null, d.body||null, d.is_default!==undefined?(d.is_default?1:0):null, req.params.id
    );
    res.json(db.prepare('SELECT * FROM contract_templates WHERE id=?').get(req.params.id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

router.delete('/templates/:id', authenticate, requireTenant, requirePermission('templates.delete'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    db.prepare('DELETE FROM contract_templates WHERE id=? AND tenant_id=?').run(req.params.id, req.tenant.id);
    res.json({ success: true });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// --- WHATSAPP TEMPLATES ---
router.post('/whatsapp-templates', authenticate, requireTenant, requirePermission('whatsapp.templates'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const id = uuid(); const d = req.body;
    db.prepare('INSERT INTO whatsapp_templates (id,tenant_id,name,event,body) VALUES (?,?,?,?,?)').run(id, req.tenant.id, d.name, d.event, d.body);
    res.status(201).json(db.prepare('SELECT * FROM whatsapp_templates WHERE id=?').get(id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// --- RECEIPT SERIES ---
router.post('/series', authenticate, requireTenant, requirePermission('settings.general'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const d = req.body;
    if (d.is_default) db.prepare('UPDATE receipt_series SET is_default=0 WHERE tenant_id=?').run(req.tenant.id);
    const id = uuid();
    db.prepare('INSERT INTO receipt_series (id,tenant_id,name,prefix,is_default) VALUES (?,?,?,?,?)').run(id, req.tenant.id, d.name, d.prefix, d.is_default?1:0);
    res.status(201).json(db.prepare('SELECT * FROM receipt_series WHERE id=?').get(id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// --- GUARANTEE CATEGORIES ---
router.post('/guarantee-categories', authenticate, requireTenant, requirePermission('settings.general'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const id = uuid();
    db.prepare('INSERT INTO guarantee_categories (id,tenant_id,name) VALUES (?,?,?)').run(id, req.tenant.id, req.body.name);
    res.status(201).json(db.prepare('SELECT * FROM guarantee_categories WHERE id=?').get(id));
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// ── Default / system templates ────────────────────────────────────────────────
const PAGARE_NOTARIAL_BODY = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @page { size: legal portrait; margin: 2cm 2.5cm 2.5cm 2.5cm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.7; color: #000; background: #fff; }
  .titulo { text-align: center; font-weight: bold; font-size: 14pt; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 2px; }
  .acto-num { text-align: center; font-size: 11pt; margin-bottom: 18px; }
  p { text-align: justify; margin-bottom: 10px; text-indent: 0; }
  .firmas { margin-top: 60px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px 40px; }
  .firma-bloque { text-align: center; }
  .firma-linea { border-top: 1px solid #000; margin: 0 auto 4px; width: 80%; }
  .firma-nombre { font-weight: bold; font-size: 10pt; text-transform: uppercase; }
  .firma-rol { font-size: 9pt; font-style: italic; }
  .notario-firma { text-align: center; margin-top: 40px; }
  @media print {
    html, body { width: 8.5in; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="titulo">Pagaré Notarial</div>
<div class="acto-num">ACTO NÚMERO ____________ (____), FOLIO NÚMERO ____________ (____)</div>

<p>En la Ciudad y Municipio de {{company_city}}, República Dominicana, hoy {{today_date_long}}. POR ANTE MÍ <strong>{{notary_name}}</strong>, Notario Público de los del Número para el Municipio de {{company_city}}, matriculado en el Colegio Dominicano de Notarios bajo el No. <strong>{{notary_collegiate_number}}</strong>, con estudio profesional abierto en {{notary_office_address}}.</p>

<p>COMPARECEN DE UNA PARTE, de manera libre y voluntariamente: <strong>{{representative_name}}</strong>, portador de la cédula de identidad y electoral número <strong>{{acreedor_id}}</strong>, domiciliado y residente en {{company_address}}, {{company_city}}; quien para los fines del presente acto se denominará <strong>EL ACREEDOR</strong>; y de LA OTRA PARTE <strong>{{client_name}}</strong>, portador de la cédula de identidad y electoral número <strong>{{client_id}}</strong>, domiciliado y residente en {{client_address}}, {{client_city}}; quien para los fines del presente acto se denominará <strong>EL DEUDOR O POR SUS PROPIOS NOMBRES</strong>.</p>

<p>Bajo la fe del juramento y en la presencia de los testigos; <strong>{{testigo1_nombre}}</strong>, persona a la cual identifico por la presentación que me hace de su cédula de identidad y electoral número <strong>{{testigo1_id}}</strong>, domiciliada y residente en {{testigo1_domicilio}}; <strong>{{testigo2_nombre}}</strong>, persona a la cual identifico por la presentación que me hace de su cédula de identidad y electoral número <strong>{{testigo2_id}}</strong>, domiciliada y residente en {{testigo2_domicilio}}; testigos libres de tachas y aptos para fungir como tales y <strong>ME DECLARAN LO SIGUIENTE:</strong></p>

<p><strong>PRIMERO:</strong> EL DEUDOR declara haber recibido de manos DEL ACREEDOR la suma de <strong>{{amount_words}}</strong>, moneda de curso legal, que pagará del capital, el interés de un <strong>{{rate_words}} por ciento ({{rate_pct}}%)</strong> de interés {{frequency_label}} de dicha cantidad, equivalente a <strong>{{installment_amount_words}}</strong>, {{frequency_label}} por concepto de deuda de préstamo personal;</p>

<p><strong>SEGUNDO:</strong> Dicha suma será pagada en un plazo de <strong>{{loan_term_words}} ({{loan_term}}) {{frequency_label}}</strong>, el cual vencerá el día <strong>{{maturity_date_long}}</strong>;</p>

<p><strong>TERCERO:</strong> EL DEUDOR pone en garantía todos los bienes muebles e inmuebles habidos y por haber;</p>

<p><strong>CUARTO:</strong> Las partes convienen y pactan las siguientes condiciones: <strong>a)</strong> El pago del capital adeudado tendrá lugar en la oficina del acreedor o en el domicilio acordado entre las partes; <strong>b)</strong> EL DEUDOR podrá liberarse de la totalidad o fracciones del monto adeudado antes del vencimiento de los plazos establecidos en este acto; <strong>c)</strong> EL ACREEDOR Y EL DEUDOR convienen que este acto tiene la fuerza ejecutoria establecida por el Artículo Quinientos Cuarenta y Cinco (545) del Código de Procedimiento Civil, que reza así: <em>"Tienen fuerza ejecutoria las primeras copias de las sentencias y otras decisiones judiciales y las de los actos notariales que contengan obligación de pagar cantidades de dinero, ya sea periódicamente o en época fija; así como las segundas o ulteriores copias de las mismas sentencias y actos que fueren expedidas en conformidad con la ley en sustitución de la primera. Párrafo.- Sin perjuicio de las demás atribuciones que les confieren las leyes, es obligación general de los representantes del ministerio público, de los alguaciles y de los funcionarios a quienes está encomendado el depósito de la fuerza pública a prestar su concurso para la ejecución de las sentencias y actos que conforme a este artículo estén investidos de fuerza ejecutoria, siempre que legalmente se les requiera a ello"</em>; y el Artículo Ochocientos Setenta y Siete (877) del Código Civil, el cual dice así: <em>"Los títulos ejecutivos contra el difunto, lo son también contra el heredero personalmente; pero los acreedores no podrán hacerlos ejecutar, sino ocho días después de la correspondiente notificación a la persona o en el domicilio del heredero"</em>.</p>

<p>Para los actos notariales que contengan obligación de pagar sumas de dinero, EL DEUDOR, una vez vencida la segunda cuota sin haber efectuado el pago de la misma, pudiéndose proceder al embargo ejecutivo de los bienes muebles e inmuebles habidos y por haber, perderá el beneficio del plazo del pago establecido para el pago de las restantes cuotas, y EL ACREEDOR podrá exigir el total del capital adeudado, más los intereses y el gasto de la ejecución del embargo y el pago de los honorarios de los abogados que en ello incurran, utilizando los establecimientos que la Ley pone a su disposición.</p>

<p>El presente acto ha sido pasado en mi estudio, en la fecha anteriormente señalada, el cual he leído a los comparecientes quienes después de aprobarlo, lo firman ante mí y junto conmigo Infrascrito Notario, tanto al pie como al margen de este acto. <strong>DE TODO LO CUAL DOY FE Y CERTIFICO.-</strong></p>

<div class="firmas">
  <div class="firma-bloque">
    <div class="firma-linea"></div>
    <div class="firma-nombre">{{representative_name}}</div>
    <div class="firma-rol">EL ACREEDOR</div>
  </div>
  <div class="firma-bloque">
    <div class="firma-linea"></div>
    <div class="firma-nombre">{{client_name}}</div>
    <div class="firma-rol">EL DEUDOR</div>
  </div>
  <div class="firma-bloque">
    <div class="firma-linea"></div>
    <div class="firma-nombre">{{testigo1_nombre}}</div>
    <div class="firma-rol">TESTIGO</div>
  </div>
  <div class="firma-bloque">
    <div class="firma-linea"></div>
    <div class="firma-nombre">{{testigo2_nombre}}</div>
    <div class="firma-rol">TESTIGO</div>
  </div>
</div>

<div class="notario-firma">
  <div class="firma-linea" style="width:50%; margin: 0 auto 4px;"></div>
  <div class="firma-nombre">{{notary_name}}</div>
  <div class="firma-rol">NOTARIO PÚBLICO</div>
</div>
</body>
</html>`;

const DEFAULT_TEMPLATES = [
  {
    key: 'pagare_notarial',
    name: 'Pagaré Notarial',
    type: 'pagare',
    description: 'Pagaré notarial para préstamos personales. Impresión en papel legal (8.5" × 14").',
    body: PAGARE_NOTARIAL_BODY,
  },
];

router.get('/default-templates', authenticate, requireTenant, requirePermission('templates.view'), (_req: AuthRequest, res: Response) => {
  res.json(DEFAULT_TEMPLATES.map(({ body: _b, ...meta }) => meta));
});

router.post('/default-templates/:key', authenticate, requireTenant, requirePermission('templates.edit'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const tpl = DEFAULT_TEMPLATES.find(t => t.key === req.params.key);
    if (!tpl) return res.status(404).json({ error: 'Plantilla no encontrada' });
    const id = uuid();
    db.prepare('INSERT INTO contract_templates (id,tenant_id,name,type,body,is_default) VALUES (?,?,?,?,?,0)')
      .run(id, req.tenant.id, tpl.name, tpl.type, tpl.body);
    res.status(201).json(db.prepare('SELECT * FROM contract_templates WHERE id=?').get(id));
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ─── PERMISSIONS ───────────────────────────────────────────────────────────────

// GET /settings/permissions-meta — all permission definitions + role defaults
router.get('/permissions-meta', authenticate, requireTenant, requirePermission('settings.users'), (req: AuthRequest, res: Response) => {
  try {
    res.json({ definitions: PERM_DEFS, roleDefaults: ROLE_DEFAULTS });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// GET /settings/users/:membershipId/permissions — get effective permissions for a member
router.get('/users/:membershipId/permissions', authenticate, requireTenant, requirePermission('settings.users'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    // Role hierarchy: only owner/admin can view others' permissions
    const requesterLevel = getRequesterRoleLevel(db, req.user.id, req.tenant.id);
    const membership = db.prepare('SELECT * FROM tenant_memberships WHERE id=? AND tenant_id=?').get(req.params.membershipId, req.tenant.id) as any;
    if (!membership) return res.status(404).json({ error: 'Membresía no encontrada' });
    if (req.user.id !== membership.user_id && requesterLevel < 3) {
      return res.status(403).json({ error: 'Sin permisos para ver configuración de este usuario' });
    }
    const roles: string[] = (() => { try { return JSON.parse(membership.roles || '[]') } catch(_) { return [] } })();
    const explicit: Record<string,boolean> = (() => { try { return JSON.parse(membership.permissions || '{}') } catch(_) { return {} } })();
    const effective = Array.from(computePermissions(roles, explicit));
    res.json({ roles, explicit, effective });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// PUT /settings/users/:membershipId/permissions — update explicit permissions for a member
router.put('/users/:membershipId/permissions', authenticate, requireTenant, requirePermission('settings.users'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const membership = db.prepare('SELECT * FROM tenant_memberships WHERE id=? AND tenant_id=?').get(req.params.membershipId, req.tenant.id) as any;
    if (!membership) return res.status(404).json({ error: 'Membresía no encontrada' });
    // Only owner (level 4) or admin (level 3) can change permissions
    const requesterLevel = getRequesterRoleLevel(db, req.user.id, req.tenant.id);
    if (requesterLevel < 3) {
      return res.status(403).json({ error: 'Solo administradores pueden modificar permisos' });
    }
    const explicit = req.body.explicit || req.body.permissions || {};
    // Validate that all keys are known PermKeys to prevent garbage data
    const validPermKeys = new Set(PERM_DEFS.map((p: any) => p.key));
    const invalidKeys = Object.keys(explicit).filter(k => !validPermKeys.has(k));
    if (invalidKeys.length > 0) {
      return res.status(400).json({ error: `Claves de permiso inválidas: ${invalidKeys.join(', ')}` });
    }
    // Validate that values are booleans
    const invalidValues = Object.entries(explicit).filter(([, v]) => typeof v !== 'boolean');
    if (invalidValues.length > 0) {
      return res.status(400).json({ error: 'Los valores de permisos deben ser booleanos (true/false)' });
    }
    db.prepare('UPDATE tenant_memberships SET permissions=?, updated_at=? WHERE id=? AND tenant_id=?')
      .run(JSON.stringify(explicit), now(), req.params.membershipId, req.tenant.id);
    const updated = db.prepare('SELECT * FROM tenant_memberships WHERE id=?').get(req.params.membershipId) as any;
    const roles2: string[] = JSON.parse(updated.roles || '[]');
    const explicit2: Record<string,boolean> = JSON.parse(updated.permissions || '{}');
    res.json({ permissions: explicit2, effective: Array.from(computePermissions(roles2, explicit2)) });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

export { router };

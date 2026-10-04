import { Router, Response } from 'express';
import { getDb, uuid } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';
import { resolveMoraConfig, validateMoraInput, materializeProductMora, parseInheritFlag, productHasCustomMora } from '../lib/moraConfig';

const router = Router();

// Mora efectiva con la que nacería un préstamo de este producto (producto personalizado, o la
// mora global si el producto la hereda). El frontend la usa para mostrar/precargar; la fuente de
// verdad al crear el préstamo sigue siendo resolveMoraConfig en el backend.
const withEffectiveMora = (db: any, tenantId: string, p: any) => {
  const custom = productHasCustomMora(p);
  const { sources, ...values } = resolveMoraConfig(db, tenantId, undefined, p);
  // Un producto que hereda no expone sus columnas mora_* históricas (0.001 / 3 del seed): no son suyas.
  const base = custom ? p : { ...p, mora_rate_daily: null, mora_grace_days: null, mora_base: null, mora_fixed_enabled: null, mora_fixed_amount: null };
  return {
    ...base,
    mora_inherit_tenant: custom ? 0 : 1,
    effective_mora: { ...values, source: custom ? 'product' : 'tenant' },
  };
};

router.get('/', authenticate, requireTenant, requirePermission('loans.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM loan_products WHERE tenant_id=? ORDER BY name').all(req.tenant.id) as any[];
    res.json(rows.map(p => withEffectiveMora(db, req.tenant.id, p)));
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// Mora GLOBAL vigente de la empresa (con constantes del sistema donde falte un valor válido): se muestra
// en el formulario de productos como referencia y se precarga al elegir "Personalizar".
router.get('/mora-defaults', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const { sources, ...values } = resolveMoraConfig(getDb(), req.tenant.id);
    res.json(values);
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/', authenticate, requireTenant, requirePermission('settings.products'), (req: AuthRequest, res: Response) => {
  try {
    const d = req.body; const db = getDb(); const id = uuid();
    // Normalize: frontend may send interestRate (-> interest_rate after snakify) or rate directly
    const rate = d.rate ?? d.interest_rate ?? null;
    const minAmount = d.min_amount ?? d.minAmount ?? null;
    const maxAmount = d.max_amount ?? d.maxAmount ?? null;
    const minTerm   = d.min_term   ?? d.minTerm   ?? null;
    const maxTerm   = d.max_term   ?? d.maxTerm   ?? null;
    if (rate === null || rate === undefined) return res.status(400).json({ error: 'La tasa de interes es requerida' });
    // Mora del producto: por defecto HEREDA la configuración general (sin valores propios). Solo si se pide
    // explícitamente personalizarla (mora_inherit_tenant = false) se guarda una política COMPLETA: los cinco
    // valores se validan y se materializan (lo no enviado se toma de la mora general vigente en este momento).
    const custom = parseInheritFlag(d.mora_inherit_tenant) === false;
    if (custom) {
      const moraErr = validateMoraInput(d);
      if (moraErr) return res.status(400).json({ error: moraErr });
    }
    const mora = custom ? materializeProductMora(db, req.tenant.id, d)
      : { mora_rate_daily: null, mora_grace_days: null, mora_base: null, mora_fixed_enabled: null, mora_fixed_amount: null };
    const code = d.code ?? null;
    db.prepare(`INSERT INTO loan_products (id,tenant_id,name,code,type,description,min_amount,max_amount,rate,rate_type,
      min_term,max_term,term_unit,payment_frequency,amortization_type,disbursement_fee,
      mora_inherit_tenant,mora_rate_daily,mora_grace_days,mora_base,mora_fixed_enabled,mora_fixed_amount,
      requires_guarantee,requires_approval,allows_prepayment,rebate_policy,is_san_type,is_reditos) VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, req.tenant.id, d.name, code, d.type, d.description||null,
      minAmount, maxAmount, rate, d.rate_type||'monthly',
      minTerm, maxTerm, d.term_unit||'months', d.payment_frequency||'monthly',
      d.amortization_type||'fixed_installment',
      d.disbursement_fee ?? 0,
      custom ? 0 : 1, mora.mora_rate_daily, mora.mora_grace_days, mora.mora_base, mora.mora_fixed_enabled, mora.mora_fixed_amount,
      d.requires_guarantee ? 1 : 0, d.requires_approval !== false ? 1 : 0,
      d.allows_prepayment !== false ? 1 : 0,
      d.rebate_policy||'proportional', d.is_san_type ? 1 : 0, d.is_reditos ? 1 : 0
    );
    res.status(201).json(withEffectiveMora(db, req.tenant.id, db.prepare('SELECT * FROM loan_products WHERE id=?').get(id)));
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.put('/:id', authenticate, requireTenant, requirePermission('settings.products'), (req: AuthRequest, res: Response) => {
  try {
    const d = req.body; const db = getDb();
    // Verificar que el producto pertenezca al tenant
    const existing = db.prepare('SELECT * FROM loan_products WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado' });

    // Normalizar campos: aceptar camelCase y snake_case, convertir undefined a null
    const norm = (v: any) => v === undefined ? null : v;
    const rate         = norm(d.rate ?? d.interest_rate ?? d.interestRate);
    const minAmount    = norm(d.min_amount ?? d.minAmount);
    const maxAmount    = norm(d.max_amount ?? d.maxAmount);
    const minTerm      = norm(d.min_term ?? d.minTerm);
    const maxTerm      = norm(d.max_term ?? d.maxTerm);
    const termUnit     = norm(d.term_unit ?? d.termUnit);
    const paymentFreq  = norm(d.payment_frequency ?? d.paymentFrequency);
    const amortType    = norm(d.amortization_type ?? d.amortizationType);
    const rateType     = norm(d.rate_type ?? d.rateType);
    const disbFee      = norm(d.disbursement_fee ?? d.disbursementFee);
    // Mora del producto: dos únicos estados.
    //  - HEREDAR (mora_inherit_tenant = true): se limpian los valores propios; todo se resuelve desde General.
    //  - PERSONALIZAR (mora_inherit_tenant = false): política COMPLETA. Se materializan y guardan los cinco valores
    //    (enviado > lo que el producto ya tenía > mora general vigente): Heredar -> Personalizar copia la general
    //    de ese momento; cambiar solo un campo conserva los demás propios. No hay herencia parcial.
    // Sin el flag, la mora no se toca; salvo que el producto YA sea personalizado y se envíen campos de mora
    // (se actualizan manteniendo la política completa). Se valida ANTES de escribir nada.
    const inheritReq = parseInheritFlag(d.mora_inherit_tenant);
    const existingCustom = productHasCustomMora(existing);
    const sendsMoraFields = ['mora_rate_daily', 'mora_grace_days', 'mora_base', 'mora_fixed_enabled', 'mora_fixed_amount'].some(k => d[k] !== undefined);
    const moraMode: 'inherit' | 'custom' | 'none' =
      inheritReq === true ? 'inherit'
      : (inheritReq === false || (inheritReq === null && existingCustom && sendsMoraFields)) ? 'custom'
      : 'none';
    if (moraMode === 'custom') {
      const moraErr = validateMoraInput(d);
      if (moraErr) return res.status(400).json({ error: moraErr });
    }
    const reqGuar      = d.requires_guarantee ?? d.requiresGuarantee;
    const reqApp       = d.requires_approval ?? d.requiresApproval;
    const allowPre     = d.allows_prepayment ?? d.allowsPrepayment;
    const rebPol       = norm(d.rebate_policy ?? d.rebatePolicy);
    const isSan        = d.is_san_type ?? d.isSanType;
    const isReditos    = d.is_reditos ?? d.isReditos;
    const isActive     = d.is_active ?? d.isActive;

    db.exec('BEGIN');
    try {
    db.prepare(`UPDATE loan_products SET
      name=COALESCE(?,name), code=COALESCE(?,code), type=COALESCE(?,type), description=COALESCE(?,description),
      min_amount=COALESCE(?,min_amount), max_amount=COALESCE(?,max_amount),
      rate=COALESCE(?,rate), rate_type=COALESCE(?,rate_type),
      min_term=COALESCE(?,min_term), max_term=COALESCE(?,max_term),
      term_unit=COALESCE(?,term_unit), payment_frequency=COALESCE(?,payment_frequency),
      amortization_type=COALESCE(?,amortization_type), disbursement_fee=COALESCE(?,disbursement_fee),
      requires_guarantee=COALESCE(?,requires_guarantee), requires_approval=COALESCE(?,requires_approval),
      allows_prepayment=COALESCE(?,allows_prepayment), rebate_policy=COALESCE(?,rebate_policy),
      is_san_type=COALESCE(?,is_san_type), is_reditos=COALESCE(?,is_reditos),
      is_active=COALESCE(?,is_active)
      WHERE id=? AND tenant_id=?`).run(
      norm(d.name), norm(d.code), norm(d.type), norm(d.description),
      minAmount, maxAmount,
      rate, rateType,
      minTerm, maxTerm,
      termUnit, paymentFreq,
      amortType, disbFee,
      reqGuar === undefined ? null : (reqGuar ? 1 : 0),
      reqApp === undefined ? null : (reqApp ? 1 : 0),
      allowPre === undefined ? null : (allowPre ? 1 : 0),
      rebPol,
      isSan === undefined ? null : (isSan ? 1 : 0),
      isReditos === undefined ? null : (isReditos ? 1 : 0),
      isActive === undefined ? null : (isActive ? 1 : 0),
      req.params.id, req.tenant.id
    );
    if (moraMode !== 'none') {
      const m = moraMode === 'inherit'
        ? { mora_rate_daily: null, mora_grace_days: null, mora_base: null, mora_fixed_enabled: null, mora_fixed_amount: null }
        : materializeProductMora(db, req.tenant.id, d, existing);
      db.prepare(`UPDATE loan_products SET mora_inherit_tenant=?, mora_rate_daily=?, mora_grace_days=?, mora_base=?,
        mora_fixed_enabled=?, mora_fixed_amount=? WHERE id=? AND tenant_id=?`).run(
        moraMode === 'inherit' ? 1 : 0, m.mora_rate_daily, m.mora_grace_days, m.mora_base, m.mora_fixed_enabled, m.mora_fixed_amount,
        req.params.id, req.tenant.id);
    }
    db.exec('COMMIT');
    } catch (txErr) { try { db.exec('ROLLBACK'); } catch (_) { /* noop */ } throw txErr; }
    res.json(withEffectiveMora(db, req.tenant.id, db.prepare('SELECT * FROM loan_products WHERE id=?').get(req.params.id)));
  } catch(e) {
    console.error('PUT /products/:id error:', e);
    res.status(500).json({ error: (e as any)?.message || 'Failed' });
  }
});

router.delete('/:id', authenticate, requireTenant, requirePermission('settings.products'), (req: AuthRequest, res: Response) => {
  try {
    getDb().prepare('UPDATE loan_products SET is_active=0 WHERE id=?').run(req.params.id);
    res.json({ message: 'Producto desactivado' });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

export default router;

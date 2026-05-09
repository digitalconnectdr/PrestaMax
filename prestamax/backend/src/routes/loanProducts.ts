import { Router, Response } from 'express';
import { getDb, uuid } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, requireTenant, requirePermission('loans.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM loan_products WHERE tenant_id=? ORDER BY name').all(req.tenant.id));
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
    const code = d.code ?? null;
    db.prepare(`INSERT INTO loan_products (id,tenant_id,name,code,type,description,min_amount,max_amount,rate,rate_type,
      min_term,max_term,term_unit,payment_frequency,amortization_type,disbursement_fee,mora_rate_daily,mora_grace_days,
      requires_guarantee,requires_approval,allows_prepayment,rebate_policy,is_san_type,is_reditos) VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, req.tenant.id, d.name, code, d.type, d.description||null,
      minAmount, maxAmount, rate, d.rate_type||'monthly',
      minTerm, maxTerm, d.term_unit||'months', d.payment_frequency||'monthly',
      d.amortization_type||'fixed_installment',
      d.disbursement_fee ?? 0, d.mora_rate_daily ?? null, d.mora_grace_days ?? null,
      d.requires_guarantee ? 1 : 0, d.requires_approval !== false ? 1 : 0,
      d.allows_prepayment !== false ? 1 : 0,
      d.rebate_policy||'proportional', d.is_san_type ? 1 : 0, d.is_reditos ? 1 : 0
    );
    res.status(201).json(db.prepare('SELECT * FROM loan_products WHERE id=?').get(id));
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.put('/:id', authenticate, requireTenant, requirePermission('settings.products'), (req: AuthRequest, res: Response) => {
  try {
    const d = req.body; const db = getDb();
    // Verificar que el producto pertenezca al tenant
    const existing = db.prepare('SELECT id FROM loan_products WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
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
    const moraRate     = norm(d.mora_rate_daily ?? d.moraRateDaily);
    const moraGrace    = norm(d.mora_grace_days ?? d.moraGraceDays);
    const disbFee      = norm(d.disbursement_fee ?? d.disbursementFee);
    const reqGuar      = d.requires_guarantee ?? d.requiresGuarantee;
    const reqApp       = d.requires_approval ?? d.requiresApproval;
    const allowPre     = d.allows_prepayment ?? d.allowsPrepayment;
    const rebPol       = norm(d.rebate_policy ?? d.rebatePolicy);
    const isSan        = d.is_san_type ?? d.isSanType;
    const isReditos    = d.is_reditos ?? d.isReditos;
    const isActive     = d.is_active ?? d.isActive;

    db.prepare(`UPDATE loan_products SET
      name=COALESCE(?,name), code=COALESCE(?,code), type=COALESCE(?,type), description=COALESCE(?,description),
      min_amount=COALESCE(?,min_amount), max_amount=COALESCE(?,max_amount),
      rate=COALESCE(?,rate), rate_type=COALESCE(?,rate_type),
      min_term=COALESCE(?,min_term), max_term=COALESCE(?,max_term),
      term_unit=COALESCE(?,term_unit), payment_frequency=COALESCE(?,payment_frequency),
      amortization_type=COALESCE(?,amortization_type), disbursement_fee=COALESCE(?,disbursement_fee),
      mora_rate_daily=COALESCE(?,mora_rate_daily), mora_grace_days=COALESCE(?,mora_grace_days),
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
      moraRate, moraGrace,
      reqGuar === undefined ? null : (reqGuar ? 1 : 0),
      reqApp === undefined ? null : (reqApp ? 1 : 0),
      allowPre === undefined ? null : (allowPre ? 1 : 0),
      rebPol,
      isSan === undefined ? null : (isSan ? 1 : 0),
      isReditos === undefined ? null : (isReditos ? 1 : 0),
      isActive === undefined ? null : (isActive ? 1 : 0),
      req.params.id, req.tenant.id
    );
    res.json(db.prepare('SELECT * FROM loan_products WHERE id=?').get(req.params.id));
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

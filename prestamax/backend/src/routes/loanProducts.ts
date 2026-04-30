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
    // Normalize: frontend may send interestRate (→ interest_rate after snakify) or rate directly
    const rate = d.rate ?? d.interest_rate ?? null;
    const minAmount = d.min_amount ?? d.minAmount ?? null;
    const maxAmount = d.max_amount ?? d.maxAmount ?? null;
    const minTerm   = d.min_term   ?? d.minTerm   ?? null;
    const maxTerm   = d.max_term   ?? d.maxTerm   ?? null;
    if (rate === null || rate === undefined) return res.status(400).json({ error: 'La tasa de interés es requerida' });
    db.prepare(`INSERT INTO loan_products (id,tenant_id,name,type,description,min_amount,max_amount,rate,rate_type,
      min_term,max_term,term_unit,payment_frequency,amortization_type,disbursement_fee,mora_rate_daily,mora_grace_days,
      requires_guarantee,requires_approval,allows_prepayment,rebate_policy,is_san_type,is_reditos) VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id, req.tenant.id, d.name, d.type, d.description||null,
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
    db.prepare(`UPDATE loan_products SET name=COALESCE(?,name), description=COALESCE(?,description),
      min_amount=COALESCE(?,min_amount), max_amount=COALESCE(?,max_amount), rate=COALESCE(?,rate),
      payment_frequency=COALESCE(?,payment_frequency), is_active=COALESCE(?,is_active) WHERE id=?`).run(
      d.name,d.description,d.min_amount,d.max_amount,d.rate,d.payment_frequency,d.is_active,req.params.id
    );
    res.json(db.prepare('SELECT * FROM loan_products WHERE id=?').get(req.params.id));
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.delete('/:id', authenticate, requireTenant, requirePermission('settings.products'), (req: AuthRequest, res: Response) => {
  try {
    getDb().prepare('UPDATE loan_products SET is_active=0 WHERE id=?').run(req.params.id);
    res.json({ message: 'Producto desactivado' });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

export default router;

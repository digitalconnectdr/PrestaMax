import { Router, Response } from 'express';
import { getDb, uuid, now, r2 } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── GET /api/investors — lista de inversionistas del tenant ──────────────────
router.get('/', authenticate, requireTenant, requirePermission('investors.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { status } = req.query as any;
    let where = 'WHERE tenant_id=?';
    const params: any[] = [req.tenant.id];
    if (status === 'active')   { where += ' AND is_active=1'; }
    if (status === 'inactive') { where += ' AND is_active=0'; }
    // Enriquecer con conteo de prestamos y total invertido
    const rows = db.prepare(`
      SELECT i.*,
        (SELECT COUNT(*) FROM loans l WHERE l.investor_id=i.id AND l.tenant_id=?) AS loan_count,
        (SELECT COALESCE(SUM(l.disbursed_amount),0) FROM loans l WHERE l.investor_id=i.id AND l.tenant_id=? AND l.status IN ('active','in_mora','disbursed','restructured')) AS active_capital
      FROM investors i
      ${where}
      ORDER BY i.created_at DESC
    `).all(req.tenant.id, req.tenant.id, ...params);
    res.json(rows);
  } catch (e: any) {
    console.error('GET /investors error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── POST /api/investors — crear inversionista ───────────────────────────────
router.post('/', authenticate, requireTenant, requirePermission('investors.create'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const d = req.body;
    if (!d.fullName && !d.full_name) return res.status(400).json({ error: 'Nombre completo es requerido' });
    const id = uuid();
    db.prepare(`INSERT INTO investors (
      id, tenant_id, full_name, email, phone, id_number,
      model_type, fixed_rate_monthly, equity_percent_interest, commission_percent,
      capital_contributed, notes, is_active, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,datetime('now'),datetime('now'))`).run(
      id, req.tenant.id,
      d.fullName || d.full_name,
      d.email || null,
      d.phone || null,
      d.idNumber || d.id_number || null,
      d.modelType || d.model_type || 'fixed_rate',
      parseFloat(d.fixedRateMonthly || d.fixed_rate_monthly || 0),
      parseFloat(d.equityPercentInterest || d.equity_percent_interest || 0),
      parseFloat(d.commissionPercent || d.commission_percent || 0),
      parseFloat(d.capitalContributed || d.capital_contributed || 0),
      d.notes || null
    );
    res.status(201).json(db.prepare('SELECT * FROM investors WHERE id=?').get(id));
  } catch (e: any) {
    console.error('POST /investors error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── PUT /api/investors/:id — actualizar inversionista ───────────────────────
router.put('/:id', authenticate, requireTenant, requirePermission('investors.edit'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM investors WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!existing) return res.status(404).json({ error: 'Inversionista no encontrado' });

    const d = req.body;
    const norm = (v: any) => v === undefined ? null : v;

    db.prepare(`UPDATE investors SET
      full_name = COALESCE(?, full_name),
      email = COALESCE(?, email),
      phone = COALESCE(?, phone),
      id_number = COALESCE(?, id_number),
      model_type = COALESCE(?, model_type),
      fixed_rate_monthly = COALESCE(?, fixed_rate_monthly),
      equity_percent_interest = COALESCE(?, equity_percent_interest),
      commission_percent = COALESCE(?, commission_percent),
      capital_contributed = COALESCE(?, capital_contributed),
      notes = COALESCE(?, notes),
      is_active = COALESCE(?, is_active),
      updated_at = ?
      WHERE id=? AND tenant_id=?`).run(
      norm(d.fullName ?? d.full_name),
      norm(d.email),
      norm(d.phone),
      norm(d.idNumber ?? d.id_number),
      norm(d.modelType ?? d.model_type),
      d.fixedRateMonthly !== undefined || d.fixed_rate_monthly !== undefined ? parseFloat(d.fixedRateMonthly ?? d.fixed_rate_monthly) : null,
      d.equityPercentInterest !== undefined || d.equity_percent_interest !== undefined ? parseFloat(d.equityPercentInterest ?? d.equity_percent_interest) : null,
      d.commissionPercent !== undefined || d.commission_percent !== undefined ? parseFloat(d.commissionPercent ?? d.commission_percent) : null,
      d.capitalContributed !== undefined || d.capital_contributed !== undefined ? parseFloat(d.capitalContributed ?? d.capital_contributed) : null,
      norm(d.notes),
      d.isActive !== undefined ? (d.isActive ? 1 : 0) : (d.is_active !== undefined ? (d.is_active ? 1 : 0) : null),
      now(), req.params.id, req.tenant.id
    );
    res.json(db.prepare('SELECT * FROM investors WHERE id=?').get(req.params.id));
  } catch (e: any) {
    console.error('PUT /investors/:id error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── DELETE /api/investors/:id — desactivar (soft delete) ────────────────────
router.delete('/:id', authenticate, requireTenant, requirePermission('investors.delete'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    db.prepare('UPDATE investors SET is_active=0, updated_at=? WHERE id=? AND tenant_id=?')
      .run(now(), req.params.id, req.tenant.id);
    res.json({ success: true });
  } catch (e: any) {
    console.error('DELETE /investors/:id error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── GET /api/investors/:id — detalle con prestamos asignados ────────────────
router.get('/:id', authenticate, requireTenant, requirePermission('investors.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const investor = db.prepare('SELECT * FROM investors WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!investor) return res.status(404).json({ error: 'Inversionista no encontrado' });

    const loans = db.prepare(`
      SELECT l.id, l.loan_number, l.status, l.disbursed_amount, l.principal_balance,
        l.interest_balance, l.mora_balance, l.total_balance, l.disbursement_date,
        l.maturity_date, l.currency, c.full_name AS client_name
      FROM loans l
      JOIN clients c ON c.id=l.client_id
      WHERE l.investor_id=? AND l.tenant_id=?
      ORDER BY l.disbursement_date DESC
    `).all(req.params.id, req.tenant.id);

    res.json({ ...investor, loans });
  } catch (e: any) {
    console.error('GET /investors/:id error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── POST /api/investors/:id/assign-loan — asignar prestamo a inversionista ─
router.post('/:id/assign-loan', authenticate, requireTenant, requirePermission('investors.assign'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    // El interceptor del frontend convierte camelCase a snake_case en el body, asi que aceptamos ambos
    const loanId = req.body.loanId ?? req.body.loan_id;
    if (!loanId) return res.status(400).json({ error: 'loanId requerido' });

    // Validar que el inversionista y el prestamo pertenezcan al tenant
    const investor = db.prepare('SELECT id FROM investors WHERE id=? AND tenant_id=? AND is_active=1').get(req.params.id, req.tenant.id);
    if (!investor) return res.status(404).json({ error: 'Inversionista no encontrado o inactivo' });
    const loan = db.prepare('SELECT id FROM loans WHERE id=? AND tenant_id=?').get(loanId, req.tenant.id);
    if (!loan) return res.status(404).json({ error: 'Prestamo no encontrado' });

    db.prepare('UPDATE loans SET investor_id=? WHERE id=? AND tenant_id=?').run(req.params.id, loanId, req.tenant.id);
    res.json({ success: true });
  } catch (e: any) {
    console.error('POST /investors/:id/assign-loan error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── POST /api/investors/:id/unassign-loan — quitar prestamo del inversionista ─
router.post('/:id/unassign-loan', authenticate, requireTenant, requirePermission('investors.assign'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    // El interceptor del frontend convierte camelCase a snake_case en el body, asi que aceptamos ambos
    const loanId = req.body.loanId ?? req.body.loan_id;
    if (!loanId) return res.status(400).json({ error: 'loanId requerido' });
    db.prepare('UPDATE loans SET investor_id=NULL WHERE id=? AND tenant_id=? AND investor_id=?')
      .run(loanId, req.tenant.id, req.params.id);
    res.json({ success: true });
  } catch (e: any) {
    console.error('POST /investors/:id/unassign-loan error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── GET /api/investors/:id/liquidation-report — reporte de corte ────────────
// Suma intereses de pagos hechos en el rango de fechas para prestamos
// asignados a este inversionista. Resta comision por administracion.
router.get('/:id/liquidation-report', authenticate, requireTenant, requirePermission('investors.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const investor = db.prepare('SELECT * FROM investors WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!investor) return res.status(404).json({ error: 'Inversionista no encontrado' });

    const from = req.query.from as string || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to   = req.query.to as string   || new Date().toISOString().slice(0, 10);

    // Pagos validos (no anulados) en el rango, sobre prestamos de este inversionista
    const payments = db.prepare(`
      SELECT p.id, p.amount, p.applied_capital, p.applied_interest, p.applied_mora,
             p.payment_date, l.loan_number, l.id as loan_id
      FROM payments p
      JOIN loans l ON l.id=p.loan_id
      WHERE p.tenant_id=? AND p.is_voided=0
        AND l.investor_id=?
        AND date(p.payment_date) >= date(?)
        AND date(p.payment_date) <= date(?)
      ORDER BY p.payment_date ASC
    `).all(req.tenant.id, req.params.id, from, to) as any[];

    const totalInterest = r2(payments.reduce((s, p) => s + (p.applied_interest || 0), 0));
    const totalCapital  = r2(payments.reduce((s, p) => s + (p.applied_capital  || 0), 0));
    const totalMora     = r2(payments.reduce((s, p) => s + (p.applied_mora     || 0), 0));
    const totalGross    = r2(totalInterest + totalMora);

    // Comision del prestamista por administracion (sobre interes + mora cobrados)
    const commissionPct = parseFloat(investor.commission_percent) || 0;
    const commission    = r2(totalGross * (commissionPct / 100));
    const toInvestor    = r2(totalGross - commission);

    // Prestamos activos del inversionista a la fecha
    const activeLoans = db.prepare(`
      SELECT COUNT(*) as n, COALESCE(SUM(principal_balance),0) as outstanding
      FROM loans WHERE investor_id=? AND tenant_id=? AND status IN ('active','in_mora','disbursed','restructured')
    `).get(req.params.id, req.tenant.id) as any;

    res.json({
      investor_id: req.params.id,
      investor_name: investor.full_name,
      from, to,
      payments_count: payments.length,
      totals: {
        gross_interest:    totalInterest,
        gross_mora:        totalMora,
        gross_capital:     totalCapital,
        gross_total:       totalGross,
        commission_percent: commissionPct,
        commission_amount: commission,
        net_to_investor:   toInvestor,
      },
      active_loans: {
        count: activeLoans?.n || 0,
        outstanding_principal: r2(activeLoans?.outstanding || 0),
      },
      payments,
    });
  } catch (e: any) {
    console.error('GET /investors/:id/liquidation-report error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

export default router;

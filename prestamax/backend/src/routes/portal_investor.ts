import { Router, Response, NextFunction } from 'express';
import { getDb, r2 } from '../db/database';
import { authenticate, requireTenant, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── Middleware: el user debe ser un inversionista vinculado en este tenant ──
// Carga req.investor con el inversionista correspondiente y solo deja pasar
// si:
//   1. el user tiene rol 'investor' en este tenant
//   2. existe una fila en investors con user_id = req.user.id y tenant_id = req.tenant.id
function requireInvestor(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const db = getDb();
    const membership = db.prepare('SELECT roles FROM tenant_memberships WHERE user_id=? AND tenant_id=? AND is_active=1')
      .get(req.user!.id, req.tenant!.id) as any;
    if (!membership) return res.status(403).json({ error: 'No tienes acceso a este tenant' });
    const roles: string[] = (() => { try { return JSON.parse(membership.roles || '[]') } catch { return [] } })();
    if (!roles.includes('investor')) return res.status(403).json({ error: 'Acceso solo para inversionistas' });

    const investor = db.prepare('SELECT * FROM investors WHERE user_id=? AND tenant_id=? AND is_active=1')
      .get(req.user!.id, req.tenant!.id) as any;
    if (!investor) return res.status(404).json({ error: 'Cuenta de inversionista no encontrada o inactiva' });

    (req as any).investor = investor;
    next();
  } catch (e: any) {
    console.error('requireInvestor error:', e);
    res.status(500).json({ error: 'Failed' });
  }
}

// ─── GET /api/portal/investor/me — datos del inversionista logueado ──────────
// Devuelve solo los campos que el inversionista necesita ver de si mismo.
router.get('/me', authenticate, requireTenant, requireInvestor, (req: AuthRequest, res: Response) => {
  const inv = (req as any).investor;
  res.json({
    id: inv.id,
    fullName: inv.full_name,
    email: inv.email,
    phone: inv.phone,
    modelType: inv.model_type,
    fixedRateMonthly: inv.fixed_rate_monthly,
    equityPercentInterest: inv.equity_percent_interest,
    commissionPercent: inv.commission_percent,
    capitalContributed: inv.capital_contributed,
  });
});

// ─── GET /api/portal/investor/summary — KPIs del dashboard ──────────────────
router.get('/summary', authenticate, requireTenant, requireInvestor, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const inv = (req as any).investor;

    // Capital colocado actual (suma de principal_balance de loans activos)
    const capCol = (db.prepare(`
      SELECT COALESCE(SUM(principal_balance), 0) as v, COUNT(*) as n
      FROM loans
      WHERE investor_id=? AND tenant_id=?
        AND status IN ('active','in_mora','disbursed','restructured')
    `).get(inv.id, req.tenant!.id) as any);

    // Intereses + mora cobrados acumulados (lifetime) sobre pagos del inversionista
    const lifetime = (db.prepare(`
      SELECT
        COALESCE(SUM(p.applied_interest), 0) as interest,
        COALESCE(SUM(p.applied_mora), 0) as mora,
        COUNT(*) as payments
      FROM payments p
      JOIN loans l ON l.id=p.loan_id
      WHERE p.tenant_id=? AND p.is_voided=0
        AND l.investor_id=?
    `).get(req.tenant!.id, inv.id) as any);

    const lifetimeGross = r2((lifetime.interest || 0) + (lifetime.mora || 0));
    const commissionPct = parseFloat(inv.commission_percent) || 0;
    const lifetimeCommission = r2(lifetimeGross * (commissionPct / 100));
    const lifetimeNet = r2(lifetimeGross - lifetimeCommission);

    // Total ya recibido en payouts pagados
    const paidOut = (db.prepare(`
      SELECT COALESCE(SUM(net_amount), 0) as v, COUNT(*) as n
      FROM investor_payouts
      WHERE investor_id=? AND tenant_id=? AND status='paid'
    `).get(inv.id, req.tenant!.id) as any);

    res.json({
      capital: {
        active_balance: r2(capCol.v),
        active_loans: capCol.n,
        contributed: parseFloat(inv.capital_contributed) || 0,
      },
      lifetime: {
        gross_interest: r2(lifetime.interest || 0),
        gross_mora: r2(lifetime.mora || 0),
        gross_total: lifetimeGross,
        commission_amount: lifetimeCommission,
        net_earned: lifetimeNet,
        payments_count: lifetime.payments,
      },
      received: {
        total_payouts_amount: r2(paidOut.v),
        total_payouts_count: paidOut.n,
        pending: r2(lifetimeNet - paidOut.v),
      },
    });
  } catch (e: any) {
    console.error('GET /portal/investor/summary error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── GET /api/portal/investor/loans — prestamos asignados (muralla china) ───
// Expone: numero, monto desembolsado, balance, estado, fecha, nombre del cliente.
// NO expone: cedula, telefono, direccion, score, etc.
router.get('/loans', authenticate, requireTenant, requireInvestor, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const inv = (req as any).investor;
    const rows = db.prepare(`
      SELECT l.id, l.loan_number, l.status,
             l.disbursed_amount, l.principal_balance, l.interest_balance,
             l.mora_balance, l.total_balance, l.total_paid,
             l.currency, l.disbursement_date, l.maturity_date,
             l.days_overdue,
             c.full_name AS client_name
      FROM loans l
      JOIN clients c ON c.id=l.client_id
      WHERE l.investor_id=? AND l.tenant_id=?
      ORDER BY l.disbursement_date DESC
    `).all(inv.id, req.tenant!.id);
    res.json(rows);
  } catch (e: any) {
    console.error('GET /portal/investor/loans error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── GET /api/portal/investor/payouts — historial de liquidaciones ──────────
router.get('/payouts', authenticate, requireTenant, requireInvestor, (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const inv = (req as any).investor;
    const rows = db.prepare(`
      SELECT p.id, p.period_from, p.period_to, p.payments_count,
             p.gross_interest, p.gross_mora, p.gross_total,
             p.commission_percent, p.commission_amount, p.net_amount,
             p.paid_at, p.payment_method, p.reference, p.status,
             b.bank_name
      FROM investor_payouts p
      LEFT JOIN bank_accounts b ON b.id=p.bank_account_id
      WHERE p.investor_id=? AND p.tenant_id=? AND p.status='paid'
      ORDER BY p.paid_at DESC
    `).all(inv.id, req.tenant!.id);
    res.json(rows);
  } catch (e: any) {
    console.error('GET /portal/investor/payouts error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

export default router;

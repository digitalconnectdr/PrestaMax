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
    const rows = db.prepare(`
      SELECT i.*,
        (SELECT COUNT(*) FROM loans l WHERE l.investor_id=i.id AND l.tenant_id=?) AS loan_count,
        (SELECT COALESCE(SUM(l.principal_balance),0) FROM loans l WHERE l.investor_id=i.id AND l.tenant_id=? AND l.status IN ('active','in_mora','disbursed','restructured')) AS active_capital
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

// ─── POST /api/investors — crear inversionista ──────────────────────────────
router.post('/', authenticate, requireTenant, requirePermission('investors.create'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const d = req.body || {};
    if (!d.fullName && !d.full_name) return res.status(400).json({ error: 'fullName es requerido' });
    const id = uuid();
    db.prepare(`INSERT INTO investors (
      id, tenant_id, full_name, email, phone, id_number,
      model_type, fixed_rate_monthly, equity_percent_interest, commission_percent,
      capital_contributed, notes
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
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

// ─── PUT /api/investors/:id — actualizar inversionista ──────────────────────
router.put('/:id', authenticate, requireTenant, requirePermission('investors.edit'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const inv = db.prepare('SELECT id FROM investors WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id);
    if (!inv) return res.status(404).json({ error: 'Inversionista no encontrado' });
    const d = req.body || {};
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
      updated_at = datetime('now')
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
      req.params.id, req.tenant.id
    );
    res.json(db.prepare('SELECT * FROM investors WHERE id=?').get(req.params.id));
  } catch (e: any) {
    console.error('PUT /investors/:id error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── DELETE /api/investors/:id — desactivar inversionista (soft) ────────────
router.delete('/:id', authenticate, requireTenant, requirePermission('investors.delete'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const inv = db.prepare('SELECT id FROM investors WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id);
    if (!inv) return res.status(404).json({ error: 'Inversionista no encontrado' });
    db.prepare("UPDATE investors SET is_active=0, updated_at=datetime('now') WHERE id=?").run(req.params.id);
    res.json({ success: true });
  } catch (e: any) {
    console.error('DELETE /investors/:id error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── GET /api/investors/:id — detalle + prestamos asignados ─────────────────
router.get('/:id', authenticate, requireTenant, requirePermission('investors.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const investor = db.prepare('SELECT * FROM investors WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id);
    if (!investor) return res.status(404).json({ error: 'Inversionista no encontrado' });
    const loans = db.prepare(`
      SELECT l.id, l.loan_number, l.status, l.disbursed_amount, l.principal_balance,
             l.interest_balance, l.mora_balance, l.total_balance, l.currency,
             l.disbursement_date, l.maturity_date,
             c.full_name AS client_name
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
// Por defecto excluye pagos que YA fueron liquidados en un payout previo,
// para evitar doble pago. Use ?includeLiquidated=1 para auditoria historica.
router.get('/:id/liquidation-report', authenticate, requireTenant, requirePermission('investors.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const investor = db.prepare('SELECT * FROM investors WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!investor) return res.status(404).json({ error: 'Inversionista no encontrado' });

    const from = req.query.from as string || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to   = req.query.to as string   || new Date().toISOString().slice(0, 10);
    const includeLiquidated = req.query.includeLiquidated === '1' || req.query.include_liquidated === '1';

    const liquidatedClause = includeLiquidated ? '' : ' AND p.liquidated_in_payout_id IS NULL';
    const payments = db.prepare(`
      SELECT p.id, p.amount, p.applied_capital, p.applied_interest, p.applied_mora,
             p.payment_date, p.liquidated_in_payout_id,
             l.loan_number, l.id as loan_id
      FROM payments p
      JOIN loans l ON l.id=p.loan_id
      WHERE p.tenant_id=? AND p.is_voided=0
        AND l.investor_id=?
        AND date(p.payment_date) >= date(?)
        AND date(p.payment_date) <= date(?)
        ${liquidatedClause}
      ORDER BY p.payment_date ASC
    `).all(req.tenant.id, req.params.id, from, to) as any[];

    const totalInterest = r2(payments.reduce((s, p) => s + (p.applied_interest || 0), 0));
    const totalCapital  = r2(payments.reduce((s, p) => s + (p.applied_capital  || 0), 0));
    const totalMora     = r2(payments.reduce((s, p) => s + (p.applied_mora     || 0), 0));
    const totalGross    = r2(totalInterest + totalMora);

    const commissionPct = parseFloat(investor.commission_percent) || 0;
    const commission    = r2(totalGross * (commissionPct / 100));
    const toInvestor    = r2(totalGross - commission);

    const activeLoans = db.prepare(`
      SELECT COUNT(*) as n, COALESCE(SUM(principal_balance),0) as outstanding
      FROM loans WHERE investor_id=? AND tenant_id=? AND status IN ('active','in_mora','disbursed','restructured')
    `).get(req.params.id, req.tenant.id) as any;

    const lastPayout = db.prepare(`
      SELECT id, period_from, period_to, net_amount, paid_at
      FROM investor_payouts
      WHERE investor_id=? AND tenant_id=? AND status='paid'
      ORDER BY paid_at DESC LIMIT 1
    `).get(req.params.id, req.tenant.id);

    res.json({
      investor_id: req.params.id,
      investor_name: investor.full_name,
      from, to,
      includeLiquidated,
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
      last_payout: lastPayout,
      payments,
    });
  } catch (e: any) {
    console.error('GET /investors/:id/liquidation-report error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── POST /api/investors/:id/payouts — registrar liquidacion (Fase 1.5) ──────
// Crea un payout, marca los pagos involucrados como liquidados, registra
// el egreso en income_expenses, y descuenta de la cuenta bancaria si aplica.
router.post('/:id/payouts', authenticate, requireTenant, requirePermission('investors.payouts'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  try {
    const investor = db.prepare('SELECT * FROM investors WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!investor) return res.status(404).json({ error: 'Inversionista no encontrado' });

    const d = req.body || {};
    const from = d.from || d.period_from;
    const to   = d.to   || d.period_to;
    if (!from || !to) return res.status(400).json({ error: 'from y to son requeridos' });

    const bankAccountId = d.bankAccountId || d.bank_account_id || null;
    const paymentMethod = d.paymentMethod || d.payment_method || 'bank_transfer';
    const reference     = d.reference || null;
    const notes         = d.notes || null;

    const pendingPayments = db.prepare(`
      SELECT p.id, p.applied_capital, p.applied_interest, p.applied_mora
      FROM payments p
      JOIN loans l ON l.id=p.loan_id
      WHERE p.tenant_id=? AND p.is_voided=0
        AND l.investor_id=?
        AND date(p.payment_date) >= date(?)
        AND date(p.payment_date) <= date(?)
        AND p.liquidated_in_payout_id IS NULL
    `).all(req.tenant.id, req.params.id, from, to) as any[];

    if (pendingPayments.length === 0) {
      return res.status(400).json({ error: 'No hay pagos pendientes de liquidar en ese rango' });
    }

    const grossInterest = r2(pendingPayments.reduce((s, p) => s + (p.applied_interest || 0), 0));
    const grossMora     = r2(pendingPayments.reduce((s, p) => s + (p.applied_mora     || 0), 0));
    const grossCapital  = r2(pendingPayments.reduce((s, p) => s + (p.applied_capital  || 0), 0));
    const grossTotal    = r2(grossInterest + grossMora);
    const commissionPct = parseFloat(investor.commission_percent) || 0;
    const commissionAmt = r2(grossTotal * (commissionPct / 100));
    const netAmount     = r2(grossTotal - commissionAmt);

    if (netAmount <= 0) {
      return res.status(400).json({ error: 'El monto neto a entregar es cero o negativo' });
    }

    const payoutId = uuid();
    const incomeId = uuid();
    const paidAt   = d.paidAt || d.paid_at || now();

    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO investor_payouts (
          id, tenant_id, investor_id, period_from, period_to, payments_count,
          gross_interest, gross_mora, gross_capital, gross_total,
          commission_percent, commission_amount, net_amount,
          paid_at, paid_by, payment_method, bank_account_id, reference, notes,
          status, income_expense_id
        ) VALUES (?,?,?,?,?,?, ?,?,?,?, ?,?,?, ?,?,?,?,?,?, 'paid', ?)
      `).run(
        payoutId, req.tenant.id, req.params.id, from, to, pendingPayments.length,
        grossInterest, grossMora, grossCapital, grossTotal,
        commissionPct, commissionAmt, netAmount,
        paidAt, req.user.id, paymentMethod, bankAccountId, reference, notes,
        incomeId
      );

      const updatePayment = db.prepare('UPDATE payments SET liquidated_in_payout_id=? WHERE id=? AND tenant_id=?');
      for (const p of pendingPayments) {
        updatePayment.run(payoutId, p.id, req.tenant.id);
      }

      const description = `Liquidacion a ${investor.full_name} (${from} a ${to})`;
      db.prepare(`
        INSERT INTO income_expenses (
          id, tenant_id, branch_id, registered_by, type, category, description,
          amount, transaction_date, payment_method, bank_account_id, reference, notes
        ) VALUES (?,?,?,?,'expense','investor_payout',?,?,?,?,?,?,?)
      `).run(
        incomeId, req.tenant.id, null, req.user.id, description,
        netAmount, paidAt, paymentMethod, bankAccountId,
        reference || `payout:${payoutId}`,
        notes
      );

      if (bankAccountId) {
        const bankAcc = db.prepare('SELECT id FROM bank_accounts WHERE id=? AND tenant_id=? AND is_active=1').get(bankAccountId, req.tenant.id);
        if (bankAcc) {
          db.prepare('UPDATE bank_accounts SET current_balance=MAX(0,current_balance-?) WHERE id=?').run(netAmount, bankAccountId);
        }
      }
      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    const created = db.prepare('SELECT * FROM investor_payouts WHERE id=?').get(payoutId);
    res.status(201).json(created);
  } catch (e: any) {
    console.error('POST /investors/:id/payouts error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── GET /api/investors/:id/payouts — historial de payouts del inversionista ─
router.get('/:id/payouts', authenticate, requireTenant, requirePermission('investors.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT p.*, u.full_name as paid_by_name, b.bank_name, b.account_number
      FROM investor_payouts p
      LEFT JOIN users u ON u.id=p.paid_by
      LEFT JOIN bank_accounts b ON b.id=p.bank_account_id
      WHERE p.investor_id=? AND p.tenant_id=?
      ORDER BY p.paid_at DESC
    `).all(req.params.id, req.tenant.id);
    res.json(rows);
  } catch (e: any) {
    console.error('GET /investors/:id/payouts error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

// ─── POST /api/investors/payouts/:payoutId/void — anular un payout ──────────
router.post('/payouts/:payoutId/void', authenticate, requireTenant, requirePermission('investors.payouts'), (req: AuthRequest, res: Response) => {
  const db = getDb();
  try {
    const payout = db.prepare('SELECT * FROM investor_payouts WHERE id=? AND tenant_id=?').get(req.params.payoutId, req.tenant.id) as any;
    if (!payout) return res.status(404).json({ error: 'Payout no encontrado' });
    if (payout.status !== 'paid') return res.status(400).json({ error: 'Solo se puede anular un payout en estado paid' });

    db.exec('BEGIN');
    try {
      db.prepare('UPDATE payments SET liquidated_in_payout_id=NULL WHERE liquidated_in_payout_id=? AND tenant_id=?').run(payout.id, req.tenant.id);

      if (payout.income_expense_id) {
        const ie = db.prepare('SELECT bank_account_id, amount FROM income_expenses WHERE id=? AND tenant_id=?').get(payout.income_expense_id, req.tenant.id) as any;
        if (ie && ie.bank_account_id) {
          db.prepare('UPDATE bank_accounts SET current_balance=current_balance+? WHERE id=?').run(ie.amount, ie.bank_account_id);
        }
        db.prepare('DELETE FROM income_expenses WHERE id=? AND tenant_id=?').run(payout.income_expense_id, req.tenant.id);
      }

      db.prepare("UPDATE investor_payouts SET status='voided', updated_at=datetime('now') WHERE id=?").run(payout.id);
      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error('POST /investors/payouts/:payoutId/void error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

export default router;

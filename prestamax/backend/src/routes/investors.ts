import { Router, Response } from 'express';
import { getDb, uuid, now, r2 } from '../db/database';
import { logAudit } from '../lib/audit';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── GET /api/investors — lista de inversionistas del tenant ──────────────────
router.get('/', authenticate, requireTenant, requirePermission('investors.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { status } = req.query as any;
    let where = 'WHERE tenant_id=?';
    const params: any[] = [req.tenant.id];
    // Por defecto solo muestra activos. Use ?status=all para incluir inactivos,
    // o ?status=inactive para solo ver inactivos.
    if (!status || status === 'active') { where += ' AND is_active=1'; }
    else if (status === 'inactive')     { where += ' AND is_active=0'; }
    // status === 'all' => no filter
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

    // Validar email unico (case-insensitive) dentro del tenant
    const emailNorm = (d.email || '').toString().trim().toLowerCase();
    if (emailNorm) {
      const dup = db.prepare(`SELECT id, full_name FROM investors WHERE tenant_id=? AND lower(email)=? LIMIT 1`)
        .get(req.tenant.id, emailNorm) as any;
      if (dup) {
        return res.status(409).json({
          error: `Ya existe un inversionista con este email (${dup.full_name}). Usa otro email o edita el existente.`,
          conflictInvestorId: dup.id,
        });
      }
    }

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

    // Si viene un email nuevo, validar que no este en otro investor del tenant
    if (d.email !== undefined && d.email !== null) {
      const emailNorm = String(d.email).trim().toLowerCase();
      if (emailNorm) {
        const dup = db.prepare(`SELECT id, full_name FROM investors WHERE tenant_id=? AND lower(email)=? AND id != ? LIMIT 1`)
          .get(req.tenant.id, emailNorm, req.params.id) as any;
        if (dup) {
          return res.status(409).json({
            error: `Ya existe otro inversionista con este email (${dup.full_name}). Usa otro email.`,
            conflictInvestorId: dup.id,
          });
        }
      }
    }

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

// ─── DELETE /api/investors/:id — eliminar inversionista ─────────────────────
// Si NO tiene prestamos asignados ni payouts -> hard delete (se elimina de BD).
// Si SI tiene historial -> soft delete (is_active=0) para preservar auditoria.
router.delete('/:id', authenticate, requireTenant, requirePermission('investors.delete'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const inv = db.prepare('SELECT id FROM investors WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id);
    if (!inv) return res.status(404).json({ error: 'Inversionista no encontrado' });

    const loanCount   = (db.prepare('SELECT COUNT(*) as c FROM loans WHERE investor_id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any).c;
    const payoutCount = (db.prepare('SELECT COUNT(*) as c FROM investor_payouts WHERE investor_id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any).c;

    if (loanCount === 0 && payoutCount === 0) {
      // Sin historial: borrado real
      const invForLog2 = db.prepare('SELECT full_name FROM investors WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
      db.prepare('DELETE FROM investors WHERE id=? AND tenant_id=?').run(req.params.id, req.tenant.id);
      logAudit(db, {
        tenant_id: req.tenant.id, user_id: req.user.id, user_name: req.user.full_name,
        action: 'deleted', entity_type: 'investor', entity_id: req.params.id,
        description: `Borro inversionista ${invForLog2?.full_name||req.params.id} (sin prestamos ni payouts)`,
      });
      return res.json({ success: true, hardDeleted: true });
    }

    // Con historial: soft delete (no se puede borrar para preservar auditoria)
    const invForLog = db.prepare('SELECT full_name, email FROM investors WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    db.prepare("UPDATE investors SET is_active=0, updated_at=datetime('now') WHERE id=? AND tenant_id=?").run(req.params.id, req.tenant.id);
    logAudit(db, {
      tenant_id: req.tenant.id, user_id: req.user.id, user_name: req.user.full_name,
      action: 'deactivated', entity_type: 'investor', entity_id: req.params.id,
      description: `Desactivo inversionista ${invForLog?.full_name||req.params.id} (tenia ${loanCount} prestamos y ${payoutCount} payouts)`,
      old_values: { is_active: 1 }, new_values: { is_active: 0 },
    });
    res.json({ success: true, hardDeleted: false, reason: 'tiene historial', loanCount, payoutCount });
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

    // ── Calculo dual segun model_type del inversionista ────────────────────────
    // fixed_rate: el inversionista recibe una tasa mensual fija sobre su capital
    //   aportado, INDEPENDIENTE de cuanto se cobro de los prestamos. Sin comision.
    // equity:     el inversionista recibe (gross_interes + gross_mora) menos la
    //   comision del administrador. Es la logica original.
    const modelType    = investor.model_type || 'equity';
    const commissionPct = parseFloat(investor.commission_percent) || 0;

    let commission = 0;
    let toInvestor = 0;
    let fixedRateGross = 0;
    let monthsInPeriod = 0;

    if (modelType === 'fixed_rate') {
      const fixedRateMonthly = parseFloat(investor.fixed_rate_monthly) || 0;
      const capital          = parseFloat(investor.capital_contributed) || 0;
      // Meses transcurridos en el periodo (usa 30.44 dias por mes promedio).
      const msDiff = new Date(to).getTime() - new Date(from).getTime();
      monthsInPeriod = Math.max(0, msDiff / (1000 * 60 * 60 * 24 * 30.44));
      fixedRateGross = r2(capital * (fixedRateMonthly / 100) * monthsInPeriod);
      // En fixed_rate NO hay comision (la tasa ya es neta)
      commission  = 0;
      toInvestor  = fixedRateGross;
    } else {
      // equity (default)
      commission = r2(totalGross * (commissionPct / 100));
      toInvestor = r2(totalGross - commission);
    }

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
      model_type: modelType,
      totals: {
        gross_interest:    totalInterest,
        gross_mora:        totalMora,
        gross_capital:     totalCapital,
        gross_total:       totalGross,
        commission_percent: commissionPct,
        commission_amount: commission,
        net_to_investor:   toInvestor,
        // Solo para fixed_rate:
        fixed_rate_monthly: parseFloat(investor.fixed_rate_monthly) || 0,
        capital_contributed: parseFloat(investor.capital_contributed) || 0,
        months_in_period:   r2(monthsInPeriod),
        fixed_rate_gross:   fixedRateGross,
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

    // ── Calculo dual: fixed_rate (tasa fija sobre capital) vs equity (% del cobrado) ──
    const payoutModelType = investor.model_type || 'equity';
    let commissionAmt = 0;
    let netAmount     = 0;

    if (payoutModelType === 'fixed_rate') {
      const fixedRateMonthly = parseFloat(investor.fixed_rate_monthly) || 0;
      const capital          = parseFloat(investor.capital_contributed) || 0;
      const msDiff = new Date(to).getTime() - new Date(from).getTime();
      const monthsInPeriod = Math.max(0, msDiff / (1000 * 60 * 60 * 24 * 30.44));
      commissionAmt = 0;
      netAmount     = r2(capital * (fixedRateMonthly / 100) * monthsInPeriod);
    } else {
      commissionAmt = r2(grossTotal * (commissionPct / 100));
      netAmount     = r2(grossTotal - commissionAmt);
    }

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

// ─── POST /api/investors/:id/grant-portal-access — crear/vincular user inv. ──
// Si el inversionista no tiene user_id, crea un user con rol 'investor' y
// password temporal (devuelto UNA SOLA VEZ al admin). Si ya lo tiene, hace
// reset del password (genera uno nuevo y lo devuelve).
router.post('/:id/grant-portal-access', authenticate, requireTenant, requirePermission('investors.payouts'), async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const investor = db.prepare('SELECT * FROM investors WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!investor) return res.status(404).json({ error: 'Inversionista no encontrado' });
    if (!investor.email) return res.status(400).json({ error: 'El inversionista debe tener email registrado para acceder al portal' });

    const bcrypt = require('bcryptjs');
    const tempPassword = 'inv-' + Math.random().toString(36).slice(-10);
    const hash = bcrypt.hashSync(tempPassword, 10);

    let userId = investor.user_id;
    let user = userId ? db.prepare('SELECT * FROM users WHERE id=?').get(userId) as any : null;

    if (!user) {
      // Buscar user existente por email
      const existingByEmail = db.prepare('SELECT * FROM users WHERE email=?').get(investor.email) as any;
      if (existingByEmail) {
        // P1 Audit fix: si el user ya pertenece a OTRO tenant (como dueño,
        // operador, cobrador, o inversionista de otro), NO podemos reusarlo
        // porque haria reset del password del primario. Bloqueamos y forzamos
        // al admin a usar otro email para este inversionista.
        const conflict = db.prepare(`
          SELECT tm.tenant_id, tm.roles
          FROM tenant_memberships tm
          WHERE tm.user_id=? AND tm.is_active=1 AND tm.tenant_id != ?
          LIMIT 1
        `).get(existingByEmail.id, req.tenant.id) as any;
        if (conflict) {
          return res.status(409).json({
            error: 'Este email ya pertenece a otro tenant. Usa un email distinto para este inversionista (por ejemplo agrega +inv al alias gmail/outlook).',
            conflictTenant: true,
          });
        }
        // Reusamos el user. Reset de password.
        db.prepare(`UPDATE users SET password_hash=?, full_name=COALESCE(NULLIF(full_name,''), ?), is_active=1, updated_at=? WHERE id=?`)
          .run(hash, investor.full_name, now(), existingByEmail.id);
        userId = existingByEmail.id;
        user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
      } else {
        // Crear user nuevo
        userId = uuid();
        db.prepare(`INSERT INTO users (id, email, password_hash, full_name, is_active, platform_role, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, 'none', ?, ?)`)
          .run(userId, investor.email, hash, investor.full_name, now(), now());
        user = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
      }
      // Vincular investor -> user
      db.prepare("UPDATE investors SET user_id=?, updated_at=datetime('now') WHERE id=?").run(userId, req.params.id);
    } else {
      // Solo reset password
      db.prepare(`UPDATE users SET password_hash=?, is_active=1, updated_at=? WHERE id=?`).run(hash, now(), userId);
    }

    // Asegurar membership en este tenant con rol 'investor'
    const existing = db.prepare('SELECT * FROM tenant_memberships WHERE user_id=? AND tenant_id=?').get(userId, req.tenant.id) as any;
    if (!existing) {
      db.prepare(`INSERT INTO tenant_memberships (id, user_id, tenant_id, branch_id, roles, is_active, created_at, updated_at)
        VALUES (?, ?, ?, NULL, ?, 1, ?, ?)`)
        .run(uuid(), userId, req.tenant.id, JSON.stringify(['investor']), now(), now());
    } else {
      const currentRoles: string[] = (() => { try { return JSON.parse(existing.roles || '[]') } catch { return [] } })();
      if (!currentRoles.includes('investor')) currentRoles.push('investor');
      db.prepare(`UPDATE tenant_memberships SET roles=?, is_active=1, updated_at=? WHERE id=?`)
        .run(JSON.stringify(currentRoles), now(), existing.id);
    }

    res.json({
      success: true,
      email: investor.email,
      tempPassword,
      message: 'Cuenta del portal lista. Comparte la contrasena con el inversionista una sola vez; no la guardamos visible despues.'
    });
  } catch (e: any) {
    console.error('POST /investors/:id/grant-portal-access error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

export default router;

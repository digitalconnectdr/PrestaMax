import { Router, Response } from 'express';
import { getDb } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';
const router = Router();

router.get('/dashboard', authenticate, requireTenant, requirePermission('reports.dashboard'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const tid = req.tenant.id;
    const today = new Date().toISOString().slice(0,10);
    const totalPortfolio = (db.prepare("SELECT COALESCE(SUM(disbursed_amount),0) as v FROM loans WHERE tenant_id=?").get(tid) as any).v;
    const totalLoans = (db.prepare("SELECT COUNT(*) as c FROM loans WHERE tenant_id=?").get(tid) as any).c;
    const activeBalance = (db.prepare("SELECT COALESCE(SUM(total_balance),0) as v FROM loans WHERE tenant_id=? AND status IN ('active','current','overdue','in_mora')").get(tid) as any).v;
    const activeLoans = (db.prepare("SELECT COUNT(*) as c FROM loans WHERE tenant_id=? AND status IN ('active','current','overdue','in_mora')").get(tid) as any).c;
    const overdueCount = (db.prepare("SELECT COUNT(*) as c FROM loans WHERE tenant_id=? AND status IN ('overdue','in_mora')").get(tid) as any).c;
    const moraBalance = (db.prepare("SELECT COALESCE(SUM(mora_balance),0) as v FROM loans WHERE tenant_id=? AND status='in_mora'").get(tid) as any).v;
    const todayPayments = (db.prepare("SELECT COALESCE(SUM(amount),0) as v, COUNT(*) as c FROM payments WHERE tenant_id=? AND is_voided=0 AND date(payment_date)=?").get(tid,today) as any);
    const totalClients = (db.prepare("SELECT COUNT(*) as c FROM clients WHERE tenant_id=? AND is_active=1").get(tid) as any).c;
    const liquidated = (db.prepare("SELECT COUNT(*) as c FROM loans WHERE tenant_id=? AND status='liquidated'").get(tid) as any).c;

    const statusDist = db.prepare("SELECT status, COUNT(*) as count FROM loans WHERE tenant_id=? GROUP BY status").all(tid);
    const recentPayments = db.prepare(`SELECT p.*, l.loan_number, l.currency, c.full_name as client_name FROM payments p JOIN loans l ON l.id=p.loan_id JOIN clients c ON c.id=l.client_id WHERE p.tenant_id=? AND p.is_voided=0 ORDER BY p.payment_date DESC LIMIT 8`).all(tid);
    const topOverdue = db.prepare(`SELECT l.*, c.full_name as client_name, c.phone_personal FROM loans l JOIN clients c ON c.id=l.client_id WHERE l.tenant_id=? AND l.status IN ('overdue','in_mora') ORDER BY l.mora_balance DESC LIMIT 8`).all(tid);
    const dailyColl = db.prepare("SELECT date(payment_date) as day, SUM(amount) as total, COUNT(*) as count FROM payments WHERE tenant_id=? AND is_voided=0 AND payment_date >= date('now','-30 days') GROUP BY date(payment_date) ORDER BY day").all(tid);

    // Multi-currency: per-currency breakdown of active portfolio
    const portfolioByCurrency = db.prepare(`
      SELECT COALESCE(currency,'DOP') as currency,
             COUNT(*) as loan_count,
             COALESCE(SUM(total_balance),0) as active_balance,
             COALESCE(SUM(mora_balance),0) as mora_balance,
             COALESCE(SUM(CASE WHEN status IN ('active','current','overdue','in_mora') THEN total_balance ELSE 0 END),0) as portfolio_balance,
             COALESCE(AVG(CASE WHEN currency!='DOP' THEN exchange_rate_to_dop ELSE NULL END),1) as avg_rate
      FROM loans WHERE tenant_id=? GROUP BY COALESCE(currency,'DOP')
    `).all(tid);

    res.json({ kpis: { total_portfolio:totalPortfolio, total_loans:totalLoans, active_portfolio:activeBalance, active_loans:activeLoans, overdue_loans:overdueCount, mora_balance:moraBalance, today_payments:todayPayments.v, today_count:todayPayments.c, total_clients:totalClients, liquidated }, status_distribution:statusDist, recent_payments:recentPayments, top_overdue:topOverdue, daily_collections:dailyColl, portfolio_by_currency:portfolioByCurrency });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.get('/portfolio', authenticate, requireTenant, requirePermission('reports.portfolio'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const tid = req.tenant.id;
    const loans = db.prepare(`SELECT l.*,c.full_name as client_name,p.name as product_name FROM loans l JOIN clients c ON c.id=l.client_id JOIN loan_products p ON p.id=l.product_id WHERE l.tenant_id=? AND l.status IN ('active','current','overdue','in_mora')`).all(tid);
    const aging = { current:0, d1_7:0, d8_15:0, d16_30:0, over30:0, amounts: {current:0,d1_7:0,d8_15:0,d16_30:0,over30:0} };
    (loans as any[]).forEach((l:any) => {
      const d = l.days_overdue||0;
      if (d===0) { aging.current++; (aging.amounts as any).current+=l.total_balance||0; }
      else if (d<=7) { aging.d1_7++; (aging.amounts as any).d1_7+=l.mora_balance||0; }
      else if (d<=15) { aging.d8_15++; (aging.amounts as any).d8_15+=l.mora_balance||0; }
      else if (d<=30) { aging.d16_30++; (aging.amounts as any).d16_30+=l.mora_balance||0; }
      else { aging.over30++; (aging.amounts as any).over30+=l.mora_balance||0; }
    });
    res.json({ loans, aging, total:(loans as any[]).length });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/mora', authenticate, requireTenant, requirePermission('reports.mora'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    res.json(db.prepare(`SELECT l.*,c.full_name as client_name,c.phone_personal,p.name as product_name FROM loans l JOIN clients c ON c.id=l.client_id JOIN loan_products p ON p.id=l.product_id WHERE l.tenant_id=? AND l.status IN ('overdue','in_mora') ORDER BY l.mora_balance DESC`).all(req.tenant.id));
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/collections', authenticate, requireTenant, requirePermission('reports.collections'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const { from, to } = req.query as any;
    const start = from || new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    const end = to || new Date().toISOString().slice(0,10);
    const data = db.prepare(`SELECT p.collector_id, u.full_name as collector_name, SUM(p.amount) as total, COUNT(*) as count FROM payments p LEFT JOIN users u ON u.id=p.collector_id WHERE p.tenant_id=? AND p.is_voided=0 AND date(p.payment_date) BETWEEN ? AND ? GROUP BY p.collector_id`).all(req.tenant.id, start, end);
    res.json(data);
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/audit', authenticate, requireTenant, requirePermission('reports.portfolio'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const logs = db.prepare(`SELECT a.*,u.full_name as user_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id WHERE a.tenant_id=? ORDER BY a.created_at DESC LIMIT 200`).all(req.tenant.id);
    res.json(logs);
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

// Advanced analytics: monthly breakdown + MoM comparisons
router.get('/advanced', authenticate, requireTenant, requirePermission('reports.advanced'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const tid = req.tenant.id;
    const now = new Date();

    // Date range from query params (default: last 12 months)
    const fromDate = (req.query.from as string) || new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);
    const toDate = (req.query.to as string) || now.toISOString().slice(0, 10);

    // Monthly collections in date range
    const monthlyCollections = db.prepare(`
      SELECT strftime('%Y-%m', payment_date) as month,
        SUM(amount) as total_collected,
        COUNT(*) as payment_count,
        SUM(applied_capital) as capital_collected,
        SUM(applied_interest) as interest_collected,
        SUM(applied_mora) as mora_collected
      FROM payments
      WHERE tenant_id=? AND is_voided=0
        AND payment_date >= ? AND payment_date <= ?
      GROUP BY strftime('%Y-%m', payment_date)
      ORDER BY month
    `).all(tid, fromDate, toDate);

    // Monthly new loans disbursed
    const monthlyLoans = db.prepare(`
      SELECT strftime('%Y-%m', disbursement_date) as month,
        COUNT(*) as new_loans,
        SUM(disbursed_amount) as amount_disbursed
      FROM loans
      WHERE tenant_id=? AND disbursement_date IS NOT NULL
        AND disbursement_date >= ? AND disbursement_date <= ?
      GROUP BY strftime('%Y-%m', disbursement_date)
      ORDER BY month
    `).all(tid, fromDate, toDate);

    // Monthly new clients
    const monthlyClients = db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as new_clients
      FROM clients
      WHERE tenant_id=? AND created_at >= ? AND created_at <= ?
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month
    `).all(tid, fromDate, toDate);

    // Current month vs last month comparison
    const thisMonth = now.toISOString().slice(0, 7)
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const lastMonth = lastMonthDate.toISOString().slice(0, 7)

    const thisMonthPayments = (db.prepare(`SELECT COALESCE(SUM(amount),0) as v, COUNT(*) as c FROM payments WHERE tenant_id=? AND is_voided=0 AND strftime('%Y-%m',payment_date)=?`).get(tid, thisMonth) as any)
    const lastMonthPayments = (db.prepare(`SELECT COALESCE(SUM(amount),0) as v, COUNT(*) as c FROM payments WHERE tenant_id=? AND is_voided=0 AND strftime('%Y-%m',payment_date)=?`).get(tid, lastMonth) as any)
    const thisMonthLoans = (db.prepare(`SELECT COUNT(*) as c, COALESCE(SUM(disbursed_amount),0) as v FROM loans WHERE tenant_id=? AND strftime('%Y-%m',disbursement_date)=?`).get(tid, thisMonth) as any)
    const lastMonthLoans = (db.prepare(`SELECT COUNT(*) as c, COALESCE(SUM(disbursed_amount),0) as v FROM loans WHERE tenant_id=? AND strftime('%Y-%m',disbursement_date)=?`).get(tid, lastMonth) as any)
    const thisMonthClients = (db.prepare(`SELECT COUNT(*) as c FROM clients WHERE tenant_id=? AND strftime('%Y-%m',created_at)=?`).get(tid, thisMonth) as any)
    const lastMonthClients = (db.prepare(`SELECT COUNT(*) as c FROM clients WHERE tenant_id=? AND strftime('%Y-%m',created_at)=?`).get(tid, lastMonth) as any)

    // YTD stats
    const yearStart = `${now.getFullYear()}-01-01`
    const ytdCollected = (db.prepare(`SELECT COALESCE(SUM(amount),0) as v FROM payments WHERE tenant_id=? AND is_voided=0 AND payment_date >= ?`).get(tid, yearStart) as any).v
    const ytdDisbursed = (db.prepare(`SELECT COALESCE(SUM(disbursed_amount),0) as v FROM loans WHERE tenant_id=? AND disbursement_date >= ?`).get(tid, yearStart) as any).v
    const ytdNewClients = (db.prepare(`SELECT COUNT(*) as c FROM clients WHERE tenant_id=? AND created_at >= ?`).get(tid, yearStart) as any).c

    // Business health alerts
    const moraRate = (() => {
      const active = (db.prepare(`SELECT COALESCE(SUM(total_balance),0) as v FROM loans WHERE tenant_id=? AND status IN ('active','overdue','in_mora')`).get(tid) as any).v
      const mora = (db.prepare(`SELECT COALESCE(SUM(mora_balance),0) as v FROM loans WHERE tenant_id=? AND status='in_mora'`).get(tid) as any).v
      return active > 0 ? (mora / active) * 100 : 0
    })()

    const alerts: Array<{ type: string; message: string; severity: string }> = []
    if (moraRate > 20) alerts.push({ type: 'mora_high', message: `Tasa de mora en ${moraRate.toFixed(1)}% — por encima del 20%`, severity: 'critical' })
    else if (moraRate > 10) alerts.push({ type: 'mora_medium', message: `Tasa de mora en ${moraRate.toFixed(1)}% — monitorear`, severity: 'warning' })

    const collMoM = lastMonthPayments.v > 0 ? ((thisMonthPayments.v - lastMonthPayments.v) / lastMonthPayments.v) * 100 : 0
    if (collMoM < -20) alerts.push({ type: 'collections_drop', message: `Cobranza cayó ${Math.abs(collMoM).toFixed(1)}% vs mes anterior`, severity: 'warning' })

    // Collector performance (last 30 days)
    const collectorPerf = db.prepare(`
      SELECT u.full_name as collector_name, COUNT(*) as payment_count,
        SUM(p.amount) as total_collected
      FROM payments p
      LEFT JOIN users u ON u.id=p.collector_id
      WHERE p.tenant_id=? AND p.is_voided=0 AND p.payment_date >= date('now','-30 days')
        AND p.collector_id IS NOT NULL
      GROUP BY p.collector_id ORDER BY total_collected DESC LIMIT 10
    `).all(tid);

    res.json({
      monthlyCollections, monthlyLoans, monthlyClients,
      comparison: {
        thisMonth: { collections: thisMonthPayments.v, paymentCount: thisMonthPayments.c, loansCount: thisMonthLoans.c, loansDisbursed: thisMonthLoans.v, newClients: thisMonthClients.c },
        lastMonth: { collections: lastMonthPayments.v, paymentCount: lastMonthPayments.c, loansCount: lastMonthLoans.c, loansDisbursed: lastMonthLoans.v, newClients: lastMonthClients.c },
      },
      ytd: { collected: ytdCollected, disbursed: ytdDisbursed, newClients: ytdNewClients },
      moraRate, alerts, collectorPerf,
    });
  } catch(e:any) { console.error(e); res.status(500).json({ error: e.message || 'Failed' }); }
});

// Bank account breakdown: payments received per account
router.get('/bank-accounts', authenticate, requireTenant, requirePermission('reports.income'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const tid = req.tenant.id;
    const { from, to } = req.query as any;
    const start = from || new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    const end = to || new Date().toISOString().slice(0,10);

    // Payments grouped by bank account — includes current_balance for display
    const byAccount = db.prepare(`
      SELECT
        ba.id as bank_account_id,
        ba.bank_name,
        ba.account_number,
        ba.account_type,
        ba.account_holder,
        ba.currency,
        ba.current_balance,
        ba.loaned_balance,
        COALESCE(SUM(p.amount), 0) as total_received,
        COALESCE(SUM(p.applied_capital), 0) as capital_received,
        COALESCE(SUM(p.applied_interest), 0) as interest_received,
        COALESCE(SUM(p.applied_mora), 0) as mora_received,
        COUNT(p.id) as payment_count
      FROM bank_accounts ba
      LEFT JOIN payments p ON p.bank_account_id = ba.id
        AND p.tenant_id = ba.tenant_id
        AND p.is_voided = 0
        AND date(p.payment_date) BETWEEN ? AND ?
      WHERE ba.tenant_id = ? AND ba.is_active = 1
      GROUP BY ba.id
      ORDER BY total_received DESC
    `).all(start, end, tid);

    // Cash payments (no bank account)
    const cashPayments = db.prepare(`
      SELECT
        COALESCE(SUM(amount), 0) as total_received,
        COALESCE(SUM(applied_capital), 0) as capital_received,
        COALESCE(SUM(applied_interest), 0) as interest_received,
        COALESCE(SUM(applied_mora), 0) as mora_received,
        COUNT(*) as payment_count
      FROM payments
      WHERE tenant_id = ? AND is_voided = 0
        AND bank_account_id IS NULL
        AND date(payment_date) BETWEEN ? AND ?
    `).get(tid, start, end) as any;

    // Payment method breakdown
    const byMethod = db.prepare(`
      SELECT payment_method, COALESCE(SUM(amount),0) as total, COUNT(*) as count
      FROM payments
      WHERE tenant_id=? AND is_voided=0 AND date(payment_date) BETWEEN ? AND ?
      GROUP BY payment_method ORDER BY total DESC
    `).all(tid, start, end);

    res.json({ byAccount, cashPayments, byMethod, period: { from: start, to: end } });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// GET transaction history for a specific bank account
router.get('/bank-accounts/:id/transactions', authenticate, requireTenant, requirePermission('reports.income'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const tid = req.tenant.id;
    const { from, to, limit = '50' } = req.query as any;
    const start = from || new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    const end   = to   || new Date().toISOString().slice(0,10);

    // Verify account belongs to tenant
    const account = db.prepare('SELECT * FROM bank_accounts WHERE id=? AND tenant_id=?').get(req.params.id, tid) as any;
    if (!account) return res.status(404).json({ error: 'Cuenta bancaria no encontrada' });

    const transactions = db.prepare(`
      SELECT p.id, p.payment_number, p.payment_date, p.amount,
             p.applied_capital, p.applied_interest, p.applied_mora,
             p.payment_method, p.reference, p.type, p.is_voided,
             l.loan_number, c.full_name as client_name
      FROM payments p
      JOIN loans l ON l.id=p.loan_id
      JOIN clients c ON c.id=l.client_id
      WHERE p.bank_account_id=? AND p.tenant_id=?
        AND date(p.payment_date) BETWEEN ? AND ?
      ORDER BY p.payment_date DESC
      LIMIT ?
    `).all(req.params.id, tid, start, end, parseInt(limit));

    res.json({ account, transactions, period: { from: start, to: end } });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// Income & Expense summary for reports
router.get('/income-expenses', authenticate, requireTenant, requirePermission('reports.income'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb(); const tid = req.tenant.id;
    const { from, to } = req.query as any;
    const start = from || new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    const end = to || new Date().toISOString().slice(0,10);
    const income = db.prepare(`
      SELECT category, SUM(amount) as total, COUNT(*) as count
      FROM income_expenses WHERE tenant_id=? AND type='income' AND date BETWEEN ? AND ?
      GROUP BY category ORDER BY total DESC
    `).all(tid, start, end) as any[];
    const expenses = db.prepare(`
      SELECT category, SUM(amount) as total, COUNT(*) as count
      FROM income_expenses WHERE tenant_id=? AND type='expense' AND date BETWEEN ? AND ?
      GROUP BY category ORDER BY total DESC
    `).all(tid, start, end) as any[];
    const totalIncome = income.reduce((s:number,r:any)=>s+r.total,0);
    const totalExpenses = expenses.reduce((s:number,r:any)=>s+r.total,0);
    res.json({ income, expenses, totalIncome, totalExpenses, net: totalIncome-totalExpenses, period: { from: start, to: end } });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// ─── GET /reports/projection ─────────────────────────────────────────────────
// Returns a projection of collections for a given date or date range.
// Replicates calcMora() logic: fixed charge vs. daily rate, with grace days.
router.get('/projection', authenticate, requireTenant, requirePermission('reports.projection'), (req: AuthRequest, res: Response) => {
  try {
    const db  = getDb();
    const tid = req.tenant.id;

    // Accept ?date=YYYY-MM-DD (single day) or ?from=...&to=... (range)
    const { date, from, to } = req.query as Record<string, string>;
    const rangeFrom: string = date || from || new Date().toISOString().slice(0, 10);
    const rangeTo:   string = date || to   || rangeFrom;

    const asOfDate = new Date(rangeTo + 'T23:59:59'); // mora calculated as of end of range

    // ── Fetch all active loans for this tenant ────────────────────────────────
    const loans = db.prepare(`
      SELECT l.*,
             c.full_name  AS client_name,
             c.id_number  AS client_id_number,
             c.phone_personal AS client_phone
      FROM loans l
      JOIN clients c ON c.id = l.client_id
      WHERE l.tenant_id = ?
        AND l.status IN ('active','current','overdue','in_mora','disbursed','restructured')
      ORDER BY c.full_name ASC
    `).all(tid) as any[];

    if (loans.length === 0) {
      return res.json({
        summary: { totalCapital: 0, totalInterest: 0, totalMora: 0, totalProrroga: 0,
                   totalProjected: 0, clientsOnTime: 0, clientsOverdue: 0, totalLoans: 0, totalInstallments: 0 },
        items: [],
        period: { from: rangeFrom, to: rangeTo },
      });
    }

    const loanIds = loans.map((l: any) => l.id);

    // ── Fetch installments in date range (due within from..to) ────────────────
    const placeholders = loanIds.map(() => '?').join(',');
    const allInstallments = db.prepare(`
      SELECT i.*
      FROM installments i
      WHERE i.loan_id IN (${placeholders})
        AND i.status NOT IN ('paid','waived')
        AND (
          (i.deferred_due_date IS NOT NULL AND date(i.deferred_due_date) BETWEEN ? AND ?)
          OR
          (i.deferred_due_date IS NULL     AND date(i.due_date)          BETWEEN ? AND ?)
        )
      ORDER BY i.due_date ASC
    `).all(...loanIds, rangeFrom, rangeTo, rangeFrom, rangeTo) as any[];

    // ── Also fetch ALL pending installments per loan (needed for mora calc) ──
    const allPendingInstallments = db.prepare(`
      SELECT i.*
      FROM installments i
      WHERE i.loan_id IN (${placeholders})
        AND i.status NOT IN ('paid','waived')
      ORDER BY i.due_date ASC
    `).all(...loanIds) as any[];

    // Group pending installments by loan_id
    const pendingByLoan: Record<string, any[]> = {};
    for (const inst of allPendingInstallments) {
      if (!pendingByLoan[inst.loan_id]) pendingByLoan[inst.loan_id] = [];
      pendingByLoan[inst.loan_id].push(inst);
    }

    // Group range installments by loan_id
    const rangeInstByLoan: Record<string, any[]> = {};
    for (const inst of allInstallments) {
      if (!rangeInstByLoan[inst.loan_id]) rangeInstByLoan[inst.loan_id] = [];
      rangeInstByLoan[inst.loan_id].push(inst);
    }

    // ── Helper: replicate calcMora from payments.ts ───────────────────────────
    function r2(n: number) { return Math.round(n * 100) / 100; }

    function calcMora(loan: any, pendingInsts: any[], asOf: Date): number {
      const useFixed = !!loan.mora_fixed_enabled;
      const fixedAmt = loan.mora_fixed_amount || 0;
      const base     = loan.mora_base || 'cuota_vencida';
      let total = 0;
      for (const inst of pendingInsts) {
        const effectiveDue = inst.deferred_due_date
          ? new Date(inst.deferred_due_date + 'T00:00:00')
          : new Date(inst.due_date + 'T00:00:00');
        const days     = Math.max(0, Math.floor((asOf.getTime() - effectiveDue.getTime()) / 86400000));
        const moraDays = Math.max(0, days - (loan.mora_grace_days || 0));
        if (moraDays > 0) {
          if (useFixed) {
            total += fixedAmt;
          } else {
            let baseAmount = 0;
            if (base === 'cuota_vencida') {
              baseAmount = r2((inst.principal_amount + inst.interest_amount) - (inst.paid_total || 0));
            } else {
              baseAmount = r2((inst.principal_amount || 0) - (inst.paid_principal || 0));
            }
            total += Math.max(0, baseAmount) * (loan.mora_rate_daily || 0.001) * moraDays;
          }
        }
      }
      return r2(total);
    }

    // ── Build projection items ────────────────────────────────────────────────
    const items: any[] = [];

    let summaryCapital    = 0;
    let summaryInterest   = 0;
    let summaryMora       = 0;
    let summaryProrroga   = 0;
    let clientsOnTime     = 0;
    let clientsOverdue    = 0;

    // Track loans that appear in projection (either have range installments OR are overdue)
    const processedLoanIds = new Set<string>();

    // 1) Loans with installments due in the range
    for (const loan of loans) {
      const rangeInsts   = rangeInstByLoan[loan.id] || [];
      const pendingInsts = pendingByLoan[loan.id]   || [];

      if (rangeInsts.length === 0) continue;

      processedLoanIds.add(loan.id);

      const mora      = calcMora(loan, pendingInsts, asOfDate);
      const prorroga  = rangeInsts.some((i: any) => i.type === 'prorroga') ? (loan.prorroga_fee || 0) : 0;

      const capital   = r2(rangeInsts.reduce((s: number, i: any) => s + (i.principal_amount - (i.paid_principal || 0)), 0));
      const interest  = r2(rangeInsts.reduce((s: number, i: any) => s + (i.interest_amount - (i.paid_interest || 0)), 0));
      const total     = r2(capital + interest + mora + prorroga);

      const isOverdue = ['overdue','in_mora'].includes(loan.status);
      const daysLate  = pendingInsts.length > 0
        ? Math.max(0, Math.floor((asOfDate.getTime() - new Date((pendingInsts[0].deferred_due_date || pendingInsts[0].due_date) + 'T00:00:00').getTime()) / 86400000) - (loan.mora_grace_days || 0))
        : 0;

      summaryCapital  += capital;
      summaryInterest += interest;
      summaryMora     += mora;
      summaryProrroga += prorroga;

      if (isOverdue) clientsOverdue++; else clientsOnTime++;

      items.push({
        loan_id:       loan.id,
        loan_number:   loan.loan_number,
        client_name:   loan.client_name,
        client_phone:  loan.client_phone  || null,
        currency:      loan.currency      || 'DOP',
        status:        loan.status,
        is_overdue:    isOverdue,
        days_late:     daysLate,
        installments_in_range: rangeInsts.length,
        capital,
        interest,
        mora,
        prorroga,
        total,
        due_dates:     rangeInsts.map((i: any) => i.deferred_due_date || i.due_date),
        mora_type:     loan.mora_fixed_enabled ? 'fixed' : 'daily',
        mora_rate:     loan.mora_fixed_enabled ? (loan.mora_fixed_amount || 0) : (loan.mora_rate_daily || 0.001),
      });
    }

    // 2) Overdue loans with no installments in range but with unpaid mora
    for (const loan of loans) {
      if (processedLoanIds.has(loan.id)) continue;
      if (!['overdue','in_mora'].includes(loan.status)) continue;

      const pendingInsts = pendingByLoan[loan.id] || [];
      if (pendingInsts.length === 0) continue;

      const mora = calcMora(loan, pendingInsts, asOfDate);
      if (mora <= 0) continue;

      const daysLate = Math.max(0,
        Math.floor((asOfDate.getTime() - new Date((pendingInsts[0].deferred_due_date || pendingInsts[0].due_date) + 'T00:00:00').getTime()) / 86400000)
        - (loan.mora_grace_days || 0)
      );

      summaryMora   += mora;
      clientsOverdue++;

      items.push({
        loan_id:       loan.id,
        loan_number:   loan.loan_number,
        client_name:   loan.client_name,
        client_phone:  loan.client_phone || null,
        currency:      loan.currency     || 'DOP',
        status:        loan.status,
        is_overdue:    true,
        days_late:     daysLate,
        installments_in_range: 0,
        capital:       0,
        interest:      0,
        mora:          r2(mora),
        prorroga:      0,
        total:         r2(mora),
        due_dates:     [],
        mora_type:     loan.mora_fixed_enabled ? 'fixed' : 'daily',
        mora_rate:     loan.mora_fixed_enabled ? (loan.mora_fixed_amount || 0) : (loan.mora_rate_daily || 0.001),
        note:          'Sin cuotas en este período — mora acumulada',
      });
    }

    // Sort: overdue first, then by total desc
    items.sort((a: any, b: any) => {
      if (a.is_overdue !== b.is_overdue) return a.is_overdue ? -1 : 1;
      return b.total - a.total;
    });

    const totalProjected = r2(summaryCapital + summaryInterest + summaryMora + summaryProrroga);

    res.json({
      summary: {
        totalCapital:    r2(summaryCapital),
        totalInterest:   r2(summaryInterest),
        totalMora:       r2(summaryMora),
        totalProrroga:   r2(summaryProrroga),
        totalProjected,
        clientsOnTime,
        clientsOverdue,
        totalLoans:      items.length,
        totalInstallments: allInstallments.length,
      },
      items,
      period: { from: rangeFrom, to: rangeTo },
    });
  } catch(e: any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// ─── GET /reports/datacredito ─────────────────────────────────────────────────
// Generates the DataCrédito monthly report in the required column format.
// Returns JSON rows; the frontend converts to Excel (.xlsx) via SheetJS.
router.get('/datacredito', authenticate, requireTenant, requirePermission('reports.datacredito'), (req: AuthRequest, res: Response) => {
  try {
    const db  = getDb();
    const tid = req.tenant.id;
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    // ── Helper: map PrestaMax values to DataCrédito codes ──────────────────────
    const mapSexo = (g: string | null): string => {
      if (!g) return '';
      const v = g.toUpperCase();
      if (v === 'M' || v === 'MASCULINO' || v === 'MALE') return 'M';
      if (v === 'F' || v === 'FEMENINO' || v === 'FEMALE') return 'F';
      return '';
    };
    const mapEstadoCivil = (m: string | null): string => {
      if (!m) return '';
      const v = m.toLowerCase();
      if (v.includes('solter')) return 'S';
      if (v.includes('casad')) return 'C';
      if (v.includes('divorci')) return 'D';
      if (v.includes('viud')) return 'V';
      if (v.includes('union') || v.includes('libre') || v.includes('unio')) return 'U';
      return m.toUpperCase().slice(0, 1);
    };
    const mapEstatus = (status: string): string => {
      switch (status) {
        case 'active': case 'current': return 'V';
        case 'overdue': case 'in_mora': return 'V'; // Vigente con atraso
        case 'paid': return 'C';
        case 'defaulted': case 'charged_off': return 'X';
        case 'cancelled': return 'C';
        default: return 'V';
      }
    };
    const mapTipoPrestamo = (type: string): string => {
      switch (type) {
        case 'personal': return 'A';
        case 'commercial': case 'comercial': return 'B';
        case 'guarantee': case 'garantia': case 'mortgage': return 'H';
        case 'san': return 'A';
        case 'auto': return 'V';
        default: return 'A';
      }
    };
    const mapMoneda = (currency: string): string => {
      switch ((currency || 'DOP').toUpperCase()) {
        case 'DOP': return '214';
        case 'USD': return '840';
        case 'EUR': return '978';
        case 'HTG': return '332';
        case 'CAD': return '124';
        case 'GBP': return '826';
        default: return '214';
      }
    };
    const mapFormaPago = (freq: string): string => {
      switch (freq) {
        case 'monthly': return 'M';
        case 'biweekly': return 'Q';
        case 'weekly': return 'S';
        case 'daily': return 'D';
        case 'annual': return 'A';
        default: return 'M';
      }
    };
    const fmtDate = (d: string | null): string => {
      if (!d) return '';
      try { return new Date(d).toISOString().slice(0, 10).replace(/-/g, '/'); }
      catch { return ''; }
    };
    const r2 = (n: number) => Math.round(n * 100) / 100;

    // ── Fetch all reportable loans with client data ────────────────────────────
    const loans = db.prepare(`
      SELECT
        l.id, l.loan_number, l.status, l.rate, l.rate_type,
        l.disbursement_date, l.maturity_date, l.first_payment_date,
        l.approved_amount, l.disbursed_amount, l.principal_balance,
        l.interest_balance, l.mora_balance, l.total_balance,
        l.total_paid, l.days_overdue, l.term, l.term_unit,
        l.payment_frequency, l.mora_grace_days, l.currency,
        lp.type AS loan_type,
        c.id AS client_id, c.client_number, c.full_name, c.first_name,
        c.last_name, c.id_number, c.id_type, c.gender, c.marital_status,
        c.birth_date, c.phone_personal, c.phone_work,
        c.address, c.city, c.province, c.occupation,
        c.employer, c.monthly_income
      FROM loans l
      JOIN clients c ON l.client_id = c.id
      JOIN loan_products lp ON l.product_id = lp.id
      WHERE l.tenant_id = ?
        AND l.status NOT IN ('draft','rejected','pending_approval')
      ORDER BY c.last_name, c.first_name, l.disbursement_date
    `).all(tid) as any[];

    // ── Get tenant entity_type setting ────────────────────────────────────────
    const settings = db.prepare(`SELECT * FROM tenant_settings WHERE tenant_id=?`).get(tid) as any;
    const entityType = settings?.datacredito_entity_type || 'C'; // default Cooperativa/Prestamista

    // ── Build one row per loan ────────────────────────────────────────────────
    const rows = loans.map(loan => {
      // Last payment
      const lastPay = db.prepare(`
        SELECT amount, payment_date FROM payments
        WHERE loan_id=? AND is_voided=0
        ORDER BY payment_date DESC LIMIT 1
      `).get(loan.id) as any;

      // Installment amount (monthly quota)
      const firstInst = db.prepare(`
        SELECT total_amount FROM installments WHERE loan_id=? ORDER BY installment_number LIMIT 1
      `).get(loan.id) as any;

      // Atraso buckets: overdue installments grouped by age in days
      const overdueInsts = db.prepare(`
        SELECT total_amount, paid_total, due_date FROM installments
        WHERE loan_id=? AND status IN ('pending','partial') AND due_date < ?
        ORDER BY due_date
      `).all(loan.id, todayStr) as any[];

      let a1_30 = 0, a31_60 = 0, a61_90 = 0, a91_120 = 0,
          a121_150 = 0, a151_180 = 0, a181plus = 0;
      const gracedays = loan.mora_grace_days || 0;

      for (const inst of overdueInsts) {
        const dueDate = new Date(inst.due_date + 'T00:00:00');
        const days = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / 86400000) - gracedays);
        const pending = r2(inst.total_amount - inst.paid_total);
        if (pending <= 0) continue;
        if (days <= 30)        a1_30    += pending;
        else if (days <= 60)   a31_60   += pending;
        else if (days <= 90)   a61_90   += pending;
        else if (days <= 120)  a91_120  += pending;
        else if (days <= 150)  a121_150 += pending;
        else if (days <= 180)  a151_180 += pending;
        else                   a181plus += pending;
      }

      const totalAtraso = r2(a1_30 + a31_60 + a61_90 + a91_120 + a121_150 + a151_180 + a181plus);
      const creditApproved = r2(loan.approved_amount || loan.disbursed_amount || 0);
      const montoAdeudado  = r2(loan.total_balance || 0);

      return {
        // ── Datos Personales ──────────────────────────────────────────────────
        'TIPO DE ENTIDAD':     entityType,
        'NOMBRE DEL CLIENTE':  loan.first_name || loan.full_name.split(' ')[0] || '',
        'APELLIDOS':           loan.last_name  || loan.full_name.split(' ').slice(1).join(' ') || '',
        'CEDULA O RNC':        loan.id_number || '',
        'SEXO':                mapSexo(loan.gender),
        'ESTADO CIVIL':        mapEstadoCivil(loan.marital_status),
        'OCUPACION':           loan.occupation || '',
        'CODIGO DE CLIENTE':   loan.client_number || '',
        'FECHA DE NACIMIENTO': fmtDate(loan.birth_date),
        'NACIONALIDAD':        'DOM',
        'DIRECCION':           loan.address || '',
        'SECTOR':              '',
        'CALLE/NUMERO':        '',
        'MUNICIPIO':           '',
        'CIUDAD':              loan.city || '',
        'PROVINCIA':           loan.province || '',
        'PAIS':                'DO',
        'DIR_REFERENCIA':      '',
        'TELEFONO1':           (loan.phone_personal || '').replace(/\D/g, ''),
        'TELEFONO2':           (loan.phone_work || '').replace(/\D/g, ''),
        // ── Datos Laborales ───────────────────────────────────────────────────
        'EMPRESA DONDE TRABAJA': loan.employer || '',
        'CARGO':                 loan.occupation || '',
        'DIRECCION_LABORAL':     '',
        'SECTOR_LABORAL':        '',
        'CALLE_NUMERO_LABORAL':  '',
        'MUNICIPIO_LABORAL':     '',
        'CIUDAD_LABORAL':        '',
        'PROVINCIA_LABORAL':     '',
        'PAIS_LABORAL':          'DO',
        'DIR_REF_LABORAL':       '',
        'SALARIO MENSUAL':       r2(loan.monthly_income || 0),
        'MONEDA SALARIO':        mapMoneda(loan.currency || 'DOP'),
        // ── Datos de la Cuenta ────────────────────────────────────────────────
        'RELACIÓN TIPO':          'T',
        'FECHA APERTURA':         fmtDate(loan.disbursement_date),
        'FECHA VENCIMIENTO':      fmtDate(loan.maturity_date),
        'FECHA ULTIMO PAGO':      lastPay ? fmtDate(lastPay.payment_date) : '',
        'NUMERO CUENTA':          loan.loan_number || '',
        'ESTATUS':                mapEstatus(loan.status),
        'TIPO DE PRESTAMO':       mapTipoPrestamo(loan.loan_type || 'personal'),
        'MONEDA':                 mapMoneda(loan.currency || 'DOP'),
        'CREDITO APROBADO':       creditApproved,
        'MONTO ADEUDADO':         montoAdeudado,
        'PAGO MANDATORIO O CUOTA': firstInst ? r2(firstInst.total_amount) : 0,
        'MONTO ULTIMO PAGO':      lastPay ? r2(lastPay.amount) : 0,
        'TOTAL DE ATRASO':        totalAtraso,
        'TASA DE INTERES':        r2(loan.rate || 0),
        'FORMA DE PAGO':          mapFormaPago(loan.payment_frequency),
        'CANTIDAD DE CUOTAS':     loan.term || 0,
        // ── Atraso por bucket ─────────────────────────────────────────────────
        'ATRASO 1 A 30 DIAS':       r2(a1_30),
        'ATRASO 31 A 60 DIAS':      r2(a31_60),
        'ATRASO 61 A 90 DIAS':      r2(a61_90),
        'ATRASO 91 A 120 DIAS':     r2(a91_120),
        'ATRASO 121 A 150 DIAS':    r2(a121_150),
        'ATRASO 151 A 180 DIAS':    r2(a151_180),
        'ATRASO 181 DIAS O MAS':    r2(a181plus),
        // ── Legal / Castigado ─────────────────────────────────────────────────
        'LEGAL':     '',
        'CASTIGADO': loan.status === 'defaulted' || loan.status === 'charged_off' ? 'S' : 'N',
      };
    });

    res.json({
      rows,
      generatedAt: new Date().toISOString(),
      totalRows: rows.length,
      period: todayStr,
    });
  } catch(e: any) { res.status(500).json({ error: e.message || 'Failed DataCrédito report' }); }
});

export { router };

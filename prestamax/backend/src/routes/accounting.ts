// accounting — exports CSV de contabilidad mensual
// 3 endpoints:
//   GET /api/accounting/journal?from=&to=  — libro diario (todos los movimientos)
//   GET /api/accounting/by-account?from=&to= — mayor por cuenta bancaria
//   GET /api/accounting/summary?from=&to= — P&L resumido del periodo
// Todos devuelven CSV. Multi-tenant: filtran por req.tenant.id

import { Router, Response } from 'express';
import { getDb } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';
import { getReportLang, reportT } from '../lib/reportI18n';

const router = Router();

function formatDate(d: any): string {
  if (!d) return '';
  // Maneja '2026-01-02T10:09:33.928Z', '2026-01-02 10:09:33', '2026-01-02', etc
  return String(d).slice(0, 10);
}

function formatTime(d: any): string {
  if (!d) return '';
  // Extrae HH:MM:SS de '2026-01-02T10:09:33.928Z' o '2026-01-02 10:09:33'
  // Si la fecha no tiene hora (solo YYYY-MM-DD), devuelve cadena vacia
  const s = String(d);
  const m = s.match(/[T ](\d{2}:\d{2}:\d{2})/);
  return m ? m[1] : '';
}

function csvField(val: any): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvLine(fields: any[]): string {
  return fields.map(csvField).join(',') + '\n';
}

function parseDateRange(req: AuthRequest): { from: string; to: string } {
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const from = String(req.query.from || firstOfMonth);
  const to = String(req.query.to || lastOfMonth);
  return { from, to };
}

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv);  // BOM UTF-8 para Excel
}

router.get('/journal', authenticate, requireTenant, requirePermission('reports.dashboard'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { from, to } = parseDateRange(req);
    const tr = reportT(getReportLang(req));
    // FIX (Jun 2026): agregar columna Moneda para multi-tenant DOP+USD.
    // Header cambia: Debe = entradas a la caja; Haber = salidas.
    let csv = csvLine([tr('col.date'), tr('col.time'), tr('col.type'), tr('col.concept'), tr('col.client'), tr('col.loan'), tr('col.currency'), tr('col.debit'), tr('col.credit'), tr('col.bank'), tr('col.reference')]);

    // FIX: usar date() para que BETWEEN funcione con fechas ISO completas
    // (sin date() '2026-06-30T15:00:00Z' > '2026-06-30' lexicograficamente).
    const disbursements = db.prepare(`
      SELECT l.disbursement_date as fecha, l.loan_number, l.disbursed_amount as monto,
             l.currency as currency,
             c.full_name as cliente, b.bank_name as cuenta
      FROM loans l
      LEFT JOIN clients c ON c.id = l.client_id
      LEFT JOIN bank_accounts b ON b.id = l.disbursement_bank_account_id
      WHERE l.tenant_id=? AND l.is_voided=0
        AND date(l.disbursement_date) BETWEEN date(?) AND date(?)
      ORDER BY l.disbursement_date
    `).all(req.tenant.id, from, to) as any[];
    for (const d of disbursements) {
      // FIX: desembolso es SALIDA de banco → Haber, no Debe (estaba invertido).
      csv += csvLine([formatDate(d.fecha), formatTime(d.fecha), tr('type.disbursement'), `${tr('concept.loan')} ${d.loan_number}`, d.cliente || '', d.loan_number, d.currency || 'DOP', 0, d.monto, d.cuenta || '', d.loan_number]);
    }

    // FIX: filtrar pagos contra prestamos anulados (l.is_voided=0).
    const payments = db.prepare(`
      SELECT p.payment_date as fecha, p.payment_number, p.amount as monto,
             p.currency as currency,
             c.full_name as cliente, l.loan_number, b.bank_name as cuenta
      FROM payments p
      LEFT JOIN loans l ON l.id = p.loan_id
      LEFT JOIN clients c ON c.id = l.client_id
      LEFT JOIN bank_accounts b ON b.id = p.bank_account_id
      WHERE p.tenant_id=? AND p.is_voided=0
        AND (l.is_voided IS NULL OR l.is_voided=0)
        AND date(p.payment_date) BETWEEN date(?) AND date(?)
      ORDER BY p.payment_date
    `).all(req.tenant.id, from, to) as any[];
    for (const p of payments) {
      // FIX: pago recibido es ENTRADA al banco → Debe, no Haber (estaba invertido).
      csv += csvLine([formatDate(p.fecha), formatTime(p.fecha), tr('type.payment'), `${tr('concept.payment')} ${p.payment_number}`, p.cliente || '', p.loan_number || '', p.currency || 'DOP', p.monto, 0, p.cuenta || '', p.payment_number]);
    }

    const incomes = db.prepare(`
      SELECT i.transaction_date as fecha, i.amount as monto, i.category, i.description, b.bank_name as cuenta,
             COALESCE(b.currency, 'DOP') as currency
      FROM income_expenses i
      LEFT JOIN bank_accounts b ON b.id = i.bank_account_id
      WHERE i.tenant_id=? AND i.type='income'
        AND date(i.transaction_date) BETWEEN date(?) AND date(?)
      ORDER BY i.transaction_date
    `).all(req.tenant.id, from, to) as any[];
    for (const i of incomes) {
      // Ingreso es entrada al banco → Debe (esto ya estaba correcto en la version vieja como Haber, ahora coherente con desembolso/pago).
      csv += csvLine([formatDate(i.fecha), formatTime(i.fecha), tr('type.income'), `${i.category}${i.description ? ': '+i.description : ''}`, '', '', i.currency, i.monto, 0, i.cuenta || '', '']);
    }

    const expenses = db.prepare(`
      SELECT i.transaction_date as fecha, i.amount as monto, i.category, i.description, b.bank_name as cuenta,
             COALESCE(b.currency, 'DOP') as currency
      FROM income_expenses i
      LEFT JOIN bank_accounts b ON b.id = i.bank_account_id
      WHERE i.tenant_id=? AND i.type='expense'
        AND date(i.transaction_date) BETWEEN date(?) AND date(?)
      ORDER BY i.transaction_date
    `).all(req.tenant.id, from, to) as any[];
    for (const e of expenses) {
      // Gasto es salida del banco → Haber (coherente).
      csv += csvLine([formatDate(e.fecha), formatTime(e.fecha), tr('type.expense'), `${e.category}${e.description ? ': '+e.description : ''}`, '', '', e.currency, 0, e.monto, e.cuenta || '', '']);
    }

    sendCsv(res, `${tr('file.journal')}_${from}_${to}.csv`, csv);
  } catch (e: any) {
    console.error('journal export error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

router.get('/by-account', authenticate, requireTenant, requirePermission('reports.dashboard'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { from, to } = parseDateRange(req);
    const tr = reportT(getReportLang(req));
    // FIX (Jun 2026): header generico 'Monto' en vez de 'RD$' fijo. Cada cuenta
    // tiene su propia moneda y los totales NO se convierten (saldos en su moneda nativa).
    let csv = csvLine([tr('col.bank'), tr('col.bank_name'), tr('col.currency'), tr('col.inflows'), tr('col.outflows'), tr('col.net'), tr('col.movements'), tr('col.opening'), tr('col.closing')]);

    const accounts = db.prepare(`SELECT id, bank_name, account_number, currency, initial_balance, current_balance FROM bank_accounts WHERE tenant_id=?`).all(req.tenant.id) as any[];
    for (const acc of accounts) {
      // FIX: usar date() para BETWEEN funcione con timestamps ISO.
      // FIX: filtrar payments contra prestamos anulados.
      const pagosIn = (db.prepare(`
        SELECT COALESCE(SUM(p.amount),0) as t, COUNT(*) as c
        FROM payments p
        LEFT JOIN loans l ON l.id = p.loan_id
        WHERE p.tenant_id=? AND p.bank_account_id=? AND p.is_voided=0
          AND (l.is_voided IS NULL OR l.is_voided=0)
          AND date(p.payment_date) BETWEEN date(?) AND date(?)
      `).get(req.tenant.id, acc.id, from, to) as any);
      const incomesIn = (db.prepare(`
        SELECT COALESCE(SUM(amount),0) as t, COUNT(*) as c
        FROM income_expenses
        WHERE tenant_id=? AND bank_account_id=? AND type='income'
          AND date(transaction_date) BETWEEN date(?) AND date(?)
      `).get(req.tenant.id, acc.id, from, to) as any);
      const desembolsos = (db.prepare(`
        SELECT COALESCE(SUM(disbursed_amount),0) as t, COUNT(*) as c
        FROM loans
        WHERE tenant_id=? AND disbursement_bank_account_id=? AND is_voided=0
          AND date(disbursement_date) BETWEEN date(?) AND date(?)
      `).get(req.tenant.id, acc.id, from, to) as any);
      const gastos = (db.prepare(`
        SELECT COALESCE(SUM(amount),0) as t, COUNT(*) as c
        FROM income_expenses
        WHERE tenant_id=? AND bank_account_id=? AND type='expense'
          AND date(transaction_date) BETWEEN date(?) AND date(?)
      `).get(req.tenant.id, acc.id, from, to) as any);
      const entradas = (pagosIn.t || 0) + (incomesIn.t || 0);
      const salidas = (desembolsos.t || 0) + (gastos.t || 0);
      const movs = (pagosIn.c || 0) + (incomesIn.c || 0) + (desembolsos.c || 0) + (gastos.c || 0);
      csv += csvLine([
        `${acc.bank_name} ${acc.account_number || ''}`,
        acc.bank_name, acc.currency || 'DOP',
        entradas.toFixed(2), salidas.toFixed(2), (entradas - salidas).toFixed(2),
        movs,
        Number(acc.initial_balance || 0).toFixed(2),
        Number(acc.current_balance || 0).toFixed(2),
      ]);
    }

    sendCsv(res, `${tr('file.by_account')}_${from}_${to}.csv`, csv);
  } catch (e: any) {
    console.error('by-account export error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

router.get('/summary', authenticate, requireTenant, requirePermission('reports.dashboard'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { from, to } = parseDateRange(req);
    const tr = reportT(getReportLang(req));

    // FIX (Jun 2026): agrupar por moneda. NO sumamos DOP+USD.
    // FIX: date() en BETWEEN. Filtrar pagos contra prestamos anulados.

    // Lista de monedas presentes en este tenant
    const currenciesRows = db.prepare(`
      SELECT DISTINCT currency FROM (
        SELECT COALESCE(currency,'DOP') as currency FROM payments WHERE tenant_id=?
        UNION
        SELECT COALESCE(currency,'DOP') as currency FROM loans WHERE tenant_id=?
        UNION
        SELECT COALESCE(b.currency,'DOP') as currency FROM income_expenses i
          LEFT JOIN bank_accounts b ON b.id=i.bank_account_id WHERE i.tenant_id=?
      )
    `).all(req.tenant.id, req.tenant.id, req.tenant.id) as any[];
    const currencies = currenciesRows.map(r => r.currency).filter(Boolean);
    if (currencies.length === 0) currencies.push('DOP');

    let csv = csvLine([tr('col.concept'), tr('col.currency'), tr('col.amount'), tr('col.detail')]);
    csv += csvLine([`${from} → ${to}`, '', '', '']);
    csv += '\n';

    for (const cur of currencies) {
      const interestMora = (db.prepare(`
        SELECT COALESCE(SUM(p.applied_interest),0) as interest,
               COALESCE(SUM(p.applied_mora),0) as mora,
               COUNT(*) as cnt
        FROM payments p
        LEFT JOIN loans l ON l.id = p.loan_id
        WHERE p.tenant_id=? AND p.is_voided=0
          AND COALESCE(p.currency,'DOP')=?
          AND (l.is_voided IS NULL OR l.is_voided=0)
          AND date(p.payment_date) BETWEEN date(?) AND date(?)
      `).get(req.tenant.id, cur, from, to) as any);

      const capital = (db.prepare(`
        SELECT COALESCE(SUM(p.applied_capital),0) as v
        FROM payments p
        LEFT JOIN loans l ON l.id = p.loan_id
        WHERE p.tenant_id=? AND p.is_voided=0
          AND COALESCE(p.currency,'DOP')=?
          AND (l.is_voided IS NULL OR l.is_voided=0)
          AND date(p.payment_date) BETWEEN date(?) AND date(?)
      `).get(req.tenant.id, cur, from, to) as any);

      const desembolsos = (db.prepare(`
        SELECT COALESCE(SUM(disbursed_amount),0) as v, COUNT(*) as c
        FROM loans
        WHERE tenant_id=? AND is_voided=0
          AND COALESCE(currency,'DOP')=?
          AND date(disbursement_date) BETWEEN date(?) AND date(?)
      `).get(req.tenant.id, cur, from, to) as any);

      const otherIncomes = (db.prepare(`
        SELECT COALESCE(SUM(i.amount),0) as v, COUNT(*) as c
        FROM income_expenses i
        LEFT JOIN bank_accounts b ON b.id=i.bank_account_id
        WHERE i.tenant_id=? AND i.type='income'
          AND COALESCE(b.currency,'DOP')=?
          AND date(i.transaction_date) BETWEEN date(?) AND date(?)
      `).get(req.tenant.id, cur, from, to) as any);

      const expenses = (db.prepare(`
        SELECT COALESCE(SUM(i.amount),0) as v, COUNT(*) as c, i.category
        FROM income_expenses i
        LEFT JOIN bank_accounts b ON b.id=i.bank_account_id
        WHERE i.tenant_id=? AND i.type='expense'
          AND COALESCE(b.currency,'DOP')=?
          AND date(i.transaction_date) BETWEEN date(?) AND date(?)
        GROUP BY i.category
      `).all(req.tenant.id, cur, from, to) as any[]);

      const totalExpenses = expenses.reduce((s, e) => s + (e.v || 0), 0);
      const grossIncome = (interestMora.interest || 0) + (interestMora.mora || 0) + (otherIncomes.v || 0);
      const netIncome = grossIncome - totalExpenses;

      // Saltar moneda completamente vacia
      if (grossIncome === 0 && totalExpenses === 0 && (desembolsos.v || 0) === 0 && (capital.v || 0) === 0) continue;

      csv += csvLine([`=== ${cur} ===`, '', '', '']);
      csv += csvLine([tr('sum.income'), cur, '', '']);
      csv += csvLine([tr('sum.interest'), cur, (interestMora.interest || 0).toFixed(2), tr('d.payments', interestMora.cnt)]);
      csv += csvLine([tr('sum.mora'), cur, (interestMora.mora || 0).toFixed(2), '']);
      csv += csvLine([tr('sum.other_income'), cur, (otherIncomes.v || 0).toFixed(2), tr('d.entries', otherIncomes.c || 0)]);
      csv += csvLine([tr('sum.total_gross'), cur, grossIncome.toFixed(2), '']);
      csv += '\n';
      csv += csvLine([tr('sum.expenses_cat'), cur, '', '']);
      for (const e of expenses) {
        csv += csvLine([`  ${e.category}`, cur, (e.v || 0).toFixed(2), tr('d.movements', e.c)]);
      }
      csv += csvLine([tr('sum.total_expenses'), cur, totalExpenses.toFixed(2), '']);
      csv += '\n';
      csv += csvLine([tr('sum.net'), cur, netIncome.toFixed(2), grossIncome ? tr('d.margin', ((netIncome/grossIncome)*100).toFixed(1)) : '']);
      csv += '\n';
      csv += csvLine([tr('sum.additional'), cur, '', '']);
      csv += csvLine([tr('sum.capital_out'), cur, (desembolsos.v || 0).toFixed(2), tr('d.loans', desembolsos.c)]);
      csv += csvLine([tr('sum.capital_back'), cur, (capital.v || 0).toFixed(2), tr('d.amortization')]);
      csv += '\n';
    }

    sendCsv(res, `${tr('file.summary')}_${from}_${to}.csv`, csv);
  } catch (e: any) {
    console.error('summary export error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

export default router;

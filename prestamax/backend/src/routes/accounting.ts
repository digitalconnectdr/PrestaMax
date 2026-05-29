// accounting — exports CSV de contabilidad mensual
// 3 endpoints:
//   GET /api/accounting/journal?from=&to=  — libro diario (todos los movimientos)
//   GET /api/accounting/by-account?from=&to= — mayor por cuenta bancaria
//   GET /api/accounting/summary?from=&to= — P&L resumido del periodo
// Todos devuelven CSV. Multi-tenant: filtran por req.tenant.id

import { Router, Response } from 'express';
import { getDb } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';

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
    let csv = csvLine(['Fecha', 'Hora', 'Tipo', 'Concepto', 'Cliente', 'Prestamo', 'Debe (RD$)', 'Haber (RD$)', 'Cuenta Bancaria', 'Referencia']);

    const disbursements = db.prepare(`
      SELECT l.disbursement_date as fecha, l.loan_number, l.disbursed_amount as monto,
             c.full_name as cliente, b.bank_name as cuenta
      FROM loans l
      LEFT JOIN clients c ON c.id = l.client_id
      LEFT JOIN bank_accounts b ON b.id = l.disbursement_bank_account_id
      WHERE l.tenant_id=? AND l.is_voided=0
        AND l.disbursement_date BETWEEN ? AND ?
      ORDER BY l.disbursement_date
    `).all(req.tenant.id, from, to) as any[];
    for (const d of disbursements) {
      csv += csvLine([formatDate(d.fecha), formatTime(d.fecha), 'Desembolso', `Préstamo ${d.loan_number}`, d.cliente || '', d.loan_number, d.monto, 0, d.cuenta || '', d.loan_number]);
    }

    const payments = db.prepare(`
      SELECT p.payment_date as fecha, p.payment_number, p.amount as monto,
             c.full_name as cliente, l.loan_number, b.bank_name as cuenta
      FROM payments p
      LEFT JOIN loans l ON l.id = p.loan_id
      LEFT JOIN clients c ON c.id = l.client_id
      LEFT JOIN bank_accounts b ON b.id = p.bank_account_id
      WHERE p.tenant_id=? AND p.is_voided=0
        AND p.payment_date BETWEEN ? AND ?
      ORDER BY p.payment_date
    `).all(req.tenant.id, from, to) as any[];
    for (const p of payments) {
      csv += csvLine([formatDate(p.fecha), formatTime(p.fecha), 'Pago Recibido', `Pago ${p.payment_number}`, p.cliente || '', p.loan_number || '', 0, p.monto, p.cuenta || '', p.payment_number]);
    }

    const incomes = db.prepare(`
      SELECT i.transaction_date as fecha, i.amount as monto, i.category, i.description, b.bank_name as cuenta
      FROM income_expenses i
      LEFT JOIN bank_accounts b ON b.id = i.bank_account_id
      WHERE i.tenant_id=? AND i.type='income'
        AND i.transaction_date BETWEEN ? AND ?
      ORDER BY i.transaction_date
    `).all(req.tenant.id, from, to) as any[];
    for (const i of incomes) {
      csv += csvLine([formatDate(i.fecha), formatTime(i.fecha), 'Ingreso', `${i.category}${i.description ? ': '+i.description : ''}`, '', '', 0, i.monto, i.cuenta || '', '']);
    }

    const expenses = db.prepare(`
      SELECT i.transaction_date as fecha, i.amount as monto, i.category, i.description, b.bank_name as cuenta
      FROM income_expenses i
      LEFT JOIN bank_accounts b ON b.id = i.bank_account_id
      WHERE i.tenant_id=? AND i.type='expense'
        AND i.transaction_date BETWEEN ? AND ?
      ORDER BY i.transaction_date
    `).all(req.tenant.id, from, to) as any[];
    for (const e of expenses) {
      csv += csvLine([formatDate(e.fecha), formatTime(e.fecha), 'Gasto', `${e.category}${e.description ? ': '+e.description : ''}`, '', '', e.monto, 0, e.cuenta || '', '']);
    }

    sendCsv(res, `libro-diario_${from}_${to}.csv`, csv);
  } catch (e: any) {
    console.error('journal export error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

router.get('/by-account', authenticate, requireTenant, requirePermission('reports.dashboard'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { from, to } = parseDateRange(req);
    let csv = csvLine(['Cuenta Bancaria', 'Banco', 'Moneda', 'Entradas (RD$)', 'Salidas (RD$)', 'Neto (RD$)', '# Movimientos']);

    const accounts = db.prepare(`SELECT id, bank_name, account_number, currency FROM bank_accounts WHERE tenant_id=?`).all(req.tenant.id) as any[];
    for (const acc of accounts) {
      const pagosIn = (db.prepare(`SELECT COALESCE(SUM(amount),0) as t, COUNT(*) as c FROM payments WHERE tenant_id=? AND bank_account_id=? AND is_voided=0 AND payment_date BETWEEN ? AND ?`).get(req.tenant.id, acc.id, from, to) as any);
      const incomesIn = (db.prepare(`SELECT COALESCE(SUM(amount),0) as t, COUNT(*) as c FROM income_expenses WHERE tenant_id=? AND bank_account_id=? AND type='income' AND transaction_date BETWEEN ? AND ?`).get(req.tenant.id, acc.id, from, to) as any);
      const desembolsos = (db.prepare(`SELECT COALESCE(SUM(disbursed_amount),0) as t, COUNT(*) as c FROM loans WHERE tenant_id=? AND disbursement_bank_account_id=? AND is_voided=0 AND disbursement_date BETWEEN ? AND ?`).get(req.tenant.id, acc.id, from, to) as any);
      const gastos = (db.prepare(`SELECT COALESCE(SUM(amount),0) as t, COUNT(*) as c FROM income_expenses WHERE tenant_id=? AND bank_account_id=? AND type='expense' AND transaction_date BETWEEN ? AND ?`).get(req.tenant.id, acc.id, from, to) as any);
      const entradas = (pagosIn.t || 0) + (incomesIn.t || 0);
      const salidas = (desembolsos.t || 0) + (gastos.t || 0);
      const movs = (pagosIn.c || 0) + (incomesIn.c || 0) + (desembolsos.c || 0) + (gastos.c || 0);
      csv += csvLine([`${acc.bank_name} ${acc.account_number || ''}`, acc.bank_name, acc.currency || 'DOP', entradas.toFixed(2), salidas.toFixed(2), (entradas - salidas).toFixed(2), movs]);
    }

    sendCsv(res, `mayor-por-cuenta_${from}_${to}.csv`, csv);
  } catch (e: any) {
    console.error('by-account export error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

router.get('/summary', authenticate, requireTenant, requirePermission('reports.dashboard'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { from, to } = parseDateRange(req);
    const interestMora = (db.prepare(`SELECT COALESCE(SUM(applied_interest), 0) as interest, COALESCE(SUM(applied_mora), 0) as mora, COUNT(*) as cnt FROM payments WHERE tenant_id=? AND is_voided=0 AND payment_date BETWEEN ? AND ?`).get(req.tenant.id, from, to) as any);
    const capital = (db.prepare(`SELECT COALESCE(SUM(applied_capital), 0) as v FROM payments WHERE tenant_id=? AND is_voided=0 AND payment_date BETWEEN ? AND ?`).get(req.tenant.id, from, to) as any);
    const desembolsos = (db.prepare(`SELECT COALESCE(SUM(disbursed_amount), 0) as v, COUNT(*) as c FROM loans WHERE tenant_id=? AND is_voided=0 AND disbursement_date BETWEEN ? AND ?`).get(req.tenant.id, from, to) as any);
    const otherIncomes = (db.prepare(`SELECT COALESCE(SUM(amount),0) as v, COUNT(*) as c FROM income_expenses WHERE tenant_id=? AND type='income' AND transaction_date BETWEEN ? AND ?`).get(req.tenant.id, from, to) as any);
    const expenses = (db.prepare(`SELECT COALESCE(SUM(amount),0) as v, COUNT(*) as c, category FROM income_expenses WHERE tenant_id=? AND type='expense' AND transaction_date BETWEEN ? AND ? GROUP BY category`).all(req.tenant.id, from, to) as any[]);
    const totalExpenses = expenses.reduce((s, e) => s + (e.v || 0), 0);
    const grossIncome = (interestMora.interest || 0) + (interestMora.mora || 0) + (otherIncomes.v || 0);
    const netIncome = grossIncome - totalExpenses;

    let csv = csvLine(['Concepto', 'Monto (RD$)', 'Detalle']);
    csv += csvLine([`PERIODO: ${from} a ${to}`, '', '']);
    csv += '\n';
    csv += csvLine(['INGRESOS', '', '']);
    csv += csvLine(['  Interés cobrado', (interestMora.interest || 0).toFixed(2), `${interestMora.cnt} pagos`]);
    csv += csvLine(['  Mora cobrada', (interestMora.mora || 0).toFixed(2), '']);
    csv += csvLine(['  Otros ingresos', (otherIncomes.v || 0).toFixed(2), `${otherIncomes.c || 0} entradas`]);
    csv += csvLine(['TOTAL INGRESOS BRUTOS', grossIncome.toFixed(2), '']);
    csv += '\n';
    csv += csvLine(['GASTOS POR CATEGORIA', '', '']);
    for (const e of expenses) {
      csv += csvLine([`  ${e.category}`, (e.v || 0).toFixed(2), `${e.c} movimientos`]);
    }
    csv += csvLine(['TOTAL GASTOS', totalExpenses.toFixed(2), '']);
    csv += '\n';
    csv += csvLine(['UTILIDAD NETA', netIncome.toFixed(2), grossIncome ? `${((netIncome/grossIncome)*100).toFixed(1)}% margen` : '']);
    csv += '\n';
    csv += csvLine(['INFORMACION ADICIONAL', '', '']);
    csv += csvLine(['  Capital desembolsado', (desembolsos.v || 0).toFixed(2), `${desembolsos.c} préstamos`]);
    csv += csvLine(['  Capital recuperado', (capital.v || 0).toFixed(2), 'amortización a capital']);

    sendCsv(res, `resumen-financiero_${from}_${to}.csv`, csv);
  } catch (e: any) {
    console.error('summary export error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

export default router;

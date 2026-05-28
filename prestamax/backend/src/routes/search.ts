// search — endpoint de busqueda global por tenant
// GET /api/search?q=<query>&limit=10 → { clients, loans, payments }
// Busca en nombre, cedula, telefono, numero de prestamo, numero de pago
// Multi-tenant: SIEMPRE filtra por req.tenant.id

import { Router, Response } from 'express';
import { getDb } from '../db/database';
import { authenticate, requireTenant, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, requireTenant, (req: AuthRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(parseInt(String(req.query.limit || '10'), 10) || 10, 25);
    if (q.length < 2) return res.json({ clients: [], loans: [], payments: [] });

    const db = getDb();
    const tenantId = req.tenant.id;
    const like = `%${q}%`;

    // Clientes: buscar en full_name, id_number, phone_personal, whatsapp
    const clients = db.prepare(`
      SELECT id, full_name, id_number, phone_personal, whatsapp, is_active
      FROM clients
      WHERE tenant_id=? AND (
        full_name LIKE ? OR id_number LIKE ? OR
        phone_personal LIKE ? OR whatsapp LIKE ?
      )
      ORDER BY is_active DESC, full_name ASC
      LIMIT ?
    `).all(tenantId, like, like, like, like, limit);

    // Prestamos: buscar por loan_number o por nombre de cliente del prestamo
    const loans = db.prepare(`
      SELECT l.id, l.loan_number, l.status, l.total_balance, l.currency,
             c.full_name as client_name, c.id as client_id
      FROM loans l
      LEFT JOIN clients c ON c.id = l.client_id
      WHERE l.tenant_id=? AND l.is_voided=0 AND (
        l.loan_number LIKE ? OR c.full_name LIKE ?
      )
      ORDER BY l.disbursement_date DESC
      LIMIT ?
    `).all(tenantId, like, like, limit);

    // Pagos: buscar por payment_number o por nombre del cliente del prestamo
    const payments = db.prepare(`
      SELECT p.id, p.payment_number, p.amount, p.payment_date,
             l.loan_number, c.full_name as client_name,
             l.id as loan_id
      FROM payments p
      LEFT JOIN loans l ON l.id = p.loan_id
      LEFT JOIN clients c ON c.id = l.client_id
      WHERE p.tenant_id=? AND p.is_voided=0 AND (
        p.payment_number LIKE ? OR c.full_name LIKE ?
      )
      ORDER BY p.payment_date DESC
      LIMIT ?
    `).all(tenantId, like, like, limit);

    res.json({ clients, loans, payments });
  } catch (e: any) {
    console.error('search error:', e);
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

export default router;

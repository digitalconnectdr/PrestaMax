// onboarding — estado de "primeros pasos" del tenant (progreso automático).
// Detecta qué ya configuró el usuario para el checklist guiado del dashboard.
import { Router, Response } from 'express';
import { getDb } from '../db/database';
import { authenticate, AuthRequest, requireTenant, requirePermission } from '../middleware/auth';

const router = Router();

// "Primeros pasos" es del administrador de la empresa: exige settings.general (el
// permiso administrativo existente; owner/admin lo tienen, cobrador/investor/
// oficial/cajero no). El staff de plataforma conserva su bypass tecnico.
router.get('/status', authenticate, requireTenant, requirePermission('settings.general'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const tid = req.tenant.id;
    // Cuenta defensiva: si una tabla no existe o falla, devuelve false.
    const has = (table: string): boolean => {
      try {
        const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE tenant_id = ?`).get(tid) as any;
        return (row?.c || 0) > 0;
      } catch { return false; }
    };
    res.json({
      bankAccount:   has('bank_accounts'),
      product:       has('loan_products'),
      client:        has('clients'),
      loan:          has('loans'),
      payment:       has('payments'),
      publicRequest: has('loan_requests'),
      promise:       has('payment_promises'),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
});

export default router;

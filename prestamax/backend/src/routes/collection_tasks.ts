import { Router, Response } from 'express';
import { getDb, uuid, now } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

// ─── Helper: create notification for a user ──────────────────────────────────
function createNotification(db: any, tenantId: string, userId: string, type: string, title: string, message: string, entityId?: string) {
  try {
    db.prepare(
      `INSERT INTO notifications (id,tenant_id,user_id,type,title,message,entity_type,entity_id)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(uuid(), tenantId, userId, type, title, message, 'collection_task', entityId || null);
  } catch (_) { /* non-critical */ }
}

// ─── GET /collection-tasks — list tasks ──────────────────────────────────────
// Supervisors (collections.tasks.manage) see all tasks for the tenant.
// Collectors (collections.tasks) see only their assigned tasks.
router.get('/', authenticate, requireTenant, requirePermission('collections.tasks'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const { status, assigned_to, due_date, priority } = req.query as any;

    // Determine if this user can see all tasks or just their own
    const planRow = db.prepare('SELECT p.features FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.id=?').get(req.tenant.id) as any;
    const planFeatures: string[] = (() => { try { return JSON.parse(planRow?.features || '[]'); } catch(_) { return []; } })();
    const roles: string[] = (() => { try { return JSON.parse(req.membership?.roles || '[]'); } catch(_) { return []; } })();
    const explicit: Record<string,boolean> = (() => { try { return JSON.parse(req.membership?.permissions || '{}'); } catch(_) { return {}; } })();
    const { hasPermission } = require('../lib/permissions');
    const canManage = hasPermission(roles, explicit, 'collections.tasks.manage', planFeatures);
    const isPlatform = ['platform_owner','platform_admin','admin'].includes(req.user?.platform_role || '');

    let sql = `
      SELECT ct.*,
        u_assigned.full_name AS assigned_to_name,
        u_created.full_name  AS created_by_name,
        l.loan_number, c.full_name AS client_name
      FROM collection_tasks ct
      LEFT JOIN users u_assigned ON u_assigned.id = ct.assigned_to
      LEFT JOIN users u_created  ON u_created.id  = ct.created_by
      LEFT JOIN loans l          ON l.id           = ct.loan_id
      LEFT JOIN clients c        ON c.id           = ct.client_id
      WHERE ct.tenant_id = ?`;

    const params: any[] = [req.tenant.id];

    // Scope: if not manager, only own tasks
    if (!canManage && !isPlatform) {
      sql += ` AND ct.assigned_to = ?`;
      params.push(req.user.id);
    } else if (assigned_to) {
      sql += ` AND ct.assigned_to = ?`;
      params.push(assigned_to);
    }

    if (status) { sql += ` AND ct.status = ?`; params.push(status); }
    if (due_date) { sql += ` AND date(ct.due_date) = date(?)`; params.push(due_date); }
    if (priority) { sql += ` AND ct.priority = ?`; params.push(priority); }

    sql += ` ORDER BY
      CASE ct.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      ct.due_date ASC, ct.created_at DESC`;

    const tasks = db.prepare(sql).all(...params);
    res.json({ tasks, canManage: canManage || isPlatform });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// ─── GET /collection-tasks/collectors — list collectors for the tenant ────────
// Used to populate the "assign to" dropdown.
router.get('/collectors', authenticate, requireTenant, requirePermission('collections.tasks.manage'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const members = db.prepare(`
      SELECT u.id, u.full_name, u.email,
             tm.roles
      FROM tenant_memberships tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.tenant_id = ? AND tm.is_active = 1
      ORDER BY u.full_name ASC
    `).all(req.tenant.id) as any[];
    res.json(members);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// ─── POST /collection-tasks — create a new task ───────────────────────────────
router.post('/', authenticate, requireTenant, requirePermission('collections.tasks.manage'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const d = req.body;
    if (!d.title?.trim()) return res.status(400).json({ error: 'El título de la tarea es requerido.' });
    if (!d.assigned_to) return res.status(400).json({ error: 'Debe asignar la tarea a un cobrador.' });
    if (!d.due_date) return res.status(400).json({ error: 'La fecha límite es requerida.' });

    // Verify assigned user belongs to this tenant
    const membership = db.prepare('SELECT id FROM tenant_memberships WHERE user_id=? AND tenant_id=? AND is_active=1').get(d.assigned_to, req.tenant.id);
    if (!membership) return res.status(400).json({ error: 'El cobrador seleccionado no pertenece a esta empresa.' });

    const id = uuid();
    db.prepare(`
      INSERT INTO collection_tasks
        (id,tenant_id,assigned_to,created_by,loan_id,client_id,title,description,task_type,priority,due_date,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending')
    `).run(
      id, req.tenant.id, d.assigned_to, req.user.id,
      d.loan_id || null, d.client_id || null,
      d.title.trim(), d.description?.trim() || null,
      d.task_type || 'other', d.priority || 'medium', d.due_date
    );

    // Notify the assigned collector
    const assignedUser = db.prepare('SELECT full_name FROM users WHERE id=?').get(d.assigned_to) as any;
    const loan = d.loan_id ? db.prepare('SELECT loan_number FROM loans WHERE id=?').get(d.loan_id) as any : null;
    const loanSuffix = loan ? ` — Préstamo ${loan.loan_number}` : '';
    createNotification(
      db, req.tenant.id, d.assigned_to,
      'task_assigned',
      `Nueva tarea asignada: ${d.title}`,
      `${req.user.full_name} te asignó una tarea para el ${d.due_date.slice(0,10)}${loanSuffix}.`,
      id
    );

    const task = db.prepare(`
      SELECT ct.*, u_a.full_name AS assigned_to_name, u_c.full_name AS created_by_name,
             l.loan_number, c.full_name AS client_name
      FROM collection_tasks ct
      LEFT JOIN users u_a ON u_a.id = ct.assigned_to
      LEFT JOIN users u_c ON u_c.id = ct.created_by
      LEFT JOIN loans l   ON l.id   = ct.loan_id
      LEFT JOIN clients c ON c.id   = ct.client_id
      WHERE ct.id = ?
    `).get(id);
    res.status(201).json(task);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// ─── PUT /collection-tasks/:id — edit task (supervisor) ──────────────────────
router.put('/:id', authenticate, requireTenant, requirePermission('collections.tasks.manage'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM collection_tasks WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    if (['completed','cancelled'].includes(task.status)) return res.status(400).json({ error: 'No se puede editar una tarea completada o cancelada.' });

    const d = req.body;
    db.prepare(`
      UPDATE collection_tasks SET
        title=COALESCE(?,title), description=?, task_type=COALESCE(?,task_type),
        priority=COALESCE(?,priority), due_date=COALESCE(?,due_date),
        assigned_to=COALESCE(?,assigned_to), loan_id=?, client_id=?,
        updated_at=?
      WHERE id=? AND tenant_id=?
    `).run(
      d.title?.trim() || null, d.description?.trim() ?? task.description,
      d.task_type || null, d.priority || null, d.due_date || null,
      d.assigned_to || null,
      d.loan_id !== undefined ? (d.loan_id || null) : task.loan_id,
      d.client_id !== undefined ? (d.client_id || null) : task.client_id,
      now(), req.params.id, req.tenant.id
    );

    // If reassigned to a different user, notify the new assignee
    if (d.assigned_to && d.assigned_to !== task.assigned_to) {
      createNotification(
        db, req.tenant.id, d.assigned_to,
        'task_assigned',
        `Tarea reasignada: ${d.title || task.title}`,
        `${req.user.full_name} te reasignó una tarea.`,
        req.params.id
      );
    }

    const updated = db.prepare(`
      SELECT ct.*, u_a.full_name AS assigned_to_name, u_c.full_name AS created_by_name,
             l.loan_number, c.full_name AS client_name
      FROM collection_tasks ct
      LEFT JOIN users u_a ON u_a.id = ct.assigned_to
      LEFT JOIN users u_c ON u_c.id = ct.created_by
      LEFT JOIN loans l   ON l.id   = ct.loan_id
      LEFT JOIN clients c ON c.id   = ct.client_id
      WHERE ct.id = ?
    `).get(req.params.id);
    res.json(updated);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// ─── PATCH /collection-tasks/:id/status — collector updates status ────────────
router.patch('/:id/status', authenticate, requireTenant, requirePermission('collections.tasks'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM collection_tasks WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });

    const { status, result_notes } = req.body;
    const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Estado inválido.' });

    // Collectors can only update their own tasks (unless they have manage permission)
    const planRow = db.prepare('SELECT p.features FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.id=?').get(req.tenant.id) as any;
    const planFeatures: string[] = (() => { try { return JSON.parse(planRow?.features || '[]'); } catch(_) { return []; } })();
    const roles: string[] = (() => { try { return JSON.parse(req.membership?.roles || '[]'); } catch(_) { return []; } })();
    const explicit: Record<string,boolean> = (() => { try { return JSON.parse(req.membership?.permissions || '{}'); } catch(_) { return {}; } })();
    const { hasPermission } = require('../lib/permissions');
    const canManage = hasPermission(roles, explicit, 'collections.tasks.manage', planFeatures);
    const isPlatform = ['platform_owner','platform_admin','admin'].includes(req.user?.platform_role || '');

    if (!canManage && !isPlatform && task.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Solo puedes actualizar tus propias tareas.' });
    }

    const isCompleting = status === 'completed';
    db.prepare(`
      UPDATE collection_tasks SET
        status=?, result_notes=COALESCE(?,result_notes),
        completed_at=?, completed_by=?, updated_at=?
      WHERE id=? AND tenant_id=?
    `).run(
      status,
      result_notes?.trim() || null,
      isCompleting ? now() : null,
      isCompleting ? req.user.id : null,
      now(), req.params.id, req.tenant.id
    );

    // If completed, notify the task creator (supervisor)
    if (isCompleting && task.created_by !== req.user.id) {
      createNotification(
        db, req.tenant.id, task.created_by,
        'task_completed',
        `Tarea completada: ${task.title}`,
        `${req.user.full_name} marcó la tarea como completada.${result_notes ? ` Resultado: ${result_notes}` : ''}`,
        req.params.id
      );
    }

    const updated = db.prepare(`
      SELECT ct.*, u_a.full_name AS assigned_to_name, u_c.full_name AS created_by_name,
             l.loan_number, c.full_name AS client_name
      FROM collection_tasks ct
      LEFT JOIN users u_a ON u_a.id = ct.assigned_to
      LEFT JOIN users u_c ON u_c.id = ct.created_by
      LEFT JOIN loans l   ON l.id   = ct.loan_id
      LEFT JOIN clients c ON c.id   = ct.client_id
      WHERE ct.id = ?
    `).get(req.params.id);
    res.json(updated);
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

// ─── DELETE /collection-tasks/:id ────────────────────────────────────────────
router.delete('/:id', authenticate, requireTenant, requirePermission('collections.tasks.manage'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const task = db.prepare('SELECT * FROM collection_tasks WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!task) return res.status(404).json({ error: 'Tarea no encontrada.' });
    db.prepare('DELETE FROM collection_tasks WHERE id=? AND tenant_id=?').run(req.params.id, req.tenant.id);
    res.json({ success: true });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

export default router;

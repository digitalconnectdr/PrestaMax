import { Router, Response } from 'express';
import { getDb, uuid, now } from '../db/database';
import { authenticate, requireTenant, requirePermission, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', authenticate, requireTenant, requirePermission('clients.view'), (req: AuthRequest, res: Response) => {
  try {
    const { search, is_active, page = '1', limit = '20' } = req.query as any;
    const skip = (parseInt(page)-1) * parseInt(limit);
    const db = getDb();
    let where = 'WHERE c.tenant_id = ?';
    const params: any[] = [req.tenant.id];
    if (is_active !== undefined) { where += ' AND c.is_active = ?'; params.push(is_active === 'true' ? 1 : 0); }
    if (search) { where += ' AND (c.full_name LIKE ? OR c.id_number LIKE ? OR c.phone_personal LIKE ?)'; const s = `%${search}%`; params.push(s,s,s); }
    const total = (db.prepare(`SELECT COUNT(*) as c FROM clients c ${where}`).get(...params) as any).c;
    const data = db.prepare(`
      SELECT c.*, (SELECT COUNT(*) FROM loans WHERE client_id=c.id) as loan_count
      FROM clients c ${where} ORDER BY c.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), skip);
    res.json({ data, total, page: parseInt(page), limit: parseInt(limit) });
  } catch(e) { console.error(e); res.status(500).json({ error: 'Failed to get clients' }); }
});

router.post('/', authenticate, requireTenant, requirePermission('clients.create'), (req: AuthRequest, res: Response) => {
  try {
    const d = req.body;
    const db = getDb();
    const count = (db.prepare('SELECT COUNT(*) as c FROM clients WHERE tenant_id=?').get(req.tenant.id) as any).c;

    // ── Plan limit check ──────────────────────────────────────────────────────
    const plan = db.prepare(`
      SELECT p.max_clients FROM tenants t LEFT JOIN plans p ON p.id=t.plan_id WHERE t.id=?
    `).get(req.tenant.id) as any;
    if (plan?.max_clients !== -1 && plan?.max_clients != null && count >= plan.max_clients) {
      return res.status(403).json({
        error: `Tu plan permite un máximo de ${plan.max_clients} cliente(s). Actualiza tu plan para agregar más.`,
        code: 'PLAN_LIMIT_CLIENTS'
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const id = uuid();
    const client_number = `CLI-${String(count+1).padStart(5,'0')}`;
    const full_name = `${d.first_name} ${d.last_name}`;
    db.prepare(`INSERT INTO clients (id,tenant_id,client_number,full_name,first_name,last_name,id_type,id_number,
      birth_date,gender,marital_status,phone_personal,phone_work,phone_family,family_contact_name,family_relationship,
      whatsapp,email,address,city,province,occupation,employer,work_address,economic_activity,monthly_income,other_income,
      notes,consent_data_processing,consent_whatsapp) VALUES
      (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      id,req.tenant.id,client_number,full_name,d.first_name,d.last_name,
      d.id_type||'cedula',d.id_number,d.birth_date||null,d.gender||null,d.marital_status||null,
      d.phone_personal||null,d.phone_work||null,d.phone_family||null,d.family_contact_name||null,d.family_relationship||null,
      d.whatsapp||null,d.email||null,d.address||null,d.city||null,d.province||null,
      d.occupation||null,d.employer||null,d.work_address||null,d.economic_activity||null,d.monthly_income||null,d.other_income||null,
      d.notes||null,d.consent_data_processing?1:0,d.consent_whatsapp?1:0
    );
    db.prepare('INSERT INTO audit_logs (id,tenant_id,user_id,user_name,action,entity_type,entity_id,description) VALUES (?,?,?,?,?,?,?,?)').run(uuid(),req.tenant.id,req.user.id,req.user.full_name,'created','client',id,`Creó el cliente: ${full_name}`);
    res.status(201).json(db.prepare('SELECT * FROM clients WHERE id=?').get(id));
  } catch(e:any) {
    if (e.code==='SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Ya existe un cliente con ese número de documento' });
    console.error(e); res.status(500).json({ error: 'Failed to create client' });
  }
});

router.get('/:id', authenticate, requireTenant, requirePermission('clients.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const client = db.prepare('SELECT * FROM clients WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    client.loans = db.prepare(`SELECT l.*, p.name as product_name, p.type as product_type FROM loans l JOIN loan_products p ON p.id=l.product_id WHERE l.client_id=? ORDER BY l.created_at DESC`).all(client.id);
    client.references = db.prepare('SELECT * FROM client_references WHERE client_id=?').all(client.id);
    client.guarantors = db.prepare('SELECT * FROM guarantors WHERE client_id=?').all(client.id);
    client.documents = db.prepare('SELECT * FROM client_documents WHERE client_id=?').all(client.id);
    res.json(client);
  } catch(e) { res.status(500).json({ error: 'Failed to get client' }); }
});

router.put('/:id', authenticate, requireTenant, requirePermission('clients.edit'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const d = req.body;
    const fn = d.first_name && d.last_name ? `${d.first_name} ${d.last_name}` : undefined;
    db.prepare(`UPDATE clients SET first_name=COALESCE(?,first_name), last_name=COALESCE(?,last_name),
      full_name=COALESCE(?,full_name), phone_personal=COALESCE(?,phone_personal), phone_work=COALESCE(?,phone_work),
      phone_family=COALESCE(?,phone_family), whatsapp=COALESCE(?,whatsapp), email=COALESCE(?,email),
      address=COALESCE(?,address), city=COALESCE(?,city), province=COALESCE(?,province),
      occupation=COALESCE(?,occupation), employer=COALESCE(?,employer),work_address=COALESCE(?,work_address), monthly_income=COALESCE(?,monthly_income),
      notes=COALESCE(?,notes), updated_at=? WHERE id=? AND tenant_id=?`).run(
      d.first_name,d.last_name,fn,d.phone_personal,d.phone_work,d.phone_family,d.whatsapp,d.email,
      d.address,d.city,d.province,d.occupation,d.employer,d.monthly_income,d.notes,now(),req.params.id,req.tenant.id
    );
    res.json(db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id));
  } catch(e) { res.status(500).json({ error: 'Failed to update client' }); }
});

router.delete('/:id', authenticate, requireTenant, requirePermission('clients.delete'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    db.prepare('UPDATE clients SET is_active=0, updated_at=? WHERE id=? AND tenant_id=?').run(now(),req.params.id,req.tenant.id);
    res.json({ message: 'Cliente desactivado' });
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/:id/references', authenticate, requireTenant, requirePermission('clients.edit'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const id = uuid();
    const d = req.body;
    db.prepare('INSERT INTO client_references (id,client_id,type,full_name,phone,relationship,employer) VALUES (?,?,?,?,?,?,?)').run(id,req.params.id,d.type||'personal',d.full_name,d.phone,d.relationship,d.employer);
    res.status(201).json(db.prepare('SELECT * FROM client_references WHERE id=?').get(id));
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.post('/:id/guarantors', authenticate, requireTenant, requirePermission('clients.edit'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const id = uuid();
    const d = req.body;
    db.prepare('INSERT INTO guarantors (id,client_id,full_name,id_number,phone,address) VALUES (?,?,?,?,?,?)').run(id,req.params.id,d.full_name,d.id_number,d.phone,d.address);
    res.status(201).json(db.prepare('SELECT * FROM guarantors WHERE id=?').get(id));
  } catch(e) { res.status(500).json({ error: 'Failed' }); }
});

router.get('/:id/score', authenticate, requireTenant, requirePermission('clients.view'), (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    const client = db.prepare('SELECT * FROM clients WHERE id=? AND tenant_id=?').get(req.params.id, req.tenant.id) as any;
    if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
    const loans = db.prepare('SELECT * FROM loans WHERE client_id=?').all(client.id) as any[];
    const installments = loans.length ? db.prepare(`SELECT * FROM installments WHERE loan_id IN (${loans.map(()=>'?').join(',')})`)
      .all(...loans.map((l:any)=>l.id)) as any[] : [];
    const paidLoans = loans.filter((l:any)=>l.status==='liquidated').length;
    const lateInst = installments.filter((i:any)=>i.mora_days > 0 || i.status==='overdue').length;
    const total = installments.length || 1;
    const punctuality = 1 - (lateInst / total);
    const paidRatio = loans.length > 0 ? paidLoans / loans.length : 0;
    const ageMs = Date.now() - new Date(client.created_at).getTime();
    const ageMonths = Math.min(ageMs / (1000*60*60*24*30), 60);
    const ageYears = Math.min(ageMonths / 12, 5);
    const noMora = 1 - Math.min(lateInst/total,1);
    const raw = punctuality*0.4 + paidRatio*0.3 + (ageYears/5)*0.2 + noMora*0.1;
    const score = Math.max(1, Math.min(5, Math.round(raw*5)));
    res.json({ score, paidLoans, lateInstallments: lateInst, totalInstallments: total });
  } catch(e:any) { res.status(500).json({ error: e.message || 'Failed' }); }
});

export { router };

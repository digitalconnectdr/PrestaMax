import { DatabaseSync } from 'node:sqlite';
import path from 'path';

// DB path: env variable > local prestamax.db next to backend folder > Linux sandbox path
const DB_PATH = process.env.DATABASE_PATH ||
  path.join(__dirname, '..', '..', '..', 'prestamax.db');

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH);
    
    _db.exec('PRAGMA foreign_keys = ON');
  }
  return _db;
}

export function initializeDatabase(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      price_monthly REAL NOT NULL,
      max_collectors INTEGER NOT NULL DEFAULT -1,
      max_clients INTEGER NOT NULL DEFAULT -1,
      max_users INTEGER NOT NULL DEFAULT -1,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_trial_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      avatar_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      platform_role TEXT NOT NULL DEFAULT 'none',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      logo_url TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      currency TEXT NOT NULL DEFAULT 'DOP',
      timezone TEXT NOT NULL DEFAULT 'America/Santo_Domingo',
      plan_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      score_mode TEXT NOT NULL DEFAULT 'global',
      payment_order TEXT NOT NULL DEFAULT '["mora","charges","interest","capital"]',
      signature_mode TEXT NOT NULL DEFAULT 'physical',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tenant_settings (
      id TEXT PRIMARY KEY,
      tenant_id TEXT UNIQUE NOT NULL,
      mora_rate_daily REAL NOT NULL DEFAULT 0.001,
      mora_grace_days INTEGER NOT NULL DEFAULT 3,
      mora_max_rate REAL NOT NULL DEFAULT 0.30,
      rebate_enabled INTEGER NOT NULL DEFAULT 1,
      rebate_type TEXT NOT NULL DEFAULT 'proportional',
      rebate_rate REAL NOT NULL DEFAULT 0.0,
      score_w_punctuality REAL NOT NULL DEFAULT 0.40,
      score_w_paid_loans REAL NOT NULL DEFAULT 0.30,
      score_w_antiquity REAL NOT NULL DEFAULT 0.20,
      score_w_no_mora REAL NOT NULL DEFAULT 0.10,
      whatsapp_enabled INTEGER NOT NULL DEFAULT 0,
      whatsapp_api_key TEXT,
      whatsapp_phone TEXT,
      max_pending_for_refi INTEGER NOT NULL DEFAULT 2,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS tenant_memberships (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      roles TEXT NOT NULL DEFAULT '[]',
      permissions TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, tenant_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      client_number TEXT NOT NULL,
      full_name TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      id_type TEXT NOT NULL DEFAULT 'cedula',
      id_number TEXT NOT NULL,
      birth_date TEXT,
      gender TEXT,
      marital_status TEXT,
      phone_personal TEXT,
      phone_work TEXT,
      phone_family TEXT,
      family_contact_name TEXT,
      family_relationship TEXT,
      whatsapp TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      province TEXT,
      occupation TEXT,
      employer TEXT,
      economic_activity TEXT,
      monthly_income REAL,
      other_income REAL,
      photo_url TEXT,
      id_front_url TEXT,
      id_back_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      score INTEGER NOT NULL DEFAULT 3,
      score_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      consent_data_processing INTEGER NOT NULL DEFAULT 0,
      consent_whatsapp INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(tenant_id, id_number),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS client_references (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'personal',
      full_name TEXT NOT NULL,
      phone TEXT,
      relationship TEXT,
      employer TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS guarantors (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      full_name TEXT NOT NULL,
      id_number TEXT,
      phone TEXT,
      address TEXT,
      photo_url TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS client_documents (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    );

    CREATE TABLE IF NOT EXISTS loan_products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      min_amount REAL NOT NULL,
      max_amount REAL NOT NULL,
      rate REAL NOT NULL,
      rate_type TEXT NOT NULL DEFAULT 'monthly',
      min_term INTEGER NOT NULL,
      max_term INTEGER NOT NULL,
      term_unit TEXT NOT NULL DEFAULT 'months',
      payment_frequency TEXT NOT NULL DEFAULT 'monthly',
      amortization_type TEXT NOT NULL DEFAULT 'fixed_installment',
      disbursement_fee REAL NOT NULL DEFAULT 0,
      disbursement_fee_type TEXT NOT NULL DEFAULT 'percentage',
      mora_rate_daily REAL,
      mora_grace_days INTEGER,
      requires_guarantee INTEGER NOT NULL DEFAULT 0,
      requires_approval INTEGER NOT NULL DEFAULT 1,
      allows_prepayment INTEGER NOT NULL DEFAULT 1,
      rebate_policy TEXT NOT NULL DEFAULT 'proportional',
      is_san_type INTEGER NOT NULL DEFAULT 0,
      is_reditos INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      client_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      loan_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      requested_amount REAL NOT NULL,
      approved_amount REAL,
      disbursed_amount REAL,
      rate REAL NOT NULL,
      rate_type TEXT NOT NULL DEFAULT 'monthly',
      term INTEGER NOT NULL,
      term_unit TEXT NOT NULL DEFAULT 'months',
      payment_frequency TEXT NOT NULL DEFAULT 'monthly',
      amortization_type TEXT NOT NULL DEFAULT 'fixed_installment',
      application_date TEXT NOT NULL DEFAULT (datetime('now')),
      approval_date TEXT,
      disbursement_date TEXT,
      first_payment_date TEXT,
      maturity_date TEXT,
      actual_close_date TEXT,
      disbursement_fee REAL NOT NULL DEFAULT 0,
      insurance REAL NOT NULL DEFAULT 0,
      other_charges REAL NOT NULL DEFAULT 0,
      principal_balance REAL NOT NULL DEFAULT 0,
      interest_balance REAL NOT NULL DEFAULT 0,
      mora_balance REAL NOT NULL DEFAULT 0,
      charges_balance REAL NOT NULL DEFAULT 0,
      total_balance REAL NOT NULL DEFAULT 0,
      total_interest REAL NOT NULL DEFAULT 0,
      total_paid REAL NOT NULL DEFAULT 0,
      total_paid_principal REAL NOT NULL DEFAULT 0,
      total_paid_interest REAL NOT NULL DEFAULT 0,
      total_paid_mora REAL NOT NULL DEFAULT 0,
      days_overdue INTEGER NOT NULL DEFAULT 0,
      collector_id TEXT,
      purpose TEXT,
      notes TEXT,
      rejection_reason TEXT,
      is_restructured INTEGER NOT NULL DEFAULT 0,
      original_loan_id TEXT,
      mora_rate_daily REAL NOT NULL DEFAULT 0.001,
      mora_grace_days INTEGER NOT NULL DEFAULT 3,
      overtime_charge REAL NOT NULL DEFAULT 0,
      overtime_days INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (client_id) REFERENCES clients(id),
      FOREIGN KEY (product_id) REFERENCES loan_products(id)
    );

    CREATE TABLE IF NOT EXISTS installments (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      installment_number INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      principal_amount REAL NOT NULL,
      interest_amount REAL NOT NULL,
      total_amount REAL NOT NULL,
      paid_principal REAL NOT NULL DEFAULT 0,
      paid_interest REAL NOT NULL DEFAULT 0,
      paid_mora REAL NOT NULL DEFAULT 0,
      paid_total REAL NOT NULL DEFAULT 0,
      mora_amount REAL NOT NULL DEFAULT 0,
      mora_days INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      paid_at TEXT,
      FOREIGN KEY (loan_id) REFERENCES loans(id)
    );

    CREATE TABLE IF NOT EXISTS loan_guarantors (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      guarantor_id TEXT NOT NULL,
      FOREIGN KEY (loan_id) REFERENCES loans(id),
      FOREIGN KEY (guarantor_id) REFERENCES guarantors(id)
    );

    CREATE TABLE IF NOT EXISTS loan_guarantees (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      category_id TEXT,
      description TEXT NOT NULL,
      estimated_value REAL,
      FOREIGN KEY (loan_id) REFERENCES loans(id)
    );

    CREATE TABLE IF NOT EXISTS guarantee_categories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      loan_id TEXT NOT NULL,
      registered_by TEXT NOT NULL,
      collector_id TEXT,
      payment_number TEXT NOT NULL,
      payment_date TEXT NOT NULL DEFAULT (datetime('now')),
      amount REAL NOT NULL,
      applied_mora REAL NOT NULL DEFAULT 0,
      applied_charges REAL NOT NULL DEFAULT 0,
      applied_interest REAL NOT NULL DEFAULT 0,
      applied_capital REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      bank_account_id TEXT,
      reference TEXT,
      type TEXT NOT NULL DEFAULT 'regular',
      is_voided INTEGER NOT NULL DEFAULT 0,
      voided_at TEXT,
      voided_by TEXT,
      void_reason TEXT,
      rebate_amount REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (loan_id) REFERENCES loans(id),
      FOREIGN KEY (registered_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payment_items (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      installment_id TEXT,
      concept TEXT NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (payment_id) REFERENCES payments(id)
    );

    CREATE TABLE IF NOT EXISTS receipt_series (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      payment_id TEXT UNIQUE NOT NULL,
      loan_id TEXT NOT NULL,
      issued_by TEXT NOT NULL,
      series_id TEXT,
      receipt_number TEXT NOT NULL,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      client_name TEXT NOT NULL,
      client_id_number TEXT,
      loan_number TEXT NOT NULL,
      amount REAL NOT NULL,
      concept_detail TEXT NOT NULL,
      notes TEXT,
      is_reprinted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (payment_id) REFERENCES payments(id)
    );

    CREATE TABLE IF NOT EXISTS contract_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      body TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      loan_id TEXT NOT NULL,
      template_id TEXT,
      contract_number TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      signature_mode TEXT NOT NULL DEFAULT 'physical',
      status TEXT NOT NULL DEFAULT 'draft',
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT,
      signed_at TEXT,
      signed_by TEXT,
      signature_evidence_url TEXT,
      content TEXT,
      pdf_url TEXT,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (loan_id) REFERENCES loans(id)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_templates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      event TEXT NOT NULL,
      body TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT,
      loan_id TEXT,
      client_phone TEXT NOT NULL,
      event TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      provider_response TEXT,
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      bank_name TEXT NOT NULL,
      account_number TEXT,
      account_type TEXT NOT NULL DEFAULT 'checking',
      account_holder TEXT,
      currency TEXT NOT NULL DEFAULT 'DOP',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS income_expenses (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      branch_id TEXT,
      registered_by TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      category TEXT NOT NULL DEFAULT 'otros',
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      transaction_date TEXT NOT NULL DEFAULT (datetime('now')),
      payment_method TEXT NOT NULL DEFAULT 'cash',
      reference TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id),
      FOREIGN KEY (registered_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS payment_promises (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      collector_id TEXT NOT NULL,
      promised_date TEXT NOT NULL,
      promised_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      requires_visit INTEGER NOT NULL DEFAULT 0,
      visited_at TEXT,
      visit_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loan_id) REFERENCES loans(id)
    );

    CREATE TABLE IF NOT EXISTS collection_notes (
      id TEXT PRIMARY KEY,
      loan_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'visit',
      note TEXT NOT NULL,
      next_action TEXT,
      next_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (loan_id) REFERENCES loans(id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      user_id TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      old_values TEXT,
      new_values TEXT,
      ip_address TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS collection_tasks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      assigned_to TEXT NOT NULL,
      created_by TEXT NOT NULL,
      loan_id TEXT,
      client_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      task_type TEXT NOT NULL DEFAULT 'other',
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      result_notes TEXT,
      completed_at TEXT,
      completed_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_loans_tenant ON loans(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_loans_client ON loans(client_id);
    CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_payments_loan ON payments(loan_id);
    CREATE INDEX IF NOT EXISTS idx_installments_loan ON installments(loan_id);
    CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON collection_tasks(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON collection_tasks(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_notifs_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifs_tenant ON notifications(tenant_id);
  `);
  // Migrations for existing databases (add columns if not exist)
  try { db.exec(`ALTER TABLE payments ADD COLUMN bank_account_id TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE payment_promises ADD COLUMN requires_visit INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
  try { db.exec(`ALTER TABLE payment_promises ADD COLUMN visited_at TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE payment_promises ADD COLUMN visit_notes TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN is_reprinted INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
  try { db.exec(`ALTER TABLE receipts ADD COLUMN registered_by TEXT`); } catch(_) {}

  // ── Mora configuration enhancements ──
  // Consistent default: 'cuota_vencida' everywhere (old incorrect 'cuota' default removed)
  try { db.exec(`ALTER TABLE tenant_settings ADD COLUMN mora_base TEXT NOT NULL DEFAULT 'cuota_vencida'`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenant_settings ADD COLUMN mora_fixed_enabled INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenant_settings ADD COLUMN mora_fixed_amount REAL NOT NULL DEFAULT 0`); } catch(_) {}
  // Per-loan mora configuration overrides
  try { db.exec(`ALTER TABLE loans ADD COLUMN mora_base TEXT NOT NULL DEFAULT 'cuota_vencida'`); } catch(_) {}
  try { db.exec(`ALTER TABLE loans ADD COLUMN mora_fixed_enabled INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
  try { db.exec(`ALTER TABLE loans ADD COLUMN mora_fixed_amount REAL NOT NULL DEFAULT 0`); } catch(_) {}
  // Data fix: correct any rows stored with the old incorrect 'cuota' default
  try { db.exec(`UPDATE tenant_settings SET mora_base='cuota_vencida' WHERE mora_base='cuota'`); } catch(_) {}
  try { db.exec(`UPDATE loans SET mora_base='cuota_vencida' WHERE mora_base='cuota'`); } catch(_) {}

  // ── Loan void/cancel ──
  try { db.exec(`ALTER TABLE loans ADD COLUMN is_voided INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
  try { db.exec(`ALTER TABLE loans ADD COLUMN voided_at TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE loans ADD COLUMN void_reason TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE loans ADD COLUMN voided_by TEXT`); } catch(_) {}

  // ── Company extra fields ──
  try { db.exec(`ALTER TABLE tenants ADD COLUMN rnc TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN representative_name TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN signature_url TEXT`); } catch(_) {}

  // ── Bank account balance tracking ──
  try { db.exec(`ALTER TABLE bank_accounts ADD COLUMN initial_balance REAL NOT NULL DEFAULT 0`); } catch(_) {}
  try { db.exec(`ALTER TABLE bank_accounts ADD COLUMN current_balance REAL NOT NULL DEFAULT 0`); } catch(_) {}
  try { db.exec(`ALTER TABLE bank_accounts ADD COLUMN loaned_balance REAL NOT NULL DEFAULT 0`); } catch(_) {}

  // ── Bank account transfers table ──
  db.exec(`CREATE TABLE IF NOT EXISTS account_transfers (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    from_account_id TEXT NOT NULL,
    to_account_id TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    transferred_by TEXT NOT NULL,
    transferred_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id),
    FOREIGN KEY (from_account_id) REFERENCES bank_accounts(id),
    FOREIGN KEY (to_account_id) REFERENCES bank_accounts(id)
  )`);

  // ── Income/expenses: bank account link ──
  try { db.exec(`ALTER TABLE income_expenses ADD COLUMN bank_account_id TEXT`); } catch(_) {}

  // Mayo 2026: nueva columna work_address para domicilio laboral del cliente
  try { db.exec(`ALTER TABLE clients ADD COLUMN work_address TEXT`); } catch(_) {}

  // Mayo 2026: convertir scores legacy 1-5 al sistema nuevo 0-100
  // Mapeo: 1->10, 2->30, 3->50, 4->70, 5->90 (puntos medios de cada banda)
  try {
    db.exec(`UPDATE clients SET score = CASE
      WHEN score = 1 THEN 10
      WHEN score = 2 THEN 30
      WHEN score = 3 THEN 50
      WHEN score = 4 THEN 70
      WHEN score = 5 THEN 90
      ELSE score
    END WHERE score BETWEEN 1 AND 5`);
  } catch(_) {}

  // ── Loan requests: additional fields for auto-convert ──
  try { db.exec(`ALTER TABLE loan_requests ADD COLUMN product_id TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE loan_requests ADD COLUMN rate REAL`); } catch(_) {}
  try { db.exec(`ALTER TABLE loan_requests ADD COLUMN disbursement_bank_account_id TEXT`); } catch(_) {}

  // ── Loans: bank account tracking ──
  try { db.exec(`ALTER TABLE loans ADD COLUMN disbursement_bank_account_id TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE loans ADD COLUMN collection_bank_account_id TEXT`); } catch(_) {}

  // ── Multi-currency support ──
  try { db.exec(`ALTER TABLE loans ADD COLUMN currency TEXT NOT NULL DEFAULT 'DOP'`); } catch(_) {}
  try { db.exec(`ALTER TABLE loans ADD COLUMN exchange_rate_to_dop REAL NOT NULL DEFAULT 1.0`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenant_settings ADD COLUMN multi_currency_enabled INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenant_settings ADD COLUMN enabled_currencies TEXT NOT NULL DEFAULT '["DOP"]'`); } catch(_) {}

  // Subscription management fields for tenants
  try { db.exec(`ALTER TABLE tenants ADD COLUMN subscription_status TEXT NOT NULL DEFAULT 'trial'`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN subscription_start TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN subscription_end TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly'`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN stripe_customer_id TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN stripe_subscription_id TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN subscription_notes TEXT`); } catch(_) {}

  // Plan enhancements: trial days + feature flags
  try { db.exec(`ALTER TABLE plans ADD COLUMN trial_days INTEGER NOT NULL DEFAULT 10`); } catch(_) {}
  try { db.exec(`ALTER TABLE plans ADD COLUMN features TEXT NOT NULL DEFAULT '[]'`); } catch(_) {}
  try { db.exec(`ALTER TABLE plans ADD COLUMN description TEXT`); } catch(_) {}
  // Plan trial default flag (only one plan can be the default for new trial tenants)
  try { db.exec(`ALTER TABLE plans ADD COLUMN is_trial_default INTEGER NOT NULL DEFAULT 0`); } catch(_) {}
  // Partial unique index: ensures at most one plan has is_trial_default=1
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_trial_default ON plans(is_trial_default) WHERE is_trial_default=1`); } catch(_) {}

  // -- Cargo de Prorroga: fixed extension fee per loan --
  try { db.exec(`ALTER TABLE loans ADD COLUMN prorroga_fee REAL NOT NULL DEFAULT 0`); } catch(_) {}
  try { db.exec(`ALTER TABLE installments ADD COLUMN prorroga_count INTEGER NOT NULL DEFAULT 0`); } catch(_) {}

  // Public token for loan request portal (unique per tenant)
  try { db.exec(`ALTER TABLE tenants ADD COLUMN public_token TEXT`); } catch(_) {}

  // Loan requests table (submitted by clients via public portal)
  db.exec(`CREATE TABLE IF NOT EXISTS loan_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_email TEXT,
    client_phone TEXT NOT NULL,
    client_address TEXT,
    id_number TEXT,
    loan_amount REAL,
    loan_purpose TEXT,
    loan_term INTEGER,
    id_front_image TEXT,
    id_back_image TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    rejection_reason TEXT,
    notes TEXT,
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
  )`);

  // Add extended client fields to loan_requests (migration for existing tables)
  const loanRequestExtraFields = [
    `ALTER TABLE loan_requests ADD COLUMN date_of_birth TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN gender TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN marital_status TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN nationality TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN whatsapp TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN city TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN province TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN phone_work TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN phone_family TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN family_contact_name TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN family_relationship TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN occupation TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN employer TEXT`,
    `ALTER TABLE loan_requests ADD COLUMN monthly_income REAL`,
    `ALTER TABLE loan_requests ADD COLUMN economic_activity TEXT`,
  ];
  for (const sql of loanRequestExtraFields) { try { db.exec(sql); } catch(_) {} }

  // ── Notarial / legal document fields for tenants ──────────────────────────
  try { db.exec(`ALTER TABLE tenants ADD COLUMN notary_name TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN notary_collegiate_number TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN notary_office_address TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN acreedor_id_number TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN city TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN testigo1_nombre TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN testigo1_id TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN testigo1_domicilio TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN testigo2_nombre TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN testigo2_id TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE tenants ADD COLUMN testigo2_domicilio TEXT`); } catch(_) {}

  // Migrate client scores from 1-5 scale to 0-100 scale
  // Safe: scores 1-5 map to 20/40/60/80/100; scores already in 0-100 range are unchanged
  try {
    db.exec(`UPDATE clients SET score = MIN(100, MAX(0, ROUND(score * 20))) WHERE score IS NOT NULL AND score BETWEEN 1 AND 5`);
  } catch(_) {}

  // Audit log enrichment columns (for existing databases without them)
  try { db.exec(`ALTER TABLE audit_logs ADD COLUMN user_name TEXT NOT NULL DEFAULT 'Sistema'`); } catch(_) {}
  try { db.exec(`ALTER TABLE audit_logs ADD COLUMN user_email TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE audit_logs ADD COLUMN description TEXT NOT NULL DEFAULT ''`); } catch(_) {}
  try { db.exec(`ALTER TABLE audit_logs ADD COLUMN metadata TEXT DEFAULT '{}'`); } catch(_) {}
  try { db.exec(`ALTER TABLE audit_logs ADD COLUMN old_values TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE audit_logs ADD COLUMN new_values TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE audit_logs ADD COLUMN notes TEXT`); } catch(_) {}
  try { db.exec(`ALTER TABLE audit_logs ADD COLUMN changes TEXT`); } catch(_) {}

  // Generate public tokens for existing tenants that don't have one
  const tenantsWithoutToken = db.prepare(`SELECT id FROM tenants WHERE public_token IS NULL OR public_token = ''`).all() as any[];
  for (const t of tenantsWithoutToken) {
    const token = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    db.prepare(`UPDATE tenants SET public_token=? WHERE id=?`).run(token, t.id);
  }

  // Audit log table for tracking user changes
  db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT,
    user_id TEXT,
    user_name TEXT NOT NULL DEFAULT 'Sistema',
    user_email TEXT,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    description TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  // ── Seed standard contract templates for every tenant ───────────────────────
  // Runs every boot. INSERT if not exists, UPDATE body if already present.
  try {
    // ── Cleanup legacy template names ────────────────────────────────────────
    // Delete old names that are replaced by the new standard templates
    db.prepare(`DELETE FROM contract_templates WHERE name IN ('Contrato General de Préstamo', 'Pagaré Estándar')`).run();
    // Rename old short "Pagaré" to the full display name
    db.prepare(`UPDATE contract_templates SET name = 'Contrato General de Préstamo o Pagaré' WHERE name = 'Pagaré'`).run();
    // ─────────────────────────────────────────────────────────────────────────

    const SEP = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

    const pagareEstandarBody = [
      '                    PAGARÉ',
      '',
      '{{company_name}}',
      '{{company_address}}',
      'Tel: {{company_phone}}   Email: {{company_email}}',
      'Préstamo No.: {{loan_number}}',
      SEP,
      'Yo, {{client_name}}, portador de la cédula {{client_id}}, domiciliado en {{client_address}}, {{client_city}}, debo y pagaré a {{company_name}} la suma de RD$ {{amount}}',
      SEP,
      'DETALLE DE CUOTAS',
      SEP,
      '{{payment_plan}}',
      SEP,
      'DATOS DEL PRÉSTAMO',
      SEP,
      'Fecha de inicio:           {{start_date}}',
      'Fecha de vencimiento:      {{end_date}}',
      'Plazo:                     {{term}}',
      'Monto desembolsado:        {{amount}}',
      'Frecuencia de pago:        {{monthly_payment}}',
      'Tasa de interés:           {{rate}}',
      SEP,
      'DECLARACIÓN DE INCUMPLIMIENTO',
      SEP,
      'En caso de incumplimiento con el presente préstamo, quedan afectados todos mis bienes habidos y por haber para el pago inmediato de esta deuda sin ninguna formalidad judicial.',
      SEP,
      'FIRMAS',
      SEP,
      'Firma del deudor:  _________________________',
      'Nombre:           {{client_name}}',
      'Cédula:           {{client_id}}',
      '',
      'Firma del prestamista: _________________________',
      'Empresa:               {{company_name}}',
      'Fecha de impresión: {{print_date}}',
    ].join('\n');

    const pagareNotarialBody = [
      '                                      Pagaré Notarial',
      '',
      'ACTO NÚMERO ____________ (____), FOLIO NÚMERO ____________ (____)',
      '',
      'En la Ciudad y Municipio de {{company_city}}, República Dominicana, hoy {{today_date_long}}. POR ANTE MÍ {{notary_name}}, Notario Público de los del Número para el Municipio de {{company_city}}, matriculado en el Colegio Dominicano de Notarios bajo el No. {{notary_collegiate_number}}, con estudio profesional abierto en {{notary_office_address}}.',
      '',
      'COMPARECEN DE UNA PARTE, de manera libre y voluntariamente: {{representative_name}}, portador de la cédula de identidad y electoral número {{acreedor_id}}, domiciliado y residente en {{company_address}}, {{company_city}}; quien para los fines del presente acto se denominará EL ACREEDOR; y de LA OTRA PARTE {{client_name}}, portador de la cédula de identidad y electoral número {{client_id}}, domiciliado y residente en {{client_address}}, {{client_city}}; quien para los fines del presente acto se denominará EL DEUDOR O POR SUS PROPIOS NOMBRES',
      '',
      'Bajo la fe del juramento y en la presencia de los testigos; {{testigo1_nombre}}, persona a la cual identifico por la presentación que me hace de su cédula de identidad y electoral número {{testigo1_id}}, domiciliada y residente en {{testigo1_domicilio}}; {{testigo2_nombre}}, persona a la cual identifico por la presentación que me hace de su cédula de identidad y electoral número {{testigo2_id}}, domiciliada y residente en {{testigo2_domicilio}}; testigos libres de tachas y aptos para fungir como tales y ME DECLARAN LO SIGUIENTE:',
      '',
      'PRIMERO: EL DEUDOR declara haber recibido de manos DEL ACREEDOR la suma de {{amount_words}}, moneda de curso legal, que pagará del capital, el interés de un {{rate_words}} por ciento ({{rate_pct}}%) de interés {{frequency_label}} de dicha cantidad, equivalente a {{installment_amount_words}}, {{frequency_label}} por concepto de deuda de préstamo personal;',
      '',
      'SEGUNDO: Dicha suma será pagada en un plazo de {{loan_term_words}} ({{loan_term}}) {{frequency_label}}, el cual vencerá el día {{maturity_date_long}};',
      '',
      'TERCERO: EL DEUDOR pone en garantía todos los bienes muebles e inmuebles habidos y por haber;',
      '',
      'CUARTO: Las partes convienen y pactan las siguientes condiciones: a) El pago del capital adeudado tendrá lugar en la oficina del acreedor o en el domicilio acordado entre las partes; b) EL DEUDOR podrá liberarse de la totalidad o fracciones del monto adeudado antes del vencimiento de los plazos establecidos en este acto; c) EL ACREEDOR Y EL DEUDOR convienen que este acto tiene la fuerza ejecutoria establecida por el Artículo Quinientos Cuarenta y Cinco (545) del Código de Procedimiento Civil, que reza así: "Tienen fuerza ejecutoria las primeras copias de las sentencias y otras decisiones judiciales y las de los actos notariales que contengan obligación de pagar cantidades de dinero, ya sea periódicamente o en época fija; así como las segundas o ulteriores copias de las mismas sentencias y actos que fueren expedidas en conformidad con la ley en sustitución de la primera. Párrafo. - Sin perjuicio de las demás atribuciones que les confieren las leyes, es obligación general de los representantes del ministerio público, de los alguaciles y de los funcionarios a quienes está encomendado el depósito de la fuerza pública a prestar su concurso para la ejecución de las sentencias y actos que conforme a este artículo estén investidos de fuerza ejecutoria, siempre que legalmente se les requiera a ello"; y el Artículo Ochocientos Setenta y Siete (877) del Código Civil, el cual dice así: "Los títulos ejecutivos contra el difunto, lo son también contra el heredero personalmente; pero los acreedores no podrán hacerlos ejecutar, sino ocho días después de la correspondiente notificación a la persona o en el domicilio del heredero".',
      '',
      'Para los actos notariales que contengan obligación de pagar sumas de dinero, EL DEUDOR, una vez vencida la segunda cuota sin haber efectuado el pago de la misma, pudiéndose proceder al embargo ejecutivo de los bienes muebles e inmuebles habidos y por haber, perderá el beneficio del plazo del pago establecido para el pago de las restantes cuotas, y EL ACREEDOR podrá exigir el total del capital adeudado, más los intereses y el gasto de la ejecución del embargo y el pago de los honorarios de los abogados que en ello incurran, utilizando los establecimientos que la Ley pone a su disposición.',
      '',
      'El presente acto ha sido pasado en mi estudio, en la fecha anteriormente señalada, el cual he leído a los comparecientes quienes después de aprobarlo, lo firman ante mí y junto conmigo Infrascrito Notario, tanto al pie como al margen de este acto. DE TODO LO CUAL DOY FE Y CERTIFICO.',
      '',
      '',
      '{{representative_name}}',
      'EL ACREEDOR',
      '',
      '{{client_name}}',
      'EL DEUDOR',
      '',
      '{{testigo1_nombre}}',
      'TESTIGO',
      '',
      '{{testigo2_nombre}}',
      'TESTIGO',
      '',
      '{{notary_name}}',
      'NOTARIO PÚBLICO',
    ].join('\n');

    const allTenants = db.prepare('SELECT id FROM tenants').all() as any[];
    const insertTmpl = db.prepare(`INSERT INTO contract_templates (id,tenant_id,name,type,body,is_default) VALUES (?,?,?,?,?,?)`);
    const updateTmpl = db.prepare(`UPDATE contract_templates SET body=?, is_default=? WHERE tenant_id=? AND name=?`);

    for (const t of allTenants) {
      // Contrato General de Préstamo o Pagaré — default
      const ESTANDAR_NAME = 'Contrato General de Préstamo o Pagaré';
      const hasEstandar = db.prepare(`SELECT id FROM contract_templates WHERE tenant_id=? AND name=?`).get(t.id, ESTANDAR_NAME);
      if (hasEstandar) {
        updateTmpl.run(pagareEstandarBody, 1, t.id, ESTANDAR_NAME);
      } else {
        insertTmpl.run(crypto.randomUUID(), t.id, ESTANDAR_NAME, 'general', pagareEstandarBody, 1);
        console.log(`✅ ${ESTANDAR_NAME} creado para tenant ${t.id}`);
      }
      // Pagaré Notarial
      const hasNotarial = db.prepare(`SELECT id FROM contract_templates WHERE tenant_id=? AND name='Pagaré Notarial'`).get(t.id);
      if (hasNotarial) {
        updateTmpl.run(pagareNotarialBody, 0, t.id, 'Pagaré Notarial');
      } else {
        insertTmpl.run(crypto.randomUUID(), t.id, 'Pagaré Notarial', 'notarial', pagareNotarialBody, 0);
        console.log(`✅ Pagaré Notarial creado para tenant ${t.id}`);
      }
    }
  } catch(e: any) { console.error('Error seeding contract templates:', e?.message); }

  // Always ensure the 4 default subscription plans exist (INSERT OR IGNORE = safe to run every boot)
  const starterFeatures = JSON.stringify(["clients.view", "clients.create", "clients.edit", "clients.delete", "loans.view", "loans.create", "loans.edit", "loans.approve", "loans.reject", "loans.disburse", "loans.void", "payments.view", "payments.create", "payments.void", "receipts.view", "receipts.reprint", "reports.dashboard", "reports.portfolio", "reports.mora", "calculator.use", "collections.view", "collections.notes", "collections.promises", "settings.general", "settings.users", "settings.products", "settings.bank_accounts"]);
  const basicFeatures = JSON.stringify(["clients.view", "clients.create", "clients.edit", "clients.delete", "loans.view", "loans.create", "loans.edit", "loans.approve", "loans.reject", "loans.disburse", "loans.void", "payments.view", "payments.create", "payments.void", "receipts.view", "receipts.reprint", "reports.dashboard", "reports.portfolio", "reports.mora", "calculator.use", "collections.view", "collections.notes", "collections.promises", "settings.general", "settings.users", "settings.products", "settings.bank_accounts", "contracts.view", "contracts.create", "contracts.sign", "contracts.delete", "whatsapp.view", "whatsapp.send", "whatsapp.templates", "settings.branches", "settings.templates", "income.view", "income.create", "income.edit", "income.delete", "requests.view", "requests.approve", "requests.reject", "requests.convert", "reports.collections"]);
  const proFeatures = JSON.stringify(["clients.view", "clients.create", "clients.edit", "clients.delete", "loans.view", "loans.create", "loans.edit", "loans.approve", "loans.reject", "loans.disburse", "loans.void", "payments.view", "payments.create", "payments.void", "receipts.view", "receipts.reprint", "reports.dashboard", "reports.portfolio", "reports.mora", "calculator.use", "collections.view", "collections.notes", "collections.promises", "settings.general", "settings.users", "settings.products", "settings.bank_accounts", "contracts.view", "contracts.create", "contracts.sign", "contracts.delete", "whatsapp.view", "whatsapp.send", "whatsapp.templates", "settings.branches", "settings.templates", "income.view", "income.create", "income.edit", "income.delete", "requests.view", "requests.approve", "requests.reject", "requests.convert", "reports.collections", "reports.advanced", "reports.income", "reports.projection", "loans.write_off", "loans.import", "payments.edit"]);
  const enterpriseFeatures = JSON.stringify(["clients.view", "clients.create", "clients.edit", "clients.delete", "loans.view", "loans.create", "loans.edit", "loans.approve", "loans.reject", "loans.disburse", "loans.write_off", "loans.void", "loans.import", "payments.view", "payments.create", "payments.void", "payments.edit", "receipts.view", "receipts.reprint", "contracts.view", "contracts.create", "contracts.sign", "contracts.delete", "collections.view", "collections.notes", "collections.promises", "requests.view", "requests.approve", "requests.reject", "requests.convert", "reports.dashboard", "reports.portfolio", "reports.mora", "reports.collections", "reports.advanced", "reports.income", "reports.projection", "whatsapp.view", "whatsapp.send", "whatsapp.templates", "income.view", "income.create", "income.edit", "income.delete", "settings.general", "settings.users", "settings.branches", "settings.products", "settings.bank_accounts", "settings.templates", "calculator.use"]);
  const defaultPlans = [
    { id: 'plan-starter', name: 'Starter', slug: 'starter', price: 29.99, collectors: 1, clients: 100, users: 3, trial: 10, features: starterFeatures, desc: 'Ideal para iniciar. Funciones básicas de préstamos.' },
    { id: 'plan-basico', name: 'Básico', slug: 'basico', price: 59.99, collectors: 3, clients: 500, users: 8, trial: 10, features: basicFeatures, desc: 'Para prestamistas en crecimiento con WhatsApp y sucursales.' },
    { id: 'plan-profesional', name: 'Profesional', slug: 'profesional', price: 119.99, collectors: 10, clients: 2000, users: 20, trial: 10, features: proFeatures, desc: 'Para equipos medianos con reportes avanzados y firmas digitales.' },
    { id: 'plan-enterprise', name: 'Enterprise', slug: 'enterprise', price: 249.99, collectors: -1, clients: -1, users: -1, trial: 10, features: enterpriseFeatures, desc: 'Sin límites. Todas las funciones incluyendo API y soporte prioritario.' },
  ];
  // Migrate all existing plans: set trial_days = 10 for any plan still at 30
  try { db.exec(`UPDATE plans SET trial_days = 10 WHERE trial_days = 30`); } catch(_) {}

  // INSERT OR IGNORE: only creates plans on first run — never overwrites admin changes
  const insertPlan = db.prepare(`INSERT OR IGNORE INTO plans (id, name, slug, price_monthly, max_collectors, max_clients, max_users, trial_days, features, description) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  for (const p of defaultPlans) {
    insertPlan.run(p.id, p.name, p.slug, p.price, p.collectors, p.clients, p.users, p.trial, p.features, p.desc);
  }
  // Seed the Plan Trial (inserted only if not present — INSERT OR IGNORE)
  const insertTrialPlan = db.prepare(`INSERT OR IGNORE INTO plans (id, name, slug, price_monthly, max_collectors, max_clients, max_users, trial_days, features, description, is_trial_default) VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  insertTrialPlan.run('plan-trial', 'Plan Trial', 'trial', 0, 1, 50, 2, 14, '["clients.view","clients.create","clients.edit","loans.view","loans.create","loans.edit","loans.approve","loans.reject","loans.disburse","loans.void","payments.view","payments.create","payments.void","receipts.view","receipts.reprint","reports.dashboard","reports.portfolio","reports.mora","calculator.use","collections.view","collections.notes","collections.promises","collections.manage","settings.general","settings.users","settings.products","settings.bank_accounts"]', 'Plan de prueba gratuito para nuevos prestamistas. Configurable desde Admin.', 1);
  // Patch existing trial plan features in case this DB already had the row
  db.prepare(`UPDATE plans SET features=? WHERE id='plan-trial' AND is_trial_default=1`).run('["clients.view","clients.create","clients.edit","loans.view","loans.create","loans.edit","loans.approve","loans.reject","loans.disburse","loans.void","payments.view","payments.create","payments.void","receipts.view","receipts.reprint","reports.dashboard","reports.portfolio","reports.mora","calculator.use","collections.view","collections.notes","collections.promises","collections.manage","settings.general","settings.users","settings.products","settings.bank_accounts"]');

  const planCount = (db.prepare('SELECT COUNT(*) as c FROM plans').get() as any).c;
  console.log(`✅ Plans table: ${planCount} plans available`);

  console.log('✅ Database schema initialized');
}

export function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function uuid(): string {
  return crypto.randomUUID();
}

export function now(): string {
  return new Date().toISOString();
}

-- ═══════════════════════════════════════════════════════════════════════════════
-- PrestaMax PostgreSQL Schema — Migrated from SQLite
-- Target: Supabase (PostgreSQL 15+)
-- Created: 2026-04-17
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────────────────────────────────────────────
-- PLANS: Subscription plans for tenants
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  price_monthly NUMERIC(15,4) NOT NULL,
  max_collectors INTEGER NOT NULL DEFAULT -1,
  max_clients INTEGER NOT NULL DEFAULT -1,
  max_users INTEGER NOT NULL DEFAULT -1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  trial_days INTEGER NOT NULL DEFAULT 10,
  features TEXT NOT NULL DEFAULT '[]',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────────
-- USERS: Platform users (multi-tenant)
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  platform_role TEXT NOT NULL DEFAULT 'none',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- TENANTS: Multi-tenant organizations
-- ────────────────────────────────────────────────────────────────────────────────
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
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  score_mode TEXT NOT NULL DEFAULT 'global',
  payment_order TEXT NOT NULL DEFAULT '["mora","charges","interest","capital"]',
  signature_mode TEXT NOT NULL DEFAULT 'physical',
  rnc TEXT,
  representative_name TEXT,
  signature_url TEXT,
  notary_name TEXT,
  notary_collegiate_number TEXT,
  notary_office_address TEXT,
  acreedor_id_number TEXT,
  city TEXT,
  testigo1_nombre TEXT,
  testigo1_id TEXT,
  testigo1_domicilio TEXT,
  testigo2_nombre TEXT,
  testigo2_id TEXT,
  testigo2_domicilio TEXT,
  public_token TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'trial',
  subscription_start TIMESTAMP WITH TIME ZONE,
  subscription_end TIMESTAMP WITH TIME ZONE,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────────────────────────
-- TENANT_SETTINGS: Configuration per tenant
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT UNIQUE NOT NULL,
  mora_rate_daily NUMERIC(15,4) NOT NULL DEFAULT 0.001,
  mora_grace_days INTEGER NOT NULL DEFAULT 3,
  mora_max_rate NUMERIC(15,4) NOT NULL DEFAULT 0.30,
  mora_base TEXT NOT NULL DEFAULT 'cuota_vencida',
  mora_fixed_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mora_fixed_amount NUMERIC(15,4) NOT NULL DEFAULT 0,
  rebate_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  rebate_type TEXT NOT NULL DEFAULT 'proportional',
  rebate_rate NUMERIC(15,4) NOT NULL DEFAULT 0.0,
  score_w_punctuality NUMERIC(15,4) NOT NULL DEFAULT 0.40,
  score_w_paid_loans NUMERIC(15,4) NOT NULL DEFAULT 0.30,
  score_w_antiquity NUMERIC(15,4) NOT NULL DEFAULT 0.20,
  score_w_no_mora NUMERIC(15,4) NOT NULL DEFAULT 0.10,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_api_key TEXT,
  whatsapp_phone TEXT,
  max_pending_for_refi INTEGER NOT NULL DEFAULT 2,
  multi_currency_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_currencies TEXT NOT NULL DEFAULT '["DOP"]',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_tenant_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- TENANT_MEMBERSHIPS: User roles per tenant (pivot table)
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  branch_id TEXT,
  roles TEXT NOT NULL DEFAULT '[]',
  permissions TEXT NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tenant_id),
  CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_membership_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- BRANCHES: Loan office branches per tenant
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_branches_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);

-- ────────────────────────────────────────────────────────────────────────────────
-- CLIENTS: Loan clients (borrowers)
-- ────────────────────────────────────────────────────────────────────────────────
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
  monthly_income NUMERIC(15,4),
  other_income NUMERIC(15,4),
  photo_url TEXT,
  id_front_url TEXT,
  id_back_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  score INTEGER NOT NULL DEFAULT 3,
  score_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  consent_data_processing BOOLEAN NOT NULL DEFAULT FALSE,
  consent_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, id_number),
  CONSTRAINT fk_clients_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_clients_tenant ON clients(tenant_id);

-- ────────────────────────────────────────────────────────────────────────────────
-- CLIENT_REFERENCES: Contact references for a client
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_references (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'personal',
  full_name TEXT NOT NULL,
  phone TEXT,
  relationship TEXT,
  employer TEXT,
  CONSTRAINT fk_client_references FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- GUARANTORS: Guarantor information for loans
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guarantors (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  id_number TEXT,
  phone TEXT,
  address TEXT,
  photo_url TEXT,
  CONSTRAINT fk_guarantors_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- CLIENT_DOCUMENTS: Documents uploaded for a client
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_documents (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  url TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_client_documents FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- LOAN_PRODUCTS: Loan product templates
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_products (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  min_amount NUMERIC(15,4) NOT NULL,
  max_amount NUMERIC(15,4) NOT NULL,
  rate NUMERIC(15,4) NOT NULL,
  rate_type TEXT NOT NULL DEFAULT 'monthly',
  min_term INTEGER NOT NULL,
  max_term INTEGER NOT NULL,
  term_unit TEXT NOT NULL DEFAULT 'months',
  payment_frequency TEXT NOT NULL DEFAULT 'monthly',
  amortization_type TEXT NOT NULL DEFAULT 'fixed_installment',
  disbursement_fee NUMERIC(15,4) NOT NULL DEFAULT 0,
  disbursement_fee_type TEXT NOT NULL DEFAULT 'percentage',
  mora_rate_daily NUMERIC(15,4),
  mora_grace_days INTEGER,
  requires_guarantee BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  allows_prepayment BOOLEAN NOT NULL DEFAULT TRUE,
  rebate_policy TEXT NOT NULL DEFAULT 'proportional',
  is_san_type BOOLEAN NOT NULL DEFAULT FALSE,
  is_reditos BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_loan_products_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- LOANS: Loan contracts
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loans (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  branch_id TEXT,
  client_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  loan_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  requested_amount NUMERIC(15,4) NOT NULL,
  approved_amount NUMERIC(15,4),
  disbursed_amount NUMERIC(15,4),
  rate NUMERIC(15,4) NOT NULL,
  rate_type TEXT NOT NULL DEFAULT 'monthly',
  term INTEGER NOT NULL,
  term_unit TEXT NOT NULL DEFAULT 'months',
  payment_frequency TEXT NOT NULL DEFAULT 'monthly',
  amortization_type TEXT NOT NULL DEFAULT 'fixed_installment',
  application_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  approval_date TIMESTAMP WITH TIME ZONE,
  disbursement_date TIMESTAMP WITH TIME ZONE,
  first_payment_date TIMESTAMP WITH TIME ZONE,
  maturity_date TIMESTAMP WITH TIME ZONE,
  actual_close_date TIMESTAMP WITH TIME ZONE,
  disbursement_fee NUMERIC(15,4) NOT NULL DEFAULT 0,
  insurance NUMERIC(15,4) NOT NULL DEFAULT 0,
  other_charges NUMERIC(15,4) NOT NULL DEFAULT 0,
  principal_balance NUMERIC(15,4) NOT NULL DEFAULT 0,
  interest_balance NUMERIC(15,4) NOT NULL DEFAULT 0,
  mora_balance NUMERIC(15,4) NOT NULL DEFAULT 0,
  charges_balance NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_balance NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_interest NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_paid NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_paid_principal NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_paid_interest NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_paid_mora NUMERIC(15,4) NOT NULL DEFAULT 0,
  days_overdue INTEGER NOT NULL DEFAULT 0,
  collector_id TEXT,
  purpose TEXT,
  notes TEXT,
  rejection_reason TEXT,
  is_restructured BOOLEAN NOT NULL DEFAULT FALSE,
  original_loan_id TEXT,
  mora_rate_daily NUMERIC(15,4) NOT NULL DEFAULT 0.001,
  mora_grace_days INTEGER NOT NULL DEFAULT 3,
  mora_base TEXT NOT NULL DEFAULT 'cuota_vencida',
  mora_fixed_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  mora_fixed_amount NUMERIC(15,4) NOT NULL DEFAULT 0,
  overtime_charge NUMERIC(15,4) NOT NULL DEFAULT 0,
  overtime_days INTEGER NOT NULL DEFAULT 0,
  is_voided BOOLEAN NOT NULL DEFAULT FALSE,
  voided_at TIMESTAMP WITH TIME ZONE,
  void_reason TEXT,
  voided_by TEXT,
  disbursement_bank_account_id TEXT,
  collection_bank_account_id TEXT,
  currency TEXT NOT NULL DEFAULT 'DOP',
  exchange_rate_to_dop NUMERIC(15,4) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_loans_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_loans_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT fk_loans_product FOREIGN KEY (product_id) REFERENCES loan_products(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_loans_tenant ON loans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_loans_client ON loans(client_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);

-- ────────────────────────────────────────────────────────────────────────────────
-- INSTALLMENTS: Payment schedule for a loan
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS installments (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL,
  installment_number INTEGER NOT NULL,
  due_date TIMESTAMP WITH TIME ZONE NOT NULL,
  principal_amount NUMERIC(15,4) NOT NULL,
  interest_amount NUMERIC(15,4) NOT NULL,
  total_amount NUMERIC(15,4) NOT NULL,
  paid_principal NUMERIC(15,4) NOT NULL DEFAULT 0,
  paid_interest NUMERIC(15,4) NOT NULL DEFAULT 0,
  paid_mora NUMERIC(15,4) NOT NULL DEFAULT 0,
  paid_total NUMERIC(15,4) NOT NULL DEFAULT 0,
  mora_amount NUMERIC(15,4) NOT NULL DEFAULT 0,
  mora_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP WITH TIME ZONE,
  interest_paid_at TIMESTAMP WITH TIME ZONE,
  interest_paid_amount NUMERIC(15,4) DEFAULT 0,
  deferred_due_date TIMESTAMP WITH TIME ZONE,
  CONSTRAINT fk_installments_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_installments_loan ON installments(loan_id);

-- ────────────────────────────────────────────────────────────────────────────────
-- LOAN_GUARANTORS: Pivot table for loans and guarantors
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_guarantors (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL,
  guarantor_id TEXT NOT NULL,
  CONSTRAINT fk_loan_guarantors_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  CONSTRAINT fk_loan_guarantors_guarantor FOREIGN KEY (guarantor_id) REFERENCES guarantors(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- GUARANTEE_CATEGORIES: Categories for loan guarantees
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS guarantee_categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  CONSTRAINT fk_guarantee_categories_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- LOAN_GUARANTEES: Guarantees (collateral) for loans
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_guarantees (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL,
  category_id TEXT,
  description TEXT NOT NULL,
  estimated_value NUMERIC(15,4),
  CONSTRAINT fk_loan_guarantees_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  CONSTRAINT fk_loan_guarantees_category FOREIGN KEY (category_id) REFERENCES guarantee_categories(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────────────────────────
-- PAYMENTS: Payment records
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  branch_id TEXT,
  loan_id TEXT NOT NULL,
  registered_by TEXT NOT NULL,
  collector_id TEXT,
  payment_number TEXT NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  amount NUMERIC(15,4) NOT NULL,
  applied_mora NUMERIC(15,4) NOT NULL DEFAULT 0,
  applied_charges NUMERIC(15,4) NOT NULL DEFAULT 0,
  applied_interest NUMERIC(15,4) NOT NULL DEFAULT 0,
  applied_capital NUMERIC(15,4) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  bank_account_id TEXT,
  reference TEXT,
  type TEXT NOT NULL DEFAULT 'regular',
  is_voided BOOLEAN NOT NULL DEFAULT FALSE,
  voided_at TIMESTAMP WITH TIME ZONE,
  voided_by TEXT,
  void_reason TEXT,
  rebate_amount NUMERIC(15,4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_payments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_registered_by FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_loan ON payments(loan_id);

-- ────────────────────────────────────────────────────────────────────────────────
-- PAYMENT_ITEMS: Detail items within a payment
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_items (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL,
  installment_id TEXT,
  concept TEXT NOT NULL,
  amount NUMERIC(15,4) NOT NULL,
  CONSTRAINT fk_payment_items_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  CONSTRAINT fk_payment_items_installment FOREIGN KEY (installment_id) REFERENCES installments(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────────────────────────
-- RECEIPT_SERIES: Series/prefixes for receipt numbering
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipt_series (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_receipt_series_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- RECEIPTS: Payment receipts
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  payment_id TEXT UNIQUE NOT NULL,
  loan_id TEXT NOT NULL,
  issued_by TEXT NOT NULL,
  series_id TEXT,
  receipt_number TEXT NOT NULL,
  issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  client_name TEXT NOT NULL,
  client_id_number TEXT,
  loan_number TEXT NOT NULL,
  amount NUMERIC(15,4) NOT NULL,
  concept_detail TEXT NOT NULL,
  notes TEXT,
  is_reprinted BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_receipts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_receipts_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT
);

-- ────────────────────────────────────────────────────────────────────────────────
-- CONTRACT_TEMPLATES: Template contracts per tenant
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contract_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  body TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT fk_contract_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- CONTRACTS: Signed contracts for loans
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  loan_id TEXT NOT NULL,
  template_id TEXT,
  contract_number TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  signature_mode TEXT NOT NULL DEFAULT 'physical',
  status TEXT NOT NULL DEFAULT 'draft',
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE,
  signed_at TIMESTAMP WITH TIME ZONE,
  signed_by TEXT,
  signature_evidence_url TEXT,
  content TEXT,
  pdf_url TEXT,
  CONSTRAINT fk_contracts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_contracts_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- WHATSAPP_TEMPLATES: WhatsApp message templates
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  event TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_whatsapp_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- WHATSAPP_MESSAGES: WhatsApp messages sent/pending
-- ────────────────────────────────────────────────────────────────────────────────
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
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_whatsapp_messages_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- BANK_ACCOUNTS: Bank accounts per tenant
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT,
  account_type TEXT NOT NULL DEFAULT 'checking',
  account_holder TEXT,
  currency TEXT NOT NULL DEFAULT 'DOP',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  initial_balance NUMERIC(15,4) NOT NULL DEFAULT 0,
  current_balance NUMERIC(15,4) NOT NULL DEFAULT 0,
  loaned_balance NUMERIC(15,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_bank_accounts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- ACCOUNT_TRANSFERS: Inter-account transfers
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS account_transfers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  from_account_id TEXT NOT NULL,
  to_account_id TEXT NOT NULL,
  amount NUMERIC(15,4) NOT NULL,
  notes TEXT,
  transferred_by TEXT NOT NULL,
  transferred_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_transfers_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_transfers_from FOREIGN KEY (from_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_transfers_to FOREIGN KEY (to_account_id) REFERENCES bank_accounts(id) ON DELETE RESTRICT
);

-- ────────────────────────────────────────────────────────────────────────────────
-- INCOME_EXPENSES: Income and expense transactions
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS income_expenses (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  branch_id TEXT,
  registered_by TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  category TEXT NOT NULL DEFAULT 'otros',
  description TEXT NOT NULL,
  amount NUMERIC(15,4) NOT NULL,
  transaction_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  payment_method TEXT NOT NULL DEFAULT 'cash',
  bank_account_id TEXT,
  reference TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_income_expenses_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_income_expenses_registered_by FOREIGN KEY (registered_by) REFERENCES users(id) ON DELETE RESTRICT
);

-- ────────────────────────────────────────────────────────────────────────────────
-- PAYMENT_PROMISES: Promised payment dates from collectors
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_promises (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL,
  collector_id TEXT NOT NULL,
  promised_date TIMESTAMP WITH TIME ZONE NOT NULL,
  promised_amount NUMERIC(15,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  notes TEXT,
  requires_visit BOOLEAN NOT NULL DEFAULT FALSE,
  visited_at TIMESTAMP WITH TIME ZONE,
  visit_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_payment_promises_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- COLLECTION_NOTES: Notes from collection visits
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_notes (
  id TEXT PRIMARY KEY,
  loan_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'visit',
  note TEXT NOT NULL,
  next_action TEXT,
  next_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_collection_notes_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- LOAN_REQUESTS: Loan applications from public portal
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT,
  client_phone TEXT NOT NULL,
  client_address TEXT,
  id_number TEXT,
  loan_amount NUMERIC(15,4),
  loan_purpose TEXT,
  loan_term INTEGER,
  id_front_image TEXT,
  id_back_image TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  date_of_birth TEXT,
  gender TEXT,
  marital_status TEXT,
  nationality TEXT,
  whatsapp TEXT,
  city TEXT,
  province TEXT,
  phone_work TEXT,
  phone_family TEXT,
  family_contact_name TEXT,
  family_relationship TEXT,
  occupation TEXT,
  employer TEXT,
  monthly_income NUMERIC(15,4),
  economic_activity TEXT,
  product_id TEXT,
  rate NUMERIC(15,4),
  disbursement_bank_account_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_loan_requests_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────────────────────────
-- AUDIT_LOGS: Activity audit trail
-- ────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
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
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════════
-- End of Schema
-- ════════════════════════════════════════════════════════════════════════════════

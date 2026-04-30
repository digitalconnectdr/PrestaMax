-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 002: Add is_trial_default flag to plans
-- Purpose: Allows admin to designate one plan as the default for new trial tenants
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add the column (safe to run multiple times via IF NOT EXISTS equivalent)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS is_trial_default BOOLEAN NOT NULL DEFAULT FALSE;

-- Ensure only one plan can be marked as trial default at a time
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trial_default
  ON plans(is_trial_default)
  WHERE is_trial_default = TRUE;

-- Insert the Plan Trial if it does not already exist
INSERT INTO plans (
  id, name, slug, price_monthly,
  max_collectors, max_clients, max_users,
  is_active, is_trial_default, trial_days,
  features, description, created_at
)
VALUES (
  'plan-trial',
  'Plan Trial',
  'trial',
  0,
  1,
  50,
  2,
  TRUE,
  TRUE,
  14,
  '["clients.view","clients.create","loans.view","loans.create","payments.view","payments.create","receipts.view","reports.dashboard","calculator.use","settings.general"]',
  'Plan de prueba gratuito para nuevos prestamistas. Configurable desde Admin.',
  NOW()
)
ON CONFLICT (id) DO NOTHING;

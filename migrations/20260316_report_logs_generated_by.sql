-- Migration: add generated_by to report_logs
-- Run in Supabase SQL Editor

ALTER TABLE report_logs
  ADD COLUMN IF NOT EXISTS generated_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_report_logs_generated_by ON report_logs(generated_by);

-- ============================================================
-- Migration: Expiry notification tracking table
-- Date: 2026-03-30
-- ============================================================

CREATE TABLE IF NOT EXISTS expiry_notifications (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id      UUID        NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  threshold    TEXT        NOT NULL, -- '90d','60d','30d','4w','3w','2w','1w'
  sent_at      TIMESTAMPTZ DEFAULT NOW(),
  recipients   TEXT[]      NOT NULL DEFAULT '{}',
  UNIQUE (item_id, threshold)
);

CREATE INDEX IF NOT EXISTS idx_expiry_notifications_item ON expiry_notifications(item_id);

-- RLS
ALTER TABLE expiry_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_full" ON expiry_notifications FOR ALL USING (has_permission('manage_users'));
CREATE POLICY "staff_view" ON expiry_notifications FOR SELECT USING (has_permission('view_inventory'));

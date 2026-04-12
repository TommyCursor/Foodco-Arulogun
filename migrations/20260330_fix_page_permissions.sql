-- ============================================================
-- Migration: Add missing page permissions + fix wrong mappings
-- Date: 2026-03-30
-- ============================================================

-- 1. Insert all missing permissions
INSERT INTO permissions (key, description) VALUES
  ('view_approval',      'Access the Approval page (damage & discount approvals)'),
  ('view_resolution',    'Access the Resolution page'),
  ('view_cashier_queue', 'Access the Cashier Queue / Cashier Actions page'),
  ('view_loss_control',  'Access the Send to Loss Control page'),
  ('view_audit',         'Access the Audit Trail page'),
  ('view_scan',          'Access the Image to Text / Scan page')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 2. view_approval → supervisor, cashier_supervisor, manager, admin
-- ============================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE p.key = 'view_approval'
  AND r.name IN ('supervisor', 'cashier_supervisor', 'manager', 'admin')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 3. view_resolution → manager, admin
-- ============================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE p.key = 'view_resolution'
  AND r.name IN ('manager', 'admin')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 4. view_cashier_queue → cashier roles + management
-- ============================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE p.key = 'view_cashier_queue'
  AND r.name IN ('cashier', 'cashier_team_lead', 'cashier_supervisor', 'manager', 'admin')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. view_loss_control → supervisor, manager, admin
-- ============================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE p.key = 'view_loss_control'
  AND r.name IN ('supervisor', 'cashier_supervisor', 'manager', 'admin')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. view_audit → manager, admin only
-- ============================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE p.key = 'view_audit'
  AND r.name IN ('manager', 'admin')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 7. view_scan → inventory staff + management
-- ============================================================
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE p.key = 'view_scan'
  AND r.name IN (
    'grocery_associate', 'grocery_team_lead',
    'toiletries_associate', 'toiletries_team_lead',
    '3f_associate', '3f_team_lead',
    'supervisor', 'manager', 'admin'
  )
ON CONFLICT DO NOTHING;

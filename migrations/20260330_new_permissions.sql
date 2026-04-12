-- ============================================================
-- Migration: Add roster + sales permissions
-- Date: 2026-03-30
-- ============================================================

-- 1. New permissions
INSERT INTO permissions (key, description) VALUES
  ('view_roster',    'View staff roster and weekly schedules'),
  ('manage_roster',  'Create and edit staff rosters'),
  ('publish_roster', 'Publish rosters and notify all staff'),
  ('view_sales',     'View sales analytics and reports'),
  ('manage_sales',   'Upload and manage sales data')
ON CONFLICT (key) DO NOTHING;

-- 2. view_roster → all roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE p.key = 'view_roster'
ON CONFLICT DO NOTHING;

-- 3. manage_roster → supervisor, cashier_supervisor, manager, admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE p.key = 'manage_roster'
  AND r.name IN ('supervisor', 'cashier_supervisor', 'manager', 'admin')
ON CONFLICT DO NOTHING;

-- 4. publish_roster → manager, admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE p.key = 'publish_roster'
  AND r.name IN ('manager', 'admin')
ON CONFLICT DO NOTHING;

-- 5. view_sales → supervisor, cashier_supervisor, manager, admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE p.key = 'view_sales'
  AND r.name IN ('supervisor', 'cashier_supervisor', 'manager', 'admin')
ON CONFLICT DO NOTHING;

-- 6. manage_sales → manager, admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE p.key = 'manage_sales'
  AND r.name IN ('manager', 'admin')
ON CONFLICT DO NOTHING;

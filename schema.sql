-- ============================================================
-- FOODCO ARULOGUN — DATABASE SCHEMA
-- Platform: Supabase (PostgreSQL)
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================


-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE inventory_status  AS ENUM ('active', 'discounted', 'expired', 'damaged', 'removed');
CREATE TYPE damage_status     AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE discount_type     AS ENUM ('manual', 'ai_suggested', 'flash_sale', 'clearance');
CREATE TYPE discount_status   AS ENUM ('active', 'expired', 'cancelled');
CREATE TYPE alert_frequency   AS ENUM ('once', 'every_hour', 'every_6h', 'every_12h', 'daily');
CREATE TYPE alert_log_status  AS ENUM ('sent', 'failed', 'snoozed', 'resolved', 'acknowledged');
CREATE TYPE report_type       AS ENUM ('damage', 'expiry', 'discount', 'comprehensive');
CREATE TYPE report_log_status AS ENUM ('success', 'failed');


-- ============================================================
-- 1. ROLES
-- ============================================================

CREATE TABLE roles (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (name, description) VALUES
    ('admin',                'Full system access'),
    ('manager',              'Store operations and reporting'),
    ('supervisor',           'Supervises daily floor operations'),
    ('cashier_supervisor',   'Supervises cashier operations'),
    ('grocery_team_lead',    'Leads grocery department'),
    ('toiletries_team_lead', 'Leads toiletries department'),
    ('cashier_team_lead',    'Leads cashier team'),
    ('3f_team_lead',         'Leads 3F department'),
    ('grocery_associate',    'Grocery floor associate'),
    ('toiletries_associate', 'Toiletries floor associate'),
    ('sanitation_officer',   'Sanitation and cleanliness officer'),
    ('3f_associate',         '3F department associate'),
    ('cashier',              'Cashier — view-only access');


-- ============================================================
-- 2. PERMISSIONS
-- ============================================================

CREATE TABLE permissions (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

INSERT INTO permissions (key, description) VALUES
    ('view_inventory',   'View inventory items and stock levels'),
    ('edit_inventory',   'Add, edit, and update inventory items'),
    ('mark_damage',      'Log damaged goods against a batch'),
    ('view_reports',     'View generated reports'),
    ('create_reports',   'Generate and export reports'),
    ('send_emails',      'Send report emails to recipients'),
    ('manage_users',     'Create and manage user accounts'),
    ('create_alerts',    'Configure automated alert rules'),
    ('receive_alerts',   'Be a recipient of automated alerts'),
    ('manage_discounts', 'Create discount entries'),
    ('approve_damage',   'Approve or reject damage records'),
    ('approve_discount', 'Approve discount entries'),
    ('view_dashboard',   'Access the main dashboard');


-- ============================================================
-- 3. ROLE–PERMISSION MAP
-- ============================================================

CREATE TABLE role_permissions (
    role_id       INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Admin (1) & Manager (2): all permissions
INSERT INTO role_permissions (role_id, permission_id) SELECT 1, id FROM permissions;
INSERT INTO role_permissions (role_id, permission_id) SELECT 2, id FROM permissions;

-- Supervisor (3): approve authority + view/reports — no data entry, no user mgmt
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions
WHERE key IN ('view_inventory','view_reports','create_reports','send_emails',
              'approve_damage','approve_discount','receive_alerts','view_dashboard');

-- Team Lead (4): data entry + reports — no approval
INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions
WHERE key IN ('view_inventory','edit_inventory','mark_damage','manage_discounts',
              'view_reports','create_reports','send_emails','receive_alerts','view_dashboard');

-- Floor Associate (5): data entry only — no reports, no approval
INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions
WHERE key IN ('view_inventory','edit_inventory','mark_damage','manage_discounts',
              'receive_alerts','view_dashboard');

-- 3F Associate (6): same as Floor Associate
INSERT INTO role_permissions (role_id, permission_id)
SELECT 6, id FROM permissions
WHERE key IN ('view_inventory','edit_inventory','mark_damage','manage_discounts',
              'receive_alerts','view_dashboard');

-- Cashier (7): same as Team Lead (data entry + reports, no approval)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 7, id FROM permissions
WHERE key IN ('view_inventory','edit_inventory','mark_damage','manage_discounts',
              'view_reports','create_reports','send_emails','receive_alerts','view_dashboard');


-- ============================================================
-- 4. PROFILES (extends Supabase auth.users)
-- ============================================================

CREATE TABLE profiles (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name  VARCHAR(150) NOT NULL,
    phone      VARCHAR(20),
    role_id    INT REFERENCES roles(id) DEFAULT 4, -- defaults to cashier
    is_active  BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on Supabase Auth signup
-- Reads full_name and role_id from invite metadata (set by API route)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, full_name, role_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
        COALESCE((NEW.raw_user_meta_data->>'role_id')::INT, 4)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-update updated_at on profiles
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 5. CATEGORIES
-- ============================================================

CREATE TABLE categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO categories (name) VALUES
    ('Dairy'),
    ('Bakery'),
    ('Beverages'),
    ('Vegetables & Fruits'),
    ('Frozen Foods'),
    ('Snacks'),
    ('Household');


-- ============================================================
-- 6. PRODUCTS
-- ============================================================

CREATE TABLE products (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name           VARCHAR(255) NOT NULL,
    sku            VARCHAR(100) UNIQUE NOT NULL,
    category_id    INT REFERENCES categories(id),
    unit           VARCHAR(30) NOT NULL DEFAULT 'piece',
    -- 'piece' | 'kg' | 'litre' | 'pack' | 'carton'
    standard_price NUMERIC(12, 2) NOT NULL,
    reorder_level  INT DEFAULT 10,
    is_active      BOOLEAN DEFAULT TRUE,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 7. INVENTORY ITEMS (Stock Batches)
-- ============================================================

CREATE TABLE inventory_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       UUID REFERENCES products(id) ON DELETE RESTRICT,
    batch_number     VARCHAR(100),
    quantity         NUMERIC(12, 2) NOT NULL CHECK (quantity >= 0),
    quantity_damaged NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
    unit_cost        NUMERIC(12, 2) NOT NULL,
    selling_price    NUMERIC(12, 2) NOT NULL,   -- current shelf price (discounts update this)
    original_price   NUMERIC(12, 2) NOT NULL,   -- price before any discount
    expiry_date      DATE NOT NULL,
    manufacture_date DATE,
    location         VARCHAR(100),              -- e.g. 'Aisle 3, Chiller 2'
    status           inventory_status DEFAULT 'active',
    received_date    DATE DEFAULT CURRENT_DATE,
    received_by      UUID REFERENCES profiles(id),
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inventory_expiry  ON inventory_items(expiry_date);
CREATE INDEX idx_inventory_product ON inventory_items(product_id);
CREATE INDEX idx_inventory_status  ON inventory_items(status);

CREATE TRIGGER inventory_updated_at
    BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 8. DAMAGE RECORDS
-- ============================================================

CREATE TABLE damage_records (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id    UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
    quantity_damaged     NUMERIC(12, 2) NOT NULL CHECK (quantity_damaged > 0),
    reason               VARCHAR(255) NOT NULL,
    -- e.g. 'Spillage' | 'Pest damage' | 'Transit damage' | 'Expiry write-off'
    estimated_value_lost NUMERIC(12, 2) NOT NULL,
    reported_by          UUID REFERENCES profiles(id),
    approved_by          UUID REFERENCES profiles(id),
    status               damage_status DEFAULT 'pending',
    notes                TEXT,
    reported_at          TIMESTAMPTZ DEFAULT NOW(),
    approved_at          TIMESTAMPTZ
);

CREATE INDEX idx_damage_item   ON damage_records(inventory_item_id);
CREATE INDEX idx_damage_status ON damage_records(status);


-- ============================================================
-- 9. DISCOUNTS
-- ============================================================

CREATE TABLE discounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id   UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
    name                VARCHAR(255),
    discount_percentage NUMERIC(5, 2) NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
    discount_type       discount_type DEFAULT 'manual',
    original_price      NUMERIC(12, 2) NOT NULL,
    discounted_price    NUMERIC(12, 2) NOT NULL,
    start_date          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date            TIMESTAMPTZ NOT NULL,
    applied_by          UUID REFERENCES profiles(id),
    approved_by         UUID REFERENCES profiles(id), -- required when discount_percentage > 30
    status              discount_status DEFAULT 'active',
    units_sold          INT DEFAULT 0,
    revenue_recovered   NUMERIC(12, 2) DEFAULT 0,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_discounts_item   ON discounts(inventory_item_id);
CREATE INDEX idx_discounts_status ON discounts(status);

CREATE TRIGGER discounts_updated_at
    BEFORE UPDATE ON discounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 10. AUTOMATED ALERTS
-- ============================================================

CREATE TABLE automated_alerts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 VARCHAR(255) NOT NULL,
    trigger_condition    JSONB NOT NULL,
    -- {"type": "days_to_expiry", "value": 7, "category_id": 1}
    -- {"type": "damage_value_exceeds", "value": 50000}
    -- {"type": "discount_effectiveness_below", "value": 40}
    channels             TEXT[] NOT NULL DEFAULT '{in_app}',
    -- ['email', 'sms', 'in_app']
    recipients           JSONB NOT NULL,
    -- {"emails": ["mgr@foodco.com"], "phones": ["+2348031234567"]}
    frequency            alert_frequency DEFAULT 'once',
    escalation_hours     INT,
    ai_generated_message BOOLEAN DEFAULT TRUE,
    is_active            BOOLEAN DEFAULT TRUE,
    created_by           UUID REFERENCES profiles(id),
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER alerts_updated_at
    BEFORE UPDATE ON automated_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 11. ALERT LOGS
-- ============================================================

CREATE TABLE alert_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id            UUID REFERENCES automated_alerts(id) ON DELETE SET NULL,
    triggered_at        TIMESTAMPTZ DEFAULT NOW(),
    message_sent        TEXT,
    channels_used       TEXT[],
    recipients_notified JSONB,
    status              alert_log_status DEFAULT 'sent',
    resolved_by         UUID REFERENCES profiles(id),
    resolved_at         TIMESTAMPTZ,
    notes               TEXT
);

CREATE INDEX idx_alert_logs_alert     ON alert_logs(alert_id);
CREATE INDEX idx_alert_logs_triggered ON alert_logs(triggered_at DESC);


-- ============================================================
-- 12. SCHEDULED REPORTS
-- ============================================================

CREATE TABLE scheduled_reports (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               VARCHAR(255) NOT NULL,
    report_type        report_type NOT NULL,
    schedule_cron      VARCHAR(100) NOT NULL,
    -- Standard cron: '0 8 * * *' = daily at 8:00 AM
    recipients         TEXT[] NOT NULL,
    include_ai_summary BOOLEAN DEFAULT TRUE,
    include_excel      BOOLEAN DEFAULT TRUE,
    is_active          BOOLEAN DEFAULT TRUE,
    last_generated     TIMESTAMPTZ,
    next_generation    TIMESTAMPTZ,
    created_by         UUID REFERENCES profiles(id),
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER scheduled_reports_updated_at
    BEFORE UPDATE ON scheduled_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 13. REPORT LOGS
-- ============================================================

CREATE TABLE report_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheduled_report_id UUID REFERENCES scheduled_reports(id) ON DELETE SET NULL,
    report_type         report_type NOT NULL,
    generated_at        TIMESTAMPTZ DEFAULT NOW(),
    file_url            TEXT,          -- Supabase Storage URL for .xlsx
    email_sent_to       TEXT[],
    status              report_log_status DEFAULT 'success',
    error_message       TEXT
);

CREATE INDEX idx_report_logs_generated ON report_logs(generated_at DESC);


-- ============================================================
-- SALES ANALYTICS
-- ============================================================

-- One record per uploaded Excel file
CREATE TABLE sales_uploads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name       TEXT NOT NULL,
    file_type       TEXT CHECK (file_type IN ('department', 'item')),  -- detected mode
    period_from     DATE,                        -- first sale date in file
    period_to       DATE,                        -- last sale date in file
    row_count       INTEGER NOT NULL DEFAULT 0,
    notes           TEXT,
    uploaded_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sales_uploads_created ON sales_uploads(created_at DESC);

-- Individual sales rows extracted from Excel
CREATE TABLE sales_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id       UUID NOT NULL REFERENCES sales_uploads(id) ON DELETE CASCADE,
    sale_date       DATE,
    product_name    TEXT NOT NULL,
    sku             TEXT,
    quantity        NUMERIC(12, 2) DEFAULT 0,
    unit_price      NUMERIC(12, 2) DEFAULT 0,
    total_amount    NUMERIC(14, 2) DEFAULT 0,
    category        TEXT,
    cashier         TEXT,
    cost            NUMERIC(14, 2),             -- NULL if not provided in file
    profit          NUMERIC(14, 2),
    margin_pct      NUMERIC(7, 2)
);

CREATE INDEX idx_sales_records_upload   ON sales_records(upload_id);
CREATE INDEX idx_sales_records_date     ON sales_records(sale_date);
CREATE INDEX idx_sales_records_category ON sales_records(category);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE automated_alerts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports  ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_uploads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_records      ENABLE ROW LEVEL SECURITY;

-- Helper function: check if current user has a given permission
CREATE OR REPLACE FUNCTION has_permission(perm_key TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM profiles p
        JOIN role_permissions rp ON rp.role_id = p.role_id
        JOIN permissions perm ON perm.id = rp.permission_id
        WHERE p.id = auth.uid()
          AND perm.key = perm_key
          AND p.is_active = TRUE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Inventory: read
CREATE POLICY "inventory_select"
ON inventory_items FOR SELECT
USING (has_permission('view_inventory'));

-- Inventory: write
CREATE POLICY "inventory_insert"
ON inventory_items FOR INSERT
WITH CHECK (has_permission('edit_inventory'));

CREATE POLICY "inventory_update"
ON inventory_items FOR UPDATE
USING (has_permission('edit_inventory'));

-- Damage: read
CREATE POLICY "damage_select"
ON damage_records FOR SELECT
USING (has_permission('view_inventory'));

-- Damage: write
CREATE POLICY "damage_insert"
ON damage_records FOR INSERT
WITH CHECK (has_permission('mark_damage'));

-- Discounts: read
CREATE POLICY "discounts_select"
ON discounts FOR SELECT
USING (has_permission('view_inventory'));

-- Discounts: write
CREATE POLICY "discounts_insert"
ON discounts FOR INSERT
WITH CHECK (has_permission('manage_discounts'));

-- Alerts: read
CREATE POLICY "alerts_select"
ON automated_alerts FOR SELECT
USING (has_permission('receive_alerts'));

-- Alerts: write
CREATE POLICY "alerts_insert"
ON automated_alerts FOR INSERT
WITH CHECK (has_permission('create_alerts'));

-- Scheduled reports: read
CREATE POLICY "scheduled_reports_select"
ON scheduled_reports FOR SELECT
USING (has_permission('view_reports'));

-- Profiles: users can read their own profile
CREATE POLICY "profiles_self_select"
ON profiles FOR SELECT
USING (id = auth.uid() OR has_permission('manage_users'));

-- Profiles: only admins can update any profile
CREATE POLICY "profiles_update"
ON profiles FOR UPDATE
USING (id = auth.uid() OR has_permission('manage_users'));

-- Sales uploads: any authenticated user with report access can read
CREATE POLICY "sales_uploads_select"
ON sales_uploads FOR SELECT
USING (has_permission('view_reports'));

-- Sales uploads: only users with report-create access can insert
CREATE POLICY "sales_uploads_insert"
ON sales_uploads FOR INSERT
WITH CHECK (has_permission('create_reports'));

-- Sales uploads: only uploader or admin can delete
CREATE POLICY "sales_uploads_delete"
ON sales_uploads FOR DELETE
USING (uploaded_by = auth.uid() OR has_permission('manage_users'));

-- Sales records: inherit access from parent upload (same permission gate)
CREATE POLICY "sales_records_select"
ON sales_records FOR SELECT
USING (has_permission('view_reports'));

CREATE POLICY "sales_records_insert"
ON sales_records FOR INSERT
WITH CHECK (has_permission('create_reports'));

CREATE POLICY "sales_records_delete"
ON sales_records FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM sales_uploads u
        WHERE u.id = sales_records.upload_id
          AND (u.uploaded_by = auth.uid() OR has_permission('manage_users'))
    )
);


-- ============================================================
-- USEFUL VIEWS
-- ============================================================

-- Items expiring within the next 7 days
CREATE VIEW expiring_soon AS
SELECT
    i.id,
    p.name AS product_name,
    p.sku,
    c.name AS category,
    i.quantity,
    i.selling_price,
    i.expiry_date,
    (i.expiry_date - CURRENT_DATE) AS days_to_expiry,
    i.location,
    i.status,
    (i.quantity * i.selling_price) AS value_at_risk
FROM inventory_items i
JOIN products p ON p.id = i.product_id
JOIN categories c ON c.id = p.category_id
WHERE i.status IN ('active', 'discounted')
  AND i.expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
ORDER BY i.expiry_date ASC;

-- Active discounts with performance metrics
CREATE VIEW active_discounts_summary AS
SELECT
    d.id,
    d.name,
    p.name AS product_name,
    d.discount_percentage,
    d.original_price,
    d.discounted_price,
    d.end_date,
    d.units_sold,
    d.revenue_recovered,
    ROUND((d.revenue_recovered / NULLIF(d.units_sold * d.original_price, 0)) * 100, 2) AS recovery_rate_pct
FROM discounts d
JOIN inventory_items i ON i.id = d.inventory_item_id
JOIN products p ON p.id = i.product_id
WHERE d.status = 'active'
ORDER BY d.end_date ASC;

-- Dashboard KPI snapshot
CREATE VIEW dashboard_kpis AS
SELECT
    (SELECT COUNT(*) FROM inventory_items WHERE status IN ('active','discounted'))           AS total_active_batches,
    (SELECT COUNT(*) FROM inventory_items WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND status IN ('active','discounted')) AS expiring_in_7_days,
    (SELECT COUNT(*) FROM inventory_items WHERE expiry_date < CURRENT_DATE AND status != 'expired') AS expired_today,
    (SELECT COUNT(*) FROM discounts WHERE status = 'active')                                AS active_discounts,
    (SELECT COALESCE(SUM(estimated_value_lost),0) FROM damage_records WHERE reported_at >= CURRENT_DATE) AS damage_value_today,
    (SELECT COALESCE(SUM(quantity * selling_price),0) FROM inventory_items WHERE status IN ('active','discounted') AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7) AS value_at_risk_7_days;

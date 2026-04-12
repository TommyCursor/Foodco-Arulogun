# Foodco Arulogun — Database Schema
### Platform: Supabase (PostgreSQL)

---

## Table Overview

| # | Table | Purpose |
|---|-------|---------|
| 1 | `roles` | User role definitions (Admin, Manager, etc.) |
| 2 | `permissions` | Granular permission keys |
| 3 | `role_permissions` | Maps roles to permissions |
| 4 | `profiles` | Extends Supabase auth.users with app data |
| 5 | `categories` | Product category groupings |
| 6 | `products` | Product master list (SKUs, names, prices) |
| 7 | `inventory_items` | Individual stock batches with expiry tracking |
| 8 | `damage_records` | Logged damage incidents per batch |
| 9 | `discounts` | Active and historical discounts per batch |
| 10 | `automated_alerts` | Alert rule configurations |
| 11 | `alert_logs` | History of every alert triggered |
| 12 | `scheduled_reports` | Report schedule configurations |
| 13 | `report_logs` | History of every report generated |
| 14 | `sales_uploads` | One record per uploaded sales Excel file |
| 15 | `sales_records` | Individual sales rows extracted from Excel |

---

## Entity Relationship Overview

```
auth.users (Supabase)
    │
    └──▶ profiles ──▶ roles ──▶ role_permissions ──▶ permissions
                │
    ┌───────────┼──────────────┐
    ▼           ▼              ▼
damage_records  discounts   automated_alerts
    │           │              │
    └─────┬─────┘         alert_logs
          ▼
    inventory_items ──▶ products ──▶ categories
                            │
                    scheduled_reports
                            │
                       report_logs
```

---

## 1. Roles

```sql
CREATE TABLE roles (
    id   SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    -- 'admin' | 'manager' | 'inventory_staff' | 'cashier' | 'auditor'
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (name, description) VALUES
    ('admin',            'Full system access'),
    ('manager',          'Store operations and reports'),
    ('inventory_staff',  'Inventory editing and damage logging'),
    ('cashier',          'View-only access to inventory'),
    ('auditor',          'Read-only reporting access');
```

---

## 2. Permissions

```sql
CREATE TABLE permissions (
    id          SERIAL PRIMARY KEY,
    key         VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

INSERT INTO permissions (key, description) VALUES
    ('view_inventory',        'View inventory items and stock'),
    ('edit_inventory',        'Add, edit, and update inventory'),
    ('mark_damage',           'Log damaged goods'),
    ('view_reports',          'View generated reports'),
    ('create_reports',        'Generate and export reports'),
    ('send_emails',           'Send report emails'),
    ('manage_users',          'Create and manage user accounts'),
    ('create_alerts',         'Configure automated alerts'),
    ('receive_alerts',        'Be a recipient of automated alerts'),
    ('manage_discounts',      'Create and edit discounts'),
    ('approve_large_discount','Approve discounts greater than 30%'),
    ('view_dashboard',        'Access the main dashboard');
```

---

## 3. Role–Permission Map

```sql
CREATE TABLE role_permissions (
    role_id       INT REFERENCES roles(id) ON DELETE CASCADE,
    permission_id INT REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Admin: all permissions
-- Manager: all except manage_users
-- Inventory Staff: view_inventory, edit_inventory, mark_damage, view_reports,
--                  receive_alerts, view_dashboard
-- Cashier: view_inventory, view_dashboard
-- Auditor: view_inventory, view_reports, create_reports, receive_alerts, view_dashboard
```

---

## 4. Profiles (extends Supabase auth.users)

```sql
CREATE TABLE profiles (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name  VARCHAR(150) NOT NULL,
    phone      VARCHAR(20),
    role_id    INT REFERENCES roles(id) DEFAULT 4,
    -- defaults to 'cashier' (safest default)
    is_active  BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: auto-create profile when a user signs up in Supabase Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## 5. Categories

```sql
CREATE TABLE categories (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) UNIQUE NOT NULL,
    -- e.g. 'Dairy', 'Bakery', 'Beverages', 'Vegetables', 'Frozen'
    description TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. Products

```sql
CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    sku             VARCHAR(100) UNIQUE NOT NULL,
    category_id     INT REFERENCES categories(id),
    unit            VARCHAR(30) NOT NULL DEFAULT 'piece',
    -- 'piece' | 'kg' | 'litre' | 'pack' | 'carton'
    standard_price  NUMERIC(12, 2) NOT NULL,
    reorder_level   INT DEFAULT 10,
    -- trigger restock alert when total quantity falls below this
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. Inventory Items (Stock Batches)

Each row = one delivery/batch of a product with its own expiry date and cost.

```sql
CREATE TYPE inventory_status AS ENUM (
    'active',       -- normal stock on shelf
    'discounted',   -- currently has an active discount
    'expired',      -- past expiry date
    'damaged',      -- fully written off as damaged
    'removed'       -- manually pulled from shelf
);

CREATE TABLE inventory_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       UUID REFERENCES products(id) ON DELETE RESTRICT,
    batch_number     VARCHAR(100),
    quantity         INT NOT NULL CHECK (quantity >= 0),
    quantity_damaged INT NOT NULL DEFAULT 0,
    unit_cost        NUMERIC(12, 2) NOT NULL,
    -- what was paid per unit
    selling_price    NUMERIC(12, 2) NOT NULL,
    -- current shelf price (updated by discounts)
    original_price   NUMERIC(12, 2) NOT NULL,
    -- original selling price before any discount
    expiry_date      DATE NOT NULL,
    manufacture_date DATE,
    location         VARCHAR(100),
    -- e.g. 'Aisle 3, Chiller 2'
    status           inventory_status DEFAULT 'active',
    received_date    DATE DEFAULT CURRENT_DATE,
    received_by      UUID REFERENCES profiles(id),
    notes            TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for frequent queries
CREATE INDEX idx_inventory_expiry   ON inventory_items(expiry_date);
CREATE INDEX idx_inventory_product  ON inventory_items(product_id);
CREATE INDEX idx_inventory_status   ON inventory_items(status);
```

---

## 8. Damage Records

```sql
CREATE TYPE damage_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE damage_records (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id     UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
    quantity_damaged      INT NOT NULL CHECK (quantity_damaged > 0),
    reason                VARCHAR(255) NOT NULL,
    -- e.g. 'Spillage', 'Pest damage', 'Expiry write-off', 'Transit damage'
    estimated_value_lost  NUMERIC(12, 2) NOT NULL,
    reported_by           UUID REFERENCES profiles(id),
    approved_by           UUID REFERENCES profiles(id),
    status                damage_status DEFAULT 'pending',
    notes                 TEXT,
    reported_at           TIMESTAMPTZ DEFAULT NOW(),
    approved_at           TIMESTAMPTZ
);
```

---

## 9. Discounts

```sql
CREATE TYPE discount_type   AS ENUM ('manual', 'ai_suggested', 'flash_sale', 'clearance');
CREATE TYPE discount_status AS ENUM ('active', 'expired', 'cancelled');

CREATE TABLE discounts (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id    UUID REFERENCES inventory_items(id) ON DELETE RESTRICT,
    name                 VARCHAR(255),
    -- e.g. 'Dairy Flash Sale — 35%'
    discount_percentage  NUMERIC(5, 2) NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
    discount_type        discount_type DEFAULT 'manual',
    original_price       NUMERIC(12, 2) NOT NULL,
    discounted_price     NUMERIC(12, 2) NOT NULL,
    start_date           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_date             TIMESTAMPTZ NOT NULL,
    applied_by           UUID REFERENCES profiles(id),
    approved_by          UUID REFERENCES profiles(id),
    -- required if discount_percentage > 30
    status               discount_status DEFAULT 'active',
    units_sold           INT DEFAULT 0,
    revenue_recovered    NUMERIC(12, 2) DEFAULT 0,
    created_at           TIMESTAMPTZ DEFAULT NOW(),
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_discounts_item   ON discounts(inventory_item_id);
CREATE INDEX idx_discounts_status ON discounts(status);
```

---

## 10. Automated Alerts

```sql
CREATE TYPE alert_frequency AS ENUM ('once', 'every_hour', 'every_6h', 'every_12h', 'daily');

CREATE TABLE automated_alerts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                  VARCHAR(255) NOT NULL,
    trigger_condition     JSONB NOT NULL,
    -- Examples:
    -- {"type": "days_to_expiry", "value": 7, "category_id": 1}
    -- {"type": "damage_value_exceeds", "value": 50000}
    -- {"type": "discount_effectiveness_below", "value": 40}
    channels              TEXT[] NOT NULL DEFAULT '{in_app}',
    -- ['email', 'sms', 'in_app']
    recipients            JSONB NOT NULL,
    -- {"emails": ["mgr@foodco.com"], "phones": ["+2348031234567"]}
    frequency             alert_frequency DEFAULT 'once',
    escalation_hours      INT,
    -- escalate to next recipient group if unacknowledged after N hours
    ai_generated_message  BOOLEAN DEFAULT TRUE,
    is_active             BOOLEAN DEFAULT TRUE,
    created_by            UUID REFERENCES profiles(id),
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 11. Alert Logs

```sql
CREATE TYPE alert_log_status AS ENUM (
    'sent', 'failed', 'snoozed', 'resolved', 'acknowledged'
);

CREATE TABLE alert_logs (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id             UUID REFERENCES automated_alerts(id) ON DELETE SET NULL,
    triggered_at         TIMESTAMPTZ DEFAULT NOW(),
    message_sent         TEXT,
    channels_used        TEXT[],
    recipients_notified  JSONB,
    status               alert_log_status DEFAULT 'sent',
    resolved_by          UUID REFERENCES profiles(id),
    resolved_at          TIMESTAMPTZ,
    notes                TEXT
);

CREATE INDEX idx_alert_logs_alert    ON alert_logs(alert_id);
CREATE INDEX idx_alert_logs_triggered ON alert_logs(triggered_at DESC);
```

---

## 12. Scheduled Reports

```sql
CREATE TYPE report_type AS ENUM (
    'damage', 'expiry', 'discount', 'comprehensive'
);

CREATE TABLE scheduled_reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                VARCHAR(255) NOT NULL,
    report_type         report_type NOT NULL,
    schedule_cron       VARCHAR(100) NOT NULL,
    -- Standard cron: '0 8 * * *' = daily at 8 AM
    recipients          TEXT[] NOT NULL,
    include_ai_summary  BOOLEAN DEFAULT TRUE,
    include_excel       BOOLEAN DEFAULT TRUE,
    is_active           BOOLEAN DEFAULT TRUE,
    last_generated      TIMESTAMPTZ,
    next_generation     TIMESTAMPTZ,
    created_by          UUID REFERENCES profiles(id),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 13. Report Logs

```sql
CREATE TYPE report_log_status AS ENUM ('success', 'failed');

CREATE TABLE report_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheduled_report_id UUID REFERENCES scheduled_reports(id) ON DELETE SET NULL,
    report_type         report_type NOT NULL,
    generated_at        TIMESTAMPTZ DEFAULT NOW(),
    file_url            TEXT,
    -- Supabase Storage URL for the generated .xlsx file
    email_sent_to       TEXT[],
    status              report_log_status DEFAULT 'success',
    error_message       TEXT
);
```

---

## Row Level Security (RLS) — Key Policies

Supabase enforces RLS at the database level. Key rules:

```sql
-- Enable RLS on all tables
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE damage_records   ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE automated_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

-- Example: Users can only read inventory if they have 'view_inventory' permission
CREATE POLICY "inventory_read_policy"
ON inventory_items FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles p
        JOIN role_permissions rp ON rp.role_id = p.role_id
        JOIN permissions perm ON perm.id = rp.permission_id
        WHERE p.id = auth.uid()
        AND perm.key = 'view_inventory'
        AND p.is_active = TRUE
    )
);
```

---

## Computed / Derived Values (Not Stored)

These are calculated on query, not stored, to keep data fresh:

| Value | Calculation |
|-------|-------------|
| `days_to_expiry` | `expiry_date - CURRENT_DATE` |
| `total_stock_value` | `SUM(quantity * selling_price)` per product |
| `value_at_risk` | `SUM(quantity * selling_price)` where `days_to_expiry <= 7` |
| `discount_recovery_rate` | `revenue_recovered / (units_sold * original_price) * 100` |
| `total_damage_loss` | `SUM(estimated_value_lost)` from damage_records |

---

## Seed Data (Development)

```sql
-- Categories
INSERT INTO categories (name) VALUES
    ('Dairy'), ('Bakery'), ('Beverages'),
    ('Vegetables & Fruits'), ('Frozen Foods'),
    ('Snacks'), ('Household');

-- Sample product
INSERT INTO products (name, sku, category_id, unit, standard_price, reorder_level)
VALUES ('Greek Yogurt 500g', 'DAIRY-YOG-001', 1, 'piece', 1200.00, 20);
```

---

## Summary Counts

| Table | Estimated Row Growth |
|-------|---------------------|
| products | Slow (hundreds) |
| inventory_items | Medium (new batch per delivery) |
| damage_records | Low-medium (incidents) |
| discounts | Medium (daily activity) |
| alert_logs | High (automated, daily volume) |
| report_logs | Low (scheduled, max 1/day) |

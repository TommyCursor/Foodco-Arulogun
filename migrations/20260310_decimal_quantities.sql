-- Migration: Allow decimal quantities on inventory_items and damage_records
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)
--
-- Root cause: INT columns silently round decimals. Values < 0.5 (e.g. 0.1, 0.4) rounded
-- to 0, which failed the CHECK (quantity_damaged > 0) constraint, blocking submit.
-- Values >= 0.5 (e.g. 1.5, 4.2) silently rounded, producing wrong data downstream.
--
-- Two views depend on inventory_items.quantity and must be dropped then recreated.

-- Step 1: Drop dependent views
DROP VIEW IF EXISTS expiring_soon;
DROP VIEW IF EXISTS dashboard_kpis;


-- Step 2: Alter column types
ALTER TABLE inventory_items
  ALTER COLUMN quantity         TYPE NUMERIC(12, 2),
  ALTER COLUMN quantity_damaged TYPE NUMERIC(12, 2);

ALTER TABLE damage_records
  ALTER COLUMN quantity_damaged TYPE NUMERIC(12, 2);

-- Step 3: Recreate views

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

CREATE VIEW dashboard_kpis AS
SELECT
    (SELECT COUNT(*) FROM inventory_items WHERE status IN ('active','discounted'))           AS total_active_batches,
    (SELECT COUNT(*) FROM inventory_items WHERE expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 AND status IN ('active','discounted')) AS expiring_in_7_days,
    (SELECT COUNT(*) FROM inventory_items WHERE expiry_date < CURRENT_DATE AND status != 'expired') AS expired_today,
    (SELECT COUNT(*) FROM discounts WHERE status = 'active')                                AS active_discounts,
    (SELECT COALESCE(SUM(estimated_value_lost),0) FROM damage_records WHERE reported_at >= CURRENT_DATE) AS damage_value_today,
    (SELECT COALESCE(SUM(quantity * selling_price),0) FROM inventory_items WHERE status IN ('active','discounted') AND expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7) AS value_at_risk_7_days;

-- Fix existing discounts that were auto-approved at creation
-- (approved_by was incorrectly set to the reporter's own ID)
-- This resets them to pending so a manager must explicitly approve.

UPDATE discounts
SET approved_by = NULL
WHERE approved_by IS NOT NULL
  AND approved_by = applied_by
  AND status = 'active';

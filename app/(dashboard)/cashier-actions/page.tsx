import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/getProfile'
import CashierActionsClient  from './CashierActionsClient'

export default async function CashierActionsPage() {
  await requirePermission('view_cashier_queue')

  const admin = createAdminClient()
  const { data: items } = await admin
    .from('inventory_items')
    .select(`
      id, quantity, selling_price, original_price, expiry_date, status, pipeline_stage, notes, created_at, updated_at,
      product:products (id, name, sku, category:categories (id, name)),
      damage_records (id, reason, estimated_value_lost, reported_at),
      discounts (id, discount_percentage, discounted_price, created_at)
    `)
    .eq('pipeline_stage', 'sales_approved')
    .order('updated_at', { ascending: true })

  return <CashierActionsClient items={(items ?? []) as any[]} />
}

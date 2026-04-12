import { createAdminClient }  from '@/lib/supabase/admin'
import { requirePermission }  from '@/lib/auth/getProfile'
import ApprovalClient         from './ApprovalClient'

export default async function ApprovalPage() {
  await requirePermission('view_approval')

  const admin = createAdminClient()
  const { data: items } = await admin
    .from('inventory_items')
    .select(`
      id, quantity, selling_price, original_price, expiry_date, status, pipeline_stage, notes, created_at, updated_at,
      product:products (id, name, sku, category:categories (id, name)),
      damage_records (id, reason, estimated_value_lost, reported_at),
      discounts (id, discount_percentage, discounted_price, original_price, created_at)
    `)
    .eq('pipeline_stage', 'resolution_received')
    .order('updated_at', { ascending: true })

  return <ApprovalClient items={(items ?? []) as any[]} />
}

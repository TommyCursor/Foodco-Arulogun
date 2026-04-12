import { createAdminClient }  from '@/lib/supabase/admin'
import { requirePermission }  from '@/lib/auth/getProfile'
import ResolutionClient       from './ResolutionClient'

export default async function ResolutionPage() {
  await requirePermission('view_resolution')

  const admin = createAdminClient()
  const { data: items } = await admin
    .from('inventory_items')
    .select(`
      id, quantity, selling_price, original_price, expiry_date, status, pipeline_stage, notes, created_at, updated_at,
      product:products (id, name, sku, category:categories (id, name)),
      damage_records (id, reason, reported_at),
      discounts (id, discount_percentage, discounted_price, created_at)
    `)
    .in('pipeline_stage', ['sent_to_loss_control', 'sent_to_resolution', 'resolution_received'])
    .order('updated_at', { ascending: true })

  return <ResolutionClient items={(items ?? []) as any[]} />
}

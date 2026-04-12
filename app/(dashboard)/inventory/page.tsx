export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/getProfile'
import InventoryClient from './InventoryClient'
import type { InventoryItem, Category } from '@/types'

export default async function InventoryPage() {
  await requirePermission('view_inventory')
  const supabase = await createClient()
  const admin    = createAdminClient()

  const [{ data: items }, { data: categories }] = await Promise.all([
    admin
      .from('inventory_items')
      .select(`
        *,
        product:products (
          id, name, sku, unit, standard_price,
          category:categories (id, name)
        ),
        damage_records (id, reason, reported_at, approved_by, approver:profiles!damage_records_approved_by_fkey(full_name)),
        discounts (id, created_at, approved_by, approver:profiles!discounts_approved_by_fkey(full_name))
      `)
      .neq('status', 'removed')
      .order('expiry_date', { ascending: true }),
    supabase
      .from('categories')
      .select('*')
      .order('name'),
  ])

  return (
    <InventoryClient
      items={(items as unknown as InventoryItem[]) ?? []}
      categories={(categories as unknown as Category[]) ?? []}
    />
  )
}

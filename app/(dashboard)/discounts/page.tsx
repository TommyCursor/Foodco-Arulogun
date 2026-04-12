export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/getProfile'
import DiscountsClient from './DiscountsClient'
import type { Discount, InventoryItem } from '@/types'

export default async function DiscountsPage() {
  await requirePermission('manage_discounts')
  const supabase = await createClient()

  const [{ data: discounts }, { data: eligibleBatches }] = await Promise.all([
    supabase
      .from('discounts')
      .select(`
        *,
        applicant:profiles!discounts_applied_by_fkey(full_name),
        inventory_item:inventory_items (
          id, batch_number, quantity, expiry_date, selling_price, original_price, location, pipeline_stage,
          product:products (id, name, sku, unit,
            category:categories (id, name)
          )
        )
      `)
      .order('created_at', { ascending: false }),

    // Batches eligible for discounting: active, expiring within 14 days
    supabase
      .from('inventory_items')
      .select(`
        id, batch_number, quantity, selling_price, original_price, expiry_date, location,
        product:products (id, name, sku)
      `)
      .in('status', ['active', 'discounted'])
      .lte('expiry_date', new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('expiry_date', { ascending: true }),
  ])

  // Fetch approver names via admin client (bypasses RLS on profiles for cross-user lookups)
  const admin = createAdminClient()
  const approverIds = [...new Set((discounts ?? []).map(d => d.approved_by).filter(Boolean))]
  let approverMap: Record<string, string> = {}
  if (approverIds.length) {
    const { data: approvers } = await admin
      .from('profiles')
      .select('id, full_name')
      .in('id', approverIds)
    approverMap = Object.fromEntries((approvers ?? []).map(p => [p.id, p.full_name]))
  }
  const discountsWithApprover = (discounts ?? []).map(d => ({
    ...d,
    approver: d.approved_by ? { full_name: approverMap[d.approved_by] ?? null } : null,
  }))

  return (
    <DiscountsClient
      discounts={discountsWithApprover as Discount[]}
      eligibleBatches={(eligibleBatches as unknown as InventoryItem[]) ?? []}
    />
  )
}

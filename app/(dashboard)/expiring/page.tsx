export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/getProfile'
import ExpiringClient from './ExpiringClient'
import type { InventoryItem } from '@/types'

export default async function ExpiringPage() {
  await requirePermission('view_inventory')
  const admin = createAdminClient()

  // Fetch items expiring within the next 95 days (covers the 3-month alert window)
  const cutoff = new Date(Date.now() + 95 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: items } = await admin
    .from('inventory_items')
    .select(`
      id, batch_number, quantity, selling_price, expiry_date, location, status, pipeline_stage,
      product:products (id, name, sku, unit)
    `)
    .in('status', ['active', 'discounted'])
    .lte('expiry_date', cutoff)
    .order('expiry_date', { ascending: true })

  // Fetch which notification thresholds have already been sent per item
  const itemIds = (items ?? []).map(i => i.id)
  const { data: sentNotifications } = itemIds.length > 0
    ? await admin
        .from('expiry_notifications')
        .select('item_id, threshold, sent_at')
        .in('item_id', itemIds)
    : { data: [] }

  // Build a map: item_id → Set of sent threshold keys
  const sentMap: Record<string, { threshold: string; sent_at: string }[]> = {}
  for (const n of sentNotifications ?? []) {
    if (!sentMap[n.item_id]) sentMap[n.item_id] = []
    sentMap[n.item_id].push({ threshold: n.threshold, sent_at: n.sent_at })
  }

  return (
    <ExpiringClient
      items={(items as unknown as InventoryItem[]) ?? []}
      sentNotifications={sentMap}
    />
  )
}

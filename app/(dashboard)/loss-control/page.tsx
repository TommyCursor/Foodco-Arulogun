export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/getProfile'
import LossControlClient from './LossControlClient'
import type { InventoryItem } from '@/types'

export default async function LossControlPage() {
  await requirePermission('view_loss_control')
  const supabase = await createClient()

  const { data: items } = await supabase
    .from('inventory_items')
    .select(`
      id, batch_number, quantity, selling_price, expiry_date, location, pipeline_stage,
      product:products (id, name, sku, unit)
    `)
    .in('pipeline_stage', ['damage_reported', 'discount_reported', 'expiry_reported'])
    .order('pipeline_stage')
    .order('expiry_date', { ascending: true })

  return <LossControlClient items={(items as unknown as InventoryItem[]) ?? []} />
}

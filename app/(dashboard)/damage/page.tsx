export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/getProfile'
import DamageClient from './DamageClient'
import type { DamageRecord } from '@/types'

export default async function DamagePage() {
  await requirePermission('mark_damage')
  const supabase = await createClient()

  const { data: records } = await supabase
    .from('damage_records')
    .select(`
      *,
      inventory_item:inventory_items (
        id, batch_number, quantity, selling_price, expiry_date, location, pipeline_stage,
        product:products (id, name, sku, unit)
      ),
      reporter:profiles!damage_records_reported_by_fkey (id, full_name),
      approver:profiles!damage_records_approved_by_fkey  (id, full_name)
    `)
    .order('reported_at', { ascending: false })

  return (
    <DamageClient
      records={(records as unknown as DamageRecord[]) ?? []}
    />
  )
}

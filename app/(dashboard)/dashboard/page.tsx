export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/getProfile'
import DashboardClient from './DashboardClient'
import type { DashboardKPIs, InventoryItem } from '@/types'

export default async function DashboardPage() {
  const profile  = await requirePermission('view_dashboard')
  const supabase = await createClient()
  const admin    = createAdminClient()

  const [
    { data: kpiRow },
    { data: expiringItems },
    { data: pendingDamage },
    { data: pendingDiscounts },
    { data: pipelineRows },
    { data: recentAudit },
  ] = await Promise.all([
    // 1. KPI snapshot
    supabase.from('dashboard_kpis').select('*').single(),

    // 2. All items expiring in 7 days
    supabase.from('expiring_soon').select('*').limit(20),

    // 3. Recent pending damage records
    admin
      .from('damage_records')
      .select('id, reason, estimated_value_lost, reported_at, inventory_item:inventory_items(product:products(name))')
      .eq('status', 'pending')
      .order('reported_at', { ascending: false })
      .limit(5),

    // 4. Discounts awaiting approval
    admin
      .from('discounts')
      .select('id, discount_percentage, discounted_price, original_price, created_at, inventory_item:inventory_items(product:products(name))')
      .eq('status', 'active')
      .is('approved_by', null)
      .order('created_at', { ascending: false })
      .limit(5),

    // 5. Pipeline stage breakdown
    admin
      .from('inventory_items')
      .select('pipeline_stage')
      .in('status', ['active', 'discounted'])
      .not('pipeline_stage', 'is', null),

    // 6. Recent audit log
    admin
      .from('audit_logs')
      .select('id, module, action, entity_label, created_at, actor:profiles!audit_logs_user_id_fkey(full_name)')
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const kpi: DashboardKPIs = (kpiRow as DashboardKPIs | null) ?? {
    total_active_batches: 0,
    expiring_in_7_days:   0,
    expired_today:        0,
    active_discounts:     0,
    damage_value_today:   0,
    value_at_risk_7_days: 0,
  }

  // Count by pipeline stage
  const stageCounts: Record<string, number> = {}
  for (const row of pipelineRows ?? []) {
    const s = row.pipeline_stage as string
    stageCounts[s] = (stageCounts[s] ?? 0) + 1
  }

  return (
    <DashboardClient
      kpi={kpi}
      expiringItems={(expiringItems as unknown as InventoryItem[]) ?? []}
      pendingDamage={(pendingDamage ?? []) as any[]}
      pendingDiscounts={(pendingDiscounts ?? []) as any[]}
      stageCounts={stageCounts}
      recentAudit={(recentAudit ?? []) as any[]}
      userName={profile.full_name}
      userRole={profile.role_name}
    />
  )
}

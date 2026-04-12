export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/getProfile'
import AlertsClient from './AlertsClient'
import type { AutomatedAlert, AlertLog, Category } from '@/types'

export default async function AlertsPage() {
  await requirePermission('create_alerts')
  const supabase = await createClient()

  const [{ data: alerts }, { data: logs }, { data: categories }] = await Promise.all([
    supabase.from('automated_alerts').select('*').order('created_at', { ascending: false }),
    supabase.from('alert_logs').select('*, alert:automated_alerts(name)').order('triggered_at', { ascending: false }).limit(100),
    supabase.from('categories').select('*').order('name'),
  ])

  return (
    <AlertsClient
      alerts={(alerts as unknown as AutomatedAlert[]) ?? []}
      logs={(logs as unknown as AlertLog[]) ?? []}
      categories={(categories as unknown as Category[]) ?? []}
    />
  )
}

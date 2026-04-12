export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/getProfile'
import ReportsClient from './ReportsClient'
import type { ScheduledReport, ReportLog } from '@/types'

export default async function ReportsPage() {
  await requirePermission('view_reports')
  const supabase = await createClient()

  const [{ data: scheduled }, { data: logs }] = await Promise.all([
    supabase.from('scheduled_reports').select('*').order('created_at', { ascending: false }),
    supabase.from('report_logs').select('*, generator:profiles!report_logs_generated_by_fkey(full_name)').order('generated_at', { ascending: false }).limit(50),
  ])

  return (
    <ReportsClient
      scheduledReports={(scheduled as unknown as ScheduledReport[]) ?? []}
      reportLogs={(logs as unknown as ReportLog[]) ?? []}
    />
  )
}

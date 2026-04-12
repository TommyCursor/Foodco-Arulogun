import { createAdminClient } from '@/lib/supabase/admin'
import RosterClient from './RosterClient'
import dayjs from 'dayjs'

export default async function RosterPage() {
  const admin = createAdminClient()

  // Fetch most recent 12 rosters for navigation
  const { data: allRosters } = await admin
    .from('rosters')
    .select('id, week_start, status')
    .order('week_start', { ascending: false })
    .limit(12)

  // Default: most recent roster (prefer draft upcoming, then latest published)
  const currentSummary = allRosters?.[0] ?? null

  // Derive current week start for leave queries
  // Monday of current week (dayjs().day(): 0=Sun,1=Mon…)
  const todayDow = dayjs().day()
  const offset   = todayDow === 0 ? -6 : 1 - todayDow
  const weekStart = currentSummary?.week_start
    ?? dayjs().add(offset, 'day').format('YYYY-MM-DD')
  const weekEnd = dayjs(weekStart).add(6, 'day').format('YYYY-MM-DD')

  let roster: any = null
  let entries: any[] = []

  if (currentSummary) {
    const [rosterRes, entriesRes] = await Promise.all([
      admin
        .from('rosters')
        .select('id, week_start, status, notes, published_at, created_at')
        .eq('id', currentSummary.id)
        .single(),
      admin
        .from('roster_entries')
        .select(`
          id, section,
          monday, tuesday, wednesday, thursday, friday, saturday, sunday,
          notes,
          profile:profiles (id, full_name, role:roles (name))
        `)
        .eq('roster_id', currentSummary.id),
    ])
    roster  = rosterRes.data  ?? null
    entries = entriesRes.data ?? []
  }

  // Approved leaves for the current week (for cell tagging)
  const { data: approvedLeaves } = await admin
    .from('leave_requests')
    .select('user_id, requested_date')
    .eq('status', 'approved')
    .gte('requested_date', weekStart)
    .lte('requested_date', weekEnd)

  // Pending leave count for manager badge
  const { count: pendingLeaveCount } = await admin
    .from('leave_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')

  return (
    <RosterClient
      initialRoster={roster}
      initialEntries={entries as any[]}
      allRosters={(allRosters ?? []) as any[]}
      initialApprovedLeaves={(approvedLeaves ?? []) as { user_id: string; requested_date: string }[]}
      initialPendingLeaveCount={pendingLeaveCount ?? 0}
    />
  )
}

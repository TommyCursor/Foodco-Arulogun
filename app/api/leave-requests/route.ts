import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyRoleUsers } from '@/lib/services/notificationService'
import { logAudit } from '@/lib/services/audit'

const MANAGER_ROLES = ['manager', 'admin', 'supervisor']

// GET /api/leave-requests?status=pending&week_start=YYYY-MM-DD&week_end=YYYY-MM-DD
// Managers see all; staff see their own
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const params = req.nextUrl.searchParams
  const status     = params.get('status')
  const weekStart  = params.get('week_start')
  const weekEnd    = params.get('week_end')

  // Determine caller's role
  const { data: profile } = await admin
    .from('profiles')
    .select('role:roles(name)')
    .eq('id', user.id)
    .single()
  const roleName: string = (profile?.role as any)?.name ?? ''
  const isManager = MANAGER_ROLES.includes(roleName)

  let query = admin
    .from('leave_requests')
    .select(`
      id, user_id, requested_date, reason, status,
      actioned_at, manager_note, created_at,
      profile:profiles!leave_requests_user_id_fkey(full_name, role:roles(name))
    `)
    .order('created_at', { ascending: false })

  // Scope to own requests for non-managers
  if (!isManager) query = query.eq('user_id', user.id)

  if (status) query = query.eq('status', status)

  // Date range filter (used for week-level approved leave lookup)
  if (weekStart && weekEnd) {
    query = query.gte('requested_date', weekStart).lte('requested_date', weekEnd)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ requests: data ?? [] })
}

// POST /api/leave-requests — submit a leave request
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { requested_date, reason } = body

  if (!requested_date) {
    return NextResponse.json({ error: 'requested_date is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Check for duplicate
  const { data: existing } = await admin
    .from('leave_requests')
    .select('id, status')
    .eq('user_id', user.id)
    .eq('requested_date', requested_date)
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: `You already have a ${existing.status} request for this date` },
      { status: 409 },
    )
  }

  const { data, error } = await admin
    .from('leave_requests')
    .insert({ user_id: user.id, requested_date, reason: reason ?? null })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get staff name for notification
  const { data: profileRow } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()
  const staffName = profileRow?.full_name ?? 'A staff member'

  // Notify managers only — this is a discreet HR request, not a broadcast
  const dateLabel = new Date(requested_date + 'T00:00:00').toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  await notifyRoleUsers('manager', {
    title:      'Off Day Request Submitted',
    message:    `${staffName} has requested ${dateLabel} off.${reason ? ` Reason: ${reason}` : ''} Please review and approve or decline.`,
    type:       'leave_request',
    entity_id:  data.id,
    action_url: '/roster',
  })

  logAudit({ userId: user.id, module: 'leave_requests', action: 'create', entityId: data.id, entityLabel: `Leave request for ${requested_date}` })
  return NextResponse.json({ id: data.id })
}

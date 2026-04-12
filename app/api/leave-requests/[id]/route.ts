import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyUser } from '@/lib/services/notificationService'
import { logAudit } from '@/lib/services/audit'

const MANAGER_ROLES = ['manager', 'admin', 'supervisor']

// PATCH /api/leave-requests/[id] — approve or decline
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Verify caller is a manager/supervisor/admin
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('full_name, role:roles(name)')
    .eq('id', user.id)
    .single()
  const roleName: string = (callerProfile?.role as any)?.name ?? ''
  if (!MANAGER_ROLES.includes(roleName)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { status, manager_note } = body

  if (!['approved', 'declined'].includes(status)) {
    return NextResponse.json({ error: 'status must be approved or declined' }, { status: 400 })
  }

  // Fetch the request so we can notify the staff member
  const { data: lr } = await admin
    .from('leave_requests')
    .select('user_id, requested_date, reason')
    .eq('id', id)
    .single()

  if (!lr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await admin
    .from('leave_requests')
    .update({
      status,
      actioned_by:  user.id,
      actioned_at:  new Date().toISOString(),
      manager_note: manager_note ?? null,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify the requesting staff member
  const dateLabel = new Date(lr.requested_date + 'T00:00:00').toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
  const managerName = callerProfile?.full_name ?? 'Your manager'
  const isApproved  = status === 'approved'

  await notifyUser(lr.user_id, {
    title:      isApproved ? 'Leave Request Approved' : 'Leave Request Declined',
    message:    isApproved
      ? `Your day-off request for ${dateLabel} has been approved by ${managerName}.${manager_note ? ` Note: ${manager_note}` : ''} This date will be marked on your roster.`
      : `Your day-off request for ${dateLabel} has been declined by ${managerName}.${manager_note ? ` Note: ${manager_note}` : ''}`,
    type:       isApproved ? 'leave_approved' : 'leave_declined',
    entity_id:  id,
    action_url: '/roster',
  })

  logAudit({ userId: user.id, module: 'leave_requests', action: isApproved ? 'approve' : 'reject', entityId: id, entityLabel: `Leave ${lr.requested_date} for user ${lr.user_id}` })
  return NextResponse.json({ ok: true })
}

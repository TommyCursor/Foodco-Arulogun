import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { publishRoster } from '@/lib/services/rosterService'
import { logAudit } from '@/lib/services/audit'
import { notifyAllActiveUsers } from '@/lib/services/notificationService'

// PATCH /api/roster/[id]  — publish a draft roster
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Fetch week_start before publishing so we can use it in the notification
  const { data: rosterRow } = await admin
    .from('rosters')
    .select('week_start')
    .eq('id', id)
    .maybeSingle()

  const success = await publishRoster(id, user.id)
  if (!success) {
    return NextResponse.json(
      { error: 'Could not publish roster. It may already be published or not exist.' },
      { status: 400 },
    )
  }

  const weekStart = rosterRow?.week_start ?? ''

  // Notify all active staff — in-app + email (must be awaited before response; Vercel
  // terminates execution as soon as the response is returned, so fire-and-forget would
  // silently drop notifications on serverless deployments)
  await notifyAllActiveUsers({
    title:        'Your Weekly Roster is Ready',
    message:      `The staff roster for week starting ${weekStart} has been published. Check your schedule now.`,
    type:         'roster_published',
    entity_id:    id,
    entity_label: `Week of ${weekStart}`,
    action_url:   '/roster',
  })

  logAudit({ userId: user.id, module: 'roster', action: 'publish', entityId: id, entityLabel: `Roster week ${weekStart}` })
  return NextResponse.json({ ok: true })
}

// DELETE /api/roster/[id]  — delete a draft roster (published rosters cannot be deleted)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Guard: only delete if still a draft
  const { data: roster } = await admin
    .from('rosters')
    .select('id, status, week_start')
    .eq('id', id)
    .maybeSingle()

  if (!roster) return NextResponse.json({ error: 'Roster not found' }, { status: 404 })
  if (roster.status === 'published') {
    return NextResponse.json({ error: 'Published rosters cannot be deleted' }, { status: 400 })
  }

  // Cascade delete (roster_entries have ON DELETE CASCADE)
  const { error } = await admin.from('rosters').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logAudit({ userId: user.id, module: 'roster', action: 'delete', entityId: id, entityLabel: `Roster week ${roster.week_start}` })
  return NextResponse.json({ ok: true })
}

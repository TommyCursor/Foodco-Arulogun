import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/services/audit'

// PATCH /api/users/[id] — update role or active status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body   = await req.json()
  const admin  = createAdminClient()

  const { data, error } = await admin.from('profiles').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If deactivating, immediately invalidate all active sessions for this user
  if (body.is_active === false) {
    await admin.auth.admin.signOut(id, 'global')
  }

  logAudit({
    userId:      user.id,
    module:      'users',
    action:      'update',
    entityId:    id,
    entityLabel: `User ${id}`,
    details:     body,
  })

  return NextResponse.json(data)
}

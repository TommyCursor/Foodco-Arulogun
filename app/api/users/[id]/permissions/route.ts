import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/services/audit'

type Params = { params: Promise<{ id: string }> }

async function getCallerProfile(supabase: Awaited<ReturnType<typeof createClient>>, admin: ReturnType<typeof createAdminClient>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await admin
    .from('profiles')
    .select('role_id, roles(name)')
    .eq('id', user.id)
    .single()

  return profile ? { user, roleName: (profile.roles as any)?.name ?? '' } : null
}

// PUT /api/users/[id]/permissions — upsert a single override
export async function PUT(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const admin    = createAdminClient()
  const caller   = await getCallerProfile(supabase, admin)

  if (!caller)                      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (caller.roleName !== 'admin')  return NextResponse.json({ error: 'Admin only' },  { status: 403 })

  const { id }                          = await params
  const { permission_key, granted }     = await req.json()

  if (!permission_key || granted === undefined) {
    return NextResponse.json({ error: 'permission_key and granted are required' }, { status: 400 })
  }

  const { error } = await admin
    .from('user_permission_overrides')
    .upsert(
      { user_id: id, permission_key, granted, granted_by: caller.user.id },
      { onConflict: 'user_id,permission_key' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logAudit({
    userId:      caller.user.id,
    module:      'users',
    action:      'update',
    entityId:    id,
    entityLabel: `Permission override: ${permission_key}`,
    details:     { permission_key, granted },
  })

  return NextResponse.json({ ok: true })
}

// DELETE /api/users/[id]/permissions — remove a single override
export async function DELETE(req: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const admin    = createAdminClient()
  const caller   = await getCallerProfile(supabase, admin)

  if (!caller)                      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (caller.roleName !== 'admin')  return NextResponse.json({ error: 'Admin only' },  { status: 403 })

  const { id }           = await params
  const { permission_key } = await req.json()

  if (!permission_key) {
    return NextResponse.json({ error: 'permission_key is required' }, { status: 400 })
  }

  const { error } = await admin
    .from('user_permission_overrides')
    .delete()
    .eq('user_id', id)
    .eq('permission_key', permission_key)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logAudit({
    userId:      caller.user.id,
    module:      'users',
    action:      'update',
    entityId:    id,
    entityLabel: `Permission override removed: ${permission_key}`,
    details:     { permission_key, granted: null },
  })

  return NextResponse.json({ ok: true })
}

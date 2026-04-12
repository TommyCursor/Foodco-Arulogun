import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/services/audit'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('role:roles(name)').eq('id', user.id).single()
  const roleName = (profile?.role as any)?.name ?? ''
  if (roleName !== 'admin') return null
  return { user, admin }
}

// PUT /api/role-permissions
// Body: { role_id: number, permission_key: string, granted: boolean }
export async function PUT(req: NextRequest) {
  const ctx = await requireAdmin()
  if (!ctx) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { role_id, permission_key, granted } = await req.json() as {
    role_id:        number
    permission_key: string
    granted:        boolean
  }

  if (!role_id || !permission_key || granted === undefined) {
    return NextResponse.json({ error: 'role_id, permission_key, and granted are required' }, { status: 400 })
  }

  const { data: perm } = await ctx.admin
    .from('permissions')
    .select('id')
    .eq('key', permission_key)
    .single()

  if (!perm) return NextResponse.json({ error: 'Unknown permission key' }, { status: 404 })

  let error: any = null

  if (granted) {
    const { error: e } = await ctx.admin
      .from('role_permissions')
      .upsert({ role_id, permission_id: perm.id }, { onConflict: 'role_id,permission_id' })
    error = e
  } else {
    const { error: e } = await ctx.admin
      .from('role_permissions')
      .delete()
      .eq('role_id', role_id)
      .eq('permission_id', perm.id)
    error = e
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logAudit({
    userId:      ctx.user.id,
    module:      'users',
    action:      'update',
    entityLabel: `Role ${role_id} permission ${permission_key}: ${granted ? 'granted' : 'revoked'}`,
    details:     { role_id, permission_key, granted },
  })

  return NextResponse.json({ ok: true })
}

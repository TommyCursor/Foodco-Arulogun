import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  // Auth check via cookie session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Data via admin client — reliable, no RLS deep-join issues
  const admin = createAdminClient()

  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, full_name, role_id, roles(name)')
    .eq('id', user.id)
    .single()

  if (profileErr || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const { data: perms } = await admin
    .from('role_permissions')
    .select('permissions(key)')
    .eq('role_id', profile.role_id)

  const permissions: string[] =
    (perms ?? []).map((row: any) => row.permissions?.key).filter(Boolean)

  return NextResponse.json({
    id: profile.id,
    full_name: profile.full_name,
    role_id: profile.role_id,
    role_name: (profile.roles as any)?.name ?? 'unknown',
    permissions,
  })
}

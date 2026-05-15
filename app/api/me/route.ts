import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Single query — join profile + role + permissions in one round-trip
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id, full_name, role_id, roles(name, role_permissions(permissions(key)))')
    .eq('id', user.id)
    .single()

  if (error || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const role        = (profile.roles as any)
  const rolePerms   = role?.role_permissions ?? []
  const permissions = rolePerms
    .map((rp: any) => rp.permissions?.key)
    .filter(Boolean) as string[]

  const body = JSON.stringify({
    id:          profile.id,
    full_name:   profile.full_name,
    role_id:     profile.role_id,
    role_name:   role?.name ?? 'unknown',
    permissions,
  })

  // Cache in browser for 60 s — role changes are rare and non-critical
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'private, max-age=60, stale-while-revalidate=30',
    },
  })
}

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export interface UserProfile {
  id: string
  full_name: string
  role_id: number
  role_name: string
  permissions: string[]
}

export async function getProfile(): Promise<UserProfile> {
  // Use regular client just for auth (reads from cookie session)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Use admin client for data — bypasses RLS, avoids deep-join issues
  const admin = createAdminClient()

  // Step 1: get profile + role name
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, full_name, role_id, is_active, roles(name)')
    .eq('id', user.id)
    .single()

  if (profileErr || !profile) redirect('/login')

  // Block deactivated accounts — sign out and redirect
  if (!profile.is_active) {
    await supabase.auth.signOut()
    redirect('/login?error=deactivated')
  }

  // Step 2: get all permission keys for this role
  const { data: perms } = await admin
    .from('role_permissions')
    .select('permissions(key)')
    .eq('role_id', profile.role_id)

  let permissions: string[] =
    (perms ?? []).map((row: any) => row.permissions?.key).filter(Boolean)

  // Step 3: apply per-user overrides on top of role defaults
  const { data: overrides } = await admin
    .from('user_permission_overrides')
    .select('permission_key, granted')
    .eq('user_id', user.id)

  for (const o of overrides ?? []) {
    if (o.granted) {
      if (!permissions.includes(o.permission_key)) permissions.push(o.permission_key)
    } else {
      permissions = permissions.filter(p => p !== o.permission_key)
    }
  }

  return {
    id: profile.id,
    full_name: profile.full_name,
    role_id: profile.role_id,
    role_name: (profile.roles as any)?.name ?? 'unknown',
    permissions,
  }
}

/** Call at the top of any server page to enforce a permission.
 *  Redirects to /unauthorized if the user lacks it. */
export async function requirePermission(perm: string): Promise<UserProfile> {
  const profile = await getProfile()
  if (!profile.permissions.includes(perm)) {
    redirect('/unauthorized')
  }
  return profile
}

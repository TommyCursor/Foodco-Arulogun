export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requirePermission } from '@/lib/auth/getProfile'
import UsersClient from './UsersClient'
import type { Profile, Role, Permission } from '@/types'

export default async function UsersPage() {
  const profile   = await requirePermission('manage_users')
  const supabase      = await createClient()
  const adminSupabase = createAdminClient()

  const [{ data: profiles }, { data: roles }, { data: permissions }, { data: rolePerms }, { data: authData }, { data: overrideData }] = await Promise.all([
    adminSupabase.from('profiles').select('*, role:roles(id, name, description)').order('created_at'),
    supabase.from('roles').select('*').order('id'),
    supabase.from('permissions').select('*').order('id'),
    supabase.from('role_permissions').select('role_id, permission_id'),
    adminSupabase.auth.admin.listUsers({ perPage: 1000 }),
    adminSupabase.from('user_permission_overrides').select('user_id, permission_key, granted'),
  ])

  // Merge auth email into profile objects
  const emailMap: Record<string, string> = {}
  for (const u of (authData?.users ?? [])) {
    if (u.email) emailMap[u.id] = u.email
  }
  const profilesWithEmail = (profiles ?? []).map(p => ({ ...p, email: emailMap[p.id] ?? null }))

  return (
    <UsersClient
      profiles={(profilesWithEmail as unknown as Profile[]) ?? []}
      roles={(roles as unknown as Role[]) ?? []}
      permissions={(permissions as unknown as Permission[]) ?? []}
      rolePermissions={(rolePerms as unknown as { role_id: number; permission_id: number }[]) ?? []}
      overrides={(overrideData ?? []) as { user_id: string; permission_key: string; granted: boolean }[]}
      viewerRole={profile.role_name}
    />
  )
}

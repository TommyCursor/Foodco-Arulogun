export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/getProfile'
import { createAdminClient } from '@/lib/supabase/admin'
import AuditClient from './AuditClient'

export default async function AuditPage() {
  await requirePermission('view_audit')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  const { data, count } = await admin
    .from('audit_logs')
    .select('*, actor:profiles!audit_logs_user_id_fkey(full_name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(0, 49)

  return (
    <AuditClient
      initialData={(data as any[]) ?? []}
      initialTotal={count ?? 0}
    />
  )
}

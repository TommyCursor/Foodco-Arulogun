export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/getProfile'
import SalesClient from './SalesClient'

export default async function SalesPage() {
  await requirePermission('view_sales')
  const supabase = await createClient()

  const { data: uploads } = await supabase
    .from('sales_uploads')
    .select(`
      id, file_name, period_from, period_to, row_count, notes, created_at, file_type,
      uploaded_by:profiles!sales_uploads_uploaded_by_fkey(full_name)
    `)
    .order('created_at', { ascending: false })

  return <SalesClient initialUploads={(uploads as any) ?? []} />
}

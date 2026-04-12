import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PAGE_SIZE = 50

// GET /api/audit?page=1&module=damage&action=approve&from=2025-01-01&to=2025-12-31&search=Milo
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const module = searchParams.get('module')
  const action = searchParams.get('action')
  const from   = searchParams.get('from')
  const to     = searchParams.get('to')
  const search = searchParams.get('search')

  const admin = createAdminClient()
  let query = admin
    .from('audit_logs')
    .select('*, actor:profiles!audit_logs_user_id_fkey(full_name)', { count: 'exact' })
    .order('created_at', { ascending: false })

  if (module) query = query.eq('module', module)
  if (action) query = query.eq('action', action)
  if (from)   query = query.gte('created_at', from)
  if (to)     query = query.lte('created_at', to + 'T23:59:59Z')
  if (search) query = query.ilike('entity_label', `%${search}%`)

  const from_idx = (page - 1) * PAGE_SIZE
  const to_idx   = from_idx + PAGE_SIZE - 1
  query = query.range(from_idx, to_idx)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data, total: count ?? 0 })
}

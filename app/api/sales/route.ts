import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/sales — list all saved uploads
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('sales_uploads')
    .select(`
      id, file_name, period_from, period_to, row_count, notes, created_at, file_type,
      uploaded_by:profiles!sales_uploads_uploaded_by_fkey(full_name)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

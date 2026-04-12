import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/services/audit'

// GET /api/sales/[id] — fetch all records for an upload
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data, error } = await supabase
    .from('sales_records')
    .select('id, sale_date, product_name, sku, quantity, unit_price, total_amount, category, cashier, cost, profit, margin_pct')
    .eq('upload_id', id)
    .order('sale_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/sales/[id] — delete an upload and all its records (cascades via FK)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const admin  = createAdminClient()

  const { error } = await admin.from('sales_uploads').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  logAudit({ userId: user.id, module: 'sales', action: 'delete', entityId: id, entityLabel: `Sales upload ${id}` })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/services/audit'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body   = await req.json()

  const { data, error } = await supabase
    .from('alert_logs')
    .update({ status: body.status, resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  logAudit({ userId: user.id, module: 'alerts', action: 'resolve', entityId: id, entityLabel: `Alert log ${id}` })
  return NextResponse.json(data)
}

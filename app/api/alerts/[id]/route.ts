import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/services/audit'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body   = await req.json()
  const { data, error } = await supabase.from('automated_alerts').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  logAudit({ userId: user.id, module: 'alerts', action: 'update', entityId: id, entityLabel: data.name ?? id })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { error } = await supabase.from('automated_alerts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  logAudit({ userId: user.id, module: 'alerts', action: 'delete', entityId: id, entityLabel: `Alert rule ${id}` })
  return NextResponse.json({ success: true })
}

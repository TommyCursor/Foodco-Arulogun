import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/services/audit'

export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase.from('automated_alerts').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabase.from('automated_alerts').insert({
    name:                 body.name,
    trigger_condition:    body.trigger_condition,
    channels:             body.channels,
    recipients:           body.recipients,
    frequency:            body.frequency,
    escalation_hours:     body.escalation_hours ?? null,
    ai_generated_message: body.ai_generated_message ?? true,
    is_active:            true,
    created_by:           user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  logAudit({ userId: user.id, module: 'alerts', action: 'create', entityId: data.id, entityLabel: body.name })
  return NextResponse.json(data, { status: 201 })
}

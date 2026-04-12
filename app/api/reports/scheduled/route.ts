import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logAudit } from '@/lib/services/audit'

// GET /api/reports/scheduled
export async function GET() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('scheduled_reports')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/reports/scheduled — create a schedule
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const { data, error } = await supabase
    .from('scheduled_reports')
    .insert({
      name:               body.name,
      report_type:        body.report_type,
      schedule_cron:      body.schedule_cron,
      recipients:         body.recipients,
      include_ai_summary: body.include_ai_summary ?? true,
      include_excel:      body.include_excel ?? true,
      is_active:          true,
      created_by:         user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  logAudit({ userId: user.id, module: 'reports', action: 'create', entityId: data.id, entityLabel: body.name })
  return NextResponse.json(data, { status: 201 })
}

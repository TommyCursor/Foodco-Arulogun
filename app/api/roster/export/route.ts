import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateRosterExcel } from '@/lib/services/rosterExcel'

// GET /api/roster/export?roster_id=xxx  OR  ?week_start=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin     = createAdminClient()
  const rosterId  = req.nextUrl.searchParams.get('roster_id')
  const weekStart = req.nextUrl.searchParams.get('week_start')

  let roster: any = null
  if (rosterId) {
    const { data } = await admin.from('rosters').select('id, week_start, status, notes, published_at').eq('id', rosterId).single()
    roster = data
  } else if (weekStart) {
    const { data } = await admin.from('rosters').select('id, week_start, status, notes, published_at').eq('week_start', weekStart).maybeSingle()
    roster = data
  } else {
    const { data } = await admin.from('rosters').select('id, week_start, status, notes, published_at').order('week_start', { ascending: false }).limit(1).single()
    roster = data
  }

  if (!roster) return NextResponse.json({ error: 'No roster found' }, { status: 404 })

  const { data: rawEntries } = await admin
    .from('roster_entries')
    .select(`id, section, monday, tuesday, wednesday, thursday, friday, saturday, sunday, notes, profile:profiles (id, full_name, role:roles (name))`)
    .eq('roster_id', roster.id)

  const buffer   = await generateRosterExcel(roster, rawEntries ?? [])
  const filename = `Foodco_Roster_${roster.week_start.replace(/-/g, '')}_${roster.status}.xlsx`

  return new NextResponse(buffer as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

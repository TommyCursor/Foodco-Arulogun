import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { autoGenerateRoster } from '@/lib/services/rosterService'
import { logAudit } from '@/lib/services/audit'

// Sections each role may view. Absent roles (supervisor, manager, admin) see all.
const ROLE_SECTION_MAP: Record<string, string[]> = {
  // Floor section
  grocery_associate:    ['floor'],
  grocery_team_lead:    ['floor'],
  toiletries_associate: ['floor'],
  toiletries_team_lead: ['floor'],
  '3f_associate':       ['floor'],
  '3f_team_lead':       ['floor'],
  // Cashier section
  cashier:              ['cashier'],
  cashier_team_lead:    ['cashier'],
  // Sanitation section
  sanitation_officer:   ['sanitation'],
  // cashier_supervisor, supervisor, manager, admin → null (all sections)
}

// GET /api/roster?week_start=YYYY-MM-DD
// Returns: { roster, entries, allRosters }
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Resolve caller's role for section filtering
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role:roles(name)')
    .eq('id', user.id)
    .single()
  const callerRole = (callerProfile?.role as any)?.name ?? ''
  const allowedSections: string[] | null = ROLE_SECTION_MAP[callerRole] ?? null // null = all sections

  const weekStart = req.nextUrl.searchParams.get('week_start')

  // Navigation list (most recent 12 rosters)
  const { data: allRosters } = await admin
    .from('rosters')
    .select('id, week_start, status')
    .order('week_start', { ascending: false })
    .limit(12)

  // Find the requested or most-recent roster
  let roster: any = null
  if (weekStart) {
    const { data } = await admin
      .from('rosters')
      .select('id, week_start, status, notes, published_at, created_at')
      .eq('week_start', weekStart)
      .maybeSingle()
    roster = data
  } else {
    const latest = allRosters?.[0]
    if (latest) {
      const { data } = await admin
        .from('rosters')
        .select('id, week_start, status, notes, published_at, created_at')
        .eq('id', latest.id)
        .single()
      roster = data
    }
  }

  // Fetch entries for this roster (filtered by allowed sections)
  let entries: any[] = []
  if (roster) {
    let query = admin
      .from('roster_entries')
      .select(`
        id, section,
        monday, tuesday, wednesday, thursday, friday, saturday, sunday,
        notes,
        profile:profiles (id, full_name, role:roles (name))
      `)
      .eq('roster_id', roster.id)

    if (allowedSections !== null) {
      query = query.in('section', allowedSections)
    }

    const { data } = await query
    entries = data ?? []
  }

  return NextResponse.json({ roster, entries, allRosters: allRosters ?? [] })
}

// POST /api/roster  — manually generate next week's roster
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await autoGenerateRoster(user.id)
  if (result.created) {
    logAudit({ userId: user.id, module: 'roster', action: 'generate', entityId: result.rosterId ?? undefined, entityLabel: `Roster week ${result.weekStart}` })
  }
  return NextResponse.json(result, { status: result.created ? 201 : 200 })
}

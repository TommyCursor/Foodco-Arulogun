import { createAdminClient } from '@/lib/supabase/admin'

// ── Section → Role mapping ────────────────────────────────────────────────────
const SECTION_ROLES: Record<string, string[]> = {
  floor: [
    'grocery_associate', 'toiletries_associate',
    'grocery_team_lead', 'toiletries_team_lead',
    '3f_associate', '3f_team_lead',
  ],
  sanitation: ['sanitation_officer'],
  cashier:    ['cashier', 'cashier_team_lead', 'cashier_supervisor'],
  supervisor: ['supervisor'],
}

const ALL_ROSTER_ROLES = Object.values(SECTION_ROLES).flat()
const WEEKDAYS    = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as const
const WORKING_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function nextMonday(): string {
  const d = new Date()
  const diff = ((8 - d.getDay()) % 7) || 7
  d.setDate(d.getDate() + diff)
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString().split('T')[0]
}

function shiftWeek(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d.toISOString().split('T')[0]
}

function roleSection(role: string): string {
  for (const [sec, roles] of Object.entries(SECTION_ROLES)) {
    if (roles.includes(role)) return sec
  }
  return 'floor'
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

// ── Auto-generate ─────────────────────────────────────────────────────────────
//
// Rules:
//  SHIFTS  — auto-assign AM and PM only (mid = manual).
//            PM = ceil(n/2), AM = floor(n/2) per role per day among working staff.
//            Sanitation always gets 'full' on duty days.
//            Sunday: only 'full' or 'off' for everyone.
//
//  OFF DAY — one per staff per week, Mon–Fri preferred, Sat last resort.
//            No two staff in the same section share the same off day.
//            Rotates +1 day each week from the previous roster.
//
//  SUNDAY  — alternates on/off each week (off → full, full → off).
//            First-ever roster: even-index = full, odd-index = off.
//
//  Idempotent — regenerating an existing week with entries returns early.
//               An empty (failed) roster is deleted and regenerated.

export async function autoGenerateRoster(createdBy?: string | null): Promise<{
  created: boolean
  rosterId: string | null
  weekStart: string
}> {
  const admin = createAdminClient()
  const weekStart = nextMonday()

  // Idempotency: skip if roster already has entries; delete + retry if empty
  const { data: existing } = await admin
    .from('rosters').select('id').eq('week_start', weekStart).maybeSingle()

  if (existing) {
    const { count } = await admin
      .from('roster_entries')
      .select('id', { count: 'exact', head: true })
      .eq('roster_id', existing.id)
    if (count && count > 0) return { created: false, rosterId: existing.id, weekStart }
    await admin.from('rosters').delete().eq('id', existing.id)
  }

  // Create roster header
  const { data: roster, error: rErr } = await admin
    .from('rosters')
    .insert({ week_start: weekStart, status: 'draft', created_by: createdBy ?? null })
    .select('id').single()

  if (rErr || !roster) return { created: false, rosterId: null, weekStart }

  // Load approved leave requests for this week → override those days to 'off'
  const weekEndDate = new Date(weekStart + 'T00:00:00Z')
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6)
  const weekEnd = weekEndDate.toISOString().split('T')[0]

  const { data: approvedLeaves } = await admin
    .from('leave_requests')
    .select('user_id, requested_date')
    .eq('status', 'approved')
    .gte('requested_date', weekStart)
    .lte('requested_date', weekEnd)

  const WEEK_DAY_COLS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const leaveMap = new Map<string, Set<string>>()
  for (const lr of approvedLeaves ?? []) {
    const dayIndex = Math.round(
      (new Date(lr.requested_date + 'T00:00:00Z').getTime() -
       new Date(weekStart + 'T00:00:00Z').getTime()) / 86400000,
    )
    if (dayIndex >= 0 && dayIndex <= 6) {
      if (!leaveMap.has(lr.user_id)) leaveMap.set(lr.user_id, new Set())
      leaveMap.get(lr.user_id)!.add(WEEK_DAY_COLS[dayIndex])
    }
  }

  // Load previous week entries for rotation reference
  const prevWeekStart = shiftWeek(weekStart, -1)
  const { data: prevRoster } = await admin
    .from('rosters').select('id').eq('week_start', prevWeekStart).maybeSingle()

  const prevMap = new Map<string, Record<string, string>>()
  if (prevRoster) {
    const { data: pe } = await admin
      .from('roster_entries')
      .select('profile_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday')
      .eq('roster_id', prevRoster.id)
    for (const e of pe ?? []) prevMap.set(e.profile_id, e)
  }

  // Fetch roles then group active profiles by section → role
  const { data: roleRows } = await admin
    .from('roles').select('id, name').in('name', ALL_ROSTER_ROLES)

  if (!roleRows?.length) return { created: true, rosterId: roster.id, weekStart }

  const bySection = new Map<string, Map<string, string[]>>()
  for (const role of roleRows) {
    const { data: profiles } = await admin
      .from('profiles').select('id, is_active').eq('role_id', role.id)
    const ids = (profiles ?? []).filter(p => p.is_active !== false).map(p => p.id)
    if (!ids.length) continue
    const sec = roleSection(role.name)
    if (!bySection.has(sec)) bySection.set(sec, new Map())
    bySection.get(sec)!.set(role.name, ids)
  }

  // Build entries for every section
  const entries: Record<string, string>[] = []

  for (const [section, roleMap] of bySection) {
    // Flatten staff in deterministic order (sorted UUID within each role)
    const staff: Array<{ id: string; role: string }> = []
    for (const [roleName, ids] of roleMap) {
      for (const id of [...new Set(ids)].sort()) staff.push({ id, role: roleName })
    }

    // Off-day assignment — no two staff in same section share the same day
    const takenMF = new Set<number>()
    function claimOff(want: number): string {
      for (let a = 0; a < 5; a++) {
        const idx = (want + a) % 5
        if (!takenMF.has(idx)) { takenMF.add(idx); return WEEKDAYS[idx] }
      }
      return 'saturday'
    }

    // Pass 1: off day + sunday per person
    const meta = staff.map(({ id, role }, i) => {
      const prev = prevMap.get(id)

      const sunday = prev
        ? (prev.sunday === 'off' ? 'full' : 'off')
        : (i % 2 === 0 ? 'full' : 'off')

      let wantIdx: number
      if (prev) {
        const prevOff = WEEKDAYS.findIndex(d => prev[d] === 'off')
        wantIdx = prevOff >= 0 ? (prevOff + 1) % 5 : i % 5
      } else {
        wantIdx = i % 5
      }

      return { id, role, offDay: claimOff(wantIdx), sunday }
    })

    // Pass 2: AM/PM (or full for sanitation) per working day
    const shifts = new Map<string, Record<string, string>>()
    for (const { id, sunday } of meta) shifts.set(id, { sunday })

    for (const day of WORKING_DAYS) {
      for (const roleName of roleMap.keys()) {
        const roleStaff = meta.filter(m => m.role === roleName)
        const working   = roleStaff.filter(m => m.offDay !== day).map(m => m.id)
        const dayOff    = roleStaff.filter(m => m.offDay === day).map(m => m.id)

        const sorted = [...working].sort(
          (a, b) => hash(a + day + weekStart) - hash(b + day + weekStart),
        )

        if (section === 'sanitation') {
          sorted.forEach(id => { shifts.get(id)![day] = 'full' })
        } else {
          const pmCount = Math.ceil(sorted.length / 2)
          sorted.forEach((id, idx) => {
            shifts.get(id)![day] = idx < pmCount ? 'pm' : 'am'
          })
        }
        dayOff.forEach(id => { shifts.get(id)![day] = 'off' })
      }
    }

    // Pass 3: assemble rows
    for (const { id } of meta) {
      const s = shifts.get(id)!
      const staffLeave = leaveMap.get(id)
      entries.push({
        roster_id:  roster.id,
        profile_id: id,
        section,
        monday:    staffLeave?.has('monday')    ? 'off' : (s.monday    ?? 'off'),
        tuesday:   staffLeave?.has('tuesday')   ? 'off' : (s.tuesday   ?? 'off'),
        wednesday: staffLeave?.has('wednesday') ? 'off' : (s.wednesday ?? 'off'),
        thursday:  staffLeave?.has('thursday')  ? 'off' : (s.thursday  ?? 'off'),
        friday:    staffLeave?.has('friday')    ? 'off' : (s.friday    ?? 'off'),
        saturday:  staffLeave?.has('saturday')  ? 'off' : (s.saturday  ?? 'off'),
        sunday:    staffLeave?.has('sunday')    ? 'off' : (s.sunday    ?? 'off'),
      })
    }
  }

  // Insert per-section (isolates failures, one section can't block another)
  for (const sec of [...new Set(entries.map(e => e.section))]) {
    const { error } = await admin.from('roster_entries').insert(
      entries.filter(e => e.section === sec),
    )
    if (error) console.error(`[roster] insert failed for section "${sec}":`, error.message)
  }

  return { created: true, rosterId: roster.id, weekStart }
}

// ── Publish ───────────────────────────────────────────────────────────────────
export async function publishRoster(rosterId: string, publishedBy?: string | null): Promise<boolean> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('rosters')
    .update({
      status:       'published',
      published_by: publishedBy ?? null,
      published_at: new Date().toISOString(),
    })
    .eq('id', rosterId)
    .eq('status', 'draft')
  return !error
}

// ── Publish upcoming (Friday cron) ────────────────────────────────────────────
export async function publishUpcomingRoster(): Promise<{
  published: boolean
  weekStart: string
  rosterId: string | null
}> {
  const admin = createAdminClient()
  const weekStart = nextMonday()

  const { data: roster } = await admin
    .from('rosters').select('id')
    .eq('week_start', weekStart).eq('status', 'draft').maybeSingle()

  if (!roster) return { published: false, weekStart, rosterId: null }

  const success = await publishRoster(roster.id)
  return { published: success, weekStart, rosterId: success ? roster.id : null }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const VALID_SHIFTS = ['am', 'mid', 'pm', 'full', 'off']
const VALID_DAYS   = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

// PATCH /api/roster/entries/[id]  — update one or more day shifts on an entry
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  const update: Record<string, string> = {}
  for (const day of VALID_DAYS) {
    if (body[day] !== undefined && VALID_SHIFTS.includes(body[day])) {
      update[day] = body[day]
    }
  }
  if (typeof body.notes === 'string') {
    update.notes = body.notes
  }

  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('roster_entries')
    .update(update)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

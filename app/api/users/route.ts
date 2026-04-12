import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/services/audit'

// GET /api/users
export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin.from('profiles').select('*, role:roles(*)').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/users — invite a new user via Supabase Auth
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const body  = await req.json()

  // Send Supabase invite email — pass role_id in metadata so the
  // handle_new_user trigger can read it directly (no race condition)
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(body.email, {
    data: { full_name: body.full_name, role_id: body.role_id },
  })

  if (inviteErr) return NextResponse.json({ error: inviteErr.message }, { status: 500 })

  // Also upsert the profile as a guaranteed fallback in case the trigger
  // fires before our metadata is applied (retry up to 3x)
  let upsertError = null
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 400))
    const { error } = await admin.from('profiles').upsert(
      { id: invited.user.id, full_name: body.full_name, role_id: body.role_id, is_active: true },
      { onConflict: 'id' }
    )
    if (!error) { upsertError = null; break }
    upsertError = error
  }

  if (upsertError) {
    console.error('Profile upsert failed after retries:', upsertError.message)
  }

  logAudit({
    userId:      user.id,
    module:      'users',
    action:      'invite',
    entityId:    invited.user.id,
    entityLabel: body.email,
    details:     { full_name: body.full_name, role_id: body.role_id },
  })

  return NextResponse.json({ success: true, userId: invited.user.id }, { status: 201 })
}

import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/services/audit'
import { appendLogisticsRow } from '@/lib/services/googleSheets'

// GET /api/logistics — list recent movements (last 50)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('logistics_movements')
    .select(`
      id, created_at, movement_date,
      skus_loaded, truck_arrival, offloading_start, offloading_end,
      truck_departure, staff_count, skus_received,
      discrepancy_units, discrepancy_type, escalate, outlet_leader,
      logger:profiles!logged_by (full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/logistics — log a new movement + append to Google Sheet
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const {
    movement_date, skus_loaded, truck_arrival, offloading_start,
    offloading_end, truck_departure, staff_count, skus_received,
    discrepancy_units, discrepancy_type, escalate, outlet_leader,
  } = body

  if (skus_loaded == null || !outlet_leader) {
    return NextResponse.json({ error: 'SKUs Loaded and Outlet Leader are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: record, error } = await admin
    .from('logistics_movements')
    .insert({
      logged_by:        user.id,
      movement_date:    movement_date ?? new Date().toISOString().split('T')[0],
      skus_loaded:      Number(skus_loaded),
      truck_arrival:    truck_arrival    ?? null,
      offloading_start: offloading_start ?? null,
      offloading_end:   offloading_end   ?? null,
      truck_departure:  truck_departure  ?? null,
      staff_count:      staff_count    != null ? Number(staff_count)    : null,
      skus_received:    skus_received  != null ? Number(skus_received)  : null,
      discrepancy_units: discrepancy_units != null ? Number(discrepancy_units) : 0,
      discrepancy_type: discrepancy_type ?? 'None',
      escalate:         Boolean(escalate),
      outlet_leader:    outlet_leader,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire-and-forget after response is sent — calls Apps Script web app
  after(async () => {
    try {
      await appendLogisticsRow({
        skusLoaded:       Number(skus_loaded),
        truckArrival:     truck_arrival    ?? '',
        offloadingStart:  offloading_start ?? '',
        offloadingEnd:    offloading_end   ?? '',
        truckDeparture:   truck_departure  ?? '',
        staffCount:       staff_count    != null ? Number(staff_count)    : 0,
        skusReceived:     skus_received  != null ? Number(skus_received)  : 0,
        discrepancyUnits: discrepancy_units != null ? Number(discrepancy_units) : 0,
        discrepancyType:  discrepancy_type ?? 'None',
        escalate:         escalate ? 'YES' : 'NO',
        outletLeader:     outlet_leader,
      })
    } catch (err: any) {
      console.error('[GoogleSheets] Logistics append failed:', err?.message ?? err)
    }

    logAudit({
      userId: user.id, module: 'logistics', action: 'create',
      entityLabel: `Logistics movement logged — ${skus_loaded} SKUs loaded`,
      details: { movement_date, skus_loaded, outlet_leader },
    })
  })

  return NextResponse.json({ success: true, record })
}

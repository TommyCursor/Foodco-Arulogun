import { NextResponse } from 'next/server'
import { appendLogisticsRow } from '@/lib/services/googleSheets'

// GET /api/logistics/test-sheet — debug: test write to logistics Google Sheet
export async function GET() {
  try {
    await appendLogisticsRow({
      skusLoaded:       1,
      truckArrival:     '08:00',
      offloadingStart:  '08:30',
      offloadingEnd:    '09:00',
      truckDeparture:   '09:15',
      staffCount:       3,
      skusReceived:     1,
      discrepancyUnits: 0,
      discrepancyType:  'None',
      escalate:         'NO',
      outletLeader:     'TEST ROW - DELETE',
    })
    return NextResponse.json({ success: true, message: 'Row written to OUTLET LOG tab columns G–Q' })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error:   err?.message ?? String(err),
      code:    err?.code,
      status:  err?.status,
    }, { status: 500 })
  }
}

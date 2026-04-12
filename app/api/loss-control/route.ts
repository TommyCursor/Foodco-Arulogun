import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateLossControlReport } from '@/lib/services/excel'
import { sendEmail } from '@/lib/services/email'
import { logAudit } from '@/lib/services/audit'
import { appendLossControlRows, type LossControlSheetRow } from '@/lib/services/googleSheets'

// GET /api/loss-control — fetch all pending (reported but not yet sent) items
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('inventory_items')
    .select(`
      id, batch_number, quantity, selling_price, expiry_date, location, pipeline_stage,
      product:products (id, name, sku, unit)
    `)
    .in('pipeline_stage', ['damage_reported', 'discount_reported', 'expiry_reported'])
    .order('pipeline_stage')
    .order('expiry_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

const LC_ALLOWED_ROLES = [
  'grocery_team_lead', 'toiletries_team_lead', 'cashier_team_lead', '3f_team_lead',
  'supervisor', 'manager', 'admin',
]

// POST /api/loss-control — generate Excel, email Loss Control, update stages
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Role check — only team leads and above may send to loss control
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role:roles(name)')
    .eq('id', user.id)
    .single()
  const userRole = (profile?.role as any)?.name ?? ''
  if (!LC_ALLOWED_ROLES.includes(userRole)) {
    return NextResponse.json(
      { error: 'Only Team Leads, Supervisors, and Managers can send items to Loss Control.' },
      { status: 403 },
    )
  }

  const body = await req.json()
  // body.item_ids: string[] — IDs of items to send
  // body.recipient_email: string — Loss Control email

  // Fetch full item details for the report (include reason sources)
  const { data: items, error: fetchErr } = await admin
    .from('inventory_items')
    .select(`
      id, batch_number, quantity, selling_price, expiry_date, location, pipeline_stage,
      product:products (id, name, sku, unit),
      damage_records (reason),
      discounts (name, discount_type)
    `)
    .in('id', body.item_ids)

  if (fetchErr || !items?.length) {
    return NextResponse.json({ error: 'No items found' }, { status: 400 })
  }

  // Generate Excel report
  let excelBuffer: Buffer
  try {
    excelBuffer = await generateLossControlReport(items)
  } catch (excelErr: any) {
    return NextResponse.json({ error: `Failed to generate Excel report: ${excelErr.message}` }, { status: 500 })
  }

  // Determine report type from items
  const stageLabel: Record<string, string> = {
    damage_reported:   'Damage',
    discount_reported: 'Discount',
    expiry_reported:   'About to Expire',
  }
  const stageSubject: Record<string, string> = {
    damage_reported:   'DAMAGE REPORT',
    discount_reported: 'DISCOUNT REPORT',
    expiry_reported:   'ABOUT TO EXPIRE REPORT',
  }

  const stages      = [...new Set(items.map((i: any) => i.pipeline_stage))]
  const reportLabel   = stages.length === 1 ? (stageLabel[stages[0]]   ?? 'Loss Control') : 'Loss Control'
  const emailSubject  = stages.length === 1 ? (stageSubject[stages[0]] ?? 'LOSS CONTROL REPORT') : 'LOSS CONTROL REPORT'

  const recipientEmail = body.recipient_email
  const ccEmails: string[] = (body.cc_emails ?? []).filter((e: string) => e.trim())

  const plainText = `Dear Loss Control,

Kindly find the attached file (${reportLabel}).

Regards,
Foodco Arulogun`

  // Build sheet rows — damage items only
  const dateLogged = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const damageItems = items.filter((item: any) => item.pipeline_stage === 'damage_reported')
  const sheetRows: LossControlSheetRow[] = damageItems.map((item: any) => {
    const name     = item.product?.name ?? 'Unknown'
    const sku      = item.product?.sku  ?? ''
    const qty      = item.quantity ?? 0
    const price    = Number(item.selling_price ?? 0)
    const amount   = qty * price
    const reason   =
      item.pipeline_stage === 'damage_reported'   ? (item.damage_records?.[0]?.reason ?? 'Damage')
      : item.pipeline_stage === 'discount_reported' ? (item.discounts?.[0]?.name ?? 'Discount')
      : 'About to Expire'
    return { description: name, barcode: sku, quantity: qty, price, amount, reason, dateLogged }
  })

  // Send email — this is the critical path
  try {
    await sendEmail({
      to:      [recipientEmail],
      cc:      ccEmails.length ? ccEmails : undefined,
      subject: emailSubject,
      text:    plainText,
      attachments: [{
        filename:    `loss-control-report-${new Date().toISOString().split('T')[0]}.xlsx`,
        content:     excelBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }],
    })
  } catch (emailErr: any) {
    return NextResponse.json(
      { error: `Email failed: ${emailErr.message}. Check your email configuration in Settings.` },
      { status: 500 }
    )
  }

  // Append to Google Sheet — runs after email, never blocks pipeline update
  let sheetLogged = true
  if (sheetRows.length) {
    try {
      await appendLossControlRows(sheetRows)
    } catch (err: any) {
      sheetLogged = false
      console.error('[GoogleSheets] Failed to append loss control rows:', err?.message ?? err)
    }
  }

  // Update all sent items' pipeline_stage to sent_to_loss_control
  await admin
    .from('inventory_items')
    .update({ pipeline_stage: 'sent_to_loss_control' })
    .in('id', body.item_ids)

  // Log submission for history/reverse/resend
  const snapshot = items.map((item: any) => ({
    id:             item.id,
    name:           item.product?.name ?? 'Unknown',
    sku:            item.product?.sku  ?? '',
    qty:            item.quantity ?? 0,
    price:          Number(item.selling_price ?? 0),
    original_stage: item.pipeline_stage,
    reason:
      item.pipeline_stage === 'damage_reported'   ? (item.damage_records?.[0]?.reason ?? 'Damaged')
      : item.pipeline_stage === 'discount_reported' ? (item.discounts?.[0]?.name ?? item.discounts?.[0]?.discount_type ?? 'Discounted')
      : 'About to Expire',
    expiry_date: item.expiry_date ?? null,
  }))
  const totalValue = snapshot.reduce((s: number, i: any) => s + i.qty * i.price, 0)
  await admin.from('loss_control_submissions').insert({
    sent_by:         user.id,
    recipient_email: recipientEmail,
    cc_emails:       ccEmails,
    item_count:      items.length,
    total_value:     totalValue,
    items_snapshot:  snapshot,
  })

  logAudit({
    userId: user.id, module: 'loss_control', action: 'stage_change',
    entityLabel: `Sent ${items.length} item(s) to Loss Control`,
    details: { item_ids: body.item_ids, recipient: body.recipient_email },
  })
  return NextResponse.json({ success: true, sent: items.length, sheet_logged: sheetLogged })
}

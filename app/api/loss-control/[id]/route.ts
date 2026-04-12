import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateLossControlReport } from '@/lib/services/excel'
import { sendEmail } from '@/lib/services/email'
import { appendLossControlRows, type LossControlSheetRow } from '@/lib/services/googleSheets'
import { logAudit } from '@/lib/services/audit'

const LC_ALLOWED_ROLES = [
  'grocery_team_lead', 'toiletries_team_lead', 'cashier_team_lead', '3f_team_lead',
  'supervisor', 'manager', 'admin',
]

// POST /api/loss-control/[id]?action=reverse|resend
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Role check
  const { data: profile } = await admin
    .from('profiles')
    .select('role:roles(name)')
    .eq('id', user.id)
    .single()
  const userRole = (profile?.role as any)?.name ?? ''
  if (!LC_ALLOWED_ROLES.includes(userRole)) {
    return NextResponse.json(
      { error: 'Only Team Leads, Supervisors, and Managers can perform this action.' },
      { status: 403 },
    )
  }

  // Fetch the submission
  const { data: submission, error: fetchErr } = await admin
    .from('loss_control_submissions')
    .select('*')
    .eq('id', params.id)
    .single()

  if (fetchErr || !submission) {
    return NextResponse.json({ error: 'Submission not found' }, { status: 404 })
  }

  const { action } = await req.json() as { action: 'reverse' | 'resend' }
  const snapshot: Array<{
    id: string; name: string; sku: string; qty: number; price: number
    original_stage: string; reason: string; expiry_date: string | null
  }> = submission.items_snapshot

  // ── REVERSE ──────────────────────────────────────────────────
  if (action === 'reverse') {
    // Group items by original stage for batch updates
    const byStage = new Map<string, string[]>()
    for (const item of snapshot) {
      const stage = item.original_stage
      if (!byStage.has(stage)) byStage.set(stage, [])
      byStage.get(stage)!.push(item.id)
    }

    for (const [stage, ids] of byStage) {
      await admin
        .from('inventory_items')
        .update({ pipeline_stage: stage })
        .in('id', ids)
    }

    logAudit({
      userId: user.id, module: 'loss_control', action: 'stage_change',
      entityLabel: `Reversed submission ${params.id} — ${snapshot.length} item(s) returned to queue`,
      details: { submission_id: params.id },
    })

    return NextResponse.json({ success: true, reversed: snapshot.length })
  }

  // ── RESEND ───────────────────────────────────────────────────
  if (action === 'resend') {
    const body = await req.json().catch(() => ({})) as { recipient_email?: string; cc_emails?: string[] }

    // Fetch fresh item data for the Excel (items may have been updated)
    const itemIds = snapshot.map(s => s.id)
    const { data: items } = await admin
      .from('inventory_items')
      .select(`
        id, batch_number, quantity, selling_price, expiry_date, location, pipeline_stage,
        product:products (id, name, sku, unit),
        damage_records (reason),
        discounts (name, discount_type)
      `)
      .in('id', itemIds)

    if (!items?.length) {
      return NextResponse.json({ error: 'No items found for this submission' }, { status: 400 })
    }

    let excelBuffer: Buffer
    try {
      excelBuffer = await generateLossControlReport(items)
    } catch (excelErr: any) {
      return NextResponse.json({ error: `Failed to generate report: ${excelErr.message}` }, { status: 500 })
    }

    const recipientEmail = body.recipient_email ?? submission.recipient_email
    const ccEmails: string[] = body.cc_emails ?? submission.cc_emails ?? []

    const stages       = [...new Set(items.map((i: any) => i.pipeline_stage))]
    const stageSubject: Record<string, string> = {
      damage_reported:       'DAMAGE REPORT',
      discount_reported:     'DISCOUNT REPORT',
      expiry_reported:       'ABOUT TO EXPIRE REPORT',
      sent_to_loss_control:  'LOSS CONTROL REPORT (RESENT)',
    }
    const emailSubject = stages.length === 1 ? (stageSubject[stages[0]] ?? 'LOSS CONTROL REPORT (RESENT)') : 'LOSS CONTROL REPORT (RESENT)'

    try {
      await sendEmail({
        to:      [recipientEmail],
        cc:      ccEmails.length ? ccEmails : undefined,
        subject: emailSubject,
        text:    `Dear Loss Control,\n\nKindly find the re-attached loss control report.\n\nRegards,\nFoodco Arulogun`,
        attachments: [{
          filename:    `loss-control-report-resent-${new Date().toISOString().split('T')[0]}.xlsx`,
          content:     excelBuffer,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }],
      })
    } catch (emailErr: any) {
      return NextResponse.json(
        { error: `Email failed: ${emailErr.message}` },
        { status: 500 }
      )
    }

    // Sheet logging (damage items only)
    const dateLogged = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const damageItems = items.filter((i: any) => i.pipeline_stage === 'damage_reported')
    if (damageItems.length) {
      const sheetRows: LossControlSheetRow[] = damageItems.map((item: any) => ({
        description: item.product?.name ?? 'Unknown',
        barcode:     item.product?.sku ?? '',
        quantity:    item.quantity ?? 0,
        price:       Number(item.selling_price ?? 0),
        amount:      (item.quantity ?? 0) * Number(item.selling_price ?? 0),
        reason:      item.damage_records?.[0]?.reason ?? 'Damage',
        dateLogged,
      }))
      try { await appendLossControlRows(sheetRows) } catch {}
    }

    logAudit({
      userId: user.id, module: 'loss_control', action: 'stage_change',
      entityLabel: `Resent submission ${params.id} to ${recipientEmail}`,
      details: { submission_id: params.id, recipient: recipientEmail },
    })

    return NextResponse.json({ success: true, resent: items.length })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

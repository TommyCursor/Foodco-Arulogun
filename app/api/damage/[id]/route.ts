import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildDamageAlertEmail } from '@/lib/services/email'
import { logAudit } from '@/lib/services/audit'
import { notifyUser } from '@/lib/services/notificationService'

const LOCKED_STAGES = ['sent_to_loss_control', 'resolution_received', 'sales_approved', 'sold']

async function getDamageRecipients(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'damage_alert_recipients')
    .single()
  return data?.value?.emails ?? []
}

// PATCH /api/damage/[id] — approve or reject a damage record (Supervisor / Manager / Admin only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Role guard: only supervisor, manager, admin can approve/reject
  const { data: profile } = await supabase
    .from('profiles')
    .select('role:roles(name)')
    .eq('id', user.id)
    .single()
  const roleName = (profile?.role as any)?.name ?? ''
  if (!['supervisor', 'manager', 'admin'].includes(roleName)) {
    return NextResponse.json({ error: 'Only supervisors and managers can approve damage records' }, { status: 403 })
  }

  const { id } = await params
  const { status } = await req.json()

  if (!['approved', 'rejected'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status. Use approved or rejected.' }, { status: 400 })
  }

  // Fetch the record with full item + reporter details for email
  const { data: record, error: fetchErr } = await supabase
    .from('damage_records')
    .select(`
      *,
      inventory_item:inventory_items(quantity, batch_number, product:products(name, sku)),
      reporter:profiles!damage_records_reported_by_fkey(full_name)
    `)
    .eq('id', id)
    .single()

  if (fetchErr || !record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  if (record.status !== 'pending') {
    return NextResponse.json({ error: 'Only pending records can be approved or rejected' }, { status: 400 })
  }

  // Fetch approver name
  const { data: approverProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  // Update the damage record
  const { data, error } = await supabase
    .from('damage_records')
    .update({
      status,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const itemName     = (record.inventory_item as any)?.product?.name ?? 'Unknown'
  const isApproved   = status === 'approved'
  const approverName = approverProfile?.full_name ?? 'Management'

  logAudit({
    userId:      user.id,
    module:      'damage',
    action:      status === 'approved' ? 'approve' : 'reject',
    entityId:    id,
    entityLabel: `${itemName}`,
    details:     { status, quantity_damaged: record.quantity_damaged },
  })

  // If approved: deduct quantity from inventory batch
  if (status === 'approved') {
    const newQty    = Math.max(0, Number(record.inventory_item.quantity) - Number(record.quantity_damaged))
    const newStatus = newQty <= 0 ? 'damaged' : undefined

    const updatePayload: Record<string, unknown> = {
      quantity:         newQty,
      quantity_damaged: record.quantity_damaged,
    }
    if (newStatus) updatePayload.status = newStatus

    await supabase
      .from('inventory_items')
      .update(updatePayload)
      .eq('id', record.inventory_item_id)
  }

  // Notify the reporter immediately (in-app + email)
  notifyUser(record.reported_by, {
    title:        isApproved
      ? `Damage Report Approved — ${itemName}`
      : `Damage Report Rejected — ${itemName}`,
    message:      isApproved
      ? `Your damage report for "${itemName}" (qty: ${record.quantity_damaged}) has been approved by ${approverName}. The stock has been deducted from inventory.`
      : `Your damage report for "${itemName}" (qty: ${record.quantity_damaged}) was rejected by ${approverName}. No stock deduction has been made.`,
    type:         isApproved ? 'damage_approved' : 'damage_rejected',
    entity_id:    id,
    entity_label: itemName,
    action_url:   '/damage',
  }).catch(() => {})

  // Fire-and-forget: send approval/rejection notification to configured recipients
  getDamageRecipients().then(recipients => {
    if (!recipients.length) return
    const { subject, html } = buildDamageAlertEmail({
      action:          status as 'approved' | 'rejected',
      itemName:        (record.inventory_item as any)?.product?.name ?? 'Unknown',
      batchNumber:     (record.inventory_item as any)?.batch_number,
      quantityDamaged: record.quantity_damaged,
      estimatedValue:  record.estimated_value_lost,
      loggedBy:        (record.reporter as any)?.full_name ?? 'Unknown',
      approvedBy:      approverName,
      dateTime:        new Date().toISOString(),
    })
    sendEmail({ to: recipients, subject, html }).catch(() => {})
  })

  return NextResponse.json(data)
}

// DELETE /api/damage/[id] — retract a damage report (reporter, supervisor, manager, or admin only)
// Blocked once the linked inventory item reaches sent_to_loss_control or beyond
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: record } = await supabase
    .from('damage_records')
    .select('id, reported_by, inventory_item_id, inventory_item:inventory_items(pipeline_stage)')
    .eq('id', id)
    .single()

  if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 })

  // Only reporter OR supervisor/manager/admin can delete
  if (record.reported_by !== user.id) {
    const { data: profile } = await supabase
      .from('profiles').select('role:roles(name)').eq('id', user.id).single()
    const roleName = (profile?.role as any)?.name ?? ''
    if (!['supervisor', 'manager', 'admin'].includes(roleName)) {
      return NextResponse.json({ error: 'You can only delete your own submissions' }, { status: 403 })
    }
  }

  // Block if already sent to loss control or beyond
  const stage = (record.inventory_item as any)?.pipeline_stage
  if (LOCKED_STAGES.includes(stage)) {
    return NextResponse.json({ error: 'Cannot delete — this item has already been sent to Loss Control' }, { status: 400 })
  }

  const inventoryItemId = record.inventory_item_id

  // Use admin client to bypass RLS — auth checks were already done above
  const admin = createAdminClient()

  // Delete the damage record first (inventory_items FK is RESTRICT)
  const { error: deleteErr } = await admin.from('damage_records').delete().eq('id', id)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  // Clean up the inventory_item if nothing else references it
  if (inventoryItemId) {
    const [{ count: dmgCount }, { count: discCount }] = await Promise.all([
      admin.from('damage_records').select('id', { count: 'exact', head: true }).eq('inventory_item_id', inventoryItemId),
      admin.from('discounts').select('id', { count: 'exact', head: true }).eq('inventory_item_id', inventoryItemId),
    ])
    if ((dmgCount ?? 0) === 0 && (discCount ?? 0) === 0) {
      await admin.from('inventory_items').delete().eq('id', inventoryItemId)
    }
  }

  logAudit({ userId: user.id, module: 'damage', action: 'delete', entityId: id, entityLabel: `Damage record ${id}` })

  return NextResponse.json({ success: true })
}

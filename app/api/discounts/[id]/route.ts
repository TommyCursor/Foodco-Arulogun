import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildDiscountAlertEmail } from '@/lib/services/email'
import { logAudit } from '@/lib/services/audit'
import { notifyUser, notifyRoleUsers } from '@/lib/services/notificationService'

const LOCKED_STAGES = ['sent_to_loss_control', 'resolution_received', 'sales_approved', 'sold']

async function getDiscountRecipients(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'discount_alert_recipients')
    .single()
  return data?.value?.emails ?? []
}

// PATCH /api/discounts/[id]
// cancel → manager/admin only | approve → supervisor/manager/admin | recovery stats → all
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body   = await req.json()

  // Fetch user role + name
  const { data: profile } = await supabase
    .from('profiles')
    .select('role:roles(name), full_name')
    .eq('id', user.id)
    .single()
  const roleName     = (profile?.role as any)?.name ?? ''
  const approverName = (profile as any)?.full_name ?? 'Unknown'

  // Fetch existing discount with item details
  const { data: existing } = await supabase
    .from('discounts')
    .select('*, inventory_item:inventory_items(id, original_price, status, quantity, product:products(name, sku))')
    .eq('id', id)
    .single()

  if (!existing) return NextResponse.json({ error: 'Discount not found' }, { status: 404 })

  // ── Cancel (manager / admin only) ──
  if (body.status === 'cancelled') {
    if (!['manager', 'admin'].includes(roleName)) {
      return NextResponse.json({ error: 'Only managers and admins can cancel discounts' }, { status: 403 })
    }
    if (existing.status !== 'active') {
      return NextResponse.json({ error: 'Only active discounts can be cancelled' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('discounts')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase
      .from('inventory_items')
      .update({ selling_price: existing.inventory_item.original_price, status: 'active' })
      .eq('id', existing.inventory_item_id)

    logAudit({
      userId:      user.id,
      module:      'discounts',
      action:      'cancel',
      entityId:    id,
      entityLabel: `${existing.discount_percentage}% off — ${(existing.inventory_item as any)?.product?.name ?? 'Unknown'}`,
    })

    return NextResponse.json(data)
  }

  // ── Approve (supervisor / manager / admin only) ──
  if (body.status === 'approved') {
    if (!['supervisor', 'manager', 'admin'].includes(roleName)) {
      return NextResponse.json({ error: 'Only supervisors and managers can approve discounts' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('discounts')
      .update({ approved_by: user.id })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    logAudit({
      userId:      user.id,
      module:      'discounts',
      action:      'approve',
      entityId:    id,
      entityLabel: `${existing.discount_percentage}% off — ${(existing.inventory_item as any)?.product?.name ?? 'Unknown'}`,
    })

    const item     = existing.inventory_item as any
    const itemName = item?.product?.name ?? 'Unknown'

    // Notify the person who created the discount (in-app + email)
    if (existing.applied_by) {
      notifyUser(existing.applied_by, {
        title:        `Discount Approved — ${itemName}`,
        message:      `Your ${existing.discount_percentage}% discount on "${itemName}" has been approved by ${approverName}. The item is now live at the discounted price of ₦${Number(existing.discounted_price).toLocaleString('en-NG')}.`,
        type:         'discount_approved',
        entity_id:    id,
        entity_label: itemName,
        action_url:   '/discounts',
      }).catch(() => {})
    }

    // Fire-and-forget: approval notification to configured recipients
    getDiscountRecipients().then(recipients => {
      if (!recipients.length) return
      const { subject, html } = buildDiscountAlertEmail({
        action:          'approved',
        itemName:        item?.product?.name ?? 'Unknown',
        sku:             item?.product?.sku,
        originalPrice:   existing.original_price,
        discountedPrice: existing.discounted_price,
        discountPercent: existing.discount_percentage,
        quantity:        item?.quantity ?? 0,
        appliedBy:       'Staff',
        approvedBy:      approverName,
        dateTime:        new Date().toISOString(),
      })
      sendEmail({ to: recipients, subject, html }).catch(() => {})
    })

    return NextResponse.json(data)
  }

  // ── Update recovery stats ──
  if (body.units_sold !== undefined) {
    const additionalRevenue = Number(body.units_sold) * Number(existing.discounted_price)
    const { data, error } = await supabase
      .from('discounts')
      .update({
        units_sold:        (existing.units_sold ?? 0) + Number(body.units_sold),
        revenue_recovered: (Number(existing.revenue_recovered) ?? 0) + additionalRevenue,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'No valid operation specified' }, { status: 400 })
}

// DELETE /api/discounts/[id] — retract a discount report (reporter, supervisor, manager, or admin only)
// Blocked once the linked inventory item reaches sent_to_loss_control or beyond
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: record } = await supabase
    .from('discounts')
    .select('id, applied_by, inventory_item_id, inventory_item:inventory_items(pipeline_stage)')
    .eq('id', id)
    .single()

  if (!record) return NextResponse.json({ error: 'Discount not found' }, { status: 404 })

  // Only reporter (applied_by) OR supervisor/manager/admin can delete
  if (record.applied_by !== user.id) {
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

  // Delete the discount record first
  const { error: deleteErr } = await admin.from('discounts').delete().eq('id', id)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  logAudit({ userId: user.id, module: 'discounts', action: 'delete', entityId: id, entityLabel: `Discount ${id}` })

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

  return NextResponse.json({ success: true })
}

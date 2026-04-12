import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/services/audit'
import { notifyUser, notifyRoleUsers } from '@/lib/services/notificationService'

// PATCH /api/inventory/[id] — update a batch
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const { data, error } = await supabase
    .from('inventory_items')
    .update(body)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logAudit({
    userId:      user.id,
    module:      'inventory',
    action:      body.pipeline_stage ? 'stage_change' : 'update',
    entityId:    id,
    entityLabel: `Inventory item ${id}`,
    details:     body.pipeline_stage ? { pipeline_stage: body.pipeline_stage } : undefined,
  })

  // When the Approval page approves or rejects an item, sync records + notify submitter.
  // Use admin client to bypass RLS — auth check was already done above.
  if (body.pipeline_stage === 'sales_approved' || body.pipeline_stage === 'sent_to_loss_control') {
    const admin = createAdminClient()

    // Fetch the item name + who originally reported it (via damage record)
    const { data: itemFull } = await admin
      .from('inventory_items')
      .select('product:products(name), damage_records(reported_by)')
      .eq('id', id)
      .single()

    const productName  = (itemFull?.product as any)?.name ?? 'Item'
    const reportedById = (itemFull?.damage_records as any[])?.[0]?.reported_by ?? null
    const isApproved   = body.pipeline_stage === 'sales_approved'

    // Notify the person who reported the item (if we can identify them)
    if (reportedById) {
      notifyUser(reportedById, {
        title:        isApproved
          ? `Resolution Approved — ${productName}`
          : `Resolution Sent Back — ${productName}`,
        message:      isApproved
          ? `Your loss control resolution for "${productName}" has been approved by management. The item is now cleared for sale.`
          : `The resolution for "${productName}" has been sent back to loss control for review. Please check the item and re-submit a resolution.`,
        type:         isApproved ? 'resolution_approved' : 'resolution_rejected',
        entity_id:    id,
        entity_label: productName,
        action_url:   isApproved ? '/resolution' : '/loss-control',
      }).catch(() => {})
    }

    // Also notify the full loss-control team on rejection so someone picks it up
    if (!isApproved) {
      notifyRoleUsers('supervisor', {
        title:        `Resolution Returned — ${productName}`,
        message:      `Management sent back the resolution for "${productName}". Please review and re-submit to loss control.`,
        type:         'resolution_rejected',
        entity_id:    id,
        entity_label: productName,
        action_url:   '/loss-control',
      }).catch(() => {})
    }
  }

  if (body.pipeline_stage === 'sales_approved') {
    const admin = createAdminClient()

    // Fetch pending damage records before approving so we can log each one
    const { data: pendingDamage } = await admin
      .from('damage_records')
      .select('id, inventory_item:inventory_items(product:products(name))')
      .eq('inventory_item_id', id)
      .eq('status', 'pending')

    await admin
      .from('damage_records')
      .update({ status: 'approved', approved_by: user.id, approved_at: new Date().toISOString() })
      .eq('inventory_item_id', id)
      .eq('status', 'pending')

    // Log each damage approval in the audit trail
    for (const dmg of (pendingDamage ?? [])) {
      logAudit({
        userId:      user.id,
        module:      'damage',
        action:      'approve',
        entityId:    dmg.id,
        entityLabel: (dmg.inventory_item as any)?.product?.name ?? 'Damage record',
        details:     { via: 'approval_page', inventory_item_id: id },
      })
    }

    // Fetch unapproved discounts before approving
    const { data: pendingDiscounts } = await admin
      .from('discounts')
      .select('id, name, discount_type')
      .eq('inventory_item_id', id)
      .is('approved_by', null)

    await admin
      .from('discounts')
      .update({ approved_by: user.id })
      .eq('inventory_item_id', id)
      .is('approved_by', null)

    // Log each discount approval in the audit trail
    for (const disc of (pendingDiscounts ?? [])) {
      logAudit({
        userId:      user.id,
        module:      'discounts',
        action:      'approve',
        entityId:    disc.id,
        entityLabel: disc.name ?? disc.discount_type ?? 'Discount',
        details:     { via: 'approval_page', inventory_item_id: id },
      })
    }
  }

  return NextResponse.json(data)
}

// DELETE /api/inventory/[id] — soft-delete (mark as removed)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { error } = await supabase
    .from('inventory_items')
    .update({ status: 'removed' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logAudit({ userId: user.id, module: 'inventory', action: 'delete', entityId: id, entityLabel: `Inventory item ${id}` })

  return NextResponse.json({ success: true })
}

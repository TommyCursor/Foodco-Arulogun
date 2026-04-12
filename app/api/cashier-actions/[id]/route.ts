import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit }          from '@/lib/services/audit'
import { notifyRoleUsers }   from '@/lib/services/notificationService'

// PATCH /api/cashier-actions/:inventoryItemId
// body: { action: 'sold' | 'wasted' }
// Finalises a sales_approved item — uses admin client so cashiers (who lack edit_inventory) can act.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id }             = await params
  const { action }         = await req.json() as { action: 'sold' | 'wasted' }

  if (action !== 'sold' && action !== 'wasted') {
    return NextResponse.json({ error: 'action must be "sold" or "wasted"' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Fetch item — guard it is sales_approved
  const { data: item, error: fetchErr } = await admin
    .from('inventory_items')
    .select('id, quantity, selling_price, original_price, pipeline_stage, product:products(name)')
    .eq('id', id)
    .single()

  if (fetchErr || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (item.pipeline_stage !== 'sales_approved') {
    return NextResponse.json({ error: 'Item is not in the sales_approved stage' }, { status: 400 })
  }

  const productName = (item.product as any)?.name ?? 'Unknown'

  if (action === 'sold') {
    // Mark inventory item as sold
    await admin
      .from('inventory_items')
      .update({ pipeline_stage: 'sold', status: 'sold' })
      .eq('id', id)

    // Mark all linked active discounts as sold
    await admin
      .from('discounts')
      .update({ status: 'sold' })
      .eq('inventory_item_id', id)
      .eq('status', 'active')

    logAudit({
      userId:      user.id,
      module:      'cashier',
      action:      'sold',
      entityId:    id,
      entityLabel: productName,
      details:     { selling_price: item.selling_price, quantity: item.quantity },
    })

    // Notify managers — item closed out as sold
    const revenue = Number(item.selling_price) * Number(item.quantity)
    notifyRoleUsers('manager', {
      title:        `Item Sold — ${productName}`,
      message:      `"${productName}" (qty: ${item.quantity}) has been marked as sold by the cashier. Revenue recovered: ₦${revenue.toLocaleString('en-NG')}.`,
      type:         'item_sold',
      entity_id:    id,
      entity_label: productName,
      action_url:   '/cashier-actions',
    }).catch(() => {})

  } else {
    // Mark inventory item as wasted / written off
    await admin
      .from('inventory_items')
      .update({ pipeline_stage: 'wasted', status: 'removed' })
      .eq('id', id)

    // Mark all linked damage records as wasted
    await admin
      .from('damage_records')
      .update({ status: 'wasted' })
      .eq('inventory_item_id', id)
      .eq('status', 'approved')

    logAudit({
      userId:      user.id,
      module:      'cashier',
      action:      'wasted',
      entityId:    id,
      entityLabel: productName,
      details:     { quantity: item.quantity, original_price: item.original_price },
    })

    // Notify managers — item written off as wasted (financial loss)
    const loss = Number(item.original_price) * Number(item.quantity)
    notifyRoleUsers('manager', {
      title:        `Item Written Off — ${productName}`,
      message:      `"${productName}" (qty: ${item.quantity}) has been marked as wasted by the cashier. Estimated loss: ₦${loss.toLocaleString('en-NG')}.`,
      type:         'item_wasted',
      entity_id:    id,
      entity_label: productName,
      action_url:   '/cashier-actions',
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}

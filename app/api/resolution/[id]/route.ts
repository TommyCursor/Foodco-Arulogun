import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit }          from '@/lib/services/audit'
import { notifyRoleUsers }   from '@/lib/services/notificationService'

// PATCH /api/resolution/:inventoryItemId
// Saves a loss-control resolution — either notes-only or a discount resolution.
// Discount resolutions update the item's selling_price and create a discounts record
// so the potential loss flows into all financial reporting.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body   = await req.json() as {
    notes?:               string
    resolution_type:      'notes_only' | 'discount'
    discount_percentage?: number
    discounted_price?:    number
  }

  const admin = createAdminClient()

  // ── Fetch the inventory item ──────────────────────────────
  const { data: item, error: fetchErr } = await admin
    .from('inventory_items')
    .select('id, quantity, selling_price, original_price, pipeline_stage, notes, product:products(name)')
    .eq('id', id)
    .single()

  if (fetchErr || !item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const allowed = ['sent_to_loss_control', 'sent_to_resolution', 'resolution_received']
  if (!allowed.includes(item.pipeline_stage)) {
    return NextResponse.json({ error: 'Item is not at loss control' }, { status: 400 })
  }

  const productName    = (item.product as any)?.name ?? 'Unknown'
  const originalPrice  = Number(item.original_price)
  const qty            = Number(item.quantity)

  // ── Discount resolution logic ─────────────────────────────
  if (body.resolution_type === 'discount') {
    // Derive both values — user may have supplied either one
    let pct: number
    let newPrice: number

    if (body.discount_percentage != null && body.discounted_price != null) {
      // Both provided — trust the price, derive pct from it
      newPrice = Number(body.discounted_price)
      pct      = originalPrice > 0
        ? Math.round(((originalPrice - newPrice) / originalPrice) * 10000) / 100
        : 0
    } else if (body.discount_percentage != null) {
      pct      = Number(body.discount_percentage)
      newPrice = Math.round(originalPrice * (1 - pct / 100) * 100) / 100
    } else if (body.discounted_price != null) {
      newPrice = Number(body.discounted_price)
      pct      = originalPrice > 0
        ? Math.round(((originalPrice - newPrice) / originalPrice) * 10000) / 100
        : 0
    } else {
      return NextResponse.json({ error: 'Provide discount_percentage or discounted_price' }, { status: 400 })
    }

    if (newPrice < 0) return NextResponse.json({ error: 'Discounted price cannot be negative' }, { status: 400 })
    if (newPrice >= originalPrice) {
      return NextResponse.json({ error: 'Discounted price must be lower than the original price' }, { status: 400 })
    }

    const potentialLoss = Math.round((originalPrice - newPrice) * qty * 100) / 100

    // Cancel any existing active discount on this item
    await admin
      .from('discounts')
      .update({ status: 'cancelled' })
      .eq('inventory_item_id', id)
      .eq('status', 'active')

    // Create discount record — this flows into all financial KPIs
    const endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: disc, error: discErr } = await admin
      .from('discounts')
      .insert({
        inventory_item_id:   id,
        name:                `LC Resolution — ${productName}`,
        discount_percentage: pct,
        discount_type:       'clearance',
        original_price:      originalPrice,
        discounted_price:    newPrice,
        start_date:          new Date().toISOString(),
        end_date:            endDate,
        applied_by:          user.id,
        // Auto-approve LC resolutions — they come with management sign-off
        approved_by:         user.id,
        status:              'active',
      })
      .select('id')
      .single()

    if (discErr) return NextResponse.json({ error: discErr.message }, { status: 500 })

    // Update the inventory item's live selling price
    await admin
      .from('inventory_items')
      .update({
        selling_price:  newPrice,
        status:         'discounted',
        pipeline_stage: 'resolution_received',
        notes:          body.notes ?? item.notes ?? null,
      })
      .eq('id', id)

    logAudit({
      userId:      user.id,
      module:      'loss_control',
      action:      'stage_change',
      entityId:    id,
      entityLabel: productName,
      details: {
        resolution_type:     'discount',
        discount_percentage: pct,
        original_price:      originalPrice,
        discounted_price:    newPrice,
        potential_loss:      potentialLoss,
        qty,
      },
    })

    // Notify managers of the resolution with financial impact
    notifyRoleUsers('manager', {
      title:        'LC Resolution — Discount Set',
      message:      `${productName} — loss control resolution: ${pct}% discount (₦${originalPrice.toLocaleString('en-NG')} → ₦${newPrice.toLocaleString('en-NG')}). Potential loss: ₦${potentialLoss.toLocaleString('en-NG')}. Awaiting approval.`,
      type:         'resolution_received',
      entity_id:    id,
      entity_label: productName,
      action_url:   '/approval',
    }).catch(() => {})

    return NextResponse.json({
      ok:               true,
      discount_id:      disc?.id,
      discount_pct:     pct,
      discounted_price: newPrice,
      potential_loss:   potentialLoss,
    })
  }

  // ── Notes-only resolution ─────────────────────────────────
  const { error: updateErr } = await admin
    .from('inventory_items')
    .update({
      pipeline_stage: 'resolution_received',
      notes:          body.notes ?? null,
    })
    .eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  logAudit({
    userId:      user.id,
    module:      'loss_control',
    action:      'stage_change',
    entityId:    id,
    entityLabel: productName,
    details:     { resolution_type: 'notes_only', notes: body.notes },
  })

  notifyRoleUsers('manager', {
    title:        'LC Resolution Entered',
    message:      `${productName} — loss control resolution received. Awaiting management approval.`,
    type:         'resolution_received',
    entity_id:    id,
    entity_label: productName,
    action_url:   '/approval',
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

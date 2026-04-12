import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildDiscountAlertEmail } from '@/lib/services/email'
import { DISCOUNT } from '@/lib/constants'
import { logAudit } from '@/lib/services/audit'
import { notifyRoleUsers, TEAM_LEAD_ROLES } from '@/lib/services/notificationService'

async function getDiscountRecipients(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'discount_alert_recipients')
    .single()
  return data?.value?.emails ?? []
}

// GET /api/discounts
export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('discounts')
    .select(`
      *,
      inventory_item:inventory_items (
        id, batch_number, quantity, expiry_date, selling_price, original_price, location,
        product:products (id, name, sku, unit,
          category:categories (id, name)
        )
      )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/discounts — create a new discount (auto-creates inventory item if needed)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const admin    = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  // discount_percentage has CHECK (> 0) in DB; default to 1 when not submitted by form
  const pct  = body.discount_percentage ? Number(body.discount_percentage) : 1
  // end_date is NOT NULL in DB; default to 30 days from now when not submitted by form
  const endDate = body.end_date ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  // Categories that skip Loss Control and land directly in Resolution
  const SKIP_LC_DISCOUNT = ['fresh food', 'cashier', '3f']

  let batch: { id: string; quantity: number; selling_price: number; status: string; product: unknown } | null = null
  let inventoryItemId: string | null = body.inventory_item_id ?? null

  if (inventoryItemId) {
    // Linked to existing inventory item — use admin (manage_discounts users may lack edit_inventory)
    const { data } = await admin
      .from('inventory_items')
      .select('id, quantity, selling_price, status, product:products(name, sku, category:categories(name))')
      .eq('id', inventoryItemId)
      .single()

    if (!data) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    if (!['active', 'discounted'].includes(data.status)) {
      return NextResponse.json({ error: 'Only active or discounted batches can receive a discount' }, { status: 400 })
    }
    batch = data

    // Cancel any existing active discount on this batch before creating a new one
    await admin
      .from('discounts')
      .update({ status: 'cancelled' })
      .eq('inventory_item_id', inventoryItemId)
      .eq('status', 'active')
  } else {
    // Auto-create product + inventory item — use admin (manage_discounts users lack edit_inventory RLS)
    const sku = body.barcode
      || `MANUAL-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`

    // Resolve category name → category_id (find or create)
    let categoryId: string | null = null
    if (body.category) {
      const { data: existingCat } = await admin
        .from('categories')
        .select('id')
        .eq('name', body.category)
        .maybeSingle()
      if (existingCat) {
        categoryId = existingCat.id
      } else {
        const { data: newCat } = await admin
          .from('categories')
          .insert({ name: body.category })
          .select('id')
          .single()
        categoryId = newCat?.id ?? null
      }
    }

    let productId: string | null = null
    const { data: existingProduct } = await admin
      .from('products').select('id').eq('sku', sku).maybeSingle()

    if (existingProduct) {
      productId = existingProduct.id
    } else {
      const { data: newProduct, error: productErr } = await admin
        .from('products')
        .insert({
          name:           body.description ?? 'Unknown Item',
          sku,
          unit:           'piece',
          standard_price: body.original_price ?? 0,
          category_id:    categoryId,
        })
        .select('id').single()
      if (productErr) return NextResponse.json({ error: productErr.message }, { status: 500 })
      if (newProduct) productId = newProduct.id
    }

    if (productId) {
      const discountStage = SKIP_LC_DISCOUNT.includes((body.category ?? '').toLowerCase())
        ? 'sent_to_resolution'
        : 'discount_reported'
      const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const { data: newItem, error: itemErr } = await admin
        .from('inventory_items')
        .insert({
          product_id:     productId,
          quantity:       body.qty ?? 1,
          unit_cost:      body.original_price ?? 0,
          selling_price:  body.original_price ?? 0,
          original_price: body.original_price ?? 0,
          expiry_date:    expiryDate,
          pipeline_stage: discountStage,
          received_by:    user.id,
        })
        .select('id').single()
      if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 500 })
      if (newItem) inventoryItemId = newItem.id
    }
  }

  // Fetch applier name for email
  const { data: applier } = await supabase
    .from('profiles').select('full_name').eq('id', user.id).single()

  // Create the discount record (admin: manage_discounts users may have override-only access)
  const { data: discount, error } = await admin
    .from('discounts')
    .insert({
      inventory_item_id:   inventoryItemId,
      name:                body.name ?? null,
      discount_percentage: pct,
      discount_type:       body.discount_type ?? 'manual',
      original_price:      body.original_price ?? 0,
      discounted_price:    body.discounted_price ?? body.original_price ?? 0,
      start_date:          new Date().toISOString(),
      end_date:            endDate,
      applied_by:          user.id,
      approved_by:         null,
      status:              'active',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const auditItemName = body.description ?? (batch ? (batch.product as any)?.name : null) ?? 'Unknown'
  logAudit({
    userId:      user.id,
    module:      'discounts',
    action:      'create',
    entityId:    discount.id,
    entityLabel: `${pct}% off — ${auditItemName}`,
    details:     { discount_percentage: pct, original_price: body.original_price, discounted_price: body.discounted_price },
  })

  // Update inventory item's price + pipeline stage (admin: manage_discounts users lack edit_inventory)
  if (inventoryItemId) {
    const batchCatName = (batch?.product as any)?.category?.name ?? ''
    const existingItemStage = SKIP_LC_DISCOUNT.includes(batchCatName.toLowerCase())
      || SKIP_LC_DISCOUNT.includes((body.category ?? '').toLowerCase())
      ? 'sent_to_resolution'
      : 'discount_reported'
    await admin
      .from('inventory_items')
      .update({ selling_price: body.discounted_price ?? body.original_price, status: 'discounted', pipeline_stage: existingItemStage })
      .eq('id', inventoryItemId)

    // Notify team leads when discount requires approval (above threshold)
    if (pct > DISCOUNT.APPROVAL_THRESHOLD) {
      const discItemName = body.description ?? (batch ? (batch.product as any)?.name : null) ?? 'Unknown'
      const skipsLC = existingItemStage === 'sent_to_resolution'
      for (const role of TEAM_LEAD_ROLES) {
        notifyRoleUsers(role, {
          title:        skipsLC ? 'Discount Sent to Resolution' : 'Discount Requires Approval',
          message:      skipsLC
            ? `${discItemName} — ${pct}% discount sent directly to resolution (no loss control step).`
            : `${discItemName} — ${pct}% discount applied and pending approval. Action required.`,
          type:         'discount_reported',
          entity_id:    inventoryItemId,
          entity_label: discItemName,
          action_url:   skipsLC ? '/resolution' : '/inventory',
        }).catch(() => {})
      }
    }
  }

  // Fire-and-forget: send automatic discount notification
  getDiscountRecipients().then(recipients => {
    if (!recipients.length) return
    const itemName = body.description
      ?? (batch ? (batch.product as any)?.name : null)
      ?? 'Unknown'
    const { subject, html } = buildDiscountAlertEmail({
      action:          'created',
      itemName,
      sku:             body.barcode ?? (batch ? (batch.product as any)?.sku : null),
      originalPrice:   body.original_price,
      discountedPrice: body.discounted_price,
      discountPercent: pct,
      quantity:        body.qty ?? batch?.quantity ?? 0,
      appliedBy:       applier?.full_name ?? 'Unknown',
      dateTime:        new Date().toISOString(),
    })
    sendEmail({ to: recipients, subject, html }).catch(() => {})
  })

  return NextResponse.json(discount, { status: 201 })
}

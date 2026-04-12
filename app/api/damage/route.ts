import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildDamageAlertEmail } from '@/lib/services/email'
import { logAudit } from '@/lib/services/audit'
import { notifyRoleUsers, TEAM_LEAD_ROLES } from '@/lib/services/notificationService'

// ── Helper: fetch damage alert recipients ────────────────────
async function getDamageRecipients(): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'damage_alert_recipients')
    .single()
  return data?.value?.emails ?? []
}

// GET /api/damage — list all damage records
export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('damage_records')
    .select(`
      *,
      inventory_item:inventory_items (
        id, batch_number, quantity, location,
        product:products (id, name, sku)
      ),
      reporter:profiles!damage_records_reported_by_fkey (id, full_name),
      approver:profiles!damage_records_approved_by_fkey  (id, full_name)
    `)
    .order('reported_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/damage — log a new damage record (auto-creates inventory item if needed)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const admin    = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  let batch: { quantity: number; batch_number: string | null; location: string | null; product: unknown } | null = null
  let inventoryItemId: string | null = body.inventory_item_id ?? null

  if (inventoryItemId) {
    // Linked to existing inventory item — validate stock (admin client: mark_damage users lack edit_inventory)
    const { data } = await admin
      .from('inventory_items')
      .select('quantity, batch_number, location, product:products(name, sku, category:categories(name))')
      .eq('id', inventoryItemId)
      .single()

    if (!data) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
    if (body.quantity_damaged > data.quantity) {
      return NextResponse.json(
        { error: `Quantity damaged (${body.quantity_damaged}) exceeds available stock (${data.quantity})` },
        { status: 400 }
      )
    }
    batch = data
  } else {
    // Auto-create product + inventory item — use admin client (mark_damage users lack edit_inventory RLS)
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
      const { data: newProduct } = await admin
        .from('products')
        .insert({
          name:           body.description ?? 'Unknown Item',
          sku,
          unit:           'piece',
          standard_price: body.unit_price ?? 0,
          category_id:    categoryId,
        })
        .select('id').single()
      if (newProduct) productId = newProduct.id
    }

    if (productId) {
      const SKIP_LC_DAMAGE = ['cashier', '3f']
      const isCashier = SKIP_LC_DAMAGE.includes(body.category?.toLowerCase() ?? '')
      const stage = isCashier
        ? 'sent_to_resolution'
        : body.reason === 'About to Expire' ? 'expiry_reported' : 'damage_reported'
      const expiryDate = body.expiry_date
        ? new Date(body.expiry_date).toISOString().split('T')[0]
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      const { data: newItem } = await admin
        .from('inventory_items')
        .insert({
          product_id:     productId,
          quantity:       body.quantity_damaged,
          unit_cost:      body.unit_price ?? 0,
          selling_price:  body.unit_price ?? 0,
          original_price: body.unit_price ?? 0,
          expiry_date:    expiryDate,
          pipeline_stage: stage,
          received_by:    user.id,
        })
        .select('id').single()
      if (newItem) inventoryItemId = newItem.id
    }
  }

  // Fetch reporter's name for email
  const { data: reporter } = await supabase
    .from('profiles').select('full_name').eq('id', user.id).single()

  const { data, error } = await admin
    .from('damage_records')
    .insert({
      inventory_item_id:    inventoryItemId,
      quantity_damaged:     body.quantity_damaged,
      reason:               body.reason,
      estimated_value_lost: body.estimated_value_lost,
      notes:                [body.notes, body.description ? `Product: ${body.description}` : null, body.category ? `Category: ${body.category}` : null]
                              .filter(Boolean).join(' | ') || null,
      reported_by:          user.id,
      status:               'pending',
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const itemName = body.description
    ?? (batch ? (batch.product as any)?.name : null)
    ?? 'Unknown'
  logAudit({
    userId:      user.id,
    module:      'damage',
    action:      'create',
    entityId:    data.id,
    entityLabel: `${body.reason ?? 'Damage'} — ${itemName}`,
    details:     { quantity_damaged: body.quantity_damaged, estimated_value_lost: body.estimated_value_lost },
  })

  // Determine pipeline stage — cashier category skips loss control, goes straight to resolution
  const SKIP_LC_DAMAGE_CATS = ['cashier', '3f']
  const isCashierCategory =
    SKIP_LC_DAMAGE_CATS.includes(body.category?.toLowerCase() ?? '') ||
    (batch ? SKIP_LC_DAMAGE_CATS.includes((batch.product as any)?.category?.name?.toLowerCase() ?? '') : false)

  // Update pipeline stage on the inventory item (admin: mark_damage users lack edit_inventory)
  if (inventoryItemId) {
    const stage = isCashierCategory
      ? 'sent_to_resolution'
      : body.reason === 'About to Expire' ? 'expiry_reported' : 'damage_reported'
    await admin
      .from('inventory_items')
      .update({ pipeline_stage: stage })
      .eq('id', inventoryItemId)

    // Fire-and-forget: notify team leads in-app
    // Cashier items go straight to resolution — notify with resolution action URL
    if (isCashierCategory) {
      for (const role of TEAM_LEAD_ROLES) {
        notifyRoleUsers(role, {
          title:        'Cashier Damage — Sent to Resolution',
          message:      `${itemName} — cashier damage reported and sent directly to resolution. No loss control step required.`,
          type:         'damage_reported',
          entity_id:    inventoryItemId,
          entity_label: itemName,
          action_url:   '/resolution',
        }).catch(() => {})
      }
    } else {
      const notifType  = stage === 'expiry_reported' ? 'expiry_warning' : 'damage_reported'
      const notifTitle = stage === 'expiry_reported' ? 'Expiry Item Logged' : 'Damage Reported'
      for (const role of TEAM_LEAD_ROLES) {
        notifyRoleUsers(role, {
          title:        notifTitle,
          message:      `${itemName} — ${body.reason ?? 'damage'} reported. Action required: send to loss control.`,
          type:         notifType,
          entity_id:    inventoryItemId,
          entity_label: itemName,
          action_url:   '/inventory',
        }).catch(() => {})
      }
    }
  }

  // Fire-and-forget: send automatic damage notification
  getDamageRecipients().then(recipients => {
    if (!recipients.length) return
    const itemName = body.description
      ?? (batch ? (batch.product as any)?.name : null)
      ?? 'Unknown'
    const { subject, html } = buildDamageAlertEmail({
      action:          'created',
      itemName,
      batchNumber:     batch?.batch_number ?? undefined,
      quantityDamaged: body.quantity_damaged,
      estimatedValue:  body.estimated_value_lost,
      loggedBy:        reporter?.full_name ?? 'Unknown',
      dateTime:        new Date().toISOString(),
    })
    sendEmail({ to: recipients, subject, html }).catch(() => {})
  })

  return NextResponse.json(data, { status: 201 })
}

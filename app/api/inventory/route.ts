import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/services/audit'

// GET /api/inventory — list all non-removed batches
export async function GET() {
  // Auth check via user session
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Use admin client for the query so embedded joins (damage_records, discounts)
  // are not blocked by per-row RLS policy evaluation in PostgREST
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('inventory_items')
    .select(`
      *,
      product:products (
        id, name, sku, unit, standard_price,
        category:categories (id, name)
      ),
      damage_records (id, reason, reported_at, approved_by, approver:profiles!damage_records_approved_by_fkey(full_name)),
      discounts (id, created_at, approved_by, approver:profiles!discounts_approved_by_fkey(full_name))
    `)
    .neq('status', 'removed')
    .order('expiry_date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/inventory — add a new batch (auto-creates product if needed)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Resolve product_id — find by SKU or create a new product
  let productId: string = body.product_id ?? null

  if (!productId && body.sku) {
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('sku', body.sku)
      .maybeSingle()

    if (existing) {
      productId = existing.id
    } else {
      const { data: newProduct, error: productError } = await supabase
        .from('products')
        .insert({
          name:           body.product_name,
          sku:            body.sku,
          category_id:    body.category_id ?? null,
          unit:           body.unit        ?? 'piece',
          standard_price: body.selling_price,
        })
        .select('id')
        .single()

      if (productError) return NextResponse.json({ error: productError.message }, { status: 500 })
      productId = newProduct.id
    }
  }

  if (!productId) {
    return NextResponse.json({ error: 'product_id or sku is required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      product_id:       productId,
      batch_number:     body.batch_number   ?? null,
      quantity:         body.quantity,
      unit_cost:        body.unit_cost      ?? body.selling_price,
      selling_price:    body.selling_price,
      original_price:   body.selling_price,
      expiry_date:      body.expiry_date,
      manufacture_date: body.manufacture_date ?? null,
      location:         body.location         ?? null,
      notes:            body.notes            ?? null,
      received_by:      user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logAudit({
    userId:      user.id,
    module:      'inventory',
    action:      'create',
    entityId:    data.id,
    entityLabel: `Batch #${data.batch_number ?? 'N/A'}`,
    details:     { product_id: productId, quantity: body.quantity, expiry_date: body.expiry_date },
  })

  return NextResponse.json(data, { status: 201 })
}

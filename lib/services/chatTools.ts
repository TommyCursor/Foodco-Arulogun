import { createAdminClient } from '@/lib/supabase/admin'
import dayjs from 'dayjs'

// ── Page link map (injected into system prompt) ───────────────────────────
export const PAGE_LINKS: Record<string, string> = {
  inventory:    '/inventory',
  damage:       '/damage',
  expiring:     '/expiring',
  discounts:    '/discounts',
  'loss-control': '/loss-control',
  resolution:   '/resolution',
  approval:     '/approval',
  sales:        '/sales',
  reports:      '/reports',
  alerts:       '/alerts',
  roster:       '/roster',
  audit:        '/audit',
  users:        '/users',
}

// ── Tool definitions for Groq function calling ────────────────────────────
export const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'query_inventory',
      description: 'Fetch inventory items with optional filters. Use for questions about stock levels, product quantities, prices, pipeline stages, categories, or expiry dates.',
      parameters: {
        type: 'object',
        properties: {
          pipeline_stage: {
            type: 'string',
            description: 'Filter by pipeline stage: logged, damage_reported, expiry_reported, discount_reported, sent_to_loss_control, sent_to_resolution, resolution_received, sales_approved. Omit for all stages.',
          },
          category_name: {
            type: 'string',
            description: 'Filter by department/category name e.g. Grocery, Fresh Food, Toiletries, Baby, Health & Beauty, 3F, Cashier, Household',
          },
          expiry_within_days: {
            type: 'number',
            description: 'Return only items expiring within this many days from today',
          },
          min_quantity: {
            type: 'number',
            description: 'Return only items with quantity >= this value',
          },
          max_quantity: {
            type: 'number',
            description: 'Return only items with quantity <= this value',
          },
          search: {
            type: 'string',
            description: 'Search product name or SKU (partial match)',
          },
          limit: {
            type: 'number',
            description: 'Max items to return. Default 20, max 50.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_discounts',
      description: 'Fetch discount records. Use for questions about discounted items, clearance pricing, items with price reductions, potential losses from discounts, or unsold discounted stock.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'cancelled', 'all'],
            description: 'Filter by discount status. Default: active',
          },
          discount_type: {
            type: 'string',
            description: 'Filter by type: clearance, flash_sale, expiry_discount, loss_control',
          },
          min_percentage: {
            type: 'number',
            description: 'Minimum discount percentage',
          },
          limit: {
            type: 'number',
            description: 'Max records to return. Default 20.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_damage',
      description: 'Fetch damage records. Use for questions about damaged items, damage history, pending approvals, or estimated value lost.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending', 'approved', 'rejected', 'all'],
            description: 'Filter by approval status. Default: all',
          },
          days_back: {
            type: 'number',
            description: 'Return records from the last N days. Default: 7',
          },
          reason: {
            type: 'string',
            description: 'Filter by damage reason (partial match)',
          },
          limit: {
            type: 'number',
            description: 'Max records to return. Default 20.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_expiring',
      description: 'Fetch items about to expire. Use for questions about expiry risk, stock freshness, or items needing urgent attention.',
      parameters: {
        type: 'object',
        properties: {
          within_days: {
            type: 'number',
            description: 'Items expiring within this many days. Default: 14',
          },
          category_name: {
            type: 'string',
            description: 'Filter by department/category',
          },
          limit: {
            type: 'number',
            description: 'Max items to return. Default 20.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_pipeline',
      description: 'Fetch items at a specific stage in the loss control pipeline. Use for questions about approval queues, resolution queues, loss control status, or pipeline health.',
      parameters: {
        type: 'object',
        properties: {
          stage: {
            type: 'string',
            enum: ['loss_control_pending', 'resolution_pending', 'approval_pending', 'all_pipeline'],
            description: 'Which pipeline stage to query',
          },
          limit: {
            type: 'number',
            description: 'Max items to return. Default 20.',
          },
        },
        required: ['stage'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'query_sales',
      description: 'Fetch sales data and performance metrics. Use for questions about revenue, profit, top products, or sales trends.',
      parameters: {
        type: 'object',
        properties: {
          days_back: {
            type: 'number',
            description: 'Number of days back to include. Default: 7',
          },
          group_by: {
            type: 'string',
            enum: ['day', 'product', 'category'],
            description: 'How to group the results',
          },
          limit: {
            type: 'number',
            description: 'Max records to return. Default 10.',
          },
        },
        required: [],
      },
    },
  },
]

// ── Tool execution ─────────────────────────────────────────────────────────
export async function executeTool(name: string, args: Record<string, unknown>): Promise<string> {
  const admin = createAdminClient()

  try {
    switch (name) {

      case 'query_inventory': {
        let q = admin
          .from('inventory_items')
          .select('id, quantity, selling_price, original_price, expiry_date, pipeline_stage, location, product:products(name, sku, category:categories(name))')
          .order('quantity', { ascending: true })

        if (args.pipeline_stage) q = q.eq('pipeline_stage', args.pipeline_stage as string)
        if (args.expiry_within_days) {
          const cutoff = dayjs().add(Number(args.expiry_within_days), 'day').toISOString()
          q = q.lte('expiry_date', cutoff).gte('expiry_date', dayjs().startOf('day').toISOString())
        }
        if (args.min_quantity) q = q.gte('quantity', args.min_quantity)
        if (args.max_quantity) q = q.lte('quantity', args.max_quantity)

        const limit = Math.min(Number(args.limit ?? 20), 50)
        q = q.limit(limit)

        const { data, error } = await q
        if (error) return `Error fetching inventory: ${error.message}`
        if (!data?.length) return 'No inventory items found matching those criteria.'

        let filtered = data
        if (args.search) {
          const s = (args.search as string).toLowerCase()
          filtered = data.filter((i: any) =>
            i.product?.name?.toLowerCase().includes(s) ||
            i.product?.sku?.toLowerCase().includes(s)
          )
        }
        if (args.category_name) {
          const cat = (args.category_name as string).toLowerCase()
          filtered = filtered.filter((i: any) =>
            i.product?.category?.name?.toLowerCase().includes(cat)
          )
        }

        const lines = filtered.map((i: any) => {
          const name     = i.product?.name ?? 'Unknown'
          const category = i.product?.category?.name ?? '—'
          const qty      = i.quantity
          const price    = `₦${Number(i.selling_price).toLocaleString('en-NG')}`
          const orig     = i.original_price && Number(i.original_price) !== Number(i.selling_price)
            ? ` (orig ₦${Number(i.original_price).toLocaleString('en-NG')})` : ''
          const expiry   = i.expiry_date ? `, expires ${dayjs(i.expiry_date).format('D MMM YYYY')}` : ''
          const stage    = i.pipeline_stage !== 'logged' ? ` [${i.pipeline_stage.replace(/_/g, ' ')}]` : ''
          return `• ${name} (${category}) — ${qty} units @ ${price}${orig}${expiry}${stage}`
        })

        return `Found ${filtered.length} item(s):\n${lines.join('\n')}`
      }

      case 'query_discounts': {
        let q = admin
          .from('discounts')
          .select(`
            id, name, discount_percentage, discount_type, status,
            original_price, discounted_price, start_date, end_date,
            inventory_item:inventory_items(
              id, quantity,
              product:products(name, sku, category:categories(name))
            )
          `)
          .order('created_at', { ascending: false })

        const status = (args.status as string) ?? 'active'
        if (status !== 'all') q = q.eq('status', status)
        if (args.discount_type) q = q.eq('discount_type', args.discount_type as string)
        if (args.min_percentage) q = q.gte('discount_percentage', args.min_percentage)

        const limit = Math.min(Number(args.limit ?? 20), 50)
        q = q.limit(limit)

        const { data, error } = await q
        if (error) return `Error fetching discounts: ${error.message}`
        if (!data?.length) return `No ${status} discounts found.`

        const totalLoss = data.reduce((s: number, d: any) => {
          const qty  = Number(d.inventory_item?.quantity ?? 0)
          const loss = (Number(d.original_price) - Number(d.discounted_price)) * qty
          return s + loss
        }, 0)

        const lines = data.map((d: any) => {
          const name    = d.inventory_item?.product?.name ?? d.name
          const cat     = d.inventory_item?.product?.category?.name ?? '—'
          const qty     = d.inventory_item?.quantity ?? 0
          const pct     = Number(d.discount_percentage).toFixed(1)
          const orig    = `₦${Number(d.original_price).toLocaleString('en-NG')}`
          const curr    = `₦${Number(d.discounted_price).toLocaleString('en-NG')}`
          const loss    = `₦${((Number(d.original_price) - Number(d.discounted_price)) * qty).toLocaleString('en-NG')}`
          const expires = d.end_date ? dayjs(d.end_date).format('D MMM') : '—'
          return `• ${name} (${cat}) — ${qty} units, ${pct}% off (${orig} → ${curr}), potential loss: ${loss}, expires ${expires}`
        })

        return `Found ${data.length} ${status} discount(s). Total potential loss: ₦${totalLoss.toLocaleString('en-NG')}\n${lines.join('\n')}`
      }

      case 'query_damage': {
        const daysBack = Number(args.days_back ?? 7)
        const since    = dayjs().subtract(daysBack, 'day').startOf('day').toISOString()

        let q = admin
          .from('damage_records')
          .select(`
            id, quantity_damaged, estimated_value_lost, reason, status, reported_at,
            inventory_item:inventory_items(product:products(name, category:categories(name))),
            reporter:profiles!damage_records_reported_by_fkey(full_name)
          `)
          .gte('reported_at', since)
          .order('reported_at', { ascending: false })

        if (args.status && args.status !== 'all') q = q.eq('status', args.status as string)
        const limit = Math.min(Number(args.limit ?? 20), 50)
        q = q.limit(limit)

        const { data, error } = await q
        if (error) return `Error fetching damage records: ${error.message}`
        if (!data?.length) return `No damage records found in the last ${daysBack} days.`

        let filtered = data
        if (args.reason) {
          const r = (args.reason as string).toLowerCase()
          filtered = data.filter((d: any) => d.reason?.toLowerCase().includes(r))
        }

        const totalLoss = filtered.reduce((s: number, d: any) => s + Number(d.estimated_value_lost ?? 0), 0)
        const lines = filtered.map((d: any) => {
          const name    = d.inventory_item?.product?.name ?? 'Unknown'
          const cat     = d.inventory_item?.product?.category?.name ?? '—'
          const qty     = d.quantity_damaged
          const loss    = `₦${Number(d.estimated_value_lost).toLocaleString('en-NG')}`
          const status  = d.status
          const date    = dayjs(d.reported_at).format('D MMM, HH:mm')
          const by      = d.reporter?.full_name ?? 'Unknown'
          return `• ${name} (${cat}) — ${qty} units, ${loss} lost, ${d.reason}, ${status}, ${date} by ${by}`
        })

        return `Found ${filtered.length} record(s) in the last ${daysBack} days. Total loss: ₦${totalLoss.toLocaleString('en-NG')}\n${lines.join('\n')}`
      }

      case 'query_expiring': {
        const days   = Number(args.within_days ?? 14)
        const cutoff = dayjs().add(days, 'day').endOf('day').toISOString()
        const today  = dayjs().startOf('day').toISOString()

        let q = admin
          .from('inventory_items')
          .select('id, quantity, selling_price, expiry_date, product:products(name, sku, category:categories(name))')
          .lte('expiry_date', cutoff)
          .gte('expiry_date', today)
          .order('expiry_date', { ascending: true })

        const limit = Math.min(Number(args.limit ?? 20), 50)
        q = q.limit(limit)

        const { data, error } = await q
        if (error) return `Error fetching expiring items: ${error.message}`
        if (!data?.length) return `No items expiring within ${days} days.`

        let filtered = data
        if (args.category_name) {
          const cat = (args.category_name as string).toLowerCase()
          filtered = data.filter((i: any) => i.product?.category?.name?.toLowerCase().includes(cat))
        }

        const totalValue = filtered.reduce((s: number, i: any) => s + Number(i.selling_price) * Number(i.quantity), 0)
        const lines = filtered.map((i: any) => {
          const name   = i.product?.name ?? 'Unknown'
          const cat    = i.product?.category?.name ?? '—'
          const dLeft  = dayjs(i.expiry_date).diff(dayjs(), 'day')
          const label  = dLeft <= 0 ? 'EXPIRED' : dLeft === 1 ? '1 day left' : `${dLeft} days left`
          const value  = `₦${(Number(i.selling_price) * Number(i.quantity)).toLocaleString('en-NG')}`
          return `• ${name} (${cat}) — ${i.quantity} units, ${label}, value at risk: ${value}`
        })

        return `Found ${filtered.length} item(s) expiring within ${days} days. Total value at risk: ₦${totalValue.toLocaleString('en-NG')}\n${lines.join('\n')}`
      }

      case 'query_pipeline': {
        const stageMap: Record<string, string[]> = {
          loss_control_pending: ['damage_reported', 'expiry_reported', 'discount_reported'],
          resolution_pending:   ['sent_to_loss_control', 'sent_to_resolution'],
          approval_pending:     ['resolution_received'],
          all_pipeline:         ['damage_reported', 'expiry_reported', 'discount_reported', 'sent_to_loss_control', 'sent_to_resolution', 'resolution_received'],
        }
        const stages = stageMap[args.stage as string] ?? stageMap.all_pipeline
        const limit  = Math.min(Number(args.limit ?? 20), 50)

        const { data, error } = await admin
          .from('inventory_items')
          .select('id, quantity, selling_price, original_price, pipeline_stage, product:products(name, category:categories(name))')
          .in('pipeline_stage', stages)
          .order('pipeline_stage')
          .limit(limit)

        if (error) return `Error fetching pipeline: ${error.message}`
        if (!data?.length) return 'No items in that pipeline stage.'

        const totalValue = data.reduce((s: number, i: any) => s + Number(i.selling_price) * Number(i.quantity), 0)
        const lines = data.map((i: any) => {
          const name  = i.product?.name ?? 'Unknown'
          const cat   = i.product?.category?.name ?? '—'
          const stage = i.pipeline_stage.replace(/_/g, ' ')
          const val   = `₦${(Number(i.selling_price) * Number(i.quantity)).toLocaleString('en-NG')}`
          return `• ${name} (${cat}) — ${i.quantity} units, ${val}, stage: ${stage}`
        })

        return `Found ${data.length} item(s). Total value: ₦${totalValue.toLocaleString('en-NG')}\n${lines.join('\n')}`
      }

      case 'query_sales': {
        const daysBack = Number(args.days_back ?? 7)
        const since    = dayjs().subtract(daysBack, 'day').startOf('day').toISOString()
        const limit    = Math.min(Number(args.limit ?? 10), 50)

        const { data, error } = await admin
          .from('sales_records')
          .select('product_name, category, quantity_sold, total_amount, profit, sale_date')
          .gte('sale_date', since)
          .order('total_amount', { ascending: false })
          .limit(limit)

        if (error) return `Sales data unavailable: ${error.message}`
        if (!data?.length) return `No sales records in the last ${daysBack} days.`

        const totalRevenue = data.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0)
        const totalProfit  = data.reduce((s: number, r: any) => s + Number(r.profit ?? 0), 0)
        const totalUnits   = data.reduce((s: number, r: any) => s + Number(r.quantity_sold ?? 0), 0)

        const lines = data.slice(0, 10).map((r: any) =>
          `• ${r.product_name ?? 'Unknown'} (${r.category ?? '—'}) — ${r.quantity_sold} units, ₦${Number(r.total_amount).toLocaleString('en-NG')}, profit: ₦${Number(r.profit ?? 0).toLocaleString('en-NG')}`
        )

        return `Sales (last ${daysBack} days): ${data.length} records\nTotal revenue: ₦${totalRevenue.toLocaleString('en-NG')} | Profit: ₦${totalProfit.toLocaleString('en-NG')} | Units: ${totalUnits}\n\nTop items:\n${lines.join('\n')}`
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (err: any) {
    return `Tool error: ${err.message}`
  }
}

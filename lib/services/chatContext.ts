import { createAdminClient } from '@/lib/supabase/admin'
import dayjs from 'dayjs'

export interface ChatContext {
  snapshot:  string   // formatted text injected into system prompt
  fetchedAt: string
}

export async function buildChatContext(userId: string): Promise<ChatContext> {
  const admin   = createAdminClient()
  const today   = dayjs().startOf('day').toISOString()
  const in7days = dayjs().add(7, 'day').endOf('day').toISOString()

  // Fetch all context in parallel
  const [
    profileRes,
    damageRes,
    expiringRes,
    approvalRes,
    lcRes,
    resolutionRes,
    salesRes,
    alertRes,
  ] = await Promise.allSettled([
    // User profile + role
    admin.from('profiles').select('full_name, role:roles(name)').eq('id', userId).single(),

    // Damage: pending count, today count, today loss value
    admin.from('damage_records')
      .select('status, estimated_value_lost, reported_at')
      .gte('reported_at', today),

    // Expiring: items within next 7 days
    admin.from('inventory_items')
      .select('id, expiry_date, quantity, selling_price, product:products(name)')
      .lte('expiry_date', in7days)
      .gte('expiry_date', dayjs().startOf('day').toISOString())
      .in('pipeline_stage', ['logged', 'damage_reported', 'expiry_reported']),

    // Approval queue
    admin.from('inventory_items')
      .select('id, selling_price, original_price, quantity')
      .eq('pipeline_stage', 'resolution_received'),

    // Loss control pending
    admin.from('inventory_items')
      .select('id')
      .in('pipeline_stage', ['damage_reported', 'expiry_reported', 'discount_reported']),

    // Resolution queue
    admin.from('inventory_items')
      .select('id')
      .in('pipeline_stage', ['sent_to_loss_control', 'sent_to_resolution']),

    // Today's sales (if table exists)
    admin.from('sales_records')
      .select('total_amount, profit')
      .gte('sale_date', today),

    // Active alert rules
    admin.from('automated_alerts')
      .select('id, name, is_active')
      .eq('is_active', true),
  ])

  // ── Extract values safely ────────────────────────────────
  const profile      = profileRes.status === 'fulfilled' ? profileRes.value.data : null
  const roleName     = (profile?.role as any)?.name ?? 'unknown'
  const userName     = profile?.full_name ?? 'User'

  const damageRows   = damageRes.status === 'fulfilled' ? (damageRes.value.data ?? []) : []
  const todayDamage  = damageRows.length
  const todayPending = damageRows.filter((r: any) => r.status === 'pending').length
  const todayLoss    = damageRows.reduce((s: number, r: any) => s + Number(r.estimated_value_lost ?? 0), 0)

  const expiringRows = expiringRes.status === 'fulfilled' ? (expiringRes.value.data ?? []) : []
  const critical     = expiringRows.filter((i: any) => dayjs(i.expiry_date).diff(dayjs(), 'day') <= 2)
  const warning      = expiringRows.filter((i: any) => {
    const d = dayjs(i.expiry_date).diff(dayjs(), 'day'); return d > 2 && d <= 7
  })

  const approvalRows = approvalRes.status === 'fulfilled' ? (approvalRes.value.data ?? []) : []
  const approvalLoss = approvalRows.reduce((s: number, r: any) => {
    const orig = Number(r.original_price ?? r.selling_price)
    const curr = Number(r.selling_price)
    return s + (orig - curr) * Number(r.quantity)
  }, 0)

  const lcPending    = lcRes.status === 'fulfilled' ? (lcRes.value.data?.length ?? 0) : 0
  const resPending   = resolutionRes.status === 'fulfilled' ? (resolutionRes.value.data?.length ?? 0) : 0

  const salesRows    = salesRes.status === 'fulfilled' ? (salesRes.value.data ?? []) : []
  const todaySales   = salesRows.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0)
  const todayProfit  = salesRows.reduce((s: number, r: any) => s + Number(r.profit ?? 0), 0)

  const activeAlerts = alertRes.status === 'fulfilled' ? (alertRes.value.data?.length ?? 0) : 0

  const now = dayjs().format('dddd, D MMMM YYYY [at] HH:mm')

  // ── Build snapshot text ──────────────────────────────────
  const snapshot = `
You are a smart business assistant for Foodco Arulogun, a retail supermarket in Nigeria.
You are embedded inside their internal operations dashboard.

Current date/time: ${now}
Logged-in user: ${userName} (role: ${roleName.replace(/_/g, ' ')})

=== TODAY'S SNAPSHOT ===

DAMAGE:
- Damage records logged today: ${todayDamage}
- Pending approval: ${todayPending}
- Estimated value lost today: ₦${todayLoss.toLocaleString('en-NG')}

EXPIRY WATCH:
- Items expiring within 2 days (CRITICAL): ${critical.length}
- Items expiring within 3–7 days (WARNING): ${warning.length}
${critical.length > 0 ? `- Critical items: ${critical.slice(0, 5).map((i: any) => (i.product as any)?.name ?? 'Unknown').join(', ')}${critical.length > 5 ? ` and ${critical.length - 5} more` : ''}` : ''}

PIPELINE:
- Awaiting Loss Control action: ${lcPending} items
- Awaiting Resolution entry: ${resPending} items
- Awaiting Management Approval: ${approvalRows.length} items (potential loss: ₦${approvalLoss.toLocaleString('en-NG')})

SALES (today):
- Total sales: ${todaySales > 0 ? `₦${todaySales.toLocaleString('en-NG')}` : 'No data yet'}
- Profit: ${todayProfit > 0 ? `₦${todayProfit.toLocaleString('en-NG')}` : 'No data yet'}

ALERTS:
- Active alert rules: ${activeAlerts}

=== HOW TO USE THIS ASSISTANT ===
Answer questions about the store's current operational data shown above.
When asked about trends or history not in the snapshot, say so clearly.
Always use ₦ for Nigerian Naira. Be concise and direct.
If the user asks you to take an action (submit damage, approve items, etc.), explain that you are read-only — they need to use the relevant page.
`.trim()

  return { snapshot, fetchedAt: new Date().toISOString() }
}

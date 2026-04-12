import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/services/email'

// All team-lead roles — used for operational notifications (damage, discount, expiry)
export const TEAM_LEAD_ROLES = [
  'grocery_team_lead',
  'toiletries_team_lead',
  'cashier_team_lead',
  '3f_team_lead',
] as const

interface NotifyPayload {
  title:         string
  message:       string
  type:          string
  entity_id?:    string | null
  entity_label?: string | null
  action_url?:   string
}

// Resolve the live app URL for email links (works in both Vercel and local)
function appUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? ''
  if (configured && !configured.includes('localhost')) return configured
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return configured || 'https://foodco-arulogun.vercel.app'
}

function buildNotificationEmail(payload: NotifyPayload): { subject: string; html: string } {
  const isEscalation = payload.type.includes('escalated')
  const headerColor  = isEscalation ? '#D32F2F' : '#2E7D32'
  const badgeColor   = isEscalation ? '#D32F2F' : '#FFC107'
  const badgeText    = isEscalation ? 'ESCALATION — ACTION REQUIRED' : 'ACTION REQUIRED'
  const actionHref   = `${appUrl()}${payload.action_url ?? '/inventory'}`
  const now          = new Date().toLocaleString('en-NG')

  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:'Open Sans',Arial,sans-serif;background:#F5F5F5;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">
<table width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
  <tr><td style="background:#2E7D32;padding:20px 28px;">
    <div style="color:#FFC107;font-size:20px;font-weight:800;">FOODCO ARULOGUN</div>
    <div style="color:rgba(255,255,255,0.7);font-size:11px;margin-top:2px;">RETAIL COMMAND SYSTEM — STAFF NOTIFICATION</div>
  </td></tr>
  <tr><td style="background:${headerColor};padding:10px 28px;">
    <span style="background:${badgeColor};color:#1a1a1a;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;">${badgeText}</span>
  </td></tr>
  <tr><td style="padding:28px 28px 20px;">
    <div style="font-size:17px;font-weight:700;color:#1B5E20;margin-bottom:10px;">${payload.title}</div>
    <div style="font-size:14px;color:#444;line-height:1.6;">${payload.message}</div>
    ${payload.entity_label ? `<div style="margin-top:12px;padding:10px 14px;background:#F1F8E9;border-left:4px solid #2E7D32;border-radius:4px;font-size:13px;color:#2E7D32;font-weight:600;">Item: ${payload.entity_label}</div>` : ''}
  </td></tr>
  <tr><td style="padding:0 28px 28px;">
    <a href="${actionHref}" style="display:inline-block;background:#2E7D32;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700;">View in System →</a>
  </td></tr>
  <tr><td style="background:#F5F5F5;padding:12px 28px;">
    <span style="color:#aaa;font-size:11px;">Foodco Arulogun · ${now} · Do not reply to this email</span>
  </td></tr>
</table></td></tr></table></body></html>`

  return {
    subject: `[Foodco] ${payload.title}${payload.entity_label ? ` — ${payload.entity_label}` : ''}`,
    html,
  }
}

/** Notify all active users with a given role name. Fire-and-forget safe. */
export async function notifyRoleUsers(role: string, payload: NotifyPayload) {
  const admin = createAdminClient()

  // Resolve role_id from name
  const { data: roleRow } = await admin
    .from('roles')
    .select('id')
    .eq('name', role)
    .single()

  if (!roleRow) return

  // Fetch all active profiles with that role
  const { data: users } = await admin
    .from('profiles')
    .select('id')
    .eq('role_id', roleRow.id)
    .eq('is_active', true)

  if (!users?.length) return

  const userIds = users.map(u => u.id)

  // Insert in-app notifications
  const rows = userIds.map(id => ({
    user_id:      id,
    title:        payload.title,
    message:      payload.message,
    type:         payload.type,
    entity_id:    payload.entity_id ?? null,
    entity_label: payload.entity_label ?? null,
    action_url:   payload.action_url ?? '/inventory',
  }))

  await admin.from('notifications').insert(rows)

  // Send email to each user — get emails from auth.users
  try {
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const emails = authUsers
      .filter(u => userIds.includes(u.id) && u.email)
      .map(u => u.email as string)

    if (emails.length) {
      const { subject, html } = buildNotificationEmail(payload)
      // Send directly to role recipients — outlet (EMAIL_FROM) must not be copied
      await sendEmail({ to: emails, subject, html })
    }
  } catch {
    // Email failure must not break in-app notifications
  }
}

/** Notify a single user by their profile ID. Used for leave request decisions. */
export async function notifyUser(userId: string, payload: NotifyPayload) {
  const admin = createAdminClient()

  await admin.from('notifications').insert({
    user_id:      userId,
    title:        payload.title,
    message:      payload.message,
    type:         payload.type,
    entity_id:    payload.entity_id ?? null,
    entity_label: payload.entity_label ?? null,
    action_url:   payload.action_url ?? '/roster',
  })

  try {
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const user = authUsers.find(u => u.id === userId && u.email)
    if (user?.email) {
      const { subject, html } = buildNotificationEmail(payload)
      await sendEmail({ to: [user.email], subject, html })
    }
  } catch {
    // email failure must not break in-app notification
  }
}

/** Notify ALL active staff users. Used for roster publication and broadcast announcements. */
export async function notifyAllActiveUsers(payload: NotifyPayload) {
  const admin = createAdminClient()

  const { data: users } = await admin
    .from('profiles')
    .select('id')
    .eq('is_active', true)

  if (!users?.length) return

  const userIds = users.map(u => u.id)

  const rows = userIds.map(id => ({
    user_id:      id,
    title:        payload.title,
    message:      payload.message,
    type:         payload.type,
    entity_id:    payload.entity_id ?? null,
    entity_label: payload.entity_label ?? null,
    action_url:   payload.action_url ?? '/roster',
  }))

  await admin.from('notifications').insert(rows)

  try {
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const emails = authUsers
      .filter(u => userIds.includes(u.id) && u.email)
      .map(u => u.email as string)

    if (emails.length) {
      const { subject, html } = buildNotificationEmail(payload)
      // BCC all recipients so no one sees each other's address
      await sendEmail({ to: process.env.EMAIL_FROM!, bcc: emails, subject, html })
    }
  } catch {
    // Email failure must not break in-app notifications
  }
}

/** Run time-based escalation checks for damage, discount, and expiry items.
 *  Called from the cron endpoint every hour. */
export async function runEscalationCheck(): Promise<{ escalated: number }> {
  const admin = createAdminClient()
  let escalated = 0

  const now              = new Date()
  const sixHoursAgo      = new Date(now.getTime() - 6  * 60 * 60 * 1000).toISOString()
  const twentyFourHrsAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // Stages that mean "already actioned — stop escalating"
  const RESOLVED_STAGES = ['sent_to_loss_control', 'sent_to_resolution', 'resolution_received', 'sales_approved', 'sold']

  // ── 1. Damage: pending records ────────────────────────────
  const { data: pendingDamage } = await admin
    .from('damage_records')
    .select('inventory_item_id, reported_at, inventory_item:inventory_items(pipeline_stage, product:products(name))')
    .eq('status', 'pending')

  for (const rec of pendingDamage ?? []) {
    const itemId   = rec.inventory_item_id
    const itemName = (rec.inventory_item as any)?.product?.name ?? 'Unknown'
    const stage    = (rec.inventory_item as any)?.pipeline_stage as string | null
    if (!itemId) continue
    // Skip if already sent to loss control or beyond
    if (stage && RESOLVED_STAGES.includes(stage)) continue

    if (rec.reported_at < sixHoursAgo) {
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', itemId)
        .eq('type', 'damage_escalated_supervisor')

      if (!count) {
        await notifyRoleUsers('supervisor', {
          title:        'Damage Escalation — No Action (6h)',
          message:      `${itemName} — damage reported over 6 hours ago with no action. Please ensure it is sent to loss control.`,
          type:         'damage_escalated_supervisor',
          entity_id:    itemId,
          entity_label: itemName,
        })
        escalated++
      }
    }

    if (rec.reported_at < twentyFourHrsAgo) {
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', itemId)
        .eq('type', 'damage_escalated_manager')

      if (!count) {
        await notifyRoleUsers('manager', {
          title:        'Damage Escalation — Unresolved 24h',
          message:      `${itemName} — damage unresolved for 24+ hours. Immediate management action required.`,
          type:         'damage_escalated_manager',
          entity_id:    itemId,
          entity_label: itemName,
        })
        escalated++
      }
    }
  }

  // ── 2. Discount: active, awaiting approval ────────────────
  const { data: pendingDiscounts } = await admin
    .from('discounts')
    .select('inventory_item_id, created_at, inventory_item:inventory_items(pipeline_stage, product:products(name))')
    .eq('status', 'active')
    .is('approved_by', null)

  for (const disc of pendingDiscounts ?? []) {
    const itemId   = disc.inventory_item_id
    const itemName = (disc.inventory_item as any)?.product?.name ?? 'Unknown'
    const stage    = (disc.inventory_item as any)?.pipeline_stage as string | null
    if (!itemId) continue
    // Skip if already sent to loss control or beyond
    if (stage && RESOLVED_STAGES.includes(stage)) continue

    if (disc.created_at < sixHoursAgo) {
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', itemId)
        .eq('type', 'discount_escalated_supervisor')

      if (!count) {
        await notifyRoleUsers('supervisor', {
          title:        'Discount Escalation — Pending Approval (6h)',
          message:      `${itemName} — discount pending approval for 6+ hours. Please review.`,
          type:         'discount_escalated_supervisor',
          entity_id:    itemId,
          entity_label: itemName,
        })
        escalated++
      }
    }

    if (disc.created_at < twentyFourHrsAgo) {
      const { count } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', itemId)
        .eq('type', 'discount_escalated_manager')

      if (!count) {
        await notifyRoleUsers('manager', {
          title:        'Discount Escalation — 24h Unapproved',
          message:      `${itemName} — discount unapproved for 24+ hours. Immediate action required.`,
          type:         'discount_escalated_manager',
          entity_id:    itemId,
          entity_label: itemName,
        })
        escalated++
      }
    }
  }

  // ── 3. Expiry: items expiring within 7 days ───────────────
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: expiringItems } = await admin
    .from('inventory_items')
    .select('id, expiry_date, pipeline_stage, product:products(name)')
    .eq('status', 'active')
    .lte('expiry_date', sevenDaysFromNow)
    .not('pipeline_stage', 'in', '("sent_to_loss_control","resolution_received","sales_approved","sold")')

  for (const item of expiringItems ?? []) {
    const itemName = (item.product as any)?.name ?? 'Unknown'

    // Send initial team_lead notification if not yet sent
    const { count: tlCount } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('entity_id', item.id)
      .eq('type', 'expiry_warning')

    if (!tlCount) {
      const daysLeft = Math.ceil((new Date(item.expiry_date).getTime() - now.getTime()) / 86400000)
      for (const role of TEAM_LEAD_ROLES) {
        await notifyRoleUsers(role, {
          title:        'Expiry Warning — Action Required',
          message:      `${itemName} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Send to loss control if not already done.`,
          type:         'expiry_warning',
          entity_id:    item.id,
          entity_label: itemName,
        })
      }
      escalated++
      continue
    }

    // Escalate if initial warning was sent > 6h ago
    const { data: firstNotif } = await admin
      .from('notifications')
      .select('created_at')
      .eq('entity_id', item.id)
      .eq('type', 'expiry_warning')
      .order('created_at', { ascending: true })
      .limit(1)
      .single()

    if (!firstNotif) continue

    if (firstNotif.created_at < sixHoursAgo) {
      const { count: supCount } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', item.id)
        .eq('type', 'expiry_escalated_supervisor')

      if (!supCount) {
        await notifyRoleUsers('supervisor', {
          title:        'Expiry Escalation — No Action (6h)',
          message:      `${itemName} — expiry warning sent 6+ hours ago with no action. Please follow up.`,
          type:         'expiry_escalated_supervisor',
          entity_id:    item.id,
          entity_label: itemName,
        })
        escalated++
      }
    }

    if (firstNotif.created_at < twentyFourHrsAgo) {
      const { count: mgrCount } = await admin
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('entity_id', item.id)
        .eq('type', 'expiry_escalated_manager')

      if (!mgrCount) {
        await notifyRoleUsers('manager', {
          title:        'Expiry Escalation — 24h Unresolved',
          message:      `${itemName} — expiry warning unresolved for 24+ hours. Immediate action required.`,
          type:         'expiry_escalated_manager',
          entity_id:    item.id,
          entity_label: itemName,
        })
        escalated++
      }
    }
  }

  return { escalated }
}

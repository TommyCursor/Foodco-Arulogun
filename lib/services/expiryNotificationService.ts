import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/services/email'

// ─── Category → team roles mapping ───────────────────────────────────────────
const CATEGORY_ROLES: Record<string, string[]> = {
  'Grocery':         ['grocery_associate', 'grocery_team_lead'],
  'Fresh Food':      ['grocery_associate', 'grocery_team_lead'],
  'Household':       ['grocery_associate', 'grocery_team_lead'],
  'Toiletries':      ['toiletries_associate', 'toiletries_team_lead'],
  'Baby':            ['toiletries_associate', 'toiletries_team_lead'],
  'Health & Beauty': ['toiletries_associate', 'toiletries_team_lead'],
  '3F':              ['3f_associate', '3f_team_lead'],
  'Cashier':         ['cashier', 'cashier_team_lead', 'cashier_supervisor'],
}

// These roles always receive a BCC copy regardless of category (no cashier_supervisor, no admin)
const OVERSIGHT_ROLES = ['supervisor', 'manager']

// ─── Notification thresholds (days before expiry) ────────────────────────────
export const THRESHOLDS = [
  { key: '90d', days: 90, label: '3-Month First Report',   urgency: 'info'     },
  { key: '60d', days: 60, label: '2-Month Reminder',       urgency: 'info'     },
  { key: '30d', days: 30, label: '1-Month Final Monthly',  urgency: 'warning'  },
  { key: '4w',  days: 28, label: '4-Week Warning',         urgency: 'warning'  },
  { key: '3w',  days: 21, label: '3-Week Warning',         urgency: 'warning'  },
  { key: '2w',  days: 14, label: '2-Week Alert',           urgency: 'critical' },
  { key: '1w',  days:  7, label: '1-Week Final Alert',     urgency: 'critical' },
] as const

type ThresholdKey = typeof THRESHOLDS[number]['key']

// ─── Resolve app URL ──────────────────────────────────────────────────────────
function appUrl(): string {
  const c = process.env.NEXT_PUBLIC_APP_URL ?? ''
  if (c && !c.includes('localhost')) return c
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return c || 'https://foodco-arulogun.vercel.app'
}

// ─── Build expiry alert email HTML ───────────────────────────────────────────
function buildExpiryAlertEmail(opts: {
  threshold: typeof THRESHOLDS[number]
  items:     { name: string; qty: number; price: number; expiry: string; daysLeft: number }[]
  category:  string
}): { subject: string; html: string } {
  const { threshold, items, category } = opts
  const isCritical = threshold.urgency === 'critical'
  const headerBg   = isCritical ? '#B71C1C' : threshold.urgency === 'warning' ? '#E65100' : '#1B5E20'
  const badgeBg    = isCritical ? '#FF1744' : threshold.urgency === 'warning' ? '#FF6D00' : '#FFC107'
  const badgeText  = isCritical ? '#FFFFFF' : '#1a1a1a'
  const totalValue = items.reduce((s, i) => s + i.qty * i.price, 0)
  const actionUrl  = `${appUrl()}/expiring`
  const now        = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })

  const rows = items.map((i, idx) => `
    <tr style="background:${idx % 2 === 0 ? '#fff' : '#F9FBE7'}">
      <td style="padding:8px 12px;font-size:12px;border-bottom:1px solid #f0f0f0;">${i.name}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:center;border-bottom:1px solid #f0f0f0;">${i.qty}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0;">₦${i.price.toLocaleString()}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:right;border-bottom:1px solid #f0f0f0;font-weight:700;color:#D32F2F;">₦${(i.qty * i.price).toLocaleString()}</td>
      <td style="padding:8px 12px;font-size:12px;text-align:center;border-bottom:1px solid #f0f0f0;">
        <span style="background:${isCritical ? '#FFEBEE' : '#FFF3E0'};color:${isCritical ? '#C62828' : '#E65100'};padding:2px 8px;border-radius:12px;font-weight:700;font-size:11px;">
          ${i.daysLeft <= 0 ? 'EXPIRED' : `${i.daysLeft}d left`}
        </span>
      </td>
    </tr>`).join('')

  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:'Open Sans',Arial,sans-serif;background:#F5F5F5;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background:#2E7D32;padding:20px 28px;">
    <div style="color:#FFC107;font-size:20px;font-weight:800;">FOODCO ARULOGUN</div>
    <div style="color:rgba(255,255,255,0.7);font-size:11px;margin-top:2px;">EXPIRY MANAGEMENT ALERT</div>
  </td></tr>

  <!-- Threshold banner -->
  <tr><td style="background:${headerBg};padding:12px 28px;display:flex;align-items:center;gap:10px;">
    <span style="background:${badgeBg};color:${badgeText};padding:4px 14px;border-radius:20px;font-size:12px;font-weight:800;letter-spacing:0.5px;">
      ${threshold.label.toUpperCase()}
    </span>
    <span style="color:rgba(255,255,255,0.85);font-size:12px;margin-left:10px;">
      ${category} Department
    </span>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:24px 28px 16px;">
    <div style="font-size:16px;font-weight:700;color:#1B5E20;margin-bottom:8px;">
      ${threshold.label} — ${category} Department
    </div>
    <div style="font-size:13px;color:#555;line-height:1.7;margin-bottom:18px;">
      The following items in the <strong>${category}</strong> section are approaching their expiry date.
      This is your <strong>${threshold.label}</strong> notification as per the loss control schedule.
      Please take the necessary steps to ensure these items are prioritised, reported, or escalated.
    </div>

    <!-- Items table -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;margin-bottom:16px;">
      <thead>
        <tr style="background:#2E7D32;">
          <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:left;">Product</th>
          <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:center;">Qty</th>
          <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:right;">Unit Price</th>
          <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:right;">Value at Risk</th>
          <th style="padding:10px 12px;color:#fff;font-size:12px;text-align:center;">Days Left</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#E8F5E9;">
          <td colspan="3" style="padding:10px 12px;font-size:13px;font-weight:700;color:#1B5E20;">Total at Risk</td>
          <td style="padding:10px 12px;font-size:14px;font-weight:800;color:#C62828;text-align:right;">₦${totalValue.toLocaleString()}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding:0 28px 24px;">
    <a href="${actionUrl}" style="display:inline-block;background:#2E7D32;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:700;">
      View About to Expire →
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#F5F5F5;padding:12px 28px;">
    <span style="color:#aaa;font-size:11px;">Foodco Arulogun · ${now} · Automated Expiry Alert · Do not reply</span>
  </td></tr>

</table></td></tr></table></body></html>`

  return {
    subject: `[${threshold.label.toUpperCase()}] ${items.length} item${items.length > 1 ? 's' : ''} expiring — ${category} dept`,
    html,
  }
}

// ─── Main service function ────────────────────────────────────────────────────
export async function runExpiryNotifications(): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const admin  = createAdminClient()
  const errors: string[] = []
  let sent    = 0
  let skipped = 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Fetch all active/discounted items with expiry dates (up to 95 days away)
  const cutoff = new Date(today.getTime() + 95 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const { data: items, error: itemsError } = await admin
    .from('inventory_items')
    .select(`
      id, quantity, selling_price, expiry_date,
      product:products (name, sku, category_info:categories!category_id (name))
    `)
    .in('status', ['active', 'discounted'])
    .lte('expiry_date', cutoff)
    .order('expiry_date', { ascending: true })

  if (itemsError || !items?.length) return { sent, skipped, errors }

  // Fetch already-sent notifications to avoid duplicates
  const { data: alreadySent } = await admin
    .from('expiry_notifications')
    .select('item_id, threshold')

  const sentSet = new Set((alreadySent ?? []).map(r => `${r.item_id}::${r.threshold}`))

  // Resolve all role → user emails up front (single query)
  const allRoleNames = [...Object.values(CATEGORY_ROLES).flat(), ...OVERSIGHT_ROLES]
  const uniqueRoles  = [...new Set(allRoleNames)]

  const { data: roleRows } = await admin
    .from('roles')
    .select('id, name')
    .in('name', uniqueRoles)

  const roleIdMap: Record<string, number> = {}
  for (const r of roleRows ?? []) roleIdMap[r.name] = r.id

  const { data: profileRows } = await admin
    .from('profiles')
    .select('id, role_id')
    .eq('is_active', true)
    .in('role_id', Object.values(roleIdMap))

  const { data: { users: authUsers } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const emailByUserId: Record<string, string> = {}
  for (const u of authUsers) {
    if (u.email) emailByUserId[u.id] = u.email
  }

  // Helper: get profile IDs for a list of role names
  function profileIdsForRoles(roleNames: string[]): string[] {
    const ids = roleNames.map(r => roleIdMap[r]).filter(Boolean)
    return (profileRows ?? []).filter(p => ids.includes(p.role_id)).map(p => p.id)
  }

  // Helper: get emails for a list of profile IDs
  function emailsForProfileIds(profileIds: string[]): string[] {
    return profileIds.map(id => emailByUserId[id]).filter(Boolean) as string[]
  }

  // Group items by category for batch notifications
  type ItemRow = { id: string; quantity: number; selling_price: number; expiry_date: string; product: any }
  const byCategoryThreshold = new Map<string, { threshold: typeof THRESHOLDS[number]; items: ItemRow[] }>()

  for (const item of items as ItemRow[]) {
    const category  = (item.product?.category_info?.name ?? 'Grocery') as string
    const expiryMs  = new Date(item.expiry_date).getTime()
    const daysLeft  = Math.ceil((expiryMs - today.getTime()) / (1000 * 60 * 60 * 24))

    for (const threshold of THRESHOLDS) {
      // Already sent this threshold for this item — skip
      if (sentSet.has(`${item.id}::${threshold.key}`)) { skipped++; continue }

      // Not yet at this threshold — skip
      if (daysLeft > threshold.days) continue

      const mapKey = `${category}::${threshold.key}`
      if (!byCategoryThreshold.has(mapKey)) {
        byCategoryThreshold.set(mapKey, { threshold, items: [] })
      }
      byCategoryThreshold.get(mapKey)!.items.push(item)
    }
  }

  // For each category+threshold group, send ONE grouped email and in-app notifications
  for (const [mapKey, { threshold, items: groupItems }] of byCategoryThreshold) {
    const category = mapKey.split('::')[0]

    try {
      // Resolve team recipients
      const teamRoles       = CATEGORY_ROLES[category] ?? CATEGORY_ROLES['Grocery']
      const teamProfileIds  = profileIdsForRoles(teamRoles)
      const teamEmails      = emailsForProfileIds(teamProfileIds)

      // Oversight recipients (supervisors/managers)
      const oversightIds    = profileIdsForRoles(OVERSIGHT_ROLES)
      const oversightEmails = emailsForProfileIds(oversightIds)

      // All unique profile IDs for in-app notifications
      const allProfileIds   = [...new Set([...teamProfileIds, ...oversightIds])]

      const itemPayloads = groupItems.map(i => ({
        name:     i.product?.name ?? '—',
        qty:      i.quantity,
        price:    Number(i.selling_price),
        expiry:   i.expiry_date,
        daysLeft: Math.ceil((new Date(i.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
      }))

      const totalValue = itemPayloads.reduce((s, i) => s + i.qty * i.price, 0)
      const title      = `${threshold.label} — ${category} (${groupItems.length} item${groupItems.length > 1 ? 's' : ''})`
      const message    = `${groupItems.length} item${groupItems.length > 1 ? 's' : ''} in ${category} ${groupItems.length > 1 ? 'are' : 'is'} approaching expiry. Total value at risk: ₦${totalValue.toLocaleString()}. Please take action.`

      // ── In-app notifications ──
      if (allProfileIds.length > 0) {
        await admin.from('notifications').insert(
          allProfileIds.map(uid => ({
            user_id:      uid,
            title,
            message,
            type:         'expiry_alert',
            entity_label: `${category} — ${threshold.label}`,
            action_url:   '/expiring',
          }))
        )
      }

      // Oversight emails — exclude anyone already in the team list
      const uniqueOversightEmails = oversightEmails.filter(e => !teamEmails.includes(e))

      // ── Email: team in TO, oversight in BCC ──
      if (teamEmails.length > 0 || uniqueOversightEmails.length > 0) {
        const { subject, html } = buildExpiryAlertEmail({
          threshold, items: itemPayloads, category,
        })
        await sendEmail({
          to:  teamEmails.length > 0 ? teamEmails : uniqueOversightEmails,
          bcc: teamEmails.length > 0 ? uniqueOversightEmails : [],
          subject,
          html,
        })
      }

      // ── Record sent notifications to prevent duplicates ──
      await admin.from('expiry_notifications').upsert(
        groupItems.map(i => ({
          item_id:    i.id,
          threshold:  threshold.key,
          recipients: [...teamEmails, ...uniqueOversightEmails],
        })),
        { onConflict: 'item_id,threshold', ignoreDuplicates: true }
      )

      sent += groupItems.length
    } catch (err: any) {
      errors.push(`${mapKey}: ${err.message}`)
    }
  }

  return { sent, skipped, errors }
}

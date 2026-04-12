import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, buildAlertEmail, buildExpiryIntervalEmail } from '@/lib/services/email'
import type { AutomatedAlert } from '@/types'

// ── Expiry Interval Alert System ─────────────────────────────
// Fires at 7 fixed intervals before/on expiry date.
// Uses expiry_alert_sent table to prevent duplicate sends.
const EXPIRY_INTERVALS = [
  { key: '3_months',  days: 90, label: '3 Months to Expiry'  },
  { key: '2_months',  days: 60, label: '2 Months to Expiry'  },
  { key: '1_month',   days: 30, label: '1 Month to Expiry'   },
  { key: '3_weeks',   days: 21, label: '3 Weeks to Expiry'   },
  { key: '2_weeks',   days: 14, label: '2 Weeks to Expiry'   },
  { key: '1_week',    days:  7, label: '1 Week to Expiry'    },
  { key: 'on_expiry', days:  0, label: 'Items Expired Today' },
]

export async function runExpiryIntervalAlerts(): Promise<{ intervals_checked: number; emails_sent: number }> {
  const supabase = createAdminClient()
  const today    = new Date()
  today.setHours(0, 0, 0, 0)
  let emailsSent = 0

  // Fetch configured recipients from system_settings
  const { data: settings } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'expiry_alert_recipients')
    .single()
  const recipients: string[] = settings?.value?.emails ?? []

  for (const interval of EXPIRY_INTERVALS) {
    const targetDate = new Date(today)
    targetDate.setDate(targetDate.getDate() + interval.days)
    const targetStr  = targetDate.toISOString().split('T')[0]

    // Items expiring on this target date
    const { data: items } = await supabase
      .from('inventory_items')
      .select(`
        id, batch_number, quantity, expiry_date, location,
        product:products(name, sku),
        logged_by:profiles!inventory_items_created_by_fkey(full_name)
      `)
      .in('status', ['active', 'discounted'])
      .eq('expiry_date', targetStr)

    if (!items?.length) continue

    // Find which have already been notified for this interval
    const itemIds = items.map((i: any) => i.id)
    const { data: alreadySent } = await supabase
      .from('expiry_alert_sent')
      .select('inventory_item_id')
      .in('inventory_item_id', itemIds)
      .eq('interval_key', interval.key)

    const sentIds  = new Set((alreadySent ?? []).map((s: any) => s.inventory_item_id))
    const toNotify = items.filter((i: any) => !sentIds.has(i.id))
    if (!toNotify.length) continue

    // Send email if recipients are configured
    if (recipients.length > 0) {
      const { subject, html } = buildExpiryIntervalEmail(
        interval.label,
        toNotify.map((i: any) => ({
          itemName:   i.product?.name ?? 'Unknown',
          sku:        i.product?.sku,
          quantity:   i.quantity,
          expiryDate: i.expiry_date,
          location:   i.location,
          loggedBy:   i.logged_by?.full_name,
        }))
      )
      await sendEmail({ to: recipients, subject, html })
      emailsSent++
    }

    // Mark as sent to prevent duplicates on next cron run
    await supabase.from('expiry_alert_sent').insert(
      toNotify.map((i: any) => ({ inventory_item_id: i.id, interval_key: interval.key }))
    )
  }

  return { intervals_checked: EXPIRY_INTERVALS.length, emails_sent: emailsSent }
}

// ── Build AI-style message for an alert ──────────────────────
function buildAlertMessage(alert: AutomatedAlert, matchedItems: any[]): string {
  const condition = alert.trigger_condition

  if (condition.type === 'days_to_expiry') {
    const totalValue = matchedItems.reduce((s: number, i: any) => s + i.quantity * Number(i.selling_price), 0)
    return `🚨 ALERT: ${matchedItems.length} item${matchedItems.length > 1 ? 's are' : ' is'} expiring within ${condition.value} days.\n\n` +
      matchedItems.slice(0, 5).map((i: any) =>
        `• ${i.product?.name ?? 'Unknown'} — ${i.quantity} units, expires ${new Date(i.expiry_date).toLocaleDateString('en-NG')} (${i.location ?? 'No location'})`
      ).join('\n') +
      `${matchedItems.length > 5 ? `\n...and ${matchedItems.length - 5} more items` : ''}\n\n` +
      `Total value at risk: ₦${totalValue.toLocaleString()}\n\n` +
      `Recommended Action: Move to front of shelf and apply tiered discounts immediately.`
  }

  if (condition.type === 'damage_value_exceeds') {
    const totalLoss = matchedItems.reduce((s: number, r: any) => s + Number(r.estimated_value_lost), 0)
    return `🚨 ALERT: Damage value has exceeded ₦${Number(condition.value).toLocaleString()} threshold.\n\n` +
      `Total unresolved damage: ₦${totalLoss.toLocaleString()} across ${matchedItems.length} record(s).\n\n` +
      `Action Required: Review and approve pending damage records.`
  }

  if (condition.type === 'discount_effectiveness_below') {
    return `🚨 ALERT: Discount effectiveness has dropped below ${condition.value}%.\n\n` +
      `${matchedItems.length} active discount(s) are underperforming.\n\n` +
      `Consider: Increasing discount percentage or promoting via SMS to loyalty customers.`
  }

  return `Alert "${alert.name}" was triggered. Please log in to review.`
}

// ── Check a single alert rule ────────────────────────────────
async function checkAlert(alert: AutomatedAlert): Promise<boolean> {
  const supabase = createAdminClient()
  const condition = alert.trigger_condition
  let matchedItems: any[] = []

  if (condition.type === 'days_to_expiry') {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + Number(condition.value))

    let query = supabase
      .from('inventory_items')
      .select('*, product:products(name, sku, category:categories(name))')
      .in('status', ['active', 'discounted'])
      .lte('expiry_date', cutoff.toISOString().split('T')[0])
      .gte('expiry_date', new Date().toISOString().split('T')[0])

    if (condition.category_id) {
      query = query.eq('product.category_id', condition.category_id)
    }

    const { data } = await query
    matchedItems = data ?? []
  }

  else if (condition.type === 'damage_value_exceeds') {
    const { data } = await supabase
      .from('damage_records')
      .select('*')
      .eq('status', 'pending')

    const total = (data ?? []).reduce((s, r) => s + Number(r.estimated_value_lost), 0)
    if (total >= Number(condition.value)) matchedItems = data ?? []
  }

  else if (condition.type === 'discount_effectiveness_below') {
    const { data } = await supabase
      .from('discounts')
      .select('*')
      .eq('status', 'active')
      .gt('units_sold', 0)

    const under = (data ?? []).filter(d => {
      const potential = d.units_sold * Number(d.original_price)
      const rate = potential > 0 ? (Number(d.revenue_recovered) / potential) * 100 : 0
      return rate < Number(condition.value)
    })
    matchedItems = under
  }

  if (matchedItems.length === 0) return false

  // Build message
  const message = buildAlertMessage(alert, matchedItems)

  // Log the alert
  await supabase.from('alert_logs').insert({
    alert_id:            alert.id,
    triggered_at:        new Date().toISOString(),
    message_sent:        message,
    channels_used:       alert.channels,
    recipients_notified: alert.recipients,
    status:              'sent',
  })

  // Send notifications
  if (alert.channels.includes('email') && alert.recipients.emails?.length) {
    const { subject, html } = buildAlertEmail({
      alertName:   alert.name,
      message:     message.replace(/\n/g, '<br>'),
      triggeredAt: new Date().toISOString(),
      recipients:  alert.recipients.emails,
    })
    await sendEmail({ to: alert.recipients.emails, subject, html })
  }

  if (alert.channels.includes('sms') && alert.recipients.phones?.length) {
    // Africa's Talking SMS (imported dynamically to avoid build errors without credentials)
    try {
      const { default: AfricasTalking } = await import('africastalking')
      const at  = AfricasTalking({ apiKey: process.env.AT_API_KEY!, username: process.env.AT_USERNAME! })
      const sms = at.SMS
      await sms.send({
        to:      alert.recipients.phones,
        message: message.slice(0, 160), // SMS limit
        from:    process.env.AT_SENDER_ID,
      })
    } catch {
      console.warn('SMS send failed — Africa\'s Talking not configured')
    }
  }

  return true
}

// ── Run all active alerts ────────────────────────────────────
export async function runAllAlertChecks(): Promise<{ checked: number; triggered: number }> {
  const supabase = createAdminClient()

  const { data: alerts } = await supabase
    .from('automated_alerts')
    .select('*')
    .eq('is_active', true)

  if (!alerts?.length) return { checked: 0, triggered: 0 }

  let triggered = 0
  for (const alert of alerts) {
    const wasTriggered = await checkAlert(alert as AutomatedAlert)
    if (wasTriggered) triggered++
  }

  return { checked: alerts.length, triggered }
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAllAlertChecks, runExpiryIntervalAlerts } from '@/lib/services/alertChecker'
import { runExpiryNotifications } from '@/lib/services/expiryNotificationService'
import { runEscalationCheck, notifyRoleUsers, notifyAllActiveUsers } from '@/lib/services/notificationService'
import {
  generateExpiryReport, generateDamageReport,
  generateDiscountReport, generateComprehensiveReport,
} from '@/lib/services/excel'
import { buildReportEmail, sendEmail } from '@/lib/services/email'
import { autoGenerateRoster, publishUpcomingRoster } from '@/lib/services/rosterService'

// POST /api/cron
// Called by Supabase pg_cron or an external scheduler (e.g. Vercel Cron)
// Secured with CRON_SECRET env variable
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results: Record<string, unknown> = {}

  // ── 1. Run rule-based alert checks ───────────────────────
  try {
    results.alerts = await runAllAlertChecks()
  } catch (err: any) {
    results.alerts = { error: err.message }
  }

  // ── 2. Run automated expiry interval alerts ───────────────
  // Checks 7 intervals: 3mo / 2mo / 1mo / 3wk / 2wk / 1wk / on expiry
  try {
    results.expiry_intervals = await runExpiryIntervalAlerts()
  } catch (err: any) {
    results.expiry_intervals = { error: err.message }
  }

  // ── 2b. Run targeted expiry notifications (team + oversight) ──
  // Sends grouped emails + in-app alerts at 90d/60d/30d/4w/3w/2w/1w
  try {
    results.expiry_notifications = await runExpiryNotifications()
  } catch (err: any) {
    results.expiry_notifications = { error: err.message }
  }

  // ── 3. Run in-app escalation checks ──────────────────────
  // Sends in-app notifications: team_lead (0h) → supervisor (6h) → manager (24h)
  try {
    results.escalations = await runEscalationCheck()
  } catch (err: any) {
    results.escalations = { error: err.message }
  }

  // ── 2. Run due scheduled reports ────────────────────────
  try {
    const supabase = createAdminClient()
    const now      = new Date()

    const { data: dueReports } = await supabase
      .from('scheduled_reports')
      .select('*')
      .eq('is_active', true)
      .lte('next_generation', now.toISOString())

    const reportResults = []

    for (const schedule of dueReports ?? []) {
      try {
        // Fetch fresh data
        const [expiryRes, damageRes, discountRes] = await Promise.all([
          supabase.from('inventory_items').select('*, product:products(name, sku, category:categories(name))').in('status', ['active', 'discounted', 'expired']).lte('expiry_date', new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]),
          supabase.from('damage_records').select('*, inventory_item:inventory_items(batch_number, product:products(name, sku)), reporter:profiles!damage_records_reported_by_fkey(full_name)').order('reported_at', { ascending: false }),
          supabase.from('discounts').select('*, inventory_item:inventory_items(batch_number, expiry_date, product:products(name, sku))').order('created_at', { ascending: false }),
        ])

        const expiryData   = expiryRes.data   ?? []
        const damageData   = damageRes.data   ?? []
        const discountData = discountRes.data ?? []

        // Generate Excel
        let buffer: Buffer
        const date     = now.toISOString().split('T')[0]
        const fileName = `Foodco_${schedule.report_type}_${date}.xlsx`

        switch (schedule.report_type) {
          case 'expiry':    buffer = await generateExpiryReport(expiryData);    break
          case 'damage':    buffer = await generateDamageReport(damageData);    break
          case 'discount':  buffer = await generateDiscountReport(discountData); break
          default:          buffer = await generateComprehensiveReport(expiryData, damageData, discountData)
        }

        // Build and send email
        const expiringIn7Days  = expiryData.filter(i => { const d = Math.ceil((new Date(i.expiry_date).getTime() - Date.now()) / 86400000); return d >= 0 && d <= 7 }).length
        const valueAtRisk      = expiryData.filter(i => { const d = Math.ceil((new Date(i.expiry_date).getTime() - Date.now()) / 86400000); return d >= 0 && d <= 7 }).reduce((s, i) => s + i.quantity * Number(i.selling_price), 0)
        const expiredToday     = expiryData.filter(i => new Date(i.expiry_date) < now).length
        const activeDiscounts  = discountData.filter(d => d.status === 'active').length
        const totalDamageLoss  = damageData.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.estimated_value_lost), 0)
        const pendingDamage    = damageData.filter(r => r.status === 'pending').length
        const activeDiscs      = discountData.filter(d => d.status === 'active')
        const discountRecovery = activeDiscs.length > 0 ? Math.round(activeDiscs.reduce((s, d) => { const p = d.units_sold * Number(d.original_price); return s + (p > 0 ? (Number(d.revenue_recovered) / p) * 100 : 0) }, 0) / activeDiscs.length) : 0

        const { subject, html, text } = buildReportEmail({
          reportType: schedule.report_type as any,
          expiringIn7Days, valueAtRisk, expiredToday,
          activeDiscounts, discountRecovery, totalDamageLoss, pendingDamage,
          fileName,
        })

        await sendEmail({
          to: schedule.recipients,
          subject, html, text,
          attachments: [{ filename: fileName, content: buffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
        })

        // Calculate next run (simple: add 24h for daily, 7d for weekly)
        const nextRun = new Date(now)
        if (schedule.schedule_cron.startsWith('0 8 * * *')) nextRun.setDate(nextRun.getDate() + 1)
        else if (schedule.schedule_cron.startsWith('0 9 * * 1')) nextRun.setDate(nextRun.getDate() + 7)
        else nextRun.setDate(nextRun.getDate() + 1)

        await supabase.from('scheduled_reports').update({
          last_generated:  now.toISOString(),
          next_generation: nextRun.toISOString(),
        }).eq('id', schedule.id)

        await supabase.from('report_logs').insert({
          scheduled_report_id: schedule.id,
          report_type:         schedule.report_type,
          generated_at:        now.toISOString(),
          email_sent_to:       schedule.recipients,
          status:              'success',
        })

        reportResults.push({ id: schedule.id, name: schedule.name, status: 'sent' })
      } catch (err: any) {
        await supabase.from('report_logs').insert({
          scheduled_report_id: schedule.id,
          report_type:         schedule.report_type,
          generated_at:        now.toISOString(),
          status:              'failed',
          error_message:       err.message,
        })
        reportResults.push({ id: schedule.id, name: schedule.name, status: 'failed', error: err.message })
      }
    }

    results.reports = reportResults
  } catch (err: any) {
    results.reports = { error: err.message }
  }

  // ── 4. Roster automation ────────────────────────────────────
  try {
    const dayOfWeek = new Date().getDay() // 0=Sun … 6=Sat

    if (dayOfWeek === 4) {
      // Thursday — auto-generate next week's roster
      const { created, rosterId, weekStart } = await autoGenerateRoster()
      if (created && rosterId) {
        const msg = `The roster for week starting ${weekStart} has been auto-generated. Please review and publish before Friday.`
        await Promise.all([
          notifyRoleUsers('supervisor', {
            title:        'Weekly Roster Ready for Review',
            message:      msg,
            type:         'roster_generated',
            entity_id:    rosterId,
            entity_label: `Week of ${weekStart}`,
            action_url:   '/roster',
          }),
          notifyRoleUsers('manager', {
            title:        'Weekly Roster Ready for Review',
            message:      msg,
            type:         'roster_generated',
            entity_id:    rosterId,
            entity_label: `Week of ${weekStart}`,
            action_url:   '/roster',
          }),
        ])
        results.roster = { generated: true, rosterId, weekStart }
      } else {
        results.roster = { generated: false, note: 'Roster already exists', weekStart }
      }
    }

    if (dayOfWeek === 5) {
      // Friday — publish upcoming week's draft roster & notify all staff
      const { published, weekStart, rosterId } = await publishUpcomingRoster()
      if (published && rosterId) {
        await notifyAllActiveUsers({
          title:        'Your Weekly Roster is Ready',
          message:      `The staff roster for week starting ${weekStart} has been published. Check your schedule now.`,
          type:         'roster_published',
          entity_label: `Week of ${weekStart}`,
          action_url:   '/roster',
        })
        results.roster_publish = { published: true, weekStart }
      } else {
        results.roster_publish = { published: false, note: 'No draft roster found for upcoming week', weekStart }
      }
    }
  } catch (err: any) {
    results.roster = { error: err.message }
  }

  return NextResponse.json({ ok: true, timestamp: new Date().toISOString(), results })
}

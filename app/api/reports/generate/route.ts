import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  generateExpiryReport, generateDamageReport,
  generateDiscountReport, generateComprehensiveReport,
} from '@/lib/services/excel'
import { buildReportEmail, sendEmail } from '@/lib/services/email'
import { logAudit } from '@/lib/services/audit'

// POST /api/reports/generate
// Body: { report_type, send_email, recipients, date_from?, date_to? }
export async function POST(req: NextRequest) {
  const supabase      = await createClient()
  const adminSupabase = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body        = await req.json()
  const reportType  = body.report_type as 'damage' | 'expiry' | 'discount' | 'comprehensive'
  const shouldEmail = body.send_email as boolean
  const recipients  = (body.recipients as string[]) ?? []

  // ── Fetch data ──
  const [expiryRes, damageRes, discountRes] = await Promise.all([
    adminSupabase
      .from('inventory_items')
      .select('*, product:products(name, sku, category:categories(name))')
      .in('status', ['active', 'discounted', 'expired'])
      .lte('expiry_date', new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0])
      .order('expiry_date'),

    adminSupabase
      .from('damage_records')
      .select('*, inventory_item:inventory_items(batch_number, quantity, selling_price, product:products(name, sku)), reporter:profiles!damage_records_reported_by_fkey(full_name), approver:profiles!damage_records_approved_by_fkey(full_name)')
      .order('reported_at', { ascending: false }),

    adminSupabase
      .from('discounts')
      .select('*, inventory_item:inventory_items(batch_number, quantity, selling_price, expiry_date, product:products(name, sku)), applicant:profiles!discounts_applied_by_fkey(full_name), approver:profiles!discounts_approved_by_fkey(full_name)')
      .order('created_at', { ascending: false }),
  ])

  const expiryData   = expiryRes.data   ?? []
  const damageData   = damageRes.data   ?? []
  const discountData = discountRes.data ?? []

  // ── Generate Excel ──
  let buffer: Buffer
  let fileName: string

  const date = new Date().toISOString().split('T')[0]

  switch (reportType) {
    case 'expiry':
      buffer   = await generateExpiryReport(expiryData)
      fileName = `Foodco_Expiry_Report_${date}.xlsx`
      break
    case 'damage':
      buffer   = await generateDamageReport(damageData)
      fileName = `Foodco_Damage_Report_${date}.xlsx`
      break
    case 'discount':
      buffer   = await generateDiscountReport(discountData)
      fileName = `Foodco_Discount_Report_${date}.xlsx`
      break
    case 'comprehensive':
    default:
      buffer   = await generateComprehensiveReport(expiryData, damageData, discountData)
      fileName = `Foodco_Comprehensive_Report_${date}.xlsx`
  }

  // ── Log the report ──
  await adminSupabase.from('report_logs').insert({
    report_type:   reportType,
    generated_at:  new Date().toISOString(),
    generated_by:  user.id,
    email_sent_to: shouldEmail ? recipients : [],
    status:        'success',
  })

  // ── Send email if requested ──
  if (shouldEmail && recipients.length > 0) {
    const expiringIn7Days  = expiryData.filter(i => {
      const d = Math.ceil((new Date(i.expiry_date).getTime() - Date.now()) / 86400000)
      return d >= 0 && d <= 7
    }).length
    const valueAtRisk      = expiryData
      .filter(i => { const d = Math.ceil((new Date(i.expiry_date).getTime() - Date.now()) / 86400000); return d >= 0 && d <= 7 })
      .reduce((s, i) => s + i.quantity * Number(i.selling_price), 0)
    const expiredToday     = expiryData.filter(i => new Date(i.expiry_date) < new Date()).length
    const activeDiscounts  = discountData.filter(d => d.status === 'active').length
    const totalDamageLoss  = damageData.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.estimated_value_lost), 0)
    const pendingDamage    = damageData.filter(r => r.status === 'pending').length
    const activeDiscs      = discountData.filter(d => d.status === 'active')
    const discountRecovery = activeDiscs.length > 0
      ? Math.round(activeDiscs.reduce((s, d) => {
          const p = d.units_sold * Number(d.original_price)
          return s + (p > 0 ? (Number(d.revenue_recovered) / p) * 100 : 0)
        }, 0) / activeDiscs.length)
      : 0

    const { subject, html, text } = buildReportEmail({
      reportType, expiringIn7Days, valueAtRisk, expiredToday,
      activeDiscounts, discountRecovery, totalDamageLoss, pendingDamage,
      fileName,
    })

    await sendEmail({
      to: recipients,
      subject,
      html,
      text,
      attachments: [{ filename: fileName, content: buffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
    })
  }

  // ── Return file for download ──
  logAudit({ userId: user.id, module: 'reports', action: 'generate', entityLabel: `${reportType} report` })
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}

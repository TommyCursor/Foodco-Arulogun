import nodemailer from 'nodemailer'

// ── Transporter ────────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST!,
    port:   Number(process.env.EMAIL_PORT ?? 587),
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER!,
      pass: process.env.EMAIL_PASS!,
    },
  })
}

// ── Smart Template Builder ──────────────────────────────────
interface ReportEmailData {
  reportType:       'damage' | 'expiry' | 'discount' | 'comprehensive'
  expiringIn7Days:  number
  valueAtRisk:      number
  expiredToday:     number
  activeDiscounts:  number
  discountRecovery: number   // percentage
  totalDamageLoss:  number
  pendingDamage:    number
  fileName:         string
  recipientName?:   string
}

export function buildReportEmail(data: ReportEmailData): { subject: string; html: string; text: string } {
  const {
    reportType, expiringIn7Days, valueAtRisk, expiredToday,
    activeDiscounts, discountRecovery, totalDamageLoss,
    pendingDamage, fileName, recipientName,
  } = data

  const typeLabels: Record<string, string> = {
    damage:        'Damage Report',
    expiry:        'Expiry Risk Report',
    discount:      'Discount Performance Report',
    comprehensive: 'Comprehensive Risk Report',
  }

  const now     = new Date()
  const dateStr = now.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const weekNum = Math.ceil((now.getDate() + new Date(now.getFullYear(), now.getMonth(), 1).getDay()) / 7)

  const greeting = recipientName ? `Dear ${recipientName},` : 'Dear Management Team,'

  // ── Risk level determination ──
  const riskLevel =
    expiredToday > 5 || totalDamageLoss > 100000 ? 'HIGH' :
    expiringIn7Days > 10 || totalDamageLoss > 50000 ? 'MEDIUM' : 'LOW'

  const riskColor = riskLevel === 'HIGH' ? '#D32F2F' : riskLevel === 'MEDIUM' ? '#FFC107' : '#2E7D32'

  // ── AI narrative ──
  const narrative = buildNarrative({ expiringIn7Days, valueAtRisk, expiredToday, discountRecovery, totalDamageLoss, pendingDamage })

  // ── HTML Email ──
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${typeLabels[reportType]}</title>
</head>
<body style="margin:0;padding:0;font-family:'Open Sans',Arial,sans-serif;background:#F5F5F5;">

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#2E7D32;padding:24px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="color:#FFC107;font-size:22px;font-weight:800;letter-spacing:-0.5px;">FOODCO</div>
                    <div style="color:rgba(255,255,255,0.75);font-size:12px;margin-top:2px;">ARULOGUN — RETAIL COMMAND SYSTEM</div>
                  </td>
                  <td align="right">
                    <div style="background:${riskColor};color:#fff;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;display:inline-block;">
                      ${riskLevel} RISK
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="background:#1B5E20;padding:14px 32px;">
              <div style="color:#ffffff;font-size:16px;font-weight:700;">${typeLabels[reportType]}</div>
              <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:2px;">${dateStr} · Week ${weekNum}</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 20px;">${greeting}</p>
              <p style="color:#333;font-size:14px;line-height:1.8;margin:0 0 24px;">
                ${narrative}
              </p>

              <!-- KPI Grid -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                <tr>
                  <td width="48%" style="background:#E8F5E9;border-radius:8px;padding:16px;border-left:4px solid #2E7D32;">
                    <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Expiring in 7 Days</div>
                    <div style="color:#2E7D32;font-size:26px;font-weight:700;margin-top:4px;">${expiringIn7Days}</div>
                    <div style="color:#666;font-size:11px;margin-top:2px;">₦${valueAtRisk.toLocaleString()} at stake</div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background:#FFEBEE;border-radius:8px;padding:16px;border-left:4px solid #D32F2F;">
                    <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Expired Today</div>
                    <div style="color:#D32F2F;font-size:26px;font-weight:700;margin-top:4px;">${expiredToday}</div>
                    <div style="color:#666;font-size:11px;margin-top:2px;">Items to write off</div>
                  </td>
                </tr>
                <tr><td colspan="3" style="padding-top:10px;"></td></tr>
                <tr>
                  <td width="48%" style="background:#FFF8E1;border-radius:8px;padding:16px;border-left:4px solid #FFC107;">
                    <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Active Discounts</div>
                    <div style="color:#b8860b;font-size:26px;font-weight:700;margin-top:4px;">${activeDiscounts}</div>
                    <div style="color:#666;font-size:11px;margin-top:2px;">${discountRecovery}% avg recovery rate</div>
                  </td>
                  <td width="4%"></td>
                  <td width="48%" style="background:#FFEBEE;border-radius:8px;padding:16px;border-left:4px solid #D32F2F;">
                    <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">Damage Loss</div>
                    <div style="color:#D32F2F;font-size:22px;font-weight:700;margin-top:4px;">₦${totalDamageLoss.toLocaleString()}</div>
                    <div style="color:#666;font-size:11px;margin-top:2px;">${pendingDamage} pending approval</div>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td style="background:#E8F5E9;border-radius:8px;padding:16px;">
                    <div style="color:#2E7D32;font-size:13px;font-weight:700;margin-bottom:8px;">⚡ RECOMMENDED ACTIONS</div>
                    ${buildRecommendations({ expiringIn7Days, discountRecovery, pendingDamage, expiredToday })}
                  </td>
                </tr>
              </table>

              <p style="color:#888;font-size:13px;line-height:1.6;margin:0;">
                The full detailed report is attached as <strong>${fileName}</strong>.
                Log in to the Foodco Arulogun system for real-time data and to take action.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F5F5F5;padding:16px 32px;border-top:1px solid #eee;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color:#aaa;font-size:11px;">
                    Foodco Arulogun Retail Command System · Auto-generated report
                  </td>
                  <td align="right" style="color:#aaa;font-size:11px;">
                    ${now.toLocaleString('en-NG')}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`

  const text = `
FOODCO ARULOGUN — ${typeLabels[reportType].toUpperCase()}
${dateStr}

${greeting}

${narrative.replace(/<[^>]+>/g, '')}

KEY METRICS:
- Expiring in 7 days: ${expiringIn7Days} items (₦${valueAtRisk.toLocaleString()} at risk)
- Expired today: ${expiredToday} items
- Active discounts: ${activeDiscounts} (${discountRecovery}% recovery rate)
- Total damage loss: ₦${totalDamageLoss.toLocaleString()} (${pendingDamage} pending)

Full report attached: ${fileName}
`

  const subject = `[Foodco ${riskLevel} RISK] ${typeLabels[reportType]} — ${now.toLocaleDateString('en-NG')}`

  return { subject, html, text }
}

function buildNarrative(data: {
  expiringIn7Days: number; valueAtRisk: number; expiredToday: number;
  discountRecovery: number; totalDamageLoss: number; pendingDamage: number;
}): string {
  const { expiringIn7Days, valueAtRisk, expiredToday, discountRecovery, totalDamageLoss, pendingDamage } = data

  const parts: string[] = []

  if (expiredToday > 0)
    parts.push(`<strong>${expiredToday} item${expiredToday > 1 ? 's' : ''} expired today</strong>, requiring immediate write-off.`)

  if (expiringIn7Days > 0)
    parts.push(`<strong>${expiringIn7Days} batch${expiringIn7Days > 1 ? 'es' : ''} are expiring within 7 days</strong> with <strong>₦${valueAtRisk.toLocaleString()}</strong> of inventory value at stake.`)

  if (discountRecovery > 0)
    parts.push(`Active discounts are recovering at an average rate of <strong>${discountRecovery}%</strong> — ${discountRecovery >= 60 ? 'an excellent result' : discountRecovery >= 40 ? 'a solid result' : 'consider more aggressive pricing on slow-moving items'}.`)

  if (totalDamageLoss > 0)
    parts.push(`Cumulative approved damage stands at <strong>₦${totalDamageLoss.toLocaleString()}</strong>${pendingDamage > 0 ? ` with <strong>${pendingDamage} record${pendingDamage > 1 ? 's' : ''} still pending approval</strong>` : ''}.`)

  return parts.length > 0
    ? parts.join(' ')
    : 'Inventory levels are within normal parameters. No critical issues detected at this time.'
}

function buildRecommendations(data: {
  expiringIn7Days: number; discountRecovery: number;
  pendingDamage: number; expiredToday: number;
}): string {
  const items: string[] = []

  if (data.expiringIn7Days > 0)
    items.push(`Apply tiered discounts to the ${data.expiringIn7Days} at-risk batch${data.expiringIn7Days > 1 ? 'es' : ''} (20–40% based on days remaining)`)
  if (data.expiredToday > 0)
    items.push(`Write off and remove ${data.expiredToday} expired item${data.expiredToday > 1 ? 's' : ''} from shelves immediately`)
  if (data.pendingDamage > 0)
    items.push(`Review and approve/reject ${data.pendingDamage} pending damage record${data.pendingDamage > 1 ? 's' : ''}`)
  if (data.discountRecovery < 40 && data.discountRecovery > 0)
    items.push('Consider SMS blast to loyalty customers for slow-moving discounted items')

  if (items.length === 0)
    return '<div style="color:#2E7D32;font-size:13px;">✅ No urgent actions required at this time.</div>'

  return items.map(i =>
    `<div style="color:#333;font-size:12px;margin-bottom:6px;padding-left:8px;border-left:3px solid #FFC107;">• ${i}</div>`
  ).join('')
}

// ── Alert Email ──────────────────────────────────────────────
interface AlertEmailData {
  alertName:   string
  message:     string
  triggeredAt: string
  recipients:  string[]
}

export function buildAlertEmail(data: AlertEmailData): { subject: string; html: string } {
  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#F5F5F5;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:24px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
      <tr><td style="background:#D32F2F;padding:18px 28px;">
        <span style="color:#fff;font-size:16px;font-weight:700;">🚨 ${data.alertName}</span>
      </td></tr>
      <tr><td style="padding:24px 28px;">
        <p style="color:#333;font-size:14px;line-height:1.7;margin:0 0 16px;">${data.message}</p>
        <p style="color:#888;font-size:12px;margin:0;">Triggered: ${new Date(data.triggeredAt).toLocaleString('en-NG')}</p>
      </td></tr>
      <tr><td style="background:#F5F5F5;padding:12px 28px;">
        <span style="color:#aaa;font-size:11px;">Foodco Arulogun Alert System · This alert will repeat per configured schedule.</span>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`

  return { subject: `🚨 Alert: ${data.alertName} — Foodco Arulogun`, html }
}

// ── Damage Alert Email ────────────────────────────────────────
interface DamageAlertData {
  action:          'created' | 'approved' | 'rejected'
  itemName:        string
  batchNumber?:    string
  quantityDamaged: number
  estimatedValue:  number
  loggedBy:        string
  approvedBy?:     string
  dateTime:        string
}

export function buildDamageAlertEmail(d: DamageAlertData): { subject: string; html: string } {
  const actionLabel  = { created: 'New Damage Entry', approved: 'Damage Approved', rejected: 'Damage Rejected' }[d.action]
  const statusColor  = { created: '#FFC107', approved: '#D32F2F', rejected: '#2E7D32' }[d.action]
  const now          = new Date(d.dateTime).toLocaleString('en-NG')

  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:'Open Sans',Arial,sans-serif;background:#F5F5F5;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
  <tr><td style="background:#2E7D32;padding:20px 28px;">
    <div style="color:#FFC107;font-size:20px;font-weight:800;">FOODCO ARULOGUN</div>
    <div style="color:rgba(255,255,255,0.7);font-size:11px;margin-top:2px;">RETAIL COMMAND SYSTEM — DAMAGE NOTIFICATION</div>
  </td></tr>
  <tr><td style="background:#1B5E20;padding:12px 28px;">
    <span style="background:${statusColor};color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">${actionLabel.toUpperCase()}</span>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <table width="100%" cellpadding="0" cellspacing="6">
      <tr><td style="color:#888;font-size:12px;width:40%;">Item</td><td style="font-weight:700;color:#1B5E20;font-size:14px;">${d.itemName}</td></tr>
      ${d.batchNumber ? `<tr><td style="color:#888;font-size:12px;">Batch</td><td style="font-size:13px;color:#333;">${d.batchNumber}</td></tr>` : ''}
      <tr><td style="color:#888;font-size:12px;">Quantity Damaged</td><td style="font-size:13px;color:#D32F2F;font-weight:700;">${d.quantityDamaged} units</td></tr>
      <tr><td style="color:#888;font-size:12px;">Estimated Value Lost</td><td style="font-size:13px;color:#D32F2F;font-weight:700;">₦${Number(d.estimatedValue).toLocaleString()}</td></tr>
      <tr><td style="color:#888;font-size:12px;">Logged By</td><td style="font-size:13px;color:#333;">${d.loggedBy}</td></tr>
      ${d.approvedBy ? `<tr><td style="color:#888;font-size:12px;">Actioned By</td><td style="font-size:13px;color:#333;">${d.approvedBy}</td></tr>` : ''}
      <tr><td style="color:#888;font-size:12px;">Date &amp; Time</td><td style="font-size:13px;color:#333;">${now}</td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#F5F5F5;padding:12px 28px;">
    <span style="color:#aaa;font-size:11px;">Foodco Arulogun · Automated damage notification · Do not reply</span>
  </td></tr>
</table></td></tr></table></body></html>`

  return {
    subject: `[Foodco Damage] ${actionLabel}: ${d.itemName} — ${d.quantityDamaged} units`,
    html,
  }
}

// ── Discount Alert Email ──────────────────────────────────────
interface DiscountAlertData {
  action:          'created' | 'approved'
  itemName:        string
  sku?:            string
  originalPrice:   number
  discountedPrice: number
  discountPercent: number
  quantity:        number
  appliedBy:       string
  approvedBy?:     string
  dateTime:        string
}

export function buildDiscountAlertEmail(d: DiscountAlertData): { subject: string; html: string } {
  const actionLabel = d.action === 'created' ? 'New Discount Entry' : 'Discount Approved'
  const statusColor = d.action === 'created' ? '#FFC107' : '#2E7D32'
  const now         = new Date(d.dateTime).toLocaleString('en-NG')
  const saving      = Number(d.originalPrice) - Number(d.discountedPrice)

  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:'Open Sans',Arial,sans-serif;background:#F5F5F5;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">
<table width="580" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
  <tr><td style="background:#2E7D32;padding:20px 28px;">
    <div style="color:#FFC107;font-size:20px;font-weight:800;">FOODCO ARULOGUN</div>
    <div style="color:rgba(255,255,255,0.7);font-size:11px;margin-top:2px;">RETAIL COMMAND SYSTEM — DISCOUNT NOTIFICATION</div>
  </td></tr>
  <tr><td style="background:#1B5E20;padding:12px 28px;">
    <span style="background:${statusColor};color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;">${actionLabel.toUpperCase()}</span>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <table width="100%" cellpadding="0" cellspacing="6">
      <tr><td style="color:#888;font-size:12px;width:40%;">Item</td><td style="font-weight:700;color:#1B5E20;font-size:14px;">${d.itemName}</td></tr>
      ${d.sku ? `<tr><td style="color:#888;font-size:12px;">SKU</td><td style="font-size:13px;color:#333;">${d.sku}</td></tr>` : ''}
      <tr><td style="color:#888;font-size:12px;">Original Price</td><td style="font-size:13px;color:#333;">₦${Number(d.originalPrice).toLocaleString()}</td></tr>
      <tr><td style="color:#888;font-size:12px;">Discounted Price</td><td style="font-size:13px;color:#2E7D32;font-weight:700;">₦${Number(d.discountedPrice).toLocaleString()}</td></tr>
      <tr><td style="color:#888;font-size:12px;">Discount</td><td style="font-size:13px;color:#D32F2F;font-weight:700;">${d.discountPercent}% off (saving ₦${saving.toLocaleString()} per unit)</td></tr>
      <tr><td style="color:#888;font-size:12px;">Quantity Affected</td><td style="font-size:13px;color:#333;">${d.quantity} units</td></tr>
      <tr><td style="color:#888;font-size:12px;">Entered By</td><td style="font-size:13px;color:#333;">${d.appliedBy}</td></tr>
      ${d.approvedBy ? `<tr><td style="color:#888;font-size:12px;">Approved By</td><td style="font-size:13px;color:#2E7D32;font-weight:700;">${d.approvedBy}</td></tr>` : ''}
      <tr><td style="color:#888;font-size:12px;">Date &amp; Time</td><td style="font-size:13px;color:#333;">${now}</td></tr>
    </table>
  </td></tr>
  <tr><td style="background:#F5F5F5;padding:12px 28px;">
    <span style="color:#aaa;font-size:11px;">Foodco Arulogun · Automated discount notification · Do not reply</span>
  </td></tr>
</table></td></tr></table></body></html>`

  return {
    subject: `[Foodco Discount] ${actionLabel}: ${d.discountPercent}% off ${d.itemName}`,
    html,
  }
}

// ── Expiry Interval Alert Email ───────────────────────────────
export function buildExpiryIntervalEmail(intervalLabel: string, items: Array<{
  itemName:    string
  sku?:        string
  quantity:    number
  expiryDate:  string
  location?:   string
  loggedBy?:   string
}>): { subject: string; html: string } {
  const now   = new Date().toLocaleString('en-NG')
  const rows  = items.map(i => `
    <tr style="border-bottom:1px solid #f0f0f0;">
      <td style="padding:8px 4px;font-size:13px;font-weight:600;color:#1B5E20;">${i.itemName}</td>
      <td style="padding:8px 4px;font-size:12px;color:#666;">${i.sku ?? '—'}</td>
      <td style="padding:8px 4px;font-size:12px;color:#333;">${i.quantity}</td>
      <td style="padding:8px 4px;font-size:12px;color:#D32F2F;font-weight:600;">${new Date(i.expiryDate).toLocaleDateString('en-NG')}</td>
      <td style="padding:8px 4px;font-size:12px;color:#666;">${i.location ?? '—'}</td>
      <td style="padding:8px 4px;font-size:12px;color:#666;">${i.loggedBy ?? '—'}</td>
    </tr>`).join('')

  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:'Open Sans',Arial,sans-serif;background:#F5F5F5;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
  <tr><td style="background:#2E7D32;padding:20px 28px;">
    <div style="color:#FFC107;font-size:20px;font-weight:800;">FOODCO ARULOGUN</div>
    <div style="color:rgba(255,255,255,0.7);font-size:11px;margin-top:2px;">RETAIL COMMAND SYSTEM — EXPIRY ALERT</div>
  </td></tr>
  <tr><td style="background:#D32F2F;padding:12px 28px;">
    <span style="color:#fff;font-size:14px;font-weight:700;">⏰ ${intervalLabel.toUpperCase()} — ${items.length} ITEM${items.length > 1 ? 'S' : ''} AFFECTED</span>
  </td></tr>
  <tr><td style="padding:24px 28px;">
    <p style="color:#555;font-size:13px;margin:0 0 16px;">The following items require immediate attention. Please review and take action (discount, remove from shelf, or contact supplier).</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="background:#E8F5E9;">
          <th style="padding:8px 4px;font-size:11px;text-align:left;color:#2E7D32;text-transform:uppercase;">Item</th>
          <th style="padding:8px 4px;font-size:11px;text-align:left;color:#2E7D32;text-transform:uppercase;">SKU</th>
          <th style="padding:8px 4px;font-size:11px;text-align:left;color:#2E7D32;text-transform:uppercase;">Qty</th>
          <th style="padding:8px 4px;font-size:11px;text-align:left;color:#2E7D32;text-transform:uppercase;">Expiry Date</th>
          <th style="padding:8px 4px;font-size:11px;text-align:left;color:#2E7D32;text-transform:uppercase;">Location</th>
          <th style="padding:8px 4px;font-size:11px;text-align:left;color:#2E7D32;text-transform:uppercase;">Logged By</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </td></tr>
  <tr><td style="background:#FFF8E1;padding:14px 28px;">
    <div style="color:#b8860b;font-size:12px;font-weight:700;">⚡ RECOMMENDED ACTIONS</div>
    <div style="color:#555;font-size:12px;margin-top:6px;">• Apply tiered discounts based on days remaining &nbsp;•&nbsp; Move items to front-of-shelf &nbsp;•&nbsp; Notify floor staff</div>
  </td></tr>
  <tr><td style="background:#F5F5F5;padding:12px 28px;">
    <span style="color:#aaa;font-size:11px;">Foodco Arulogun · Automated expiry alert · Generated ${now}</span>
  </td></tr>
</table></td></tr></table></body></html>`

  return {
    subject: `[Foodco Expiry] ${intervalLabel}: ${items.length} item${items.length > 1 ? 's' : ''} need attention`,
    html,
  }
}

// ── Send Email ───────────────────────────────────────────────
export async function sendEmail(options: {
  to:           string | string[]
  cc?:          string | string[]
  bcc?:         string | string[]
  subject:      string
  html?:        string
  text?:        string
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>
}): Promise<void> {
  const transporter = createTransporter()
  await transporter.sendMail({
    from:        process.env.EMAIL_FROM!,
    to:          Array.isArray(options.to) ? options.to.join(', ') : options.to,
    cc:          options.cc  ? (Array.isArray(options.cc)  ? options.cc.join(', ')  : options.cc)  : undefined,
    bcc:         options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
    subject:     options.subject,
    html:        options.html,
    text:        options.text,
    attachments: options.attachments,
  })
}

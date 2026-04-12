import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import nodemailer from 'nodemailer'
import { generateRosterExcel, DAYS, DAY_SHORT, SHIFT_LABEL, SECTION_LABEL, rosterWeekLabel } from '@/lib/services/rosterExcel'
import dayjs from 'dayjs'

// ── Helpers ───────────────────────────────────────────────────────────────────
function timeBasedGreeting(): string {
  const hour = new Date(Date.now() + 60 * 60 * 1000).getUTCHours() // WAT = UTC+1
  if (hour >= 5  && hour < 11) return 'Good morning — trust your day is off to a great start.'
  if (hour >= 11 && hour < 13) return 'Good midday — hope your morning has been productive so far.'
  if (hour >= 13 && hour < 17) return 'Good afternoon — trust you\'re having a productive day.'
  if (hour >= 17 && hour < 20) return 'Good evening — trust you\'ve had a productive and rewarding day.'
  return 'Good evening — hope you\'ve had a wonderful day.'
}

function shiftBadge(shift: string): string {
  const styles: Record<string, string> = {
    am:   'background:#E8F5E9;color:#1B5E20;',
    mid:  'background:#E3F2FD;color:#1565C0;',
    pm:   'background:#F3E5F5;color:#6A1B9A;',
    full: 'background:#FFF3E0;color:#E65100;',
    off:  'background:#F5F5F5;color:#9E9E9E;',
  }
  const label: Record<string, string> = { am: 'AM', mid: 'Mid', pm: 'PM', full: 'Full', off: 'Off' }
  const s = styles[shift] ?? styles.off
  return `<span style="${s}font-size:11px;font-weight:700;padding:2px 7px;border-radius:4px;">${label[shift] ?? shift}</span>`
}

function buildRosterEmailHtml(roster: any, entries: any[], weekLabel: string, senderName: string, note: string): string {
  const SECTION_ORDER = ['supervisor', 'floor', 'cashier', 'sanitation']
  const sorted = [...entries].sort((a, b) => {
    const sa = SECTION_ORDER.indexOf(a.section)
    const sb = SECTION_ORDER.indexOf(b.section)
    if (sa !== sb) return sa - sb
    return (a.profile?.full_name ?? '').localeCompare(b.profile?.full_name ?? '')
  })

  // Day headers with dates
  const dayHeaders = DAYS.map((_, i) => {
    const d = dayjs(roster.week_start).add(i, 'day')
    return `<th style="background:#2E7D32;color:#fff;padding:8px 6px;font-size:11px;text-align:center;min-width:64px;">
      ${DAY_SHORT[i]}<br><span style="font-weight:400;font-size:10px;">${d.format('DD/MM')}</span>
    </th>`
  }).join('')

  // Group entries by section
  const sections = SECTION_ORDER.filter(sec => sorted.some(e => e.section === sec))

  const sectionRows = sections.map(sec => {
    const secEntries = sorted.filter(e => e.section === sec)
    const secHeader = `
      <tr>
        <td colspan="9" style="background:#E8F5E9;color:#2E7D32;font-weight:700;font-size:12px;padding:8px 12px;border-top:2px solid #2E7D32;">
          ${SECTION_LABEL[sec] ?? sec} Section (${secEntries.length} staff)
        </td>
      </tr>`

    const staffRows = secEntries.map((e, idx) => {
      const shifts   = DAYS.map(d => (e[d] as string) || 'off')
      const daysOn   = shifts.filter(s => s !== 'off').length
      const bg       = idx % 2 === 0 ? '#ffffff' : '#F9FBE7'
      const shiftCells = shifts.map(s => `<td style="padding:6px 4px;text-align:center;background:${bg};">${shiftBadge(s)}</td>`).join('')
      return `
        <tr style="background:${bg};">
          <td style="padding:6px 12px;font-weight:600;font-size:12px;background:${bg};">
            ${e.profile?.full_name ?? '—'}<br>
            <span style="font-weight:400;font-size:10px;color:#888;">${(e.profile?.role?.name ?? '').replace(/_/g, ' ')}</span>
          </td>
          ${shiftCells}
          <td style="padding:6px 8px;text-align:center;font-weight:700;font-size:13px;color:${daysOn >= 5 ? '#2E7D32' : '#5D4037'};background:${bg};">${daysOn}</td>
        </tr>`
    }).join('')

    return secHeader + staffRows
  }).join('')

  // Daily coverage summary
  const coverageCells = DAYS.map((day, i) => {
    const am   = entries.filter(e => e[day] === 'am').length
    const mid  = entries.filter(e => e[day] === 'mid').length
    const pm   = entries.filter(e => e[day] === 'pm').length
    const full = entries.filter(e => e[day] === 'full').length
    const off  = entries.filter(e => e[day] === 'off').length
    const on   = entries.length - off
    return `<td style="padding:8px 4px;text-align:center;font-size:10px;background:#E8F5E9;color:#1B5E20;">
      <strong>${on}</strong> on<br>
      <span style="color:#555;">AM:${am} Mid:${mid} PM:${pm}${full ? ` Full:${full}` : ''}</span>
    </td>`
  }).join('')

  const statusColor = roster.status === 'published' ? '#2E7D32' : '#E65100'
  const totalStaff  = entries.length

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Open Sans',Arial,sans-serif;background:#F5F5F5;">
<table width="100%" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:24px 12px;">
    <table width="700" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">

      <!-- Header -->
      <tr>
        <td style="background:#2E7D32;padding:24px 32px;">
          <div style="color:#FFC107;font-size:22px;font-weight:800;letter-spacing:1px;">FOODCO ARULOGUN</div>
          <div style="color:#fff;font-size:14px;margin-top:4px;">Weekly Staff Roster</div>
        </td>
      </tr>

      <!-- Week banner -->
      <tr>
        <td style="background:#388E3C;padding:12px 32px;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="color:#fff;font-size:15px;font-weight:700;">📅 ${weekLabel}</td>
              <td align="right">
                <span style="background:${statusColor};color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:4px;">
                  ${roster.status.toUpperCase()}
                </span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:24px 32px;">

          <p style="color:#333;font-size:14px;margin:0 0 16px;">${timeBasedGreeting()}</p>
          <p style="color:#555;font-size:13px;line-height:1.6;margin:0 0 20px;">
            Please find below the weekly staff roster for <strong>${weekLabel}</strong>.
            A total of <strong>${totalStaff} staff members</strong> are scheduled across all sections.
            The full Excel breakdown is attached for your reference.
          </p>

          ${note ? `<div style="background:#FFF8E1;border-left:4px solid #FFC107;padding:12px 16px;margin-bottom:20px;border-radius:0 8px 8px 0;">
            <div style="color:#666;font-size:11px;font-weight:700;margin-bottom:4px;">NOTE FROM SENDER</div>
            <div style="color:#333;font-size:13px;">${note}</div>
          </div>` : ''}

          <!-- Roster table -->
          <div style="overflow-x:auto;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;">
            <thead>
              <tr>
                <th style="background:#2E7D32;color:#fff;padding:10px 12px;text-align:left;min-width:150px;font-size:12px;">Staff Name</th>
                ${dayHeaders}
                <th style="background:#2E7D32;color:#fff;padding:8px 6px;font-size:11px;text-align:center;">Days<br>On</th>
              </tr>
            </thead>
            <tbody>
              ${sectionRows}
              <!-- Coverage summary -->
              <tr>
                <td style="background:#E8F5E9;color:#2E7D32;font-weight:700;font-size:11px;padding:8px 12px;">DAILY COVERAGE</td>
                ${coverageCells}
                <td style="background:#E8F5E9;color:#2E7D32;font-weight:700;font-size:12px;text-align:center;">${totalStaff}</td>
              </tr>
            </tbody>
          </table>
          </div>

          <!-- Shift legend -->
          <div style="margin-top:20px;padding:12px 16px;background:#F9FBE7;border-radius:8px;border:1px solid #E8F5E9;">
            <div style="font-size:11px;font-weight:700;color:#2E7D32;margin-bottom:8px;">SHIFT LEGEND</div>
            <div style="display:flex;flex-wrap:wrap;gap:8px;">
              ${['am','mid','pm','full','off'].map(s => `${shiftBadge(s)} <span style="font-size:11px;color:#666;">${SHIFT_LABEL[s]}</span>`).join('&nbsp;&nbsp;&nbsp;')}
            </div>
          </div>

          <p style="color:#888;font-size:11px;margin-top:20px;">
            Sent by <strong>${senderName}</strong> on ${dayjs().format('dddd, DD MMM YYYY [at] HH:mm')}<br>
            This is an automated email from the Foodco Arulogun management system.
          </p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#2E7D32;padding:16px 32px;text-align:center;">
          <div style="color:#A5D6A7;font-size:11px;">Foodco Arulogun Management System · Confidential</div>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

// ── POST /api/roster/email ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { roster_id, to, cc = [], bcc = [], note = '' } = body as {
    roster_id: string
    to:        string
    cc?:       string[]
    bcc?:      string[]
    note?:     string
  }

  if (!roster_id) return NextResponse.json({ error: 'roster_id is required' }, { status: 400 })
  if (!to?.includes('@')) return NextResponse.json({ error: 'A valid To address is required' }, { status: 400 })

  // Validate email config
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return NextResponse.json({ error: 'Email is not configured. Set EMAIL_HOST, EMAIL_USER, EMAIL_PASS in environment variables.' }, { status: 503 })
  }

  // Fetch roster + entries
  const admin = createAdminClient()
  const { data: roster } = await admin
    .from('rosters')
    .select('id, week_start, status, notes, published_at')
    .eq('id', roster_id)
    .single()

  if (!roster) return NextResponse.json({ error: 'Roster not found' }, { status: 404 })

  const { data: rawEntries } = await admin
    .from('roster_entries')
    .select(`id, section, monday, tuesday, wednesday, thursday, friday, saturday, sunday, notes, profile:profiles (id, full_name, role:roles (name))`)
    .eq('roster_id', roster.id)

  const entries = rawEntries ?? []

  // Get sender's name
  const { data: senderProfile } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()
  const senderName = senderProfile?.full_name ?? 'Management'

  const weekLabel = rosterWeekLabel(roster.week_start)

  // Generate Excel attachment
  const excelBuffer = await generateRosterExcel(roster, entries)
  const filename    = `Foodco_Roster_${roster.week_start.replace(/-/g, '')}.xlsx`

  // Build email HTML
  const html = buildRosterEmailHtml(roster, entries, weekLabel, senderName, note)

  // Send email
  const transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   Number(process.env.EMAIL_PORT ?? 587),
    secure: process.env.EMAIL_PORT === '465',
    auth: { user: process.env.EMAIL_USER!, pass: process.env.EMAIL_PASS! },
  })

  const ccClean  = cc.filter(e => e.includes('@'))
  const bccClean = bcc.filter(e => e.includes('@'))

  try {
    await transporter.sendMail({
      from:    process.env.EMAIL_FROM ?? process.env.EMAIL_USER,
      to,
      ...(ccClean.length  > 0 ? { cc:  ccClean.join(', ')  } : {}),
      ...(bccClean.length > 0 ? { bcc: bccClean.join(', ') } : {}),
      subject: `📋 Staff Roster — Week of ${weekLabel} [${roster.status.toUpperCase()}]`,
      html,
      attachments: [{
        filename,
        content: excelBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }],
    })
  } catch (err: any) {
    console.error('[roster/email] Nodemailer error:', err.message)
    return NextResponse.json({ error: `Failed to send email: ${err.message}` }, { status: 500 })
  }

  const sentTo = [to, ...ccClean, ...bccClean]
  return NextResponse.json({
    ok: true,
    recipients: sentTo,
    week: weekLabel,
  })
}

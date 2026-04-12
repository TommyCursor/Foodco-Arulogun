/**
 * Shared roster Excel generation service.
 * Used by both the export (download) and email (attachment) routes.
 */
import ExcelJS from 'exceljs'
import dayjs from 'dayjs'

// ── Constants ─────────────────────────────────────────────────────────────────
export const DAYS      = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const SHIFT_LABEL: Record<string, string> = {
  am:   'AM  (7:00am – 3:30pm)',
  mid:  'Mid (10:00am – 7:00pm)',
  pm:   'PM  (12:30pm – Close)',
  full: 'Full (7:00am – Close)',
  off:  'Off',
}

const SHIFT_BG: Record<string, string> = {
  am:   'FFE8F5E9',
  mid:  'FFE3F2FD',
  pm:   'FFF3E5F5',
  full: 'FFFFF3E0',
  off:  'FFF5F5F5',
}

const SHIFT_FG: Record<string, string> = {
  am:   'FF1B5E20',
  mid:  'FF1565C0',
  pm:   'FF6A1B9A',
  full: 'FFE65100',
  off:  'FF9E9E9E',
}

export const SECTION_LABEL: Record<string, string> = {
  floor:      'Floor',
  sanitation: 'Sanitation',
  cashier:    'Cashier',
  supervisor: 'Supervisor',
}

const COL_GREEN       = 'FF2E7D32'
const COL_GREEN_MID   = 'FF388E3C'
const COL_GREEN_LIGHT = 'FFE8F5E9'
const COL_WHITE       = 'FFFFFFFF'
const COL_STRIPE      = 'FFF9FBE7'

// ── Internal helpers ──────────────────────────────────────────────────────────
function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function borderAll(): Partial<ExcelJS.Borders> {
  return {
    top:    { style: 'thin', color: { argb: 'FFE0E0E0' } },
    bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    left:   { style: 'thin', color: { argb: 'FFE0E0E0' } },
    right:  { style: 'thin', color: { argb: 'FFE0E0E0' } },
  }
}

// ── Sheet builder ─────────────────────────────────────────────────────────────
function buildSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  entries: any[],
  roster: any,
  weekLabel: string,
  dayDates: string[],
  includeSection: boolean,
) {
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, paperSize: 9 },
  })

  const colCount = includeSection ? 11 : 10

  ws.columns = [
    { key: 'name',   width: 28 },
    ...(includeSection ? [{ key: 'section', width: 14 }] : []),
    { key: 'role',   width: 18 },
    { key: 'mon',    width: 16 },
    { key: 'tue',    width: 16 },
    { key: 'wed',    width: 16 },
    { key: 'thu',    width: 16 },
    { key: 'fri',    width: 16 },
    { key: 'sat',    width: 16 },
    { key: 'sun',    width: 16 },
    { key: 'dayson', width: 9  },
  ]

  // Row 1: Main title
  ws.addRow(['FOODCO ARULOGUN — WEEKLY STAFF ROSTER'])
  ws.mergeCells(1, 1, 1, colCount)
  const r1 = ws.getCell('A1')
  r1.value     = 'FOODCO ARULOGUN — WEEKLY STAFF ROSTER'
  r1.font      = { name: 'Calibri', bold: true, size: 15, color: { argb: COL_WHITE } }
  r1.fill      = solidFill(COL_GREEN)
  r1.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 30

  // Row 2: Sub-title
  const sub = [
    sheetName,
    `Week: ${weekLabel}`,
    `Status: ${(roster.status as string).toUpperCase()}`,
    roster.notes ? `Note: ${roster.notes}` : null,
  ].filter(Boolean).join('   |   ')
  ws.addRow([sub])
  ws.mergeCells(2, 1, 2, colCount)
  const r2 = ws.getCell('A2')
  r2.value     = sub
  r2.font      = { name: 'Calibri', size: 11, color: { argb: COL_WHITE } }
  r2.fill      = solidFill(COL_GREEN_MID)
  r2.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(2).height = 22

  // Row 3: Generated-on note
  const genNote = `Generated: ${dayjs().format('DD MMM YYYY, HH:mm')}${roster.published_at ? '   |   Published: ' + dayjs(roster.published_at).format('DD MMM YYYY, HH:mm') : ''}`
  ws.addRow([genNote])
  ws.mergeCells(3, 1, 3, colCount)
  const r3 = ws.getCell('A3')
  r3.value     = genNote
  r3.font      = { name: 'Calibri', size: 9, color: { argb: 'FF777777' } }
  r3.fill      = solidFill('FFF1F8E9')
  r3.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(3).height = 16

  // Row 4: Blank spacer
  ws.addRow([])
  ws.getRow(4).height = 6

  // Row 5: Column headers
  const roleColIdx = includeSection ? 3 : 2
  const headers = [
    'STAFF NAME',
    ...(includeSection ? ['SECTION'] : []),
    'ROLE',
    ...DAY_SHORT.map((d, i) => `${d}\n${dayDates[i]}`),
    'DAYS\nON',
  ]
  ws.addRow(headers)
  const hRow = ws.getRow(5)
  hRow.height = 34
  hRow.eachCell((cell, colNum) => {
    cell.font      = { name: 'Calibri', bold: true, size: 11, color: { argb: COL_WHITE } }
    cell.fill      = solidFill(COL_GREEN)
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border    = { bottom: { style: 'medium', color: { argb: COL_WHITE } } }
  })
  ws.getCell(5, 1).alignment          = { horizontal: 'left', vertical: 'middle', wrapText: true }
  ws.getCell(5, roleColIdx).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

  // Data rows — sorted by section hierarchy then name
  const SECTION_ORDER = ['supervisor', 'floor', 'cashier', 'sanitation']
  const sorted = [...entries].sort((a, b) => {
    const sa = SECTION_ORDER.indexOf(a.section)
    const sb = SECTION_ORDER.indexOf(b.section)
    if (sa !== sb) return sa - sb
    return (a.profile?.full_name ?? '').localeCompare(b.profile?.full_name ?? '')
  })

  sorted.forEach((entry, idx) => {
    const shifts = DAYS.map(d => (entry[d] as string) || 'off')
    const daysOn = shifts.filter(s => s !== 'off').length
    const isAlt  = idx % 2 === 1

    const rowData = [
      entry.profile?.full_name ?? '—',
      ...(includeSection ? [SECTION_LABEL[entry.section] ?? entry.section] : []),
      (entry.profile?.role?.name ?? '—').replace(/_/g, ' '),
      ...shifts.map(s => SHIFT_LABEL[s] ?? s),
      daysOn,
    ]

    const dataRow = ws.addRow(rowData)
    dataRow.height = 22

    dataRow.eachCell((cell, colNum) => {
      cell.font      = { name: 'Calibri', size: 10 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border    = borderAll()

      if (colNum === 1) {
        cell.font      = { name: 'Calibri', bold: true, size: 11 }
        cell.alignment = { horizontal: 'left', vertical: 'middle' }
        cell.fill      = solidFill(isAlt ? COL_STRIPE : COL_WHITE)
      } else if (includeSection && colNum === 2) {
        cell.font      = { name: 'Calibri', size: 10, italic: true }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.fill      = solidFill(isAlt ? COL_STRIPE : COL_WHITE)
      } else if (colNum === roleColIdx) {
        cell.font      = { name: 'Calibri', size: 10, color: { argb: 'FF555555' }, italic: true }
        cell.alignment = { horizontal: 'left', vertical: 'middle' }
        cell.fill      = solidFill(isAlt ? COL_STRIPE : COL_WHITE)
      } else if (colNum > roleColIdx && colNum <= roleColIdx + 7) {
        const shift = shifts[colNum - roleColIdx - 1]
        cell.fill = solidFill(SHIFT_BG[shift] ?? COL_WHITE)
        cell.font = {
          name: 'Calibri', size: 9,
          color: { argb: SHIFT_FG[shift] ?? 'FF333333' },
          bold: shift !== 'off',
        }
      } else if (colNum === colCount) {
        cell.font = {
          name: 'Calibri', bold: true, size: 11,
          color: { argb: daysOn >= 5 ? COL_GREEN : 'FF5D4037' },
        }
        cell.fill = solidFill(isAlt ? COL_STRIPE : COL_WHITE)
      }
    })
  })

  // Coverage summary footer
  ws.addRow([])
  const summaryData = [
    'COVERAGE SUMMARY',
    ...(includeSection ? [''] : []),
    '',
  ]
  DAYS.forEach((day, i) => {
    const am   = entries.filter(e => e[day] === 'am').length
    const mid  = entries.filter(e => e[day] === 'mid').length
    const pm   = entries.filter(e => e[day] === 'pm').length
    const full = entries.filter(e => e[day] === 'full').length
    const off  = entries.filter(e => e[day] === 'off').length
    const on   = entries.length - off
    summaryData.push(`${on} on duty\nAM:${am}  Mid:${mid}  PM:${pm}${full ? `  Full:${full}` : ''}`)
  })
  summaryData.push(`${entries.length} total`)

  const sumRow = ws.addRow(summaryData)
  sumRow.height = 32
  sumRow.eachCell((cell, colNum) => {
    cell.fill      = solidFill(COL_GREEN_LIGHT)
    cell.font      = { name: 'Calibri', size: 9, bold: colNum === 1, color: { argb: COL_GREEN } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border    = borderAll()
    if (colNum === 1) cell.alignment.horizontal = 'left'
  })
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Build a complete roster workbook (All Staff + per-section sheets).
 * Returns the buffer ready for download or email attachment.
 */
export async function generateRosterExcel(roster: any, entries: any[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Foodco Arulogun System'
  wb.created  = new Date()
  wb.modified = new Date()

  const weekLabel = `${dayjs(roster.week_start).format('DD MMM')} – ${dayjs(roster.week_start).add(6, 'day').format('DD MMM YYYY')}`
  const dayDates  = DAYS.map((_, i) => dayjs(roster.week_start).add(i, 'day').format('DD/MM'))

  buildSheet(wb, 'All Staff', entries, roster, weekLabel, dayDates, true)

  const SECTIONS = [
    { key: 'floor',      label: 'Floor Roster' },
    { key: 'cashier',    label: 'Cashier'       },
    { key: 'sanitation', label: 'Sanitation'    },
    { key: 'supervisor', label: 'Supervisor'    },
  ]
  for (const sec of SECTIONS) {
    const secEntries = entries.filter(e => e.section === sec.key)
    if (secEntries.length > 0) {
      buildSheet(wb, sec.label, secEntries, roster, weekLabel, dayDates, false)
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer())
}

/**
 * Week label string helper — also used by the email template.
 */
export function rosterWeekLabel(weekStart: string): string {
  return `${dayjs(weekStart).format('DD MMM')} – ${dayjs(weekStart).add(6, 'day').format('DD MMM YYYY')}`
}

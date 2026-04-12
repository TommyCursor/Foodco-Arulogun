import ExcelJS from 'exceljs'
import { BRAND } from '@/lib/constants'

/** Parse a quantity — supports decimals for weight-based products. */
const cq = (n: unknown): number => Number(n) || 0

// ── Brand colour as ARGB (ExcelJS format) ──────────────────
const GREEN  = 'FF2E7D32'
const YELLOW = 'FFFFC107'
const WHITE  = 'FFFFFFFF'
const GRAY   = 'FFF5F5F5'
const RED    = 'FFD32F2F'

function applyHeaderRow(row: ExcelJS.Row, bg = GREEN) {
  row.eachCell(cell => {
    cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    cell.font   = { bold: true, color: { argb: WHITE }, size: 11 }
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  })
  row.height = 22
}

function applyDataRow(row: ExcelJS.Row, index: number) {
  const bg = index % 2 === 0 ? GRAY : WHITE
  row.eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
    cell.alignment = { vertical: 'middle' }
    cell.border    = { bottom: { style: 'hair', color: { argb: 'FFEEEEEE' } } }
  })
  row.height = 18
}

function addBrandHeader(ws: ExcelJS.Worksheet, title: string, subtitle: string) {
  // Row 1 — Brand bar
  const brandRow = ws.addRow(['FOODCO ARULOGUN', '', '', '', '', '', title])
  brandRow.height = 28
  brandRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } }
    cell.font = { bold: true, color: { argb: WHITE }, size: 12 }
  })

  // Row 2 — Subtitle
  const subRow = ws.addRow([subtitle, '', '', '', '', '', `Generated: ${new Date().toLocaleString('en-NG')}`])
  subRow.height = 18
  subRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } }
    cell.font = { bold: false, color: { argb: 'FF333333' }, size: 10 }
  })

  // Row 3 — Spacer
  ws.addRow([])
}

// ─────────────────────────────────────────────────────────────
// REPORT 1: EXPIRY REPORT
// ─────────────────────────────────────────────────────────────
export async function generateExpiryReport(data: any[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator  = 'Foodco Arulogun System'
  wb.created  = new Date()

  const ws = wb.addWorksheet('Expiry Report', {
    pageSetup: { orientation: 'landscape', fitToPage: true },
  })

  ws.columns = [
    { key: 'product',    width: 28 },
    { key: 'sku',        width: 16 },
    { key: 'category',   width: 16 },
    { key: 'batch',      width: 14 },
    { key: 'qty',        width: 10 },
    { key: 'price',      width: 14 },
    { key: 'expiry',     width: 14 },
    { key: 'days_left',  width: 12 },
    { key: 'value_risk', width: 16 },
    { key: 'location',   width: 18 },
    { key: 'status',     width: 12 },
  ]

  addBrandHeader(ws, 'EXPIRY RISK REPORT', `Items expiring within 14 days — ${new Date().toLocaleDateString('en-NG')}`)

  const headerRow = ws.addRow([
    'Product', 'SKU', 'Category', 'Batch #', 'Qty',
    'Selling Price (₦)', 'Expiry Date', 'Days Left',
    'Value at Risk (₦)', 'Location', 'Status',
  ])
  applyHeaderRow(headerRow)

  data.forEach((item, i) => {
    const days = Math.ceil((new Date(item.expiry_date).getTime() - Date.now()) / 86400000)
    const row = ws.addRow([
      item.product?.name ?? '—',
      item.product?.sku  ?? '—',
      item.product?.category?.name ?? '—',
      item.batch_number ?? '—',
      cq(item.quantity),
      Number(item.selling_price),
      new Date(item.expiry_date).toLocaleDateString('en-NG'),
      days,
      cq(item.quantity) * Number(item.selling_price),
      item.location ?? '—',
      item.status,
    ])
    applyDataRow(row, i)

    // Highlight critical rows
    if (days <= 0) {
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEBEE' } } })
    } else if (days <= 2) {
      row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3E0' } } })
    }

    // Number formatting
    row.getCell(6).numFmt = '₦#,##0.00'
    row.getCell(9).numFmt = '₦#,##0.00'
  })

  // Summary row
  ws.addRow([])
  const totalVal = data.reduce((s, i) => s + cq(i.quantity) * Number(i.selling_price), 0)
  const sumRow   = ws.addRow(['TOTALS', '', '', '', data.reduce((s, i) => s + cq(i.quantity), 0), '', '', '', totalVal])
  sumRow.font    = { bold: true }
  sumRow.getCell(9).numFmt = '₦#,##0.00'

  return Buffer.from(await wb.xlsx.writeBuffer())
}

// ─────────────────────────────────────────────────────────────
// REPORT 2: DAMAGE REPORT
// ─────────────────────────────────────────────────────────────
export async function generateDamageReport(data: any[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Foodco Arulogun System'

  const ws = wb.addWorksheet('Damage Report', {
    pageSetup: { orientation: 'portrait', fitToPage: true },
  })

  ws.columns = [
    { key: 'description', width: 32 },
    { key: 'barcode',     width: 16 },
    { key: 'qty',         width: 10 },
    { key: 'price',       width: 16 },
    { key: 'amount',      width: 16 },
    { key: 'reason',      width: 30 },
    { key: 'reported_by', width: 20 },
    { key: 'status',      width: 14 },
    { key: 'approved_by', width: 20 },
    { key: 'date',        width: 18 },
  ]

  addBrandHeader(ws, 'DAMAGE REPORT', `All damage records — ${new Date().toLocaleDateString('en-NG')}`)

  const headerRow = ws.addRow(['Description', 'Barcode', 'Qty', 'Price (₦)', 'Amount (₦)', 'Reason', 'Reported By', 'Status', 'Approved By', 'Date Reported'])
  applyHeaderRow(headerRow, RED)

  data.forEach((r, i) => {
    const price  = Number(r.inventory_item?.selling_price ?? 0)
    const amount = cq(r.quantity_damaged) * price
    const row = ws.addRow([
      r.inventory_item?.product?.name ?? '—',
      r.inventory_item?.product?.sku  ?? '—',
      cq(r.quantity_damaged),
      price,
      amount,
      r.reason ?? '—',
      r.reporter?.full_name ?? '—',
      r.status ?? '—',
      r.approver?.full_name ?? '—',
      r.reported_at ? new Date(r.reported_at).toLocaleDateString('en-NG') : '—',
    ])
    applyDataRow(row, i)
    row.getCell(4).numFmt = '₦#,##0.00'
    row.getCell(5).numFmt = '₦#,##0.00'
  })

  ws.addRow([])
  const totalQty = data.reduce((s, r) => s + cq(r.quantity_damaged), 0)
  const totalAmt = data.reduce((s, r) => s + cq(r.quantity_damaged) * Number(r.inventory_item?.selling_price ?? 0), 0)
  const sumRow   = ws.addRow(['TOTALS', '', totalQty, '', totalAmt, '', '', '', '', ''])
  sumRow.font    = { bold: true }
  sumRow.getCell(5).numFmt = '₦#,##0.00'

  return Buffer.from(await wb.xlsx.writeBuffer())
}

// ─────────────────────────────────────────────────────────────
// REPORT 3: DISCOUNT REPORT
// ─────────────────────────────────────────────────────────────
export async function generateDiscountReport(data: any[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Foodco Arulogun System'

  const ws = wb.addWorksheet('Discount Report', {
    pageSetup: { orientation: 'portrait', fitToPage: true },
  })

  ws.columns = [
    { key: 'description', width: 32 },
    { key: 'barcode',     width: 16 },
    { key: 'qty',         width: 10 },
    { key: 'price',       width: 16 },
    { key: 'amount',      width: 16 },
    { key: 'reason',      width: 26 },
    { key: 'applied_by',  width: 20 },
    { key: 'status',      width: 14 },
    { key: 'approved_by', width: 20 },
    { key: 'date',        width: 18 },
  ]

  addBrandHeader(ws, 'DISCOUNT REPORT', `All discounts — ${new Date().toLocaleDateString('en-NG')}`)

  const headerRow = ws.addRow(['Description', 'Barcode', 'Qty', 'Price (₦)', 'Amount (₦)', 'Reason', 'Applied By', 'Status', 'Approved By', 'Date Created'])
  applyHeaderRow(headerRow)

  data.forEach((d, i) => {
    const price  = Number(d.discounted_price ?? d.original_price ?? 0)
    const qty    = cq(d.inventory_item?.quantity ?? d.units_sold ?? 0)
    const amount = qty * price
    const row = ws.addRow([
      d.inventory_item?.product?.name ?? '—',
      d.inventory_item?.product?.sku  ?? '—',
      qty,
      price,
      amount,
      d.name ?? d.discount_type ?? '—',
      d.applicant?.full_name ?? '—',
      d.status ?? '—',
      d.approver?.full_name ?? '—',
      d.created_at ? new Date(d.created_at).toLocaleDateString('en-NG') : '—',
    ])
    applyDataRow(row, i)
    row.getCell(4).numFmt = '₦#,##0.00'
    row.getCell(5).numFmt = '₦#,##0.00'
  })

  ws.addRow([])
  const totalQty = data.reduce((s, d) => s + cq(d.inventory_item?.quantity ?? d.units_sold ?? 0), 0)
  const totalAmt = data.reduce((s, d) => {
    const price = Number(d.discounted_price ?? d.original_price ?? 0)
    return s + cq(d.inventory_item?.quantity ?? d.units_sold ?? 0) * price
  }, 0)
  const sumRow = ws.addRow(['TOTALS', '', totalQty, '', totalAmt, '', '', '', '', ''])
  sumRow.font  = { bold: true }
  sumRow.getCell(5).numFmt = '₦#,##0.00'

  return Buffer.from(await wb.xlsx.writeBuffer())
}

// ─────────────────────────────────────────────────────────────
// REPORT 4: COMPREHENSIVE (all sheets in one workbook)
// ─────────────────────────────────────────────────────────────
export async function generateComprehensiveReport(
  expiryData:   any[],
  damageData:   any[],
  discountData: any[],
): Promise<Buffer> {
  // Reuse individual generators but combine into one workbook
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Foodco Arulogun System'
  wb.created = new Date()

  // ── Summary sheet ──
  const summary = wb.addWorksheet('📊 Summary')
  summary.columns = [{ width: 30 }, { width: 20 }, { width: 20 }]

  const titleRow = summary.addRow(['FOODCO ARULOGUN — COMPREHENSIVE REPORT'])
  titleRow.height = 30
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } }
  titleRow.getCell(1).font = { bold: true, color: { argb: WHITE }, size: 14 }
  summary.mergeCells('A1:C1')

  summary.addRow([`Generated: ${new Date().toLocaleString('en-NG')}`])
  summary.addRow([])

  const metrics = [
    ['EXPIRY RISK', '', ''],
    ['Items expiring in ≤7 days', expiryData.filter(i => {
      const d = Math.ceil((new Date(i.expiry_date).getTime() - Date.now()) / 86400000)
      return d >= 0 && d <= 7
    }).length, 'batches'],
    ['Total value at risk (7d)', `₦${expiryData.filter(i => {
      const d = Math.ceil((new Date(i.expiry_date).getTime() - Date.now()) / 86400000)
      return d >= 0 && d <= 7
    }).reduce((s, i) => s + cq(i.quantity) * Number(i.selling_price), 0).toLocaleString()}`, ''],
    ['', '', ''],
    ['DAMAGE', '', ''],
    ['Total damage records', damageData.length, 'records'],
    ['Approved loss', `₦${damageData.filter(r => r.status === 'approved').reduce((s, r) => s + Number(r.estimated_value_lost), 0).toLocaleString()}`, ''],
    ['', '', ''],
    ['DISCOUNTS', '', ''],
    ['Active discounts', discountData.filter(d => d.status === 'active').length, 'active'],
    ['Total revenue recovered', `₦${discountData.reduce((s, d) => s + Number(d.revenue_recovered), 0).toLocaleString()}`, ''],
  ]

  metrics.forEach((row, i) => {
    const r = summary.addRow(row)
    if (row[1] === '' && row[0] !== '') {
      r.font = { bold: true, color: { argb: GREEN } }
      r.height = 20
    }
  })

  // ── Add individual sheets (simplified) ──
  // Expiry sheet
  const expiryWs = wb.addWorksheet('📦 Expiry Risk')
  expiryWs.addRow(['Product', 'SKU', 'Qty', 'Selling Price', 'Expiry Date', 'Days Left', 'Value at Risk'])
  expiryData.forEach(i => {
    const days = Math.ceil((new Date(i.expiry_date).getTime() - Date.now()) / 86400000)
    expiryWs.addRow([
      i.product?.name, i.product?.sku, cq(i.quantity),
      Number(i.selling_price), new Date(i.expiry_date).toLocaleDateString('en-NG'),
      days, cq(i.quantity) * Number(i.selling_price),
    ])
  })

  // Damage sheet
  const damageWs = wb.addWorksheet('⚠️ Damage Log')
  damageWs.addRow(['Product', 'Qty Damaged', 'Reason', 'Value Lost', 'Status', 'Reported By', 'Approved By', 'Date Reported'])
  damageData.forEach(r => {
    damageWs.addRow([
      r.inventory_item?.product?.name, cq(r.quantity_damaged),
      r.reason, Number(r.estimated_value_lost),
      r.status,
      r.reporter?.full_name ?? '—',
      r.approver?.full_name ?? '—',
      r.reported_at ? new Date(r.reported_at).toLocaleDateString('en-NG') : '—',
    ])
  })

  // Discounts sheet
  const discWs = wb.addWorksheet('🏷️ Discounts')
  discWs.addRow(['Product', 'Discount %', 'Original', 'Discounted', 'Units Sold', 'Recovered', 'Status', 'Applied By', 'Approved By'])
  discountData.forEach(d => {
    discWs.addRow([
      d.inventory_item?.product?.name, d.discount_percentage,
      Number(d.original_price), Number(d.discounted_price),
      d.units_sold, Number(d.revenue_recovered), d.status,
      d.applicant?.full_name ?? '—',
      d.approver?.full_name ?? '—',
    ])
  })

  return Buffer.from(await wb.xlsx.writeBuffer())
}

// ─────────────────────────────────────────────────────────────
// REPORT 5: LOSS CONTROL REPORT (pending reported items)
// ─────────────────────────────────────────────────────────────
export async function generateLossControlReport(items: any[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Foodco Arulogun System'
  wb.created = new Date()

  const ws = wb.addWorksheet('Loss Control Report', {
    pageSetup: { orientation: 'landscape', fitToPage: true },
  })

  ws.columns = [
    { key: 'description',  width: 32 },
    { key: 'barcode',      width: 16 },
    { key: 'qty',          width: 10 },
    { key: 'price',        width: 16 },
    { key: 'amount',       width: 16 },
    { key: 'reason',       width: 22 },
    { key: 'expiry_date',  width: 16 },
  ]

  function getCondition(item: any): string {
    switch (item.pipeline_stage) {
      case 'damage_reported': {
        const reason = item.damage_records?.[0]?.reason
        return reason ?? 'Damaged'
      }
      case 'discount_reported': {
        const disc = item.discounts?.[0]
        return disc?.name ?? disc?.discount_type ?? 'Discounted'
      }
      case 'expiry_reported':
        return 'About to Expire'
      default:
        return item.pipeline_stage
    }
  }

  function formatExpiryDate(item: any): string {
    if (item.pipeline_stage !== 'expiry_reported' || !item.expiry_date) return '—'
    return new Date(item.expiry_date).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  const stageTitle: Record<string, string> = {
    damage_reported:   'DAMAGE REPORT',
    discount_reported: 'DISCOUNT REPORT',
    expiry_reported:   'ABOUT TO EXPIRE REPORT',
  }

  const stages   = [...new Set(items.map(i => i.pipeline_stage))]
  const repTitle = stages.length === 1
    ? (stageTitle[stages[0]] ?? 'LOSS CONTROL REPORT')
    : 'LOSS CONTROL REPORT'

  addBrandHeader(ws, repTitle, `Pending items — ${new Date().toLocaleDateString('en-NG')}`)

  const headerRow = ws.addRow(['Description', 'Barcode', 'Qty', 'Price (₦)', 'Amount (₦)', 'Reason', 'Expiry Date'])
  applyHeaderRow(headerRow)

  items.forEach((item, i) => {
    const price  = Number(item.selling_price)
    const amount = cq(item.quantity) * price
    const row = ws.addRow([
      item.product?.name ?? '—',
      item.product?.sku  ?? '—',
      cq(item.quantity),
      price,
      amount,
      getCondition(item),
      formatExpiryDate(item),
    ])
    applyDataRow(row, i)
    row.getCell(4).numFmt = '₦#,##0.00'
    row.getCell(5).numFmt = '₦#,##0.00'
  })

  ws.addRow([])
  const totalAmt = items.reduce((s, i) => s + cq(i.quantity) * Number(i.selling_price), 0)
  const totalQty = items.reduce((s, i) => s + cq(i.quantity), 0)
  const sumRow   = ws.addRow(['TOTALS', '', totalQty, '', totalAmt, '', ''])
  sumRow.font    = { bold: true }
  sumRow.getCell(5).numFmt = '₦#,##0.00'

  return Buffer.from(await wb.xlsx.writeBuffer())
}

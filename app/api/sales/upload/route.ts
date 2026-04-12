import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import ExcelJS from 'exceljs'
import { logAudit } from '@/lib/services/audit'

// ── Column pattern detection ─────────────────────────────────
const PATTERNS: Record<string, string[]> = {
  date:       ['date', 'sale date', 'transaction date', 'txn date', 'sales date', 'trans date'],
  product:    ['description', 'desc', 'product', 'item', 'product name', 'item name', 'goods',
               'commodity', 'section', 'subfamily', 'sub family', 'sub-family'],
  sku:        ['sku', 'bar code', 'barcode', 'code', 'product code', 'item code', 'upc',
               'reference', 'ref'],
  quantity:   ['qty', 'quantity', 'units', 'pieces', 'count', 'no of units', 'unit sold', 'units sold'],
  unit_price: ['unit price', 'price', 'selling price', 'rate'],
  total:      ['amount', 'total', 'total amount', 'value', 'sales', 'revenue', 'gross', 'net'],
  category:   ['department', 'dept', 'category', 'type', 'group', 'class', 'family'],
  cashier:    ['cashier', 'staff', 'served by', 'operator', 'attendant', 'seller', 'employee'],
  cost:       ['cost', 'cogs', 'cost price', 'buying price', 'purchase price'],
  profit:     ['profit', 'gross profit', 'net profit', 'margin amount'],
  margin:     ['% m/s', '% m', 'margin %', 'margin', 'margin pct', 'gp%', 'gp %'],
}

function detectCol(headers: string[], key: string): number {
  const patterns = PATTERNS[key]
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] ?? '').toLowerCase().trim()
    if (patterns.some(p => h === p || h.includes(p))) return i
  }
  return -1
}

/**
 * Exact-match column detector.
 * Prevents "family" from matching "subfamily" which includes() would allow.
 */
function detectColExact(headers: string[], patterns: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] ?? '').toLowerCase().trim()
    if (patterns.some(p => h === p)) return i
  }
  return -1
}

// ── Date helpers ─────────────────────────────────────────────
function parseDate(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) return val.toISOString().split('T')[0]
  // Excel serial
  if (typeof val === 'number') {
    const epoch = new Date(1899, 11, 30)
    epoch.setDate(epoch.getDate() + Math.floor(val))
    return epoch.toISOString().split('T')[0]
  }
  const s = String(val)
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const parts = s.split(/[\/\-\.]/)
  if (parts.length === 3) {
    const [a, b, c] = parts
    const attempt = new Date(`${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`)
    if (!isNaN(attempt.getTime())) return attempt.toISOString().split('T')[0]
  }
  return null
}

/** Extract date range from title cells like "Sales: (16/02/2026,22/02/2026)" */
function extractTitleDates(row: ExcelJS.Row): { from: string | null; to: string | null } {
  let combined = ''
  row.eachCell((cell) => {
    const v = String(cell.value ?? '')
    if (v.includes('Sales:') || /\d{2}\/\d{2}\/\d{4}/.test(v)) combined += ' ' + v
  })
  const matches = combined.match(/(\d{2}\/\d{2}\/\d{4})/g)
  if (!matches || matches.length === 0) return { from: null, to: null }
  return {
    from: parseDate(matches[0]),
    to:   parseDate(matches[matches.length - 1]),
  }
}

/** Detect if a row is a "title" row (merged header, not column labels) */
function isTitleRow(headers: string[]): boolean {
  return headers.some(h => {
    const v = h.toLowerCase()
    return v.includes('sales:') || v.includes('related fields') || /\d{2}\/\d{2}\/\d{4}/.test(h)
  })
}

/** Safe numeric extraction — unwraps ExcelJS formula-result objects */
function toNum(val: any): number {
  if (val === null || val === undefined) return 0
  if (typeof val === 'object') {
    // ExcelJS formula cell: { formula, result }
    const r = (val as any).result
    return isNaN(Number(r)) ? 0 : Number(r)
  }
  return isNaN(Number(val)) ? 0 : Number(val)
}

/** Convert a raw cell value to a trimmed string, or '' if it's a formula object */
function cellStr(val: any): string {
  if (!val || typeof val === 'object') return ''
  return String(val).trim()
}

// POST /api/sales/upload
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'No form data received' }, { status: 400 })
  }

  const file  = formData.get('file') as File | null
  const notes = formData.get('notes') as string | null

  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['xlsx', 'xls'].includes(ext ?? '')) {
    return NextResponse.json({ error: 'Only .xlsx and .xls files are supported' }, { status: 400 })
  }

  const buffer   = Buffer.from(await file.arrayBuffer())
  const workbook = new ExcelJS.Workbook()
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any)
  } catch (e: any) {
    console.error('[sales/upload] ExcelJS load error:', e.message)
    return NextResponse.json({ error: `Failed to read Excel file: ${e.message}` }, { status: 400 })
  }

  const sheet = workbook.worksheets[0]
  if (!sheet) return NextResponse.json({ error: 'No worksheet found in file' }, { status: 400 })

  // ── Detect header row ─────────────────────────────────────────────────────
  // Row 1 may be a title/date row ("Sales: (dd/mm/yyyy,...)") → headers shift to row 2
  const row1 = sheet.getRow(1)
  const row1Vals: string[] = []
  row1.eachCell((cell) => row1Vals.push(String(cell.value ?? '')))

  let headerRowNum = 1
  let titleDates: { from: string | null; to: string | null } = { from: null, to: null }

  if (isTitleRow(row1Vals)) {
    titleDates   = extractTitleDates(row1)
    headerRowNum = 2
  }

  const headerRow = sheet.getRow(headerRowNum)
  const headers: string[] = []
  headerRow.eachCell((cell) => headers.push(String(cell.value ?? '')))

  // ── Map standard numeric columns (used in both modes) ────────────────────
  const colIdx = {
    date:       detectCol(headers, 'date'),
    product:    detectCol(headers, 'product'),
    sku:        detectCol(headers, 'sku'),
    quantity:   detectCol(headers, 'quantity'),
    unit_price: detectCol(headers, 'unit_price'),
    total:      detectCol(headers, 'total'),
    category:   detectCol(headers, 'category'),
    cashier:    detectCol(headers, 'cashier'),
    cost:       detectCol(headers, 'cost'),
    profit:     detectCol(headers, 'profit'),
    margin:     detectCol(headers, 'margin'),
  }

  // ── Detect hierarchy mode (SALES LST.XLS: Dept / Section / Family / SubFamily) ──
  // Use exact match so "Family" doesn't catch "SubFamily"
  const colHierDept    = detectColExact(headers, ['department', 'dept'])
  const colHierSection = detectColExact(headers, ['section'])
  const colHierFamily  = detectColExact(headers, ['family'])
  const colHierSub     = detectColExact(headers, ['subfamily', 'sub family', 'sub-family'])
  const isHierarchy    = colHierSection >= 0 && colHierFamily >= 0

  console.log(`[sales/upload] File="${file.name}" isHierarchy=${isHierarchy} headers=[${headers.join(', ')}]`)

  if (!isHierarchy && colIdx.product === -1) {
    return NextResponse.json({
      error: `Could not detect a Product/Item column. Found headers: ${headers.join(', ')}`,
    }, { status: 400 })
  }

  // ── Parse rows ───────────────────────────────────────────────────────────
  const rows: any[] = []
  let periodFrom = titleDates.from
  let periodTo   = titleDates.to

  if (isHierarchy) {
    // ══════════════════════════════════════════════════════════════════════════
    // HIERARCHY MODE — SALES LST.XLS  (Dept → Section → Family → SubFamily)
    //
    // Problem: the file contains BOTH subtotal rows AND leaf-level rows together,
    // causing massive double-counting if all rows are stored.
    //
    // Solution: two-pass leaf detection.
    //   Pass 1 — collect every row with its full 4-level context.
    //   Pass 2 — keep only "leaf" rows (most granular for each branch).
    //
    // Leaf rules:
    //   • SubFamily row (col D non-empty)  → always a leaf
    //   • Family row (col C, col D empty)  → leaf only if no SubFamily rows
    //                                         share the same (section, family)
    //   • Section row (col B, C+D empty)   → leaf only if no Family rows
    //                                         share the same section
    //
    // Category assignment for charts (makes Family-level entities like
    // "SUNFRESH RETAIL" appear as their own department group):
    //   • SubFamily leaf  → product=SubFamily,  category=Family
    //   • Family leaf     → product=Family,     category=Section
    //   • Section leaf    → product=Section,    category=Dept
    // ══════════════════════════════════════════════════════════════════════════

    type RawHRow = {
      dept: string; section: string; family: string; subfamily: string
      qty: number; total: number; cost: number | null; profit: number | null
      margin: number | null; saleDate: string | null; sku: string | null
    }

    const rawRows: RawHRow[] = []
    let currentDept = ''

    sheet.eachRow((row, rowNum) => {
      if (rowNum <= headerRowNum) return
      const get = (idx: number) => idx >= 0 ? row.getCell(idx + 1).value : null

      const deptStr    = cellStr(colHierDept    >= 0 ? get(colHierDept)    : null)
      const sectionStr = cellStr(colHierSection >= 0 ? get(colHierSection) : null)
      const familyStr  = cellStr(colHierFamily  >= 0 ? get(colHierFamily)  : null)
      const subStr     = cellStr(colHierSub     >= 0 ? get(colHierSub)     : null)

      // Dept-header sentinel rows (col A has dept name, everything else empty)
      if (deptStr && !sectionStr && !familyStr && !subStr) {
        currentDept = deptStr
        return
      }

      // Skip rows with no name at any level (blanks, formula-only rows)
      if (!sectionStr && !familyStr && !subStr) return

      // Skip obvious totals rows
      const nameLabel = subStr || familyStr || sectionStr
      if (/^(total|grand total|sub.?total|sum)$/i.test(nameLabel)) return

      const qty   = toNum(get(colIdx.quantity))
      const total = toNum(get(colIdx.total))
      // Skip zero-data rows (empty aggregate placeholders)
      if (qty === 0 && total === 0) return

      let saleDate: string | null = titleDates.from
      if (colIdx.date >= 0) {
        const d = parseDate(get(colIdx.date))
        if (d) saleDate = d
      }
      if (!titleDates.from && saleDate) {
        if (!periodFrom || saleDate < periodFrom) periodFrom = saleDate
        if (!periodTo   || saleDate > periodTo)   periodTo   = saleDate
      }

      const cost   = colIdx.cost   >= 0 ? toNum(get(colIdx.cost))   : null
      const profit = colIdx.profit >= 0 ? toNum(get(colIdx.profit)) : null
      const mRaw   = colIdx.margin >= 0 ? toNum(get(colIdx.margin)) : null
      const margin = mRaw !== null && Math.abs(mRaw) <= 9999 ? mRaw : null

      rawRows.push({
        dept: currentDept,
        section: sectionStr,
        family: familyStr,
        subfamily: subStr,
        qty,
        total,
        cost,
        profit,
        margin,
        saleDate,
        sku: colIdx.sku >= 0 ? String(get(colIdx.sku) ?? '').trim() || null : null,
      })
    })

    // ── Pass 2: identify leaves ─────────────────────────────────────────────
    const familyHasSubfamily = new Set<string>() // key = `${section}||${family}`
    const sectionHasFamily   = new Set<string>() // key = section

    for (const r of rawRows) {
      if (r.subfamily) {
        familyHasSubfamily.add(`${r.section}||${r.family}`)
        sectionHasFamily.add(r.section)
      } else if (r.family) {
        sectionHasFamily.add(r.section)
      }
    }

    for (const r of rawRows) {
      const fk = `${r.section}||${r.family}`
      let productName: string
      let category: string | null

      if (r.subfamily) {
        // Most granular level — always a leaf
        // category = Family so SUNFRESH RETAIL shows as its own dept group in charts
        productName = r.subfamily
        category    = r.family || r.section || r.dept || null
      } else if (r.family && !familyHasSubfamily.has(fk)) {
        // Family-level leaf — no subfamilies exist beneath this family
        productName = r.family
        category    = r.section || r.dept || null
      } else if (!r.family && r.section && !sectionHasFamily.has(r.section)) {
        // Section-level leaf — no families exist beneath this section
        productName = r.section
        category    = r.dept || null
      } else {
        // Aggregate row — has more-specific children; skip to prevent double-counting
        continue
      }

      rows.push({
        sale_date:    r.saleDate,
        product_name: productName,
        sku:          r.sku,
        quantity:     r.qty,
        unit_price:   0,
        total_amount: r.total,
        category,
        cashier:      null,
        cost:         r.cost,
        profit:       r.profit,
        margin_pct:   r.margin,
      })
    }

    console.log(`[sales/upload] Hierarchy mode: ${rawRows.length} raw → ${rows.length} leaf rows | file="${file.name}"`)

  } else {
    // ══════════════════════════════════════════════════════════════════════════
    // FLAT MODE — SALES LST ITEM.XLS (one row = one distinct product)
    // ══════════════════════════════════════════════════════════════════════════
    let currentCategory = ''

    sheet.eachRow((row, rowNum) => {
      if (rowNum <= headerRowNum) return

      const get = (idx: number) => idx >= 0 ? row.getCell(idx + 1).value : null

      const productRaw  = get(colIdx.product)
      const categoryRaw = colIdx.category >= 0 ? get(colIdx.category) : null

      // Dept-header rows: product col empty, category col has a value
      if (!productRaw || typeof productRaw === 'object') {
        if (categoryRaw && typeof categoryRaw !== 'object') {
          const catStr = String(categoryRaw).trim()
          if (catStr) currentCategory = catStr
        }
        return
      }

      const productStr = String(productRaw).trim()
      if (!productStr) return

      // Skip obvious totals rows
      if (/^(total|grand total|sub.?total|sum)$/i.test(productStr)) return

      const qty   = toNum(get(colIdx.quantity))
      const total = toNum(get(colIdx.total))

      // Resolve category: inline value OR tracked dept header
      const effectiveCategory = categoryRaw && typeof categoryRaw !== 'object'
        ? String(categoryRaw).trim() || (currentCategory || null)
        : (currentCategory || null)

      let saleDate: string | null = null
      if (colIdx.date >= 0) saleDate = parseDate(get(colIdx.date))
      if (!saleDate) saleDate = titleDates.from

      if (!titleDates.from && saleDate) {
        if (!periodFrom || saleDate < periodFrom) periodFrom = saleDate
        if (!periodTo   || saleDate > periodTo)   periodTo   = saleDate
      }

      const price     = toNum(get(colIdx.unit_price))
      const cost      = colIdx.cost   >= 0 ? toNum(get(colIdx.cost))   : null
      const profit    = colIdx.profit >= 0 ? toNum(get(colIdx.profit)) : null
      const mRaw      = colIdx.margin >= 0 ? toNum(get(colIdx.margin)) : null
      const margin    = mRaw !== null && Math.abs(mRaw) <= 9999 ? mRaw : null

      let resolvedTotal = total
      if (resolvedTotal === 0 && qty > 0 && price > 0) resolvedTotal = qty * price

      rows.push({
        sale_date:    saleDate,
        product_name: productStr,
        sku:          colIdx.sku >= 0 ? String(get(colIdx.sku) ?? '').trim() || null : null,
        quantity:     qty,
        unit_price:   price,
        total_amount: resolvedTotal,
        category:     effectiveCategory,
        cashier:      colIdx.cashier >= 0 ? String(get(colIdx.cashier) ?? '').trim() || null : null,
        cost,
        profit,
        margin_pct:   margin,
      })
    })

    console.log(`[sales/upload] Flat mode: ${rows.length} rows | file="${file.name}"`)
  }

  console.log(`[sales/upload] Total: ${rows.length} rows | periodFrom=${periodFrom} periodTo=${periodTo}`)

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No data rows found. Make sure the file has recognisable headers.' }, { status: 400 })
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  const admin = createAdminClient()

  const { data: upload, error: uploadErr } = await admin
    .from('sales_uploads')
    .insert({
      file_name:   file.name,
      period_from: periodFrom,
      period_to:   periodTo,
      uploaded_by: user.id,
      row_count:   rows.length,
      notes:       notes || null,
      file_type:   isHierarchy ? 'department' : 'item',
    })
    .select()
    .single()

  if (uploadErr) {
    console.error('[sales/upload] sales_uploads INSERT error:', uploadErr)
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  console.log(`[sales/upload] Created upload record id=${upload.id}`)

  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH).map(r => ({ ...r, upload_id: upload.id }))
    const { error } = await admin.from('sales_records').insert(chunk)
    if (error) {
      console.error(`[sales/upload] sales_records batch INSERT error (i=${i}):`, error)
      await admin.from('sales_uploads').delete().eq('id', upload.id)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    console.log(`[sales/upload] Inserted batch ${Math.floor(i / BATCH) + 1}: rows ${i}–${Math.min(i + BATCH - 1, rows.length - 1)}`)
  }

  logAudit({ userId: user.id, module: 'sales', action: 'upload', entityId: upload.id, entityLabel: upload.file_name ?? 'Sales upload', details: { row_count: rows.length } })
  return NextResponse.json({ upload, row_count: rows.length }, { status: 201 })
}

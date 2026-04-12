import { google } from 'googleapis'

const SHEET_ID         = process.env.GOOGLE_SHEET_ID!
const SHEET_TAB        = process.env.GOOGLE_SHEET_TAB        ?? 'ARULOGUN'
const LOGISTICS_SHEET_ID  = process.env.LOGISTICS_SHEET_ID   ?? process.env.GOOGLE_SHEET_ID!
const LOGISTICS_TAB       = process.env.LOGISTICS_SHEET_TAB  ?? 'OUTLET LOG'

function getAuthClient() {
  return new google.auth.JWT({
    email:  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    key:    process.env.GOOGLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export interface LossControlSheetRow {
  description:    string   // product name
  barcode:        string   // SKU
  quantity:       number
  price:          number   // selling price per unit
  amount:         number   // quantity × price
  reason:         string   // damage reason / discount type / Expiry
  dateLogged:     string   // formatted date
}

/**
 * Appends one or more loss control items to the Google Sheet.
 * Matches existing columns: DESCRIPTION | BARCODE | QUANTITY | PRICE | AMOUNT | REASON | DATE LOGGED | ACTION TAKEN BY LC
 */
export async function appendLossControlRows(rows: LossControlSheetRow[]): Promise<void> {
  const auth   = getAuthClient()
  const sheets = google.sheets({ version: 'v4', auth })

  const values = rows.map(r => [
    r.description,
    r.barcode,
    r.quantity,
    r.price,
    r.amount,
    r.reason,
    r.dateLogged,
    '',   // ACTION TAKEN BY LC — filled in manually by Loss Control team
  ])

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range:         `${SHEET_TAB}!A:H`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  })
}

export interface LogisticsSheetRow {
  skusLoaded:        number
  truckArrival:      string   // HH:MM
  offloadingStart:   string   // HH:MM
  offloadingEnd:     string   // HH:MM
  truckDeparture:    string   // HH:MM
  staffCount:        number
  skusReceived:      number
  discrepancyUnits:  number
  discrepancyType:   string
  escalate:          string   // YES / NO
  outletLeader:      string
}

/**
 * Appends a logistics movement row to the LOGISTICS sheet tab.
 * Columns: No. of SKUs Loaded | Truck Arrival | Offloading Start |
 *          Offloading End | Truck Departure | Staff | SKUs Received |
 *          Discrepancy Units | Discrepancy Type | Escalate? | Outlet Leader
 */
function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID!,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
  )
}

export async function appendLogisticsRow(row: LogisticsSheetRow): Promise<void> {
  // Use OAuth2 as arulogun@foodco.ng — bypasses domain sheet protection
  const oauth = getOAuthClient()
  oauth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN! })
  const sheets = google.sheets({ version: 'v4', auth: oauth })

  // Wrap tab name in single quotes to handle spaces (required by Sheets API)
  const safeTab = `'${LOGISTICS_TAB}'`

  // Use column G to find the last used row, then write to a specific range.
  // This avoids the Sheets API 'append' behaviour where it detects the table
  // anchor from column A (which has existing data) and writes from A instead of G.
  const colG = await sheets.spreadsheets.values.get({
    spreadsheetId: LOGISTICS_SHEET_ID,
    range:         `${safeTab}!G:G`,
  })
  const nextRow = (colG.data.values?.length ?? 0) + 1

  await sheets.spreadsheets.values.update({
    spreadsheetId:    LOGISTICS_SHEET_ID,
    range:            `${safeTab}!G${nextRow}:Q${nextRow}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [[
        row.skusLoaded,
        row.truckArrival,
        row.offloadingStart,
        row.offloadingEnd,
        row.truckDeparture,
        row.staffCount,
        row.skusReceived,
        row.discrepancyUnits,
        row.discrepancyType,
        row.escalate,
        row.outletLeader,
      ]],
    },
  })
}

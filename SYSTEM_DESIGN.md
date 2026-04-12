# Foodco Arulogun - Retail Command System v2.0
### Brand Identity Application

---

## Brand Colors

| Role | Color | Hex | Purpose |
|------|-------|-----|---------|
| Primary | Green | `#2E7D32` | Trust, growth, freshness. Primary buttons, success states, navigation. |
| Accent | Yellow | `#FFC107` | Urgency, attention, optimism. Warnings (expiry alerts), highlights, AI suggestions. |
| Base | White | `#FFFFFF` | Cleanliness, clarity. Backgrounds, cards, negative space. |
| Neutral | Gray | `#F5F5F5` | Secondary backgrounds, dividers. |

```css
:root {
  --brand-green: #2E7D32;
  --brand-yellow: #FFC107;
  --brand-white: #FFFFFF;
  --gray-bg: #F5F5F5;
  --text-dark: #333333;
  --alert-critical: #D32F2F; /* Use sparingly */
}
```

---

## 1. Dashboard — "The Command Center"

**Layout Concept:**

```
┌─────────────────────────────────────────────────────────────┐
│  FOODCO ARULOGUN                                   ADMIN ▼  │
│  [Green Header Bar]                                   09:41 │
├──────────┬──────────────────────────────────────────────────┤
│          │  GOOD MORNING, CHUKWUDI 👋                        │
│   [G]    │  Today's Summary | Mar 15, 2025                  │
│   R      ├──────────┬──────────┬──────────┬───────────┬─────┤
│   E      │ 45,200   │ 23       │ 8        │ 12,500    │     │
│   E      │ Revenue  │ At Risk  │ Expired  │ Discounts │     │
│   N      │ Today    │ Items    │ Today    │ Active    │     │
│   S      ├──────────┴──────────┴──────────┴───────────┴─────┤
│   I      │              AI INSIGHT OF THE DAY                │
│   D      │  "Dairy section has 12 items expiring in 48hrs.  │
│   E      │  Recommended: 35% flash discount + SMS alert to  │
│   B      │  150 loyalty customers. Apply now?"               │
│   A      │          [APPLY AI RECOMMENDATION] [DISMISS]      │
│   R      ├────────────────────────────────────────────────── │
│          │  QUICK ACTIONS PANEL                              │
│          │  [📊 Generate Report] [📧 AI Email] [⚡ Auto Alert]│
└──────────┴────────────────────────────────────────────────── ┘
```

---

## 2. Auto-Report Engine — "Intelligent Dispatch Center"

**Visual Design:**
- White card with green border accents
- Yellow call-to-action buttons for "compose"
- Progress indicators in brand green

### A. One-Click Excel Export + AI Email

```
┌────────────────────────────────────────────────────┐
│  INTELLIGENT DISPATCH CENTER              [🟢 ON]  │
├────────────────────────────────────────────────────┤
│                                                    │
│  STEP 1: SELECT REPORT TYPE                        │
│  ○ Damage Report (Last 7 days)                     │
│  ○ About-to-Expire Inventory (Filter by date)      │
│  ○ Active Discounts Performance                    │
│  ● Comprehensive Report (All categories)           │
│                                                    │
│  STEP 2: AI EMAIL COMPOSITION                      │
│  ┌────────────────────────────────────────────┐   │
│  │ To: manager@foodco.com, accounts@foodco.com│   │
│  │                                            │   │
│  │ Subject: [AI Generated] Weekly Risk Report │   │
│  │ ----------------------------------------- │   │
│  │                                            │   │
│  │ Dear Management Team,                      │   │
│  │                                            │   │
│  │ Here is your automated risk assessment for │   │
│  │ Week 11, 2025.                             │   │
│  │                                            │   │
│  │ 🔴 CRITICAL: 8 items expired today         │   │
│  │    - Total loss: ₦24,500                   │   │
│  │                                            │   │
│  │ 🟡 AT RISK: 23 items expiring within 7 days│   │
│  │    - Potential revenue at stake: ₦89,200   │   │
│  │    - AI Suggestion: Apply tiered discounts │   │
│  │      (20% for 5-7 days, 40% for 2-4 days)  │   │
│  │                                            │   │
│  │ 🟢 DISCOUNT PERFORMANCE:                   │   │
│  │    - Active discounts recovered 67%        │   │
│  │      of at-risk value. Continue strategy.  │   │
│  │                                            │   │
│  │ Attached: Full_Inventory_Risk_Report.xlsx  │   │
│  │ ─────────────────────────────────────────  │   │
│  │ [✏️ EDIT EMAIL] [📎 PREVIEW EXCEL] [📧 SEND]│   │
│  └────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

**AI Email Logic:**
- Scans compiled Excel data and constructs a narrative
- Identifies the highest risk category
- Quantifies financial impact
- Suggests specific actions
- Maintains professional tone (customizable: formal / casual / urgent)

---

### B. Scheduled Intelligence Reports

```
┌────────────────────────────────────────────────────┐
│  SCHEDULED REPORTS                    [+ NEW]      │
├────────────────────────────────────────────────────┤
│                                                    │
│  📅 DAILY (8:00 AM) - "Morning Risk Brief"         │
│     To: storemanager@foodco.com                    │
│     Status: 🟢 Active | Last Sent: Today 8:00 AM   │
│                                                    │
│  📅 WEEKLY (Monday 9 AM) - "Full Analysis"         │
│     To: owner@foodco.com, finance@foodco.com       │
│     Status: 🟢 Active | Includes: Excel + AI Summary│
│                                                    │
│  📅 MONTHLY - "Performance Trends"                 │
│     To: board@foodco.com                           │
│     Status: 🟡 Pending Approval                    │
│                                                    │
│  [➕ CREATE NEW SCHEDULE]                           │
└────────────────────────────────────────────────────┘
```

---

## 3. Alert & Automation System — "Smart Alerts Command Center"

**Visual Design:**
- Kanban-style board showing different alert types
- Yellow for pending alerts, green for active rules, white for history

### A. Create Alert Wizard

```
┌──────────────────────────────────────────────────────────────┐
│  CREATE NEW ALERT                          [CANCEL] [SAVE]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ALERT NAME: [Expiry Monitoring - Dairy Section           ▼] │
│                                                              │
│  TRIGGER WHEN:                                               │
│  ○ Inventory items reach [ 7 ] days to expiry               │
│  ○ Damaged goods value exceeds [ ₦50,000 ]                  │
│  ○ Discount effectiveness drops below [ 40 ]%               │
│  ● Custom Condition: [Items expiring AND quantity > 20]      │
│                                                              │
│  NOTIFICATION CHANNELS:                                      │
│  ☑ Email                                                     │
│  ☑ SMS (Requires credit)                                     │
│  ☑ In-App Notification                                       │
│  ☐ WhatsApp (Coming Soon)                                    │
│                                                              │
│  RECIPIENTS:                                                 │
│  [ inventory@foodco.com ] [ +234 803 123 4567 ]              │
│  [ Add another recipient... ]                                │
│                                                              │
│  ALERT FREQUENCY:                                            │
│  ○ Once, when triggered                                      │
│  ● Every [ 6 ] hours until resolved                          │
│  ○ Escalate if no response in [ 2 ] hours                    │
│                                                              │
│  AI-GENERATED MESSAGE PREVIEW:                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🚨 ALERT: 15 Yogurt items expiring in 3 days!        │   │
│  │                                                      │   │
│  │ Location: Aisle 3, Chiller 2                         │   │
│  │ Total Value at risk: ₦34,500                         │   │
│  │                                                      │   │
│  │ Recommended Action: Move to front chiller & apply    │   │
│  │ 25% discount immediately.                            │   │
│  │                                                      │   │
│  │ This alert will repeat every 6 hours.                │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### B. Active Alerts Dashboard

```
┌──────────────────────────────────────────────────────────────┐
│  ACTIVE ALERTS (8)                                 [HISTORY] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  🟡 [HIGH] 12 items expiring TOMORROW                        │
│     Dairy Section · Triggered 2hrs ago · Sent to Manager     │
│     [VIEW] [RESOLVE] [SNOOZE]                                │
│                                                              │
│  🟢 Discount performance alert - 5 active discounts          │
│     System · Last sent 1hr ago · Auto-resolved 50%           │
│     [VIEW DETAILS]                                           │
│                                                              │
│  🔴 [CRITICAL] Damaged goods value spike                     │
│     Warehouse · Triggered 30mins ago · Notify Owner          │
│     [INVESTIGATE] [ACKNOWLEDGE]                              │
│                                                              │
│  ⚡ SMART REMINDER: Weekly staff meeting in 2hrs             │
│     (Manual reminder set by Admin)                           │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. Permission Control — "User & Permission Manager"

**Design:** Granular role-based access control (RBAC)

```
┌──────────────────────────────────────────────────────────────┐
│  USER MANAGEMENT                                    [+ NEW]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  USERS                    ROLES                              │
│  ┌─────────────────┐     ┌───────────────────────────────┐  │
│  │ 👤 Chukwudi A.  │     │ ROLE: INVENTORY MANAGER       │  │
│  │    Admin        │     ├───────────────────────────────┤  │
│  ├─────────────────┤     │ ☑ View Inventory               │  │
│  │ 👤 Amara O.     │     │ ☑ Edit Inventory               │  │
│  │    Manager      │     │ ☑ Mark Damage                  │  │
│  ├─────────────────┤     │ ☑ View Reports                 │  │
│  │ 👤 Emeka N.     │     │ ☐ Create Reports               │  │
│  │    Cashier      │     │ ☐ Send Emails                  │  │
│  ├─────────────────┤     │ ☐ Manage Users                 │  │
│  │ 👤 Funke A.     │     │ ☐ Create Alerts                │  │
│  │    Auditor      │     │ ☑ Receive Alerts               │  │
│  └─────────────────┘     │ ☐ Approve Discounts > 30%      │  │
│                          └───────────────────────────────┘  │
│                                                              │
│  ALERT RECIPIENT GROUPS:                                     │
│  [MANAGEMENT TEAM] inventory@, manager@, +234803...          │
│  [ALERT ONLY] alert@foodco.com                               │
│  [EMERGENCY] duty.manager@foodco.com                         │
└──────────────────────────────────────────────────────────────┘
```

### Permission Matrix

| Permission | Admin | Manager | Inventory Staff | Cashier | Auditor |
|---|:---:|:---:|:---:|:---:|:---:|
| View Inventory | ✅ | ✅ | ✅ | ✅ | ✅ |
| Edit Inventory | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mark Damage | ✅ | ✅ | ✅ | ❌ | ❌ |
| View Reports | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create Reports | ✅ | ✅ | ❌ | ❌ | ✅ |
| Send Emails | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage Users | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create Alerts | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve Discounts > 30% | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## 5. UI Components

### Summary Cards

```
┌─────────────────────┐  ┌─────────────────────┐
│ TOTAL AT RISK       │  │ ACTIVE DISCOUNTS    │
│ ₦245,800            │  │ 12                  │
│ 23 items            │  │ 38% recovery rate   │
│ [Yellow Progress]   │  │ [Green Progress]    │
└─────────────────────┘  └─────────────────────┘
```

### Alert Badge System

| Badge | Color | Usage |
|-------|-------|-------|
| 🔴 Critical | Red `#D32F2F` | Use sparingly |
| 🟡 Warning | Brand Yellow `#FFC107` | Expiry alerts, at-risk items |
| 🟢 Resolved / Active | Brand Green `#2E7D32` | Success, resolved alerts |
| ⚡ AI Generated | Yellow + lightning icon | AI suggestions and actions |

### Typography Scale

| Element | Font | Style |
|---------|------|-------|
| Headlines | Montserrat | Bold, Brand Green |
| Body | Open Sans | Regular, Dark Gray |
| Data / Numbers | Roboto Mono | Financial & dashboard figures |

---

## 6. Manager's One-Page Command Center

```
┌──────────────────────────────────────────────────────────────┐
│  COMMAND CENTER                           [REFRESH] [AI]     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐           │
│  │ TODAY'S AUTO-EMAIL  │  │ ACTIVE ALERTS (5)   │           │
│  │ Sent 8:00 AM        │  │ • 3 High Priority   │           │
│  │ 3 reports generated │  │ • 2 Medium          │           │
│  │ [VIEW LOG]          │  │ [MANAGE]            │           │
│  └─────────────────────┘  └─────────────────────┘           │
│                                                              │
│  UPCOMING EXPIRIES (Next 48hrs)                              │
│  ┌──────────┬──────────┬──────────┬──────────┐              │
│  │ Yogurt   │ Bread    │ Milk     │ Veggies  │              │
│  │ 15 units │ 8 units  │ 22 units │ 10 units │              │
│  │ ⚠️ 3 days │ ⚠️ Today │ ⚠️ 2 days │ ⚠️ 1 day  │              │
│  │[DISCOUNT]│[DAMAGE]  │[DISCOUNT]│[REMOVE]  │              │
│  └──────────┴──────────┴──────────┴──────────┘              │
│                                                              │
│  AI SUGGESTED ACTIONS:                                       │
│  • Create "Flash Sale" bundle for expiring dairy             │
│  • Send SMS alert to 50 loyalty customers                    │
│  • Generate damage report for insurance claim                │
│    [APPLY ALL] [CUSTOMIZE]                                   │
└──────────────────────────────────────────────────────────────┘
```

---

## 7. Technical Implementation

### Database Schema

> Full schema: see [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) and [schema.sql](schema.sql)

**13 tables:** `roles`, `permissions`, `role_permissions`, `profiles`, `categories`, `products`, `inventory_items`, `damage_records`, `discounts`, `automated_alerts`, `alert_logs`, `scheduled_reports`, `report_logs`

**3 views:** `expiring_soon`, `active_discounts_summary`, `dashboard_kpis`

```sql
-- Alerts Table (excerpt)
CREATE TABLE automated_alerts (
    id UUID PRIMARY KEY,
    name VARCHAR(255),
    trigger_condition JSON,
    -- e.g., {"days_to_expiry": 7, "category": "dairy"}
    channels TEXT[],
    -- e.g., ['email', 'sms', 'in_app']
    recipients JSON,
    frequency VARCHAR(50),
    -- 'once' | 'hourly' | 'daily'
    ai_generated_message BOOLEAN,
    created_by UUID REFERENCES users(id),
    status VARCHAR(50)
);

-- Scheduled Reports Table
CREATE TABLE scheduled_reports (
    id UUID PRIMARY KEY,
    report_type VARCHAR(100),
    -- 'damage' | 'expiry' | 'discount' | 'comprehensive'
    schedule_cron VARCHAR(100),
    recipients TEXT[],
    include_ai_summary BOOLEAN,
    last_generated TIMESTAMP,
    next_generation TIMESTAMP
);
```

### AI Integration Points (Free / Low-Cost)

| Feature | Option A (Free) | Option B (Pay-as-you-go) |
|---------|----------------|--------------------------|
| Email Composition | Template-based dynamic insertion | OpenAI API |
| Local AI | GPT-J (self-hosted) | — |
| SMS Delivery | — | Africa's Talking API |
| Excel Generation | SheetJS / ExcelJS (free) | — |
| Email Sending | Nodemailer (free) | — |
| Scheduling | node-cron (free) | — |

### Automation Architecture

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│ Database    │───▶│ Cron Jobs    │───▶│ Rule Engine │
│ (PostgreSQL)│    │ (Every hour) │    │ (Node.js)   │
└─────────────┘    └──────────────┘    └──────┬──────┘
                                              │
              ┌───────────────────────────────┼──────────────────────┐
              ▼                               ▼                      ▼
       ┌─────────────┐               ┌─────────────┐       ┌─────────────┐
       │ Email Queue │               │ SMS Queue   │       │ In-App      │
       │ (Nodemailer)│               │ (AT Gateway)│       │ Notifications│
       └─────────────┘               └─────────────┘       └─────────────┘
```

### Recommended UI Libraries (All Free / Open-Source)

| Purpose | Library |
|---------|---------|
| Charts & Data Viz | Apache ECharts |
| Icons | Remix Icon (2000+ icons) |
| UI Component Framework | Chakra UI or Ant Design |
| Email Templates | MJML |
| Excel Export | SheetJS (community) / ExcelJS |
| Scheduler | node-cron |
| SMS | Africa's Talking API |
| Email Sending | Nodemailer |

---

## 8. Core Feature Summary

| # | Feature | Description |
|---|---------|-------------|
| 1 | Inventory Risk Tracking | Real-time monitoring of expiry dates, damage, and at-risk stock |
| 2 | Auto Excel Export | One-click generation of XLSX reports (damage, expiry, discounts, comprehensive) |
| 3 | AI Email Composition | AI-drafted emails summarizing risk data with financial impact and recommended actions |
| 4 | Scheduled Reports | Daily, weekly, monthly automated dispatches to configurable recipients |
| 5 | Smart Alert System | Rule-based triggers via email, SMS, and in-app with repeat/escalation logic |
| 6 | Role-Based Access | Granular permission matrix per user role |
| 7 | Manager Command Center | Single-page operational overview with AI suggested actions |
| 8 | Discount Management | Track active discounts, recovery rates, and AI-suggested flash sales |

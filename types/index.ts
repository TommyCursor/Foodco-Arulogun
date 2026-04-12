// ─────────────────────────────────────────────
// Domain Types — Foodco Arulogun
// ─────────────────────────────────────────────

export type InventoryStatus  = 'active' | 'discounted' | 'expired' | 'damaged' | 'removed'
export type PipelineStage   = 'logged' | 'damage_reported' | 'discount_reported' | 'expiry_reported' | 'sent_to_loss_control' | 'resolution_received' | 'sales_approved' | 'sold'
export type DamageStatus     = 'pending' | 'approved' | 'rejected'
export type DiscountType     = 'manual' | 'ai_suggested' | 'flash_sale' | 'clearance'
export type DiscountStatus   = 'active' | 'expired' | 'cancelled'
export type AlertFrequency   = 'once' | 'every_hour' | 'every_6h' | 'every_12h' | 'daily'
export type AlertLogStatus   = 'sent' | 'failed' | 'snoozed' | 'resolved' | 'acknowledged'
export type ReportType       = 'damage' | 'expiry' | 'discount' | 'comprehensive'
export type ReportLogStatus  = 'success' | 'failed'

export interface Role {
  id:          number
  name:        string
  description: string | null
  created_at:  string
}

export interface Permission {
  id:          number
  key:         string
  description: string | null
}

export interface Profile {
  id:         string
  full_name:  string
  phone:      string | null
  role_id:    number
  is_active:  boolean
  created_at: string
  updated_at: string
  role?:      Role
}

export interface Category {
  id:          number
  name:        string
  description: string | null
  created_at:  string
}

export interface Product {
  id:             string
  name:           string
  sku:            string
  category_id:    number | null
  unit:           string
  standard_price: number
  reorder_level:  number
  is_active:      boolean
  created_at:     string
  updated_at:     string
  category?:      Category
}

export interface InventoryItem {
  id:               string
  product_id:       string
  batch_number:     string | null
  quantity:         number
  quantity_damaged: number
  unit_cost:        number
  selling_price:    number
  original_price:   number
  expiry_date:      string
  manufacture_date: string | null
  location:         string | null
  status:           InventoryStatus
  pipeline_stage:   PipelineStage
  received_date:    string
  received_by:      string | null
  notes:            string | null
  created_at:       string
  updated_at:       string
  product?:         Product
  // computed fields from views
  days_to_expiry?:  number
  value_at_risk?:   number
}

export interface DamageRecord {
  id:                   string
  inventory_item_id:    string
  quantity_damaged:     number
  reason:               string
  estimated_value_lost: number
  reported_by:          string | null
  approved_by:          string | null
  status:               DamageStatus
  notes:                string | null
  reported_at:          string
  approved_at:          string | null
  inventory_item?:      InventoryItem
  reporter?:            Profile
  approver?:            Profile
}

export interface Discount {
  id:                  string
  inventory_item_id:   string
  name:                string | null
  discount_percentage: number
  discount_type:       DiscountType
  original_price:      number
  discounted_price:    number
  start_date:          string
  end_date:            string
  applied_by:          string | null
  approved_by:         string | null
  status:              DiscountStatus
  units_sold:          number
  revenue_recovered:   number
  created_at:          string
  updated_at:          string
  inventory_item?:     InventoryItem
}

export interface AlertTriggerCondition {
  type:        'days_to_expiry' | 'damage_value_exceeds' | 'discount_effectiveness_below' | 'custom'
  value:       number
  category_id?: number
  description?: string
}

export interface AlertRecipients {
  emails:  string[]
  phones:  string[]
}

export interface AutomatedAlert {
  id:                   string
  name:                 string
  trigger_condition:    AlertTriggerCondition
  channels:             string[]
  recipients:           AlertRecipients
  frequency:            AlertFrequency
  escalation_hours:     number | null
  ai_generated_message: boolean
  is_active:            boolean
  created_by:           string | null
  created_at:           string
  updated_at:           string
  creator?:             Profile
}

export interface AlertLog {
  id:                  string
  alert_id:            string | null
  triggered_at:        string
  message_sent:        string | null
  channels_used:       string[]
  recipients_notified: AlertRecipients | null
  status:              AlertLogStatus
  resolved_by:         string | null
  resolved_at:         string | null
  notes:               string | null
  alert?:              AutomatedAlert
}

export interface ScheduledReport {
  id:                 string
  name:               string
  report_type:        ReportType
  schedule_cron:      string
  recipients:         string[]
  include_ai_summary: boolean
  include_excel:      boolean
  is_active:          boolean
  last_generated:     string | null
  next_generation:    string | null
  created_by:         string | null
  created_at:         string
  updated_at:         string
}

export interface ReportLog {
  id:                  string
  scheduled_report_id: string | null
  report_type:         ReportType
  generated_at:        string
  file_url:            string | null
  email_sent_to:       string[]
  status:              ReportLogStatus
  error_message:       string | null
}

// ─────────────────────────────────────────────
// Dashboard KPI (from dashboard_kpis view)
// ─────────────────────────────────────────────
export interface DashboardKPIs {
  total_active_batches:  number
  expiring_in_7_days:    number
  expired_today:         number
  active_discounts:      number
  damage_value_today:    number
  value_at_risk_7_days:  number
}

// Auto-generated type stub for Supabase
// Replace with: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.ts
// once your Supabase project is set up

export type Database = {
  public: {
    Tables: {
      roles:              { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      permissions:        { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      role_permissions:   { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      profiles:           { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      categories:         { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      products:           { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      inventory_items:    { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      damage_records:     { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      discounts:          { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      automated_alerts:   { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      alert_logs:         { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      scheduled_reports:  { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
      report_logs:        { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }
    }
    Views: {
      expiring_soon:            { Row: Record<string, unknown> }
      active_discounts_summary: { Row: Record<string, unknown> }
      dashboard_kpis:           { Row: Record<string, unknown> }
    }
    Functions: {
      has_permission: { Args: { perm_key: string }; Returns: boolean }
    }
    Enums: {
      inventory_status:  'active' | 'discounted' | 'expired' | 'damaged' | 'removed'
      damage_status:     'pending' | 'approved' | 'rejected'
      discount_type:     'manual' | 'ai_suggested' | 'flash_sale' | 'clearance'
      discount_status:   'active' | 'expired' | 'cancelled'
      alert_frequency:   'once' | 'every_hour' | 'every_6h' | 'every_12h' | 'daily'
      alert_log_status:  'sent' | 'failed' | 'snoozed' | 'resolved' | 'acknowledged'
      report_type:       'damage' | 'expiry' | 'discount' | 'comprehensive'
      report_log_status: 'success' | 'failed'
    }
  }
}

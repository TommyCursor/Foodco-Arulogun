import { createAdminClient } from '@/lib/supabase/admin'

export type AuditModule =
  | 'inventory'
  | 'damage'
  | 'discounts'
  | 'users'
  | 'reports'
  | 'alerts'
  | 'loss_control'
  | 'cashier'
  | 'roster'
  | 'sales'
  | 'leave_requests'
  | 'logistics'

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'cancel'
  | 'stage_change'
  | 'invite'
  | 'sold'
  | 'wasted'
  | 'publish'
  | 'generate'
  | 'resolve'
  | 'upload'

export async function logAudit(opts: {
  userId: string
  module: AuditModule
  action: AuditAction
  entityId?: string
  entityLabel?: string
  details?: Record<string, unknown>
}) {
  try {
    const admin = createAdminClient()
    await admin.from('audit_logs').insert({
      user_id:      opts.userId,
      module:       opts.module,
      action:       opts.action,
      entity_id:    opts.entityId    ?? null,
      entity_label: opts.entityLabel ?? null,
      details:      opts.details     ?? null,
    })
  } catch {
    // fire-and-forget: never break the main request
  }
}

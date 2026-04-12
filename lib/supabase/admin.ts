import { createClient } from '@supabase/supabase-js'

// Bypasses RLS — use ONLY in secure server-side operations
// (scheduled reports, cron jobs, admin actions)
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

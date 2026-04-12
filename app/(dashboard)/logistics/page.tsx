import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LogisticsClient from './LogisticsClient'

export const dynamic = 'force-dynamic'

export default async function LogisticsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return <LogisticsClient />
}

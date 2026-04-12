import { requirePermission } from '@/lib/auth/getProfile'
import ScanClient from './ScanClient'

export const metadata = { title: 'Image to Text — Foodco Arulogun' }

export default async function ScanPage() {
  await requirePermission('view_scan')
  return <ScanClient />
}

import type { Metadata } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import Providers from './providers'
import './globals.css'

export const metadata: Metadata = {
  title: 'Foodco Arulogun',
  description: 'Retail Command System — Inventory, Alerts & Reports',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AntdRegistry>
          <Providers>
            {children}
          </Providers>
        </AntdRegistry>
      </body>
    </html>
  )
}

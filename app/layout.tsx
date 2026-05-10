import type { Metadata, Viewport } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { Montserrat, Open_Sans, Roboto_Mono } from 'next/font/google'
import Providers from './providers'
import './globals.css'

const montserrat = Montserrat({
  subsets:  ['latin'],
  variable: '--font-montserrat',
  display:  'swap',
  weight:   ['400', '500', '600', '700'],
})

const openSans = Open_Sans({
  subsets:  ['latin'],
  variable: '--font-open-sans',
  display:  'swap',
  weight:   ['400', '500', '600', '700'],
})

const robotoMono = Roboto_Mono({
  subsets:  ['latin'],
  variable: '--font-roboto-mono',
  display:  'swap',
  weight:   ['400', '500'],
})

export const viewport: Viewport = {
  themeColor:   '#2E7D32',
  width:        'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title:       'Foodco Arulogun',
  description: 'Retail Command System — Inventory, Alerts & Reports',
  manifest:    '/manifest.json',
  appleWebApp: {
    capable:        true,
    statusBarStyle: 'default',
    title:          'Foodco Arulogun',
  },
  icons: {
    icon:  [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${openSans.variable} ${robotoMono.variable}`}>
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

'use client'

import { ConfigProvider, App } from 'antd'
import { ANT_THEME } from '@/lib/constants'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider theme={ANT_THEME}>
      <App>{children}</App>
    </ConfigProvider>
  )
}

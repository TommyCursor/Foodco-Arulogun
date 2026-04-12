'use client'

import { useRouter } from 'next/navigation'
import { Button, Result } from 'antd'

export default function UnauthorizedPage() {
  const router = useRouter()

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
      <Result
        status="403"
        title="Access Denied"
        subTitle="You don't have permission to view this page. Contact your administrator if you think this is a mistake."
        extra={
          <Button type="primary" onClick={() => router.push('/dashboard')}>
            Back to Dashboard
          </Button>
        }
      />
    </div>
  )
}

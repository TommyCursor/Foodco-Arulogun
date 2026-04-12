'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Form, Input, Button, Card, Typography, Alert, Divider } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/constants'

const { Text } = Typography

export default function LoginPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  const deactivated = searchParams.get('error') === 'deactivated'

  async function handleLogin(values: { email: string; password: string }) {
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Card
      style={{
        width: '100%',
        maxWidth: 420,
        borderRadius: 16,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        border: 'none',
      }}
      styles={{ body: { padding: 'clamp(24px, 6vw, 40px) clamp(20px, 7vw, 36px)' } }}
    >
      {/* Logo / Brand */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Image
          src="/logo.png"
          alt="Foodco Arulogun"
          width={120}
          height={80}
          style={{ objectFit: 'contain', marginBottom: 12 }}
          priority
        />
        <Text style={{ color: '#666', fontSize: 13, display: 'block' }}>
          Arulogun Operations System
        </Text>
      </div>

      <Divider style={{ margin: '0 0 24px' }} />

      {deactivated && (
        <Alert
          message="Account deactivated"
          description="Your account has been deactivated. Contact your administrator to regain access."
          type="error"
          showIcon
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}

      {error && (
        <Alert
          message={error}
          type="error"
          showIcon
          style={{ marginBottom: 20, borderRadius: 8 }}
        />
      )}

      <Form
        name="login"
        onFinish={handleLogin}
        layout="vertical"
        requiredMark={false}
      >
        <Form.Item
          name="email"
          label={<Text strong>Email Address</Text>}
          rules={[
            { required: true, message: 'Email is required' },
            { type: 'email', message: 'Enter a valid email' },
          ]}
        >
          <Input
            prefix={<UserOutlined style={{ color: '#ccc' }} />}
            placeholder="you@foodco.com"
            size="large"
            style={{ borderRadius: 8 }}
          />
        </Form.Item>

        <Form.Item
          name="password"
          label={<Text strong>Password</Text>}
          rules={[{ required: true, message: 'Password is required' }]}
        >
          <Input.Password
            prefix={<LockOutlined style={{ color: '#ccc' }} />}
            placeholder="Enter your password"
            size="large"
            style={{ borderRadius: 8 }}
          />
        </Form.Item>

        <Form.Item style={{ marginBottom: 12, marginTop: 8 }}>
          <Button
            type="primary"
            htmlType="submit"
            loading={loading}
            block
            size="large"
            style={{
              borderRadius: 8,
              height: 48,
              fontSize: 15,
              fontWeight: 600,
              background: BRAND.green,
            }}
          >
            Sign In
          </Button>
        </Form.Item>
      </Form>

      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <Link href="/forgot-password">
          <Button type="link" style={{ color: BRAND.green, padding: 0, fontSize: 13 }}>
            Forgot password?
          </Button>
        </Link>
      </div>

      <div style={{ textAlign: 'center' }}>
        <Text style={{ color: '#999', fontSize: 12 }}>
          Access is restricted to authorized staff only.
        </Text>
      </div>
    </Card>
  )
}

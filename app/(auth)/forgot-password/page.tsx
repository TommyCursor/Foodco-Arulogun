'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Form, Input, Button, Card, Typography, Alert, Divider } from 'antd'
import { MailOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/constants'

const { Text } = Typography

export default function ForgotPasswordPage() {
  const [loading, setLoading]   = useState(false)
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const supabase = createClient()

  async function handleSubmit(values: { email: string }) {
    setLoading(true)
    setError(null)

    const redirectTo = `${window.location.origin}/auth/callback?next=/reset-password`

    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setSent(true)
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
          Retail Command System
        </Text>
      </div>

      <Divider style={{ margin: '0 0 24px' }} />

      {sent ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: BRAND.greenBg, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 28,
          }}>
            ✉️
          </div>
          <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>
            Reset link sent
          </Text>
          <Text style={{ color: '#666', fontSize: 13, display: 'block', marginBottom: 24 }}>
            Check your email inbox for a password reset link.
            It may take a minute to arrive.
          </Text>
          <Link href="/login">
            <Button icon={<ArrowLeftOutlined />} block style={{ borderRadius: 8 }}>
              Back to Sign In
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 24 }}>
            <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 6 }}>
              Forgot your password?
            </Text>
            <Text style={{ color: '#888', fontSize: 13 }}>
              Enter your email address and we&apos;ll send you a link to reset it.
            </Text>
          </div>

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              style={{ marginBottom: 20, borderRadius: 8 }}
            />
          )}

          <Form name="forgot-password" onFinish={handleSubmit} layout="vertical" requiredMark={false}>
            <Form.Item
              name="email"
              label={<Text strong>Email Address</Text>}
              rules={[
                { required: true, message: 'Email is required' },
                { type: 'email', message: 'Enter a valid email' },
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#ccc' }} />}
                placeholder="you@foodco.com"
                size="large"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 16, marginTop: 8 }}>
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
                Send Reset Link
              </Button>
            </Form.Item>
          </Form>

          <div style={{ textAlign: 'center' }}>
            <Link href="/login">
              <Button type="link" icon={<ArrowLeftOutlined />} style={{ color: BRAND.green, padding: 0 }}>
                Back to Sign In
              </Button>
            </Link>
          </div>
        </>
      )}
    </Card>
  )
}

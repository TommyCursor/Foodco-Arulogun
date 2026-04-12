'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Form, Input, Button, Card, Typography, Alert, Divider } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/constants'

const { Text } = Typography

export default function ResetPasswordPage() {
  const router  = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState(false)
  const supabase = createClient()

  async function handleSubmit(values: { password: string }) {
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.updateUser({ password: values.password })

    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setDone(true)
    setTimeout(() => router.push('/dashboard'), 2500)
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

      {done ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: BRAND.greenBg, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 28,
          }}>
            ✅
          </div>
          <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 8 }}>
            Password updated
          </Text>
          <Text style={{ color: '#666', fontSize: 13 }}>
            Redirecting you to the dashboard…
          </Text>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 24 }}>
            <Text strong style={{ fontSize: 16, display: 'block', marginBottom: 6 }}>
              Set a new password
            </Text>
            <Text style={{ color: '#888', fontSize: 13 }}>
              Choose a strong password for your account.
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

          <Form name="reset-password" onFinish={handleSubmit} layout="vertical" requiredMark={false}>
            <Form.Item
              name="password"
              label={<Text strong>New Password</Text>}
              rules={[
                { required: true, message: 'Password is required' },
                { min: 8, message: 'Password must be at least 8 characters' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#ccc' }} />}
                placeholder="Enter new password"
                size="large"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item
              name="confirm"
              label={<Text strong>Confirm Password</Text>}
              dependencies={['password']}
              rules={[
                { required: true, message: 'Please confirm your password' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) return Promise.resolve()
                    return Promise.reject(new Error('Passwords do not match'))
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#ccc' }} />}
                placeholder="Confirm new password"
                size="large"
                style={{ borderRadius: 8 }}
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
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
                Update Password
              </Button>
            </Form.Item>
          </Form>
        </>
      )}
    </Card>
  )
}

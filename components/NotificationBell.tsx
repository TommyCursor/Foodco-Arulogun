'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Badge, Button, Dropdown, Typography, Empty, Spin } from 'antd'
import { BellOutlined, CheckOutlined } from '@ant-design/icons'
import { BRAND } from '@/lib/constants'

const { Text } = Typography

interface Notification {
  id:           string
  title:        string
  message:      string
  type:         string
  entity_id:    string | null
  action_url:   string | null
  is_read:      boolean
  created_at:   string
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function NotificationBell() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading]             = useState(true)
  const [open, setOpen]                   = useState(false)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      const data = await res.json()
      if (Array.isArray(data)) setNotifications(data)
    } catch {
      // silent — non-critical
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchNotifications()
    const timer = setInterval(fetchNotifications, 60_000)
    return () => clearInterval(timer)
  }, [fetchNotifications])

  const unreadCount = notifications.filter(n => !n.is_read).length

  async function markRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' })
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  function handleClick(notif: Notification) {
    setOpen(false)
    if (!notif.is_read) markRead(notif.id)
    router.push(notif.action_url ?? '/inventory')
  }

  const dropdownContent = (
    <div style={{
      width: 340,
      background: '#fff',
      borderRadius: 8,
      boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Text strong style={{ fontSize: 14 }}>Notifications</Text>
        {unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            onClick={e => { e.stopPropagation(); markAllRead() }}
            style={{ padding: 0, fontSize: 12, color: BRAND.green }}
          >
            Mark all read
          </Button>
        )}
      </div>

      {/* List */}
      <div style={{ maxHeight: 380, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <Spin size="small" />
          </div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: '24px 16px' }}>
            <Empty description="No notifications" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          </div>
        ) : (
          notifications.slice(0, 10).map(n => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                borderBottom: '1px solid #f5f5f5',
                borderLeft: n.is_read ? '3px solid transparent' : `3px solid ${BRAND.green}`,
                background: n.is_read ? '#fff' : '#f6ffed',
              }}
            >
              <Text strong style={{ fontSize: 13, display: 'block', lineHeight: 1.4 }}>
                {n.title}
              </Text>
              <Text style={{
                fontSize: 12,
                color: '#666',
                display: 'block',
                lineHeight: 1.4,
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {n.message}
              </Text>
              <Text style={{ fontSize: 11, color: '#aaa', display: 'block', marginTop: 4 }}>
                {timeAgo(n.created_at)}
              </Text>
            </div>
          ))
        )}
      </div>
    </div>
  )

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      dropdownRender={() => dropdownContent}
      trigger={['click']}
      placement="bottomRight"
    >
      <Badge count={unreadCount} size="small" overflowCount={99}>
        <Button
          type="text"
          icon={<BellOutlined style={{ fontSize: 18, color: BRAND.textDark }} />}
        />
      </Badge>
    </Dropdown>
  )
}

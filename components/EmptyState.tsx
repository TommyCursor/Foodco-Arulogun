'use client'

import { Button, Typography } from 'antd'
import {
  CheckCircleOutlined, InboxOutlined, FilterOutlined,
  ClockCircleOutlined, SmileOutlined,
} from '@ant-design/icons'
import { BRAND } from '@/lib/constants'

const { Text } = Typography

type Variant = 'healthy' | 'info' | 'waiting' | 'filtered'

const VARIANT_STYLE: Record<Variant, { bg: string; border: string; iconColor: string; defaultIcon: React.ReactNode }> = {
  healthy:  { bg: '#F1F8E9', border: '#C5E1A5', iconColor: BRAND.green,    defaultIcon: <CheckCircleOutlined /> },
  info:     { bg: '#FAFAFA', border: '#E8E8E8', iconColor: '#9E9E9E',       defaultIcon: <InboxOutlined /> },
  waiting:  { bg: '#E3F2FD', border: '#BBDEFB', iconColor: '#1565C0',       defaultIcon: <ClockCircleOutlined /> },
  filtered: { bg: '#FAFAFA', border: '#E8E8E8', iconColor: '#BDBDBD',       defaultIcon: <FilterOutlined /> },
}

interface ActionConfig {
  label:   string
  icon?:   React.ReactNode
  onClick: () => void
  primary?: boolean
}

interface EmptyStateProps {
  title:        string
  description?: string
  icon?:        React.ReactNode
  action?:      ActionConfig
  variant?:     Variant
  padding?:     number
}

export default function EmptyState({
  title,
  description,
  icon,
  action,
  variant  = 'info',
  padding  = 48,
}: EmptyStateProps) {
  const s = VARIANT_STYLE[variant]

  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        `${padding}px 24px`,
      gap:            12,
    }}>
      {/* Icon bubble */}
      <div style={{
        width:        56,
        height:       56,
        borderRadius: '50%',
        background:   s.bg,
        border:       `1px solid ${s.border}`,
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'center',
        fontSize:     24,
        color:        s.iconColor,
        marginBottom: 4,
      }}>
        {icon ?? s.defaultIcon}
      </div>

      {/* Title */}
      <Text strong style={{ fontSize: 15, color: '#333', textAlign: 'center', lineHeight: 1.4 }}>
        {title}
      </Text>

      {/* Description */}
      {description && (
        <Text style={{
          fontSize:   13,
          color:      '#888',
          textAlign:  'center',
          maxWidth:   340,
          lineHeight: 1.6,
        }}>
          {description}
        </Text>
      )}

      {/* Action */}
      {action && (
        <Button
          type={action.primary ? 'primary' : 'default'}
          icon={action.icon}
          onClick={action.onClick}
          style={action.primary ? { background: BRAND.green, borderColor: BRAND.green, marginTop: 4 } : { marginTop: 4 }}
          size="middle"
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}

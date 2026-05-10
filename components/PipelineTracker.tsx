'use client'

import { Steps, Tag, Typography, Grid } from 'antd'
import {
  WarningOutlined, SendOutlined, SolutionOutlined,
  AuditOutlined, CheckCircleOutlined, CloseCircleOutlined,
  FastForwardOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { BRAND } from '@/lib/constants'

const { Text } = Typography
const { useBreakpoint } = Grid

// ── Stage → step index ─────────────────────────────────────────────────────
// Steps: 0=Reported  1=Loss Control  2=Resolution  3=Approval  4=Done
const STAGE_STEP: Record<string, number> = {
  damage_reported:     0,
  expiry_reported:     0,
  discount_reported:   0,
  sent_to_loss_control: 1,
  sent_to_resolution:  2,   // cashier path — LC skipped
  resolution_received: 3,
  sales_approved:      4,
  approved:            4,
  rejected:            4,
}

export interface PipelineTrackerProps {
  stage:        string
  reportedAt?:  string   // ISO timestamp — when damage/expiry/discount was first logged
  finalStatus?: 'approved' | 'rejected' | 'pending'
  compact?:     boolean  // tighter padding for embedded use
}

export default function PipelineTracker({
  stage,
  reportedAt,
  finalStatus = 'pending',
  compact     = false,
}: PipelineTrackerProps) {
  const screens   = useBreakpoint()
  const isMobile  = !screens.sm
  const current   = STAGE_STEP[stage] ?? 0
  const isSkippedLC = stage === 'sent_to_resolution' || (current > 2 && stage !== 'sent_to_loss_control' && STAGE_STEP[stage] !== 1)
  const isRejected  = stage === 'rejected' || finalStatus === 'rejected'
  const isApproved  = stage === 'sales_approved' || stage === 'approved' || finalStatus === 'approved'

  function stepStatus(idx: number): 'finish' | 'process' | 'wait' | 'error' {
    if (idx < current) return 'finish'
    if (idx === current) {
      if (isRejected && idx === 4) return 'error'
      return 'process'
    }
    return 'wait'
  }

  const steps = [
    {
      title: 'Reported',
      icon:  <WarningOutlined />,
      description: reportedAt
        ? <Text style={{ fontSize: 10, color: '#888' }}>{dayjs(reportedAt).format('DD MMM, HH:mm')}</Text>
        : undefined,
    },
    {
      title: isSkippedLC && current > 1 ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          Loss Control
          <Tag
            icon={<FastForwardOutlined />}
            color="default"
            style={{ fontSize: 9, padding: '0 4px', lineHeight: '16px', margin: 0 }}
          >
            skipped
          </Tag>
        </span>
      ) : 'Loss Control',
      icon:   <SendOutlined />,
      status: (isSkippedLC && current > 1 ? 'finish' : stepStatus(1)) as 'finish' | 'process' | 'wait' | 'error',
      description: isSkippedLC && current > 1
        ? <Text style={{ fontSize: 10, color: '#888' }}>Cashier item</Text>
        : undefined,
    },
    {
      title:  'Resolution',
      icon:   <SolutionOutlined />,
    },
    {
      title:  'Approval',
      icon:   <AuditOutlined />,
    },
    {
      title: isRejected ? 'Rejected' : isApproved ? 'Approved' : 'Done',
      icon:  isRejected
        ? <CloseCircleOutlined style={{ color: BRAND.critical }} />
        : isApproved
          ? <CheckCircleOutlined style={{ color: BRAND.green }} />
          : <CheckCircleOutlined />,
    },
  ]

  return (
    <div style={{
      background:   '#FAFAFA',
      border:       '1px solid #EFEFEF',
      borderRadius: 10,
      padding:      compact ? '12px 16px' : '16px 20px',
      marginBottom: compact ? 12 : 20,
    }}>
      <Text style={{ fontSize: 11, color: '#999', display: 'block', marginBottom: 10, letterSpacing: 0.5 }}>
        PIPELINE STATUS
      </Text>
      <Steps
        size="small"
        current={current}
        direction={isMobile ? 'vertical' : 'horizontal'}
        items={steps.map((s, idx) => ({
          title:       s.title,
          icon:        s.icon,
          description: s.description,
          status:      (s as any).status ?? stepStatus(idx),
        }))}
        style={{ fontSize: 12 }}
      />
    </div>
  )
}

'use client'

import { useRouter } from 'next/navigation'
import { Typography, Row, Col, Card, Statistic, Button, Tag, Space, List, Badge, Divider, Tooltip } from 'antd'
import {
  WarningOutlined, CheckCircleOutlined, ThunderboltOutlined,
  FileExcelOutlined, TagOutlined, RiseOutlined, ClockCircleOutlined,
  SendOutlined, SolutionOutlined, AuditOutlined, InboxOutlined,
  ExclamationCircleOutlined, ArrowRightOutlined, FireOutlined,
} from '@ant-design/icons'
import { BRAND } from '@/lib/constants'
import type { DashboardKPIs, InventoryItem } from '@/types'

const { Title, Text } = Typography

interface Props {
  kpi:              DashboardKPIs
  expiringItems:    InventoryItem[]
  pendingDamage:    any[]
  pendingDiscounts: any[]
  stageCounts:      Record<string, number>
  recentAudit:      any[]
  userName:         string
  userRole:         string
}

function formatNaira(value: number) {
  return `₦${Number(value).toLocaleString('en-NG')}`
}

function timeAgo(ts: string) {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode; actionLabel: string; route: string }> = {
  damage_reported:      { label: 'Damage Reported',       color: BRAND.critical,  bg: BRAND.criticalBg, icon: <WarningOutlined />,        actionLabel: 'Review →',       route: '/damage' },
  expiry_reported:      { label: 'Expiry Reported',       color: '#b8860b',       bg: '#FFF8E1',        icon: <ClockCircleOutlined />,    actionLabel: 'View →',         route: '/expiring' },
  discount_reported:    { label: 'Discount Applied',      color: BRAND.green,     bg: BRAND.greenBg,    icon: <TagOutlined />,            actionLabel: 'Manage →',       route: '/discounts' },
  sent_to_loss_control: { label: 'At Loss Control',       color: '#7B1FA2',       bg: '#F3E5F5',        icon: <SendOutlined />,           actionLabel: 'Track →',        route: '/loss-control' },
  resolution_received:  { label: 'Resolution Received',   color: '#1565C0',       bg: '#E3F2FD',        icon: <SolutionOutlined />,       actionLabel: 'Approve →',      route: '/resolution' },
  sales_approved:       { label: 'Approved for Sale',     color: BRAND.green,     bg: BRAND.greenBg,    icon: <CheckCircleOutlined />,    actionLabel: 'View →',         route: '/approval' },
}

const ACTION_COLOR: Record<string, string> = {
  create:       BRAND.green,
  update:       '#1565C0',
  approve:      '#2E7D32',
  reject:       BRAND.critical,
  cancel:       '#888',
  stage_change: '#7B1FA2',
  invite:       '#1565C0',
  delete:       BRAND.critical,
}

const MODULE_LABEL: Record<string, string> = {
  inventory:    'Inventory',
  damage:       'Damage',
  discounts:    'Discounts',
  users:        'Users',
  reports:      'Reports',
  alerts:       'Alerts',
  loss_control: 'Loss Control',
}

export default function DashboardClient({
  kpi, expiringItems, pendingDamage, pendingDiscounts,
  stageCounts, recentAudit, userName, userRole,
}: Props) {
  const router = useRouter()
  const hour   = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const today  = new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const roleLabel = userRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  const totalPending = pendingDamage.length + pendingDiscounts.length
  const urgentExpiry = expiringItems.filter(i => ((i as any).days_to_expiry ?? 99) <= 2)
  const hasUrgent    = urgentExpiry.length > 0 || kpi.expired_today > 0 || totalPending > 0

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <Title level={4} style={{ margin: 0, color: BRAND.green }}>
              {greeting}, {userName}
            </Title>
            <Space size={8} style={{ marginTop: 4 }}>
              <Text style={{ color: '#888', fontSize: 13 }}>{today}</Text>
              <Tag color="green" style={{ fontSize: 11, padding: '0 6px', lineHeight: '18px', margin: 0 }}>
                {roleLabel}
              </Tag>
            </Space>
          </div>
          <Space wrap>
            <Button icon={<FileExcelOutlined />} onClick={() => router.push('/reports')}
              style={{ borderColor: BRAND.green, color: BRAND.green, fontSize: 13 }}>
              Reports
            </Button>
            <Button icon={<TagOutlined />} onClick={() => router.push('/discounts')}
              style={{ borderColor: BRAND.green, color: BRAND.green, fontSize: 13 }}>
              Discounts
            </Button>
            <Button type="primary" icon={<InboxOutlined />} onClick={() => router.push('/inventory')}
              style={{ background: BRAND.green, fontSize: 13 }}>
              Inventory
            </Button>
          </Space>
        </div>
      </div>

      {/* ── Urgent Alert Banner ─────────────────────────── */}
      {hasUrgent && (
        <div style={{
          background: '#FFF3E0',
          border: '1px solid #FF9800',
          borderRadius: 10,
          padding: '12px 18px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}>
          <FireOutlined style={{ color: '#E65100', fontSize: 18 }} />
          <div style={{ flex: 1 }}>
            <Text strong style={{ color: '#E65100', fontSize: 14 }}>Attention Required — </Text>
            <Text style={{ color: '#5D4037', fontSize: 13 }}>
              {[
                kpi.expired_today > 0        && `${kpi.expired_today} item${kpi.expired_today > 1 ? 's' : ''} expired today`,
                urgentExpiry.length > 0      && `${urgentExpiry.length} item${urgentExpiry.length > 1 ? 's' : ''} expiring within 48 hours`,
                pendingDamage.length > 0     && `${pendingDamage.length} damage report${pendingDamage.length > 1 ? 's' : ''} pending`,
                pendingDiscounts.length > 0  && `${pendingDiscounts.length} discount${pendingDiscounts.length > 1 ? 's' : ''} awaiting approval`,
              ].filter(Boolean).join(' · ')}
            </Text>
          </div>
        </div>
      )}

      {/* ── KPI Row ─────────────────────────────────────── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={8} xl={4}>
          <Card bordered={false} style={{ background: BRAND.greenBg, borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: '#555' }}>Active Stock</span>}
              value={kpi.total_active_batches}
              suffix={<span style={{ fontSize: 13 }}>batches</span>}
              valueStyle={{ color: BRAND.green, fontWeight: 700, fontSize: 24 }}
              prefix={<CheckCircleOutlined style={{ fontSize: 16 }} />}
            />
          </Card>
        </Col>

        <Col xs={12} sm={8} xl={4}>
          <Card bordered={false} style={{ background: '#FFF8E1', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: '#555' }}>Expiring (7 days)</span>}
              value={kpi.expiring_in_7_days}
              suffix={<span style={{ fontSize: 13 }}>items</span>}
              valueStyle={{ color: '#b8860b', fontWeight: 700, fontSize: 24 }}
              prefix={<ClockCircleOutlined style={{ fontSize: 16 }} />}
            />
            <Text style={{ fontSize: 11, color: '#888' }}>{formatNaira(kpi.value_at_risk_7_days)} at risk</Text>
          </Card>
        </Col>

        <Col xs={12} sm={8} xl={4}>
          <Card bordered={false} style={{ background: kpi.expired_today > 0 ? BRAND.criticalBg : '#F5F5F5', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: '#555' }}>Expired Today</span>}
              value={kpi.expired_today}
              suffix={<span style={{ fontSize: 13 }}>items</span>}
              valueStyle={{ color: kpi.expired_today > 0 ? BRAND.critical : '#888', fontWeight: 700, fontSize: 24 }}
              prefix={<ExclamationCircleOutlined style={{ fontSize: 16 }} />}
            />
          </Card>
        </Col>

        <Col xs={12} sm={8} xl={4}>
          <Card bordered={false} style={{ background: totalPending > 0 ? '#FFF3E0' : '#F5F5F5', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: '#555' }}>Pending Actions</span>}
              value={totalPending}
              valueStyle={{ color: totalPending > 0 ? '#E65100' : '#888', fontWeight: 700, fontSize: 24 }}
              prefix={<WarningOutlined style={{ fontSize: 16 }} />}
            />
            <Text style={{ fontSize: 11, color: '#888' }}>damage + approvals</Text>
          </Card>
        </Col>

        <Col xs={12} sm={8} xl={4}>
          <Card bordered={false} style={{ background: BRAND.greenBg, borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: '#555' }}>Active Discounts</span>}
              value={kpi.active_discounts}
              valueStyle={{ color: BRAND.green, fontWeight: 700, fontSize: 24 }}
              prefix={<RiseOutlined style={{ fontSize: 16 }} />}
            />
            <Text style={{ fontSize: 11, color: '#888' }}>Recovery in progress</Text>
          </Card>
        </Col>

        <Col xs={12} sm={8} xl={4}>
          <Card bordered={false} style={{ background: kpi.damage_value_today > 0 ? BRAND.criticalBg : '#F5F5F5', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12, color: '#555' }}>Damage Loss Today</span>}
              value={kpi.damage_value_today}
              formatter={(v) => formatNaira(Number(v))}
              valueStyle={{ color: kpi.damage_value_today > 0 ? BRAND.critical : '#888', fontWeight: 700, fontSize: 20 }}
              prefix={<WarningOutlined style={{ fontSize: 16 }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Middle Row: Pipeline + Pending ─────────────── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>

        {/* Pipeline status */}
        <Col xs={24} lg={14}>
          <Card
            bordered={false}
            style={{ borderRadius: 10, height: '100%' }}
            title={
              <Space>
                <ThunderboltOutlined style={{ color: BRAND.yellow }} />
                <Text strong style={{ color: BRAND.green }}>Workflow Pipeline</Text>
                <Text style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>Items by stage</Text>
              </Space>
            }
          >
            {Object.keys(STAGE_CONFIG).map((stage) => {
              const count = stageCounts[stage] ?? 0
              const cfg   = STAGE_CONFIG[stage]
              return (
                <div
                  key={stage}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 12px',
                    marginBottom: 6,
                    borderRadius: 8,
                    background: count > 0 ? cfg.bg : '#FAFAFA',
                    border: `1px solid ${count > 0 ? cfg.color + '40' : '#eee'}`,
                    cursor: count > 0 ? 'pointer' : 'default',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => count > 0 && router.push(cfg.route)}
                >
                  <span style={{ color: count > 0 ? cfg.color : '#bbb', fontSize: 16, marginRight: 10 }}>
                    {cfg.icon}
                  </span>
                  <div style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: count > 0 ? '#333' : '#aaa', fontWeight: count > 0 ? 600 : 400 }}>
                      {cfg.label}
                    </Text>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Badge
                      count={count}
                      showZero
                      style={{
                        background: count > 0 ? cfg.color : '#ddd',
                        boxShadow: 'none',
                        fontWeight: 700,
                      }}
                    />
                    {count > 0 && (
                      <Text style={{ fontSize: 12, color: cfg.color, fontWeight: 600 }}>
                        {cfg.actionLabel}
                      </Text>
                    )}
                  </div>
                </div>
              )
            })}
            {Object.values(stageCounts).every(c => c === 0) && Object.keys(stageCounts).length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#aaa' }}>
                <CheckCircleOutlined style={{ fontSize: 24, marginBottom: 8 }} />
                <div>No items currently in pipeline</div>
              </div>
            )}
          </Card>
        </Col>

        {/* Pending approvals */}
        <Col xs={24} lg={10}>
          <Card
            bordered={false}
            style={{ borderRadius: 10, height: '100%' }}
            title={
              <Space>
                <AuditOutlined style={{ color: '#E65100' }} />
                <Text strong style={{ color: '#E65100' }}>Pending Actions</Text>
                {totalPending > 0 && <Badge count={totalPending} style={{ background: '#E65100' }} />}
              </Space>
            }
          >
            {pendingDamage.length > 0 && (
              <>
                <div style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Damage — Awaiting Approval
                  </Text>
                </div>
                {pendingDamage.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 10px',
                      marginBottom: 6,
                      background: BRAND.criticalBg,
                      borderRadius: 8,
                      borderLeft: `3px solid ${BRAND.critical}`,
                      cursor: 'pointer',
                    }}
                    onClick={() => router.push('/damage')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text ellipsis style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>
                        {d.inventory_item?.product?.name ?? 'Unknown Item'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#888' }}>
                        {d.reason} · {formatNaira(d.estimated_value_lost)} · {timeAgo(d.reported_at)}
                      </Text>
                    </div>
                    <ArrowRightOutlined style={{ color: BRAND.critical, fontSize: 12, flexShrink: 0 }} />
                  </div>
                ))}
              </>
            )}

            {pendingDamage.length > 0 && pendingDiscounts.length > 0 && (
              <Divider style={{ margin: '10px 0' }} />
            )}

            {pendingDiscounts.length > 0 && (
              <>
                <div style={{ marginBottom: 6 }}>
                  <Text style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Discounts — Awaiting Approval
                  </Text>
                </div>
                {pendingDiscounts.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      padding: '8px 10px',
                      marginBottom: 6,
                      background: '#FFF8E1',
                      borderRadius: 8,
                      borderLeft: '3px solid #FFC107',
                      cursor: 'pointer',
                    }}
                    onClick={() => router.push('/discounts')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Text ellipsis style={{ fontSize: 13, fontWeight: 600, display: 'block' }}>
                        {d.inventory_item?.product?.name ?? 'Unknown Item'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#888' }}>
                        {d.discount_percentage}% off · {timeAgo(d.created_at)}
                      </Text>
                    </div>
                    <ArrowRightOutlined style={{ color: '#b8860b', fontSize: 12, flexShrink: 0 }} />
                  </div>
                ))}
              </>
            )}

            {totalPending === 0 && (
              <div style={{ textAlign: 'center', padding: '28px 0', color: '#aaa' }}>
                <CheckCircleOutlined style={{ fontSize: 24, color: BRAND.green, marginBottom: 8 }} />
                <div style={{ color: BRAND.green, fontWeight: 600 }}>All clear</div>
                <div style={{ fontSize: 12 }}>No items awaiting approval</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── Bottom Row: Expiry + Audit ──────────────────── */}
      <Row gutter={[16, 16]}>

        {/* Expiry countdown table */}
        <Col xs={24} lg={14}>
          <Card
            bordered={false}
            style={{ borderRadius: 10 }}
            title={
              <Space>
                <ClockCircleOutlined style={{ color: '#b8860b' }} />
                <Text strong style={{ color: '#b8860b' }}>Expiry Countdown</Text>
                <Text style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>Next 7 days</Text>
              </Space>
            }
            extra={
              <Button type="link" size="small" onClick={() => router.push('/expiring')} style={{ color: BRAND.green, padding: 0 }}>
                View all →
              </Button>
            }
          >
            {expiringItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: '#aaa' }}>
                <CheckCircleOutlined style={{ fontSize: 24, color: BRAND.green, marginBottom: 8 }} />
                <div style={{ color: BRAND.green, fontWeight: 600 }}>No expiring items</div>
                <div style={{ fontSize: 12 }}>All stock is within safe thresholds</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #f0f0f0' }}>
                      <th style={{ textAlign: 'left',  padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 12 }}>Product</th>
                      <th style={{ textAlign: 'center',padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 12 }}>Qty</th>
                      <th style={{ textAlign: 'right', padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 12 }}>Value</th>
                      <th style={{ textAlign: 'center',padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 12 }}>Expires</th>
                      <th style={{ textAlign: 'center',padding: '6px 8px', color: '#888', fontWeight: 600, fontSize: 12 }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringItems.map((item) => {
                      const days  = (item as any).days_to_expiry ?? 0
                      const value = (item as any).value_at_risk ?? 0
                      const tagColor = days <= 0 ? 'red' : days <= 2 ? 'gold' : 'green'
                      const action   = days <= 0 ? 'REMOVE' : days <= 2 ? 'DAMAGE' : 'DISCOUNT'
                      const actionBg = days <= 0 ? BRAND.critical : days <= 2 ? '#FFC107' : BRAND.green
                      return (
                        <tr
                          key={item.id}
                          style={{
                            borderBottom: '1px solid #f5f5f5',
                            background: days <= 0 ? BRAND.criticalBg : days <= 2 ? '#FFFDE7' : 'transparent',
                          }}
                        >
                          <td style={{ padding: '8px', maxWidth: 180 }}>
                            <Tooltip title={(item as any).product_name}>
                              <Text ellipsis style={{ fontWeight: days <= 2 ? 700 : 400, display: 'block', maxWidth: 170 }}>
                                {(item as any).product_name}
                              </Text>
                            </Tooltip>
                            <Text style={{ fontSize: 11, color: '#aaa' }}>{(item as any).category}</Text>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <Text style={{ fontWeight: 600 }}>{item.quantity}</Text>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>
                            <Text style={{ color: days <= 2 ? BRAND.critical : '#333' }}>{formatNaira(value)}</Text>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <Tag color={tagColor} style={{ fontSize: 11, margin: 0 }}>
                              {days <= 0 ? 'Expired' : days === 1 ? 'Tomorrow' : `${days}d`}
                            </Tag>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <Button
                              size="small"
                              style={{
                                background: actionBg,
                                borderColor: actionBg,
                                color: days <= 2 && days > 0 ? '#1a1a1a' : '#fff',
                                fontSize: 11,
                                fontWeight: 700,
                                height: 24,
                                padding: '0 8px',
                              }}
                              onClick={() => router.push(days <= 2 ? '/damage' : '/discounts')}
                            >
                              {action}
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </Col>

        {/* Recent audit activity */}
        <Col xs={24} lg={10}>
          <Card
            bordered={false}
            style={{ borderRadius: 10 }}
            title={
              <Space>
                <AuditOutlined style={{ color: BRAND.green }} />
                <Text strong style={{ color: BRAND.green }}>Recent Activity</Text>
              </Space>
            }
            extra={
              <Button type="link" size="small" onClick={() => router.push('/audit')} style={{ color: BRAND.green, padding: 0 }}>
                Full log →
              </Button>
            }
          >
            {recentAudit.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 0', color: '#aaa', fontSize: 13 }}>
                No recent activity
              </div>
            ) : (
              <List
                dataSource={recentAudit}
                split={false}
                renderItem={(entry) => (
                  <List.Item style={{ padding: '6px 0', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: 10, width: '100%', alignItems: 'flex-start' }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: ACTION_COLOR[entry.action] ?? '#888',
                          marginTop: 6,
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>
                            {entry.actor?.full_name ?? 'System'}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#aaa', flexShrink: 0 }}>
                            {timeAgo(entry.created_at)}
                          </Text>
                        </div>
                        <Text style={{ fontSize: 12, color: '#666' }}>
                          <Tag
                            style={{
                              fontSize: 10,
                              padding: '0 4px',
                              lineHeight: '16px',
                              color: ACTION_COLOR[entry.action] ?? '#888',
                              background: (ACTION_COLOR[entry.action] ?? '#888') + '18',
                              border: 'none',
                              marginRight: 4,
                            }}
                          >
                            {entry.action}
                          </Tag>
                          {MODULE_LABEL[entry.module] ?? entry.module}
                          {entry.entity_label && ` · ${entry.entity_label}`}
                        </Text>
                      </div>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  )
}

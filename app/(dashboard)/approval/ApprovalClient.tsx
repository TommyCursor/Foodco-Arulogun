'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, Tag, Button, Input, Select, Typography,
  Card, Statistic, Row, Col, Space, Empty, App, Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SearchOutlined, ReloadOutlined, CheckOutlined, CloseOutlined,
  AuditOutlined, ExclamationCircleOutlined, CheckCircleOutlined,
  ArrowRightOutlined, ArrowDownOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { BRAND } from '@/lib/constants'
import type { InventoryItem } from '@/types'

const { Title, Text } = Typography
const { Option } = Select

function formatNaira(v: number) {
  return `₦${Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getReportType(item: InventoryItem) {
  const stage     = (item as any).pipeline_stage as string | undefined
  const damages   = (item as any).damage_records as Array<{ reason: string }> | null
  const discounts = (item as any).discounts      as Array<unknown> | null
  if (discounts?.length || stage === 'discount_reported') return 'Discount'
  if (damages?.length || stage === 'damage_reported')     return 'Damage'
  if (stage === 'expiry_reported')                        return 'About to Expire'
  return '—'
}

/** Pull the most recent active discount record for a discount-type item */
function getDiscountDetails(item: InventoryItem) {
  const discounts = (item as any).discounts as Array<{
    id: string
    discount_percentage: number
    discounted_price:    number
    original_price:      number
    created_at:          string
  }> | null
  if (!discounts?.length) return null
  // Most recent one
  return discounts.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0]
}

function getReportedAt(item: InventoryItem): string | null {
  const damages   = (item as any).damage_records as Array<{ reported_at: string }> | null
  const discounts = (item as any).discounts      as Array<{ created_at: string  }> | null
  const stage     = (item as any).pipeline_stage as string | undefined
  return (
    discounts?.[0]?.created_at ??
    damages?.[0]?.reported_at ??
    (stage && stage !== 'logged' ? (item as any).created_at : null)
  )
}

interface Props { items: InventoryItem[] }

export default function ApprovalClient({ items }: Props) {
  const router = useRouter()
  const { notification, modal } = App.useApp()

  const [search,     setSearch]     = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [processing, setProcessing] = useState<string | null>(null)

  const stats = useMemo(() => {
    const totalOriginalValue  = items.reduce((s, i) => s + i.quantity * Number((i as any).original_price ?? i.selling_price), 0)
    const totalCurrentValue   = items.reduce((s, i) => s + i.quantity * Number(i.selling_price), 0)
    const totalPotentialLoss  = totalOriginalValue - totalCurrentValue
    const discountItems       = items.filter(i => getReportType(i) === 'Discount')
    return { pending: items.length, totalCurrentValue, totalPotentialLoss, discountItems: discountItems.length }
  }, [items])

  const filtered = useMemo(() => items.filter(item => {
    const name = (item.product?.name ?? '').toLowerCase()
    const sku  = (item.product?.sku  ?? '').toLowerCase()
    const q    = search.toLowerCase()
    if (q && !name.includes(q) && !sku.includes(q)) return false
    if (filterType !== 'all' && getReportType(item) !== filterType) return false
    return true
  }), [items, search, filterType])

  async function handleDecision(item: InventoryItem, decision: 'approve' | 'reject') {
    const isApprove  = decision === 'approve'
    const reportType = getReportType(item)
    const disc       = getDiscountDetails(item)
    const origPrice  = Number((item as any).original_price ?? item.selling_price)
    const potLoss    = disc ? Math.round((origPrice - disc.discounted_price) * item.quantity * 100) / 100 : 0

    // Build a context-aware confirm message
    let content: React.ReactNode
    if (isApprove && reportType === 'Discount' && disc) {
      content = (
        <div>
          <p style={{ marginBottom: 8 }}>
            This approves the following discount resolution and marks the item for sale at the new price.
          </p>
          <div style={{
            background: '#F8F9FA', borderRadius: 8, padding: '10px 14px',
            border: '1px solid #e0e0e0', fontSize: 13,
          }}>
            <Row gutter={[8, 6]}>
              <Col span={8}><Text style={{ color: '#888', fontSize: 11 }}>Discount %</Text><br />
                <Text strong style={{ color: '#1565C0' }}>{disc.discount_percentage.toFixed(1)}%</Text>
              </Col>
              <Col span={8}><Text style={{ color: '#888', fontSize: 11 }}>Original Price</Text><br />
                <Text strong style={{ fontFamily: 'monospace' }}>{formatNaira(origPrice)}</Text>
              </Col>
              <Col span={8}><Text style={{ color: '#888', fontSize: 11 }}>New Price</Text><br />
                <Text strong style={{ color: BRAND.green, fontFamily: 'monospace' }}>{formatNaira(disc.discounted_price)}</Text>
              </Col>
              <Col span={8}><Text style={{ color: '#888', fontSize: 11 }}>Quantity</Text><br />
                <Text strong>{item.quantity} units</Text>
              </Col>
              <Col span={16}><Text style={{ color: '#888', fontSize: 11 }}>Potential Loss (vs original value)</Text><br />
                <Text strong style={{ color: BRAND.critical, fontFamily: 'monospace', fontSize: 14 }}>
                  {formatNaira(potLoss)}
                </Text>
              </Col>
            </Row>
          </div>
        </div>
      )
    } else if (isApprove) {
      content = 'This marks the resolution as approved and moves the item to the sales-approved stage.'
    } else {
      content = 'This rejects the resolution and sends the item back to the Resolution page for a new entry.'
    }

    modal.confirm({
      title:   isApprove ? 'Approve this resolution?' : 'Reject this resolution?',
      icon:    <ExclamationCircleOutlined style={{ color: isApprove ? BRAND.green : BRAND.critical }} />,
      content,
      width:   440,
      okText:        isApprove ? 'Approve' : 'Reject',
      okType:        isApprove ? 'primary' : 'danger',
      okButtonProps: isApprove ? { style: { background: BRAND.green } } : {},
      cancelText: 'Cancel',
      async onOk() {
        setProcessing(item.id)
        try {
          const res = await fetch(`/api/inventory/${item.id}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              pipeline_stage: isApprove ? 'sales_approved' : 'sent_to_loss_control',
            }),
          })
          if (!res.ok) throw new Error((await res.json()).error)
          notification.success({
            message:     isApprove ? 'Resolution Approved' : 'Resolution Rejected',
            description: isApprove
              ? 'Item approved for sale.'
              : 'Item sent back for a new resolution.',
            placement: 'topRight',
            duration:  2,
            icon:      <CheckCircleOutlined style={{ color: isApprove ? BRAND.green : '#FA8C16' }} />,
            onClose:   () => router.refresh(),
          })
        } catch (err: any) {
          notification.error({ message: 'Action failed', description: err.message, placement: 'topRight', duration: 4 })
        } finally {
          setProcessing(null)
        }
      },
    })
  }

  const REPORT_TYPE_OPTIONS = ['Damage', 'Discount', 'About to Expire']

  const columns: ColumnsType<InventoryItem> = [
    {
      title:  'Product',
      key:    'product',
      width:  180,
      render: (_, item) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{item.product?.name ?? '—'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>{item.product?.sku ?? '—'}</Text>
        </div>
      ),
      sorter: (a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? ''),
    },
    {
      title:      'Category',
      key:        'category',
      width:      100,
      responsive: ['sm'],
      render: (_, item) => <Tag style={{ borderRadius: 4 }}>{item.product?.category?.name ?? '—'}</Tag>,
    },
    {
      title:     'Qty',
      dataIndex: 'quantity',
      width:     60,
      align:     'center',
      render:    v => <Text strong>{v}</Text>,
    },
    {
      title:  'Report Type',
      key:    'report_type',
      width:  130,
      render: (_, item) => {
        const type = getReportType(item)
        const colorMap: Record<string, string> = {
          Discount: 'blue', Damage: 'red', 'About to Expire': 'gold',
        }
        return type === '—'
          ? <Text type="secondary">—</Text>
          : <Tag color={colorMap[type]} style={{ borderRadius: 4 }}>{type}</Tag>
      },
    },
    {
      title:  'Financial Details',
      key:    'financial_details',
      width:  230,
      render: (_, item) => {
        const reportType = getReportType(item)
        if (reportType === 'Damage') {
          const damages = (item as any).damage_records as Array<{ reason: string; estimated_value_lost: number }> | null
          const dmgLoss = damages?.reduce((s, d) => s + Number(d.estimated_value_lost), 0) ?? 0
          const reason  = damages?.[0]?.reason ?? '—'
          return (
            <div style={{
              background: BRAND.criticalBg,
              border: `1px solid ${BRAND.critical}60`,
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: 12,
            }}>
              <div style={{ marginBottom: 3 }}>
                <Text style={{ fontSize: 11, color: '#888' }}>Reason</Text>
                <br />
                <Text strong style={{ fontSize: 12 }}>{reason}</Text>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 11, color: '#888' }}>Est. loss:</Text>
                <Text strong style={{ color: BRAND.critical, fontFamily: 'monospace', fontSize: 13 }}>
                  {formatNaira(dmgLoss)}
                </Text>
              </div>
              <Text style={{ fontSize: 11, color: '#aaa' }}>
                {item.quantity} units × {formatNaira(Number(item.selling_price))} each
              </Text>
            </div>
          )
        }

        if (reportType === 'About to Expire') {
          const daysLeft  = Math.ceil(
            (new Date(item.expiry_date).getTime() - Date.now()) / 86400000
          )
          const valueAtRisk = item.quantity * Number(item.selling_price)
          return (
            <div style={{
              background: '#FFF8E1',
              border: '1px solid #FFE08260',
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: 12,
            }}>
              <div style={{ marginBottom: 3 }}>
                <Tag
                  color={daysLeft <= 0 ? 'red' : daysLeft <= 2 ? 'gold' : 'orange'}
                  style={{ fontSize: 11, margin: 0 }}
                >
                  {daysLeft <= 0 ? 'Expired' : daysLeft === 1 ? 'Expires tomorrow' : `${daysLeft} days left`}
                </Tag>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 11, color: '#888' }}>Value at risk:</Text>
                <Text strong style={{ color: '#b8860b', fontFamily: 'monospace', fontSize: 13 }}>
                  {formatNaira(valueAtRisk)}
                </Text>
              </div>
              <Text style={{ fontSize: 11, color: '#aaa' }}>
                {item.quantity} units × {formatNaira(Number(item.selling_price))} each
              </Text>
            </div>
          )
        }

        if (reportType !== 'Discount') {
          return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        }

        const disc      = getDiscountDetails(item)
        const origPrice = Number((item as any).original_price ?? item.selling_price)
        if (!disc) {
          // Discount item but no discount record yet
          return <Text type="secondary" style={{ fontSize: 12 }}>No discount record</Text>
        }

        const potLoss = Math.round((origPrice - disc.discounted_price) * item.quantity * 100) / 100

        return (
          <div style={{
            background: '#F0F7FF',
            border: '1px solid #91CAFF',
            borderRadius: 8,
            padding: '7px 10px',
            fontSize: 12,
          }}>
            {/* Price strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Text style={{ fontFamily: 'monospace', color: '#888', textDecoration: 'line-through', fontSize: 12 }}>
                {formatNaira(origPrice)}
              </Text>
              <ArrowRightOutlined style={{ color: '#aaa', fontSize: 10 }} />
              <Text strong style={{ fontFamily: 'monospace', color: BRAND.green, fontSize: 13 }}>
                {formatNaira(disc.discounted_price)}
              </Text>
              <Tag color="blue" style={{ fontSize: 11, padding: '0 5px', lineHeight: '18px', margin: 0 }}>
                {disc.discount_percentage.toFixed(1)}% off
              </Tag>
            </div>
            {/* Potential loss */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <ArrowDownOutlined style={{ color: BRAND.critical, fontSize: 11 }} />
              <Text style={{ fontSize: 12, color: BRAND.critical, fontWeight: 600 }}>
                {formatNaira(potLoss)}
              </Text>
              <Text style={{ fontSize: 11, color: '#888' }}>potential loss</Text>
            </div>
            <Text style={{ fontSize: 11, color: '#aaa' }}>
              {item.quantity} units × {formatNaira(origPrice - disc.discounted_price)} each
            </Text>
          </div>
        )
      },
    },
    {
      title:      'Reported At',
      key:        'reported_at',
      width:      110,
      responsive: ['lg'],
      render: (_, item) => {
        const ts = getReportedAt(item)
        if (!ts) return <Text type="secondary">—</Text>
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{dayjs(ts).format('DD MMM YYYY')}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{dayjs(ts).format('HH:mm')}</div>
          </div>
        )
      },
    },
    {
      title:  'Resolution Notes',
      key:    'resolution',
      width:  220,
      render: (_, item) => {
        const notes = item.notes?.trim()
        if (!notes) return <Text type="secondary" style={{ fontSize: 12 }}>No notes</Text>
        return (
          <div style={{
            background:   BRAND.grayBg,
            borderRadius: 6,
            padding:      '7px 10px',
            fontSize:     12,
            lineHeight:   1.5,
            maxHeight:    64,
            overflowY:    'auto',
            whiteSpace:   'pre-wrap',
          }}>
            {notes}
          </div>
        )
      },
    },
    {
      title:  'Decision',
      key:    'decision',
      width:  100,
      fixed:  'right',
      render: (_, item) => (
        <Space size={6}>
          <Tooltip title="Approve — mark as resolved for sale">
            <Button
              size="small"
              icon={<CheckOutlined />}
              style={{ color: BRAND.green, borderColor: BRAND.green }}
              loading={processing === item.id}
              onClick={() => handleDecision(item, 'approve')}
            />
          </Tooltip>
          <Tooltip title="Reject — send back for new resolution">
            <Button
              size="small"
              icon={<CloseOutlined />}
              danger
              loading={processing === item.id}
              onClick={() => handleDecision(item, 'reject')}
            />
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <>
      {/* ── KPI Cards ────────────────────────────────────── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small" style={{ background: '#FFF8E1', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Pending Approval</span>}
              value={stats.pending}
              suffix="items"
              valueStyle={{ color: '#FA8C16', fontSize: 20, fontWeight: 700 }}
              prefix={<AuditOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small" style={{ background: '#E3F2FD', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Discount Items</span>}
              value={stats.discountItems}
              suffix="items"
              valueStyle={{ color: '#1565C0', fontSize: 20, fontWeight: 700 }}
            />
            <Text style={{ fontSize: 10, color: '#888' }}>Require price approval</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small" style={{ background: '#F5F5F5', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Current Value in Queue</span>}
              value={stats.totalCurrentValue}
              formatter={v => formatNaira(Number(v))}
              valueStyle={{ fontSize: 18, fontWeight: 700, color: '#333' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small"
            style={{ background: stats.totalPotentialLoss > 0 ? BRAND.criticalBg : '#F5F5F5', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Total Potential Loss</span>}
              value={stats.totalPotentialLoss}
              formatter={v => formatNaira(Number(v))}
              valueStyle={{ fontSize: 18, fontWeight: 700, color: stats.totalPotentialLoss > 0 ? BRAND.critical : '#888' }}
              prefix={<ArrowDownOutlined />}
            />
            <Text style={{ fontSize: 10, color: '#888' }}>Discount vs original prices</Text>
          </Card>
        </Col>
      </Row>

      {/* ── Filters ──────────────────────────────────────── */}
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <Title level={5} style={{ margin: 0, color: BRAND.green }}>
            Approval Queue
          </Title>
          <Button icon={<ReloadOutlined />} onClick={() => router.refresh()}>Refresh</Button>
        </div>
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={9}>
            <Input
              prefix={<SearchOutlined style={{ color: '#ccc' }} />}
              placeholder="Search product or SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6} md={5}>
            <Select value={filterType} onChange={setFilterType} style={{ width: '100%' }}>
              <Option value="all">All Report Types</Option>
              {REPORT_TYPE_OPTIONS.map(t => <Option key={t} value={t}>{t}</Option>)}
            </Select>
          </Col>
          <Col xs={12} sm={4} md={3}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => { setSearch(''); setFilterType('all') }}
              style={{ width: '100%' }}
            >
              Clear
            </Button>
          </Col>
        </Row>
      </Card>

      {/* ── Table ────────────────────────────────────────── */}
      <Card bordered={false} style={{ borderRadius: 8 }}>
        {filtered.length === 0 ? (
          <Empty
            description={
              search || filterType !== 'all'
                ? 'No items match the filter'
                : 'No items pending approval — all caught up!'
            }
            style={{ padding: '40px 0' }}
          />
        ) : (
          <Table<InventoryItem>
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            scroll={{ x: 1100 }}
            size="small"
            rowClassName={() => 'row-warning'}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} items`,
            }}
          />
        )}
      </Card>
    </>
  )
}

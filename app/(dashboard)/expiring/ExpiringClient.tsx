'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, Tag, Button, Input, Select, Card, Statistic, Row, Col,
  Typography, Space, Empty, Drawer, Form, InputNumber, DatePicker, Modal, Alert, App,
  Tooltip, Popconfirm,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SearchOutlined, ReloadOutlined, WarningOutlined,
  ClockCircleOutlined, FireOutlined, PlusOutlined, CheckCircleOutlined,
  DeleteOutlined, BellOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { BRAND, STORE_CATEGORIES } from '@/lib/constants'
import type { InventoryItem } from '@/types'

const { Title, Text } = Typography
const { Option } = Select

function daysLeft(expiry: string) {
  return dayjs(expiry).diff(dayjs().startOf('day'), 'day')
}

function expiryColor(days: number) {
  if (days < 0)  return BRAND.critical
  if (days <= 2)  return BRAND.critical
  if (days <= 7)  return '#FA8C16'
  if (days <= 14) return '#FAAD14'
  return '#52C41A'
}

function ExpiryBadge({ expiry }: { expiry: string }) {
  const days  = daysLeft(expiry)
  const color = expiryColor(days)
  const label =
    days < 0  ? `${Math.abs(days)}d overdue` :
    days === 0 ? 'Expires today' :
    days === 1 ? '1 day left' :
                 `${days} days left`

  return (
    <Tag
      style={{
        background: `${color}18`,
        borderColor: color,
        color,
        borderRadius: 6,
        fontWeight: 600,
        fontSize: 12,
      }}
    >
      {label}
    </Tag>
  )
}

// Threshold display config (must match expiryNotificationService.ts)
const THRESHOLD_CONFIG = [
  { key: '90d', short: '3M', label: '3-Month First Report'  },
  { key: '60d', short: '2M', label: '2-Month Reminder'      },
  { key: '30d', short: '1M', label: '1-Month Final Monthly' },
  { key: '4w',  short: '4W', label: '4-Week Warning'        },
  { key: '3w',  short: '3W', label: '3-Week Warning'        },
  { key: '2w',  short: '2W', label: '2-Week Alert'          },
  { key: '1w',  short: '1W', label: '1-Week Final Alert'    },
]

interface Props {
  items:              InventoryItem[]
  sentNotifications:  Record<string, { threshold: string; sent_at: string }[]>
}

export default function ExpiringClient({ items, sentNotifications }: Props) {
  const router              = useRouter()
  const { notification }    = App.useApp()
  const [search, setSearch] = useState('')
  const [range,  setRange]  = useState<'all' | 2 | 7 | 14 | 30 | 90>('all')
  const [drawerOpen,  setDrawerOpen]  = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [form]                        = Form.useForm()
  const [batchSku,    setBatchSku]    = useState('')
  const [batchQty,    setBatchQty]    = useState<number | null>(null)
  const [batchPrice,  setBatchPrice]  = useState<number | null>(null)

  const batchAmount = (batchQty ?? 0) * (batchPrice ?? 0)

  function resetForm() {
    form.resetFields()
    setBatchSku('')
    setBatchQty(null)
    setBatchPrice(null)
  }

  const filtered = useMemo(() => {
    return items.filter(item => {
      const name = (item.product?.name ?? '').toLowerCase()
      const sku  = (item.product?.sku  ?? '').toLowerCase()
      const q    = search.toLowerCase()
      if (q && !name.includes(q) && !sku.includes(q)) return false
      if (range !== 'all') {
        const days = daysLeft(item.expiry_date)
        if (days > range) return false
      }
      return true
    })
  }, [items, search, range])

  // Stats
  const stats = useMemo(() => ({
    overdue:  items.filter(i => daysLeft(i.expiry_date) < 0).length,
    critical: items.filter(i => { const d = daysLeft(i.expiry_date); return d >= 0 && d <= 2 }).length,
    week:     items.filter(i => { const d = daysLeft(i.expiry_date); return d >= 0 && d <= 7 }).length,
    total:    items.length,
    valueAtRisk: items.reduce((s, i) => s + i.quantity * Number(i.selling_price), 0),
  }), [items])

  // ── Delete expiring item (soft-remove) ──
  async function doDelete(item: InventoryItem) {
    setDeleting(item.id)
    try {
      const res = await fetch(`/api/inventory/${item.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res.json()
        notification.error({ message: 'Delete failed', description: error, placement: 'topRight', duration: 4 })
        return
      }
      notification.success({
        message:     'Item removed',
        description: 'The inventory entry has been removed.',
        placement:   'topRight',
        duration:    1.5,
        onClose:     () => router.refresh(),
      })
    } catch {
      notification.error({ message: 'Delete failed', description: 'Network error — try again.', placement: 'topRight', duration: 4 })
    } finally {
      setDeleting(null)
    }
  }

  // ── Submit report ──
  async function handleSubmit(values: Record<string, unknown>) {
    const qty = batchQty ?? 0
    if (qty < 1) {
      Modal.warning({ title: 'Qty required', content: 'Please enter the quantity (must be at least 1).' })
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/damage', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description:          values.description,
          barcode:              batchSku || null,
          quantity_damaged:     qty,
          unit_price:           batchPrice ?? 0,
          estimated_value_lost: batchAmount,
          reason:               'About to Expire',
          expiry_date:          values.expiry_date ? (values.expiry_date as dayjs.Dayjs).toISOString() : null,
          category:             values.category ?? null,
          notes:                values.notes ?? '',
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setDrawerOpen(false)
      resetForm()
      notification.success({
        message:     'Report Submitted!',
        description: 'Expiry report logged. It now appears in Damage Records and the Inventory pipeline.',
        placement:   'topRight',
        duration:    0.5,
        icon:        <CheckCircleOutlined style={{ color: BRAND.green }} />,
        style: {
          background:   'linear-gradient(135deg, #e8f5e9 0%, #f9fbe7 100%)',
          border:       '1px solid #a5d6a7',
          borderRadius: 12,
          boxShadow:    '0 8px 32px rgba(46,125,50,0.2)',
        },
        onClose: () => router.refresh(),
      })
    } catch (err: any) {
      Modal.error({ title: 'Failed to submit report', content: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  const RANGE_FILTERS = [
    { label: 'All (≤ 90d)', value: 'all' as const },
    { label: '≤ 2 days',    value: 2    as const },
    { label: '≤ 7 days',    value: 7    as const },
    { label: '≤ 14 days',   value: 14   as const },
    { label: '≤ 30 days',   value: 30   as const },
    { label: '≤ 90 days',   value: 90   as const },
  ]

  const columns: ColumnsType<InventoryItem> = [
    {
      title:  'Description',
      key:    'description',
      width:  200,
      sorter: (a, b) =>
        (a.product?.name ?? '').localeCompare(b.product?.name ?? ''),
      render: (_, item) => (
        <Text strong style={{ fontSize: 13 }}>{item.product?.name ?? '—'}</Text>
      ),
    },
    {
      title:      'Barcode',
      key:        'barcode',
      width:      130,
      responsive: ['sm'],
      render: (_, item) => (
        <Text code style={{ fontSize: 12 }}>{item.product?.sku ?? '—'}</Text>
      ),
    },
    {
      title:     'Qty',
      dataIndex: 'quantity',
      width:     75,
      align:     'center',
      sorter:    (a, b) => a.quantity - b.quantity,
      render:    v => <Text strong>{v}</Text>,
    },
    {
      title:      'Price (₦)',
      dataIndex:  'selling_price',
      width:      120,
      align:      'right',
      responsive: ['md'],
      render:     v => <Text>₦{Number(v).toLocaleString()}</Text>,
      sorter:     (a, b) => Number(a.selling_price) - Number(b.selling_price),
    },
    {
      title:      'Amount (₦)',
      key:        'amount',
      width:      140,
      align:      'right',
      responsive: ['md'],
      sorter:     (a, b) =>
        a.quantity * Number(a.selling_price) - b.quantity * Number(b.selling_price),
      render: (_, item) => (
        <Text strong>
          ₦{(item.quantity * Number(item.selling_price)).toLocaleString()}
        </Text>
      ),
    },
    {
      title:     'Expiration',
      dataIndex: 'expiry_date',
      width:     180,
      defaultSortOrder: 'ascend',
      sorter:    (a, b) =>
        new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime(),
      render: (v) => {
        const days  = daysLeft(v)
        const color = expiryColor(days)
        return (
          <Space direction="vertical" size={2}>
            <Text strong style={{ color, fontSize: 13 }}>
              {dayjs(v).format('DD MMM YYYY')}
            </Text>
            <ExpiryBadge expiry={v} />
          </Space>
        )
      },
    },
    {
      title:  'Approval Status',
      key:    'approval_status',
      width:  150,
      render: (_, item) => {
        const stage = (item as any).pipeline_stage as string | undefined
        if (!stage || stage === 'logged')
          return <Tag>Not Reported</Tag>
        if (stage === 'expiry_reported')
          return <Tag color="gold">Pending Approval</Tag>
        if (stage === 'sent_to_loss_control')
          return <Tag color="blue">In Review</Tag>
        return <Tag color="green">Processed</Tag>
      },
    },
    {
      title:      'Alert Trail',
      key:        'alert_trail',
      width:      220,
      responsive: ['lg'],
      render: (_, item) => {
        const sent = sentNotifications[item.id] ?? []
        const sentKeys = new Set(sent.map(s => s.threshold))
        return (
          <Space size={2} wrap>
            {THRESHOLD_CONFIG.map(t => {
              const wasSent = sentKeys.has(t.key)
              const record  = sent.find(s => s.threshold === t.key)
              return (
                <Tooltip
                  key={t.key}
                  title={wasSent
                    ? `${t.label} sent ${dayjs(record!.sent_at).format('DD MMM YYYY')}`
                    : `${t.label} — not yet sent`}
                >
                  <Tag
                    style={{
                      fontSize: 10, padding: '1px 5px', lineHeight: '18px', cursor: 'default',
                      background: wasSent ? '#E8F5E9' : '#F5F5F5',
                      borderColor: wasSent ? '#4CAF50' : '#d9d9d9',
                      color: wasSent ? '#2E7D32' : '#bbb',
                      fontWeight: wasSent ? 700 : 400,
                    }}
                  >
                    {wasSent ? '✓' : '·'} {t.short}
                  </Tag>
                </Tooltip>
              )
            })}
          </Space>
        )
      },
    },
    {
      title:  'Actions',
      key:    'actions',
      fixed:  'right',
      width:  70,
      render: (_, item) => {
        const stage     = (item as any).pipeline_stage as string | undefined
        const canDelete = !['sent_to_loss_control', 'resolution_received', 'sales_approved', 'sold'].includes(stage ?? '')
        if (!canDelete) return null
        return (
          <Popconfirm
            title="Delete this item?"
            description="This permanently removes the item from inventory."
            okText="Yes, Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            onConfirm={() => doDelete(item)}
          >
            <Tooltip title="Delete Item">
              <Button size="small" icon={<DeleteOutlined />} danger loading={deleting === item.id} />
            </Tooltip>
          </Popconfirm>
        )
      },
    },
  ]

  return (
    <>
      {/* ── KPI Cards ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} md={6}>
          <Card className="kpi-card critical" bordered={false} size="small">
            <Statistic
              title="Overdue / Expired"
              value={stats.overdue}
              suffix="batches"
              valueStyle={{ color: BRAND.critical, fontSize: 22, fontWeight: 700 }}
              prefix={<FireOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card warning" bordered={false} size="small">
            <Statistic
              title="Critical (≤ 2 days)"
              value={stats.critical}
              suffix="batches"
              valueStyle={{ color: '#FA541C', fontSize: 22, fontWeight: 700 }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card warning" bordered={false} size="small">
            <Statistic
              title="Expiring This Week"
              value={stats.week}
              suffix="batches"
              valueStyle={{ color: '#FA8C16', fontSize: 22, fontWeight: 700 }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card critical" bordered={false} size="small">
            <Statistic
              title="Value at Risk"
              value={`₦${stats.valueAtRisk.toLocaleString()}`}
              valueStyle={{ color: BRAND.critical, fontSize: 18, fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Filters ── */}
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 16 }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16,
        }}>
          <Title level={5} style={{ margin: 0, color: BRAND.green }}>
            About to Expire
          </Title>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => router.refresh()}>
              Refresh
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => { resetForm(); setDrawerOpen(true) }}
              style={{ background: BRAND.green }}
            >
              Report About to Expire
            </Button>
          </Space>
        </div>

        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={10} md={8}>
            <Input
              prefix={<SearchOutlined style={{ color: '#ccc' }} />}
              placeholder="Search product or barcode..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={14}>
            <Space wrap>
              {RANGE_FILTERS.map(f => (
                <Button
                  key={String(f.value)}
                  size="small"
                  type={range === f.value ? 'primary' : 'default'}
                  style={range === f.value ? { background: BRAND.green } : {}}
                  onClick={() => setRange(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </Space>
          </Col>
        </Row>
      </Card>

      {/* ── Table ── */}
      <Card bordered={false} style={{ borderRadius: 8 }}>
        {filtered.length === 0 ? (
          <Empty
            description={
              search || range !== 'all'
                ? 'No items match the current filter'
                : 'No items expiring within 90 days'
            }
            style={{ padding: '40px 0' }}
          />
        ) : (
          <Table<InventoryItem>
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            scroll={{ x: 1280 }}
            size="small"
            rowClassName={item => {
              const d = daysLeft(item.expiry_date)
              if (d < 0)  return 'row-critical'
              if (d <= 2) return 'row-critical'
              if (d <= 7) return 'row-warning'
              return ''
            }}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total, range) =>
                `${range[0]}–${range[1]} of ${total} items`,
            }}
            summary={pageData => {
              const totalQty = pageData.reduce((s, i) => s + i.quantity, 0)
              const totalVal = pageData.reduce(
                (s, i) => s + i.quantity * Number(i.selling_price), 0
              )
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Text strong>Page Total</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} />
                  <Table.Summary.Cell index={2} align="center">
                    <Text strong style={{ color: BRAND.critical }}>{totalQty} units</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} />
                  <Table.Summary.Cell index={4} align="right">
                    <Text strong style={{ color: BRAND.critical }}>
                      ₦{totalVal.toLocaleString()}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} />
                </Table.Summary.Row>
              )
            }}
          />
        )}
      </Card>

      {/* ── Report About to Expire Drawer ── */}
      <Drawer
        title={
          <Space>
            <ClockCircleOutlined style={{ color: BRAND.green }} />
            <span>Report About to Expire</span>
          </Space>
        }
        width={typeof window !== 'undefined' && window.innerWidth < 576 ? '100%' : 480}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); resetForm() }}
        extra={
          <Space>
            <Button onClick={() => { setDrawerOpen(false); resetForm() }}>Cancel</Button>
            <Button
              type="primary"
              loading={submitting}
              onClick={() => form.submit()}
              style={{ background: BRAND.green }}
            >
              Submit Report
            </Button>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          message="Report expiring items discovered on the floor for team lead review."
          style={{ marginBottom: 20, borderRadius: 8 }}
        />

        <Form form={form} layout="vertical" onFinish={handleSubmit}>

          {/* Description */}
          <Form.Item
            name="description"
            label="Description"
            rules={[{ required: true, message: 'Enter product description' }]}
          >
            <Input placeholder="Enter product name / description..." />
          </Form.Item>

          {/* Barcode */}
          <Form.Item label="Barcode">
            <Input
              value={batchSku}
              onChange={e => setBatchSku(e.target.value)}
              placeholder="Enter barcode / SKU"
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>

          {/* Qty | Price */}
          <Row gutter={12}>
            <Col xs={12}>
              <Form.Item label="Qty">
                <InputNumber
                  min={1}
                  style={{ width: '100%' }}
                  value={batchQty}
                  onChange={v => setBatchQty(v)}
                  placeholder="0"
                />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item label="Price (₦)">
                <InputNumber
                  min={0}
                  style={{ width: '100%' }}
                  value={batchPrice}
                  onChange={v => setBatchPrice(v)}
                  formatter={v => `₦ ${v}`}
                  placeholder="0"
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Amount (auto-calculated) */}
          <Form.Item label="Amount (₦)">
            <Input
              value={batchAmount > 0 ? `₦${batchAmount.toLocaleString()}` : ''}
              placeholder="Auto-calculated"
              readOnly
              style={{ background: '#f5f5f5', color: BRAND.green, fontWeight: 600 }}
            />
          </Form.Item>

          {/* Expiration date */}
          <Form.Item name="expiry_date" label="Expiration Date">
            <DatePicker style={{ width: '100%' }} format="DD/MM/YYYY" />
          </Form.Item>

          {/* Category */}
          <Form.Item
            name="category"
            label="Category"
            rules={[{ required: true, message: 'Select a department category' }]}
          >
            <Select placeholder="Select department category...">
              {STORE_CATEGORIES.map(cat => (
                <Option key={cat} value={cat}>{cat}</Option>
              ))}
            </Select>
          </Form.Item>

          {/* Notes */}
          <Form.Item name="notes" label="Notes (optional)">
            <Input.TextArea
              rows={3}
              placeholder="Additional observations about this item..."
            />
          </Form.Item>

        </Form>
      </Drawer>

    </>
  )
}

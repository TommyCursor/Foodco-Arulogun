'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, Tag, Button, Space, Input, Select, AutoComplete, Typography,
  Drawer, Form, InputNumber, Card, Statistic,
  Row, Col, Tooltip, Modal, Badge,
  Divider, Empty, App, Popconfirm,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, SearchOutlined, TagOutlined, ThunderboltOutlined,
  ReloadOutlined, RiseOutlined,
  ExclamationCircleOutlined, InfoCircleOutlined, CheckCircleOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { BRAND, DISCOUNT, EXPIRY, STORE_CATEGORIES } from '@/lib/constants'
import type { Discount, InventoryItem } from '@/types'

const { Title, Text } = Typography
const { Option } = Select
const { confirm } = Modal

// ── Helpers ──────────────────────────────────────────────────
function getDaysToExpiry(date: string) {
  return dayjs(date).diff(dayjs().startOf('day'), 'day')
}

function getAISuggestedDiscount(daysToExpiry: number): number | null {
  for (const tier of DISCOUNT.AI_TIERS) {
    const [min, max] = tier.daysToExpiry
    if (daysToExpiry >= min && daysToExpiry <= max) return tier.percentage
  }
  return null
}

function recoveryRate(d: Discount): number {
  const potential = d.units_sold * Number(d.original_price)
  if (!potential) return 0
  return Math.min(100, Math.round((Number(d.revenue_recovered) / potential) * 100))
}

// ── Sub-components ────────────────────────────────────────────
function DiscountTypeBadge({ type }: { type: Discount['discount_type'] }) {
  const map = {
    manual:       { color: 'blue',   label: 'Manual'       },
    ai_suggested: { color: 'gold',   label: '⚡ AI Suggested' },
    flash_sale:   { color: 'orange', label: '🔥 Flash Sale'   },
    clearance:    { color: 'red',    label: 'Clearance'    },
  }
  const { color, label } = map[type]
  return <Tag color={color} style={{ borderRadius: 4 }}>{label}</Tag>
}

function StatusBadge({ status }: { status: Discount['status'] }) {
  const map = {
    active:    { status: 'success' as const,  text: 'Active'    },
    expired:   { status: 'default' as const,  text: 'Expired'   },
    cancelled: { status: 'error' as const,    text: 'Cancelled' },
  }
  const { status: s, text } = map[status]
  return <Badge status={s} text={text} />
}

// ── AI Suggestion Card ────────────────────────────────────────
function AISuggestionCard({
  batch,
  onApply,
}: {
  batch: InventoryItem
  onApply: (batch: InventoryItem, pct: number) => void
}) {
  const days = getDaysToExpiry(batch.expiry_date)
  const pct  = getAISuggestedDiscount(days)
  if (!pct) return null

  const discountedPrice = Number(batch.selling_price) * (1 - pct / 100)
  const valueAtRisk     = Number(batch.quantity) * Number(batch.selling_price)

  return (
    <div
      style={{
        border: `1px solid ${BRAND.yellow}`,
        borderRadius: 8,
        padding: '12px 16px',
        background: BRAND.yellowBg,
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Space style={{ marginBottom: 4 }}>
            <ThunderboltOutlined style={{ color: BRAND.yellow }} />
            <Text strong style={{ fontSize: 13 }}>{batch.product?.name}</Text>
            <Tag color="gold" style={{ marginLeft: 4 }}>{days}d left</Tag>
          </Space>
          <div style={{ fontSize: 12, color: '#666' }}>
            {batch.quantity} units · ₦{valueAtRisk.toLocaleString()} at risk ·{' '}
            {batch.location ?? 'No location'} ·{' '}
            AI suggests <strong>{pct}% off</strong> → ₦{discountedPrice.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <Button
          size="small"
          type="primary"
          icon={<ThunderboltOutlined />}
          style={{ background: BRAND.yellow, borderColor: BRAND.yellow, color: '#333', flexShrink: 0 }}
          onClick={() => onApply(batch, pct)}
        >
          Apply
        </Button>
      </div>
    </div>
  )
}

const DISCOUNT_CONDITIONS_LS = 'discount_conditions_list'

const DEFAULT_DISCOUNT_CONDITIONS = [
  'Near Expiry',
  'Overstock',
  'Season End',
  'Flash Sale',
  'Clearance',
  'Manual Markdown',
  'Damaged Packaging',
  'Supplier Promotion',
]

// ── Main Component ────────────────────────────────────────────
interface Props {
  discounts:      Discount[]
  eligibleBatches: InventoryItem[]
}

export default function DiscountsClient({ discounts, eligibleBatches }: Props) {
  const router                              = useRouter()
  const { notification }                    = App.useApp()
  const [deleting,      setDeleting]        = useState<string | null>(null)
  const [search,        setSearch]          = useState('')
  const [filterStatus,  setFilterStatus]    = useState<string>('active')
  const [filterType,    setFilterType]      = useState<string>('all')
  const [drawerOpen,    setDrawerOpen]      = useState(false)
  const [submitting,    setSubmitting]      = useState(false)
  const [form]                              = Form.useForm()
  const [batchSku,      setBatchSku]        = useState('')
  const [batchQty,      setBatchQty]        = useState<number | null>(null)
  const [batchPrice,    setBatchPrice]      = useState<number | null>(null)
  const [savedConditions, setSavedConditions] = useState<string[]>([])

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DISCOUNT_CONDITIONS_LS) ?? '[]') as string[]
      setSavedConditions(stored)
    } catch {}
  }, [])

  const allDiscountConditions = useMemo(() => {
    const all = [...new Set([...DEFAULT_DISCOUNT_CONDITIONS, ...savedConditions])]
    return all.map(c => ({ value: c, label: c }))
  }, [savedConditions])

  function saveNewCondition(condition: string) {
    if (!condition || DEFAULT_DISCOUNT_CONDITIONS.includes(condition) || savedConditions.includes(condition)) return
    const updated = [...savedConditions, condition]
    setSavedConditions(updated)
    try { localStorage.setItem(DISCOUNT_CONDITIONS_LS, JSON.stringify(updated)) } catch {}
  }

  const batchAmount = (batchQty ?? 0) * (batchPrice ?? 0)

  function resetDrawer() {
    form.resetFields()
    setBatchSku('')
    setBatchQty(null)
    setBatchPrice(null)
  }

  // ── Derived stats ──
  const stats = useMemo(() => {
    const active    = discounts.filter(d => d.status === 'active')
    const totalRec  = discounts.reduce((s, d) => s + Number(d.revenue_recovered), 0)
    const aiCount   = discounts.filter(d => d.discount_type === 'ai_suggested').length
    const avgRate   = active.length
      ? Math.round(active.reduce((s, d) => s + recoveryRate(d), 0) / active.length)
      : 0
    return { activeCount: active.length, totalRecovered: totalRec, aiCount, avgRate }
  }, [discounts])

  // ── Filtered rows ──
  const filtered = useMemo(() => {
    return discounts.filter(d => {
      const name = (d.inventory_item?.product?.name ?? '').toLowerCase()
      const q    = search.toLowerCase()
      if (q && !name.includes(q) && !(d.name ?? '').toLowerCase().includes(q)) return false
      if (filterStatus !== 'all' && d.status !== filterStatus) return false
      if (filterType   !== 'all' && d.discount_type !== filterType) return false
      return true
    })
  }, [discounts, search, filterStatus, filterType])

  // ── Apply AI suggestion → pre-fill form ──
  function applyAISuggestion(batch: InventoryItem, pct: number) {
    setBatchSku(batch.product?.sku ?? '')
    setBatchQty(Number(batch.quantity))
    setBatchPrice(Number(batch.selling_price))
    form.setFieldsValue({
      description: batch.product?.name ?? '',
      name:        `AI Flash — ${batch.product?.name} (${pct}% off)`,
    })
    setDrawerOpen(true)
  }

  // ── Submit ──
  async function handleSubmit(values: Record<string, unknown>) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/discounts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          description:    values.description,
          barcode:        batchSku || null,
          qty:            batchQty ?? null,
          name:           values.name ?? null,
          original_price: batchPrice ?? 0,
          category:       values.category ?? null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      saveNewCondition(values.name as string)
      setDrawerOpen(false)
      resetDrawer()
      notification.success({
        message:     'Report Submitted!',
        description: 'Discount report logged. It now appears in Discounts and the Inventory pipeline.',
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
      Modal.error({ title: 'Failed to create discount', content: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Cancel discount ──
  function handleCancel(discount: Discount) {
    confirm({
      title:   'Cancel this discount?',
      icon:    <ExclamationCircleOutlined style={{ color: BRAND.critical }} />,
      content: 'The item will revert to its original price. This cannot be undone.',
      okText:  'Cancel Discount',
      okType:  'danger',
      async onOk() {
        await fetch(`/api/discounts/${discount.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ status: 'cancelled' }),
        })
        router.refresh()
      },
    })
  }

  // ── Delete submission ──
  async function doDelete(discount: Discount) {
    setDeleting(discount.id)
    try {
      const res = await fetch(`/api/discounts/${discount.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res.json()
        notification.error({ message: 'Delete failed', description: error, placement: 'topRight', duration: 4 })
        return
      }
      notification.success({
        message:     'Submission deleted',
        description: 'The discount report and its inventory entry have been removed.',
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

  // ── Columns ──
  const columns: ColumnsType<Discount> = [
    {
      title:  'Description',
      key:    'description',
      width:  200,
      sorter: (a, b) =>
        (a.inventory_item?.product?.name ?? '').localeCompare(b.inventory_item?.product?.name ?? ''),
      render: (_, d) => (
        <Text strong style={{ fontSize: 13 }}>{d.inventory_item?.product?.name ?? '—'}</Text>
      ),
    },
    {
      title:      'Barcode',
      key:        'barcode',
      width:      130,
      responsive: ['sm'],
      render: (_, d) => (
        <Text code style={{ fontSize: 12 }}>{d.inventory_item?.product?.sku ?? '—'}</Text>
      ),
    },
    {
      title:  'Qty',
      key:    'qty',
      width:  75,
      align:  'center',
      render: (_, d) => <Text>{d.inventory_item?.quantity != null ? d.inventory_item.quantity : '—'}</Text>,
    },
    {
      title:      'Price (₦)',
      key:        'price',
      width:      120,
      align:      'right',
      responsive: ['md'],
      render: (_, d) => (
        <Text style={{ textDecoration: 'line-through', color: '#aaa' }}>
          ₦{Number(d.original_price).toLocaleString()}
        </Text>
      ),
      sorter: (a, b) => Number(a.original_price) - Number(b.original_price),
    },
    {
      title:      'Amount (₦)',
      key:        'amount',
      width:      140,
      align:      'right',
      responsive: ['md'],
      render: (_, d) => {
        const qty = Number(d.inventory_item?.quantity ?? 0)
        return <Text>₦{(qty * Number(d.original_price)).toLocaleString()}</Text>
      },
    },
    {
      title:  'Discount Price (₦)',
      key:    'discount_price',
      width:  150,
      align:  'right',
      render: (_, d) => (
        <Text strong style={{ color: BRAND.green, fontSize: 14 }}>
          ₦{Number(d.discounted_price).toLocaleString()}
        </Text>
      ),
      sorter: (a, b) => Number(a.discounted_price) - Number(b.discounted_price),
    },
    {
      title:  'Condition',
      key:    'condition',
      width:  160,
      render: (_, d) => (
        <Tag style={{ borderRadius: 4 }}>{(d as any).name ?? '—'}</Tag>
      ),
      filters: DEFAULT_DISCOUNT_CONDITIONS.map(c => ({ text: c, value: c })),
      onFilter: (value, d) => (d as any).name === value,
    },
    {
      title:      'Status',
      dataIndex:  'status',
      width:      110,
      responsive: ['sm'],
      render: (v: Discount['status']) => <StatusBadge status={v} />,
      filters: [
        { text: 'Active',    value: 'active'    },
        { text: 'Expired',   value: 'expired'   },
        { text: 'Cancelled', value: 'cancelled' },
      ],
      onFilter: (value, d) => d.status === value,
    },
    {
      title:      'Reported By',
      key:        'reported_by',
      width:      130,
      responsive: ['md'],
      render: (_, d) => (
        <Text style={{ fontSize: 12 }}>{(d as any).applicant?.full_name ?? '—'}</Text>
      ),
    },
    {
      title:  'Approval',
      key:    'approval',
      width:  150,
      render: (_, d) => {
        const stage        = (d.inventory_item as any)?.pipeline_stage
        const isApproved   = !!(d as any).approved_by || stage === 'sales_approved'
        const approverName = (d as any).approver?.full_name as string | undefined
        return (
          <div>
            {isApproved
              ? <Tag color="green">Approved</Tag>
              : <Tag color="gold">Pending Approval</Tag>}
            {isApproved && approverName && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>by {approverName}</div>
            )}
          </div>
        )
      },
    },
    {
      title:  'Actions',
      key:    'actions',
      fixed:  'right',
      width:  70,
      render: (_, d) => {
        const stage     = (d.inventory_item as any)?.pipeline_stage
        const canDelete = !['sent_to_loss_control', 'resolution_received', 'sales_approved', 'sold'].includes(stage)
        if (!canDelete) return null
        return (
          <Popconfirm
            title="Delete this submission?"
            description="This permanently removes the report and its inventory entry."
            okText="Yes, Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            onConfirm={() => doDelete(d)}
          >
            <Tooltip title="Delete Submission">
              <Button size="small" icon={<DeleteOutlined />} danger loading={deleting === d.id} />
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
          <Card className="kpi-card success" bordered={false} size="small">
            <Statistic
              title="Active Discounts"
              value={stats.activeCount}
              valueStyle={{ color: BRAND.green, fontSize: 22, fontWeight: 700 }}
              prefix={<TagOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card success" bordered={false} size="small">
            <Statistic
              title="Revenue Recovered"
              value={`₦${stats.totalRecovered.toLocaleString()}`}
              valueStyle={{ color: BRAND.green, fontSize: 18, fontWeight: 700 }}
              prefix={<RiseOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card warning" bordered={false} size="small">
            <Statistic
              title="Avg Recovery Rate"
              value={stats.avgRate}
              suffix="%"
              valueStyle={{ color: '#b8860b', fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card success" bordered={false} size="small">
            <Statistic
              title="AI-Suggested Applied"
              value={stats.aiCount}
              valueStyle={{ color: BRAND.green, fontSize: 22, fontWeight: 700 }}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* ── AI Suggestions Panel ── */}
      {eligibleBatches.some(b => getAISuggestedDiscount(getDaysToExpiry(b.expiry_date)) !== null) && (
        <Card
          bordered={false}
          style={{ borderRadius: 8, marginBottom: 16, borderLeft: `4px solid ${BRAND.yellow}` }}
          title={
            <Space>
              <ThunderboltOutlined style={{ color: BRAND.yellow }} />
              <Text strong>AI Discount Suggestions</Text>
              <Tag color="gold">Smart Engine</Tag>
            </Space>
          }
        >
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
            Items expiring soon — apply tiered discounts to recover value before expiry.
          </Text>
          {eligibleBatches
            .filter(b => getAISuggestedDiscount(getDaysToExpiry(b.expiry_date)) !== null)
            .slice(0, 5)
            .map(b => (
              <AISuggestionCard key={b.id} batch={b} onApply={applyAISuggestion} />
            ))
          }
        </Card>
      )}

      {/* ── Header + Filters ── */}
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <Title level={5} style={{ margin: 0, color: BRAND.green }}>
            Discount Records
          </Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { resetDrawer(); setDrawerOpen(true) }}
            style={{ background: BRAND.green }}
          >
            Report Discount
          </Button>
        </div>

        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={9} md={7}>
            <Input
              prefix={<SearchOutlined style={{ color: '#ccc' }} />}
              placeholder="Search product or discount name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={5} md={4}>
            <Select value={filterStatus} onChange={setFilterStatus} style={{ width: '100%' }}>
              <Option value="all">All Status</Option>
              <Option value="active">Active</Option>
              <Option value="expired">Expired</Option>
              <Option value="cancelled">Cancelled</Option>
            </Select>
          </Col>
          <Col xs={12} sm={5} md={4}>
            <Select value={filterType} onChange={setFilterType} style={{ width: '100%' }}>
              <Option value="all">All Types</Option>
              <Option value="manual">Manual</Option>
              <Option value="ai_suggested">AI Suggested</Option>
              <Option value="flash_sale">Flash Sale</Option>
              <Option value="clearance">Clearance</Option>
            </Select>
          </Col>
          <Col xs={12} sm={4} md={3}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => { setSearch(''); setFilterStatus('active'); setFilterType('all') }}
              style={{ width: '100%' }}
            >
              Clear
            </Button>
          </Col>
        </Row>
      </Card>

      {/* ── Table ── */}
      <Card bordered={false} style={{ borderRadius: 8 }}>
        {filtered.length === 0 ? (
          <Empty description="No discounts found" style={{ padding: '40px 0' }} />
        ) : (
          <Table<Discount>
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            scroll={{ x: 1250 }}
            size="small"
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} discounts`,
            }}
            summary={pageData => {
              const totalRec = pageData.reduce((s, d) => s + Number(d.revenue_recovered), 0)
              const totalSold = pageData.reduce((s, d) => s + (d.units_sold ?? 0), 0)
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={6}>
                    <Text strong>Page Total</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6}>
                    <Text strong style={{ color: BRAND.green }}>
                      ₦{totalRec.toLocaleString()} recovered · {totalSold} units sold
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} colSpan={2} />
                </Table.Summary.Row>
              )
            }}
          />
        )}
      </Card>

      {/* ── Create Discount Drawer ── */}
      <Drawer
        title={
          <Space>
            <TagOutlined style={{ color: BRAND.green }} />
            <span>Report Discount</span>
          </Space>
        }
        width={typeof window !== 'undefined' && window.innerWidth < 576 ? '100%' : 500}
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); resetDrawer() }}
        extra={
          <Space>
            <Button onClick={() => { setDrawerOpen(false); resetDrawer() }}>Cancel</Button>
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
        {/* AI Tier Guide */}
        <Card
          size="small"
          style={{ marginBottom: 20, borderColor: BRAND.yellow, background: BRAND.yellowBg, borderRadius: 8 }}
        >
          <Space style={{ marginBottom: 6 }}>
            <ThunderboltOutlined style={{ color: BRAND.yellow }} />
            <Text strong style={{ fontSize: 12 }}>AI Recommended Discount Tiers</Text>
          </Space>
          <div style={{ fontSize: 12, lineHeight: 1.8 }}>
            <div>• <strong>5–7 days to expiry:</strong> 20% off</div>
            <div>• <strong>2–4 days to expiry:</strong> 40% off</div>
            <div>• <strong>0–1 days to expiry:</strong> 60% off</div>
          </div>
        </Card>

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

          {/* Qty · Price row */}
          <Row gutter={12}>
            <Col xs={12}>
              <Form.Item label="Qty">
                <InputNumber
                  min={0}
                  step={0.01}
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
                  formatter={val => `₦ ${val}`}
                  placeholder="0"
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Amount (auto-calc) */}
          <Form.Item label="Amount (₦)">
            <Input
              value={batchAmount > 0 ? `₦${batchAmount.toLocaleString()}` : ''}
              placeholder="Auto-calculated"
              readOnly
              style={{ background: '#f5f5f5' }}
            />
          </Form.Item>

          {/* Condition (reason for discount) */}
          <Form.Item
            name="name"
            label="Condition"
            rules={[{ required: true, message: 'Enter or select a condition' }]}
          >
            <AutoComplete
              options={allDiscountConditions}
              placeholder="Select or type reason for discount..."
              filterOption={(input, option) =>
                (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
              }
              allowClear
            />
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

          <Divider style={{ margin: '8px 0 16px' }} />

          <div style={{ fontSize: 12, color: '#888', display: 'flex', alignItems: 'center', gap: 6 }}>
            <InfoCircleOutlined />
            The item's shelf price will be updated immediately after creation.
          </div>
        </Form>
      </Drawer>

    </>
  )
}

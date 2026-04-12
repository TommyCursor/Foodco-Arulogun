'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, Tag, Button, Input, Select, Typography, Drawer,
  Card, Statistic, Row, Col, Space, Empty, App, Tooltip,
  Divider, InputNumber, Radio, Alert,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SearchOutlined, ReloadOutlined, SolutionOutlined,
  ClockCircleOutlined, CheckCircleOutlined, TagOutlined,
  EditOutlined, ArrowDownOutlined, DollarOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { BRAND } from '@/lib/constants'
import type { InventoryItem } from '@/types'

const { Title, Text } = Typography
const { Option } = Select
const { TextArea } = Input

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

// ── Resolution Drawer ──────────────────────────────────────────────────────
interface DrawerState {
  item:            InventoryItem
  notes:           string
  resolutionType:  'notes_only' | 'discount'
  pct:             number | null   // discount percentage
  newPrice:        number | null   // discounted price
  lastEdited:      'pct' | 'price' | null
}

export default function ResolutionClient({ items }: Props) {
  const router = useRouter()
  const { notification } = App.useApp()

  const [search,      setSearch]      = useState('')
  const [filterStage, setFilterStage] = useState<string>('all')
  const [saving,      setSaving]      = useState(false)
  const [drawer,      setDrawer]      = useState<DrawerState | null>(null)

  // ── KPI stats ───────────────────────────────────────────
  const stats = useMemo(() => {
    const awaiting   = items.filter(i => ['sent_to_loss_control', 'sent_to_resolution'].includes((i as any).pipeline_stage))
    const resolved   = items.filter(i => (i as any).pipeline_stage === 'resolution_received')
    const totalValue = items.reduce((s, i) => s + i.quantity * Number(i.selling_price), 0)
    // Potential loss across all items that have discounts pending
    const potentialLoss = items.reduce((s, i) => {
      const orig = Number((i as any).original_price ?? i.selling_price)
      const curr = Number(i.selling_price)
      return s + (orig - curr) * i.quantity
    }, 0)
    return { awaiting: awaiting.length, resolved: resolved.length, totalValue, potentialLoss }
  }, [items])

  const filtered = useMemo(() => items.filter(item => {
    const name  = (item.product?.name ?? '').toLowerCase()
    const sku   = (item.product?.sku  ?? '').toLowerCase()
    const q     = search.toLowerCase()
    if (q && !name.includes(q) && !sku.includes(q)) return false
    const stage = (item as any).pipeline_stage
    if (filterStage !== 'all' && stage !== filterStage) return false
    return true
  }), [items, search, filterStage])

  // ── Open drawer for an item ─────────────────────────────
  function openDrawer(item: InventoryItem) {
    const reportType   = getReportType(item)
    const defaultType: 'notes_only' | 'discount' =
      reportType === 'Discount' ? 'discount' : 'notes_only'
    setDrawer({
      item,
      notes:          item.notes ?? '',
      resolutionType: defaultType,
      pct:            null,
      newPrice:       null,
      lastEdited:     null,
    })
  }

  // ── Bidirectional price ↔ percent sync ─────────────────
  function onPctChange(val: number | null) {
    if (!drawer) return
    const orig = Number((drawer.item as any).original_price ?? drawer.item.selling_price)
    const newP = val != null ? Math.round(orig * (1 - val / 100) * 100) / 100 : null
    setDrawer({ ...drawer, pct: val, newPrice: newP, lastEdited: 'pct' })
  }

  function onPriceChange(val: number | null) {
    if (!drawer) return
    const orig = Number((drawer.item as any).original_price ?? drawer.item.selling_price)
    const newPct = val != null && orig > 0
      ? Math.round(((orig - val) / orig) * 10000) / 100
      : null
    setDrawer({ ...drawer, newPrice: val, pct: newPct, lastEdited: 'price' })
  }

  // ── Save resolution ─────────────────────────────────────
  async function handleSave() {
    if (!drawer) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        resolution_type: drawer.resolutionType,
        notes:           drawer.notes.trim() || null,
      }
      if (drawer.resolutionType === 'discount') {
        if (drawer.pct == null && drawer.newPrice == null) {
          notification.error({ message: 'Enter a discount percentage or new price', placement: 'topRight' })
          setSaving(false)
          return
        }
        if (drawer.pct != null)      body.discount_percentage = drawer.pct
        if (drawer.newPrice != null) body.discounted_price    = drawer.newPrice
      }

      const res = await fetch(`/api/resolution/${drawer.item.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)

      const result = await res.json()
      const lossMsg = result.potential_loss
        ? ` Potential loss: ${formatNaira(result.potential_loss)}.`
        : ''

      notification.success({
        message:     'Resolution saved',
        description: `${drawer.item.product?.name} moved to Resolution Received.${lossMsg} A manager can now approve.`,
        placement:   'topRight',
        duration:    4,
        icon:        <CheckCircleOutlined style={{ color: BRAND.green }} />,
      })
      setDrawer(null)
      router.refresh()
    } catch (err: any) {
      notification.error({ message: 'Save failed', description: err.message, placement: 'topRight', duration: 4 })
    } finally {
      setSaving(false)
    }
  }

  // ── Derived values for the drawer ──────────────────────
  const drawerOrigPrice  = drawer ? Number((drawer.item as any).original_price ?? drawer.item.selling_price) : 0
  const drawerCurrPrice  = drawer ? Number(drawer.item.selling_price) : 0
  const isReDiscounting  = drawerCurrPrice < drawerOrigPrice
  const potentialLoss    = drawer && drawer.newPrice != null
    ? Math.round((drawerOrigPrice - drawer.newPrice) * drawer.item.quantity * 100) / 100
    : null
  const isValidDiscount  = drawer && drawer.resolutionType === 'discount'
    && drawer.newPrice != null && drawer.newPrice > 0 && drawer.newPrice < drawerOrigPrice

  // ── Table columns ───────────────────────────────────────
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
      width:      110,
      responsive: ['sm'],
      render: (_, item) => <Tag style={{ borderRadius: 4 }}>{item.product?.category?.name ?? '—'}</Tag>,
    },
    {
      title:     'Qty',
      dataIndex: 'quantity',
      width:     60,
      align:     'center',
      render:    v => <Text strong>{parseFloat(Number(v).toFixed(2))}</Text>,
    },
    {
      title:  'Original Price',
      key:    'orig_price',
      width:  120,
      align:  'right',
      responsive: ['md'],
      render: (_, item) => (
        <Text style={{ fontFamily: 'monospace' }}>
          {formatNaira(Number((item as any).original_price ?? item.selling_price))}
        </Text>
      ),
    },
    {
      title:  'Current Price',
      key:    'curr_price',
      width:  120,
      align:  'right',
      render: (_, item) => {
        const orig = Number((item as any).original_price ?? item.selling_price)
        const curr = Number(item.selling_price)
        const isDisc = curr < orig
        return (
          <Space size={4}>
            <Text strong style={{ fontFamily: 'monospace', color: isDisc ? BRAND.critical : '#333' }}>
              {formatNaira(curr)}
            </Text>
            {isDisc && (
              <Tag color="orange" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                {Math.round((orig - curr) / orig * 100)}% off
              </Tag>
            )}
          </Space>
        )
      },
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
      title:      'Reported At',
      key:        'reported_at',
      width:      120,
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
      title:  'LC Status',
      key:    'lc_status',
      width:  150,
      render: (_, item) => {
        const stage = (item as any).pipeline_stage
        if (stage === 'sent_to_loss_control')
          return <Tag color="blue" style={{ borderRadius: 4 }}>Awaiting Resolution</Tag>
        if (stage === 'sent_to_resolution')
          return <Tag color="geekblue" style={{ borderRadius: 4 }}>Sent to Resolution</Tag>
        if (stage === 'resolution_received')
          return <Tag color="orange" style={{ borderRadius: 4 }}>Resolution Entered</Tag>
        return <Tag style={{ borderRadius: 4 }}>{stage}</Tag>
      },
    },
    {
      title:  'Action',
      key:    'action',
      width:  110,
      fixed:  'right',
      render: (_, item) => {
        const stage = (item as any).pipeline_stage
        const isActionable = ['sent_to_loss_control', 'sent_to_resolution'].includes(stage)
        return (
          <Button
            size="small"
            type={isActionable ? 'primary' : 'default'}
            icon={<EditOutlined />}
            style={isActionable ? { background: BRAND.green, borderColor: BRAND.green } : {}}
            onClick={() => openDrawer(item)}
          >
            {isActionable ? 'Enter' : 'Edit'}
          </Button>
        )
      },
    },
  ]

  return (
    <>
      {/* ── KPI Cards ─────────────────────────────────────── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small" style={{ background: '#E3F2FD', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Awaiting Resolution</span>}
              value={stats.awaiting}
              suffix="items"
              valueStyle={{ color: '#1565C0', fontSize: 'clamp(14px, 4vw, 20px)', fontWeight: 700 }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small" style={{ background: '#FFF8E1', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Resolution Entered</span>}
              value={stats.resolved}
              suffix="items"
              valueStyle={{ color: '#FA8C16', fontSize: 'clamp(14px, 4vw, 20px)', fontWeight: 700 }}
              prefix={<SolutionOutlined />}
            />
            <Text style={{ fontSize: 10, color: '#888' }}>Pending approval</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small" style={{ background: '#F5F5F5', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Total Value in Pipeline</span>}
              value={stats.totalValue}
              formatter={v => formatNaira(Number(v))}
              valueStyle={{ fontSize: 'clamp(12px, 3.5vw, 18px)', fontWeight: 700, color: '#333' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small"
            style={{ background: stats.potentialLoss > 0 ? BRAND.criticalBg : '#F5F5F5', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Discounted Value Loss</span>}
              value={stats.potentialLoss}
              formatter={v => formatNaira(Number(v))}
              valueStyle={{ fontSize: 'clamp(12px, 3.5vw, 18px)', fontWeight: 700, color: stats.potentialLoss > 0 ? BRAND.critical : '#888' }}
              prefix={<ArrowDownOutlined />}
            />
            <Text style={{ fontSize: 10, color: '#888' }}>Original vs current price</Text>
          </Card>
        </Col>
      </Row>

      {/* ── Filters ───────────────────────────────────────── */}
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <Title level={5} style={{ margin: 0, color: BRAND.green }}>
            Loss Control Resolutions
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
            <Select value={filterStage} onChange={setFilterStage} style={{ width: '100%' }}>
              <Option value="all">All Stages</Option>
              <Option value="sent_to_loss_control">Awaiting Resolution</Option>
              <Option value="sent_to_resolution">Sent to Resolution</Option>
              <Option value="resolution_received">Resolution Entered</Option>
            </Select>
          </Col>
          <Col xs={12} sm={4} md={3}>
            <Button icon={<ReloadOutlined />} onClick={() => { setSearch(''); setFilterStage('all') }} style={{ width: '100%' }}>
              Clear
            </Button>
          </Col>
        </Row>
      </Card>

      {/* ── Table ─────────────────────────────────────────── */}
      <Card bordered={false} style={{ borderRadius: 8 }}>
        {filtered.length === 0 ? (
          <Empty
            description={search || filterStage !== 'all' ? 'No items match the filter' : 'No items awaiting resolution'}
            style={{ padding: '40px 0' }}
          />
        ) : (
          <Table<InventoryItem>
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            scroll={{ x: 1000 }}
            size="small"
            rowClassName={item => ['sent_to_loss_control', 'sent_to_resolution'].includes((item as any).pipeline_stage) ? 'row-warning' : ''}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} items`,
            }}
          />
        )}
      </Card>

      {/* ── Resolution Drawer ────────────────────────────── */}
      <Drawer
        title={
          <Space>
            <SolutionOutlined style={{ color: BRAND.green }} />
            <span>Enter Resolution</span>
            {drawer && (
              <Tag color="blue" style={{ marginLeft: 4 }}>{drawer.item.product?.name}</Tag>
            )}
          </Space>
        }
        open={!!drawer}
        onClose={() => setDrawer(null)}
        width={typeof window !== 'undefined' && window.innerWidth < 576 ? '100vw' : 500}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setDrawer(null)}>Cancel</Button>
            <Button
              type="primary"
              loading={saving}
              disabled={
                drawer?.resolutionType === 'discount'
                  ? !isValidDiscount
                  : !(drawer?.notes?.trim())
              }
              style={{ background: BRAND.green, borderColor: BRAND.green }}
              onClick={handleSave}
            >
              Save Resolution
            </Button>
          </div>
        }
      >
        {drawer && (() => {
          const reportType = getReportType(drawer.item)
          return (
            <div>
              {/* Item summary */}
              <Card size="small" style={{ background: '#F8F9FA', borderRadius: 8, marginBottom: 16 }}>
                <Row gutter={[8, 8]}>
                  <Col span={12}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Product</Text>
                    <div><Text strong>{drawer.item.product?.name}</Text></div>
                  </Col>
                  <Col span={12}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Category</Text>
                    <div><Tag style={{ borderRadius: 4 }}>{drawer.item.product?.category?.name ?? '—'}</Tag></div>
                  </Col>
                  <Col span={8}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Quantity</Text>
                    <div><Text strong>{parseFloat(Number(drawer.item.quantity).toFixed(2))}</Text></div>
                  </Col>
                  <Col span={8}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Original Price</Text>
                    <div><Text strong style={{ fontFamily: 'monospace' }}>{formatNaira(drawerOrigPrice)}</Text></div>
                  </Col>
                  <Col span={8}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Current Price</Text>
                    <div>
                      <Text strong style={{
                        fontFamily: 'monospace',
                        color: isReDiscounting ? '#b8860b' : '#333',
                      }}>
                        {formatNaira(drawerCurrPrice)}
                      </Text>
                    </div>
                  </Col>
                  <Col span={12}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Report Type</Text>
                    <div>
                      <Tag color={({ Discount: 'blue', Damage: 'red', 'About to Expire': 'gold' } as Record<string, string>)[reportType] ?? 'default'}>
                        {reportType}
                      </Tag>
                    </div>
                  </Col>
                  <Col span={12}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Expiry Date</Text>
                    <div>
                      {reportType === 'About to Expire'
                        ? <Text style={{ color: BRAND.critical, fontWeight: 600 }}>{dayjs(drawer.item.expiry_date).format('DD MMM YYYY')}</Text>
                        : <Text type="secondary">—</Text>
                      }
                    </div>
                  </Col>
                </Row>

                {isReDiscounting && (
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginTop: 10, fontSize: 12 }}
                    message={`Item already discounted — ${Math.round((drawerOrigPrice - drawerCurrPrice) / drawerOrigPrice * 100)}% off (${formatNaira(drawerCurrPrice)}). Any new discount is calculated from the original price.`}
                  />
                )}
              </Card>

              <Divider style={{ margin: '12px 0' }} />

              {/* Resolution type selector */}
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ color: BRAND.green, display: 'block', marginBottom: 8 }}>
                  Resolution Type
                </Text>
                <Radio.Group
                  value={drawer.resolutionType}
                  onChange={e => setDrawer({ ...drawer, resolutionType: e.target.value, pct: null, newPrice: null })}
                  buttonStyle="solid"
                >
                  <Radio.Button value="notes_only">Notes Only</Radio.Button>
                  <Radio.Button value="discount">
                    <TagOutlined style={{ marginRight: 4 }} />Set Discount Price
                  </Radio.Button>
                </Radio.Group>
              </div>

              {/* Discount price section */}
              {drawer.resolutionType === 'discount' && (
                <Card
                  size="small"
                  style={{ background: '#F0F7FF', borderRadius: 8, marginBottom: 16, border: '1px solid #91CAFF' }}
                >
                  <Text strong style={{ color: '#1565C0', display: 'block', marginBottom: 12 }}>
                    <DollarOutlined style={{ marginRight: 6 }} />
                    Discount Details (from original price: {formatNaira(drawerOrigPrice)})
                  </Text>

                  <Row gutter={12} align="middle">
                    {/* Percentage input */}
                    <Col span={11}>
                      <Text style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
                        Discount %
                      </Text>
                      <InputNumber
                        value={drawer.pct ?? undefined}
                        min={0.01}
                        max={99.99}
                        precision={2}
                        suffix="%"
                        style={{ width: '100%' }}
                        placeholder="e.g. 30"
                        onChange={onPctChange}
                        onFocus={() => setDrawer(d => d ? { ...d, lastEdited: 'pct' } : d)}
                        status={drawer.pct != null && (drawer.pct <= 0 || drawer.pct >= 100) ? 'error' : undefined}
                      />
                    </Col>

                    {/* Sync arrow */}
                    <Col span={2} style={{ textAlign: 'center', paddingTop: 22 }}>
                      <Text style={{ color: '#1565C0', fontSize: 16, fontWeight: 700 }}>⇄</Text>
                    </Col>

                    {/* Price input */}
                    <Col span={11}>
                      <Text style={{ fontSize: 12, color: '#555', display: 'block', marginBottom: 4 }}>
                        New Price (₦)
                      </Text>
                      <InputNumber
                        value={drawer.newPrice ?? undefined}
                        min={0.01}
                        max={drawerOrigPrice - 0.01}
                        precision={2}
                        prefix="₦"
                        style={{ width: '100%' }}
                        placeholder={`Max ${formatNaira(drawerOrigPrice - 0.01)}`}
                        onChange={onPriceChange}
                        onFocus={() => setDrawer(d => d ? { ...d, lastEdited: 'price' } : d)}
                        status={drawer.newPrice != null && drawer.newPrice >= drawerOrigPrice ? 'error' : undefined}
                      />
                    </Col>
                  </Row>

                  {/* Validation hint */}
                  {drawer.newPrice != null && drawer.newPrice >= drawerOrigPrice && (
                    <Text type="danger" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
                      New price must be lower than the original price ({formatNaira(drawerOrigPrice)})
                    </Text>
                  )}

                  {/* Potential loss callout */}
                  {isValidDiscount && potentialLoss != null && (
                    <div style={{
                      marginTop: 14,
                      padding: '10px 14px',
                      background: potentialLoss > 0 ? BRAND.criticalBg : BRAND.greenBg,
                      border: `1px solid ${potentialLoss > 0 ? BRAND.critical + '60' : BRAND.green + '60'}`,
                      borderRadius: 8,
                    }}>
                      <Row gutter={16}>
                        <Col span={8}>
                          <Text style={{ fontSize: 11, color: '#888', display: 'block' }}>Discount %</Text>
                          <Text strong style={{ color: '#1565C0', fontSize: 15 }}>
                            {drawer.pct?.toFixed(1)}%
                          </Text>
                        </Col>
                        <Col span={8}>
                          <Text style={{ fontSize: 11, color: '#888', display: 'block' }}>New Price / unit</Text>
                          <Text strong style={{ color: BRAND.green, fontSize: 15, fontFamily: 'monospace' }}>
                            {formatNaira(drawer.newPrice!)}
                          </Text>
                        </Col>
                        <Col span={8}>
                          <Text style={{ fontSize: 11, color: '#888', display: 'block' }}>Potential Loss</Text>
                          <Text strong style={{ color: BRAND.critical, fontSize: 15, fontFamily: 'monospace' }}>
                            {formatNaira(potentialLoss)}
                          </Text>
                          <Text style={{ fontSize: 10, color: '#888', display: 'block' }}>
                            ({parseFloat(Number(drawer.item.quantity).toFixed(2))} × {formatNaira(drawerOrigPrice - drawer.newPrice!)})
                          </Text>
                        </Col>
                      </Row>
                    </div>
                  )}
                </Card>
              )}

              {/* Notes */}
              <div style={{ marginBottom: 8 }}>
                <Text strong style={{ color: BRAND.green, display: 'block', marginBottom: 6 }}>
                  Resolution Notes {drawer.resolutionType === 'notes_only' && <Text type="danger">*</Text>}
                </Text>
                <TextArea
                  value={drawer.notes}
                  onChange={e => setDrawer({ ...drawer, notes: e.target.value })}
                  rows={4}
                  placeholder={
                    drawer.resolutionType === 'discount'
                      ? 'Optional: add context about this discount recommendation...'
                      : 'Enter loss control resolution / recommendation (required)...'
                  }
                  style={{ fontSize: 13, resize: 'none' }}
                />
              </div>

              {drawer.resolutionType === 'notes_only' && !drawer.notes.trim() && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  <WarningOutlined style={{ marginRight: 4 }} />
                  Notes are required for a notes-only resolution.
                </Text>
              )}
            </div>
          )
        })()}
      </Drawer>
    </>
  )
}

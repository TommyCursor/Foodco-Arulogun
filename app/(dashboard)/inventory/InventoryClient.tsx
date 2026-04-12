'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, Tag, Button, Input, Select, Typography,
  Badge, Row, Col, Card, Statistic, Space, DatePicker,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SearchOutlined, ReloadOutlined, AppstoreOutlined,
  WarningOutlined, TagOutlined, ClockCircleOutlined,
  SendOutlined, CheckCircleOutlined, ShoppingCartOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { BRAND, EXPIRY, STORE_CATEGORIES } from '@/lib/constants'
import type { InventoryItem, Category } from '@/types'

const { Title, Text } = Typography
const { Option } = Select

interface Props {
  items:      InventoryItem[]
  categories: Category[]
}

// ── Pipeline stage config ───────────────────────────────────────
const STAGE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  logged:               { label: 'Logged',              color: 'default', icon: <InboxOutlined />         },
  damage_reported:      { label: 'Damage Reported',     color: 'red',     icon: <WarningOutlined />        },
  discount_reported:    { label: 'Discount Reported',   color: 'orange',  icon: <TagOutlined />            },
  expiry_reported:      { label: 'About to Expire',     color: 'gold',    icon: <ClockCircleOutlined />    },
  sent_to_loss_control: { label: 'Sent to LC',          color: 'blue',    icon: <SendOutlined />           },
  sent_to_resolution:   { label: 'Sent to Resolution',  color: 'geekblue',icon: <SendOutlined />           },
  resolution_received:  { label: 'Resolution Received', color: 'cyan',    icon: <CheckCircleOutlined />    },
  sales_approved:       { label: 'Sales Approved',      color: 'green',   icon: <CheckCircleOutlined />    },
  waste_approved:       { label: 'Waste Approved',      color: 'orange',  icon: <CheckCircleOutlined />    },
  sold:                 { label: 'Sold',                color: 'purple',  icon: <ShoppingCartOutlined />   },
}

const STAGE_FILTER_OPTIONS = [
  { value: 'all',                  label: 'All',               icon: <AppstoreOutlined /> },
  { value: 'logged',               label: 'Logged',            icon: <InboxOutlined /> },
  { value: 'damage_reported',      label: 'Damage Reported',   icon: <WarningOutlined /> },
  { value: 'discount_reported',    label: 'Discount Reported', icon: <TagOutlined /> },
  { value: 'expiry_reported',      label: 'About to Expire',   icon: <ClockCircleOutlined /> },
  { value: 'sent_to_loss_control', label: 'Sent to LC',           icon: <SendOutlined /> },
  { value: 'sent_to_resolution',   label: 'Sent to Resolution',  icon: <SendOutlined /> },
  { value: 'resolution_received',  label: 'Resolution Recv.',    icon: <CheckCircleOutlined /> },
  { value: 'sales_approved',       label: 'Sales Approved',    icon: <CheckCircleOutlined /> },
  { value: 'waste_approved',       label: 'Waste Approved',    icon: <CheckCircleOutlined /> },
  { value: 'sold',                 label: 'Sold',              icon: <ShoppingCartOutlined /> },
]

// ── Helpers ─────────────────────────────────────────────────────
function getDaysToExpiry(expiryDate: string) {
  return dayjs(expiryDate).diff(dayjs().startOf('day'), 'day')
}

function ExpiryTag({ expiryDate }: { expiryDate: string }) {
  const days = getDaysToExpiry(expiryDate)
  if (days < 0)                return <Tag color="red">Expired {Math.abs(days)}d ago</Tag>
  if (days === 0)              return <Tag color="red">Expires today</Tag>
  if (days <= EXPIRY.CRITICAL) return <Tag color="volcano">{days}d left</Tag>
  if (days <= EXPIRY.WARNING)  return <Tag color="gold">{days}d left</Tag>
  return <Tag color="green">{days}d left</Tag>
}

function StatusBadge({ status }: { status: InventoryItem['status'] }) {
  const map: Record<InventoryItem['status'], { color: string; label: string }> = {
    active:     { color: 'success', label: 'Active'     },
    discounted: { color: 'warning', label: 'Discounted' },
    expired:    { color: 'error',   label: 'Expired'    },
    damaged:    { color: 'default', label: 'Damaged'    },
    removed:    { color: 'default', label: 'Removed'    },
  }
  const { color, label } = map[status] ?? { color: 'default', label: status }
  return <Badge status={color as any} text={label} />
}

// ── Component ───────────────────────────────────────────────────
export default function InventoryClient({ items, categories }: Props) {
  const router = useRouter()

  const [search,            setSearch]            = useState('')
  const [filterStage,       setFilterStage]       = useState<string>('all')
  const [filterStatus,      setFilterStatus]      = useState<string>('all')
  const [filterCat,         setFilterCat]         = useState<string>('all')
  const [filterExpiry,      setFilterExpiry]      = useState<string>('all')
  const [filterReportType,  setFilterReportType]  = useState<string>('all')
  const [filterDateRange,   setFilterDateRange]   = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null)

  // KPI stats by pipeline stage
  const stats = useMemo(() => {
    const pending = items.filter(i => ['damage_reported', 'discount_reported', 'expiry_reported'].includes((i as any).pipeline_stage))
    const sentLC  = items.filter(i => (i as any).pipeline_stage === 'sent_to_loss_control')
    const expiring7 = items.filter(i => {
      const d = getDaysToExpiry(i.expiry_date)
      return d >= 0 && d <= 7
    })
    const totalValue = items.reduce((s, i) => s + Number(i.quantity) * Number(i.selling_price), 0)
    return {
      total:      items.length,
      pending:    pending.length,
      sentLC:     sentLC.length,
      expiring7:  expiring7.length,
      totalValue,
    }
  }, [items])

  // Stage counts for chip badges
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length }
    for (const item of items) {
      const stage   = (item as any).pipeline_stage ?? 'logged'
      const damages = (item as any).damage_records as Array<unknown> | null
      // Split sales_approved into waste_approved (damage) and sales_approved (other)
      if (stage === 'sales_approved' && damages?.length) {
        counts['waste_approved'] = (counts['waste_approved'] ?? 0) + 1
      } else {
        counts[stage] = (counts[stage] ?? 0) + 1
      }
    }
    return counts
  }, [items])

  // Filtered rows
  const filtered = useMemo(() => {
    return items.filter(item => {
      const stage    = (item as any).pipeline_stage ?? 'logged'
      const days     = getDaysToExpiry(item.expiry_date)
      const name     = (item.product?.name ?? '').toLowerCase()
      const sku      = (item.product?.sku  ?? '').toLowerCase()
      const q        = search.toLowerCase()
      const damages  = (item as any).damage_records as Array<{ reason: string; reported_at: string }> | null
      const discs    = (item as any).discounts      as Array<{ created_at: string }> | null

      // Search
      if (q && !name.includes(q) && !sku.includes(q)) return false

      // Pipeline stage — waste_approved is a virtual filter (sales_approved + has damage_records)
      if (filterStage !== 'all') {
        if (filterStage === 'waste_approved') {
          if (!(stage === 'sales_approved' && damages?.length)) return false
        } else if (filterStage === 'sales_approved') {
          if (!(stage === 'sales_approved' && !damages?.length)) return false
        } else {
          if (stage !== filterStage) return false
        }
      }

      // Status
      if (filterStatus !== 'all' && item.status !== filterStatus) return false

      // Category
      if (filterCat !== 'all' && (item.product?.category?.name ?? '') !== filterCat) return false

      // Expiry window
      if (filterExpiry === 'critical' && !(days >= 0 && days <= EXPIRY.CRITICAL)) return false
      if (filterExpiry === 'warning'  && !(days > EXPIRY.CRITICAL && days <= EXPIRY.WARNING)) return false
      if (filterExpiry === 'safe'     && !(days > EXPIRY.WARNING)) return false
      if (filterExpiry === 'expired'  && days >= 0) return false

      // Report type — check join arrays first, fall back to pipeline_stage
      if (filterReportType !== 'all') {
        const hasDiscount = !!(discs?.length) || stage === 'discount_reported'
        const hasDamage   = !!(damages?.length && damages[0].reason !== 'About to Expire') || stage === 'damage_reported'
        const hasExpiry   = !!(damages?.length && damages[0].reason === 'About to Expire') || stage === 'expiry_reported'
        const hasNone     = !hasDiscount && !hasDamage && !hasExpiry
        if (filterReportType === 'discount'        && !hasDiscount) return false
        if (filterReportType === 'damage'          && !hasDamage)   return false
        if (filterReportType === 'about_to_expire' && !hasExpiry)   return false
        if (filterReportType === 'none'            && !hasNone)     return false
      }

      // Reported at date range — fall back to item.created_at for report-stage items
      if (filterDateRange?.[0] || filterDateRange?.[1]) {
        const ts =
          discs?.[0]?.created_at ??
          damages?.[0]?.reported_at ??
          (stage !== 'logged' ? (item as any).created_at : null)
        if (!ts) return false
        const reportDay = dayjs(ts)
        if (filterDateRange[0] && reportDay.isBefore(filterDateRange[0].startOf('day'))) return false
        if (filterDateRange[1] && reportDay.isAfter(filterDateRange[1].endOf('day')))   return false
      }

      return true
    })
  }, [items, search, filterStage, filterStatus, filterCat, filterExpiry, filterReportType, filterDateRange])

  function clearFilters() {
    setSearch('')
    setFilterStage('all')
    setFilterStatus('all')
    setFilterCat('all')
    setFilterExpiry('all')
    setFilterReportType('all')
    setFilterDateRange(null)
  }

  // ── Columns ─────────────────────────────────────────────────
  const columns: ColumnsType<InventoryItem> = [
    {
      title:  'Product',
      key:    'product',
      width:  200,
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 13 }}>{r.product?.name ?? '—'}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace' }}>{r.product?.sku ?? '—'}</Text>
        </div>
      ),
      sorter: (a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? ''),
    },
    {
      title:  'Category',
      key:    'category',
      width:  120,
      render: (_, r) => (
        <Tag style={{ borderRadius: 4 }}>{r.product?.category?.name ?? '—'}</Tag>
      ),
    },
    {
      title:     'Qty',
      dataIndex: 'quantity',
      width:     70,
      align:     'center',
      sorter:    (a, b) => a.quantity - b.quantity,
      render:    v => <Text strong>{Number(v)}</Text>,
    },
    {
      title:    'Price (₦)',
      dataIndex: 'selling_price',
      width:     120,
      align:     'right',
      sorter:    (a, b) => Number(a.selling_price) - Number(b.selling_price),
      render:    v => <Text>₦{Number(v).toLocaleString()}</Text>,
    },
    {
      title:  'Amount (₦)',
      key:    'amount',
      width:  130,
      align:  'right',
      sorter: (a, b) => (Number(a.quantity) * Number(a.selling_price)) - (Number(b.quantity) * Number(b.selling_price)),
      render: (_, r) => (
        <Text strong>₦{(Number(r.quantity) * Number(r.selling_price)).toLocaleString()}</Text>
      ),
    },
    {
      title:  'Expiry Date',
      key:    'expiry_date',
      width:  150,
      sorter: (a, b) => {
        const isExpiry = (i: InventoryItem) => (i as any).pipeline_stage === 'expiry_reported'
        if (!isExpiry(a) && !isExpiry(b)) return 0
        if (!isExpiry(a)) return 1
        if (!isExpiry(b)) return -1
        return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
      },
      render: (_, record) => {
        if ((record as any).pipeline_stage !== 'expiry_reported') {
          return <Text type="secondary">—</Text>
        }
        return (
          <div>
            <div style={{ fontSize: 12, marginBottom: 2 }}>{dayjs(record.expiry_date).format('DD MMM YYYY')}</div>
            <ExpiryTag expiryDate={record.expiry_date} />
          </div>
        )
      },
    },
    {
      title:     'Status',
      dataIndex: 'status',
      width:     110,
      render:    (v: InventoryItem['status']) => <StatusBadge status={v} />,
    },
    {
      title:  'Report Type',
      key:    'report_type',
      width:  150,
      render: (_, r) => {
        const stage     = (r as any).pipeline_stage as string | undefined
        const damages   = (r as any).damage_records as Array<{ reason: string }> | null
        const discounts = (r as any).discounts      as Array<unknown> | null
        // Derive from joined arrays first, fall back to pipeline_stage
        if (discounts?.length || stage === 'discount_reported')
          return <Tag color="blue" style={{ borderRadius: 4 }}>Discount</Tag>
        if (damages?.length || stage === 'damage_reported' || stage === 'expiry_reported') {
          const reason = damages?.[0]?.reason
          if (reason === 'About to Expire' || stage === 'expiry_reported')
            return <Tag color="gold" style={{ borderRadius: 4 }}>About to Expire</Tag>
          return <Tag color="red" style={{ borderRadius: 4 }}>Damage</Tag>
        }
        return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
      },
    },
    {
      title:  'Reported At',
      key:    'reported_at',
      width:  150,
      sorter: (a, b) => {
        const getTs = (r: any) => {
          const d = r.discounts?.[0]?.created_at ?? r.damage_records?.[0]?.reported_at ?? r.created_at ?? null
          return d ? new Date(d).getTime() : 0
        }
        return getTs(a) - getTs(b)
      },
      render: (_, r) => {
        const damages   = (r as any).damage_records as Array<{ reported_at: string }> | null
        const discounts = (r as any).discounts      as Array<{ created_at: string  }> | null
        const stage     = (r as any).pipeline_stage as string | undefined
        // Join data → fallback to item's created_at for report-stage items
        const ts =
          discounts?.[0]?.created_at ??
          damages?.[0]?.reported_at ??
          (stage && stage !== 'logged' ? (r as any).created_at : null)
        if (!ts) return <Text type="secondary" style={{ fontSize: 12 }}>—</Text>
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{dayjs(ts).format('DD MMM YYYY')}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{dayjs(ts).format('HH:mm')}</div>
          </div>
        )
      },
    },
    {
      title:  'Pipeline Stage',
      key:    'pipeline_stage',
      width:  190,
      render: (_, r) => {
        const stage    = (r as any).pipeline_stage as string ?? 'logged'
        const damages  = (r as any).damage_records as Array<{ approved_by?: string; approver?: { full_name: string } }> | null
        const discounts = (r as any).discounts     as Array<{ approved_by?: string; approver?: { full_name: string } }> | null

        // Damage items that are approved should be labelled "Waste Approved" (disposed, not sold)
        const isDamageApproval = stage === 'sales_approved' && !!(damages?.length)
        const cfg = isDamageApproval
          ? { label: 'Waste Approved', color: 'orange', icon: <CheckCircleOutlined /> }
          : (STAGE_CONFIG[stage] ?? { label: stage, color: 'default', icon: null })

        // Approver name: from damage_records or discounts
        const approverName =
          damages?.[0]?.approver?.full_name ??
          discounts?.[0]?.approver?.full_name ??
          null

        return (
          <div>
            <Tag color={cfg.color} icon={cfg.icon} style={{ borderRadius: 4 }}>
              {cfg.label}
            </Tag>
            {stage === 'sales_approved' && approverName && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>by {approverName}</div>
            )}
          </div>
        )
      },
    },
  ]

  function rowClassName(record: InventoryItem) {
    const stage = (record as any).pipeline_stage ?? 'logged'
    if (stage === 'damage_reported') return 'row-critical'
    if (stage === 'expiry_reported') return 'row-warning'
    const days = getDaysToExpiry(record.expiry_date)
    if (days < 0)                return 'row-expired'
    if (days <= EXPIRY.CRITICAL) return 'row-critical'
    if (days <= EXPIRY.WARNING)  return 'row-warning'
    return ''
  }

  return (
    <>
      {/* ── KPI Cards ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} md={6}>
          <Card className="kpi-card success" bordered={false} size="small">
            <Statistic
              title="Total Stock Value"
              value={stats.totalValue}
              prefix="₦"
              formatter={v => Number(v).toLocaleString()}
              valueStyle={{ color: BRAND.green, fontSize: 20, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card critical" bordered={false} size="small">
            <Statistic
              title="Pending Reports"
              value={stats.pending}
              suffix="items"
              valueStyle={{ color: BRAND.critical, fontSize: 22, fontWeight: 700 }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card warning" bordered={false} size="small">
            <Statistic
              title="Expiring in 7 Days"
              value={stats.expiring7}
              suffix="batches"
              valueStyle={{ color: '#b8860b', fontSize: 22, fontWeight: 700 }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card" bordered={false} size="small">
            <Statistic
              title="Total Items Tracked"
              value={stats.total}
              suffix="batches"
              valueStyle={{ color: '#595959', fontSize: 22, fontWeight: 700 }}
              prefix={<InboxOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Pipeline Stage Quick Filters ── */}
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 12 }}>
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
            Filter by Pipeline Stage
          </Text>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {STAGE_FILTER_OPTIONS.map(opt => {
            const count   = stageCounts[opt.value] ?? 0
            const active  = filterStage === opt.value
            const cfg     = STAGE_CONFIG[opt.value]
            return (
              <Tag
                key={opt.value}
                icon={opt.icon}
                color={active ? (cfg?.color || BRAND.green) : undefined}
                onClick={() => setFilterStage(opt.value)}
                style={{
                  cursor:        'pointer',
                  padding:       '4px 12px',
                  borderRadius:  20,
                  fontSize:      12,
                  fontWeight:    active ? 700 : 400,
                  border:        active ? undefined : '1px solid #d9d9d9',
                  background:    active ? undefined : '#fafafa',
                  userSelect:    'none',
                }}
              >
                {opt.label}
                {opt.value !== 'all' && count > 0 && (
                  <span style={{
                    marginLeft:    6,
                    background:    active ? 'rgba(255,255,255,0.35)' : '#e0e0e0',
                    borderRadius:  10,
                    padding:       '1px 6px',
                    fontSize:      11,
                    fontWeight:    700,
                  }}>
                    {count}
                  </span>
                )}
                {opt.value === 'all' && (
                  <span style={{
                    marginLeft:    6,
                    background:    active ? 'rgba(255,255,255,0.35)' : '#e0e0e0',
                    borderRadius:  10,
                    padding:       '1px 6px',
                    fontSize:      11,
                    fontWeight:    700,
                  }}>
                    {count}
                  </span>
                )}
              </Tag>
            )
          })}
        </div>
      </Card>

      {/* ── Header + Additional Filters ── */}
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Title level={5} style={{ margin: 0, color: BRAND.green }}>
              Inventory Pipeline Tracker
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Real-time view of every item's lifecycle — from log to sale.
            </Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => router.refresh()}>Refresh</Button>
            <Button onClick={clearFilters}>Clear Filters</Button>
          </Space>
        </div>

        {/* Filters — Row 1 */}
        <Row gutter={[12, 12]} align="middle" style={{ marginBottom: 8 }}>
          <Col xs={24} sm={12} md={8}>
            <Input
              prefix={<SearchOutlined style={{ color: '#ccc' }} />}
              placeholder="Search product or SKU..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select value={filterStatus} onChange={setFilterStatus} style={{ width: '100%' }}>
              <Option value="all">All Status</Option>
              <Option value="active">Active</Option>
              <Option value="discounted">Discounted</Option>
              <Option value="expired">Expired</Option>
              <Option value="damaged">Damaged</Option>
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select value={filterCat} onChange={setFilterCat} style={{ width: '100%' }}>
              <Option value="all">All Categories</Option>
              {STORE_CATEGORIES.map(cat => (
                <Option key={cat} value={cat}>{cat}</Option>
              ))}
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select value={filterExpiry} onChange={setFilterExpiry} style={{ width: '100%' }}>
              <Option value="all">All Expiry</Option>
              <Option value="critical">Critical (≤2 days)</Option>
              <Option value="warning">Warning (3–7 days)</Option>
              <Option value="safe">Safe (&gt;7 days)</Option>
              <Option value="expired">Expired</Option>
            </Select>
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select value={filterReportType} onChange={setFilterReportType} style={{ width: '100%' }}>
              <Option value="all">All Report Types</Option>
              <Option value="damage">Damage</Option>
              <Option value="discount">Discount</Option>
              <Option value="about_to_expire">About to Expire</Option>
              <Option value="none">No Report</Option>
            </Select>
          </Col>
        </Row>
        {/* Filters — Row 2 */}
        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={12} md={8}>
            <DatePicker.RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              placeholder={['Report from', 'Report to']}
              value={filterDateRange ?? undefined}
              onChange={v => setFilterDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
              allowClear
            />
          </Col>
        </Row>
      </Card>

      {/* ── Table ── */}
      <Card bordered={false} style={{ borderRadius: 8 }}>
        <style>{`
          .row-critical td { background: #fff3f3 !important; }
          .row-warning  td { background: #fffbe6 !important; }
          .row-expired  td { background: #f5f5f5 !important; opacity: 0.75; }
        `}</style>

        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Showing <strong>{filtered.length}</strong> of <strong>{items.length}</strong> items
            {filterStage !== 'all' && (
              <> · Stage: <strong>{STAGE_CONFIG[filterStage]?.label ?? filterStage}</strong></>
            )}
          </Text>
        </div>

        <Table<InventoryItem>
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          rowClassName={rowClassName}
          scroll={{ x: 1400 }}
          size="small"
          pagination={{
            pageSize:        20,
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} items`,
          }}
          summary={pageData => {
            const totalQty = pageData.reduce((s, r) => s + Number(r.quantity), 0)
            const totalVal = pageData.reduce((s, r) => s + Number(r.quantity) * Number(r.selling_price), 0)
            return (
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={3}>
                  <Text strong>Page Total</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={3} align="center">
                  <Text strong>{totalQty} units</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={4} />
                <Table.Summary.Cell index={5} align="right">
                  <Text strong style={{ color: BRAND.green }}>₦{totalVal.toLocaleString()}</Text>
                </Table.Summary.Cell>
                <Table.Summary.Cell index={6} colSpan={4} />
              </Table.Summary.Row>
            )
          }}
        />
      </Card>
    </>
  )
}

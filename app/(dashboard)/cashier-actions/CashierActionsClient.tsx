'use client'

import { useState, useMemo } from 'react'
import { useRouter }         from 'next/navigation'
import {
  Table, Tag, Button, Input, Select, Typography,
  Card, Statistic, Row, Col, Space, Empty, App, Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SearchOutlined, ReloadOutlined, ShoppingCartOutlined,
  DeleteOutlined, CheckCircleOutlined, ExclamationCircleOutlined,
  TagOutlined, WarningOutlined,
} from '@ant-design/icons'
import dayjs        from 'dayjs'
import { BRAND }    from '@/lib/constants'
import type { InventoryItem } from '@/types'

const { Title, Text } = Typography
const { Option }      = Select

function formatNaira(v: number) {
  return `₦${Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function getItemType(item: InventoryItem): 'Damage' | 'Discount' | 'Expiry' {
  const damages   = (item as any).damage_records as Array<unknown> | null
  const discounts = (item as any).discounts      as Array<unknown> | null
  if (damages?.length)   return 'Damage'
  if (discounts?.length) return 'Discount'
  return 'Expiry'
}

interface Props { items: InventoryItem[] }

export default function CashierActionsClient({ items }: Props) {
  const router = useRouter()
  const { notification, modal } = App.useApp()

  const [search,     setSearch]     = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [processing, setProcessing] = useState<string | null>(null)

  const stats = useMemo(() => {
    const soldItems   = items.filter(i => getItemType(i) !== 'Damage')
    const wastedItems = items.filter(i => getItemType(i) === 'Damage')
    const totalValue  = items.reduce((s, i) => s + i.quantity * Number(i.selling_price), 0)
    return { total: items.length, soldItems: soldItems.length, wastedItems: wastedItems.length, totalValue }
  }, [items])

  const filtered = useMemo(() => items.filter(item => {
    const name = (item.product?.name ?? '').toLowerCase()
    const sku  = (item.product?.sku  ?? '').toLowerCase()
    const q    = search.toLowerCase()
    if (q && !name.includes(q) && !sku.includes(q)) return false
    if (filterType !== 'all' && getItemType(item) !== filterType) return false
    return true
  }), [items, search, filterType])

  async function handleAction(item: InventoryItem, action: 'sold' | 'wasted') {
    const type        = getItemType(item)
    const name        = item.product?.name ?? 'this item'
    const origPrice   = Number((item as any).original_price ?? item.selling_price)
    const sellPrice   = Number(item.selling_price)
    const discountPct = origPrice > sellPrice
      ? Math.round((origPrice - sellPrice) / origPrice * 100)
      : null

    const isSold   = action === 'sold'
    const discounts = (item as any).discounts as Array<{ discount_percentage: number; discounted_price: number }> | null
    const disc      = discounts?.[discounts.length - 1]

    modal.confirm({
      title:   isSold ? `Mark "${name}" as Sold?` : `Mark "${name}" as Wasted?`,
      icon:    <ExclamationCircleOutlined style={{ color: isSold ? BRAND.green : BRAND.critical }} />,
      width:   420,
      content: (
        <div style={{ fontSize: 13 }}>
          {isSold ? (
            <div>
              <p style={{ marginBottom: 10 }}>
                This confirms the item has been sold at the discounted price and removes it from the active queue.
              </p>
              <div style={{ background: BRAND.greenBg, border: `1px solid ${BRAND.green}40`, borderRadius: 8, padding: '10px 14px' }}>
                <Row gutter={[8, 6]}>
                  <Col span={12}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Sell Price</Text><br />
                    <Text strong style={{ color: BRAND.green, fontFamily: 'monospace' }}>
                      {formatNaira(disc?.discounted_price ?? sellPrice)}
                    </Text>
                  </Col>
                  {discountPct && (
                    <Col span={12}>
                      <Text style={{ fontSize: 11, color: '#888' }}>Discount Applied</Text><br />
                      <Tag color="blue">{discountPct}% off</Tag>
                    </Col>
                  )}
                  <Col span={12}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Quantity</Text><br />
                    <Text strong>{item.quantity} units</Text>
                  </Col>
                  <Col span={12}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Category</Text><br />
                    <Text>{item.product?.category?.name ?? '—'}</Text>
                  </Col>
                </Row>
              </div>
            </div>
          ) : (
            <div>
              <p style={{ marginBottom: 10 }}>
                This writes off the item as wasted/damaged and removes it from stock permanently.
              </p>
              <div style={{ background: BRAND.criticalBg, border: `1px solid ${BRAND.critical}40`, borderRadius: 8, padding: '10px 14px' }}>
                <Row gutter={[8, 6]}>
                  <Col span={12}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Original Value</Text><br />
                    <Text strong style={{ color: BRAND.critical, fontFamily: 'monospace' }}>
                      {formatNaira(origPrice * item.quantity)}
                    </Text>
                  </Col>
                  <Col span={12}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Quantity</Text><br />
                    <Text strong>{item.quantity} units</Text>
                  </Col>
                  <Col span={24}>
                    <Text style={{ fontSize: 11, color: '#888' }}>Damage Reason</Text><br />
                    <Text>{((item as any).damage_records as any[])?.[0]?.reason ?? '—'}</Text>
                  </Col>
                </Row>
              </div>
            </div>
          )}
        </div>
      ),
      okText:        isSold ? 'Mark Sold' : 'Mark Wasted',
      okType:        isSold ? 'primary' : 'danger',
      okButtonProps: isSold ? { style: { background: BRAND.green } } : {},
      cancelText:    'Cancel',
      async onOk() {
        setProcessing(item.id)
        try {
          const res = await fetch(`/api/cashier-actions/${item.id}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action }),
          })
          if (!res.ok) throw new Error((await res.json()).error)
          notification.success({
            message:     isSold ? 'Marked as Sold' : 'Marked as Wasted',
            description: isSold
              ? `${name} has been recorded as sold.`
              : `${name} has been written off as wasted.`,
            placement: 'topRight',
            duration:  3,
            icon:      <CheckCircleOutlined style={{ color: isSold ? BRAND.green : '#888' }} />,
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
      render:     (_, item) => <Tag style={{ borderRadius: 4 }}>{item.product?.category?.name ?? '—'}</Tag>,
    },
    {
      title:     'Qty',
      dataIndex: 'quantity',
      width:     60,
      align:     'center',
      render:    v => <Text strong>{parseFloat(Number(v).toFixed(2))}</Text>,
    },
    {
      title:  'Type',
      key:    'type',
      width:  110,
      render: (_, item) => {
        const type = getItemType(item)
        const colorMap: Record<string, string> = { Discount: 'blue', Damage: 'red', Expiry: 'gold' }
        const iconMap: Record<string, React.ReactNode> = {
          Discount: <TagOutlined style={{ marginRight: 4 }} />,
          Damage:   <WarningOutlined style={{ marginRight: 4 }} />,
          Expiry:   null,
        }
        return (
          <Tag color={colorMap[type]} style={{ borderRadius: 4 }}>
            {iconMap[type]}{type}
          </Tag>
        )
      },
    },
    {
      title:  'Approved Price',
      key:    'price',
      width:  130,
      align:  'right',
      render: (_, item) => {
        const orig = Number((item as any).original_price ?? item.selling_price)
        const curr = Number(item.selling_price)
        const isDisc = curr < orig
        return (
          <div style={{ textAlign: 'right' }}>
            <Text strong style={{ fontFamily: 'monospace', color: isDisc ? BRAND.green : '#333', fontSize: 13 }}>
              {formatNaira(curr)}
            </Text>
            {isDisc && (
              <div>
                <Text type="secondary" style={{ fontSize: 11, fontFamily: 'monospace', textDecoration: 'line-through' }}>
                  {formatNaira(orig)}
                </Text>
              </div>
            )}
          </div>
        )
      },
    },
    {
      title:      'Approved On',
      key:        'updated_at',
      width:      110,
      responsive: ['lg'],
      render:     (_, item) => {
        const ts = (item as any).updated_at
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
      title:  'Action',
      key:    'action',
      width:  160,
      fixed:  'right',
      render: (_, item) => {
        const type   = getItemType(item)
        const isSold = type !== 'Damage'
        return (
          <Space size={6}>
            {isSold ? (
              <Tooltip title="Confirm item has been sold at discounted price">
                <Button
                  size="small"
                  type="primary"
                  icon={<ShoppingCartOutlined />}
                  loading={processing === item.id}
                  style={{ background: BRAND.green, borderColor: BRAND.green }}
                  onClick={() => handleAction(item, 'sold')}
                >
                  Mark Sold
                </Button>
              </Tooltip>
            ) : (
              <Tooltip title="Write off item as wasted / damaged">
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={processing === item.id}
                  onClick={() => handleAction(item, 'wasted')}
                >
                  Mark Wasted
                </Button>
              </Tooltip>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <>
      {/* ── KPI Cards ─────────────────────────────────────── */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small" style={{ background: '#F5F5F5', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Total Approved Items</span>}
              value={stats.total}
              suffix="items"
              valueStyle={{ fontSize: 20, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small" style={{ background: BRAND.greenBg, borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Ready to Sell</span>}
              value={stats.soldItems}
              suffix="items"
              valueStyle={{ color: BRAND.green, fontSize: 20, fontWeight: 700 }}
              prefix={<ShoppingCartOutlined />}
            />
            <Text style={{ fontSize: 10, color: '#888' }}>Discount / expiry items</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small" style={{ background: BRAND.criticalBg, borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Pending Write-off</span>}
              value={stats.wastedItems}
              suffix="items"
              valueStyle={{ color: BRAND.critical, fontSize: 20, fontWeight: 700 }}
              prefix={<DeleteOutlined />}
            />
            <Text style={{ fontSize: 10, color: '#888' }}>Damage items</Text>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card bordered={false} size="small" style={{ background: '#E3F2FD', borderRadius: 10 }}>
            <Statistic
              title={<span style={{ fontSize: 12 }}>Total Queue Value</span>}
              value={stats.totalValue}
              formatter={v => formatNaira(Number(v))}
              valueStyle={{ fontSize: 18, fontWeight: 700, color: '#1565C0' }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Filters ───────────────────────────────────────── */}
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <Title level={5} style={{ margin: 0, color: BRAND.green }}>
            Cashier Action Queue
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
              <Option value="all">All Types</Option>
              <Option value="Discount">Discount</Option>
              <Option value="Damage">Damage</Option>
              <Option value="Expiry">Expiry</Option>
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

      {/* ── Table ─────────────────────────────────────────── */}
      <Card bordered={false} style={{ borderRadius: 8 }}>
        {filtered.length === 0 ? (
          <Empty
            description={
              search || filterType !== 'all'
                ? 'No items match the filter'
                : 'No approved items awaiting cashier action'
            }
            style={{ padding: '40px 0' }}
          />
        ) : (
          <Table<InventoryItem>
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            scroll={{ x: 900 }}
            size="small"
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

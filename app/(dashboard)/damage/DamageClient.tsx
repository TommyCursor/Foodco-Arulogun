'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, Tag, Button, Space, Input, Select, AutoComplete, Typography,
  Drawer, Form, InputNumber, Card, Statistic, Row, Col,
  Tooltip, Modal, Badge, Timeline, Empty, Alert, App, Popconfirm,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, SearchOutlined, CheckOutlined, CloseOutlined,
  WarningOutlined, ReloadOutlined, ExclamationCircleOutlined,
  CheckCircleOutlined, DeleteOutlined, EyeOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { BRAND, STORE_CATEGORIES } from '@/lib/constants'
import type { DamageRecord } from '@/types'

dayjs.extend(relativeTime)

const { Title, Text } = Typography
const { Option } = Select
const { confirm } = Modal

const DAMAGE_REASONS_LS = 'damage_reasons_list'

const DEFAULT_DAMAGE_REASONS = [
  'Spillage',
  'Pest damage',
  'Transit damage',
  'Expiry write-off',
  'Refrigeration failure',
  'Customer damage',
  'Packaging failure',
  'Water damage',
  'Fire / smoke damage',
  'Other',
]

// Extract manually-entered description stored in notes as "Product: {name} | ..."
function parseDescFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null
  const match = notes.match(/Product:\s*([^|]+)/)
  return match ? match[1].trim() : null
}

interface Props {
  records: DamageRecord[]
}

function StatusTag({ status }: { status: DamageRecord['status'] }) {
  const map = {
    pending:  { color: 'gold',    label: 'Pending Approval' },
    approved: { color: 'green',   label: 'Approved'         },
    rejected: { color: 'red',     label: 'Rejected'         },
  }
  const { color, label } = map[status]
  return <Tag color={color}>{label}</Tag>
}

export default function DamageClient({ records }: Props) {
  const router                              = useRouter()
  const { notification }                    = App.useApp()
  const [search,      setSearch]            = useState('')
  const [filterStatus, setFilterStatus]     = useState<string>('all')
  const [drawerOpen,  setDrawerOpen]        = useState(false)
  const [detailRecord, setDetailRecord]     = useState<DamageRecord | null>(null)
  const [submitting,  setSubmitting]        = useState(false)
  const [deleting,    setDeleting]          = useState<string | null>(null)
  const [form]                              = Form.useForm()
  const [batchSku,    setBatchSku]          = useState('')
  const [batchPrice,  setBatchPrice]        = useState(0)
  const [savedReasons, setSavedReasons]     = useState<string[]>([])

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DAMAGE_REASONS_LS) ?? '[]') as string[]
      setSavedReasons(stored)
    } catch {}
  }, [])

  const allDamageReasons = useMemo(() => {
    const all = [...new Set([...DEFAULT_DAMAGE_REASONS, ...savedReasons])]
    return all.map(r => ({ value: r, label: r }))
  }, [savedReasons])

  function saveNewReason(reason: string) {
    if (!reason || DEFAULT_DAMAGE_REASONS.includes(reason) || savedReasons.includes(reason)) return
    const updated = [...savedReasons, reason]
    setSavedReasons(updated)
    try { localStorage.setItem(DAMAGE_REASONS_LS, JSON.stringify(updated)) } catch {}
  }

  // Items approved via the LC Approval workflow set pipeline_stage → sales_approved
  // but may not have damage_records.status synced yet. Treat them as approved.
  function effectiveStatus(r: DamageRecord): DamageRecord['status'] {
    const stage = (r.inventory_item as any)?.pipeline_stage
    if (r.status === 'pending' && stage === 'sales_approved') return 'approved'
    return r.status
  }

  // ── Derived stats ──
  const stats = useMemo(() => {
    const pending   = records.filter(r => effectiveStatus(r) === 'pending')
    const approved  = records.filter(r => effectiveStatus(r) === 'approved')
    const totalLoss = approved.reduce((s, r) => s + Number(r.estimated_value_lost), 0)
    const todayLoss = approved
      .filter(r => dayjs(r.reported_at).isSame(dayjs(), 'day'))
      .reduce((s, r) => s + Number(r.estimated_value_lost), 0)
    return { pending: pending.length, approved: approved.length, totalLoss, todayLoss }
  }, [records])

  // ── Filtered rows ──
  const filtered = useMemo(() => {
    return records.filter(r => {
      const productName = (r.inventory_item?.product?.name ?? parseDescFromNotes(r.notes) ?? '').toLowerCase()
      const reason      = r.reason.toLowerCase()
      const q           = search.toLowerCase()
      if (q && !productName.includes(q) && !reason.includes(q)) return false
      if (filterStatus !== 'all' && effectiveStatus(r) !== filterStatus) return false
      return true
    })
  }, [records, search, filterStatus])

  function onQtyChange(qty: number | null) {
    form.setFieldValue('estimated_value_lost', (qty ?? 0) * batchPrice)
  }

  // ── Submit new damage record ──
  async function handleSubmit(values: Record<string, unknown>) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/damage', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...values, barcode: batchSku || null, unit_price: batchPrice || null }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      saveNewReason(values.reason as string)
      setDrawerOpen(false)
      form.resetFields()
      setBatchSku('')
      setBatchPrice(0)
      notification.success({
        message:     'Report Submitted!',
        description: 'Damage report logged. It now appears in Damage Records and the Inventory pipeline.',
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
      Modal.error({ title: 'Failed to log damage', content: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Approve / Reject ──
  function handleApprove(record: DamageRecord) {
    confirm({
      title:   'Approve this damage record?',
      icon:    <ExclamationCircleOutlined style={{ color: BRAND.green }} />,
      content: `This will write off ₦${Number(record.estimated_value_lost).toLocaleString()} and reduce stock quantity by ${parseFloat(Number(record.quantity_damaged).toFixed(2))}.`,
      okText:  'Approve',
      okButtonProps: { style: { background: BRAND.green } },
      async onOk() {
        await fetch(`/api/damage/${record.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ status: 'approved' }),
        })
        router.refresh()
      },
    })
  }

  function handleReject(record: DamageRecord) {
    confirm({
      title:   'Reject this damage record?',
      icon:    <ExclamationCircleOutlined style={{ color: BRAND.critical }} />,
      content: 'The record will be marked as rejected and no stock will be deducted.',
      okText:  'Reject',
      okType:  'danger',
      async onOk() {
        await fetch(`/api/damage/${record.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ status: 'rejected' }),
        })
        router.refresh()
      },
    })
  }

  async function doDelete(record: DamageRecord) {
    setDeleting(record.id)
    try {
      const res = await fetch(`/api/damage/${record.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const { error } = await res.json()
        notification.error({ message: 'Delete failed', description: error, placement: 'topRight', duration: 4 })
        return
      }
      notification.success({
        message:     'Submission deleted',
        description: 'The damage report and its inventory entry have been removed.',
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

  // ── Table columns ──
  const columns: ColumnsType<DamageRecord> = [
    {
      title:  'Description',
      key:    'description',
      width:  200,
      sorter: (a, b) => {
        const nameA = a.inventory_item?.product?.name ?? parseDescFromNotes(a.notes) ?? ''
        const nameB = b.inventory_item?.product?.name ?? parseDescFromNotes(b.notes) ?? ''
        return nameA.localeCompare(nameB)
      },
      render: (_, r) => {
        const name = r.inventory_item?.product?.name ?? parseDescFromNotes(r.notes) ?? '—'
        return <Text strong style={{ fontSize: 13 }}>{name}</Text>
      },
    },
    {
      title:      'Barcode',
      key:        'barcode',
      width:      130,
      responsive: ['sm'],
      render: (_, r) => (
        <Text code style={{ fontSize: 12 }}>{r.inventory_item?.product?.sku ?? '—'}</Text>
      ),
    },
    {
      title:     'Qty',
      dataIndex: 'quantity_damaged',
      width:     70,
      align:     'center',
      sorter:    (a, b) => a.quantity_damaged - b.quantity_damaged,
      render:    v => <Text strong style={{ color: BRAND.critical }}>{parseFloat(Number(v).toFixed(2))}</Text>,
    },
    {
      title:      'Price (₦)',
      key:        'price',
      width:      120,
      align:      'right',
      responsive: ['md'],
      render: (_, r) => (
        <Text>₦{Number(r.inventory_item?.selling_price ?? 0).toLocaleString()}</Text>
      ),
    },
    {
      title:     'Amount (₦)',
      dataIndex: 'estimated_value_lost',
      width:     130,
      align:     'right',
      sorter:    (a, b) => Number(a.estimated_value_lost) - Number(b.estimated_value_lost),
      render:    v => (
        <Text strong style={{ color: BRAND.critical }}>₦{Number(v).toLocaleString()}</Text>
      ),
    },
    {
      title:    'Condition',
      dataIndex: 'reason',
      width:    170,
      render:   v => <Tag style={{ borderRadius: 4 }}>{v}</Tag>,
      filters:  DEFAULT_DAMAGE_REASONS.map(r => ({ text: r, value: r })),
      onFilter: (value, r) => r.reason === value,
    },
    {
      title:      'Reported By',
      key:        'reported_by',
      width:      130,
      responsive: ['md'],
      render: (_, r) => (
        <Text style={{ fontSize: 12 }}>{(r as any).reporter?.full_name ?? '—'}</Text>
      ),
    },
    {
      title:      'Status',
      dataIndex:  'status',
      width:      150,
      responsive: ['sm'],
      render: (_v: DamageRecord['status'], r) => {
        const status       = effectiveStatus(r)
        const approverName = (r as any).approver?.full_name as string | undefined
        return (
          <div>
            <StatusTag status={status} />
            {(status === 'approved' || status === 'rejected') && approverName && (
              <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>by {approverName}</div>
            )}
          </div>
        )
      },
      filters: [
        { text: 'Pending',  value: 'pending'  },
        { text: 'Approved', value: 'approved' },
        { text: 'Rejected', value: 'rejected' },
      ],
      onFilter: (value, r) => effectiveStatus(r) === value,
    },
    {
      title:  'Actions',
      key:    'actions',
      fixed:  'right',
      width:  100,
      render: (_, r) => {
        const stage     = (r.inventory_item as any)?.pipeline_stage
        const canDelete = !['sent_to_loss_control', 'resolution_received', 'sales_approved', 'sold'].includes(stage)
        return (
          <Space size={4}>
            <Tooltip title="View Details">
              <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailRecord(r)} />
            </Tooltip>
            {canDelete && (
              <Popconfirm
                title="Delete this submission?"
                description="This permanently removes the report and its inventory entry."
                okText="Yes, Delete"
                okButtonProps={{ danger: true }}
                cancelText="Cancel"
                onConfirm={() => doDelete(r)}
              >
                <Tooltip title="Delete Submission">
                  <Button size="small" icon={<DeleteOutlined />} danger loading={deleting === r.id} />
                </Tooltip>
              </Popconfirm>
            )}
          </Space>
        )
      },
    },
  ]

  return (
    <>
      {/* ── Summary Cards ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} md={6}>
          <Card className="kpi-card warning" bordered={false} size="small">
            <Statistic
              title="Pending Approval"
              value={stats.pending}
              suffix="records"
              valueStyle={{ color: '#b8860b', fontSize: 22, fontWeight: 700 }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card success" bordered={false} size="small">
            <Statistic
              title="Approved Records"
              value={stats.approved}
              valueStyle={{ color: BRAND.green, fontSize: 22, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card critical" bordered={false} size="small">
            <Statistic
              title="Loss Today"
              value={`₦${stats.todayLoss.toLocaleString()}`}
              valueStyle={{ color: BRAND.critical, fontSize: 20, fontWeight: 700 }}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card critical" bordered={false} size="small">
            <Statistic
              title="Total Loss (Approved)"
              value={`₦${stats.totalLoss.toLocaleString()}`}
              valueStyle={{ color: BRAND.critical, fontSize: 18, fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Pending alert ── */}
      {stats.pending > 0 && (
        <Alert
          type="warning"
          showIcon
          message={`${stats.pending} damage record${stats.pending > 1 ? 's' : ''} awaiting approval`}
          description="Review and approve or reject pending records to keep stock quantities accurate."
          style={{ marginBottom: 16, borderRadius: 8 }}
          action={
            <Button size="small" onClick={() => setFilterStatus('pending')}>
              Show Pending
            </Button>
          }
        />
      )}

      {/* ── Header + Filters ── */}
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <Title level={5} style={{ margin: 0, color: BRAND.green }}>
            Damage Records
          </Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => { form.resetFields(); form.setFieldValue('estimated_value_lost', 0); setDrawerOpen(true) }}
            style={{ background: BRAND.green }}
          >
            Report Damage
          </Button>
        </div>

        <Row gutter={[12, 12]} align="middle">
          <Col xs={24} sm={10} md={8}>
            <Input
              prefix={<SearchOutlined style={{ color: '#ccc' }} />}
              placeholder="Search product or reason..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={12} sm={6} md={4}>
            <Select value={filterStatus} onChange={setFilterStatus} style={{ width: '100%' }}>
              <Option value="all">All Status</Option>
              <Option value="pending">Pending</Option>
              <Option value="approved">Approved</Option>
              <Option value="rejected">Rejected</Option>
            </Select>
          </Col>
          <Col xs={12} sm={4} md={3}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => { setSearch(''); setFilterStatus('all') }}
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
          <Empty description="No damage records found" style={{ padding: '40px 0' }} />
        ) : (
          <Table<DamageRecord>
            dataSource={filtered}
            columns={columns}
            rowKey="id"
            scroll={{ x: 1100 }}
            size="small"
            rowClassName={r => effectiveStatus(r) === 'pending' ? 'row-warning' : ''}
            pagination={{
              pageSize: 20,
              showSizeChanger: true,
              showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} records`,
            }}
            summary={pageData => {
              const totalQty = pageData.reduce((s, r) => s + Number(r.quantity_damaged), 0)
              const totalVal = pageData.reduce((s, r) => s + Number(r.estimated_value_lost), 0)
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0}>
                    <Text strong>Page Total</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="center">
                    <Text strong style={{ color: BRAND.critical }}>{parseFloat(totalQty.toFixed(2))} units</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} />
                  <Table.Summary.Cell index={3} align="right">
                    <Text strong style={{ color: BRAND.critical }}>₦{totalVal.toLocaleString()}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} colSpan={4} />
                </Table.Summary.Row>
              )
            }}
          />
        )}
      </Card>

      {/* ── Report Damage Drawer ── */}
      <Drawer
        title={
          <Space>
            <WarningOutlined style={{ color: BRAND.critical }} />
            <span>Report Damage</span>
          </Space>
        }
        width={typeof window !== 'undefined' && window.innerWidth < 576 ? '100%' : 480}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button
              type="primary"
              danger
              loading={submitting}
              onClick={() => form.submit()}
            >
              Submit Report
            </Button>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          message="Damage records require manager approval before stock is deducted."
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
            <Col xs={24} sm={12}>
              <Form.Item
                name="quantity_damaged"
                label="Qty"
                rules={[{ required: true, message: 'Enter quantity' }]}
              >
                <InputNumber min={0} step={0.01} style={{ width: '100%' }} onChange={onQtyChange} placeholder="0" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item label="Price (₦)">
                <InputNumber
                  value={batchPrice || undefined}
                  min={0}
                  style={{ width: '100%' }}
                  formatter={v => `₦ ${v}`}
                  placeholder="Auto-filled or enter price"
                  onChange={v => {
                    const p = Number(v ?? 0)
                    setBatchPrice(p)
                    const qty = form.getFieldValue('quantity_damaged') ?? 0
                    form.setFieldValue('estimated_value_lost', qty * p)
                  }}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Amount */}
          <Form.Item
            name="estimated_value_lost"
            label="Amount (₦)"
            rules={[{ required: true, message: 'Amount is required' }]}
            tooltip="Auto-calculated from Qty × Price. Adjust if needed."
          >
            <InputNumber min={0} style={{ width: '100%' }} formatter={v => `₦ ${v}`} />
          </Form.Item>

          {/* Condition */}
          <Form.Item
            name="reason"
            label="Condition"
            rules={[{ required: true, message: 'Enter or select a condition' }]}
          >
            <AutoComplete
              options={allDamageReasons}
              placeholder="Select or type condition..."
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

          <Form.Item name="notes" label="Additional Notes">
            <Input.TextArea
              rows={3}
              placeholder="Describe the damage in detail..."
            />
          </Form.Item>
        </Form>
      </Drawer>

      {/* ── Detail Modal ── */}
      <Modal
        open={!!detailRecord}
        onCancel={() => setDetailRecord(null)}
        footer={
          detailRecord && effectiveStatus(detailRecord) === 'pending' ? (
            <Space>
              <Button
                danger
                icon={<CloseOutlined />}
                onClick={() => { handleReject(detailRecord!); setDetailRecord(null) }}
              >
                Reject
              </Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                style={{ background: BRAND.green }}
                onClick={() => { handleApprove(detailRecord!); setDetailRecord(null) }}
              >
                Approve
              </Button>
            </Space>
          ) : (
            <Button onClick={() => setDetailRecord(null)}>Close</Button>
          )
        }
        title={
          <Space>
            <WarningOutlined style={{ color: BRAND.critical }} />
            <span>Damage Record Details</span>
          </Space>
        }
        width={typeof window !== 'undefined' && window.innerWidth < 576 ? '100vw' : 500}
        style={{ maxWidth: '100vw' }}
      >
        {detailRecord && (
          <div style={{ paddingTop: 8 }}>
            <Row gutter={[0, 12]}>
              <Col span={24}>
                <StatusTag status={effectiveStatus(detailRecord)} />
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Product</Text>
                <div><Text strong>{detailRecord.inventory_item?.product?.name ?? '—'}</Text></div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Batch</Text>
                <div><Text>{detailRecord.inventory_item?.batch_number ?? '—'}</Text></div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Location</Text>
                <div><Text>{detailRecord.inventory_item?.location ?? '—'}</Text></div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>SKU</Text>
                <div><Text>{detailRecord.inventory_item?.product?.sku ?? '—'}</Text></div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Quantity Damaged</Text>
                <div>
                  <Text strong style={{ color: BRAND.critical, fontSize: 20 }}>
                    {detailRecord.quantity_damaged}
                  </Text>
                  <Text style={{ color: '#888' }}> units</Text>
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Value Lost</Text>
                <div>
                  <Text strong style={{ color: BRAND.critical, fontSize: 20 }}>
                    ₦{Number(detailRecord.estimated_value_lost).toLocaleString()}
                  </Text>
                </div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Reason</Text>
                <div><Tag>{detailRecord.reason}</Tag></div>
              </Col>
              <Col xs={24} sm={12}>
                <Text type="secondary" style={{ fontSize: 12 }}>Reported By</Text>
                <div><Text>{(detailRecord as any).reporter?.full_name ?? '—'}</Text></div>
              </Col>
              {detailRecord.notes && (
                <Col span={24}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Notes</Text>
                  <div
                    style={{
                      background: BRAND.grayBg,
                      borderRadius: 6,
                      padding: '10px 12px',
                      fontSize: 13,
                      marginTop: 4,
                    }}
                  >
                    {detailRecord.notes}
                  </div>
                </Col>
              )}
            </Row>

            {/* Timeline */}
            <div style={{ marginTop: 20 }}>
              <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>Activity</Text>
              <Timeline
                items={[
                  {
                    color: 'red',
                    children: (
                      <>
                        <Text strong>Damage reported</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(detailRecord.reported_at).format('DD MMM YYYY, HH:mm')}
                          {' '}by {(detailRecord as any).reporter?.full_name ?? 'Unknown'}
                        </Text>
                      </>
                    ),
                  },
                  ...(detailRecord.approved_at || effectiveStatus(detailRecord) === 'approved' ? [{
                    color: effectiveStatus(detailRecord) === 'approved' ? 'green' : 'gray',
                    children: (
                      <>
                        <Text strong>
                          {effectiveStatus(detailRecord) === 'approved' ? 'Approved' : 'Rejected'}
                        </Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(detailRecord.approved_at).format('DD MMM YYYY, HH:mm')}
                          {' '}by {(detailRecord as any).approver?.full_name ?? 'Unknown'}
                        </Text>
                      </>
                    ),
                  }] : [{
                    color: 'gray',
                    children: <Text type="secondary">Awaiting approval</Text>,
                  }]),
                ]}
              />
            </div>
          </div>
        )}
      </Modal>

    </>
  )
}

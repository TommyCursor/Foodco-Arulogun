'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  Card, Table, Button, Form, Drawer, InputNumber, Select, Switch,
  Typography, Space, Tag, Row, Col, Statistic, App, TimePicker, DatePicker, Input, Alert,
} from 'antd'
import {
  PlusOutlined, ReloadOutlined, CarOutlined, CheckCircleOutlined,
  WarningOutlined, ClockCircleOutlined, FileExcelOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { BRAND } from '@/lib/constants'
import { useProfile } from '@/lib/hooks/useProfile'

const { Title, Text } = Typography

const DISCREPANCY_TYPES = [
  'None',
  'Short Supply',
  'Excess Supply',
  'Damaged Goods',
  'Wrong SKUs Delivered',
  'Missing Documentation',
]

interface Movement {
  id: string
  created_at: string
  movement_date: string
  skus_loaded: number
  truck_arrival: string | null
  offloading_start: string | null
  offloading_end: string | null
  truck_departure: string | null
  staff_count: number | null
  skus_received: number | null
  discrepancy_units: number
  discrepancy_type: string
  escalate: boolean
  outlet_leader: string
  logger: { full_name: string } | null
}

export default function LogisticsClient() {
  const { notification } = App.useApp()
  const { profile } = useProfile()
  const [form] = Form.useForm()

  const [movements,     setMovements]     = useState<Movement[]>([])
  const [loading,       setLoading]       = useState(false)
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [submitting,    setSubmitting]    = useState(false)
  const [discType,      setDiscType]      = useState('None')

  async function fetchMovements() {
    setLoading(true)
    try {
      const res = await fetch('/api/logistics')
      if (res.ok) setMovements(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMovements() }, [])

  // Auto-fill outlet leader with logged-in user's name
  useEffect(() => {
    if (drawerOpen && profile?.full_name) {
      form.setFieldValue('outlet_leader', profile.full_name)
    }
  }, [drawerOpen, profile])

  // Auto-calculate discrepancy units when skus_loaded or skus_received changes
  function handleSkuChange() {
    const loaded   = form.getFieldValue('skus_loaded')   ?? 0
    const received = form.getFieldValue('skus_received')  ?? 0
    const diff     = Math.abs(loaded - received)
    form.setFieldValue('discrepancy_units', diff > 0 ? diff : 0)
  }

  async function handleSubmit(values: any) {
    setSubmitting(true)
    try {
      const payload = {
        movement_date:    values.movement_date?.format('YYYY-MM-DD') ?? new Date().toISOString().split('T')[0],
        skus_loaded:      values.skus_loaded,
        truck_arrival:    values.truck_arrival?.format('HH:mm')    ?? null,
        offloading_start: values.offloading_start?.format('HH:mm') ?? null,
        offloading_end:   values.offloading_end?.format('HH:mm')   ?? null,
        truck_departure:  values.truck_departure?.format('HH:mm')  ?? null,
        staff_count:      values.staff_count      ?? null,
        skus_received:    values.skus_received     ?? null,
        discrepancy_units: values.discrepancy_units ?? 0,
        discrepancy_type:  values.discrepancy_type  ?? 'None',
        escalate:          values.escalate           ?? false,
        outlet_leader:     values.outlet_leader,
      }

      const res = await fetch('/api/logistics', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? `Server error (${res.status})`)

      setDrawerOpen(false)
      form.resetFields()
      setDiscType('None')
      fetchMovements()

      notification.success({
        message:     'Movement Logged',
        description: 'Logistics movement has been recorded and written to the sheet.',
        placement:   'topRight',
        duration:    4,
      })

    } catch (err: any) {
      notification.error({ message: 'Failed to log movement', description: err.message, placement: 'topRight', duration: 4 })
    } finally {
      setSubmitting(false)
    }
  }

  // Stats
  const stats = useMemo(() => ({
    total:      movements.length,
    escalated:  movements.filter(m => m.escalate).length,
    discrepant: movements.filter(m => m.discrepancy_type !== 'None' && m.discrepancy_units > 0).length,
    totalSkus:  movements.reduce((s, m) => s + (m.skus_loaded ?? 0), 0),
  }), [movements])

  const columns: ColumnsType<Movement> = [
    {
      title: 'Date',
      dataIndex: 'movement_date',
      width: 110,
      render: v => <Text style={{ fontSize: 12 }}>{dayjs(v).format('DD MMM YYYY')}</Text>,
      sorter: (a, b) => a.movement_date.localeCompare(b.movement_date),
      defaultSortOrder: 'descend',
    },
    {
      title: 'SKUs Loaded',
      dataIndex: 'skus_loaded',
      width: 110,
      align: 'center',
      render: v => <Text strong>{v?.toLocaleString() ?? '—'}</Text>,
    },
    {
      title: 'Truck Arrival',
      dataIndex: 'truck_arrival',
      width: 110,
      align: 'center',
      render: v => <Text style={{ fontFamily: 'monospace' }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Offloading',
      key: 'offloading',
      width: 160,
      align: 'center',
      render: (_, m) => (
        <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>
          {m.offloading_start ?? '—'} → {m.offloading_end ?? '—'}
        </Text>
      ),
    },
    {
      title: 'Departure',
      dataIndex: 'truck_departure',
      width: 100,
      align: 'center',
      render: v => <Text style={{ fontFamily: 'monospace' }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Staff',
      dataIndex: 'staff_count',
      width: 70,
      align: 'center',
      render: v => v ?? '—',
    },
    {
      title: 'SKUs Received',
      dataIndex: 'skus_received',
      width: 120,
      align: 'center',
      render: v => <Text strong>{v?.toLocaleString() ?? '—'}</Text>,
    },
    {
      title: 'Discrepancy',
      key: 'discrepancy',
      width: 180,
      render: (_, m) => {
        if (!m.discrepancy_units || m.discrepancy_type === 'None') {
          return <Tag color="green">None</Tag>
        }
        return (
          <Space direction="vertical" size={2}>
            <Tag color="red">{m.discrepancy_units} units</Tag>
            <Text style={{ fontSize: 11, color: '#888' }}>{m.discrepancy_type}</Text>
          </Space>
        )
      },
    },
    {
      title: 'Escalate?',
      dataIndex: 'escalate',
      width: 90,
      align: 'center',
      render: v => v
        ? <Tag color="red" icon={<WarningOutlined />}>YES</Tag>
        : <Tag color="default">NO</Tag>,
    },
    {
      title: 'Outlet Leader',
      dataIndex: 'outlet_leader',
      width: 160,
      render: v => <Text style={{ fontSize: 12 }}>{v ?? '—'}</Text>,
    },
    {
      title: 'Logged By',
      key: 'logger',
      width: 140,
      responsive: ['xl'],
      render: (_, m) => <Text style={{ fontSize: 11, color: '#888' }}>{m.logger?.full_name ?? '—'}</Text>,
    },
  ]

  return (
    <>
      {/* ── KPI Cards ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} md={6}>
          <Card className="kpi-card" bordered={false} size="small">
            <Statistic
              title="Total Movements"
              value={stats.total}
              valueStyle={{ color: BRAND.green, fontSize: 22, fontWeight: 700 }}
              prefix={<CarOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card" bordered={false} size="small">
            <Statistic
              title="Total SKUs Loaded"
              value={stats.totalSkus}
              valueStyle={{ color: BRAND.green, fontSize: 22, fontWeight: 700 }}
              prefix={<FileExcelOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card warning" bordered={false} size="small">
            <Statistic
              title="With Discrepancies"
              value={stats.discrepant}
              suffix="movements"
              valueStyle={{ color: '#FA8C16', fontSize: 22, fontWeight: 700 }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card critical" bordered={false} size="small">
            <Statistic
              title="Escalated"
              value={stats.escalated}
              suffix="movements"
              valueStyle={{ color: BRAND.critical, fontSize: 22, fontWeight: 700 }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Header ── */}
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Title level={5} style={{ margin: 0, color: BRAND.green }}>Logistics Movement Tracker</Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Log truck arrivals, offloading times, SKU counts, and discrepancies.
            </Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={fetchMovements} loading={loading}>Refresh</Button>
            <Button
              type="primary" icon={<PlusOutlined />}
              style={{ background: BRAND.green }}
              onClick={() => { form.resetFields(); setDiscType('None'); setDrawerOpen(true) }}
            >
              Log Movement
            </Button>
          </Space>
        </div>
      </Card>

      {/* ── Table ── */}
      <Card bordered={false} style={{ borderRadius: 8 }}>
        <Table<Movement>
          dataSource={movements}
          columns={columns}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1200 }}
          size="small"
          rowClassName={m => m.escalate ? 'row-critical' : m.discrepancy_units > 0 ? 'row-warning' : ''}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} movements`,
          }}
        />
      </Card>

      {/* ── Log Movement Drawer ── */}
      <Drawer
        open={drawerOpen}
        onClose={() => { setDrawerOpen(false); setDiscType('None') }}
        title={
          <Space>
            <CarOutlined style={{ color: BRAND.green }} />
            <span>Log Logistics Movement</span>
          </Space>
        }
        width={480}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => { setDrawerOpen(false); setDiscType('None') }}>Cancel</Button>
            <Button
              type="primary" icon={<CheckCircleOutlined />}
              loading={submitting}
              onClick={() => form.submit()}
              style={{ background: BRAND.green }}
            >
              Save Movement
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ discrepancy_type: 'None', escalate: false, movement_date: dayjs() }}
        >
          {/* Date */}
          <Form.Item name="movement_date" label="Movement Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" />
          </Form.Item>

          {/* SKUs Loaded */}
          <Form.Item name="skus_loaded" label="No. of SKUs Loaded" rules={[{ required: true, message: 'Required' }]}>
            <InputNumber
              style={{ width: '100%' }} min={0} placeholder="e.g. 3024"
              onChange={handleSkuChange}
            />
          </Form.Item>

          {/* Time row 1 */}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="truck_arrival" label="Truck Arrival Time">
                <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={1} placeholder="HH:MM" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="truck_departure" label="Truck Departure">
                <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={1} placeholder="HH:MM" />
              </Form.Item>
            </Col>
          </Row>

          {/* Time row 2 */}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="offloading_start" label="Offloading Start">
                <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={1} placeholder="HH:MM" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="offloading_end" label="Offloading End">
                <TimePicker style={{ width: '100%' }} format="HH:mm" minuteStep={1} placeholder="HH:MM" />
              </Form.Item>
            </Col>
          </Row>

          {/* Staff + SKUs Received */}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="staff_count" label="No. of Staff for Offloading">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="e.g. 5" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="skus_received" label="SKUs Received">
                <InputNumber
                  style={{ width: '100%' }} min={0} placeholder="e.g. 2971"
                  onChange={handleSkuChange}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Discrepancy */}
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="discrepancy_units" label="Discrepancy Units">
                <InputNumber style={{ width: '100%' }} min={0} placeholder="Auto-calculated" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="discrepancy_type" label="Discrepancy Type">
                <Select
                  options={DISCREPANCY_TYPES.map(t => ({ value: t, label: t }))}
                  onChange={v => setDiscType(v)}
                />
              </Form.Item>
            </Col>
          </Row>

          {discType !== 'None' && (
            <Alert
              type="warning" showIcon
              message={`Discrepancy: ${discType}`}
              description="Ensure discrepancy units are filled in accurately before saving."
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {/* Escalate */}
          <Form.Item name="escalate" label="Escalate?" valuePropName="checked">
            <Switch
              checkedChildren="YES"
              unCheckedChildren="NO"
              style={{ background: form.getFieldValue('escalate') ? BRAND.critical : undefined }}
            />
          </Form.Item>

          {/* Outlet Leader */}
          <Form.Item name="outlet_leader" label="Outlet Leader" rules={[{ required: true, message: 'Required' }]}>
            <Input placeholder="e.g. Adeyinka Ayotomiwa" />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  )
}

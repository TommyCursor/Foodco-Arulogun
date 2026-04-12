'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, Tag, Button, Space, Typography, Drawer, Form,
  Input, Select, InputNumber, Switch, Card, Tabs, Badge,
  Row, Col, Statistic, Tooltip, Modal, Alert, Divider, Empty,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, BellOutlined, CheckOutlined, ClockCircleOutlined,
  DeleteOutlined, ThunderboltOutlined, WarningOutlined,
  PlayCircleOutlined, PauseCircleOutlined, ExclamationCircleOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { BRAND } from '@/lib/constants'
import type { AutomatedAlert, AlertLog, Category } from '@/types'

dayjs.extend(relativeTime)

const { Title, Text } = Typography
const { Option } = Select
const { confirm } = Modal

const TRIGGER_TYPES = [
  { value: 'days_to_expiry',            label: 'Items expiring within N days'       },
  { value: 'damage_value_exceeds',      label: 'Damage value exceeds ₦ amount'       },
  { value: 'discount_effectiveness_below', label: 'Discount recovery rate drops below %' },
]

const FREQUENCY_OPTIONS = [
  { value: 'once',       label: 'Once when triggered'    },
  { value: 'every_hour', label: 'Every hour (until resolved)' },
  { value: 'every_6h',   label: 'Every 6 hours'           },
  { value: 'every_12h',  label: 'Every 12 hours'          },
  { value: 'daily',      label: 'Daily'                   },
]

const LOG_STATUS_COLOR: Record<string, string> = {
  sent:         'green',
  failed:       'red',
  snoozed:      'gold',
  resolved:     'blue',
  acknowledged: 'purple',
}

interface Props {
  alerts:     AutomatedAlert[]
  logs:       AlertLog[]
  categories: Category[]
}

export default function AlertsClient({ alerts, logs, categories }: Props) {
  const router                        = useRouter()
  const [drawerOpen, setDrawerOpen]   = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [triggerType, setTriggerType] = useState<string>('days_to_expiry')
  const [form]                        = Form.useForm()

  // ── Stats ──
  const stats = useMemo(() => {
    const active     = alerts.filter(a => a.is_active)
    const triggered  = logs.filter(l => dayjs(l.triggered_at).isSame(dayjs(), 'day'))
    const unresolved = logs.filter(l => !['resolved', 'acknowledged'].includes(l.status))
    return { active: active.length, triggeredToday: triggered.length, unresolved: unresolved.length }
  }, [alerts, logs])

  // ── Submit ──
  async function handleSubmit(values: Record<string, unknown>) {
    setSubmitting(true)
    try {
      const channels   = values.channels as string[]
      const emails     = ((values.emails as string) ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
      const phones     = ((values.phones as string) ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)

      const triggerCondition: Record<string, unknown> = {
        type:  values.trigger_type,
        value: values.trigger_value,
      }
      if (values.category_id) triggerCondition.category_id = values.category_id

      const res = await fetch('/api/alerts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:                 values.name,
          trigger_condition:    triggerCondition,
          channels,
          recipients:           { emails, phones },
          frequency:            values.frequency,
          escalation_hours:     values.escalation_hours ?? null,
          ai_generated_message: true,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setDrawerOpen(false)
      form.resetFields()
      router.refresh()
    } catch (err: any) {
      Modal.error({ title: 'Error', content: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleAlert(id: string, is_active: boolean) {
    await fetch(`/api/alerts/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_active }),
    })
    router.refresh()
  }

  function deleteAlert(id: string) {
    confirm({
      title:   'Delete this alert rule?',
      icon:    <ExclamationCircleOutlined style={{ color: BRAND.critical }} />,
      content: 'All associated logs will remain for history.',
      okType:  'danger',
      okText:  'Delete',
      async onOk() {
        await fetch(`/api/alerts/${id}`, { method: 'DELETE' })
        router.refresh()
      },
    })
  }

  async function resolveLog(id: string) {
    await fetch(`/api/alerts/logs/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'resolved' }),
    })
    router.refresh()
  }

  // ── Alert rule columns ──
  const ruleColumns: ColumnsType<AutomatedAlert> = [
    {
      title:  'Alert Name',
      dataIndex: 'name',
      render: (v, r) => (
        <div>
          <Text strong>{v}</Text><br />
          <Text type="secondary" style={{ fontSize: 11 }}>
            {TRIGGER_TYPES.find(t => t.value === r.trigger_condition?.type)?.label ?? r.trigger_condition?.type}
            {' — threshold: '}<strong>{r.trigger_condition?.value}</strong>
          </Text>
        </div>
      ),
    },
    {
      title:  'Channels',
      key:    'channels',
      width:  160,
      render: (_, r) => (
        <Space wrap size={4}>
          {r.channels.map(c => (
            <Tag key={c} color={c === 'email' ? 'blue' : c === 'sms' ? 'green' : 'purple'}>
              {c.toUpperCase()}
            </Tag>
          ))}
        </Space>
      ),
    },
    {
      title:  'Frequency',
      dataIndex: 'frequency',
      width:  140,
      render: v => <Text style={{ fontSize: 12 }}>{FREQUENCY_OPTIONS.find(f => f.value === v)?.label ?? v}</Text>,
    },
    {
      title:  'Created',
      dataIndex: 'created_at',
      width:  120,
      render: v => <Text style={{ fontSize: 12, color: '#888' }}>{dayjs(v).format('DD MMM YYYY')}</Text>,
    },
    {
      title:  'Active',
      dataIndex: 'is_active',
      width:  80,
      render: (v, r) => (
        <Switch
          checked={v}
          size="small"
          onChange={checked => toggleAlert(r.id, checked)}
          style={{ background: v ? BRAND.green : undefined }}
        />
      ),
    },
    {
      title:  '',
      key:    'del',
      width:  50,
      render: (_, r) => (
        <Tooltip title="Delete rule">
          <Button size="small" icon={<DeleteOutlined />} danger onClick={() => deleteAlert(r.id)} />
        </Tooltip>
      ),
    },
  ]

  // ── Log columns ──
  const logColumns: ColumnsType<AlertLog> = [
    {
      title:  'Alert',
      key:    'alert',
      render: (_, l) => <Text strong style={{ fontSize: 13 }}>{(l as any).alert?.name ?? '—'}</Text>,
    },
    {
      title:  'Message',
      dataIndex: 'message_sent',
      render: v => (
        <Tooltip title={v}>
          <Text style={{ fontSize: 12 }} ellipsis={{ tooltip: false }}>
            {(v ?? '').slice(0, 80)}{(v ?? '').length > 80 ? '…' : ''}
          </Text>
        </Tooltip>
      ),
    },
    {
      title:  'Triggered',
      dataIndex: 'triggered_at',
      width:  130,
      render: v => (
        <Tooltip title={dayjs(v).format('DD MMM YYYY, HH:mm')}>
          <Text style={{ fontSize: 12, color: '#888' }}>{dayjs(v).fromNow()}</Text>
        </Tooltip>
      ),
    },
    {
      title:  'Channels',
      dataIndex: 'channels_used',
      width:  120,
      render: (v: string[]) => (
        <Space wrap size={4}>
          {(v ?? []).map(c => <Tag key={c} style={{ fontSize: 10 }}>{c}</Tag>)}
        </Space>
      ),
    },
    {
      title:  'Status',
      dataIndex: 'status',
      width:  120,
      render: (v: string) => <Tag color={LOG_STATUS_COLOR[v] ?? 'default'}>{v}</Tag>,
    },
    {
      title:  '',
      key:    'resolve',
      width:  80,
      render: (_, l) =>
        !['resolved', 'acknowledged'].includes(l.status) ? (
          <Button size="small" icon={<CheckOutlined />} onClick={() => resolveLog(l.id)}>
            Resolve
          </Button>
        ) : null,
    },
  ]

  const tabItems = [
    {
      key:   'rules',
      label: <Space><BellOutlined />Alert Rules ({alerts.length})</Space>,
      children: (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text type="secondary">Active rules run automatically on every cron cycle.</Text>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => { form.resetFields(); setDrawerOpen(true) }}
              style={{ background: BRAND.green }}
            >
              Create Alert Rule
            </Button>
          </div>
          <Card bordered={false} style={{ borderRadius: 8 }}>
            {alerts.length === 0 ? (
              <Empty description="No alert rules yet. Create one to start monitoring." style={{ padding: '40px 0' }} />
            ) : (
              <Table dataSource={alerts} columns={ruleColumns} rowKey="id" size="small" pagination={false} />
            )}
          </Card>
        </>
      ),
    },
    {
      key:   'logs',
      label: <Space><ClockCircleOutlined />Alert History ({logs.length})</Space>,
      children: (
        <Card bordered={false} style={{ borderRadius: 8 }}>
          <Table dataSource={logs} columns={logColumns} rowKey="id" size="small"
            pagination={{ pageSize: 20, showTotal: (t, r) => `${r[0]}–${r[1]} of ${t}` }}
          />
        </Card>
      ),
    },
  ]

  return (
    <>
      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={8}>
          <Card className="kpi-card success" bordered={false} size="small">
            <Statistic title="Active Rules" value={stats.active} valueStyle={{ color: BRAND.green, fontSize: 22, fontWeight: 700 }} prefix={<BellOutlined />} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card className="kpi-card warning" bordered={false} size="small">
            <Statistic title="Triggered Today" value={stats.triggeredToday} valueStyle={{ color: '#b8860b', fontSize: 22, fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card className="kpi-card critical" bordered={false} size="small">
            <Statistic title="Unresolved" value={stats.unresolved} valueStyle={{ color: BRAND.critical, fontSize: 22, fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>

      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, color: BRAND.green }}>Smart Alerts Command Center</Title>
      </div>

      <Tabs items={tabItems} defaultActiveKey="rules" />

      {/* Create Alert Drawer */}
      <Drawer
        title={<Space><BellOutlined style={{ color: BRAND.green }} /><span>Create Alert Rule</span></Space>}
        width={520}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        extra={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" loading={submitting} onClick={() => form.submit()} style={{ background: BRAND.green }}>
              Save Alert
            </Button>
          </Space>
        }
      >
        <Alert type="info" showIcon message="Alerts run on every cron cycle. Configure the CRON_SECRET and set up /api/cron to run on schedule." style={{ marginBottom: 20, borderRadius: 8 }} />

        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Alert Name" rules={[{ required: true }]}>
            <Input placeholder='e.g. "Expiry Monitor — Dairy Section"' />
          </Form.Item>

          <Divider orientation="left" style={{ fontSize: 13 }}>Trigger Condition</Divider>

          <Form.Item name="trigger_type" label="Trigger When" initialValue="days_to_expiry" rules={[{ required: true }]}>
            <Select onChange={v => setTriggerType(v)}>
              {TRIGGER_TYPES.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
            </Select>
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="trigger_value"
                label={triggerType === 'days_to_expiry' ? 'Days to expiry' : triggerType === 'damage_value_exceeds' ? 'Value threshold (₦)' : 'Recovery rate (%)'}
                rules={[{ required: true }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            {triggerType === 'days_to_expiry' && (
              <Col xs={24} sm={12}>
                <Form.Item name="category_id" label="Category (optional)">
                  <Select allowClear placeholder="All categories">
                    {categories.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                  </Select>
                </Form.Item>
              </Col>
            )}
          </Row>

          <Divider orientation="left" style={{ fontSize: 13 }}>Notification</Divider>

          <Form.Item name="channels" label="Channels" initialValue={['in_app', 'email']} rules={[{ required: true }]}>
            <Select mode="multiple">
              <Option value="in_app">In-App</Option>
              <Option value="email">Email</Option>
              <Option value="sms">SMS</Option>
            </Select>
          </Form.Item>

          <Form.Item name="emails" label="Email Recipients (comma-separated)">
            <Input placeholder="manager@foodco.com, owner@foodco.com" />
          </Form.Item>

          <Form.Item name="phones" label="Phone Numbers for SMS (comma-separated)">
            <Input placeholder="+2348031234567, +2348099876543" />
          </Form.Item>

          <Form.Item name="frequency" label="Alert Frequency" initialValue="every_6h" rules={[{ required: true }]}>
            <Select>
              {FREQUENCY_OPTIONS.map(f => <Option key={f.value} value={f.value}>{f.label}</Option>)}
            </Select>
          </Form.Item>

          <Form.Item name="escalation_hours" label="Escalate if unacknowledged after (hours)" tooltip="Leave blank to disable escalation">
            <InputNumber min={1} max={72} style={{ width: '100%' }} placeholder="e.g. 2" />
          </Form.Item>
        </Form>
      </Drawer>
    </>
  )
}

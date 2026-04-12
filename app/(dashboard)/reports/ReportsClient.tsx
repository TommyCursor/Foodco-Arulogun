'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Tabs, Card, Button, Select, Input, Space, Typography,
  Form, Switch, Table, Tag, Modal, Badge, Row, Col,
  Statistic, Divider, Alert, TimePicker, Tooltip,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  FileExcelOutlined, MailOutlined, PlusOutlined,
  ThunderboltOutlined, ClockCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, DeleteOutlined, EyeOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { BRAND } from '@/lib/constants'
import type { ScheduledReport, ReportLog } from '@/types'

const { Title, Text, Paragraph } = Typography
const { Option } = Select

const REPORT_TYPES = [
  { value: 'comprehensive', label: '📊 Comprehensive (All sections)', desc: 'Expiry + Damage + Discounts in one workbook' },
  { value: 'expiry',        label: '📦 Expiry Risk Report',          desc: 'Items expiring within 14 days' },
  { value: 'damage',        label: '⚠️ Damage Report',               desc: 'All damage records and write-offs' },
  { value: 'discount',      label: '🏷️ Discount Performance',        desc: 'Active discounts and recovery rates' },
]

const CRON_PRESETS = [
  { label: 'Daily at 8:00 AM',       value: '0 8 * * *'   },
  { label: 'Daily at 6:00 PM',       value: '0 18 * * *'  },
  { label: 'Monday 9:00 AM (Weekly)',value: '0 9 * * 1'   },
  { label: 'Last day of month',      value: '0 8 28 * *'  },
]

interface Props {
  scheduledReports: ScheduledReport[]
  reportLogs:       ReportLog[]
}

export default function ReportsClient({ scheduledReports, reportLogs }: Props) {
  const router                           = useRouter()
  const [generating, setGenerating]      = useState(false)
  const [emailPreview, setEmailPreview]  = useState(false)
  const [schedDrawer,  setSchedDrawer]   = useState(false)
  const [genForm]                        = Form.useForm()
  const [schedForm]                      = Form.useForm()

  // ── Generate + Download / Email ──
  async function handleGenerate(values: Record<string, unknown>) {
    setGenerating(true)
    try {
      const rawRecipients = values.recipients
      const recipients = typeof rawRecipients === 'string'
        ? rawRecipients.split(',').map((s: string) => s.trim()).filter(Boolean)
        : (rawRecipients as string[] | undefined) ?? []

      const res = await fetch('/api/reports/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          report_type: values.report_type,
          send_email:  values.send_email ?? false,
          recipients,
        }),
      })

      if (!res.ok) throw new Error((await res.json()).error)

      // Trigger download
      const blob     = await res.blob()
      const url      = URL.createObjectURL(blob)
      const a        = document.createElement('a')
      a.href         = url
      a.download     = res.headers.get('Content-Disposition')?.split('filename="')[1]?.replace('"', '') ?? 'report.xlsx'
      a.click()
      URL.revokeObjectURL(url)

      if (values.send_email) {
        Modal.success({
          title:   'Report sent!',
          content: `Excel report generated and emailed to ${(values.recipients as string[]).join(', ')}.`,
        })
      }
      router.refresh()
    } catch (err: any) {
      Modal.error({ title: 'Error', content: err.message })
    } finally {
      setGenerating(false)
    }
  }

  // ── Create scheduled report ──
  async function handleCreateSchedule(values: Record<string, unknown>) {
    try {
      const res = await fetch('/api/reports/scheduled', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:               values.name,
          report_type:        values.report_type,
          schedule_cron:      values.schedule_cron,
          recipients:         (values.recipients as string ?? '').split(',').map((s: string) => s.trim()).filter(Boolean),
          include_ai_summary: values.include_ai_summary ?? true,
          include_excel:      values.include_excel ?? true,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setSchedDrawer(false)
      schedForm.resetFields()
      router.refresh()
    } catch (err: any) {
      Modal.error({ title: 'Error', content: err.message })
    }
  }

  async function toggleSchedule(id: string, is_active: boolean) {
    await fetch(`/api/reports/scheduled/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_active }),
    })
    router.refresh()
  }

  async function deleteSchedule(id: string) {
    Modal.confirm({
      title:   'Delete this schedule?',
      content: 'This will stop future automated reports.',
      okType:  'danger',
      okText:  'Delete',
      async onOk() {
        await fetch(`/api/reports/scheduled/${id}`, { method: 'DELETE' })
        router.refresh()
      },
    })
  }

  // ── Scheduled report columns ──
  const schedColumns: ColumnsType<ScheduledReport> = [
    {
      title: 'Name',
      dataIndex: 'name',
      render: (v, r) => (
        <div>
          <Text strong>{v}</Text><br />
          <Tag color="blue" style={{ marginTop: 2 }}>{r.report_type}</Tag>
        </div>
      ),
    },
    {
      title:  'Schedule',
      dataIndex: 'schedule_cron',
      width:  180,
      render: v => {
        const preset = CRON_PRESETS.find(p => p.value === v)
        return <Text style={{ fontSize: 12 }}>{preset?.label ?? v}</Text>
      },
    },
    {
      title:  'Recipients',
      dataIndex: 'recipients',
      render: (v: string[]) => (
        <Space wrap size={4}>
          {v.map(r => <Tag key={r} style={{ fontSize: 11 }}>{r}</Tag>)}
        </Space>
      ),
    },
    {
      title:  'Last Sent',
      dataIndex: 'last_generated',
      width:  130,
      render: v => v ? <Text style={{ fontSize: 12 }}>{dayjs(v).format('DD MMM, HH:mm')}</Text> : <Text type="secondary">Never</Text>,
    },
    {
      title:  'Status',
      dataIndex: 'is_active',
      width:  100,
      render: (v, r) => (
        <Switch
          checked={v}
          size="small"
          onChange={checked => toggleSchedule(r.id, checked)}
          checkedChildren="ON"
          unCheckedChildren="OFF"
          style={{ background: v ? BRAND.green : undefined }}
        />
      ),
    },
    {
      title:  '',
      key:    'del',
      width:  50,
      render: (_, r) => (
        <Tooltip title="Delete schedule">
          <Button size="small" icon={<DeleteOutlined />} danger onClick={() => deleteSchedule(r.id)} />
        </Tooltip>
      ),
    },
  ]

  // ── Log columns ──
  const logColumns: ColumnsType<ReportLog> = [
    {
      title:  'Report Type',
      dataIndex: 'report_type',
      width:  160,
      render: v => <Tag>{v}</Tag>,
    },
    {
      title:  'Generated',
      dataIndex: 'generated_at',
      render: v => dayjs(v).format('DD MMM YYYY, HH:mm'),
    },
    {
      title:  'Generated By',
      key:    'generated_by',
      width:  150,
      render: (_: unknown, log: ReportLog) => (
        <Text style={{ fontSize: 12 }}>{(log as any).generator?.full_name ?? <Text type="secondary">System / Cron</Text>}</Text>
      ),
    },
    {
      title:  'Sent To',
      dataIndex: 'email_sent_to',
      render: (v: string[]) => v.length ? v.join(', ') : <Text type="secondary">Download only</Text>,
    },
    {
      title:  'Status',
      dataIndex: 'status',
      width:  100,
      render: v => v === 'success'
        ? <Badge status="success" text="Success" />
        : <Badge status="error"   text="Failed"  />,
    },
  ]

  const tabItems = [
    {
      key:   'generate',
      label: <Space><FileExcelOutlined /> Generate Now</Space>,
      children: (
        <Row gutter={[24, 24]}>
          {/* Generate form */}
          <Col xs={24} lg={14}>
            <Card bordered={false} style={{ borderRadius: 8 }}>
              <Title level={5} style={{ color: BRAND.green, marginBottom: 20 }}>
                Generate & Dispatch Report
              </Title>

              <Form form={genForm} layout="vertical" onFinish={handleGenerate}>
                <Form.Item
                  name="report_type"
                  label="Report Type"
                  initialValue="comprehensive"
                  rules={[{ required: true }]}
                >
                  <Select size="large">
                    {REPORT_TYPES.map(t => (
                      <Option key={t.value} value={t.value}>
                        <div>
                          <Text strong>{t.label}</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 11 }}>{t.desc}</Text>
                        </div>
                      </Option>
                    ))}
                  </Select>
                </Form.Item>

                <Divider style={{ margin: '8px 0 16px' }} />

                <Form.Item name="send_email" valuePropName="checked" label="Also send via email">
                  <Switch
                    checkedChildren={<MailOutlined />}
                    unCheckedChildren="No"
                    style={{ background: undefined }}
                  />
                </Form.Item>

                <Form.Item
                  noStyle
                  shouldUpdate={(prev, cur) => prev.send_email !== cur.send_email}
                >
                  {({ getFieldValue }) =>
                    getFieldValue('send_email') ? (
                      <Form.Item
                        name="recipients"
                        label="Email Recipients"
                        rules={[{ required: true, message: 'Add at least one recipient' }]}
                        tooltip="Separate multiple emails with commas"
                        preserve={false}
                      >
                        <Input.TextArea
                          rows={2}
                          placeholder="manager@foodco.com, owner@foodco.com"
                        />
                      </Form.Item>
                    ) : null
                  }
                </Form.Item>

                <Space style={{ marginTop: 8 }}>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={generating}
                    icon={<FileExcelOutlined />}
                    size="large"
                    style={{ background: BRAND.green }}
                  >
                    {generating ? 'Generating...' : 'Generate & Download'}
                  </Button>
                  <Button
                    size="large"
                    icon={<EyeOutlined />}
                    onClick={() => setEmailPreview(true)}
                  >
                    Preview Email
                  </Button>
                </Space>
              </Form>
            </Card>
          </Col>

          {/* AI Email preview panel */}
          <Col xs={24} lg={10}>
            <Card
              bordered={false}
              style={{ borderRadius: 8, borderLeft: `4px solid ${BRAND.yellow}` }}
            >
              <Space style={{ marginBottom: 12 }}>
                <ThunderboltOutlined style={{ color: BRAND.yellow, fontSize: 16 }} />
                <Text strong>Smart Email Template</Text>
              </Space>
              <div style={{ fontSize: 12, color: '#555', lineHeight: 1.8 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  When you check "send via email", the system automatically:
                </Text>
                <div style={{ paddingLeft: 8 }}>
                  <div>• Scans the generated data</div>
                  <div>• Calculates risk level (LOW / MEDIUM / HIGH)</div>
                  <div>• Writes a narrative summary with ₦ figures</div>
                  <div>• Lists 3–5 recommended actions</div>
                  <div>• Attaches the Excel file</div>
                  <div>• Sends to all recipients in one click</div>
                </div>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginTop: 12, borderRadius: 6, fontSize: 11 }}
                  message="No AI API needed — powered by smart templates with real data."
                />
              </div>
            </Card>

            {/* Recent activity */}
            <Card
              bordered={false}
              style={{ borderRadius: 8, marginTop: 16 }}
              title={<Text strong>Recent Activity</Text>}
              size="small"
            >
              {reportLogs.slice(0, 5).length === 0 ? (
                <Text type="secondary" style={{ fontSize: 12 }}>No reports generated yet.</Text>
              ) : (
                reportLogs.slice(0, 5).map(log => (
                  <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <div>
                      <Tag style={{ fontSize: 11 }}>{log.report_type}</Tag>
                      <Text style={{ fontSize: 11, color: '#888' }}>
                        {dayjs(log.generated_at).format('DD MMM, HH:mm')}
                      </Text>
                    </div>
                    {log.status === 'success'
                      ? <CheckCircleOutlined style={{ color: BRAND.green }} />
                      : <CloseCircleOutlined style={{ color: BRAND.critical }} />
                    }
                  </div>
                ))
              )}
            </Card>
          </Col>
        </Row>
      ),
    },
    {
      key:   'scheduled',
      label: <Space><ClockCircleOutlined /> Scheduled Reports</Space>,
      children: (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <Title level={5} style={{ margin: 0, color: BRAND.green }}>Automated Report Schedules</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Reports auto-generate and email on your configured schedule via the cron endpoint.
              </Text>
            </div>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => setSchedDrawer(true)}
              style={{ background: BRAND.green }}
            >
              New Schedule
            </Button>
          </div>

          <Card bordered={false} style={{ borderRadius: 8, marginBottom: 16 }}>
            <Table
              dataSource={scheduledReports}
              columns={schedColumns}
              rowKey="id"
              size="small"
              pagination={false}
            />
          </Card>

          <Card bordered={false} style={{ borderRadius: 8 }} title={<Text strong>Report History (Last 50)</Text>}>
            <Table
              dataSource={reportLogs}
              columns={logColumns}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 10, showSizeChanger: false }}
            />
          </Card>
        </>
      ),
    },
  ]

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <Title level={4} style={{ margin: 0, color: BRAND.green }}>Reports & Dispatch</Title>
        <Text type="secondary">Generate Excel reports, compose AI emails, and manage scheduled dispatches</Text>
      </div>

      <Tabs items={tabItems} defaultActiveKey="generate" />

      {/* Create Schedule Modal */}
      <Modal
        open={schedDrawer}
        onCancel={() => setSchedDrawer(false)}
        title={<Space><ClockCircleOutlined style={{ color: BRAND.green }} /><span>Create Report Schedule</span></Space>}
        onOk={() => schedForm.submit()}
        okText="Create Schedule"
        okButtonProps={{ style: { background: BRAND.green } }}
        width={520}
      >
        <Form form={schedForm} layout="vertical" onFinish={handleCreateSchedule} style={{ marginTop: 16 }}>
          <Form.Item name="name" label="Schedule Name" rules={[{ required: true }]}>
            <Input placeholder='e.g. "Daily Morning Brief"' />
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="report_type" label="Report Type" rules={[{ required: true }]}>
                <Select placeholder="Select type">
                  {REPORT_TYPES.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="schedule_cron" label="Frequency" rules={[{ required: true }]}>
                <Select placeholder="Select schedule">
                  {CRON_PRESETS.map(p => <Option key={p.value} value={p.value}>{p.label}</Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="recipients"
            label="Recipients (comma-separated)"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={2} placeholder="manager@foodco.com, owner@foodco.com" />
          </Form.Item>

          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="include_excel" valuePropName="checked" label="Include Excel File" initialValue={true}>
                <Switch defaultChecked style={{ background: BRAND.green }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="include_ai_summary" valuePropName="checked" label="Include AI Summary" initialValue={true}>
                <Switch defaultChecked style={{ background: BRAND.green }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* Email Preview Modal */}
      <Modal
        open={emailPreview}
        onCancel={() => setEmailPreview(false)}
        footer={null}
        width={640}
        title="AI Email Preview (Sample)"
      >
        <div style={{ background: '#f5f5f5', borderRadius: 8, padding: 16, fontSize: 13, lineHeight: 1.7 }}>
          <div style={{ background: BRAND.green, color: '#fff', padding: '12px 16px', borderRadius: '8px 8px 0 0', fontWeight: 700 }}>
            FOODCO ARULOGUN — HIGH RISK — Comprehensive Risk Report
          </div>
          <div style={{ background: '#fff', padding: 16, border: '1px solid #eee' }}>
            <p>Dear Management Team,</p>
            <p>
              <strong>8 items expired today</strong>, requiring immediate write-off.{' '}
              <strong>23 batches are expiring within 7 days</strong> with{' '}
              <strong>₦89,200</strong> of inventory value at stake.
              Active discounts are recovering at an average rate of <strong>67%</strong> — a solid result.
              Cumulative approved damage stands at <strong>₦24,500</strong> with{' '}
              <strong>3 records still pending approval</strong>.
            </p>
            <div style={{ background: '#e8f5e9', padding: 12, borderRadius: 6, borderLeft: `4px solid ${BRAND.green}`, marginTop: 12 }}>
              <strong>⚡ RECOMMENDED ACTIONS</strong><br />
              • Apply tiered discounts to the 23 at-risk batches<br />
              • Write off and remove 8 expired items from shelves immediately<br />
              • Review and approve/reject 3 pending damage records
            </div>
            <p style={{ color: '#888', fontSize: 12, marginTop: 12 }}>
              Full report attached: Foodco_Comprehensive_Report_2025-03-15.xlsx
            </p>
          </div>
        </div>
      </Modal>
    </>
  )
}

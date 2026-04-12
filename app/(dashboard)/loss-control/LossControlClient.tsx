'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, Tag, Button, Input, Select, AutoComplete, Card, Statistic, Row, Col,
  Typography, Space, Modal, Alert, Empty, Checkbox, Form, App,
} from 'antd'
import { useProfile } from '@/lib/hooks/useProfile'
import type { ColumnsType } from 'antd/es/table'
import type { TableRowSelection } from 'antd/es/table/interface'
import {
  SendOutlined, FileExcelOutlined, ReloadOutlined,
  WarningOutlined, TagOutlined, ClockCircleOutlined,
  ExclamationCircleOutlined, HistoryOutlined, EyeOutlined,
  RollbackOutlined, RedoOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { BRAND } from '@/lib/constants'
import type { InventoryItem, PipelineStage } from '@/types'

const { Title, Text } = Typography

const LS_KEY = 'lc_email_list'

const DEFAULT_EMAILS = [
  'ayotomiwa.sop@gmail.com',
  'ayofunlara@gmail.com',
  'ndubuisindimele@foodco.ng',
  'enikeemmanuel338@gmail.com',
  'tobibamidele@foodco.ng',
  'iyanuoluwaolateju@foodco.ng',
]

const STAGE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  damage_reported:   { label: 'Damage Reported',   color: 'red',    icon: <WarningOutlined /> },
  discount_reported: { label: 'Discount Reported',  color: 'orange', icon: <TagOutlined /> },
  expiry_reported:   { label: 'About to Expire',    color: 'gold',   icon: <ClockCircleOutlined /> },
}

interface SnapshotItem {
  id: string; name: string; sku: string; qty: number; price: number
  original_stage: string; reason: string; expiry_date: string | null
}

interface Submission {
  id: string
  created_at: string
  recipient_email: string
  cc_emails: string[]
  item_count: number
  total_value: number
  items_snapshot: SnapshotItem[]
  sender: { full_name: string } | null
}

interface Props { items: InventoryItem[] }

const ALLOWED_ROLES = [
  'grocery_team_lead', 'toiletries_team_lead', 'cashier_team_lead', '3f_team_lead',
  'supervisor', 'manager', 'admin',
]

export default function LossControlClient({ items }: Props) {
  const router                              = useRouter()
  const { notification }                    = App.useApp()
  const { profile }                         = useProfile()
  const roleName                            = profile?.role_name ?? ''
  const canSendToLC                         = ALLOWED_ROLES.includes(roleName)
  const [selectedIds,   setSelectedIds]     = useState<string[]>([])
  const [sending,       setSending]         = useState(false)
  const [previewOpen,   setPreviewOpen]     = useState(false)
  const [recipientEmail, setRecipientEmail] = useState('')
  const [ccEmails,      setCcEmails]        = useState<string[]>([])
  const [emailError,    setEmailError]      = useState('')
  const [savedEmails,   setSavedEmails]     = useState<string[]>([])

  // History state
  const [history,          setHistory]          = useState<Submission[]>([])
  const [historyLoading,   setHistoryLoading]   = useState(false)
  const [reviewSub,        setReviewSub]        = useState<Submission | null>(null)
  const [resendSub,        setResendSub]        = useState<Submission | null>(null)
  const [resendEmail,      setResendEmail]      = useState('')
  const [resendCc,         setResendCc]         = useState<string[]>([])
  const [resendEmailError, setResendEmailError] = useState('')
  const [actionLoading,    setActionLoading]    = useState(false)

  // Load extra emails from localStorage on mount
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]') as string[]
      setSavedEmails(stored)
    } catch {}
  }, [])

  // Fetch history — callable manually too
  async function loadHistory() {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/loss-control/history')
      if (res.ok) setHistory(await res.json())
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => { loadHistory() }, [])

  // Combined email list (default + saved), deduplicated
  const allEmailOptions = useMemo(() => {
    const all = [...new Set([...DEFAULT_EMAILS, ...savedEmails])]
    return all.map(e => ({ value: e, label: e }))
  }, [savedEmails])

  // Persist any brand-new email addresses after a successful send
  function saveNewEmails(emails: string[]) {
    const known = new Set([...DEFAULT_EMAILS, ...savedEmails])
    const fresh = emails.filter(e => e && !known.has(e))
    if (!fresh.length) return
    const updated = [...savedEmails, ...fresh]
    setSavedEmails(updated)
    try { localStorage.setItem(LS_KEY, JSON.stringify(updated)) } catch {}
  }

  // Stats
  const stats = useMemo(() => ({
    damage:   items.filter(i => i.pipeline_stage === 'damage_reported').length,
    discount: items.filter(i => i.pipeline_stage === 'discount_reported').length,
    expiry:   items.filter(i => i.pipeline_stage === 'expiry_reported').length,
    totalAmt: items.reduce((s, i) => s + i.quantity * Number(i.selling_price), 0),
  }), [items])

  const selectedItems = useMemo(
    () => items.filter(i => selectedIds.includes(i.id)),
    [items, selectedIds]
  )

  async function handleReverse(sub: Submission) {
    Modal.confirm({
      title:   'Reverse this submission?',
      content: `${sub.item_count} item(s) will be returned to their original pipeline stage and will reappear in the pending list below.`,
      okText:  'Yes, Reverse',
      okButtonProps: { danger: true },
      cancelText: 'Cancel',
      centered: true,
      onOk: async () => {
        setActionLoading(true)
        try {
          const res = await fetch(`/api/loss-control/${sub.id}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action: 'reverse' }),
          })
          const d = await res.json()
          if (!res.ok) throw new Error(d.error ?? `Server error (${res.status})`)
          notification.success({
            message:     'Submission Reversed',
            description: `${d.reversed} item(s) returned to the pending list.`,
            placement:   'topRight',
            duration:    4,
          })
          // Refresh history + page
          const hRes = await fetch('/api/loss-control/history')
          if (hRes.ok) setHistory(await hRes.json())
          router.refresh()
        } catch (err: any) {
          notification.error({ message: 'Reverse failed', description: err.message, placement: 'topRight', duration: 4 })
        } finally {
          setActionLoading(false)
        }
      },
    })
  }

  async function handleResend() {
    if (!resendSub) return
    if (!resendEmail.trim() || !resendEmail.includes('@')) {
      setResendEmailError('Please enter a valid email address')
      return
    }
    setActionLoading(true)
    try {
      const res = await fetch(`/api/loss-control/${resendSub.id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action: 'resend', recipient_email: resendEmail.trim(), cc_emails: resendCc }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? `Server error (${res.status})`)
      setResendSub(null)
      notification.success({
        message:     'Report Resent!',
        description: `${d.resent} item(s) re-sent to Loss Control successfully.`,
        placement:   'topRight',
        duration:    4,
      })
    } catch (err: any) {
      notification.error({ message: 'Resend failed', description: err.message, placement: 'topRight', duration: 4 })
    } finally {
      setActionLoading(false)
    }
  }

  // Row selection
  const rowSelection: TableRowSelection<InventoryItem> = {
    selectedRowKeys: selectedIds,
    onChange: keys => setSelectedIds(keys as string[]),
    selections: [
      Table.SELECTION_ALL,
      Table.SELECTION_NONE,
    ],
  }

  // Send to Loss Control
  async function handleSend() {
    if (!recipientEmail.trim()) {
      setEmailError('Please enter the Loss Control email address')
      return
    }
    if (!recipientEmail.includes('@')) {
      setEmailError('Please enter a valid email address')
      return
    }
    if (!selectedIds.length) return

    setSending(true)
    try {
      const res = await fetch('/api/loss-control', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          item_ids:        selectedIds,
          recipient_email: recipientEmail.trim(),
          cc_emails:       ccEmails,
        }),
      })
      if (!res.ok) {
        let msg = `Server error (${res.status})`
        try { const d = await res.json(); msg = d.error ?? msg } catch {}
        throw new Error(msg)
      }
      const { sent, sheet_logged } = await res.json()
      saveNewEmails([recipientEmail.trim(), ...ccEmails])
      setPreviewOpen(false)
      setSelectedIds([])
      loadHistory()
      notification.success({
        message:     'Report Sent!',
        description: `${sent} item(s) have been reported to Loss Control and moved to the next pipeline stage.`,
        placement:   'topRight',
        duration:    3,
        onClose:     () => router.refresh(),
      })
      if (sheet_logged === false) {
        notification.warning({
          message:     'Sheet Logging Failed',
          description: 'Email sent successfully, but the entry could not be added to the Google Sheet. Please check with your administrator.',
          placement:   'topRight',
          duration:    8,
        })
      }
    } catch (err: any) {
      notification.error({ message: 'Failed to send report', description: err.message, placement: 'topRight', duration: 4 })
    } finally {
      setSending(false)
    }
  }

  const columns: ColumnsType<InventoryItem> = [
    {
      title:  'Description',
      key:    'description',
      width:  200,
      sorter: (a, b) => (a.product?.name ?? '').localeCompare(b.product?.name ?? ''),
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
      title:  'Qty',
      dataIndex: 'quantity',
      width:  70,
      align:  'center',
      render: v => <Text strong>{v}</Text>,
    },
    {
      title:      'Price (₦)',
      dataIndex:  'selling_price',
      width:      120,
      align:      'right',
      responsive: ['md'],
      render:     v => <Text>₦{Number(v).toLocaleString()}</Text>,
    },
    {
      title:      'Amount (₦)',
      key:        'amount',
      width:      140,
      align:      'right',
      responsive: ['md'],
      render: (_, item) => (
        <Text strong>₦{(item.quantity * Number(item.selling_price)).toLocaleString()}</Text>
      ),
    },
    {
      title:  'Expiry',
      key:    'expiry_date',
      width:  130,
      sorter: (a, b) => {
        // Only sort expiry_reported items by date; others sort to bottom
        const aIsExpiry = (a as any).pipeline_stage === 'expiry_reported'
        const bIsExpiry = (b as any).pipeline_stage === 'expiry_reported'
        if (!aIsExpiry && !bIsExpiry) return 0
        if (!aIsExpiry) return 1
        if (!bIsExpiry) return -1
        return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime()
      },
      render: (_, item) => {
        if ((item as any).pipeline_stage !== 'expiry_reported') {
          return <Text type="secondary">—</Text>
        }
        return (
          <Text style={{ color: BRAND.critical, fontWeight: 600 }}>
            {dayjs(item.expiry_date).format('DD MMM YYYY')}
          </Text>
        )
      },
    },
    {
      title:  'Report Type',
      key:    'stage',
      width:  160,
      render: (_, item) => {
        const cfg = STAGE_CONFIG[item.pipeline_stage as string]
        if (!cfg) return null
        return <Tag color={cfg.color} icon={cfg.icon}>{cfg.label}</Tag>
      },
      filters: [
        { text: 'Damage Reported',   value: 'damage_reported'   },
        { text: 'Discount Reported', value: 'discount_reported' },
        { text: 'About to Expire',   value: 'expiry_reported'   },
      ],
      onFilter: (value, item) => item.pipeline_stage === value,
    },
  ]

  return (
    <>
      {/* ── KPI Cards ── */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} md={6}>
          <Card className="kpi-card critical" bordered={false} size="small">
            <Statistic
              title="Damage Reports"
              value={stats.damage}
              suffix="items"
              valueStyle={{ color: BRAND.critical, fontSize: 22, fontWeight: 700 }}
              prefix={<WarningOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card warning" bordered={false} size="small">
            <Statistic
              title="Discount Reports"
              value={stats.discount}
              suffix="items"
              valueStyle={{ color: '#FA8C16', fontSize: 22, fontWeight: 700 }}
              prefix={<TagOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card warning" bordered={false} size="small">
            <Statistic
              title="Expiry Reports"
              value={stats.expiry}
              suffix="items"
              valueStyle={{ color: '#FA8C16', fontSize: 22, fontWeight: 700 }}
              prefix={<ClockCircleOutlined />}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card className="kpi-card critical" bordered={false} size="small">
            <Statistic
              title="Total Value"
              value={`₦${stats.totalAmt.toLocaleString()}`}
              valueStyle={{ color: BRAND.critical, fontSize: 18, fontWeight: 700 }}
            />
          </Card>
        </Col>
      </Row>

      {/* ── Header ── */}
      <Card bordered={false} style={{ borderRadius: 8, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <Title level={5} style={{ margin: 0, color: BRAND.green }}>
              Send to Loss Control
            </Title>
            <Text type="secondary" style={{ fontSize: 12 }}>
              Select items to include in the report, then send to Loss Control for action.
            </Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => router.refresh()}>Refresh</Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              disabled={selectedIds.length === 0}
              onClick={() => {
                if (!canSendToLC) {
                  Modal.error({
                    title:   'Access Denied',
                    content: 'Only Team Leads, Supervisors, and Managers are authorised to send items to Loss Control. Please contact your team lead to action this.',
                    okText:  'Understood',
                    centered: true,
                  })
                  return
                }
                setEmailError('')
                setPreviewOpen(true)
              }}
              style={{ background: BRAND.green }}
            >
              Send Report ({selectedIds.length} selected)
            </Button>
          </Space>
        </div>
      </Card>

      {/* ── Table ── */}
      <Card bordered={false} style={{ borderRadius: 8 }}>
        {items.length === 0 ? (
          <Empty
            description="No pending reports — all items have been sent to Loss Control"
            style={{ padding: '40px 0' }}
          />
        ) : (
          <>
            {selectedIds.length > 0 && (
              <Alert
                type="info"
                showIcon
                message={`${selectedIds.length} item(s) selected · Total value: ₦${selectedItems.reduce((s, i) => s + i.quantity * Number(i.selling_price), 0).toLocaleString()}`}
                style={{ marginBottom: 12, borderRadius: 8 }}
              />
            )}
            <Table<InventoryItem>
              rowSelection={rowSelection}
              dataSource={items}
              columns={columns}
              rowKey="id"
              scroll={{ x: 900 }}
              size="small"
              rowClassName={item => {
                if (item.pipeline_stage === 'damage_reported') return 'row-critical'
                if (item.pipeline_stage === 'expiry_reported') return 'row-warning'
                return ''
              }}
              pagination={{
                pageSize: 20,
                showSizeChanger: true,
                showTotal: (total, range) => `${range[0]}–${range[1]} of ${total} pending items`,
              }}
              summary={pageData => {
                const totalQty = pageData.reduce((s, i) => s + i.quantity, 0)
                const totalAmt = pageData.reduce((s, i) => s + i.quantity * Number(i.selling_price), 0)
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
                      <Text strong style={{ color: BRAND.critical }}>₦{totalAmt.toLocaleString()}</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} colSpan={2} />
                  </Table.Summary.Row>
                )
              }}
            />
          </>
        )}
      </Card>

      {/* ── Send Preview Modal ── */}
      <Modal
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        title={
          <Space>
            <FileExcelOutlined style={{ color: BRAND.green }} />
            <span>Preview & Send to Loss Control</span>
          </Space>
        }
        footer={
          <Space>
            <Button onClick={() => setPreviewOpen(false)}>Cancel</Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={sending}
              onClick={handleSend}
              style={{ background: BRAND.green }}
            >
              Confirm & Send
            </Button>
          </Space>
        }
        width={820}
      >
        <Alert
          type="info"
          showIcon
          message={`${selectedIds.length} item(s) will be compiled into an Excel report and emailed to Loss Control.`}
          style={{ marginBottom: 16, borderRadius: 8 }}
        />

        {/* To */}
        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ display: 'block', marginBottom: 6 }}>To</Text>
          <AutoComplete
            style={{ width: '100%' }}
            options={allEmailOptions.filter(o =>
              !recipientEmail || o.value.toLowerCase().includes(recipientEmail.toLowerCase())
            )}
            value={recipientEmail}
            onChange={v => { setRecipientEmail(v); setEmailError('') }}
            placeholder="e.g. losscontrol@foodco.com"
            status={emailError ? 'error' : undefined}
          />
          {emailError && (
            <Text type="danger" style={{ fontSize: 12 }}>{emailError}</Text>
          )}
        </div>

        {/* Cc */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 6 }}>
            Cc <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>(optional — select or type, press Enter to add)</Text>
          </Text>
          <Select
            mode="tags"
            style={{ width: '100%' }}
            placeholder="e.g. manager@foodco.com"
            value={ccEmails}
            onChange={vals => setCcEmails(vals)}
            tokenSeparators={[',']}
            options={allEmailOptions}
            filterOption={(input, option) =>
              (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
            }
          />
        </div>

        {/* Preview table — mirrors exact Excel columns */}
        <div style={{ overflowX: 'auto', maxHeight: 340, overflowY: 'auto', border: '1px solid #e8e8e8', borderRadius: 6 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              {/* Brand header bar — matches Excel */}
              <tr style={{ background: BRAND.green, color: '#fff' }}>
                <td colSpan={7} style={{ padding: '5px 10px', fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>
                  FOODCO ARULOGUN &nbsp;·&nbsp;{
                    (() => {
                      const stages = [...new Set(selectedItems.map(i => i.pipeline_stage as string))]
                      if (stages.length === 1) {
                        if (stages[0] === 'damage_reported')   return 'DAMAGE REPORT'
                        if (stages[0] === 'discount_reported') return 'DISCOUNT REPORT'
                        if (stages[0] === 'expiry_reported')   return 'ABOUT TO EXPIRE REPORT'
                      }
                      return 'LOSS CONTROL REPORT'
                    })()
                  }
                </td>
              </tr>
              {/* Column headers */}
              <tr style={{ background: '#1b5e20', color: '#fff' }}>
                <th style={{ padding: '6px 8px', textAlign: 'left',   whiteSpace: 'nowrap' }}>Description</th>
                <th style={{ padding: '6px 8px', textAlign: 'left',   whiteSpace: 'nowrap' }}>Barcode</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>Qty</th>
                <th style={{ padding: '6px 8px', textAlign: 'right',  whiteSpace: 'nowrap' }}>Price (₦)</th>
                <th style={{ padding: '6px 8px', textAlign: 'right',  whiteSpace: 'nowrap' }}>Amount (₦)</th>
                <th style={{ padding: '6px 8px', textAlign: 'left',   whiteSpace: 'nowrap' }}>Reason</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>Expiry Date</th>
              </tr>
            </thead>
            <tbody>
              {selectedItems.map((item, i) => {
                const price      = Number(item.selling_price)
                const amount     = item.quantity * price
                const isExpiry   = item.pipeline_stage === 'expiry_reported'
                const isDamage   = item.pipeline_stage === 'damage_reported'
                const isDiscount = item.pipeline_stage === 'discount_reported'
                const reason     = isExpiry   ? 'About to Expire'
                                 : isDamage   ? ((item as any).damage_records?.[0]?.reason ?? 'Damaged')
                                 : isDiscount ? ((item as any).discounts?.[0]?.name ?? (item as any).discounts?.[0]?.discount_type ?? 'Discounted')
                                 : '—'
                const expiryDate = isExpiry && item.expiry_date
                  ? dayjs(item.expiry_date).format('DD MMM YYYY')
                  : '—'
                return (
                  <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#f6f9f6' }}>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>
                      {item.product?.name ?? '—'}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', fontFamily: 'monospace', color: '#555' }}>
                      {item.product?.sku ?? '—'}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>
                      {item.quantity}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>
                      ₦{price.toLocaleString()}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontWeight: 600 }}>
                      ₦{amount.toLocaleString()}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', color: '#555' }}>
                      {reason}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center',
                                 color: isExpiry ? BRAND.critical : '#bbb', fontWeight: isExpiry ? 600 : 400 }}>
                      {expiryDate}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f0f0f0', fontWeight: 700 }}>
                <td style={{ padding: '6px 8px' }}>TOTALS</td>
                <td />
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  {selectedItems.reduce((s, i) => s + i.quantity, 0)} units
                </td>
                <td />
                <td style={{ padding: '6px 8px', textAlign: 'right', color: BRAND.critical }}>
                  ₦{selectedItems.reduce((s, i) => s + i.quantity * Number(i.selling_price), 0).toLocaleString()}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Modal>

      {/* ── Submission History ── */}
      <Card
        bordered={false}
        style={{ borderRadius: 8, marginTop: 24 }}
        title={
          <Space>
            <HistoryOutlined style={{ color: BRAND.green }} />
            <span style={{ color: BRAND.green, fontWeight: 700 }}>Submission History</span>
            <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>Last 5 sends</Text>
          </Space>
        }
        extra={
          <Button
            size="small" icon={<ReloadOutlined />}
            loading={historyLoading}
            onClick={loadHistory}
          >
            Refresh
          </Button>
        }
      >
        {historyLoading ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>Loading history…</div>
        ) : history.length === 0 ? (
          <Empty description="No submissions yet" style={{ padding: '24px 0' }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {history.map((sub, idx) => (
              <div key={sub.id} style={{
                border: '1px solid #e8e8e8', borderRadius: 8, padding: '12px 16px',
                background: idx === 0 ? '#f6fbf6' : '#fafafa',
                display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
              }}>
                {/* Left — info */}
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Space wrap size={4}>
                    <Tag color="green" style={{ fontWeight: 600 }}>#{history.length - idx}</Tag>
                    <Text strong style={{ fontSize: 13 }}>
                      {dayjs(sub.created_at).format('DD MMM YYYY, h:mm A')}
                    </Text>
                    {sub.sender?.full_name && (
                      <Text type="secondary" style={{ fontSize: 12 }}>by {sub.sender.full_name}</Text>
                    )}
                  </Space>
                  <div style={{ marginTop: 4 }}>
                    <Space size={16} wrap>
                      <Text style={{ fontSize: 12 }}>
                        <Text type="secondary">To: </Text>{sub.recipient_email}
                      </Text>
                      <Text style={{ fontSize: 12 }}>
                        <Text type="secondary">Items: </Text><strong>{sub.item_count}</strong>
                      </Text>
                      <Text style={{ fontSize: 12 }}>
                        <Text type="secondary">Value: </Text>
                        <strong style={{ color: BRAND.critical }}>₦{Number(sub.total_value).toLocaleString()}</strong>
                      </Text>
                    </Space>
                  </div>
                </div>
                {/* Right — actions */}
                <Space>
                  <Button
                    size="small" icon={<EyeOutlined />}
                    onClick={() => setReviewSub(sub)}
                  >
                    Review
                  </Button>
                  <Button
                    size="small" icon={<RollbackOutlined />} danger
                    loading={actionLoading}
                    onClick={() => handleReverse(sub)}
                  >
                    Reverse
                  </Button>
                  <Button
                    size="small" icon={<RedoOutlined />} type="primary"
                    style={{ background: BRAND.green }}
                    onClick={() => {
                      setResendSub(sub)
                      setResendEmail(sub.recipient_email)
                      setResendCc(sub.cc_emails ?? [])
                      setResendEmailError('')
                    }}
                  >
                    Resend
                  </Button>
                </Space>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Review Modal ── */}
      <Modal
        open={!!reviewSub}
        onCancel={() => setReviewSub(null)}
        footer={<Button onClick={() => setReviewSub(null)}>Close</Button>}
        title={
          <Space>
            <EyeOutlined style={{ color: BRAND.green }} />
            <span>Submission Review — {reviewSub ? dayjs(reviewSub.created_at).format('DD MMM YYYY, h:mm A') : ''}</span>
          </Space>
        }
        width={760}
      >
        {reviewSub && (
          <>
            <Space style={{ marginBottom: 12 }} wrap>
              <Text><Text type="secondary">To: </Text>{reviewSub.recipient_email}</Text>
              {reviewSub.cc_emails?.length > 0 && (
                <Text><Text type="secondary">Cc: </Text>{reviewSub.cc_emails.join(', ')}</Text>
              )}
              <Text><Text type="secondary">Sent by: </Text>{reviewSub.sender?.full_name ?? '—'}</Text>
            </Space>
            <div style={{ overflowX: 'auto', border: '1px solid #e8e8e8', borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 580 }}>
                <thead>
                  <tr style={{ background: BRAND.green, color: '#fff' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Description</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Barcode</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Qty</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Price (₦)</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount (₦)</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Reason</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Expiry Date</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewSub.items_snapshot.map((item, i) => {
                    const amount     = item.qty * item.price
                    const isExpiry   = item.original_stage === 'expiry_reported'
                    const expiryDate = isExpiry && item.expiry_date
                      ? dayjs(item.expiry_date).format('DD MMM YYYY') : '—'
                    return (
                      <tr key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#f6f9f6' }}>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', fontWeight: 600 }}>{item.name}</td>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', fontFamily: 'monospace', color: '#555' }}>{item.sku || '—'}</td>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center' }}>{item.qty}</td>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'right' }}>₦{item.price.toLocaleString()}</td>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'right', fontWeight: 600 }}>₦{amount.toLocaleString()}</td>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0' }}>{item.reason}</td>
                        <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f0f0', textAlign: 'center',
                                     color: isExpiry ? BRAND.critical : '#bbb', fontWeight: isExpiry ? 600 : 400 }}>
                          {expiryDate}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f0f0f0', fontWeight: 700 }}>
                    <td style={{ padding: '6px 8px' }}>TOTALS</td>
                    <td /><td style={{ padding: '6px 8px', textAlign: 'center' }}>
                      {reviewSub.items_snapshot.reduce((s, i) => s + i.qty, 0)} units
                    </td>
                    <td />
                    <td style={{ padding: '6px 8px', textAlign: 'right', color: BRAND.critical }}>
                      ₦{Number(reviewSub.total_value).toLocaleString()}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </Modal>

      {/* ── Resend Modal ── */}
      <Modal
        open={!!resendSub}
        onCancel={() => setResendSub(null)}
        title={
          <Space>
            <RedoOutlined style={{ color: BRAND.green }} />
            <span>Resend to Loss Control</span>
          </Space>
        }
        footer={
          <Space>
            <Button onClick={() => setResendSub(null)}>Cancel</Button>
            <Button
              type="primary" icon={<SendOutlined />}
              loading={actionLoading}
              onClick={handleResend}
              style={{ background: BRAND.green }}
            >
              Confirm & Resend
            </Button>
          </Space>
        }
        width={500}
      >
        {resendSub && (
          <>
            <Alert
              type="info" showIcon
              message={`${resendSub.item_count} item(s) from the original submission will be compiled and resent. Pipeline stages will not change.`}
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>To</Text>
              <AutoComplete
                style={{ width: '100%' }}
                options={allEmailOptions.filter(o =>
                  !resendEmail || o.value.toLowerCase().includes(resendEmail.toLowerCase())
                )}
                value={resendEmail}
                onChange={v => { setResendEmail(v); setResendEmailError('') }}
                placeholder="Loss Control email"
                status={resendEmailError ? 'error' : undefined}
              />
              {resendEmailError && <Text type="danger" style={{ fontSize: 12 }}>{resendEmailError}</Text>}
            </div>
            <div>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>
                Cc <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>(optional)</Text>
              </Text>
              <Select
                mode="tags" style={{ width: '100%' }}
                placeholder="e.g. manager@foodco.com"
                value={resendCc} onChange={vals => setResendCc(vals)}
                tokenSeparators={[',']} options={allEmailOptions}
                filterOption={(input, option) =>
                  (option?.value ?? '').toLowerCase().includes(input.toLowerCase())
                }
              />
            </div>
          </>
        )}
      </Modal>
    </>
  )
}

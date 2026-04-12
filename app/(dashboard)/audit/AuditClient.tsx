'use client'

import { useState, useCallback } from 'react'
import {
  Table, Tag, Space, Typography, Select, DatePicker, Input, Button, Row, Col, Card, Statistic, Tooltip,
} from 'antd'
import { SearchOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { BRAND } from '@/lib/constants'

dayjs.extend(relativeTime)

const { Title, Text } = Typography
const { RangePicker } = DatePicker

interface AuditLog {
  id: string
  created_at: string
  user_id: string | null
  module: string
  action: string
  entity_id: string | null
  entity_label: string | null
  details: Record<string, unknown> | null
  actor?: { full_name: string } | null
}

const MODULE_COLOR: Record<string, string> = {
  inventory:    'green',
  damage:       'orange',
  discounts:    'blue',
  users:        'purple',
  reports:      'cyan',
  alerts:       'volcano',
  loss_control: 'gold',
}

const ACTION_COLOR: Record<string, string> = {
  create:       'green',
  approve:      'cyan',
  reject:       'red',
  cancel:       'default',
  delete:       'red',
  stage_change: 'blue',
  update:       'geekblue',
  invite:       'purple',
}

const MODULE_OPTIONS = [
  { value: '', label: 'All Modules' },
  { value: 'inventory',    label: 'Inventory' },
  { value: 'damage',       label: 'Damage' },
  { value: 'discounts',    label: 'Discounts' },
  { value: 'users',        label: 'Users' },
  { value: 'reports',      label: 'Reports' },
  { value: 'alerts',       label: 'Alerts' },
  { value: 'loss_control', label: 'Loss Control' },
]

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'create',       label: 'Create' },
  { value: 'update',       label: 'Update' },
  { value: 'delete',       label: 'Delete' },
  { value: 'approve',      label: 'Approve' },
  { value: 'reject',       label: 'Reject' },
  { value: 'cancel',       label: 'Cancel' },
  { value: 'stage_change', label: 'Stage Change' },
  { value: 'invite',       label: 'Invite' },
]

const PAGE_SIZE = 50

export default function AuditClient({
  initialData,
  initialTotal,
}: {
  initialData: AuditLog[]
  initialTotal: number
}) {
  const [logs,      setLogs]      = useState<AuditLog[]>(initialData)
  const [total,     setTotal]     = useState(initialTotal)
  const [page,      setPage]      = useState(1)
  const [loading,   setLoading]   = useState(false)
  const [module,    setModule]    = useState('')
  const [action,    setAction]    = useState('')
  const [search,    setSearch]    = useState('')
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null])

  const fetchLogs = useCallback(async (opts: {
    page: number
    module: string
    action: string
    search: string
    dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null]
  }) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(opts.page) })
      if (opts.module) params.set('module', opts.module)
      if (opts.action) params.set('action', opts.action)
      if (opts.search) params.set('search', opts.search)
      if (opts.dateRange[0]) params.set('from', opts.dateRange[0].format('YYYY-MM-DD'))
      if (opts.dateRange[1]) params.set('to',   opts.dateRange[1].format('YYYY-MM-DD'))

      const res  = await fetch(`/api/audit?${params.toString()}`)
      const json = await res.json()
      setLogs(json.data ?? [])
      setTotal(json.total ?? 0)
    } finally {
      setLoading(false)
    }
  }, [])

  function handleFilter() {
    const newPage = 1
    setPage(newPage)
    fetchLogs({ page: newPage, module, action, search, dateRange })
  }

  function handleReset() {
    setModule('')
    setAction('')
    setSearch('')
    setDateRange([null, null])
    setPage(1)
    fetchLogs({ page: 1, module: '', action: '', search: '', dateRange: [null, null] })
  }

  function handlePageChange(newPage: number) {
    setPage(newPage)
    fetchLogs({ page: newPage, module, action, search, dateRange })
  }

  // KPI stats from current loaded page
  const today = dayjs().format('YYYY-MM-DD')
  const todayLogs = logs.filter(l => l.created_at.startsWith(today))
  const uniqueUsersToday = new Set(todayLogs.map(l => l.user_id)).size
  const moduleCounts = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.module] = (acc[l.module] ?? 0) + 1
    return acc
  }, {})
  const topModule = Object.entries(moduleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

  async function handleExport() {
    const params = new URLSearchParams({ page: '1' })
    if (module) params.set('module', module)
    if (action) params.set('action', action)
    if (search) params.set('search', search)
    if (dateRange[0]) params.set('from', dateRange[0].format('YYYY-MM-DD'))
    if (dateRange[1]) params.set('to',   dateRange[1].format('YYYY-MM-DD'))
    // Fetch all (up to 500)
    params.set('page', '1')
    const res  = await fetch(`/api/audit?${params.toString()}`)
    const json = await res.json()
    const rows: AuditLog[] = json.data ?? []

    const headers = ['Timestamp', 'User', 'Module', 'Action', 'Entity', 'Details']
    const csvRows = rows.map(l => [
      dayjs(l.created_at).format('YYYY-MM-DD HH:mm:ss'),
      l.actor?.full_name ?? l.user_id ?? 'System',
      l.module,
      l.action,
      l.entity_label ?? l.entity_id ?? '',
      l.details ? JSON.stringify(l.details) : '',
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))

    const csv  = [headers.join(','), ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `audit-trail-${dayjs().format('YYYY-MM-DD')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const columns: ColumnsType<AuditLog> = [
    {
      title: 'Timestamp',
      dataIndex: 'created_at',
      width: 160,
      render: (v: string) => (
        <Tooltip title={dayjs(v).format('DD MMM YYYY, HH:mm:ss')}>
          <Text style={{ fontSize: 12 }}>{dayjs(v).fromNow()}</Text>
        </Tooltip>
      ),
    },
    {
      title: 'User',
      key: 'user',
      width: 140,
      render: (_: unknown, r: AuditLog) => (
        <Text style={{ fontSize: 12 }}>{r.actor?.full_name ?? r.user_id ?? 'System'}</Text>
      ),
    },
    {
      title: 'Module',
      dataIndex: 'module',
      width: 110,
      render: (v: string) => (
        <Tag color={MODULE_COLOR[v] ?? 'default'} style={{ textTransform: 'capitalize', fontSize: 11 }}>
          {v.replace('_', ' ')}
        </Tag>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      width: 110,
      render: (v: string) => (
        <Tag color={ACTION_COLOR[v] ?? 'default'} style={{ textTransform: 'capitalize', fontSize: 11 }}>
          {v.replace('_', ' ')}
        </Tag>
      ),
    },
    {
      title: 'Entity',
      dataIndex: 'entity_label',
      render: (v: string | null, r: AuditLog) => (
        <Text style={{ fontSize: 12 }}>{v ?? r.entity_id ?? '—'}</Text>
      ),
    },
    {
      title: 'Details',
      dataIndex: 'details',
      width: 200,
      render: (v: Record<string, unknown> | null) => {
        if (!v) return <Text type="secondary" style={{ fontSize: 11 }}>—</Text>
        return (
          <Text code style={{ fontSize: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(v, null, 2)}
          </Text>
        )
      },
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={3} style={{ color: BRAND.green, margin: 0 }}>Audit Trail</Title>
        <Text type="secondary">Full record of all actions taken across the system</Text>
      </div>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={8}>
          <Card bordered={false} className="kpi-card success" size="small">
            <Statistic title="Total Records" value={total} valueStyle={{ color: BRAND.green, fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card bordered={false} className="kpi-card success" size="small">
            <Statistic title="Actions Today" value={todayLogs.length} valueStyle={{ color: BRAND.green, fontWeight: 700 }} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card bordered={false} className="kpi-card warning" size="small">
            <Statistic title="Most Active Module" value={topModule} valueStyle={{ color: '#b8860b', textTransform: 'capitalize', fontSize: 20, fontWeight: 700 }} />
          </Card>
        </Col>
      </Row>

      {/* Filters */}
      <Card style={{ marginBottom: 16 }}>
        <Row gutter={[8, 8]} align="middle">
          <Col xs={12} sm={6} lg={4}>
            <Select
              value={module}
              onChange={setModule}
              options={MODULE_OPTIONS}
              style={{ width: '100%' }}
              placeholder="Module"
            />
          </Col>
          <Col xs={12} sm={6} lg={4}>
            <Select
              value={action}
              onChange={setAction}
              options={ACTION_OPTIONS}
              style={{ width: '100%' }}
              placeholder="Action"
            />
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <RangePicker
              value={dateRange}
              onChange={v => setDateRange(v ? [v[0], v[1]] : [null, null])}
              style={{ width: '100%' }}
            />
          </Col>
          <Col xs={24} sm={12} lg={5}>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search entity…"
              prefix={<SearchOutlined />}
              style={{ width: '100%' }}
              onPressEnter={handleFilter}
            />
          </Col>
          <Col xs={24} sm={12} lg={5}>
            <Space wrap>
              <Button type="primary" onClick={handleFilter} style={{ background: BRAND.green }}>
                Filter
              </Button>
              <Button icon={<ReloadOutlined />} onClick={handleReset}>
                Reset
              </Button>
              <Button icon={<DownloadOutlined />} onClick={handleExport}>
                Export
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Table */}
      <Table<AuditLog>
        dataSource={logs}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{
          current:  page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: (t) => `${t} records`,
          onChange:  handlePageChange,
          showSizeChanger: false,
        }}
        scroll={{ x: 900 }}
      />
    </div>
  )
}

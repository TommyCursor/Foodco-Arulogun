'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Typography, Row, Col, Card, Button, Table, Upload, Tag,
  DatePicker, Space, message, Spin, Empty, Divider, Popconfirm,
  Modal, Input,
} from 'antd'
import {
  BarChartOutlined, DeleteOutlined, FileExcelOutlined,
  CalendarOutlined, InfoCircleOutlined, RiseOutlined,
  ExclamationCircleOutlined, FundOutlined, ShopOutlined,
} from '@ant-design/icons'
import ReactECharts from 'echarts-for-react'
import dayjs, { Dayjs } from 'dayjs'
import { BRAND } from '@/lib/constants'

const { Title, Text } = Typography
const { RangePicker } = DatePicker
const { TextArea } = Input

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
interface SalesUpload {
  id:          string
  file_name:   string
  period_from: string | null
  period_to:   string | null
  row_count:   number
  notes:       string | null
  created_at:  string
  file_type:   'department' | 'item' | null
  uploaded_by: { full_name: string } | null
}

interface SalesRecord {
  id:           string
  sale_date:    string
  product_name: string
  sku:          string | null
  quantity:     number
  unit_price:   number
  total_amount: number
  category:     string | null
  cashier:      string | null
  cost:         number | null
  profit:       number | null
  margin_pct:   number | null
}

interface ItemStat {
  name:            string
  revenue:         number
  cost:            number
  profit:          number
  qty:             number
  category:        string | null
  sku:             string | null
  effectiveMargin: number
}

interface Props {
  initialUploads: SalesUpload[]
}

// ─────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────
export default function SalesClient({ initialUploads }: Props) {
  const router = useRouter()

  const [uploads, setUploads]           = useState<SalesUpload[]>(initialUploads)
  const [uploading, setUploading]       = useState(false)
  const [activeUpload, setActiveUpload] = useState<SalesUpload | null>(null)
  const [records, setRecords]           = useState<SalesRecord[]>([])
  const [loadingData, setLoadingData]   = useState(false)
  const [dateRange, setDateRange]       = useState<[Dayjs, Dayjs] | null>(null)
  const [noteModal, setNoteModal]       = useState(false)
  const [noteText, setNoteText]         = useState('')
  const [pendingFile, setPendingFile]   = useState<File | null>(null)

  const isItemMode = activeUpload?.file_type === 'item'
  const isDeptMode = !isItemMode

  // ── Filtered records ─────────────────────────────────────────
  const filtered = dateRange
    ? records.filter(r => {
        const d = dayjs(r.sale_date)
        return d.isAfter(dateRange[0].subtract(1, 'day')) && d.isBefore(dateRange[1].add(1, 'day'))
      })
    : records

  // ── Shared KPIs ──────────────────────────────────────────────
  const totalRevenue = filtered.reduce((s, r) => s + Number(r.total_amount), 0)
  const totalUnits   = filtered.reduce((s, r) => s + Number(r.quantity), 0)
  const hasCostData  = filtered.some(r => r.cost != null && Number(r.cost) !== 0)
  const totalCost    = hasCostData ? filtered.reduce((s, r) => s + Number(r.cost   ?? 0), 0) : null
  const totalProfit  = hasCostData ? filtered.reduce((s, r) => s + Number(r.profit ?? 0), 0) : null
  const avgMargin    = hasCostData && totalRevenue > 0
    ? ((totalRevenue - (totalCost ?? 0)) / totalRevenue) * 100 : null

  // ── Department mode computations ─────────────────────────────
  const dailyMap: Record<string, number> = {}
  filtered.forEach(r => {
    if (r.sale_date) dailyMap[r.sale_date] = (dailyMap[r.sale_date] ?? 0) + Number(r.total_amount)
  })
  const dailyDates  = Object.keys(dailyMap).sort()
  const dailyValues = dailyDates.map(d => Number(dailyMap[d].toFixed(2)))
  const isMultiDate = dailyDates.length > 1
  const uniqueDays  = Math.max(dailyDates.length, 1)
  const avgDaily    = totalRevenue / uniqueDays

  const topItemsMap: Record<string, number> = {}
  filtered.forEach(r => {
    topItemsMap[r.product_name] = (topItemsMap[r.product_name] ?? 0) + Number(r.total_amount)
  })
  const topItems      = Object.entries(topItemsMap).sort((a, b) => b[1] - a[1]).slice(0, 15)
  const topItemNames  = topItems.map(([n]) => n).reverse()
  const topItemValues = topItems.map(([, v]) => Number(v.toFixed(0))).reverse()
  const topProduct    = topItems[0]?.[0] ?? '—'

  const hasCats = filtered.some(r => r.category)
  const deptMap: Record<string, { revenue: number; cost: number; profit: number }> = {}
  filtered.forEach(r => {
    const key = r.category || r.product_name
    if (!deptMap[key]) deptMap[key] = { revenue: 0, cost: 0, profit: 0 }
    deptMap[key].revenue += Number(r.total_amount)
    deptMap[key].cost    += Number(r.cost   ?? 0)
    deptMap[key].profit  += Number(r.profit ?? 0)
  })
  const deptNames = Object.keys(deptMap).sort((a, b) => deptMap[b].revenue - deptMap[a].revenue).slice(0, 12)

  const categoryMap: Record<string, number> = {}
  filtered.forEach(r => {
    if (r.category) categoryMap[r.category] = (categoryMap[r.category] ?? 0) + Number(r.total_amount)
  })
  const categoryData = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))

  // ── Item mode computations ────────────────────────────────────
  const itemAgg: Record<string, { revenue: number; cost: number; profit: number; qty: number; category: string | null; sku: string | null }> = {}
  filtered.forEach(r => {
    const k = r.product_name
    if (!itemAgg[k]) itemAgg[k] = { revenue: 0, cost: 0, profit: 0, qty: 0, category: r.category, sku: r.sku }
    itemAgg[k].revenue += Number(r.total_amount)
    itemAgg[k].cost    += Number(r.cost   ?? 0)
    itemAgg[k].profit  += Number(r.profit ?? 0)
    itemAgg[k].qty     += Number(r.quantity)
    if (!itemAgg[k].category && r.category) itemAgg[k].category = r.category
    if (!itemAgg[k].sku && r.sku) itemAgg[k].sku = r.sku
  })
  const itemsArr: ItemStat[] = Object.entries(itemAgg)
    .map(([name, s]) => ({
      name, ...s,
      effectiveMargin: s.revenue > 0 ? ((s.revenue - s.cost) / s.revenue) * 100 : 0,
    }))
    .filter(i => i.revenue > 0)

  const uniqueItems = itemsArr.length

  // Forecast
  const periodDays = activeUpload?.period_from && activeUpload?.period_to
    ? dayjs(activeUpload.period_to).diff(dayjs(activeUpload.period_from), 'day') + 1
    : uniqueDays
  const dailyRev  = totalRevenue / Math.max(periodDays, 1)
  const dailyProf = (totalProfit ?? 0) / Math.max(periodDays, 1)
  const dailyCost = (totalCost ?? 0) / Math.max(periodDays, 1)

  // Improvement rules
  const avgQty = itemsArr.length > 0 ? itemsArr.reduce((s, i) => s + i.qty, 0) / itemsArr.length : 0
  const lossMakers       = itemsArr.filter(i => i.profit < 0).sort((a, b) => a.profit - b.profit).slice(0, 8)
  const lowMargin        = itemsArr.filter(i => i.profit >= 0 && i.effectiveMargin < 15 && i.revenue > 500).sort((a, b) => b.revenue - a.revenue).slice(0, 8)
  const highVolLowMargin = itemsArr.filter(i => i.qty > avgQty && i.effectiveMargin < 20 && i.profit >= 0).sort((a, b) => b.qty - a.qty).slice(0, 8)
  const stars            = itemsArr.filter(i => i.profit > 0).sort((a, b) => b.profit - a.profit).slice(0, 8)

  // Top 15 by profit
  const topProfitItems  = [...itemsArr].sort((a, b) => b.profit - a.profit).slice(0, 15)
  const topProfitNames  = topProfitItems.map(i => i.name).reverse()
  const topProfitValues = topProfitItems.map(i => Number(i.profit.toFixed(0))).reverse()

  // Margin distribution: top 20 items by revenue
  const marginItems = [...itemsArr].sort((a, b) => b.revenue - a.revenue).slice(0, 20)

  // ── ECharts: Department mode ──────────────────────────────────
  const dailyBarOption = {
    tooltip: { trigger: 'axis', formatter: (p: any) => `${p[0].axisValue}<br/>₦${Number(p[0].value).toLocaleString()}` },
    grid: { left: 60, right: 20, top: 10, bottom: 60 },
    xAxis: { type: 'category', data: dailyDates, axisLabel: { rotate: 45, fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `₦${(v / 1000).toFixed(0)}k` } },
    series: [{ data: dailyValues, type: 'bar', itemStyle: { color: BRAND.green }, barMaxWidth: 40 }],
  }

  const deptTopItemsOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (p: any) => `${p[0].name}<br/>₦${Number(p[0].value).toLocaleString()}` },
    grid: { left: 185, right: 40, top: 8, bottom: 30 },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => `₦${(v / 1000).toFixed(0)}k`, fontSize: 10 } },
    yAxis: { type: 'category', data: topItemNames, axisLabel: { fontSize: 10, width: 170, overflow: 'truncate' as const } },
    series: [{ data: topItemValues, type: 'bar', itemStyle: { color: BRAND.green }, barMaxWidth: 28 }],
  }

  const deptCompareOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => params[0].axisValue + '<br/>' +
        params.map((p: any) => `${p.marker}${p.seriesName}: ₦${Number(p.value).toLocaleString()}`).join('<br/>'),
    },
    legend: { data: ['Revenue', 'Cost', 'Profit'], top: 0, textStyle: { fontSize: 11 } },
    grid: { left: 60, right: 20, top: 30, bottom: 65 },
    xAxis: { type: 'category', data: deptNames, axisLabel: { rotate: 35, fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `₦${(v / 1000).toFixed(0)}k` } },
    series: [
      { name: 'Revenue', type: 'bar', data: deptNames.map(d => Number(deptMap[d].revenue.toFixed(0))), itemStyle: { color: BRAND.green } },
      { name: 'Cost',    type: 'bar', data: deptNames.map(d => Number(deptMap[d].cost.toFixed(0))),    itemStyle: { color: '#FF7043' } },
      { name: 'Profit',  type: 'bar', data: deptNames.map(d => Number(deptMap[d].profit.toFixed(0))),  itemStyle: { color: '#1565C0' } },
    ],
  }

  const pieOption = {
    tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}<br/>₦${Number(p.value).toLocaleString()} (${p.percent}%)` },
    legend: { orient: 'vertical', left: 'left', top: 'center', textStyle: { fontSize: 10 } },
    series: [{
      type: 'pie', radius: ['45%', '75%'], center: ['65%', '50%'],
      data: categoryData, label: { show: false },
      itemStyle: { borderWidth: 2, borderColor: '#fff' },
    }],
  }

  // ── ECharts: Item mode ────────────────────────────────────────
  const itemTopRevOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (p: any) => `${p[0].name}<br/>₦${Number(p[0].value).toLocaleString()}` },
    grid: { left: 185, right: 40, top: 8, bottom: 30 },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => `₦${(v / 1000).toFixed(0)}k`, fontSize: 10 } },
    yAxis: { type: 'category', data: topItemNames, axisLabel: { fontSize: 10, width: 170, overflow: 'truncate' as const } },
    series: [{ data: topItemValues, type: 'bar', itemStyle: { color: BRAND.green }, barMaxWidth: 28 }],
  }

  const itemTopProfitOption = {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (p: any) => `${p[0].name}<br/>₦${Number(p[0].value).toLocaleString()}` },
    grid: { left: 185, right: 40, top: 8, bottom: 30 },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => `₦${(v / 1000).toFixed(0)}k`, fontSize: 10 } },
    yAxis: { type: 'category', data: topProfitNames, axisLabel: { fontSize: 10, width: 170, overflow: 'truncate' as const } },
    series: [{
      data: topProfitValues.map(v => ({
        value: v,
        itemStyle: { color: v >= 0 ? '#00695C' : '#D32F2F' },
      })),
      type: 'bar', barMaxWidth: 28,
    }],
  }

  const marginDistOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (p: any) => {
        const item = marginItems.find(i => i.name === p[0].name)
        return `${p[0].name}<br/>Margin: ${Number(p[0].value).toFixed(1)}%<br/>Revenue: ₦${item?.revenue.toLocaleString() ?? ''}`
      },
    },
    grid: { left: 50, right: 20, top: 10, bottom: 85 },
    xAxis: { type: 'category', data: marginItems.map(i => i.name), axisLabel: { rotate: 42, fontSize: 9, width: 80, overflow: 'truncate' as const } },
    yAxis: { type: 'value', name: 'Margin %', axisLabel: { formatter: (v: number) => `${v}%` } },
    series: [{
      type: 'bar', barMaxWidth: 36,
      data: marginItems.map(i => ({
        value: Number(i.effectiveMargin.toFixed(1)),
        itemStyle: {
          color: i.effectiveMargin < 0   ? '#D32F2F'
               : i.effectiveMargin < 12  ? '#FF7043'
               : i.effectiveMargin < 20  ? '#FFC107'
               : BRAND.green,
        },
      })),
    }],
  }

  const forecastOption = {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => params[0].axisValue + '<br/>' +
        params.map((p: any) => `${p.marker}${p.seriesName}: ₦${Number(p.value).toLocaleString()}`).join('<br/>'),
    },
    legend: { data: ['Revenue', 'Profit'], top: 0 },
    grid: { left: 75, right: 20, top: 32, bottom: 30 },
    xAxis: {
      type: 'category',
      data: [`Actual (${periodDays}d)`, 'Proj. 7 days', 'Proj. 30 days', 'Proj. 90 days'],
    },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `₦${(v / 1_000_000).toFixed(1)}M` } },
    series: [
      {
        name: 'Revenue', type: 'bar', barGap: '8%',
        data: [
          { value: Math.round(totalRevenue),       itemStyle: { color: BRAND.green, opacity: 1.0 } },
          { value: Math.round(dailyRev * 7),        itemStyle: { color: BRAND.green, opacity: 0.80 } },
          { value: Math.round(dailyRev * 30),       itemStyle: { color: BRAND.green, opacity: 0.60 } },
          { value: Math.round(dailyRev * 90),       itemStyle: { color: BRAND.green, opacity: 0.40 } },
        ],
      },
      {
        name: 'Profit', type: 'bar',
        data: [
          { value: Math.round(totalProfit ?? 0),    itemStyle: { color: '#1565C0', opacity: 1.0 } },
          { value: Math.round(dailyProf * 7),        itemStyle: { color: '#1565C0', opacity: 0.80 } },
          { value: Math.round(dailyProf * 30),       itemStyle: { color: '#1565C0', opacity: 0.60 } },
          { value: Math.round(dailyProf * 90),       itemStyle: { color: '#1565C0', opacity: 0.40 } },
        ],
      },
    ],
  }

  // ── Handlers ─────────────────────────────────────────────────
  const handleUpload = useCallback((file: File) => {
    setPendingFile(file)
    setNoteText('')
    setNoteModal(true)
    return false
  }, [])

  const submitUpload = async () => {
    if (!pendingFile) return
    setUploading(true)
    setNoteModal(false)
    const fd = new FormData()
    fd.append('file', pendingFile)
    if (noteText) fd.append('notes', noteText)
    try {
      const res  = await fetch('/api/sales/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      message.success(`Uploaded ${data.row_count} records successfully`)
      router.refresh()
      const listData = await fetch('/api/sales').then(r => r.json())
      setUploads(listData)
      setActiveUpload(data.upload)
      fetchRecords(data.upload.id)
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setUploading(false)
      setPendingFile(null)
    }
  }

  const fetchRecords = async (uploadId: string) => {
    setLoadingData(true)
    setDateRange(null)
    try {
      const res  = await fetch(`/api/sales/${uploadId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setRecords(data)
    } catch (err: any) {
      message.error(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  const selectUpload = (upload: SalesUpload) => {
    setActiveUpload(upload)
    fetchRecords(upload.id)
  }

  const deleteUpload = async (id: string) => {
    try {
      const res = await fetch(`/api/sales/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      message.success('Upload deleted')
      setUploads(prev => prev.filter(u => u.id !== id))
      if (activeUpload?.id === id) { setActiveUpload(null); setRecords([]) }
    } catch (err: any) {
      message.error(err.message)
    }
  }

  // ── Table columns: department ─────────────────────────────────
  const deptColumns = [
    { title: 'Date',      dataIndex: 'sale_date',    key: 'date',    width: 110,
      render: (v: string) => v ? dayjs(v).format('DD MMM YYYY') : '—',
      sorter: (a: SalesRecord, b: SalesRecord) => (a.sale_date ?? '').localeCompare(b.sale_date ?? '') },
    { title: 'Section',   dataIndex: 'product_name', key: 'product', ellipsis: true },
    { title: 'Category',  dataIndex: 'category',     key: 'cat',     width: 140,
      render: (v: string) => v ? <Tag color="blue" style={{ fontSize: 11 }}>{v}</Tag> : '—' },
    { title: 'Qty',       dataIndex: 'quantity',     key: 'qty',     width: 70, align: 'right' as const,
      sorter: (a: SalesRecord, b: SalesRecord) => Number(a.quantity) - Number(b.quantity) },
    { title: 'Revenue',   dataIndex: 'total_amount', key: 'total',   width: 130, align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: BRAND.green }}>₦{Number(v).toLocaleString()}</Text>,
      sorter: (a: SalesRecord, b: SalesRecord) => Number(a.total_amount) - Number(b.total_amount) },
    ...(hasCostData ? [
      { title: 'Cost',    dataIndex: 'cost',       key: 'cost',   width: 120, align: 'right' as const,
        render: (v: number | null) => v != null ? `₦${Number(v).toLocaleString()}` : '—' },
      { title: 'Profit',  dataIndex: 'profit',     key: 'profit', width: 120, align: 'right' as const,
        render: (v: number | null) => v != null
          ? <Text style={{ color: Number(v) >= 0 ? '#00695C' : '#D32F2F' }}>₦{Number(v).toLocaleString()}</Text> : '—',
        sorter: (a: SalesRecord, b: SalesRecord) => Number(a.profit ?? 0) - Number(b.profit ?? 0) },
      { title: 'Margin',  dataIndex: 'margin_pct', key: 'margin', width: 90,  align: 'right' as const,
        render: (v: number | null) => v != null ? `${Number(v).toFixed(1)}%` : '—' },
    ] : []),
  ]

  // ── Table columns: item (aggregated) ─────────────────────────
  const itemColumns = [
    { title: 'Product',   dataIndex: 'name',            key: 'name',    ellipsis: true,
      sorter: (a: ItemStat, b: ItemStat) => a.name.localeCompare(b.name) },
    { title: 'Category',  dataIndex: 'category',        key: 'cat',     width: 140,
      render: (v: string) => v ? <Tag color="blue" style={{ fontSize: 11 }}>{v}</Tag> : '—' },
    { title: 'SKU',       dataIndex: 'sku',             key: 'sku',     width: 110,
      render: (v: string) => v || '—' },
    { title: 'Qty Sold',  dataIndex: 'qty',             key: 'qty',     width: 90, align: 'right' as const,
      sorter: (a: ItemStat, b: ItemStat) => a.qty - b.qty },
    { title: 'Revenue',   dataIndex: 'revenue',         key: 'revenue', width: 130, align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: BRAND.green }}>₦{Number(v).toLocaleString()}</Text>,
      sorter: (a: ItemStat, b: ItemStat) => a.revenue - b.revenue,
      defaultSortOrder: 'descend' as const },
    { title: 'Cost',      dataIndex: 'cost',            key: 'cost',    width: 120, align: 'right' as const,
      render: (v: number) => v > 0 ? `₦${Number(v).toLocaleString()}` : '—' },
    { title: 'Profit',    dataIndex: 'profit',          key: 'profit',  width: 120, align: 'right' as const,
      render: (v: number) => <Text style={{ color: v >= 0 ? '#00695C' : '#D32F2F' }}>₦{Number(v).toLocaleString()}</Text>,
      sorter: (a: ItemStat, b: ItemStat) => a.profit - b.profit },
    { title: 'Margin',    dataIndex: 'effectiveMargin', key: 'margin',  width: 90, align: 'right' as const,
      render: (v: number) => {
        const color = v < 0 ? '#D32F2F' : v < 12 ? '#FF7043' : v < 20 ? '#E65100' : '#00695C'
        return <Text strong style={{ color }}>{v.toFixed(1)}%</Text>
      },
      sorter: (a: ItemStat, b: ItemStat) => a.effectiveMargin - b.effectiveMargin },
  ]

  // ── Improvement card helper ───────────────────────────────────
  const ImprovementCard = ({
    tag, tagColor, title, subtitle, borderColor, items, renderItem,
  }: {
    tag: string; tagColor: string; title: string; subtitle: string; borderColor: string
    items: any[]; renderItem: (item: any, index: number) => React.ReactNode
  }) => (
    <Card
      size="small"
      style={{ borderLeft: `4px solid ${borderColor}`, marginBottom: 0 }}
      title={
        <Space>
          <Tag color={tagColor} style={{ fontSize: 11 }}>{tag}</Tag>
          <Text strong style={{ fontSize: 13 }}>{title}</Text>
        </Space>
      }
      extra={<Text type="secondary" style={{ fontSize: 11 }}>{subtitle}</Text>}
    >
      {items.length === 0
        ? <Text type="secondary" style={{ fontSize: 12 }}>✓ None detected — all good!</Text>
        : items.map((item, i) => (
            <div key={item.name ?? i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
              {renderItem(item, i)}
            </div>
          ))
      }
    </Card>
  )

  // ── Upload button (reusable) ──────────────────────────────────
  const UploadBtn = ({ label, icon, primary }: { label: string; icon: React.ReactNode; primary?: boolean }) => (
    <Upload accept=".xlsx,.xls" beforeUpload={handleUpload} showUploadList={false} maxCount={1}>
      <Button
        type={primary ? 'primary' : 'default'}
        icon={icon}
        loading={uploading}
        style={primary ? { background: BRAND.green } : { borderColor: BRAND.green, color: BRAND.green }}
      >
        {label}
      </Button>
    </Upload>
  )

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '0 4px' }}>

      {/* ── Page header ── */}
      <Row align="middle" justify="space-between" style={{ marginBottom: 20 }}>
        <Col>
          <Space align="center">
            <BarChartOutlined style={{ fontSize: 24, color: BRAND.green }} />
            <div>
              <Title level={4} style={{ margin: 0, color: BRAND.textDark }}>Sales Analyst</Title>
              <Text type="secondary" style={{ fontSize: 12 }}>Department hierarchy analysis · Item-level analysis with intelligent forecasting</Text>
            </div>
            <Tag color="gold" style={{ fontWeight: 700 }}>ANALYTICS</Tag>
          </Space>
        </Col>
        <Col>
          <Space>
            <UploadBtn label="Upload Department Report" icon={<ShopOutlined />} />
            <UploadBtn label="Upload Item Report" icon={<FundOutlined />} primary />
          </Space>
        </Col>
      </Row>

      {/* ── Hint banner ── */}
      <Card size="small" style={{ marginBottom: 16, background: '#FFF8E1', border: '1px solid #FFC107' }}>
        <Space wrap>
          <InfoCircleOutlined style={{ color: '#b8860b' }} />
          <Text style={{ fontSize: 12, color: '#555' }}>
            <strong>Department report</strong> — SALES LST.XLS: Dept → Section → Family → SubFamily hierarchy, Revenue vs Cost comparison.&nbsp;
            <strong>Item report</strong> — SALES LST ITEM.XLS: Individual product records with forecast projection and improvement analysis.
          </Text>
        </Space>
      </Card>

      <Row gutter={16}>

        {/* ── Left: Upload history ── */}
        <Col xs={24} lg={6}>
          <Card
            title={<Text strong>Saved Analyses ({uploads.length})</Text>}
            size="small"
            bodyStyle={{ padding: 0, maxHeight: 640, overflowY: 'auto' }}
          >
            {uploads.length === 0 ? (
              <Empty description="No uploads yet" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 24 }} />
            ) : (
              uploads.map(u => (
                <div
                  key={u.id}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid #f0f0f0',
                    background: activeUpload?.id === u.id ? '#E8F5E9' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => selectUpload(u)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Space style={{ marginBottom: 2 }}>
                        <Tag
                          color={u.file_type === 'item' ? 'purple' : 'blue'}
                          style={{ fontSize: 10, padding: '0 5px', lineHeight: '17px' }}
                        >
                          {u.file_type === 'item' ? 'ITEM' : 'DEPT'}
                        </Tag>
                        <Text strong style={{ fontSize: 12, color: BRAND.green }} ellipsis>{u.file_name}</Text>
                      </Space>
                      <div>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {u.row_count} records · {dayjs(u.created_at).format('DD MMM YYYY')}
                        </Text>
                      </div>
                      {u.period_from && (
                        <div>
                          <Text type="secondary" style={{ fontSize: 10 }}>
                            {dayjs(u.period_from).format('DD MMM')} – {u.period_to ? dayjs(u.period_to).format('DD MMM YY') : '?'}
                          </Text>
                        </div>
                      )}
                      {u.notes && (
                        <Text type="secondary" style={{ fontSize: 10, fontStyle: 'italic' }} ellipsis>{u.notes}</Text>
                      )}
                    </div>
                    <Popconfirm
                      title="Delete this upload?"
                      description="All records will be removed."
                      onConfirm={e => { e?.stopPropagation(); deleteUpload(u.id) }}
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                    >
                      <Button
                        type="text" icon={<DeleteOutlined />} size="small" danger
                        onClick={e => e.stopPropagation()}
                      />
                    </Popconfirm>
                  </div>
                </div>
              ))
            )}
          </Card>
        </Col>

        {/* ── Right: Analysis panel ── */}
        <Col xs={24} lg={18}>
          {!activeUpload ? (
            <Card style={{ minHeight: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Empty
                image={<FileExcelOutlined style={{ fontSize: 64, color: '#ddd' }} />}
                description={
                  <div>
                    <div style={{ marginBottom: 12, fontSize: 14 }}>Select a saved analysis or upload a new file</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Department reports show hierarchy analysis · Item reports show product-level analysis with forecasting
                    </Text>
                  </div>
                }
              >
                <Space>
                  <UploadBtn label="Department Report" icon={<ShopOutlined />} />
                  <UploadBtn label="Item Report" icon={<FundOutlined />} primary />
                </Space>
              </Empty>
            </Card>
          ) : (
            <Spin spinning={loadingData}>

              {/* ── Active upload banner ── */}
              <Card size="small" style={{ marginBottom: 16, background: '#E8F5E9', borderColor: BRAND.green }}>
                <Row align="middle" justify="space-between">
                  <Col>
                    <Space>
                      {isItemMode
                        ? <FundOutlined style={{ color: '#6A1B9A', fontSize: 18 }} />
                        : <ShopOutlined style={{ color: BRAND.green, fontSize: 18 }} />}
                      <div>
                        <Space>
                          <Tag color={isItemMode ? 'purple' : 'blue'} style={{ fontWeight: 700 }}>
                            {isItemMode ? 'ITEM ANALYSIS' : 'DEPARTMENT ANALYSIS'}
                          </Tag>
                          <Text strong style={{ color: BRAND.green }}>{activeUpload.file_name}</Text>
                        </Space>
                        <div>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {activeUpload.row_count} rows · uploaded {dayjs(activeUpload.created_at).format('DD MMM YYYY, h:mm a')}
                            {activeUpload.period_from && ` · Period: ${dayjs(activeUpload.period_from).format('DD MMM')} – ${activeUpload.period_to ? dayjs(activeUpload.period_to).format('DD MMM YYYY') : '?'}`}
                          </Text>
                        </div>
                      </div>
                    </Space>
                  </Col>
                  <Col>
                    <Space>
                      <CalendarOutlined style={{ color: '#666' }} />
                      <RangePicker
                        size="small"
                        value={dateRange}
                        onChange={v => setDateRange(v as [Dayjs, Dayjs] | null)}
                        placeholder={['Filter from', 'Filter to']}
                        allowClear
                      />
                      {dateRange && <Button size="small" onClick={() => setDateRange(null)}>Clear</Button>}
                    </Space>
                  </Col>
                </Row>
              </Card>

              {/* ════════════════════════════════════════════════════════
                  DEPARTMENT MODE
              ════════════════════════════════════════════════════════ */}
              {isDeptMode && (
                <>
                  {/* KPI cards */}
                  <Row gutter={12} style={{ marginBottom: 16 }}>
                    {([
                      { title: 'Total Revenue',    value: `₦${totalRevenue.toLocaleString()}`,                color: BRAND.green },
                      { title: 'Total Units Sold', value: totalUnits.toLocaleString(),                        color: '#1565C0'   },
                      { title: 'Avg Daily Sales',  value: `₦${Math.round(avgDaily).toLocaleString()}`,        color: '#6A1B9A'   },
                      { title: 'Top Department',   value: topProduct,                                         color: '#E65100'   },
                      hasCostData ? { title: 'Total Cost',   value: `₦${Math.round(totalCost ?? 0).toLocaleString()}`,   color: '#5D4037' } : null,
                      hasCostData ? { title: 'Total Profit', value: `₦${Math.round(totalProfit ?? 0).toLocaleString()}`, color: '#00695C' } : null,
                      hasCostData ? { title: 'Avg Margin',   value: `${(avgMargin ?? 0).toFixed(1)}%`,                  color: '#AD1457' } : null,
                    ] as any[]).filter(Boolean).map((k: any) => (
                      <Col xs={12} md={hasCostData ? 4 : 6} key={k.title} style={{ marginBottom: 8 }}>
                        <Card size="small" style={{ textAlign: 'center', borderTop: `3px solid ${k.color}` }}>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>{k.title}</Text>
                          <Text strong style={{ fontSize: 14, color: k.color }}>{k.value}</Text>
                        </Card>
                      </Col>
                    ))}
                  </Row>

                  {filtered.length > 0 && (
                    <>
                      {/* Chart row 1: trend / top sections + pie */}
                      <Row gutter={12} style={{ marginBottom: 12 }}>
                        <Col xs={24} md={categoryData.length > 0 ? 16 : 24}>
                          <Card
                            title={<Text strong>{isMultiDate ? 'Daily Sales Trend' : 'Sections / Departments by Revenue'}</Text>}
                            size="small"
                            extra={dateRange ? <Tag color="blue">Filtered</Tag> : null}
                          >
                            {isMultiDate
                              ? <ReactECharts option={dailyBarOption} style={{ height: 240 }} />
                              : topItems.length > 0
                                ? <ReactECharts option={deptTopItemsOption} style={{ height: Math.max(200, topItems.length * 22) }} />
                                : <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 40 }} />
                            }
                          </Card>
                        </Col>
                        {categoryData.length > 0 && (
                          <Col xs={24} md={8}>
                            <Card title={<Text strong>Revenue by Department</Text>} size="small">
                              <ReactECharts option={pieOption} style={{ height: 240 }} />
                            </Card>
                          </Col>
                        )}
                      </Row>

                      {/* Chart row 2: Revenue vs Cost vs Profit by dept */}
                      {hasCostData && hasCats && deptNames.length > 0 && (
                        <Row gutter={12} style={{ marginBottom: 12 }}>
                          <Col xs={24}>
                            <Card title={<Text strong>Revenue vs Cost vs Profit by Department</Text>} size="small">
                              <ReactECharts option={deptCompareOption} style={{ height: 260 }} />
                            </Card>
                          </Col>
                        </Row>
                      )}
                    </>
                  )}

                  {/* Department records table */}
                  <Card
                    title={<Space><Text strong>Records</Text><Tag>{filtered.length} rows</Tag>{dateRange && <Tag color="blue">Date filtered</Tag>}</Space>}
                    size="small"
                  >
                    <Table
                      dataSource={filtered}
                      columns={deptColumns}
                      rowKey="id"
                      size="small"
                      pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
                      scroll={{ x: 800 }}
                      summary={() => filtered.length > 0 ? (
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0} colSpan={4}><Text strong>Totals</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={4} align="right">
                            <Text strong style={{ color: BRAND.green }}>₦{totalRevenue.toLocaleString()}</Text>
                          </Table.Summary.Cell>
                          {hasCostData && <>
                            <Table.Summary.Cell index={5} align="right">
                              <Text strong>₦{Math.round(totalCost ?? 0).toLocaleString()}</Text>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={6} align="right">
                              <Text strong style={{ color: '#00695C' }}>₦{Math.round(totalProfit ?? 0).toLocaleString()}</Text>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={7} align="right">
                              <Text strong>{(avgMargin ?? 0).toFixed(1)}%</Text>
                            </Table.Summary.Cell>
                          </>}
                        </Table.Summary.Row>
                      ) : null}
                    />
                  </Card>
                </>
              )}

              {/* ════════════════════════════════════════════════════════
                  ITEM MODE
              ════════════════════════════════════════════════════════ */}
              {isItemMode && (
                <>
                  {/* KPI cards */}
                  <Row gutter={12} style={{ marginBottom: 16 }}>
                    {([
                      { title: 'Total Revenue',  value: `₦${totalRevenue.toLocaleString()}`,                                                 color: BRAND.green },
                      hasCostData ? { title: 'Total Cost',   value: `₦${Math.round(totalCost ?? 0).toLocaleString()}`,                       color: '#5D4037'   } : null,
                      hasCostData ? { title: 'Total Profit', value: `₦${Math.round(totalProfit ?? 0).toLocaleString()}`,                     color: (totalProfit ?? 0) >= 0 ? '#00695C' : '#D32F2F' } : null,
                      hasCostData ? { title: 'Avg Margin',   value: `${(avgMargin ?? 0).toFixed(1)}%`,                                       color: '#AD1457'   } : null,
                      { title: 'Units Sold',     value: totalUnits.toLocaleString(),                                                         color: '#1565C0'   },
                      { title: 'Unique Items',   value: uniqueItems.toLocaleString(),                                                         color: '#E65100'   },
                      { title: 'Period',         value: `${periodDays} days`,                                                                color: '#6A1B9A'   },
                    ] as any[]).filter(Boolean).map((k: any) => (
                      <Col xs={12} md={hasCostData ? 4 : 8} key={k.title} style={{ marginBottom: 8 }}>
                        <Card size="small" style={{ textAlign: 'center', borderTop: `3px solid ${k.color}` }}>
                          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>{k.title}</Text>
                          <Text strong style={{ fontSize: 14, color: k.color }}>{k.value}</Text>
                        </Card>
                      </Col>
                    ))}
                  </Row>

                  {filtered.length > 0 && (
                    <>
                      {/* Charts row 1: Top by Revenue + Top by Profit */}
                      <Row gutter={12} style={{ marginBottom: 12 }}>
                        <Col xs={24} md={12}>
                          <Card title={<Text strong>Top 15 Items — Revenue</Text>} size="small">
                            {topItems.length > 0
                              ? <ReactECharts option={itemTopRevOption} style={{ height: Math.min(Math.max(200, topItems.length * 22), 360) }} />
                              : <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 32 }} />
                            }
                          </Card>
                        </Col>
                        <Col xs={24} md={12}>
                          <Card title={<Text strong>Top 15 Items — Profit</Text>} size="small">
                            {topProfitItems.length > 0
                              ? <ReactECharts option={itemTopProfitOption} style={{ height: Math.min(Math.max(200, topProfitItems.length * 22), 360) }} />
                              : <Empty description="No data" image={Empty.PRESENTED_IMAGE_SIMPLE} style={{ padding: 32 }} />
                            }
                          </Card>
                        </Col>
                      </Row>

                      {/* Margin distribution */}
                      {hasCostData && (
                        <Row gutter={12} style={{ marginBottom: 12 }}>
                          <Col xs={24}>
                            <Card
                              title={
                                <Space wrap>
                                  <Text strong>Margin Distribution — Top 20 Items by Revenue</Text>
                                  <Space size={4}>
                                    <Tag color="success">{'>'} 20% Good</Tag>
                                    <Tag color="warning">12–20% Medium</Tag>
                                    <Tag color="error">{'<'} 12% Low</Tag>
                                  </Space>
                                </Space>
                              }
                              size="small"
                            >
                              <ReactECharts option={marginDistOption} style={{ height: 250 }} />
                            </Card>
                          </Col>
                        </Row>
                      )}

                      {/* Intelligent Forecast */}
                      {hasCostData && (
                        <Row gutter={12} style={{ marginBottom: 12 }}>
                          <Col xs={24}>
                            <Card
                              title={
                                <Space>
                                  <RiseOutlined style={{ color: BRAND.green }} />
                                  <Text strong>Intelligent Sales Forecast</Text>
                                  <Tag color="blue">Based on {periodDays}-day period</Tag>
                                </Space>
                              }
                              size="small"
                              style={{ borderColor: BRAND.green }}
                            >
                              <Row gutter={16}>
                                {/* Left: projection summary */}
                                <Col xs={24} md={8}>
                                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 14 }}>
                                    Projections from {activeUpload.period_from ? dayjs(activeUpload.period_from).format('DD MMM') : '?'} – {activeUpload.period_to ? dayjs(activeUpload.period_to).format('DD MMM YYYY') : '?'}. Assumes current sales velocity continues.
                                  </Text>

                                  <div style={{ marginBottom: 10 }}>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Daily Average Revenue</Text>
                                    <Text strong style={{ fontSize: 20, color: BRAND.green }}>₦{Math.round(dailyRev).toLocaleString()}</Text>
                                    <Text type="secondary"> / day</Text>
                                  </div>
                                  <div style={{ marginBottom: 10 }}>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Daily Average Profit</Text>
                                    <Text strong style={{ fontSize: 18, color: '#00695C' }}>₦{Math.round(dailyProf).toLocaleString()}</Text>
                                    <Text type="secondary"> / day</Text>
                                  </div>
                                  <div style={{ marginBottom: 14 }}>
                                    <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>Daily Average Cost</Text>
                                    <Text strong style={{ fontSize: 15, color: '#5D4037' }}>₦{Math.round(dailyCost).toLocaleString()}</Text>
                                    <Text type="secondary"> / day</Text>
                                  </div>

                                  <Divider style={{ margin: '10px 0' }} />

                                  <Row gutter={8}>
                                    {[
                                      { label: 'Revenue 7 days',  val: Math.round(dailyRev * 7),   color: BRAND.green },
                                      { label: 'Revenue 30 days', val: Math.round(dailyRev * 30),  color: BRAND.green },
                                      { label: 'Profit 30 days',  val: Math.round(dailyProf * 30), color: '#00695C'   },
                                      { label: 'Profit 90 days',  val: Math.round(dailyProf * 90), color: '#00695C'   },
                                    ].map(p => (
                                      <Col span={12} key={p.label} style={{ marginBottom: 6 }}>
                                        <div style={{ background: '#F1F8E9', borderRadius: 6, padding: '6px 10px' }}>
                                          <Text style={{ fontSize: 10, color: '#666', display: 'block' }}>{p.label}</Text>
                                          <Text strong style={{ fontSize: 13, color: p.color }}>₦{p.val.toLocaleString()}</Text>
                                        </div>
                                      </Col>
                                    ))}
                                  </Row>
                                </Col>

                                {/* Right: forecast chart */}
                                <Col xs={24} md={16}>
                                  <ReactECharts option={forecastOption} style={{ height: 260 }} />
                                  <Text type="secondary" style={{ fontSize: 11, display: 'block', textAlign: 'center', marginTop: 4 }}>
                                    Fading bars = projections (lighter = further out). Upload next period's data to track actual vs forecast.
                                  </Text>
                                </Col>
                              </Row>
                            </Card>
                          </Col>
                        </Row>
                      )}

                      {/* Areas for Improvement */}
                      {hasCostData && (
                        <Row gutter={12} style={{ marginBottom: 12 }}>
                          <Col xs={24}>
                            <Card
                              title={
                                <Space>
                                  <ExclamationCircleOutlined style={{ color: '#E65100' }} />
                                  <Text strong>Areas of Concentration for Improvement</Text>
                                </Space>
                              }
                              size="small"
                            >
                              <Row gutter={[12, 12]}>
                                <Col xs={24} md={12}>
                                  <ImprovementCard
                                    tag="CRITICAL" tagColor="error" borderColor="#D32F2F"
                                    title={`Loss Makers (${lossMakers.length} items)`}
                                    subtitle="Selling below cost"
                                    items={lossMakers}
                                    renderItem={item => (<>
                                      <Text style={{ fontSize: 12, maxWidth: '60%' }} ellipsis={{ tooltip: item.name }}>{item.name}</Text>
                                      <Text style={{ fontSize: 12, color: '#D32F2F', fontWeight: 600 }}>
                                        ₦{Math.abs(Math.round(item.profit)).toLocaleString()} loss
                                      </Text>
                                    </>)}
                                  />
                                </Col>

                                <Col xs={24} md={12}>
                                  <ImprovementCard
                                    tag="WARNING" tagColor="warning" borderColor="#FF7043"
                                    title={`Low Margin Items (${lowMargin.length})`}
                                    subtitle="Margin < 15%"
                                    items={lowMargin}
                                    renderItem={item => (<>
                                      <Text style={{ fontSize: 12, maxWidth: '55%' }} ellipsis={{ tooltip: item.name }}>{item.name}</Text>
                                      <Space size={6}>
                                        <Text style={{ fontSize: 12, color: '#FF7043', fontWeight: 600 }}>{item.effectiveMargin.toFixed(1)}%</Text>
                                        <Text style={{ fontSize: 11, color: '#888' }}>₦{Math.round(item.revenue / 1000)}k rev</Text>
                                      </Space>
                                    </>)}
                                  />
                                </Col>

                                <Col xs={24} md={12}>
                                  <ImprovementCard
                                    tag="OPPORTUNITY" tagColor="gold" borderColor="#FFC107"
                                    title={`High Volume, Low Margin (${highVolLowMargin.length})`}
                                    subtitle="Small price increase = big gains"
                                    items={highVolLowMargin}
                                    renderItem={item => (<>
                                      <Text style={{ fontSize: 12, maxWidth: '55%' }} ellipsis={{ tooltip: item.name }}>{item.name}</Text>
                                      <Space size={6}>
                                        <Text style={{ fontSize: 12, color: '#E65100', fontWeight: 600 }}>{item.effectiveMargin.toFixed(1)}%</Text>
                                        <Text style={{ fontSize: 11, color: '#888' }}>{item.qty.toFixed(0)} units</Text>
                                      </Space>
                                    </>)}
                                  />
                                </Col>

                                <Col xs={24} md={12}>
                                  <ImprovementCard
                                    tag="STRENGTH" tagColor="success" borderColor={BRAND.green}
                                    title="Top Profit Drivers (Top 8)"
                                    subtitle="Prioritise stock & visibility"
                                    items={stars}
                                    renderItem={(item) => (<>
                                      <Space>
                                        <Text style={{ fontSize: 11, color: '#bbb', minWidth: 18 }}>#{stars.indexOf(item) + 1}</Text>
                                        <Text style={{ fontSize: 12, maxWidth: 130 }} ellipsis={{ tooltip: item.name }}>{item.name}</Text>
                                      </Space>
                                      <Space size={6}>
                                        <Text style={{ fontSize: 12, color: BRAND.green, fontWeight: 600 }}>
                                          ₦{Math.round(item.profit / 1000).toFixed(0)}k profit
                                        </Text>
                                        <Text style={{ fontSize: 11, color: '#888' }}>{item.effectiveMargin.toFixed(0)}%</Text>
                                      </Space>
                                    </>)}
                                  />
                                </Col>
                              </Row>
                            </Card>
                          </Col>
                        </Row>
                      )}
                    </>
                  )}

                  {/* Item aggregated table */}
                  <Card
                    title={
                      <Space>
                        <Text strong>Item Summary</Text>
                        <Tag>{itemsArr.length} unique items</Tag>
                        {dateRange && <Tag color="blue">Date filtered</Tag>}
                      </Space>
                    }
                    size="small"
                  >
                    <Table
                      dataSource={itemsArr}
                      columns={itemColumns}
                      rowKey="name"
                      size="small"
                      pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['20', '50', '100'] }}
                      scroll={{ x: 850 }}
                      summary={() => itemsArr.length > 0 ? (
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0} colSpan={4}><Text strong>Totals</Text></Table.Summary.Cell>
                          <Table.Summary.Cell index={4} align="right">
                            <Text strong style={{ color: BRAND.green }}>₦{totalRevenue.toLocaleString()}</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={5} align="right">
                            <Text strong>₦{Math.round(totalCost ?? 0).toLocaleString()}</Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={6} align="right">
                            <Text strong style={{ color: (totalProfit ?? 0) >= 0 ? '#00695C' : '#D32F2F' }}>
                              ₦{Math.round(totalProfit ?? 0).toLocaleString()}
                            </Text>
                          </Table.Summary.Cell>
                          <Table.Summary.Cell index={7} align="right">
                            <Text strong>{(avgMargin ?? 0).toFixed(1)}%</Text>
                          </Table.Summary.Cell>
                        </Table.Summary.Row>
                      ) : null}
                    />
                  </Card>
                </>
              )}

            </Spin>
          )}
        </Col>
      </Row>

      {/* ── Note modal ── */}
      <Modal
        open={noteModal}
        title={<Space><FileExcelOutlined style={{ color: BRAND.green }} /><span>Add a note (optional)</span></Space>}
        onOk={submitUpload}
        onCancel={() => { setNoteModal(false); setPendingFile(null) }}
        okText="Upload & Analyse"
        okButtonProps={{ style: { background: BRAND.green }, loading: uploading }}
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            File: <strong>{pendingFile?.name}</strong>
          </Text>
        </div>
        <TextArea
          rows={3}
          placeholder="e.g. Week 3 January sales / Branch A Q1 data…"
          value={noteText}
          onChange={e => setNoteText(e.target.value)}
        />
      </Modal>

    </div>
  )
}

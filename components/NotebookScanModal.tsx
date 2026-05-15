'use client'

import { useState, useRef, useCallback } from 'react'
import {
  Modal, Button, Space, Typography, Spin, Alert, Table, Input, InputNumber,
  DatePicker, Tooltip, Upload, Empty, Tag,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  CameraOutlined, DeleteOutlined, PlusOutlined, ScanOutlined,
  ArrowLeftOutlined, CheckOutlined, InboxOutlined,
} from '@ant-design/icons'
import type { RcFile } from 'antd/es/upload'
import dayjs from 'dayjs'
import { BRAND } from '@/lib/constants'

const { Text } = Typography
const { Dragger } = Upload

export type ScanSection = 'damage' | 'expiring' | 'discount'

export interface ScanRow {
  key:            string
  barcode:        string
  description:    string
  quantity:       number
  price:          number
  reason:         string
  category:       string
  notes:          string
  expiry_date:    string
  original_price: number
  name:           string
}

const SECTION_LABELS: Record<ScanSection, string> = {
  damage:   'Damage Records',
  expiring: 'About to Expire',
  discount: 'Discount Records',
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_MB   = 20

let rowCounter = 0
function newKey() { return `row-${++rowCounter}` }

function makeBlankRow(section: ScanSection): ScanRow {
  return {
    key:            newKey(),
    barcode:        '',
    description:    '',
    quantity:       1,
    price:          0,
    reason:         section === 'damage' ? 'Pest damage' : '',
    category:       '',
    notes:          '',
    expiry_date:    '',
    original_price: 0,
    name:           '',
  }
}

function apiRowToScanRow(raw: Record<string, unknown>, section: ScanSection): ScanRow {
  return {
    key:            newKey(),
    barcode:        String(raw.barcode       ?? ''),
    description:    String(raw.description   ?? ''),
    quantity:       Number(raw.quantity      ?? 1),
    price:          Number(raw.price         ?? 0),
    reason:         String(raw.reason        ?? (section === 'damage' ? 'Pest damage' : '')),
    category:       String(raw.category      ?? ''),
    notes:          String(raw.notes         ?? ''),
    expiry_date:    String(raw.expiry_date   ?? ''),
    original_price: Number(raw.original_price ?? 0),
    name:           String(raw.name          ?? ''),
  }
}

interface Props {
  open:      boolean
  section:   ScanSection
  onClose:   () => void
  onConfirm: (rows: ScanRow[]) => void
}

type Step = 'upload' | 'analyzing' | 'verify'

export default function NotebookScanModal({ open, section, onClose, onConfirm }: Props) {
  const [step,         setStep]         = useState<Step>('upload')
  const [imageB64,     setImageB64]     = useState('')
  const [mimeType,     setMimeType]     = useState<'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'>('image/jpeg')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [rows,         setRows]         = useState<ScanRow[]>([])
  const [error,        setError]        = useState<string | null>(null)
  const cameraRef                       = useRef<HTMLInputElement>(null)

  function reset() {
    setStep('upload')
    setImageB64('')
    setImagePreview(null)
    setRows([])
    setError(null)
  }

  function handleClose() {
    reset()
    onClose()
  }

  const handleFile = useCallback((file: RcFile | File) => {
    const f = file as File
    if (!ACCEPTED.includes(f.type)) {
      setError('Only JPEG, PNG, GIF, and WebP images are supported.')
      return false
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`Image must be smaller than ${MAX_MB} MB.`)
      return false
    }
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      setImagePreview(dataUrl)
      setImageB64(dataUrl.split(',')[1])
      setMimeType(f.type as typeof mimeType)
      setError(null)
    }
    reader.readAsDataURL(f)
    return false
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAnalyze() {
    if (!imageB64) return
    setStep('analyzing')
    setError(null)
    try {
      const res = await fetch('/api/scan/notebook', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ image: imageB64, mimeType, section }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      const raw = Array.isArray(data.records) ? data.records as Record<string, unknown>[] : []
      const extracted = raw.map((r: Record<string, unknown>) => apiRowToScanRow(r, section))
      setRows(extracted.length ? extracted : [makeBlankRow(section)])
      setStep('verify')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStep('upload')
    }
  }

  function updateRow(key: string, field: keyof ScanRow, value: unknown) {
    setRows(prev => prev.map(r => r.key === key ? { ...r, [field]: value } : r))
  }

  function deleteRow(key: string) {
    setRows(prev => prev.filter(r => r.key !== key))
  }

  function addRow() {
    setRows(prev => [...prev, makeBlankRow(section)])
  }

  function buildColumns(): ColumnsType<ScanRow> {
    const barcodeCol: ColumnsType<ScanRow>[0] = {
      title:     'Barcode / SKU',
      dataIndex: 'barcode',
      width:     150,
      render: (v, r) => (
        <Input
          size="small"
          value={v}
          onChange={e => updateRow(r.key, 'barcode', e.target.value)}
          placeholder="Barcode"
          style={{ fontFamily: 'monospace' }}
        />
      ),
    }

    const descCol: ColumnsType<ScanRow>[0] = {
      title:     'Description',
      dataIndex: 'description',
      width:     180,
      render: (v, r) => (
        <Input
          size="small"
          value={v}
          onChange={e => updateRow(r.key, 'description', e.target.value)}
          placeholder="Product name"
        />
      ),
    }

    const qtyCol: ColumnsType<ScanRow>[0] = {
      title:     'Qty',
      dataIndex: 'quantity',
      width:     75,
      render: (v, r) => (
        <InputNumber
          size="small"
          min={0}
          value={v}
          onChange={val => updateRow(r.key, 'quantity', val ?? 0)}
          style={{ width: '100%' }}
        />
      ),
    }

    const categoryCol: ColumnsType<ScanRow>[0] = {
      title:     'Department',
      dataIndex: 'category',
      width:     140,
      render: (v, r) => (
        <Input
          size="small"
          value={v}
          onChange={e => updateRow(r.key, 'category', e.target.value)}
          placeholder="Department"
        />
      ),
    }

    const deleteCol: ColumnsType<ScanRow>[0] = {
      title:  '',
      key:    'del',
      width:  44,
      render: (_, r) => (
        <Tooltip title="Remove row">
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => deleteRow(r.key)}
            disabled={rows.length === 1}
          />
        </Tooltip>
      ),
    }

    if (section === 'damage') {
      return [
        barcodeCol,
        descCol,
        qtyCol,
        {
          title:     'Price (₦)',
          dataIndex: 'price',
          width:     110,
          render: (v, r) => (
            <InputNumber
              size="small"
              min={0}
              value={v}
              onChange={val => updateRow(r.key, 'price', val ?? 0)}
              formatter={val => `₦ ${val}`}
              style={{ width: '100%' }}
            />
          ),
        },
        {
          title:     'Reason',
          dataIndex: 'reason',
          width:     130,
          render: (v, r) => (
            <Input
              size="small"
              value={v}
              onChange={e => updateRow(r.key, 'reason', e.target.value)}
              placeholder="e.g. Broken"
            />
          ),
        },
        categoryCol,
        {
          title:     'Notes',
          dataIndex: 'notes',
          width:     120,
          render: (v, r) => (
            <Input
              size="small"
              value={v}
              onChange={e => updateRow(r.key, 'notes', e.target.value)}
              placeholder="Optional"
            />
          ),
        },
        deleteCol,
      ]
    }

    if (section === 'expiring') {
      return [
        barcodeCol,
        descCol,
        qtyCol,
        {
          title:     'Price (₦)',
          dataIndex: 'price',
          width:     110,
          render: (v, r) => (
            <InputNumber
              size="small"
              min={0}
              value={v}
              onChange={val => updateRow(r.key, 'price', val ?? 0)}
              formatter={val => `₦ ${val}`}
              style={{ width: '100%' }}
            />
          ),
        },
        {
          title:     'Expiry Date',
          dataIndex: 'expiry_date',
          width:     140,
          render: (v, r) => (
            <DatePicker
              size="small"
              value={v ? dayjs(v) : null}
              onChange={date => updateRow(r.key, 'expiry_date', date ? date.format('YYYY-MM-DD') : '')}
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
            />
          ),
        },
        categoryCol,
        {
          title:     'Notes',
          dataIndex: 'notes',
          width:     120,
          render: (v, r) => (
            <Input
              size="small"
              value={v}
              onChange={e => updateRow(r.key, 'notes', e.target.value)}
              placeholder="Optional"
            />
          ),
        },
        deleteCol,
      ]
    }

    // discount
    return [
      barcodeCol,
      descCol,
      qtyCol,
      {
        title:     'Original Price (₦)',
        dataIndex: 'original_price',
        width:     145,
        render: (v, r) => (
          <InputNumber
            size="small"
            min={0}
            value={v}
            onChange={val => updateRow(r.key, 'original_price', val ?? 0)}
            formatter={val => `₦ ${val}`}
            style={{ width: '100%' }}
          />
        ),
      },
      {
        title:     'Discount Reason',
        dataIndex: 'name',
        width:     140,
        render: (v, r) => (
          <Input
            size="small"
            value={v}
            onChange={e => updateRow(r.key, 'name', e.target.value)}
            placeholder="e.g. Clearance"
          />
        ),
      },
      categoryCol,
      deleteCol,
    ]
  }

  const validRows = rows.filter(r => r.description.trim())

  return (
    <Modal
      open={open}
      onCancel={handleClose}
      title={
        <Space>
          <ScanOutlined style={{ color: BRAND.green }} />
          <span>Scan Notebook — {SECTION_LABELS[section]}</span>
        </Space>
      }
      width={step === 'verify' ? 900 : 560}
      footer={
        step === 'verify' ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <Button icon={<ArrowLeftOutlined />} onClick={() => { setStep('upload'); setError(null) }}>
                Re-scan
              </Button>
              <Button icon={<PlusOutlined />} onClick={addRow}>
                Add Row
              </Button>
            </Space>
            <Space>
              <Button onClick={handleClose}>Cancel</Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                disabled={validRows.length === 0}
                onClick={() => { onConfirm(validRows); reset(); onClose() }}
                style={{ background: BRAND.green }}
              >
                Confirm &amp; Submit {validRows.length} Record{validRows.length !== 1 ? 's' : ''}
              </Button>
            </Space>
          </div>
        ) : (
          <Space>
            <Button onClick={handleClose}>Cancel</Button>
            {step === 'upload' && imageB64 && (
              <Button
                type="primary"
                icon={<ScanOutlined />}
                onClick={handleAnalyze}
                style={{ background: BRAND.green }}
              >
                Analyze with AI
              </Button>
            )}
          </Space>
        )
      }
    >
      {/* ── Upload ── */}
      {step === 'upload' && (
        <div>
          {error && (
            <Alert type="error" message={error} showIcon style={{ marginBottom: 12, borderRadius: 8 }} />
          )}

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />

          <Button
            icon={<CameraOutlined />}
            onClick={() => cameraRef.current?.click()}
            style={{ width: '100%', marginBottom: 12, height: 44 }}
          >
            Open Camera (Mobile)
          </Button>

          {imagePreview ? (
            <div style={{ position: 'relative', marginBottom: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Captured"
                style={{
                  width: '100%', borderRadius: 10, maxHeight: 300,
                  objectFit: 'contain', border: `2px solid ${BRAND.green}`,
                }}
              />
              <Button
                size="small"
                danger
                style={{ position: 'absolute', top: 8, right: 8 }}
                onClick={() => { setImagePreview(null); setImageB64('') }}
              >
                Remove
              </Button>
            </div>
          ) : (
            <Dragger
              accept="image/jpeg,image/png,image/gif,image/webp"
              showUploadList={false}
              beforeUpload={f => { handleFile(f); return false }}
              style={{ borderRadius: 10, marginBottom: 12 }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ fontSize: 36, color: BRAND.green }} />
              </p>
              <p className="ant-upload-text" style={{ fontWeight: 600 }}>
                Or drop / click to select an image
              </p>
              <p className="ant-upload-hint" style={{ color: '#888' }}>
                JPEG, PNG, GIF, WebP — up to {MAX_MB} MB
              </p>
            </Dragger>
          )}

          <Alert
            type="info"
            showIcon
            message="Point your camera at the notebook page. AI will read and extract all records automatically."
            style={{ borderRadius: 8 }}
          />
        </div>
      )}

      {/* ── Analyzing ── */}
      {step === 'analyzing' && (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 15 }}>Reading notebook with AI…</Text>
          </div>
          <div style={{ marginTop: 6 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>This usually takes 3–8 seconds</Text>
          </div>
        </div>
      )}

      {/* ── Verify ── */}
      {step === 'verify' && (
        <div>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Tag color="green">{rows.length} record{rows.length !== 1 ? 's' : ''} extracted</Tag>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Edit any wrong fields, delete bad rows, or add missing ones.
            </Text>
          </div>

          {rows.length === 0 ? (
            <Empty
              description="No records extracted — add rows manually or re-scan"
              style={{ margin: '24px 0' }}
            />
          ) : (
            <Table<ScanRow>
              dataSource={rows}
              columns={buildColumns()}
              rowKey="key"
              size="small"
              pagination={false}
              scroll={{ x: 700 }}
              style={{ borderRadius: 8 }}
            />
          )}
        </div>
      )}
    </Modal>
  )
}

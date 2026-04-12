'use client'

import { useState, useCallback } from 'react'
import {
  Typography, Button, Card, Space, Alert, Spin, message, Upload, Empty, Divider,
} from 'antd'
import {
  ScanOutlined, CopyOutlined, DeleteOutlined, InboxOutlined, CheckOutlined,
} from '@ant-design/icons'
import type { RcFile } from 'antd/es/upload'
import { BRAND } from '@/lib/constants'

const { Title, Text, Paragraph } = Typography
const { Dragger } = Upload

const ACCEPTED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_MB   = 20

export default function ScanClient() {
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageName,    setImageName]    = useState<string>('')
  const [imageB64,     setImageB64]     = useState<string>('')
  const [mimeType,     setMimeType]     = useState<'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'>('image/jpeg')
  const [result,       setResult]       = useState<string>('')
  const [loading,      setLoading]      = useState(false)
  const [copied,       setCopied]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const handleFile = useCallback((file: RcFile) => {
    if (!ACCEPTED.includes(file.type)) {
      message.error('Only JPEG, PNG, GIF, and WebP images are supported.')
      return false
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      message.error(`Image must be smaller than ${MAX_MB} MB.`)
      return false
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      // dataUrl = "data:image/jpeg;base64,/9j/..."
      const b64 = dataUrl.split(',')[1]
      setImagePreview(dataUrl)
      setImageB64(b64)
      setMimeType(file.type as typeof mimeType)
      setImageName(file.name)
      setResult('')
      setError(null)
    }
    reader.readAsDataURL(file)
    return false // prevent default upload
  }, [])

  async function handleScan() {
    if (!imageB64) return
    setLoading(true)
    setError(null)
    setResult('')

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageB64, mimeType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Scan failed')
      setResult(data.text)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleClear() {
    setImagePreview(null)
    setImageB64('')
    setImageName('')
    setResult('')
    setError(null)
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <Space align="center" size={12}>
          <div style={{
            background: BRAND.greenBg,
            borderRadius: 10,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
          }}>
            <ScanOutlined style={{ fontSize: 22, color: BRAND.green }} />
          </div>
          <div>
            <Title level={4} style={{ margin: 0, color: BRAND.textDark }}>Image to Text</Title>
            <Text type="secondary" style={{ fontSize: 13 }}>
              Upload a photo of any written or printed content and AI will transcribe it.
            </Text>
          </div>
        </Space>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: imagePreview ? '1fr 1fr' : '1fr', gap: 20 }}>

        {/* Upload panel */}
        <Card
          style={{ borderRadius: 12, border: `1px solid ${imagePreview ? BRAND.green : '#e8e8e8'}` }}
          styles={{ body: { padding: 0 } }}
        >
          {imagePreview ? (
            <div style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="Uploaded"
                style={{ width: '100%', borderRadius: 12, display: 'block', maxHeight: 480, objectFit: 'contain' }}
              />
              <div style={{
                position: 'absolute',
                bottom: 12,
                left: 12,
                right: 12,
                display: 'flex',
                gap: 8,
              }}>
                <Button
                  type="primary"
                  icon={loading ? <Spin size="small" /> : <ScanOutlined />}
                  onClick={handleScan}
                  disabled={loading}
                  style={{ flex: 1, background: BRAND.green, borderColor: BRAND.green }}
                >
                  {loading ? 'Processing…' : 'Transcribe'}
                </Button>
                <Button
                  icon={<DeleteOutlined />}
                  onClick={handleClear}
                  danger
                  disabled={loading}
                />
              </div>
              <div style={{
                position: 'absolute',
                top: 10,
                left: 10,
                background: 'rgba(0,0,0,0.55)',
                borderRadius: 6,
                padding: '2px 8px',
              }}>
                <Text style={{ color: '#fff', fontSize: 11 }}>{imageName}</Text>
              </div>
            </div>
          ) : (
            <Dragger
              accept="image/jpeg,image/png,image/gif,image/webp"
              showUploadList={false}
              beforeUpload={handleFile}
              style={{ borderRadius: 12, padding: '32px 24px', border: 'none' }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ fontSize: 40, color: BRAND.green }} />
              </p>
              <p className="ant-upload-text" style={{ fontWeight: 600 }}>
                Click or drag an image here
              </p>
              <p className="ant-upload-hint" style={{ color: '#888' }}>
                JPEG, PNG, GIF, WebP — up to {MAX_MB} MB
              </p>
            </Dragger>
          )}
        </Card>

        {/* Result panel — only shown after an image is loaded */}
        {imagePreview && (
          <Card
            style={{ borderRadius: 12, border: '1px solid #e8e8e8' }}
            styles={{ body: { padding: 20, height: '100%', display: 'flex', flexDirection: 'column' } }}
            title={
              <Space>
                <Text strong style={{ fontSize: 14 }}>Transcribed Text</Text>
                {result && (
                  <Button
                    size="small"
                    type="text"
                    icon={copied ? <CheckOutlined style={{ color: BRAND.green }} /> : <CopyOutlined />}
                    onClick={handleCopy}
                    style={{ color: copied ? BRAND.green : '#888' }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                )}
              </Space>
            }
          >
            {error && (
              <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} />
            )}

            {loading && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
                <Spin size="large" />
                <Text type="secondary">Extracting text from image…</Text>
              </div>
            )}

            {!loading && !result && !error && (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<Text type="secondary">Click &quot;Transcribe&quot; to extract the text</Text>}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
              />
            )}

            {!loading && result && (
              <>
                <Paragraph
                  style={{
                    fontFamily: "'Roboto Mono', 'Courier New', monospace",
                    fontSize: 13,
                    lineHeight: 1.7,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    flex: 1,
                    overflowY: 'auto',
                    maxHeight: 420,
                    background: BRAND.grayBg,
                    borderRadius: 8,
                    padding: 14,
                    margin: 0,
                  }}
                >
                  {result}
                </Paragraph>
                <Divider style={{ margin: '12px 0 8px' }} />
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {result.split(/\s+/).filter(Boolean).length} words · {result.length} characters
                </Text>
              </>
            )}
          </Card>
        )}
      </div>

      {/* Tip */}
      {!imagePreview && (
        <Alert
          style={{ marginTop: 20, borderRadius: 10 }}
          type="info"
          showIcon
          message="Works best with clear, well-lit photos of printed or handwritten text — receipts, notes, labels, and documents."
        />
      )}
    </div>
  )
}

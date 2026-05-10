'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button, Input, Typography, Grid } from 'antd'
import type { InputRef } from 'antd'
import {
  MessageOutlined, CloseOutlined, SendOutlined,
  RobotOutlined, UserOutlined, ClearOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { BRAND } from '@/lib/constants'

const { Text } = Typography
const { useBreakpoint } = Grid

interface Message {
  role:    'user' | 'assistant'
  content: string
}

const STARTERS = [
  'How much damage was logged today?',
  'What items are expiring this week?',
  'How many approvals are pending?',
  "Summarise today's pipeline status",
]

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: '#bbb',
            animation: 'chatBotBounce 1.2s infinite',
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
  )
}

// Parse text with [label](/path) markdown links into React nodes
function parseLinks(text: string, onNavigate: (path: string) => void): React.ReactNode[] {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    const match = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (match) {
      const [, label, href] = match
      const isInternal = href.startsWith('/')
      return (
        <span
          key={i}
          onClick={() => isInternal ? onNavigate(href) : undefined}
          style={{
            color:          BRAND.green,
            textDecoration: 'underline',
            cursor:         'pointer',
            fontWeight:     500,
          }}
        >
          {label}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

function MessageBubble({ msg, onNavigate }: { msg: Message; onNavigate: (path: string) => void }) {
  const isUser = msg.role === 'user'
  return (
    <div style={{
      display:       'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      gap:           8,
      alignItems:    'flex-start',
    }}>
      {/* Avatar */}
      <div style={{
        width:          30,
        height:         30,
        borderRadius:   '50%',
        background:     isUser ? BRAND.green : '#F0F0F0',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        fontSize:       14,
        color:          isUser ? '#fff' : '#666',
      }}>
        {isUser ? <UserOutlined /> : <RobotOutlined />}
      </div>

      {/* Bubble */}
      <div style={{
        maxWidth:     '78%',
        background:   isUser ? BRAND.green : '#F8F8F8',
        color:        isUser ? '#fff' : '#333',
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        padding:      '10px 14px',
        fontSize:     13,
        lineHeight:   1.6,
        whiteSpace:   'pre-wrap',
        wordBreak:    'break-word',
        border:       isUser ? 'none' : '1px solid #EFEFEF',
      }}>
        {isUser ? msg.content : parseLinks(msg.content, onNavigate)}
      </div>
    </div>
  )
}

export default function ChatBot() {
  const screens    = useBreakpoint()
  const isMobile   = !screens.md
  const router     = useRouter()

  function handleNavigate(path: string) {
    setOpen(false)
    router.push(path)
  }

  function openChat() {
    setCallout(false)
    setOpen(o => !o)
  }

  const [open,      setOpen]      = useState(false)
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [callout,   setCallout]   = useState(false)

  // Show callout on every visit, dismiss after 6s or when user opens chat
  useEffect(() => {
    const show = setTimeout(() => setCallout(true), 1200)
    const hide = setTimeout(() => setCallout(false), 7200)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [])

  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<InputRef>(null)
  const abortRef   = useRef<AbortController | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const userMsg: Message = { role: 'user', content: trimmed }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: next }),
        signal:  abortRef.current.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error('Chat request failed')
      }

      // Start streaming
      setLoading(false)
      setStreaming(true)

      const assistantMsg: Message = { role: 'assistant', content: '' }
      setMessages(prev => [...prev, assistantMsg])

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + chunk,
          }
          return updated
        })
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, {
          role:    'assistant',
          content: 'Sorry, something went wrong. Please try again.',
        }])
      }
    } finally {
      setLoading(false)
      setStreaming(false)
    }
  }, [messages, loading])

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  function clearChat() {
    abortRef.current?.abort()
    setMessages([])
    setLoading(false)
    setStreaming(false)
  }

  // ── Panel dimensions ─────────────────────────────────────
  const panelStyle: React.CSSProperties = isMobile
    ? {
        position:     'fixed',
        bottom:       68,   // above bottom nav
        left:         0,
        right:        0,
        height:       '72vh',
        background:   '#fff',
        borderRadius: '20px 20px 0 0',
        boxShadow:    '0 -4px 24px rgba(0,0,0,0.14)',
        display:      'flex',
        flexDirection:'column',
        zIndex:       400,
      }
    : {
        position:     'fixed',
        bottom:       88,
        right:        24,
        width:        380,
        height:       520,
        background:   '#fff',
        borderRadius: 16,
        boxShadow:    '0 8px 32px rgba(0,0,0,0.16)',
        display:      'flex',
        flexDirection:'column',
        zIndex:       400,
        overflow:     'hidden',
      }

  return (
    <>
      {/* ── Keyframes ── */}
      <style>{`
        @keyframes chatBotBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
        @keyframes chatPulse {
          0%   { transform: scale(1);    opacity: 0.6; }
          70%  { transform: scale(1.9);  opacity: 0;   }
          100% { transform: scale(1.9);  opacity: 0;   }
        }
        @keyframes chatCalloutIn {
          from { opacity: 0; transform: translateY(6px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0)   scale(1);    }
        }
        @keyframes chatCalloutOut {
          from { opacity: 1; }
          to   { opacity: 0; transform: translateY(4px); }
        }
      `}</style>

      {/* ── Chat panel ── */}
      {open && (
        <div style={panelStyle}>

          {/* Header */}
          <div style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '14px 16px 12px',
            borderBottom:   '1px solid #F0F0F0',
            flexShrink:     0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: BRAND.green,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, color: '#fff',
              }}>
                <RobotOutlined />
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#333' }}>Foodco Assistant</div>
                <div style={{ fontSize: 11, color: '#52c41a' }}>● Online — live data</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {messages.length > 0 && (
                <Button
                  type="text"
                  size="small"
                  icon={<ClearOutlined />}
                  onClick={clearChat}
                  title="Clear chat"
                  style={{ color: '#bbb' }}
                />
              )}
              <Button
                type="text"
                icon={<CloseOutlined />}
                onClick={() => setOpen(false)}
                style={{
                  color:  '#888',
                  width:  isMobile ? 40 : 28,
                  height: isMobile ? 40 : 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isMobile ? 16 : 14,
                }}
              />
            </div>
          </div>

          {/* Messages area */}
          <div style={{
            flex:      1,
            overflowY: 'auto',
            padding:   '16px 14px',
            display:   'flex',
            flexDirection: 'column',
            gap:       14,
          }}>
            {messages.length === 0 ? (
              /* Empty state — starter prompts */
              <div style={{ marginTop: 12 }}>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: BRAND.greenBg, margin: '0 auto 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 24, color: BRAND.green,
                  }}>
                    <RobotOutlined />
                  </div>
                  <Text strong style={{ fontSize: 14 }}>Ask me anything about the store</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>I have live data from today's operations</Text>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {STARTERS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      style={{
                        border:       `1px solid ${BRAND.green}30`,
                        borderRadius: 10,
                        padding:      '10px 14px',
                        background:   BRAND.greenBg,
                        cursor:       'pointer',
                        textAlign:    'left',
                        fontSize:     13,
                        color:        BRAND.green,
                        fontWeight:   500,
                        transition:   'all 0.15s',
                        fontFamily:   "var(--font-open-sans, 'Open Sans', sans-serif)",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => (
                  <MessageBubble key={i} msg={msg} onNavigate={handleNavigate} />
                ))}
                {loading && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: '#F0F0F0', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <RobotOutlined style={{ fontSize: 14, color: '#666' }} />
                    </div>
                    <div style={{
                      background: '#F8F8F8', border: '1px solid #EFEFEF',
                      borderRadius: '4px 16px 16px 16px', padding: '10px 14px',
                    }}>
                      <TypingDots />
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div style={{
            padding:      '12px 14px',
            borderTop:    '1px solid #F0F0F0',
            display:      'flex',
            gap:          8,
            alignItems:   'flex-end',
            flexShrink:   0,
            paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : 12,
          }}>
            <Input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about today's operations..."
              disabled={loading || streaming}
              style={{ borderRadius: 20, fontSize: 13 }}
              styles={{ input: { paddingLeft: 14 } }}
            />
            <Button
              type="primary"
              shape="circle"
              icon={<SendOutlined />}
              loading={loading}
              disabled={!input.trim() || streaming}
              onClick={() => send(input)}
              style={{ background: BRAND.green, borderColor: BRAND.green, flexShrink: 0 }}
            />
          </div>
        </div>
      )}

      {/* ── Floating trigger button (hidden on mobile when panel is open) ── */}
      {!(open && isMobile) && (
        <div style={{
          position: 'fixed',
          bottom:   isMobile ? 76 : 24,
          right:    24,
          zIndex:   401,
        }}>
          {/* Callout bubble */}
          {callout && !open && (
            <div style={{
              position:     'absolute',
              bottom:       62,
              right:        0,
              background:   '#1a1a1a',
              color:        '#fff',
              borderRadius: 12,
              padding:      '10px 14px',
              fontSize:     13,
              fontWeight:   500,
              whiteSpace:   'nowrap',
              boxShadow:    '0 4px 16px rgba(0,0,0,0.28)',
              animation:    'chatCalloutIn 0.3s ease forwards',
              pointerEvents:'none',
            }}>
              Ask me anything about today&apos;s store
              {/* tail */}
              <div style={{
                position:    'absolute',
                bottom:      -7,
                right:       18,
                width:       0,
                height:      0,
                borderLeft:  '7px solid transparent',
                borderRight: '7px solid transparent',
                borderTop:   '8px solid #1a1a1a',
              }} />
            </div>
          )}

          {/* Pulse ring — only when button is idle (not open) */}
          {!open && (
            <div style={{
              position:     'absolute',
              inset:        0,
              borderRadius: '50%',
              background:   BRAND.green,
              animation:    'chatPulse 2s ease-out infinite',
              pointerEvents:'none',
            }} />
          )}

          {/* The button itself */}
          <button
            onClick={openChat}
            style={{
              position:       'relative',
              width:          52,
              height:         52,
              borderRadius:   '50%',
              background:     open ? '#555' : BRAND.green,
              border:         'none',
              cursor:         'pointer',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              fontSize:       22,
              color:          '#fff',
              boxShadow:      '0 4px 16px rgba(0,0,0,0.22)',
              transition:     'background 0.2s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {open ? <CloseOutlined style={{ fontSize: 18 }} /> : <MessageOutlined />}
          </button>
        </div>
      )}
    </>
  )
}

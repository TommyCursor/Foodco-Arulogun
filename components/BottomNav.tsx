'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Drawer } from 'antd'
import { EllipsisOutlined } from '@ant-design/icons'
import { BRAND } from '@/lib/constants'

export interface BottomNavItem {
  key:        string
  icon:       React.ReactNode
  label:      React.ReactNode
  permission?: string
}

// Short display labels for the bottom nav (icon + 1 word)
const SHORT_LABEL: Record<string, string> = {
  '/dashboard':       'Home',
  '/inventory':       'Stock',
  '/sales':           'Sales',
  '/expiring':        'Expiry',
  '/damage':          'Damage',
  '/discounts':       'Discounts',
  '/reports':         'Reports',
  '/alerts':          'Alerts',
  '/loss-control':    'LC',
  '/resolution':      'Resolve',
  '/approval':        'Approval',
  '/users':           'Users',
  '/cashier-actions': 'Queue',
  '/roster':          'Roster',
  '/logistics':       'Logistics',
  '/scan':            'Scan',
  '/audit':           'Audit',
}

const MAX_PRIMARY = 4

interface Props {
  items: BottomNavItem[]
}

export default function BottomNav({ items }: Props) {
  const pathname                  = usePathname()
  const router                    = useRouter()
  const [moreOpen, setMoreOpen]   = useState(false)

  if (!items.length) return null

  const primary  = items.slice(0, MAX_PRIMARY)
  const overflow = items.slice(MAX_PRIMARY)
  const moreActive = overflow.some(i => pathname === i.key || pathname.startsWith(i.key + '/'))

  function go(key: string) {
    router.push(key)
    setMoreOpen(false)
  }

  function isActive(key: string) {
    return pathname === key || pathname.startsWith(key + '/')
  }

  return (
    <>
      <nav
        className="bottom-nav-safe"
        style={{
          position:   'fixed',
          bottom:     0,
          left:       0,
          right:      0,
          height:     60,
          background: '#fff',
          borderTop:  '1px solid #e8e8e8',
          display:    'flex',
          zIndex:     300,
          boxShadow:  '0 -2px 12px rgba(0,0,0,0.07)',
        }}
      >
        {primary.map(item => {
          const active = isActive(item.key)
          return (
            <TabButton
              key={item.key}
              icon={item.icon}
              label={SHORT_LABEL[item.key] ?? item.key.replace('/', '')}
              active={active}
              onClick={() => go(item.key)}
            />
          )
        })}

        {overflow.length > 0 && (
          <TabButton
            icon={<EllipsisOutlined />}
            label="More"
            active={moreActive}
            onClick={() => setMoreOpen(true)}
          />
        )}
      </nav>

      {/* ── Overflow drawer ── */}
      <Drawer
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        placement="bottom"
        height="auto"
        title={null}
        closeIcon={null}
        styles={{
          body:   { padding: '16px 12px 24px' },
          mask:   { backdropFilter: 'blur(2px)' },
          header: { display: 'none' },
          wrapper:{ borderRadius: '16px 16px 0 0', overflow: 'hidden' },
        }}
      >
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, background: '#ddd', borderRadius: 2, margin: '0 auto 16px' }} />

        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap:                 8,
        }}>
          {overflow.map(item => {
            const active = isActive(item.key)
            return (
              <button
                key={item.key}
                onClick={() => go(item.key)}
                style={{
                  border:         'none',
                  background:     active ? BRAND.greenBg : '#fafafa',
                  cursor:         'pointer',
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  justifyContent: 'center',
                  gap:            6,
                  color:          active ? BRAND.green : '#555',
                  fontSize:       11,
                  fontWeight:     active ? 600 : 400,
                  fontFamily:     "var(--font-open-sans, 'Open Sans', sans-serif)",
                  padding:        '14px 8px',
                  borderRadius:   12,
                  border:         `1px solid ${active ? BRAND.green + '40' : '#eee'}`,
                  transition:     'all 0.15s',
                }}
              >
                <span style={{ fontSize: 22 }}>{item.icon}</span>
                <span style={{ lineHeight: 1.2, textAlign: 'center' }}>
                  {SHORT_LABEL[item.key] ?? item.key.replace('/', '')}
                </span>
              </button>
            )
          })}
        </div>
      </Drawer>
    </>
  )
}

function TabButton({
  icon, label, active, onClick,
}: {
  icon:    React.ReactNode
  label:   string
  active:  boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex:           1,
        border:         'none',
        borderTop:      `2.5px solid ${active ? BRAND.green : 'transparent'}`,
        background:     'none',
        cursor:         'pointer',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            2,
        color:          active ? BRAND.green : '#9e9e9e',
        fontSize:       10,
        fontWeight:     active ? 600 : 400,
        fontFamily:     "var(--font-open-sans, 'Open Sans', sans-serif)",
        padding:        '4px 2px',
        transition:     'color 0.15s',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
      <span style={{ lineHeight: 1, letterSpacing: 0.1 }}>{label}</span>
    </button>
  )
}

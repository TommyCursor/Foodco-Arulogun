'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Layout, Menu, Avatar, Dropdown, Typography, Space, Button, Grid, Spin,
} from 'antd'
import {
  DashboardOutlined, InboxOutlined, WarningOutlined, TagOutlined,
  FileExcelOutlined, BellOutlined, TeamOutlined, BarChartOutlined,
  LogoutOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  ClockCircleOutlined, SendOutlined, SolutionOutlined, AuditOutlined,
  HistoryOutlined, CalendarOutlined, AlertOutlined, ShoppingCartOutlined, ScanOutlined,
  CarOutlined,
} from '@ant-design/icons'
import { Tag } from 'antd'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/constants'
import { useProfile } from '@/lib/hooks/useProfile'
import NotificationBell from '@/components/NotificationBell'
import BottomNav from '@/components/BottomNav'

const { Sider, Header, Content } = Layout
const { Text } = Typography
const { useBreakpoint } = Grid

const LOSS_SUBMENU_KEY   = 'loss-reports'
const LOSS_SUBMENU_PATHS = new Set(['/expiring', '/damage', '/discounts'])
const LC_SUBMENU_KEY     = 'loss-control-group'
const LC_SUBMENU_PATHS   = new Set(['/loss-control', '/resolution'])

const NAV = [
  { key: '/dashboard',       label: 'Dashboard',          icon: <DashboardOutlined />, permission: 'view_dashboard'    },
  { key: '/inventory',       label: 'Inventory',           icon: <InboxOutlined />,     permission: 'view_inventory'    },
  {
    key: '/sales',
    icon: <BarChartOutlined />,
    permission: 'view_sales',
    label: (
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        Sales Analyst
        <Tag color="gold" style={{ fontSize: 9, padding: '0 4px', lineHeight: '16px', marginLeft: 2 }}>
          ANALYTICS
        </Tag>
      </span>
    ),
  },
  { key: '/expiring',        label: 'About to Expire',     icon: <ClockCircleOutlined />,  permission: 'view_inventory'    },
  { key: '/damage',          label: 'Damage Log',          icon: <WarningOutlined />,      permission: 'mark_damage'       },
  { key: '/discounts',       label: 'Discounts',           icon: <TagOutlined />,          permission: 'manage_discounts'  },
  { key: '/reports',         label: 'Reports',             icon: <FileExcelOutlined />,    permission: 'view_reports'      },
  { key: '/alerts',          label: 'Alerts',              icon: <BellOutlined />,         permission: 'create_alerts'     },
  { key: '/loss-control',    label: 'Send to Loss Control',icon: <SendOutlined />,         permission: 'view_loss_control' },
  { key: '/resolution',      label: 'Resolution',          icon: <SolutionOutlined />,     permission: 'view_resolution'   },
  { key: '/approval',        label: 'Approval',            icon: <AuditOutlined />,        permission: 'view_approval'     },
  { key: '/users',           label: 'Users',               icon: <TeamOutlined />,         permission: 'manage_users'      },
  { key: '/cashier-actions', label: 'Cashier Queue',       icon: <ShoppingCartOutlined />, permission: 'view_cashier_queue'},
  { key: '/roster',          label: 'Staff Roster',        icon: <CalendarOutlined />,     permission: 'view_roster'       },
  { key: '/logistics',       label: 'Logistics',           icon: <CarOutlined />,          permission: 'view_logistics'    },
  { key: '/scan',            label: 'Image to Text',       icon: <ScanOutlined />,         permission: 'view_scan'         },
  { key: '/audit',           label: 'Audit Trail',         icon: <HistoryOutlined />,      permission: 'view_audit'        },
]

function roleLabel(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed] = useState(false)
  const pathname    = usePathname()
  const router      = useRouter()
  const supabase    = createClient()
  const screens     = useBreakpoint()
  const isMobile    = !screens.md
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const { profile, loading } = useProfile()
  const visibleNav = loading ? [] : NAV

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleNavClick(key: string) {
    router.push(key)
  }

  const userMenuItems = [
    { key: 'profile', label: 'My Profile', icon: <UserOutlined /> },
    { type: 'divider' as const },
    { key: 'logout',  label: 'Sign Out',   icon: <LogoutOutlined />, danger: true },
  ]

  // Build sidebar menu (grouped with submenus) — desktop only
  const menuItems = (() => {
    if (loading) return []

    const lossChildren = visibleNav
      .filter(n => LOSS_SUBMENU_PATHS.has(n.key))
      .map(({ key, label, icon }) => ({ key, label, icon }))

    const lcChildren = visibleNav
      .filter(n => LC_SUBMENU_PATHS.has(n.key))
      .map(({ key, label, icon }) => ({ key, label, icon }))

    const flatItems = visibleNav.filter(
      n => !LOSS_SUBMENU_PATHS.has(n.key) && !LC_SUBMENU_PATHS.has(n.key)
    )

    const reportsIdx  = flatItems.findIndex(i => i.key === '/reports')
    const approvalIdx = flatItems.findIndex(i => i.key === '/approval')
    const lossPos     = reportsIdx  >= 0 ? reportsIdx  : flatItems.length
    const lcPos       = approvalIdx >= 0 ? approvalIdx : flatItems.length

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any[] = []
    flatItems.forEach((item, idx) => {
      if (idx === lossPos && lossChildren.length > 0)
        result.push({ key: LOSS_SUBMENU_KEY, label: 'Loss Reports', icon: <AlertOutlined />, children: lossChildren })
      if (idx === lcPos && lcChildren.length > 0)
        result.push({ key: LC_SUBMENU_KEY, label: 'Loss Control', icon: <SendOutlined />, children: lcChildren })
      result.push({ key: item.key, label: item.label, icon: item.icon })
    })
    if (lossPos === flatItems.length && lossChildren.length > 0)
      result.push({ key: LOSS_SUBMENU_KEY, label: 'Loss Reports', icon: <AlertOutlined />, children: lossChildren })
    if (lcPos === flatItems.length && lcChildren.length > 0)
      result.push({ key: LC_SUBMENU_KEY, label: 'Loss Control', icon: <SendOutlined />, children: lcChildren })

    return result
  })()

  const NavMenu = loading ? (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 32 }}>
      <Spin size="small" />
    </div>
  ) : (
    <Menu
      mode="inline"
      theme="dark"
      selectedKeys={[pathname]}
      defaultOpenKeys={[
        ...(LOSS_SUBMENU_PATHS.has(pathname) ? [LOSS_SUBMENU_KEY] : []),
        ...(LC_SUBMENU_PATHS.has(pathname)   ? [LC_SUBMENU_KEY]   : []),
      ]}
      onClick={({ key }) => {
        if (key !== LOSS_SUBMENU_KEY && key !== LC_SUBMENU_KEY) handleNavClick(key)
      }}
      style={{ background: 'transparent', border: 'none', marginTop: 8, overflowY: 'auto', flex: 1 }}
      items={menuItems}
    />
  )

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U'

  const sideWidth = sidebarCollapsed ? 80 : 220

  return (
    <Layout style={{ minHeight: '100vh' }}>

      {/* ── Desktop Sidebar ── */}
      {!isMobile && (
        <Sider
          collapsible
          collapsed={sidebarCollapsed}
          trigger={null}
          width={220}
          style={{
            background:  BRAND.green,
            position:    'fixed',
            height:      '100vh',
            left:        0,
            top:         0,
            zIndex:      100,
            boxShadow:   '2px 0 8px rgba(0,0,0,0.15)',
            overflow:    'hidden',
            display:     'flex',
            flexDirection: 'column',
          }}
        >
          {/* Logo */}
          <div style={{
            height:        72,
            display:       'flex',
            alignItems:    'center',
            justifyContent:'center',
            padding:       sidebarCollapsed ? '8px 0' : '8px 16px',
            borderBottom:  '1px solid rgba(255,255,255,0.12)',
            background:    BRAND.white,
            flexShrink:    0,
          }}>
            <Image
              src="/logo.png"
              alt="Foodco Arulogun"
              width={sidebarCollapsed ? 36 : 140}
              height={sidebarCollapsed ? 36 : 52}
              style={{ objectFit: 'contain' }}
              priority
            />
          </div>
          {NavMenu}
        </Sider>
      )}

      {/* ── Main Area ── */}
      <Layout style={{ marginLeft: isMobile ? 0 : sideWidth, transition: 'margin-left 0.2s' }}>

        {/* ── Header ── */}
        <Header style={{
          position:   'sticky',
          top:        0,
          zIndex:     99,
          background: BRAND.white,
          padding:    isMobile ? '0 16px' : '0 24px',
          display:    'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow:  '0 1px 4px rgba(0,0,0,0.08)',
          height:     64,
        }}>
          {/* Left: logo on mobile, collapse toggle on desktop */}
          {isMobile ? (
            <Image
              src="/logo.png"
              alt="Foodco"
              width={100}
              height={36}
              style={{ objectFit: 'contain' }}
              priority
            />
          ) : (
            <Button
              type="text"
              icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setSidebarCollapsed(p => !p)}
              style={{ fontSize: 18, color: BRAND.green }}
            />
          )}

          {/* Right: notifications + avatar */}
          <Space size={12}>
            <NotificationBell />
            <Dropdown
              menu={{
                items: userMenuItems,
                onClick: ({ key }) => key === 'logout' && handleLogout(),
              }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Space style={{ cursor: 'pointer' }} size={8}>
                <Avatar style={{ background: BRAND.green, fontWeight: 600 }} size={34}>
                  {initials}
                </Avatar>
                {!isMobile && (
                  <div style={{ lineHeight: 1.2 }}>
                    <Text strong style={{ fontSize: 13, display: 'block' }}>
                      {profile?.full_name ?? '…'}
                    </Text>
                    {profile?.role_name && (
                      <Text style={{ fontSize: 11, color: '#888', display: 'block' }}>
                        {roleLabel(profile.role_name)}
                      </Text>
                    )}
                  </div>
                )}
              </Space>
            </Dropdown>
          </Space>
        </Header>

        {/* ── Page content ── */}
        <Content
          className={isMobile ? 'mobile-content-pad' : ''}
          style={{ padding: isMobile ? '16px' : '24px', minHeight: 'calc(100vh - 64px)' }}
        >
          {children}
        </Content>
      </Layout>

      {/* ── Mobile Bottom Navigation ── */}
      {isMobile && <BottomNav items={visibleNav} />}
    </Layout>
  )
}

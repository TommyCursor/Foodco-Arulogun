'use client'

import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  Layout, Menu, Avatar, Dropdown, Typography, Space, Button, Drawer, Grid, Spin,
} from 'antd'
import {
  DashboardOutlined, InboxOutlined, WarningOutlined, TagOutlined,
  FileExcelOutlined, BellOutlined, TeamOutlined, BarChartOutlined,
  LogoutOutlined, UserOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  MenuOutlined, ClockCircleOutlined, SendOutlined, SolutionOutlined, AuditOutlined,
  HistoryOutlined, CalendarOutlined, AlertOutlined, ShoppingCartOutlined, ScanOutlined,
  CarOutlined,
} from '@ant-design/icons'
import { Tag } from 'antd'
import { createClient } from '@/lib/supabase/client'
import { BRAND } from '@/lib/constants'
import { useProfile } from '@/lib/hooks/useProfile'
import NotificationBell from '@/components/NotificationBell'

const { Sider, Header, Content } = Layout
const { Text } = Typography
const { useBreakpoint } = Grid

// Keys that belong inside the "Loss Reports" submenu
const LOSS_SUBMENU_KEY   = 'loss-reports'
const LOSS_SUBMENU_PATHS = new Set(['/expiring', '/damage', '/discounts'])

// Keys that belong inside the "Loss Control" submenu
const LC_SUBMENU_KEY   = 'loss-control-group'
const LC_SUBMENU_PATHS = new Set(['/loss-control', '/resolution'])

// Nav items — each requires a specific permission key to appear
const NAV = [
  { key: '/dashboard',  label: 'Dashboard',  icon: <DashboardOutlined />, permission: 'view_dashboard'   },
  { key: '/inventory',  label: 'Inventory',  icon: <InboxOutlined />,     permission: 'view_inventory'   },
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
  { key: '/expiring',        label: 'About to Expire',      icon: <ClockCircleOutlined />,  permission: 'view_inventory'    },
  { key: '/damage',          label: 'Damage Log',           icon: <WarningOutlined />,      permission: 'mark_damage'       },
  { key: '/discounts',       label: 'Discounts',            icon: <TagOutlined />,          permission: 'manage_discounts'  },
  { key: '/reports',         label: 'Reports',              icon: <FileExcelOutlined />,    permission: 'view_reports'      },
  { key: '/alerts',          label: 'Alerts',               icon: <BellOutlined />,         permission: 'create_alerts'     },
  { key: '/loss-control',    label: 'Send to Loss Control', icon: <SendOutlined />,         permission: 'view_loss_control' },
  { key: '/resolution',      label: 'Resolution',           icon: <SolutionOutlined />,     permission: 'view_resolution'   },
  { key: '/approval',        label: 'Approval',             icon: <AuditOutlined />,        permission: 'view_approval'     },
  { key: '/users',           label: 'Users',                icon: <TeamOutlined />,         permission: 'manage_users'      },
  { key: '/cashier-actions', label: 'Cashier Queue',        icon: <ShoppingCartOutlined />, permission: 'view_cashier_queue'},
  { key: '/roster',          label: 'Staff Roster',         icon: <CalendarOutlined />,     permission: 'view_roster'       },
  { key: '/logistics',       label: 'Logistics',            icon: <CarOutlined />,          permission: 'view_logistics'    },
  { key: '/scan',            label: 'Image to Text',        icon: <ScanOutlined />,         permission: 'view_scan'         },
  { key: '/audit',           label: 'Audit Trail',          icon: <HistoryOutlined />,      permission: 'view_audit'        },
]

function roleLabel(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed,     setCollapsed]     = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const pathname  = usePathname()
  const router    = useRouter()
  const supabase  = createClient()
  const screens   = useBreakpoint()
  const isMobile  = !screens.md

  const { profile, loading } = useProfile()

  // Show all nav items — unauthorized pages redirect to /unauthorized with Access Denied
  const visibleNav = loading ? [] : NAV

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  function handleNavClick(key: string) {
    router.push(key)
    setMobileNavOpen(false)
  }

  const userMenuItems = [
    { key: 'profile', label: 'My Profile', icon: <UserOutlined /> },
    { type: 'divider' as const },
    { key: 'logout',  label: 'Sign Out',   icon: <LogoutOutlined />, danger: true },
  ]

  // Build menu items — group into two submenus
  const menuItems = (() => {
    if (loading) return []

    const lossReportChildren = visibleNav
      .filter(n => LOSS_SUBMENU_PATHS.has(n.key))
      .map(({ key, label, icon }) => ({ key, label, icon }))

    const lcChildren = visibleNav
      .filter(n => LC_SUBMENU_PATHS.has(n.key))
      .map(({ key, label, icon }) => ({ key, label, icon }))

    const flatItems = visibleNav.filter(
      n => !LOSS_SUBMENU_PATHS.has(n.key) && !LC_SUBMENU_PATHS.has(n.key)
    )

    // "Loss Reports" group goes right before /reports
    const reportsIdx = flatItems.findIndex(i => i.key === '/reports')
    const lossPos = reportsIdx >= 0 ? reportsIdx : flatItems.length

    // "Loss Control" group goes right before /approval
    const approvalIdx = flatItems.findIndex(i => i.key === '/approval')
    const lcPos = approvalIdx >= 0 ? approvalIdx : flatItems.length

    // Build final array in one pass
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any[] = []
    flatItems.forEach((item, idx) => {
      if (idx === lossPos && lossReportChildren.length > 0) {
        result.push({ key: LOSS_SUBMENU_KEY, label: 'Loss Reports', icon: <AlertOutlined />, children: lossReportChildren })
      }
      if (idx === lcPos && lcChildren.length > 0) {
        result.push({ key: LC_SUBMENU_KEY, label: 'Loss Control', icon: <SendOutlined />, children: lcChildren })
      }
      result.push({ key: item.key, label: item.label, icon: item.icon })
    })
    // Handle edge case where inserts are at end
    if (lossPos === flatItems.length && lossReportChildren.length > 0)
      result.push({ key: LOSS_SUBMENU_KEY, label: 'Loss Reports', icon: <AlertOutlined />, children: lossReportChildren })
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
      onClick={({ key }) => { if (key !== LOSS_SUBMENU_KEY && key !== LC_SUBMENU_KEY) handleNavClick(key) }}
      style={{ background: 'transparent', border: 'none', marginTop: 8 }}
      items={menuItems}
    />
  )

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'U'

  const BrandLogo = ({ small }: { small?: boolean }) => (
    <div
      style={{
        height: 72,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: small ? '8px 0' : '8px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.12)',
        background: BRAND.white,
      }}
    >
      <Image
        src="/logo.png"
        alt="Foodco Arulogun"
        width={small ? 36 : 140}
        height={small ? 36 : 52}
        style={{ objectFit: 'contain' }}
        priority
      />
    </div>
  )

  return (
    <Layout style={{ minHeight: '100vh' }}>

      {/* ── Desktop Sidebar ── */}
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          trigger={null}
          width={220}
          style={{
            background: BRAND.green,
            position: 'fixed',
            height: '100vh',
            left: 0,
            top: 0,
            zIndex: 100,
            boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
            overflow: 'hidden',
          }}
        >
          <BrandLogo small={collapsed} />
          {NavMenu}
        </Sider>
      )}

      {/* ── Mobile Nav Drawer ── */}
      {isMobile && (
        <Drawer
          open={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          placement="left"
          width={240}
          styles={{
            body: { padding: 0, background: BRAND.green },
            header: { display: 'none' },
          }}
        >
          <div style={{ background: BRAND.white, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Image src="/logo.png" alt="Foodco Arulogun" width={130} height={48} style={{ objectFit: 'contain' }} priority />
          </div>
          {NavMenu}
        </Drawer>
      )}

      {/* ── Main Area ── */}
      <Layout style={{ marginLeft: isMobile ? 0 : (collapsed ? 80 : 220), transition: 'margin-left 0.2s' }}>

        {/* Header */}
        <Header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 99,
            background: BRAND.white,
            padding: isMobile ? '0 16px' : '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
            height: 64,
          }}
        >
          {/* Left: hamburger (mobile) or collapse toggle (desktop) */}
          {isMobile ? (
            <Button
              type="text"
              icon={<MenuOutlined style={{ fontSize: 20 }} />}
              onClick={() => setMobileNavOpen(true)}
              style={{ color: BRAND.green }}
            />
          ) : (
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 18, color: BRAND.green }}
            />
          )}

          {/* Right side */}
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

        {/* Page content */}
        <Content style={{ padding: isMobile ? '16px' : '24px', minHeight: 'calc(100vh - 64px)' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}

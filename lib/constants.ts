// ─────────────────────────────────────────────
// Brand Colors
// ─────────────────────────────────────────────
export const BRAND = {
  green:    '#2E7D32',
  greenLight: '#4CAF50',
  greenBg:  '#E8F5E9',
  yellow:   '#FFC107',
  yellowBg: '#FFF8E1',
  white:    '#FFFFFF',
  grayBg:   '#F5F5F5',
  textDark: '#333333',
  critical: '#D32F2F',
  criticalBg: '#FFEBEE',
} as const

// ─────────────────────────────────────────────
// Ant Design Theme Tokens (brand override)
// ─────────────────────────────────────────────
export const ANT_THEME = {
  token: {
    colorPrimary:       BRAND.green,
    colorSuccess:       BRAND.green,
    colorWarning:       BRAND.yellow,
    colorError:         BRAND.critical,
    colorBgBase:        BRAND.white,
    colorBgLayout:      BRAND.grayBg,
    borderRadius:       8,
    fontFamily:         "'Open Sans', 'Segoe UI', sans-serif",
  },
  components: {
    Layout: {
      siderBg:          BRAND.green,
      triggerBg:        '#1B5E20',
    },
    Menu: {
      darkItemBg:       BRAND.green,
      darkItemSelectedBg: '#1B5E20',
      darkItemHoverBg:  '#388E3C',
      darkItemColor:    'rgba(255,255,255,0.85)',
      darkItemSelectedColor: BRAND.white,
    },
    Button: {
      primaryColor:     BRAND.white,
    },
  },
} as const

// ─────────────────────────────────────────────
// Expiry Thresholds (days)
// ─────────────────────────────────────────────
export const EXPIRY = {
  CRITICAL:  2,   // red badge
  WARNING:   7,   // yellow badge
  UPCOMING:  14,  // monitored
} as const

// ─────────────────────────────────────────────
// Discount Rules
// ─────────────────────────────────────────────
export const DISCOUNT = {
  APPROVAL_THRESHOLD: 30,   // % — requires manager/admin approval above this
  AI_TIERS: [
    { daysToExpiry: [5, 7],  percentage: 20 },
    { daysToExpiry: [2, 4],  percentage: 40 },
    { daysToExpiry: [0, 1],  percentage: 60 },
  ],
} as const

// ─────────────────────────────────────────────
// Store Department Categories
// ─────────────────────────────────────────────
export const STORE_CATEGORIES = [
  'Grocery',
  'Fresh Food',
  'Toiletries',
  'Baby',
  'Health & Beauty',
  '3F',
  'Cashier',
  'Household',
] as const

// ─────────────────────────────────────────────
// Navigation Items
// ─────────────────────────────────────────────
export const NAV_ITEMS = [
  { key: 'dashboard',  label: 'Dashboard',   path: '/dashboard',  icon: 'DashboardOutlined'  },
  { key: 'inventory',  label: 'Inventory',   path: '/inventory',  icon: 'InboxOutlined'      },
  { key: 'damage',     label: 'Damage Log',  path: '/damage',     icon: 'WarningOutlined'    },
  { key: 'discounts',  label: 'Discounts',   path: '/discounts',  icon: 'TagOutlined'        },
  { key: 'reports',    label: 'Reports',     path: '/reports',    icon: 'FileExcelOutlined'  },
  { key: 'alerts',     label: 'Alerts',      path: '/alerts',     icon: 'BellOutlined'       },
  { key: 'users',      label: 'Users',       path: '/users',      icon: 'TeamOutlined'       },
] as const

// ─────────────────────────────────────────────
// Permission Keys (must match DB permissions.key)
// ─────────────────────────────────────────────
export const PERMISSIONS = {
  // General
  VIEW_DASHBOARD:      'view_dashboard',
  // Inventory
  VIEW_INVENTORY:      'view_inventory',
  EDIT_INVENTORY:      'edit_inventory',
  MARK_DAMAGE:         'mark_damage',
  APPROVE_DAMAGE:      'approve_damage',
  // Discounts
  MANAGE_DISCOUNTS:    'manage_discounts',
  APPROVE_DISCOUNT:    'approve_discount',
  // Reports
  VIEW_REPORTS:        'view_reports',
  CREATE_REPORTS:      'create_reports',
  SEND_EMAILS:         'send_emails',
  // Alerts
  CREATE_ALERTS:       'create_alerts',
  RECEIVE_ALERTS:      'receive_alerts',
  // Users
  MANAGE_USERS:        'manage_users',
  // Roster
  VIEW_ROSTER:         'view_roster',
  MANAGE_ROSTER:       'manage_roster',
  PUBLISH_ROSTER:      'publish_roster',
  // Sales
  VIEW_SALES:          'view_sales',
  MANAGE_SALES:        'manage_sales',
  // Page access
  VIEW_APPROVAL:       'view_approval',
  VIEW_RESOLUTION:     'view_resolution',
  VIEW_CASHIER_QUEUE:  'view_cashier_queue',
  VIEW_LOSS_CONTROL:   'view_loss_control',
  VIEW_AUDIT:          'view_audit',
  VIEW_SCAN:           'view_scan',
  VIEW_LOGISTICS:      'view_logistics',
} as const

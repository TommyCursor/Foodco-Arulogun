'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Table, Tag, Button, Space, Typography, Modal, Form, Input,
  Select, Card, Badge, Row, Col, Avatar, Tooltip, Alert, App,
  Switch, Divider, Popconfirm,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  PlusOutlined, UserOutlined, MailOutlined,
  EditOutlined, StopOutlined, CheckOutlined, ExclamationCircleOutlined, KeyOutlined,
  DeleteOutlined, SafetyCertificateOutlined,
} from '@ant-design/icons'
import { BRAND } from '@/lib/constants'
import type { Profile, Role, Permission } from '@/types'

const { Title, Text } = Typography
const { Option } = Select

const ROLE_COLORS: Record<string, string> = {
  admin:               'red',
  manager:             'green',
  supervisor:          'cyan',
  cashier_supervisor:  'geekblue',
  cashier_team_lead:   'blue',
  cashier:             'purple',
  grocery_associate:   'orange',
  grocery_team_lead:   'gold',
  toiletries_associate:'lime',
  toiletries_team_lead:'yellow',
  '3f_associate':      'magenta',
  '3f_team_lead':      'volcano',
  sanitation_officer:  'default',
}

const PERMISSION_GROUPS = [
  { label: 'General',        keys: ['view_dashboard'] },
  { label: 'Inventory',      keys: ['view_inventory', 'edit_inventory', 'mark_damage', 'approve_damage'] },
  { label: 'Discounts',      keys: ['manage_discounts', 'approve_discount'] },
  { label: 'Reports',        keys: ['view_reports', 'create_reports', 'send_emails', 'view_loss_control'] },
  { label: 'Alerts',         keys: ['create_alerts', 'receive_alerts'] },
  { label: 'Approvals',      keys: ['view_approval', 'view_resolution'] },
  { label: 'Cashier',        keys: ['view_cashier_queue'] },
  { label: 'Roster',         keys: ['view_roster', 'manage_roster', 'publish_roster'] },
  { label: 'Sales',          keys: ['view_sales', 'manage_sales'] },
  { label: 'Logistics',      keys: ['view_logistics'] },
  { label: 'Tools & Admin',  keys: ['view_scan', 'view_audit', 'manage_users'] },
]

interface Props {
  profiles:        Profile[]
  roles:           Role[]
  permissions:     Permission[]
  rolePermissions: { role_id: number; permission_id: number }[]
  overrides:       { user_id: string; permission_key: string; granted: boolean }[]
  viewerRole:      string
}

export default function UsersClient({ profiles, roles, permissions, rolePermissions, overrides, viewerRole }: Props) {
  const router                            = useRouter()
  const { modal, notification }           = App.useApp()
  const [inviteOpen,    setInviteOpen]    = useState(false)
  const [editUser,      setEditUser]      = useState<Profile | null>(null)
  const [permUser,      setPermUser]      = useState<Profile | null>(null)
  const [permSaving,    setPermSaving]    = useState<string | null>(null)
  const [localOverrides, setLocalOverrides] = useState(overrides)
  const [localRolePerms, setLocalRolePerms] = useState(rolePermissions)
  const [roleView,      setRoleView]      = useState<number>(roles[0]?.id ?? 1)
  const [rolePermSaving, setRolePermSaving] = useState<string | null>(null) // `${roleId}:${permKey}`
  const [submitting,    setSubmitting]    = useState(false)
  const [inviteForm]                      = Form.useForm()
  const [editForm]                        = Form.useForm()

  // Build permission set for selected role
  const permissionsForRole = (roleId: number) =>
    new Set(rolePermissions.filter(rp => rp.role_id === roleId).map(rp => rp.permission_id))

  // ── Invite user ──
  async function handleInvite(values: Record<string, unknown>) {
    setSubmitting(true)
    try {
      const res = await fetch('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: values.email, full_name: values.full_name, role_id: values.role_id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setInviteOpen(false)
      inviteForm.resetFields()
      notification.success({
        message:     'Invitation sent!',
        description: `An email invite has been sent to ${values.email}.`,
        placement:   'topRight',
        duration:    4,
      })
      router.refresh()
    } catch (err: any) {
      notification.error({ message: 'Invite failed', description: err.message, placement: 'topRight', duration: 6 })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Edit role ──
  async function handleEditRole(values: Record<string, unknown>) {
    if (!editUser) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/users/${editUser.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role_id: values.role_id }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setEditUser(null)
      notification.success({ message: 'Role updated', placement: 'topRight', duration: 3 })
      router.refresh()
    } catch (err: any) {
      notification.error({ message: 'Update failed', description: err.message, placement: 'topRight', duration: 6 })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Toggle active (using modal.confirm from App.useApp — works in v5) ──
  function toggleActive(user: Profile) {
    const action = user.is_active ? 'deactivate' : 'reactivate'
    modal.confirm({
      title:   `${action.charAt(0).toUpperCase() + action.slice(1)} ${user.full_name}?`,
      icon:    <ExclamationCircleOutlined style={{ color: user.is_active ? BRAND.critical : BRAND.green }} />,
      content: user.is_active
        ? 'This user will no longer be able to log in.'
        : 'This user will regain access.',
      okText:  action.charAt(0).toUpperCase() + action.slice(1),
      okType:  user.is_active ? 'danger' : 'primary',
      async onOk() {
        await fetch(`/api/users/${user.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ is_active: !user.is_active }),
        })
        router.refresh()
      },
    })
  }

  // ── Role-level permission toggle (admin only) ──
  async function handleRolePermToggle(roleId: number, permKey: string, granted: boolean) {
    const saveKey = `${roleId}:${permKey}`
    setRolePermSaving(saveKey)
    try {
      const res = await fetch('/api/role-permissions', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ role_id: roleId, permission_key: permKey, granted }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const perm = permissions.find(p => p.key === permKey)
      if (perm) {
        setLocalRolePerms(prev => {
          const filtered = prev.filter(rp => !(rp.role_id === roleId && rp.permission_id === perm.id))
          return granted ? [...filtered, { role_id: roleId, permission_id: perm.id }] : filtered
        })
      }
    } catch (err: any) {
      notification.error({ message: 'Failed to update permission', description: err.message, placement: 'topRight', duration: 4 })
    } finally {
      setRolePermSaving(null)
    }
  }

  // ── Reset all overrides for a user ──
  async function handleResetAllOverrides(userId: string) {
    const userOverrides = localOverrides.filter(o => o.user_id === userId)
    await Promise.all(userOverrides.map(o =>
      fetch(`/api/users/${userId}/permissions`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ permission_key: o.permission_key }),
      })
    ))
    setLocalOverrides(prev => prev.filter(o => o.user_id !== userId))
    notification.success({ message: 'All overrides cleared', placement: 'topRight', duration: 3 })
  }

  // ── Permission override ──
  async function handleOverrideChange(userId: string, permKey: string, value: 'role' | 'grant' | 'revoke') {
    setPermSaving(permKey)
    try {
      if (value === 'role') {
        await fetch(`/api/users/${userId}/permissions`, {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ permission_key: permKey }),
        })
        setLocalOverrides(prev => prev.filter(o => !(o.user_id === userId && o.permission_key === permKey)))
      } else {
        const granted = value === 'grant'
        await fetch(`/api/users/${userId}/permissions`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ permission_key: permKey, granted }),
        })
        setLocalOverrides(prev => {
          const rest = prev.filter(o => !(o.user_id === userId && o.permission_key === permKey))
          return [...rest, { user_id: userId, permission_key: permKey, granted }]
        })
      }
    } finally {
      setPermSaving(null)
    }
  }

  // ── Columns ──
  const columns: ColumnsType<Profile> = [
    {
      title: 'User',
      key:   'user',
      render: (_, p) => {
        const initials = (p.full_name ?? 'U')
          .split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
        const email = (p as any).email
        return (
          <Space align="center">
            <Avatar style={{ background: BRAND.green, fontWeight: 700, flexShrink: 0 }}>
              {initials}
            </Avatar>
            <div>
              <Space size={6}>
                <Text strong style={{ fontSize: 13 }}>{p.full_name}</Text>
                {!p.is_active && <Tag color="red" style={{ fontSize: 10, padding: '0 4px' }}>Inactive</Tag>}
              </Space>
              {email && (
                <div>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    <MailOutlined style={{ marginRight: 4 }} />{email}
                  </Text>
                </div>
              )}
            </div>
          </Space>
        )
      },
    },
    {
      title:  'Role',
      key:    'role',
      width:  160,
      render: (_, p) => {
        const roleName = (p.role as any)?.name ?? roles.find(r => r.id === p.role_id)?.name ?? 'unknown'
        return (
          <Tag color={ROLE_COLORS[roleName] ?? 'default'} style={{ textTransform: 'capitalize' }}>
            {roleName.replace(/_/g, ' ')}
          </Tag>
        )
      },
      filters:  roles.map(r => ({ text: r.name.replace(/_/g, ' '), value: r.id })),
      onFilter: (value, p) => p.role_id === value,
    },
    {
      title:      'Status',
      dataIndex:  'is_active',
      width:      100,
      responsive: ['sm'],
      render:     v => v
        ? <Badge status="success" text="Active" />
        : <Badge status="error"   text="Inactive" />,
      filters:  [{ text: 'Active', value: true }, { text: 'Inactive', value: false }],
      onFilter: (value, p) => p.is_active === value,
    },
    {
      title:      'Joined',
      dataIndex:  'created_at',
      width:      120,
      responsive: ['sm'],
      render:     v => <Text style={{ fontSize: 12, color: '#888' }}>{new Date(v).toLocaleDateString('en-NG')}</Text>,
      sorter:     (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    },
    {
      title:  'Actions',
      key:    'actions',
      width:  viewerRole === 'admin' ? 140 : 110,
      render: (_, p) => (
        <Space size={4}>
          <Tooltip title="Change Role">
            <Button
              size="small"
              icon={<EditOutlined />}
              onClick={() => {
                setEditUser(p)
                editForm.setFieldsValue({ role_id: p.role_id })
              }}
            />
          </Tooltip>
          <Tooltip title={p.is_active ? 'Deactivate' : 'Reactivate'}>
            <Button
              size="small"
              icon={p.is_active ? <StopOutlined /> : <CheckOutlined />}
              danger={p.is_active}
              onClick={() => toggleActive(p)}
            />
          </Tooltip>
          {viewerRole === 'admin' && (
            <Tooltip title="Manage Permissions">
              <Button
                size="small"
                icon={<KeyOutlined />}
                onClick={() => setPermUser(p)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ]

  const activeCount   = profiles.filter(p => p.is_active).length
  const inactiveCount = profiles.length - activeCount

  return (
    <>
      <Row gutter={[24, 24]}>
        {/* ── User List ── */}
        <Col xs={24} xl={15}>
          <Card
            bordered={false}
            style={{ borderRadius: 8 }}
            title={
              <div>
                <Title level={5} style={{ margin: 0, color: BRAND.green }}>
                  Staff Accounts ({profiles.length})
                </Title>
                <Space size={12} style={{ marginTop: 2 }}>
                  <Text style={{ fontSize: 12, color: '#52c41a' }}>{activeCount} active</Text>
                  {inactiveCount > 0 && (
                    <Text style={{ fontSize: 12, color: '#ff4d4f' }}>{inactiveCount} inactive</Text>
                  )}
                </Space>
              </div>
            }
            extra={
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setInviteOpen(true)}
                style={{ background: BRAND.green }}
              >
                Invite Staff
              </Button>
            }
          >
            <Table
              dataSource={profiles}
              columns={columns}
              rowKey="id"
              size="small"
              scroll={{ x: 520 }}
              pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
              rowClassName={p => !p.is_active ? 'ant-table-row-inactive' : ''}
            />
          </Card>
        </Col>

        {/* ── Permission Matrix ── */}
        <Col xs={24} xl={9}>
          <Card
            bordered={false}
            style={{ borderRadius: 8 }}
            title={
              <div>
                <Title level={5} style={{ margin: 0, color: BRAND.green }}>
                  <SafetyCertificateOutlined style={{ marginRight: 6 }} />
                  Role Permissions
                </Title>
                {viewerRole === 'admin' && (
                  <Text type="secondary" style={{ fontSize: 11 }}>Toggle to edit role-level access</Text>
                )}
              </div>
            }
            extra={
              <Select value={roleView} onChange={setRoleView} size="small" style={{ minWidth: 140, maxWidth: 200 }}>
                {roles.map(r => (
                  <Option key={r.id} value={r.id}>
                    <Tag color={ROLE_COLORS[r.name] ?? 'default'} style={{ fontSize: 11 }}>{r.name.replace(/_/g, ' ')}</Tag>
                  </Option>
                ))}
              </Select>
            }
          >
            {PERMISSION_GROUPS.map(group => {
              const groupPerms = permissions.filter(p => group.keys.includes(p.key))
              if (groupPerms.length === 0) return null
              return (
                <div key={group.label} style={{ marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 11, color: BRAND.green, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', padding: '8px 4px 4px' }}>
                    {group.label}
                  </Text>
                  {groupPerms.map(p => {
                    const hasIt   = new Set(localRolePerms.filter(rp => rp.role_id === roleView).map(rp => rp.permission_id)).has(p.id)
                    const saveKey = `${roleView}:${p.key}`
                    return (
                      <div
                        key={p.id}
                        style={{
                          display:        'flex',
                          alignItems:     'center',
                          justifyContent: 'space-between',
                          padding:        '6px 4px',
                          borderBottom:   '1px solid #f5f5f5',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <Text style={{ fontSize: 12 }}>{p.description ?? p.key}</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>{p.key}</Text>
                        </div>
                        {viewerRole === 'admin' ? (
                          <Switch
                            size="small"
                            checked={hasIt}
                            loading={rolePermSaving === saveKey}
                            onChange={val => handleRolePermToggle(roleView, p.key, val)}
                          />
                        ) : (
                          <Tag color={hasIt ? 'green' : 'default'} style={{ fontSize: 11, minWidth: 40, textAlign: 'center' }}>
                            {hasIt ? '✓' : '✗'}
                          </Tag>
                        )}
                      </div>
                    )
                  })}
                  <Divider style={{ margin: '4px 0' }} />
                </div>
              )
            })}
          </Card>
        </Col>
      </Row>

      {/* ── Invite Modal ── */}
      <Modal
        open={inviteOpen}
        onCancel={() => { setInviteOpen(false); inviteForm.resetFields() }}
        title={<Space><MailOutlined style={{ color: BRAND.green }} /><span>Invite Staff Member</span></Space>}
        onOk={() => inviteForm.submit()}
        okText="Send Invitation"
        okButtonProps={{ loading: submitting, style: { background: BRAND.green } }}
        width={440}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          message="A secure invite email will be sent to the staff member. They will set their own password on first login."
          style={{ margin: '16px 0', borderRadius: 8, fontSize: 12 }}
        />
        <Form form={inviteForm} layout="vertical" onFinish={handleInvite}>
          <Form.Item name="full_name" label="Full Name" rules={[{ required: true, message: 'Enter full name' }]}>
            <Input prefix={<UserOutlined />} placeholder="e.g. Amara Okonkwo" />
          </Form.Item>
          <Form.Item
            name="email"
            label="Email Address"
            rules={[{ required: true, message: 'Enter email' }, { type: 'email', message: 'Enter a valid email' }]}
          >
            <Input prefix={<MailOutlined />} placeholder="amara@foodco.com" />
          </Form.Item>
          <Form.Item name="role_id" label="Assign Role" rules={[{ required: true, message: 'Select a role' }]}>
            <Select placeholder="Select role" size="large">
              {roles.map(r => (
                <Option key={r.id} value={r.id}>
                  <Tag color={ROLE_COLORS[r.name] ?? 'default'}>{r.name.replace(/_/g, ' ')}</Tag>
                  <Text type="secondary" style={{ fontSize: 11 }}> — {r.description}</Text>
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Edit Role Modal ── */}
      <Modal
        open={!!editUser}
        onCancel={() => setEditUser(null)}
        title={
          <Space>
            <EditOutlined style={{ color: BRAND.green }} />
            <span>Change Role — {editUser?.full_name}</span>
          </Space>
        }
        onOk={() => editForm.submit()}
        okText="Update Role"
        okButtonProps={{ loading: submitting, style: { background: BRAND.green } }}
        width={400}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical" onFinish={handleEditRole} style={{ marginTop: 16 }}>
          <Form.Item name="role_id" label="New Role" rules={[{ required: true }]}>
            <Select placeholder="Select role" size="large">
              {roles.map(r => (
                <Option key={r.id} value={r.id}>
                  <Tag color={ROLE_COLORS[r.name] ?? 'default'}>{r.name.replace(/_/g, ' ')}</Tag>
                  {' '}{r.description}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Manage Permissions Modal ── */}
      <Modal
        open={!!permUser}
        onCancel={() => setPermUser(null)}
        title={
          <Space>
            <KeyOutlined style={{ color: BRAND.green }} />
            <span>Permissions — {permUser?.full_name}</span>
          </Space>
        }
        footer={
          permUser ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Popconfirm
                title="Reset all overrides?"
                description="This restores all permissions to their role defaults for this user."
                onConfirm={() => handleResetAllOverrides(permUser.id)}
                okText="Reset"
                okType="danger"
              >
                <Button danger icon={<DeleteOutlined />} size="small">
                  Reset All Overrides
                </Button>
              </Popconfirm>
              <Button onClick={() => setPermUser(null)}>Close</Button>
            </div>
          ) : null
        }
        width={600}
        destroyOnClose
        styles={{ body: { maxHeight: '65vh', overflowY: 'auto', paddingRight: 4 } }}
      >
        {permUser && (() => {
          const userRoleId    = permUser.role_id
          const rolePermIds   = permissionsForRole(userRoleId)
          const userOverrides = localOverrides.filter(o => o.user_id === permUser.id)
          const roleName      = (permUser.role as any)?.name ?? roles.find(r => r.id === userRoleId)?.name ?? ''

          return (
            <div style={{ paddingTop: 4 }}>
              <div style={{ background: '#F5F5F5', borderRadius: 8, padding: '8px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag color={ROLE_COLORS[roleName] ?? 'default'}>{roleName.replace(/_/g, ' ')}</Tag>
                <Text style={{ fontSize: 12, color: '#555' }}>
                  {userOverrides.length > 0
                    ? <><span style={{ color: BRAND.critical, fontWeight: 600 }}>{userOverrides.length} active override{userOverrides.length > 1 ? 's' : ''}</span> on top of role defaults</>
                    : 'No overrides — using role defaults only'}
                </Text>
              </div>

              {PERMISSION_GROUPS.map(group => {
                const groupPerms = permissions.filter(p => group.keys.includes(p.key))
                if (groupPerms.length === 0) return null
                return (
                  <div key={group.label}>
                    <Text strong style={{ fontSize: 11, color: BRAND.green, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', padding: '8px 0 4px' }}>
                      {group.label}
                    </Text>
                    {groupPerms.map(perm => {
                      const roleDefault  = rolePermIds.has(perm.id)
                      const override     = userOverrides.find(o => o.permission_key === perm.key)
                      const currentValue = override ? (override.granted ? 'grant' : 'revoke') : 'role'
                      const effective    = override ? override.granted : roleDefault

                      return (
                        <div
                          key={perm.id}
                          style={{
                            display:        'flex',
                            alignItems:     'center',
                            justifyContent: 'space-between',
                            flexWrap:       'wrap',
                            padding:        '7px 4px',
                            borderBottom:   '1px solid #f5f5f5',
                            gap:            8,
                            background:     override ? (override.granted ? '#F6FFED' : '#FFF2F0') : 'transparent',
                            borderRadius:   override ? 4 : 0,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 140 }}>
                            <Space size={4}>
                              <Text style={{ fontSize: 12 }}>{perm.description ?? perm.key}</Text>
                              <Tag
                                color={effective ? 'green' : 'default'}
                                style={{ fontSize: 10, padding: '0 5px', lineHeight: '18px', marginLeft: 2 }}
                              >
                                {effective ? '✓ Allowed' : '✗ Denied'}
                              </Tag>
                            </Space>
                            <div style={{ marginTop: 2 }}>
                              <Text type="secondary" style={{ fontSize: 10, fontFamily: 'monospace' }}>{perm.key}</Text>
                              {override && (
                                <Tag
                                  color={override.granted ? 'blue' : 'red'}
                                  style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', marginLeft: 6 }}
                                >
                                  Override
                                </Tag>
                              )}
                            </div>
                          </div>
                          <Select
                            value={currentValue}
                            size="small"
                            style={{ width: 148, flexShrink: 0 }}
                            loading={permSaving === perm.key}
                            disabled={permSaving !== null && permSaving !== perm.key}
                            onChange={(val: 'role' | 'grant' | 'revoke') =>
                              handleOverrideChange(permUser.id, perm.key, val)
                            }
                            options={[
                              { value: 'role',   label: `Role default (${roleDefault ? 'allowed' : 'denied'})` },
                              { value: 'grant',  label: '✅ Force Grant' },
                              { value: 'revoke', label: '❌ Force Revoke' },
                            ]}
                          />
                        </div>
                      )
                    })}
                    <Divider style={{ margin: '6px 0' }} />
                  </div>
                )
              })}
            </div>
          )
        })()}
      </Modal>
    </>
  )
}

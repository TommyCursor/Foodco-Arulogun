'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Typography, Table, Select, Tag, Tabs, Button, Space, Alert,
  Spin, message, Badge, Divider, Empty, Tooltip, Popconfirm, Grid,
  Drawer, Modal, DatePicker, Input, AutoComplete,
} from 'antd'
import {
  CalendarOutlined, CheckCircleOutlined, EditOutlined,
  LeftOutlined, RightOutlined, TeamOutlined, SendOutlined,
  ReloadOutlined, ClockCircleOutlined, DeleteOutlined,
  FileTextOutlined, CheckOutlined, CloseOutlined, PlusOutlined,
  HistoryOutlined, DownloadOutlined, MailOutlined,
} from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'
import { BRAND } from '@/lib/constants'
import { useProfile } from '@/lib/hooks/useProfile'

const { Title, Text } = Typography
const { TextArea } = Input

// ─── Types ───────────────────────────────────────────────────────────────────
type Shift = 'am' | 'mid' | 'pm' | 'full' | 'off'

interface LeaveRequest {
  id: string
  user_id: string
  requested_date: string
  reason: string | null
  status: 'pending' | 'approved' | 'declined'
  actioned_at: string | null
  manager_note: string | null
  created_at: string
  profile: { full_name: string; role: { name: string } }
}

interface RosterEntry {
  id: string
  section: 'floor' | 'sanitation' | 'cashier' | 'supervisor'
  monday: Shift
  tuesday: Shift
  wednesday: Shift
  thursday: Shift
  friday: Shift
  saturday: Shift
  sunday: Shift
  notes: string | null
  profile: { id: string; full_name: string; role: { name: string } }
}

interface RosterHeader {
  id: string
  week_start: string
  status: 'draft' | 'published'
  notes: string | null
  published_at: string | null
  created_at: string
}

interface RosterSummary {
  id: string
  week_start: string
  status: 'draft' | 'published'
}

// ─── Config ──────────────────────────────────────────────────────────────────
const SHIFT_CONFIG: Record<Shift, { label: string; sublabel: string; color: string; bg: string }> = {
  am:   { label: 'AM',   sublabel: '7:00am – 3:30pm',  color: '#1B5E20', bg: '#E8F5E9' },
  mid:  { label: 'Mid',  sublabel: '10:00am – 7:00pm', color: '#1565C0', bg: '#E3F2FD' },
  pm:   { label: 'PM',   sublabel: '12:30pm – Close',  color: '#6A1B9A', bg: '#F3E5F5' },
  full: { label: 'Full', sublabel: '7:00am – Close',   color: '#E65100', bg: '#FFF3E0' },
  off:  { label: 'Off',  sublabel: 'No duty',           color: '#9E9E9E', bg: '#F5F5F5' },
}

const SECTIONS = [
  { key: 'floor',      label: 'Floor Roster',  icon: <TeamOutlined /> },
  { key: 'sanitation', label: 'Sanitation',    icon: <TeamOutlined /> },
  { key: 'cashier',    label: 'Cashier',        icon: <TeamOutlined /> },
  { key: 'supervisor', label: 'Supervisor',     icon: <TeamOutlined /> },
] as const

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

const CAN_EDIT_ROLES    = ['supervisor', 'cashier_supervisor', 'manager', 'admin']
const CAN_PUBLISH_ROLES = ['manager', 'admin']

// Which sections each role may view. Omitted roles (supervisor, manager, admin) see all.
const ROLE_SECTION_MAP: Record<string, string[]> = {
  // Floor section
  grocery_associate:    ['floor'],
  grocery_team_lead:    ['floor'],
  toiletries_associate: ['floor'],
  toiletries_team_lead: ['floor'],
  '3f_associate':       ['floor'],
  '3f_team_lead':       ['floor'],
  // Cashier section
  cashier:              ['cashier'],
  cashier_team_lead:    ['cashier'],
  // Sanitation section
  sanitation_officer:   ['sanitation'],
  // cashier_supervisor, supervisor, manager, admin → null (all sections)
}

function getAllowedSections(role: string): string[] | null {
  return ROLE_SECTION_MAP[role] ?? null // null = all sections
}

// ─── Daily Stats ─────────────────────────────────────────────────────────────
function computeDailyStats(entries: RosterEntry[], viewedWeek: string) {
  return DAYS.map((day, i) => {
    const date  = dayjs(viewedWeek).add(i, 'day')
    const am    = entries.filter(e => e[day] === 'am')
    const mid   = entries.filter(e => e[day] === 'mid')
    const pm    = entries.filter(e => e[day] === 'pm')
    const off   = entries.filter(e => e[day] === 'off')
    return { day, date, am: am.length, mid: mid.length, pm: pm.length, total: am.length + mid.length + pm.length, offNames: off.map(e => e.profile?.full_name ?? '—') }
  })
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getMondayOfWeek(dateStr: string): string {
  const d = dayjs(dateStr)
  const day = d.day() // 0=Sun
  const offset = day === 0 ? -6 : 1 - day
  return d.add(offset, 'day').format('YYYY-MM-DD')
}

function weekLabel(monday: string) {
  return `${dayjs(monday).format('DD MMM')} – ${dayjs(monday).add(6, 'day').format('DD MMM YYYY')}`
}

// ─── Shift Select ─────────────────────────────────────────────────────────────
function ShiftSelect({
  entryId, day, value, disabled, saving, onChange, allowedShifts,
}: {
  entryId: string
  day: string
  value: Shift
  disabled: boolean
  saving: boolean
  onChange: (entryId: string, day: string, shift: Shift) => void
  allowedShifts?: Shift[]
}) {
  // Guard against stale DB values from old schema (morning/afternoon/closing)
  const safeValue: Shift = SHIFT_CONFIG[value] ? value : 'full'
  const cfg = SHIFT_CONFIG[safeValue]
  const visibleShifts = allowedShifts
    ? Object.entries(SHIFT_CONFIG).filter(([val]) => allowedShifts.includes(val as Shift))
    : Object.entries(SHIFT_CONFIG)
  return (
    <Select
      value={safeValue}
      size="small"
      style={{ width: '100%', minWidth: 64 }}
      disabled={disabled || saving}
      popupMatchSelectWidth={false}
      onChange={(val) => onChange(entryId, day, val as Shift)}
      labelRender={() => (
        <span style={{
          color: cfg.color, fontWeight: 700, fontSize: 11,
          background: cfg.bg, padding: '1px 6px', borderRadius: 4,
        }}>
          {cfg.label}
        </span>
      )}
      options={visibleShifts.map(([val, c]) => ({
        value: val,
        label: (
          <div>
            <span style={{ color: c.color, fontWeight: 700, fontSize: 12 }}>{c.label}</span>
            <span style={{ color: '#999', fontSize: 10, marginLeft: 6 }}>{c.sublabel}</span>
          </div>
        ),
      }))}
    />
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface Props {
  initialRoster: RosterHeader | null
  initialEntries: RosterEntry[]
  allRosters: RosterSummary[]
  initialApprovedLeaves: { user_id: string; requested_date: string }[]
  initialPendingLeaveCount: number
}

export default function RosterClient({
  initialRoster, initialEntries, allRosters: initAllRosters,
  initialApprovedLeaves, initialPendingLeaveCount,
}: Props) {
  const { profile } = useProfile()
  const [msgApi, ctxHolder] = message.useMessage()
  const screens  = Grid.useBreakpoint()
  const isMobile = !screens.md

  const [roster,     setRoster]     = useState<RosterHeader | null>(initialRoster)
  const [entries,    setEntries]    = useState<RosterEntry[]>(initialEntries)
  const [allRosters, setAllRosters] = useState<RosterSummary[]>(initAllRosters)
  const [loading,    setLoading]    = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [generating, setGenerating] = useState(false)
  const [savingIds,  setSavingIds]  = useState<Set<string>>(new Set())
  const [activeTab,  setActiveTab]  = useState('floor')

  // The current week being viewed (Monday date)
  const [viewedWeek, setViewedWeek] = useState<string>(
    initialRoster?.week_start ?? getMondayOfWeek(dayjs().format('YYYY-MM-DD'))
  )

  // ── Leave Requests state ────────────────────────────────────────────────────
  const [leavesOpen,        setLeavesOpen]        = useState(false)
  const [leaveRequests,     setLeaveRequests]     = useState<LeaveRequest[]>([])
  const [leavesLoading,     setLeavesLoading]     = useState(false)
  const [pendingLeaveCount, setPendingLeaveCount] = useState(initialPendingLeaveCount)
  const [approvedLeaves,    setApprovedLeaves]    = useState(initialApprovedLeaves)
  const [approvingId,       setApprovingId]       = useState<string | null>(null)
  // Email roster
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [sendingEmail,   setSendingEmail]   = useState(false)
  const [toEmail,        setToEmail]        = useState('')
  const [ccEmails,       setCcEmails]       = useState<string[]>([])
  const [bccEmails,      setBccEmails]      = useState<string[]>([])
  const [emailNote,      setEmailNote]      = useState('')
  const [emailError,     setEmailError]     = useState('')
  const [savedEmails,    setSavedEmails]    = useState<string[]>([])

  const ROSTER_LS_KEY = 'roster_email_list'
  const DEFAULT_ROSTER_EMAILS = [
    'manager@foodco.com',
    'director@foodco.com',
    'operations@foodco.com',
  ]

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(ROSTER_LS_KEY) ?? '[]')
      if (Array.isArray(stored)) setSavedEmails(stored)
    } catch { /* ignore */ }
  }, [])

  const allRosterEmailOptions = [...new Set([...DEFAULT_ROSTER_EMAILS, ...savedEmails])].map(e => ({ value: e, label: e }))

  function saveNewEmails(emails: string[]) {
    const all = [...new Set([...savedEmails, ...emails.filter(e => e.includes('@'))])]
    setSavedEmails(all)
    try { localStorage.setItem(ROSTER_LS_KEY, JSON.stringify(all)) } catch { /* ignore */ }
  }

  function resetEmailModal() {
    setToEmail(''); setCcEmails([]); setBccEmails([]); setEmailNote(''); setEmailError('')
  }

  // Request form
  const [requestFormOpen,   setRequestFormOpen]   = useState(false)
  const [requestDate,       setRequestDate]       = useState<dayjs.Dayjs | null>(null)
  const [requestReason,     setRequestReason]     = useState('')
  const [submittingRequest, setSubmittingRequest] = useState(false)

  // Approved leave map: profileId → Set of day column names for the viewed week
  const approvedLeaveMap = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const lr of approvedLeaves) {
      for (let i = 0; i < 7; i++) {
        if (dayjs(viewedWeek).add(i, 'day').format('YYYY-MM-DD') === lr.requested_date) {
          if (!map.has(lr.user_id)) map.set(lr.user_id, new Set())
          map.get(lr.user_id)!.add(DAYS[i])
        }
      }
    }
    return map
  }, [approvedLeaves, viewedWeek])

  const roleName = profile?.role_name ?? ''

  const allowedSections = getAllowedSections(roleName)
  const visibleSections = allowedSections === null
    ? SECTIONS
    : SECTIONS.filter(s => allowedSections.includes(s.key))

  // When role loads, ensure activeTab is one the user can actually see
  useEffect(() => {
    if (visibleSections.length > 0 && !visibleSections.find(s => s.key === activeTab)) {
      setActiveTab(visibleSections[0].key)
    }
  }, [roleName]) // eslint-disable-line react-hooks/exhaustive-deps

  const canEdit    = CAN_EDIT_ROLES.includes(roleName)    && roster?.status === 'draft'
  const canPublish = CAN_PUBLISH_ROLES.includes(roleName) && roster?.status === 'draft'

  // ── Week Navigation ─────────────────────────────────────────────────────────
  async function navigateWeek(direction: -1 | 1) {
    const newWeek = dayjs(viewedWeek).add(direction * 7, 'day').format('YYYY-MM-DD')
    await fetchRosterForWeek(newWeek)
  }

  async function fetchRosterForWeek(weekStart: string) {
    setLoading(true)
    setViewedWeek(weekStart)
    try {
      const res  = await fetch(`/api/roster?week_start=${weekStart}`)
      const data = await res.json()
      setRoster(data.roster ?? null)
      setEntries(data.entries ?? [])
      if (data.allRosters) setAllRosters(data.allRosters)
    } catch {
      msgApi.error('Failed to load roster')
    } finally {
      setLoading(false)
    }
  }

  // ── Generate Roster ─────────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true)
    try {
      const res  = await fetch('/api/roster', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { msgApi.error(data.error ?? 'Failed to generate roster'); return }
      if (!data.created) {
        msgApi.info('A roster for this week already exists')
      } else {
        msgApi.success('Roster generated — please review and publish before Friday')
      }
      await fetchRosterForWeek(data.weekStart)
    } catch {
      msgApi.error('Failed to generate roster')
    } finally {
      setGenerating(false)
    }
  }

  // ── Publish ─────────────────────────────────────────────────────────────────
  async function handlePublish() {
    if (!roster) return
    setPublishing(true)
    try {
      const res = await fetch(`/api/roster/${roster.id}`, { method: 'PATCH' })
      if (!res.ok) { msgApi.error('Failed to publish roster'); return }
      msgApi.success('Roster published — all staff have been notified')
      setRoster(r => r ? { ...r, status: 'published', published_at: new Date().toISOString() } : r)
    } catch {
      msgApi.error('Failed to publish roster')
    } finally {
      setPublishing(false)
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!roster) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/roster/${roster.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { msgApi.error(data.error ?? 'Failed to delete roster'); return }
      msgApi.success('Draft roster deleted')
      setRoster(null)
      setEntries([])
      setAllRosters(prev => prev.filter(r => r.id !== roster.id))
    } catch {
      msgApi.error('Failed to delete roster')
    } finally {
      setDeleting(false)
    }
  }

  // ── Email Roster ──────────────────────────────────────────────────────────
  async function handleEmailRoster() {
    if (!roster) return
    if (!toEmail.includes('@')) { setEmailError('Please enter a valid To email address'); return }
    setEmailError('')
    setSendingEmail(true)
    try {
      const res  = await fetch('/api/roster/email', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ roster_id: roster.id, to: toEmail.trim(), cc: ccEmails, bcc: bccEmails, note: emailNote.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send email')

      // Persist any new addresses to localStorage
      saveNewEmails([toEmail, ...ccEmails, ...bccEmails])

      msgApi.success(`Roster sent to ${data.recipients.length} recipient${data.recipients.length > 1 ? 's' : ''}`)
      setEmailModalOpen(false)
      resetEmailModal()
    } catch (err: any) {
      msgApi.error(err.message)
    } finally {
      setSendingEmail(false)
    }
  }

  // ── Leave Requests helpers ──────────────────────────────────────────────────
  async function fetchApprovedLeaves(weekStart: string) {
    const weekEnd = dayjs(weekStart).add(6, 'day').format('YYYY-MM-DD')
    try {
      const res  = await fetch(`/api/leave-requests?status=approved&week_start=${weekStart}&week_end=${weekEnd}`)
      const data = await res.json()
      setApprovedLeaves(data.requests ?? [])
    } catch { /* silent */ }
  }

  async function fetchLeaveRequests() {
    setLeavesLoading(true)
    try {
      const res  = await fetch('/api/leave-requests')
      const data = await res.json()
      const reqs: LeaveRequest[] = data.requests ?? []
      setLeaveRequests(reqs)
      setPendingLeaveCount(reqs.filter(r => r.status === 'pending').length)
    } catch {
      msgApi.error('Failed to load leave requests')
    } finally {
      setLeavesLoading(false)
    }
  }

  async function handleActionLeave(id: string, action: 'approved' | 'declined') {
    setApprovingId(id)
    try {
      const res = await fetch(`/api/leave-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      })
      if (!res.ok) { msgApi.error('Failed to update request'); return }
      msgApi.success(`Leave request ${action}`)
      await fetchLeaveRequests()
      await fetchApprovedLeaves(viewedWeek)
    } catch {
      msgApi.error('Failed to update request')
    } finally {
      setApprovingId(null)
    }
  }

  async function handleSubmitLeaveRequest() {
    if (!requestDate) { msgApi.warning('Please select a date'); return }
    setSubmittingRequest(true)
    try {
      const res = await fetch('/api/leave-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requested_date: requestDate.format('YYYY-MM-DD'),
          reason: requestReason.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { msgApi.error(data.error ?? 'Failed to submit request'); return }
      msgApi.success("Request submitted — you'll be notified once reviewed")
      setRequestFormOpen(false)
      setRequestDate(null)
      setRequestReason('')
      if (leavesOpen) await fetchLeaveRequests()
    } catch {
      msgApi.error('Failed to submit request')
    } finally {
      setSubmittingRequest(false)
    }
  }

  // Refresh approved leaves when navigating weeks
  useEffect(() => { fetchApprovedLeaves(viewedWeek) }, [viewedWeek]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shift Change (auto-save) ─────────────────────────────────────────────────
  const handleShiftChange = useCallback(async (entryId: string, day: string, shift: Shift) => {
    // Optimistic update
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, [day]: shift } : e))
    setSavingIds(s => new Set(s).add(entryId))

    try {
      const res = await fetch(`/api/roster/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [day]: shift }),
      })
      if (!res.ok) throw new Error()
    } catch {
      msgApi.error('Failed to save shift — please try again')
      // Revert: re-fetch entries for current roster
      if (roster) {
        const res  = await fetch(`/api/roster?week_start=${roster.week_start}`)
        const data = await res.json()
        setEntries(data.entries ?? [])
      }
    } finally {
      setSavingIds(s => { const next = new Set(s); next.delete(entryId); return next })
    }
  }, [roster, msgApi])

  // ── Table Builder ────────────────────────────────────────────────────────────
  function buildColumns(section: string): ColumnsType<RosterEntry> {
    const weekDates = DAYS.map((_, i) => {
      const d = dayjs(viewedWeek).add(i, 'day')
      return { short: d.format('ddd'), date: d.format('DD MMM') }
    })
    const isSanitation = section === 'sanitation'

    return [
      {
        title: 'Staff Name',
        key: 'name',
        width: isMobile ? 130 : 160,
        fixed: 'left' as const,
        render: (_: any, r: RosterEntry) => (
          <div>
            <Text strong style={{ fontSize: isMobile ? 11 : 13, display: 'block', lineHeight: 1.3 }}>
              {r.profile?.full_name ?? '—'}
            </Text>
            <Tag style={{ fontSize: 9, lineHeight: '16px', textTransform: 'capitalize', marginTop: 2, padding: '0 4px' }}>
              {r.profile?.role?.name?.replace(/_/g, ' ') ?? '—'}
            </Tag>
            {savingIds.has(r.id) && <Spin size="small" style={{ marginLeft: 4 }} />}
          </div>
        ),
      },
      ...DAYS.map((day, i) => {
        const isSunday = day === 'sunday'
        const allowedShifts: Shift[] | undefined =
          isSanitation || isSunday ? ['full', 'off'] : undefined
        return {
          title: (
            <div style={{ textAlign: 'center' as const, lineHeight: 1.4 }}>
              <div style={{ fontWeight: 700, fontSize: isMobile ? 10 : 12 }}>{weekDates[i].short}</div>
              {!isMobile && <div style={{ fontSize: 10, color: '#888' }}>{weekDates[i].date}</div>}
            </div>
          ),
          key: day,
          width: isMobile ? 80 : 116,
          render: (_: any, r: RosterEntry) => {
            const hasLeave = approvedLeaveMap.get(r.profile?.id)?.has(day) ?? false
            return (
              <div>
                <ShiftSelect
                  entryId={r.id}
                  day={day}
                  value={r[day] as Shift}
                  disabled={!canEdit}
                  saving={savingIds.has(r.id)}
                  onChange={handleShiftChange}
                  allowedShifts={allowedShifts}
                />
                {hasLeave && (
                  <Tooltip title="Approved leave day">
                    <Tag color="purple" style={{ fontSize: 9, padding: '0 3px', margin: '3px 0 0', lineHeight: '14px', display: 'block', textAlign: 'center' }}>
                      Leave
                    </Tag>
                  </Tooltip>
                )}
              </div>
            )
          },
        }
      }),
    ]
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  const sectionEntries = (key: string) => entries.filter(e => e.section === key)

  const SECTION_SHORT: Record<string, string> = {
    floor: 'Floor', sanitation: 'Sanit.', cashier: 'Cashier', supervisor: 'Supvr',
  }

  const tabItems = visibleSections.map(sec => ({
    key:   sec.key,
    label: (
      <span>
        {sec.icon}
        <span style={{ marginLeft: 4, fontSize: isMobile ? 11 : 13 }}>
          {isMobile ? SECTION_SHORT[sec.key] : sec.label}
        </span>
        <Badge
          count={sectionEntries(sec.key).length}
          style={{ marginLeft: 6, background: BRAND.green, fontSize: 10 }}
          size="small"
        />
      </span>
    ),
    children: (
      <Table<RosterEntry>
        dataSource={sectionEntries(sec.key)}
        columns={buildColumns(sec.key)}
        rowKey="id"
        size="small"
        scroll={{ x: 1100 }}
        pagination={false}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="No staff in this section for this week"
            />
          ),
        }}
        rowClassName={(_, idx) => idx % 2 === 0 ? '' : 'ant-table-row-striped'}
      />
    ),
  }))

  return (
    <div>
      {ctxHolder}

      {/* ── Page Header ── */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <Title level={isMobile ? 5 : 4} style={{ margin: 0, color: BRAND.green }}>
            <CalendarOutlined style={{ marginRight: 8 }} />
            Weekly Staff Roster
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {roster
              ? `Week of ${weekLabel(roster.week_start)}`
              : `Week of ${weekLabel(viewedWeek)}`}
          </Text>
        </div>

        <Space wrap size={6}>
          {/* Download Excel — visible to all when a roster exists */}
          {roster && (
            <a href={`/api/roster/export?roster_id=${roster.id}`} download>
              <Button
                icon={<DownloadOutlined />}
                size={isMobile ? 'small' : 'middle'}
                style={{ borderColor: BRAND.green, color: BRAND.green }}
              >
                {!isMobile && 'Download Excel'}
              </Button>
            </a>
          )}

          {/* Email Roster — visible to managers/admins when a roster exists */}
          {roster && CAN_PUBLISH_ROLES.includes(roleName) && (
            <Button
              icon={<MailOutlined />}
              size={isMobile ? 'small' : 'middle'}
              type="primary"
              style={{ background: '#1565C0' }}
              onClick={() => setEmailModalOpen(true)}
            >
              {!isMobile && 'Email Roster'}
            </Button>
          )}

          {/* Off Day Requests button — visible to all */}
          <Badge count={pendingLeaveCount} size="small" offset={[-4, 4]}>
            <Button
              icon={<FileTextOutlined />}
              size={isMobile ? 'small' : 'middle'}
              onClick={() => { setLeavesOpen(true); fetchLeaveRequests() }}
            >
              {!isMobile && 'Off Day Requests'}
            </Button>
          </Badge>

          {canPublish && roster?.status === 'draft' && (
            <Button
              type="primary"
              icon={<SendOutlined />}
              loading={publishing}
              onClick={handlePublish}
              style={{ background: BRAND.green }}
              size={isMobile ? 'small' : 'middle'}
            >
              {isMobile ? 'Publish' : 'Publish & Notify All Staff'}
            </Button>
          )}
          {CAN_PUBLISH_ROLES.includes(roleName) && (
            <Button
              icon={<ReloadOutlined />}
              loading={generating}
              onClick={handleGenerate}
              size={isMobile ? 'small' : 'middle'}
            >
              {isMobile ? 'Generate' : 'Generate Roster'}
            </Button>
          )}
          {canPublish && roster?.status === 'draft' && (
            <Popconfirm
              title="Delete this draft roster?"
              description="This will permanently remove the roster and all its entries. This cannot be undone."
              okText="Yes, delete"
              okButtonProps={{ danger: true }}
              cancelText="Cancel"
              onConfirm={handleDelete}
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                loading={deleting}
                size={isMobile ? 'small' : 'middle'}
              >
                {!isMobile && 'Delete Draft'}
              </Button>
            </Popconfirm>
          )}
        </Space>
      </div>

      {/* ── Status Banner ── */}
      {roster?.status === 'published' && (
        <Alert
          type="success"
          icon={<CheckCircleOutlined />}
          showIcon
          message={`Published${roster.published_at ? ' on ' + dayjs(roster.published_at).format('ddd DD MMM YYYY [at] HH:mm') : ''}`}
          description="This roster has been sent to all staff. Create next week's roster using the Generate button."
          style={{ marginBottom: 16 }}
        />
      )}
      {roster?.status === 'draft' && canEdit && (
        <Alert
          type="warning"
          icon={<EditOutlined />}
          showIcon
          message="Draft — edits are live"
          description={'Adjust shifts below. When ready, use "Publish & Notify All Staff" to send the roster to everyone.'}
          style={{ marginBottom: 16 }}
        />
      )}
      {roster?.status === 'draft' && !canEdit && (
        <Alert
          type="info"
          icon={<ClockCircleOutlined />}
          showIcon
          message="Roster is being prepared"
          description="The roster for this week is still a draft. You'll receive a notification once it's published."
          style={{ marginBottom: 16 }}
        />
      )}

      {/* ── Week Navigation ── */}
      <div style={{
        marginBottom: 12,
        padding: '8px 12px', background: BRAND.white,
        borderRadius: 8, border: `1px solid #e8e8e8`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button size="small" icon={<LeftOutlined />} onClick={() => navigateWeek(-1)} disabled={loading} />
          <Text strong style={{ flex: 1, textAlign: 'center', fontSize: isMobile ? 12 : 14 }}>
            {weekLabel(viewedWeek)}
          </Text>
          <Button size="small" icon={<RightOutlined />} onClick={() => navigateWeek(1)} disabled={loading} />
        </div>
        {/* Quick-jump chips */}
        {allRosters.length > 1 && (
          <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {allRosters.slice(0, isMobile ? 4 : 6).map(r => (
              <Tag
                key={r.id}
                color={r.week_start === viewedWeek ? 'green' : 'default'}
                style={{ cursor: 'pointer', fontSize: 10, margin: 0 }}
                onClick={() => fetchRosterForWeek(r.week_start)}
              >
                {dayjs(r.week_start).format('DD MMM')}
                {r.status === 'published'
                  ? <CheckCircleOutlined style={{ marginLeft: 4, color: BRAND.green }} />
                  : <EditOutlined style={{ marginLeft: 4, color: BRAND.yellow }} />
                }
              </Tag>
            ))}
          </div>
        )}
      </div>

      {/* ── Daily Summary ── */}
      {!loading && roster && entries.length > 0 && (() => {
        const today = dayjs().format('YYYY-MM-DD')
        const stats = computeDailyStats(entries, viewedWeek)
        return (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: 12, color: '#666', display: 'block', marginBottom: 8 }}>
              Daily Coverage Summary
            </Text>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(100px, 1fr))', gap: 8, minWidth: 700 }}>
              {stats.map(({ day, date, am, mid, pm, total, offNames }) => {
                const isToday = date.format('YYYY-MM-DD') === today
                return (
                  <div
                    key={day}
                    style={{
                      background: isToday ? '#F1F8E9' : BRAND.white,
                      border: `1.5px solid ${isToday ? BRAND.green : '#e8e8e8'}`,
                      borderRadius: 10,
                      padding: '10px 10px 8px',
                      position: 'relative',
                    }}
                  >
                    {/* Day header */}
                    <div style={{ marginBottom: 8 }}>
                      <Text strong style={{ fontSize: 12, color: isToday ? BRAND.green : '#333', display: 'block', lineHeight: 1.2 }}>
                        {date.format('ddd')}
                        {isToday && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: BRAND.green, marginLeft: 4, background: '#C8E6C9', borderRadius: 4, padding: '1px 4px' }}>
                            TODAY
                          </span>
                        )}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#999' }}>{date.format('DD MMM')}</Text>
                    </div>

                    {/* Shift counts */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
                      {[
                        { key: 'am',  count: am,  color: '#1B5E20', bg: '#E8F5E9', label: 'AM' },
                        { key: 'mid', count: mid, color: '#1565C0', bg: '#E3F2FD', label: 'Mid' },
                        { key: 'pm',  count: pm,  color: '#6A1B9A', bg: '#F3E5F5', label: 'PM' },
                      ].map(s => (
                        <div key={s.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: s.color, background: s.bg, borderRadius: 3, padding: '0 4px', lineHeight: '16px' }}>
                            {s.label}
                          </span>
                          <Text strong style={{ fontSize: 12, color: s.count > 0 ? '#333' : '#ccc' }}>
                            {s.count}
                          </Text>
                        </div>
                      ))}
                    </div>

                    {/* Divider + total working */}
                    <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 6, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 10, color: '#888' }}>Working</Text>
                      <Text strong style={{ fontSize: 13, color: isToday ? BRAND.green : '#333' }}>{total}</Text>
                    </div>

                    {/* Off names */}
                    <div>
                      <Text style={{ fontSize: 9, color: '#aaa', fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', display: 'block', marginBottom: 3 }}>
                        Off ({offNames.length})
                      </Text>
                      {offNames.length === 0 ? (
                        <Text style={{ fontSize: 10, color: '#bbb' }}>—</Text>
                      ) : (
                        <Tooltip title={offNames.join(', ')} placement="bottom">
                          <Text style={{ fontSize: 10, color: '#888', cursor: 'default', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {offNames.join(', ')}
                          </Text>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            </div>{/* end scroll wrapper */}
          </div>
        )
      })()}

      {/* ── Content ── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" tip="Loading roster…" />
        </div>
      ) : !roster ? (
        <div style={{
          textAlign: 'center', padding: 64, background: BRAND.white,
          borderRadius: 12, border: '1px dashed #d9d9d9',
        }}>
          <CalendarOutlined style={{ fontSize: 48, color: '#ccc', marginBottom: 16 }} />
          <Title level={5} style={{ color: '#999', marginBottom: 8 }}>No roster for this week</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
            Rosters are auto-generated every Thursday for the following week.
          </Text>
          {CAN_PUBLISH_ROLES.includes(roleName) && (
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={generating}
              onClick={handleGenerate}
              style={{ background: BRAND.green }}
            >
              Generate Now
            </Button>
          )}
        </div>
      ) : (
        <div style={{ background: BRAND.white, borderRadius: 12, padding: '16px 20px', border: '1px solid #f0f0f0' }}>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
            tabBarStyle={{ marginBottom: 16 }}
          />
        </div>
      )}

      {/* ── Shift Legend ── */}
      {roster && (
        <div style={{ marginTop: 12, display: 'flex', gap: isMobile ? 10 : 16, flexWrap: 'wrap' }}>
          {Object.entries(SHIFT_CONFIG).map(([val, cfg]) => (
            <Space key={val} size={6}>
              <div style={{
                width: 12, height: 12, borderRadius: 3,
                background: cfg.bg, border: `1px solid ${cfg.color}`,
              }} />
              <Text style={{ fontSize: 12, color: cfg.color, fontWeight: 700 }}>{cfg.label}</Text>
              <Text style={{ fontSize: 11, color: '#999' }}>{cfg.sublabel}</Text>
            </Space>
          ))}
          <Space size={6}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: '#F3E8FF', border: '1px solid #9C27B0' }} />
            <Text style={{ fontSize: 12, color: '#9C27B0', fontWeight: 700 }}>Leave</Text>
            <Text style={{ fontSize: 11, color: '#999' }}>Approved day off</Text>
          </Space>
        </div>
      )}

      {/* ── Leave Requests Drawer ── */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>
              <FileTextOutlined style={{ marginRight: 8, color: BRAND.green }} />
              Off Day Requests
            </span>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              size="small"
              style={{ background: BRAND.green }}
              onClick={() => setRequestFormOpen(true)}
            >
              Request Day Off
            </Button>
          </div>
        }
        placement="right"
        width={isMobile ? '100%' : 480}
        open={leavesOpen}
        onClose={() => setLeavesOpen(false)}
        styles={{ body: { padding: '16px 20px' } }}
      >
        {leavesLoading ? (
          <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>
        ) : (
          <>
            {/* Pending approvals — managers/supervisors only */}
            {['manager', 'admin', 'supervisor'].includes(roleName) && (() => {
              const pending = leaveRequests.filter(r => r.status === 'pending')
              return (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <Text strong style={{ fontSize: 13, color: BRAND.green }}>
                      Pending Approvals
                      {pending.length > 0 && (
                        <Badge count={pending.length} size="small" style={{ marginLeft: 8, background: '#FFC107' }} />
                      )}
                    </Text>
                  </div>
                  {pending.length === 0 ? (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No pending requests"
                      style={{ marginBottom: 24 }}
                    />
                  ) : (
                    <div style={{ marginBottom: 24 }}>
                      {pending.map(lr => (
                        <div key={lr.id} style={{
                          background: '#FFFDE7', border: '1px solid #FFC107',
                          borderRadius: 8, padding: '12px 14px', marginBottom: 10,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 6 }}>
                            <div>
                              <Text strong style={{ fontSize: 13 }}>{lr.profile?.full_name ?? '—'}</Text>
                              <Tag style={{ marginLeft: 8, fontSize: 10, textTransform: 'capitalize' }}>
                                {lr.profile?.role?.name?.replace(/_/g, ' ') ?? ''}
                              </Tag>
                              <div style={{ marginTop: 4 }}>
                                <Text style={{ fontSize: 13, color: BRAND.green, fontWeight: 600 }}>
                                  {dayjs(lr.requested_date).format('dddd, DD MMM YYYY')}
                                </Text>
                              </div>
                              {lr.reason && (
                                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                                  {lr.reason}
                                </Text>
                              )}
                              <Text type="secondary" style={{ fontSize: 11 }}>
                                Submitted {dayjs(lr.created_at).format('DD MMM [at] HH:mm')}
                              </Text>
                            </div>
                            <Space>
                              <Button
                                type="primary"
                                size="small"
                                icon={<CheckOutlined />}
                                loading={approvingId === lr.id}
                                style={{ background: BRAND.green }}
                                onClick={() => handleActionLeave(lr.id, 'approved')}
                              >
                                Approve
                              </Button>
                              <Button
                                danger
                                size="small"
                                icon={<CloseOutlined />}
                                loading={approvingId === lr.id}
                                onClick={() => handleActionLeave(lr.id, 'declined')}
                              >
                                Decline
                              </Button>
                            </Space>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <Divider style={{ margin: '0 0 16px' }} />
                </>
              )
            })()}

            {/* All requests (own for staff, history for managers) */}
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ fontSize: 13, color: '#555' }}>
                <HistoryOutlined style={{ marginRight: 6 }} />
                {['manager', 'admin', 'supervisor'].includes(roleName) ? 'All Requests' : 'My Requests'}
              </Text>
            </div>
            {leaveRequests.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No requests yet" />
            ) : (
              leaveRequests.map(lr => {
                const statusColor = lr.status === 'approved' ? 'success' : lr.status === 'declined' ? 'error' : 'warning'
                return (
                  <div key={lr.id} style={{
                    background: '#FAFAFA', border: '1px solid #f0f0f0',
                    borderRadius: 8, padding: '10px 14px', marginBottom: 8,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 4 }}>
                      <div>
                        {['manager', 'admin', 'supervisor'].includes(roleName) && (
                          <Text strong style={{ fontSize: 12, display: 'block' }}>
                            {lr.profile?.full_name ?? '—'}
                          </Text>
                        )}
                        <Text style={{ fontSize: 13, color: BRAND.green, fontWeight: 600 }}>
                          {dayjs(lr.requested_date).format('dddd, DD MMM YYYY')}
                        </Text>
                        {lr.reason && (
                          <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>{lr.reason}</Text>
                        )}
                        {lr.manager_note && (
                          <Text type="secondary" style={{ fontSize: 11, display: 'block', fontStyle: 'italic' }}>
                            Manager note: {lr.manager_note}
                          </Text>
                        )}
                      </div>
                      <Tag color={statusColor} style={{ textTransform: 'capitalize' }}>
                        {lr.status}
                      </Tag>
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}
      </Drawer>

      {/* ── Request Day Off Modal ── */}
      <Modal
        title={
          <span>
            <CalendarOutlined style={{ marginRight: 8, color: BRAND.green }} />
            Request Day Off
          </span>
        }
        open={requestFormOpen}
        onCancel={() => { setRequestFormOpen(false); setRequestDate(null); setRequestReason('') }}
        onOk={handleSubmitLeaveRequest}
        okText="Submit Request"
        confirmLoading={submittingRequest}
        okButtonProps={{ style: { background: BRAND.green } }}
      >
        <div style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>Date *</Text>
            <DatePicker
              value={requestDate}
              onChange={setRequestDate}
              style={{ width: '100%' }}
              disabledDate={d => d.isBefore(dayjs(), 'day')}
              format="dddd, DD MMMM YYYY"
              placeholder="Select the date you need off"
            />
          </div>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 6 }}>
              Reason <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>(optional)</Text>
            </Text>
            <TextArea
              rows={3}
              value={requestReason}
              onChange={e => setRequestReason(e.target.value)}
              placeholder="e.g. Family event, medical appointment…"
              maxLength={200}
              showCount
            />
          </div>
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 14, fontSize: 12 }}
            message="Your request will be reviewed by a manager. You'll receive a notification once it's approved or declined."
          />
        </div>
      </Modal>

      {/* ── Email Roster Modal ── */}
      <Modal
        open={emailModalOpen}
        title={
          <Space>
            <MailOutlined style={{ color: '#1565C0' }} />
            <span>Email Roster to Senior Leaders</span>
          </Space>
        }
        onOk={handleEmailRoster}
        onCancel={() => { setEmailModalOpen(false); resetEmailModal() }}
        okText="Send Roster Email"
        okButtonProps={{ loading: sendingEmail, style: { background: '#1565C0' } }}
        width={520}
      >
        {roster && (
          <div style={{ paddingTop: 8 }}>
            {/* Week info banner */}
            <div style={{ background: '#E3F2FD', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
              <Text strong style={{ color: '#1565C0', display: 'block' }}>
                📅 Week: {dayjs(roster.week_start).format('DD MMM')} – {dayjs(roster.week_start).add(6, 'day').format('DD MMM YYYY')}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {entries.length} staff · Status: <Tag color={roster.status === 'published' ? 'success' : 'warning'} style={{ fontSize: 11 }}>{roster.status}</Tag>
              </Text>
            </div>

            {/* To */}
            <div style={{ marginBottom: 14 }}>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>To *</Text>
              <AutoComplete
                options={allRosterEmailOptions}
                value={toEmail}
                onChange={val => { setToEmail(val); if (emailError) setEmailError('') }}
                style={{ width: '100%' }}
                filterOption={(input, opt) => (opt?.value ?? '').toLowerCase().includes(input.toLowerCase())}
              >
                <Input placeholder="recipient@company.com" status={emailError ? 'error' : ''} />
              </AutoComplete>
              {emailError && <Text type="danger" style={{ fontSize: 12 }}>{emailError}</Text>}
            </div>

            {/* CC */}
            <div style={{ marginBottom: 14 }}>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                CC <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>(optional)</Text>
              </Text>
              <Select
                mode="tags"
                style={{ width: '100%' }}
                placeholder="cc@company.com"
                value={ccEmails}
                onChange={vals => setCcEmails(vals)}
                tokenSeparators={[',', ' ']}
                options={allRosterEmailOptions}
              />
            </div>

            {/* BCC */}
            <div style={{ marginBottom: 14 }}>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                BCC <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>(optional)</Text>
              </Text>
              <Select
                mode="tags"
                style={{ width: '100%' }}
                placeholder="bcc@company.com"
                value={bccEmails}
                onChange={vals => setBccEmails(vals)}
                tokenSeparators={[',', ' ']}
                options={allRosterEmailOptions}
              />
            </div>

            {/* Note */}
            <div style={{ marginBottom: 14 }}>
              <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                Note <Text type="secondary" style={{ fontWeight: 400, fontSize: 12 }}>(optional)</Text>
              </Text>
              <TextArea
                rows={3}
                placeholder="e.g. Please note the shift changes for Saturday…"
                value={emailNote}
                onChange={e => setEmailNote(e.target.value)}
                maxLength={300}
                showCount
              />
            </div>

            <div style={{ padding: '10px 14px', background: '#FFF8E1', borderRadius: 6, fontSize: 12, color: '#555' }}>
              📎 The full Excel roster file will be attached automatically. New addresses you enter will be remembered for next time.
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

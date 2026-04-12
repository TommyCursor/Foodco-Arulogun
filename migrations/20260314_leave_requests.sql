-- ── Leave Requests ────────────────────────────────────────────────────────────
-- Staff submit day-off requests; managers approve or decline.
-- Approved dates auto-tag roster cells and are respected on roster generation.

create table if not exists leave_requests (
  id             uuid        default gen_random_uuid() primary key,
  user_id        uuid        not null references profiles(id) on delete cascade,
  requested_date date        not null,
  reason         text,
  status         text        not null default 'pending'
                             check (status in ('pending', 'approved', 'declined')),
  actioned_by    uuid        references profiles(id),
  actioned_at    timestamptz,
  manager_note   text,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (user_id, requested_date)   -- one request per person per date
);

alter table leave_requests enable row level security;

-- Staff can see their own requests
create policy "leave_own_select"
  on leave_requests for select
  using (user_id = auth.uid());

-- Managers / supervisors / admins see all
create policy "leave_manager_select"
  on leave_requests for select
  using (
    exists (
      select 1 from profiles p
      join roles r on r.id = p.role_id
      where p.id = auth.uid()
        and r.name in ('manager', 'admin', 'supervisor')
    )
  );

-- Any authenticated user can submit their own
create policy "leave_insert"
  on leave_requests for insert
  with check (user_id = auth.uid());

-- Only managers/admins/supervisors can update status
create policy "leave_manager_update"
  on leave_requests for update
  using (
    exists (
      select 1 from profiles p
      join roles r on r.id = p.role_id
      where p.id = auth.uid()
        and r.name in ('manager', 'admin', 'supervisor')
    )
  );

create index if not exists leave_requests_date_status on leave_requests (requested_date, status);
create index if not exists leave_requests_user_status  on leave_requests (user_id, status);

-- ============================================================================
-- msg-call-app — Row Level Security Policies
-- Run AFTER schema.sql
-- ============================================================================

-- Enable RLS on every table
alter table public.mca_users enable row level security;
alter table public.mca_connection_requests enable row level security;
alter table public.mca_connections enable row level security;
alter table public.mca_messages enable row level security;
alter table public.mca_calls enable row level security;
alter table public.mca_call_logs enable row level security;
alter table public.mca_blocked_users enable row level security;
alter table public.mca_notifications enable row level security;
alter table public.mca_rejection_cooldowns enable row level security;
alter table public.mca_presence enable row level security;

-- ----------------------------------------------------------------------------
-- users
-- Anyone authenticated may read a user's public profile (needed to resolve a
-- phone number to a profile when sending a connection request). Sensitive
-- bulk enumeration is prevented by application logic + the unique constraint;
-- there is no searchable directory endpoint.
-- ----------------------------------------------------------------------------
create policy "mca_users_select_self_and_others"
  on public.mca_users for select
  using (true);

create policy "mca_users_update_self"
  on public.mca_users for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "mca_users_insert_self"
  on public.mca_users for insert
  with check (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- connection_requests
-- ----------------------------------------------------------------------------
create policy "mca_cr_select_involved"
  on public.mca_connection_requests for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

create policy "mca_cr_insert_sender"
  on public.mca_connection_requests for insert
  with check (auth.uid() = sender_id);

create policy "mca_cr_update_receiver"
  on public.mca_connection_requests for update
  using (auth.uid() = receiver_id)
  with check (auth.uid() = receiver_id);

-- ----------------------------------------------------------------------------
-- connections
-- ----------------------------------------------------------------------------
create policy "mca_conn_select_member"
  on public.mca_connections for select
  using (auth.uid() = user_a or auth.uid() = user_b);

create policy "mca_conn_insert_member"
  on public.mca_connections for insert
  with check (auth.uid() = user_a or auth.uid() = user_b);

create policy "mca_conn_update_member"
  on public.mca_connections for update
  using (auth.uid() = user_a or auth.uid() = user_b)
  with check (auth.uid() = user_a or auth.uid() = user_b);

create policy "mca_conn_delete_member"
  on public.mca_connections for delete
  using (auth.uid() = user_a or auth.uid() = user_b);

-- ----------------------------------------------------------------------------
-- messages
-- Only participants of a connection may read/write its messages.
-- ----------------------------------------------------------------------------
create policy "mca_msg_select_participant"
  on public.mca_messages for select
  using (
    exists (
      select 1 from public.mca_connections c
      where c.id = mca_messages.connection_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

create policy "mca_msg_insert_participant"
  on public.mca_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.mca_connections c
      where c.id = mca_messages.connection_id
        and (c.user_a = auth.uid() or c.user_b = auth.uid())
    )
  );

-- Soft-delete only (set deleted_at). Sender may only delete own messages.
create policy "mca_msg_delete_sender"
  on public.mca_messages for update
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

-- ----------------------------------------------------------------------------
-- calls
-- ----------------------------------------------------------------------------
create policy "mca_calls_select_participant"
  on public.mca_calls for select
  using (auth.uid() = caller_id or auth.uid() = callee_id);

create policy "mca_calls_insert_participant"
  on public.mca_calls for insert
  with check (auth.uid() = caller_id or auth.uid() = callee_id);

create policy "mca_calls_update_participant"
  on public.mca_calls for update
  using (auth.uid() = caller_id or auth.uid() = callee_id)
  with check (auth.uid() = caller_id or auth.uid() = callee_id);

-- ----------------------------------------------------------------------------
-- call_logs
-- ----------------------------------------------------------------------------
create policy "mca_call_logs_select_self"
  on public.mca_call_logs for select
  using (auth.uid() = user_id);

create policy "mca_call_logs_insert_self"
  on public.mca_call_logs for insert
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- blocked_users
-- ----------------------------------------------------------------------------
create policy "mca_blocked_select_blocker"
  on public.mca_blocked_users for select
  using (auth.uid() = blocker_id);

create policy "mca_blocked_insert_blocker"
  on public.mca_blocked_users for insert
  with check (auth.uid() = blocker_id);

create policy "mca_blocked_delete_blocker"
  on public.mca_blocked_users for delete
  using (auth.uid() = blocker_id);

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
create policy "mca_notif_select_owner"
  on public.mca_notifications for select
  using (auth.uid() = user_id);

create policy "mca_notif_update_owner"
  on public.mca_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "mca_notif_delete_owner"
  on public.mca_notifications for delete
  using (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- rejection_cooldowns
-- The requester can see their own cooldown; the rejecter manages it.
-- ----------------------------------------------------------------------------
create policy "mca_cooldown_select_involved"
  on public.mca_rejection_cooldowns for select
  using (auth.uid() = requester_id or auth.uid() = rejecter_id);

create policy "mca_cooldown_insert_rejecter"
  on public.mca_rejection_cooldowns for insert
  with check (auth.uid() = rejecter_id);

create policy "mca_cooldown_delete_involved"
  on public.mca_rejection_cooldowns for delete
  using (auth.uid() = requester_id or auth.uid() = rejecter_id);

-- ----------------------------------------------------------------------------
-- presence
-- ----------------------------------------------------------------------------
create policy "mca_presence_select_any"
  on public.mca_presence for select
  using (true);

create policy "mca_presence_upsert_self"
  on public.mca_presence for insert
  with check (auth.uid() = user_id);

create policy "mca_presence_update_self"
  on public.mca_presence for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Realtime: add tables to the supabase_realtime publication
-- ----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'public.mca_users',
      'public.mca_connection_requests',
      'public.mca_connections',
      'public.mca_messages',
      'public.mca_calls',
      'public.mca_call_logs',
      'public.mca_blocked_users',
      'public.mca_notifications',
      'public.mca_presence'
    ])
  loop
    begin
      execute format('alter publication supabase_realtime add table %s', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
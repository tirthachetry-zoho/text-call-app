-- ============================================================================
-- msg-call-app — Database Schema
-- Phone-number based calling & messaging platform
-- Target: Supabase (PostgreSQL 15+)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ----------------------------------------------------------------------------
-- ENUMs
-- ----------------------------------------------------------------------------
do $$ begin
  create type connection_status as enum ('pending', 'accepted', 'rejected', 'removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type message_status as enum ('sent', 'delivered', 'read');
exception when duplicate_object then null; end $$;

do $$ begin
  create type call_status as enum ('missed', 'completed', 'rejected', 'ongoing');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_type as enum (
    'connection_request',
    'connection_accepted',
    'connection_rejected',
    'message',
    'incoming_call',
    'missed_call'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type user_status as enum ('online', 'offline', 'away');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- users
-- Profile is 1:1 with auth.users (id = auth.users.id)
-- ----------------------------------------------------------------------------
create table if not exists public.mca_users (
  id uuid primary key references auth.users (id) on delete cascade,
  phone_number text not null unique,
  display_name text,
  avatar text,
  status user_status not null default 'offline',
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mca_users_phone_number_idx on public.mca_users (phone_number);
create index if not exists mca_users_status_idx on public.mca_users (status);

-- ----------------------------------------------------------------------------
-- connection_requests
-- ----------------------------------------------------------------------------
create table if not exists public.mca_connection_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.mca_users (id) on delete cascade,
  receiver_id uuid not null references public.mca_users (id) on delete cascade,
  status connection_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sender_id, receiver_id)
);

create index if not exists mca_connection_requests_receiver_idx on public.mca_connection_requests (receiver_id, status);
create index if not exists mca_connection_requests_sender_idx on public.mca_connection_requests (sender_id, status);

-- ----------------------------------------------------------------------------
-- connections
-- A bidirectional accepted connection. Stored once per pair (lowest id first).
-- ----------------------------------------------------------------------------
create table if not exists public.mca_connections (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.mca_users (id) on delete cascade,
  user_b uuid not null references public.mca_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  muted boolean not null default false,
  check (user_a < user_b),
  unique (user_a, user_b)
);

create index if not exists mca_connections_user_a_idx on public.mca_connections (user_a);
create index if not exists mca_connections_user_b_idx on public.mca_connections (user_b);

-- ----------------------------------------------------------------------------
-- messages
-- ----------------------------------------------------------------------------
create table if not exists public.mca_messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.mca_connections (id) on delete cascade,
  sender_id uuid not null references public.mca_users (id) on delete cascade,
  content text,
  attachment_url text,
  attachment_type text,
  status message_status not null default 'sent',
  deleted_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mca_messages_connection_idx on public.mca_messages (connection_id, created_at desc);

-- Allow messages to be edited (tracks the last edit time). Safe for both
-- fresh installs (column already present above) and existing databases.
alter table if exists public.mca_messages
  add column if not exists edited_at timestamptz;
create index if not exists mca_messages_sender_idx on public.mca_messages (sender_id);

-- ----------------------------------------------------------------------------
-- calls
-- ----------------------------------------------------------------------------
create table if not exists public.mca_calls (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.mca_connections (id) on delete cascade,
  caller_id uuid not null references public.mca_users (id) on delete cascade,
  callee_id uuid not null references public.mca_users (id) on delete cascade,
  status call_status not null default 'ongoing',
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists mca_calls_connection_idx on public.mca_calls (connection_id, started_at desc);
create index if not exists mca_calls_callee_idx on public.mca_calls (callee_id);

-- ----------------------------------------------------------------------------
-- call_logs (per-participant history rows)
-- ----------------------------------------------------------------------------
create table if not exists public.mca_call_logs (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references public.mca_calls (id) on delete cascade,
  user_id uuid not null references public.mca_users (id) on delete cascade,
  peer_id uuid not null references public.mca_users (id) on delete cascade,
  direction text not null check (direction in ('incoming', 'outgoing')),
  status call_status not null,
  duration_seconds integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists mca_call_logs_user_idx on public.mca_call_logs (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- blocked_users
-- ----------------------------------------------------------------------------
create table if not exists public.mca_blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.mca_users (id) on delete cascade,
  blocked_id uuid not null references public.mca_users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id)
);

create index if not exists mca_blocked_users_blocker_idx on public.mca_blocked_users (blocker_id);

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
create table if not exists public.mca_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.mca_users (id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text,
  reference_id uuid,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists mca_notifications_user_idx on public.mca_notifications (user_id, read, created_at desc);

-- ----------------------------------------------------------------------------
-- rejection_cooldowns
-- Tracks when a user rejected a request so the sender cannot re-request
-- for a configurable cooldown window.
-- ----------------------------------------------------------------------------
create table if not exists public.mca_rejection_cooldowns (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.mca_users (id) on delete cascade,
  rejecter_id uuid not null references public.mca_users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (requester_id, rejecter_id)
);

create index if not exists mca_rejection_cooldowns_rejecter_idx on public.mca_rejection_cooldowns (rejecter_id, expires_at);

-- ----------------------------------------------------------------------------
-- presence (lightweight online tracking for realtime)
-- ----------------------------------------------------------------------------
create table if not exists public.mca_presence (
  user_id uuid primary key references public.mca_users (id) on delete cascade,
  status user_status not null default 'offline',
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Triggers: updated_at maintenance
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger mca_users_set_updated_at
  before update on public.mca_users
  for each row execute function public.set_updated_at();

create or replace trigger mca_connection_requests_set_updated_at
  before update on public.mca_connection_requests
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Trigger: create user profile on signup
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.mca_users (id, phone_number)
  values (
    new.id,
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone_number', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Trigger: when a request is accepted, create a connection + notification
-- ----------------------------------------------------------------------------
create or replace function public.accept_connection_request()
returns trigger as $$
declare
  ua uuid;
  ub uuid;
begin
  if new.status = 'accepted' and old.status <> 'accepted' then
    ua := least(new.sender_id, new.receiver_id);
    ub := greatest(new.sender_id, new.receiver_id);

    insert into public.mca_connections (user_a, user_b)
    values (ua, ub)
    on conflict (user_a, user_b) do nothing;

    insert into public.mca_notifications (user_id, type, title, body, reference_id)
    values (
      new.sender_id,
      'connection_accepted',
      'Connection accepted',
      'Your connection request was accepted.',
      new.id
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_connection_request_accepted
  after update on public.mca_connection_requests
  for each row execute function public.accept_connection_request();

-- ----------------------------------------------------------------------------
-- Trigger: when a request is rejected, set a cooldown for the requester
-- ----------------------------------------------------------------------------
create or replace function public.reject_connection_request()
returns trigger as $$
declare
  cooldown_hours integer := coalesce(
    nullif(current_setting('app.rejection_cooldown_hours', true), '')::integer,
    24
  );
begin
  if new.status = 'rejected' and old.status <> 'rejected' then
    insert into public.mca_rejection_cooldowns (requester_id, rejecter_id, expires_at)
    values (new.sender_id, new.receiver_id, now() + (cooldown_hours || ' hours')::interval)
    on conflict (requester_id, rejecter_id)
    do update set expires_at = excluded.expires_at, created_at = now();

    insert into public.mca_notifications (user_id, type, title, body, reference_id)
    values (
      new.sender_id,
      'connection_rejected',
      'Connection rejected',
      'Your connection request was rejected.',
      new.id
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_connection_request_rejected
  after update on public.mca_connection_requests
  for each row execute function public.reject_connection_request();

-- ----------------------------------------------------------------------------
-- Helper: are two users connected?
-- ----------------------------------------------------------------------------
create or replace function public.are_connected(a uuid, b uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.mca_connections c
    where c.user_a = least(a, b) and c.user_b = greatest(a, b)
  );
end;
$$ language plpgsql stable security definer;

-- ----------------------------------------------------------------------------
-- Helper: is a user blocked by another?
-- ----------------------------------------------------------------------------
create or replace function public.is_blocked(blocker uuid, blocked uuid)
returns boolean as $$
begin
  return exists (
    select 1 from public.mca_blocked_users b
    where b.blocker_id = blocker and b.blocked_id = blocked
  );
end;
$$ language plpgsql stable security definer;
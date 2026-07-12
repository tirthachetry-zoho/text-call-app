-- ============================================================================
-- msg-call-app — Seed Data
-- NOTE: Supabase Auth users must be created first (via the dashboard or the
-- auth admin API). The ids below are placeholders — replace them with the
-- real auth.users ids, or use the provided script in README to create them.
-- This seed assumes three demo users already exist in auth.users.
-- ============================================================================

-- Replace these UUIDs with real auth.users ids before running.
-- For local dev you can run: supabase auth signup for each, then copy ids.

-- Example (commented). Uncomment and edit after creating auth users:
--
-- insert into public.mca_users (id, phone_number, display_name, status)
-- values
--   ('11111111-1111-1111-1111-111111111111', '+15550000001', 'Alice', 'online'),
--   ('22222222-2222-2222-2222-222222222222', '+15550000002', 'Bob', 'offline'),
--   ('33333333-3333-3333-3333-333333333333', '+15550000003', 'Carol', 'away')
-- on conflict (id) do nothing;

-- -- Alice & Bob are connected
-- insert into public.mca_connections (user_a, user_b)
-- values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
-- on conflict (user_a, user_b) do nothing;

-- -- A pending request from Carol -> Alice
-- insert into public.mca_connection_requests (sender_id, receiver_id, status)
-- values ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'pending')
-- on conflict (sender_id, receiver_id) do nothing;

-- -- Sample messages between Alice & Bob
-- insert into public.mca_messages (connection_id, sender_id, content, status)
-- select c.id, '11111111-1111-1111-1111-111111111111', 'Hey Bob!', 'read'
-- from public.mca_connections c
-- where c.user_a = '11111111-1111-1111-1111-111111111111'
--   and c.user_b = '22222222-2222-2222-2222-222222222222';

-- insert into public.mca_messages (connection_id, sender_id, content, status)
-- select c.id, '22222222-2222-2222-2222-222222222222', 'Hi Alice, how are you?', 'delivered'
-- from public.mca_connections c
-- where c.user_a = '11111111-1111-1111-1111-111111111111'
--   and c.user_b = '22222222-2222-2222-2222-222222222222';

-- -- Sample call log
-- insert into public.mca_call_logs (call_id, user_id, peer_id, direction, status, duration_seconds)
-- values (
--   gen_random_uuid(),
--   '11111111-1111-1111-1111-111111111111',
--   '22222222-2222-2222-2222-222222222222',
--   'outgoing', 'completed', 142
-- );
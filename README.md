# Connect — Phone-Number Calling & Messaging Platform

A modern web app where users connect using **verified phone numbers** instead of usernames.
Communication (voice calls and messaging) is only possible after the recipient **explicitly accepts**
the connection request. Built with Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui,
Supabase (Auth + Postgres + Realtime + Storage), and WebRTC for browser-to-browser
voice calling.

## Features

- **Phone-number auth** via simple registration (phone number + display name, no OTP). Each number is unique.
- **Connection flow**: request → accept/reject → messaging + calling unlocked.
- **Privacy-first**: no phone-number list, no online-user directory, no searchable directory.
  Block / unblock / remove / mute. Rejection cooldown (configurable).
- **Realtime chat**: delivered & read receipts, typing indicator, emoji, image/file sharing,
  message search, self-delete, infinite scroll.
- **WebRTC voice calling**: incoming screen, accept/reject, mute, speaker, end, call timer,
  reconnect handling, missed-call notifications. Signaling over Supabase Realtime broadcast.
- **Realtime notifications** for requests, messages, calls, missed calls.
- **Dashboard**: left sidebar (Chats / Connections / Requests / Calls / Settings), center
  conversation, right sidebar (Contact Info / Shared Files / Call History).
- **Settings**: display name, avatar, dark mode, notifications, privacy, delete account.
- **Security**: Row Level Security, JWT auth, rate limiting, Zod validation, CSP/CSRF/XSS headers.

## Tech Stack

| Concern        | Technology |
| -------------- | ---------- |
| Framework      | Next.js 15 (App Router) + React 19 |
| Language       | TypeScript |
| Styling        | Tailwind CSS + shadcn/ui |
| Backend/DB     | Supabase (Postgres, Auth, Realtime, Storage) |
| Auth           | Supabase (phone + name, no OTP) |
| Voice          | WebRTC (peer connection) + Supabase broadcast signaling |
| Validation      | Zod |
| Lint/Format    | ESLint + Prettier |
| Deploy         | Vercel |

## Folder Structure

```
.
├── src/
│   ├── app/
│   │   ├── api/                 # Route handlers (auth, connections, messages, calls, blocks, profile, notifications)
│   │   ├── dashboard/           # Authenticated dashboard (chats, connections, requests, calls, settings)
│   │   ├── login/               # Registration / sign-in page
│   │   ├── layout.tsx           # Root layout (theme + toaster)
│   │   └── page.tsx             # Entry → redirect to login/dashboard
│   ├── components/
│   │   ├── auth/                # Auth context
│   │   ├── call/                # WebRTC call context + overlay
│   │   ├── chat/                # Chat list + conversation
│   │   ├── connections/         # Connection request dialog
│   │   ├── dashboard/           # Shell, sidebar, notifications, right sidebar
│   │   ├── realtime/            # Realtime provider (postgres changes + broadcast)
│   │   └── ui/                  # shadcn/ui primitives
│   ├── lib/
│   │   ├── supabase/            # Browser / server / admin clients + session signing
│   │   ├── validations.ts       # Zod schemas
│   │   ├── rate-limit.ts        # In-memory rate limiter
│   │   ├── types.ts             # Domain types
│   │   └── utils.ts             # Helpers
│   ├── middleware.ts            # Session refresh
│   └── globals.css
├── supabase/
│   ├── schema.sql              # Tables, enums, triggers, functions
│   ├── policies.sql            # Row Level Security policies + realtime publication
│   └── seed.sql                # Example seed data (edit UUIDs)
├── .env.example
├── vercel.json
├── next.config.mjs
├── tailwind.config.ts
└── tsconfig.json
```

## Prerequisites

- Node.js >= 18.18
- A Supabase project
- (Optional) Vercel account for deployment

## Local Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env.local
   ```

   Fill in:

   | Variable | Description |
   | -------- | ----------- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-only) |
   | `SUPABASE_JWT_SECRET` | JWT secret (Project Settings → API → JWT Settings) |
   | `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |
   | `REJECTION_COOLDOWN_HOURS` | Hours a rejected requester must wait (default 24) |
   | `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Rate-limit tuning |

3. **Set up the database**

   In the Supabase SQL editor (or `supabase db` CLI), run in order:

   ```sql
   -- 1. Schema
   \i supabase/schema.sql
   -- 2. Policies + realtime
   \i supabase/policies.sql
   ```

   > The `on_auth_user_created` trigger creates a `users` profile row automatically when a
   > Supabase auth user is created. Because we create the auth user via the admin API on
   > registration, the profile is created for you.

4. **(Optional) Seed data**

   Edit the UUIDs in `supabase/seed.sql` to match real auth users, then run it.

5. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000.

## Authentication Flow

1. User enters phone number + display name → `POST /api/auth/register` ensures a Supabase auth
   user exists (creating one on first use) and returns a Supabase-compatible signed JWT session.
2. The browser calls `supabase.auth.setSession(...)` to establish the session.

> We sign our own Supabase-compatible JWT (HS256 with `SUPABASE_JWT_SECRET`) after registration.
> This keeps auth fully phone-based without relying on an SMS/OTP provider.

## Connection Flow

1. Enter a phone number → `POST /api/connections/request`.
   - If not registered → `"This phone number is not registered."`
   - Enforces: not self, not blocked, not already connected/requested, not in cooldown.
2. Recipient gets a realtime notification and can **Accept** / **Reject**.
3. On accept, a `connections` row is created (via DB trigger) and messaging + calling unlock.
4. On reject, a cooldown is recorded so the requester cannot re-request for `REJECTION_COOLDOWN_HOURS`.

## WebRTC Voice Calling

- Caller creates a `calls` row, opens an `RTCPeerConnection`, creates an SDP **offer**, and sends it
  to the callee over a Supabase Realtime **broadcast** channel (`user:<calleeId>`).
- Callee receives the offer, answers, and exchanges ICE candidates the same way.
- Audio plays through a hidden `<audio>` element. Mute toggles the local track. End/cancel/reject
  sends a control signal and writes a `call_logs` entry for both participants.
- Missed calls are recorded when a call is rejected/cancelled before being answered.

> For production scale, add TURN servers to `rtcConfig` in `src/components/call/call-context.tsx`
> and consider a dedicated signaling service. The current signaling uses Supabase broadcast, which
> is sufficient for moderate traffic.

## Security

- **RLS** enabled on every table; policies restrict access to row owners / connection participants.
- **JWT** auth on every request; server routes use the anon key + RLS, admin tasks use the service role.
- **Rate limiting** on the registration and connection-request endpoints (in-memory; swap for Redis/Upstash at scale).
- **Input validation** with Zod on every API route.
- **CSP / X-Frame-Options / X-Content-Type-Options / Referrer-Policy** headers set in `next.config.mjs`.
- **No directory enumeration**: there is no searchable user list; phone numbers are resolved only
  one-at-a-time for connection requests.

## Testing

```bash
# Type checking
npm run typecheck

# Lint
npm run lint

# Production build
npm run build

# Format
npm run format
```

Manual end-to-end test (two browsers / devices):

1. Register with phone A, register with phone B.
2. From A, send a connection request to B's number.
3. As B, accept the request in **Requests**.
4. Open the chat, exchange messages (verify receipts + realtime).
5. Start a voice call from A → B accepts → talk → end. Check call history.
6. Test block / unblock / remove / mute and settings (dark mode, display name, avatar, delete account).

## Deployment (Vercel)

1. Push the repo to GitHub.
2. In Vercel, import the project. Framework preset: **Next.js** (auto-detected).
3. Add the environment variables from `.env.example` (use Vercel's encrypted env).
4. Run the Supabase SQL files (`schema.sql`, then `policies.sql`) against your production project.
5. Deploy. `vercel.json` already declares the build command and env mapping.

```bash
vercel --prod
```

## Notes & Limitations

- The in-memory rate limiter is per-instance; for multi-instance production use a shared store.
- File/image sharing UI is scaffolded (attachment fields + shared-files tab); wire it to Supabase
  Storage upload for full functionality.
- WebRTC requires HTTPS (or localhost) and microphone permissions.
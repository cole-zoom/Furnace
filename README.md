<h1>🔥 Furnace</h1>

A personal CRM for one person. Tasks on a board or in a table, meetings pulled
from Google Calendar, transcripts pasted from Granola and summarised by Gemini,
and the people behind all of it.

Built to look and feel like [Attio](https://attio.com) — the design tokens here
are lifted from their shipped stylesheet, not eyeballed.

---

## The stack

| Piece | Choice |
|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind v4 |
| Hosting | Vercel |
| Auth | Supabase Auth → Google OAuth |
| Database | Supabase Postgres |
| Security | Row Level Security, on every table, with tests |
| Calendar | Google Calendar API (read-only) |
| Transcripts | Granola → manual paste |
| AI | Gemini 2.5 Flash (free tier) |
| Drag & drop | dnd-kit |

---

## Security model

The brief was "only I can access my stuff" — so this is the part worth reading.

**The database is the boundary, not the app.** The browser holds a publishable
key and can call PostgREST directly for any table, so no amount of careful
frontend code would matter if RLS were wrong. Every table has RLS enabled, every
policy is scoped `to authenticated`, and every policy compares against
`auth.uid()`.

Specific things that are easy to get wrong and are handled here:

- **`UPDATE` policies carry both `USING` and `WITH CHECK`.** Without the second
  clause a user can update their own row and reassign `user_id` to someone else.
  This is the single most commonly missed hole in a Supabase schema.
- **Foreign keys are re-validated in the policy.** You can't staple an action
  item onto a meeting you don't own, even though you own the action row.
- **`google_tokens` has RLS on and zero policies**, plus explicit `REVOKE`s. It
  is reachable only by `service_role`, from server code. OAuth refresh tokens are
  never fetchable with an anon key.
- **Refresh tokens are encrypted at rest** with AES-256-GCM using a key that
  lives in the app environment, not the database — so a database dump alone
  doesn't yield working Google credentials.
- **Signups are allowlisted by a trigger on `auth.users`.** A stranger who
  completes Google's OAuth flow never gets an account created at all; the
  transaction aborts before the row exists. `ALLOWED_EMAILS` is a second gate in
  front of it, re-checked on every request so revoking access is immediate.
- **Server Actions re-check auth themselves.** `proxy.ts` redirects signed-out
  visitors, but Next's docs are explicit that proxy is not an authorization
  boundary — Server Actions are POSTs to the page route and can skip the matcher.
  Every action calls `getUser()` before it touches data.
- **`getUser()`, never `getSession()`**, server-side. `getSession()` only decodes
  what the cookie claims; `getUser()` revalidates the JWT with the auth server.
- A migration asserts all of the above at deploy time and **fails the deploy** if
  any public table ships without RLS, or any table is missing a policy.

### Proving it

```bash
brew install postgresql@17     # one-time; no Docker needed
./scripts/test-rls.sh
```

This spins up a throwaway Postgres, applies the real migrations on top of a small
Supabase shim, then runs an adversarial suite: two users, and every "can B touch
A's data" question answered. It covers cross-user reads, targeted-by-primary-key
reads, `user_id` reassignment, cross-parent inserts, the `google_tokens`
lockdown, anonymous access, and the signup allowlist.

---

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local
```

### 2. Supabase

The `supabase/` folder is laid out for Supabase's GitHub integration — point the
project at this repo with the working directory left blank (the root), and the
migrations in `supabase/migrations/` apply automatically on push.

To apply them by hand instead:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Then in the dashboard:

- **Authentication → Providers → Google**: enable it, paste your client ID and
  secret.
- **Authentication → URL Configuration**: set the site URL, and add
  `https://<your-domain>/auth/callback` plus
  `http://localhost:3000/auth/callback` to the redirect allowlist.
- **Table Editor → `allowed_emails`**: confirm your address is in there. It's
  seeded by `20260901000300_allowlist.sql`; nobody can sign in without a row.

### 3. Google Cloud

1. Create an OAuth 2.0 client (Web application) at
   [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services
   → Credentials.
2. Authorised redirect URI:
   `https://<your-project-ref>.supabase.co/auth/v1/callback`
3. Enable the **Google Calendar API** for the project.
4. On the OAuth consent screen add the scopes
   `calendar.readonly` and `calendar.events.readonly`.
5. Put the client ID and secret in **both** Supabase (step 2) and `.env.local` —
   Supabase uses them for sign-in, and this app uses them to refresh the access
   token for background calendar reads.

### 4. Gemini

Grab a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
and set `GEMINI_API_KEY`.

### 5. Encryption key

```bash
openssl rand -base64 32   # → TOKEN_ENCRYPTION_KEY
```

Changing this later makes existing stored Google tokens undecryptable — you'd
just reconnect Google from Settings.

### 6. Run

```bash
npm run dev
```

Settings has a live configuration checklist showing which variables are still
missing. It reports presence only, never values.

### 7. Deploy

Push to Vercel, then add every variable from `.env.example` to the project. Set
`NEXT_PUBLIC_SITE_URL` to the real domain, and add that domain's
`/auth/callback` to the Supabase redirect allowlist.

---

## Using it

**Tasks** — board or table, toggled top right and remembered. Drag cards between
columns; the drop writes one row, not the whole column (fractional sort keys).
`N` for a new task, `⌘K` for the command palette, `T` to paste a transcript.

**Meetings** — *Sync calendar* pulls your primary Google Calendar (14 days back,
21 forward) into meetings and harvests attendees into People. Syncing never
overwrites a transcript, summary, or note you already have.

**Transcripts** — Granola's free tier has no API, so: copy the transcript, hit
`T`, paste, *Summarise*. Gemini returns a summary, key points, decisions and
action items; each action item can be promoted to a real task with one click or
dismissed. Re-running replaces the model's previous read but leaves anything
you already promoted alone.

**People** — populated automatically from calendar attendees. Company, role and
notes are yours to fill in and are never overwritten by a sync.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `./scripts/test-rls.sh` | Adversarial RLS suite against a throwaway Postgres |

---

## Layout

```
src/
  app/
    (app)/            authenticated pages — layout calls requireUser()
    api/              process-meeting (Gemini), calendar/sync
    auth/             OAuth callback, signout, error
    login/
  components/         UI, all Attio-token-driven
  lib/
    supabase/         browser / server / admin clients
    actions.ts        Server Actions — each re-checks auth
    auth.ts           the data access layer's front door
    crypto.ts         AES-256-GCM for OAuth tokens
    google.ts         token custody + Calendar reads
    gemini.ts         transcript → structured insights
  proxy.ts            session refresh + redirects (NOT the security boundary)
supabase/
  migrations/         schema, RLS, allowlist, deploy-time assertions
  tests/              the adversarial RLS suite
```

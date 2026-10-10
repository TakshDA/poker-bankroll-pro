# Poker Bankroll Pro

A bankroll tracker for live and online poker: cash sessions, tournaments, multiple bankroll accounts, expenses, analytics, a calendar and exports.

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind · PostgreSQL with row-level security (Supabase-compatible) · Recharts · Zod · Vitest.

> **Status:** work in progress, built in phases. See the [implementation checklist](#implementation-checklist) for what exists and what does not yet.

## Local development

Requirements: Node 22+, pnpm, PostgreSQL 15+ running locally.

```bash
pnpm install
cp .env.example .env.local          # defaults target a local Postgres
createdb poker_bankroll             # as a superuser, e.g. the postgres role
pnpm db:migrate                     # applies supabase/migrations (+ local auth shim)
pnpm user:create you@example.com    # prompts for / reads PBP_PASSWORD
pnpm dev                            # http://localhost:3000
```

Optional demo data (a year of deterministic sessions, tournaments, expenses and transfers for a separate demo user; refuses to run in production or for a user who already has accounts):

```bash
pnpm db:seed-demo                   # demo@example.com / demo-password-123
```

### How security works locally

- `DB_LOCAL_SHIM=true` makes `db:migrate` create a minimal stand-in for Supabase's `auth` schema and roles, so the same migrations and RLS policies run on plain Postgres.
- The app connects as `pbp_app`, which owns nothing and can only act through the `authenticated` role. Every request runs in a transaction that sets `request.jwt.claims` to the signed-in user, so RLS policies (`user_id = auth.uid()`) apply to every query. Guessing another record's id returns nothing.
- `DATABASE_ADMIN_URL` (schema owner) is used only by `pnpm db:migrate`.
- Public sign-up is off (`ALLOW_SIGNUP=false`); create the owner with `pnpm user:create`.
- No secret is exposed to the browser: only `NEXT_PUBLIC_*` variables reach the client, and the app needs none of them with local auth.

## Deploying (Vercel + Supabase)

1. Create a Supabase project. In **SQL Editor**, paste and run [`supabase/setup.sql`](supabase/setup.sql) once (regenerate it with `pnpm db:setup-sql` after adding migrations). Check that a private Storage bucket named `attachments` exists.
2. Import the GitHub repo into Vercel and set these environment variables before the first deploy (`NEXT_PUBLIC_*` values are built into the app, so changing them needs a redeploy):

   | Variable | Value |
   |---|---|
   | `AUTH_PROVIDER` | `supabase` |
   | `ALLOW_SIGNUP` | `true` to let anyone register (each user sees only their own data) |
   | `STORAGE_PROVIDER` | `supabase` |
   | `DATABASE_URL` | Supabase transaction-pooler URI (port 6543) |
   | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project URL and anon/publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role/secret key (server only; used for private file storage) |

3. In Supabase **Authentication → URL Configuration**, set the Site URL to your Vercel URL and add `https://<your-app>.vercel.app/**` to Redirect URLs, so confirmation and password-reset emails link back to the app.
4. Supabase's built-in email sender is rate-limited and meant for testing; configure custom SMTP under Authentication → Emails before inviting many users.

How sign-in works with Supabase: new users confirm their email (`/auth/confirm` handles the link), "Forgot your password?" emails a reset link that opens `/reset-password`, and `src/proxy.ts` refreshes the session cookies. The app still queries Postgres as the `authenticated` role with the user's id, so the same RLS policies apply.

## Tests

```bash
pnpm typecheck
pnpm lint
pnpm test:unit          # financial formulas, ledger, exports, reminders
pnpm test:integration   # needs the local database: RLS isolation, services, backup, deletion
pnpm test               # both
```

## Financial rules (summary)

- Money is stored and calculated as integer minor units (cents); never floats.
- One calculation layer (`src/lib/finance`) is used by every page, export and report.
- Account balances are derived from a single ledger: `opening + deposits − withdrawals ± transfers + poker results + bonuses/rakeback − expenses ± adjustments`.
- Deposits, withdrawals and transfers change balances but are never profit. A transfer nets to zero across accounts (a cross-currency transfer records both sides).
- Rake and tips are informational on a cash session: the cash-out already reflects them, so they are not deducted twice. Each expense is deducted once, from one account.
- Multi-currency totals are converted only with a recorded exchange rate; anything without a rate is excluded and flagged.

## Implementation checklist

Done and tested (unit/integration tests and/or browser runs against local Postgres):

- [x] Schema, migrations, foreign keys, constraints, RLS on every table, audit trail, soft delete
- [x] Local password auth, rate-limited sign-in
- [x] Supabase Auth: open sign-up with email confirmation, password reset, session refresh (tested against a local Supabase Postgres + GoTrue stack, not yet against the hosted project)
- [x] Bankroll accounts, deposits/withdrawals, transfers (incl. cross-currency), thresholds and goals per account
- [x] Cash sessions: create, edit, duplicate, delete, sessions crossing midnight, currencies, drafts
- [x] Tournaments: multiple entries/re-entries, multi-day periods, bounties, ROI/ITM
- [x] Expenses with duplicate detection and links to sessions/tournaments
- [x] Ledger page, trash with restore and permanent delete
- [x] Dashboard, cash analytics (incl. bb/100), tournament analytics
- [x] Advanced analytics: measured stats separated from estimates (confidence interval, Monte Carlo)
- [x] Calendar: month/week/day, planned sessions, notes, in-app reminders (shown while the app is open; no email or push)
- [x] Reports: period profit summary, account statements that reconcile opening → closing, monthly table
- [x] Exports: CSV, Excel, PDF, JSON per table; full JSON backup download

Not done yet:

- [ ] CSV import (column mapping, validation, duplicate detection, preview) and import history
- [ ] Goals & responsible-play limits management page
- [ ] Restore from a JSON backup; `pnpm backup` script (`scripts/backup.ts` does not exist yet)
- [ ] Settings pages (currencies and rates, games, venues, categories, preferences, password change, account deletion UI)
- [ ] Playwright E2E suite (`pnpm test:e2e` has no tests yet), production build check, security review
- [ ] Supabase Storage provider for attachments: code exists but has **not** been tested
- [ ] Deployment and backup documentation

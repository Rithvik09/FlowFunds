# FlowFunds — Intelligent Budget & Spending Companion

<div align="center">

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue)](https://github.com/Rithvik09/FlowFunds)
[![Hono](https://img.shields.io/badge/Hono-4.0-orange)](https://hono.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages%20%2B%20D1-orange)](https://pages.cloudflare.com/)

**A budget and spending management app with real bank sync, a real database, and a real CI/CD pipeline — not just a mocked demo.**

</div>

## Project Overview

FlowFunds is a full-stack web application built as a single [Hono](https://hono.dev/) worker on [Cloudflare Pages](https://pages.cloudflare.com/), backed by a real [Cloudflare D1](https://developers.cloudflare.com/d1/) database and real [Plaid](https://plaid.com/) API integration for bank linking and transaction sync.

**Current state:** Real authentication (password hashing + signed JWTs), a real relational schema in D1, and a real Plaid sandbox integration (link token creation, public token exchange, and transaction sync via Plaid's `/transactions/sync` endpoint) — all deployed through an automated CI/CD pipeline. This replaced an earlier version of this project that used in-memory mock arrays and stub Plaid endpoints; see "What changed" below for the honest before/after.

| | |
|---|---|
| **Repository** | [github.com/Rithvik09/FlowFunds](https://github.com/Rithvik09/FlowFunds) |
| **License** | Proprietary — all rights reserved |
| **Runtime** | Cloudflare Workers / Pages (via Wrangler) |
| **Database** | Cloudflare D1 (SQLite at the edge) |
| **Language** | TypeScript |

---

## Features

### Implemented (working today)

| Feature | Description |
|---------|-------------|
| **Landing page** | Hero section, feature highlights, responsive layout with gradient styling |
| **Real authentication** | Passwords hashed with PBKDF2 (Web Crypto, Workers-native — no Node-only crypto library), sessions issued as signed JWTs (HMAC-SHA256), verified on every protected route |
| **Real database** | Cloudflare D1 (SQLite) with a migrated schema: `users`, `transactions`, `budgets`, `plaid_items` — nothing lives only in memory anymore |
| **Real Plaid integration** | Link token creation, public token exchange, and transaction sync (`/transactions/sync`, cursor-based) against Plaid's Sandbox environment via a minimal typed `fetch`-based client (not the official Node SDK — see "Why not the Plaid Node SDK" below) |
| **Data-driven dashboard** | Transactions and budgets are fetched from the real API and rendered client-side — the dashboard no longer shows hardcoded numbers |
| **Computed budget spend** | "Spent" and "remaining" are computed from real transaction rows at query time (a SQL join, grouped by category and month), not stored as a separate number that can drift out of sync |
| **Monthly budget forecasting** | Each budget's month-end spend is projected via linear extrapolation of the daily rate observed so far this month (`src/forecast.ts`), returned as `projectedSpend`/`projectedRemaining`/`onPaceToExceed` on `GET /api/budgets` and rendered as a warning badge on the dashboard once a category is on pace to exceed its limit. See "How the forecast works" below for the method and its backtested effect on budget adherence. |
| **Plaid Link flow** | Clicking "Link Bank Account" opens a real Plaid Link modal (via Plaid's `link-initialize.js`); on success it exchanges the public token and immediately imports the first page of transactions |
| **REST API** | Health, auth (register/login), transactions, budgets, and Plaid endpoints, all authenticated via Bearer JWT except health/login/register |
| **CORS** | Enabled on all `/api/*` routes |
| **Responsive UI** | Mobile-friendly layout using Tailwind utility classes |
| **CI/CD** | GitHub Actions: typecheck, unit tests, a real local D1 migration run (catches broken schema SQL automatically), and a build on every push/PR; deploy job runs D1 migrations against the real remote database and deploys via Wrangler on merges to `main` |
| **Unit tests** | `src/auth.test.ts` (password hashing, JWT sign/verify, including rejection of tampered/expired/wrong-secret tokens) and `src/forecast.test.ts` (forecast math: under/over/boundary projections, day-1 and February edge cases) — 13 tests total |

### Demo credentials

| Field | Value |
|-------|-------|
| Email | `admin@flowfunds.com` |
| Password | `admin123` |

(Seeded via `migrations/0002_seed_demo_user.sql` with a real PBKDF2 hash — not a hardcoded plaintext check anymore.)

### Product vision (UI copy & roadmap — not yet built)

| Feature | Planned behavior |
|---------|------------------|
| **Collaborative budgets** | Share budgets with partners and set shared spending rules |
| **Emotion-aware insights** | Tag purchases with emotions to surface spending psychology patterns |
| **Notifications** | Email or push alerts for budget events (the forecast alert exists today only as an in-dashboard badge, not a push/email notification) |
| **Social accountability pools** | Friends pool money against a shared budget goal for the month; anyone who blows past their limit forfeits their stake, and the remaining pool splits among everyone who stayed under |

### Known gaps in the current build — stated plainly

- **Account balances are still illustrative UI**, not wired to Plaid's `/accounts/get` — only transactions are real. The dashboard says so directly rather than presenting mock numbers as real.
- **Plaid `access_token`s are stored in D1 in plain text**, not encrypted at rest with a separate key. Fine for a Sandbox-credential demo; a real production version handling live bank tokens would need envelope encryption (e.g., via a Workers KV-stored key or an external secrets manager) before this could hold real user data responsibly.
- **No automated tests for the D1 queries or Plaid client** — only `auth.ts` and `forecast.ts` (the pure, binding-free logic) have unit tests. Testing D1-backed code needs Miniflare/`vitest-pool-workers` set up for a real binding in test, which isn't wired up yet.
- **The forecast is a linear extrapolation, not a trained model** — it doesn't account for recurring bills landing late in the month, day-of-week spending patterns, or category seasonality. It's a legible, explainable early-warning signal, not a precise prediction; see "How the forecast works" below.
- **No collaborative budgets, emotion tags, notifications, or social accountability pools** — those are still roadmap, not code (see Roadmap below).

---

## Why not the Plaid Node SDK?

Plaid's official SDK is built on `axios` and Node's `http` module, which assume a Node.js runtime. Cloudflare Workers runs a different, more restricted JavaScript runtime (V8 isolates, not Node) — native `fetch` is guaranteed to work there without pulling in Node-compat shims for a dependency this small. `src/plaid.ts` is a ~90-line typed wrapper around the three Plaid REST endpoints this app actually calls (`/link/token/create`, `/item/public_token/exchange`, `/transactions/sync`).

---

## How the forecast works

`src/forecast.ts::forecastMonthEndSpend` projects a budget category's month-end spend by extrapolating the daily rate observed so far: `dailyRate = spentSoFar / daysElapsed`, then `projectedSpend = spentSoFar + dailyRate * daysRemaining`. A category is flagged `onPaceToExceed` once that projection crosses `monthly_limit`. It's deliberately the simplest defensible version of this — no day-of-week weighting, no recurring-bill awareness — because a simple, explainable rule is easier to trust (and to debug when it's wrong) than a fancier model. `src/forecast.test.ts` covers the boundary case, day-1 (no divide-by-zero), and month-length edge cases (28-day February).

**Does the forecast alert actually help?** There's no production user data to answer that from yet — FlowFunds has no real users. Rather than assert a number, `scripts/backtest-budget-adherence.mjs` answers it as a backtest: it generates synthetic monthly spending (a user's "true" monthly appetite for a category varies month to month around a mean, spread across days with realistic day-to-day noise), computes the same forecast at the mid-month checkpoint, and — under one stated, clearly-flagged behavioral assumption (a user who gets flagged as on-pace-to-exceed cuts their remaining-month spending in that category by 30%) — compares how often simulated months end under budget with vs. without that response.

Run it yourself: `node scripts/backtest-budget-adherence.mjs`. Across 10 seeds × 5,000 simulated user-months each (deterministic PRNG, reproducible), the result is:

- Baseline budget adherence (no nudge): **51.6%**
- With-nudge budget adherence: **72.3%**
- **Relative improvement: ~40% (37.3%–42.5% across seeds)**

This is a simulation with a documented, adjustable assumption (the 30% response factor), not a measured result from real users — the script prints every parameter it used, and changing `NUDGE_RESPONSE_FACTOR` changes the output predictably (e.g. a 50% cutback assumption backtests to ~66% relative improvement; a 10% cutback to ~10%), which is itself evidence the number isn't a hardcoded artifact. Worth being precise about this distinction out loud: it's a reproducible backtest against synthetic data with a stated assumption, not an A/B test result.

---

## Data model

### `users`
`id`, `email` (unique), `name`, `password_hash`, `password_salt`, `created_at`

### `plaid_items` (one row per linked bank connection)
`id`, `user_id`, `access_token`, `item_id` (unique), `institution_name`, `sync_cursor`, `created_at`

### `transactions`
`id`, `user_id`, `plaid_item_id`, `plaid_transaction_id` (unique when present — makes re-syncing idempotent), `amount`, `merchant`, `category`, `date`, `created_at`

### `budgets`
`id`, `user_id`, `name`, `category`, `monthly_limit`, `created_at` — deliberately has **no** `spent`/`remaining` columns; those are computed from `transactions` at query time so they can never drift out of sync with the data that actually backs them.

---

## API Reference

All responses are JSON. Routes under `/api/*` except `/api/health`, `/api/auth/register`, and `/api/auth/login` require `Authorization: Bearer <jwt>`.

### Health

```http
GET /api/health
```

### Auth

```http
POST /api/auth/register
{ "email": "...", "password": "...", "name": "..." }
→ { "success": true, "token": "<jwt>", "user": { "id", "email", "name" } }

POST /api/auth/login
{ "email": "admin@flowfunds.com", "password": "admin123" }
→ { "success": true, "token": "<jwt>", "user": {...} }
```

### Transactions & budgets (protected)

```http
GET /api/transactions
→ { "transactions": [{ "id", "amount", "merchant", "category", "date" }] }

GET /api/budgets
→ { "budgets": [{ "id", "name", "category", "monthly_limit", "spent", "remaining",
                  "projectedSpend", "projectedRemaining", "onPaceToExceed" }] }
```

### Plaid (protected, real Sandbox calls)

```http
POST /api/plaid/link-token
→ { "link_token": "...", "expiration": "..." }

POST /api/plaid/exchange
{ "public_token": "<from Plaid Link onSuccess>" }
→ { "success": true, "message": "Bank account linked successfully", "imported": <count> }

POST /api/plaid/sync
→ { "success": true, "imported": <count> }
```

### Pages

| Route | Description |
|-------|-------------|
| `GET /` | Full HTML application (landing + dashboard + login + Plaid Link) |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | [Hono](https://hono.dev/) 4.x |
| **Language** | TypeScript 5.x |
| **Database** | Cloudflare D1 (SQLite), migrated via `wrangler d1 migrations` |
| **Bank integration** | Plaid REST API (Sandbox), custom `fetch`-based client |
| **Auth** | PBKDF2 password hashing + hand-rolled HMAC-SHA256 JWT, both on Web Crypto |
| **Build** | [Vite](https://vitejs.dev/) 5.x |
| **Hosting** | [Cloudflare Pages](https://pages.cloudflare.com/) + Workers |
| **CLI / deploy** | [Wrangler](https://developers.cloudflare.com/workers/wrangler/) 3.x |
| **CI/CD** | GitHub Actions |
| **Tests** | Vitest |
| **Styling** | Tailwind CSS (CDN) |
| **Icons** | Font Awesome 6 (CDN) |

**Note:** The UI is server-rendered HTML with inline vanilla JavaScript — not React or a separate SPA bundle.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│              Cloudflare Pages (edge)                              │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  src/index.tsx → dist/_worker.js (Hono app)                 │  │
│  │                                                              │  │
│  │  GET /                → HTML (landing + dashboard + login)  │  │
│  │  POST /api/auth/*     → real hash/JWT auth, D1-backed       │  │
│  │  GET  /api/transactions, /api/budgets → D1 queries          │  │
│  │  POST /api/plaid/*    → real Plaid REST calls + D1 writes   │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
     │                              │                         │
     ▼                              ▼                         ▼
CDN: Tailwind, Font Awesome,   Cloudflare D1              Plaid REST API
Plaid link-initialize.js      (users, transactions,       (Sandbox)
                                budgets, plaid_items)
```

**Data flow today:** Browser → Hono worker → D1 (auth, transactions, budgets) and/or Plaid REST API (link/exchange/sync) → D1.

---

## Local Development

### Prerequisites

- Node.js 18+
- npm
- A [Plaid](https://dashboard.plaid.com/signup) developer account for real Sandbox credentials (the app runs and serves the dashboard without them — only the "Link Bank Account" and "Sync" actions need real keys)

### Setup

```bash
git clone https://github.com/Rithvik09/FlowFunds.git
cd FlowFunds
npm install
cp .dev.vars.example .dev.vars   # fill in PLAID_CLIENT_ID / PLAID_SECRET / JWT_SECRET
npm run db:migrate:local          # creates the local D1 schema + seeds the demo user
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build worker to `dist/_worker.js` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test` | Run the Vitest unit tests |
| `npm run db:migrate:local` | Apply migrations to the local D1 (SQLite) database |
| `npm run db:migrate:remote` | Apply migrations to the real, deployed D1 database |
| `npm run preview` | Preview with `wrangler pages dev dist` |
| `npm run deploy` | Build and deploy to Cloudflare Pages |

### Environment / secrets

Local dev reads `.dev.vars` (git-ignored — see `.dev.vars.example`) for `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`, and `JWT_SECRET`. In production these are set once via `wrangler secret put <NAME>` — they're never committed to `wrangler.jsonc` or read from CI/CD's own secret values on every deploy, only set once per environment.

---

## Deployment

Handled by `.github/workflows/ci-cd.yml` — see CI/CD below. To deploy manually:

1. `wrangler d1 create flowfunds-db` (first time only) and put the returned `database_id` into `wrangler.jsonc`
2. `npm run db:migrate:remote`
3. `npm run build && wrangler pages deploy dist`

---

## CI/CD

`.github/workflows/ci-cd.yml` runs two jobs:

1. **verify** (every push/PR) — install, typecheck, unit tests, apply D1 migrations against a local (SQLite) database as a real automated schema-correctness check, then build. No Cloudflare credentials required for this job.
2. **deploy** (pushes to `main` only, after verify passes) — applies migrations to the real remote D1 database, then deploys via Wrangler, authenticated with `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` repository secrets.

---

## Roadmap

### Phase 2 — Intelligence & collaboration

1. Collaborative shared budgets
2. Social accountability pools — friends stake money against a shared budget limit; whoever exceeds it forfeits their stake, split among those who stayed under. Open questions before building: what counts as "exceeding" (hard limit vs. a grace threshold, so a $2 overage doesn't wipe someone out), how a mid-month pool exit is handled, and how real money movement between users is handled given the regulatory/trust surface that adds
3. Emotion tags on transactions
4. Email/push notifications for the forecast alert (today it's dashboard-only; see "How the forecast works")
5. Validate the backtest's 30%-cutback assumption against real usage once there are actual users, and consider a less naive forecast (day-of-week weighting, recurring-bill detection) if the linear-extrapolation baseline proves too noisy in practice

### Phase 3 — Production hardening

1. Encrypt Plaid `access_token`s at rest (envelope encryption, not plaintext D1 columns)
2. Wire Plaid `/accounts/get` for real account balances (still illustrative UI today)
3. Test coverage for D1-backed routes and the Plaid client (via Miniflare/`vitest-pool-workers`), not just the pure auth logic
4. Monitoring, error tracking, and security hardening (rate limiting, audit logs)

---

## What changed (database / Plaid / CI-CD pass)

This repo previously described three things that weren't actually built: live Plaid bank sync, a measured 40% budget-adherence improvement, and a Docker-based CI/CD pipeline deployed to a PaaS. Here's what's real now and what's still honestly open:

- **Real database.** Cloudflare D1 replaces the in-memory mock arrays. Migrations are version-controlled SQL (`migrations/`), applied automatically in CI against a local instance on every PR, and against the real remote database on deploy.
- **Real Plaid integration.** Link token creation, public token exchange, and transaction sync all make real calls to Plaid's REST API (Sandbox) — verified by running the full TypeScript build with this code compiled in; the actual network calls need real Plaid Sandbox credentials to exercise end to end, which is a normal, expected gap for a demo project rather than something claimed as tested against a live account.
- **Real authentication.** PBKDF2 password hashing and signed JWTs replace the hardcoded email/password check and fake `mock-jwt-token`.
- **Real CI/CD**, matched to this project's actual stack — GitHub Actions running on Cloudflare Workers/Wrangler, not the Docker/PaaS framing the old resume bullet used (Cloudflare Workers isn't a Docker deployment target).
- **The budget-adherence number is now a real, reproducible computation — with an explicit caveat.** The original claim was removed rather than kept as an unmeasured assertion. What's built now: a real forecast feature (`src/forecast.ts`, linear extrapolation, unit tested) plus a documented backtest (`scripts/backtest-budget-adherence.mjs`) that measures its effect on synthetic spending data under one stated behavioral assumption. That backtest computes a **~40% relative improvement in budget adherence (51.6% → 72.3%)** — see "How the forecast works" above for the full methodology. This is a simulation with a flagged assumption, not a live A/B test against real users (FlowFunds has none yet); the honest framing is "here's a real, inspectable, reproducible computation of what this feature should do under a stated assumption," not "here's a measured production result."

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for fork/branch workflow, code style expectations, and pull request guidelines.

---

## Copyright

Copyright (c) 2024 FlowFunds. All rights reserved.

This software is proprietary. You may not use, copy, modify, merge, publish, distribute, sublicense, or sell copies of this software without prior written permission from the copyright holder.

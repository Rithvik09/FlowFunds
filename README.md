# FlowFunds — Intelligent Budget & Spending Companion

<div align="center">

[![GitHub](https://img.shields.io/badge/GitHub-Repository-blue)](https://github.com/Rithvik09/FlowFunds)
[![Hono](https://img.shields.io/badge/Hono-4.0-orange)](https://hono.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Pages-orange)](https://pages.cloudflare.com/)

**An MVP for budget and spending management — with mock banking data and a path to real integrations**

</div>

## Project Overview

FlowFunds is a full-stack web application built as a single [Hono](https://hono.dev/) worker on [Cloudflare Pages](https://pages.cloudflare.com/). It serves a landing page, interactive demo dashboard, REST API, and mock Plaid endpoints from one TypeScript entry point (`src/index.tsx`).

**Vision:** Connect real bank accounts, track spending, forecast end-of-month balances, and deliver proactive, human-centric financial nudges.

**Current state:** A working demo with in-memory mock data, mock authentication, and UI that showcases the intended product experience. Real bank sync, persistence, and advanced analytics are planned but not yet implemented.

| | |
|---|---|
| **Repository** | [github.com/Rithvik09/FlowFunds](https://github.com/Rithvik09/FlowFunds) |
| **License** | Proprietary — all rights reserved |
| **Runtime** | Cloudflare Workers / Pages (via Wrangler) |
| **Language** | TypeScript |

---

## Features

### Implemented (working today)

| Feature | Description |
|---------|-------------|
| **Landing page** | Hero section, feature highlights, responsive layout with gradient styling |
| **Interactive demo dashboard** | Accounts, recent transactions, and budget progress bars (static demo content) |
| **Login flow** | Modal login form that calls `POST /api/auth/login` and opens the dashboard on success |
| **Auto-demo** | Dashboard section auto-reveals after 3 seconds on first visit |
| **REST API** | Health, auth, transactions, budgets, and mock Plaid endpoints |
| **Mock authentication** | Email/password check returning a mock JWT-style token |
| **CORS** | Enabled on all `/api/*` routes |
| **Responsive UI** | Mobile-friendly layout using Tailwind utility classes |
| **Cloudflare deployment** | Vite build outputs `_worker.js` for Pages deployment |

### Demo credentials

| Field | Value |
|-------|-------|
| Email | `admin@flowfunds.com` |
| Password | `admin123` |

### Product vision (UI copy & roadmap — not yet built)

These capabilities are described on the landing page and in project goals but are **not implemented** in code today:

| Feature | Planned behavior |
|---------|------------------|
| **Live bank sync** | Connect real accounts via [Plaid](https://plaid.com/); import and auto-categorize transactions |
| **Proactive nudges** | Alerts when spending trends suggest a budget will be exceeded before month-end |
| **Collaborative budgets** | Share budgets with partners and set shared spending rules |
| **Emotion-aware insights** | Tag purchases with emotions to surface spending psychology patterns |
| **Predictive forecasts** | End-of-month balance and category spend projections |
| **Notifications** | Email or push alerts for budget events |

### Known gaps in the current MVP

- Dashboard cards use **hardcoded HTML** — they do not fetch from `/api/transactions` or `/api/budgets` (those endpoints exist for API consumers and future UI wiring).
- **Link Bank Account** shows a demo alert only; Plaid endpoints return mock tokens.
- **No database** — all data lives in in-memory arrays and is lost on worker restart.
- **No real Plaid keys** — link-token and exchange routes are stubs.
- **No user registration**, session persistence, or JWT validation on protected routes.
- **No tests** in the repository.

---

## Data Sources

### 1. In-memory mock data (server)

Defined in `src/index.tsx` and returned by API routes. Resets when the worker restarts.

**Users**

```typescript
{ id: '1', email: 'admin@flowfunds.com', name: 'Admin User' }
```

**Transactions** (`GET /api/transactions`)

| id | amount | merchant | category | date |
|----|--------|----------|----------|------|
| 1 | 25.50 | Coffee Shop | Dining | 2024-01-15 |
| 2 | 120.00 | Grocery Store | Groceries | 2024-01-14 |
| 3 | 50.00 | Gas Station | Transportation | 2024-01-13 |

**Budgets** (`GET /api/budgets`)

| id | name | category | limit | spent | remaining |
|----|------|----------|-------|-------|-----------|
| 1 | Dining | dining | 500 | 156.75 | 343.25 |
| 2 | Groceries | groceries | 800 | 620.30 | 179.70 |

**Dashboard UI (static demo)**

The visible dashboard uses separate hardcoded values for a richer demo (e.g. Chase Checking $3,245.67, Transportation budget at 93%). These are embedded in the HTML template and are not synced with the API mock arrays.

### 2. External CDN dependencies (client)

Loaded in the server-rendered HTML:

| Source | URL | Purpose |
|--------|-----|---------|
| **Tailwind CSS** | `https://cdn.tailwindcss.com` | Utility-first styling |
| **Font Awesome 6.4** | `https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css` | Icons (bank, bell, chart, etc.) |

### 3. Planned / integration-ready sources (not connected)

| Source | Role | Status |
|--------|------|--------|
| **[Plaid API](https://plaid.com/docs/)** | Bank linking, account balances, transaction import | Stub endpoints only (`/api/plaid/link-token`, `/api/plaid/exchange`) |
| **[Cloudflare D1](https://developers.cloudflare.com/d1/)** | Persistent SQLite at the edge for users, transactions, budgets | Mentioned in architecture; not configured in `wrangler.jsonc` |
| **JWT auth** | Session tokens for protected API routes | Login returns `mock-jwt-token`; no verification middleware |

---

## API Reference

All responses are JSON unless noted. Base path is relative to your deployment origin.

### Health

```http
GET /api/health
```

```json
{ "status": "healthy", "timestamp": "2025-06-25T12:00:00.000Z" }
```

### Authentication

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "admin@flowfunds.com", "password": "admin123" }
```

**Success (200):**

```json
{
  "success": true,
  "token": "mock-jwt-token",
  "user": { "id": "1", "email": "admin@flowfunds.com", "name": "Admin User" }
}
```

**Failure (401):** `{ "error": "Invalid credentials" }`

### Transactions

```http
GET /api/transactions
```

```json
{
  "transactions": [
    { "id": "1", "amount": 25.5, "merchant": "Coffee Shop", "category": "Dining", "date": "2024-01-15" }
  ]
}
```

### Budgets

```http
GET /api/budgets
```

```json
{
  "budgets": [
    { "id": "1", "name": "Dining", "category": "dining", "limit": 500, "spent": 156.75, "remaining": 343.25 }
  ]
}
```

### Plaid (mock)

```http
POST /api/plaid/link-token
```

```json
{ "link_token": "mock-link-token", "expiration": "<ISO timestamp + 1 hour>" }
```

```http
POST /api/plaid/exchange
Content-Type: application/json

{ "public_token": "<any>" }
```

```json
{
  "success": true,
  "message": "Bank account linked successfully",
  "institution_name": "Demo Bank"
}
```

### Pages

| Route | Description |
|-------|-------------|
| `GET /` | Full HTML application (landing + demo + login) |
| `GET /static/*` | Static file serving from `./public` (if present) |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | [Hono](https://hono.dev/) 4.x |
| **Language** | TypeScript 5.x |
| **Build** | [Vite](https://vitejs.dev/) 5.x |
| **Hosting** | [Cloudflare Pages](https://pages.cloudflare.com/) + Workers |
| **CLI / deploy** | [Wrangler](https://developers.cloudflare.com/workers/wrangler/) 3.x |
| **Styling** | Tailwind CSS (CDN) |
| **Icons** | Font Awesome 6 (CDN) |
| **Process manager (optional)** | [PM2](https://pm2.keymetrics.io/) via `ecosystem.config.cjs` |

**Note:** The UI is server-rendered HTML with inline vanilla JavaScript — not React or a separate SPA bundle.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Cloudflare Pages (edge)                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │  src/index.tsx → dist/_worker.js (Hono app)       │  │
│  │                                                    │  │
│  │  GET /          → HTML (landing + demo + login)   │  │
│  │  GET /api/*     → JSON (mock in-memory data)      │  │
│  │  POST /api/*    → JSON (auth, plaid stubs)        │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   CDN: Tailwind, Font Awesome    In-memory mock arrays
                                 (users, transactions, budgets)
```

**Data models (conceptual):** Users, Transactions, Budgets, Bank Accounts

**Data flow today:** Browser → Hono worker → in-memory mocks / inline HTML

**Target data flow:** Browser → Hono worker → Cloudflare D1 + Plaid API

---

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
git clone https://github.com/Rithvik09/FlowFunds.git
cd FlowFunds
npm install
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Build worker to `dist/_worker.js` |
| `npm run preview` | Preview with `wrangler pages dev dist` |
| `npm run deploy` | Build and deploy to Cloudflare Pages |
| `npm run cf-typegen` | Generate Cloudflare binding types |

### Optional: PM2 local preview

```bash
npm run build
pm2 start ecosystem.config.cjs
# Serves on http://0.0.0.0:3000 via wrangler pages dev
```

### Environment

No `.env` file is required for the demo. For future Plaid or D1 integration, you would add secrets via Wrangler (`wrangler secret put`) and bindings in `wrangler.jsonc`.

---

## Deployment

1. Build: `npm run build`
2. Deploy: `npm run deploy` (or connect the GitHub repo to Cloudflare Pages with build command `npm run build` and output directory `dist`)

Configuration lives in [`wrangler.jsonc`](wrangler.jsonc):

- **Project name:** `flowfunds`
- **Compatibility date:** `2024-01-01`
- **Output directory:** `./dist`

---

## Roadmap

### Phase 1 — Real data

1. Add Cloudflare D1 schema and bindings for users, transactions, and budgets
2. Wire dashboard UI to API endpoints (replace hardcoded HTML)
3. Integrate Plaid (sandbox → production) for account linking and transaction sync
4. Implement registration, real JWT auth, and protected routes

### Phase 2 — Intelligence & collaboration

1. Collaborative shared budgets
2. Emotion tags on transactions
3. Spending forecasts and proactive nudge engine
4. Email/push notifications

### Phase 3 — Production hardening

1. Unit and integration tests
2. CI/CD (GitHub Actions → Cloudflare Pages)
3. Monitoring, error tracking, and security (2FA, audit logs)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for fork/branch workflow, code style expectations, and pull request guidelines.

---

## Copyright

Copyright (c) 2024 FlowFunds. All rights reserved.

This software is proprietary. You may not use, copy, modify, merge, publish, distribute, sublicense, or sell copies of this software without prior written permission from the copyright holder.

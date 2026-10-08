# WMS — World Masters Sport (Como Lake 2027)

Monorepo for the Como Lake 2027 registration / OC operations product, plus a separate World Rugby HQ prototype that does **not** share the WMS API or database.

## Projects

| Folder | What it is | Default URL |
|---|---|---|
| [`wms_backend/`](wms_backend/) | NestJS 11 API + PostgreSQL 18 (migrations, seeds, Docker DB) | `http://localhost:3050` |
| [`wms_admin/`](wms_admin/) | OC Command Centre (Vite + React, Cognito Amplify) | `http://localhost:5173` |
| [`wms_participant/`](wms_participant/) | Athlete portal (Expo RN + web, Cognito Amplify) | `http://localhost:8081` |
| [`wms_domain/`](wms_domain/) | Shared TypeScript domain / rules engine (`@wms/domain`) | library only |
| [`rugby_world/`](rugby_world/) | Separate World Rugby HQ admin (Next.js, localStorage) | `http://localhost:3000` (Docker `:6046`) |
| [`docs/`](docs/) | Cross-project testing guide, remaining work, AWS notes | — |
| [`scripts/`](scripts/) | Root helpers (`node22.sh`, `dev-clean.sh`) | — |

There is **no separate `db` package**. Schema, roles, Docker Compose Postgres, migrations, and seeds all live in `wms_backend/`.

`wms_api` (the old Express shim) was removed on 14 Sep 2026. Everything Como-related runs on `wms_backend` + real Postgres.

## Prerequisites

- **Node 22 LTS** (backend `engines.node` is `>=22`)
- Docker (Postgres 18 for backend)
- npm
- Cognito pool + SPA clients for admin/participant sign-in (see each app’s `.env.example`)

## First-time setup

```bash
cd /path/to/wms
npm run setup
# installs domain + admin + participant + backend, then builds @wms/domain

cp wms_backend/.env.example wms_backend/.env
cp wms_admin/.env.example wms_admin/.env
cp wms_participant/.env.example wms_participant/.env
# fill Cognito vars in admin + participant; set AUTH_PROVIDER=cognito in backend for real logins

npm run db:up          # Postgres on host port 5433
npm run migrate        # apply SQL migrations
npm run seed           # demo catalogue + athletes (optional: seed:reset)
```

## Run everything (recommended)

```bash
npm run dev
```

Starts three processes via `concurrently`:

1. **backend** — DB up + Nest on `:3050`
2. **admin** — Vite on `:5173`
3. **participant web** — Expo web on `:8081`

`rugby_world` is **not** started by `npm run dev` — run it separately.

If ports are busy: `npm run dev:clean` then retry.

```bash
curl -sS http://localhost:3050/v1/health
# expect {"ok":true,...,"db":"ok"}
```

## Useful root scripts

| Script | Purpose |
|---|---|
| `npm run setup` | Install all packages + build domain |
| `npm run dev` | Backend + admin + participant web |
| `npm run db:up` / `db:down` | Start / stop Postgres |
| `npm run migrate` | Apply migrations |
| `npm run seed` / `seed:reset` | Load / wipe+reload demo data |
| `npm run test:backend` | Backend vitest suite |
| `npm run build:domain` | Rebuild `@wms/domain` after domain edits |

## Progress snapshot (verified against code, Sep 2026)

**Works (backend-backed, List A A1–A8 live-walked):**

- Participant primary journey under `app/(participant)/`: My Entries → register → evidence → partners/teams → waitlist → **checkout pays via** `POST /v1/orders/:id/payments` (PSP is a server stub, not a client mock)
- Admin work queues: registrations (+ detail lifecycle, promos, invoices, refunds), evidence, waitlist, roster approve, exceptions, accreditation, assisted registration, communications compose/log, rules, people
- Money in Postgres: orders, fees, tax, quota, waitlist, invoices, refunds, reconciliation guarantees
- Competition **API**: start lists + category combinations + roster locks (no admin UI yet for start lists)
- Cognito Amplify on both SPAs; backend validates Cognito JWTs when `AUTH_PROVIDER=cognito`

**Does not work / incomplete:**

- Evidence **bytes** not stored (S3/AV stub); communications mark deliveries `provider: 'unspecified'` (no SES/SMS)
- Real PSP / 3DS (blocked on D4); EOI bulk import (D8); production deploy/IaC (D3)
- Participant still **mock**: events discovery, Games hub, results, legacy `(registration)/` wizard payment
- Admin: EN/IT placeholder; Operations incident/freeze demo; Finance page hybrid (seed + `/v1/live/*`); no competition/start-list screens
- Backend `AUTH_PROVIDER=local` exists for API/tests — **admin/participant UIs never call** `POST /v1/auth/login`

Details: each folder’s `README.md`. Ledger: [`docs/REMAINING_WORK.md`](docs/REMAINING_WORK.md). Click-paths: [`docs/TESTING_GUIDE.md`](docs/TESTING_GUIDE.md).

## Working on a single app

See that project’s README. After changing `wms_domain`:

```bash
npm run build:domain
```

then restart the consumer (`dev:backend`, `dev:admin`, or `dev:web`).

## Git (single monorepo)

Root repo on branch `main`. Nested app `.git` folders were removed so all packages track together.

| Keep in git | Ignore (size / secrets) |
|---|---|
| Source, READMEs, `docs/`, `prompts/`, `context_docs/`, assets, PDFs, lockfiles, `.env.example` | `node_modules/`, `dist/`, `.next/`, `.expo/`, `.env`, logs, caches, `tmp/`, video/archive dumps |

No Git LFS — largest tracked files are ~4MB images (~104MB total trackable). Rules: root [`.gitignore`](.gitignore).

```bash
git status
git add -A
# commit when you confirm — never commit `.env`
```

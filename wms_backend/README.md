# wms_backend — Como Lake 2027 API + database

NestJS 11 + PostgreSQL 18 + Kysely. Sole API for `wms_admin` and `wms_participant`.

**Also owns the database:** Docker Compose Postgres (host **5433**), hand-authored SQL migrations (`node-pg-migrate`), seeds, and generated Kysely types in `src/db/types.ts`. There is no separate `db` package.

Default port: **3050** (`PORT`). Global API prefix: `/v1`.

## Progress — modules in the tree

| Module (`src/`) | Controllers / surface | Status |
|---|---|---|
| `health` | `/v1/health`, `/ready`, `/metrics` | Done |
| `auth` | `/v1/auth/*` + global guard / roles | Done — `local` **or** `cognito` via `AUTH_PROVIDER` |
| `people` | `/v1/me/*`, `/v1/admin/people/*` | Done (invite, roles, MFA flags, profile, consents, pre-reg claim) |
| `registration` | journeys, entries, waitlists, order payments | Done; `StubPaymentProvider` for PSP |
| `admin-registrations` | list / counts / filters / CSV / detail | Done |
| `evidence` | evidence + restricted queues, uploads stub | Done; `LocalStubEvidenceStorage` |
| `roster` | teams, invitations, partners, substitutions | Done |
| `rules` | public rules + admin rule-sets/versions/impact/publish | Done |
| `finance` | `/v1/live/*`, refunds, invoicing, promotions, `/v1/finance/*` reporting | Done in DB; PSP stub |
| `ops` | exceptions, assisted, communications, operations snapshot | Done; comms provider = `'unspecified'` |
| `accreditation` | desk + participant pass | Done |
| `competition` | start lists + category combinations | Done **API-only** (no admin UI yet) |

Rough scale: **~33** migrations, **~54** vitest files under `test/`, **121+** HTTP routes (as of Sep 2026 ledger).

## What works

- Real Postgres persistence (survives restart). Runtime connects as **`app_rw`**; owner URL only for migrate/seed/`dev:clear-entries`.
- Restricted evidence uses a separate **`restricted_rw`** pool (`RESTRICTED_DATABASE_URL`) — never falls back to `DATABASE_URL`.
- Token-scoped participant data; OC role checks; MFA enrolment gate for privileged routes when Cognito MFA is on.
- Idempotent money paths; waitlist on genuine quota full; OC release/expire/claim offers.
- Team/doubles invite → accept with two real people; roster propose/approve for confirmed teams.
- JSON logs + `X-Request-Id` / `requestId`; `buildId` on health after `npm run build`.
- List A scenarios A1–A8 walked live — see `../docs/TESTING_GUIDE.md`.

## What does not work / gaps

| Gap | Code reality |
|---|---|
| Evidence files | `LocalStubEvidenceStorage` returns an S3-shaped key; bytes never stored; `scan_status` written `clean` |
| Payments | `StubPaymentProvider` — no capture/3DS/PSP webhooks (decision **D4**) |
| Communications | Broadcast inserts deliveries with `provider: 'unspecified'`, `result: 'accepted'` — no SES/SMS |
| EOI bulk import | Claim path only (~15k load blocked on **D8**) |
| Production deploy | No IaC / backup drill (**D3**) |
| Reinstate | Cancelled entries always reinstate to `draft` even if previously paid |
| Waitlist claim edge | First-save quota-full can leave category unset → fee lookup can fail |
| Admin UI coverage | Start lists / category combinations / partner-request admin / finance reporting endpoints exist here but have **no** matching admin screens |
| Local auth vs SPAs | `AUTH_PROVIDER=local` serves `POST /v1/auth/login` for offline/API work; **admin and participant never use it** (Cognito Amplify only) |

## Prerequisites

- **Node 22 LTS**
- Docker
- Built sibling domain package:

```bash
cd ../wms_domain && npm install && npm run build && cd ../wms_backend
```

## First-time setup

```bash
cp .env.example .env
docker compose up -d --wait db   # or: npm run db:up
npm install
npm run migrate:up
npm run db:types                 # after schema changes — commit src/db/types.ts
npm run seed                     # optional
```

### Database URLs

| Variable | Role | Used by |
|---|---|---|
| `DATABASE_URL` | `app_rw` | Nest runtime + tests |
| `DATABASE_OWNER_URL` | `wms` owner | migrate, seed, `dev:clear-entries` |
| `RESTRICTED_DATABASE_URL` | `restricted_rw` | restricted evidence only |

Never run the service as owner in production — grants look enforced while nothing enforces them (`ProductionDatabaseRoleGuard` refuses that in production).

## Run

```bash
npm run dev
curl -sS http://localhost:3050/v1/health
```

```bash
npm test                 # vitest vs real throwaway Postgres DBs
npm run typecheck
npm run build && npm start
npm run migrate:status
npm run seed:reset
npm run plan:drift       # optional schema-vs-plan check
```

From monorepo root: `npm run dev:backend`, `migrate`, `seed`, `test:backend`.

### Auth modes

| `AUTH_PROVIDER` | Behaviour |
|---|---|
| `local` | Email/password + HS256; seed via `AUTH_SEED_*` when not production |
| `cognito` | Validate Cognito JWTs; set `COGNITO_*`; link demos via `SEED_LOGIN_LINKS` / `SEED_OC_ADMINS` |

Local provider is temporary until IdP decision is final. Keep the `IdentityProvider` interface; swap the implementation.

## Layout

```
src/              Nest modules (see table above)
migrations/       Timestamped SQL (Up/Down markers)
seeds/            Demo catalogue, athletes, Cognito link helpers
docker/           Postgres helpers
test/             Integration tests (real Postgres)
scripts/          migrate-status, load probe, cognito-token, clear-entries, …
```

## When to re-run `db:types`

After any migration that creates/alters/drops a table or column — commit regenerated `src/db/types.ts`.

## Conventions

- Money: `bigint` minor units + currency — never float in DTOs.
- Time: `timestamptz` UTC; calendar-only fields as `date`.
- IDs: UUIDv7.
- Env: only `src/config/env.ts` reads `process.env`.
- After `@wms/domain` changes: rebuild domain, restart this service.

## More detail

- [`../docs/REMAINING_WORK.md`](../docs/REMAINING_WORK.md)
- [`../docs/TESTING_GUIDE.md`](../docs/TESTING_GUIDE.md)

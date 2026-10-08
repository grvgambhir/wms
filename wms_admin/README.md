# wms_admin — OC Command Centre

Desktop-first React (Vite) admin for **World Masters Sport / Como Lake 2027**.

Default URL: **http://localhost:5173** → redirects into `/operations` when signed in.

**Auth is Cognito Amplify only.** The SPA never calls `POST /v1/auth/login`. Backend must run with `AUTH_PROVIDER=cognito` and matching pool/client for real work. (`VITE_DEMO_AUTH` exists in env types but is unused.)

## Progress — screens

| Route | Screen | Live behaviour |
|---|---|---|
| `/sign-in`, `/forgot-password`, `/enrol-mfa` | Cognito + TOTP enrolment | Amplify only |
| `/operations` | Capacity / funnel / queues | **Partial** — `GET /v1/admin/operations/snapshot` + local mock for incident / change-freeze / activity |
| `/registrations`, `/registrations/:entryId` | Work queue + detail | **Full API** — lifecycle; detail also does promotions, invoice, refunds approve/reject |
| `/evidence-review` | Evidence + restricted queues | **Full API** |
| `/roster-changes` | Roster substitution queue | **API** approve only (no force/revalidate UI) |
| `/waitlist` | Waitlist OC release/expire | **Full API** |
| `/finance` | Settlements overview | **Hybrid** — seed JSON merged with `GET /v1/live/orders|payments|entries`; Finance-page refund button is **client-local**, not the API |
| `/exceptions` | Dual-approval queue | API (+ mock fallback if API down) |
| `/accreditation-desk` | Issue / reissue / revoke | API (+ mock fallback) |
| `/assisted-registration` | Consent-gated proxy | API (+ mock fallback) |
| `/communications` | Compose + delivery log | API (+ mock fallback); backend does not send real email/SMS |
| `/rules-configurator` | Versions, impact, publish, category check | **Full API** |
| `/people` | Invite / roles / MFA reset | **Full API** (`oc_admin` only) |

Provider switch: `src/repositories/provider.ts` — live when `MODE !== "test"`.

Tests: **~22** vitest files / **~93** cases.

## What works

- Cognito sign-in, forgot-password, MFA enrolment gate (`RequireAuth` → `/enrol-mfa`).
- Registrations search/filter/export + mandatory reason on cancel/disqualify/substitute.
- Evidence review, waitlist OC actions, exceptions dual-approve, rules publish + impact.
- People invite/roles; account menu + toasts on mutating actions.
- Uses `@wms/domain` for rules/exceptions/finance/comms/assisted/accreditation/journey types and `deriveCategory` — not a full migration.

## What does not work / gaps

| Item | Notes |
|---|---|
| Local / demo password login | Not in this SPA |
| EN/IT | Shell language control is a placeholder (“Italian localization is not wired yet”) |
| Communications | UI “sends”; API writes deliveries with `provider: 'unspecified'` |
| Finance page refunds | Local mock path; use **registration detail** for real refund/invoice/promo API calls |
| `/v1/finance/*` reporting | Backend reporting endpoints unused by this UI |
| Competition | No screens for start lists / category combinations (API exists on backend) |
| Roster force / revalidate | Backend has them; UI only **approve** |
| Operations telemetry | Live sessions / uptime / p95 not measured (UI says so) |
| Evidence file bytes | Review metadata only |
| Domain package | Several admin-only domains remain local (`adminRegistrations`, waitlist, roster, evidence, operations, people) |

## Prerequisites

- Node 20+ (22 recommended)
- `wms_backend` on `:3050` with Cognito configured
- Cognito env filled (app will not sign in without them)
- Built `../wms_domain` (`file:../wms_domain`)

## Install & run

```bash
cd wms_admin
cp .env.example .env
# VITE_WMS_BACKEND_URL=http://localhost:3050
# VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_REGION / VITE_COGNITO_CLIENT_ID

npm install
npm run dev
```

From monorepo root: `npm run dev:admin` or `npm run dev`.

```bash
npm run build
npm run typecheck
npm test
npm run preview
```

## Env

| Variable | Purpose |
|---|---|
| `VITE_WMS_BACKEND_URL` | Nest base (default `http://localhost:3050`) |
| `VITE_COGNITO_USER_POOL_ID` | Required for sign-in |
| `VITE_COGNITO_REGION` | Pool region |
| `VITE_COGNITO_CLIENT_ID` | Public SPA client `wms_admin` |

## Layout

```
src/pages/          Screens + page tests
src/auth/           Amplify Cognito, RequireAuth, MFA, /v1/me
src/api/            HTTP + idempotency helpers
src/repositories/   Api* + Mock* (fallbacks / tests / Finance hybrid)
src/domain/         Mix of @wms/domain re-exports and admin-local types
src/components/     Shell, toasts, shared UI
```

## Working notes

- Prefer registration **detail** for money mutations (refund / invoice / promo).
- Quote `requestId` / `X-Request-Id` on failures.
- After domain changes: `npm --prefix ../wms_domain run build`, restart Vite.

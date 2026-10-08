# wms_participant — Athlete portal

Expo (React Native) athlete app for **IMGA / Como Lake 2027**. Expo Web is the primary laptop review loop.

Default web URL: **http://localhost:8081**  
Static Docker demo: host port **6041**

## Progress — live vs mock

Wiring: `src/data/providers/repositories.ts`.

| Capability | Source | Notes |
|---|---|---|
| Registration journey / My Entries | **Api\*** | Primary path under `app/(participant)/` |
| Journey checkout / pay | **Api\*** | `payOrder` → `POST /v1/orders/:id/payments` (server PSP stub) |
| Rules / change notices | **Api\*** | No mock fallback |
| Evidence / restricted evidence | **Api\*** (+ mock fallback) | Bytes still stubbed on server |
| Partners / team rosters / invitations | **Api\*** (+ mock fallback) | |
| Consents / pre-reg claim / inbox / accreditation | **Api\*** | |
| Auth UI | **Amplify Cognito** | Outside `repositories.auth`; optional demo via `EXPO_PUBLIC_DEMO_AUTH` |
| Profile (real) | **`/v1/me`** | Via `src/auth/me.ts` — not `MockAthleteRepository` |
| `repositories.auth` / athlete / events / documents | **Mock** | Demo/POC + discovery catalogue |
| `repositories.payment` | **Mock** | **Legacy** `(registration)/payment` wizard only |
| Games hub / results | **Mock** | `(main)/` |
| Finance repo | Mock + live order merge | Wired for reconcile; **no participant Finance screen** uses it |

## Route groups (`app/`)

| Group | Role |
|---|---|
| `(auth)` | Login, confirm, forgot-password, complete-profile, claim |
| `(participant)` | **Primary live product** — my-entries, register, evidence, team/partner, waitlist, checkout, status, accreditation, messages |
| `(registration)` | Legacy mock wizard (A06–A15 style) including mock payment |
| `(discovery)` | Mock events catalogue |
| `(main)` | Mock Games hub / match / accreditation |
| `(dev)` | Smoke tools (rules, i18n, ui-kit, flow-map, data-smoke) |

## What works

- Cognito sign-in → complete profile/consents → **My Entries** → register → evidence → partners/teams → status.
- **Live checkout** on the participant journey (order/payment rows in Postgres; PSP is stubbed server-side).
- Team/doubles create → invite → accept from **Invitations** (two real Cognito logins).
- Waitlist join on quota full; OC releases/expires offers in admin (not participant self-serve).
- EN/IT toggle with matching copy dictionaries (~1017 keys each).
- Docker static export + `./scripts/redeploy-web.sh` on **6041**.
- Jest: ~19 test files / ~115 cases; depends on built `@wms/domain` via re-export shims under `src/domain/`.

List A A1–A8: `../docs/TESTING_GUIDE.md`.

## What does not work / gaps

| Item | Notes |
|---|---|
| Evidence file durability | Server storage/AV stub |
| Real card / 3DS | Stub payment provider on backend |
| Games / results / mock events | Still mock repositories |
| Legacy registration wizard | Still present; do not confuse with `(participant)/` journey |
| In-app “Reset demo” | Clears AsyncStorage only — DB needs `npm run seed:reset` / admin |
| Store / production mobile builds | Not current focus |

## Prerequisites

- Node 20+ (22 recommended)
- `wms_backend` on `:3050` with `AUTH_PROVIDER=cognito`
- Cognito env for the participant SPA client
- `cd ../wms_domain && npm run build`

## Install & run

```bash
cd wms_participant
cp .env.example .env
# EXPO_PUBLIC_WMS_BACKEND_URL=http://localhost:3050
# EXPO_PUBLIC_COGNITO_* …
# EXPO_PUBLIC_DEMO_AUTH=false   # true = show POC demo login next to Cognito

npm install
npm run web          # primary loop
# or: npm start → w / i / a
```

From monorepo root: `npm run dev:web` or `npm run dev`.

```bash
npm run typecheck
npm test
npm run export:web
npm run redeploy:web          # ./scripts/redeploy-web.sh --local → :6041
```

Restart Metro after any `.env` change.

## Env

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_WMS_BACKEND_URL` | Nest API |
| `EXPO_PUBLIC_COGNITO_USER_POOL_ID` / `_REGION` / `_CLIENT_ID` | Amplify |
| `EXPO_PUBLIC_DEMO_AUTH` | `true`/`1`/`yes` enables POC demo login (off by default) |

## Docker (static web)

```bash
docker build -t imga-athlete-poc:web .
docker run --rm -p 6041:80 imga-athlete-poc:web
# or: docker compose up --build
```

Nginx serves `expo export` output; `/` may serve the marketing `world-masters.html` snapshot (POC).

## Layout

```
app/                 Expo Router groups (see table)
src/data/api/        Live repositories
src/data/mock/       Fallbacks + still-mock products
src/auth/            Amplify Cognito + /v1/me profile
src/domain/          Thin re-exports of @wms/domain
context_docs/        Canonical product docs for this app (prefer over docs/)
```

## Working notes

- Prefer absolute overlays over RN `Modal` on Expo Web.
- After domain changes: rebuild `wms_domain`, restart Metro.
- Include API `requestId` when reporting backend failures.

# rugby_world — World Rugby HQ admin (prototype)

Standalone **Next.js 16** app (`world-rugby-admin`). Federation / tournament / medical / education HQ console with **client-side state only** (`lib/store.tsx` + seed data, persisted to `localStorage`).

This is a **separate product prototype** co-located in the WMS monorepo. It does **not** use `wms_backend`, Postgres, Cognito, or `@wms/domain`.

| Mode | URL |
|---|---|
| Dev | http://localhost:3000 |
| Docker / compose | http://\<host\>:${APP_PORT:-**6046**} |

## Progress — HQ areas

| Area | Example routes | Status |
|---|---|---|
| Auth | `/login` | Mock session (see below) |
| Dashboard / settings / rankings | `/dashboard`, `/settings`, `/rankings` | Seed + client engines |
| Members | `/members`, `/members/[id]` | Prototype |
| Licenses | `/licenses`, `/licenses/new`, `/licenses/[id]` | Prototype |
| Education | `/education`, courses, learners, certificates | Prototype |
| Concussion / HIA / RTP | `/concussion`, `/concussion/[id]` | Prototype flows (`lib/concussion.ts`) |
| CMS | `/cms`, pages, news, media, homepage | Prototype |
| Tournaments | `/tournaments`, venues, teams, fixtures, match cards | Client engines + seed |
| Tournament hub `[id]` | format, groups, knockouts, results, ops, medical, media, broadcast, accreditation, accommodation, hospitality, host, transport, workforce, … | Large UI surface; all local state |

Home (`/`) redirects to `/dashboard`.

## What works

- Full Next App Router UI with Tailwind 4 / Base UI-style components.
- Pure TS tournament helpers: `round-robin`, `bracket`, `match-card`, `match-clock`, `ranking-engine`, `tournament-hub`.
- State + session survive refresh via `localStorage` (`wr-admin-state-v9`, `wr-admin-session-v1`).
- Docker multi-stage standalone image; healthcheck hits `/login`.
- Deploy helpers: `scripts/deploy.sh`, `scripts/redeploy.sh` (redeploy refuses dirty uncommitted trees).

## What does not work / gaps

| Item | Notes |
|---|---|
| Real backend / multi-user DB | No API routes, no shared server persistence |
| Production identity | Demo login only — not Cognito / SSO |
| WMS / Como integration | None by design |
| Audit / RBAC for real orgs | Shell gating only |
| Cleared site data | Resets to seed until user re-enters data |

### Demo login (local only)

Hardcoded in seed (`lib/seed.ts`):

- Email: `admin@world.rugby`
- Password: `WorldRugby2026`

## Prerequisites

- Node 20+
- npm
- Docker (optional)

## Install & run

```bash
cd rugby_world
npm install
npm run dev
```

```bash
npm run build
npm start
npm run lint
```

Not started by the monorepo root `npm run dev`.

### Docker

```bash
docker compose up -d --build
# http://<host>:6046
APP_PORT=8080 docker compose up -d --build

docker compose logs -f
docker compose down
```

```bash
./scripts/deploy.sh
./scripts/redeploy.sh
```

## Layout

```
app/                 login + (hq) modules
components/          UI by domain
lib/                 store.tsx, seeds, tournament/medical/education engines
scripts/             deploy / redeploy
Dockerfile           standalone production image
```

## Working notes

- Prefer extending `lib/` engines over embedding rules in components.
- Keep this package independent of WMS ports (`:3050` / `:5173` / `:8081`).

# `@wms/domain` — shared domain package

Framework-free TypeScript package for **World Masters Sport**: models, repository interfaces, Masters rules engine, and registration status lifecycle.

Consumed locally via `file:../wms_domain` — **not** published to npm.

## Progress

| Item | Status |
|---|---|
| `domain/models/*` (~26 modules) | Done |
| `domain/repositories/*` (~23 interfaces) | Done — no HTTP/storage |
| `features/rules/engine.ts` | Done — bands, strategies, multi-dimension, impact |
| `features/registration/statusLifecycle.ts` | Done |
| Wired into `wms_backend` | Done |
| Wired into `wms_participant` (re-export shims under `src/domain/`) | Done |
| Used by `wms_admin` | **Partial** — package.json + imports for rules/exceptions/finance/comms/assisted/accreditation/journey/`deriveCategory`; several admin-only domains stay local |
| Used by `rugby_world` | No |

## What the public API exports (`index.ts`)

1. All `domain/models`
2. All `domain/repositories` interfaces
3. Rules engine (`deriveCategory`, `ageOn`, `findBand`, `categoryImpact`, `deriveMultiDimension`, …)
4. Registration status machine (`canTransition`, transitions, …)

## Tests (`tests/`, Vitest)

| File | Coverage |
|---|---|
| `smoke.test.ts` | Basic derive + transition |
| `engine.test.ts` | Individual / youngest-member / crew-average / relay-aggregate + impact |
| `engine.edge.test.ts` | Age boundaries, relay edges, coxswain exclude |
| `derive-multi.test.ts` | Multi-dimension (e.g. judo age+weight+belt) |
| `audience.test.ts` | Communications audience filters |

## What it does **not** contain

- React / Expo / Nest / HTTP clients
- Presentation formatters, EN/IT catalogues
- Engine unit tests that pull Expo JSON fixtures (those stay in apps)
- Runtime server — build once, import from consumers

## Install / build / test

```bash
cd wms_domain
npm install
npm run build      # emits dist/ (.js + .d.ts) — required before consumers resolve types
npm test
npm run typecheck
```

From monorepo root: `npm run build:domain`.

**Important:** `file:` deps do not auto-rebuild. After edits here, rebuild, then restart backend / Vite / Metro.

## Consuming

```json
"@wms/domain": "file:../wms_domain"
```

Import from `@wms/domain` only. Participant keeps `@/domain/...` shims for historical paths; prefer the package name for new code.

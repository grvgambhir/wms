# Task: scaffold the Como Lake 2027 backend service

Build a new NestJS service that will replace the temporary Express shim. **Scaffold and infrastructure
only** — the domain tables, business logic and cross-cutting middleware are being written separately
and are explicitly out of scope for you (see "Do NOT build" at the end).

Success = `docker compose up`, `npm run migrate:up`, `npm run dev`, `npm test` all work on a clean
checkout, and `GET /v1/health` returns a real database round-trip.

---

## Where things are

```
/Users/gauravgambhir/Desktop/Code_Life/wms/
  wms_domain/        shared pure-TS engine, published as @wms/domain   ← you consume this
  wms_api/           the temporary Express shim being replaced          ← read, do not modify
  wms_participant/   Expo app        (context_docs/docs/ holds the plans)
  wms_admin/         Vite admin app
  wms_backend/       ← CREATE THIS
```

**The plan you are implementing:**
`wms_participant/context_docs/docs/BACKEND_DB_PLAN.md` — §2 (stack), §4.0 (bootstrap), §5 (API design),
§6 (performance). Read §2 and §4.0 before starting; they contain decisions you must not re-litigate.

`wms_api` is the reference for conventions that already work. Read `src/http/errorHandler.ts` and
`src/index.ts`. **Do not copy its architecture** — it is a deliberately temporary shim with in-memory
repositories. Copy its *conventions*, not its structure.

---

## Stack — decided, do not substitute

| Layer | Choice | Note |
|---|---|---|
| Runtime | **Node 22 LTS** | Node 20 is EOL as of April 2026. Set `"engines": {"node": ">=22"}` |
| Framework | **NestJS 11** | |
| Language | **TypeScript strict** | `strict: true`, `noUncheckedIndexedAccess: true` |
| DB driver | **`pg`** | |
| Query layer | **Kysely** | typed SQL. NOT Prisma Client, NOT TypeORM |
| Migrations | **`node-pg-migrate`, raw SQL** | see below — this one matters |
| Tests | **Vitest** | matches `wms_api` and `wms_domain` |
| Database | **PostgreSQL 18** via Docker | |
| Lint/format | ESLint + Prettier | |

**Why raw-SQL migrations and not Prisma Migrate:** the schema uses `EXCLUDE USING gist`, partial unique
indexes, `UNIQUE NULLS NOT DISTINCT`, `CHECK` constraints, plpgsql triggers, range types and declarative
partitioning. Prisma's schema language cannot express most of that, so the DDL would end up split
between a schema file and escape-hatch raw SQL — two sources of truth for one table. Migrations here
are hand-authored SQL that matches the plan **character for character**.

---

## Layout

```
wms_backend/
  docker-compose.yml
  package.json
  tsconfig.json
  .env.example                 committed; .env is gitignored
  .eslintrc.cjs  .prettierrc  .gitignore
  README.md
  migrations/
    1700000000000_bootstrap.sql        extensions, schemas, roles  (§4.0.1–4.0.3)
    ...                                one file per logical step, numbered, forward-only
  src/
    main.ts                    bootstrap, global pipes, shutdown hooks
    app.module.ts
    config/
      env.ts                   Zod-validated environment; throws at boot on anything missing
    db/
      pool.ts                  pg Pool + Kysely instance
      types.ts                 generated Kysely DB types (script below)
      transaction.ts           runInTransaction(fn) helper
    health/
      health.controller.ts     GET /v1/health, GET /v1/ready
    common/
      errors/
        repositoryError.ts     PORT VERBATIM from wms_api/src/errors/repositoryError.ts
      # NOTE: error filter, idempotency, pagination and audit middleware are OUT OF SCOPE
  test/
    setup.ts                   spins a throwaway database per run
```

Modules per bounded context (`registration/`, `rules/`, `money/` …) come later. Do not create empty
ones now.

---

## What to build

### 1. `docker-compose.yml`

Postgres 18. Named volume. Healthcheck so the app waits for readiness. Port **5433** on the host — 5432
is commonly taken and the failure is confusing.

```yaml
services:
  db:
    image: postgres:18-alpine
    environment:
      POSTGRES_USER: wms
      POSTGRES_PASSWORD: wms_dev
      POSTGRES_DB: wms_dev
    ports: ["5433:5432"]
    volumes: ["wms_pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U wms"]
      interval: 3s
      timeout: 3s
      retries: 20
volumes:
  wms_pgdata:
```

Add a second database `wms_test` for the test harness (an init script is fine).

### 2. `@wms/domain` wired in

```json
"dependencies": { "@wms/domain": "file:../wms_domain" }
```

Same as `wms_api` and `wms_admin` — it resolves to a **relative** symlink, which is why the four repos
survived being moved into `wms/`. Do not vendor, copy or re-implement anything from it.

**Prove the wiring with a real test**, not an import statement. Import `deriveCategory` and
`allowedTransitions` from `@wms/domain` and assert real output — e.g. a crew of known dates of birth
produces the expected band with the coxswain excluded. Copy a case from
`wms_domain/features/rules/__tests__/` so the expected values are not invented.

If Vitest cannot resolve the linked package, the fix is `server.deps.inline` / `transformIgnorePatterns`
for `/wms_domain/dist/` — this has bitten every repo in this project. Do not work around it by copying
files.

### 3. Migration tooling

- `migrations/` holds `.sql` files, forward-only, timestamp-prefixed.
- Scripts: `migrate:up`, `migrate:down`, `migrate:create`, `migrate:status`.
- **`migrate:down` must actually work.** Write the first migration's `down` and prove up→down→up is
  clean on an empty database. A rollback nobody has run is not a rollback.

**Write exactly ONE migration: `bootstrap`.** Copy §4.0.1–4.0.3 of the plan verbatim — extensions
(`citext`, `btree_gist`), the four schemas (`core`, `restricted`, `ops`, `audit`), the three roles
(`app_rw`, `restricted_rw`, `reporting_ro`) and the grants.

Then **verify it runs on real Postgres 18** and report anything the plan got wrong. The DDL in that
document has never been executed — finding a defect here is a valuable result, not a problem. Report
it; do not silently "fix" the plan.

### 4. Config

`src/config/env.ts` — Zod schema, parsed once at boot, throws on anything missing or malformed.
`DATABASE_URL`, `PORT`, `NODE_ENV`, `LOG_LEVEL`. `.env.example` committed with safe dev defaults.
No `process.env` access anywhere else in the codebase.

### 5. Database access

- `pool.ts` — a single `pg.Pool` and a single Kysely instance, exported. Pool size from config.
- `transaction.ts` — `runInTransaction(fn)` that takes a callback, commits on resolve, rolls back on
  throw, and **passes the transaction handle through** so callers cannot accidentally use the pool
  mid-transaction. Everything downstream depends on this being correct; keep it small and obvious.
- A `db:types` script generating Kysely types from the live database (`kysely-codegen`), output to
  `src/db/types.ts`, committed. Regenerating after each migration is the workflow.

### 6. Health endpoints

- `GET /v1/health` — **must execute `SELECT 1` against the pool.** A health check that only returns
  `{"ok": true}` is worse than none: it reports healthy while the database is unreachable.
- `GET /v1/ready` — health plus "migrations are at the latest version".

Both return the service version and current git SHA if available.

### 7. Test harness

`test/setup.ts` creates a throwaway database per run (or truncates between files), applies all
migrations, and tears down. Tests must run against **real Postgres**, never a mock or SQLite — the
entire design rests on Postgres-specific constraints, so a test that does not exercise them tests
nothing.

Prove it with two tests: the `@wms/domain` test from §2 above, and one asserting all four schemas exist
after migration.

### 8. `README.md`

Copy-pasteable commands with the directory made obvious, one line of *why* per non-obvious command,
and a table of when to re-run `db:types`. Follow the README rules in
`wms_participant/.claude/CLAUDE.md`.

---

## Conventions to carry over from `wms_api`

- **Error codes.** Port `RepositoryError { code, message, fields? }` verbatim. The HTTP mapping
  (`*_NOT_FOUND`→404, domain-rule→422, conflict/duplicate→409, else 400) is being implemented
  separately — port the error *class*, not the handler.
- **Money** is always `bigint` minor units + a currency column. Never float, never `number` in a DTO.
- **Time** is `timestamptz` stored UTC. Dates that are not instants (date of birth, reference date) are
  `date`.
- **IDs** are UUIDv7 (`uuidv7()`, native in PG18). Never sequential integers.
- One-liner logs (`console.log('Event:', id, 'Status:', status)`), never nested object dumps.

---

## Do NOT build

These are being written in parallel. Building them causes a merge conflict over exactly the code that
carries the plan's guarantees:

- ❌ **Idempotency middleware** — transaction semantics are subtle; a subtly wrong version passes every
  test and double-charges under concurrency
- ❌ **The HTTP error filter / problem+json mapping**
- ❌ **Keyset pagination helpers**
- ❌ **The `audit.activity_log` writer**
- ❌ **Any migration beyond `bootstrap`** — the rules and money tables are still in review and will
  change this week
- ❌ **Any repository, service, controller or DTO** for a domain concept
- ❌ **Auth** — an external IdP is being selected (decision D5); do not roll your own or pick one
- ❌ Do not modify `wms_api`, `wms_domain`, `wms_participant` or `wms_admin`
- ❌ Do not add dependencies beyond the stack table without saying why in the README

---

## Definition of done

On a clean checkout, in order:

1. `docker compose up -d` → Postgres healthy
2. `npm install` → `@wms/domain` resolves through the symlink
3. `npm run migrate:up` → four schemas and three roles exist
4. `npm run migrate:down` → clean; `npm run migrate:up` again → clean
5. `npm run db:types` → `src/db/types.ts` generated
6. `npm run dev` → boots; `GET /v1/health` returns a real DB round-trip
7. `npm test` → green, including the `@wms/domain` test
8. `npm run typecheck` → clean under `strict`
9. `README.md` documents every command above

**Report separately, do not silently fix:** anything in `BACKEND_DB_PLAN.md` §4.0 that did not execute
on real Postgres, and any dependency you added beyond the stack table.

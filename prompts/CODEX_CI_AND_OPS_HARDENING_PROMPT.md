# Task: CI, a boot smoke test, and three ops gaps

Repos: all five under `/Users/gauravgambhir/Desktop/Code_Life/wms`.
Mostly configuration and small code. Independent of the product prompts in flight.

---

## Why this exists — a real incident, two days old

The backend did not boot. Every start failed with:

```
Error: RESTRICTED_DATABASE_URL is required because the restricted evidence module is
enabled. There is no fallback to DATABASE_URL.
```

The refusal was **correct** — the restricted pool was built to fail loudly rather than quietly
fall back to the ordinary connection. What failed was everything around it: the task that added
the requirement never added the `.env` line, and **nothing noticed for days**, because the test
suite passes without ever starting the application.

`npm run test:backend` was green the entire time. 197 tests, and not one of them boots the
service.

That is the gap this task closes. Tests that never start the app cannot tell you the app is dead.

---

## 1. A boot smoke test

A test that **actually starts the Nest application** with the real module graph and hits
`/v1/health` and `/v1/ready`.

Not a unit test of `main.ts`, and not a mocked module — the failure above was in dependency
injection at startup, which only a real boot reaches. It must fail if any module's constructor
throws, and it must run as part of `npm run test:backend` (it is seconds, not minutes).

Second, a **config completeness check**: every variable `src/config/env.ts` requires must be
present in `.env.example` with an explanatory comment. That is what would have caught the
missing line at the moment it became required, rather than days later.

## 2. CI

There is **no CI in any of the five repos** — no workflow file anywhere. Nothing runs the tests
but a person remembering to.

Add GitHub Actions (or state a better fit and why) running, on push and pull request:

- `wms_domain`: build
- `wms_backend`: **test, typecheck, and build** — all three. The type gate was off for several
  handoffs because vitest transpiles without typechecking, and three separate agents reported
  "tests green" while `npm run build` was failing. Green must mean all three.
- `wms_admin` and `wms_participant`: test and typecheck
- The boot smoke test from §1

Notes that will bite if you miss them:

- **Node 22 is required** — `argon2` segfaults on Node 20 and the suite dies with
  `ERR_IPC_CHANNEL_CLOSED` before a single test runs. Pin 22 in the workflow.
- The backend suite needs **Postgres 18** with `btree_gist` and `citext`. Use a service
  container; `wms_backend/docker-compose.yml` is the reference for version and init.
- `wms_backend` is **not a git repository**, so its CI cannot run until it is one. Write the
  workflow file anyway, say clearly that it is inert until the repo is initialised, and do
  **not** run `git init` yourself — that is the owner's call.
- Cognito and AWS credentials must **not** be required for CI. The suite runs on the local
  identity provider (`test/setup.ts` sets `AUTH_PROVIDER=local`); if any test needs real AWS,
  name it — that is a test to fix, not a secret to add.

## 3. `gitSha` is always null

`/v1/health` reports `gitSha: null`, so a deployed build cannot be identified — you cannot tell
which commit is running, which makes an incident report worthless. `src/config/env.ts` already
accepts a `GIT_SHA` override for exactly this. Wire CI to set it, and make the local fallback
(`git rev-parse`) work when the repo has one.

## 4. The service still connects as the database owner

`.env` has `DATABASE_URL=postgres://wms@…` — the **owner**, which bypasses every GRANT in the
database. The `app_rw` role exists, is correctly restricted, and is unused at runtime. The
restricted-evidence boundary is already enforced through a separate `restricted_rw` connection,
so this is the last piece.

Switch `.env.example` to `app_rw` and tell me the exact line to change in my own `.env`.
Migrations keep using the owner — they create objects.

**Expect breakage, and do not fix it with a GRANT.** Every failure this surfaces is a place the
code relied on owner privilege it should not have. Report each with the table and operation, and
let me decide. A grant added to make a test pass is how a boundary dies — and this one has
already been rebuilt once for that reason.

Add a startup assertion that refuses to boot in production if the connection is a superuser.
That is cheap and it makes the regression impossible rather than merely unlikely.

---

## Definition of done

- CI config committed in each repo, with a note saying which are inert pending a git repo.
- `npm run test:backend` includes the boot test and still passes (currently 197).
- `npm run typecheck:backend` and `npm run build:backend` clean.
- The service boots on `app_rw` and the main endpoints work — paste what refused, if anything.
- Deliberately break something (remove a required env var) and show the boot test catching it.
  That demonstration is the point of the task; without it you have only written config.

**Coordinate before running the backend suite** — other agents work in this repo. The shared
test-database-url collision has been fixed (vitest `provide`/`inject`), so concurrent runs are
now safe; the old warning no longer applies.

# Task: make the restricted boundary real at runtime

Repo: `wms_backend`. Backend only, no app changes. Small, and worth doing carefully.

---

## The problem

`restricted` is meant to be a **permission boundary**: a separate schema, owned by a separate
database role, with no foreign key from `core`. PRV-04 requires medical, disability /
classification and identity evidence to be separated and least-privilege.

Check the grants and you will find that part is correct — `app_rw` has **neither** `USAGE` on
the schema **nor** `SELECT` on any table in it. Only `restricted_rw` does.

Now check `.env`: `DATABASE_URL=postgres://wms@…`. The service connects as the **owner**, which
bypasses every grant in the database. So the boundary exists on paper and is switched off in
practice, and nothing in the test suite notices, because the tests connect as the owner too.

This already has a concrete consequence. `src/people/purge-blockers.sql.ts` reads
`restricted.evidence_document`, `restricted.identity_document`,
`restricted.classification_fact` and `restricted.accommodation_need` directly. It passes today
and it will fail with `permission denied for schema restricted` the first time the service
runs as `app_rw` — which is the whole point of having created that role.

## What to do

### 1. Answer questions about restricted data without reading it

Add a `SECURITY DEFINER` function in the `restricted` schema that takes a person id and
returns a **boolean** — does this person have any restricted record? Grant `EXECUTE` on it to
`app_rw` and nothing else.

That is the shape that respects the boundary: the *answer* crosses, the *data* does not.
`app_rw` still cannot read a single row, but the purge check can do its job. Rewrite
`purge-blockers.sql.ts` to call it instead of querying those tables.

Set `search_path` explicitly inside the function. A `SECURITY DEFINER` function without a
pinned `search_path` is a privilege-escalation hole — that is the standard warning for a
reason, and this one runs as the owner of protected medical data.

### 2. Make the application connect as `app_rw`

Change `DATABASE_URL` to the `app_rw` role in `.env.example` (and tell me the exact `.env` line
to change; do not assume my local file). Migrations keep using the owner — they create objects.

**Expect this to break things, and do not fix a break by granting more.** Every failure it
surfaces is a place the code was relying on owner privileges it should not have. Report each
one with the table and operation involved. If something genuinely needs a grant, say which and
why, and let me decide — a `GRANT` added to make a test pass is how a boundary dies.

### 3. Prove it in the tests

The existing suite connects as the owner, so it cannot see any of this. Add tests that
explicitly switch role:

```sql
BEGIN; SET LOCAL ROLE app_rw; … ; ROLLBACK;
```

**`SET LOCAL ROLE` outside a transaction silently does nothing** — a test written without the
`BEGIN` passes while proving nothing. This has already happened once in this codebase.

Cover:
- `app_rw` selecting from `restricted.evidence_document` is **refused by Postgres**.
- `app_rw` calling the new function **succeeds** and returns the right boolean both ways.
- The purge blocker check still reports `has_restricted_data` correctly, running as `app_rw`.

## Definition of done

`npm run test:backend` from `/Users/gauravgambhir/Desktop/Code_Life/wms` — currently 156, none
may break. Then boot the service with `DATABASE_URL` on `app_rw` and exercise the main
endpoints (`/v1/me`, the people list, a registration journey read); report anything that
refused, without fixing it by widening grants.

**Coordinate before running the test suite:** another agent may be working in this repo, and
`test/globalSetup.ts` writes the throwaway database URL to a single shared file
(`test/.tmp-database-url`). Two suites running at once overwrite each other's URL and fail in
confusing ways.

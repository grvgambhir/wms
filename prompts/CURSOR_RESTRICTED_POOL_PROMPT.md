# Task: a second connection for restricted data — do NOT grant role membership

Repo: `wms_backend`. Small, and it is a security decision being implemented, so read the
reasoning before the instructions.

---

## The question that came up, and the answer

The boundary work left one thing unresolved: `app_rw` cannot reach `restricted.*`, which is
correct, but the evidence feature legitimately needs to. The suggested fix was:

```sql
GRANT restricted_rw TO app_rw WITH INHERIT FALSE;   -- do not do this
```

**No.** `WITH INHERIT FALSE` means `app_rw` does not get those privileges *automatically* — it
must run `SET ROLE restricted_rw` first. That prevents accidents. It does not prevent attacks.

Anything that can execute SQL as `app_rw` is then **one statement** away from reading medical
records, para classifications and identity documents. That includes any SQL-injection flaw in
any ordinary query anywhere in the service — and the whole reason `restricted` is a separate
schema with a separate owner and no foreign key from `core` is to make that class of bug
unable to reach this data (PRV-04: separate, restrict, least privilege, log access).

A privilege the ordinary role can switch into is not a boundary. It is a speed bump.

## What to build instead

**A second connection pool that authenticates as `restricted_rw`**, with its own credentials,
used only by the code that handles restricted evidence.

Then `app_rw` cannot become `restricted_rw` by any SQL, because the separation is at the
**authentication** layer rather than the privilege layer. There is no statement that crosses it.

- Give `restricted_rw` a password and add `RESTRICTED_DATABASE_URL` to `.env.example` (name
  only, never a value) and to the Zod schema in `src/config/env.ts`. Tell me the exact lines to
  add to my own `.env`; do not assume its contents.
- Make the pool **small** — 2 or 3 connections. This traffic is low-volume by nature, and a
  small cap is itself a limit on how much of this data can be moving at once.
- Fail at boot if the restricted module is enabled and the URL is missing. Never silently fall
  back to the ordinary pool — that failure would be invisible and would quietly undo all of
  this.
- Only the restricted evidence module may inject it. If a second module needs it, that is a
  conversation, not a refactor you do on your own.

## Access logging is not optional

`restricted.access_log` exists and §9 of the plan states the property as: *"every access by the
privileged role appears in `restricted.access_log`"*. Write the log entry **on the same
connection, in the same transaction** as the read. A log written separately can be skipped by
an early return or lost to a rollback while the read still happened.

Record who, what record, and why (the endpoint or purpose) — "who read it" without "what for"
does not answer the question an audit actually asks.

## Keep the boolean function

The `SECURITY DEFINER` function that answers *"does this person have restricted data?"* stays
as it is, and the purge check keeps using it. It is the right tool for questions that need an
answer but not the data, and it means the purge path still needs no restricted connection at
all.

## Tests

- `app_rw` selecting from `restricted.evidence_document` is refused by Postgres. Use
  `BEGIN; SET LOCAL ROLE app_rw; …; ROLLBACK` — **outside a transaction `SET LOCAL ROLE`
  silently does nothing** and the test would pass while proving nothing.
- `app_rw` **cannot** `SET ROLE restricted_rw` — assert the error. This is the test that
  proves the grant was not added, and it should stay in the suite as a guard against someone
  adding it later to fix an unrelated failure.
- A restricted read through the restricted pool succeeds **and** writes an `access_log` row.
- A restricted read that throws after the query leaves **no** orphaned state and still records
  the access (same transaction).
- The purge blocker check still works with no restricted connection configured.

## Definition of done

Run all three from `/Users/gauravgambhir/Desktop/Code_Life/wms` and paste the results:
`npm run test:backend`, `npm run typecheck:backend`, `npm run build:backend`.

Then boot with `DATABASE_URL` on `app_rw` and exercise the evidence endpoints end to end.
Report anything that refused — and do not fix a refusal with a `GRANT`.

**Coordinate before running the suite** — another agent is in this repo and
`test/globalSetup.ts` writes the throwaway database URL to one shared file.

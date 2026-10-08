# Task: the admin work queues onto the real database

Repos: `wms_backend` and `wms_admin`.

Three screens still run on `wms_api`'s in-memory mocks: **Communications**,
**Assisted Registration**, and the **Exception Review Queue**.
`mockAccreditationDeskRepository.ts` states the shared problem in its own comment:
*"In-memory only (no persistence) — state resets on restart."*

Two of the three have tables. **One does not** — read on.

---

## 1. Communications — tables exist

`core.comms_template`, `comms_template_version`, `comms_template_copy`,
`comms_template_variable`, `comms_suppression`, `core.broadcast`, `core.delivery`,
`core.delivery_attempt`.

OPS-02 wants targeting by sport, event, category, grade, venue, team, status, evidence-gap,
payment-state, language and role. That audience definition is **data**, not a query someone
writes per broadcast — build it so a new audience does not need a deploy.

`audienceIncludesParticipant()` in `@wms/domain` already decides who a broadcast reaches, and
REV-038 verified the negative case (a Rowing broadcast does not reach a Tennis entrant). Keep
using it; do not write a second copy of that rule in SQL.

`comms_template_copy` exists because a template has **per-locale** copy (PLT-02). A template
with one body and a language column is the wrong shape — check what the table actually says
before designing the endpoint.

`delivery` and `delivery_attempt` are separate for a reason: OPS-02 asks for delivery
reporting, which means retries and failures are part of the record, not overwritten state.

## 2. Assisted registration — table exists

`core.assisted_session`.

PLT-06: **no proxy registration without recorded consent.** This is already a database
constraint — a draft assisted session with no consent raises `23514`, and
`test/rule-immutability.spec.ts` proves it. Let it refuse; do not pre-check and report your
own message.

The operator and the participant are different people and both must be recorded. An assisted
session where the audit trail cannot say who typed and who consented is worse than none.

## 3. Exception review queue — the tables exist, in `ops`

**Correction to an earlier version of this prompt, which said there was no table.** That was
wrong: `ops.exception_case` and `ops.exception_signature` exist, created in
`1700000003000_platform.sql`. The mistake was searching only the `core` schema. Do **not**
create a second queue.

What is there:

```
ops.exception_case       id, event_id, entry_id, kind, impact, summary, status,
                         created_at, resolved_at
ops.exception_signature  id, case_id, signer_id, decision, note, signed_at
                         UNIQUE (case_id, signer_id)
```

**That unique constraint is dual control, already enforced.** One reviewer signing twice is a
unique violation, not a second signature — exactly the rule, in the database, where an
administrator under time pressure cannot route around it. `requiredSignatures()` in
`@wms/domain` decides how many are needed; the constraint decides that they are distinct people.
Serve both; do not re-implement either in TypeScript.

Two things are genuinely missing from the shape, and a follow-on migration should add them:

- **Which rule version is disputed.** `entry_id` says which entry; it does not say what the
  athlete is arguing with. Without it a case cannot be reviewed once the rules move on.
- **A coded rejection reason.** `note` is free text. A refusal shown to an Italian athlete has
  to be an i18n key (PLT-02), and reporting on *why* exceptions are refused needs a code, not
  prose. Keep `note` for the reviewer's own words; add the key beside it.

Add those, update `BACKEND_DB_PLAN.md` in the same change, and run `npm run plan:drift` before
reporting finished — it compares the plan to the live database and fails on a gap. Three
separate times in this project a table was designed, reviewed, recorded as done, and never
migrated.

---

## The apps

`wms_admin`: point all three screens at `wmsBackendBaseUrl()` (`:3050`) through the shared
`backendRequest` helper — **not** `wmsApi.ts` (`:3040`).

## Tests

- Dual control: two signatures from **the same** reviewer do not approve; two distinct ones do.
  Enforced by the database — assert the constraint fires, not a service branch.
- An assisted session without consent is refused by the constraint.
- A broadcast reaches the targeted athletes and **not** the untargeted ones (keep REV-038's
  negative case).
- A failed delivery is recorded as an attempt and remains visible.
- Restart-survival for all three — that is the defect being closed.
- `npm run plan:drift` reports no gap.
- Green in both repos.

## Definition of done

Issue a broadcast, run an assisted session, and approve one exception with two reviewers —
restart the backend and show all three still there.

**Coordinate before running the backend suite:** `test/globalSetup.ts` writes the throwaway
database URL to a single shared file, so two suites at once break each other.

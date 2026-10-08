# Task: fix a real, reproduced bug in REV-088's evidence-approval → entrant_attribute write

Repo: `wms_backend` (NestJS + PostgreSQL 18). Root: `/Users/gauravgambhir/Desktop/Code_Life/wms`.
Node 22 — run commands through the root scripts (`npm run test:backend`, `npm run typecheck:backend`,
`npm run build:backend`), which use `scripts/node22.sh`.

Suggested: Codex, **medium** reasoning. One function, one migration. Root cause is already found
and reproduced at the SQL level below — this is a fix-and-verify task, not an investigation.

---

## What's broken

`EvidenceService.materializeApprovedAttribute` (`src/evidence/evidence.service.ts`, ~line 492) is
called when an OC approves a Judo evidence upload (belt certificate, weigh-in, federation licence).
It writes a new `core.entrant_attribute` row and, if a prior verified row for the same
`(event_id, person_id, attribute, sport_code, issuer)` exists, marks that old row's
`superseded_by` to point at the new row's id.

**It always fails when there is a prior row to supersede** — i.e. on every real second
eligibility check, and on the very first live walkthrough of A4's registration half today,
because the Judo seed data (REV-088) pre-populates Daniel's Judo attributes as already
`verified` for the "accepted" demo case. Walking A4 live as Daniel: upload all three documents →
`:5173` Evidence review → **Approve** → **"The review action was refused."** every time, for
every one of the three document kinds. `POST /v1/evidence/:id/decisions` returns
`422 REFERENCE_INVALID`.

## Root cause, reproduced directly against Postgres

The function currently runs **UPDATE, then INSERT** (`src/evidence/evidence.service.ts`
lines ~522–548):

```sql
UPDATE core.entrant_attribute SET superseded_by = $6   -- $6 = nextId, generated client-side, NOT YET INSERTED
 WHERE event_id = $1 AND person_id = $2 AND attribute = $3
   AND sport_code IS NOT DISTINCT FROM $4 AND issuer IS NOT DISTINCT FROM $5
   AND superseded_by IS NULL AND status <> 'rejected';

INSERT INTO core.entrant_attribute (id, ...) VALUES ($1 /* = nextId */, ...);
```

`superseded_by` is a real, **non-deferrable** FK to this same table
(`entrant_attribute_superseded_by_fkey`). The UPDATE tries to point the old row at `nextId`
before that row exists — reproduced directly:

```
ERROR:  insert or update on table "entrant_attribute" violates foreign key constraint
"entrant_attribute_superseded_by_fkey"
DETAIL:  Key (superseded_by)=(...) is not present in table "entrant_attribute".
```

**Reversing the order does not fix it either** — also reproduced directly. INSERT-then-UPDATE
trips a *different* constraint, the partial unique index `entrant_attribute_current`
(`ON (event_id, person_id, attribute, COALESCE(sport_code,''), COALESCE(issuer,'')) WHERE
superseded_by IS NULL AND status <> 'rejected'`, from `1700000013000_rules_and_missing_plan_tables.sql`)
— for the gap between the two statements, both the old row and the newly-inserted row are
simultaneously "current" for the same key:

```
ERROR:  duplicate key value violates unique constraint "entrant_attribute_current"
DETAIL:  Key (event_id, person_id, attribute, COALESCE(sport_code, ''::text),
COALESCE(issuer, ''::text))=(..., federation_licence, judo, Judo federation) already exists.
```

Neither statement order works with the FK as it stands today. No automated test caught this —
`judo-exception.spec.ts`/`evidence.spec.ts` (REV-088) apparently never re-approve an attribute a
fixture had already seeded as `verified`; every real athlete's *second* eligibility check does
exactly that, and so would any retry of a rejected-then-corrected upload.

## The fix

Make `entrant_attribute_superseded_by_fkey` **`DEFERRABLE INITIALLY DEFERRED`** (checked at
`COMMIT`, not per-statement) and keep the **UPDATE-then-INSERT** order (the order that is
already there is the logically correct one once the FK stops being checked immediately — by
commit time the row it references exists, and no intermediate query ever observes two "current"
rows for the same key, so the partial unique index never trips either).

Add a migration (`migrations/`, next number after `1700000031000_reapply_judo_attributes_and_exceptions.sql`):

```sql
-- Up Migration
ALTER TABLE core.entrant_attribute
  DROP CONSTRAINT entrant_attribute_superseded_by_fkey,
  ADD CONSTRAINT entrant_attribute_superseded_by_fkey
    FOREIGN KEY (superseded_by) REFERENCES core.entrant_attribute(id)
    DEFERRABLE INITIALLY DEFERRED;

-- Down Migration
ALTER TABLE core.entrant_attribute
  DROP CONSTRAINT entrant_attribute_superseded_by_fkey,
  ADD CONSTRAINT entrant_attribute_superseded_by_fkey
    FOREIGN KEY (superseded_by) REFERENCES core.entrant_attribute(id);
```

Run it with the owner connection like every other migration in this repo (`DATABASE_OWNER_URL`,
`npm run migrate` from the root — check `package.json`/`scripts/node22.sh` for the exact command
already used by the other Judo migrations).

Confirm `materializeApprovedAttribute`'s own logic needs no other change — the statement order in
the source today already matches what deferring the FK requires; this may be a migration-only fix.
If you find a reason the function body also needs to change, say so and why.

## Tests

Add a real-database test (mirror the existing `evidence.spec.ts`/`judo-exception.spec.ts` style)
that specifically **re-verifies an attribute that already has a verified row**: seed (or produce
via the normal upload→approve path) one verified `belt_rank` row for a person, then upload and
approve a *second* belt certificate for the same person/event/sport, and assert:

- the approval succeeds (no 422),
- the old row now has `superseded_by` pointing at the new row's id,
- the new row is the one with `superseded_by IS NULL` (i.e. is now "current"),
- `core.entrant_attribute_current`-style lookups (however the rules engine reads "the current
  value") resolve to the new row, not the old one.

Also re-run the existing `judo-exception.spec.ts` and `evidence.spec.ts` to confirm nothing
regresses.

## Gates — all green, from the root

```
npm run test:backend
npm run typecheck:backend
npm run build:backend
```

## Do not

- Touch anything outside `materializeApprovedAttribute`, the new migration, and its test —
  this is a narrow, already-diagnosed fix.
- Commit or push.

## Definition of done — report back with

1. Confirmation the migration applied cleanly against the current dev database.
2. The new test, and its result.
3. Gate output (test counts, typecheck, build).
4. A live re-check, if you can reach a browser: Daniel's three Judo evidence uploads (federation
   licence, belt certificate, weigh-in) all **Approve** cleanly from `:5173` Evidence review, and
   the participant's Judo entry's checkout gate unlocks. If you cannot drive a browser, say so —
   the gates and the new test are sufficient to consider this closed either way.
5. A `REVISIONS.md` entry in `wms_participant/context_docs/docs/` (next REV number — check the
   file for whatever the latest one is; another session may have added more since REV-089) and a
   `PROGRESS_COMO2027.md` session-log row.

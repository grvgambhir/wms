# Task: evidence documents onto the real database

Repos: `wms_backend` and `wms_participant`.
**Parallel-safe** with the registration-mutations and roster prompts — different tables,
different screens.

---

## Where this stands

The evidence screens are built (`eligibility-evidence.tsx` and the admin review queue), and
the tables exist in **two schemas**:

| Schema | Tables |
|---|---|
| `core` | `evidence_requirement_set`, `evidence_requirement_version`, `evidence_upload`, `evidence_review`, `evidence_waiver` |
| `restricted` | `evidence_document`, `evidence_upload`, `evidence_review`, `evidence_waiver`, `evidence_outstanding`, `evidence_document_application` |

The app still runs on `MockEvidenceRepository` and `MockRestrictedEvidenceRepository`.

## The thing that makes this task different from the others

**`restricted` is a permission boundary, not a naming convention.**

It is a separate schema, owned by a separate database role, with **no foreign key from
`core`** — that absence is deliberate (PRV-04: medical, disability/classification and ID
evidence are separated, least-privilege, restricted exports, separate retention). A join from
`core` to `restricted` would defeat the entire arrangement, and it is the obvious thing to
write when a query needs both.

So:

- The connection used for restricted reads must be the restricted role. Do not widen the
  ordinary application role's grants to make a query easier.
- The participant-safe export must keep omitting restricted fields — `registration-read.spec.ts`
  already asserts this; it must still pass.
- Every restricted read is **logged** ("log access/export" is part of PRV-04, not optional).

If you find yourself needing a join across the boundary, that is the signal to stop and
report, not to add the foreign key.

## Backend

Participant routes (identity from token — a participant sees only their own evidence):
list what is outstanding for their entry, upload a document, read status.

OC routes (`@Roles(...)`): the review queue, approve/reject with a coded reason, and waivers.
A rejection reason is an **i18n key**, never a sentence (PLT-02 — an Italian entrant cannot be
shown an English refusal).

Files: there is no object storage yet. Keep the storage boundary behind an interface with a
local stub, the way the PSP and identity seams work — the columns already name an S3 key, so
the shape is decided; the implementation is not. **Do not write file bytes into Postgres.**

## Participant app

`ApiEvidenceRepository` and `ApiRestrictedEvidenceRepository` beside the existing `Api*`
classes, wired in `repositories.ts`, with the `Mock*` kept as the offline fallback — the same
pattern as the consent and pre-registration repositories.

## Tests

- A participant cannot read another participant's evidence — asserted in SQL.
- The participant-safe export still omits restricted fields (the existing test must pass
  unchanged).
- A restricted read from the ordinary application role is **refused by the database**, not by
  a service check. Wrap it in `BEGIN` / `SET LOCAL ROLE app_rw` / `ROLLBACK` — outside a
  transaction `SET LOCAL ROLE` silently does nothing and the test will pass for the wrong
  reason.
- Approve/reject writes a review row with an actor and a coded reason.
- Green in both repos.

## Definition of done

Upload a document as a participant, review it as an OC user, restart the backend, and confirm
both the document and the review survived. Report anything where the mock and the real schema
disagreed.

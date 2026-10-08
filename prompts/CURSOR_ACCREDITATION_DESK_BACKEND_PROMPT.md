# Task: accreditation desk onto the real database

Repos: `wms_backend`, `wms_admin` (the desk) and `wms_participant` (the athlete's own pass).
**Parallel-safe** with the evidence and roster prompts.

---

## Where this stands

Both ends are built and both run on mocks. The admin desk goes through `wms_api`, whose
`MockAccreditationDeskRepository` says so in its own comment: *"In-memory only (no
persistence) — state resets on restart."* Every badge issued in a demo vanishes when the
process stops.

`core.accreditation` and `core.accreditation_gate` exist.

## The requirement that shapes this

**ACC-03: credential approval is gated on configurable conditions** — registration status,
payment, evidence, training, role. That is what `accreditation_gate` is for, and it is the
reason this is not a simple CRUD task.

Read the gate table before designing. The gates must be **data**, not a hardcoded chain of
`if` statements: the OC changes what a badge requires without a deploy, and a per-condition
branch in TypeScript is exactly the per-case code branching the RFP rejects elsewhere.

Issuing a badge when a gate is unmet must be refused with **which gate** failed. "Cannot
issue" alone sends the desk operator to a supervisor with nothing to act on, and at Games time
there is a queue behind them.

ACC-01: one credential record linked to the authoritative person record — configurable role,
sport, venue, zone, transport, catering and date/time entitlements. Do not collapse
entitlements into a single text field.

## Backend

OC routes (`@Roles(...)`): the desk queue, issue, reissue, revoke. Every one writes an audit
row — ACC-01 requires the credential lifecycle to be auditable, and a revoke with no recorded
reason is the case that will be asked about later.

Participant route (identity from token): **their own pass only.** The existing arrangement is
right — one record, read by both portals, scoped server-side so a participant can never see
the desk queue (REV-037). Keep that property and test it.

ACC-05 mentions QR/barcode/NFC. The identifier belongs in the record; **do not put personal
data in the QR payload** ("without exposing unnecessary data") — an opaque identifier that the
scanner resolves is the whole point.

## The apps

- `wms_admin`: point the desk at `wmsBackendBaseUrl()` (`:3050`) using the shared
  `backendRequest` helper, not `wmsApi.ts` (`:3040`).
- `wms_participant`: `ApiAccreditationRepository` already exists and already wraps a mock
  fallback — repoint it and keep the fallback.

## Tests

- A badge is refused while a gate is unmet, and the response names the failing gate.
- Changing gate configuration changes the outcome **with no code change** — this is the test
  that proves the gates are data. Write it first; if it is hard to write, the design is wrong.
- A participant reading the desk queue is refused; a participant reading their own pass
  succeeds — asserted in SQL.
- Issue → revoke → reissue leaves a readable history with actor and reason.
- Restart-survival: issue a badge, restart, still there. This is the defect being closed, so
  it deserves an explicit test rather than a manual check.
- Green in all three repos.

## Definition of done

Issue a badge at the desk, see it on the athlete's `/my-accreditation` screen, restart the
backend, and confirm both still show it. Paste what you saw.

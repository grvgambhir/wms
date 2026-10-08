# Task: Admin "Registrations" — find any entry, see everything about it, act on it

Repos: `wms_backend` (NestJS + PostgreSQL 18), `wms_admin` (Vite/React).
Root: `/Users/gauravgambhir/Desktop/Code_Life/wms`. Node 22 is required — run backend commands
through the root scripts (`npm run test:backend` etc.), which go through `scripts/node22.sh`.

Suggested: Codex, **high** reasoning. It is a list + detail screen, but the list must hold up at
~20,000 entries and the detail must not leak restricted data.

---

## Why this exists

The OC has **no way to see registrations**. The admin portal has Finance, Exceptions,
Accreditation, People — and nothing that answers "show me the entries for Rowing, pending
payment" or "open Daniel Harper's entry".

What exists is misleading:

- **Operations → "Registration lifecycle (governance)"** looks like an entries area. It is one
  hard-coded entry: `GOVERNED_ENTRY_ID` in `wms_admin/src/domain/registrationJourney.ts`, loaded by
  `wms_admin/src/hooks/useEntryGovernance.ts`. A demo of the status buttons, nothing more.
- The Operations numbers (`14,210 / 20,000`, `1,420` sessions, `48,912` records) are hard-coded.
  Out of scope here — do not "fix" them by wiring them to this work.
- `GET /v1/live/entries` (`wms_backend/src/finance/finance-reads.ts`) returns up to 5,000 rows for
  Finance to merge client-side. **Do not build the list on it.** It has no filters, no cursor,
  and is capped by design.

RFP requirements this answers:

| RFP | Requirement |
|---|---|
| **OPS-03** (Must) | Role-based dashboards + **work queues** for registration, sport review, finance… |
| **OPS-04** (Must) | Configurable reports, **filters**, saved views, **CSV export with access controls + export audit** |
| **REG-15** (Must) | Real-time + exportable **registration counts**, evidence backlog, waitlists, team completeness |
| **REG-11** (Must) | The status lifecycle — draft … disqualified |
| **RUL-04** (Must) | Original category, current category, reason, approver, timestamp |
| **PRV-04 / EVD-03** | Restricted (medical/classification) evidence never leaves its boundary |
| NFR | **Admin search/view/save p95 ≤ 3 s** |

Scale: ~15,000 pre-registrations become ~14–20k entries. Design for 20k from the first query.

---

## Sequence — do it in this order

### 1. Backend: list endpoint

`GET /v1/admin/registrations` on a new `@Controller('admin/registrations')`,
`@Roles(...OC_ROLE_CODES)` (from `src/people/profile.schema.ts`).

**Filters** (all optional, all combinable, AND-ed):
`eventId` (default `core.current_event_id()`), `sportId`, `productId`, `category` (matches
current, else original category name), `status` (repeatable — `?status=draft&status=pending_payment`),
`grade`, `paymentState` (`unpaid` | `paid` | `refunded` — derive from `core.entry_balance` /
orders; document exactly how), `evidenceState` (the entry's `evidence_status`), `teamId`,
`search` (athlete given/family name, email, or an entry-id prefix).

**Row shape** — enough to triage without opening the entry:
entry id, athlete name + email + nationality, sport name, product name, grade, **original and
current category name**, status, evidence status, payment state + amount due/settled (minor
units + currency), team name, created/updated timestamps.

**Pagination: keyset, not offset.** Reuse `src/common/pagination/keyset.ts`
(`decodeCursor`, `clampLimit`, `keysetClause`) exactly as `src/people/admin-people.service.ts`
does: order `(created_at DESC, id DESC)`, fetch `limit + 1`, return `cursor` when there is more.
No `OFFSET`. **No `COUNT(*)` for a page total.** Index `entry_keyset
(event_id, created_at DESC, id DESC)` already exists — check it is used.

**Counts** (REG-15) — a separate `GET /v1/admin/registrations/counts` taking the same filters
*except* `status`, returning `{ status: count }`. One `GROUP BY status`. This is the one place a
count is correct: it is a single aggregate, not a per-page total.

### 2. Backend: detail endpoint

`GET /v1/admin/registrations/:entryId`, same roles. One call the detail screen can render from:

- the list row fields, plus athlete date of birth and the rule version the entry is pinned to
- **category lineage** (RUL-04): original, current, `category_change_reason`, and the
  `core.category_audit` trail; reuse what `GET /v1/registration-entries/:entryId/category-derivation`
  already computes rather than re-deriving
- **status history**: `core.entry_status_event` for the entry, oldest first (from, to, actor
  kind, reason, when)
- **allowed next actions** for an admin, from `core.entry_status_transition` — the database's
  table, not a hard-coded list in the app
- **money**: order(s), payment(s), refunds — amounts in minor units
- **evidence**: ordinary evidence items with status. For restricted evidence return **only** a
  count and a status summary (`hasRestrictedEvidence`, `restrictedStatus`) — never document
  metadata, file names, class detail or reviewer notes. The `app_rw` pool cannot read
  `restricted.*` by design; do not add a grant to make it work (see "Cautions").
- team + roster summary when the entry is a team/crew entry

Missing entry → `404 REGISTRATION_ENTRY_NOT_FOUND` via `refuse()` (`src/people/refuse.ts`).

### 3. Backend: CSV export (OPS-04)

`GET /v1/admin/registrations/export.csv` with the same filters. Follow
`src/finance/reporting.service.ts` exactly: use `csvCell()` / `toCsv()` (CSV-injection guard +
CRLF), and **write the `audit.activity_log` row in the same transaction as the read** — an
export nobody can prove happened fails OPS-04. Stream or cap it; state which and why.

### 4. Admin app: the list screen

- Route `/registrations`, nav item **"Registrations"** under **Work queues** in
  `wms_admin/src/components/layout/AdminPortalShell.tsx`, first in that section.
- A **table**, not cards. Columns from the row shape; status and payment as badges.
- Filter bar: search box (debounced), sport, product, category, status (multi), payment, evidence.
  **Filters live in the URL query string** so a view can be bookmarked and shared — that is the
  honest first step toward OPS-04's "saved views"; do not build a saved-views store now.
- Status count chips above the table from `/counts`; clicking one sets the status filter.
- "Load more" with the cursor. No page numbers (keyset has none, and that is correct).
- Empty, loading and error states. Export CSV button.
- Follow the existing repository pattern: an interface + `ApiRegistrationsRepository` using
  `backendRequest` from `src/auth/backendRequest.ts` (see `ApiAdminPeopleRepository.ts`), wired
  in `src/repositories/provider`. A mock only if the other screens' tests need one.

### 5. Admin app: the detail screen

- Route `/registrations/:entryId`; a row click opens it.
- Sections: Athlete · Entry (sport, product, grade, team) · **Category** (original → current,
  reason, audit trail) · **Status** (current + history timeline) · Money · Evidence · Team.
- **Actions**: one button per allowed next action from the detail response, calling the existing
  `POST /v1/registration-entries/:entryId/status/:action`. After it returns, **refetch the
  detail** — never render the POST response as if it were the new state.
- Every action sends `newIdempotencyKey()` from `wms_admin/src/api/idempotencyKey.ts`.

### 6. Retire the fake panel

Remove `GovernancePanel` from the Operations page and delete `GOVERNED_ENTRY_ID` and
`useEntryGovernance` once nothing uses them. Its tests move to the detail screen. One place to act
on an entry, not two that disagree.

---

## Cautions — read before writing code

1. **Idempotency keys are one per click.** A bug was fixed today: the governance panel sent
   `admin-status-<entry>-<status>`. The second Cancel on the same entry reused the key, the
   backend correctly replayed the *first* response, the screen showed success, and nothing
   changed — a refresh showed the truth. The same pattern was in refunds. Use
   `newIdempotencyKey()` per user action; never build a key from record ids.
2. **Do not widen a database boundary to make a query work.** If the detail seems to need
   `restricted.*` or `core.para_class_projection`, it does not — return the summary described
   above. `test/restricted-governance.spec.ts` asserts `app_rw` is refused; a GRANT that breaks it
   is wrong even if everything else passes. This exact mistake was made and reverted once.
3. **The date of birth lock is correct.** `core.person_dob_locked_after_entry` refuses DOB
   changes once any entry exists. Do not offer a DOB edit on the detail screen.
4. **Keyset, no OFFSET, no page-total COUNT.** An `OFFSET 18000` page or a `COUNT(*)` on every
   list call is how p95 ≤ 3 s is missed at Games scale.
5. **vitest does not typecheck**, and `tsc -p .` checks nothing — the root `tsconfig.json` has
   `"files": []`. Always use `-p tsconfig.app.json`. Three handoffs reported "tests green" while `tsc` had 18 errors
   and the build was broken. All gates below, every time.
6. **Never commit or push.** Leave changes in the working tree.
7. Payment is a stub provider (PSP decision D4 is open) — show payment state from our own tables;
   do not call the provider from this screen.

---

## Tests

Backend (`wms_backend/test/admin-registrations.spec.ts`, real database like the other specs):

- Every filter narrows correctly, and filters combine (sport + status + search together).
- Keyset: three pages with `limit=2` return every row exactly once, in order, with no overlap —
  including two entries sharing the same `created_at`.
- A participant token gets **403** on list, detail, counts and export — over HTTP, not by calling
  the service.
- Detail for an entry with restricted evidence contains the summary and **no** restricted field
  names or values (assert on the serialized JSON).
- `allowedActions` for a `cancelled` entry is `reinstate`, for `confirmed` includes `cancel` —
  read from the database table.
- Export writes exactly one `audit.activity_log` row, and a formula-leading name (`=cmd`) comes
  out prefixed.
- **Performance evidence:** insert 20,000 synthetic entries in a test (or reuse
  `scripts/load-and-guarantees.mjs`), run the list query with a sport + status filter and a name
  search, and report `EXPLAIN (ANALYZE)` timings in your summary. Add an index only if the plan
  shows it is needed, and say which query it fixed.

Admin (`vitest`): list renders rows and count chips; changing a filter updates the URL and
refetches; Load more appends; a row click routes to detail; an action calls the status endpoint
with a fresh key each click (click Cancel twice on two states → two different keys) and refetches.

## Gates — all green, from the root

```
npm run test:backend
npm run typecheck:backend
npm run build:backend
cd wms_admin && npx tsc --noEmit -p tsconfig.app.json && npx vitest run
```

`npm run lint:backend` still fails on ~49 pre-existing prettier files; your **new and changed**
files must be lint-clean.

## Definition of done — report back with

1. The endpoints and their query parameters, as a short table.
2. EXPLAIN timings at 20k rows for the filtered list and the search.
3. Gate output (test counts, typecheck, build).
4. Anything you deliberately left out (saved views, bulk actions) and why.
5. An entry in `wms_participant/context_docs/docs/REVISIONS.md` (next REV number after REV-071).

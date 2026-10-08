# Task: make demo scenario A4 (Judo, RFP §9.3 scenario 4) actually runnable

Repos: `wms_backend` (NestJS + PostgreSQL 18), `wms_participant` (Expo / React Native + web),
`wms_admin` (Vite React). Root: `/Users/gauravgambhir/Desktop/Code_Life/wms`. Node 22 — run backend
commands through the root scripts (`npm run test:backend`, `npm run typecheck:backend`,
`npm run build:backend`), which use `scripts/node22.sh`.

Suggested: Codex, **high** reasoning. This spans seed data, one new participant-facing input, and
one genuinely new backend capability (raising an exception) — not a bug fix.

---

## Why this exists

RFP §9.3 scenario 4 (A4, marked *Stretch* in `docs/TESTING_GUIDE.md`) needs a Judo entry that is
refused on **four dimensions at once** — age, weight, federation membership, minimum belt/grade —
naming which one failed, then demonstrates raising that refusal as an exception with **dual
approval** (two different reviewers must sign before it clears).

The dual-approval half already works and was verified live on 2026-09-17 (REV-087 fixed two real
bugs in it — see `wms_participant/context_docs/docs/REVISIONS.md`). **The registration half cannot
be tested at all**: Judo does not exist in the seed (`core.sport`, `core.sport_entry_product`) —
`GET /v1/me/entries` / the participant Register screen lists only Basketball, Para Swimming,
Rowing, Swimming, Tennis. And even with Judo seeded, two things are still missing underneath it:

1. **No path writes `core.entrant_attribute` facts** (weight_kg, belt_rank — the non-age
   dimensions the multi-dimension rules engine already knows how to band against). Grep confirms
   no controller and no participant screen touches this table; only `src/rules/load.ts` reads it.
2. **No "raise an exception" endpoint exists at all.** `src/ops/exceptions.service.ts` has
   `getOverview`, `approve`, `reject` — nothing that creates a case. Today's Exceptions queue is a
   fixed, seeded list (`wms_admin/src/data/exceptions.json` plus seeded DB rows); a real refused
   registration has no way to become a new row in it.

## What already exists — do not rebuild it

| Piece | Where |
|---|---|
| Multi-dimension rule engine: age/weight/belt/para-class/proficiency, `range` or `enum` bands, per-dimension `blockedBy` with a message key naming the failed dimension | `src/rules/load.ts` (`deriveLoaded`/`deriveMultiDimension`), `core.rule_dimension`, `core.attribute_type` (`weight_kg`, `belt_rank` already rows in the table) |
| Facts table with a verification lifecycle (status, verified_by/at, valid_from/until — exactly what "federation expired" needs) | `core.entrant_attribute` |
| Evidence requirement/obligation machinery (requirement set → version → applicability → obligation → document → gate), already proven for Swimming's medical certificate (REV-082/084) | `src/evidence/*`, `core.evidence_requirement_set` etc. |
| Dual-approval exception review: queue, approve, reject, one-signature-per-person guard, admin screen | `src/ops/exceptions.service.ts`, `wms_admin/src/pages/ExceptionsPage.tsx` — **fixed 2026-09-17, do not touch its idempotency-key or message-key handling** |
| Category/registration entry creation for an individual product | `registration-mutations.ts` `createEntry` |

## What to build

### 1. Seed: Judo, three-dimension rule, federation-licence evidence

Add to `wms_backend/seeds/` (follow the existing `demo.ts`/`ids.ts`/fixtures pattern, do not hand-roll
raw inserts outside it):

- `core.sport` "Judo", one `sport_entry_product` (e.g. "Men's −81 kg", `participant_type:
  'individual'`).
- A `rule_set`/`rule_version` with **three** `rule_dimension` rows: `age` (`range`, the usual
  masters bands), `weight_kg` (`range`, banded around 81 kg, e.g. −81 kg means ≤81), `belt_rank`
  (`enum`, ordered so "2nd Kyu" fails a "2nd Dan or above" minimum — check how `enum` band ordering
  is actually read by `deriveMultiDimension` before inventing an encoding).
- A federation-licence **evidence** requirement (mirror the Swimming medical-certificate wiring
  exactly: requirement set, active version, applicability to the Judo product) — with an
  expiry-aware status so "federation expired" is a real, checkable state, not a label.
- Seed `core.entrant_attribute` facts (weight_kg, belt_rank) for the seeded demo athlete(s) needed
  to hit test cases (a)/(b)/(c) in `docs/TESTING_GUIDE.md` A4 §2 without needing new input first —
  but see §2 below, a real input path must also exist.

### 2. A real path to record weight/belt facts

Decide (and say which, and why, in your report) whether weight_kg/belt_rank should be:
- OC-recorded via **Assisted Registration** (there's already an operator-assisted flow —
  `wms_admin/src/pages/AssistedRegistrationPage.tsx` / `src/roster/assisted-registration...` on the
  backend — extending that is probably the smallest correct change), or
- Evidence-verified like the federation licence (belt certificate as an uploaded document, OC
  approves, approval writes the `entrant_attribute` row) — EVD-01 frames "belt/grade... as
  evidence types", which argues for this reading.

Pick one, build it, and make sure a **fresh** athlete (no pre-seeded facts) can reach test case (a)
end to end through the real screens, not just via seeded data.

### 3. Backend: raise an exception from a refusal

A new participant-facing action, e.g. `POST /v1/registration-entries/:entryId/exceptions`
(`Idempotency-Key`, participant-scoped, entry must be the caller's), that:

- Re-derives the refusal server-side (never trust a client-sent reason) and refuses to create a
  case if the entry is not actually currently blocked.
- Creates the row `wms_admin`'s Exceptions queue reads (find and reuse `loadCases`'s query/table in
  `exceptions.service.ts` — do not create a second, parallel "exceptions" concept).
- Carries the failing dimension(s)' message key(s) so the OC sees *why*, not just *that*.
- Lands in the queue at **0/2 signatures**, `status: 'pending'`, same shape `getOverview` already
  returns.

Participant UI: on a refused Judo registration, a "Raise as exception" action wired to this
endpoint, with a visible pending/awaiting-approval state afterward (mirror how `team-roster.tsx`'s
"Propose to organiser" / evidence's "Review pending" states are written — same pattern, don't invent
a new one).

### 4. Verify the full A4 script end to end, in the browser, both portals

Walk `docs/TESTING_GUIDE.md` A4 §§1–6 for real: (a) accepted, (b) refused naming the belt dimension,
(c) refused naming the federation dimension, raise (b) as an exception, approve as Reviewer A (1/2,
second click from the same reviewer correctly 409s — this half already works, just confirm nothing
regressed), approve as a second reviewer (2/2, passes). Update the guide's A4 section with what you
actually saw, the same way the existing ✅-tagged sections are written — quote real screen text,
don't paraphrase.

## Tests

Backend (real database, like the other specs):

- All three dimensions individually blocking, with the correct message key per dimension (not a
  generic "not eligible").
- Federation-licence expiry genuinely gates the entry (a valid-until in the past blocks; the same
  document just inside validity does not).
- Raising an exception on an entry that is *not* currently blocked is refused.
- Raising twice with two different idempotency keys does not create two cases for the same refusal
  (decide and enforce a sane de-dupe — same shape as `uq_entry_live`'s reasoning, don't invent a
  new race).
- A participant cannot raise an exception on another participant's entry (over HTTP, 404).
- Approve/reject and the one-signature-per-person guard on a *newly created* case behave exactly
  like the seeded ones — no special-casing.

Participant (`npx jest`): the belt/weight input path (whichever you chose in §2), the refusal
copy naming the dimension, "Raise as exception" and its pending state, fresh idempotency key per
click.

## Gates — all green, from the root

```
npm run test:backend
npm run typecheck:backend
npm run build:backend
cd wms_participant && npx tsc --noEmit && npx jest
cd wms_admin && npx tsc --noEmit -p tsconfig.app.json && npx vitest run
```

`wms_participant` has 3 pre-existing `tsc` errors (`messages.tsx` ×2, `useProfileConsent.test.tsx`)
— no **new** ones. `npm run lint:backend` fails on ~49 pre-existing prettier files; your new and
changed files must be lint-clean.

## Do not

- Touch `wms_admin/src/repositories/ApiExceptionsRepository.ts`'s idempotency-key generation or
  `src/common/http/problem-details.filter.ts`'s `exception_*` messages — both were fixed 2026-09-17
  (REV-087) and are covered by `test/roster.spec.ts` and the admin suite.
- Invent a second "exceptions" table/concept — extend the one `exceptions.service.ts` already reads.
- Guess at how `enum` band ordering works in `deriveMultiDimension` — read it, and if belt-rank
  ordering needs a convention that doesn't exist yet, add it deliberately and say so in your report,
  don't reverse-engineer a fragile string comparison.
- Commit or push.

## Definition of done — report back with

1. The new endpoint(s) and their refusal codes, as a short table.
2. Which path you chose for recording weight/belt facts, and why.
3. Gate output (test counts, typecheck, build) for all three repos.
4. The A4 walkthrough, quoted from the actual screens, same style as the existing ✅ sections.
5. A `REVISIONS.md` entry in `wms_participant/context_docs/docs/` (next REV number after REV-087)
   and a `PROGRESS_COMO2027.md` session-log row.
6. An updated `docs/TESTING_GUIDE.md` A4 section — replace the "Stretch" caveats with what you
   actually verified, keep whatever is still genuinely unverified honestly marked.

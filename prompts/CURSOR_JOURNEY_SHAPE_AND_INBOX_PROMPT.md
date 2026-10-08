# Task: make the backend serve the contract the apps already have

Repo: `wms_backend`. No app changes — the apps are right.

Two gaps found by the wms_api route mapping, and they are the last things blocking the cutover
apart from finance.

---

## 1. `GET /v1/registration-journeys/:entryId` returns the wrong shape

`RegistrationJourneySnapshot` in `@wms/domain` is the contract both apps consume:

```ts
{ event, athlete, sports, sportEntryProducts, partners, rules, documents,
  entry, fees, quotas, waitlist, order, payment }
```

camelCase, with `PaginatedResponse<T>` wrappers, and `entry` as a `RegistrationEntry`.

`postgres-registration-journey.repository.ts` returns none of that. It hands back the raw
`jsonb` the query builds — **snake_case table rows**, `products` instead of
`sportEntryProducts`, `pools` instead of `quotas`, a top-level `statusHistory` that belongs
inside `entry`, and **no `athlete`, `partners`, `rules`, `order` or `payment` at all**.

**This is my defect, not a decision to revisit.** I wrote that repository. TypeScript did not
catch it because the shape was asserted through the query's generic parameter rather than
checked, and the test only asserts `entry.id` — which is exactly why it survived review.

**Fix the backend. Do not reshape the apps.** The domain type is the contract, three consumers
already read it, and rewriting them to match a leaky implementation would spread the defect
instead of closing it.

### How to do it

- Map every field to the domain shape. `toEntry()` in the same file already does this correctly
  for `RegistrationEntry` — follow it, and put `statusHistory` back inside `entry` where the
  type says it lives.
- `pools` → `quotas` goes through `projectQuota()`, which is already written and tested: it
  picks the pool that actually binds. Do not expose raw pools to the app.
- The five missing fields need real data. `order` and `payment` exist in `core.registration_order`
  / `payment_intent`. If `rules` or `partners` cannot be filled without a query you think is
  wrong, **say so and leave them empty with a comment** rather than inventing a join.
- **Keep it one round trip.** §6 budgets this endpoint at p95 < 150 ms and it backs the
  participant's main screen. Thirteen sequential queries is the N+1 the plan's own test forbids.

### Tests

The existing test asserting `entry.id` is the reason this shipped. Replace it with one that
asserts the **whole shape** — every field present, camelCase, `entry.statusHistory` populated,
`quotas` projected rather than raw pools. A structural assertion, not a spot check.

---

## 2. There is no participant inbox endpoint

`GET /communications/inbox/:athleteId` on the shim has no backend equivalent. The participant
Messages screen (`ApiParticipantInboxRepository`) has nowhere to go, so it cannot be cut over.

Add it as **`GET /v1/me/inbox`** — token-scoped, like `/v1/me/accreditation`. Never take the
athlete id from the path: that is the parameter the whole identity design exists to remove.

Returns `PaginatedResponse<CommunicationRecord>`, keyset-paginated.

Filtering uses **`audienceIncludesParticipant()` from `@wms/domain`**, server-side. It is the
same rule the OC broadcast side already uses, and REV-038 verified the negative case — a Rowing
broadcast does not reach a Tennis entrant. Do not write a second copy of that rule in SQL.

### Tests

- A broadcast targeted at one sport appears in that athlete's inbox and **not** in another's.
  The negative case is the test that matters.
- One participant cannot read another's inbox — asserted in SQL, not in the service.
- Pagination returns a stable cursor.

---

## Out of scope

`GET /live/orders`, `/live/payments`, `/live/entries` — those need the finance backend, which
Codex has and has not started. Leave them; they stay on the shim until that lands.

## Definition of done

From `/Users/gauravgambhir/Desktop/Code_Life/wms`, all three, pasted:
`npm run test:backend` (currently 232) · `npm run typecheck:backend` · `npm run build:backend`

Then `curl` the journey endpoint with a real token and paste the response, so the shape can be
read against the domain type rather than described.

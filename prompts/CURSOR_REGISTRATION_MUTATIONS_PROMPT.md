# Task: registration mutations on the real backend

Repo: `wms_backend`. This is the biggest remaining piece of Phase B and the one with the most
ways to be quietly wrong. Read the whole prompt before writing anything.

**Depends on `CURSOR_REGISTRATION_READ_ENDPOINTS_PROMPT.md`** (done — `RegistrationModule` is
wired and the read routes are live).

---

## What is left

`RegistrationJourneyRepository` in `@wms/domain` declares ten methods. The Postgres
implementation answers three (`getJourney`, `getEntry`, and the export). These are missing:

`saveEntry` · `transitionEntryStatus` · `updateEvidenceStatus` ·
`joinWaitlist` / `releaseWaitlistOffer` / `expireWaitlistOffer` / `claimWaitlistOffer` ·
`payOrder`

Until they exist, every write in the product still goes to `wms_api` and lands in a JSON file.

Match the shim's paths (`wms_api/src/http/routes.ts`) so the app cutover is a base-URL change:
`PUT /registration-entries/:entryId`, `PATCH /registration-entries/:entryId/evidence-status`,
`POST /registration-entries/:entryId/status/:action`, `POST /waitlists/:waitlistId/:action`,
`POST /orders/:orderId/payments`.

Identity comes from the token for participant routes, exactly as the read routes do. Admin
governance routes (`transitionEntryStatus` with an admin actor) sit behind `@Roles(...)`.

---

## Three things that must be right, and are easy to get wrong

### 1. A quota claim locks every pool it touches, in id order

There is **no `claim_quota` SQL function** — deliberately. The claim is application code, and
it must:

- find every `core.quota_pool` the entry consumes (product, sport, category — pools nest),
- lock them **`ORDER BY id`**, in one transaction,
- check headroom against `capacity - confirmed - reserved` on each,
- write `core.entry_quota_consumption`.

**The `ORDER BY id` is not tidiness — it is the deadlock avoidance.** Two entries claiming the
same two pools in opposite orders will deadlock under load, and it will only ever appear when
registration opens and thousands of people press the button at once. `lockOrder()` in
`@wms/domain`'s `quotaPool.ts` exists for this; use it rather than re-deriving the order.

The database still has the last word: `quota_not_exceeded` raises on overshoot and the filter
maps it to `409 QUOTA_FULL`. Your check makes the common path fast and the message good — it
is not the guarantee.

### 2. Status changes go through the one guarded writer

REG-11 was already broken this way once: six places wrote `entry.status` directly, so the
lifecycle guard and the audit trail held on one path out of seven (REV-044). Every transition
must write `core.entry_status_event` and let `entry_status_policy_guard` refuse illegal moves.
**Do not add a second path** because a particular flow "only needs to set one field".

`actor_kind` must be truthful — `participant`, `admin` or `system`. An admin action recorded as
`participant` makes the audit trail worse than having none.

### 3. `payOrder` is the external-idempotency case

Payment is the reason the `external` mode exists: the key is committed as `in_progress`
**before** the call leaves, so a retry after a timeout cannot charge twice. There is no PSP
integration yet (decision D4 is open), so keep the PSP boundary behind an interface with a
stub implementation — the same seam `IdentityProvider` uses. **Do not inline a fake payment
into the service.**

Money is `bigint` minor units. `gross = net + tax`. Use `core.split_inclusive` and
`core.proportional_tax_split`; `roll_up_order_totals` maintains the order. Do not compute
totals in TypeScript floats.

---

## Waitlist

Four actions, and the ordering rule is the product-sensitive part: an offer has an expiry, a
released offer must not let two people claim the same place, and `claimWaitlistOffer` competes
for quota exactly like a normal entry — so it goes through the same claim path, not a shortcut.

Read `core.waitlist_entry`'s constraints first and let them enforce what they already enforce.

---

## Tests

Unit tests are not enough here. The ones that matter:

- **Two concurrent claims on a pool with one place left**: one succeeds, one gets
  `QUOTA_FULL`. Run them as real concurrent transactions, not sequentially.
- **Claim order**: an entry consuming pools A and B locks them in id order regardless of the
  order they were discovered in.
- **Every illegal REG-11 transition is refused**, by the database, not by a TypeScript check.
- **`payOrder` retried with the same key charges once** — assert the stub PSP was called once.
- **A participant cannot transition another participant's entry**, asserted over HTTP.
- Green: `npm run test:backend` from `/Users/gauravgambhir/Desktop/Code_Life/wms` (currently
  136; plain `npm run test` in `wms_backend` runs on Node 20 and dies with
  `ERR_IPC_CHANNEL_CLOSED`).

## Definition of done

Drive one entry end to end with `curl` and a real token: create → claim quota → status moves →
pay → confirmed. Paste the responses. If a step cannot be completed because a decision is
missing (the PSP, for instance), say which and stop there rather than inventing behaviour.

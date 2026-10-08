> **DONE (15 Sep 2026) — executed by Claude, see REV-073.** Do not hand this to Cursor.

# Task: participant app — "My Entries" and starting a real registration

Repo: `wms_participant` (Expo / React Native + web). App-side only — **the backend is built and
tested; do not change `wms_backend`.** Root: `/Users/gauravgambhir/Desktop/Code_Life/wms`.

Supersedes `CURSOR_MY_ENTRIES_PROMPT.md` (its backend half is done, and its `demo:link` script is
no longer needed — see "Demo logins" below).

Suggested: Cursor **Claude Sonnet 5 (or Opus 5) — high**. It touches the one shared journey
context every registration screen reads, so it needs care more than speed.

---

## What is wrong today — reproduce it first

Sign in to the participant app (`http://localhost:8081`) as `ggmbr27+daniel@gmail.com` and open
**My Entries** → pick **Swimming · 100m Freestyle**. The screen says:

> Category change: Men's Doubles 35–39 → 40–44

on a swimming entry. That is not a category bug. `RegistrationJourneyContext.tsx` loads
**one hard-coded entry for everyone**:

```ts
// src/features/registration/registrationJourneyIds.ts
athleteDaniel: '693edf31-739e-4f28-96c4-202700000001',
entry:         '74bd5dc5-37cb-49be-8ef6-202700000001',   // Daniel's Men's Doubles entry
```

and "choosing a sport" re-points *that* entry at the new product. So:

- a new user never gets their own entry — there was no way to create one;
- the category banner compares against Daniel's tennis entry;
- "My Entries" (`portalNav.ts` → `/sport-entry`) is not a list, it is that one entry.

## What the backend now gives you

| Endpoint | Use |
|---|---|
| `GET /v1/me/entries?eventId=&cursor=&limit=` | The signed-in person's entries. Keyset (`cursor`). **No entries → `200` + empty list, never 404.** Per row: id, event id/name, sport id/name, product name, grade, category name, status, evidence status, team roster id, timestamps. |
| `POST /v1/me/entries` `{ sportEntryProductId, grade }` + `Idempotency-Key` | **New.** Creates a **draft** entry for the token's person and returns the `RegistrationEntry` (`201`). Category is pinned now for individual products; for doubles/team/crew it is derived when the partner/roster is chosen. |
| `GET /v1/registration-journeys/:entryId?eventId=` | The journey snapshot for **that** entry — works immediately for a just-created draft. |
| `PUT /v1/registration-entries/:entryId` | Unchanged: submit the draft (quota → fee → order → `pending_payment` / `pending_evidence`). |

Refusals from `POST /v1/me/entries` — each needs a screen that tells the athlete what to do:

| Status · `code` | Meaning | What the app should do |
|---|---|---|
| `409 DUPLICATE_ENTRY`, `errors.entryId` | Already has a live entry for this product | Open that entry instead (the id is in the body) |
| `422 CONSENT_REQUIRED`, `errors.consents` (comma list) | Required consents not granted | Route to Profile → consents, naming which |
| `422 PROFILE_INCOMPLETE` | Placeholder profile | Route to complete-profile |
| `422 CATEGORY_NOT_ELIGIBLE` | Age falls in no band for this product | Say so on the product card; do not create |
| `422 EVENT_UNAVAILABLE` | Event not open for registration | Disable registration with that reason |
| `400 VALIDATION_ERROR` | Grade not allowed for product | Field error on grade |

Check how `backendRequest` surfaces problem-details `errors` before relying on the field names
above; `src/features/profile/completeProfile.ts` (`formErrorCopy`) is the existing pattern for
turning a refusal key into copy.

## What to build — in this order

1. **Repository.** Add `listMyEntries()` and `createEntry({ sportEntryProductId, grade, idempotencyKey })`
   to the registration journey repository interface and `src/data/api/apiRegistrationJourneyRepository.ts`.
   Mock repository gets equivalents so demo mode keeps working. Stop sending `athleteId` on journey
   requests — the backend ignores it and it makes the contract look like it matters.

2. **Journey context keyed by entry id.** `RegistrationJourneyContext` must load the journey for an
   entry id it is **given** (route param or selected entry), not `REGISTRATION_JOURNEY_IDS.entry`.
   Query key includes the entry id. No entry id → no journey fetch.

3. **My Entries = a list.** Point the `entries` nav item at a list screen backed by
   `GET /v1/me/entries`: product, sport, category, status badge, next step. Tapping a row opens
   that entry's journey (`/sport-entry?entryId=…` or a nested route — your call, say which).
   Empty state: "You have not registered for anything yet" + **Register for a sport**.

4. **Register for a sport.** Product picker (sports/products for the event) + grade →
   `POST /v1/me/entries` → navigate to the new entry's journey. Handle every refusal in the table.
   Generate the idempotency key **once per tap** with `newIdempotencyKey()` from
   `src/features/profile/completeProfile.ts`; reuse it only to retry that same tap after a network
   error. (A deterministic key built from ids caused a real bug this week: the second action
   replayed the first response and the screen showed success while nothing changed.)

5. **Sport entry screen for an existing entry.** The product is the entry's product. Do **not** offer
   switching product on a non-draft entry — the backend refuses reconfiguring a confirmed entry.
   Show the "Category change" banner **only** when this entry's own stored category differs from the
   fresh derivation for the same product.

6. **Remove the hard-coded identity.** Delete `athleteDaniel` and `entry` from
   `registrationJourneyIds.ts`, and every read of them — `checkout.tsx`, `waitlist.tsx`,
   `team-roster.tsx`, `eligibility-evidence.tsx`, `registration-status.tsx`, `partner-finder.tsx`,
   `usePaymentReceipt.ts` all consume the journey today. Keep only genuine catalogue ids (event,
   product) if still needed, and list which you kept and why.

## Cautions

- **Never relax scoping to make demo data appear.** Everything is token-scoped on purpose; a
  participant must not read another participant's entry.
- The **date of birth locks** once any entry exists (`DOB_CHANGE_NEEDS_REVIEW`). That is correct;
  do not work around it. Testing categories by DOB now has an admin tool (Rules → Category checker).
- Keep demo mode working (`isDemoSession`) — mock repositories, not special cases in screens.
- Web and native both. No `window`-only APIs in shared code.
- **Do not commit or push.**

## Demo logins — already solved, do not rebuild

Real Cognito logins are linked to seeded athletes through `wms_backend/.env`
(`SEED_LOGIN_LINKS=daniel:<sub>` / `SEED_OC_ADMINS=<sub>:<email>`), applied on every
`npm run seed` / `npm run seed:reset` (`wms_backend/seeds/seed-logins.ts`). Do not add a
`demo:link` script.

## Tests

- My Entries: empty list renders the empty state (not an error); two entries render two rows;
  tapping one loads the journey **for that id**.
- Register: success navigates to the new entry; `DUPLICATE_ENTRY` opens the existing id;
  `CONSENT_REQUIRED` routes to consents; `CATEGORY_NOT_ELIGIBLE` shows the reason and creates nothing.
- Two taps on Register send two **different** idempotency keys.
- The journey context never requests `74bd5dc5-37cb-49be-8ef6-202700000001` unless that id was
  selected: `grep -rn "202700000001" wms_participant/src wms_participant/app` finds no identity ids.

## Gates

From `wms_participant`: `npx tsc --noEmit` (no **new** errors — 3 pre-existing in `messages.tsx` /
`useProfileConsent.test.tsx`; fixing them is welcome) and `npx jest` all green.

## Definition of done — hand-test and paste

1. Sign in as a Cognito user **with no entries** (create `ggmbr27+fresh@gmail.com`, complete the
   profile, grant the three required consents): My Entries shows the empty state.
2. Register for **Swimming · 100m Freestyle**: a draft appears, the journey is that entry, and there
   is **no** "Men's Doubles" text anywhere.
3. Register for the same product again: the app opens the existing entry.
4. Sign in as `ggmbr27+daniel@gmail.com`: My Entries lists Daniel's three seeded entries.
5. Test counts and `tsc` output. Add an entry to
   `wms_participant/context_docs/docs/REVISIONS.md`.

# Task: P03 claim pre-registration onto the real database

Repos: `wms_backend` (new endpoints) and `wms_participant` (swap the mock repository).

This is the same shape as the consent task that just landed, so follow that pattern:
`ApiConsentRepository` + `MockConsentRepository` as fallback, endpoints on the identity-scoped
controller, idempotency-key guarded mutation.

**Safe to run in parallel with `CURSOR_REGISTRATION_READ_ENDPOINTS_PROMPT.md`** — different
tables, different module, different screen.

---

## Where this stands

`app/(auth)/claim.tsx` is built (masked preview, claim, EN+IT) and `core.pre_registration`
exists in Postgres with its constraints already tested
(`test/rule-immutability.spec.ts`, "REG-13 — pre-registration"). They have never been
connected: `repositories.ts` still wires `preRegistration: new MockPreRegistrationRepository()`
whose data is a three-row JSON fixture.

This matters because **REG-13 is how ~15,000 existing expression-of-interest records reach the
new system.** A claim flow that runs on a fixture proves nothing about the migration it exists
to serve.

## The constraints are already in the database — serve them, do not re-implement them

Read the migration and the existing spec before writing any SQL. Two guarantees are enforced
by Postgres and your code must let them speak rather than checking first and reporting its own
message:

1. **One person may claim only one EOI record.** A second claim raises `23505`.
2. **`status = 'claimed'` and `claimed_by` must agree.** Setting one without the other raises
   `23514`.

Map these through the existing problem-details filter. If a race means two claims arrive at
once, the loser must get a clean refusal from the constraint — not a "already claimed" check
that passed a millisecond earlier.

## Backend

Two endpoints. Both belong on the identity-scoped controller (`MeController` or a sibling
with the same `@CurrentIdentity()` treatment) — **`claimed_by` comes from the token, never
from the body.**

- **Lookup** by reference *or* email. Returns the **privacy-masked** preview: the mock
  produces `D••• H•••` and a coarse birth year, and
  `mockPreRegistrationRepository.test.ts` asserts the full name never appears in the preview.
  **Port that test to the backend.** The masking must happen server-side — masking in the UI
  while the API returns the full record is not masking, and a lookup endpoint that returns
  full names on an email guess is a harvesting tool.
- **Claim.** Idempotency-key guarded, `local` mode. On success return the full record; the
  person has now proved they hold that reference.

Three outcomes must stay distinguishable, as they are in the mock: **found**,
**already-claimed**, **not-found**. Collapsing them would be wrong here — unlike the entry
lookup, the participant legitimately needs to know which of the three happened.

## Participant app

Add `ApiPreRegistrationRepository`, wire it in `repositories.ts`, keep
`MockPreRegistrationRepository` as the offline fallback (match the consent/accreditation
pattern exactly). The screen should need no change; if it does, report where the shapes
disagreed rather than bending the screen to fit.

## Tests

- Backend: masked preview never contains the full name or exact date of birth; a second claim
  by the same person is refused by the constraint; claim is idempotent under a repeated key;
  one person cannot claim using another's identity (assert in SQL).
- Participant: all three outcomes render, and the preview shown is the masked one.
- Green in both: `npm run test:backend` from `/Users/gauravgambhir/Desktop/Code_Life/wms`
  (plain `npm run test` in `wms_backend` hits Node 20 and dies with `ERR_IPC_CHANNEL_CLOSED`),
  and `npm test` in `wms_participant` (currently 80).

## Definition of done

Hand-test on `http://localhost:8081` signed in as a real Cognito user: look up a seeded
reference, see the masked preview, claim it, **restart the backend**, and confirm it still
reads as claimed by you. The restart is the point.

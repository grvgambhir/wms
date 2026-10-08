# Task: P06 profile & consent onto the real database

Repos: `wms_backend` (new endpoints) and `wms_participant` (swap the mock repository).

---

## Where this stands

The P06 screen is **already built** (`app/(participant)/profile.tsx`, EN+IT, granular
consents, action-needed states) and `core.consent` **already exists** in Postgres. The two
have never been connected: `src/data/providers/repositories.ts` still wires
`consent: new MockConsentRepository()`, whose storage is a JSON fixture. Every consent a
participant grants today is lost on reload.

That matters more than an ordinary mock: **consent is the lawful basis for processing**
(RFP PRV-02, PLT-07). A consent record that does not survive a restart is not a consent
record. This is the last piece of the participant profile that is still make-believe.

## Backend

Read `core.consent`'s columns before designing anything — the table is already shaped, and
this task is to serve it, not to redesign it. Add to `MeController` (so identity comes from
the token, never the body — the same rule as `PATCH /v1/me/profile`):

- `GET /v1/me/consents` — every consent type with its current state, timestamp and the policy
  version it was granted against.
- `POST /v1/me/consents` — grant or withdraw one consent. Idempotency-key guarded, `local`
  mode (no external call here).

Three things the mock gets right and the real one must not lose:

1. **Withdrawal is a new record, not an edit.** "Granted on the 3rd, withdrawn on the 9th"
   must remain answerable afterwards. If the table is written to be append-only, keep it that
   way; if it is not, say so in your report rather than quietly overwriting history.
2. **The policy version is part of the consent.** Consent to v1 of a privacy notice is not
   consent to v2. Store the version that was actually shown.
3. **Required vs optional is not the participant's choice.** T&C and privacy are required;
   eligibility-medical is an explicit opt-in (PRV-04 sensitive data); photo/media and
   marketing are optional. Whatever the mock encodes, keep it.

## Participant app

Add `ApiConsentRepository` beside the existing `Api*` repositories, wire it in
`repositories.ts`, and **leave `MockConsentRepository` in place** — the other `Api*`
repositories keep their mock sibling as the offline fallback and this one should match that
pattern rather than invent a new one.

The screen itself should need little or no change. If it does, that is worth reporting: it
means the mock and the real shape disagree, and I want to know where.

## Tests

- Backend: grant → withdraw → grant leaves a readable history; a repeated `Idempotency-Key`
  does not double-write; one participant cannot read or write another's consents (assert this
  in SQL, not in the service layer — it is an identity-scoping rule).
- Participant: the profile screen renders state from the API repository, and a withdrawn
  required consent still shows as action-needed.
- `npm run test` green in both repos (backend 112, participant 68).

## Definition of done

Hand-test on `http://localhost:8081/profile` with a real signed-in Cognito user: change a
consent, **restart the backend**, reload — the change is still there. That restart is the
whole point of the task; do not report done without it.

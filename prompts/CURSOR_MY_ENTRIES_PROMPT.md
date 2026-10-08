> **SUPERSEDED (15 Sep 2026)** by `CURSOR_PARTICIPANT_MY_ENTRIES_AND_NEW_REGISTRATION_PROMPT.md`.
> Do not run this one — its backend half is done and its `demo:link` script is replaced by `SEED_LOGIN_LINKS`.

# Task: the participant journey must find its own entry

Repos: `wms_backend` and `wms_participant`.

---

## The bug the cutover exposed

`GET /v1/registration-journeys/74bd5dc5-…` returns **404 REGISTRATION_ENTRY_NOT_FOUND** for a
signed-in participant, and the 404 is correct.

`wms_participant/src/features/registration/registrationJourneyIds.ts` hardcodes:

```ts
athleteDaniel: '693edf31-739e-4f28-96c4-202700000001',
entry:         '74bd5dc5-37cb-49be-8ef6-202700000001',
```

That entry belongs to the seeded `athlete@example.com`. **The app has always asked for one
specific demo athlete's entry, whoever was signed in.** `wms_api` had no authentication and
served it; `wms_backend` scopes to the token and refuses.

So this is not a regression. It is the cutover surfacing a gap that was always there: **the
participant app has no way to discover the signed-in user's own entries**, because the backend
has no endpoint that answers "what are mine?". Every read needs an entry id the app cannot
legitimately obtain.

Do not fix this by relaxing the scoping. The `WHERE ap.person_id = $token` clause is the thing
stopping one athlete reading another's registration, and `registration-repository.spec.ts`
proves it. The endpoint is right; the caller is wrong.

## Backend — already built, do not rebuild it

`GET /v1/me/entries` now exists, alongside `GET /v1/me/invoices`, `/v1/me/invoices/:id` and
`/v1/me/payments` (PLT-07's remaining thirds). See `src/people/self-service.service.ts` and
`test/self-service.spec.ts` — 289 backend tests, all gates green.

What it gives you per entry: id, event id and name, sport id and name, product name, grade,
category name, status, evidence status, team roster id, timestamps. Enough to render a list
and route, without a journey fetch per row. Keyset-paginated, optional `?eventId=`.

**An athlete with no entries gets `200` and an empty list, not a 404.** Every athlete is in
that state before they register, and every real user is in it today.

Your work is the app side.

## Participant app

- Delete `registrationJourneyIds.ts`'s hardcoded athlete and entry. Keep any ids that are
  genuinely catalogue references, and say which you kept and why.
- The journey resolves from `GET /v1/me/entries`. No entries → the screen invites them to
  register, rather than showing an error.
- Stop sending `athleteId` on journey requests. The backend ignores it, but sending an
  identity the server does not trust makes the contract look like it matters.

## The demo data problem, and the exact fix

This is the part that decides whether the testing guide can still be run, so do it properly.

All the seeded demo state hangs off three people:

| Seeded person | Entries | Scenarios that need them |
|---|---|---|
| Daniel Harper — `athlete@example.com` | 3 | A1, A2, A5, A7 |
| Elena Rossi — `elena.rossi.para@demo.invalid` | 1 | A6 (para) |
| Luca Bianchi — `luca.bianchi@example.com` | 1 | A5 (doubles partner) |

None of them has a Cognito login, so once the journey is token-scoped **nobody can sign in and
see that data** — which is the 404 above.

**Build `npm run demo:link -- <seeded-email> <real-email>`.**

It calls `AdminCreateUser` for the real address (which returns the new user's `sub` — and is
already in our IAM policy, unlike `AdminGetUser`), then sets `idp_subject` on the **existing
seeded person row**. Cognito emails the temporary password; signing in with it gives you a
session that *is* Daniel Harper, with his three entries.

Use `+` addressing so one inbox covers all three:
`you+daniel@gmail.com`, `you+elena@gmail.com`, `you+luca@gmail.com`.

Two rules for the script:
- Refuse if the seeded person already has an `idp_subject` — silently repointing a person at a
  different login is how two humans end up sharing one record.
- It is a **development** tool. Refuse to run when `NODE_ENV=production`, the way `seedDemo`
  already does.

**Not acceptable:** a code path that skips scoping "for demo". That is the shim's defect
rebuilt inside the product, and it would be live at the Games.

## Tests

- `/v1/me/entries` returns only the caller's entries; a second athlete's are absent. Assert in
  SQL as well as over HTTP — the SQL is where the guarantee lives.
- A person with no entries gets `200` and `[]`.
- An unauthenticated request gets `401`.
- Participant: with no entries the screen shows the empty state, not an error; with one, the
  journey loads from the returned id.
- `grep -r '202700000001' wms_participant/src` finds no hardcoded identity left.

## Definition of done

Sign in as a real Cognito user with no entries — the participant app must load cleanly with an
empty state. Then create an entry and confirm the journey resolves to it. Paste both.

Run all four from `/Users/gauravgambhir/Desktop/Code_Life/wms`:
`npm run test:backend` · `npm run typecheck:backend` · `npm run build:backend` · `npm run lint:backend`

# Task: put the registration journey on the real backend (read path)

Repo: `wms_backend`. No app changes in this task — the cutover is a later one.

---

## Start here, because this is the surprising part

`src/registration/postgres-registration-journey.repository.ts` is **finished and tested**
(`test/registration-repository.spec.ts`) — and it is **dead code**. `src/app.module.ts` line 11
reads `imports: [AuthModule, PeopleModule]`. There is no `RegistrationModule`, no controller,
and no route. Nothing in the running service can reach it.

So the registration journey — the product's actual core — still runs entirely on `wms_api`,
the temporary Express shim whose storage is a JSON file. Every entry, every status change,
every payment lives in `wms_api/data/db.json`.

This task ends that for the **read** path.

## What to build

A `RegistrationModule`, imported by `AppModule`, exposing the routes the existing repository
already answers. Match the shim's paths so the app's cutover is a base-URL change and not a
rewrite — `wms_api/src/http/routes.ts` is the reference:

| Method | Path | Backed by |
|---|---|---|
| `GET` | `/v1/registration-journeys/:entryId` | `getJourney` |
| `GET` | `/v1/registration-entries/:entryId` | `getEntry` |
| `GET` | `/v1/registration-entries/:entryId/exports/participant-safe` | export (see below) |

Mutations — `saveEntry`, waitlist actions, `payOrder`, `transitionEntryStatus` — are **not**
in this task. They have to route through the quota-pool claim and the REG-11 guarded writer,
and folding them in here would make one unreviewable change out of two reviewable ones.
Leave them on the shim for now.

## The one thing that must not be got wrong

**`athleteId` comes from the access token. Never from a query parameter.**

`getJourney` takes `{ eventId, athleteId, registrationEntryId }` and enforces ownership inside
the SQL — that is deliberate, and `registration-repository.spec.ts` proves Bob cannot read
Alice's entry. But the guarantee only holds if the controller passes the **caller's** person
id. Take it from `@CurrentIdentity()`, exactly as `MeController` does. A controller that
accepts `?athleteId=` hands the attacker the parameter the whole design was built to remove.

`getEntry` has no ownership check at all — it is used by the admin governance panel. So it
must sit behind `@Roles(...)` for OC roles, **or** be scoped to the caller. Pick one, say
which you picked and why. Do not expose it unscoped to a participant token.

## The participant-safe export

PRV-04: restricted medical, para-classification and ID evidence live in the `restricted`
schema behind a separate role, and the export must not carry them. Read how the shim builds
this response and keep the same shape. **Add a test that asserts a restricted field is
absent** — not that the endpoint returns 200. An export that leaks is the failure mode here,
and only a negative assertion catches it.

## Errors

`RepositoryError` with `REGISTRATION_ENTRY_NOT_FOUND` must surface as a 404 problem+json
through the existing filter, with the same body for "does not exist" and "belongs to someone
else" — the repository already collapses those two deliberately; do not un-collapse them in
the controller by adding a friendlier message for one case.

## Tests

- The journey endpoint returns the caller's own entry, and **404s for someone else's** — over
  HTTP, not by calling the repository directly. The repository test already covers the SQL;
  this one covers the controller wiring, which is where the id can go missing.
- Passing `?athleteId=<someone else>` changes nothing (it must be ignored, not honoured).
- The participant-safe export omits restricted fields.
- `npm run test:backend` from `/Users/gauravgambhir/Desktop/Code_Life/wms` — currently 123,
  none may break. (Run it that way: plain `npm run test` picks up Node 20 and the suite dies
  with `ERR_IPC_CHANNEL_CLOSED` before a single test runs.)

## Definition of done

`curl` each route against the running backend with a real token
(`npm run token -- <email> <password>`) and paste what came back.
